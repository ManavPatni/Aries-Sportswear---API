const db = require('../../db/database');
const razorpay = require('../../utils/razorpay');
const crypto = require('crypto');
const varientImageModel = require('../../models/product/variantImageModel');
const NotificationController = require('../NotificationController');
const notificationController = new NotificationController(db);
const { sendOrderConfirmationEmail } = require('../../utils/emailService');
const orderItemsModel = require('../../models/order/orderItemsModel');
const orderStatusModel = require('../../models/order/orderStatusModel');
const { validateCouponForOrder } = require('../couponController');

const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL;

const ORDER_FLOW = [
  'Ordered',
  'Shipping',
  'Out for delivery',
  'Returned',
  'Replace',
  'Refunded',
];

const EARLY_CANCEL_ALLOWED_FROM = ['Ordered', 'Shipping'];

const createOrder = async (req, res) => {
  const userId = req.user.id;
  const shipping_fee = 0;    // In rupees
  const tax_amount = 0;      // In rupees

  const { items, shipping_id, coupon_code = null } = req.body;

  /* ---------- 1. Basic Validation ---------- */
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  for (const { variantId, quantity } of items) {
    if (!Number.isInteger(variantId) || variantId <= 0 ||
        !Number.isInteger(quantity)  || quantity   <= 0) {
      return res.status(400).json({ error: 'Each item needs positive variantId & quantity' });
    }
  }
  if (!Number.isInteger(shipping_id) || shipping_id <= 0) {
    return res.status(400).json({ error: 'Valid shipping_id is required' });
  }

  /* ---------- 2. Database Transaction Setup ---------- */
  const conn = await db.getConnection();
  await conn.beginTransaction();

  let rzOrderId;
  try {
    const snapshots = [];
    let itemsTotalPaise = 0;

    /* Fetch shipping address */
    const [[shipping]] = await conn.query(
      `SELECT label, recipient_name AS name, phone, line1, line2,
              landmark, city, state, country, postal_code, digipin
       FROM user_shipping_address
       WHERE id = ? AND user_id = ?`,
      [shipping_id, userId]
    );

    if (!shipping) {
      await conn.rollback();
      return res.status(404).json({ error: 'Shipping address not found' });
    }

    /* ---------- 3. Check Stock & Calculate Total ---------- */
    for (const { variantId, quantity } of items) {
      const [[v]] = await conn.query(
        `SELECT v.id AS variant_id,
                v.product_id,
                v.name AS variant_name,
                v.size,
                v.color,
                v.price,
                v.stock,
                p.name AS product_name
         FROM variant v
         JOIN product p ON p.id = v.product_id
         WHERE v.id = ? FOR UPDATE`,
        [variantId]
      );

      if (!v) throw new Error(`Variant ${variantId} not found`);
      if (v.stock < quantity) throw new Error(`Insufficient stock for variant ${variantId}`);

      // Convert price to paise and calculate item total
      const itemTotalPaise = Math.round(v.price * 100) * quantity;
      itemsTotalPaise += itemTotalPaise;

      const image = await varientImageModel.getVariantImage(variantId, false);
      snapshots.push({
        ...v,
        quantity,
        img_path: image?.path || null
      });
    }

    /* ---------- 4. Coupon Validation and Discount Calculation ---------- */
    let coupon = null;
    let discountAmountPaise = 0;

    if (coupon_code) {
      coupon = await validateCouponForOrder(coupon_code, userId, items);
      if (coupon.discount_type === 'percentage') {
        discountAmountPaise = Math.round((itemsTotalPaise * coupon.discount_value) / 100);
      } else if (coupon.discount_type === 'fixed') {
        discountAmountPaise = Math.round(coupon.discount_value * 100); // discount_value in rupees
      }
      discountAmountPaise = Math.min(discountAmountPaise, itemsTotalPaise); // Cap at item total
    }

    /* ---------- 5. Apply Pricing in Paise ---------- */
    const shippingFeePaise = Math.round(shipping_fee * 100);
    const taxAmountPaise = Math.round(tax_amount * 100);
    const grandTotalPaise = itemsTotalPaise + shippingFeePaise + taxAmountPaise - discountAmountPaise;

    if (grandTotalPaise <= 0) throw new Error('Calculated order total is invalid');

    /* ---------- 6. Create Razorpay Order ---------- */
    const rzOrder = await razorpay.orders.create({
      amount: grandTotalPaise,
      currency: 'INR',
      notes: { userId }
    });
    rzOrderId = rzOrder.id;

    /* ---------- 7. Insert into Orders Table ---------- */
    const discount_amount = discountAmountPaise / 100; // Convert to rupees for storage
    const [orderRes] = await conn.query(
      `INSERT INTO orders
       (user_id, payment_id, payment_status,
        shipping_fee, tax_amount, discount_amount,
        coupon_code, discount_type,
        shipping_name, shipping_phone, address_line1, address_line2,
        landmark, city, state, country, postal_code, digipin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        rzOrderId,
        'Pending',
        shipping_fee,
        tax_amount,
        discount_amount,
        coupon ? coupon.code : null,
        coupon ? coupon.discount_type : null,
        shipping.name,
        shipping.phone,
        shipping.line1,
        shipping.line2 || null,
        shipping.landmark || null,
        shipping.city,
        shipping.state,
        shipping.country,
        shipping.postal_code,
        shipping.digipin || null
      ]
    );
    const orderId = orderRes.insertId;

    /* ---------- 8. Insert Order Items & Update Data ---------- */
    let updatedVariantIds = [];
    let lowStockItems = [];

    const itemSQL = `INSERT INTO order_items
                     (order_id, product_id, variant_id, product_name,
                      variant_name, size, color, img_path,
                      quantity, unit_price)
                     VALUES (?,?,?,?,?,?,?,?,?,?)`;

    for (const snap of snapshots) {
      await conn.query(itemSQL, [
        orderId,
        snap.product_id,
        snap.variant_id,
        snap.product_name,
        snap.variant_name,
        snap.size,
        snap.color,
        snap.img_path || null,
        snap.quantity,
        snap.price
      ]);

      await conn.query(
        'UPDATE variant SET stock = stock - ? WHERE id = ?',
        [snap.quantity, snap.variant_id]
      );

      updatedVariantIds.push(snap.variant_id);
    }

    if (updatedVariantIds.length > 0) {
      const [stocks] = await conn.query(
        `SELECT id, stock FROM variant WHERE id IN (${updatedVariantIds.map(() => '?').join(',')})`,
        updatedVariantIds
      );
      lowStockItems = stocks.filter(v => v.stock <= 0).map(v => v.id);
    }

    if (coupon !== null) {
      await conn.query(
          'UPDATE coupons SET used_count = used_count + 1 WHERE coupon_id = ?',
          [coupon.id]
      );
    }

    /* ---------- 9. Update Coupon Usage ---------- */
    if (coupon) {
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE coupon_id = ?', [coupon.coupon_id]);
    }

    /* ---------- 10. Commit Transaction & Notify for Low Stock ---------- */
    await conn.commit();
    conn.release();

    if (lowStockItems.length > 0) {
      await notificationController.createNotification(
        type = 'stock',
        title = 'Out of stock',
        description = `Variant ids: ${lowStockItems.join(', ')} are out of stock.`,
        priority = 'high',
        deeplink = `https://admin.ariessportswear.com/products/product-list`,
        target = { type: 'all' }
      );
    }

    return res.status(201).json({
      success: true,
      orderId,
      paymentId: rzOrderId,
      amount: grandTotalPaise / 100,
      currency: 'INR',
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    await conn.rollback();
    conn.release();
    try {
      if (rzOrderId) await razorpay.orders.cancel(rzOrderId);
    } catch (_) {}
    console.error('createOrder error:', err);
    return res.status(400).json({ error: err.message });
  }
}

const verifyPayment = async (req, res) => {
  const userId = req.user.id;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  /* ---------- 1. Input Validation ---------- */
  if (!razorpay_order_id) {
    return res.status(400).json({ success: false, message: 'razorpay_order_id is required' });
  }
  if (!razorpay_payment_id) {
    return res.status(400).json({ success: false, message: 'razorpay_payment_id is required' });
  }
  if (!razorpay_signature) {
    return res.status(400).json({ success: false, message: 'razorpay_signature is required' });
  }

  /* ---------- 2. Verify Signature ---------- */
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const generated_signature = hmac.digest('hex');

  if (generated_signature !== razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Payment verification failed' });
  }

  /* ---------- 3. Database Transaction ---------- */
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    /* Update payment status */
    const [updateResult] = await conn.query(
      `UPDATE orders 
       SET payment_status = 'Paid'
       WHERE payment_id = ? AND user_id = ?`,
      [razorpay_order_id, userId]
    );

    if (updateResult.affectedRows === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    /* Fetch order and item details for notifications and email */
    const [orderRows] = await conn.query(
      `SELECT o.id AS order_id, u.email
       FROM orders o
       JOIN user u ON u.id = o.user_id
       WHERE o.payment_id = ? AND o.user_id = ?`,
      [razorpay_order_id, userId]
    );

    if (!orderRows.length) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ success: false, message: 'Order or user not found' });
    }

    const order = orderRows[0];

    /* Add order status */
    await orderStatusModel.addStatus({
      order_id: order.order_id,
      status: 'Ordered',
      note: `Order placed at ${new Date().toISOString()}`
    }, conn); 

    /* Fetch order items */
    const items = await orderItemsModel.getOrderItems(order.order_id, conn);

    /* ---------- 4. Create Notifications ---------- */
    // All staff notification
    await notificationController.createNotification(
      type = 'order',
      title = 'New Order Received',
      description = `A new order #${order.order_id} has been placed.`,
      priority = 'medium',
      deeplink =`https://admin.ariessportswear.com/orders/order-detail?orderid=${order.order_id}`,
      target = {
        type: 'all'
      }
    );

    /* ---------- 5. Send User Email Notification ---------- */
    const emailSent = await sendOrderConfirmationEmail(order.email, {
      orderId: order.order_id,
      items: items.map(item => ({
        product_name: item.product_name,
        variant_name: item.variant_name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unit_price: item.unit_price,
        img_path: item.img_path ? `${IMAGE_BASE_URL}${item.img_path}` : null
      })),
      total: order.grand_total / 100
    });

    if (!emailSent) {
      console.warn(`Failed to send email for order #${order.order_id} to ${order.email}`);
    }

    /* ---------- 6. Commit Transaction ---------- */
    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order.order_id
    });

  } catch (err) {
    /* ---------- 7. Rollback on Error ---------- */
    await conn.rollback();
    conn.release();
    console.error('verifyPayment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const orderDetails = async (req, res) => {
  const userId = req.user?.id;
  const staffId = req.staff?.id;
  const orderId = parseInt(req.query.orderId, 10);

  /* ---------- 1. Input Validation ---------- */
  if (!userId && !staffId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!orderId || isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'Valid orderId is required' });
  }

  const requestedByStaff = !!staffId;

  /* ---------- 2. Database Query ---------- */
  try {
    /* Fetch order details with shipping information */
    const [orderRows] = await db.query(
      requestedByStaff
        ? `SELECT id, user_id, payment_id, payment_status, shipping_id,
                  shipping_fee, tax_amount, discount_amount,
                  shipping_name, shipping_phone, address_line1, address_line2,
                  landmark, city, state, country, postal_code, digipin
           FROM orders 
           WHERE id = ?`
        : `SELECT id, user_id, payment_id, payment_status, shipping_id, 
                  shipping_fee, tax_amount, discount_amount,
                  shipping_name, shipping_phone, address_line1, address_line2,
                  landmark, city, state, country, postal_code, digipin
           FROM orders 
           WHERE id = ? AND user_id = ?`,
      requestedByStaff ? [orderId] : [orderId, userId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    const order = orderRows[0];

    /* Fetch order items */
    const items = await orderItemsModel.getOrderItems(orderId);

    /* Fetch order status history */
    const statuses = await orderStatusModel.getOrderStatus(orderId);

    /* ---------- 3. Structure Response ---------- */
    const response = {
      success: true,
      order: {
        order_id: order.id,
        user_id: order.user_id,
        payment_id: order.payment_id,
        payment_status: order.payment_status,
        shipping_id: order.shipping_id,
        order_status: order.order_status,
        shipping_fee: order.shipping_fee,
        tax_amount: order.tax_amount,
        discount_amount: order.discount_amount,
        coupon_id: order.coupon_id || null,
        shipping_address: {
          name: order.shipping_name,
          phone: order.shipping_phone,
          line1: order.address_line1,
          line2: order.address_line2 || null,
          landmark: order.landmark || null,
          city: order.city,
          state: order.state,
          country: order.country,
          postal_code: order.postal_code,
          digipin: order.digipin || null
        },
        items: items.map(item => ({
          product_name: item.product_name,
          variant_name: item.variant_name,
          size: item.size || null,
          color: item.color || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          img_path: item.img_path ? `${IMAGE_BASE_URL}${item.img_path}` : null
        })),
        statuses: statuses.map(status => ({
          status: status.status,
          note: status.note || null,
          created_at: status.created_at,
          created_by: status.created_by || null
        }))
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    /* ---------- 5. on Error ---------- */
    console.error('orderDetails error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAllOrders = async (req, res) => {
  const staffId = req.staff?.id;
  const { status, offset = 0, limit = 10 } = req.query;

  if (!staffId) return res.status(404).json({ message: 'Unauthorized'});

  try {
    const params = [];
    let statusFilterClause = '';

    if (status) {
      statusFilterClause = 'WHERE os.status = ?';
      params.push(status);
    }

    const [rows] = await db.execute(
      `
      SELECT 
        o.id AS order_id,
        o.user_id,
        o.payment_id,
        o.payment_status,
        o.shipping_fee,
        o.tax_amount,
        o.discount_amount,
        o.shipping_id,
        o.shipping_name,
        o.shipping_phone,
        o.address_line1,
        o.address_line2,
        o.landmark,
        o.city,
        o.state,
        o.country,
        o.postal_code,
        o.digipin,
        o.created_at,
        o.updated_at,
        os.status AS current_status,
        oi.unit_price,
        oi.quantity,
        (oi.unit_price * oi.quantity) AS item_total
      FROM orders o
      LEFT JOIN (
        SELECT s1.order_id, s1.status
        FROM order_status s1
        INNER JOIN (
          SELECT order_id, MAX(created_at) AS latest_time
          FROM order_status
          GROUP BY order_id
        ) s2 ON s1.order_id = s2.order_id AND s1.created_at = s2.latest_time
      ) os ON os.order_id = o.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${statusFilterClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    // Group results by order_id
    const ordersMap = new Map();

    for (const row of rows) {
      const orderId = row.order_id;
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          id: orderId,
          user_id: row.user_id,
          payment_id: row.payment_id,
          payment_status: row.payment_status,
          shipping_id: row.shipping_id,
          shipping_fee: Number(row.shipping_fee || 0),
          tax_amount: Number(row.tax_amount || 0),
          discount_amount: Number(row.discount_amount || 0),
          current_status: row.current_status,
          address: {
            name: row.shipping_name,
            phone: row.shipping_phone,
            line1: row.address_line1,
            line2: row.address_line2,
            landmark: row.landmark,
            city: row.city,
            state: row.state,
            country: row.country,
            postal_code: row.postal_code,
            digipin: row.digipin
          },
          items: [],
          total_amount: 0,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }

      if (row.unit_price && row.quantity) {
        const itemTotal = Number(row.unit_price) * Number(row.quantity);
        ordersMap.get(orderId).items.push({
          unit_price: Number(row.unit_price),
          quantity: Number(row.quantity),
          item_total: Number(itemTotal.toFixed(2))
        });

        ordersMap.get(orderId).total_amount += itemTotal;
      }
    }

    // Finalize total_amount with shipping, tax, discount
    for (const order of ordersMap.values()) {
      order.total_amount = Number(
        (
          order.total_amount +
          order.shipping_fee +
          order.tax_amount -
          order.discount_amount
        ).toFixed(2)
      );
    }

    return res.status(200).json({
      success: true,
      count: ordersMap.size,
      orders: Array.from(ordersMap.values())
    });
  } catch (err) {
    console.error('getAllOrders error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updateOrderStatus = async (req, res) => {
  const staffId = req.staff.id;
  const {
    orderId,
    status,
    note = null,
    shippingId = null,
  } = req.body;

  // Basic validation
  if (!orderId || !status) {
    return res.status(400).json({ message: 'orderId and status are required' });
  }

  const knownStatus = ORDER_FLOW.includes(status) || status === 'Canceled';
  if (!knownStatus) {
    return res.status(400).json({ message: `Unknown status '${status}'` });
  }

  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Lock the order row to prevent race condition
    const [[order]] = await conn.execute(
      'SELECT id, shipping_id FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }

    // Fetch last status
    const [[lastRow]] = await conn.execute(
      'SELECT id, status FROM order_status WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
      [orderId],
    );
    const lastStatus = lastRow ? lastRow.status : null;

    // Case: Shipping note update only
    if (lastStatus === 'Shipping' && status === 'Shipping') {
      if (!note) {
        await conn.rollback();
        return res.status(400).json({ message: 'note is required when updating Shipping note' });
      }
      await conn.execute(
        'UPDATE order_status SET note = ?, created_by = ? WHERE id = ?',
        [note, staffId, lastRow.id],
      );
      await conn.commit();
      return res.status(200).json({ success: true, message: 'Shipping note updated' });
    }

    // Transition rules
    let ok = false;

    if (!lastStatus && status === 'Ordered') ok = true;

    if (!ok && status === 'Canceled' && EARLY_CANCEL_ALLOWED_FROM.includes(lastStatus)) ok = true;

    if (!ok && lastStatus && ORDER_FLOW.includes(lastStatus)) {
      const nextExpected = ORDER_FLOW[ORDER_FLOW.indexOf(lastStatus) + 1] ?? null;
      ok = status === nextExpected;
    }

    if (!ok) {
      await conn.rollback();
      return res.status(409).json({
        message: `Cannot change status from '${lastStatus ?? 'N/A'}' to '${status}'`,
      });
    }

    // Ordered ➜ Shipping requires shippingId
    if (lastStatus === 'Ordered' && status === 'Shipping' && !shippingId) {
      await conn.rollback();
      return res.status(400).json({ message: 'shippingId is required when moving to Shipping' });
    }

    // Insert new status
    await conn.execute(
      'INSERT INTO order_status (order_id, status, note, created_by) VALUES (?, ?, ?, ?)',
      [orderId, status, note, staffId],
    );

    // Update shipping_id if supplied
    if (shippingId !== null) {
      await conn.execute(
        'UPDATE orders SET shipping_id = ? WHERE id = ?',
        [shippingId, orderId],
      );
    }

    await conn.commit();
    return res.status(200).json({ success: true, message: `Order status updated to '${status}'` });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('updateOrderStatus error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
};

// Delete pending orders older than 1 day also reset stock for those orders
const deletePendingOrder = async () => {
  try {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.query(
      `SELECT id FROM orders WHERE payment_status = 'Pending' AND updated_at < NOW() - INTERVAL 1 DAY`
    );

    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'No pending orders found to delete' });
    }

    // Reset stock for deleted orders
    const orderIds = orders.map(order => order.id);
    await conn.query(
      `UPDATE variant SET stock = stock + (SELECT quantity FROM order_items WHERE order_id IN (?)) WHERE id IN (SELECT variant_id FROM order_items WHERE order_id IN (?))`,
      [orderIds, orderIds]
    );

    // Delete the orders
    await conn.query(
      `DELETE FROM orders WHERE id IN (?)`,
      [orderIds]
    );

    await conn.commit();
    return res.status(200).json({ success: true, message: 'Pending orders deleted and stock reset' });
  } catch (error) {
    console.error('deletePendingOrder error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = { 
  createOrder,
  verifyPayment,
  orderDetails,
  getAllOrders,
  updateOrderStatus,
  deletePendingOrder
};