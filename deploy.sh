#!/bin/bash
# Simple deployment script for Data Analyzer
# Run this on your home lab server after pushing code

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Deploying Data Analyzer..."
echo "Directory: $(pwd)"

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Build and restart the container
echo "Rebuilding containers..."
docker compose down
docker compose build --no-cache
docker compose up -d

echo ""
echo "Deployment complete!"
docker compose ps
