// test/ShiteadController.test.js

const test = require('node:test')
const assert = require('node:assert')
const ShiteadController = require('../server/ShiteadController')

/**
 * Tests for Shithead deck initialization and card dealing
 */

test('ShiteadController - deck initialization creates 52 cards', () => {
  const game = new ShiteadController()

  // Before start, no deck
  assert.strictEqual(game.deck.length, 0, 'Deck should be empty before start')

  // After initialization
  game._initializeDeck()
  assert.strictEqual(game.deck.length, 52, 'Deck must have exactly 52 cards')
})

test('ShiteadController - deck has correct suits', () => {
  const game = new ShiteadController()
  game._initializeDeck()

  const suits = ['♠', '♥', '♦', '♣']
  const deckSuits = new Set(game.deck.map(card => card.suit))

  assert.deepStrictEqual(Array.from(deckSuits).sort(), suits.sort(), 'All 4 suits must be present')
})

test('ShiteadController - deck has correct ranks', () => {
  const game = new ShiteadController()
  game._initializeDeck()

  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  const deckRanks = new Set(game.deck.map(card => card.rank))

  assert.deepStrictEqual(Array.from(deckRanks).sort(), ranks.sort(), 'All 13 ranks must be present')
})

test('ShiteadController - each rank appears exactly 4 times (once per suit)', () => {
  const game = new ShiteadController()
  game._initializeDeck()

  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

  for (const rank of ranks) {
    const count = game.deck.filter(card => card.rank === rank).length
    assert.strictEqual(count, 4, `Rank ${rank} must appear exactly 4 times (once per suit)`)
  }
})

test('ShiteadController - no duplicate cards in deck', () => {
  const game = new ShiteadController()
  game._initializeDeck()

  const cardSet = new Set()
  let duplicates = 0

  for (const card of game.deck) {
    const key = `${card.rank}-${card.suit}`
    if (cardSet.has(key)) {
      duplicates++
    }
    cardSet.add(key)
  }

  assert.strictEqual(duplicates, 0, 'No duplicate cards should exist in deck')
  assert.strictEqual(cardSet.size, 52, 'All 52 unique cards must be present')
})

test('ShiteadController - deck is shuffled (not in original order)', () => {
  const game1 = new ShiteadController()
  const game2 = new ShiteadController()

  game1._initializeDeck()
  game2._initializeDeck()

  // Convert to strings for easy comparison
  const deck1 = game1.deck.map(c => `${c.rank}${c.suit}`).join(',')
  const deck2 = game2.deck.map(c => `${c.rank}${c.suit}`).join(',')

  // Two shuffles should be different (with overwhelming probability)
  // Note: This test could theoretically fail (1 in 52! chance), but practically won't
  assert.notStrictEqual(deck1, deck2, 'Two shuffled decks should be different')
})

test('ShiteadController - dealing to 2 players distributes 18 cards', () => {
  const game = new ShiteadController()

  // Add 2 players
  game.addPlayer('alice', {
    username: 'alice',
    ws: null,
    isBot: false,
    cardHand: [],
    cardFaceDown: [],
    cardFaceUp: [],
  })
  game.addPlayer('bob', {
    username: 'bob',
    ws: null,
    isBot: false,
    cardHand: [],
    cardFaceDown: [],
    cardFaceUp: [],
  })

  game._initializeDeck()
  game._dealCards()

  let totalDealt = 0
  for (const player of game.getAllPlayers()) {
    const hand = player.cardHand.length
    const faceDown = player.cardFaceDown.length
    const faceUp = player.cardFaceUp.length
    const playerTotal = hand + faceDown + faceUp

    assert.strictEqual(hand, 3, 'Each player should have 3 hand cards')
    assert.strictEqual(faceDown, 3, 'Each player should have 3 face-down cards')
    assert.strictEqual(faceUp, 3, 'Each player should have 3 face-up cards')
    assert.strictEqual(playerTotal, 9, 'Each player should have exactly 9 cards total')

    totalDealt += playerTotal
  }

  assert.strictEqual(totalDealt, 18, '2 players × 9 cards = 18 cards should be dealt')
})

test('ShiteadController - dealing to 4 players distributes 36 cards', () => {
  const game = new ShiteadController()

  // Add 4 players
  for (let i = 0; i < 4; i++) {
    game.addPlayer(`player${i}`, {
      username: `player${i}`,
      ws: null,
      isBot: false,
      cardHand: [],
      cardFaceDown: [],
      cardFaceUp: [],
    })
  }

  game._initializeDeck()
  game._dealCards()

  let totalDealt = 0
  for (const player of game.getAllPlayers()) {
    assert.strictEqual(player.cardHand.length, 3)
    assert.strictEqual(player.cardFaceDown.length, 3)
    assert.strictEqual(player.cardFaceUp.length, 3)
    totalDealt += 9
  }

  assert.strictEqual(totalDealt, 36, '4 players × 9 cards = 36 cards should be dealt')
})

test('ShiteadController - dealt cards are actual card objects with rank and suit', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {
    username: 'alice',
    ws: null,
    isBot: false,
    cardHand: [],
    cardFaceDown: [],
    cardFaceUp: [],
  })

  game._initializeDeck()
  game._dealCards()

  const player = game.getPlayerState('alice')

  // Check hand cards
  for (const card of player.hand) {
    assert.ok(card.rank, 'Card must have a rank')
    assert.ok(card.suit, 'Card must have a suit')
    assert.strictEqual(typeof card.rank, 'string', 'Rank must be a string')
    assert.strictEqual(typeof card.suit, 'string', 'Suit must be a string')
  }

  // Check face-up cards
  for (const card of player.faceUp) {
    assert.ok(card.rank, 'Card must have a rank')
    assert.ok(card.suit, 'Card must have a suit')
  }
})

test('ShiteadController - no cards dealt from discard pile initially', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {
    username: 'alice',
    ws: null,
    isBot: false,
    cardHand: [],
    cardFaceDown: [],
    cardFaceUp: [],
  })

  game._initializeDeck()
  assert.strictEqual(game.pile.length, 0, 'Discard pile should be empty before start')

  game._dealCards()
  assert.strictEqual(game.pile.length, 0, 'Discard pile should still be empty after dealing')
})

test('ShiteadController - playerOrder is set correctly during dealing', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})
  game.addPlayer('charlie', {username: 'charlie', ws: null, isBot: false})

  assert.strictEqual(game.playerOrder.length, 0, 'playerOrder should be empty initially')

  game._initializeDeck()
  game._dealCards()

  assert.strictEqual(game.playerOrder.length, 3, 'playerOrder should have 3 players')
  assert.ok(game.playerOrder.includes('alice'))
  assert.ok(game.playerOrder.includes('bob'))
  assert.ok(game.playerOrder.includes('charlie'))
})

test('ShiteadController - dealt cards are unique (no duplicates across players)', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})

  game._initializeDeck()
  game._dealCards()

  const allDealtCards = new Set()

  for (const player of game.getAllPlayers()) {
    for (const card of player.cardHand) {
      const key = `${card.rank}${card.suit}`
      assert.ok(!allDealtCards.has(key), `Card ${key} should not appear in multiple players`)
      allDealtCards.add(key)
    }
    for (const card of player.cardFaceUp) {
      const key = `${card.rank}${card.suit}`
      assert.ok(!allDealtCards.has(key), `Card ${key} should not appear in multiple players`)
      allDealtCards.add(key)
    }
    for (const card of player.cardFaceDown) {
      const key = `${card.rank}${card.suit}`
      assert.ok(!allDealtCards.has(key), `Card ${key} should not appear in multiple players`)
      allDealtCards.add(key)
    }
  }
})

test('ShiteadController - deck cards consumed in order (first 9 to alice, next 9 to bob, etc)', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})

  game._initializeDeck()
  const deckBefore = game.deck.slice() // Copy of shuffled deck

  game._dealCards()

  // Reconstruct what should have been dealt
  const expectedAlice = [
    ...deckBefore.slice(0, 3),   // hand
    ...deckBefore.slice(3, 6),   // face-down
    ...deckBefore.slice(6, 9)    // face-up
  ]

  const expectedBob = [
    ...deckBefore.slice(9, 12),  // hand
    ...deckBefore.slice(12, 15), // face-down
    ...deckBefore.slice(15, 18)  // face-up
  ]

  const alice = game.getPlayerState('alice')
  const bob = game.getPlayerState('bob')

  // Check alice's hand
  for (let i = 0; i < 3; i++) {
    assert.deepStrictEqual(alice.hand[i], expectedAlice[i], `Alice hand card ${i} mismatch`)
  }

  // Check bob's hand
  for (let i = 0; i < 3; i++) {
    assert.deepStrictEqual(bob.hand[i], expectedBob[i], `Bob hand card ${i} mismatch`)
  }
})

test('ShiteadController - start() initializes deck and deals cards', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})

  // Before start
  assert.strictEqual(game.deck.length, 0, 'Deck should be empty before start')
  assert.strictEqual(game.getPhase(), 'LOBBY', 'Phase should be LOBBY before start')

  game.start()

  // After start
  assert.ok(game.deck.length > 0, 'Deck should be populated after start')
  assert.strictEqual(game.getPhase(), 'SETUP', 'Phase should be SETUP after start')

  const alice = game.getPlayerState('alice')
  assert.strictEqual(alice.hand.length, 3, 'Alice should have 3 hand cards')
  assert.strictEqual(alice.faceUp.length, 3, 'Alice should have 3 face-up cards')
})

test('SWAP - confirmSwap transitions to REVEAL when all players confirm', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})

  game.start()

  // Advance to SWAP phase by expiring SETUP (5s timeout)
  game.phaseStartTime = Date.now() - 6000
  game.tick()
  assert.strictEqual(game.getPhase(), 'SWAP', 'Should be in SWAP phase after SETUP expires')

  // Both players confirm
  const alice_confirmed = game.confirmSwap('alice')
  assert.strictEqual(alice_confirmed, true, 'Alice confirm should succeed')
  assert.strictEqual(game.getPhase(), 'SWAP', 'Should still be SWAP after first confirm')

  const bob_confirmed = game.confirmSwap('bob')
  assert.strictEqual(bob_confirmed, true, 'Bob confirm should succeed')
  assert.strictEqual(game.getPhase(), 'REVEAL', 'Should transition to REVEAL when all confirm')
})

test('SWAP - confirmSwap does NOT transition when only some players confirm', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bob', {username: 'bob', ws: null, isBot: false})

  game.start()

  // Advance to SWAP phase
  game.phaseStartTime = Date.now() - 6000
  game.tick()
  assert.strictEqual(game.getPhase(), 'SWAP', 'Should be in SWAP phase')

  // Only alice confirms
  const alice_confirmed = game.confirmSwap('alice')
  assert.strictEqual(alice_confirmed, true, 'Alice confirm should succeed')
  assert.strictEqual(game.getPhase(), 'SWAP', 'Should remain in SWAP phase (bob not ready)')
})

test('SWAP - confirmSwap fails in wrong phase', () => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.start()

  assert.strictEqual(game.getPhase(), 'SETUP', 'Should be in SETUP phase')

  const result = game.confirmSwap('alice')
  assert.strictEqual(result, false, 'Should fail to confirm in SETUP phase')
  assert.strictEqual(game.getPhase(), 'SETUP', 'Phase should not change')
})

test('SWAP - bot auto-confirms after swap via processBotSwaps', (t) => {
  const game = new ShiteadController()

  game.addPlayer('alice', {username: 'alice', ws: null, isBot: false})
  game.addPlayer('bot_player', {username: 'bot_player', ws: null, isBot: true})

  game.start()

  // Advance to SWAP phase
  game.phaseStartTime = Date.now() - 6000
  game.tick()
  assert.strictEqual(game.getPhase(), 'SWAP', 'Should be in SWAP phase')

  // Bot should process swaps and confirm
  game.processBotSwaps()

  // Give async timeout 2s to execute
  return new Promise(resolve => {
    setTimeout(() => {
      const botConfirmed = game.swapConfirmed.get('bot_player')
      assert.ok(botConfirmed, 'Bot should have confirmed swap')

      // Alice also confirms to complete the SWAP phase
      game.confirmSwap('alice')
      assert.strictEqual(game.getPhase(), 'REVEAL', 'Should transition to REVEAL when both confirm')
      resolve()
    }, 2000)
  })
})
