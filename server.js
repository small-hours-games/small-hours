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
const { ShitheadGame } = require('./shithead-game');
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
<title>Spelkväll</title>
<style>
body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eaeaea;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:1.5rem;margin:0;padding:2rem}
h1{font-size:2.5rem;background:linear-gradient(90deg,#9f44d3,#00c2ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0}
.section{display:flex;flex-direction:column;align-items:center;gap:.75rem;width:100%;max-width:360px}
.section h2{font-size:1.1rem;color:#aaa;margin:0}
a{display:block;padding:.9rem 2rem;border-radius:.75rem;font-size:1.1rem;font-weight:700;text-decoration:none;text-align:center;width:100%}
.quiz-host{background:linear-gradient(135deg,#9f44d3,#4a90d9);color:#fff}
.quiz-join{background:linear-gradient(135deg,#26890c,#00c2ff);color:#fff}
.sh-host{background:linear-gradient(135deg,#b5451b,#d4a017);color:#fff}
.sh-join{background:linear-gradient(135deg,#1b6cb5,#17a0d4);color:#fff}
hr{width:100%;border:none;border-top:1px solid rgba(255,255,255,.1)}
</style></head>
<body>
<h1>🎮 Spelkväll</h1>
<div class="section">
  <h2>🧠 Quiz Night (Frågesport)</h2>
  <a class="quiz-host" href="/host/">Host View (TV)</a>
  <a class="quiz-join" href="/join">Gå med i Quiz (Telefon)</a>
</div>
<hr>
<div class="section">
  <h2>🃏 Vänd Tia (Shithead)</h2>
  <a class="sh-host" href="/shithead/host/">Host View (TV)</a>
  <a class="sh-join" href="/shithead/join">Gå med i Vänd Tia (Telefon)</a>
</div>
</body></html>`);
});

// Redirect /join → /player/index.html
app.get('/join', (req, res) => {
  res.redirect('/player/index.html');
});

// Shithead routes
app.get('/shithead/join', (req, res) => {
  res.redirect('/shithead/player/index.html');
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
  if (req.url === '/ws/host' || req.url === '/ws/player' ||
      req.url === '/ws/shithead-host' || req.url === '/ws/shithead-player') {
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

// Shithead game sockets
const shitheadHostSockets = new Set();
const shitheadPlayerSockets = new Set();

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

function shitheadBroadcastAll(msg, targetWs) {
  const str = JSON.stringify(msg);
  if (targetWs) {
    if (targetWs.readyState === 1) targetWs.send(str);
    return;
  }
  for (const ws of [...shitheadHostSockets, ...shitheadPlayerSockets]) {
    if (ws.readyState === 1) ws.send(str);
  }
}

// ─── Game instance ───────────────────────────────────────────────────────────

const game = new Game(broadcastAll);
let currentLanguage = 'en';

const shitheadGame = new ShitheadGame(shitheadBroadcastAll);

// ─── WebSocket connection handler ────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const isHost = req.url === '/ws/host';
  const isPlayer = req.url === '/ws/player';
  const isShitheadHost = req.url === '/ws/shithead-host';
  const isShitheadPlayer = req.url === '/ws/shithead-player';

  if (isShitheadHost) {
    shitheadHostSockets.add(ws);
    ws.send(JSON.stringify({ type: 'SHITHEAD_HOST_CONNECTED', playerCount: shitheadGame.playerCount }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      handleShitheadMessage(ws, true, msg);
    });
    ws.on('close', () => shitheadHostSockets.delete(ws));
    ws.on('error', (err) => console.error('Shithead host WS error:', err.message));
    return;
  }

  if (isShitheadPlayer) {
    shitheadPlayerSockets.add(ws);
    ws.send(JSON.stringify({ type: 'SHITHEAD_CONNECTED' }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      handleShitheadMessage(ws, false, msg);
    });
    ws.on('close', () => {
      shitheadPlayerSockets.delete(ws);
      shitheadGame.removePlayer(ws);
    });
    ws.on('error', (err) => console.error('Shithead player WS error:', err.message));
    return;
  }

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

// ─── Shithead message handler ────────────────────────────────────────────────

function handleShitheadMessage(ws, isHost, msg) {
  const { type } = msg;

  if (isHost) {
    switch (type) {
      case 'SHITHEAD_START':
        {
          const result = shitheadGame.startGame();
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'SHITHEAD_ERROR', message: result.message || 'Kunde inte starta spelet.' }));
          }
        }
        break;
      case 'SHITHEAD_RESTART':
        shitheadGame.restart();
        break;
    }
    return;
  }

  // Player messages
  switch (type) {
    case 'SHITHEAD_JOIN':
      {
        const username = (msg.username || '').trim().slice(0, 20);
        if (!username) {
          ws.send(JSON.stringify({ type: 'SHITHEAD_ERROR', message: 'Ange ett namn.' }));
          break;
        }
        ws.send(JSON.stringify({ type: 'SHITHEAD_JOIN_OK', username }));
        const result = shitheadGame.addPlayer(ws, username);
        if (!result.ok) {
          ws.send(JSON.stringify({ type: 'SHITHEAD_ERROR', code: result.code, message: result.message }));
        }
      }
      break;
    case 'SHITHEAD_SWAP_CARD':
      shitheadGame.swapCard(ws, msg.handCardId, msg.faceUpCardId);
      break;
    case 'SHITHEAD_CONFIRM_SWAP':
      shitheadGame.confirmSwap(ws);
      break;
    case 'SHITHEAD_PLAY_CARDS':
      shitheadGame.playCards(ws, msg.cardIds);
      break;
    case 'SHITHEAD_PLAY_FACEDOWN':
      shitheadGame.playFaceDown(ws, msg.cardId);
      break;
    case 'SHITHEAD_PICK_UP_PILE':
      shitheadGame.pickUpPile(ws);
      break;
  }
}

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
