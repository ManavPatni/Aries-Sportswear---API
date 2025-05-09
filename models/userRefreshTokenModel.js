const db = require('../config/database');

const RefreshToken = {
  async create({ userId, tokenHash, expiresAt }) {
    const [result] = await db.query(
      'INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );
    return result.insertId;
  },

  async findByTokenHash(tokenHash) {
    const [rows] = await db.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW()',
      [tokenHash]
    );
    return rows[0];
  },

  async deleteByTokenHash(tokenHash) {
    const [result] = await db.query('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);
    return result.affectedRows;
  },

  async deleteByUserId(userId) {
    const [result] = await db.query('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    return result.affectedRows;
  },
};

module.exports = RefreshToken;