// Small Hours - HTTP Routes
// Express routes for health, room management, and static file serving.

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { notifyRoomCreated } from '../notifications/discord.js';
import { gameStories, listGames, publicGames } from '../games/registry.js';
import { GAMES_DIR, renderGamePage } from '../games/client.js';
import { BUILD_INFO } from '../version.js';
import { setupAdminRoutes } from './admin-routes.js';
import { setupApiV1Routes } from './api-v1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const MUSIC_DIR = path.resolve(__dirname, '../../music');
const AUDIO_DIR = path.resolve(__dirname, '../../data/audio');

// Room-flood protection
const MAX_ROOMS = 200;
const ROOM_CREATE_MIN_INTERVAL_MS = 200;
let lastRoomCreateAt = 0;

/**
 * Set up HTTP routes on the Express app.
 *
 * @param {import('express').Application} app
 * @param {import('../session/manager.js').RoomManager} manager
 */
async function servePage(res, file) {
  try {
    const html = await fs.promises.readFile(path.join(PUBLIC_DIR, file), 'utf8');
    res.type('html').send(renderGamePage(html, file === 'host.html' ? 'tv' : 'phone'));
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
}

export function setupRoutes(app, manager) {
  // Each folder in music/ is one playlist.
  const playlist = folder => async (_req, res) => {
    try {
      const entries = await fs.promises.readdir(path.join(MUSIC_DIR, folder), { withFileTypes: true });
      const tracks = entries.filter(entry => entry.isFile() && /\.(mp3|ogg|m4a|wav)$/i.test(entry.name))
        .map(entry => `/music/${folder}/${encodeURIComponent(entry.name)}`).sort();
      res.json({ tracks });
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ tracks: [] });
      res.status(500).json({ error: 'Could not load music' });
    }
  };
  app.get('/api/lobby-music', playlist('lobby'));
  app.get('/api/game-music', playlist('quiz-card'));
  app.use('/music', express.static(MUSIC_DIR, { index: false, dotfiles: 'deny' }));

  // Health check
  app.get('/health', (_req, res) => {
    const { roomCount, playerCount } = manager.stats();
    res.json({
      status: 'ok',
      version: BUILD_INFO.version,
      commit: BUILD_INFO.commit,
      builtAt: BUILD_INFO.builtAt,
      uptime: process.uptime(),
      rooms: roomCount,
      players: playerCount,
    });
  });

  // Running build, shown on the front page
  app.get('/api/version', (_req, res) => {
    res.json(BUILD_INFO);
  });

  // List rooms — expose counts only, never room codes, to avoid room-code
  // enumeration of live rooms.
  app.get('/api/rooms', (_req, res) => {
    res.json({
      count: manager.rooms.size,
      players: manager.stats().playerCount,
    });
  });

  // Create room
  app.post('/api/rooms', (req, res) => {
    // Basic flood protection: cap total rooms and rate-limit creation.
    if (manager.rooms.size >= MAX_ROOMS) {
      res.status(503).json({ error: 'Server at room capacity' });
      return;
    }
    const now = Date.now();
    if (now - lastRoomCreateAt < ROOM_CREATE_MIN_INTERVAL_MS) {
      res.status(429).json({ error: 'Too many rooms created, slow down' });
      return;
    }
    lastRoomCreateAt = now;
    try {
      const room = manager.createRoom();
      res.status(201).json({ code: room.code });
      notifyRoomCreated(room.code).catch(() => {});
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Only client/ is public: a game's rules stay on the server.
  for (const game of listGames()) {
    app.use('/games/' + game.id, express.static(path.join(GAMES_DIR, game.id, 'client'), { index: false }));
  }
  app.use('/games/_api-card', express.static(path.join(GAMES_DIR, '_api-card', 'client'), { index: false }));

  setupAdminRoutes(app);
  setupApiV1Routes(app, manager);

  app.get('/api/games', (_req, res) => {
    res.json({ games: publicGames() });
  });

  // Game narration stories (for host story overlay + TTS)
  app.get('/api/stories', (_req, res) => {
    res.json({ stories: gameStories() });
  });

  // Generic TTS endpoint: text -> audio URL (uses Gemini if GEMINI_API_KEY set)
  app.post('/api/tts', express.json(), async (req, res) => {
    const text = (req.body && req.body.text || '').toString().slice(0, 500);
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    const { getNarration } = await import('../fetcher/cached-narration.js');
    const result = await getNarration(text, {
      voice: req.body.voice || undefined,
      style: req.body.style === 'game-show' ? 'game-show' : undefined,
    });
    if (!result.ok) {
      res.status(502).json({ error: result.error.message });
      return;
    }
    res.json({ url: `/api/audio/tts/${result.id}`, cached: result.cached });
  });

  // Serve generated TTS audio (tts_<id>.wav, or tts_<id>.mp3 from the fallback voice)
  app.get('/api/audio/tts/:id', (req, res) => {
    const { id } = req.params;
    // Guard against path traversal: id must be a plain base64url/hex slug.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const candidates = [
      { file: path.join(AUDIO_DIR, `tts_${id}.wav`), type: 'audio/wav' },
      { file: path.join(AUDIO_DIR, `tts_${id}.mp3`), type: 'audio/mpeg' },
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate.file)) {
        res.setHeader('Content-Type', candidate.type);
        res.sendFile(candidate.file);
        return;
      }
    }
    res.status(404).json({ error: 'Audio not found' });
  });

  // Static files from public/
  app.use(express.static(PUBLIC_DIR));

  // Route /host/:code to host.html, /player/:code to player.html
  app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    let file = 'index.html';
    if (req.path.startsWith('/host/')) file = 'host.html';
    else if (req.path.startsWith('/player/')) file = 'player.html';
    else if (req.path === '/tv' || req.path === '/tv/') file = 'tv.html'; // Android TV app entry

    if (file === 'host.html' || file === 'player.html') {
      servePage(res, file);
      return;
    }

    res.sendFile(path.join(PUBLIC_DIR, file), (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });
  });
}
