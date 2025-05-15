const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const verifyOtp = require('../middleware/otpMiddleware');
const authController = require('../controllers/userAuthController');
const profileController = require('../controllers/profileController');

const router = express.Router();

//Public routes
router.post('/send-otp', authController.sendOtp);
router.post('/register', verifyOtp, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes
router.get('/details', authenticateToken, profileController.getUserProfile);
router.put('/details', authenticateToken, profileController.updateUserProfile);
router.delete('/user', authenticateToken, profileController.deleteUser);

module.exports = router;