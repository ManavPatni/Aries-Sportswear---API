const db = require('../../db/database');

exports.getOrderItems = async (orderId, conn = null) => {
  const connection = conn || db;
  const [rows] = await connection.query(
    `SELECT * FROM order_items WHERE order_id = ?`,
    [orderId]
  );
  return rows;
};