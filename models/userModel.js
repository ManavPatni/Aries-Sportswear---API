const db = require('../db/database');

const User = {
  async create({ email, passwordHash }) {
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
    return result.insertId;
  },
  async findById(id) {
    const [rows] = await db.query('SELECT id, email, name, avatar, address FROM users WHERE id = ?', [id]);
    return rows[0];
  },
  async findByEmail(email) {
    const [rows] = await db.query('SELECT id, email, password_hash FROM users WHERE email = ?', [email]);
    return rows[0];
  },
};

module.exports = User;