import { describe, it, expect } from 'vitest';
import template from '../../src/engine/games/template.js';
import { createTestGame, act, actChain, viewFor, isOver, playUntilEnd } from './game-harness.js';

describe('Template game - setup', () => {
  it('initializes with playing phase and zero scores', () => {
    const game = createTestGame(template);
    expect(game.state.phase).toBe('playing');
    expect(game.state.scores).toEqual({ p1: 0, p2: 0 });
    expect(game.state.target).toBe(3);
    expect(game.state.winner).toBeNull();
  });

  it('accepts custom target via config', () => {
    const game = createTestGame(template, ['p1', 'p2'], { target: 5 });
    expect(game.state.target).toBe(5);
  });
});

describe('Template game - increment action', () => {
  it('increments player score', () => {
    const game = createTestGame(template);
    const { game: g2, events } = act(game, 'increment', 'p1');
    expect(g2.state.scores.p1).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'incremented', playerId: 'p1', score: 1 }));
  });

  it('rejects action after game over', () => {
    const game = createTestGame(template, ['p1', 'p2'], { target: 1 });
    const { game: g2 } = act(game, 'increment', 'p1');
    const { events } = act(g2, 'increment', 'p2');
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', message: 'Game is over' }));
  });
});

describe('Template game - win condition', () => {
  it('declares winner when target reached', () => {
    const game = createTestGame(template, ['p1', 'p2'], { target: 2 });
    const { game: final, events } = actChain(game, [
      ['increment', 'p1'],
      ['increment', 'p1'],
    ]);
    expect(final.state.phase).toBe('finished');
    expect(final.state.winner).toBe('p1');
    expect(events).toContainEqual(expect.objectContaining({ type: 'game_over', winner: 'p1' }));
  });
});

describe('Template game - view', () => {
  it('shows player their own score and game state', () => {
    const game = createTestGame(template);
    const { game: g2 } = act(game, 'increment', 'p1');
    const view = viewFor(g2, 'p1');
    expect(view.myScore).toBe(1);
    expect(view.phase).toBe('playing');
    expect(view.target).toBe(3);
    expect(view.scores).toEqual({ p1: 1, p2: 0 });
  });
});

describe('Template game - endIf', () => {
  it('returns null while playing', () => {
    const game = createTestGame(template);
    expect(isOver(game)).toBeNull();
  });

  it('returns winner and scores when finished', () => {
    const game = createTestGame(template, ['p1', 'p2'], { target: 1 });
    const { game: final } = act(game, 'increment', 'p1');
    const result = isOver(final);
    expect(result).toEqual({ winner: 'p1', scores: { p1: 1, p2: 0 } });
  });
});

describe('Template game - full lifecycle via playUntilEnd', () => {
  it('plays to completion with alternating turns', () => {
    const players = ['p1', 'p2'];
    const game = createTestGame(template, players, { target: 2 });

    const { game: final, turns } = playUntilEnd(game, (g, turn) => {
      const player = players[turn % players.length];
      return ['increment', player];
    });

    expect(isOver(final)).not.toBeNull();
    expect(turns).toBeLessThanOrEqual(4);
  });
});
