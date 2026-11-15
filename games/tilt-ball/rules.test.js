import { describe, it, expect } from 'vitest';
import rules from './rules.js';
import manifest from './index.js';

describe('tilt-ball', () => {
  it('requires ready players before countdown and clamps tilt inputs', () => {
    let s = rules.setup({ players: ['p1', 'bot_1'], config: { maxRounds: 3 } });
    expect(s.phase).toBe('ready');
    expect(s.round).toBe(1);
    expect(s.ready.p1).toBe(false);
    expect(s.ready.bot_1).toBe(true);

    // Cannot start countdown before all players are ready.
    s = rules.actions.startCountdown(s).state;
    expect(s.phase).toBe('ready');

    s = rules.actions.setReady(s, { playerId: 'p1', ready: true }).state;
    expect(rules.view(s).allReady).toBe(true);

    s = rules.actions.startCountdown(s).state;
    expect(s.phase).toBe('countdown');

    s = rules.actions.beginRound(s).state;
    expect(s.phase).toBe('playing');

    const { state: s1 } = rules.actions.setTilt(s, { playerId: 'p1', x: 5, y: -3, boost: 1 });
    expect(s1.tilts.p1).toEqual({ x: 1, y: -1, boost: 1 });
  });

  it('scores rounds, advances through ready, and ends after maxRounds', () => {
    let s = rules.setup({ players: ['p1', 'p2'], config: { maxRounds: 2 } });
    s = rules.actions.setReady(s, { playerId: 'p1', ready: true }).state;
    s = rules.actions.setReady(s, { playerId: 'p2', ready: true }).state;
    s = rules.actions.startCountdown(s).state;
    s = rules.actions.beginRound(s).state;

    s = rules.actions.finishRound(s, { round: 1, winnerId: 'p1', elimOrder: ['p2'] }).state;
    expect(s.phase).toBe('round_over');
    expect(s.scores.p1).toBe(3);

    s = rules.actions.nextRound(s).state;
    expect(s.phase).toBe('ready');
    expect(s.round).toBe(2);
    expect(s.ready).toEqual({ p1: false, p2: false });

    s = rules.actions.setReady(s, { playerId: 'p1', ready: true }).state;
    s = rules.actions.setReady(s, { playerId: 'p2', ready: true }).state;
    s = rules.actions.startCountdown(s).state;
    s = rules.actions.beginRound(s).state;

    s = rules.actions.finishRound(s, { round: 2, winnerId: 'p1', elimOrder: ['p2'] }).state;
    expect(s.phase).toBe('finished');
    expect(rules.endIf(s)).toEqual({ winner: 'p1', scores: { p1: 6, p2: 0 } });
  });

  it('supports solo vs AI in manifest', () => {
    expect(manifest.ai).toBeDefined();
    expect(manifest.hidden).toBeFalsy();
  });
});
