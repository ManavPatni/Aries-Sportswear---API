const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO variant_image (variant_id, path) VALUES (?, ?)',
        [data.variantId, data.Path]
    );
};