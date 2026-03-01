#!/bin/bash
# Rebuild script for both services to apply fixes
echo "Rebuilding Backend (Stat Logic)..."
docker-compose up -d --build backend

echo "Rebuilding Frontend (UI Rename)..."
docker-compose up -d --build frontend
