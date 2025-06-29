class NotificationController {
    constructor(db) {
        this.db = db;
        this.validTypes = ['stock', 'order', 'alert', 'system'];
        this.validTargets = ['all', 'specific', 'role'];
        this.validPriorities = ['high', 'medium', 'low'];
    }

    async createNotification(type, title, description, priority, deeplink, target, exclude = []) {
        if (!type || !title || !description || !priority || !target || !target.type) {
            throw new Error('Missing required fields');
        }
        if (!this.validTypes.includes(type)) throw new Error('Invalid notification type');
        if (!this.validPriorities.includes(priority)) throw new Error('Invalid priority value');
        if (!this.validTargets.includes(target.type)) throw new Error('Invalid target type');
        if (!Array.isArray(exclude)) throw new Error('Exclude must be an array');

        let connection;
        try {
            connection = await this.db.getConnection();
            await connection.beginTransaction();

            const [notificationResult] = await connection.query(
                'INSERT INTO staff_notification (type, title, description, priority, deeplink) VALUES (?, ?, ?, ?, ?)',
                [type, title, description, priority, deeplink || null]
            );
            const notificationId = notificationResult.insertId;

            let staffIds = [];

            if (target.type === 'all') {
                const [rows] = await connection.query('SELECT id FROM staff');
                staffIds = rows.map(row => row.id);
            } else if (target.type === 'specific') {
                if (!Array.isArray(target.value) || target.value.length === 0) {
                    throw new Error('Specific target requires an array of staff IDs');
                }
                const placeholders = target.value.map(() => '?').join(',');
                const [rows] = await connection.query(
                    `SELECT id FROM staff WHERE id IN (${placeholders})`,
                    target.value
                );
                staffIds = rows.map(row => row.id);
            } else if (target.type === 'role') {
                if (!target.value || typeof target.value !== 'string') {
                    throw new Error('Role target requires a valid role name');
                }
                const [rows] = await connection.query(
                    'SELECT id FROM staff WHERE role = ?',
                    [target.value]
                );
                if (rows.length === 0) {
                    throw new Error('No staff found with specified role');
                }
                staffIds = rows.map(row => row.id);
            }

            // Validate excluded staff IDs
            if (exclude.length > 0) {
                const placeholders = exclude.map(() => '?').join(',');
                const [rows] = await connection.query(
                    `SELECT id FROM staff WHERE id IN (${placeholders})`,
                    exclude
                );
                if (rows.length !== exclude.length) {
                    throw new Error('Some excluded staff IDs are invalid');
                }
            }

            // Filter excluded staff
            staffIds = staffIds.filter(id => !exclude.includes(id));

            if (staffIds.length > 0) {
                const recipientValues = staffIds.map(id => [notificationId, id]);
                await connection.query(
                    'INSERT INTO staff_notification_recipient (notification_id, staff_id) VALUES ?',
                    [recipientValues]
                );
            }

            await connection.commit();
            return {
                message: 'Notification created successfully',
                notificationId,
                recipients: staffIds.length
            };
        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async getNotifications(staffId) {
        const [rows] = await this.db.query(
            `SELECT sn.id, sn.type, sn.title, sn.description, sn.priority, sn.deeplink, sn.created_at, sn.updated_at, snr.seen
             FROM staff_notification_recipient snr
             JOIN staff_notification sn ON snr.notification_id = sn.id
             WHERE snr.staff_id = ?
             ORDER BY sn.created_at DESC`,
            [staffId]
        );
        return rows;
    }

    async changeSeenStatus(staffId, notificationId, status) {
        const [result] = await this.db.query(
            'UPDATE staff_notification_recipient SET seen = ? WHERE staff_id = ? AND notification_id = ?',
            [status, staffId, notificationId]
        );

        if (result.affectedRows === 0) {
            throw new Error('Notification not found or already updated');
        }

        return { message: 'Notification seen status updated' };
    }

    async deleteNotificationRecipient(staffId, notificationId) {
        if (typeof notificationId !== 'number') {
            throw new Error('Invalid notificationId');
        }

        const [result] = await this.db.query(
            'DELETE FROM staff_notification_recipient WHERE staff_id = ? AND notification_id = ?',
            [staffId, notificationId]
        );

        if (result.affectedRows === 0) {
            throw new Error('Notification not found or already deleted');
        }

        return { message: 'Notification deleted successfully' };
    }
}

module.exports = NotificationController;
