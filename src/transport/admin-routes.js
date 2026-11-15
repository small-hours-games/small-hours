// Small Hours - /admin Portal & OIDC Routes

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import defaultManager from '../session/manager.js';
import { parseUserAgent } from './device-info.js';
import {
  isOidcConfigured,
  getAdminSession,
  requireAdminSession,
  buildLoginRedirect,
  handleOidcCallback,
  getCallbackReturnTo,
  clearAdminCookies,
} from '../auth/oidc.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../auth/api-keys.js';
import {
  loadCustomGames,
  saveCustomGame,
  deleteCustomGame,
  getCustomGameSpec,
} from '../games/custom-store.js';
import {
  isBuiltInGame,
  getGame,
  registerDynamicGame,
  unregisterDynamicGame,
  listGames,
  bumpCatalogVersion,
} from '../games/registry.js';
import { isGameVisibleInLobby, setGameLobbyVisibility } from '../games/visibility.js';

const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url));

function unconfiguredHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Small Hours Admin — OIDC Setup</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
.card{max-width:520px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px}
code{background:#0f172a;padding:2px 6px;border-radius:6px;font-size:13px;color:#38bdf8}
h1{margin-top:0;font-size:20px}</style></head>
<body><div class="card">
<h1>OIDC Login Not Configured</h1>
<p>Set <code>OIDC_ISSUER</code> and <code>OIDC_CLIENT_ID</code> (plus optional <code>OIDC_CLIENT_SECRET</code>, <code>OIDC_ALLOWED_EMAILS</code>, and <code>ADMIN_SESSION_SECRET</code>) in <code>.env</code> to enable <code>/admin</code> and <code>/dashboard</code>.</p>
<p style="opacity:.75;font-size:13px">Redirect URI: <code>/admin/callback</code></p>
</div></body></html>`;
}

function buildTablesSnapshot(manager) {
  const now = Date.now();
  const tables = [];
  let activeGameCount = 0;
  let lobbyCount = 0;
  let humanPlayerCount = 0;
  let connectedPlayerCount = 0;
  let botCount = 0;
  let hostDisplayCount = 0;
  let observerCount = 0;

  for (const [code, room] of manager.rooms) {
    const conns = manager.wsControls?.getRoomConnections?.(code) || { hosts: [], observers: [] };
    const gameEntry = room.game && room.gameType ? getGame(room.gameType) : null;
    const gameState = room.game?.state || null;
    const status = room.game ? 'in_game' : room.votingActive ? 'voting' : 'lobby';

    if (room.game) activeGameCount += 1;
    else lobbyCount += 1;

    const players = [];
    for (const [playerId, p] of room.players) {
      humanPlayerCount += 1;
      if (p.connected) connectedPlayerCount += 1;
      players.push({
        playerId,
        username: p.username,
        avatar: p.avatar,
        isAdmin: Boolean(p.isAdmin),
        connected: Boolean(p.connected),
        ready: Boolean(p.ready),
        sessionScore: Number(p.sessionScore || 0),
        lastSeen: p.lastSeen || room.lastActivity,
        device: p.device || parseUserAgent(''),
      });
    }

    players.sort((a, b) => {
      if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.username.localeCompare(b.username);
    });

    const bots = (room.bots || []).map(b => ({
      playerId: b.playerId,
      username: b.username,
      avatar: b.avatar,
    }));
    botCount += bots.length;

    const hosts = conns.hosts || [];
    hostDisplayCount += hosts.length;

    const observers = conns.observers?.length
      ? conns.observers
      : [...(room.observers?.entries() || [])].map(([observerId, o]) => ({
        observerId,
        username: o.username,
        connectedAt: o.lastSeen || null,
        device: parseUserAgent(''),
      }));
    observerCount += Math.max(observers.length, room.observers?.size || 0);

    tables.push({
      code,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      idleMs: Math.max(0, now - (room.lastActivity || now)),
      language: room.language || 'en',
      status,
      game: room.game
        ? {
          type: room.gameType || 'unknown',
          label: gameEntry?.label || room.gameType || 'Game',
          icon: gameEntry?.icon || '🎮',
          phase: gameState?.phase || null,
          round: Number.isFinite(gameState?.round) ? gameState.round : null,
        }
        : null,
      hosts,
      players,
      bots,
      observers,
    });
  }

  tables.sort((a, b) => {
    if ((a.status === 'in_game') !== (b.status === 'in_game')) {
      return a.status === 'in_game' ? -1 : 1;
    }
    return (b.lastActivity || 0) - (a.lastActivity || 0);
  });

  return {
    summary: {
      tableCount: tables.length,
      activeGameCount,
      lobbyCount,
      humanPlayerCount,
      connectedPlayerCount,
      botCount,
      hostDisplayCount,
      observerCount,
    },
    tables,
    generatedAt: now,
  };
}

export function setupAdminRoutes(app, manager = defaultManager) {
  app.get('/admin', async (req, res) => {
    const session = getAdminSession(req);
    if (!session) {
      if (!isOidcConfigured()) {
        return res.status(503).type('html').send(unconfiguredHtml());
      }
      return res.redirect('/admin/login?next=%2Fadmin');
    }
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  });

  app.get('/dashboard', async (req, res) => {
    const session = getAdminSession(req);
    if (!session) {
      if (!isOidcConfigured()) {
        return res.status(503).type('html').send(unconfiguredHtml());
      }
      return res.redirect('/admin/login?next=%2Fdashboard');
    }
    res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
  });

  app.get('/admin/login', async (req, res) => {
    if (!isOidcConfigured()) {
      return res.status(503).type('html').send(unconfiguredHtml());
    }
    try {
      const target = await buildLoginRedirect(req, res, { returnTo: req.query?.next });
      res.redirect(target);
    } catch (err) {
      res.status(502).send(`OIDC login error: ${err.message}`);
    }
  });

  app.get('/admin/callback', async (req, res) => {
    if (!isOidcConfigured()) {
      return res.status(503).send('OIDC is not configured');
    }
    try {
      await handleOidcCallback(req, res);
      res.redirect(getCallbackReturnTo(req, '/admin'));
    } catch (err) {
      res.status(403).send(`OIDC callback rejected: ${err.message}`);
    }
  });

  app.post('/admin/logout', (req, res) => {
    clearAdminCookies(req, res);
    res.json({ ok: true });
  });

  app.get('/admin/api/me', requireAdminSession, (req, res) => {
    res.json({ user: req.adminUser, oidcConfigured: isOidcConfigured() });
  });

  app.get('/admin/api/tables', requireAdminSession, (_req, res) => {
    res.json(buildTablesSnapshot(manager));
  });

  app.post('/admin/api/tables/:code/close', requireAdminSession, (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    if (manager.wsControls?.closeRoom) {
      const result = manager.wsControls.closeRoom(code);
      if (!result.ok) return res.status(result.status || 404).json({ error: result.error });
      return res.json(result);
    }
    const room = manager.getRoom(code);
    if (!room) return res.status(404).json({ error: 'Table not found' });
    room.endGame?.();
    manager.removeRoom(code);
    res.json({ ok: true, code });
  });

  app.post('/admin/api/tables/:code/players/:playerId/kick', requireAdminSession, (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const playerId = String(req.params.playerId || '');
    if (manager.wsControls?.kickPlayer) {
      const result = manager.wsControls.kickPlayer(code, playerId);
      if (!result.ok) return res.status(result.status || 404).json({ error: result.error });
      return res.json(result);
    }
    const room = manager.getRoom(code);
    if (!room) return res.status(404).json({ error: 'Table not found' });
    const player = room.players.get(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const username = player.username;
    room.removePlayer(playerId);
    res.json({ ok: true, code, playerId, username });
  });

  app.get('/admin/api/keys', requireAdminSession, async (_req, res) => {
    const keys = await listApiKeys();
    res.json({ keys });
  });

  app.post('/admin/api/keys', requireAdminSession, express.json(), async (req, res) => {
    const { name, scopes } = req.body || {};
    const { record, rawKey } = await createApiKey({
      name,
      scopes,
      ownerSub: req.adminUser.sub,
      ownerEmail: req.adminUser.email,
    });
    res.status(201).json({ key: record, secret: rawKey });
  });

  app.delete('/admin/api/keys/:id', requireAdminSession, async (req, res) => {
    const revoked = await revokeApiKey(req.params.id);
    if (!revoked) return res.status(404).json({ error: 'API key not found' });
    res.json({ key: revoked });
  });

  app.get('/admin/api/games', requireAdminSession, async (_req, res) => {
    const custom = (await loadCustomGames()).map(spec => {
      const live = getGame(spec.id);
      return {
        ...spec,
        visibleInLobby: live ? isGameVisibleInLobby(live) : false,
      };
    });
    const builtIn = listGames().filter(g => !g.isCustom).map(g => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      min: g.min,
      max: g.max,
      builtIn: true,
      defaultHidden: Boolean(g.hidden),
      visibleInLobby: isGameVisibleInLobby(g),
    }));
    res.json({ custom, builtIn });
  });

  app.patch('/admin/api/lobby-visibility/:id', requireAdminSession, express.json(), async (req, res) => {
    const game = getGame(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const visible = req.body?.visible === null ? null : Boolean(req.body?.visible);
    await setGameLobbyVisibility(game.id, visible);
    bumpCatalogVersion();
    res.json({ id: game.id, visibleInLobby: isGameVisibleInLobby(game) });
  });

  app.post('/admin/api/games', requireAdminSession, express.json(), async (req, res) => {
    const builtInIds = new Set(listGames().filter(g => !g.isCustom).map(g => g.id));
    const saved = await saveCustomGame(req.body, undefined, { builtInIds });
    if (!saved.ok) return res.status(400).json({ error: saved.error });
    if (saved.spec.enabled) registerDynamicGame(saved.definition);
    else unregisterDynamicGame(saved.spec.id);
    res.status(201).json({ game: saved.spec });
  });

  app.patch('/admin/api/games/:id', requireAdminSession, express.json(), async (req, res) => {
    const existing = await getCustomGameSpec(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Custom game not found' });
    const merged = { ...existing, ...req.body, id: existing.id };
    const builtInIds = new Set(listGames().filter(g => !g.isCustom).map(g => g.id));
    const saved = await saveCustomGame(merged, undefined, { builtInIds });
    if (!saved.ok) return res.status(400).json({ error: saved.error });
    if (saved.spec.enabled) registerDynamicGame(saved.definition);
    else unregisterDynamicGame(saved.spec.id);
    res.json({ game: saved.spec });
  });

  app.delete('/admin/api/games/:id', requireAdminSession, async (req, res) => {
    if (isBuiltInGame(req.params.id)) return res.status(400).json({ error: 'Cannot delete built-in game' });
    const removed = await deleteCustomGame(req.params.id);
    unregisterDynamicGame(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Custom game not found' });
    res.json({ ok: true });
  });
}
