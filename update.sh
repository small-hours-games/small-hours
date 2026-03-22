#!/usr/bin/bash
git pull
node scripts/seed-questions.js
source .env
export GEMINI_API_KEY=$GEMINI_API_KEY
npm run test >./tests/latest-test-results.txt
docker compose build
docker compose up -d
