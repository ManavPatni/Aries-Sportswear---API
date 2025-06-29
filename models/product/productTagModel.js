const db = require('../../db/database');

exports.insert = async (data) => {
    return db.query(
        'INSERT INTO product_tag (variant_id, tag_id) VALUES (?, ?)',
        [data.variantId, data.tagId]
    );
};

exports.findByTagId = async (tagId) => {
    return db.query(
        'SELECT * FORM product_tag WHERE tag_id = ?',
        [tagId]
    );
};