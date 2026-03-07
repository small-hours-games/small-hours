# Migration Checklist & Implementation Guides

Quick reference for executing each upgrade step-by-step.

---

## 1. Immediate: ws Security Update (Q1 2026)

### Step 1: Update dependency
```bash
npm install ws@^8.19.0 --save
npm audit fix  # Fix any other vulnerabilities
```

### Step 2: Verify compatibility
```bash
npm test                           # Run unit tests
node tests/fullgame.mjs           # Run E2E game flow
node tests/continue.mjs           # Run multi-round test
node tests/restart.mjs            # Run restart flow
```

### Step 3: Deploy
```bash
git add package*.json
git commit -m "chore: upgrade ws to v8.19.0 (security fix)"
git push origin main               # Triggers auto-deploy via GitHub Actions
```

### Expected Outcome
- All tests pass
- No behavior changes
- WebSocket connections stable under load
- **Time**: 30 minutes

---

## 2. Docker Security Hardening (Q1 2026)

### Step 1: Backup current Dockerfile
```bash
cp Dockerfile Dockerfile.backup
```

### Step 2: Replace Dockerfile with hardened version

**Current** (`Dockerfile`):
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
```

**New** (`Dockerfile`):
```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage
FROM node:22-alpine
WORKDIR /app

# Create non-root user and group
RUN addgroup -g 1000 appgroup && \
    adduser -D -u 1000 -G appgroup appuser

# Copy built dependencies
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .

# Create data directory with correct permissions
RUN mkdir -p /app/data && chown -R appuser:appgroup /app/data

# Switch to non-root user
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http'); http.get('http://localhost:3000/api/db/status', (r)=>process.exit(r.statusCode===200?0:1))"

CMD ["node", "server.js"]
```

### Step 3: Rebuild and test
```bash
docker compose down
docker compose up --build          # Rebuild image with multi-stage
# Wait 5 seconds for startup
curl http://localhost:3000         # Verify server responsive
```

### Step 4: Verify file permissions in container
```bash
docker compose exec quiz ls -la /app/node_modules | head
# Expected: All files owned by appuser (1000:1000)

docker compose exec quiz whoami
# Expected output: appuser
```

### Step 5: Run full test suite
```bash
docker compose exec quiz npm test
docker compose exec quiz npm run coverage  # Optional: coverage report
```

### Step 6: Commit changes
```bash
git add Dockerfile
git commit -m "chore: harden Dockerfile with multi-stage build and non-root user"
git push origin main
```

### Expected Outcome
- Image size: ~50MB smaller (due to multi-stage)
- All tests pass
- Health check endpoint responsive
- No behavioral changes
- **Time**: 1–2 hours

---

## 3. Node.js v24 Upgrade (Q4 2026)

### Prerequisites
- Node.js v24 LTS released and stable (expected Oct 2025, now stable by Q4 2026)
- All tests passing on current version
- package.json requires "node": ">=22"

### Step 1: Update Dockerfile
```dockerfile
# Change line 1 from:
# FROM node:22-alpine
# To:
FROM node:24-alpine
```

### Step 2: Update package.json engines field
```json
{
  "engines": {
    "node": ">=24"  // Changed from >=20 or >=22
  }
}
```

### Step 3: Rebuild and test locally
```bash
docker compose down
docker compose up --build          # Rebuilds with Node 24
npm test                           # Run tests in container
node tests/fullgame.mjs            # E2E test
```

### Step 4: Check for deprecated API usage
```bash
# In server.js, game.js, etc., search for v20-deprecated APIs
grep -r "deprecated\|removed in v2" . --include="*.js"
# Expected: No matches (we're current)
```

### Step 5: Review Buffer performance gains
```bash
# Optional: Benchmark buffer operations
node -e "
const b1 = Buffer.alloc(1000);
const b2 = Buffer.alloc(1000);
const start = Date.now();
for(let i=0; i<100000; i++) Buffer.compare(b1, b2);
console.log('Time:', Date.now() - start, 'ms');
"
```

### Step 6: Update CI/CD pipeline (if needed)
```yaml
# .github/workflows/deploy.yml
# Ensure Node.js version is set to 24 in setup action
- uses: actions/setup-node@v4
  with:
    node-version: '24'
```

### Step 7: Commit and deploy
```bash
git add Dockerfile package.json .github/
git commit -m "chore: upgrade to Node.js v24 LTS"
git push origin main
```

### Step 8: Verify in production
```bash
ssh root@10.10.0.21
docker exec quiz-trivia-quiz-1 node --version
# Expected: v24.x.x
```

### Expected Outcome
- All tests pass on v24
- Performance improvements in buffer operations (not critical for this app)
- Extended support window (v24 LTS until April 2028)
- **Time**: 2–3 hours
- **Risk**: Minimal (pure upgrade path)

---

## 4. Express 5.0 Migration (Q4 2026 or later, TypeScript only)

### Prerequisites
- Node.js v24+ running
- TypeScript adoption planned or underway
- All tests passing on current version
- **DO NOT DO THIS** unless adopting TypeScript or fixing Express-specific issue

### Step 1: Check compatibility
```bash
# Scan code for deprecated Express patterns
grep -r "app\.del\|router\.param\(fn\)\|req\.param\(" . --include="*.js"
# Expected: Zero matches (code is compatible)
```

### Step 2: Backup package.json
```bash
cp package.json package.json.backup
```

### Step 3: Upgrade Express
```bash
npm install express@^5.0.0 --save
npm audit fix  # Fix any new vulnerabilities
```

### Step 4: Review breaking changes in your codebase

**Check these patterns**:
```javascript
// ❌ REMOVED in v5 (won't work):
app.del() → app.delete()  // Search: app\.del\(
router.param(fn) → middleware function  // Search: router\.param\(.*function

// ❌ REMOVED in v5:
req.param('name') → req.params.name  // Search: req\.param\(

// ⚠️ CHANGED default in v5:
app.use(express.urlencoded({extended: true}))
// v5 default is {extended: false}, may need explicit {extended: true}
```

### Step 5: Update code if needed

**If query parser needed**:
```javascript
// In server.js, ensure parser config matches expectations
app.use(express.urlencoded({extended: true}));  // Explicit if needed
```

### Step 6: Update type definitions (if using TypeScript)
```bash
npm install --save-dev @types/express@^5.0.0
```

### Step 7: Run full test suite
```bash
npm test
npm run coverage
node tests/fullgame.mjs
node tests/continue.mjs
```

### Step 8: Commit and test
```bash
git add package*.json
git commit -m "chore: upgrade to Express 5.0 (TypeScript support)"
git push origin main -u
# Create PR for code review
```

### Expected Outcome
- All tests pass
- No breaking changes detected in current code
- Better async error handling (automatic promise rejection wrapping)
- **Time**: 1–2 hours
- **Risk**: Very Low (no code changes needed)

---

## 5. Database Addition: SQLite (Q3 2026, optional)

### Prerequisites
- Leaderboard features planned
- Schema designed and approved
- Node.js v20+ running (built-in sqlite support)

### Step 1: Install SQLite (if not using Node built-in)
```bash
npm install sqlite3 --save  # Or better-sqlite3 for synchronous
# Or use Node.js built-in:
# const { DatabaseSync } = require('node:sqlite');
```

### Step 2: Create schema file

**File**: `db/schema.sql`
```sql
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roomCode TEXT NOT NULL,
  gameType TEXT NOT NULL DEFAULT 'quiz',
  playedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  durationSec INTEGER,
  questionCount INTEGER
);

CREATE TABLE IF NOT EXISTS player_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gameId INTEGER NOT NULL,
  username TEXT NOT NULL,
  finalScore INTEGER,
  rank INTEGER,
  FOREIGN KEY (gameId) REFERENCES games(id)
);

CREATE INDEX IF NOT EXISTS idx_games_roomCode ON games(roomCode);
CREATE INDEX IF NOT EXISTS idx_games_playedAt ON games(playedAt);
CREATE INDEX IF NOT EXISTS idx_scores_username ON player_scores(username);
```

### Step 3: Create database initialization module

**File**: `local-db-sqlite.js`
```javascript
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'quiz.db');

let db;

function initDatabase() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), {recursive: true});
  }

  db = new DatabaseSync(DB_PATH);

  // Load and execute schema
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);

  return db;
}

function saveGameResult(roomCode, gameType, durationSec, questionCount, playerScores) {
  const insertGame = db.prepare(`
    INSERT INTO games (roomCode, gameType, durationSec, questionCount)
    VALUES (?, ?, ?, ?)
  `);

  const insertScores = db.prepare(`
    INSERT INTO player_scores (gameId, username, finalScore, rank)
    VALUES (?, ?, ?, ?)
  `);

  const gameInfo = insertGame.run(roomCode, gameType, durationSec, questionCount);
  const gameId = gameInfo.lastInsertRowid;

  playerScores.forEach((score, rank) => {
    insertScores.run(gameId, score.username, score.finalScore, rank + 1);
  });

  return gameId;
}

function getLeaderboard(limit = 100) {
  const results = db.prepare(`
    SELECT username, COUNT(*) as gamesPlayed, AVG(finalScore) as avgScore
    FROM player_scores
    GROUP BY username
    ORDER BY avgScore DESC
    LIMIT ?
  `).all(limit);

  return results;
}

module.exports = {
  initDatabase,
  saveGameResult,
  getLeaderboard,
  getDb: () => db
};
```

### Step 4: Integrate into game logic

**In `server.js`** (on game end):
```javascript
const dbSqlite = require('./local-db-sqlite');

// On GAME_OVER event:
if (msg.type === 'GAME_OVER') {
  const playerScores = Array.from(room.players.values())
    .sort((a, b) => b.score - a.score)
    .map(p => ({username: p.username, finalScore: p.score}));

  dbSqlite.saveGameResult(
    roomCode,
    'quiz',
    (Date.now() - gameStartTime) / 1000,
    questionCount,
    playerScores
  );
}
```

### Step 5: Add API endpoint for leaderboard

**In `server.js`**:
```javascript
app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const leaderboard = dbSqlite.getLeaderboard(limit);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});
```

### Step 6: Write tests

**File**: `local-db-sqlite.test.js`
```javascript
const test = require('node:test');
const assert = require('node:assert');
const dbSqlite = require('./local-db-sqlite');

test('Database initialization', () => {
  dbSqlite.initDatabase();
  const db = dbSqlite.getDb();
  assert.ok(db);
});

test('Save game result', () => {
  const gameId = dbSqlite.saveGameResult(
    'TEST',
    'quiz',
    120,
    10,
    [
      {username: 'Player1', finalScore: 1000},
      {username: 'Player2', finalScore: 800}
    ]
  );
  assert.ok(gameId > 0);
});

test('Get leaderboard', () => {
  const lb = dbSqlite.getLeaderboard(10);
  assert.ok(Array.isArray(lb));
});
```

### Step 7: Run tests
```bash
npm test local-db-sqlite.test.js
```

### Step 8: Commit and deploy
```bash
git add local-db-sqlite.js db/ server.js
git commit -m "feat: add SQLite leaderboard persistence"
git push origin main
```

### Expected Outcome
- Leaderboard functionality working
- Historical game data persisted in SQLite
- Database backed up with data volume
- **Time**: 6–8 hours
- **Risk**: Medium (new dependency, needs testing)

---

## 6. Horizontal Scaling: Nginx + Redis (Q1 2027 or when needed)

### Prerequisites
- 300+ concurrent players typical
- Load balancer infrastructure ready
- Redis instance available (self-hosted or cloud)
- All tests passing

### Step 1: Set up Redis

**Option A: Docker Compose**
```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - backend

volumes:
  redis-data:

networks:
  backend:
    driver: bridge
```

**Option B: Cloud (AWS ElastiCache, Heroku Redis)**
```bash
# Connection string: redis://user:password@host:6379
export REDIS_URL=redis://redis:6379  # Set in .env
```

### Step 2: Install Redis client
```bash
npm install redis --save
```

### Step 3: Create Redis pub/sub module

**File**: `server/redis-adapter.js`
```javascript
const redis = require('redis');
const { broadcastAll } = require('./broadcast');

let pubClient, subClient;

async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  pubClient = redis.createClient({url});
  subClient = redis.createClient({url});

  await pubClient.connect();
  await subClient.connect();

  console.log('[Redis] Connected');
  return {pubClient, subClient};
}

async function subscribeToRoom(roomCode) {
  await subClient.subscribe(`room:${roomCode}`, (msg) => {
    // Message from another server; broadcast locally
    try {
      const data = JSON.parse(msg);
      broadcastAll(roomCode, data);
    } catch (err) {
      console.error('[Redis] Parse error:', err);
    }
  });
}

async function publishMessage(roomCode, message) {
  await pubClient.publish(`room:${roomCode}`, JSON.stringify(message));
}

module.exports = {
  initRedis,
  subscribeToRoom,
  publishMessage
};
```

### Step 4: Update server to use Redis for cross-instance messages

**In `server.js`**:
```javascript
const { initRedis, subscribeToRoom, publishMessage } = require('./server/redis-adapter');

// On startup:
await initRedis();

// When handling messages, republish to Redis:
ws.on('message', async (data) => {
  const msg = JSON.parse(data);

  // Broadcast locally
  broadcastAll(roomCode, msg);

  // Publish to Redis for other instances
  await publishMessage(roomCode, msg);
});
```

### Step 5: Set up Nginx load balancer

**File**: `nginx.conf`
```nginx
upstream quiz_backend {
  # Hash based on IP (sticky sessions)
  hash $remote_addr consistent;

  # Configure your 3 instances
  server quiz-1:3000 max_fails=3 fail_timeout=30s;
  server quiz-2:3000 max_fails=3 fail_timeout=30s;
  server quiz-3:3000 max_fails=3 fail_timeout=30s;
}

server {
  listen 80;
  server_name quiz.aldervall.se;

  location / {
    proxy_pass http://quiz_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

### Step 6: Update docker-compose for multiple instances

```yaml
version: '3.9'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - quiz-1
      - quiz-2
      - quiz-3
    networks:
      - backend

  quiz-1:
    build: .
    environment:
      - INSTANCE_ID=1
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./:/app
      - /app/node_modules
      - ./data:/app/data
    networks:
      - backend

  quiz-2:
    build: .
    environment:
      - INSTANCE_ID=2
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./:/app
      - /app/node_modules
      - ./data:/app/data  # Or per-instance: ./data-2:/app/data
    networks:
      - backend

  quiz-3:
    build: .
    environment:
      - INSTANCE_ID=3
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./:/app
      - /app/node_modules
      - ./data:/app/data  # Or per-instance: ./data-3:/app/data
    networks:
      - backend

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    networks:
      - backend

networks:
  backend:
    driver: bridge

volumes:
  redis-data:
```

### Step 7: Test load balancing

```bash
docker compose down
docker compose up -d

# Generate test load (50 concurrent connections)
npx loadtest -c 50 --rps 10 http://localhost/api/db/status

# Monitor instance distribution
docker compose logs -f quiz-1 | grep "JOIN_LOBBY"
docker compose logs -f quiz-2 | grep "JOIN_LOBBY"
docker compose logs -f quiz-3 | grep "JOIN_LOBBY"
```

### Step 8: Commit and deploy
```bash
git add nginx.conf docker-compose.yml server/redis-adapter.js package.json
git commit -m "feat: add horizontal scaling with Nginx + Redis pub/sub"
git push origin main
```

### Expected Outcome
- 300+ concurrent players supported
- Messages propagated across instances
- No single point of failure (except load balancer)
- **Time**: 6–9 hours
- **Risk**: Medium (complex setup, needs testing)

---

## Rollback Procedures

### Rollback ws update
```bash
npm install ws@8.14.2 --save
git revert <commit-hash>
docker compose down && docker compose up --build
```

### Rollback Docker changes
```bash
git checkout Dockerfile.backup Dockerfile
docker compose down && docker compose up --build
```

### Rollback Node.js upgrade
```bash
# In Dockerfile, change FROM line back to:
# FROM node:22-alpine
git revert <commit-hash>
docker compose down && docker compose up --build
```

---

## Monitoring & Verification

### After each upgrade, verify:

```bash
# Health check
curl http://localhost:3000/api/db/status

# Container logs
docker compose logs quiz -f

# Test connectivity
npm test

# Run E2E tests
node tests/fullgame.mjs
node tests/continue.mjs
node tests/restart.mjs

# Memory usage
docker stats quiz-trivia-quiz-1

# CPU usage
docker top quiz-trivia-quiz-1
```

### Performance baseline (before/after upgrades)

```bash
# Measure request latency
time curl http://localhost:3000/api/db/status

# Measure throughput (small payloads)
npx loadtest -c 10 -r 100 http://localhost:3000

# Measure WebSocket connections
# Create 100 concurrent connections and measure memory:
docker stats quiz-trivia-quiz-1
```

---

## Timeline Summary

| Upgrade | Start | Duration | Effort | Risk |
|---------|-------|----------|--------|------|
| ws v8.19.0 | **Now (Q1)** | 30 min | Low | Minimal |
| Docker hardening | Q1 2026 | 1–2 hrs | Low | Low |
| Node.js v24 | Q4 2026 | 2–3 hrs | Low | Minimal |
| Express 5.0 | Q4 2026+ | <1 hr | Very Low | Very Low |
| SQLite (optional) | Q3 2026 | 6–8 hrs | Medium | Medium |
| Horizontal scaling | Q1 2027 | 6–9 hrs | Medium | Medium |

---

Last updated: March 7, 2026
