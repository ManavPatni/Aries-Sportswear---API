const User = require('../models/userModel');
const RefreshToken = require('../models/userRefreshTokenModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { json } = require('express');
const crypto = require('crypto');

const generateAccessToken = (userId) => {
    return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
};

const generateRefreshToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const register = async (req, res) => {
    const { email, password, name, avatar } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    
    const existingUser = await User.findByEmail(email);
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = await User.create({ email, passwordHash, name, avatar });

    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken();
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 *60 * 1000);

    await RefreshToken.create({ userId, tokenHash, expiresAt });

    res.status(201).json({ accessToken, refreshToken });

};

const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invaild credentials' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401),json({ message: 'Invaild credentials' });

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken();
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 *60 * 1000);
    
    await RefreshToken.create({ userId: user.id, tokenHash, expiresAt });

    res.status(201).json({ accessToken, refreshToken });
};

module.exports = { register, login };