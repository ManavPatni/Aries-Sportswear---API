#!/bin/bash

echo "Starting Deployment..."

# Navigate to your project directory
cd /home/ariesspo/api || exit

# Pull latest code
git reset --hard
git pull origin main

# Install dependencies
npm install

# Restart the app using pm2
pm2 restart all

echo "Deployment Completed."
