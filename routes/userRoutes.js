const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const verifyOtp = require('../middleware/otpMiddleware');
const authController = require('../controllers/user/authController');
const profileController = require('../controllers/user/profileController');
const cartController = require('../controllers/user/cartController');
const { validateCouponForOrder } = require('../controllers/couponController');

const router = express.Router();

// ====================================================================
// PUBLIC ROUTES (No Authentication Required)
// ====================================================================

// --- Register & Login---
router.post('/send-otp', authController.sendOtp);
router.post('/register', verifyOtp, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// ====================================================================
// PROTECTED ROUTES (User Authentication Required)
// ====================================================================

// --- Details and profile ---
router.get('/details', authenticateToken, profileController.getDetails);
router.put('/details', authenticateToken, profileController.updateDeatils);
router.post('/logout', authenticateToken, authController.logout);
router.delete('/', authenticateToken, profileController.deleteUser);
router.get('/orders', authenticateToken, profileController.getAllOrders);

// --- Cart ---
router.post('/cart/add-item', authenticateToken, cartController.addToCart);
router.put('/cart/remove-item', authenticateToken, cartController.removeFromCart);
router.get('/cart', authenticateToken, cartController.getUserCart);

// --- Shipping Address---
router.post('/shipping-address', authenticateToken, profileController.addShippingAddress);
router.get('/shipping-address', authenticateToken, profileController.getShippingAddress);
router.put('/shipping-address', authenticateToken, profileController.updateShippingAddress);
router.delete('/shipping-address', authenticateToken, profileController.deleteShippingAddress);

// --- Coupon ---
router.post('/validate-coupon', authenticateToken, async (req, res) => {
  const { coupon_code, items } = req.body;
  try {
    const coupon = await validateCouponForOrder(coupon_code, req.user.id, items);
    res.json({ success: true, coupon });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;