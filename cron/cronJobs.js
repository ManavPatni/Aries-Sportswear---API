const cron = require('node-cron');
const db = require('../db/database');

// 1. Daily Cleanup at midnight
cron.schedule('0 0 * * *', async () => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const query = `
        DELETE FROM user_refresh_tokens WHERE expires_at < NOW();
        DELETE FROM staff_refresh_tokens WHERE expires_at < NOW();
        `;

        await client.query(query);
        await client.query('COMMIT');
        console.log('[CRON] Daily cleanup executed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[CRON] Error in daily cleanup:', error);
    } finally {
        client.release();
    }
});

// 2. Every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const query = `
        DELETE FROM otp_requests WHERE expires_at < NOW();
      `;

        await client.query(query);
        await client.query('COMMIT');
        console.log('[CRON] Cleaned expired OTP requests');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[CRON] Error cleaning OTP requests:', error);
    } finally {
        client.release();
    }
});
