---
created: 2026-03-22T05:00:31.204Z
title: Add server deployment update script
area: tooling
files: []
---

## Problem

There is no automated deployment script for the server. When code is pushed to git, the server update process (git pull, rebuild container, bring it up, etc.) must be done manually. This is error-prone and slows down the deploy cycle.

## Solution

Create a deployment script (e.g. `scripts/deploy.sh` or similar) that runs on the server and handles:
- `git pull` to fetch latest changes
- Rebuild the Docker container (`docker compose build` or equivalent)
- Bring up the updated container (`docker compose up -d`)
- Optional: health check to verify the new deployment is running
- Optional: rollback mechanism if health check fails
