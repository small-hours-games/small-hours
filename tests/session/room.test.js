// Unit tests for src/session/room.js
// Covers: player lifecycle (add/remove), admin promotion, ready state,
// game suggestions, game registry, getState, toJSON.
// Note: room-voting.test.js covers voting — this file covers core lifecycle.

import { describe, it, expect } from 'vitest';
import { Room, generateRoomCode } from '../../src/session/room.js';

// -----------------------------------------------------------------------
// generateRoomCode
// -----------------------------------------------------------------------
describe('generateRoomCode', () => {
  it('returns a 4-character string', () => {
    expect(generateRoomCode()).toHaveLength(4);
  });

  it('consists only of valid characters (no I, O, S)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXYZ0-9]{4}$/);
      expect(code).not.toMatch(/[IOS]/);
    }
  });

  it('produces different codes across calls (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// -----------------------------------------------------------------------
// Room constructor
// -----------------------------------------------------------------------
describe('Room - constructor', () => {
  it('stores the provided code', () => {
    const room = new Room('ABCD');
    expect(room.code).toBe('ABCD');
  });

  it('starts with no players', () => {
    const room = new Room('ABCD');
    expect(room.players.size).toBe(0);
  });

  it('starts with no game', () => {
    const room = new Room('ABCD');
    expect(room.game).toBeNull();
  });

  it('sets createdAt and lastActivity to recent timestamps', () => {
    const before = Date.now();
    const room = new Room('ABCD');
    const after = Date.now();
    expect(room.createdAt).toBeGreaterThanOrEqual(before);
    expect(room.createdAt).toBeLessThanOrEqual(after);
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

// -----------------------------------------------------------------------
// addPlayer
// -----------------------------------------------------------------------
describe('Room - addPlayer', () => {
  it('returns playerId and avatar', () => {
    const room = new Room('ABCD');
    const result = room.addPlayer('Alice');
    expect(result).toHaveProperty('playerId');
    expect(result).toHaveProperty('avatar');
  });

  it('first player becomes admin', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    expect(room.players.get(playerId).isAdmin).toBe(true);
  });

  it('second player is not admin', () => {
    const room = new Room('ABCD');
    room.addPlayer('Alice');
    const { playerId } = room.addPlayer('Bob');
    expect(room.players.get(playerId).isAdmin).toBe(false);
  });

  it('player starts with ready: false', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    expect(room.players.get(playerId).ready).toBe(false);
  });

  it('player starts as connected', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    expect(room.players.get(playerId).connected).toBe(true);
  });

  it('player starts as not bot', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    expect(room.players.get(playerId).isBot).toBe(false);
  });

  it('sanitizes username: strips HTML tags', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('<b>Hack</b>');
    expect(room.players.get(playerId).username).toBe('Hack');
  });

  it('sanitizes username: falls back to "Player" for blank input', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('   ');
    expect(room.players.get(playerId).username).toBe('Player');
  });

  it('sanitizes username: truncates to 20 characters', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('A'.repeat(30));
    expect(room.players.get(playerId).username).toHaveLength(20);
  });

  it('deterministic avatar for same username', () => {
    const r1 = new Room('AAA1');
    const r2 = new Room('AAA2');
    const { avatar: a1 } = r1.addPlayer('Alice');
    const { avatar: a2 } = r2.addPlayer('Alice');
    expect(a1).toBe(a2);
  });

  it('updates lastActivity', () => {
    const room = new Room('ABCD');
    const before = Date.now();
    room.addPlayer('Alice');
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });

  it('each call produces a unique playerId', () => {
    const room = new Room('ABCD');
    const ids = Array.from({ length: 5 }, (_, i) => room.addPlayer(`Player${i}`).playerId);
    expect(new Set(ids).size).toBe(5);
  });
});

// -----------------------------------------------------------------------
// removePlayer
// -----------------------------------------------------------------------
describe('Room - removePlayer', () => {
  it('removes the player from the map', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.removePlayer(playerId);
    expect(room.players.has(playerId)).toBe(false);
  });

  it('does nothing when player does not exist', () => {
    const room = new Room('ABCD');
    room.addPlayer('Alice');
    expect(() => room.removePlayer('nonexistent')).not.toThrow();
    expect(room.players.size).toBe(1);
  });

  it('removes player gameSuggestions entry', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.gameSuggestions.set(playerId, 'quiz');
    room.removePlayer(playerId);
    expect(room.gameSuggestions.has(playerId)).toBe(false);
  });

  it('updates lastActivity', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    const before = Date.now();
    room.removePlayer(playerId);
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

// -----------------------------------------------------------------------
// Admin promotion
// -----------------------------------------------------------------------
describe('Room - admin promotion', () => {
  it('promotes first connected player when admin leaves', () => {
    const room = new Room('ABCD');
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: bobId } = room.addPlayer('Bob');
    room.removePlayer(adminId);
    expect(room.players.get(bobId).isAdmin).toBe(true);
  });

  it('promotes first player (even if disconnected) if no one is connected', () => {
    const room = new Room('ABCD');
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: bobId } = room.addPlayer('Bob');
    // Mark bob as disconnected
    room.players.get(bobId).connected = false;
    room.removePlayer(adminId);
    // Bob should still be promoted (only player)
    expect(room.players.get(bobId).isAdmin).toBe(true);
  });

  it('prefers connected players over disconnected for promotion', () => {
    const room = new Room('ABCD');
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: bobId } = room.addPlayer('Bob');
    const { playerId: charlieId } = room.addPlayer('Charlie');
    // Bob is disconnected
    room.players.get(bobId).connected = false;
    room.removePlayer(adminId);
    // Charlie should be promoted (connected), not Bob
    expect(room.players.get(charlieId).isAdmin).toBe(true);
    expect(room.players.get(bobId).isAdmin).toBe(false);
  });

  it('no promotion needed when room becomes empty', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Admin');
    room.removePlayer(playerId);
    expect(room.players.size).toBe(0);
  });

  it('non-admin removal does not change admin', () => {
    const room = new Room('ABCD');
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: bobId } = room.addPlayer('Bob');
    room.removePlayer(bobId);
    expect(room.players.get(adminId).isAdmin).toBe(true);
  });
});

// -----------------------------------------------------------------------
// setReady
// -----------------------------------------------------------------------
describe('Room - setReady', () => {
  it('sets ready to true', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.setReady(playerId, true);
    expect(room.players.get(playerId).ready).toBe(true);
  });

  it('sets ready to false', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.setReady(playerId, true);
    room.setReady(playerId, false);
    expect(room.players.get(playerId).ready).toBe(false);
  });

  it('does nothing when player does not exist', () => {
    const room = new Room('ABCD');
    expect(() => room.setReady('nonexistent', true)).not.toThrow();
  });

  it('updates lastActivity', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    const before = Date.now();
    room.setReady(playerId, true);
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

// -----------------------------------------------------------------------
// suggestGame
// -----------------------------------------------------------------------
describe('Room - suggestGame', () => {
  it('records a game suggestion from a player', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.suggestGame(playerId, 'quiz');
    expect(room.gameSuggestions.get(playerId)).toBe('quiz');
  });

  it('overwrites previous suggestion from same player', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    room.suggestGame(playerId, 'quiz');
    room.suggestGame(playerId, 'spy');
    expect(room.gameSuggestions.get(playerId)).toBe('spy');
  });

  it('ignores suggestion from non-existent player', () => {
    const room = new Room('ABCD');
    room.suggestGame('ghost', 'quiz');
    expect(room.gameSuggestions.has('ghost')).toBe(false);
  });

  it('updates lastActivity', () => {
    const room = new Room('ABCD');
    const { playerId } = room.addPlayer('Alice');
    const before = Date.now();
    room.suggestGame(playerId, 'quiz');
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

// -----------------------------------------------------------------------
// getState
// -----------------------------------------------------------------------
describe('Room - getState', () => {
  it('returns the room code', () => {
    const room = new Room('TEST');
    expect(room.getState().code).toBe('TEST');
  });

  it('includes all players in array form', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    const { players } = room.getState();
    expect(players).toHaveLength(2);
    expect(players[0]).toHaveProperty('playerId');
    expect(players[0]).toHaveProperty('username');
  });

  it('gameRunning is false when no game', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    expect(room.getState().gameRunning).toBe(false);
  });

  it('gameRunning is true when game is set', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.game = { id: 'fake' };
    expect(room.getState().gameRunning).toBe(true);
  });

  it('includes gameSuggestions as object', () => {
    const room = new Room('TEST');
    const { playerId } = room.addPlayer('Alice');
    room.suggestGame(playerId, 'spy');
    const state = room.getState();
    expect(state.gameSuggestions[playerId]).toBe('spy');
  });
});

// -----------------------------------------------------------------------
// startGame — game registry
// -----------------------------------------------------------------------
describe('Room - startGame (registry)', () => {
  it('throws for an unknown game type', async () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    await expect(room.startGame('unknown-game', {})).rejects.toThrow(/Unknown game type/);
  });

  it('throws when no connected players', async () => {
    const room = new Room('TEST');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.players.get(playerId).connected = false;
    await expect(room.startGame('number-guess', {})).rejects.toThrow(/requires at least 2 players/);
  });

  it('can start number-guess (sync setup, no prepare)', async () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    const game = await room.startGame('number-guess', {});
    expect(game).toBeDefined();
    expect(room.game).toBe(game);
  });

  it('clears gameSuggestions after starting a game', async () => {
    const room = new Room('TEST');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.suggestGame(playerId, 'quiz');
    await room.startGame('number-guess', {});
    expect(room.gameSuggestions.size).toBe(0);
  });
});

// -----------------------------------------------------------------------
// endGame
// -----------------------------------------------------------------------
describe('Room - endGame', () => {
  it('clears the game reference', async () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    await room.startGame('number-guess', {});
    room.endGame();
    expect(room.game).toBeNull();
  });

  it('resets all ready states', async () => {
    const room = new Room('TEST');
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob');
    room.setReady(playerId, true);
    await room.startGame('number-guess', {});
    room.endGame();
    expect(room.players.get(playerId).ready).toBe(false);
  });

  it('updates lastActivity', () => {
    const room = new Room('TEST');
    room.game = { id: 'fake' };
    const before = Date.now();
    room.endGame();
    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

// -----------------------------------------------------------------------
// toJSON
// -----------------------------------------------------------------------
describe('Room - toJSON', () => {
  it('returns code and language', () => {
    const room = new Room('JSON');
    const json = room.toJSON();
    expect(json.code).toBe('JSON');
    expect(json).toHaveProperty('language');
  });

  it('includes players as plain object keyed by playerId', () => {
    const room = new Room('JSON');
    const { playerId } = room.addPlayer('Alice');
    const json = room.toJSON();
    expect(json.players).toHaveProperty(playerId);
    expect(json.players[playerId].username).toBe('Alice');
  });

  it('game is null when no game running', () => {
    const room = new Room('JSON');
    expect(room.toJSON().game).toBeNull();
  });

  it('game contains id when a game is running', async () => {
    const room = new Room('JSON');
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    const game = await room.startGame('number-guess', {});
    const json = room.toJSON();
    expect(json.game.id).toBe(game.id);
  });
});
