#!/bin/bash

echo "Starting Deployment: $(date)"

# Navigate to your project directory
cd /home/ariesspo/api || {
  echo "Failed to navigate to project directory."
  exit 1
}

# Reset local changes (optional: useful in auto deploys)
echo "Resetting local changes..."
git reset --hard

# Pull latest changes from main
echo "Pulling latest code from GitHub..."
git pull origin main || {
  echo "Git pull failed."
  exit 1
}

# Install Node.js dependencies
echo "Installing Node dependencies..."
npm install --production || {
  echo "npm install failed."
  exit 1
}

# Install PHP dependencies (if using Laravel or Lumen)
if [ -f "composer.json" ]; then
  echo "Installing PHP dependencies..."
  composer install --no-dev --optimize-autoloader || {
    echo "composer install failed."
    exit 1
  }
fi

# Restart your app (adjust if you're using named processes)
echo "Restarting application with PM2..."
pm2 restart all || {
  echo "PM2 restart failed."
  exit 1
}

echo "Deployment Completed Successfully: $(date)"