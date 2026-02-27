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
const { ShitheadGame } = require('./shithead');
const { fetchCategories } = require('./questions');
const { downloadDatabase, getState: getDbState, dbStatus } = require('./local-db');
const { rooms, generateRoomCode, createRoom, buildLobbyState } = require('./server/rooms');
const { broadcastAll, broadcastToDisplays, sendTo, broadcastLobbyUpdate, broadcastVoteUpdate } = require('./server/broadcast');
const { handleMessage, handlePlayerDisconnect, maybeCleanupRoom } = require('./server/handlers');

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
app.use(express.json());

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
const pageRateLimit = rateLimit(120, 60 * 1000);

// ─── New routes (before static) ─────────────────────────────────────────────

function serveFile(rel) {
  return (_req, res) => res.sendFile(path.join(__dirname, rel));
}

app.get('/group/:code',          pageRateLimit, serveFile('public/group/index.html'));
app.get('/group/:code/display',  pageRateLimit, serveFile('public/group/display.html'));
app.get('/group/:code/quiz',     pageRateLimit, serveFile('public/games/quiz/index.html'));
app.get('/group/:code/shithead', pageRateLimit, serveFile('public/games/shithead/index.html'));
app.get('/rules',                pageRateLimit, serveFile('public/rules.html'));
app.get('/shithead/host',        pageRateLimit, serveFile('public/shithead/host/index.html'));
app.get('/shithead/player',      pageRateLimit, serveFile('public/shithead/player/index.html'));

// Compat redirects
app.get('/host/', (req, res) => res.redirect('/'));
app.get('/host',  (req, res) => res.redirect('/'));
app.get('/join',  (req, res) => {
  const r = (req.query.room || '').toUpperCase();
  res.redirect(r ? `/group/${r}` : '/');
});

// Room API
app.post('/api/rooms', (req, res) => {
  const code = generateRoomCode();
  createRoom(code);
  res.json({ code });
});

app.get('/api/rooms/:code', (req, res) => {
  res.json({ exists: rooms.has(req.params.code.toUpperCase()) });
});

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

// Trigger download (non-blocking)
app.post('/api/db/download', (req, res) => {
  const dl = getDbState();
  if (dl.active) return res.json({ ok: false, message: 'Already downloading.' });
  downloadDatabase().catch(console.error);
  res.json({ ok: true, message: 'Download started.' });
});

// ─── HTTPS or HTTP server ────────────────────────────────────────────────────

const server = USE_HTTPS
  ? https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
  : http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

// ─── Shithead standalone game ─────────────────────────────────────────────────

const shitheadWss   = new WebSocketServer({ noServer: true });
const shitheadSocks = new Set();

const shitheadGame  = new ShitheadGame((msg) => {
  const str = JSON.stringify(msg);
  for (const ws of shitheadSocks) {
    if (ws.readyState === 1) ws.send(str);
  }
});

shitheadWss.on('connection', (ws, req) => {
  const isHost = req._shitheadHost === true;
  shitheadSocks.add(ws);

  if (isHost) {
    shitheadGame.hostConnected(ws);
  } else {
    ws.send(JSON.stringify({ type: 'SHITHEAD_CONNECTED' }));
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { type } = msg;

    if (isHost) {
      if (type === 'SHITHEAD_START')   { shitheadGame.startGame(); return; }
      if (type === 'SHITHEAD_RESTART') { shitheadGame.restart();   return; }
    } else {
      if (type === 'SHITHEAD_JOIN')          { shitheadGame.addPlayer(ws, (msg.username || '').trim().slice(0, 20)); return; }
      const u = shitheadGame.usernameByWs(ws);
      if (!u) return;
      if (type === 'SHITHEAD_CONFIRM_SWAP')  { shitheadGame.confirmSwap(u); return; }
      if (type === 'SHITHEAD_SWAP_CARD')     { shitheadGame.swapCard(u, msg.handCardId, msg.faceUpCardId); return; }
      if (type === 'SHITHEAD_PLAY_CARDS')    { if (!Array.isArray(msg.cardIds)) return; shitheadGame.playCards(u, msg.cardIds); return; }
      if (type === 'SHITHEAD_PLAY_FACEDOWN') { shitheadGame.playFaceDown(u, msg.cardId); return; }
      if (type === 'SHITHEAD_PICK_UP_PILE')  { shitheadGame.pickUpPile(u); return; }
    }
  });

  ws.on('close', () => {
    shitheadSocks.delete(ws);
    if (!isHost) shitheadGame.removePlayer(ws);
  });
});

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
  } else if (p === '/ws/shithead-host') {
    req._shitheadHost = true;
    shitheadWss.handleUpgrade(req, socket, head, ws => shitheadWss.emit('connection', ws, req));
  } else if (p === '/ws/shithead-player') {
    shitheadWss.handleUpgrade(req, socket, head, ws => shitheadWss.emit('connection', ws, req));
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
