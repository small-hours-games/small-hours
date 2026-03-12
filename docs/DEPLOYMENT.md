# Deployment Pipeline: Version Handling & Docker Registry Publishing

## Overview

The CI/CD pipeline automates version management, Docker image publishing, and server deployment:

```
push to main
    ↓
[test]            npm ci + npm test (gates before anything else)
    ↓ on success
[build-and-push]  auto-bump patch version → publish to ghcr.io
    ↓ on success
[deploy]          pull image → docker run (no local build needed)
```

---

## Architecture Changes

| Aspect | Before | After |
|--------|--------|-------|
| Tests in CI | ✗ Never | ✓ Always (gates deployment) |
| Versioning | Frozen at 1.0.0 | Auto-bumped on every push |
| Docker build | On server (local) | In CI (ghcr.io registry) |
| Deploy method | `git pull && docker restart` | `docker pull && docker run` |
| Source on server | Bind-mounted from disk | Baked into image |
| Server needs git | ✓ Yes | ✗ No |

---

## One-Time Server Setup

**Before the first deployment pipeline run**, SSH to the server and prepare directories:

```bash
ssh root@10.10.0.21  # or your server IP

# Create data/certs directories
mkdir -p /opt/small-hours/data /opt/small-hours/certs

# Create empty .env if not present (for optional env vars)
touch /opt/small-hours/.env

# Stop the old compose-managed container
cd /opt/small-hours
docker compose down

# If the repo is private, authenticate with GitHub Packages:
# echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

**Note:** The pipeline will never need to `git pull` again — the image contains the full source baked in.

---

## GitHub Repo Settings (one-time)

→ Repo **Settings → Actions → General → Workflow permissions**
→ Select **"Read and write permissions"**

This allows `GITHUB_TOKEN` to:
- Push version bump commits back to `main`
- Publish images to `ghcr.io`

---

## Pipeline Jobs

### Job 1: Unit Tests
- Runs `npm ci` and `npm test` (all 45 unit tests must pass)
- **Gates the entire pipeline** — if tests fail, no build/deploy
- Caches `node_modules` between runs

### Job 2: Build & Push Image
- Auto-bumps `package.json` version using `npm version patch`
- Commits version bump with `[skip ci]` (prevents re-triggering workflow)
- Builds Docker image and pushes to `ghcr.io`
- Tags with both version number and `latest`
- Uses GitHub Actions cache for multi-stage builds

**Infinite Loop Prevention:**
- `[skip ci]` in commit message → GitHub skips workflow
- Commits made by `GITHUB_TOKEN` don't trigger new runs (GitHub's built-in behavior)

### Job 3: Deploy
- Connects to Tailscale VPN (uses `HEADSCALE_AUTHKEY`)
- SSHs to server and pulls the pre-built image
- Stops/removes the old container
- Starts new container from registry image (no local build)
- Mounts `/opt/small-hours/data` and `/opt/small-hours/certs` as bind mounts
- Waits up to 60s for health check to pass
- Prunes old images (keeps last 3 versions)

---

## How Version Bumping Works

Each push to `main` triggers an automatic patch version bump:

```
1.0.0 → 1.0.1 → 1.0.2 → 1.0.3 ...
```

- Edits `package.json` and `package-lock.json`
- Creates a new commit with message: `chore: bump version to X.Y.Z [skip ci]`
- Pushes the commit back to `main` (no new workflow triggered due to `[skip ci]`)

---

## Verification After First Deployment

```bash
# 1. Check GitHub Actions tab
# All 3 jobs should be green ✓

# 2. Verify version was bumped in the repo
git pull && node -p "require('./package.json').version"
# → 1.0.1 (or higher)

# 3. Check Docker image is in registry
# github.com/small-hours-games/small-hours/packages
# Should see: ghcr.io/small-hours-games/small-hours:1.0.1, :latest

# 4. Verify server is running from registry
ssh root@10.10.0.21 \
  "docker inspect small-hours --format '{{.Config.Image}}'"
# → ghcr.io/small-hours-games/small-hours:1.0.1

# 5. Test server health
curl https://10.10.0.21:3001/health
# → {"ok":true,"uptime":...}

# 6. Verify no source bind mount (only data + certs)
ssh root@10.10.0.21 \
  "docker inspect small-hours --format '{{json .HostConfig.Binds}}'"
# → ["...data",".../certs:ro"] (no source mount)
```

---

## Troubleshooting

### Deploy Fails with "Pull Rate Limit"
- **Cause**: GitHub Packages has stricter rate limits than Docker Hub
- **Fix**: Use a GitHub Personal Access Token with `read:packages` scope
  ```bash
  # On server:
  echo "ghp_xxxx" | docker login ghcr.io -u USERNAME --password-stdin
  ```

### Container Stays "Unhealthy"
- **Check logs**: `docker logs small-hours --tail 50`
- **Common causes**:
  - `/health` endpoint failing (but server.js has it at line 134)
  - Missing `.env` file or invalid env vars
  - Port 3001 in use (for `--network host`)
  - Not enough time for startup (health check starts after 10s)

### Old Images Not Pruned
- Pipeline auto-prunes images older than 3 versions
- Manual cleanup: `docker image prune -a --filter "until=720h"`

### Version Bump Commit Not Appearing
- Check GitHub Actions for the build-and-push job
- Verify `GITHUB_TOKEN` has `contents: write` permission in Actions settings
- Look for any rejected git pushes in the job logs

---

## Rolling Back a Deployment

If a deployed version breaks:

```bash
# 1. Identify the last known-good version
docker images ghcr.io/small-hours-games/small-hours --format '{{.Tag}}'
# → 1.0.5
#    1.0.4
#    1.0.3
#    ...

# 2. Stop and remove current container
docker stop small-hours && docker rm small-hours

# 3. Re-run the deploy job with the previous version
# (Easiest: trigger a new push, or manually re-run the deploy job in GitHub Actions)

# OR manually restart the previous image:
docker run -d \
  --name small-hours \
  --restart unless-stopped \
  --network host \
  --memory 512m \
  --cpus 1.0 \
  --mount type=bind,source=/opt/small-hours/data,target=/app/data \
  --mount type=bind,source=/opt/small-hours/certs,target=/app/certs,readonly \
  ghcr.io/small-hours-games/small-hours:1.0.4  # use previous version
```

---

## Environment Variables

The deploy job looks for `/opt/small-hours/.env` and passes it to the container with `--env-file`. Supported vars:

- `PORT` — Server port (default: 3001)
- `DOMAIN` — Custom domain for QR codes
- `NODE_ENV` — Set to `production` in .env if desired

---

## References

- **Workflow file**: `.github/workflows/deploy.yml`
- **Docker image**: `ghcr.io/small-hours-games/small-hours`
- **Health endpoint**: `server.js` line 134
- **Data persistence**: `/opt/small-hours/data`
- **Cert mount**: `/opt/small-hours/certs` (optional, for HTTPS)
