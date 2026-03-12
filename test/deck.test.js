'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { SUITS, RANKS, createDeck, shuffle, deal } = require('../server/deck');

// ─── Constants ────────────────────────────────────────────────────────────────

test('deck - SUITS has exactly 4 suits', () => {
  assert.strictEqual(SUITS.length, 4);
  assert.deepStrictEqual(SUITS, ['♠', '♥', '♦', '♣']);
});

test('deck - RANKS has exactly 13 ranks', () => {
  assert.strictEqual(RANKS.length, 13);
  assert.strictEqual(RANKS[0], '2');
  assert.strictEqual(RANKS[12], 'A');
});

// ─── createDeck ───────────────────────────────────────────────────────────────

test('deck - createDeck returns 52 cards', () => {
  const deck = createDeck();
  assert.strictEqual(deck.length, 52);
});

test('deck - all ids are unique and in range 0–51', () => {
  const deck = createDeck();
  const ids  = deck.map(c => c.id);
  const idSet = new Set(ids);
  assert.strictEqual(idSet.size, 52, 'All ids must be unique');
  assert.ok(ids.every(id => id >= 0 && id <= 51), 'All ids in range 0–51');
});

test('deck - each card has rank, suit, code, and id', () => {
  const deck = createDeck();
  for (const card of deck) {
    assert.strictEqual(typeof card.rank,   'string', 'rank must be string');
    assert.strictEqual(typeof card.suit,   'string', 'suit must be string');
    assert.strictEqual(typeof card.code,   'string', 'code must be string');
    assert.strictEqual(typeof card.id,     'number', 'id must be number');
    assert.strictEqual(card.code, card.rank + card.suit, 'code must equal rank+suit');
  }
});

test('deck - all 4 suits present, each exactly 13 times', () => {
  const deck = createDeck();
  for (const suit of SUITS) {
    const count = deck.filter(c => c.suit === suit).length;
    assert.strictEqual(count, 13, `Suit ${suit} must appear 13 times`);
  }
});

test('deck - all 13 ranks present, each exactly 4 times', () => {
  const deck = createDeck();
  for (const rank of RANKS) {
    const count = deck.filter(c => c.rank === rank).length;
    assert.strictEqual(count, 4, `Rank ${rank} must appear 4 times`);
  }
});

test('deck - no duplicate rank+suit combinations', () => {
  const deck  = createDeck();
  const codes = deck.map(c => c.code);
  const codeSet = new Set(codes);
  assert.strictEqual(codeSet.size, 52, 'No duplicate cards');
});

test('deck - returned in canonical (unshuffled) order', () => {
  const deck = createDeck();
  // First card is 2♠ (id 0), last is A♣ (id 51)
  assert.strictEqual(deck[0].id,  0);
  assert.strictEqual(deck[0].code, '2♠');
  assert.strictEqual(deck[51].id, 51);
  assert.strictEqual(deck[51].code, 'A♣');
});

test('deck - does not mutate between calls', () => {
  const d1 = createDeck();
  const d2 = createDeck();
  assert.deepStrictEqual(d1, d2, 'Two createDeck() calls must produce identical results');
});

test('deck - decks:2 returns 104 cards with unique ids', () => {
  const deck = createDeck({ decks: 2 });
  assert.strictEqual(deck.length, 104);
  const ids = new Set(deck.map(c => c.id));
  assert.strictEqual(ids.size, 104, 'All ids across 2 decks must be unique');
});

// ─── shuffle ──────────────────────────────────────────────────────────────────

test('deck - shuffle returns a new array of same length', () => {
  const deck     = createDeck();
  const shuffled = shuffle(deck);
  assert.strictEqual(shuffled.length, deck.length);
  assert.notStrictEqual(shuffled, deck, 'Must return a new array, not mutate');
});

test('deck - shuffle does not mutate the original array', () => {
  const deck   = createDeck();
  const before = deck.map(c => c.id);
  shuffle(deck);
  const after  = deck.map(c => c.id);
  assert.deepStrictEqual(before, after, 'Original must not be mutated');
});

test('deck - shuffle resulting array contains same cards (no loss, no duplication)', () => {
  const deck     = createDeck();
  const shuffled = shuffle(deck);
  const origIds  = new Set(deck.map(c => c.id));
  const newIds   = new Set(shuffled.map(c => c.id));
  assert.strictEqual(newIds.size, 52);
  for (const id of origIds) {
    assert.ok(newIds.has(id), `Card id ${id} missing after shuffle`);
  }
});

test('deck - two shuffles produce different orders (overwhelmingly likely)', () => {
  const d1 = shuffle(createDeck()).map(c => c.id).join(',');
  const d2 = shuffle(createDeck()).map(c => c.id).join(',');
  assert.notStrictEqual(d1, d2, 'Two shuffles should differ (1 in 52! chance of collision)');
});

test('deck - shuffle works on non-card arrays (generic)', () => {
  const result = shuffle(['a', 'b', 'c', 'd', 'e']);
  assert.strictEqual(result.length, 5);
  assert.deepStrictEqual([...result].sort(), ['a', 'b', 'c', 'd', 'e']);
});

// ─── deal ─────────────────────────────────────────────────────────────────────

test('deck - deal distributes correct number of cards per player', () => {
  const deck = shuffle(createDeck());
  const { hands } = deal(deck, 3, 9);
  assert.strictEqual(hands.length, 3);
  for (const hand of hands) {
    assert.strictEqual(hand.length, 9);
  }
});

test('deck - deal returns correct remaining cards', () => {
  const deck = shuffle(createDeck());
  const { remaining } = deal(deck, 2, 9);
  // 52 - (2 * 9) = 34 remaining
  assert.strictEqual(remaining.length, 34);
});

test('deck - all dealt cards and remaining sum to original deck size', () => {
  const deck = createDeck();
  const { hands, remaining } = deal(deck, 4, 5);
  const totalDealt = hands.reduce((sum, h) => sum + h.length, 0);
  assert.strictEqual(totalDealt + remaining.length, 52);
});

test('deck - dealt cards have no duplicates across all hands', () => {
  const deck = shuffle(createDeck());
  const { hands } = deal(deck, 4, 3);
  const seen = new Set();
  for (const hand of hands) {
    for (const card of hand) {
      assert.ok(!seen.has(card.id), `Card ${card.id} dealt to multiple players`);
      seen.add(card.id);
    }
  }
});

test('deck - deal does not mutate input array', () => {
  const deck   = createDeck();
  const before = deck.map(c => c.id);
  deal(deck, 2, 5);
  const after  = deck.map(c => c.id);
  assert.deepStrictEqual(before, after, 'deal must not mutate input');
});

test('deck - deal distributes round-robin (player 0 gets card 0, player 1 gets card 1, ...)', () => {
  const deck = createDeck(); // unshuffled, canonical order
  const { hands } = deal(deck, 2, 3);
  // Round-robin: [0,2,4] to player0, [1,3,5] to player1
  assert.strictEqual(hands[0][0].id, 0);
  assert.strictEqual(hands[1][0].id, 1);
  assert.strictEqual(hands[0][1].id, 2);
  assert.strictEqual(hands[1][1].id, 3);
});

test('deck - deal throws if not enough cards', () => {
  const deck = createDeck();
  assert.throws(
    () => deal(deck, 10, 9),   // Would need 90, only 52 available
    /not enough cards/,
    'Must throw on insufficient deck'
  );
});

test('deck - deal exact fit leaves empty remaining array', () => {
  const deck = createDeck();
  const { hands, remaining } = deal(deck, 4, 13);  // 4*13 = 52
  assert.strictEqual(remaining.length, 0);
  assert.strictEqual(hands.length, 4);
});
