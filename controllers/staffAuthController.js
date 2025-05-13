const Staff = require('../models/staffModel');
const RefreshToken = require('../models/staffRefreshTokenModel');
const bcrypt = require('bcryptjs');
const tokenUtils = require('../utils/tokenUtils');
const Verification = require('../models/verificationRequestModel')
const tempEmailChecker = require('../utils/tempEmailChecker');
const User = require('../models/userModel');
const rateLimiter = register('../utils/rateLimiter');

const allowedRoles = ['super-admin', 'admin', 'staff'];

const requestVerification = async (req, res) => {
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

  await Verification.create({
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

const verifyOtpAndRegister = async (req, res) => {
  const {email, otp, password, role} = req.body;

  if(!email || !otp || !password || !role) {
    return res.status(400).json({ message: 'Email, otp, password and role are required'});
  }

  const request = await Verification.findLatestUnverified(email);

  if (!request || request.expires_at < new Date()) {
    return res.status(400).json({ message: 'OTP expired or invaild.' });
  }
  
  const isValid = await bcrypt.compare(otp, request.otp_hash);
  if (!isValid) return res.status(400).json({ message: 'Invalid OTP.' });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const staffId = await Staff.create({ email, passwordHash, role})

  await Verification.markVerified(request.id);

  const accessToken = tokenUtils.generateAccessToken({ staffId });
  const refreshToken = tokenUtils.generateRefreshToken();

  await tokenUtils.saveRefreshToken({
    model: RefreshToken,
    id: staffId,
    token: refreshToken
  });

  res.status(201).json({
    message: 'Staff registered successfully.',
    accessToken,
    refreshToken
  });

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
  requestVerification,
  verifyOtpAndRegister,
  login, 
  refreshToken 
};