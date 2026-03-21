// Small Hours - HTTP Routes
// Express routes for health, room management, and static file serving.

import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

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

  // Static files from public/
  app.use(express.static(PUBLIC_DIR));

  // SPA fallback: serve index.html for non-API, non-static routes
  // Express 5 requires named params; use a middleware instead of wildcard route
  app.use((req, res) => {
    // Don't intercept API routes or WebSocket paths
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });
  });
}
