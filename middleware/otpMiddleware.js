const bcrypt = require('bcryptjs');
const otpRequest = require('../models/user/otpRequestModel');

const verifyOtp = async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required' });
    }

    try {
        const request = await otpRequest.findLatestUnverified(email);

        if (!request || new Date(request.expires_at) < new Date()) {
            return res.status(400).json({ message: 'OTP expired or invalid' });
        }

        const isValid = await bcrypt.compare(otp, request.otp_hash);

        if (!isValid) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        await otpRequest.markVerified(request.id);

        return next();

    } catch (err) {
        console.error('OTP Verification Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = verifyOtp;