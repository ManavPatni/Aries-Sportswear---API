#!/bin/bash

LOG_FILE="/home/ariesspo/api/deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
PID_FILE="/home/ariesspo/api/app.pid"
NODE_BIN="/home/ariesspo/nodevenv/api/18/bin/node"
APP_ENTRY="app.js"

log_failure() {
    echo "[$TIMESTAMP] ERROR: $1" >> "$LOG_FILE"
    echo "$1"
}

echo "Navigating to project directory..."
cd /home/ariesspo/api || {
    log_failure "Failed to navigate to project directory"
    exit 1
}

echo "Resetting local changes..."
git reset --hard || {
    log_failure "Git reset failed"
    exit 1
}

echo "Pulling latest code from GitHub..."
git fetch origin || {
    log_failure "Git fetch failed"
    exit 1
}
git checkout master || {
    log_failure "Git checkout master failed"
    exit 1
}
git pull origin master || {
    log_failure "Git pull failed"
    exit 1
}

# echo "Installing Node dependencies..."
# /home/ariesspo/nodevenv/api/18/bin/npm install --production || {
#     log_failure "npm install failed"
#     exit 1
# }

# if [ -f "composer.json" ]; then
#     echo "Installing PHP dependencies..."
#     composer install --no-dev --optimize-autoloader || {
#         log_failure "composer install failed"
#         exit 1
#     }
# fi

# echo "Setting up database..."
# php /home/ariesspo/api/db/setup_database.php 2>> "$LOG_FILE" || {
#     log_failure "Database setup failed"
#     exit 1
# }

# # Kill old process
# if [ -f "$PID_FILE" ]; then
#     OLD_PID=$(cat "$PID_FILE")
#     echo "Killing old Node.js process ($OLD_PID)..."
#     kill "$OLD_PID" 2>/dev/null || echo "No running process found"
# fi

# # Start new Node.js process
# echo "Starting new Node.js app..."
# nohup "$NODE_BIN" "$APP_ENTRY" > out.log 2>&1 & echo $! > "$PID_FILE" || {
#     log_failure "Failed to start Node.js app"
#     exit 1
# }

echo "Deployment Completed Successfully"