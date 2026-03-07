'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Pre-populate require cache with mocks for transitive deps
const rootDir = path.join(__dirname, '..');

// Mock questions.js (required by game.js)
require.cache[require.resolve(path.join(rootDir, 'questions'))] = {
  id: require.resolve(path.join(rootDir, 'questions')),
  filename: require.resolve(path.join(rootDir, 'questions')),
  loaded: true,
  exports: {
    fetchQuestions: async () => [],
    fetchCategories: async () => [],
  },
};

// Mock translator.js (required by game.js)
require.cache[require.resolve(path.join(rootDir, 'translator'))] = {
  id: require.resolve(path.join(rootDir, 'translator')),
  filename: require.resolve(path.join(rootDir, 'translator')),
  loaded: true,
  exports: { translateQuestions: async (q) => q },
};

// Mock local-db.js (required by game.js and questions.js)
require.cache[require.resolve(path.join(rootDir, 'local-db'))] = {
  id: require.resolve(path.join(rootDir, 'local-db')),
  filename: require.resolve(path.join(rootDir, 'local-db')),
  loaded: true,
  exports: {
    markQuestionsUsed: () => {},
    getQuestionsFromLocalDB: () => null,
    downloadDatabase: async () => ({ ok: true }),
    getState: () => ({ active: false, current: 0, total: 0, label: '', error: null }),
    dbStatus: () => ({ exists: false }),
    DIFFICULTY_CONFIG: {
      easy: { filter: ['easy'], timeMult: 1.0, scoreMult: 1.0 },
    },
  },
};

const { handleMessage, handlePlayerDisconnect, maybeCleanupRoom } = require('../server/handlers');
const { createRoom, rooms } = require('../server/rooms');

function mockWs() {
  const sent = [];
  return {
    readyState: 1,
    send: (data) => sent.push(JSON.parse(data)),
    close: () => {},
    _sent: sent,
  };
}

function setupRoom() {
  rooms.clear();
  const room = createRoom('TEST');
  room.adminUsername = 'Alice';

  const aliceWs = mockWs();
  const bobWs = mockWs();
  room.players.set('Alice', { ws: aliceWs, isReady: false, avatar: '🦊' });
  room.players.set('Bob', { ws: bobWs, isReady: false, avatar: '🐸' });
  room.wsToUsername.set(aliceWs, 'Alice');
  room.wsToUsername.set(bobWs, 'Bob');
  room.playerSockets.add(aliceWs);
  room.playerSockets.add(bobWs);

  return { room, aliceWs, bobWs };
}

describe('handleMessage - Player JOIN', () => {
  test('JOIN_LOBBY creates player and assigns admin', () => {
    rooms.clear();
    const room = createRoom('TEST');
    const ws = mockWs();
    room.playerSockets.add(ws);
    handleMessage(ws, 'player', { type: 'JOIN_LOBBY', username: 'Alice' }, room);
    assert.strictEqual(room.adminUsername, 'Alice');
    assert.ok(room.players.has('Alice'));
    const joinOk = ws._sent.find(m => m.type === 'JOIN_OK');
    assert.ok(joinOk);
    assert.strictEqual(joinOk.isAdmin, true);
  });

  test('JOIN_LOBBY rejects empty username', () => {
    rooms.clear();
    const room = createRoom('TEST');
    const ws = mockWs();
    handleMessage(ws, 'player', { type: 'JOIN_LOBBY', username: '' }, room);
    const err = ws._sent.find(m => m.type === 'ERROR' && m.code === 'INVALID_USERNAME');
    assert.ok(err);
  });

  test('JOIN_LOBBY truncates username to 20 chars', () => {
    rooms.clear();
    const room = createRoom('TEST');
    const ws = mockWs();
    room.playerSockets.add(ws);
    handleMessage(ws, 'player', { type: 'JOIN_LOBBY', username: 'A'.repeat(25) }, room);
    assert.ok(room.players.has('A'.repeat(20)));
  });
});

describe('handleMessage - SET_READY', () => {
  test('SET_READY adds player to readyPlayers', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'SET_READY', ready: true }, room);
    assert.ok(room.readyPlayers.has('Alice'));
  });

  test('SET_READY false removes from readyPlayers', () => {
    const { room, aliceWs } = setupRoom();
    room.readyPlayers.add('Alice');
    handleMessage(aliceWs, 'player', { type: 'SET_READY', ready: false }, room);
    assert.ok(!room.readyPlayers.has('Alice'));
  });
});

describe('handleMessage - SUGGEST_GAME', () => {
  test('valid game type is recorded', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'SUGGEST_GAME', gameType: 'quiz' }, room);
    assert.strictEqual(room.gameSuggestions.get('Alice'), 'quiz');
  });

  test('invalid game type is ignored', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'SUGGEST_GAME', gameType: 'invalid' }, room);
    assert.ok(!room.gameSuggestions.has('Alice'));
  });
});

describe('handleMessage - Admin Authorization', () => {
  test('START_MINI_GAME rejected for non-admin', () => {
    const { room, bobWs } = setupRoom();
    handleMessage(bobWs, 'player', { type: 'START_MINI_GAME', gameType: 'quiz' }, room);
    const err = bobWs._sent.find(m => m.type === 'ERROR' && m.code === 'NOT_ADMIN');
    assert.ok(err);
  });

  test('RETURN_TO_LOBBY rejected for non-admin', () => {
    const { room, bobWs } = setupRoom();
    handleMessage(bobWs, 'player', { type: 'RETURN_TO_LOBBY' }, room);
    const err = bobWs._sent.find(m => m.type === 'ERROR' && m.code === 'NOT_ADMIN');
    assert.ok(err);
  });

  test('REMOVE_PLAYER rejected for non-admin', () => {
    const { room, bobWs } = setupRoom();
    handleMessage(bobWs, 'player', { type: 'REMOVE_PLAYER', username: 'Alice' }, room);
    const err = bobWs._sent.find(m => m.type === 'ERROR' && m.code === 'NOT_ADMIN');
    assert.ok(err);
  });

  test('SKIP ignored for non-admin', () => {
    const { room, bobWs } = setupRoom();
    // Should not crash even without game
    handleMessage(bobWs, 'player', { type: 'SKIP' }, room);
  });

  test('SET_LANGUAGE ignored for non-admin', () => {
    const { room, bobWs } = setupRoom();
    handleMessage(bobWs, 'player', { type: 'SET_LANGUAGE', lang: 'sv' }, room);
    assert.strictEqual(room.language, 'en');
  });

  test('SET_LANGUAGE works for admin', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'SET_LANGUAGE', lang: 'sv' }, room);
    assert.strictEqual(room.language, 'sv');
  });

  test('SET_LANGUAGE rejects invalid lang format', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'SET_LANGUAGE', lang: 'invalid' }, room);
    assert.strictEqual(room.language, 'en');
  });
});

describe('handleMessage - Player Count Checks', () => {
  test('shithead requires 2+ players', () => {
    rooms.clear();
    const room = createRoom('TEST');
    room.adminUsername = 'Alice';
    const ws = mockWs();
    room.players.set('Alice', { ws, avatar: '🦊' });
    room.wsToUsername.set(ws, 'Alice');
    handleMessage(ws, 'player', { type: 'START_MINI_GAME', gameType: 'shithead' }, room);
    const err = ws._sent.find(m => m.code === 'NOT_ENOUGH_PLAYERS');
    assert.ok(err);
  });

  test('cah requires 3+ players', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'START_MINI_GAME', gameType: 'cah' }, room);
    const err = aliceWs._sent.find(m => m.code === 'NOT_ENOUGH_PLAYERS');
    assert.ok(err);
  });

  test('spy requires 3+ players', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'START_MINI_GAME', gameType: 'spy' }, room);
    const err = aliceWs._sent.find(m => m.code === 'NOT_ENOUGH_PLAYERS');
    assert.ok(err);
  });
});

describe('handleMessage - CATEGORY_VOTE', () => {
  test('valid vote is recorded', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'CATEGORY_VOTE', categories: [9, 11] }, room);
    assert.deepStrictEqual(room.categoryVotes.get('Alice'), [9, 11]);
  });

  test('vote limited to 3 categories', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'CATEGORY_VOTE', categories: [1, 2, 3, 4, 5] }, room);
    assert.strictEqual(room.categoryVotes.get('Alice').length, 3);
  });

  test('empty categories array is ignored', () => {
    const { room, aliceWs } = setupRoom();
    handleMessage(aliceWs, 'player', { type: 'CATEGORY_VOTE', categories: [] }, room);
    assert.ok(!room.categoryVotes.has('Alice'));
  });

  test('vote ignored outside lobby', () => {
    const { room, aliceWs } = setupRoom();
    room.activeMiniGame = 'quiz';
    handleMessage(aliceWs, 'player', { type: 'CATEGORY_VOTE', categories: [9] }, room);
    assert.ok(!room.categoryVotes.has('Alice'));
  });
});

describe('handleMessage - Display Messages', () => {
  test('RESTART from display resets room', () => {
    const { room } = setupRoom();
    const displayWs = mockWs();
    room.displaySockets.add(displayWs);
    room.activeMiniGame = 'quiz';
    handleMessage(displayWs, 'display', { type: 'RESTART' }, room);
    assert.strictEqual(room.activeMiniGame, 'lobby');
  });

  test('SET_LANGUAGE from display changes language', () => {
    const { room } = setupRoom();
    const displayWs = mockWs();
    room.displaySockets.add(displayWs);
    handleMessage(displayWs, 'display', { type: 'SET_LANGUAGE', lang: 'de' }, room);
    assert.strictEqual(room.language, 'de');
  });
});

describe('handlePlayerDisconnect', () => {
  test('removes player from lobby and broadcasts update', () => {
    const { room, bobWs } = setupRoom();
    handlePlayerDisconnect(bobWs, room);
    assert.ok(!room.players.has('Bob'));
  });

  test('hands off admin when admin disconnects', () => {
    const { room, aliceWs } = setupRoom();
    handlePlayerDisconnect(aliceWs, room);
    assert.strictEqual(room.adminUsername, 'Bob');
  });

  test('ignores stale ws (player already reconnected)', () => {
    const { room, aliceWs } = setupRoom();
    const newWs = mockWs();
    room.players.get('Alice').ws = newWs;
    handlePlayerDisconnect(aliceWs, room);
    assert.ok(room.players.has('Alice'));
  });

  test('during game: nulls ws but keeps player', () => {
    const { room, bobWs } = setupRoom();
    room.activeMiniGame = 'quiz';
    handlePlayerDisconnect(bobWs, room);
    assert.ok(!room.wsToUsername.has(bobWs));
  });
});

describe('maybeCleanupRoom', () => {
  test('does not delete room when sockets remain', () => {
    const { room } = setupRoom();
    maybeCleanupRoom(room);
    assert.ok(rooms.has('TEST'));
  });

  test('does not delete room during active game', () => {
    rooms.clear();
    const room = createRoom('TEST');
    room.activeMiniGame = 'quiz';
    maybeCleanupRoom(room);
    assert.ok(rooms.has('TEST'));
  });
});
