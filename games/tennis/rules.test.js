import { describe, it, expect } from 'vitest';
import rules from './rules.js';
import manifest from './index.js';

describe('tennis', () => {
  it('tracks tennis points, deuce/advantage, and game wins', () => {
    let s = rules.setup({ players: ['p1', 'p2'], config: { bestOf: 3 } });
    expect(s.gamesToWin).toBe(2);
    expect(rules.view(s).pointLabels).toEqual({ p1: '0', p2: '0' });

    // Reach 40-40 (deuce)
    for (let i = 0; i < 3; i++) {
      s = rules.actions.reportPoint(s, { winnerId: 'p1', serial: i * 2 + 1 }).state;
      s = rules.actions.reportPoint(s, { winnerId: 'p2', serial: i * 2 + 2 }).state;
    }
    expect(rules.view(s).pointLabels).toEqual({ p1: '40', p2: '40' });

    // Advantage p1, then win game
    s = rules.actions.reportPoint(s, { winnerId: 'p1', serial: 7 }).state;
    expect(rules.view(s).pointLabels).toEqual({ p1: 'AD', p2: '40' });

    s = rules.actions.reportPoint(s, { winnerId: 'p1', serial: 8 }).state;
    expect(s.games.p1).toBe(1);
    expect(s.points).toEqual({ p1: 0, p2: 0 });
    expect(s.serverIndex).toBe(1);
  });

  it('ends the match when a player reaches gamesToWin', () => {
    let s = rules.setup({ players: ['p1', 'p2'], config: { bestOf: 1 } });
    for (let i = 1; i <= 4; i++) {
      s = rules.actions.reportPoint(s, { winnerId: 'p1', serial: i }).state;
    }
    expect(s.phase).toBe('finished');
    expect(rules.endIf(s)).toEqual({
      winner: 'p1',
      scores: { p1: 7, p2: 0 },
    });
  });

  it('ignores duplicate serials and exposes AI config', () => {
    let s = rules.setup({ players: ['p1', 'bot_1'], config: { bestOf: 3 } });
    s = rules.actions.reportPoint(s, { winnerId: 'p1', serial: 1 }).state;
    const dup = rules.actions.reportPoint(s, { winnerId: 'bot_1', serial: 1 }).state;
    expect(dup.points.bot_1).toBe(0);
    expect(manifest.ai).toBeDefined();
    expect(manifest.hidden).toBeFalsy();
  });
});
