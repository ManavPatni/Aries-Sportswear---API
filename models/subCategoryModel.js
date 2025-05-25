const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO sub_category (category_id, name) VALUES (?, ?)',
        [data.categoryId, data.name]
    );
};

exports.getAllSubCategories = async () => {
    return db.query(
        'SELECT * FROM sub_category'
    );
};

exports.getSubCategoriesByCategoryId = async (categoryId) => {
    return db.query(
        'SELECT * FROM sub_category WHERE category_id = ?',
        [categoryId]
    );
};