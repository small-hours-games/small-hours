'use strict';

const { fetchQuestions } = require('./questions');
const { translateQuestions } = require('./translator');
const { markQuestionsUsed } = require('./local-db');

// Game states
const STATE = {
  LOBBY: 'LOBBY',
  FETCHING: 'FETCHING',
  COUNTDOWN: 'COUNTDOWN',
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',
  REVEAL: 'REVEAL',
  BETWEEN_QUESTIONS: 'BETWEEN_QUESTIONS',
  GAME_OVER: 'GAME_OVER',
};

const COUNTDOWN_SECONDS = 3;
const BETWEEN_QUESTIONS_DELAY = 5000; // ms
const REVEAL_DELAY = 4000; // ms

class Game {
  constructor(broadcast) {
    // broadcast(msg, targetWs?) — sends to all or one client
    this._broadcast = broadcast;
    this._reset();
  }

  _reset() {
    this.state = STATE.LOBBY;
    this.players = new Map();   // username → { ws, score, rank, answered: false }
    this.questions = [];
    this.currentIdx = -1;
    this.questionStartTime = null;
    this._timer = null;
    this.seenQuestions = new Set(); // tracks question texts shown across rounds
  }

  // ─── Player management ─────────────────────────────────────────────────────

  addPlayer(ws, username) {
    if (this.state !== STATE.LOBBY) {
      // Allow reconnect if username already exists
      if (this.players.has(username)) {
        this._reconnectPlayer(ws, username);
        return { ok: true, reconnected: true };
      }
      return { ok: false, code: 'GAME_IN_PROGRESS', message: 'A game is already running. Please wait.' };
    }

    if (this.players.has(username)) {
      // Duplicate name in lobby — update ws (browser refresh)
      this.players.get(username).ws = ws;
      this._resyncPlayer(ws);
      return { ok: true, reconnected: true };
    }

    if (!username || username.trim().length === 0 || username.length > 20) {
      return { ok: false, code: 'INVALID_USERNAME', message: 'Username must be 1–20 characters.' };
    }

    this.players.set(username, {
      ws, score: 0, rank: null, prevRank: null, answered: false, streak: 0, lastAnswerTime: null,
      powerups: { doublePoints: 1, fiftyFifty: 1, timeFreeze: 1 },
      activePowerup: null, // currently active powerup for this question
    });
    this._broadcastPlayerList();
    return { ok: true };
  }

  removePlayer(ws) {
    for (const [username, player] of this.players.entries()) {
      if (player.ws === ws) {
        if (this.state === STATE.LOBBY) {
          this.players.delete(username);
          this._broadcastPlayerList();
        } else {
          // During game: keep score, just null out ws
          player.ws = null;
        }
        return;
      }
    }
  }

  updatePlayerWs(oldWs, newWs) {
    for (const player of this.players.values()) {
      if (player.ws === oldWs) {
        player.ws = newWs;
        return;
      }
    }
  }

  _broadcastPlayerList() {
    const players = [...this.players.keys()];
    this._broadcast({
      type: 'PLAYER_JOINED',
      players,
      playerCount: players.length,
    });
  }

  // ─── Reconnection ──────────────────────────────────────────────────────────

  _reconnectPlayer(ws, username) {
    const player = this.players.get(username);
    if (!player) return;
    player.ws = ws;
    this._resyncPlayer(ws);
  }

  _resyncPlayer(ws) {
    const send = (msg) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };

    if (this.state === STATE.LOBBY) {
      send({ type: 'PLAYER_JOINED', players: [...this.players.keys()], playerCount: this.players.size });
      return;
    }

    if (this.state === STATE.FETCHING) {
      send({ type: 'GAME_FETCHING' });
      return;
    }

    if (this.state === STATE.COUNTDOWN) {
      send({ type: 'GAME_STARTING', countdown: 0, totalQuestions: this.questions.length });
      return;
    }

    if (this.state === STATE.QUESTION_ACTIVE) {
      const q = this.questions[this.currentIdx];
      const elapsed = Date.now() - this.questionStartTime;
      const remaining = Math.max(0, q.timeLimit * 1000 - elapsed);
      send({
        type: 'QUESTION',
        questionId: q.questionId,
        questionNumber: this.currentIdx + 1,
        totalQuestions: this.questions.length,
        category: q.category,
        question: q.question,
        answers: q.answers,
        timeLimit: q.timeLimit,
        serverTimestamp: this.questionStartTime,
        elapsed,
        remaining,
      });
    }

    if (this.state === STATE.REVEAL || this.state === STATE.BETWEEN_QUESTIONS) {
      this._sendReveal(ws);
    }

    if (this.state === STATE.GAME_OVER) {
      send({ type: 'GAME_OVER', finalScores: this._buildScores() });
    }
  }

  // ─── Game flow ─────────────────────────────────────────────────────────────

  async startGame(categories, questionCount = 20, gameDifficulty = 'normal', language = 'en') {
    if (this.state !== STATE.LOBBY) return;
    if (this.players.size < 1) return;

    this._clearTimer();
    this.state = STATE.FETCHING;
    this._broadcast({ type: 'GAME_FETCHING' });

    try {
      this.questions = await fetchQuestions(categories, questionCount, gameDifficulty);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
      this.state = STATE.LOBBY;
      this._broadcast({ type: 'ERROR', code: 'FETCH_FAILED', message: 'Could not load questions. Please try again.' });
      return;
    }

    if (this.questions.length === 0) {
      this.state = STATE.LOBBY;
      this._broadcast({ type: 'ERROR', code: 'NO_QUESTIONS', message: 'No questions found for selected categories.' });
      return;
    }

    for (const q of this.questions) this.seenQuestions.add(q.question);
    markQuestionsUsed(this.questions);
    this.currentIdx = -1;
    this._startCountdown();
  }

  _startCountdown() {
    this.state = STATE.COUNTDOWN;
    let count = COUNTDOWN_SECONDS;

    this._broadcast({
      type: 'GAME_STARTING',
      countdown: count,
      totalQuestions: this.questions.length,
    });

    const tick = () => {
      count--;
      if (count > 0) {
        this._broadcast({ type: 'COUNTDOWN_TICK', countdown: count });
        this._timer = setTimeout(tick, 1000);
      } else {
        this._nextQuestion();
      }
    };

    this._timer = setTimeout(tick, 1000);
  }

  _nextQuestion() {
    this.currentIdx++;

    if (this.currentIdx >= this.questions.length) {
      this._endGame();
      return;
    }

    // Reset answered flag for all players (save rank before reset for rank-change arrows)
    for (const player of this.players.values()) {
      player.prevRank = player.rank;
      player.answered = false;
      player.lastAnswer = null;
      player.lastDelta = 0;
      player.lastAnswerTime = null;
      player.activePowerup = null;
    }

    this.state = STATE.QUESTION_ACTIVE;
    this.questionStartTime = Date.now();
    const q = this.questions[this.currentIdx];

    this._broadcast({
      type: 'QUESTION',
      questionId: q.questionId,
      questionNumber: this.currentIdx + 1,
      totalQuestions: this.questions.length,
      category: q.category,
      question: q.question,
      answers: q.answers,
      timeLimit: q.timeLimit,
      serverTimestamp: this.questionStartTime,
    });

    this._timer = setTimeout(() => this._revealAnswer(), q.timeLimit * 1000);
  }

  receiveAnswer(ws, questionId, answerId) {
    if (this.state !== STATE.QUESTION_ACTIVE) return;

    const q = this.questions[this.currentIdx];
    if (q.questionId !== questionId) return;

    // Find player by ws
    let username = null;
    let player = null;
    for (const [name, p] of this.players.entries()) {
      if (p.ws === ws) { username = name; player = p; break; }
    }
    if (!player || player.answered) return;

    player.answered = true;
    player.lastAnswer = answerId;

    const elapsed = Date.now() - this.questionStartTime;
    const timeFraction = Math.max(0, 1 - elapsed / (q.timeLimit * 1000));
    const isCorrect = answerId === q.correctId;
    const scoreMult = q.scoreMult || 1;
    const powerupMult = (player.activePowerup === 'doublePoints') ? 2 : 1;
    const delta = isCorrect ? Math.round(1000 * (0.5 + 0.5 * timeFraction) * scoreMult * powerupMult) : 0;
    player.score += delta;
    player.lastDelta = delta;
    player.lastAnswerTime = parseFloat((elapsed / 1000).toFixed(1));
    // Track streak
    if (isCorrect) {
      player.streak = (player.streak || 0) + 1;
    } else {
      player.streak = 0;
    }

    // Confirm to the answering player
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ANSWER_CONFIRMED', questionId, answerId }));
    }

    // Broadcast answer count update
    const answered = [...this.players.values()].filter(p => p.answered).length;
    const total = this.players.size;
    this._broadcast({ type: 'ANSWER_COUNT', questionId, answered, total });

    // Auto-advance if everyone answered
    if (answered === total) {
      this._clearTimer();
      this._timer = setTimeout(() => this._revealAnswer(), 500);
    }
  }

  _revealAnswer() {
    this._clearTimer();
    if (this.state !== STATE.QUESTION_ACTIVE) return;

    this.state = STATE.REVEAL;
    this._updateRanks();
    this._broadcast(this._buildRevealPayload());

    this._timer = setTimeout(() => {
      this.state = STATE.BETWEEN_QUESTIONS;
      this._broadcast({ type: 'NEXT_QUESTION', delay: BETWEEN_QUESTIONS_DELAY / 1000 });
      this._timer = setTimeout(() => this._nextQuestion(), BETWEEN_QUESTIONS_DELAY);
    }, REVEAL_DELAY);
  }

  _buildRevealPayload(ws) {
    const q = this.questions[this.currentIdx];
    const breakdown = { A: 0, B: 0, C: 0, D: 0 };
    const total = this.players.size;

    for (const player of this.players.values()) {
      if (player.lastAnswer && breakdown[player.lastAnswer] !== undefined) {
        breakdown[player.lastAnswer]++;
      }
    }

    // Convert to percentages
    const answerBreakdown = {};
    for (const id of ['A', 'B', 'C', 'D']) {
      answerBreakdown[id] = total > 0 ? Math.round((breakdown[id] / total) * 100) : 0;
    }

    const correctAnswerObj = (q.answers || []).find(a => a.id === q.correctId);
    return {
      type: 'REVEAL',
      questionId: q.questionId,
      correctAnswer: q.correctId,
      correctText: correctAnswerObj ? correctAnswerObj.text : '',
      answerBreakdown,
      scores: this._buildScores(),
    };
  }

  _sendReveal(ws) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(this._buildRevealPayload()));
    }
  }

  _updateRanks() {
    const sorted = [...this.players.entries()]
      .sort(([, a], [, b]) => b.score - a.score);
    sorted.forEach(([username, player], i) => {
      player.rank = i + 1;
    });
  }

  _buildScores() {
    this._updateRanks();
    return [...this.players.entries()]
      .sort(([, a], [, b]) => b.score - a.score)
      .map(([username, p]) => ({
        username,
        score: p.score,
        delta: p.lastDelta || 0,
        rank: p.rank,
        prevRank: p.prevRank,
        streak: p.streak || 0,
        answerTime: p.lastAnswerTime,
        answer: p.lastAnswer || null,
        activePowerup: p.activePowerup || null,
        powerups: p.powerups ? { ...p.powerups } : null,
      }));
  }

  _endGame() {
    this._clearTimer();
    this.state = STATE.GAME_OVER;
    this._updateRanks();
    this._broadcast({
      type: 'GAME_OVER',
      finalScores: this._buildScores(),
    });
  }

  skipReveal() {
    if (this.state === STATE.REVEAL || this.state === STATE.BETWEEN_QUESTIONS) {
      this._clearTimer();
      this._nextQuestion();
    }
  }

  restart() {
    this._clearTimer();
    this._reset();
    this._broadcast({ type: 'RESTARTED' });
  }

  // Keep scores & streaks, pick new categories, play another round
  async continueGame(categories, questionCount = 20, gameDifficulty = 'normal') {
    if (this.state !== STATE.GAME_OVER) return;

    this._clearTimer();
    this.state = STATE.FETCHING;
    this._broadcast({ type: 'GAME_FETCHING' });

    // Reset per-round state but preserve scores, ranks, streaks
    for (const player of this.players.values()) {
      player.prevRank = player.rank;
      player.answered = false;
      player.lastAnswer = null;
      player.lastDelta = 0;
      player.lastAnswerTime = null;
    }

    try {
      this.questions = await fetchQuestions(categories, questionCount, gameDifficulty, this.seenQuestions);
    } catch (err) {
      console.error('Failed to fetch questions for continue:', err);
      this.state = STATE.GAME_OVER;
      this._broadcast({ type: 'ERROR', code: 'FETCH_FAILED', message: 'Could not load questions. Please try again.' });
      return;
    }

    if (this.questions.length === 0) {
      this.state = STATE.GAME_OVER;
      this._broadcast({ type: 'ERROR', code: 'NO_QUESTIONS', message: 'No questions found for selected categories.' });
      return;
    }

    for (const q of this.questions) this.seenQuestions.add(q.question);
    markQuestionsUsed(this.questions);
    this.currentIdx = -1;
    this._startCountdown();
  }

  // ─── Power-ups ─────────────────────────────────────────────────────────────

  usePowerup(ws, powerupType) {
    if (this.state !== STATE.QUESTION_ACTIVE) return { ok: false };

    let username = null;
    let player = null;
    for (const [name, p] of this.players.entries()) {
      if (p.ws === ws) { username = name; player = p; break; }
    }
    if (!player) return { ok: false };

    const validTypes = ['doublePoints', 'fiftyFifty', 'timeFreeze'];
    if (!validTypes.includes(powerupType)) return { ok: false };
    if (!player.powerups || !player.powerups[powerupType] || player.powerups[powerupType] <= 0) {
      return { ok: false, code: 'NO_POWERUP', message: 'No uses remaining.' };
    }
    if (player.activePowerup) {
      return { ok: false, code: 'ALREADY_ACTIVE', message: 'Already using a power-up.' };
    }
    if (player.answered) {
      return { ok: false, code: 'ALREADY_ANSWERED', message: 'Already answered.' };
    }

    player.powerups[powerupType]--;
    player.activePowerup = powerupType;

    const q = this.questions[this.currentIdx];

    if (powerupType === 'fiftyFifty') {
      const wrongAnswers = q.answers.filter(a => a.id !== q.correctId);
      const toRemove = wrongAnswers.sort(() => Math.random() - 0.5).slice(0, 2);
      const removedIds = toRemove.map(a => a.id);

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'POWERUP_ACTIVATED',
          powerupType: 'fiftyFifty',
          removedAnswers: removedIds,
          remaining: { ...player.powerups },
        }));
      }
      this._broadcast({
        type: 'POWERUP_USED',
        username,
        powerupType: 'fiftyFifty',
      });
      return { ok: true };
    }

    if (powerupType === 'timeFreeze') {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'POWERUP_ACTIVATED',
          powerupType: 'timeFreeze',
          extraTime: 10,
          remaining: { ...player.powerups },
        }));
      }
      this._broadcast({
        type: 'POWERUP_USED',
        username,
        powerupType: 'timeFreeze',
      });
      return { ok: true };
    }

    if (powerupType === 'doublePoints') {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'POWERUP_ACTIVATED',
          powerupType: 'doublePoints',
          remaining: { ...player.powerups },
        }));
      }
      this._broadcast({
        type: 'POWERUP_USED',
        username,
        powerupType: 'doublePoints',
      });
      return { ok: true };
    }

    return { ok: false };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  get playerCount() { return this.players.size; }
  get currentState() { return this.state; }
}

// ─── Room-integrated message handler ───────────────────────────────────────

/**
 * Handle quiz-related player WebSocket messages.
 * @param {WebSocket} ws
 * @param {{ type: string }} msg
 * @param {object} room  – room object from the rooms registry
 * @returns {boolean} true if the message was handled, false otherwise
 */
function handleMessage(ws, msg, room) {
  const { type } = msg;
  const username = room.wsToUsername.get(ws);

  switch (type) {
    case 'ANSWER':
      if (room.game) room.game.receiveAnswer(ws, msg.questionId, msg.answerId);
      return true;
    case 'SKIP':
      if (username !== room.adminUsername) return true;
      if (room.game) room.game.skipReveal();
      return true;
    case 'CONTINUE_GAME': {
      if (username !== room.adminUsername) return true;
      const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
      const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
      const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
      if (room.game) room.game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
      return true;
    }
    default:
      return false;
  }
}

module.exports = { Game, STATE, handleMessage };
