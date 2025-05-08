require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const cron = require('node-cron');
const db = require('./config/database');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Mount authentication routes
app.use('/auth', authRoutes);

// Schedule a daily cron job to clean up expired refresh tokens
cron.schedule('0 0 * * *', async () => {
  try {
    await db.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    console.log('Expired tokens cleaned up');
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
  }
});

// Define the port from environment variables or default to 3000
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'OK',
    code: 200,
    message: 'pong'
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