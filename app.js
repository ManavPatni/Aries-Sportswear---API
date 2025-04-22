require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const cron = require('node-cron');
const db = require('./config/database');

const app = express();
app.use(express.json());

app.use('/auth', authRoutes);

cron.schedule('0 0 * * *', async () => {
  await db.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  console.log('Expired tokens cleaned up');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});