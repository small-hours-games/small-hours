// Small Hours - HTTP Routes
// Express routes for health, room management, and static file serving.

import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const AUDIO_DIR = path.resolve(__dirname, '../../data/audio');

/**
 * Set up HTTP routes on the Express app.
 *
 * @param {import('express').Application} app
 * @param {import('../session/manager.js').RoomManager} manager
 */
export function setupRoutes(app, manager) {
  // Health check
  app.get('/health', (_req, res) => {
    const { roomCount, playerCount } = manager.stats();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      rooms: roomCount,
      players: playerCount,
    });
  });

  // List rooms
  app.get('/api/rooms', (_req, res) => {
    const rooms = [];
    for (const [code, room] of manager.rooms) {
      rooms.push({
        code,
        playerCount: room.players.size,
        gameRunning: room.game !== null,
      });
    }
    res.json(rooms);
  });

  // Create room
  app.post('/api/rooms', (_req, res) => {
    try {
      const room = manager.createRoom();
      res.status(201).json({ code: room.code });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve cached TTS audio files
  app.get('/api/audio/:questionId/:type', (req, res) => {
    const { questionId, type } = req.params;
    if (type !== 'q' && type !== 'a') {
      res.status(400).json({ error: 'Type must be "q" or "a"' });
      return;
    }
    const basePath = path.join(AUDIO_DIR, `${questionId}_${type}`);
    // Try common audio extensions
    const extensions = ['wav', 'mp3', 'pcm'];
    const tryNext = (i) => {
      if (i >= extensions.length) {
        res.status(404).json({ error: 'Audio not found' });
        return;
      }
      const filePath = `${basePath}.${extensions[i]}`;
      res.sendFile(filePath, (err) => {
        if (err) tryNext(i + 1);
      });
    };
    tryNext(0);
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

    res.sendFile(path.join(PUBLIC_DIR, file), (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });
  });
}
