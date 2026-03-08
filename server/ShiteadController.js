// server/ShiteadController.js

const GameController = require('./GameController')

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
        // Handled by player actions
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

    const player = this.getPlayerState(username)
    if (!player || username !== this.getCurrentPlayerUsername()) return

    const { card } = data

    if (this._isValidPlay(card)) {
      this.pile.push(card)
      this._removeCardFromPlayer(player, card)
      this._advanceToNextPlayer()
    }
  }

  /**
   * Private helpers
   */

  _initializeDeck() {
    const suits = ['♠', '♥', '♦', '♣']
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

    for (const suit of suits) {
      for (const rank of ranks) {
        this.deck.push({rank, suit})
      }
    }

    // Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]
    }
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
    // Show face-down cards to owner only
  }

  _startPlay() {
    this.currentPlayerIndex = 0
  }

  _advanceToNextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
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
