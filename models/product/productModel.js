const db = require('../../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO product (sub_category_id, name) VALUES (?, ?)',
        [data.subCategoryId, data.name]
    );
}

exports.findById = async (id) => {
    return db.query(
        'SELECT * FROM variant WHERE id = ? LIMIT 1',
        [id]
    );
};

exports.getAllProducts = async () => {
    return db.query(
        'SELECT * FROM product'
    );
};