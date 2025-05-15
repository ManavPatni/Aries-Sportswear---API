const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const verifyOtp = require('../middleware/otpMiddleware');
const authController = require('../controllers/staffAuthController');
const profileController = require('../controllers/profileController');

const router = express.Router();

//Public routes
router.post('/send-otp', authController.sendOtp);
router.post('/register', verifyOtp, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes
router.get('/details', authenticateToken, profileController.getStaffProfile);
router.put('/details', authenticateToken, profileController.updateStaffProfile);

module.exports = router;