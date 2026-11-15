#!/usr/bin/bash
# Usage: ./update.sh            deploy the tag in .env (default: latest)
#        ./update.sh v2.1.0     pin and deploy a specific version (also used for rollback)
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -ge 1 ]; then
  touch .env
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
  else
    echo "IMAGE_TAG=$1" >> .env
  fi
fi

git pull
docker compose pull
docker compose run --rm --no-deps game node scripts/seed-questions.js
docker compose up -d
sleep 5
curl -fsS "http://localhost:${PORT:-3001}/health" && echo
