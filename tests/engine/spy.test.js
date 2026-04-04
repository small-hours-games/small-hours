// Unit tests for src/engine/games/spy.js
// Covers: setup, clue submission, guess scoring, timer phase transitions,
// per-player view filtering.

import { describe, it, expect } from 'vitest';
import spy, { SPY_WORDS } from '../../src/engine/games/spy.js';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import { createTestGame, act, actChain, viewFor, isOver } from './game-harness.js';

// Helper: create a spy game with specific config
function makeGame(players = ['p1', 'p2', 'p3'], config = {}) {
  return createGame(spy, { players, config });
}

// Helper: get to the guess phase via timerExpired
function toGuessPhase(game) {
  return processAction(game, { type: 'timerExpired', phase: 'clues' }).game;
}

// Helper: get to the reveal phase
function toRevealPhase(game, guessText) {
  const g1 = toGuessPhase(game);
  return processAction(g1, {
    type: 'sendGuess',
    playerId: g1.state.spy,
    text: guessText ?? g1.state.word,
  }).game;
}

// -----------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------
describe('Spy - setup', () => {
  it('immediately starts the first round (phase is clues)', () => {
    const game = makeGame();
    expect(game.state.phase).toBe('clues');
  });

  it('assigns a spy from the player list', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    expect(['p1', 'p2', 'p3']).toContain(game.state.spy);
  });

  it('assigns a word from SPY_WORDS by default', () => {
    const game = makeGame();
    expect(SPY_WORDS).toContain(game.state.word);
  });

  it('uses custom words when provided', () => {
    const customWords = ['apple', 'orange'];
    const game = makeGame(['p1', 'p2'], { words: customWords });
    expect(customWords).toContain(game.state.word);
  });

  it('uses custom rounds count', () => {
    const game = makeGame(['p1', 'p2'], { rounds: 5 });
    expect(game.state.totalRounds).toBe(5);
  });

  it('defaults to 10 total rounds', () => {
    const game = makeGame();
    expect(game.state.totalRounds).toBe(10);
  });

  it('initialises scores at 0 for all players', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    expect(game.state.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('round counter starts at 1 (first round already started)', () => {
    const game = makeGame();
    expect(game.state.round).toBe(1);
  });

  it('clues object starts empty', () => {
    const game = makeGame();
    expect(game.state.clues).toEqual({});
  });
});

// -----------------------------------------------------------------------
// Clue submission
// -----------------------------------------------------------------------
describe('Spy - sendClue', () => {
  it('records a clue for a non-spy player', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const { game: g2, events } = processAction(game, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'ocean',
    });
    expect(g2.state.clues[nonSpy]).toBe('ocean');
    expect(events[0].type).toBe('clue_submitted');
    expect(events[0].clue).toBe('ocean');
  });

  it('only records the first word of multi-word text', () => {
    const game = makeGame(['p1', 'p2']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const { game: g2 } = processAction(game, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'big ocean',
    });
    expect(g2.state.clues[nonSpy]).toBe('big');
  });

  it('rejects a clue from the spy', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const { events } = processAction(game, {
      type: 'sendClue',
      playerId: game.state.spy,
      text: 'water',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/spy cannot/i);
  });

  it('rejects a duplicate clue from the same player', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const { game: g2 } = processAction(game, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'first',
    });
    const { events } = processAction(g2, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'second',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/already submitted/i);
  });

  it('rejects empty clue text', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const { events } = processAction(game, {
      type: 'sendClue',
      playerId: nonSpy,
      text: '   ',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/empty/i);
  });

  it('rejects a clue when not in clues phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g2 = toGuessPhase(game); // now in 'guess' phase
    const nonSpy = g2.state.players.find(p => p !== g2.state.spy);
    const { events } = processAction(g2, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'water',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/not in clues/i);
  });
});

// -----------------------------------------------------------------------
// Guess scoring
// -----------------------------------------------------------------------
describe('Spy - sendGuess', () => {
  it('correct guess awards spy 3 points', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const spyId = g1.state.spy;
    const { game: g2 } = processAction(g1, {
      type: 'sendGuess',
      playerId: spyId,
      text: g1.state.word,
    });
    expect(g2.state.scores[spyId]).toBe(3);
  });

  it('correct guess sets phase to reveal', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const { game: g2 } = processAction(g1, {
      type: 'sendGuess',
      playerId: g1.state.spy,
      text: g1.state.word,
    });
    expect(g2.state.phase).toBe('reveal');
  });

  it('emits spy_guessed event with correct:true on right guess', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const { events } = processAction(g1, {
      type: 'sendGuess',
      playerId: g1.state.spy,
      text: g1.state.word,
    });
    expect(events[0].type).toBe('spy_guessed');
    expect(events[0].correct).toBe(true);
    expect(events[0].word).toBe(g1.state.word);
  });

  it('wrong guess awards non-spies 1 point each', () => {
    const players = ['p1', 'p2', 'p3'];
    const game = makeGame(players);
    const g1 = toGuessPhase(game);
    const spyId = g1.state.spy;
    const nonSpies = players.filter(p => p !== spyId);

    const { game: g2 } = processAction(g1, {
      type: 'sendGuess',
      playerId: spyId,
      text: 'WRONG_WORD_12345',
    });
    for (const pid of nonSpies) {
      expect(g2.state.scores[pid]).toBe(1);
    }
    expect(g2.state.scores[spyId]).toBe(0);
  });

  it('emits spy_guessed event with correct:false on wrong guess', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const { events } = processAction(g1, {
      type: 'sendGuess',
      playerId: g1.state.spy,
      text: 'WRONG_WORD_12345',
    });
    expect(events[0].correct).toBe(false);
  });

  it('rejects guess from non-spy player', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const nonSpy = g1.state.players.find(p => p !== g1.state.spy);
    const { events } = processAction(g1, {
      type: 'sendGuess',
      playerId: nonSpy,
      text: g1.state.word,
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/only the spy/i);
  });

  it('rejects guess when not in guess phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    // Still in 'clues' phase
    const { events } = processAction(game, {
      type: 'sendGuess',
      playerId: game.state.spy,
      text: game.state.word,
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/not in guess/i);
  });

  it('comparison is case-insensitive', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toGuessPhase(game);
    const { game: g2, events } = processAction(g1, {
      type: 'sendGuess',
      playerId: g1.state.spy,
      text: g1.state.word.toUpperCase(),
    });
    expect(events[0].correct).toBe(true);
    expect(g2.state.scores[g1.state.spy]).toBe(3);
  });
});

// -----------------------------------------------------------------------
// timerExpired transitions
// -----------------------------------------------------------------------
describe('Spy - timerExpired transitions', () => {
  it('clues -> guess', () => {
    const game = makeGame();
    const { game: g2, events } = processAction(game, { type: 'timerExpired', phase: 'clues' });
    expect(g2.state.phase).toBe('guess');
    expect(events[0].type).toBe('phase_change');
    expect(events[0].phase).toBe('guess');
  });

  it('guess timeout -> reveal; non-spies get +1 each', () => {
    const players = ['p1', 'p2', 'p3'];
    const game = makeGame(players);
    const g1 = toGuessPhase(game);
    const spyId = g1.state.spy;
    const nonSpies = players.filter(p => p !== spyId);

    const { game: g2, events } = processAction(g1, { type: 'timerExpired', phase: 'guess' });
    expect(g2.state.phase).toBe('reveal');
    expect(events[0].type).toBe('spy_timeout');
    for (const pid of nonSpies) {
      expect(g2.state.scores[pid]).toBe(1);
    }
    expect(g2.state.scores[spyId]).toBe(0);
  });

  it('reveal -> score', () => {
    const game = makeGame();
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const { game: g2, events } = processAction(g1, { type: 'timerExpired', phase: 'reveal' });
    expect(g2.state.phase).toBe('score');
    expect(events[0].phase).toBe('score');
  });

  it('score -> new_round when rounds remaining', () => {
    const game = makeGame(['p1', 'p2'], { rounds: 3 });
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const g2 = processAction(g1, { type: 'timerExpired', phase: 'reveal' }).game;
    const { game: g3, events } = processAction(g2, { type: 'timerExpired', phase: 'score' });

    expect(g3.state.phase).toBe('clues');
    expect(g3.state.round).toBe(2);
    expect(events[0].type).toBe('new_round');
  });

  it('score -> finished when all rounds played', () => {
    const game = makeGame(['p1', 'p2'], { rounds: 1 });
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const g2 = processAction(g1, { type: 'timerExpired', phase: 'reveal' }).game;
    const { game: g3, events } = processAction(g2, { type: 'timerExpired', phase: 'score' });

    expect(g3.state.phase).toBe('finished');
    expect(events[0].phase).toBe('finished');
  });

  it('ignores timerExpired for wrong phase', () => {
    const game = makeGame();
    expect(game.state.phase).toBe('clues');
    const { game: same, events } = processAction(game, { type: 'timerExpired', phase: 'guess' });
    expect(same.state.phase).toBe('clues');
    expect(events).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// View filtering
// -----------------------------------------------------------------------
describe('Spy - view filtering', () => {
  it('spy does not see the word', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const view = getView(game, game.state.spy);
    expect(view.isSpy).toBe(true);
    expect(view.word).toBeNull();
  });

  it('non-spy sees the word', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const view = getView(game, nonSpy);
    expect(view.isSpy).toBe(false);
    expect(view.word).toBe(game.state.word);
  });

  it('spy is hidden during clues phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const view = getView(game, 'p1');
    expect(view.spy).toBeNull();
  });

  it('spy is revealed during reveal phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const view = getView(g1, 'p1');
    expect(view.spy).toBe(g1.state.spy);
  });

  it('clues visible during guess phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const nonSpy = game.state.players.find(p => p !== game.state.spy);
    const { game: g2 } = processAction(game, {
      type: 'sendClue',
      playerId: nonSpy,
      text: 'river',
    });
    const g3 = toGuessPhase(g2);
    const view = getView(g3, nonSpy);
    expect(view.clues[nonSpy]).toBe('river');
  });

  it('revealedWord and spyGuess visible during reveal phase', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const view = getView(g1, 'p1');
    expect(view.revealedWord).toBe(g1.state.word);
    expect(view.spyGuess).toBe('wrong_word_12345');
  });

  it('finalScores visible in finished phase', () => {
    const game = makeGame(['p1', 'p2'], { rounds: 1 });
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const g2 = processAction(g1, { type: 'timerExpired', phase: 'reveal' }).game;
    const g3 = processAction(g2, { type: 'timerExpired', phase: 'score' }).game;
    expect(g3.state.phase).toBe('finished');
    const view = getView(g3, 'p1');
    expect(view.finalScores).toBeDefined();
  });
});

// -----------------------------------------------------------------------
// endIf / full-game
// -----------------------------------------------------------------------
describe('Spy - endIf', () => {
  it('returns null during game play', () => {
    const game = makeGame();
    expect(checkEnd(game)).toBeNull();
  });

  it('returns winner and scores when phase is finished', () => {
    const game = makeGame(['p1', 'p2'], { rounds: 1 });
    const g1 = toRevealPhase(game, 'WRONG_WORD_12345');
    const g2 = processAction(g1, { type: 'timerExpired', phase: 'reveal' }).game;
    const g3 = processAction(g2, { type: 'timerExpired', phase: 'score' }).game;

    const result = checkEnd(g3);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('winner');
    expect(result).toHaveProperty('scores');
  });
});
