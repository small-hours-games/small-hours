// Small Hours - Room Manager
// Singleton that tracks all active rooms and handles lifecycle.

import { Room, generateRoomCode } from './room.js';

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const EMPTY_TIMEOUT_MS = 30 * 1000;          // 30 seconds
const CLEANUP_INTERVAL_MS = 60 * 1000;       // 60 seconds

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is still running
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Create a new room with a unique code.
   * Retries if a code collision occurs (unlikely with the character space).
   */
  createRoom() {
    let code;
    let attempts = 0;
    do {
      code = generateRoomCode();
      attempts++;
      if (attempts > 100) {
        throw new Error('Failed to generate unique room code');
      }
    } while (this.rooms.has(code));

    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Get a room by its code. Returns null if not found.
   */
  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  /**
   * Remove a room by code.
   */
  removeRoom(code) {
    this.rooms.delete(code);
  }

  /**
   * Clean up stale rooms:
   * - Rooms idle for more than 4 hours
   * - Rooms with no players for more than 30 seconds
   */
  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      // Never clean up rooms that have active WebSocket connections (host display counts)
      if (this.hasActiveSockets && this.hasActiveSockets(code)) {
        continue;
      }

      const idleTooLong = (now - room.lastActivity) > IDLE_TIMEOUT_MS;
      const emptyTooLong = room.players.size === 0 &&
        (now - room.lastActivity) > EMPTY_TIMEOUT_MS;

      if (idleTooLong || emptyTooLong) {
        this.rooms.delete(code);
      }
    }
  }

  /**
   * Find the room that contains a given player ID.
   * Returns the Room or null.
   */
  getRoomForPlayer(playerId) {
    for (const [, room] of this.rooms) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return null;
  }

  /**
   * Aggregate stats across all rooms.
   */
  stats() {
    let playerCount = 0;
    let gameCount = 0;
    for (const [, room] of this.rooms) {
      playerCount += room.players.size;
      if (room.game) gameCount++;
    }
    return {
      roomCount: this.rooms.size,
      playerCount,
      gameCount,
    };
  }

  /**
   * Stop the cleanup interval. Call on shutdown.
   */
  destroy() {
    clearInterval(this._cleanupTimer);
  }
}

// Export a singleton instance
const manager = new RoomManager();
export default manager;
export { RoomManager };
