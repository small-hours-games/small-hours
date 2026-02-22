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

// If DOMAIN is set in .env, use it for QR codes and printed URLs.
// The server still binds to the local IP — the domain must point here.
const DOMAIN = process.env.DOMAIN ? process.env.DOMAIN.trim() : null;
const PUBLIC_HOST = DOMAIN || `${HOST_IP}:${PORT}`;
const PUBLIC_SCHEME = DOMAIN ? 'https' : SCHEME; // assume domain always uses HTTPS

const PLAYER_URL = `${PUBLIC_SCHEME}://${PUBLIC_HOST}/join`;
const HOST_URL   = `${PUBLIC_SCHEME}://${PUBLIC_HOST}/host/`;

// ─── Express app ────────────────────────────────────────────────────────────

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Root → simple landing page with links to host and player views
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quiz Night</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eaeaea;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:1.5rem;margin:0}
h1{font-size:2.5rem;background:linear-gradient(90deg,#9f44d3,#00c2ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
a{display:block;padding:1rem 2.5rem;border-radius:.75rem;font-size:1.2rem;font-weight:700;text-decoration:none;text-align:center}
.host{background:linear-gradient(135deg,#9f44d3,#4a90d9);color:#fff}
.join{background:linear-gradient(135deg,#26890c,#00c2ff);color:#fff}</style></head>
<body><h1>🎮 Quiz Night</h1>
<a class="host" href="/host/">Host View (TV)</a>
<a class="join" href="/join">Join Game (Phone)</a>
</body></html>`);
});

// Redirect /join → /player/index.html
app.get('/join', (req, res) => {
  res.redirect('/player/index.html');
});

// QR code endpoint (SVG)
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(PLAYER_URL, { type: 'svg', margin: 1 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

// Donate QR code (Swish +46 73 267 12 31)
app.get('/api/donate-qr', async (req, res) => {
  try {
    const swishUrl = JSON.stringify({ version: 1, payee: { value: '0732671231', editable: false }, amount: { editable: true }, message: { value: 'Quiz Night', editable: true } });
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
  downloadDatabase().catch(console.error); // runs in background
  res.json({ ok: true, message: 'Download started.' });
});

// ─── HTTPS or HTTP server ────────────────────────────────────────────────────

const server = USE_HTTPS
  ? https.createServer({ cert: fs.readFileSync(CERT_PATH), key: fs.readFileSync(KEY_PATH) }, app)
  : http.createServer(app);
// No path filter — req.url routing is done inside the connection handler
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/host' || req.url === '/ws/player') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ─── Broadcast helpers ───────────────────────────────────────────────────────

// All connected host and player sockets
const hostSockets = new Set();
const playerSockets = new Set();

function broadcastAll(msg, targetWs) {
  const str = JSON.stringify(msg);
  if (targetWs) {
    if (targetWs.readyState === 1) targetWs.send(str);
    return;
  }
  for (const ws of [...hostSockets, ...playerSockets]) {
    if (ws.readyState === 1) ws.send(str);
  }
}

function broadcastHosts(msg) {
  const str = JSON.stringify(msg);
  for (const ws of hostSockets) {
    if (ws.readyState === 1) ws.send(str);
  }
}

// ─── Game instance ───────────────────────────────────────────────────────────

const game = new Game(broadcastAll);
let currentLanguage = 'en';

// ─── WebSocket connection handler ────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const isHost = req.url === '/ws/host';
  const isPlayer = req.url === '/ws/player';

  if (isHost) {
    hostSockets.add(ws);
    // Send current state to newly connected host
    ws.send(JSON.stringify({ type: 'HOST_CONNECTED', playerCount: game.playerCount }));
  } else if (isPlayer) {
    playerSockets.add(ws);
    ws.send(JSON.stringify({ type: 'CONNECTED', lang: currentLanguage }));
  } else {
    ws.close(4000, 'Invalid path');
    return;
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    handleMessage(ws, isHost, msg);
  });

  ws.on('close', () => {
    if (isHost) {
      hostSockets.delete(ws);
    } else {
      playerSockets.delete(ws);
      game.removePlayer(ws);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// ─── Message handler ─────────────────────────────────────────────────────────

function handleMessage(ws, isHost, msg) {
  const { type } = msg;

  if (isHost) {
    switch (type) {
      case 'START_GAME': {
        const categories = Array.isArray(msg.categories) && msg.categories.length > 0
          ? msg.categories
          : [9];
        const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0
          ? Math.min(msg.questionCount, 50)
          : 20;
        const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty)
          ? msg.gameDifficulty
          : 'easy';
        game.startGame(categories, questionCount, gameDifficulty, currentLanguage).catch(console.error);
        break;
      }
      case 'SKIP':
        game.skipReveal();
        break;
      case 'RESTART':
        game.restart();
        break;
      case 'CONTINUE_GAME': {
        const categories = Array.isArray(msg.categories) && msg.categories.length > 0
          ? msg.categories : [9];
        const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0
          ? Math.min(msg.questionCount, 50) : 20;
        const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty)
          ? msg.gameDifficulty : 'easy';
        game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
        break;
      }
      case 'SET_LANGUAGE':
        if (typeof msg.lang === 'string' && /^[a-z]{2}$/.test(msg.lang)) {
          currentLanguage = msg.lang;
          broadcastAll({ type: 'LANGUAGE_SET', lang: currentLanguage });
        }
        break;
    }
    return;
  }

  // Player messages
  switch (type) {
    case 'JOIN': {
      const username = (msg.username || '').trim().slice(0, 20);
      // Send JOIN_OK first so client can identify itself before receiving resync messages
      const preCheck = !username ? { ok: false, code: 'INVALID_USERNAME', message: 'Username required.' } : null;
      if (preCheck) {
        ws.send(JSON.stringify({ type: 'ERROR', code: preCheck.code, message: preCheck.message }));
        break;
      }
      ws.send(JSON.stringify({ type: 'JOIN_OK', username }));
      const result = game.addPlayer(ws, username);
      if (!result.ok) {
        // If game rejected after we sent JOIN_OK, correct it with an error
        ws.send(JSON.stringify({ type: 'ERROR', code: result.code, message: result.message }));
      }
      break;
    }
    case 'ANSWER': {
      game.receiveAnswer(ws, msg.questionId, msg.answerId);
      break;
    }
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎮 Quiz server running!\n');
  console.log(`  TV Host URL:  ${HOST_URL}`);
  console.log(`  Player URL:   ${PLAYER_URL}\n`);
  if (USE_HTTPS) {
    console.log('  ⚠️  First visit: Safari will warn about the self-signed cert.');
    console.log('     Tap "Show Details" → "visit this website" → confirm.\n');
  }
  console.log('Open the TV Host URL in Chromium (F11 for fullscreen).\n');
});
