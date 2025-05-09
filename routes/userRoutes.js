const express = require('express');
const authController = require('../controllers/userAuthController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

//Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes

module.exports = router;