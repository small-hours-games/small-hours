/**
 * Number Guess Game — Example GameController Implementation
 *
 * This is a reference implementation showing how to structure a game
 * using the GameController pattern for auto-discovery via gameRegistry.
 *
 * Players guess a number between 1-100. Each round, feedback is given
 * (too high/too low). Fewer guesses = higher score.
 */

'use strict';

const GameController = require('../../server/GameController');

class GuessController extends GameController {
  constructor() {
    super();
    this.secretNumber = null;
    this.minRange = 1;
    this.maxRange = 100;
    this.roundGuesses = new Map(); // username -> [guess, guess, ...]
    this.roundStartTime = null;
    this.roundDuration = 45000; // 45 seconds per round
  }

  /**
   * Lifecycle: called when game starts
   */
  start() {
    this.startTime = Date.now();
    this.transitionTo('COUNTDOWN');
  }

  /**
   * Core game loop: called ~100ms by room
   * Updates phase, manages timers
   */
  tick() {
    const now = Date.now();

    switch (this.phase) {
      case 'COUNTDOWN':
        if (now - this.phaseStartTime >= 3000) {
          this._startRound();
        }
        break;

      case 'ACTIVE':
        if (now - this.roundStartTime >= this.roundDuration) {
          this._endRound();
        }
        break;

      case 'REVEAL':
        if (now - this.phaseStartTime >= 3000) {
          // Check if game is over or continue
          const hasWinners = [...this.players.values()].some(p => p.lastGuess === this.secretNumber);
          if (hasWinners || this.players.size === 0) {
            this.transitionTo('GAME_OVER');
          } else {
            this._startRound();
          }
        }
        break;

      case 'GAME_OVER':
        // Game stays in GAME_OVER until room resets
        break;
    }
  }

  /**
   * Return game state for broadcasting to all clients
   */
  getState() {
    const players = Array.from(this.players.values()).map(p => ({
      username: p.username,
      score: p.score,
      lastGuess: p.lastGuess,
      feedback: p.feedback
    }));

    return {
      type: 'GUESS_STATE',
      phase: this.phase,
      secretNumber: this.phase === 'REVEAL' ? this.secretNumber : null,
      minRange: this.minRange,
      maxRange: this.maxRange,
      players,
      timeRemaining: this.phase === 'ACTIVE'
        ? Math.max(0, this.roundDuration - (Date.now() - this.roundStartTime))
        : 0
    };
  }

  /**
   * Handle player action (guess submission)
   */
  handlePlayerAction(username, action) {
    if (!action.guess || this.phase !== 'ACTIVE') return;

    const guess = parseInt(action.guess);
    if (!Number.isInteger(guess) || guess < this.minRange || guess > this.maxRange) {
      return;
    }

    const player = this.players.get(username);
    if (!player) return;

    player.lastGuess = guess;

    if (guess === this.secretNumber) {
      player.score += Math.max(10, Math.floor(this.roundDuration / 1000) - Math.floor((Date.now() - this.roundStartTime) / 1000));
      player.feedback = 'CORRECT! 🎉';
      this.transitionTo('REVEAL');
    } else if (guess < this.secretNumber) {
      player.feedback = 'TOO LOW ⬆️';
    } else {
      player.feedback = 'TOO HIGH ⬇️';
    }
  }

  /**
   * Add player to game
   */
  addPlayer(username, playerData) {
    this.players.set(username, {
      username,
      score: 0,
      lastGuess: null,
      feedback: '',
      ...playerData
    });
  }

  /**
   * Remove player from game
   */
  removePlayer(username) {
    this.players.delete(username);
  }

  /**
   * Private helpers
   */

  _startRound() {
    this.secretNumber = Math.floor(Math.random() * (this.maxRange - this.minRange + 1)) + this.minRange;
    this.roundStartTime = Date.now();

    // Reset player feedback for new round
    for (const player of this.players.values()) {
      player.lastGuess = null;
      player.feedback = '';
    }

    this.transitionTo('ACTIVE');
  }

  _endRound() {
    this.transitionTo('REVEAL');
  }
}

module.exports = GuessController;
