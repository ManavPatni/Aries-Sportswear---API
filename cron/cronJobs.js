const cron = require('node-cron');
const db = require('../db/database'); // Assuming this is your mysql2/promise pool

/**
 * A helper function to create a cron task with standardized logging and error handling.
 * @param {string} schedule - The cron schedule string (e.g., '0 0 * * *').
 * @param {string} taskName - A descriptive name for the task for logging.
 * @param {Function} taskFunction - An async function that performs the database operation. It receives the db pool as an argument.
 */
const createCronTask = (schedule, taskName, taskFunction) => {
  console.log(`[CRON] Scheduled: ${taskName} | Schedule: ${schedule}`);
  
  cron.schedule(schedule, async () => {
    console.log(`[CRON] Running: ${taskName}`);
    try {
      // For simple, single queries, we can directly use the pool.
      // The database handles this as an atomic, auto-committed transaction.
      await taskFunction(db);
      console.log(`[CRON] Success: ${taskName} executed successfully.`);
    } catch (error) {
      console.error(`[CRON] Error in ${taskName}:`, error);
    }
  }, {
    timezone: "Asia/Kolkata"
  });
};

// 1. Daily Cleanup at midnight
createCronTask(
  '0 0 * * *',
  'Daily Refresh Token Cleanup',
  (database) => {
    // Running as two separate queries is safer than enabling multi-statement support.
    const query1 = 'DELETE FROM user_refresh_tokens WHERE expires_at < NOW();';
    const query2 = 'DELETE FROM staff_refresh_tokens WHERE expires_at < NOW();';
    return Promise.all([
      database.query(query1),
      database.query(query2)
    ]);
  }
);

// 2. OTP Request Cleanup every 15 minutes
createCronTask(
  '*/15 * * * *',
  'Expired OTP Request Cleanup',
  (database) => {
    const query = 'DELETE FROM otp_requests WHERE expires_at < NOW();';
    return database.query(query);
  }
);

console.log('[CRON] All cron jobs have been scheduled.');