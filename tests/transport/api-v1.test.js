import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiKey } from '../../src/auth/api-keys.js';
import { setupApiV1Routes } from '../../src/transport/api-v1.js';
import { setupAdminRoutes } from '../../src/transport/admin-routes.js';
import { RoomManager } from '../../src/session/manager.js';
import { unregisterDynamicGame, getGame } from '../../src/games/registry.js';

describe('/api/v1 and /admin HTTP integration', () => {
  let tmpDir;
  let keysFile;
  let customDir;
  let server;
  let baseUrl;
  let apiKey;
  let manager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-api-v1-'));
    keysFile = path.join(tmpDir, 'api-keys.json');
    customDir = path.join(tmpDir, 'custom-games');
    const created = await createApiKey({ name: 'Integration Key' }, keysFile);
    apiKey = created.rawKey;

    manager = new RoomManager();
    const app = express();
    setupAdminRoutes(app);
    setupApiV1Routes(app, manager, { keysFile, customGamesDir: customDir });
    await new Promise(resolve => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    unregisterDynamicGame('api-eights');
    unregisterDynamicGame('api-quiz-1');
    manager.destroy();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('protects /admin when OIDC is unconfigured and rejects unauthenticated /api/v1 calls', async () => {
    const adminRes = await fetch(`${baseUrl}/admin`);
    expect(adminRes.status).toBe(503);

    const apiRes = await fetch(`${baseUrl}/api/v1/games`);
    expect(apiRes.status).toBe(401);
  });

  it('creates custom card and quiz games, deals shared cards, and cleans up', async () => {
    const auth = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    // 1. Create a card game
    const cardRes = await fetch(`${baseUrl}/api/v1/games`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        id: 'api-eights',
        kind: 'card-rules',
        label: 'API Eights',
        deal: { hand: 5 },
        rules: { playMatch: 'suitOrRank', wildRanks: [8] },
      }),
    });
    expect(cardRes.status).toBe(201);
    expect(getGame('api-eights')).toBeDefined();

    // 2. Create a custom quiz game
    const quizRes = await fetch(`${baseUrl}/api/v1/games`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        id: 'api-quiz-1',
        kind: 'quiz',
        label: 'API Trivia',
        questions: [
          { question: '2+2?', correctAnswer: '4', incorrectAnswers: ['3', '5', '6'] },
        ],
      }),
    });
    expect(quizRes.status).toBe(201);
    expect(getGame('api-quiz-1')).toBeDefined();

    // 3. Card primitives
    const deckRes = await fetch(`${baseUrl}/api/v1/cards/deck`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ decks: 1, aceHigh: true }),
    });
    const deckData = await deckRes.json();
    expect(deckData.count).toBe(52);

    const dealRes = await fetch(`${baseUrl}/api/v1/cards/deal`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ cards: deckData.cards, players: ['a', 'b'], count: 5 }),
    });
    const dealData = await dealRes.json();
    expect(dealData.hands.a).toHaveLength(5);
    expect(dealData.rest).toHaveLength(42);

    // 4. Delete custom game
    const delRes = await fetch(`${baseUrl}/api/v1/games/api-eights`, { method: 'DELETE', headers: auth });
    expect(delRes.status).toBe(200);
    expect(getGame('api-eights')).toBeUndefined();
  });
});
