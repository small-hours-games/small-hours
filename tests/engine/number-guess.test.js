import { describe, it, expect } from 'vitest';
import numberGuess from '../../src/engine/games/number-guess.js';
import { createTestGame, act, viewFor, isOver, playUntilEnd } from './game-harness.js';

describe('Number Guess - setup', () => {
  it('initializes with playing phase and secret in range', () => {
    const game = createTestGame(numberGuess);
    expect(game.state.phase).toBe('playing');
    expect(game.state.secret).toBeGreaterThanOrEqual(1);
    expect(game.state.secret).toBeLessThanOrEqual(100);
    expect(game.state.guesses.p1).toEqual([]);
    expect(game.state.guesses.p2).toEqual([]);
    expect(game.state.round).toBe(0);
    expect(game.state.maxRounds).toBe(10);
  });

  it('accepts custom maxRounds', () => {
    const game = createTestGame(numberGuess, ['p1'], { maxRounds: 5 });
    expect(game.state.maxRounds).toBe(5);
  });
});

describe('Number Guess - guess action', () => {
  it('records a guess and returns too_low/too_high', () => {
    const game = createTestGame(numberGuess);
    const secret = game.state.secret;
    const guessVal = secret > 50 ? 1 : 100;
    const { game: g2, events } = act(game, 'guess', 'p1', { number: guessVal });

    expect(g2.state.guesses.p1).toHaveLength(1);
    expect(g2.state.round).toBe(1);
    const result = events[0];
    expect(result.type).toBe('guess_result');
    expect(['too_low', 'too_high']).toContain(result.result);
  });

  it('wins on correct guess', () => {
    const game = createTestGame(numberGuess);
    const { game: g2, events } = act(game, 'guess', 'p1', { number: game.state.secret });

    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBe('p1');
    expect(events[0].result).toBe('correct');
  });

  it('rejects non-integer guess', () => {
    const game = createTestGame(numberGuess);
    const { events } = act(game, 'guess', 'p1', { number: 50.5 });
    expect(events[0].type).toBe('error');
  });

  it('rejects out-of-range guess', () => {
    const game = createTestGame(numberGuess);
    const { events } = act(game, 'guess', 'p1', { number: 0 });
    expect(events[0].type).toBe('error');
  });

  it('rejects guess after game is finished', () => {
    const game = createTestGame(numberGuess);
    const { game: won } = act(game, 'guess', 'p1', { number: game.state.secret });
    const { events } = act(won, 'guess', 'p2', { number: 50 });
    expect(events[0].type).toBe('error');
  });
});

describe('Number Guess - view', () => {
  it('shows own guesses but not other player details', () => {
    const game = createTestGame(numberGuess);
    const { game: g2 } = act(game, 'guess', 'p1', { number: 50 });
    const { game: g3 } = act(g2, 'guess', 'p2', { number: 25 });

    const view = viewFor(g3, 'p1');
    expect(view.myGuesses).toHaveLength(1);
    expect(view.otherPlayers.p2).toBe(1);
    expect(view.phase).toBe('playing');
  });

  it('reveals secret after game ends', () => {
    const game = createTestGame(numberGuess);
    const { game: won } = act(game, 'guess', 'p1', { number: game.state.secret });
    const view = viewFor(won, 'p2');
    expect(view.secret).toBe(game.state.secret);
    expect(view.winner).toBe('p1');
  });
});

describe('Number Guess - endIf', () => {
  it('returns null while playing', () => {
    const game = createTestGame(numberGuess);
    expect(isOver(game)).toBeNull();
  });

  it('returns scores on win', () => {
    const game = createTestGame(numberGuess);
    const { game: won } = act(game, 'guess', 'p1', { number: game.state.secret });
    const result = isOver(won);
    expect(result.winner).toBe('p1');
    expect(result.scores.p1).toBe(game.state.maxRounds - 1);
  });
});

describe('Number Guess - full lifecycle via binary search', () => {
  it('always wins within maxRounds using binary search', () => {
    const game = createTestGame(numberGuess);
    let lo = 1, hi = 100;

    const { game: final, turns } = playUntilEnd(game, (g) => {
      const mid = Math.floor((lo + hi) / 2);
      const lastGuess = g.state.guesses.p1[g.state.guesses.p1.length - 1];
      if (lastGuess) {
        if (lastGuess.result === 'too_low') lo = lastGuess.number + 1;
        if (lastGuess.result === 'too_high') hi = lastGuess.number - 1;
      }
      return ['guess', 'p1', { number: Math.floor((lo + hi) / 2) }];
    });

    expect(isOver(final)).not.toBeNull();
    expect(final.state.winner).toBe('p1');
    expect(turns).toBeLessThanOrEqual(7);
  });
});
