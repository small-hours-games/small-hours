// Small Hours - HTTP Routes
// Express routes for health, room management, and static file serving.

import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import { notifyRoomCreated } from '../notifications/discord.js';
import { getGift, createGift, gameLabel } from '../session/gifts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
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

  // Get gift data (for the gift page to render)
  app.get('/api/gift/:token', (req, res) => {
    const gift = getGift(req.params.token);
    if (!gift) {
      res.status(404).json({ error: 'Gift not found' });
      return;
    }
    res.json({
      gift: {
        token: gift.token,
        roomCode: gift.roomCode,
        winnerId: gift.winnerId,
        winnerName: gift.winnerName,
        gameType: gift.gameType,
        gameLabel: gameLabel(gift.gameType),
        awardedAt: gift.awardedAt,
      },
    });
  });

  // Create a gift for the current winner of a room (called by host/ws on game over)
  app.post('/api/rooms/:code/gift', (req, res) => {
    const room = manager.getRoom(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    const game = room.game;
    if (!game) {
      res.status(409).json({ error: 'No game running' });
      return;
    }
    // Determine winner from the game's endIf, if finished.
    const result = game.definition.endIf(game.state);
    if (!result || !result.winner) {
      res.status(409).json({ error: 'Game not finished / no winner yet' });
      return;
    }
    const winnerId = result.winner;
    const winnerName = (room.players.get(winnerId) && room.players.get(winnerId).name) || null;
    const { token, url } = createGift({
      roomCode: req.params.code,
      winnerId,
      gameType: room.gameType || 'unknown',
      winnerName,
    });
    res.status(201).json({ token, url, winnerId, winnerName });
  });

  // Serve cached TTS audio files
  app.get('/api/audio/:questionId/:type', (req, res) => {
    const { questionId, type } = req.params;
    if (type !== 'q' && type !== 'a') {
      res.status(400).json({ error: 'Type must be "q" or "a"' });
      return;
    }
    // Prevent path traversal: questionId must be a plain slug, no separators or ".."
    if (!/^[a-zA-Z0-9_-]+$/.test(questionId)) {
      res.status(400).json({ error: 'Invalid question id' });
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
    else if (req.path.startsWith('/gift/')) file = 'gift.html';

    res.sendFile(path.join(PUBLIC_DIR, file), (err) => {
      if (err) {
        res.status(404).json({ error: 'Not found' });
      }
    });
  });
}
