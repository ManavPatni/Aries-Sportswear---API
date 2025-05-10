const db = require('../config/database');

const Staff = {
  async create({ email, passwordHash, name, avatar, role }) {
    const [result] = await db.query(
      'INSERT INTO staff (email, password_hash, name, avatar, role) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, name, avatar, role]
    );
    return result.insertId;
  },
  async findById(id) {
    const [rows] = await db.query('SELECT id, email, name, avatar, role FROM staff WHERE id = ?', [id]);
    return rows[0];
  },
  async findByEmail(email) {
    const [rows] = await db.query('SELECT id, email, password_hash FROM staff WHERE email = ?', [email]);
    return rows[0];
  },
};

module.exports = Staff;