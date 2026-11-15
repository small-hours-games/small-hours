import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { WebSocket } from 'ws';
import { parseUserAgent } from '../../src/transport/device-info.js';
import { setupAdminRoutes } from '../../src/transport/admin-routes.js';
import { setupWebSocket } from '../../src/transport/ws-adapter.js';
import { RoomManager } from '../../src/session/manager.js';
import {
  buildLoginRedirect,
  handleOidcCallback,
  getCallbackReturnTo,
  sanitizeReturnTo,
  resetDiscoveryCache,
} from '../../src/auth/oidc.js';

describe('parseUserAgent', () => {
  it('detects iPhone Safari', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
    );
    expect(info.category).toBe('mobile');
    expect(info.label).toBe('iPhone');
    expect(info.os).toBe('iOS 18.1');
    expect(info.browser).toBe('Safari');
    expect(info.isTv).toBe(false);
  });

  it('detects Android phones with model and Chrome', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240305.019.A1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36'
    );
    expect(info.category).toBe('mobile');
    expect(info.label).toBe('Pixel 8');
    expect(info.os).toBe('Android 14');
    expect(info.browser).toBe('Chrome');
  });

  it('detects Android TV WebView and Smart TVs', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV Build/SR1A.211012.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Safari/537.36'
    );
    expect(info.category).toBe('tv');
    expect(info.isTv).toBe(true);
    expect(info.browser).toBe('Android WebView');
  });

  it('handles empty User-Agent gracefully', () => {
    const info = parseUserAgent('');
    expect(info.category).toBe('unknown');
    expect(info.label).toBe('Unknown Device');
    expect(info.raw).toBe('');
  });
});

describe('OIDC returnTo handling', () => {
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetDiscoveryCache();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    globalThis.fetch = originalFetch;
    resetDiscoveryCache();
  });

  it('sanitizes returnTo paths against open redirects', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('//evil.example.com')).toBe('/admin');
    expect(sanitizeReturnTo('https://evil.example.com')).toBe('/admin');
    expect(sanitizeReturnTo('/\\evil')).toBe('/admin');
  });

  it('preserves /dashboard return destination through OIDC login and callback', async () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client-123';

    globalThis.fetch = async (url) => {
      if (String(url).includes('.well-known/openid-configuration')) {
        return {
          ok: true,
          json: async () => ({
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'https://idp.example.com/token',
          }),
        };
      }
      if (String(url) === 'https://idp.example.com/token') {
        const claims = { sub: 'admin-1', email: 'admin@example.com', name: 'Admin' };
        const idToken = 'hdr.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.sig';
        return { ok: true, json: async () => ({ id_token: idToken }) };
      }
      throw new Error('Unexpected fetch: ' + url);
    };

    const loginHeaders = [];
    const loginReq = { headers: { host: 'localhost:3001' }, protocol: 'http', query: { next: '/dashboard' } };
    const loginRes = { append: (_k, v) => loginHeaders.push(v) };
    const redirectUrl = new URL(await buildLoginRedirect(loginReq, loginRes));
    const state = redirectUrl.searchParams.get('state');
    const txCookie = loginHeaders[0].split(';')[0];

    const cbHeaders = [];
    const cbReq = { query: { code: 'c1', state }, headers: { cookie: txCookie } };
    const cbRes = { append: (_k, v) => cbHeaders.push(v) };
    await handleOidcCallback(cbReq, cbRes);
    expect(getCallbackReturnTo(cbReq)).toBe('/dashboard');
  });
});

describe('/dashboard OIDC protection, live tables API, and moderation', () => {
  const savedEnv = { ...process.env };
  let manager;
  let server;
  let wss;
  let baseUrl;
  let wsBaseUrl;

  beforeEach(async () => {
    process.env.ADMIN_DEV_TOKEN = 'test-dev-secret';
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;

    manager = new RoomManager();
    const app = express();
    setupAdminRoutes(app, manager);
    server = http.createServer(app);
    ({ wss } = setupWebSocket(server, manager));

    await new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        wsBaseUrl = `ws://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    for (const client of wss.clients) client.terminate();
    wss.close();
    manager.destroy();
    await new Promise(resolve => server.close(resolve));
  });

  function connectWs(wsPath, userAgent) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBaseUrl}${wsPath}`, {
        headers: { 'User-Agent': userAgent },
      });
      const queue = [];
      const waiters = [];
      ws.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString());
        const idx = waiters.findIndex(w => !w.type || w.type === parsed.type);
        if (idx !== -1) {
          const [waiter] = waiters.splice(idx, 1);
          waiter.resolve(parsed);
        } else {
          queue.push(parsed);
        }
      });
      ws.nextMsg = (type) => {
        const idx = queue.findIndex(m => !type || m.type === type);
        if (idx !== -1) return Promise.resolve(queue.splice(idx, 1)[0]);
        return new Promise((res, rej) => {
          waiters.push({ type, resolve: res, reject: rej });
        });
      };
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  it('requires admin auth on /dashboard and /admin/api/tables, and redirects to OIDC login when configured', async () => {
    // Unconfigured OIDC -> 503 HTML setup prompt on /dashboard
    const unconfRes = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    expect(unconfRes.status).toBe(503);

    // Unauthenticated API -> 401
    const apiUnauth = await fetch(`${baseUrl}/admin/api/tables`);
    expect(apiUnauth.status).toBe(401);

    // Configured OIDC -> redirects to /admin/login?next=%2Fdashboard
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'cid';
    const redirRes = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    expect(redirRes.status).toBe(302);
    expect(redirRes.headers.get('location')).toBe('/admin/login?next=%2Fdashboard');

    // Dev token auth when OIDC is unconfigured -> serves dashboard.html
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    const authedRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { 'x-admin-dev-token': 'test-dev-secret' },
    });
    expect(authedRes.status).toBe(200);
    const html = await authedRes.text();
    expect(html).toContain('Live Tables');
  });

  it('reports live tables, connected phones, TV host devices, and supports kick and close actions', async () => {
    const room = manager.createRoom();
    const hostUa = 'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV Build/SR1A; wv) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
    const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
    const pixelUa = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';

    const hostWs = await connectWs(`/ws/host/${room.code}`, hostUa);
    await hostWs.nextMsg('DISPLAY_OK');

    const p1Ws = await connectWs(`/ws/player/${room.code}`, iphoneUa);
    p1Ws.send(JSON.stringify({ type: 'JOIN_LOBBY', username: 'Alice' }));
    const aliceJoined = await p1Ws.nextMsg('JOIN_OK');

    const p2Ws = await connectWs(`/ws/player/${room.code}`, pixelUa);
    p2Ws.send(JSON.stringify({ type: 'JOIN_LOBBY', username: 'Bob' }));
    const bobJoined = await p2Ws.nextMsg('JOIN_OK');

    const headers = { 'x-admin-dev-token': 'test-dev-secret' };
    const snapRes = await fetch(`${baseUrl}/admin/api/tables`, { headers });
    expect(snapRes.status).toBe(200);
    const snap = await snapRes.json();

    expect(snap.summary.tableCount).toBe(1);
    expect(snap.summary.connectedPlayerCount).toBe(2);
    expect(snap.summary.hostDisplayCount).toBe(1);

    const table = snap.tables[0];
    expect(table.code).toBe(room.code);
    expect(table.hosts).toHaveLength(1);
    expect(table.hosts[0].device.isTv).toBe(true);
    expect(table.hosts[0].device.raw).toBe(hostUa);

    const alice = table.players.find(p => p.playerId === aliceJoined.playerId);
    const bob = table.players.find(p => p.playerId === bobJoined.playerId);
    expect(alice.device.label).toBe('iPhone');
    expect(alice.device.os).toBe('iOS 18.0');
    expect(alice.device.raw).toBe(iphoneUa);
    expect(bob.device.label).toBe('Pixel 8');
    expect(bob.device.os).toBe('Android 14');

    // Kick Bob
    const bobClose = new Promise(resolve => p2Ws.once('close', code => resolve(code)));
    const kickRes = await fetch(
      `${baseUrl}/admin/api/tables/${room.code}/players/${encodeURIComponent(bobJoined.playerId)}/kick`,
      { method: 'POST', headers }
    );
    expect(kickRes.status).toBe(200);
    expect(await bobClose).toBe(4003);

    const afterKick = await (await fetch(`${baseUrl}/admin/api/tables`, { headers })).json();
    expect(afterKick.tables[0].players.map(p => p.username)).toEqual(['Alice']);

    // Close table
    const aliceClose = new Promise(resolve => p1Ws.once('close', code => resolve(code)));
    const hostClose = new Promise(resolve => hostWs.once('close', code => resolve(code)));
    const closeRes = await fetch(`${baseUrl}/admin/api/tables/${room.code}/close`, {
      method: 'POST',
      headers,
    });
    expect(closeRes.status).toBe(200);
    expect(await aliceClose).toBe(4004);
    expect(await hostClose).toBe(4004);

    const afterClose = await (await fetch(`${baseUrl}/admin/api/tables`, { headers })).json();
    expect(afterClose.summary.tableCount).toBe(0);
    expect(afterClose.tables).toEqual([]);
  });
});
