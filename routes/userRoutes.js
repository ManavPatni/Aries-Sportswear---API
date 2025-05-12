const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const authController = require('../controllers/userAuthController');
const profileController = require('../controllers/profileController');

const router = express.Router();

//Public routes
router.post('/request-verification', authController.requestVerification);
router.post('/verify-otp', authController.verifyOtpAndRegister);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes
router.get('/details', authenticateToken, profileController.getUserProfile);
router.put('/details', authenticateToken, profileController.updateUserProfile);

module.exports = router;