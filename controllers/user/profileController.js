const db = require('../../db/database');
const multer = require('multer');
const path = require('path');
const mediaController = require('../mediaController');
const User = require('../../models/user/userModel');
const shippingAddressModel = require('../../models/user/shippingAddressModel');

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

const getDetails = async (req, res) => {
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';

  // Construct the full avatar URL using the CDN base URL
  const avatar = req.user.avatar;
  const avatarUrl = avatar ? `${imageBaseUrl}${avatar}` : null;

  return res.status(200).json({
    ...req.user,
    avatarUrl,
  });
  
};

const updateDeatils = async (req, res) => {
  const userId = req.user.id;
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
      const [rows] = await db.query('SELECT avatar FROM user WHERE id = ?', [userId]);
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
        await mediaController.uploadToServer(req.file.buffer, newAvatarPath);
        updates.push('avatar = ?');
        values.push(newAvatarPath);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No data provided to update' });
      }

      const query = `UPDATE user SET ${updates.join(', ')} WHERE id = ?`;
      values.push(userId);

      const [result] = await db.query(query, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Delete old avatar if it exists and is different
      if (existingAvatar && newAvatarPath && existingAvatar !== newAvatarPath) {
        await mediaController.deleteFromServer(existingAvatar);
      }

      // Fetch updated user data
      const updatedUser = await User.findById(userId);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Construct the full avatar URL
      const avatarUrl = updatedUser.avatar ? `${imageBaseUrl}${updatedUser.avatar}` : null;

      res.json({
        message: 'User profile updated successfully',
        user: {
          ...updatedUser,
          avatarUrl,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update user profile', error: error.message });
    }
  });
};

const deleteUser = async (req, res) => {
  const { id, avatar, email } = req.user;

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
      "DELETE FROM otp_request WHERE email = ? AND role = 'user'",
      [email]
    );

    // Delete the user
    const [result] = await db.query("DELETE FROM user WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const addShippingAddress = async (req, res) => {
  const userId = req.user.id;
  const { address } = req.body;
  if (!address) return res.status(400).json({message: 'Missing or invalid address object'});

  try {
    const address_id = await shippingAddressModel.addAddress(userId, address);
    return res.json(201).json({ message: 'Address saved', address_id})
  } catch (err) {
    console.error( 'addShippingAddress error:', err );
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }

};

const getShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const getAll = req.query.all !== 'false';

    const result = await shippingAddressModel.getUserAddress(userId, getAll);

    res.status(200).json({
      message: 'Address fetched successfully',
      data: result,
    });
  } catch (error) {
    console.error('getShippingAddress error:', error);
    res.status(500).json({ message: 'Internal server error', error: err.message });
  }
};

const updateShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, address } = req.body;
    if (!address) return res.status(400).json({message: 'Missing or invalid address object'});
 
    if (!addressId) {
      return res.status(400).json({ error: 'Missing addressId' });
    }

    await shippingAddressModel.updateAddress(addressId, userId, address);
    res.status(200).json({ message: 'Address updated successfully' });
  } catch (err) {
    console.error('updateShippingAddress:', err);
    res.status(400).json({ error: err.message });
  }
};

const deleteShippingAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId } = req.body;
    if (!addressId) {
      return res.status(400).json({ error: 'Missing addressId' });
    }

    await shippingAddressModel.removeAddress(addressId, userId);
    res.status(200).json({ message: 'Address removed successfully' });
  } catch (err) {
    console.error('deleteShippingAddress:', err);
    res.status(400).json({ error: err.message });
  }
};

module.exports = {
  getDetails,
  updateDeatils,
  deleteUser,
  addShippingAddress,
  getShippingAddress,
  updateShippingAddress,
  deleteShippingAddress
};

/*
TODO 
-   Reset password
-   Forgot password
*/