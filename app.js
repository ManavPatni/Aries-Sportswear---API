require('dotenv').config();
const express = require('express');
const userRoutes = require('./routes/userRoutes');
const staffRoutes = require('./routes/staffRoutes');
const cron = require('node-cron');
const db = require('./db/database');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Mount authentication routes
app.use('/user', userRoutes);
app.use('/staff', staffRoutes);

// Schedule a daily cron job to clean up database
cron.schedule('0 0 * * *', async () => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const query = `
      DELETE FROM user_refresh_tokens WHERE expires_at < NOW();
      DELETE FROM staff_refresh_tokens WHERE expires_at < NOW();
      DELETE FROM verification_requests WHERE expires_at < NOW() OR verified = 1;
    `;

    await client.query(query);

    await client.query('COMMIT');
    console.log('Database cleaned up');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cleaning up Database:', error);
  } finally {
    client.release();
  }
});


// Define the port from environment variables or default to 3000
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'OK',
    code: 200
  });
});

// Custom 404 handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    code: 404,
    message: 'Requested resource not found'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});