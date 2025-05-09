const db = require('../config/database');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const User = require('../models/userModel');
const Staff = require('../models/staffModel');

const getAvatarUploader = (type, id) => {
  // Determine the base upload path based on the environment
  const uploadsBasePath = process.env.NODE_ENV === 'production'
    ? '/home/ariesspo/public_html/uploads'
    : path.join(process.cwd(), 'uploads');
  
  // Construct the full destination path
  const destinationPath = path.join(uploadsBasePath, type, 'avatar');

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Create the directory if it doesn't exist
      fs.mkdir(destinationPath, { recursive: true }, (err) => {
        if (err) return cb(err);
        cb(null, destinationPath);
      });
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${id}${ext}`);
    },
  });

  return multer({
    storage,
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only images are allowed'));
      }
    },
  }).single('avatar');
};

// ---------- User Profile ----------
const getUserProfile = async (req, res) => {
  const userId = req.user.userId;
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';

  try {
    const userData = await User.findById(userId);
    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get avatar and construct the full URL
    const avatar = userData.avatar;
    const avatarUrl = avatar ? `${imageBaseUrl}${avatar}` : null;

    return res.status(200).json({
      ...userData,
      avatarUrl,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const updateUserProfile = async (req, res) => {
  const userId = req.user.userId;

  getAvatarUploader('user', userId)(req, res, async (err) => {
    if (err) {
      if (err.message === 'Only images are allowed') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Avatar upload failed', error: err });
    }

    const { name, address } = req.body;
    const updates = [];
    const values = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (address) {
      updates.push('address = ?');
      values.push(address);
    }
    if (req.file) {
      const avatarPath = `/uploads/user/avatar/${userId}${path.extname(req.file.originalname)}`;
      updates.push('avatar = ?');
      values.push(avatarPath);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No data provided to update' });
    }

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    values.push(userId);

    try {
      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ message: 'User profile updated successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update user profile', error });
    }
  });
};

// ---------- Staff Profile ----------
const getStaffProfile = async (req, res) => {
  const staffId = req.user.userId;
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';

  try {
    const userData = await Staff.findById(staffId);
    if (!userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get avatar and construct the full URL
    const avatar = userData.avatar;
    const avatarUrl = avatar ? `${imageBaseUrl}${avatar}` : null;

    return res.status(200).json({
      ...userData,
      avatarUrl,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const updateStaffProfile = async (req, res) => {
  const staffId = req.staffId;

  getAvatarUploader('staff', staffId)(req, res, async (err) => {
    if (err) {
      if (err.message === 'Only images are allowed') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Avatar upload failed', error: err });
    }

    const { name } = req.body;
    const updates = [];
    const values = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }
    if (req.file) {
      const avatarPath = `/uploads/staff/avatar/${staffId}${path.extname(req.file.originalname)}`;
      updates.push('avatar = ?');
      values.push(avatarPath);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No data provided to update' });
    }

    const query = `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`;
    values.push(staffId);

    try {
      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Staff not found' });
      }
      res.json({ message: 'Staff profile updated successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update staff profile', error });
    }
  });
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getStaffProfile,
  updateStaffProfile,
};