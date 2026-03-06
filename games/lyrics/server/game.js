'use strict';

const fs = require('fs');
const path = require('path');

const QUESTIONS_PATH = path.join(__dirname, '..', 'data', 'questions.json');

const STATE = {
  LOBBY: 'LOBBY',
  COUNTDOWN: 'COUNTDOWN',
  QUESTION_ACTIVE: 'QUESTION_ACTIVE',
  REVEAL: 'REVEAL',
  BETWEEN_QUESTIONS: 'BETWEEN_QUESTIONS',
  GAME_OVER: 'GAME_OVER',
};

const COUNTDOWN_SECONDS = 3;
const QUESTION_TIME = 15; // seconds per question
const REVEAL_DELAY = 4000;
const BETWEEN_QUESTIONS_DELAY = 3000;

function loadQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class LyricsGame {
  constructor(broadcast) {
    this._broadcast = broadcast;
    this._reset();
  }

  _reset() {
    this.state = STATE.LOBBY;
    this.players = new Map(); // username → { ws, score, answered, lastAnswer, lastDelta, rank, prevRank, streak }
    this.questions = [];
    this.currentIdx = -1;
    this.questionStartTime = null;
    this._timer = null;
  }

  addPlayer(ws, username) {
    if (this.state !== STATE.LOBBY) {
      if (this.players.has(username)) {
        this.players.get(username).ws = ws;
        this._resyncPlayer(ws);
        return { ok: true, reconnected: true };
      }
      return { ok: false, code: 'GAME_IN_PROGRESS', message: 'Lyrics quiz is running.' };
    }

    if (this.players.has(username)) {
      this.players.get(username).ws = ws;
      return { ok: true, reconnected: true };
    }

    this.players.set(username, {
      ws, score: 0, rank: null, prevRank: null, answered: false,
      lastAnswer: null, lastDelta: 0, streak: 0,
    });
    return { ok: true };
  }

  removePlayer(ws) {
    for (const [username, player] of this.players.entries()) {
      if (player.ws === ws) {
        if (this.state === STATE.LOBBY) {
          this.players.delete(username);
        } else {
          player.ws = null;
        }
        return;
      }
    }
  }

  startGame(questionCount = 15) {
    if (this.state !== STATE.LOBBY) return;
    if (this.players.size < 1) return;

    const allQ = shuffle(loadQuestions());
    this.questions = allQ.slice(0, Math.min(questionCount, allQ.length));

    if (this.questions.length === 0) {
      this._broadcast({ type: 'ERROR', code: 'NO_QUESTIONS', message: 'No lyrics questions available.' });
      return;
    }

    this.currentIdx = -1;
    this._startCountdown();
  }

  _startCountdown() {
    this.state = STATE.COUNTDOWN;
    let count = COUNTDOWN_SECONDS;

    this._broadcast({
      type: 'LYRICS_GAME_STARTING',
      countdown: count,
      totalQuestions: this.questions.length,
    });

    const tick = () => {
      count--;
      if (count > 0) {
        this._broadcast({ type: 'LYRICS_COUNTDOWN_TICK', countdown: count });
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

    for (const player of this.players.values()) {
      player.prevRank = player.rank;
      player.answered = false;
      player.lastAnswer = null;
      player.lastDelta = 0;
    }

    this.state = STATE.QUESTION_ACTIVE;
    this.questionStartTime = Date.now();
    const q = this.questions[this.currentIdx];

    this._broadcast({
      type: 'LYRICS_QUESTION',
      questionNumber: this.currentIdx + 1,
      totalQuestions: this.questions.length,
      songTitle: q.songTitle,
      prompt: q.prompt,
      answers: q.answers,
      timeLimit: QUESTION_TIME,
      serverTimestamp: this.questionStartTime,
    });

    this._timer = setTimeout(() => this._revealAnswer(), QUESTION_TIME * 1000);
  }

  receiveAnswer(ws, answerId) {
    if (this.state !== STATE.QUESTION_ACTIVE) return;

    let player = null;
    for (const p of this.players.values()) {
      if (p.ws === ws) { player = p; break; }
    }
    if (!player || player.answered) return;

    player.answered = true;
    player.lastAnswer = answerId;

    const q = this.questions[this.currentIdx];
    const elapsed = Date.now() - this.questionStartTime;
    const timeFraction = Math.max(0, 1 - elapsed / (QUESTION_TIME * 1000));
    const isCorrect = answerId === q.correctId;
    const delta = isCorrect ? Math.round(1000 * (0.5 + 0.5 * timeFraction)) : 0;
    player.score += delta;
    player.lastDelta = delta;
    player.streak = isCorrect ? (player.streak + 1) : 0;

    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'LYRICS_ANSWER_CONFIRMED', answerId }));
    }

    const answered = [...this.players.values()].filter(p => p.answered).length;
    this._broadcast({ type: 'LYRICS_ANSWER_COUNT', answered, total: this.players.size });

    if (answered === this.players.size) {
      this._clearTimer();
      this._timer = setTimeout(() => this._revealAnswer(), 500);
    }
  }

  _revealAnswer() {
    this._clearTimer();
    if (this.state !== STATE.QUESTION_ACTIVE) return;

    this.state = STATE.REVEAL;
    this._updateRanks();

    const q = this.questions[this.currentIdx];
    const correctObj = q.answers.find(a => a.id === q.correctId);

    this._broadcast({
      type: 'LYRICS_REVEAL',
      correctAnswer: q.correctId,
      correctText: correctObj ? correctObj.text : '',
      songTitle: q.songTitle,
      scores: this._buildScores(),
    });

    this._timer = setTimeout(() => {
      this.state = STATE.BETWEEN_QUESTIONS;
      this._broadcast({ type: 'LYRICS_NEXT_QUESTION', delay: BETWEEN_QUESTIONS_DELAY / 1000 });
      this._timer = setTimeout(() => this._nextQuestion(), BETWEEN_QUESTIONS_DELAY);
    }, REVEAL_DELAY);
  }

  _endGame() {
    this._clearTimer();
    this.state = STATE.GAME_OVER;
    this._updateRanks();
    this._broadcast({
      type: 'LYRICS_GAME_OVER',
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

  _updateRanks() {
    const sorted = [...this.players.entries()].sort(([, a], [, b]) => b.score - a.score);
    sorted.forEach(([, player], i) => { player.rank = i + 1; });
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
        answer: p.lastAnswer || null,
      }));
  }

  _resyncPlayer(ws) {
    const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

    if (this.state === STATE.QUESTION_ACTIVE) {
      const q = this.questions[this.currentIdx];
      const elapsed = Date.now() - this.questionStartTime;
      const remaining = Math.max(0, QUESTION_TIME * 1000 - elapsed);
      send({
        type: 'LYRICS_QUESTION',
        questionNumber: this.currentIdx + 1,
        totalQuestions: this.questions.length,
        songTitle: q.songTitle,
        prompt: q.prompt,
        answers: q.answers,
        timeLimit: QUESTION_TIME,
        serverTimestamp: this.questionStartTime,
        elapsed,
        remaining,
      });
    } else if (this.state === STATE.REVEAL || this.state === STATE.BETWEEN_QUESTIONS) {
      const q = this.questions[this.currentIdx];
      const correctObj = q.answers.find(a => a.id === q.correctId);
      send({
        type: 'LYRICS_REVEAL',
        correctAnswer: q.correctId,
        correctText: correctObj ? correctObj.text : '',
        songTitle: q.songTitle,
        scores: this._buildScores(),
      });
    } else if (this.state === STATE.GAME_OVER) {
      send({ type: 'LYRICS_GAME_OVER', finalScores: this._buildScores() });
    }
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  get playerCount() { return this.players.size; }
  get currentState() { return this.state; }
}

module.exports = { LyricsGame, STATE };
