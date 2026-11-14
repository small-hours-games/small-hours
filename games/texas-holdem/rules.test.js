import { describe, it, expect } from 'vitest';
import { createTestGame, act, viewFor, isOver } from '../../tests/engine/game-harness.js';
import { processAction, checkEnd } from '../../src/engine/engine.js';
import { evaluateBestHand } from './hand-eval.js';
import holdem from './rules.js';
import { chooseHoldemAction } from './bot.js';

const c = (rank, suit = 's') => ({ id: `${rank}${suit}_t`, rank, suit });

describe("Texas Hold'em rules", () => {
  it('evaluates 7-card hands accurately including wheel straights and royal flushes', () => {
    const royal = evaluateBestHand([
      c(14, 'h'), c(13, 'h'), c(12, 'h'), c(11, 'h'), c(10, 'h'), c(2, 'c'), c(3, 'd'),
    ]);
    expect(royal.name).toBe('Royal Flush');

    const wheel = evaluateBestHand([
      c(14, 's'), c(2, 'h'), c(3, 'd'), c(4, 'c'), c(5, 's'), c(9, 'h'), c(11, 'd'),
    ]);
    expect(wheel.name).toBe('Straight');
    expect(wheel.tiebreakers[0]).toBe(5);

    const fullHouse = evaluateBestHand([
      c(10, 's'), c(10, 'h'), c(10, 'd'), c(4, 'c'), c(4, 's'), c(14, 'h'), c(2, 'd'),
    ]);
    const flush = evaluateBestHand([
      c(14, 's'), c(12, 's'), c(9, 's'), c(6, 's'), c(2, 's'), c(13, 'h'), c(11, 'd'),
    ]);
    expect(fullHouse.score).toBeGreaterThan(flush.score);
  });

  it('posts blinds, hides other players hole cards, and handles fold wins', () => {
    let g = createTestGame(holdem, ['p1', 'p2', 'p3'], { hands: 3 });
    expect(g.state.phase).toBe('preflop');
    expect(g.state.pot).toBe(30); // SB 10 + BB 20

    const v1 = viewFor(g, 'p1');
    const v2 = viewFor(g, 'p2');
    expect(v1.myHand).toHaveLength(2);
    expect(v2.myHand).toHaveLength(2);
    expect(v1.myHand[0].id).not.toBe(v2.myHand[0].id);
    expect(v1.showdown).toBeNull();

    // UTG (p1) folds, SB (p2) folds -> BB (p3) wins pot
    g = act(g, 'fold', g.state.turn).game;
    g = act(g, 'fold', g.state.turn).game;
    expect(g.state.phase).toBe('showdown');
    expect(g.state.chips.p3).toBe(1010);
  });

  it('progresses through flop, turn, river, and showdown', () => {
    let g = createTestGame(holdem, ['p1', 'p2'], { hands: 1 });
    // Heads-up: p1 is dealer/SB (10), p2 is BB (20), p1 acts first preflop
    expect(g.state.turn).toBe('p1');
    g = act(g, 'call', 'p1').game;
    g = act(g, 'check', 'p2').game;
    expect(g.state.phase).toBe('flop');
    expect(g.state.board).toHaveLength(3);

    // Postflop: BB (p2) acts first
    g = act(g, 'check', g.state.turn).game;
    g = act(g, 'check', g.state.turn).game;
    expect(g.state.phase).toBe('turn');
    expect(g.state.board).toHaveLength(4);

    g = act(g, 'check', g.state.turn).game;
    g = act(g, 'check', g.state.turn).game;
    expect(g.state.phase).toBe('river');
    expect(g.state.board).toHaveLength(5);

    g = act(g, 'check', g.state.turn).game;
    g = act(g, 'check', g.state.turn).game;
    expect(g.state.phase).toBe('showdown');
    expect(g.state.chips.p1 + g.state.chips.p2).toBe(2000);

    g = act(g, 'nextHand', 'p1').game;
    expect(g.state.phase).toBe('finished');
    expect(isOver(g)).not.toBeNull();
  });

  it('plays full AI bot games with zero illegal moves', () => {
    const bots = ['bot_1', 'bot_2', 'bot_3', 'bot_4'];
    let g = createTestGame(holdem, bots, { hands: 5 });
    for (let step = 0; step < 5000; step++) {
      const end = checkEnd(g);
      if (end) {
        expect(bots).toContain(end.winner);
        const totalChips = Object.values(end.scores).reduce((a, b) => a + b, 0);
        expect(totalChips).toBe(4000);
        return;
      }
      let action = null;
      for (const id of bots) {
        const chosen = chooseHoldemAction(g.state, id);
        if (chosen) {
          action = { ...chosen, playerId: id };
          break;
        }
      }
      expect(action).not.toBeNull();
      const res = processAction(g, action);
      expect(res.events.find(e => e.type === 'error')).toBeUndefined();
      g = res.game;
    }
    throw new Error('Holdem bot game did not finish');
  });
});
