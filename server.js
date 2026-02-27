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
const { Game } = require('./game');
const { ShitheadGame } = require('./shithead');
const { fetchCategories } = require('./questions');
const { downloadDatabase, getState: getDbState, dbStatus } = require('./local-db');

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

// ─── Room registry ───────────────────────────────────────────────────────────

const rooms = new Map();

const AVATARS = ['🦊','🐸','🐼','🦁','🐯','🦋','🐨','🐧','🦄','🐙',
                 '🦖','🐻','🦀','🦩','🐬','🦝','🦔','🦦','🦜','🐳'];

function nameToAvatar(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATARS[h % AVATARS.length];
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function createRoomBroadcast(roomCode) {
  return (msg, targetWs) => {
    const str = JSON.stringify(msg);
    if (targetWs) {
      if (targetWs.readyState === 1) targetWs.send(str);
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) return;
    for (const ws of [...room.playerSockets, ...room.displaySockets]) {
      if (ws.readyState === 1) ws.send(str);
    }
  };
}

function createRoom(code) {
  const broadcast = createRoomBroadcast(code);
  rooms.set(code, {
    code,
    adminUsername: null,
    activeMiniGame: 'lobby',
    game: null,                        // lazy-created on first JOIN_LOBBY
    playerSockets: new Set(),
    displaySockets: new Set(),
    wsToUsername: new Map(),           // ws → username
    players: new Map(),                // username → { ws, isReady, avatar }
    gameSuggestions: new Map(),        // username → gameType
    readyPlayers: new Set(),
    language: 'en',
    categoryVotes: new Map(),          // username → [catId, ...]
    createdAt: Date.now(),
    _broadcast: broadcast,
  });
  return rooms.get(code);
}

// ─── Lobby helpers ────────────────────────────────────────────────────────────

function buildLobbyState(room) {
  const players = [];
  for (const [username, p] of room.players.entries()) {
    players.push({
      username,
      avatar: p.avatar,
      isReady: room.readyPlayers.has(username),
      isAdmin: username === room.adminUsername,
    });
  }

  // Tally game suggestions
  const gameSuggestions = {};
  for (const gameType of room.gameSuggestions.values()) {
    gameSuggestions[gameType] = (gameSuggestions[gameType] || 0) + 1;
  }

  const readyCount   = room.readyPlayers.size;
  const totalCount   = room.players.size;
  const allReady     = totalCount > 0 && readyCount >= totalCount;

  // Category vote tallying
  const voteTally = {};
  for (const cats of room.categoryVotes.values()) {
    for (const c of cats) voteTally[c] = (voteTally[c] || 0) + 1;
  }
  const allVoted = totalCount > 0 && room.categoryVotes.size >= totalCount;

  return {
    players,
    admin: room.adminUsername,
    gameSuggestions,
    readyCount,
    totalCount,
    allReady,
    allVoted,
    votedCount: room.categoryVotes.size,
    categoryVotes: voteTally,
    votedPlayers: [...room.categoryVotes.keys()],
    activeMiniGame: room.activeMiniGame,
    language: room.language,
  };
}

function broadcastLobbyUpdate(room) {
  broadcastAll(room, { type: 'LOBBY_UPDATE', ...buildLobbyState(room) });
}

function broadcastVoteUpdate(room) {
  // Also emit legacy VOTE_UPDATE for old player/host pages
  const tally = {};
  for (const cats of room.categoryVotes.values()) {
    for (const c of cats) tally[c] = (tally[c] || 0) + 1;
  }
  const totalPlayers = room.players.size;
  const allVoted = totalPlayers > 0 && room.categoryVotes.size >= totalPlayers;
  broadcastAll(room, {
    type: 'VOTE_UPDATE',
    votes: tally,
    voted: [...room.categoryVotes.keys()],
    totalPlayers,
    allVoted,
  });
}

function broadcastAll(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of [...room.playerSockets, ...room.displaySockets]) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function broadcastToDisplays(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of room.displaySockets) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

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

// ─── Disconnect handler ───────────────────────────────────────────────────────

function handlePlayerDisconnect(ws, room) {
  const username = room.wsToUsername.get(ws);
  room.wsToUsername.delete(ws);

  if (!username) {
    maybeCleanupRoom(room);
    return;
  }

  // If the player already reconnected with a new WS (e.g. navigating between
  // pages), ignore this stale close so we don't delete them or hand off admin.
  const currentEntry = room.players.get(username);
  if (currentEntry && currentEntry.ws !== ws) {
    maybeCleanupRoom(room);
    return;
  }

  const wasLobby = room.activeMiniGame === 'lobby';

  if (wasLobby) {
    // During a game→lobby transition players are navigating and will reconnect
    // shortly — skip all deletion and handoff so room.players stays intact.
    if (!room._returningFromGame) {
      room.players.delete(username);
      room.readyPlayers.delete(username);
      room.gameSuggestions.delete(username);
      room.categoryVotes.delete(username);

      // Hand off admin if the admin truly left
      if (username === room.adminUsername) {
        const nextAdmin = [...room.players.keys()][0];
        if (nextAdmin) {
          room.adminUsername = nextAdmin;
          broadcastAll(room, { type: 'ADMIN_CHANGED', newAdmin: nextAdmin });
        }
      }
    }

    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
    broadcastLobbyUpdate(room);
    broadcastVoteUpdate(room);
  } else {
    // In game: null ws, keep score (existing Game behaviour)
    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
  }

  maybeCleanupRoom(room);
}

function maybeCleanupRoom(room) {
  const totalSockets = room.playerSockets.size + room.displaySockets.size;
  const idle = room.activeMiniGame === 'lobby' ||
    (room.game && room.game.state === 'GAME_OVER') ||
    (room.shitheadGame && room.shitheadGame.state === 'GAME_OVER');
  if (totalSockets === 0 && idle) {
    // Grace period: players navigating between pages temporarily have 0 sockets.
    // Wait 30s before deleting so back-to-lobby transitions don't destroy the room.
    clearTimeout(room._cleanupTimer);
    room._cleanupTimer = setTimeout(() => {
      if (room.playerSockets.size + room.displaySockets.size === 0) {
        rooms.delete(room.code);
        console.log(`[Room ${room.code}] Deleted after 30s idle.`);
      }
    }, 30_000);
  } else {
    clearTimeout(room._cleanupTimer);
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

function handleMessage(ws, role, msg, room) {
  const { type } = msg;

  // ── Display (TV / host compat) ───────────────────────────────────────────
  if (role === 'display') {
    switch (type) {
      case 'START_GAME': {
        // Compat: old host page sends START_GAME
        const username = room.adminUsername;
        const totalPlayers = room.players.size;
        if (totalPlayers > 0 && room.categoryVotes.size < totalPlayers) {
          sendTo(ws, { type: 'ERROR', code: 'NOT_ALL_VOTED', message: `Waiting for votes (${room.categoryVotes.size}/${totalPlayers}).` });
          break;
        }
        const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
        const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
        const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
        if (!room.game) room.game = new Game(room._broadcast);
        room.activeMiniGame = 'quiz';
        room.game.startGame(categories, questionCount, gameDifficulty, room.language).catch(console.error);
        break;
      }
      case 'SKIP':
        if (room.game) room.game.skipReveal();
        break;
      case 'RESTART':
        if (room.game) room.game.restart();
        if (room.shitheadGame) { room.shitheadGame = null; }
        room.categoryVotes.clear();
        room.readyPlayers.clear();
        room.gameSuggestions.clear();
        room.activeMiniGame = 'lobby';
        broadcastLobbyUpdate(room);
        break;
      case 'CONTINUE_GAME': {
        const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
        const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
        const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
        if (room.game) room.game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
        break;
      }
      case 'SET_LANGUAGE':
        if (typeof msg.lang === 'string' && /^[a-z]{2}$/.test(msg.lang)) {
          room.language = msg.lang;
          broadcastAll(room, { type: 'LANGUAGE_SET', lang: room.language });
        }
        break;
    }
    return;
  }

  // ── Player messages ───────────────────────────────────────────────────────
  switch (type) {

    case 'JOIN_LOBBY':
    case 'JOIN': {
      // Player reconnected — cancel any pending room cleanup
      clearTimeout(room._cleanupTimer);
      // If the original admin is reconnecting, clear the returning flag
      if ((msg.username || '').trim() === room.adminUsername) {
        room._returningFromGame = false;
      }
      const username = (msg.username || '').trim().slice(0, 20);
      if (!username) {
        sendTo(ws, { type: 'ERROR', code: 'INVALID_USERNAME', message: 'Username required.' });
        break;
      }

      // Assign admin if first player
      if (room.players.size === 0) {
        room.adminUsername = username;
      }

      const avatar = nameToAvatar(username);
      room.players.set(username, { ws, isReady: false, avatar });
      room.wsToUsername.set(ws, username);

      // Lazy-create game instance
      if (!room.game) {
        room.game = new Game(room._broadcast);
      }
      const result = room.game.addPlayer(ws, username);

      const isAdmin = username === room.adminUsername;
      const gameRunning = !!(room.game && room.game.state !== 'LOBBY');
      sendTo(ws, { type: 'JOIN_OK', username, isAdmin, roomCode: room.code, avatar, lang: room.language, gameRunning });

      if (!result.ok) {
        sendTo(ws, { type: 'ERROR', code: result.code, message: result.message });
      }

      // Reconnect to in-progress shithead game (after JOIN_OK so client is ready)
      if (room.activeMiniGame === 'shithead' && room.shitheadGame) {
        room.shitheadGame.addPlayer(ws, username);
      }

      broadcastLobbyUpdate(room);
      broadcastVoteUpdate(room);

      // Legacy PLAYER_JOINED for old host display
      const playerNames = [...room.players.keys()];
      broadcastToDisplays(room, { type: 'PLAYER_JOINED', players: playerNames, playerCount: room.players.size });
      break;
    }

    case 'SET_READY': {
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      if (msg.ready) {
        room.readyPlayers.add(username);
      } else {
        room.readyPlayers.delete(username);
      }
      broadcastLobbyUpdate(room);
      break;
    }

    case 'SUGGEST_GAME': {
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      const gameType = msg.gameType;
      if (!['quiz', 'shithead'].includes(gameType)) break;
      room.gameSuggestions.set(username, gameType);
      broadcastLobbyUpdate(room);
      break;
    }

    case 'START_MINI_GAME': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can start the game.' });
        break;
      }
      const gameType = msg.gameType || 'quiz';
      const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
      const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
      const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';

      if (gameType === 'shithead' && room.players.size < 2) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Shithead requires at least 2 players.' });
        break;
      }

      room.activeMiniGame = gameType;
      broadcastAll(room, { type: 'MINI_GAME_STARTING', gameType, url: `/group/${room.code}/${gameType}` });

      if (gameType === 'quiz') {
        if (!room.game) room.game = new Game(room._broadcast);
        room.game.startGame(categories, questionCount, gameDifficulty, room.language).catch(console.error);
      } else if (gameType === 'shithead') {
        const deckCount = Number.isInteger(msg.deckCount) ? Math.max(1, Math.min(3, msg.deckCount)) : 1;
        room.shitheadGame = new ShitheadGame(room._broadcast);
        for (const [uname, p] of room.players) {
          room.shitheadGame.addPlayer(p.ws, uname);
        }
        room.shitheadGame.startGame(deckCount);
      }
      break;
    }

    case 'REMOVE_PLAYER': {
      const requester = room.wsToUsername.get(ws);
      if (requester !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can remove players.' });
        break;
      }
      const target = msg.username;
      const targetPlayer = room.players.get(target);
      if (targetPlayer && targetPlayer.ws) {
        sendTo(targetPlayer.ws, { type: 'PLAYER_REMOVED', username: target });
        targetPlayer.ws.close();
      }
      break;
    }

    case 'RETURN_TO_LOBBY':
    case 'RESTART': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can return to lobby.' });
        break;
      }
      if (room.game) room.game.restart();
      if (room.shitheadGame) { room.shitheadGame = null; }
      room.categoryVotes.clear();
      room.readyPlayers.clear();
      room.gameSuggestions.clear();
      room.activeMiniGame = 'lobby';
      // Flag: suppress admin handoff while players navigate back to lobby
      room._returningFromGame = true;
      broadcastLobbyUpdate(room);
      // Legacy RESTARTED for old player page
      broadcastAll(room, { type: 'RESTARTED' });
      break;
    }

    case 'CATEGORY_VOTE': {
      if (room.activeMiniGame !== 'lobby') break;
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      const cats = Array.isArray(msg.categories)
        ? msg.categories.slice(0, 3).map(Number).filter(n => Number.isInteger(n) && n > 0)
        : [];
      if (cats.length === 0) break;
      room.categoryVotes.set(username, cats);
      broadcastLobbyUpdate(room);
      broadcastVoteUpdate(room);
      break;
    }

    case 'ANSWER':
      if (room.game) room.game.receiveAnswer(ws, msg.questionId, msg.answerId);
      break;

    case 'SKIP': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      if (room.game) room.game.skipReveal();
      break;
    }

    case 'CONTINUE_GAME': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
      const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
      const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
      if (room.game) room.game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
      break;
    }

    case 'SET_LANGUAGE': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      if (typeof msg.lang === 'string' && /^[a-z]{2}$/.test(msg.lang)) {
        room.language = msg.lang;
        broadcastAll(room, { type: 'LANGUAGE_SET', lang: room.language });
      }
      break;
    }

    case 'SHITHEAD_CONFIRM_SWAP': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame) break;
      room.shitheadGame.confirmSwap(username);
      break;
    }

    case 'SHITHEAD_SWAP_CARD': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame) break;
      room.shitheadGame.swapCard(username, msg.handCardId, msg.faceUpCardId);
      break;
    }

    case 'SHITHEAD_PLAY_CARDS': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame || !Array.isArray(msg.cardIds)) break;
      room.shitheadGame.playCards(username, msg.cardIds);
      break;
    }

    case 'SHITHEAD_PLAY_FACEDOWN': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame) break;
      room.shitheadGame.playFaceDown(username, msg.cardId);
      break;
    }

    case 'SHITHEAD_PICK_UP_PILE': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame) break;
      room.shitheadGame.pickUpPile(username);
      break;
    }
  }
}

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
