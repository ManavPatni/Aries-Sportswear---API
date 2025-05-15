const jwt = require('jsonwebtoken');
const Staff = require('../models/staffModel');
const User = require('../models/userModel');
require('dotenv').config();

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        if (decoded.staffId) {
            const staff = await Staff.findById(decoded.staffId);
            if (!staff) {
                return res.status(403).json({ message: 'Invalid token: Staff not found' });
            }
            req.staff = staff;
            return next();
        }

        if (decoded.userId) {
            const user = await User.findById(decoded.userId);
            if (!user) {
                return res.status(403).json({ message: 'Invalid token: User not found' });
            }
            req.user = user;
            return next();
        }

        return res.status(403).json({ message: 'Invalid token: No valid user or staff ID' });
    } catch (err) {
        console.error('OTP Verification Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = authenticateToken;