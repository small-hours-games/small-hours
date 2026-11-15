import { describe, it, expect } from 'vitest';
import rules from './rules.js';
import manifest from './index.js';

describe('tilt-ball', () => {
  it('sets up rounds and clamps tilt inputs', () => {
    const s0 = rules.setup({ players: ['p1', 'p2'], config: { maxRounds: 3 } });
    expect(s0.phase).toBe('playing');
    expect(s0.round).toBe(1);

    const { state: s1 } = rules.actions.setTilt(s0, { playerId: 'p1', x: 5, y: -3, boost: 1 });
    expect(s1.tilts.p1).toEqual({ x: 1, y: -1, boost: 1 });
  });

  it('scores rounds, advances, and ends after maxRounds', () => {
    let s = rules.setup({ players: ['p1', 'p2'], config: { maxRounds: 2 } });
    s = rules.actions.finishRound(s, { round: 1, winnerId: 'p1', elimOrder: ['p2'] }).state;
    expect(s.phase).toBe('round_over');
    expect(s.scores.p1).toBe(3);

    s = rules.actions.nextRound(s).state;
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(2);

    s = rules.actions.finishRound(s, { round: 2, winnerId: 'p1', elimOrder: ['p2'] }).state;
    expect(s.phase).toBe('finished');
    expect(rules.endIf(s)).toEqual({ winner: 'p1', scores: { p1: 6, p2: 0 } });
  });

  it('supports solo vs AI in manifest', () => {
    expect(manifest.ai).toBeDefined();
    expect(manifest.hidden).toBeFalsy();
  });
});
