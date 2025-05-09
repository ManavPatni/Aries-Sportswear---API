const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Hash a plain-text refresh token
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate a new random refresh token
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Generate a JWT access token (1h expiry)
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
}

// Save a refresh token in the database using a provided model
async function saveRefreshToken({ model, id, token }) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await model.create({ id, tokenHash, expiresAt });
}

// Find a refresh token by token string using a provided model
async function findRefreshToken(model, rawToken) {
  const tokenHash = hashToken(rawToken);
  return await model.findByTokenHash(tokenHash);
}

// Delete a refresh token by hash
async function deleteRefreshToken(model, rawToken) {
  const tokenHash = hashToken(rawToken);
  return await model.deleteByTokenHash(tokenHash);
}

module.exports = {
  generateRefreshToken,
  generateAccessToken,
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
};