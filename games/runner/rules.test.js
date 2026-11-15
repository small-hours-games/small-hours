import { describe, it, expect } from 'vitest';
import rules from './rules.js';
import manifest from './index.js';

describe('runner', () => {
  it('initializes 1-4 runners with 3 lives and H-O-U-R-S target', () => {
    const s0 = rules.setup({ players: ['p1', 'p2', 'bot_1'] });
    expect(s0.phase).toBe('playing');
    expect(s0.stats.p1.lives).toBe(3);
    expect(rules.view(s0).targetWord).toEqual(['H', 'O', 'U', 'R', 'S']);
  });

  it('records final scores, stats, and winner on reportRaceEnd', () => {
    let s = rules.setup({ players: ['p1', 'p2'] });
    s = rules.actions.reportRaceEnd(s, {
      winnerId: 'p2',
      scores: { p1: 420, p2: 890 },
      stats: { p1: { lives: 0, gems: 3, letters: 2, alive: false }, p2: { lives: 2, gems: 6, letters: 5, alive: true } },
    }).state;
    expect(s.phase).toBe('finished');
    expect(rules.endIf(s)).toEqual({ winner: 'p2', scores: { p1: 420, p2: 890 } });
  });

  it('exposes AI config and is visible in lobby', () => {
    expect(manifest.ai).toBeDefined();
    expect(manifest.hidden).toBeFalsy();
  });
});
