// Avatars: every player in a room gets their own face, and can pick another free one.
import { describe, it, expect } from 'vitest';
import { Room, AVATAR_POOL } from '../../src/session/room.js';

describe('avatars', () => {
  it('gives the first players in a room different avatars', () => {
    const room = new Room('ABCD');
    const avatars = Array.from({ length: AVATAR_POOL.length }, (_, i) => room.addPlayer('Player ' + i).avatar);
    expect(new Set(avatars).size).toBe(AVATAR_POOL.length);
  });

  it('allows repeats only once the pool is used up', () => {
    const room = new Room('ABCD');
    for (let i = 0; i < AVATAR_POOL.length; i++) room.addPlayer('P' + i);
    expect(AVATAR_POOL).toContain(room.addPlayer('One more').avatar);
  });

  it('lets a player pick a free avatar, and refuses a taken or unknown one', () => {
    const room = new Room('ABCD');
    const a = room.addPlayer('Anna');
    const b = room.addPlayer('Bo');
    const free = AVATAR_POOL.find(x => x !== a.avatar && x !== b.avatar);
    const before = room.stateVersion;
    expect(room.setAvatar(a.playerId, free)).toEqual({ ok: true, avatar: free });
    expect(room.players.get(a.playerId).avatar).toBe(free);
    expect(room.stateVersion).toBeGreaterThan(before);
    expect(room.setAvatar(b.playerId, free).ok).toBe(false);
    expect(room.setAvatar(b.playerId, '<b>x</b>').ok).toBe(false);
    expect(room.setAvatar('nobody', free).ok).toBe(false);
  });
});
