const User = require('../models/userModel');
const RefreshToken = require('../models/userRefreshTokenModel');
const bcrypt = require('bcryptjs');
const tokenUtils = require('../utils/tokenUtils');

const register = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  const existingUser = await User.findByEmail(email);
  if (existingUser) return res.status(400).json({ message: 'User already exists' });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const userId = await User.create({ email, passwordHash });

  const accessToken = tokenUtils.generateAccessToken({ userId });
  const refreshToken = tokenUtils.generateRefreshToken();

  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: userId, token: refreshToken });

  res.status(201).json({ accessToken, refreshToken });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findByEmail(email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

  const accessToken = tokenUtils.generateAccessToken({ userId: user.id });
  const refreshToken = tokenUtils.generateRefreshToken();

  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: user.id, token: refreshToken });

  res.status(200).json({ accessToken, refreshToken });
};

const refreshToken = async (req, res) => {
  const { refreshToken: incomingToken } = req.body;
  if (!incomingToken) return res.status(400).json({ message: 'Refresh token required' });

  const stored = await tokenUtils.findRefreshToken(RefreshToken, incomingToken);
  if (!stored || stored.expires_at < new Date()) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }

  await tokenUtils.deleteRefreshToken(RefreshToken, incomingToken);

  const newRefreshToken = tokenUtils.generateRefreshToken();
  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: stored.user_id, token: newRefreshToken });

  const accessToken = tokenUtils.generateAccessToken({ userId: stored.user_id });

  res.json({ accessToken, refreshToken: newRefreshToken });
};

module.exports = { register, login, refreshToken };