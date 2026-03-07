'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const SpyGame = require('../games/spy/server/game');

function makePlayers(names) {
  const players = new Map();
  for (const name of names) {
    players.set(name, { ws: null, score: 0 });
  }
  return players;
}

describe('SpyGame - Initialization', () => {
  test('creates game with correct initial state', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    assert.strictEqual(game.gameRunning, true);
    assert.strictEqual(game.currentRoundIndex, 0);
    assert.strictEqual(game.rounds.length, 1);
  });

  test('first round has setup phase', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    assert.strictEqual(round.phase, 'setup');
    assert.strictEqual(round.number, 1);
  });

  test('picks a spy from the players', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    assert.ok(['Alice', 'Bob', 'Charlie'].includes(round.spy));
  });

  test('picks a word', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    assert.ok(round.word);
    assert.ok(typeof round.word === 'string');
    assert.ok(round.word.length > 0);
  });

  test('initializes scores for all players', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      assert.strictEqual(round.scores[name], 0);
    }
  });
});

describe('SpyGame - Phase Transitions', () => {
  test('transitionToClues sets phase to clues', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    game.transitionToClues();
    assert.strictEqual(game.getCurrentRound().phase, 'clues');
  });

  test('transitionToGuess sets phase to guess', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    game.transitionToClues();
    game.transitionToGuess();
    assert.strictEqual(game.getCurrentRound().phase, 'guess');
  });

  test('transitionToReveal marks spy guess correct/incorrect', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    const round = game.getCurrentRound();
    round.phase = 'guess';
    round.spyGuess = round.word; // correct guess
    game.transitionToReveal();
    assert.strictEqual(round.spyGuessCorrect, true);
  });

  test('transitionToReveal handles no guess', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    const round = game.getCurrentRound();
    round.phase = 'guess';
    round.spyGuess = null;
    game.transitionToReveal();
    assert.strictEqual(round.spyGuessCorrect, false);
  });

  test('transitionToReveal is case-insensitive', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    const round = game.getCurrentRound();
    round.phase = 'guess';
    round.spyGuess = round.word.toUpperCase();
    game.transitionToReveal();
    assert.strictEqual(round.spyGuessCorrect, true);
  });
});

describe('SpyGame - Scoring', () => {
  test('spy correct guess: spy gets 3 points', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    round.spyGuessCorrect = true;
    game.transitionToScore();
    assert.strictEqual(round.scores[round.spy], 3);
    // Non-spies get 0
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      if (name !== round.spy) {
        assert.strictEqual(round.scores[name], 0);
      }
    }
  });

  test('spy wrong guess: non-spies each get 1 point', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    round.spyGuessCorrect = false;
    game.transitionToScore();
    assert.strictEqual(round.scores[round.spy], 0);
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      if (name !== round.spy) {
        assert.strictEqual(round.scores[name], 1);
      }
    }
  });

  test('scoring updates player cumulative scores', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const game = new SpyGame(players);
    const round = game.getCurrentRound();
    round.spyGuessCorrect = false;
    game.transitionToScore();
    for (const [name, p] of players) {
      if (name !== round.spy) {
        assert.strictEqual(p.score, 1);
      }
    }
  });
});

describe('SpyGame - Clue and Guess', () => {
  test('receiveClue accepted from non-spy during CLUES phase', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const nonSpy = ['Alice', 'Bob', 'Charlie'].find(n => n !== round.spy);
    const result = game.receiveClue(nonSpy, 'something related');
    assert.strictEqual(result, true);
    assert.strictEqual(round.clues[nonSpy], 'something related');
  });

  test('receiveClue rejected from spy', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const result = game.receiveClue(round.spy, 'trying to blend in');
    assert.strictEqual(result, false);
    assert.strictEqual(round.clues[round.spy], undefined);
  });

  test('receiveClue rejected outside CLUES phase', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    // Still in setup phase
    const round = game.getCurrentRound();
    const nonSpy = ['Alice', 'Bob', 'Charlie'].find(n => n !== round.spy);
    const result = game.receiveClue(nonSpy, 'early clue');
    assert.strictEqual(result, false);
  });

  test('receiveGuess accepted from spy during GUESS phase', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    game.transitionToGuess();
    const round = game.getCurrentRound();
    const result = game.receiveGuess(round.spy, 'my guess');
    assert.strictEqual(result, true);
    assert.strictEqual(round.spyGuess, 'my guess');
  });

  test('receiveGuess rejected from non-spy', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    game.transitionToGuess();
    const round = game.getCurrentRound();
    const nonSpy = ['Alice', 'Bob', 'Charlie'].find(n => n !== round.spy);
    const result = game.receiveGuess(nonSpy, 'not spy');
    assert.strictEqual(result, false);
  });

  test('receiveGuess rejected outside GUESS phase', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const result = game.receiveGuess(round.spy, 'too early');
    assert.strictEqual(result, false);
  });
});

describe('SpyGame - State Visibility', () => {
  test('spy cannot see word during active phases', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const state = game.getState(round.spy);
    assert.strictEqual(state.word, null);
    assert.strictEqual(state.isSpy, true);
  });

  test('non-spy can see word during active phases', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const nonSpy = ['Alice', 'Bob', 'Charlie'].find(n => n !== round.spy);
    const state = game.getState(nonSpy);
    assert.strictEqual(state.word, round.word);
    assert.strictEqual(state.isSpy, false);
  });

  test('spy can see word during REVEAL phase', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    const round = game.getCurrentRound();
    round.phase = 'reveal';
    const state = game.getState(round.spy);
    assert.strictEqual(state.word, round.word);
  });

  test('spy identity hidden until REVEAL', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const nonSpy = ['Alice', 'Bob', 'Charlie'].find(n => n !== round.spy);
    const state = game.getState(nonSpy);
    assert.strictEqual(state.spy, null); // hidden
  });

  test('spy identity shown during REVEAL', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    const round = game.getCurrentRound();
    round.phase = 'reveal';
    const state = game.getState('Alice');
    assert.strictEqual(state.spy, round.spy);
  });

  test('display always sees word', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const round = game.getCurrentRound();
    const state = game.getState(null, { display: true });
    assert.strictEqual(state.word, round.word);
  });

  test('unknown caller cannot see word', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob', 'Charlie']));
    game.transitionToClues();
    const state = game.getState(null);
    assert.strictEqual(state.word, null);
  });

  test('state includes timeRemaining and playerScores', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    const state = game.getState('Alice');
    assert.ok(state.hasOwnProperty('timeRemaining'));
    assert.ok(state.hasOwnProperty('playerScores'));
    assert.strictEqual(state.playerScores.length, 2);
    assert.strictEqual(state.gameRunning, true);
  });
});

describe('SpyGame - Round Progression', () => {
  test('transitionToNextRound increments round index', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    assert.strictEqual(game.currentRoundIndex, 0);
    game.transitionToNextRound();
    assert.strictEqual(game.currentRoundIndex, 1);
    assert.strictEqual(game.rounds.length, 2);
  });

  test('game ends after maxRounds', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    game.maxRounds = 2;
    game.transitionToNextRound(); // round 2
    game.transitionToNextRound(); // should end
    assert.strictEqual(game.gameRunning, false);
  });

  test('update auto-transitions after phase duration', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    const round = game.getCurrentRound();
    // Set phase start far in the past
    round.phaseStartTime = Date.now() - 100000;
    game.update();
    // Should have transitioned from setup to clues
    assert.strictEqual(game.getCurrentRound().phase, 'clues');
  });

  test('update does nothing when game not running', () => {
    const game = new SpyGame(makePlayers(['Alice', 'Bob']));
    game.gameRunning = false;
    const phase = game.getCurrentRound().phase;
    game.update();
    assert.strictEqual(game.getCurrentRound().phase, phase);
  });
});
