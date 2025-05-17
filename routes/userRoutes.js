const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const verifyOtp = require('../middleware/otpMiddleware');
const authController = require('../controllers/user/authController');
const profileController = require('../controllers/user/profileController');

const router = express.Router();

//Public routes
router.post('/send-otp', authController.sendOtp);
router.post('/register', verifyOtp, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes
router.get('/details', authenticateToken, profileController.getDetails);
router.put('/details', authenticateToken, profileController.updateDeatils);
router.delete('/', authenticateToken, profileController.deleteUser);

module.exports = router;