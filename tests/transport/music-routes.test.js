import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import express from 'express';
import http from 'http';
import { setupRoutes } from '../../src/transport/http.js';

const file = name => ({ name, isFile: () => true });

describe('music playlists', () => {
  let server, base;
  beforeAll(async () => {
    const app = express();
    setupRoutes(app, { rooms: new Map(), stats: () => ({ roomCount: 0, playerCount: 0 }), getRoom: () => null, createRoom: () => ({ code: 'TEST' }) });
    server = http.createServer(app).listen(0);
    await new Promise(r => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server && server.close());
  afterEach(() => vi.restoreAllMocks());

  const tracks = async path => (await (await fetch(base + path)).json()).tracks;
  const withFiles = () => vi.spyOn(fs.promises, 'readdir').mockImplementation(async dir => (String(dir).endsWith('lobby')
    ? [file('The Final Stretch.mp3'), file('notes.txt'), { name: 'old.mp3', isFile: () => false }]
    : [file('quiz-and-cards.mp3'), file('quiz-and-cards-two.mp3')]));

  it('plays the lobby folder in the lobby', async () => {
    withFiles();
    expect(await tracks('/api/lobby-music')).toEqual(['/music/lobby/The%20Final%20Stretch.mp3']);
  });

  it('plays the quiz-card folder in games', async () => {
    withFiles();
    expect(await tracks('/api/game-music')).toEqual(['/music/quiz-card/quiz-and-cards-two.mp3', '/music/quiz-card/quiz-and-cards.mp3']);
  });

  it('returns an empty list when the music folder is missing', async () => {
    vi.spyOn(fs.promises, 'readdir').mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    expect(await tracks('/api/game-music')).toEqual([]);
  });
});
