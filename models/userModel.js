const db = require('../config/database');

const User = {
  async create({ email, passwordHash, name, avatar, address }) {
    const [result] = await db.query(
      'INSERT INTO users (email, password_hash, name, avatar, address) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, name, avatar, address]
    );
    return result.insertId;
  },
  async findByEmail(email) {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0];
  },
  async findById(id) {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  },
};

module.exports = User;