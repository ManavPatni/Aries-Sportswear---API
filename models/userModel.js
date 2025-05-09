const db = require('../config/database');

const User = {
  async create({ email, passwordHash }) {
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
    return result.insertId;
  },
  async findByEmail(email) {
    const [rows] = await db.query('SELECT id, email, name, avatar, address FROM users WHERE email = ?', [email]);
    return rows[0];
  },
  async findById(id) {
    const [rows] = await db.query('SELECT id, email, name, avatar, address FROM users WHERE id = ?', [id]);
    return rows[0];
  },
};

module.exports = User;