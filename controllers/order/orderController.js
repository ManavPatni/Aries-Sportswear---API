const db = require('../../db/database');
const razorpay = require('../../utils/razorpay');
const crypto = require('crypto');
const varientImageModel = require('../../models/product/variantImageModel');
const NotificationController = require('../NotificationController');
const notificationController = new NotificationController(db);
const { sendOrderConfirmationEmail } = require('../../utils/emailService');
const orderItemsModel = require('../../models/order/orderItemsModel');
const orderStatusModel = require('../../models/order/orderStatusModel');


const createOrder = async (req, res) => {
  const userId = req.user.id;
  const shipping_fee = 0;    // In rupees
  const tax_amount = 0;      // In rupees
  const discount_amount = 0; // In rupees

  const { items, shipping_id, coupon_id = null } = req.body;

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

  let rzOrderId; // To track Razorpay order for cancellation if needed
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

    /* ---------- 4. Apply Pricing in Paise ---------- */
    const shippingFeePaise = Math.round(shipping_fee * 100);
    const taxAmountPaise = Math.round(tax_amount * 100);
    const discountAmountPaise = Math.round(discount_amount * 100);
    const grandTotalPaise = itemsTotalPaise + shippingFeePaise + taxAmountPaise - discountAmountPaise;

    if (grandTotalPaise <= 0) throw new Error('Calculated order total is invalid');

    /* ---------- 5. Create Razorpay Order ---------- */
    const rzOrder = await razorpay.orders.create({
      amount: grandTotalPaise, // Amount in paise, ensured to be an integer
      currency: 'INR',
      notes: { userId }
    });
    rzOrderId = rzOrder.id;

    /* ---------- 6. Insert into Orders Table ---------- */
    const [orderRes] = await conn.query(
      `INSERT INTO orders
       (user_id, payment_id, payment_status,
        shipping_fee, tax_amount, discount_amount,
        shipping_name, shipping_phone, address_line1, address_line2,
        landmark, city, state, country, postal_code, digipin)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        rzOrderId,
        'pending',
        shipping_fee,
        tax_amount,
        discount_amount,
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

    /* ---------- 7. Insert Order Items & Update Stock ---------- */
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
        snap.price // Stored in rupees
      ]);

      await conn.query(
        'UPDATE variant SET stock = stock - ? WHERE id = ?',
        [snap.quantity, snap.variant_id]
      );
    }

    /* ---------- 8. Commit Transaction ---------- */
    await conn.commit();
    conn.release();

    return res.status(201).json({
      success: true,
      orderId,
      paymentId: rzOrderId,
      amount: grandTotalPaise / 100, // Convert back to rupees for response
      currency: 'INR',
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });

  } catch (err) {
    /* ---------- 9. Rollback & Cleanup ---------- */
    await conn.rollback();
    conn.release();

    // Cancel Razorpay order if created
    try {
      if (rzOrderId) await razorpay.orders.cancel(rzOrderId);
    } catch (_) { /* Ignore cancellation errors */ }

    console.error('createOrder error:', err);
    return res.status(400).json({ error: err.message });
  }
};

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
       SET payment_status = 'successful'
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
      status: 'ordered',
      note: `Order placed at ${new Date().toISOString()}`
    }, conn); 

    /* Fetch order items */
    const items = await orderItemsModel.getOrderItems(order.order_id, conn);

    /* ---------- 4. Create Notifications ---------- */
    // Admin notification
    await notificationController.createNotification(
      type = 'order',
      title = 'New Order Received',
      description = `A new order #${order.order_id} has been placed.`,
      priority = 'high',
      deeplink =`https://admin.ariessportswear.com/orders/${order.order_id}`,
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
        img_path: item.img_path
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

const orderStatus = async (req, res) => {
  const userId = req.user.id;
  const { orderId } = req.body;

  // Validate orderId
  if (!orderId || isNaN(orderId)) {
    return res.status(400).json({ success: false, message: 'orderId is required and must be a number' });
  }

  try {
    // Check if order exists for the user
    const [orders] = await db.query(
      'SELECT id FROM orders WHERE user_id = ? AND id = ?',
      [userId, orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    // Fetch order status
    const statusResult = await orderStatusModel.getOrderStatus(orderId, userId);

    // Handle case where statusResult is not an array
    let statusRows = Array.isArray(statusResult) ? statusResult : [statusResult];

    if (statusRows.length === 0) {
      return res.status(404).json({ success: false, message: 'No status found for this order' });
    }

    // Map statusRows to include only status, note, and created_at
    const statuses = statusRows.map(({ status, note, created_at }) => ({
      status,
      note,
      created_at,
    }));

    return res.status(200).json({
      success: true,
      statuses,
    });
  } catch (error) {
    console.error('getOrderStatus error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { 
  createOrder,
  verifyPayment,
  orderStatus
};