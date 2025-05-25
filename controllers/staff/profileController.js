const db = require('../../db/database');
const multer = require('multer');
const path = require('path');
const mediaController = require('../mediaController');
const Staff = require('../../models/staffModel');

// Multer configuration with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
}).single('avatar');

const getDeatils = async (req, res) => {
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';
  
  // Construct the full avatar URL using the CDN base URL
  const avatar = req.staff.avatar;
  const avatarUrl = avatar ? `${imageBaseUrl}${avatar}` : null;

  return res.status(200).json({
    ...req.staff,
    avatarUrl,
  });

};

const updateDetails = async (req, res) => {
  const staffId = req.staff.id;
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';

  upload(req, res, async (err) => {
    if (err) {
      if (err.message === 'Only images are allowed') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Avatar upload failed', error: err });
    }

    try {
      // Fetch existing avatar
      const [rows] = await db.query('SELECT avatar FROM staff WHERE id = ?', [staffId]);
      const existingAvatar = rows.length > 0 ? rows[0].avatar : null;

      const { name } = req.body;
      const updates = [];
      const values = [];

      if (name) {
        updates.push('name = ?');
        values.push(name);
      }

      let newAvatarPath = null;
      if (req.file) {
        const ext = path.extname(req.file.originalname);
        newAvatarPath = `/uploads/staff/avatar/${staffId}${ext}`;
        await mediaController.uploadToServer(req.file.buffer, newAvatarPath);
        updates.push('avatar = ?');
        values.push(newAvatarPath);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No data provided to update' });
      }

      const query = `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`;
      values.push(staffId);

      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Staff not found' });
      }

      // Delete old avatar if it exists and is different
      if (existingAvatar && newAvatarPath && existingAvatar !== newAvatarPath) {
        await mediaController.deleteFromServer(existingAvatar);
      }

      // Fetch updated staff data
      const updatedStaff = await Staff.findById(staffId);
      if (!updatedStaff) {
        return res.status(404).json({ message: 'Staff not found' });
      }

      // Construct the full avatar URL
      const avatarUrl = updatedStaff.avatar ? `${imageBaseUrl}${updatedStaff.avatar}` : null;

      res.json({
        message: 'Staff profile updated successfully',
        staff: {
          ...updatedStaff,
          avatarUrl,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update staff profile', error: error.message });
    }
  });
};

const deleteStaff = async (req, res) => {
  const { id, avatar, email } = req.staff;

  try {
    // Delete avatar from Bunny if present
    if (avatar) {
      try {
        await mediaController.deleteFromServer(avatar);
      } catch (err) {
        console.warn("Failed to delete avatar from Bunny:", err);
      }
    }

    // Delete OTP requests
    await db.query(
      "DELETE FROM otp_request WHERE email = ? AND role = 'staff'",
      [email]
    );

    // Delete the user
    const [result] = await db.query("DELETE FROM staff WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Staff deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getDeatils,
  updateDetails,
  deleteStaff
};