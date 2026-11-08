import { describe, it, expect } from 'vitest';
import { Room } from '../../src/session/room.js';

function roomWith(n) {
  const room = new Room('TEST');
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(room.addPlayer(`P${i}`).playerId);
  return { room, ids };
}

describe('Room game vote resolution', () => {
  it('returns null when nobody has voted', () => {
    const { room } = roomWith(3);
    expect(room.resolveWinningGame()).toBeNull();
    expect(room.getState().leadingGame).toBeNull();
  });

  it('picks the most-voted game', () => {
    const { room, ids } = roomWith(3);
    room.suggestGame(ids[0], 'shithead');
    room.suggestGame(ids[1], 'quiz');
    room.suggestGame(ids[2], 'quiz');
    expect(room.resolveWinningGame()).toBe('quiz');
    expect(room.getState().leadingGame).toBe('quiz');
  });

  it('breaks ties with the admin vote', () => {
    const { room, ids } = roomWith(2);
    expect(room.players.get(ids[0]).isAdmin).toBe(true);
    room.suggestGame(ids[0], 'quiz');
    room.suggestGame(ids[1], 'shithead');
    expect(room.resolveWinningGame()).toBe('quiz');
  });

  it('falls back to alphabetical order when admin did not vote for a tied game', () => {
    const { room, ids } = roomWith(3);
    room.suggestGame(ids[1], 'shithead');
    room.suggestGame(ids[2], 'quiz');
    expect(room.resolveWinningGame()).toBe('quiz');
  });

  it('ignores games incompatible with the player count', () => {
    const { room, ids } = roomWith(3);
    room.suggestGame(ids[0], 'gin-rummy'); // two players at most
    room.suggestGame(ids[1], 'gin-rummy');
    expect(room.resolveWinningGame()).toBeNull();
  });
});
