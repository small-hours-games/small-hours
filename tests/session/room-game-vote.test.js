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
    room.suggestGame(ids[0], 'uno');
    room.suggestGame(ids[1], 'quiz');
    room.suggestGame(ids[2], 'quiz');
    expect(room.resolveWinningGame()).toBe('quiz');
    expect(room.getState().leadingGame).toBe('quiz');
  });

  it('breaks ties with the admin vote', () => {
    const { room, ids } = roomWith(2);
    expect(room.players.get(ids[0]).isAdmin).toBe(true);
    room.suggestGame(ids[0], 'yatzy');
    room.suggestGame(ids[1], 'uno');
    expect(room.resolveWinningGame()).toBe('yatzy');
  });

  it('falls back to alphabetical order when admin did not vote for a tied game', () => {
    const { room, ids } = roomWith(3);
    room.suggestGame(ids[1], 'uno');
    room.suggestGame(ids[2], 'sjuan');
    expect(room.resolveWinningGame()).toBe('sjuan');
  });

  it('ignores games incompatible with the player count', () => {
    const { room, ids } = roomWith(2);
    room.suggestGame(ids[0], 'spy'); // spy needs 3+
    room.suggestGame(ids[1], 'spy');
    expect(room.resolveWinningGame()).toBeNull();
  });
});
