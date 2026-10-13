import { describe, it, expect } from 'vitest';
import yatzy from '../../src/engine/games/yatzy.js';
import { createTestGame, act, viewFor, isOver } from './game-harness.js';

describe('Yatzy - setup', () => {
  it('initializes with rolling phase and 5 dice', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    expect(game.state.phase).toBe('rolling');
    expect(game.state.dice).toHaveLength(5);
    expect(game.state.held).toEqual([false, false, false, false, false]);
    expect(game.state.rerolls).toBe(2);
    expect(game.state.turn).toBe('p1');
    expect(game.state.round).toBe(1);
  });

  it('all dice are between 1 and 6', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    for (const d of game.state.dice) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });

  it('starts with empty scores and used sets', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    expect(game.state.scores.p1).toEqual({});
    expect(game.state.used.p1.size).toBe(0);
  });

  it('endIf returns null at start', () => {
    expect(isOver(createTestGame(yatzy, ['p1', 'p2']))).toBeNull();
  });
});

describe('Yatzy - toggleHold action', () => {
  it('sets a die as held', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { game: g2, events } = act(game, 'toggleHold', 'p1', { index: 2 });
    expect(g2.state.held[2]).toBe(true);
    expect(events[0].type).toBe('hold');
  });

  it('unsets a previously held die on second toggle', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { game: g2 } = act(game, 'toggleHold', 'p1', { index: 2 });
    const { game: g3 } = act(g2, 'toggleHold', 'p1', { index: 2 });
    expect(g3.state.held[2]).toBe(false);
  });

  it('ignores toggle from wrong player', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { game: g2 } = act(game, 'toggleHold', 'p2', { index: 0 });
    expect(g2.state.held[0]).toBe(false);
  });
});

describe('Yatzy - reroll action', () => {
  it('rerolls non-held dice and decrements rerolls', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 2, 3, 4, 5], held: [true, false, true, false, false] } };
    const { game: g2, events } = act(g, 'reroll', 'p1', {});
    expect(g2.state.dice[0]).toBe(1);
    expect(g2.state.dice[2]).toBe(3);
    expect(g2.state.rerolls).toBe(1);
    expect(events[0].type).toBe('rerolled');
  });

  it('errors when no rerolls remaining', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, rerolls: 0 } };
    const { events } = act(g, 'reroll', 'p1', {});
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('No rerolls left');
  });

  it('errors when not your turn', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { events } = act(game, 'reroll', 'p2', {});
    expect(events[0].type).toBe('error');
  });
});

describe('Yatzy - bank action: scoring', () => {
  it('scores yatzy (5 of a kind) as 50', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [3, 3, 3, 3, 3] } };
    const { game: g2, events } = act(g, 'bank', 'p1', { category: 'yatzy' });
    expect(g2.state.scores.p1.yatzy).toBe(50);
    expect(events[0].type).toBe('banked');
    expect(events[0].gained).toBe(50);
  });

  it('scores chance as sum of all dice', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 2, 3, 4, 5] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'chance' });
    expect(g2.state.scores.p1.chance).toBe(15);
  });

  it('scores ones as sum of 1s only', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 1, 2, 3, 4] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'ones' });
    expect(g2.state.scores.p1.ones).toBe(2);
  });

  it('scores zero for category with no matching dice', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [2, 3, 4, 5, 6] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'ones' });
    expect(g2.state.scores.p1.ones).toBe(0);
  });

  it('scores fullHouse as 25', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [2, 2, 3, 3, 3] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'fullHouse' });
    expect(g2.state.scores.p1.fullHouse).toBe(25);
  });

  it('scores largeStraight as 40', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [2, 3, 4, 5, 6] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'largeStraight' });
    expect(g2.state.scores.p1.largeStraight).toBe(40);
  });
});

describe('Yatzy - bank action: turn management', () => {
  it('passes turn to next player and resets dice/held/rerolls', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 1, 1, 1, 1], held: [true, true, false, false, false], rerolls: 1 } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'ones' });
    expect(g2.state.turn).toBe('p2');
    expect(g2.state.held).toEqual([false, false, false, false, false]);
    expect(g2.state.rerolls).toBe(2);
    expect(g2.state.dice).toHaveLength(5);
  });

  it('errors when not your turn', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { events } = act(game, 'bank', 'p2', { category: 'ones' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Not your turn');
  });

  it('errors for invalid category name', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const { events } = act(game, 'bank', 'p1', { category: 'notacategory' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Bad category');
  });

  it('errors when category already used by player', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, used: { p1: new Set(['yatzy']), p2: new Set() } } };
    const { events } = act(g, 'bank', 'p1', { category: 'yatzy' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Category already used');
  });

  it('marks category as used after banking', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 2, 3, 4, 5] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'chance' });
    expect(g2.state.used.p1.has('chance')).toBe(true);
  });
});

describe('Yatzy - bank action: game end', () => {
  it('ends game when all players fill all rounds, winner has highest total', () => {
    // 2-round game so it ends quickly
    const game = createTestGame(yatzy, ['p1', 'p2'], { rounds: 2 });

    // p1 banks chance=15 (dice [1,2,3,4,5])
    const g1 = { ...game, state: { ...game.state, dice: [1, 2, 3, 4, 5] } };
    const { game: g2 } = act(g1, 'bank', 'p1', { category: 'chance' });

    // p2 banks ones=0 (dice [2,3,4,5,6])
    const g3 = { ...g2, state: { ...g2.state, dice: [2, 3, 4, 5, 6] } };
    const { game: g4 } = act(g3, 'bank', 'p2', { category: 'ones' });

    // p1 banks ones=0
    const g5 = { ...g4, state: { ...g4.state, dice: [2, 3, 4, 5, 6] } };
    const { game: g6 } = act(g5, 'bank', 'p1', { category: 'ones' });

    // p2 banks chance=15: all rounds filled → game ends
    const g7 = { ...g6, state: { ...g6.state, dice: [1, 2, 3, 4, 5] } };
    const { game: final } = act(g7, 'bank', 'p2', { category: 'chance' });

    expect(final.state.phase).toBe('finished');
    const end = isOver(final);
    expect(end).toBeTruthy();
    // Both players have total 15; either could win (implementation-defined tiebreak)
    expect(['p1', 'p2']).toContain(end.winner);
    expect(typeof end.scores.p1).toBe('number');
    expect(typeof end.scores.p2).toBe('number');
  });

  it('winner has highest total when scores differ', () => {
    const game = createTestGame(yatzy, ['p1', 'p2'], { rounds: 1 });

    // p1 banks yatzy=50 (dice [3,3,3,3,3])
    const g1 = { ...game, state: { ...game.state, dice: [3, 3, 3, 3, 3] } };
    const { game: g2 } = act(g1, 'bank', 'p1', { category: 'yatzy' });

    // p2 banks ones=0 → game ends, p1 wins
    const g3 = { ...g2, state: { ...g2.state, dice: [2, 3, 4, 5, 6] } };
    const { game: final } = act(g3, 'bank', 'p2', { category: 'yatzy' });

    expect(final.state.phase).toBe('finished');
    expect(isOver(final).winner).toBe('p1');
  });
});

describe('Yatzy - view', () => {
  it('shows dice, held, rerolls, available categories, and turn info', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.phase).toBe('rolling');
    expect(view.dice).toHaveLength(5);
    expect(view.held).toEqual([false, false, false, false, false]);
    expect(view.rerolls).toBe(2);
    expect(view.isMyTurn).toBe(true);
    expect(view.availableCategories.length).toBeGreaterThan(0);
    expect(view.myScores).toEqual({});
    expect(view.myTotal).toBe(0);
  });

  it('isMyTurn is false for non-active player', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    expect(viewFor(game, 'p2').isMyTurn).toBe(false);
  });

  it('removes banked category from availableCategories', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, dice: [1, 1, 1, 1, 1] } };
    const { game: g2 } = act(g, 'bank', 'p1', { category: 'yatzy' });
    const view = viewFor(g2, 'p1');
    expect(view.availableCategories).not.toContain('yatzy');
    expect(view.myScores.yatzy).toBe(50);
    expect(view.myTotal).toBe(50);
  });

  it('shows totals for all players', () => {
    const game = createTestGame(yatzy, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.totals).toEqual({ p1: 0, p2: 0 });
  });
});
