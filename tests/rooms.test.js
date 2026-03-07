'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { rooms, AVATARS, nameToAvatar, generateRoomCode, createRoom, buildLobbyState } = require('../server/rooms');

describe('nameToAvatar', () => {
  test('returns an emoji from AVATARS list', () => {
    const avatar = nameToAvatar('Alice');
    assert.ok(AVATARS.includes(avatar));
  });

  test('is deterministic for same name', () => {
    assert.strictEqual(nameToAvatar('Alice'), nameToAvatar('Alice'));
  });

  test('different names can produce different avatars', () => {
    // Not guaranteed for any two names, but statistically very likely over many
    const avatars = new Set();
    for (let i = 0; i < 100; i++) {
      avatars.add(nameToAvatar(`Player${i}`));
    }
    assert.ok(avatars.size > 1, 'Expected multiple different avatars');
  });
});

describe('generateRoomCode', () => {
  test('produces 4-character code', () => {
    const code = generateRoomCode();
    assert.strictEqual(code.length, 4);
  });

  test('uses only allowed characters (no I, O, 0)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      assert.ok(/^[A-Z]+$/.test(code), `Code ${code} should be uppercase letters`);
      assert.ok(!code.includes('I'), 'Should not contain I');
      assert.ok(!code.includes('O'), 'Should not contain O');
    }
  });

  test('generates unique codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }
    assert.strictEqual(codes.size, 100, 'All codes should be unique');
  });
});

describe('createRoom', () => {
  beforeEach(() => {
    rooms.clear();
  });

  test('creates room with correct code', () => {
    const room = createRoom('ABCD');
    assert.ok(rooms.has('ABCD'));
    assert.strictEqual(room.code, 'ABCD');
  });

  test('initializes all required fields', () => {
    const room = createRoom('TEST');
    assert.strictEqual(room.adminUsername, null);
    assert.strictEqual(room.activeMiniGame, 'lobby');
    assert.strictEqual(room.game, null);
    assert.strictEqual(room.shitheadGame, null);
    assert.strictEqual(room.cahGame, null);
    assert.ok(room.playerSockets instanceof Set);
    assert.ok(room.displaySockets instanceof Set);
    assert.ok(room.wsToUsername instanceof Map);
    assert.ok(room.players instanceof Map);
    assert.ok(room.gameSuggestions instanceof Map);
    assert.ok(room.readyPlayers instanceof Set);
    assert.strictEqual(room.language, 'en');
    assert.ok(room.categoryVotes instanceof Map);
    assert.ok(typeof room.createdAt === 'number');
    assert.ok(typeof room._broadcast === 'function');
  });
});

describe('buildLobbyState', () => {
  beforeEach(() => {
    rooms.clear();
  });

  test('returns correct structure with no players', () => {
    const room = createRoom('TEST');
    const state = buildLobbyState(room);
    assert.deepStrictEqual(state.players, []);
    assert.strictEqual(state.readyCount, 0);
    assert.strictEqual(state.totalCount, 0);
    assert.strictEqual(state.allReady, false);
    assert.strictEqual(state.allVoted, false);
    assert.strictEqual(state.activeMiniGame, 'lobby');
    assert.strictEqual(state.language, 'en');
  });

  test('includes player info with avatars and ready status', () => {
    const room = createRoom('TEST');
    room.adminUsername = 'Alice';
    room.players.set('Alice', { ws: null, isReady: false, avatar: '🦊' });
    room.players.set('Bob', { ws: null, isReady: false, avatar: '🐸' });
    room.readyPlayers.add('Alice');

    const state = buildLobbyState(room);
    assert.strictEqual(state.players.length, 2);
    const alice = state.players.find(p => p.username === 'Alice');
    assert.ok(alice);
    assert.strictEqual(alice.isReady, true);
    assert.strictEqual(alice.isAdmin, true);
    const bob = state.players.find(p => p.username === 'Bob');
    assert.strictEqual(bob.isReady, false);
    assert.strictEqual(bob.isAdmin, false);
  });

  test('allReady is true when all players ready', () => {
    const room = createRoom('TEST');
    room.players.set('Alice', { ws: null, avatar: '🦊' });
    room.players.set('Bob', { ws: null, avatar: '🐸' });
    room.readyPlayers.add('Alice');
    room.readyPlayers.add('Bob');
    const state = buildLobbyState(room);
    assert.strictEqual(state.allReady, true);
    assert.strictEqual(state.readyCount, 2);
  });

  test('tallies game suggestions', () => {
    const room = createRoom('TEST');
    room.players.set('Alice', { ws: null, avatar: '🦊' });
    room.players.set('Bob', { ws: null, avatar: '🐸' });
    room.gameSuggestions.set('Alice', 'quiz');
    room.gameSuggestions.set('Bob', 'quiz');
    const state = buildLobbyState(room);
    assert.strictEqual(state.gameSuggestions.quiz, 2);
  });

  test('tallies category votes', () => {
    const room = createRoom('TEST');
    room.players.set('Alice', { ws: null, avatar: '🦊' });
    room.players.set('Bob', { ws: null, avatar: '🐸' });
    room.categoryVotes.set('Alice', [9, 11]);
    room.categoryVotes.set('Bob', [9, 15]);
    const state = buildLobbyState(room);
    assert.strictEqual(state.categoryVotes[9], 2);
    assert.strictEqual(state.categoryVotes[11], 1);
    assert.strictEqual(state.categoryVotes[15], 1);
    assert.strictEqual(state.allVoted, true);
    assert.strictEqual(state.votedCount, 2);
  });

  test('allVoted false when not all have voted', () => {
    const room = createRoom('TEST');
    room.players.set('Alice', { ws: null, avatar: '🦊' });
    room.players.set('Bob', { ws: null, avatar: '🐸' });
    room.categoryVotes.set('Alice', [9]);
    const state = buildLobbyState(room);
    assert.strictEqual(state.allVoted, false);
    assert.strictEqual(state.votedCount, 1);
  });
});
