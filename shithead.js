'use strict';

const SUITS     = ['♠', '♥', '♦', '♣'];
const RANK_NAME = { 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 8:'8', 9:'9',
                    10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };
const RANKS     = Object.keys(RANK_NAME).map(Number);

const INACTIVITY_TIMEOUT_MS = 40_000;

class ShitheadGame {
  /**
   * @param {(msg: object) => void} broadcast – sends to all connected sockets
   */
  constructor(broadcast) {
    this._broadcast = broadcast;
    this.state      = 'LOBBY';  // LOBBY | SWAP | PLAYING | GAME_OVER
    /** @type {Map<string, {ws, hand, faceUp, faceDown, swapReady, hasFinished}>} */
    this.players    = new Map();
    this.deck       = [];
    this.pile       = [];
    this.turnOrder  = [];   // usernames of active (non-finished) players
    this.turn       = 0;    // index into turnOrder
    this.sevenActive = false;
    this.finishOrder = [];
    this.shithead   = null;
    this._inactivityTimer = null;
  }

  // ─── Deck helpers ────────────────────────────────────────────────────────

  _createDeck() {
    return this._createDecks(1);
  }

  _createDecks(count) {
    count = Math.max(1, Math.min(3, count ?? 1));
    let id = 0;
    const deck = [];
    for (let d = 0; d < count; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: String(++id), rank, name: RANK_NAME[rank], suit });
        }
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  _effectiveTopRank() {
    // Rank 3 is transparent: skip 3s to find the true effective top card
    for (let i = this.pile.length - 1; i >= 0; i--) {
      if (this.pile[i].rank !== 3) return this.pile[i].rank;
    }
    return 0;
  }

  _canPlay(rank) {
    if (rank === 2 || rank === 10) return true;
    const top = this._effectiveTopRank();
    if (top === 0) return true;
    if (this.sevenActive) return rank <= 7;
    return rank >= top;
  }

  _isFourOfAKind() {
    if (this.pile.length < 4) return false;
    const top = this.pile[this.pile.length - 1].rank;
    return this.pile.slice(-4).every(c => c.rank === top);
  }

  _replenish(p) {
    while (p.hand.length < 3 && this.deck.length > 0) {
      p.hand.push(this.deck.pop());
    }
  }

  // ─── Turn helpers ────────────────────────────────────────────────────────

  _currentPlayer() {
    if (this.turnOrder.length === 0) return null;
    return this.turnOrder[this.turn % this.turnOrder.length];
  }

  _advanceTurn() {
    if (this.turnOrder.length === 0) return;
    this.turn = (this.turn + 1) % this.turnOrder.length;
  }

  // ─── Broadcast helpers ───────────────────────────────────────────────────

  _sendTo(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  _broadcastPlayers() {
    const players = [...this.players.keys()].map(u => ({ username: u }));
    this._broadcast({ type: 'SHITHEAD_PLAYERS', players, playerCount: players.length });
  }

  _buildGameState() {
    const pileTop       = this.pile.length > 0 ? this.pile[this.pile.length - 1] : null;
    const currentPlayer = this._currentPlayer();
    return {
      type:          'SHITHEAD_GAME_STATE',
      state:          this.state,
      pileTop,
      pileSize:       this.pile.length,
      deckSize:       this.deck.length,
      currentPlayer,
      sevenActive:    this.sevenActive,
      finishOrder:    this.finishOrder,
      players: [...this.players.entries()].map(([username, p]) => ({
        username,
        handCount:     p.hand.length,
        faceUp:        p.faceUp,
        faceDownCount: p.faceDown.length,
        hasFinished:   p.hasFinished,
        isShithead:    this.shithead === username,
      })),
    };
  }

  _broadcastGameState() {
    this._broadcast(this._buildGameState());
    for (const [username] of this.players) {
      this._sendPlayerState(username);
    }
  }

  _sendPlayerState(username) {
    const p = this.players.get(username);
    if (!p) return;
    this._sendTo(p.ws, {
      type:        'SHITHEAD_YOUR_STATE',
      hand:         p.hand,
      faceUp:       p.faceUp,
      faceDownIds:  p.faceDown.map(c => c.id),
    });
  }

  _broadcastTurnInfo() {
    const pileTop        = this.pile.length > 0 ? this.pile[this.pile.length - 1] : null;
    const effectiveTopRank = this._effectiveTopRank();
    this._broadcast({
      type:             'SHITHEAD_YOUR_TURN',
      currentPlayer:     this._currentPlayer(),
      pileTop,
      pileSize:          this.pile.length,
      sevenActive:       this.sevenActive,
      effectiveTopRank,
    });
    this._startInactivityTimer();
  }

  // ─── Inactivity timer ────────────────────────────────────────────────────

  _clearInactivityTimer() {
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
  }

  _startInactivityTimer() {
    this._clearInactivityTimer();
    if (this.state !== 'PLAYING') return;
    const username = this._currentPlayer();
    if (!username) return;
    this._inactivityTimer = setTimeout(() => {
      this._kickInactivePlayer(username);
    }, INACTIVITY_TIMEOUT_MS);
  }

  _kickInactivePlayer(username) {
    this._clearInactivityTimer();
    if (this.state !== 'PLAYING') return;
    if (this._currentPlayer() !== username) return;

    this._broadcast({ type: 'SHITHEAD_PLAYER_KICKED', username, reason: 'inactivity' });

    const idx = this.turnOrder.indexOf(username);
    if (idx !== -1) {
      this.turnOrder.splice(idx, 1);
      if (this.turnOrder.length > 0) {
        this.turn = idx % this.turnOrder.length;
      }
    }
    this.players.delete(username);

    if (this.turnOrder.length <= 1) {
      if (this.turnOrder.length === 1) {
        this.shithead = this.turnOrder[0];
        const sp = this.players.get(this.shithead);
        if (sp) sp.hasFinished = true;
        this.finishOrder.push(this.shithead);
        this.turnOrder = [];
      }
      this.state = 'GAME_OVER';
      this._broadcastGameState();
      this._broadcast({
        type:        'SHITHEAD_GAME_OVER',
        finishOrder:  this.finishOrder,
        shithead:     this.shithead,
      });
    } else {
      this._broadcastGameState();
      this._broadcastTurnInfo();
    }
  }

  // ─── After play: advance + broadcast ────────────────────────────────────

  _afterPlay(playAgain) {
    if (!playAgain) {
      this._advanceTurn();
    }
    this._broadcastGameState();
    this._broadcastTurnInfo();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  addPlayer(ws, username) {
    if (!username) {
      this._sendTo(ws, { type: 'SHITHEAD_ERROR', code: 'INVALID_USERNAME', message: 'Username required.' });
      return;
    }
    if (this.players.has(username)) {
      // Reconnect
      const p = this.players.get(username);
      p.ws = ws;
      this._sendTo(ws, { type: 'SHITHEAD_JOIN_OK', username });
      this._sendPlayerState(username);
      this._sendTo(ws, this._buildGameState());
      if (this.state === 'PLAYING') this._broadcastTurnInfo();
      return;
    }
    if (this.state !== 'LOBBY') {
      this._sendTo(ws, { type: 'SHITHEAD_ERROR', code: 'GAME_IN_PROGRESS', message: 'Game already in progress.' });
      return;
    }
    if (this.players.size >= 4) {
      this._sendTo(ws, { type: 'SHITHEAD_ERROR', code: 'ROOM_FULL', message: 'Room full (max 4 players).' });
      return;
    }
    this.players.set(username, {
      ws,
      hand:       [],
      faceUp:     [],
      faceDown:   [],
      swapReady:  false,
      hasFinished: false,
    });
    this._sendTo(ws, { type: 'SHITHEAD_JOIN_OK', username });
    this._broadcastPlayers();
  }

  startGame(deckCount = 1) {
    if (this.state !== 'LOBBY' || this.players.size < 2) return;
    this.deck        = this._createDecks(deckCount);
    this.pile        = [];
    this.sevenActive = false;
    this.finishOrder = [];
    this.shithead    = null;

    for (const [, p] of this.players) {
      p.faceDown  = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.faceUp    = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.hand      = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.swapReady = false;
      p.hasFinished = false;
    }

    this.turnOrder = [...this.players.keys()];
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    this.turn  = 0;
    this.state = 'SWAP';

    this._broadcast({ type: 'SHITHEAD_SWAP_PHASE' });
    this._broadcastGameState();
  }

  confirmSwap(username) {
    if (this.state !== 'SWAP') return;
    const p = this.players.get(username);
    if (!p || p.swapReady) return;
    p.swapReady = true;

    const readyCount = [...this.players.values()].filter(pl => pl.swapReady).length;
    const total      = this.players.size;
    this._broadcast({ type: 'SHITHEAD_SWAP_READY', readyCount, total });

    if (readyCount === total) {
      this.state = 'PLAYING';
      this._broadcastGameState();
      this._broadcastTurnInfo();
    }
  }

  swapCard(username, handCardId, faceUpCardId) {
    if (this.state !== 'SWAP') return;
    const p = this.players.get(username);
    if (!p || p.swapReady) return;

    if (typeof handCardId !== 'string' || !handCardId ||
        typeof faceUpCardId !== 'string' || !faceUpCardId) {
      return;
    }

    const hi = p.hand.findIndex(c => c.id === handCardId);
    const fi = p.faceUp.findIndex(c => c.id === faceUpCardId);
    if (hi === -1 || fi === -1) return;

    [p.hand[hi], p.faceUp[fi]] = [p.faceUp[fi], p.hand[hi]];
    this._sendPlayerState(username);
  }

  playCards(username, cardIds) {
    if (this.state !== 'PLAYING') return;
    if (!Array.isArray(cardIds) || cardIds.length === 0) return;
    if (this._currentPlayer() !== username) {
      const p = this.players.get(username);
      if (p) this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn.' });
      return;
    }
    const p = this.players.get(username);
    if (!p) return;

    const hasHand   = p.hand.length > 0;
    const hasFaceUp = p.faceUp.length > 0;

    let cards;
    if (hasHand) {
      cards = cardIds.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    } else if (hasFaceUp) {
      cards = cardIds.map(id => p.faceUp.find(c => c.id === id)).filter(Boolean);
    } else {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'NO_VALID_CARDS', message: 'No valid cards to play.' });
      return;
    }

    if (!cards || cards.length === 0 || cards.length !== cardIds.length) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'INVALID_CARD_SELECTION', message: 'Invalid card selection.' });
      return;
    }

    const rank = cards[0].rank;
    if (!cards.every(c => c.rank === rank)) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'MISMATCHED_RANKS', message: 'All cards must be the same rank.' });
      return;
    }
    if (!this._canPlay(rank)) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'ILLEGAL_PLAY', message: 'Cannot play that card.' });
      return;
    }

    // Remove from zone
    if (hasHand) {
      p.hand   = p.hand.filter(c => !cardIds.includes(c.id));
    } else {
      p.faceUp = p.faceUp.filter(c => !cardIds.includes(c.id));
    }

    this.pile.push(...cards);

    // Special card effects
    let burn      = false;
    let playAgain = false;
    if (rank === 10) {
      burn = true; playAgain = true;
      this.sevenActive = false;
    } else if (rank === 7) {
      this.sevenActive = true;
    } else {
      this.sevenActive = false;
    }

    if (!burn && this._isFourOfAKind()) {
      burn = true; playAgain = true;
    }

    // Replenish hand before burning/advancing
    if (hasHand) this._replenish(p);

    if (burn) {
      this.pile = [];
      this.sevenActive = false;
      this._broadcast({ type: 'SHITHEAD_PILE_BURNED' });
    }

    if (this._isPlayerDone(p)) {
      this._playerFinished(username);
      return;
    }

    this._afterPlay(playAgain);
  }

  playFaceDown(username, cardId) {
    if (this.state !== 'PLAYING') return;
    if (this._currentPlayer() !== username) {
      const p = this.players.get(username);
      if (p) this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn.' });
      return;
    }
    const p = this.players.get(username);
    if (!p) return;

    if (!cardId) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'CARD_NOT_FOUND', message: 'Card not found.' });
      return;
    }

    if (p.hand.length > 0 || p.faceUp.length > 0) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'INVALID_PLAY_ORDER', message: 'Must play hand or face-up cards first.' });
      return;
    }

    const idx = p.faceDown.findIndex(c => c.id === cardId);
    if (idx === -1) {
      this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'CARD_NOT_FOUND', message: 'Card not found.' });
      return;
    }

    const card = p.faceDown.splice(idx, 1)[0];
    this._broadcast({ type: 'SHITHEAD_REVEAL_FACEDOWN', username, card });

    if (!this._canPlay(card.rank)) {
      // Unplayable: put card on pile then pick everything up
      this.pile.push(card);
      p.hand.push(...this.pile);
      this.pile        = [];
      this.sevenActive = false;
      this._broadcast({ type: 'SHITHEAD_PILE_PICKED_UP', username, handCount: p.hand.length });
      this._advanceTurn();
      this._broadcastGameState();
      this._broadcastTurnInfo();
      return;
    }

    this.pile.push(card);

    let burn      = false;
    let playAgain = false;
    if (card.rank === 10) {
      burn = true; playAgain = true;
      this.sevenActive = false;
    } else if (card.rank === 7) {
      this.sevenActive = true;
    } else {
      this.sevenActive = false;
    }

    if (!burn && this._isFourOfAKind()) {
      burn = true; playAgain = true;
    }

    if (burn) {
      this.pile = [];
      this.sevenActive = false;
      this._broadcast({ type: 'SHITHEAD_PILE_BURNED' });
    }

    if (this._isPlayerDone(p)) {
      this._playerFinished(username);
      return;
    }

    this._afterPlay(playAgain);
  }

  pickUpPile(username) {
    if (this.state !== 'PLAYING') return;
    if (this._currentPlayer() !== username) {
      const p = this.players.get(username);
      if (p) this._sendTo(p.ws, { type: 'SHITHEAD_ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn.' });
      return;
    }
    const p = this.players.get(username);
    if (!p || this.pile.length === 0) return;

    p.hand.push(...this.pile);
    this.pile        = [];
    this.sevenActive = false;
    this._broadcast({ type: 'SHITHEAD_PILE_PICKED_UP', username, handCount: p.hand.length });
    this._advanceTurn();
    this._broadcastGameState();
    this._broadcastTurnInfo();
  }

  restart() {
    this._clearInactivityTimer();
    this.state       = 'LOBBY';
    this.deck        = [];
    this.pile        = [];
    this.turnOrder   = [];
    this.turn        = 0;
    this.sevenActive = false;
    this.finishOrder = [];
    this.shithead    = null;
    for (const [, p] of this.players) {
      p.hand       = [];
      p.faceUp     = [];
      p.faceDown   = [];
      p.swapReady  = false;
      p.hasFinished = false;
    }
    this._broadcast({ type: 'SHITHEAD_RESTARTED' });
    this._broadcastGameState();
  }

  removePlayer(ws) {
    for (const [username, p] of this.players) {
      if (p.ws === ws) {
        if (this.state === 'LOBBY') {
          this.players.delete(username);
        } else {
          p.ws = null;
        }
        break;
      }
    }
    this._broadcastPlayers();
  }

  usernameByWs(ws) {
    for (const [username, p] of this.players) {
      if (p.ws === ws) return username;
    }
    return null;
  }

  hostConnected(ws) {
    this._sendTo(ws, { type: 'SHITHEAD_HOST_CONNECTED' });
    this._broadcastPlayers();
    this._sendTo(ws, this._buildGameState());
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  _isPlayerDone(p) {
    return p.hand.length === 0 && p.faceUp.length === 0 && p.faceDown.length === 0;
  }

  _playerFinished(username) {
    const p = this.players.get(username);
    if (!p) return;
    p.hasFinished = true;
    const position = this.finishOrder.length + 1;
    this.finishOrder.push(username);
    this._broadcast({ type: 'SHITHEAD_PLAYER_FINISHED', username, position });

    // Remove from active turn order
    const idx = this.turnOrder.indexOf(username);
    if (idx !== -1) {
      this.turnOrder.splice(idx, 1);
      if (this.turnOrder.length > 0) {
        this.turn = idx % this.turnOrder.length;
      }
    }

    if (this.turnOrder.length <= 1) {
      if (this.turnOrder.length === 1) {
        this.shithead = this.turnOrder[0];
        const sp = this.players.get(this.shithead);
        if (sp) sp.hasFinished = true;
        this.finishOrder.push(this.shithead);
        this.turnOrder = [];
      }
      this._clearInactivityTimer();
      this.state = 'GAME_OVER';
      this._broadcastGameState();
      this._broadcast({
        type:        'SHITHEAD_GAME_OVER',
        finishOrder:  this.finishOrder,
        shithead:     this.shithead,
      });
    } else {
      this._broadcastGameState();
      this._broadcastTurnInfo();
    }
  }
}

// ─── Room-integrated message handler ───────────────────────────────────────

/**
 * Handle shithead-related player WebSocket messages.
 * @param {WebSocket} ws
 * @param {{ type: string }} msg
 * @param {object} room  – room object from the rooms registry
 * @returns {boolean} true if the message was handled, false otherwise
 */
function handleMessage(ws, msg, room) {
  const { type } = msg;
  const username = room.wsToUsername.get(ws);

  switch (type) {
    case 'SHITHEAD_CONFIRM_SWAP':
      if (!username || !room.shitheadGame) return true;
      room.shitheadGame.confirmSwap(username);
      return true;
    case 'SHITHEAD_SWAP_CARD':
      if (!username || !room.shitheadGame) return true;
      room.shitheadGame.swapCard(username, msg.handCardId, msg.faceUpCardId);
      return true;
    case 'SHITHEAD_PLAY_CARDS':
      if (!username || !room.shitheadGame || !Array.isArray(msg.cardIds)) return true;
      room.shitheadGame.playCards(username, msg.cardIds);
      return true;
    case 'SHITHEAD_PLAY_FACEDOWN':
      if (!username || !room.shitheadGame) return true;
      room.shitheadGame.playFaceDown(username, msg.cardId);
      return true;
    case 'SHITHEAD_PICK_UP_PILE':
      if (!username || !room.shitheadGame) return true;
      room.shitheadGame.pickUpPile(username);
      return true;
    default:
      return false;
  }
}

module.exports = { ShitheadGame, handleMessage };
