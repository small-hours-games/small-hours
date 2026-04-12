// Unit tests for src/transport/ws-adapter.js
// Covers: message dispatch, rate limiting, reconnection grace period.
// WebSocket layer is fully mocked — no real HTTP server.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// -----------------------------------------------------------------------
// Mock 'ws' module BEFORE importing the adapter
// -----------------------------------------------------------------------

// We need a controllable fake WebSocketServer.
// The adapter calls: new WebSocketServer({ server }), wss.on('connection', ...), wss.on('close', ...)
// and individual ws objects need: ws.readyState, ws.OPEN, ws.send(), ws.ping(), ws.terminate(),
// ws.on('message',...), ws.on('close',...), ws.on('pong',...), ws.on('error',...)

function makeFakeWs(roomCode = 'TEST', role = 'player') {
  const listeners = {};
  const sent = [];
  const ws = {
    readyState: 1, // OPEN
    OPEN: 1,
    send: vi.fn((data) => sent.push(JSON.parse(data))),
    ping: vi.fn(),
    terminate: vi.fn(),
    close: vi.fn(),
    _sent: sent,
    on(event, handler) {
      listeners[event] = handler;
      return this;
    },
    emit(event, ...args) {
      if (listeners[event]) listeners[event](...args);
    },
    // Simulate a URL for the adapter's URL parsing
    _url: `/ws/${role}/${roomCode}`,
    _host: 'localhost',
  };
  return ws;
}

function makeFakeReq(url, host = 'localhost') {
  return {
    url,
    headers: { host },
  };
}

// Shared fake WebSocketServer
let wssListeners = {};
const fakeWss = {
  on(event, handler) {
    wssListeners[event] = handler;
    return this;
  },
  emit(event, ...args) {
    if (wssListeners[event]) wssListeners[event](...args);
  },
};

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(() => fakeWss),
}));

// Mock fetchers (quiz.js imports cached-fetcher, ws-adapter imports cached-fetcher too)
vi.mock('../../src/fetcher/cached-fetcher.js', () => ({
  fetchQuestions: vi.fn(),
  fetchCategories: vi.fn().mockResolvedValue({
    ok: true,
    categories: [{ id: 9, name: 'General Knowledge' }],
  }),
}));

vi.mock('../../src/fetcher/question-file.js', () => ({
  saveAnswers: vi.fn().mockResolvedValue(undefined),
}));

// -----------------------------------------------------------------------
// Now import the module under test
// -----------------------------------------------------------------------
import { setupWebSocket } from '../../src/transport/ws-adapter.js';
import { RoomManager } from '../../src/session/manager.js';

// -----------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------
function makeEnv() {
  // Reset the WSS listener registry each time
  wssListeners = {};

  const manager = new RoomManager();
  const room = manager.createRoom();
  const fakeServer = {}; // adapter just passes this to new WebSocketServer({ server })

  const { wss, broadcastToRoom, sendToPlayer } = setupWebSocket(fakeServer, manager);

  return { manager, room, wss: fakeWss, broadcastToRoom, sendToPlayer };
}

/** Simulate a connection + JOIN_LOBBY for a player. Returns { ws, meta-like info }. */
function connectPlayer(env, username, roomCode) {
  const { room } = env;
  const code = roomCode || room.code;
  const ws = makeFakeWs(code, 'player');
  const req = makeFakeReq(`/ws/player/${code}`, 'localhost');
  fakeWss.emit('connection', ws, req);

  // Send JOIN_LOBBY
  ws.emit('message', JSON.stringify({ type: 'JOIN_LOBBY', username }));
  return ws;
}

/** Grab the playerId from the JOIN_OK response. */
function getPlayerId(ws) {
  const joinOk = ws._sent.find(m => m.type === 'JOIN_OK');
  return joinOk ? joinOk.playerId : null;
}

// -----------------------------------------------------------------------
// Connection handling
// -----------------------------------------------------------------------
describe('ws-adapter - connection handling', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('sends LOBBY_UPDATE on connect', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    const lobbyUpdate = ws._sent.find(m => m.type === 'LOBBY_UPDATE');
    expect(lobbyUpdate).toBeDefined();
  });

  it('sends DISPLAY_OK + LOBBY_UPDATE for host role', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'host');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/host/${env.room.code}`));
    expect(ws._sent.find(m => m.type === 'DISPLAY_OK')).toBeDefined();
    expect(ws._sent.find(m => m.type === 'LOBBY_UPDATE')).toBeDefined();
  });

  it('closes connection for invalid path', () => {
    env = makeEnv();
    const ws = makeFakeWs('', 'player');
    fakeWss.emit('connection', ws, makeFakeReq('/invalid'));
    expect(ws.close).toHaveBeenCalled();
  });

  it('closes connection for invalid role', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'spectator');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/spectator/${env.room.code}`));
    expect(ws.close).toHaveBeenCalled();
  });

  it('closes connection when room not found', () => {
    env = makeEnv();
    const ws = makeFakeWs('ZZZZ', 'player');
    fakeWss.emit('connection', ws, makeFakeReq('/ws/player/ZZZZ'));
    expect(ws.close).toHaveBeenCalled();
    const errMsg = ws._sent.find(m => m.type === 'ERROR');
    expect(errMsg).toBeDefined();
    expect(errMsg.message).toMatch(/Room not found/i);
  });
});

// -----------------------------------------------------------------------
// JOIN_LOBBY
// -----------------------------------------------------------------------
describe('ws-adapter - JOIN_LOBBY', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('sends JOIN_OK with playerId and avatar', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const joinOk = ws._sent.find(m => m.type === 'JOIN_OK');
    expect(joinOk).toBeDefined();
    expect(joinOk.playerId).toBeTruthy();
    expect(joinOk.avatar).toBeTruthy();
  });

  it('adds player to room', () => {
    env = makeEnv();
    connectPlayer(env, 'Alice');
    expect(env.room.players.size).toBe(1);
  });

  it('returns ERROR if username is missing', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    ws.emit('message', JSON.stringify({ type: 'JOIN_LOBBY' }));
    const err = ws._sent.find(m => m.type === 'ERROR');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/username required/i);
  });

  it('reconnects existing player by username', () => {
    env = makeEnv();
    const ws1 = connectPlayer(env, 'Alice');
    const playerId1 = getPlayerId(ws1);

    // Simulate disconnect
    ws1.emit('close');

    // Reconnect with same username on new socket
    const ws2 = connectPlayer(env, 'Alice');
    const playerId2 = getPlayerId(ws2);

    expect(playerId2).toBe(playerId1);
    expect(env.room.players.size).toBe(1);
  });

  it('broadcasts LOBBY_UPDATE to room after join', () => {
    env = makeEnv();
    // Connect a host first so we can observe broadcasts
    const hostWs = makeFakeWs(env.room.code, 'host');
    fakeWss.emit('connection', hostWs, makeFakeReq(`/ws/host/${env.room.code}`));
    const sentBefore = hostWs._sent.length;

    connectPlayer(env, 'Alice');

    const updates = hostWs._sent.slice(sentBefore).filter(m => m.type === 'LOBBY_UPDATE');
    expect(updates.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// SET_READY
// -----------------------------------------------------------------------
describe('ws-adapter - SET_READY', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('updates player ready state', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws);
    ws.emit('message', JSON.stringify({ type: 'SET_READY', ready: true }));
    expect(env.room.players.get(playerId).ready).toBe(true);
  });

  it('returns ERROR if not yet joined', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    ws.emit('message', JSON.stringify({ type: 'SET_READY', ready: true }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /not joined/i.test(m.message));
    expect(err).toBeDefined();
  });
});

// -----------------------------------------------------------------------
// SUGGEST_GAME
// -----------------------------------------------------------------------
describe('ws-adapter - SUGGEST_GAME', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('records game suggestion', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws);
    ws.emit('message', JSON.stringify({ type: 'SUGGEST_GAME', gameType: 'spy' }));
    expect(env.room.gameSuggestions.get(playerId)).toBe('spy');
  });

  it('returns ERROR if gameType missing', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    ws.emit('message', JSON.stringify({ type: 'SUGGEST_GAME' }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /gameType required/i.test(m.message));
    expect(err).toBeDefined();
  });
});

// -----------------------------------------------------------------------
// Message dispatch — unknown type
// -----------------------------------------------------------------------
describe('ws-adapter - message dispatch', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('returns ERROR for unknown message type', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    ws.emit('message', JSON.stringify({ type: 'TOTALLY_UNKNOWN' }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /unknown message type/i.test(m.message));
    expect(err).toBeDefined();
  });

  it('returns ERROR for invalid JSON', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    ws.emit('message', 'not-valid-json{{{');
    const err = ws._sent.find(m => m.type === 'ERROR' && /invalid json/i.test(m.message));
    expect(err).toBeDefined();
  });

  it('returns ERROR for message missing type', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    ws.emit('message', JSON.stringify({ data: 'no type here' }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /missing message type/i.test(m.message));
    expect(err).toBeDefined();
  });
});

// -----------------------------------------------------------------------
// Rate limiting
// -----------------------------------------------------------------------
describe('ws-adapter - rate limiting', () => {
  let env;
  afterEach(() => {
    vi.useRealTimers();
    env.manager.destroy();
  });

  it('allows up to RATE_LIMIT_MAX (30) messages per second', () => {
    vi.useFakeTimers();
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');

    let errors = 0;
    // Send 35 messages — first 30 should pass, rest should be rate-limited
    for (let i = 0; i < 35; i++) {
      ws.emit('message', JSON.stringify({ type: 'SUGGEST_GAME', gameType: 'spy' }));
    }
    errors = ws._sent.filter(m => m.type === 'ERROR' && /rate limit/i.test(m.message)).length;
    expect(errors).toBeGreaterThan(0);
  });

  it('rate limit resets after the window expires', () => {
    vi.useFakeTimers();
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');

    // Saturate the rate limit
    for (let i = 0; i < 31; i++) {
      ws.emit('message', JSON.stringify({ type: 'SUGGEST_GAME', gameType: 'spy' }));
    }
    const errsBefore = ws._sent.filter(m => m.type === 'ERROR' && /rate limit/i.test(m.message)).length;
    expect(errsBefore).toBeGreaterThan(0);

    // Advance past the 1-second window
    vi.advanceTimersByTime(1100);

    // Should now accept messages again — send one more
    ws.emit('message', JSON.stringify({ type: 'SUGGEST_GAME', gameType: 'spy' }));
    const errsAfter = ws._sent.filter(m => m.type === 'ERROR' && /rate limit/i.test(m.message)).length;
    // No new rate-limit errors were added after the window reset
    expect(errsAfter).toBe(errsBefore);
  });

  it('chat rate limit restricts to CHAT_RATE_MAX (3) per 5 seconds', () => {
    vi.useFakeTimers();
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');

    // Send 5 chat messages in a row — 4th and 5th should be rate-limited
    for (let i = 0; i < 5; i++) {
      ws.emit('message', JSON.stringify({ type: 'CHAT_MESSAGE', text: `msg ${i}` }));
    }
    const chatErrors = ws._sent.filter(
      m => m.type === 'ERROR' && /chat rate limit/i.test(m.message)
    ).length;
    expect(chatErrors).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// Reconnection grace period
// -----------------------------------------------------------------------
describe('ws-adapter - reconnection grace period', () => {
  let env;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    env.manager.destroy();
  });

  it('player marked as disconnected immediately on close, not removed', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws);
    ws.emit('close');

    const player = env.room.players.get(playerId);
    expect(player).toBeDefined();
    expect(player.connected).toBe(false);
  });

  it('player still in room during 30-second grace window', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws);
    ws.emit('close');

    vi.advanceTimersByTime(15_000); // half the grace period
    expect(env.room.players.has(playerId)).toBe(true);
  });

  it('player removed after 30-second grace period expires', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws);
    ws.emit('close');

    vi.advanceTimersByTime(31_000); // past the grace period
    expect(env.room.players.has(playerId)).toBe(false);
  });

  it('reconnect before grace period cancels removal', () => {
    env = makeEnv();
    const ws1 = connectPlayer(env, 'Alice');
    const playerId = getPlayerId(ws1);
    ws1.emit('close');

    // Reconnect within the 30-second window
    vi.advanceTimersByTime(15_000);
    connectPlayer(env, 'Alice'); // same username → reconnection

    // Advance past the original grace period deadline
    vi.advanceTimersByTime(20_000);

    // Player should still be in the room (grace timer was cancelled)
    expect(env.room.players.has(playerId)).toBe(true);
    expect(env.room.players.get(playerId).connected).toBe(true);
  });

  it('broadcasts LOBBY_UPDATE when player disconnects', () => {
    env = makeEnv();
    // Connect a second player to observe broadcast
    const ws1 = connectPlayer(env, 'Alice');
    const ws2 = connectPlayer(env, 'Bob');
    const sentBefore = ws2._sent.length;

    ws1.emit('close');

    const updates = ws2._sent.slice(sentBefore).filter(m => m.type === 'LOBBY_UPDATE');
    expect(updates.length).toBeGreaterThan(0);
  });

  it('broadcasts LOBBY_UPDATE when player is removed after grace period', () => {
    env = makeEnv();
    const ws1 = connectPlayer(env, 'Alice');
    const ws2 = connectPlayer(env, 'Bob');
    ws1.emit('close');

    const sentBefore = ws2._sent.length;
    vi.advanceTimersByTime(31_000);

    const updates = ws2._sent.slice(sentBefore).filter(m => m.type === 'LOBBY_UPDATE');
    expect(updates.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// GAME_ACTION dispatch
// -----------------------------------------------------------------------
describe('ws-adapter - GAME_ACTION', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('returns ERROR when no game is running', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    ws.emit('message', JSON.stringify({
      type: 'GAME_ACTION',
      action: { type: 'increment' },
    }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /no game running/i.test(m.message));
    expect(err).toBeDefined();
  });

  it('returns ERROR when action type is missing', () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    ws.emit('message', JSON.stringify({
      type: 'GAME_ACTION',
      action: {},
    }));
    const err = ws._sent.find(m => m.type === 'ERROR');
    expect(err).toBeDefined();
  });

  it('processes a valid game action and sends GAME_STATE', async () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Alice');
    connectPlayer(env, 'Bob');

    // Start number-guess directly on the room
    await env.room.startGame('number-guess', {});

    // Send a guess action
    ws.emit('message', JSON.stringify({
      type: 'GAME_ACTION',
      action: { type: 'guess', number: 50 },
    }));

    const gameStates = ws._sent.filter(m => m.type === 'GAME_STATE');
    expect(gameStates.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------
// RETURN_TO_LOBBY
// -----------------------------------------------------------------------
describe('ws-adapter - RETURN_TO_LOBBY', () => {
  let env;
  afterEach(() => env.manager.destroy());

  it('returns ERROR when not joined', () => {
    env = makeEnv();
    const ws = makeFakeWs(env.room.code, 'player');
    fakeWss.emit('connection', ws, makeFakeReq(`/ws/player/${env.room.code}`));
    ws.emit('message', JSON.stringify({ type: 'RETURN_TO_LOBBY' }));
    const err = ws._sent.find(m => m.type === 'ERROR' && /not joined/i.test(m.message));
    expect(err).toBeDefined();
  });

  it('returns ERROR when player is not admin', () => {
    env = makeEnv();
    connectPlayer(env, 'Admin');    // first → admin
    const ws2 = connectPlayer(env, 'Bob'); // second → not admin
    ws2.emit('message', JSON.stringify({ type: 'RETURN_TO_LOBBY' }));
    const err = ws2._sent.find(m => m.type === 'ERROR' && /only admin/i.test(m.message));
    expect(err).toBeDefined();
  });

  it('admin can return to lobby and triggers LOBBY_UPDATE', async () => {
    env = makeEnv();
    const ws = connectPlayer(env, 'Admin');
    connectPlayer(env, 'Bob');
    await env.room.startGame('number-guess', {});
    expect(env.room.game).not.toBeNull();

    ws.emit('message', JSON.stringify({ type: 'RETURN_TO_LOBBY' }));
    expect(env.room.game).toBeNull();

    const update = ws._sent.find(m => m.type === 'LOBBY_UPDATE');
    expect(update).toBeDefined();
  });
});
