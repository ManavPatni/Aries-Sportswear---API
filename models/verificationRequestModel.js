const db = require('../db/database');

exports.create = async (data) => {
  return db.query(
    `INSERT INTO verification_requests (email, otp_hash, role, ip, user_agent, expires_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.email, data.otpHash, data.role, data.ip, data.userAgent, data.expiresAt]
  );
};

exports.findLatestUnverified = async (email) => {
  const [rows] = await db.query(
    `SELECT * FROM verification_requests 
     WHERE email = ? AND verified = 0 
     ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  return rows[0];
};

exports.markVerified = async (id) => {
  return db.query(`UPDATE verification_requests SET verified = 1 WHERE id = ?`, [id]);
};
