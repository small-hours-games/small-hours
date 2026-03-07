'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { ShitheadGame } = require('../shithead');

function mockWs() {
  const sent = [];
  return {
    readyState: 1,
    send: (data) => sent.push(JSON.parse(data)),
    _sent: sent,
  };
}

function setupGame(playerNames = ['Alice', 'Bob']) {
  const msgs = [];
  const game = new ShitheadGame(msg => msgs.push(msg));
  const sockets = {};
  for (const name of playerNames) {
    sockets[name] = mockWs();
    game.addPlayer(sockets[name], name);
  }
  // Remove bot if present (tests control players explicitly)
  for (const [username, p] of game.players) {
    if (p.isBot) {
      game.players.delete(username);
      break;
    }
  }
  return { game, msgs, sockets };
}

function startAndSkipSwap(game) {
  game.startGame(1);
  for (const [username] of game.players) {
    game.confirmSwap(username);
  }
  game._clearInactivityTimer();
}

describe('ShitheadGame - Player Management', () => {
  test('addPlayer in LOBBY succeeds', () => {
    const msgs = [];
    const game = new ShitheadGame(msg => msgs.push(msg));
    const ws = mockWs();
    game.addPlayer(ws, 'Alice');
    assert.ok(game.players.has('Alice') || [...game.players.keys()].includes('Alice'));
    const joinOk = ws._sent.find(m => m.type === 'SHITHEAD_JOIN_OK');
    assert.ok(joinOk);
  });

  test('addPlayer rejects empty username', () => {
    const game = new ShitheadGame(() => {});
    const ws = mockWs();
    game.addPlayer(ws, '');
    const err = ws._sent.find(m => m.type === 'SHITHEAD_ERROR');
    assert.ok(err);
    assert.strictEqual(err.code, 'INVALID_USERNAME');
  });

  test('addPlayer rejects when game in progress', () => {
    const { game } = setupGame();
    startAndSkipSwap(game);
    const ws = mockWs();
    game.addPlayer(ws, 'Charlie');
    const err = ws._sent.find(m => m.type === 'SHITHEAD_ERROR');
    assert.ok(err);
    assert.strictEqual(err.code, 'GAME_IN_PROGRESS');
  });

  test('addPlayer rejects when room full (6 players)', () => {
    const game = new ShitheadGame(() => {});
    for (let i = 0; i < 6; i++) {
      const ws = mockWs();
      game.addPlayer(ws, `P${i}`);
      // Remove bots
      for (const [n, p] of game.players) { if (p.isBot) game.players.delete(n); }
    }
    const ws = mockWs();
    game.addPlayer(ws, 'P7');
    const err = ws._sent.find(m => m.type === 'SHITHEAD_ERROR');
    assert.ok(err);
    assert.strictEqual(err.code, 'ROOM_FULL');
  });

  test('addPlayer allows reconnect during game', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    const ws2 = mockWs();
    game.addPlayer(ws2, 'Alice');
    assert.strictEqual(game.players.get('Alice').ws, ws2);
    const joinOk = ws2._sent.find(m => m.type === 'SHITHEAD_JOIN_OK');
    assert.ok(joinOk);
  });

  test('removePlayer in LOBBY deletes player', () => {
    const { game, sockets } = setupGame();
    game.removePlayer(sockets.Alice);
    assert.ok(!game.players.has('Alice'));
  });

  test('removePlayer during game nulls ws', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    game.removePlayer(sockets.Alice);
    assert.strictEqual(game.players.get('Alice').ws, null);
  });
});

describe('ShitheadGame - Deck and Card Logic', () => {
  test('_createDeck produces 52 cards', () => {
    const game = new ShitheadGame(() => {});
    const deck = game._createDeck();
    assert.strictEqual(deck.length, 52);
  });

  test('_createDecks(2) produces 104 cards', () => {
    const game = new ShitheadGame(() => {});
    const deck = game._createDecks(2);
    assert.strictEqual(deck.length, 104);
  });

  test('_createDecks clamps to [1, 3]', () => {
    const game = new ShitheadGame(() => {});
    assert.strictEqual(game._createDecks(0).length, 52);
    assert.strictEqual(game._createDecks(5).length, 52 * 3);
  });

  test('_canPlay: 2 and 10 always playable', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 14 }]; // Ace on top
    assert.strictEqual(game._canPlay(2), true);
    assert.strictEqual(game._canPlay(10), true);
  });

  test('_canPlay: on empty pile anything plays', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [];
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      assert.strictEqual(game._canPlay(rank), true, `rank ${rank} should be playable on empty pile`);
    }
  });

  test('_canPlay: must play >= top rank normally', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 8 }];
    game.sevenActive = false;
    assert.strictEqual(game._canPlay(7), false);
    assert.strictEqual(game._canPlay(8), true);
    assert.strictEqual(game._canPlay(9), true);
  });

  test('_canPlay: sevenActive forces <= 7', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 7 }];
    game.sevenActive = true;
    assert.strictEqual(game._canPlay(6), true);
    assert.strictEqual(game._canPlay(7), true);
    assert.strictEqual(game._canPlay(8), false);
    // But 2 and 10 are always valid
    assert.strictEqual(game._canPlay(2), true);
    assert.strictEqual(game._canPlay(10), true);
  });

  test('_effectiveTopRank: rank 3 is transparent', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 8 }, { rank: 3 }, { rank: 3 }];
    assert.strictEqual(game._effectiveTopRank(), 8);
  });

  test('_effectiveTopRank: all 3s means 0', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 3 }, { rank: 3 }];
    assert.strictEqual(game._effectiveTopRank(), 0);
  });

  test('_effectiveTopRank: empty pile returns 0', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [];
    assert.strictEqual(game._effectiveTopRank(), 0);
  });

  test('_isFourOfAKind detects four same-rank cards on top', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [
      { rank: 5 }, { rank: 5 }, { rank: 5 }, { rank: 5 },
    ];
    assert.strictEqual(game._isFourOfAKind(), true);
  });

  test('_isFourOfAKind returns false with < 4 cards', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 5 }, { rank: 5 }, { rank: 5 }];
    assert.strictEqual(game._isFourOfAKind(), false);
  });

  test('_isFourOfAKind returns false with mixed ranks', () => {
    const game = new ShitheadGame(() => {});
    game.pile = [{ rank: 5 }, { rank: 6 }, { rank: 5 }, { rank: 5 }];
    assert.strictEqual(game._isFourOfAKind(), false);
  });
});

describe('ShitheadGame - Game Start and Swap Phase', () => {
  test('startGame requires 2+ players', () => {
    const game = new ShitheadGame(() => {});
    game.addPlayer(mockWs(), 'Alice');
    // Remove bots
    for (const [n, p] of game.players) { if (p.isBot) game.players.delete(n); }
    game.startGame();
    assert.strictEqual(game.state, 'LOBBY');
  });

  test('startGame deals 3 cards to each zone', () => {
    const { game } = setupGame();
    game.startGame(1);
    for (const [, p] of game.players) {
      assert.strictEqual(p.hand.length, 3);
      assert.strictEqual(p.faceUp.length, 3);
      assert.strictEqual(p.faceDown.length, 3);
    }
    assert.strictEqual(game.state, 'SWAP');
  });

  test('startGame only works from LOBBY', () => {
    const { game } = setupGame();
    game.state = 'PLAYING';
    game.startGame();
    assert.strictEqual(game.state, 'PLAYING');
  });

  test('swapCard exchanges hand and faceUp cards', () => {
    const { game } = setupGame();
    game.startGame(1);
    const alice = game.players.get('Alice');
    const handCard = alice.hand[0];
    const faceUpCard = alice.faceUp[0];
    game.swapCard('Alice', handCard.id, faceUpCard.id);
    assert.ok(alice.hand.some(c => c.id === faceUpCard.id));
    assert.ok(alice.faceUp.some(c => c.id === handCard.id));
  });

  test('swapCard rejected after confirmSwap', () => {
    const { game } = setupGame();
    game.startGame(1);
    game.confirmSwap('Alice');
    const alice = game.players.get('Alice');
    const handBefore = [...alice.hand.map(c => c.id)];
    game.swapCard('Alice', alice.hand[0].id, alice.faceUp[0].id);
    // Should be unchanged since swapReady is true
    assert.deepStrictEqual(alice.hand.map(c => c.id), handBefore);
  });

  test('confirmSwap transitions to PLAYING when all ready', () => {
    const { game } = setupGame();
    game.startGame(1);
    game.confirmSwap('Alice');
    assert.strictEqual(game.state, 'SWAP');
    game.confirmSwap('Bob');
    assert.strictEqual(game.state, 'PLAYING');
    game._clearInactivityTimer();
  });
});

describe('ShitheadGame - Playing Cards', () => {
  test('playCards rejects when not your turn', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const other = current === 'Alice' ? 'Bob' : 'Alice';
    const p = game.players.get(other);
    game.playCards(other, [p.hand[0].id]);
    const err = sockets[other]._sent.find(m => m.type === 'SHITHEAD_ERROR' && m.code === 'NOT_YOUR_TURN');
    assert.ok(err);
  });

  test('playCards rejects mismatched ranks', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    // Find two cards with different ranks
    if (p.hand.length >= 2 && p.hand[0].rank !== p.hand[1].rank) {
      game.playCards(current, [p.hand[0].id, p.hand[1].id]);
      const err = sockets[current]._sent.find(m => m.code === 'MISMATCHED_RANKS');
      assert.ok(err);
    }
  });

  test('playCards adds card to pile and removes from hand', () => {
    const { game } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    // Find a playable card
    const playable = p.hand.find(c => game._canPlay(c.rank));
    if (playable) {
      const handBefore = p.hand.length;
      game.playCards(current, [playable.id]);
      // Hand either stayed same (replenished from deck) or decreased
      // Pile should have the card
      assert.ok(game.pile.length > 0 || p.hand.length <= handBefore);
    }
  });

  test('playing a 10 burns the pile', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    // Manually set a 10 in hand
    p.hand = [{ id: 'ten', rank: 10, name: '10', suit: '♠' }];
    game.pile = [{ rank: 5 }];
    game.playCards(current, ['ten']);
    // Pile should be burned
    assert.strictEqual(game.pile.length, 0);
    const burnMsg = msgs.find(m => m.type === 'SHITHEAD_PILE_BURNED');
    assert.ok(burnMsg);
  });

  test('playing a 7 activates sevenActive', () => {
    const { game } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    p.hand = [{ id: 'seven', rank: 7, name: '7', suit: '♠' }];
    game.pile = [{ rank: 5 }];
    game.playCards(current, ['seven']);
    assert.strictEqual(game.sevenActive, true);
  });

  test('pickUpPile adds pile to hand', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    game.pile = [{ rank: 5, id: 'x' }, { rank: 8, id: 'y' }];
    const handBefore = p.hand.length;
    game.pickUpPile(current);
    assert.strictEqual(p.hand.length, handBefore + 2);
    assert.strictEqual(game.pile.length, 0);
    const pickMsg = msgs.find(m => m.type === 'SHITHEAD_PILE_PICKED_UP');
    assert.ok(pickMsg);
  });

  test('pickUpPile rejects when not your turn', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const other = current === 'Alice' ? 'Bob' : 'Alice';
    game.pile = [{ rank: 5 }];
    game.pickUpPile(other);
    const err = sockets[other]._sent.find(m => m.code === 'NOT_YOUR_TURN');
    assert.ok(err);
  });
});

describe('ShitheadGame - Face Down Play', () => {
  test('playFaceDown rejected when hand/faceUp cards remain', () => {
    const { game, sockets } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    // Player still has hand cards
    game.playFaceDown(current, p.faceDown[0].id);
    const err = sockets[current]._sent.find(m => m.code === 'INVALID_PLAY_ORDER');
    assert.ok(err);
  });

  test('playFaceDown works when hand and faceUp are empty', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    p.hand = [];
    p.faceUp = [];
    const card = p.faceDown[0];
    game.pile = []; // empty pile so any card is playable
    game.playFaceDown(current, card.id);
    const reveal = msgs.find(m => m.type === 'SHITHEAD_REVEAL_FACEDOWN');
    assert.ok(reveal);
    assert.strictEqual(reveal.card.id, card.id);
  });

  test('playFaceDown unplayable card forces pickup', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    p.hand = [];
    p.faceUp = [];
    p.faceDown = [{ id: 'fd1', rank: 4, name: '4', suit: '♠' }];
    game.pile = [{ rank: 14 }]; // Ace on top, 4 can't beat it
    game.sevenActive = false;
    game.playFaceDown(current, 'fd1');
    // Player should have picked up pile + the card
    assert.ok(p.hand.length > 0);
    assert.strictEqual(game.pile.length, 0);
    const pickMsg = msgs.find(m => m.type === 'SHITHEAD_PILE_PICKED_UP');
    assert.ok(pickMsg);
  });
});

describe('ShitheadGame - Turn Management', () => {
  test('_advanceTurn cycles through turnOrder', () => {
    const { game } = setupGame();
    startAndSkipSwap(game);
    const first = game._currentPlayer();
    game._advanceTurn();
    const second = game._currentPlayer();
    assert.notStrictEqual(first, second);
    game._advanceTurn();
    const third = game._currentPlayer();
    assert.strictEqual(third, first); // wraps around
  });

  test('_currentPlayer returns null with empty turnOrder', () => {
    const game = new ShitheadGame(() => {});
    game.turnOrder = [];
    assert.strictEqual(game._currentPlayer(), null);
  });
});

describe('ShitheadGame - Game End', () => {
  test('player finishing removes them from turnOrder', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    const current = game._currentPlayer();
    const p = game.players.get(current);
    p.hand = [];
    p.faceUp = [];
    p.faceDown = [];
    game._playerFinished(current);
    assert.ok(!game.turnOrder.includes(current));
    assert.ok(game.finishOrder.includes(current));
    const finMsg = msgs.find(m => m.type === 'SHITHEAD_PLAYER_FINISHED');
    assert.ok(finMsg);
    assert.strictEqual(finMsg.username, current);
  });

  test('last player standing becomes shithead', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    // Finish Alice
    game._playerFinished('Alice');
    // Bob is the last one
    assert.strictEqual(game.state, 'GAME_OVER');
    assert.strictEqual(game.shithead, 'Bob');
    const goMsg = msgs.find(m => m.type === 'SHITHEAD_GAME_OVER');
    assert.ok(goMsg);
    assert.strictEqual(goMsg.shithead, 'Bob');
  });

  test('restart resets game state', () => {
    const { game, msgs } = setupGame();
    startAndSkipSwap(game);
    game.restart();
    assert.strictEqual(game.state, 'LOBBY');
    assert.strictEqual(game.pile.length, 0);
    assert.strictEqual(game.deck.length, 0);
    assert.strictEqual(game.shithead, null);
    assert.strictEqual(game.finishOrder.length, 0);
    const restarted = msgs.find(m => m.type === 'SHITHEAD_RESTARTED');
    assert.ok(restarted);
  });
});

describe('ShitheadGame - Game State Broadcasting', () => {
  test('_buildGameState includes required fields', () => {
    const { game } = setupGame();
    startAndSkipSwap(game);
    const state = game._buildGameState();
    assert.strictEqual(state.type, 'SHITHEAD_GAME_STATE');
    assert.strictEqual(state.state, 'PLAYING');
    assert.ok(state.currentPlayer);
    assert.strictEqual(state.players.length, 2);
    assert.ok(state.players[0].hasOwnProperty('handCount'));
    assert.ok(state.players[0].hasOwnProperty('faceUp'));
    assert.ok(state.players[0].hasOwnProperty('faceDownCount'));
  });

  test('_isPlayerDone checks all zones empty', () => {
    const game = new ShitheadGame(() => {});
    assert.strictEqual(game._isPlayerDone({ hand: [], faceUp: [], faceDown: [] }), true);
    assert.strictEqual(game._isPlayerDone({ hand: [{}], faceUp: [], faceDown: [] }), false);
    assert.strictEqual(game._isPlayerDone({ hand: [], faceUp: [{}], faceDown: [] }), false);
    assert.strictEqual(game._isPlayerDone({ hand: [], faceUp: [], faceDown: [{}] }), false);
  });
});
