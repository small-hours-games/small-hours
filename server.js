'use strict';

require('dotenv').config();

const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const helmet = require('helmet');

const { fetchCategories } = require('./questions');
const { downloadDatabase, getState: getDbState, dbStatus } = require('./local-db');
const { rooms, generateRoomCode, createRoom, buildLobbyState } = require('./server/rooms');
const { broadcastAll, broadcastToDisplays, sendTo, broadcastLobbyUpdate, broadcastVoteUpdate } = require('./server/broadcast');
const { handleMessage, handlePlayerDisconnect, maybeCleanupRoom } = require('./server/handlers');
const Persistence = require('./server/persistence');

// ─── Load game modules ──────────────────────────────────────────────────────
const spyGame = require('./games/spy/server');

const PORT = process.env.PORT || 3000;

// Load TLS cert if available (enables HTTPS for iOS Safari compatibility)
const CERT_PATH = path.join(__dirname, 'certs', 'cert.pem');
const KEY_PATH  = path.join(__dirname, 'certs', 'key.pem');
const USE_HTTPS = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);

// ─── Detect local LAN IP ────────────────────────────────────────────────────

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const HOST_IP = getLocalIP();
const SCHEME = USE_HTTPS ? 'https' : 'http';

const DOMAIN = process.env.DOMAIN ? process.env.DOMAIN.trim() : null;
const PUBLIC_HOST = DOMAIN || `${HOST_IP}:${PORT}`;
const PUBLIC_SCHEME = DOMAIN ? 'https' : SCHEME;

// ─── Express app ────────────────────────────────────────────────────────────

const app = express();
// Add security headers (disable CSP since game uses inline scripts)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// ─── Request logging middleware ────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ─── Simple in-memory rate limiter ──────────────────────────────────────────

const rateLimitMap = new Map();
function rateLimit(maxReq, windowMs) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    rateLimitMap.set(key, entry);
    if (entry.count > maxReq) {
      return res.status(429).send('Too Many Requests');
    }
    next();
  };
}
// Periodic cleanup to prevent memory leak from abandoned IPs
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.start > 120_000) rateLimitMap.delete(key);
  }
}, 60_000);
const pageRateLimit = rateLimit(120, 60 * 1000);
const apiRateLimit = rateLimit(30, 60 * 1000);  // Stricter for API endpoints
const dbDownloadLimit = rateLimit(2, 60 * 60 * 1000);  // Max 2 downloads per hour per IP

// ─── New routes (before static) ─────────────────────────────────────────────

function serveFile(rel) {
  return (_req, res) => res.sendFile(path.join(__dirname, rel));
}

app.get('/group/:code',          pageRateLimit, serveFile('public/group/index.html'));
app.get('/group/:code/display',  pageRateLimit, serveFile('public/group/display.html'));
app.get('/group/:code/quiz',     pageRateLimit, serveFile('public/games/quiz/index.html'));
app.get('/group/:code/shithead', pageRateLimit, serveFile('public/games/shithead/index.html'));
app.get('/group/:code/cah',      pageRateLimit, serveFile('public/games/cah/index.html'));
app.get('/group/:code/spy',      pageRateLimit, serveFile('games/spy/public/index.html'));
app.get('/group/:code/spy/display', pageRateLimit, serveFile('games/spy/public/display.html'));
app.get('/group/:code/lyrics',   pageRateLimit, serveFile('games/lyrics/public/index.html'));
app.get('/rules',                pageRateLimit, serveFile('public/rules.html'));

// Compat redirects
app.get('/host/', (req, res) => res.redirect('/'));
app.get('/host',  (req, res) => res.redirect('/'));
app.get('/join',  (req, res) => {
  const r = (req.query.room || '').toUpperCase();
  res.redirect(r ? `/group/${r}` : '/');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: rooms.size,
    timestamp: Date.now()
  });
});

// Room API
app.post('/api/rooms', apiRateLimit, (req, res) => {
  const code = generateRoomCode();
  createRoom(code);
  res.json({ code });
});

app.get('/api/rooms/:code', apiRateLimit, (req, res) => {
  res.json({ exists: rooms.has(req.params.code.toUpperCase()) });
});

// Game-specific public files
app.use('/games/spy', express.static(path.join(__dirname, 'games/spy/public')));
app.use('/games/lyrics', express.static(path.join(__dirname, 'games/lyrics/public')));

// Static files (serves public/index.html for /, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// QR code endpoint — encodes /group/:code URL
app.get('/api/qr', async (req, res) => {
  try {
    const roomCode = req.query.room;
    const joinUrl = roomCode
      ? `${PUBLIC_SCHEME}://${PUBLIC_HOST}/group/${roomCode}`
      : `${PUBLIC_SCHEME}://${PUBLIC_HOST}`;
    const svg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

// Donate QR code (Swish)
app.get('/api/donate-qr', async (req, res) => {
  try {
    const swishUrl = JSON.stringify({ version: 1, payee: { value: '0732671231', editable: false }, amount: { editable: true }, message: { value: 'Game Night', editable: true } });
    const svg = await QRCode.toString(`swish://payment?data=${encodeURIComponent(swishUrl)}`, {
      type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

// Categories endpoint
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await fetchCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Local DB status
app.get('/api/db/status', (req, res) => {
  const dl = getDbState();
  res.json({ ...dbStatus(), downloading: dl.active, dlProgress: dl.current, dlTotal: dl.total, dlLabel: dl.label, dlError: dl.error });
});

// Trigger download (non-blocking) - rate limited to prevent DoS
app.post('/api/db/download', dbDownloadLimit, (req, res) => {
  const dl = getDbState();
  if (dl.active) return res.json({ ok: false, message: 'Already downloading.' });
  downloadDatabase().catch(console.error);
  res.json({ ok: true, message: 'Download started.' });
});

// Stats and leaderboard endpoints
app.get('/api/stats', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const leaderboard = Persistence.getLeaderboard(limit);
  res.json({ leaderboard });
});

app.get('/api/stats/:username', (req, res) => {
  const stats = Persistence.getPlayerStats(req.params.username);
  if (!stats) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json(stats);
});

app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const games = Persistence.getRecentGames(limit);
  res.json({ games });
});

// Register game-specific API routes
for (const [path, handler] of Object.entries(spyGame.routes)) {
  app.get(path, (req, res) => {
    const roomCode = req.params.code || req.query.room;
    handler(req, res, roomCode);
  });
}

// ─── HTTPS or HTTP server ────────────────────────────────────────────────────

const server = USE_HTTPS
  ? https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
  : http.createServer(app);

// WebSocket server with security limits
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16384  // 16KB max per message - prevents oversized frame attacks
});

// Per-socket message rate limiting
const socketLimits = new WeakMap();
function checkSocketRateLimit(ws) {
  const now = Date.now();
  let limit = socketLimits.get(ws);
  if (!limit || now >= limit.resetTime) {
    limit = { count: 0, resetTime: now + 1000 };
  }
  limit.count++;
  socketLimits.set(ws, limit);
  return limit.count <= 30;  // Max 30 messages per second
}

// Room cleanup: expire rooms older than 4 hours with no activity
const ROOM_MAX_AGE_MS = 4 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_MAX_AGE_MS && room.playerSockets.size === 0 && room.displaySockets.size === 0) {
      console.log(`Cleaning up abandoned room ${code}`);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);  // Check every 5 minutes

server.on('upgrade', (req, socket, head) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else if (p === '/ws/host') {
    // Compat: old host page → display role
    req._compatRole = 'display';
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else if (p === '/ws/player') {
    // Compat: old player page → player role
    req._compatRole = 'player';
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// ─── WebSocket connection handler ────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const url      = new URL(req.url, 'http://localhost');
  // Role comes from query param (?role=player|display) or compat shim
  const compatRole = req._compatRole || null;
  const role = compatRole || url.searchParams.get('role') || 'player';
  const isDisplay = role === 'display';
  const isPlayer  = role === 'player';

  let roomCode = (url.searchParams.get('room') || '').toUpperCase() || null;

  // ── Display (TV) connection ───────────────────────────────────────────────
  if (isDisplay) {
    if (!roomCode || !rooms.has(roomCode)) {
      // Compat: old host page creates room if none
      if (compatRole === 'display') {
        if (!roomCode || !rooms.has(roomCode)) {
          roomCode = generateRoomCode();
          createRoom(roomCode);
        }
      } else {
        sendTo(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
        ws.close();
        return;
      }
    }
    const room = rooms.get(roomCode);
    room.displaySockets.add(ws);

    const lobbyState = buildLobbyState(room);
    sendTo(ws, { type: 'DISPLAY_OK', roomCode, state: lobbyState });
    // Compat for old host page
    sendTo(ws, { type: 'HOST_CONNECTED', roomCode, playerCount: room.players.size });
    if (room.players.size > 0) broadcastVoteUpdate(room);

    ws.on('message', (raw) => {
      // Rate limit: check message frequency per socket
      if (!checkSocketRateLimit(ws)) {
        console.warn(`Rate limit exceeded on display socket`);
        ws.close(1008, 'Rate limited');
        return;
      }
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      handleMessage(ws, 'display', msg, room);
    });

    ws.on('close', () => {
      room.displaySockets.delete(ws);
      maybeCleanupRoom(room);
    });

    ws.on('error', (err) => console.error('Display WS error:', err.message));
    return;
  }

  // ── Player connection ─────────────────────────────────────────────────────
  if (isPlayer) {
    if (!roomCode || !rooms.has(roomCode)) {
      sendTo(ws, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found. Check the room code.' });
      ws.close();
      return;
    }
    const room = rooms.get(roomCode);
    room.playerSockets.add(ws);
    sendTo(ws, { type: 'CONNECTED', lang: room.language });

    ws.on('message', (raw) => {
      // Rate limit: check message frequency per socket
      if (!checkSocketRateLimit(ws)) {
        console.warn(`Rate limit exceeded on player socket`);
        ws.close(1008, 'Rate limited');
        return;
      }
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      handleMessage(ws, 'player', msg, room);
    });

    ws.on('close', () => {
      room.playerSockets.delete(ws);
      handlePlayerDisconnect(ws, room);
    });

    ws.on('error', (err) => console.error('Player WS error:', err.message));
    return;
  }

  ws.close(4000, 'Invalid role');
});

// ─── Game Tick Loop (pull-based state broadcasting) ────────────────────────────
// For QuizController and other pull-based game controllers:
// - Call game.tick() to update internal state
// - Call game.getState() to pull complete state
// - Broadcast state to all players and displays
setInterval(() => {
  for (const [code, room] of rooms) {
    // Tick and broadcast quiz games
    if (room.game && room.activeMiniGame === 'quiz') {
      room.game.tick();
      const gameState = room.game.getState();
      const stateMsg = JSON.stringify({ type: 'GAME_STATE', ...gameState });
      for (const ws of room.playerSockets) {
        if (ws.readyState === 1) ws.send(stateMsg);
      }
      for (const ws of room.displaySockets) {
        if (ws.readyState === 1) ws.send(stateMsg);
      }
    }
    // Tick and broadcast shithead games
    if (room.shitheadGame && room.activeMiniGame === 'shithead') {
      room.shitheadGame.tick();
      const gameState = room.shitheadGame.getState();
      const stateMsg = JSON.stringify({ type: 'GAME_STATE', ...gameState });
      for (const ws of room.playerSockets) {
        if (ws.readyState === 1) ws.send(stateMsg);
      }
      for (const ws of room.displaySockets) {
        if (ws.readyState === 1) ws.send(stateMsg);
      }
    }
  }
}, 100);  // Tick every ~100ms

// ─── Start server ─────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎮 Game Night server running!\n');
  console.log(`  Landing page: ${PUBLIC_SCHEME}://${PUBLIC_HOST}/`);
  console.log(`  Join a room:  ${PUBLIC_SCHEME}://${PUBLIC_HOST}/group/XXXX\n`);
  if (USE_HTTPS) {
    console.log('  ⚠️  First visit: Safari will warn about the self-signed cert.');
    console.log('     Tap "Show Details" → "visit this website" → confirm.\n');
  }
});

// ─── Graceful shutdown ──────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received - initiating graceful shutdown...');

  // Notify all connected WebSocket clients
  for (const [code, room] of rooms) {
    const msg = JSON.stringify({ type: 'SERVER_RESTARTING', message: 'Server is restarting. Please wait...' });
    room.playerSockets.forEach(ws => {
      try { ws.send(msg); } catch (err) { /* socket may be closing */ }
    });
    room.displaySockets.forEach(ws => {
      try { ws.send(msg); } catch (err) { /* socket may be closing */ }
    });
  }

  // Stop accepting new connections
  server.close(() => {
    console.log('✓ Server closed. Exiting.\n');
    process.exit(0);
  });

  // Hard exit after 5 seconds if graceful close doesn't complete
  setTimeout(() => {
    console.log('✗ Graceful shutdown timeout - force exiting\n');
    process.exit(1);
  }, 5000);
});

// ─── Error handling ────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, but log it
});
