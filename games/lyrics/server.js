/**
 * Lyrics Game — GameController Adapter
 *
 * Wraps existing Lyrics game logic in GameController interface.
 * Delegates to games/lyrics/server/game.js while providing tick/getState/handlePlayerAction.
 */

'use strict';

const GameController = require('../../server/GameController');
const { LyricsGame: LyricsGameLogic } = require('./server/game');

class LyricsGameController extends GameController {
  constructor(questionCount = 10) {
    super();
    this.lyricsGame = null;
    this.questionCount = questionCount;
    this.room = null;
  }

  setRoom(room) {
    this.room = room;
  }

  start() {
    this.startTime = Date.now();
    // Initialize lyrics game with broadcast function
    const { broadcastAll } = require('../../server/broadcast');
    this.lyricsGame = new LyricsGameLogic(this.room ? (msg) => broadcastAll(this.room, msg) : (msg) => {});

    // Add players
    for (const [username, playerData] of this.players) {
      this.lyricsGame.addPlayer(null, username);
    }

    this.lyricsGame.startGame(this.questionCount);
    this.transitionTo('COUNTDOWN');
  }

  tick() {
    if (!this.lyricsGame) return;

    const now = Date.now();

    switch (this.phase) {
      case 'COUNTDOWN':
        if (now - this.phaseStartTime >= 3000) {
          this.transitionTo('ACTIVE');
        }
        break;

      case 'ACTIVE':
        // Check if all players answered or time limit reached
        const state = this.lyricsGame.getState();
        if (state && state.gameOver) {
          this.transitionTo('GAME_OVER');
        }
        break;

      case 'GAME_OVER':
        // Game stays in GAME_OVER
        break;
    }
  }

  getState() {
    if (!this.lyricsGame) {
      return {
        type: 'LYRICS_STATE',
        phase: this.phase,
        players: [],
        currentQuestion: 0,
        totalQuestions: this.questionCount
      };
    }

    const lyricsState = this.lyricsGame.getState();
    const players = Array.from(this.players.values()).map(p => ({
      username: p.username,
      score: p.score || 0
    }));

    return {
      type: 'LYRICS_STATE',
      phase: this.phase,
      players,
      currentQuestion: lyricsState?.currentQuestion || 0,
      totalQuestions: this.questionCount,
      gameOver: lyricsState?.gameOver || false,
      ...lyricsState
    };
  }

  handlePlayerAction(username, action) {
    if (!this.lyricsGame || action.answerId === undefined) return;

    this.lyricsGame.receiveAnswer(username, action.answerId);
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

module.exports = LyricsGameController;
