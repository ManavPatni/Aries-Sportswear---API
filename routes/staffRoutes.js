const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const authController = require('../controllers/staff/authController');
const profileController = require('../controllers/staff/profileController');
const staffController = require('../controllers/staff/staffController');

const router = express.Router();

//Public routes
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

//Protected Routes
//Logged-in staff details
router.get('/details', authenticateToken, profileController.getDeatils);
router.put('/details', authenticateToken, profileController.updateDetails);

//Manage staff
router.post('/', authenticateToken, staffController.addStaffMember);
router.get('/', authenticateToken, staffController.getAllStaffMembers);
router.get('/:id', authenticateToken, staffController.getStaffById);
router.put('/:id', authenticateToken, staffController.updateStaffDetails);
router.delete('/:id', authenticateToken, staffController.deleteStaffMember);

module.exports = router;