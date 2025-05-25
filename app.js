require('dotenv').config();
const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const staffRoutes = require('./routes/staffRoutes');
const productRoutes = require('./routes/productRoutes');
const cron = require('./cron/cronJobs');
const db = require('./db/database');

const app = express();

// port from environment variables or default to 3000
const PORT = process.env.PORT || 3000;

// allowed origins
const allowedOrigins = [
  'http://127.0.0.1:8000', // Local development
  'http://localhost:8000',  // Alternative local development
  'https://ariessportswear.com', // Production
  'https://admin.ariessportswear.com' // Admin subdomain
];

// Middleware to parse JSON request bodies
app.use(express.json());

//Configure CORS
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true
}));

// Routes
app.use('/', productRoutes);
app.use('/user', userRoutes);
app.use('/staff', staffRoutes);

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