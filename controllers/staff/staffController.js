const db = require('../../db/database');
const Staff = require('../../models/staffModel');
const bcrypt = require('bcryptjs');
const mediaController = require('../mediaController');

const privilegedRoles = ['super-admin', 'admin'];
const allowedRoles = ['admin', 'staff'];

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

const deleteStaffMember = async (req, res) => {
    const { id } = req.params;
    const currentRole = req.staff.role;

    // Only privileged roles can delete staff
    if (!privilegedRoles.includes(currentRole)) {
        return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
        const staff = await Staff.findById(id);

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff not found' });
        }

        // Delete avatar from Bunny (if exists)
        if (staff.avatar) {
            try {
                await mediaController.deleteFromServer(staff.avatar);
            } catch (err) {
                console.warn('Failed to delete avatar from Bunny:', err);
            }
        }

        // Delete the staff record
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
    deleteStaffMember
};