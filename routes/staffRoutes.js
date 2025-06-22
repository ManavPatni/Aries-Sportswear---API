const express = require('express');
const db = require('../db/database')
const authenticateToken = require('../middleware/authMiddleware');
const authController = require('../controllers/staff/authController');
const profileController = require('../controllers/staff/profileController');
const staffController = require('../controllers/staff/staffController');
const NotificationController = require('../controllers/NotificationController');
const notificationController = new NotificationController(db);

const router = express.Router();

// ====================================================================
// PUBLIC ROUTES (No Authentication Required)
// ====================================================================
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// ====================================================================
// PROTECTED ROUTES (User Authentication Required)
// ====================================================================

// --- Logged-in staff details ---
router.get('/details', authenticateToken, profileController.getDeatils);
router.put('/details', authenticateToken, profileController.updateDetails);

// --- Notification ---
router.get('/notification', authenticateToken, async (req, res) => {
    try {
        const staffId = req.staff.id;
        const result = await notificationController.getNotifications(staffId);
        return res.status(200).json({ notifications: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message });
    }
});
router.post('/notification/status', authenticateToken, async (req, res) => {
    try {
        const staffId = req.staff.id;
        const { notificationId, status } = req.body;

        if (notificationId == null || status == null) {
            return res.status(400).json({ message: 'notificationId and status are required' });
        }
        if (![0, 1].includes(status)) {
            return res.status(400).json({ message: 'status must be 0 or 1' });
        }

        const result = await notificationController.changeSeenStatus(staffId, notificationId, status);
        return res.status(200).json(result);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: err.message || 'Internal Server Error' });
    }
});
router.delete('/notification', authenticateToken, async (req, res) => {
    try {
        const staffId = req.staff.id;
        const { notificationId } = req.body;
        if (!notificationId) {
            return res.status(400).json({ message: 'notificationId is required' });
        }
        const result = await notificationController.deleteNotificationRecipient(staffId, notificationId);
        return res.status(200).json(result);
    } catch (err) {
        console.error(err);
        return res.status(400).json({ message: err.message });
    }
});

// --- Manage staff ---
router.post('/', authenticateToken, staffController.addStaffMember);
router.get('/', authenticateToken, staffController.getAllStaffMembers);
router.get('/:id', authenticateToken, staffController.getStaffById);
router.put('/:id', authenticateToken, staffController.updateStaffDetails);
router.delete('/:id', authenticateToken, staffController.deleteStaffMember);

module.exports = router;