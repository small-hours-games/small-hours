import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupRoutes } from '../../src/transport/http.js';
import { gameStories } from '../../src/games/registry.js';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

// Minimal RoomManager stub good enough for the routes we exercise.
function fakeManager() {
  return {
    rooms: new Map(),
    stats: () => ({ roomCount: 0, playerCount: 0 }),
    getRoom: () => null,
    createRoom: () => ({ code: 'TEST' }),
  };
}

describe('stories + tts routes', () => {
  let server, base;
  beforeAll(async () => {
    const app = express();
    setupRoutes(app, fakeManager());
    server = http.createServer(app).listen(0);
    await new Promise(r => server.on('listening', r));
    const { port } = server.address();
    base = `http://127.0.0.1:${port}`;
  });
  afterAll(() => server && server.close());

  // The card games start straight on the table: no intro story (it was Swedish-only text
  // over the board while people were already playing). The route stays for future games.
  it('/api/stories answers, without stories for the card games', async () => {
    const res = await fetch(base + '/api/stories');
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const t of ['shithead', 'gin-rummy', 'hilow']) expect(data.stories[t]).toBeUndefined();
    expect(gameStories()).toEqual(data.stories);
  });

  it('POST /api/tts without key returns 502 (graceful, no crash)', async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await fetch(base + '/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hej' }),
    });
    expect(res.status).toBe(502);
    if (prev === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev;
  });
});
