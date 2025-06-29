const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const orderController = require('../controllers/order/orderController');

const router = express.Router();

// ====================================================================
// PROTECTED ROUTES (User Authentication Required)
// ====================================================================

// ---Manage orders---
router.post('/create', authenticateToken, orderController.createOrder);
router.post('/verify-payment', authenticateToken, orderController.verifyPayment);


module.exports = router;