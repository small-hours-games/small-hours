import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupRoutes } from '../../src/transport/http.js';
import express from 'express';
import http from 'http';

function fakeManager() {
  return {
    rooms: new Map(),
    stats: () => ({ roomCount: 0, playerCount: 0 }),
    getRoom: () => null,
    createRoom: () => ({ code: 'TEST' }),
  };
}

// The Android TV app loads /tv, which creates a room and opens /host/CODE?tv=1
describe('/tv entry page', () => {
  let server, base;
  beforeAll(async () => {
    const app = express();
    setupRoutes(app, fakeManager());
    server = http.createServer(app).listen(0);
    await new Promise(r => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server && server.close());

  it('serves the TV splash that creates a room and opens the host screen', async () => {
    for (const path of ['/tv', '/tv/']) {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<title>Smallhours TV</title>');
      expect(html).toContain("fetch('/api/rooms', { method: 'POST' })");
      expect(html).toContain("'/host/' + data.code + '?tv=1'");
    }
  });

  it('leaves other pages alone', async () => {
    expect(await (await fetch(base + '/host/ABCD')).text()).toContain('Smallhours - TV Screen');
    expect(await (await fetch(base + '/tvx')).text()).toContain('Smallhours - Social Party Game Platform');
  });
});
