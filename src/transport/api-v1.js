// Small Hours - Versioned Developer Game API (/api/v1/*)
// Protected by API keys generated in /admin.

import express from 'express';
import { requireApiKey } from '../auth/api-keys.js';
import { createDeck, deal, shuffle } from '../cards/deck.js';
import { createGame, processAction, getView, checkEnd } from '../engine/engine.js';
import {
  loadCustomGames,
  saveCustomGame,
  getCustomGameSpec,
  deleteCustomGame,
} from '../games/custom-store.js';
import {
  getGame,
  isBuiltInGame,
  listGames,
  registerDynamicGame,
  unregisterDynamicGame,
} from '../games/registry.js';
import { notifyRoomCreated } from '../notifications/discord.js';

export function setupApiV1Routes(app, manager, { keysFile, customGamesDir } = {}) {
  const router = express.Router();
  router.use(requireApiKey(keysFile));
  router.use(express.json({ limit: '1mb' }));

  // --- Games CRUD ---
  router.get('/games', async (_req, res) => {
    const custom = await loadCustomGames(customGamesDir);
    const games = listGames().map(g => ({
      id: g.id,
      kind: g.kind || 'built-in',
      label: g.label,
      icon: g.icon,
      min: g.min,
      max: g.max,
      hidden: Boolean(g.hidden),
      isCustom: Boolean(g.isCustom),
    }));
    res.json({ games, customSpecs: custom });
  });

  router.post('/games', async (req, res) => {
    const builtInIds = new Set(listGames().filter(g => !g.isCustom).map(g => g.id));
    const saved = await saveCustomGame(req.body, customGamesDir, { builtInIds });
    if (!saved.ok) return res.status(400).json({ error: saved.error });
    if (saved.spec.enabled) registerDynamicGame(saved.definition);
    else unregisterDynamicGame(saved.spec.id);
    res.status(201).json({ game: saved.spec });
  });

  router.get('/games/:id', async (req, res) => {
    const spec = await getCustomGameSpec(req.params.id, customGamesDir);
    if (spec) return res.json({ game: spec });
    const builtIn = getGame(req.params.id);
    if (builtIn) {
      return res.json({
        game: { id: builtIn.id, kind: builtIn.kind || 'built-in', label: builtIn.label, min: builtIn.min, max: builtIn.max },
      });
    }
    res.status(404).json({ error: 'Game not found' });
  });

  router.put('/games/:id', async (req, res) => {
    if (isBuiltInGame(req.params.id)) return res.status(400).json({ error: 'Cannot modify built-in game' });
    const builtInIds = new Set(listGames().filter(g => !g.isCustom).map(g => g.id));
    const saved = await saveCustomGame({ ...req.body, id: req.params.id }, customGamesDir, { builtInIds });
    if (!saved.ok) return res.status(400).json({ error: saved.error });
    if (saved.spec.enabled) registerDynamicGame(saved.definition);
    else unregisterDynamicGame(saved.spec.id);
    res.json({ game: saved.spec });
  });

  router.delete('/games/:id', async (req, res) => {
    if (isBuiltInGame(req.params.id)) return res.status(400).json({ error: 'Cannot delete built-in game' });
    const ok = await deleteCustomGame(req.params.id, customGamesDir);
    unregisterDynamicGame(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Custom game not found' });
    res.json({ ok: true });
  });

  // --- Shared Card Primitives (same card logic as src/cards/deck.js) ---
  router.post('/cards/deck', (req, res) => {
    const { decks = 1, aceHigh = false, opaqueIds = false } = req.body || {};
    const count = Math.min(6, Math.max(1, Number(decks) || 1));
    const deck = createDeck({ decks: count, aceHigh: Boolean(aceHigh), opaqueIds: Boolean(opaqueIds) });
    res.json({ count: deck.length, cards: deck });
  });

  router.post('/cards/deal', (req, res) => {
    const { cards, players, count = 5, shuffleFirst = false } = req.body || {};
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'players[] is required' });
    }
    const source = Array.isArray(cards) ? (shuffleFirst ? shuffle(cards) : cards) : createDeck();
    const { hands, rest } = deal(source, players.map(String), Math.max(0, Number(count) || 0));
    res.json({ hands, rest });
  });

  // --- Live Room & Game Control ---
  router.post('/rooms', (req, res) => {
    try {
      const room = manager.createRoom();
      notifyRoomCreated(room.code).catch(() => {});
      res.status(201).json({
        code: room.code,
        hostUrl: `/host/${room.code}`,
        playerUrl: `/player/${room.code}`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/rooms/:code', (req, res) => {
    const room = manager.getRoom(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({
      code: room.code,
      players: [...room.players.values()].map(p => ({ id: p.id, username: p.username, isAdmin: p.isAdmin, connected: p.connected })),
      bots: room.bots || [],
      scores: Object.fromEntries(room.scores),
      hasActiveGame: Boolean(room.game),
      gameId: room.game?.definition?.id || null,
    });
  });

  router.post('/rooms/:code/start', async (req, res) => {
    const room = manager.getRoom(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const { gameType, config = {} } = req.body || {};
    if (!gameType) return res.status(400).json({ error: 'gameType is required' });
    try {
      const game = await room.startGame(gameType, config);
      res.json({ ok: true, gameId: game.definition.id, state: getView(game, room.players.keys().next().value) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/rooms/:code/actions', (req, res) => {
    const room = manager.getRoom(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (!room.game) return res.status(400).json({ error: 'No active game in room' });
    const { action } = req.body || {};
    if (!action || !action.type) return res.status(400).json({ error: 'action.type is required' });
    const { game, events } = processAction(room.game, action);
    room.game = game;
    const endResult = checkEnd(game);
    res.json({ ok: true, events, endResult });
  });

  // --- Stateless Card Engine Sandbox (run rules without a WebSocket room) ---
  router.post('/sandbox/start', (req, res) => {
    const { gameId, players = ['p1', 'p2'], config = {} } = req.body || {};
    const def = getGame(gameId);
    if (!def) return res.status(404).json({ error: 'Game not found' });
    const game = createGame(def, { players, config });
    res.json({ state: game.state, views: Object.fromEntries(players.map(id => [id, getView(game, id)])) });
  });

  app.use('/api/v1', router);
}
