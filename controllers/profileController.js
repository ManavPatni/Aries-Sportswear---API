const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const User = require('../models/userModel');
const Staff = require('../models/staffModel');

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

// Function to upload file buffer to Bunny.net
const uploadToBunny = async (buffer, filePath) => {
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_ACCESS_KEY;
  if (!storageZone || !accessKey) {
    throw new Error('Bunny.net configuration is missing');
  }
  const url = `https://sg.storage.bunnycdn.com/${storageZone}${filePath}`;
  try {
    await axios.put(url, buffer, {
      headers: {
        'AccessKey': accessKey,
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    throw new Error('Failed to upload to server: ' + error.message);
  }
};

// Function to delete file from Bunny.net
const deleteFromBunny = async (filePath) => {
  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const accessKey = process.env.BUNNY_ACCESS_KEY;
  if (!storageZone || !accessKey) {
    throw new Error('Bunny.net configuration is missing');
  }
  const url = `https://sg.storage.bunnycdn.com/${storageZone}${filePath}`;
  try {
    await axios.delete(url, {
      headers: {
        'AccessKey': accessKey,
      },
    });
  } catch (error) {
    console.error('Failed to delete file from server:', error);
    // Deletion failure is logged but does not interrupt the process
  }
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

    // Construct the full avatar URL using the CDN base URL
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

  upload(req, res, async (err) => {
    if (err) {
      if (err.message === 'Only images are allowed') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Avatar upload failed', error: err });
    }

    try {
      // Fetch existing avatar
      const [rows] = await db.query('SELECT avatar FROM users WHERE id = ?', [userId]);
      const existingAvatar = rows.length > 0 ? rows[0].avatar : null;

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

      let newAvatarPath = null;
      if (req.file) {
        const ext = path.extname(req.file.originalname);
        newAvatarPath = `/uploads/user/avatar/${userId}${ext}`;
        await uploadToBunny(req.file.buffer, newAvatarPath);
        updates.push('avatar = ?');
        values.push(newAvatarPath);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No data provided to update' });
      }

      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      values.push(userId);

      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Delete old avatar if it exists and is different
      if (existingAvatar && newAvatarPath && existingAvatar !== newAvatarPath) {
        await deleteFromBunny(existingAvatar);
      }

      res.json({ message: 'User profile updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update user profile', error: error.message });
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

    // Construct the full avatar URL using the CDN base URL
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
  const staffId = req.staffId; // Adjust if authentication uses req.user.userId

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
        await uploadToBunny(req.file.buffer, newAvatarPath);
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
        await deleteFromBunny(existingAvatar);
      }

      res.json({ message: 'Staff profile updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update staff profile', error: error.message });
    }
  });
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getStaffProfile,
  updateStaffProfile,
};