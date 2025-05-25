const db = require('../db/database');

const User = {
  async create({ email, passwordHash }) {
    const [result] = await db.query(
      'INSERT INTO user (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
    return result.insertId;
  },
  async findById(id) {
    const [rows] = await db.query('SELECT id, email, name, avatar, address FROM user WHERE id = ?', [id]);
    return rows[0];
  },
  async findByEmail(email) {
    const [rows] = await db.query('SELECT id, email, password_hash FROM user WHERE email = ?', [email]);
    return rows[0];
  },
};

module.exports = User;