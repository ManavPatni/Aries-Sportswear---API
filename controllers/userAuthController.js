const User = require('../models/userModel');
const RefreshToken = require('../models/userRefreshTokenModel');
const bcrypt = require('bcryptjs');
const tokenUtils = require('../utils/tokenUtils');
const otpRequest = require('../models/otpRequestModel');
const tempEmailChecker = require('../utils/tempEmailChecker');
const emailService = require('../utils/emailService');
const rateLimiter = require('../utils/rateLimiter');

const sendOtp = async (req, res) => {
  const { email } = req.body;
  const ip = req.ip;
  const userAgent = req.get('User-Agent');

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email is invaild or null' });
  }

  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists.' });
  }

  if (tempEmailChecker.isTemporaryEmail(email)) {
    return res.status(400).json({ message: 'Temporary email addresses are not allowed.' });
  }

  const limited = await rateLimiter.isRateLimited({ email, ip });
  if (limited) {
    return res.status(429).json({ message: 'Too many requests. Please try again later.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await otpRequest.create({
    email: String(email).trim(),
    otpHash: otpHash,
    role: 'user',
    ip: ip,
    userAgent: userAgent,
    expiresAt: expiresAt
  });

  await emailService.sendOtpEmail(email, otp);

  res.status(200).json({ message: 'OTP sent to your email.' });
};

const register = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email, and password are required.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = await User.create({ email, passwordHash });

    const accessToken = tokenUtils.generateAccessToken({ userId });
    const refreshToken = tokenUtils.generateRefreshToken();

    await tokenUtils.saveRefreshToken({ 
      model: RefreshToken, 
      id: userId, 
      token: refreshToken 
    });

    res.status(201).json({
      message: 'User registered successfully.',
      accessToken,
      refreshToken
    });
  } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error during registration' });
  }
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

module.exports = { 
  sendOtp,
  register, 
  login, 
  refreshToken 
};