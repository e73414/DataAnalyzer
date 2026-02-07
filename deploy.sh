#!/bin/bash
# Simple deployment script for Data Analyzer
# Run this on your home lab server after pushing code

set -e

echo "🚀 Deploying Data Analyzer..."

# Pull latest changes (if using git)
# git pull origin main

# Build and restart the container
docker compose down
docker compose build --no-cache
docker compose up -d

echo "✅ Deployment complete! App running at http://localhost:8080"
