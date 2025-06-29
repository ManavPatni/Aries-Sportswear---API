const db = require('../../db/database');

const Staff = {
  async create({ name, email, passwordHash, role }) {
    const [result] = await db.query(
      'INSERT INTO staff (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
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