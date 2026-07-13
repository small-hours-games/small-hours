import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupRoutes } from '../../src/transport/http.js';
import { STORIES } from '../../src/session/stories.js';
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

  it('/api/stories returns a story per game type', async () => {
    const res = await fetch(base + '/api/stories');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stories.hilow).toBeTruthy();
    expect(data.stories.hilow.intro).toContain('kort');
    expect(Object.keys(data.stories).length).toBeGreaterThanOrEqual(8);
  });

  it('every registered game type has a story', async () => {
    const types = ['number-guess', 'quiz', 'spy', 'shithead', 'gin-rummy', 'hilow', 'question-form', 'template', 'skogai'];
    for (const t of types) {
      expect(STORIES[t], `story for ${t}`).toBeTruthy();
      expect(STORIES[t].intro.length).toBeGreaterThan(10);
    }
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
