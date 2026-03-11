/**
 * Cards Against Humanity (CAH) Game — GameController Adapter
 *
 * Wraps existing CAH game logic in GameController interface.
 * Delegates to games/cah/game-logic.js while providing tick/getState/handlePlayerAction.
 */

'use strict';

const GameController = require('../../server/GameController');
const CAHGameLogic = require('./game-logic');

class CAHGameController extends GameController {
  constructor(maxRounds = 8) {
    super();
    this.cahGame = null;
    this.maxRounds = maxRounds;
    this.wsMap = new Map(); // Map usernames to fake ws objects for compatibility
  }

  start() {
    this.startTime = Date.now();

    // Create fake broadcast callback (room handles actual broadcasting)
    const broadcast = (msg) => {
      // Room will call getState() ~100ms
    };

    this.cahGame = new CAHGameLogic(broadcast);

    // Add players with fake WebSocket objects
    for (const [username] of this.players) {
      const fakeWs = { readyState: 1 };
      this.wsMap.set(username, fakeWs);
      this.cahGame.addPlayer(fakeWs, username);
    }

    this.cahGame.startGame(this.maxRounds);
    this.transitionTo('COUNTDOWN');
  }

  tick() {
    if (!this.cahGame) return;

    const now = Date.now();

    switch (this.phase) {
      case 'COUNTDOWN':
        if (now - this.phaseStartTime >= 3000) {
          this.transitionTo('ACTIVE');
        }
        break;

      case 'ACTIVE':
        // Let CAH game manage its own state
        if (this.cahGame.state === 'GAME_OVER') {
          this.transitionTo('GAME_OVER');
        }
        break;

      case 'GAME_OVER':
        // Game stays in GAME_OVER
        break;
    }
  }

  getState() {
    if (!this.cahGame) {
      return {
        type: 'CAH_STATE',
        phase: this.phase,
        state: 'LOBBY',
        players: [],
        round: 0,
        maxRounds: this.maxRounds
      };
    }

    const players = Array.from(this.players.values()).map(p => {
      const cahPlayer = this.cahGame.players.get(p.username);
      return {
        username: p.username,
        points: cahPlayer?.points || 0,
        hasSubmitted: this.cahGame.submissions?.has(p.username) || false
      };
    });

    return {
      type: 'CAH_STATE',
      phase: this.phase,
      state: this.cahGame.state,
      round: this.cahGame.round,
      maxRounds: this.cahGame.maxRounds,
      czar: this.cahGame._currentCzar ? this.cahGame._currentCzar() : null,
      blackCard: this.cahGame.currentBlackCard,
      submittedCount: this.cahGame.submissions?.size || 0,
      totalNonCzar: Math.max(0, this.players.size - 1),
      players
    };
  }

  handlePlayerAction(username, action) {
    if (!this.cahGame) return;

    const ws = this.wsMap.get(username);
    if (!ws) return;

    if (action.cardIds && Array.isArray(action.cardIds)) {
      // Submit cards
      this.cahGame.submitCards(username, action.cardIds);
    } else if (action.submissionId !== undefined) {
      // Czar pick
      this.cahGame.czarPick(username, action.submissionId);
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
    this.wsMap.delete(username);
    if (this.cahGame) {
      this.cahGame.removePlayer(null); // CAH logic doesn't need ws for remove
    }
  }

  transitionTo(newPhase) {
    this.phase = newPhase;
    this.phaseStartTime = Date.now();
  }
}

module.exports = CAHGameController;
