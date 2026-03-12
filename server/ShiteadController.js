'use strict';

const GameController = require('./GameController')
const { createDeck, shuffle } = require('./deck')

/**
 * Shithead card game controller
 * State machine: LOBBY → SETUP → SWAP → REVEAL → PLAY → GAME_OVER
 */

class ShiteadController extends GameController {
  constructor() {
    super()

    this.deck = []
    this.pile = []
    this.playerOrder = []
    this.currentPlayerIndex = 0

    this.swapDuration = 30000      // 30s for card swap phase
    this.playTimeout = 10000       // 10s per move
    this.swapStartTime = null
    this.currentPlayerTurnStart = null
  }

  processBotSwaps() {
    // Auto-swap for bot players during SWAP phase
    if (this.phase === 'SWAP') {
      for (const [username, player] of this.players) {
        if (player.isBot && !player._botSwapScheduled) {
          const swapChoice = this.getBotSwapChoice(username)
          if (swapChoice) {
            // Small random delay for natural feel (500-1500ms)
            player._botSwapScheduled = true
            const delayMs = 500 + Math.random() * 1000
            setTimeout(() => {
              this.swapCard(username, swapChoice.handCardId, swapChoice.faceUpCardId)
              player._botSwapScheduled = false
            }, delayMs)
          }
        }
      }
    }
  }

  start() {
    super.start()
    this._initializeDeck()
    this._dealCards()
    this.transitionTo('SETUP')
  }

  tick() {
    switch (this.phase) {
      case 'SETUP':
        if (this.isPhaseExpired(5000)) {  // 5s setup time
          this.transitionTo('SWAP')
          this.swapStartTime = this.phaseStartTime
        }
        break

      case 'SWAP':
        if (this.isPhaseExpired(this.swapDuration)) {
          this._revealCards()
          this.transitionTo('REVEAL')
        }
        break

      case 'REVEAL':
        if (this.isPhaseExpired(3000)) {  // 3s to show cards
          this._startPlay()
          this.transitionTo('PLAY')
        }
        break

      case 'PLAY':
        // Check if current player's turn has expired (auto-advance)
        if (this.currentPlayerTurnStart && Date.now() - this.currentPlayerTurnStart > this.playTimeout) {
          this._advanceToNextPlayer()
          this.currentPlayerTurnStart = Date.now()
        }
        // Check if all players have finished
        if (this._allPlayersFinished()) {
          this.transitionTo('GAME_OVER')
        }
        break
    }
  }

  cleanup() {
    super.cleanup()
    this.deck = []
    this.pile = []
  }

  getState() {
    const playerArray = this.getAllPlayers()

    // Build player states for Shithead
    const playerStates = playerArray.map((p, idx) => ({
      username: p.username,
      handCount: p.cardHand ? p.cardHand.length : 0,
      faceUpCount: p.cardFaceUp ? p.cardFaceUp.length : 0,
      faceDownCount: p.cardFaceDown ? p.cardFaceDown.length : 0,
      order: idx,
      isCurrentPlayer: idx === this.currentPlayerIndex,
      isBot: p.isBot
    }))

    return {
      phase: this.phase,
      timeRemaining: this._getPhaseTimeRemaining(),
      players: playerStates,
      currentPlayerUsername: playerArray[this.currentPlayerIndex]?.username,
      pileTopCard: this.pile.length > 0 ? this.pile[this.pile.length - 1] : null,
      pileSize: this.pile.length
    }
  }

  getRemainingTime() {
    return this._getPhaseTimeRemaining()
  }

  getPlayerState(username) {
    const player = this.players.get(username)
    if (!player) return null
    return {
      username,
      hand: player.cardHand || [],
      faceUp: player.cardFaceUp || [],
      faceDownIds: (player.cardFaceDown || []).map((_, idx) => idx)
    }
  }

  _getPhaseTimeRemaining() {
    switch (this.phase) {
      case 'SETUP':
        return Math.max(0, 5000 - this.elapsedInPhase())
      case 'SWAP':
        return Math.max(0, this.swapDuration - this.elapsedInPhase())
      case 'REVEAL':
        return Math.max(0, 3000 - this.elapsedInPhase())
      case 'PLAY':
        return Math.max(0, this.playTimeout - (Date.now() - this.phaseStartTime))
      default:
        return 0
    }
  }

  handlePlayerAction(username, data) {
    if (this.phase !== 'PLAY') return

    const player = this.players.get(username)
    if (!player || username !== this.getCurrentPlayerUsername()) return

    const { card } = data

    if (this._isValidPlay(card)) {
      this.pile.push(card)
      this._removeCardFromPlayer(player, card)
      // Replenish hand from deck if needed
      while (player.cardHand.length < 3 && this.deck.length > 0) {
        player.cardHand.push(this.deck.pop())
      }
      this._advanceToNextPlayer()
      this.currentPlayerTurnStart = Date.now()
    }
  }

  swapCard(username, handCardId, faceUpCardId) {
    // During SWAP phase, exchange a hand card with a face-up card
    if (this.phase !== 'SWAP') return false

    const player = this.players.get(username)
    if (!player || !player.cardHand || !player.cardFaceUp) return false

    // Find cards by stable id
    const handIdx    = player.cardHand.findIndex(c => c.id === handCardId)
    const faceUpIdx  = player.cardFaceUp.findIndex(c => c.id === faceUpCardId)

    if (handIdx === -1 || faceUpIdx === -1) return false

    // Swap the cards
    const temp = player.cardHand[handIdx]
    player.cardHand[handIdx] = player.cardFaceUp[faceUpIdx]
    player.cardFaceUp[faceUpIdx] = temp

    return true
  }

  /**
   * Gets bot's intelligent card choice for SWAP phase
   * Bot chooses the worst hand card and best face-up card to swap
   */
  getBotSwapChoice(username) {
    const player = this.players.get(username)
    if (!player || !player.cardHand || !player.cardFaceUp) return null

    const rankValue = (card) => {
      const order = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
      return order.indexOf(card.rank)
    }

    // Find worst (lowest) card in hand
    let worstHandIdx = 0
    let worstValue = rankValue(player.cardHand[0])
    for (let i = 1; i < player.cardHand.length; i++) {
      const val = rankValue(player.cardHand[i])
      if (val < worstValue) {
        worstValue = val
        worstHandIdx = i
      }
    }

    // Find best (highest) card in face-up
    let bestFaceUpIdx = 0
    let bestValue = rankValue(player.cardFaceUp[0])
    for (let i = 1; i < player.cardFaceUp.length; i++) {
      const val = rankValue(player.cardFaceUp[i])
      if (val > bestValue) {
        bestValue = val
        bestFaceUpIdx = i
      }
    }

    const handCard = player.cardHand[worstHandIdx]
    const faceUpCard = player.cardFaceUp[bestFaceUpIdx]

    return {
      handCardId: handCard.id,
      faceUpCardId: faceUpCard.id
    }
  }

  /**
   * Private helpers
   */

  _initializeDeck() {
    this.deck = shuffle(createDeck())
  }

  _dealCards() {
    const players = this.getAllPlayers()
    this.playerOrder = players.map(p => p.username)

    let deckIdx = 0

    // Deal 3 cards to hand, 3 face-down, 3 face-up
    for (const player of players) {
      player.cardHand = []
      player.cardFaceDown = []
      player.cardFaceUp = []

      for (let i = 0; i < 3; i++) {
        player.cardHand.push(this.deck[deckIdx++])
      }
      for (let i = 0; i < 3; i++) {
        player.cardFaceDown.push(this.deck[deckIdx++])
      }
      for (let i = 0; i < 3; i++) {
        player.cardFaceUp.push(this.deck[deckIdx++])
      }
    }
  }

  _revealCards() {
    // Mark all face-down cards as revealed for display
    for (const player of this.getAllPlayers()) {
      player.faceDownRevealed = true
    }
  }

  _startPlay() {
    this.currentPlayerIndex = 0
    this.currentPlayerTurnStart = Date.now()
  }

  _advanceToNextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
    this.currentPlayerTurnStart = Date.now()
  }

  _isValidPlay(card) {
    if (this.pile.length === 0) return true

    const topCard = this.pile[this.pile.length - 1]

    // Can play higher rank or 2 (wild card)
    const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
    const topRankIdx = rankOrder.indexOf(topCard.rank)
    const playRankIdx = rankOrder.indexOf(card.rank)

    return card.rank === '2' || playRankIdx >= topRankIdx
  }

  _removeCardFromPlayer(player, card) {
    // Remove from hand first, then face-up, then face-down
    let idx = player.cardHand.findIndex(c => c.rank === card.rank && c.suit === card.suit)
    if (idx !== -1) {
      player.cardHand.splice(idx, 1)
      return
    }

    idx = player.cardFaceUp.findIndex(c => c.rank === card.rank && c.suit === card.suit)
    if (idx !== -1) {
      player.cardFaceUp.splice(idx, 1)
      return
    }

    idx = player.cardFaceDown.findIndex(c => c.rank === card.rank && c.suit === card.suit)
    if (idx !== -1) {
      player.cardFaceDown.splice(idx, 1)
    }
  }

  _allPlayersFinished() {
    return this.getAllPlayers().every(p =>
      p.cardHand.length === 0 &&
      p.cardFaceUp.length === 0 &&
      p.cardFaceDown.length === 0
    )
  }

  getCurrentPlayerUsername() {
    return this.playerOrder[this.currentPlayerIndex]
  }
}

module.exports = ShiteadController
