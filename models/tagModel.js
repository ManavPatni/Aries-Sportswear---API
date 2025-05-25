const db = require('../db/database');

exports.create = async (data) => {
    return db.query(
        'INSERT INTO tag (name) VALUES (?)',
        [data.name]
    );
};

exports.getAllTags = async () => {
    return db.query(
        'SELECT * FROM tag'
    );
};