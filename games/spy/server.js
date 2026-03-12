/**
 * Spy Game — GameController Adapter
 *
 * Wraps existing Spy game logic in GameController interface.
 * Delegates to games/spy/server/game.js while providing tick/getState/handlePlayerAction.
 */

'use strict';

const GameController = require('../../server/GameController');
const SpyGameLogic = require('./server/game');

class SpyGameController extends GameController {
  constructor() {
    super();
    this.spyGame = null;
    this.phaseToSpyPhase = {};
  }

  start() {
    this.startTime = Date.now();
    // Initialize spy game with player names
    const playerNames = Array.from(this.players.keys());
    this.spyGame = new SpyGameLogic(
      new Map(playerNames.map(name => [name, { username: name, score: 0 }]))
    );
    this.transitionTo('COUNTDOWN');
  }

  tick() {
    if (!this.spyGame) return;

    const now = Date.now();

    switch (this.phase) {
      case 'COUNTDOWN':
        if (now - this.phaseStartTime >= 3000) {
          this.transitionTo('SETUP');
        }
        break;

      case 'SETUP':
      case 'CLUES':
      case 'GUESS':
      case 'REVEAL':
      case 'SCORE':
        // Let spy game handle its own phase logic
        this.spyGame.update();
        const currentRound = this.spyGame.getCurrentRound();

        if (currentRound && currentRound.phase !== this.phase) {
          this.transitionTo(currentRound.phase);
        }

        // Check if game is over
        if (!this.spyGame.gameRunning) {
          this.transitionTo('GAME_OVER');
        }
        break;

      case 'GAME_OVER':
        // Game stays in GAME_OVER
        break;
    }
  }

  getState() {
    if (!this.spyGame) {
      return {
        type: 'SPY_STATE',
        phase: this.phase,
        players: [],
        round: 0,
        maxRounds: 0
      };
    }

    const currentRound = this.spyGame.getCurrentRound();
    const players = Array.from(this.spyGame.players.values()).map(p => {
      const roundScores = currentRound ? (currentRound.scores[p.username] || 0) : 0;
      return {
        username: p.username,
        score: p.score || 0,
        roundScore: roundScores,
        isSpy: currentRound ? p.username === currentRound.spy : false
      };
    });

    return {
      type: 'SPY_STATE',
      phase: this.phase,
      round: currentRound ? currentRound.number : 0,
      maxRounds: this.spyGame.maxRounds,
      word: this.phase === 'REVEAL' ? currentRound?.word : null,
      spy: this.phase === 'REVEAL' ? currentRound?.spy : null,
      players,
      clues: currentRound?.clues || {},
      spyGuess: currentRound?.spyGuess,
      spyGuessCorrect: currentRound?.spyGuessCorrect
    };
  }

  handlePlayerAction(username, action) {
    if (!this.spyGame) return;

    const currentRound = this.spyGame.getCurrentRound();
    if (!currentRound) return;

    if (action.clue && this.phase === 'CLUES') {
      currentRound.clues[username] = action.clue;
    } else if (action.guess && this.phase === 'GUESS' && username === currentRound.spy) {
      currentRound.spyGuess = action.guess;
      currentRound.spyGuessCorrect = action.guess === currentRound.word;
    }
  }

  addPlayer(username, playerData) {
    this.players.set(username, {
      username,
      score: 0,
      ...playerData
    });
  }

  removePlayer(username) {
    this.players.delete(username);
  }
}

module.exports = SpyGameController;
