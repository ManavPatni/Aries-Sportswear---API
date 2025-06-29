const db = require('../../db/database');
const Staff = require('../../models/staff/staffModel');
const bcrypt = require('bcryptjs');
const mediaController = require('../mediaController');
const multer = require('multer');
const path = require('path');

const privilegedRoles = ['super_admin', 'admin'];
const allowedRoles = ['admin', 'staff'];

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

const addStaffMember = async (req, res) => {
    const currentRole = req.staff.role;
    const { name, email, password, role } = req.body;

    if (!privilegedRoles.includes(currentRole)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!name || !email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
    }

    try {
        const existing = await Staff.findByEmail(email);
        if (existing) {
            return res.status(409).json({ message: 'Staff with this email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const staffId = await Staff.create({ name, email, passwordHash, role });

        return res.status(201).json({
            message: 'Staff member added successfully',
            staff: {
                id: staffId,
                name,
                email,
                role
            }
        });

    } catch (error) {
        console.error('Error adding staff:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getAllStaffMembers = async (req, res) => {
    const currentRole = req.staff.role;

    if (!privilegedRoles.includes(currentRole)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
        const [rows] = await db.query(
            'SELECT id, name, email, avatar, role FROM staff'
        );

        return res.status(200).json({
            staff: rows
        });

    } catch (error) {
        console.error('Error fetching staff:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getStaffById = async (req, res) => {
    const currentRole = req.staff.role;
    const { id } = req.params;

    // Authorization check
    if (!privilegedRoles.includes(currentRole)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
        const staff = await Staff.findById(id);

        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        return res.status(200).json({ ...staff });

    } catch (error) {
        console.error('Error fetching staff by ID:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const updateStaffDetails = async (req, res) => {
  const { id } = req.params;
  const requesterRole = req.staff.role;
  const imageBaseUrl = process.env.IMAGE_BASE_URL || 'https://ariessportswear.com';

  if (!privilegedRoles.includes(requesterRole)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Avatar upload failed' });
    }

    try {
      const staff = await Staff.findById(id);
      if (!staff) return res.status(404).json({ message: 'Staff not found' });

      // Prevent admin from updating super_admin
      if (staff.role === 'super_admin' && requesterRole === 'admin') {
        return res.status(403).json({ message: 'Admins cannot update Super Admins' });
      }

      const { name, email } = req.body;
      const updates = [];
      const values = [];

      // Update name
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }

      // Update email (with duplicate check)
      if (email && email !== staff.email) {
        const [existing] = await db.query('SELECT id FROM staff WHERE email = ? AND id != ?', [email, id]);
        if (existing.length > 0) {
          return res.status(409).json({ message: 'Email already in use by another staff' });
        }
        updates.push('email = ?');
        values.push(email);
      }

      // Handle avatar upload
      let newAvatar = null;
      if (req.file) {
        const ext = path.extname(req.file.originalname);
        newAvatar = `/uploads/staff/avatar/${id}${ext}`;
        await mediaController.uploadToServer(req.file.buffer, newAvatar);
        updates.push('avatar = ?');
        values.push(newAvatar);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: 'No data provided to update' });
      }

      const updateQuery = `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`;
      values.push(id);

      const [result] = await db.query(updateQuery, values);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Staff not found' });
      }

      // Delete old avatar if replaced
      if (staff.avatar && newAvatar && staff.avatar !== newAvatar) {
        try {
          await mediaController.deleteFromServer(staff.avatar);
        } catch (err) {
          console.warn('Failed to delete old avatar:', err.message);
        }
      }

      const updatedStaff = await Staff.findById(id);
      const avatarUrl = updatedStaff.avatar ? `${imageBaseUrl}${updatedStaff.avatar}` : null;

      return res.json({
        message: 'Staff profile updated successfully',
        staff: { ...updatedStaff, avatarUrl },
      });

    } catch (error) {
      console.error('Update error:', error);
      res.status(500).json({ message: 'Failed to update staff profile', error: error.message });
    }
  });
};

const deleteStaffMember = async (req, res) => {
    const { id } = req.params;
    const currentRole = req.staff.role;

    // Only privileged roles can delete staff
    if (!privilegedRoles.includes(currentRole)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    if (req.staff.id === parseInt(id)) {
        return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    try {
        const staff = await Staff.findById(id);

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff not found' });
        }

        if (staff.role === "super_admin") {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        if (staff.avatar) {
            try {
                await mediaController.deleteFromServer(staff.avatar);
            } catch (err) {
                console.warn('Failed to delete avatar from Bunny:', err);
            }
        }

        const [result] = await db.query('DELETE FROM staff WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Staff not found' });
        }

        return res.status(200).json({
            success: true,
            message: 'Staff member deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting staff:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    addStaffMember,
    getAllStaffMembers,
    getStaffById,
    updateStaffDetails,
    deleteStaffMember
};