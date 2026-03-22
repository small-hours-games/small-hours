#!/usr/bin/env bash
git pull
node scripts/seed-questions.js
docker compose up --build -d
