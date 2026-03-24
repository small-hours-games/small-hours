import { describe, it, expect } from 'vitest';
import { Room } from '../../src/session/room.js';

describe('Room voting state', () => {
  it('Test 1: new Room has empty categoryVotes, empty availableCategories, votingActive false', () => {
    const room = new Room('TEST');
    expect(room.categoryVotes).toBeInstanceOf(Map);
    expect(room.categoryVotes.size).toBe(0);
    expect(room.availableCategories).toEqual([]);
    expect(room.votingActive).toBe(false);
  });

  it('Test 2: getState() does NOT include voting fields when votingActive is false', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    const state = room.getState();
    expect(state.votingActive).toBeUndefined();
    expect(state.availableCategories).toBeUndefined();
    expect(state.voteTallies).toBeUndefined();
  });

  it('Test 3: getState() includes availableCategories, voteTallies, votingActive when votingActive is true', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.votingActive = true;
    room.availableCategories = [{ id: 9, name: 'General Knowledge' }];
    const state = room.getState();
    expect(state.votingActive).toBe(true);
    expect(state.availableCategories).toEqual([{ id: 9, name: 'General Knowledge' }]);
    expect(state.voteTallies).toBeDefined();
  });

  it('Test 4: voteTallies is aggregated {categoryId: count}, not raw {playerId: categoryId}', () => {
    const room = new Room('TEST');
    const { playerId: p1 } = room.addPlayer('Alice');
    const { playerId: p2 } = room.addPlayer('Bob');
    const { playerId: p3 } = room.addPlayer('Charlie');
    room.votingActive = true;
    room.availableCategories = [{ id: 9, name: 'Gen' }, { id: 10, name: 'Books' }];
    room.categoryVotes.set(p1, 9);
    room.categoryVotes.set(p2, 9);
    room.categoryVotes.set(p3, 10);
    const state = room.getState();
    expect(state.voteTallies).toEqual({ 9: 2, 10: 1 });
    // Keys should be category IDs (numbers as object keys → strings), not player IDs
    expect(Object.keys(state.voteTallies)).not.toContain(p1);
  });

  it('Test 5: resolveWinningCategory() returns category with most votes (plurality)', () => {
    const room = new Room('TEST');
    const { playerId: p1 } = room.addPlayer('Alice');
    const { playerId: p2 } = room.addPlayer('Bob');
    const { playerId: p3 } = room.addPlayer('Charlie');
    room.availableCategories = [{ id: 9, name: 'Gen' }, { id: 10, name: 'Books' }, { id: 11, name: 'Sci' }];
    room.categoryVotes.set(p1, 10);
    room.categoryVotes.set(p2, 10);
    room.categoryVotes.set(p3, 11);
    expect(room.resolveWinningCategory()).toBe(10);
  });

  it('Test 6: resolveWinningCategory() on tie returns admin vote if admin voted for a tied category', () => {
    const room = new Room('TEST');
    // First player is admin
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: p2 } = room.addPlayer('Bob');
    room.availableCategories = [{ id: 9, name: 'Gen' }, { id: 10, name: 'Books' }];
    // Tie: 1 vote each
    room.categoryVotes.set(adminId, 9);
    room.categoryVotes.set(p2, 10);
    // Admin voted for 9, so 9 should win
    expect(room.resolveWinningCategory()).toBe(9);
  });

  it('Test 7: resolveWinningCategory() on tie where admin did not vote among tied returns lowest ID', () => {
    const room = new Room('TEST');
    const { playerId: adminId } = room.addPlayer('Admin');
    const { playerId: p2 } = room.addPlayer('Bob');
    const { playerId: p3 } = room.addPlayer('Charlie');
    const { playerId: p4 } = room.addPlayer('Diana');
    room.availableCategories = [{ id: 9, name: 'Gen' }, { id: 10, name: 'Books' }, { id: 11, name: 'Sci' }];
    // Admin voted for 11 (1 vote), p2 and p3 both vote 9, p4 votes 10 (9 and 10 are tied at... wait)
    // Need: 9 and 10 tied at maxCount, admin's vote (11) below maxCount
    // With 4 players: admin→11 (1 vote), p2→9 (1 vote), p3→10 (1 vote), p4→9 (1 vote)
    // Tallies: 9→2, 10→1, 11→1. 9 wins outright. Not a tie test.
    // Correct setup: admin→11, p2→9, p3→10, p4→10
    // Tallies: 9→1, 10→2, 11→1. 10 wins outright.
    // Need equal max votes in 2 categories, admin NOT in either:
    // admin→11, p2→9, p3→9, p4→10, p5→10 → but that's 5 players
    // Simplest: just don't include admin in the vote at all — admin didn't vote
    // Tallies: 9→1, 10→1, admin has no vote → 9 and 10 tied, admin didn't vote → lowest ID = 9
    room.categoryVotes.set(p2, 9);
    room.categoryVotes.set(p3, 10);
    // adminId has no vote — not in categoryVotes
    // p4 doesn't vote either
    // 9 and 10 are tied, admin didn't vote → lowest ID wins
    expect(room.resolveWinningCategory()).toBe(9);
  });

  it('Test 8: resolveWinningCategory() with no votes returns first available category ID', () => {
    const room = new Room('TEST');
    room.addPlayer('Alice');
    room.availableCategories = [{ id: 9, name: 'Gen' }, { id: 10, name: 'Books' }];
    // No votes
    expect(room.resolveWinningCategory()).toBe(9);
  });

  it('Test 9: removePlayer() also deletes from categoryVotes', () => {
    const room = new Room('TEST');
    const { playerId: p1 } = room.addPlayer('Alice');
    room.addPlayer('Bob'); // need 2 players so room isn't empty after removal
    room.categoryVotes.set(p1, 9);
    expect(room.categoryVotes.has(p1)).toBe(true);
    room.removePlayer(p1);
    expect(room.categoryVotes.has(p1)).toBe(false);
  });

  it('Test 10: startGame() resets votingActive, categoryVotes, availableCategories', async () => {
    const room = new Room('TEST');
    const { playerId: p1 } = room.addPlayer('Alice');
    room.votingActive = true;
    room.availableCategories = [{ id: 9, name: 'Gen' }];
    room.categoryVotes.set(p1, 9);

    // Start a simple game (number-guess doesn't require async fetching)
    await room.startGame('number-guess', {});

    expect(room.votingActive).toBe(false);
    expect(room.availableCategories).toEqual([]);
    expect(room.categoryVotes.size).toBe(0);
  });

  it('Test 11: endGame() resets votingActive, categoryVotes, availableCategories', () => {
    const room = new Room('TEST');
    const { playerId: p1 } = room.addPlayer('Alice');
    room.votingActive = true;
    room.availableCategories = [{ id: 9, name: 'Gen' }];
    room.categoryVotes.set(p1, 9);
    // Simulate a running game
    room.game = { id: 'fake-game' };

    room.endGame();

    expect(room.votingActive).toBe(false);
    expect(room.availableCategories).toEqual([]);
    expect(room.categoryVotes.size).toBe(0);
  });
});
