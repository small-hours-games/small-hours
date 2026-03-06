'use strict';

const fs = require('fs');
const path = require('path');

// Load words from JSON
const wordsPath = path.join(__dirname, '../data/words.json');
const wordsData = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
const WORDS = wordsData.words;

// Phase constants
const PHASES = {
  SETUP: 'setup',
  CLUES: 'clues',
  GUESS: 'guess',
  REVEAL: 'reveal',
  SCORE: 'score'
};

// Phase durations (in milliseconds)
const PHASE_DURATIONS = {
  [PHASES.SETUP]: 5000,
  [PHASES.CLUES]: 30000,
  [PHASES.GUESS]: 20000,
  [PHASES.REVEAL]: 5000,
  [PHASES.SCORE]: 3000
};

class SpyGame {
  constructor(players) {
    this.players = players; // Map of username -> {ws, score, ...}
    this.rounds = [];
    this.currentRoundIndex = 0;
    this.gameRunning = true;
    this.maxRounds = 10;

    // Initialize first round
    this.initializeRound();
  }

  initializeRound() {
    const roundNum = this.currentRoundIndex + 1;

    // Pick random word from words array
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];

    // Pick random spy from players
    const playerNames = Array.from(this.players.keys());
    const spyIndex = Math.floor(Math.random() * playerNames.length);
    const spy = playerNames[spyIndex];

    // Create round state
    const round = {
      number: roundNum,
      word,
      spy,
      phase: PHASES.SETUP,
      phaseStartTime: Date.now(),
      clues: {}, // username -> clue text
      spyGuess: null,
      spyGuessCorrect: null,
      scores: {} // username -> points earned this round
    };

    // Initialize scores object for all players
    for (const username of playerNames) {
      round.scores[username] = 0;
    }

    this.rounds.push(round);
  }

  getCurrentRound() {
    return this.rounds[this.currentRoundIndex];
  }

  update() {
    if (!this.gameRunning) return;

    const round = this.getCurrentRound();
    const now = Date.now();
    const elapsed = now - round.phaseStartTime;
    const phaseDuration = PHASE_DURATIONS[round.phase];

    if (elapsed >= phaseDuration) {
      // Transition to next phase
      switch (round.phase) {
        case PHASES.SETUP:
          this.transitionToClues();
          break;
        case PHASES.CLUES:
          this.transitionToGuess();
          break;
        case PHASES.GUESS:
          this.transitionToReveal();
          break;
        case PHASES.REVEAL:
          this.transitionToScore();
          break;
        case PHASES.SCORE:
          this.transitionToNextRound();
          break;
      }
    }
  }

  transitionToClues() {
    const round = this.getCurrentRound();
    round.phase = PHASES.CLUES;
    round.phaseStartTime = Date.now();
    round.clues = {};
  }

  transitionToGuess() {
    const round = this.getCurrentRound();
    round.phase = PHASES.GUESS;
    round.phaseStartTime = Date.now();
    // Spy now has 20s to guess
  }

  transitionToReveal() {
    const round = this.getCurrentRound();
    round.phase = PHASES.REVEAL;
    round.phaseStartTime = Date.now();

    // Determine if spy guessed correctly
    if (round.spyGuess !== null) {
      round.spyGuessCorrect = round.spyGuess.toLowerCase() === round.word.toLowerCase();
    } else {
      round.spyGuessCorrect = false;
    }
  }

  transitionToScore() {
    const round = this.getCurrentRound();
    round.phase = PHASES.SCORE;
    round.phaseStartTime = Date.now();

    // Apply scoring rules
    if (round.spyGuessCorrect) {
      // Spy guesses correctly: spy +3 points, non-spies +0
      round.scores[round.spy] = 3;
    } else {
      // Spy guesses wrong: spy +0, each non-spy +1
      for (const username of this.players.keys()) {
        if (username !== round.spy) {
          round.scores[username] = 1;
        }
      }
    }

    // Update player scores
    for (const [username, points] of Object.entries(round.scores)) {
      if (this.players.has(username)) {
        this.players.get(username).score += points;
      }
    }
  }

  transitionToNextRound() {
    // Check if game should continue
    if (this.currentRoundIndex >= this.maxRounds - 1) {
      this.gameRunning = false;
      return;
    }

    this.currentRoundIndex++;
    this.initializeRound();
  }

  receiveClue(username, clue) {
    const round = this.getCurrentRound();

    // Only accept clues during CLUES phase, and only from non-spies
    if (round.phase !== PHASES.CLUES || username === round.spy) {
      return false;
    }

    round.clues[username] = clue;
    return true;
  }

  receiveGuess(username, guess) {
    const round = this.getCurrentRound();

    // Only accept guesses during GUESS phase, and only from spy
    if (round.phase !== PHASES.GUESS || username !== round.spy) {
      return false;
    }

    round.spyGuess = guess;
    return true;
  }

  getState(forUsername) {
    const round = this.getCurrentRound();
    const now = Date.now();
    const elapsed = Math.max(0, now - round.phaseStartTime);
    const phaseDuration = PHASE_DURATIONS[round.phase];
    const timeRemaining = Math.max(0, phaseDuration - elapsed);

    // Hide the word from the spy (unless in reveal/score phase where it's public)
    const isRevealPhase = round.phase === PHASES.REVEAL || round.phase === PHASES.SCORE;
    const isSpy = forUsername === round.spy;
    const showWord = !isSpy || isRevealPhase;

    return {
      roundNumber: round.number,
      phase: round.phase,
      timeRemaining,
      spy: isRevealPhase ? round.spy : null,
      word: showWord ? round.word : null,
      clues: round.clues,
      spyGuess: isRevealPhase ? round.spyGuess : null,
      spyGuessCorrect: isRevealPhase ? round.spyGuessCorrect : null,
      scores: round.scores,
      gameRunning: this.gameRunning,
      currentRound: this.currentRoundIndex + 1,
      maxRounds: this.maxRounds,
      isSpy: isSpy,
      playerScores: Array.from(this.players.entries()).map(([username, player]) => ({
        username,
        score: player.score
      }))
    };
  }
}

module.exports = SpyGame;
