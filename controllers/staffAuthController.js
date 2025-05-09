const Staff = require('../models/staffModel');
const RefreshToken = require('../models/staffRefreshTokenModel');
const bcrypt = require('bcryptjs');
const tokenUtils = require('../utils/tokenUtils');

const allowedRoles = ['super-admin', 'admin'];

const register = async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Invalid role specified' });

  const existingStaff = await Staff.findByEmail(email);
  if (existingStaff) return res.status(400).json({ message: 'Staff already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const staffId = await Staff.create({ email, passwordHash, name, role });

  const accessToken = tokenUtils.generateAccessToken({ staffId, role });
  const refreshToken = tokenUtils.generateRefreshToken();

  await tokenUtils.saveRefreshToken({ model: RefreshToken, id: staffId, token: refreshToken });

  res.status(201).json({ accessToken, refreshToken });
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

module.exports = { register, login, refreshToken };