const db = require('../../db/database');

exports.addStatus = async (data, conn = null) => {
  if (!data || typeof data !== 'object' || !data.order_id || !data.status) {
    throw new Error('Invalid data: order_id and status are required');
  }

  const connection = conn || db;
  const [result] = await connection.query(
    `INSERT INTO order_status 
     (order_id, status, note, created_by)
     VALUES (?, ?, ?, ?)`,
    [
      data.order_id,
      data.status,
      data.note || null,
      data.created_by || 0
    ]
  );

  return result;
};

exports.getOrderStatus = async (order_id) => {
  if (!order_id || !Number.isInteger(order_id)) {
    throw new Error('Invalid order_id');
  }

  const [rows] = await db.query(
    `SELECT order_id, status, note, created_by, created_at
     FROM order_status 
     WHERE order_id = ?
     ORDER BY created_at ASC`,
    [order_id]
  );
  return rows;
};