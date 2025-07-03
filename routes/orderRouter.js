const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const orderController = require('../controllers/order/orderController');

const router = express.Router();

// ====================================================================
// PROTECTED ROUTES (User or Staff Authentication Required)
// ====================================================================

// ---Manage orders---
router.post('/create', authenticateToken, orderController.createOrder);
router.post('/verify-payment', authenticateToken, orderController.verifyPayment);
router.get('/details', authenticateToken, orderController.orderDetails);
router.get('/get-all', authenticateToken, orderController.getAllOrders);
router.post('/status', authenticateToken, orderController.updateOrderStatus);


module.exports = router;