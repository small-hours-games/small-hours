// Small Hours - /admin Portal & OIDC Routes

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  isOidcConfigured,
  getAdminSession,
  requireAdminSession,
  buildLoginRedirect,
  handleOidcCallback,
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
  registerDynamicGame,
  unregisterDynamicGame,
  listGames,
} from '../games/registry.js';

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
<p>Set <code>OIDC_ISSUER</code> and <code>OIDC_CLIENT_ID</code> (plus optional <code>OIDC_CLIENT_SECRET</code>, <code>OIDC_ALLOWED_EMAILS</code>, and <code>ADMIN_SESSION_SECRET</code>) in <code>.env</code> to enable <code>/admin</code>.</p>
<p style="opacity:.75;font-size:13px">Redirect URI: <code>/admin/callback</code></p>
</div></body></html>`;
}

export function setupAdminRoutes(app) {
  app.get('/admin', async (req, res) => {
    const session = getAdminSession(req);
    if (!session) {
      if (!isOidcConfigured()) {
        return res.status(503).type('html').send(unconfiguredHtml());
      }
      return res.redirect('/admin/login');
    }
    res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  });

  app.get('/admin/login', async (req, res) => {
    if (!isOidcConfigured()) {
      return res.status(503).type('html').send(unconfiguredHtml());
    }
    try {
      const target = await buildLoginRedirect(req, res);
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
      res.redirect('/admin');
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
    const custom = await loadCustomGames();
    const builtIn = listGames().filter(g => !g.isCustom).map(g => ({
      id: g.id,
      label: g.label,
      icon: g.icon,
      min: g.min,
      max: g.max,
      builtIn: true,
    }));
    res.json({ custom, builtIn });
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
