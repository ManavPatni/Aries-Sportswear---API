const db = require('../db/database');

exports.isRateLimited = async ({ email, ip }) => {
  const [results] = await db.query(
    `SELECT COUNT(*) AS count FROM verification_requests 
     WHERE (email = ? OR ip = ?) AND created_at > (NOW() - INTERVAL 1 HOUR)`,
    [email, ip]
  );
  return results[0].count >= 5;
};
