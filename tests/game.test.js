'use strict';

const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Stub out dependencies that game.js requires via require cache
const mockQuestions = [
  {
    questionId: 'q_1', category: 'General', difficulty: 'easy',
    question: 'What is 2+2?',
    answers: [
      { id: 'A', text: '3' }, { id: 'B', text: '4' },
      { id: 'C', text: '5' }, { id: 'D', text: '6' },
    ],
    correctId: 'B', timeLimit: 15, scoreMult: 1,
  },
  {
    questionId: 'q_2', category: 'General', difficulty: 'easy',
    question: 'What is 3+3?',
    answers: [
      { id: 'A', text: '5' }, { id: 'B', text: '6' },
      { id: 'C', text: '7' }, { id: 'D', text: '8' },
    ],
    correctId: 'B', timeLimit: 15, scoreMult: 1,
  },
];

// Pre-populate require cache with mocks
const rootDir = path.join(__dirname, '..');
require.cache[require.resolve(path.join(rootDir, 'questions'))] = {
  id: require.resolve(path.join(rootDir, 'questions')),
  filename: require.resolve(path.join(rootDir, 'questions')),
  loaded: true,
  exports: {
    fetchQuestions: async () => [...mockQuestions],
    fetchCategories: async () => [],
  },
};
require.cache[require.resolve(path.join(rootDir, 'translator'))] = {
  id: require.resolve(path.join(rootDir, 'translator')),
  filename: require.resolve(path.join(rootDir, 'translator')),
  loaded: true,
  exports: { translateQuestions: async (q) => q },
};
require.cache[require.resolve(path.join(rootDir, 'local-db'))] = {
  id: require.resolve(path.join(rootDir, 'local-db')),
  filename: require.resolve(path.join(rootDir, 'local-db')),
  loaded: true,
  exports: {
    markQuestionsUsed: () => {},
    getQuestionsFromLocalDB: () => null,
    DIFFICULTY_CONFIG: {
      easy: { filter: ['easy'], timeMult: 1.0, scoreMult: 1.0 },
      medium: { filter: ['medium'], timeMult: 1.0, scoreMult: 1.5 },
      hard: { filter: ['hard'], timeMult: 1.0, scoreMult: 2.0 },
    },
  },
};

const { Game, STATE, handleMessage } = require('../game');

// Mock WebSocket
function mockWs() {
  const sent = [];
  return {
    readyState: 1,
    send: (data) => sent.push(JSON.parse(data)),
    _sent: sent,
  };
}

describe('Game - Player Management', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
  });

  test('addPlayer with valid username succeeds', () => {
    const ws = mockWs();
    const result = game.addPlayer(ws, 'Alice');
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(game.playerCount, 1);
  });

  test('addPlayer rejects empty username', () => {
    const ws = mockWs();
    const result = game.addPlayer(ws, '');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_USERNAME');
  });

  test('addPlayer rejects username over 20 chars', () => {
    const ws = mockWs();
    const result = game.addPlayer(ws, 'A'.repeat(21));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_USERNAME');
  });

  test('addPlayer allows exactly 20 chars', () => {
    const ws = mockWs();
    const result = game.addPlayer(ws, 'A'.repeat(20));
    assert.deepStrictEqual(result, { ok: true });
  });

  test('duplicate username in lobby updates ws', () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    game.addPlayer(ws1, 'Alice');
    const result = game.addPlayer(ws2, 'Alice');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reconnected, true);
    assert.strictEqual(game.playerCount, 1);
  });

  test('addPlayer during game rejects new players', () => {
    const ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.state = STATE.QUESTION_ACTIVE;
    const ws2 = mockWs();
    const result = game.addPlayer(ws2, 'Bob');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'GAME_IN_PROGRESS');
  });

  test('addPlayer during game allows reconnect of existing player', () => {
    const ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    // Set up game state so _resyncPlayer doesn't crash
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.questionStartTime = Date.now();
    game.state = STATE.QUESTION_ACTIVE;
    const ws2 = mockWs();
    const result = game.addPlayer(ws2, 'Alice');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reconnected, true);
  });

  test('removePlayer in lobby deletes player', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    assert.strictEqual(game.playerCount, 1);
    game.removePlayer(ws);
    assert.strictEqual(game.playerCount, 0);
  });

  test('removePlayer during game nulls ws but keeps player', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.state = STATE.QUESTION_ACTIVE;
    game.removePlayer(ws);
    assert.strictEqual(game.playerCount, 1);
  });

  test('updatePlayerWs swaps old ws for new', () => {
    const ws1 = mockWs();
    const ws2 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.updatePlayerWs(ws1, ws2);
    const player = game.players.get('Alice');
    assert.strictEqual(player.ws, ws2);
  });

  test('broadcasts PLAYER_JOINED on add', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    const joinMsg = msgs.find(m => m.type === 'PLAYER_JOINED');
    assert.ok(joinMsg);
    assert.deepStrictEqual(joinMsg.players, ['Alice']);
    assert.strictEqual(joinMsg.playerCount, 1);
  });
});

describe('Game - Scoring', () => {
  let msgs, game, ws1, ws2;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
    ws1 = mockWs();
    ws2 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.addPlayer(ws2, 'Bob');
    game.state = STATE.QUESTION_ACTIVE;
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.questionStartTime = Date.now();
  });

  test('correct answer gives positive score', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    const player = game.players.get('Alice');
    assert.ok(player.score > 0);
    assert.strictEqual(player.answered, true);
    assert.strictEqual(player.lastAnswer, 'B');
  });

  test('incorrect answer gives zero score', () => {
    game.receiveAnswer(ws1, 'q_1', 'A');
    const player = game.players.get('Alice');
    assert.strictEqual(player.score, 0);
    assert.strictEqual(player.lastDelta, 0);
  });

  test('streak increments on correct answers', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    assert.strictEqual(game.players.get('Alice').streak, 1);
  });

  test('streak resets on incorrect answer', () => {
    game.players.get('Alice').streak = 5;
    game.receiveAnswer(ws1, 'q_1', 'A');
    assert.strictEqual(game.players.get('Alice').streak, 0);
  });

  test('ignores answer for wrong question ID', () => {
    game.receiveAnswer(ws1, 'wrong_id', 'B');
    const player = game.players.get('Alice');
    assert.strictEqual(player.answered, false);
    assert.strictEqual(player.score, 0);
  });

  test('ignores duplicate answer from same player', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    const score1 = game.players.get('Alice').score;
    game.receiveAnswer(ws1, 'q_1', 'A');
    assert.strictEqual(game.players.get('Alice').score, score1);
  });

  test('ignores answer when not in QUESTION_ACTIVE state', () => {
    game.state = STATE.REVEAL;
    game.receiveAnswer(ws1, 'q_1', 'B');
    assert.strictEqual(game.players.get('Alice').answered, false);
  });

  test('sends ANSWER_CONFIRMED to answering player', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    const confirmed = ws1._sent.find(m => m.type === 'ANSWER_CONFIRMED');
    assert.ok(confirmed);
    assert.strictEqual(confirmed.questionId, 'q_1');
    assert.strictEqual(confirmed.answerId, 'B');
  });

  test('broadcasts ANSWER_COUNT after each answer', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    const countMsg = msgs.find(m => m.type === 'ANSWER_COUNT');
    assert.ok(countMsg);
    assert.strictEqual(countMsg.answered, 1);
    assert.strictEqual(countMsg.total, 2);
  });

  test('doublePoints powerup doubles the score', () => {
    game.players.get('Alice').activePowerup = 'doublePoints';
    game.receiveAnswer(ws1, 'q_1', 'B');
    const player = game.players.get('Alice');

    game.receiveAnswer(ws2, 'q_1', 'B');
    const bob = game.players.get('Bob');

    assert.ok(player.lastDelta > bob.lastDelta);
    assert.ok(player.lastDelta >= bob.lastDelta * 1.9);
  });

  test('time-based scoring: faster answer scores higher', () => {
    game.questionStartTime = Date.now();
    game.receiveAnswer(ws1, 'q_1', 'B');
    const aliceScore = game.players.get('Alice').lastDelta;

    game.currentIdx = 1;
    game.state = STATE.QUESTION_ACTIVE;
    game.questions[1].timeLimit = 15;
    game.questionStartTime = Date.now() - 14000;
    for (const p of game.players.values()) {
      p.answered = false;
      p.lastDelta = 0;
    }
    game.receiveAnswer(ws2, 'q_2', 'B');
    const bobScore = game.players.get('Bob').lastDelta;

    assert.ok(aliceScore > bobScore, `Fast answer (${aliceScore}) should score higher than slow (${bobScore})`);
  });
});

describe('Game - Powerups', () => {
  let msgs, game, ws1;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
    ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.state = STATE.QUESTION_ACTIVE;
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.questionStartTime = Date.now();
  });

  test('usePowerup fails when not QUESTION_ACTIVE', () => {
    game.state = STATE.LOBBY;
    const result = game.usePowerup(ws1, 'doublePoints');
    assert.strictEqual(result.ok, false);
  });

  test('usePowerup rejects invalid type', () => {
    const result = game.usePowerup(ws1, 'invalidPowerup');
    assert.strictEqual(result.ok, false);
  });

  test('usePowerup rejects unknown ws', () => {
    const unknownWs = mockWs();
    const result = game.usePowerup(unknownWs, 'doublePoints');
    assert.strictEqual(result.ok, false);
  });

  test('doublePoints activates successfully', () => {
    const result = game.usePowerup(ws1, 'doublePoints');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(game.players.get('Alice').activePowerup, 'doublePoints');
    assert.strictEqual(game.players.get('Alice').powerups.doublePoints, 0);
  });

  test('fiftyFifty activates and removes 2 wrong answers', () => {
    const result = game.usePowerup(ws1, 'fiftyFifty');
    assert.strictEqual(result.ok, true);
    const activated = ws1._sent.find(m => m.type === 'POWERUP_ACTIVATED');
    assert.ok(activated);
    assert.strictEqual(activated.powerupType, 'fiftyFifty');
    assert.strictEqual(activated.removedAnswers.length, 2);
    assert.ok(!activated.removedAnswers.includes('B'));
  });

  test('timeFreeze activates and grants extra time', () => {
    const result = game.usePowerup(ws1, 'timeFreeze');
    assert.strictEqual(result.ok, true);
    const activated = ws1._sent.find(m => m.type === 'POWERUP_ACTIVATED');
    assert.strictEqual(activated.extraTime, 10);
  });

  test('cannot use same powerup twice', () => {
    game.usePowerup(ws1, 'doublePoints');
    const result = game.usePowerup(ws1, 'timeFreeze');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_ACTIVE');
  });

  test('cannot use powerup with no uses remaining', () => {
    game.players.get('Alice').powerups.doublePoints = 0;
    const result = game.usePowerup(ws1, 'doublePoints');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NO_POWERUP');
  });

  test('cannot use powerup after answering', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    const result = game.usePowerup(ws1, 'doublePoints');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_ANSWERED');
  });

  test('broadcasts POWERUP_USED to all players', () => {
    game.usePowerup(ws1, 'doublePoints');
    const used = msgs.find(m => m.type === 'POWERUP_USED');
    assert.ok(used);
    assert.strictEqual(used.username, 'Alice');
    assert.strictEqual(used.powerupType, 'doublePoints');
  });
});

describe('Game - State Machine', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
  });

  test('initial state is LOBBY', () => {
    assert.strictEqual(game.currentState, STATE.LOBBY);
  });

  test('startGame requires at least 1 player', async () => {
    await game.startGame([9], 2);
    assert.strictEqual(game.state, STATE.LOBBY);
  });

  test('startGame transitions through states', async () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    await game.startGame([9], 2);
    assert.strictEqual(game.state, STATE.COUNTDOWN);
    game._clearTimer();
  });

  test('startGame only works from LOBBY', async () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.state = STATE.QUESTION_ACTIVE;
    await game.startGame([9], 2);
    assert.strictEqual(game.state, STATE.QUESTION_ACTIVE);
  });

  test('skipReveal advances from REVEAL', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.state = STATE.REVEAL;
    game.skipReveal();
    assert.ok(game.state === STATE.QUESTION_ACTIVE || game.state === STATE.GAME_OVER);
    game._clearTimer();
  });

  test('skipReveal advances from BETWEEN_QUESTIONS', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.state = STATE.BETWEEN_QUESTIONS;
    game.skipReveal();
    assert.ok(game.state === STATE.QUESTION_ACTIVE || game.state === STATE.GAME_OVER);
    game._clearTimer();
  });

  test('skipReveal does nothing from other states', () => {
    game.state = STATE.LOBBY;
    game.skipReveal();
    assert.strictEqual(game.state, STATE.LOBBY);
  });

  test('restart resets to LOBBY', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.state = STATE.QUESTION_ACTIVE;
    game.restart();
    assert.strictEqual(game.state, STATE.LOBBY);
    assert.strictEqual(game.playerCount, 0);
    const restarted = msgs.find(m => m.type === 'RESTARTED');
    assert.ok(restarted);
  });

  test('_endGame transitions to GAME_OVER with scores', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.players.get('Alice').score = 500;
    game._endGame();
    assert.strictEqual(game.state, STATE.GAME_OVER);
    const goMsg = msgs.find(m => m.type === 'GAME_OVER');
    assert.ok(goMsg);
    assert.strictEqual(goMsg.finalScores[0].username, 'Alice');
    assert.strictEqual(goMsg.finalScores[0].score, 500);
  });

  test('_nextQuestion ends game when questions exhausted', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.questions = [...mockQuestions];
    game.currentIdx = mockQuestions.length - 1;
    game._nextQuestion();
    assert.strictEqual(game.state, STATE.GAME_OVER);
  });
});

describe('Game - Reveal and Scores', () => {
  let msgs, game, ws1, ws2;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
    ws1 = mockWs();
    ws2 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.addPlayer(ws2, 'Bob');
    game.state = STATE.QUESTION_ACTIVE;
    game.questions = [...mockQuestions];
    game.currentIdx = 0;
    game.questionStartTime = Date.now();
  });

  test('_buildRevealPayload includes answer breakdown', () => {
    game.receiveAnswer(ws1, 'q_1', 'B');
    game.receiveAnswer(ws2, 'q_1', 'A');
    const payload = game._buildRevealPayload();
    assert.strictEqual(payload.type, 'REVEAL');
    assert.strictEqual(payload.correctAnswer, 'B');
    assert.strictEqual(payload.answerBreakdown.A, 50);
    assert.strictEqual(payload.answerBreakdown.B, 50);
    assert.strictEqual(payload.answerBreakdown.C, 0);
    assert.strictEqual(payload.answerBreakdown.D, 0);
  });

  test('_buildScores returns sorted array with ranks', () => {
    game.players.get('Alice').score = 1000;
    game.players.get('Bob').score = 500;
    const scores = game._buildScores();
    assert.strictEqual(scores[0].username, 'Alice');
    assert.strictEqual(scores[0].rank, 1);
    assert.strictEqual(scores[1].username, 'Bob');
    assert.strictEqual(scores[1].rank, 2);
  });

  test('_updateRanks assigns sequential ranks', () => {
    game.players.get('Alice').score = 300;
    game.players.get('Bob').score = 700;
    game._updateRanks();
    assert.strictEqual(game.players.get('Bob').rank, 1);
    assert.strictEqual(game.players.get('Alice').rank, 2);
  });
});

describe('Game - Continue Game', () => {
  let msgs, game, ws1;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
    ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.players.get('Alice').score = 500;
    game.players.get('Alice').streak = 3;
    game.state = STATE.GAME_OVER;
  });

  test('continueGame only works from GAME_OVER', async () => {
    game.state = STATE.LOBBY;
    await game.continueGame([9], 2);
    assert.strictEqual(game.state, STATE.LOBBY);
  });

  test('continueGame preserves player scores', async () => {
    await game.continueGame([9], 2);
    assert.strictEqual(game.players.get('Alice').score, 500);
    game._clearTimer();
  });

  test('continueGame tracks seenQuestions', async () => {
    game.seenQuestions.add('existing');
    await game.continueGame([9], 2);
    assert.ok(game.seenQuestions.has('existing'));
    assert.ok(game.seenQuestions.size > 1);
    game._clearTimer();
  });
});

describe('Game - handleMessage', () => {
  test('ANSWER routes to receiveAnswer', () => {
    const called = [];
    const room = {
      wsToUsername: new Map(),
      game: { receiveAnswer: (...args) => called.push(args) },
      adminUsername: 'Alice',
    };
    const ws = mockWs();
    room.wsToUsername.set(ws, 'Alice');
    const result = handleMessage(ws, { type: 'ANSWER', questionId: 'q1', answerId: 'A' }, room);
    assert.strictEqual(result, true);
    assert.strictEqual(called.length, 1);
  });

  test('SKIP only works for admin', () => {
    const called = [];
    const room = {
      wsToUsername: new Map(),
      game: { skipReveal: () => called.push(true) },
      adminUsername: 'Alice',
    };
    const ws = mockWs();
    room.wsToUsername.set(ws, 'Bob');
    handleMessage(ws, { type: 'SKIP' }, room);
    assert.strictEqual(called.length, 0);
  });

  test('SKIP works for admin', () => {
    const called = [];
    const room = {
      wsToUsername: new Map(),
      game: { skipReveal: () => called.push(true) },
      adminUsername: 'Alice',
    };
    const ws = mockWs();
    room.wsToUsername.set(ws, 'Alice');
    handleMessage(ws, { type: 'SKIP' }, room);
    assert.strictEqual(called.length, 1);
  });

  test('unrecognized type returns false', () => {
    const room = {
      wsToUsername: new Map(),
      game: null,
      adminUsername: null,
    };
    const result = handleMessage(mockWs(), { type: 'UNKNOWN' }, room);
    assert.strictEqual(result, false);
  });
});

describe('Game - Resync', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new Game(msg => msgs.push(msg));
  });

  test('_resyncPlayer sends PLAYER_JOINED in LOBBY state', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    const ws2 = mockWs();
    game._resyncPlayer(ws2);
    const joinMsg = ws2._sent.find(m => m.type === 'PLAYER_JOINED');
    assert.ok(joinMsg);
    assert.deepStrictEqual(joinMsg.players, ['Alice']);
  });

  test('_resyncPlayer sends GAME_FETCHING in FETCHING state', () => {
    game.state = STATE.FETCHING;
    const ws = mockWs();
    game._resyncPlayer(ws);
    const fetchMsg = ws._sent.find(m => m.type === 'GAME_FETCHING');
    assert.ok(fetchMsg);
  });

  test('_resyncPlayer sends GAME_OVER in GAME_OVER state', () => {
    const ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.state = STATE.GAME_OVER;
    const ws = mockWs();
    game._resyncPlayer(ws);
    const goMsg = ws._sent.find(m => m.type === 'GAME_OVER');
    assert.ok(goMsg);
  });
});
