import { describe, it, expect } from 'vitest';
import { createTestGame, act, viewFor, isOver } from '../../tests/engine/game-harness.js';
import blackjack, { evalHand } from './rules.js';

const c = (rank, suit = 's') => ({ id: `${rank}${suit}_t`, rank, suit });

describe('Blackjack rules', () => {
  it('evaluates hands including soft aces and blackjacks', () => {
    expect(evalHand([c(1, 's'), c(13, 'h')])).toEqual({
      total: 21,
      soft: true,
      isBlackjack: true,
      isBusted: false,
    });
    expect(evalHand([c(1, 's'), c(9, 'h'), c(5, 'd')])).toEqual({
      total: 15,
      soft: false,
      isBlackjack: false,
      isBusted: false,
    });
    expect(evalHand([c(10, 's'), c(7, 'h'), c(6, 'd')]).isBusted).toBe(true);
  });

  it('collects bets, deals, and hides the dealer hole card until settled', () => {
    let g = createTestGame(blackjack, ['p1', 'p2'], { rounds: 2 });
    expect(g.state.phase).toBe('betting');

    let res = act(g, 'placeBet', 'p1', { amount: 100 });
    g = res.game;
    expect(g.state.phase).toBe('betting');
    expect(g.state.seats.p1.chips).toBe(900);

    // Reject duplicate bet
    res = act(g, 'placeBet', 'p1', { amount: 50 });
    expect(res.events[0].type).toBe('error');

    res = act(g, 'placeBet', 'p2', { amount: 50 });
    g = res.game;

    if (g.state.phase === 'playing') {
      const v = viewFor(g, 'p1');
      expect(v.dealer.cards).toHaveLength(1);
      expect(v.dealer.hiddenHole).toBe(true);
    }
  });

  it('plays hit, stand, double, and settles against the dealer', () => {
    let g = createTestGame(blackjack, ['p1', 'p2'], { rounds: 2 });
    // Deterministic shoe (popped from end)
    g.state.shoe = [
      c(10, 'c'), c(6, 'd'), // dealer draws if needed
      c(7, 's'), // dealer hole: 10+7 = 17
      c(8, 'h'), // p2 2nd card: 10+8 = 18
      c(5, 'c'), // p1 2nd card: 6+5 = 11
      c(10, 'd'), // dealer up: 10
      c(10, 's'), // p2 1st card: 10
      c(6, 's'), // p1 1st card: 6
    ];

    g = act(g, 'placeBet', 'p1', { amount: 100 }).game;
    g = act(g, 'placeBet', 'p2', { amount: 100 }).game;
    expect(g.state.phase).toBe('playing');
    expect(g.state.turn).toBe('p1');

    // p1 doubles on 11 and gets 10 -> 21
    g.state.shoe.push(c(10, 'h'));
    g = act(g, 'double', 'p1').game;
    expect(g.state.turn).toBe('p2');
    expect(g.state.seats.p1.chips).toBe(800);

    // p2 stands on 18
    g = act(g, 'stand', 'p2').game;
    expect(g.state.phase).toBe('settled');

    // Dealer has 17: p1 (21) wins 400 (net +200), p2 (18) wins 200 (net +100)
    expect(g.state.seats.p1.chips).toBe(1200);
    expect(g.state.seats.p2.chips).toBe(1100);
    expect(viewFor(g, 'p1').dealer.cards).toHaveLength(2);
    expect(isOver(g)).toBeNull();
  });

  it('supports splitting pairs and finishes after maxRounds', () => {
    let g = createTestGame(blackjack, ['p1'], { rounds: 1 });
    g.state.shoe = [
      c(4, 'd'), c(3, 'c'), // split draws
      c(9, 's'), // dealer hole: 8+9 = 17
      c(8, 'h'), // p1 2nd card: 8
      c(8, 'd'), // dealer up: 8
      c(8, 's'), // p1 1st card: 8
    ];

    g = act(g, 'placeBet', 'p1', { amount: 100 }).game;
    expect(g.state.phase).toBe('playing');
    expect(viewFor(g, 'p1').myCanSplit).toBe(true);

    g = act(g, 'split', 'p1').game;
    expect(g.state.seats.p1.hands).toHaveLength(2);
    expect(g.state.seats.p1.chips).toBe(800);

    g = act(g, 'stand', 'p1').game;
    expect(g.state.activeHandIndex).toBe(1);
    g = act(g, 'stand', 'p1').game;

    expect(g.state.phase).toBe('finished');
    const end = isOver(g);
    expect(end).not.toBeNull();
    expect(end.winner).toBe('p1');
    expect(end.scores.p1).toBe(800);
  });
});
