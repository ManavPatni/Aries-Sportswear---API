const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO category (name) VALUES (?)',
        [data.name]
    );
};

exports.getAllCategories = async () => {
    return db.query(
        'SELECT * FROM category'
    );
};