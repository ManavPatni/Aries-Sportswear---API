const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO product_tag (product_id, tag_id) VALUES (?, ?)',
        [data.productId, data.tagId]
    );
};