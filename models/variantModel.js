const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO variant (product_id, is_base, description, color, size, price, stock, external_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [data.productId, data.isBase, data.description, data.color, data.size, data.price, data.stock, data.external_link]
    );
};

exports.baseVariantExists = async (productId) => {
    const [rows] = await db.query(
        'SELECT 1 FROM variant WHERE product_id = ? AND is_base = 1 LIMIT 1',
        [productId]
    );
    return rows.length > 0;
};

exports.getAllVariantByProductId = async (productId) => {
    return db.query (
        'SELECT * FROM variant WHERE product_id = ?',
        [productId]
    );
};