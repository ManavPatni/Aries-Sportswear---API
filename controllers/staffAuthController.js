const Staff = require('../models/staffModel');
const RefreshToken = require('../models/staffRefreshTokenModel');
const bcrypt = require('bcryptjs');
const tokenUtils = require('../utils/tokenUtils');
const otpRequest = require('../models/otpRequestModel')
const tempEmailChecker = require('../utils/tempEmailChecker');
const emailService = require('../utils/emailService');
const rateLimiter = require('../utils/rateLimiter');

const allowedRoles = ['super-admin', 'admin', 'staff'];

const sendOtp = async (req, res) => {
  const { email } = req.body;
  const ip = req.ip;
  const userAgent = req.get('User-Agent');

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email is invaild or null' });
  }

  const existingStaff = await Staff.findByEmail(email);
  if (existingStaff) {
    return res.status(400).json({ message: 'Staff already exists.' });
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
    role: 'staff',
    ip: ip,
    userAgent: userAgent,
    expiresAt: expiresAt
  });

  await emailService.sendOtpEmail(email, otp);

  res.status(200).json({ message: 'OTP sent to your email.' });
};

const register = async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: 'Email, password, name, and role are required' });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const staffId = await Staff.create({ email, passwordHash, name, role });

    const accessToken = tokenUtils.generateAccessToken({ staffId });
    const refreshToken = tokenUtils.generateRefreshToken();

    await tokenUtils.saveRefreshToken({
      model: RefreshToken,
      id: staffId,
      token: refreshToken
    });

    res.status(201).json({
      message: 'Staff registered successfully',
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
  const staff = await Staff.findByEmail(email);
  if (!staff) return res.status(401).json({ message: 'Invalid credentials' });

  const isValid = await bcrypt.compare(password, staff.password_hash);
  if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });

  const accessToken = tokenUtils.generateAccessToken({ staffId: staff.id, role: staff.role });
  const refreshToken = tokenUtils.generateRefreshToken();

  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: staff.id, token: refreshToken });

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
  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: stored.staff_id, token: newRefreshToken });

  const accessToken = tokenUtils.generateAccessToken({ staffId: stored.staff_id });

  res.json({ accessToken, refreshToken: newRefreshToken });
};

module.exports = { 
  sendOtp,
  register,
  login, 
  refreshToken 
};