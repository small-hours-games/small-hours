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
    this.swapConfirmed = new Map()  // username → true/false for early exit

    console.log('[Shithead] ShiteadController instance created')
  }

  processBotSwaps() {
    // Auto-swap for bot players during SWAP phase
    if (this.phase === 'SWAP') {
      for (const [username, player] of this.players) {
        if (player.isBot && !player._botSwapScheduled && !this.swapConfirmed.get(username)) {
          const swapChoice = this.getBotSwapChoice(username)
          if (swapChoice) {
            // Small random delay for natural feel (500-1500ms)
            player._botSwapScheduled = true
            const delayMs = 500 + Math.random() * 1000
            setTimeout(() => {
              this.swapCard(username, swapChoice.handCardId, swapChoice.faceUpCardId)
              player._botSwapScheduled = false
              this.confirmSwap(username)  // Bot confirms after swap
            }, delayMs)
          } else {
            // Nothing to swap — confirm immediately
            this.confirmSwap(username)
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
    console.log(`[Shithead] Game started. Players: ${this.players.size}, Phase: ${this.phase}`)
  }

  tick() {
    switch (this.phase) {
      case 'SETUP':
        const setupElapsed = this.elapsedInPhase()
        console.log(`[Shithead] tick() SETUP: phaseStartTime=${this.phaseStartTime}, elapsed=${setupElapsed}ms, isPhaseExpired=${this.isPhaseExpired(5000)}, check=(${setupElapsed} >= 5000)`)
        if (this.isPhaseExpired(5000)) {  // 5s setup time
          console.log(`[Shithead] SETUP phase expired (${setupElapsed}ms), transitioning to SWAP`)
          this.swapConfirmed = new Map()  // Reset confirmations for new phase
          this.transitionTo('SWAP')
        }
        break

      case 'SWAP':
        const swapElapsed = this.elapsedInPhase()
        console.log(`[Shithead] tick() SWAP: elapsed=${swapElapsed}ms, isPhaseExpired=${this.isPhaseExpired(this.swapDuration)}`)
        if (this.isPhaseExpired(this.swapDuration)) {
          console.log(`[Shithead] SWAP phase expired (${swapElapsed}ms), transitioning to REVEAL`)
          this._revealCards()
          this.transitionTo('REVEAL')
        }
        break

      case 'REVEAL':
        const revealElapsed = this.elapsedInPhase()
        if (this.isPhaseExpired(3000)) {  // 3s to show cards
          console.log(`[Shithead] REVEAL phase expired (${revealElapsed}ms), transitioning to PLAY`)
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
          console.log(`[Shithead] All players finished, transitioning to GAME_OVER`)
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
    console.log(`[Shithead] getState() called, phase=${this.phase}, players=${this.players.size}`)
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
    // Returns: true if play succeeded, false if validation failed, undefined if phase invalid
    if (this.phase !== 'PLAY') {
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} attempted action in wrong phase (${this.phase})`)
      return false
    }

    const player = this.players.get(username)
    if (!player) {
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} not found in players`)
      return false
    }
    if (username !== this.getCurrentPlayerUsername()) {
      const currentPlayer = this.getCurrentPlayerUsername()
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} played out of turn (current: ${currentPlayer})`)
      return false
    }

    const { cardIds, cardId } = data

    // Handle single card from face-down
    if (cardId) {
      // TODO: implement face-down play logic (for now, reject)
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} attempted face-down play (not yet implemented)`)
      return false
    }

    // Handle multiple cards from hand
    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} sent invalid cardIds: ${JSON.stringify(cardIds)}`)
      return false
    }

    // For now, just play the first card (Shithead rules: play single or matching ranks)
    // This simplified logic can be enhanced later
    const firstCardId = cardIds[0]
    const hand = player.cardHand
    const cardIndex = hand.findIndex(c => c.id === firstCardId)

    if (cardIndex === -1) {
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} card not in hand (id=${firstCardId})`)
      return false
    }

    const card = hand[cardIndex]

    if (this._isValidPlay(card)) {
      this.pile.push(card)
      hand.splice(cardIndex, 1)
      // Replenish hand from deck if needed
      while (player.cardHand.length < 3 && this.deck.length > 0) {
        player.cardHand.push(this.deck.pop())
      }
      console.log(`[Shithead][PLAY][SUCCESS]: ${username} played ${card.rank}${card.suit}, hand=${player.cardHand.length}, pile=${this.pile.length}`)
      this._advanceToNextPlayer()
      this.currentPlayerTurnStart = Date.now()
      return true
    } else {
      const topCard = this.pile.length > 0 ? this.pile[this.pile.length - 1] : null
      const rankOrder = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
      const topRank = topCard ? topCard.rank : 'none'
      console.log(`[Shithead][PLAY][ACTION_INVALID]: ${username} played invalid card ${card.rank}${card.suit} (pile top: ${topRank}, rankOrder allows: ${card.rank === '2' ? 'any (wild)' : `>=${topRank}`})`)
      return false
    }
  }

  swapCard(username, handCardId, faceUpCardId) {
    // During SWAP phase, exchange a hand card with a face-up card
    if (this.phase !== 'SWAP') {
      console.log(`[Shithead][SWAP][FAIL]: ${username} attempted swap in wrong phase (${this.phase})`)
      return false
    }

    const player = this.players.get(username)
    if (!player) {
      console.log(`[Shithead][SWAP][FAIL]: ${username} not found in players`)
      return false
    }
    if (!player.cardHand || !player.cardFaceUp) {
      console.log(`[Shithead][SWAP][FAIL]: ${username} missing card arrays (hand=${!!player.cardHand}, faceUp=${!!player.cardFaceUp})`)
      return false
    }

    // Find cards by stable id
    const handIdx    = player.cardHand.findIndex(c => c.id === handCardId)
    const faceUpIdx  = player.cardFaceUp.findIndex(c => c.id === faceUpCardId)

    if (handIdx === -1) {
      console.log(`[Shithead][SWAP][FAIL]: ${username} hand card not found (id=${handCardId}, available=${player.cardHand.map(c => c.id).join(',')})`)
      return false
    }
    if (faceUpIdx === -1) {
      console.log(`[Shithead][SWAP][FAIL]: ${username} face-up card not found (id=${faceUpCardId}, available=${player.cardFaceUp.map(c => c.id).join(',')})`)
      return false
    }

    // Swap the cards
    const handCard = player.cardHand[handIdx]
    const faceUpCard = player.cardFaceUp[faceUpIdx]
    const temp = player.cardHand[handIdx]
    player.cardHand[handIdx] = player.cardFaceUp[faceUpIdx]
    player.cardFaceUp[faceUpIdx] = temp

    console.log(`[Shithead][SWAP][SUCCESS]: ${username} swapped ${handCard.rank}${handCard.suit} for ${faceUpCard.rank}${faceUpCard.suit}`)
    return true
  }

  confirmSwap(username) {
    // Player confirms they're ready to move from SWAP to REVEAL
    if (this.phase !== 'SWAP') {
      console.log(`[Shithead][CONFIRM_SWAP][FAIL]: ${username} attempted confirm in wrong phase (${this.phase})`)
      return false
    }

    const player = this.players.get(username)
    if (!player) {
      console.log(`[Shithead][CONFIRM_SWAP][FAIL]: ${username} not found in players`)
      return false
    }

    this.swapConfirmed.set(username, true)
    const readyCount = [...this.swapConfirmed.values()].filter(Boolean).length
    console.log(`[Shithead][CONFIRM_SWAP][SUCCESS]: ${username} confirmed (${readyCount}/${this.players.size} ready)`)

    if (this._allPlayersConfirmedSwap()) {
      console.log(`[Shithead][CONFIRM_SWAP]: All players confirmed, transitioning to REVEAL early`)
      this._revealCards()
      this.transitionTo('REVEAL')
    }
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

  _allPlayersConfirmedSwap() {
    // Check if all players have confirmed during SWAP phase
    for (const [username] of this.players) {
      if (!this.swapConfirmed.get(username)) return false
    }
    return true
  }

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
    if (this.playerOrder.length === 0) {
      console.warn(`[Shithead][TURN][WARNING]: No players in playerOrder, cannot advance turn`)
      return
    }
    const oldPlayer = this.playerOrder[this.currentPlayerIndex] || 'unknown'
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length
    const newPlayer = this.playerOrder[this.currentPlayerIndex]
    this.currentPlayerTurnStart = Date.now()
    console.log(`[Shithead][TURN]: Advanced from ${oldPlayer} to ${newPlayer} (index: ${this.currentPlayerIndex}/${this.playerOrder.length})`)
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
      console.log(`[Shithead][REMOVE]: Card ${card.rank}${card.suit} removed from hand (player=${player.username})`)
      return
    }

    idx = player.cardFaceUp.findIndex(c => c.rank === card.rank && c.suit === card.suit)
    if (idx !== -1) {
      player.cardFaceUp.splice(idx, 1)
      console.log(`[Shithead][REMOVE]: Card ${card.rank}${card.suit} removed from face-up (player=${player.username})`)
      return
    }

    idx = player.cardFaceDown.findIndex(c => c.rank === card.rank && c.suit === card.suit)
    if (idx !== -1) {
      player.cardFaceDown.splice(idx, 1)
      console.log(`[Shithead][REMOVE]: Card ${card.rank}${card.suit} removed from face-down (player=${player.username})`)
      return
    }

    console.warn(`[Shithead][REMOVE][WARNING]: Card ${card.rank}${card.suit} not found in any pile (player=${player.username})`)
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
