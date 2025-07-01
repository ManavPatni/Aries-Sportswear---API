const db = require('../../db/database');

exports.getOrderItems = async(orderId) => {
    const [rows] = db.query(
      `SELECT product_name, variant_name, size, color, quantity, unit_price, img_path
       FROM order_items
       WHERE order_id = ?`,
      [orderId]
    );
    
    return rows;
}