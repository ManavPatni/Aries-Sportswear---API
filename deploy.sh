#!/bin/bash

# Deployment script with failure-only logging
LOG_FILE="/home/ariesspo/api/deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Function to log failures
log_failure() {
    echo "[$TIMESTAMP] ERROR: $1" >> "$LOG_FILE"
    echo "$1"
}

# Navigate to project directory
echo "Navigating to project directory..."
cd /home/ariesspo/api || {
    log_failure "Failed to navigate to project directory"
    exit 1
}

# Ensure git is clean
echo "Resetting local changes..."
git reset --hard || {
    log_failure "Git reset failed"
    exit 1
}

# Pull latest changes from main
echo "Pulling latest code from GitHub..."
git fetch origin || {
    log_failure "Git fetch failed"
    exit 1
}
git checkout main || {
    log_failure "Git checkout main failed"
    exit 1
}
git pull origin main || {
    log_failure "Git pull failed"
    exit 1
}

# Install Node.js dependencies
echo "Installing Node dependencies..."
npm install --production || {
    log_failure "npm install failed"
    exit 1
}

# Install PHP dependencies if composer.json exists
if [ -f "composer.json" ]; then
    echo "Installing PHP dependencies..."
    composer install --no-dev --optimize-autoloader || {
        log_failure "composer install failed"
        exit 1
    }
fi

# Restart application with PM2
echo "Restarting application with PM2..."
pm2 restart all || {
    log_failure "PM2 restart failed"
    exit 1
}

echo "Deployment Completed Successfully"