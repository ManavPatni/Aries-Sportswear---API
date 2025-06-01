const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO tag (name) VALUES (?)',
        [data.name]
    );
};

exports.findById = async (id) => {
    return db.query(
        'SELECT * FROM tag WHERE id = ? LIMIT 1',
        [id]
    );
};

exports.getAllTags = async () => {
    return db.query(
        'SELECT * FROM tag'
    );
};