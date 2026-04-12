// Unit tests for src/session/manager.js
// Covers: room creation (code uniqueness), lookup, cleanup of stale rooms,
// player-to-room mapping.
// Uses vi.useFakeTimers() for cleanup interval tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager } from '../../src/session/manager.js';

// -----------------------------------------------------------------------
// Helper: create a fresh RoomManager per test (avoid shared singleton state)
// -----------------------------------------------------------------------
function makeManager() {
  return new RoomManager();
}

// -----------------------------------------------------------------------
// Room creation
// -----------------------------------------------------------------------
describe('RoomManager - createRoom', () => {
  let manager;
  afterEach(() => manager.destroy());

  it('returns a Room instance with a code', () => {
    manager = makeManager();
    const room = manager.createRoom();
    expect(room).toBeDefined();
    expect(typeof room.code).toBe('string');
    expect(room.code).toHaveLength(4);
  });

  it('stores the room so it can be retrieved by code', () => {
    manager = makeManager();
    const room = manager.createRoom();
    expect(manager.getRoom(room.code)).toBe(room);
  });

  it('codes are unique across multiple rooms', () => {
    manager = makeManager();
    const codes = new Set();
    for (let i = 0; i < 20; i++) {
      codes.add(manager.createRoom().code);
    }
    expect(codes.size).toBe(20);
  });

  it('room count increases with each created room', () => {
    manager = makeManager();
    manager.createRoom();
    manager.createRoom();
    expect(manager.stats().roomCount).toBe(2);
  });
});

// -----------------------------------------------------------------------
// Lookup
// -----------------------------------------------------------------------
describe('RoomManager - getRoom', () => {
  let manager;
  afterEach(() => manager.destroy());

  it('returns null for an unknown code', () => {
    manager = makeManager();
    expect(manager.getRoom('XXXX')).toBeNull();
  });

  it('returns the correct room for a known code', () => {
    manager = makeManager();
    const room = manager.createRoom();
    expect(manager.getRoom(room.code)).toBe(room);
  });

  it('returns null after room is removed', () => {
    manager = makeManager();
    const room = manager.createRoom();
    manager.removeRoom(room.code);
    expect(manager.getRoom(room.code)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// removeRoom
// -----------------------------------------------------------------------
describe('RoomManager - removeRoom', () => {
  let manager;
  afterEach(() => manager.destroy());

  it('removes the room by code', () => {
    manager = makeManager();
    const room = manager.createRoom();
    manager.removeRoom(room.code);
    expect(manager.rooms.has(room.code)).toBe(false);
  });

  it('is a no-op for non-existent code', () => {
    manager = makeManager();
    expect(() => manager.removeRoom('NOPE')).not.toThrow();
  });

  it('decreases the room count', () => {
    manager = makeManager();
    const room = manager.createRoom();
    manager.removeRoom(room.code);
    expect(manager.stats().roomCount).toBe(0);
  });
});

// -----------------------------------------------------------------------
// Player-to-room mapping
// -----------------------------------------------------------------------
describe('RoomManager - getRoomForPlayer', () => {
  let manager;
  afterEach(() => manager.destroy());

  it('returns the room containing a given player', () => {
    manager = makeManager();
    const room = manager.createRoom();
    const { playerId } = room.addPlayer('Alice');
    expect(manager.getRoomForPlayer(playerId)).toBe(room);
  });

  it('returns null when player is in no room', () => {
    manager = makeManager();
    expect(manager.getRoomForPlayer('ghost')).toBeNull();
  });

  it('returns correct room when multiple rooms exist', () => {
    manager = makeManager();
    const r1 = manager.createRoom();
    const r2 = manager.createRoom();
    const { playerId: p1 } = r1.addPlayer('Alice');
    const { playerId: p2 } = r2.addPlayer('Bob');
    expect(manager.getRoomForPlayer(p1)).toBe(r1);
    expect(manager.getRoomForPlayer(p2)).toBe(r2);
  });

  it('returns null after player is removed from room', () => {
    manager = makeManager();
    const room = manager.createRoom();
    const { playerId } = room.addPlayer('Alice');
    room.addPlayer('Bob'); // keep room alive
    room.removePlayer(playerId);
    expect(manager.getRoomForPlayer(playerId)).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Cleanup — stale rooms
// -----------------------------------------------------------------------
describe('RoomManager - cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes empty room after 30 seconds of inactivity', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    // Room is empty — advance past EMPTY_TIMEOUT_MS (30s) + CLEANUP_INTERVAL_MS (60s)
    vi.advanceTimersByTime(91_000);
    expect(manager.getRoom(room.code)).toBeNull();
    manager.destroy();
  });

  it('keeps empty room within the 30-second window', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    // Only advance 20s (within empty timeout window)
    vi.advanceTimersByTime(20_000);
    expect(manager.getRoom(room.code)).toBe(room);
    manager.destroy();
  });

  it('removes room idle for more than 4 hours regardless of players', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    room.addPlayer('Alice');
    // Advance beyond IDLE_TIMEOUT_MS (4h) + one cleanup tick
    vi.advanceTimersByTime(4 * 60 * 60 * 1000 + 61_000);
    expect(manager.getRoom(room.code)).toBeNull();
    manager.destroy();
  });

  it('keeps a room with recent activity and players', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    room.addPlayer('Alice');
    // Only advance 30 minutes — well within idle timeout
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(manager.getRoom(room.code)).toBe(room);
    manager.destroy();
  });

  it('cleanup respects hasActiveSockets override', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    // Override hasActiveSockets to simulate active socket for this room
    manager.hasActiveSockets = (code) => code === room.code;
    // Advance past empty timeout
    vi.advanceTimersByTime(91_000);
    // Room should NOT be cleaned up because it has active sockets
    expect(manager.getRoom(room.code)).toBe(room);
    manager.destroy();
  });

  it('cleanup can be triggered manually', () => {
    const manager = makeManager();
    const room = manager.createRoom();
    // Manually set lastActivity far in the past
    room.lastActivity = Date.now() - (4 * 60 * 60 * 1000 + 1);
    manager.cleanup();
    expect(manager.getRoom(room.code)).toBeNull();
    manager.destroy();
  });
});

// -----------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------
describe('RoomManager - stats', () => {
  let manager;
  afterEach(() => manager.destroy());

  it('reports 0 rooms/players/games initially', () => {
    manager = makeManager();
    expect(manager.stats()).toEqual({ roomCount: 0, playerCount: 0, gameCount: 0 });
  });

  it('counts players across rooms', () => {
    manager = makeManager();
    const r1 = manager.createRoom();
    const r2 = manager.createRoom();
    r1.addPlayer('Alice');
    r1.addPlayer('Bob');
    r2.addPlayer('Charlie');
    expect(manager.stats().playerCount).toBe(3);
  });

  it('counts running games', async () => {
    manager = makeManager();
    const room = manager.createRoom();
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    await room.startGame('number-guess', {});
    expect(manager.stats().gameCount).toBe(1);
  });

  it('gameCount decreases after endGame', async () => {
    manager = makeManager();
    const room = manager.createRoom();
    room.addPlayer('Alice');
    room.addPlayer('Bob');
    await room.startGame('number-guess', {});
    room.endGame();
    expect(manager.stats().gameCount).toBe(0);
  });
});

// -----------------------------------------------------------------------
// destroy
// -----------------------------------------------------------------------
describe('RoomManager - destroy', () => {
  it('stops the cleanup timer without throwing', () => {
    const manager = makeManager();
    expect(() => manager.destroy()).not.toThrow();
  });
});
