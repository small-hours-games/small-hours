import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isGameVisibleInLobby,
  setGameLobbyVisibility,
  resetVisibilityCacheForTest,
} from '../../src/games/visibility.js';
import { publicGames, getGame } from '../../src/games/registry.js';
import { setupAdminRoutes } from '../../src/transport/admin-routes.js';
import { setSessionCookie } from '../../src/auth/oidc.js';

describe('Lobby game visibility overrides', () => {
  let tmpDir;
  let visFile;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-vis-'));
    visFile = path.join(tmpDir, 'lobby-visibility.json');
    resetVisibilityCacheForTest({});
  });

  afterEach(async () => {
    resetVisibilityCacheForTest({});
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('hides a built-in game from publicGames() while keeping getGame() intact', async () => {
    expect(publicGames().some(g => g.type === 'quiz')).toBe(true);
    await setGameLobbyVisibility('quiz', false, visFile);
    expect(publicGames().some(g => g.type === 'quiz')).toBe(false);
    expect(getGame('quiz')).toBeDefined();

    await setGameLobbyVisibility('quiz', null, visFile);
    expect(publicGames().some(g => g.type === 'quiz')).toBe(true);
    expect(isGameVisibleInLobby({ id: 'hilow', hidden: true })).toBe(false);
  });

  it('exposes PATCH /admin/api/lobby-visibility/:id behind admin session auth', async () => {
    const app = express();
    setupAdminRoutes(app);
    let server;
    const baseUrl = await new Promise(resolve => {
      server = app.listen(0, () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
    try {
      const unauth = await fetch(`${baseUrl}/admin/api/lobby-visibility/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: false }),
      });
      expect(unauth.status).toBe(401);

      const cookies = [];
      setSessionCookie({ headers: {}, secure: false }, { append: (_k, v) => cookies.push(v) }, { sub: 'u1', email: 'a@b.se' });
      const cookie = cookies[0].split(';')[0];
      const authRes = await fetch(`${baseUrl}/admin/api/lobby-visibility/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ visible: false }),
      });
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.visibleInLobby).toBe(false);
    } finally {
      await setGameLobbyVisibility('quiz', null);
      await new Promise(resolve => server.close(resolve));
    }
  });
});
