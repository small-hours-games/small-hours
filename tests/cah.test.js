'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { CAHGame } = require('../cah');

function mockWs() {
  const sent = [];
  return {
    readyState: 1,
    send: (data) => sent.push(JSON.parse(data)),
    _sent: sent,
  };
}

describe('CAHGame - Player Management', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new CAHGame(msg => msgs.push(msg));
  });

  test('addPlayer in LOBBY succeeds', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    assert.strictEqual(game.players.size, 1);
    const joinOk = ws._sent.find(m => m.type === 'CAH_JOIN_OK');
    assert.ok(joinOk);
    assert.strictEqual(joinOk.username, 'Alice');
  });

  test('addPlayer rejects empty username', () => {
    const ws = mockWs();
    game.addPlayer(ws, '');
    assert.strictEqual(game.players.size, 0);
    const err = ws._sent.find(m => m.type === 'CAH_ERROR');
    assert.ok(err);
    assert.strictEqual(err.code, 'INVALID_USERNAME');
  });

  test('addPlayer rejects when game in progress', () => {
    const ws = mockWs();
    game.state = 'PICKING';
    game.addPlayer(ws, 'Alice');
    const err = ws._sent.find(m => m.type === 'CAH_ERROR');
    assert.ok(err);
    assert.strictEqual(err.code, 'GAME_IN_PROGRESS');
  });

  test('addPlayer allows reconnect during game', () => {
    const ws1 = mockWs();
    game.addPlayer(ws1, 'Alice');
    game.state = 'PICKING';
    const ws2 = mockWs();
    game.addPlayer(ws2, 'Alice');
    // Should update ws, not reject
    assert.strictEqual(game.players.get('Alice').ws, ws2);
    const joinOk = ws2._sent.find(m => m.type === 'CAH_JOIN_OK');
    assert.ok(joinOk);
  });

  test('removePlayer in LOBBY deletes player', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.removePlayer(ws);
    assert.strictEqual(game.players.size, 0);
  });

  test('removePlayer during game nulls ws', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.state = 'PICKING';
    game.removePlayer(ws);
    assert.strictEqual(game.players.size, 1);
    assert.strictEqual(game.players.get('Alice').ws, null);
  });

  test('broadcasts CAH_PLAYERS on add', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    const playersMsg = msgs.find(m => m.type === 'CAH_PLAYERS');
    assert.ok(playersMsg);
    assert.strictEqual(playersMsg.playerCount, 1);
  });
});

describe('CAHGame - Game Start', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new CAHGame(msg => msgs.push(msg));
  });

  test('startGame requires at least 2 players', () => {
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    game.startGame(5);
    assert.strictEqual(game.state, 'LOBBY');
  });

  test('startGame only works from LOBBY', () => {
    game.state = 'PICKING';
    game.startGame(5);
    assert.strictEqual(game.state, 'PICKING');
  });

  test('startGame transitions to PICKING and deals hands', () => {
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      game.addPlayer(mockWs(), name);
    }
    game.startGame(5);
    assert.strictEqual(game.state, 'PICKING');
    assert.strictEqual(game.round, 1);
    // Each player should have 7 cards
    for (const [, p] of game.players) {
      assert.strictEqual(p.hand.length, 7);
    }
    // Should have a black card
    assert.ok(game.currentBlackCard);
  });

  test('startGame clamps maxRounds to [1, 20]', () => {
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      game.addPlayer(mockWs(), name);
    }
    game.startGame(50);
    assert.strictEqual(game.maxRounds, 20);
  });

  test('startGame resets points', () => {
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      game.addPlayer(mockWs(), name);
    }
    game.players.get('Alice').points = 10;
    game.startGame(5);
    assert.strictEqual(game.players.get('Alice').points, 0);
  });

  test('broadcasts CAH_NEW_ROUND on start', () => {
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      game.addPlayer(mockWs(), name);
    }
    game.startGame(5);
    const round = msgs.find(m => m.type === 'CAH_NEW_ROUND');
    assert.ok(round);
    assert.strictEqual(round.round, 1);
    assert.ok(round.czar);
  });
});

describe('CAHGame - Card Submission', () => {
  let msgs, game, czar, players;

  beforeEach(() => {
    msgs = [];
    game = new CAHGame(msg => msgs.push(msg));
    players = {};
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      players[name] = mockWs();
      game.addPlayer(players[name], name);
    }
    game.startGame(5);
  });

  test('czar cannot submit cards', () => {
    const czarName = game._currentCzar();
    const p = game.players.get(czarName);
    const cardId = p.hand[0].id;
    game.submitCards(czarName, [cardId]);
    const err = players[czarName]._sent.find(m => m.type === 'CAH_ERROR' && m.code === 'CZAR_CANNOT_SUBMIT');
    assert.ok(err);
  });

  test('non-czar can submit correct number of cards', () => {
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    const p = game.players.get(nonCzar);
    const pick = game.currentBlackCard.pick || 1;
    const cardIds = p.hand.slice(0, pick).map(c => c.id);
    game.submitCards(nonCzar, cardIds);
    const ok = players[nonCzar]._sent.find(m => m.type === 'CAH_SUBMISSION_OK');
    assert.ok(ok);
    assert.ok(game.submissions.has(nonCzar));
  });

  test('rejects wrong number of cards', () => {
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    const p = game.players.get(nonCzar);
    // Submit wrong count (0 cards for pick-1)
    game.submitCards(nonCzar, []);
    const err = players[nonCzar]._sent.find(m => m.type === 'CAH_ERROR' && m.code === 'WRONG_CARD_COUNT');
    assert.ok(err);
  });

  test('duplicate submission is ignored', () => {
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    const p = game.players.get(nonCzar);
    const pick = game.currentBlackCard.pick || 1;
    const cardIds1 = p.hand.slice(0, pick).map(c => c.id);
    game.submitCards(nonCzar, cardIds1);
    const sizeAfter = game.submissions.size;
    game.submitCards(nonCzar, cardIds1);
    assert.strictEqual(game.submissions.size, sizeAfter);
  });

  test('removes submitted cards from hand', () => {
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    const p = game.players.get(nonCzar);
    const pick = game.currentBlackCard.pick || 1;
    const cardIds = p.hand.slice(0, pick).map(c => c.id);
    const handBefore = p.hand.length;
    game.submitCards(nonCzar, cardIds);
    assert.strictEqual(p.hand.length, handBefore - pick);
  });

  test('transitions to JUDGING when all non-czar players submit', () => {
    const czarName = game._currentCzar();
    const nonCzars = [...game.players.keys()].filter(n => n !== czarName);
    for (const name of nonCzars) {
      const p = game.players.get(name);
      const pick = game.currentBlackCard.pick || 1;
      const cardIds = p.hand.slice(0, pick).map(c => c.id);
      game.submitCards(name, cardIds);
    }
    assert.strictEqual(game.state, 'JUDGING');
    const judging = msgs.find(m => m.type === 'CAH_JUDGING');
    assert.ok(judging);
    assert.strictEqual(judging.submissions.length, nonCzars.length);
  });

  test('does not accept submissions outside PICKING state', () => {
    game.state = 'JUDGING';
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    const p = game.players.get(nonCzar);
    game.submitCards(nonCzar, [p.hand[0].id]);
    assert.strictEqual(game.submissions.size, 0);
  });
});

describe('CAHGame - Czar Judging', () => {
  let msgs, game, players;

  beforeEach(() => {
    msgs = [];
    game = new CAHGame(msg => msgs.push(msg));
    players = {};
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      players[name] = mockWs();
      game.addPlayer(players[name], name);
    }
    game.startGame(5);
    // Have all non-czar players submit
    const czarName = game._currentCzar();
    const nonCzars = [...game.players.keys()].filter(n => n !== czarName);
    for (const name of nonCzars) {
      const p = game.players.get(name);
      const pick = game.currentBlackCard.pick || 1;
      game.submitCards(name, p.hand.slice(0, pick).map(c => c.id));
    }
    assert.strictEqual(game.state, 'JUDGING');
  });

  test('czar can pick a valid submission', () => {
    const czarName = game._currentCzar();
    const submissionId = game.shuffledSubmissions[0].id;
    const winnerName = game.shuffledSubmissions[0].username;
    game.czarPick(czarName, submissionId);
    assert.strictEqual(game.state, 'ROUND_OVER');
    const winner = msgs.find(m => m.type === 'CAH_ROUND_WINNER');
    assert.ok(winner);
    assert.strictEqual(winner.winner, winnerName);
    assert.strictEqual(game.players.get(winnerName).points, 1);
  });

  test('non-czar cannot pick', () => {
    const czarName = game._currentCzar();
    const nonCzar = [...game.players.keys()].find(n => n !== czarName);
    game.czarPick(nonCzar, 0);
    assert.strictEqual(game.state, 'JUDGING'); // unchanged
    const err = players[nonCzar]._sent.find(m => m.type === 'CAH_ERROR' && m.code === 'NOT_CZAR');
    assert.ok(err);
  });

  test('czar rejects invalid submission ID', () => {
    const czarName = game._currentCzar();
    game.czarPick(czarName, 999);
    assert.strictEqual(game.state, 'JUDGING');
    const err = players[czarName]._sent.find(m => m.type === 'CAH_ERROR' && m.code === 'INVALID_SUBMISSION');
    assert.ok(err);
  });

  test('czar rotates after round', () => {
    const czar1 = game._currentCzar();
    const czarIdx1 = game.czarIndex;
    game.czarPick(czar1, game.shuffledSubmissions[0].id);
    assert.notStrictEqual(game.czarIndex, czarIdx1);
  });

  test('picking only works in JUDGING state', () => {
    game.state = 'PICKING';
    const czarName = game._currentCzar();
    game.czarPick(czarName, 0);
    // Should be a no-op
    assert.strictEqual(game.state, 'PICKING');
  });
});

describe('CAHGame - Game Flow', () => {
  let msgs, game;

  beforeEach(() => {
    msgs = [];
    game = new CAHGame(msg => msgs.push(msg));
    for (const name of ['Alice', 'Bob', 'Charlie']) {
      game.addPlayer(mockWs(), name);
    }
  });

  test('game ends after maxRounds', () => {
    game.startGame(1); // only 1 round
    const czarName = game._currentCzar();
    const nonCzars = [...game.players.keys()].filter(n => n !== czarName);
    for (const name of nonCzars) {
      const p = game.players.get(name);
      const pick = game.currentBlackCard.pick || 1;
      game.submitCards(name, p.hand.slice(0, pick).map(c => c.id));
    }
    game.czarPick(czarName, game.shuffledSubmissions[0].id);
    // Manually trigger next round (skip setTimeout)
    game._nextRound();
    assert.strictEqual(game.state, 'GAME_OVER');
    const goMsg = msgs.find(m => m.type === 'CAH_GAME_OVER');
    assert.ok(goMsg);
    assert.strictEqual(goMsg.scores.length, 3);
    // Scores should have ranks
    assert.strictEqual(goMsg.scores[0].rank, 1);
  });

  test('restart resets everything', () => {
    game.startGame(5);
    game.restart();
    assert.strictEqual(game.state, 'LOBBY');
    assert.strictEqual(game.round, 0);
    for (const [, p] of game.players) {
      assert.strictEqual(p.hand.length, 0);
      assert.strictEqual(p.points, 0);
    }
    const restarted = msgs.find(m => m.type === 'CAH_RESTARTED');
    assert.ok(restarted);
  });

  test('_buildGameState includes correct fields', () => {
    game.startGame(5);
    const state = game._buildGameState();
    assert.strictEqual(state.type, 'CAH_GAME_STATE');
    assert.strictEqual(state.state, 'PICKING');
    assert.strictEqual(state.round, 1);
    assert.ok(state.czar);
    assert.ok(state.blackCard);
    assert.strictEqual(state.players.length, 3);
  });

  test('hands are replenished after czar picks', () => {
    game.startGame(5);
    const czarName = game._currentCzar();
    const nonCzars = [...game.players.keys()].filter(n => n !== czarName);
    for (const name of nonCzars) {
      const p = game.players.get(name);
      const pick = game.currentBlackCard.pick || 1;
      game.submitCards(name, p.hand.slice(0, pick).map(c => c.id));
    }
    game.czarPick(czarName, game.shuffledSubmissions[0].id);
    // After pick, all players should be replenished back to 7
    for (const [, p] of game.players) {
      assert.strictEqual(p.hand.length, 7);
    }
  });
});
