'use strict';

// Vänd Tia (Shithead) card game logic

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J,12=Q,13=K,14=A
const RANK_NAMES = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };

// Special card ranks
const RANK_TWO   = 2;  // always playable, resets pile value to 2
const RANK_THREE = 3;  // transparent – pile value comes from card below
const RANK_SEVEN = 7;  // next player must play ≤ 7
const RANK_TEN   = 10; // burns the pile

const SHITHEAD_STATE = {
  LOBBY:     'LOBBY',
  SWAP:      'SWAP',      // players swap hand ↔ face-up before play
  PLAYING:   'PLAYING',
  GAME_OVER: 'GAME_OVER',
};

let _cardId = 0;
function makeCard(rank, suit) {
  return { id: `c${++_cardId}`, rank, suit, name: RANK_NAMES[rank] };
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Return the effective pile value (skip 3s at top)
function effectiveTopRank(pile) {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== RANK_THREE) return pile[i].rank;
  }
  return 0; // empty or all 3s → any card playable
}

// Can a given rank be played on the current pile?
function canPlay(rank, pile, sevenActive) {
  if (rank === RANK_TWO || rank === RANK_TEN) return true;
  const top = effectiveTopRank(pile);
  if (top === 0) return true;
  if (sevenActive) return rank <= RANK_SEVEN;
  return rank >= top;
}

class ShitheadGame {
  constructor(broadcast) {
    this._broadcast = broadcast;
    this._reset();
  }

  _reset() {
    this.state = SHITHEAD_STATE.LOBBY;
    this.players = new Map(); // username → player object
    this.playerOrder = [];    // turn order
    this.deck = [];
    this.pile = [];
    this.currentPlayerIndex = 0;
    this.sevenActive = false;
    this.finishOrder = [];    // usernames in finish order
    this.swapReady = new Set();
  }

  // ─── Player management ─────────────────────────────────────────────────────

  addPlayer(ws, username) {
    if (this.state !== SHITHEAD_STATE.LOBBY) {
      if (this.players.has(username)) {
        this.players.get(username).ws = ws;
        this._resyncPlayer(ws, username);
        return { ok: true, reconnected: true };
      }
      return { ok: false, code: 'GAME_IN_PROGRESS', message: 'Spelet pågår redan.' };
    }
    if (this.players.has(username)) {
      this.players.get(username).ws = ws;
      this._broadcastPlayerList();
      return { ok: true, reconnected: true };
    }
    if (this.players.size >= 5) {
      return { ok: false, code: 'GAME_FULL', message: 'Spelet är fullt (max 5 spelare).' };
    }
    if (!username || username.trim().length === 0) {
      return { ok: false, code: 'INVALID_USERNAME', message: 'Ogiltigt namn.' };
    }
    this.players.set(username, {
      ws, username,
      hand: [], faceUp: [], faceDown: [],
      hasFinished: false,
      isShithead: false,
    });
    this.playerOrder.push(username);
    this._broadcastPlayerList();
    return { ok: true };
  }

  removePlayer(ws) {
    for (const [username, player] of this.players.entries()) {
      if (player.ws === ws) {
        if (this.state === SHITHEAD_STATE.LOBBY) {
          this.players.delete(username);
          this.playerOrder = this.playerOrder.filter(u => u !== username);
          this._broadcastPlayerList();
        } else {
          player.ws = null;
        }
        return;
      }
    }
  }

  _broadcastPlayerList() {
    this._broadcast({
      type: 'SHITHEAD_PLAYERS',
      players: this.playerOrder.map(u => ({ username: u })),
      playerCount: this.players.size,
    });
  }

  // ─── Game start ────────────────────────────────────────────────────────────

  startGame() {
    if (this.state !== SHITHEAD_STATE.LOBBY) return { ok: false };
    if (this.players.size < 2) return { ok: false, message: 'Minst 2 spelare krävs.' };

    this.deck = shuffle(makeDeck());
    this.pile  = [];
    this.sevenActive  = false;
    this.finishOrder  = [];
    this.swapReady.clear();
    this.currentPlayerIndex = 0;

    // Deal: 3 face-down, 3 face-up on top, 3 hand
    for (const username of this.playerOrder) {
      const p = this.players.get(username);
      p.faceDown   = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.faceUp     = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.hand       = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
      p.hasFinished = false;
      p.isShithead  = false;
    }

    this.state = SHITHEAD_STATE.SWAP;
    this._broadcastGameState();
    this._sendAllPlayerStates();
    this._broadcast({ type: 'SHITHEAD_SWAP_PHASE' });
    return { ok: true };
  }

  // ─── Swap phase ────────────────────────────────────────────────────────────

  swapCard(ws, handCardId, faceUpCardId) {
    if (this.state !== SHITHEAD_STATE.SWAP) return;
    const username = this._findUsername(ws);
    if (!username) return;
    const player = this.players.get(username);

    const hi = player.hand.findIndex(c => c.id === handCardId);
    const fi = player.faceUp.findIndex(c => c.id === faceUpCardId);
    if (hi === -1 || fi === -1) return;

    [player.hand[hi], player.faceUp[fi]] = [player.faceUp[fi], player.hand[hi]];
    this._sendPlayerState(ws, username);
  }

  confirmSwap(ws) {
    if (this.state !== SHITHEAD_STATE.SWAP) return;
    const username = this._findUsername(ws);
    if (!username) return;
    this.swapReady.add(username);

    const total = this.playerOrder.length;
    this._broadcast({ type: 'SHITHEAD_SWAP_READY', username, readyCount: this.swapReady.size, total });

    if (this.swapReady.size >= total) {
      this._startPlaying();
    }
  }

  _startPlaying() {
    this.state = SHITHEAD_STATE.PLAYING;
    this.currentPlayerIndex = 0;
    this._broadcastGameState();
    this._sendAllPlayerStates();
    this._broadcastCurrentTurn();
  }

  // ─── Playing ───────────────────────────────────────────────────────────────

  playCards(ws, cardIds) {
    if (this.state !== SHITHEAD_STATE.PLAYING) return;
    const username = this._findUsername(ws);
    if (!username) return;
    if (this.playerOrder[this.currentPlayerIndex] !== username) return;

    const player = this.players.get(username);
    const source = this._findCardSource(player, cardIds);
    if (!source) return;

    const cards = cardIds.map(id => source.find(c => c.id === id)).filter(Boolean);
    if (cards.length === 0 || cards.length !== cardIds.length) return;

    // All played cards must be the same rank
    const rank = cards[0].rank;
    if (!cards.every(c => c.rank === rank)) return;

    if (!canPlay(rank, this.pile, this.sevenActive)) {
      // Invalid move — pick up the pile instead
      this._pickUpPileFor(username);
      this._afterTurn(username);
      return;
    }

    // Remove from source zone
    for (const card of cards) {
      const idx = source.indexOf(card);
      if (idx !== -1) source.splice(idx, 1);
    }

    // Add to pile
    this.pile.push(...cards);

    const burned = this._handleSpecialCards(rank);
    this._refillHand(player);

    if (player.hand.length === 0 && player.faceUp.length === 0 && player.faceDown.length === 0) {
      this._playerFinished(username);
    } else if (!burned) {
      this._advanceTurn();
      this._afterTurn(username);
    } else {
      // After a burn the current player goes again
      this._afterTurn(username);
    }
  }

  playFaceDown(ws, cardId) {
    if (this.state !== SHITHEAD_STATE.PLAYING) return;
    const username = this._findUsername(ws);
    if (!username) return;
    if (this.playerOrder[this.currentPlayerIndex] !== username) return;

    const player = this.players.get(username);
    if (player.hand.length > 0 || player.faceUp.length > 0) return; // must clear hand/faceup first

    const idx = player.faceDown.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const card = player.faceDown.splice(idx, 1)[0];

    // Reveal to everyone
    this._broadcast({ type: 'SHITHEAD_REVEAL_FACEDOWN', username, card });

    if (!canPlay(card.rank, this.pile, this.sevenActive)) {
      // Card can't be played — pile goes to player
      this.pile.push(card);
      this._pickUpPileFor(username);
      this._afterTurn(username);
      return;
    }

    this.pile.push(card);
    const burned = this._handleSpecialCards(card.rank);

    if (player.faceDown.length === 0) {
      this._playerFinished(username);
    } else if (!burned) {
      this._advanceTurn();
      this._afterTurn(username);
    } else {
      this._afterTurn(username);
    }
  }

  pickUpPile(ws) {
    if (this.state !== SHITHEAD_STATE.PLAYING) return;
    const username = this._findUsername(ws);
    if (!username) return;
    if (this.playerOrder[this.currentPlayerIndex] !== username) return;

    this._pickUpPileFor(username);
    this._afterTurn(username);
  }

  _pickUpPileFor(username) {
    const player = this.players.get(username);
    player.hand.push(...this.pile);
    this.pile = [];
    this.sevenActive = false;
    this._broadcast({ type: 'SHITHEAD_PILE_PICKED_UP', username, handCount: player.hand.length });
    this._advanceTurn();
  }

  _handleSpecialCards(rank) {
    if (rank === RANK_TEN || this._countTopRank() >= 4) {
      this.pile = [];
      this.sevenActive = false;
      this._broadcast({ type: 'SHITHEAD_PILE_BURNED' });
      return true;
    }
    if (rank === RANK_SEVEN) {
      this.sevenActive = true;
    } else if (rank !== RANK_THREE) {
      this.sevenActive = false;
    }
    return false;
  }

  _countTopRank() {
    if (this.pile.length === 0) return 0;
    const top = this.pile[this.pile.length - 1].rank;
    let count = 0;
    for (let i = this.pile.length - 1; i >= 0; i--) {
      if (this.pile[i].rank === top) count++;
      else break;
    }
    return count;
  }

  _refillHand(player) {
    while (player.hand.length < 3 && this.deck.length > 0) {
      player.hand.push(this.deck.pop());
    }
  }

  _advanceTurn() {
    const n = this.playerOrder.length;
    let next = this.currentPlayerIndex;
    for (let i = 0; i < n; i++) {
      next = (next + 1) % n;
      if (!this.players.get(this.playerOrder[next]).hasFinished) break;
    }
    this.currentPlayerIndex = next;
  }

  _playerFinished(username) {
    const player = this.players.get(username);
    player.hasFinished = true;
    this.finishOrder.push(username);
    this._broadcast({ type: 'SHITHEAD_PLAYER_FINISHED', username, position: this.finishOrder.length });

    const active = this.playerOrder.filter(u => !this.players.get(u).hasFinished);
    if (active.length <= 1) {
      if (active.length === 1) {
        const sh = active[0];
        this.players.get(sh).isShithead = true;
        this.players.get(sh).hasFinished = true;
        this.finishOrder.push(sh);
      }
      this._endGame();
    } else {
      this._advanceTurn();
      this._afterTurn(username);
    }
  }

  _afterTurn(username) {
    this._broadcastGameState();
    this._sendAllPlayerStates();
    if (this.state === SHITHEAD_STATE.PLAYING) this._broadcastCurrentTurn();
  }

  _endGame() {
    this.state = SHITHEAD_STATE.GAME_OVER;
    this._broadcastGameState();
    this._broadcast({
      type: 'SHITHEAD_GAME_OVER',
      finishOrder: this.finishOrder,
      shithead: this.finishOrder[this.finishOrder.length - 1],
    });
  }

  restart() {
    this._reset();
    this._broadcast({ type: 'SHITHEAD_RESTARTED' });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  _findUsername(ws) {
    for (const [u, p] of this.players.entries()) {
      if (p.ws === ws) return u;
    }
    return null;
  }

  _findCardSource(player, cardIds) {
    if (player.hand.length > 0) {
      if (cardIds.every(id => player.hand.some(c => c.id === id))) return player.hand;
      return null;
    }
    if (player.faceUp.length > 0) {
      if (cardIds.every(id => player.faceUp.some(c => c.id === id))) return player.faceUp;
      return null;
    }
    return null; // face-down cards go through playFaceDown
  }

  _buildPublicState() {
    return {
      type: 'SHITHEAD_GAME_STATE',
      state: this.state,
      pileTop:      this.pile.length > 0 ? this.pile[this.pile.length - 1] : null,
      pileSize:     this.pile.length,
      deckSize:     this.deck.length,
      currentPlayer: this.playerOrder[this.currentPlayerIndex] || null,
      sevenActive:  this.sevenActive,
      players: this.playerOrder.map(u => {
        const p = this.players.get(u);
        return {
          username:      u,
          handCount:     p.hand.length,
          faceUp:        p.faceUp,
          faceDownCount: p.faceDown.length,
          hasFinished:   p.hasFinished,
          isShithead:    p.isShithead,
        };
      }),
      finishOrder: this.finishOrder,
    };
  }

  _broadcastGameState() {
    this._broadcast(this._buildPublicState());
  }

  _sendPlayerState(ws, username) {
    if (!ws || ws.readyState !== 1) return;
    const p = this.players.get(username);
    ws.send(JSON.stringify({
      type:          'SHITHEAD_YOUR_STATE',
      hand:          p.hand,
      faceUp:        p.faceUp,
      // Send face-down card IDs only (no rank/suit — they stay hidden)
      faceDownIds:   p.faceDown.map(c => c.id),
      faceDownCount: p.faceDown.length,
    }));
  }

  _sendAllPlayerStates() {
    for (const [username, p] of this.players.entries()) {
      this._sendPlayerState(p.ws, username);
    }
  }

  _broadcastCurrentTurn() {
    const cur = this.playerOrder[this.currentPlayerIndex];
    this._broadcast({
      type:             'SHITHEAD_YOUR_TURN',
      currentPlayer:    cur,
      sevenActive:      this.sevenActive,
      pileTop:          this.pile.length > 0 ? this.pile[this.pile.length - 1] : null,
      effectiveTopRank: effectiveTopRank(this.pile),
    });
  }

  _resyncPlayer(ws, username) {
    const send = (msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
    send(this._buildPublicState());
    this._sendPlayerState(ws, username);
    if (this.state === SHITHEAD_STATE.PLAYING) {
      send({
        type: 'SHITHEAD_YOUR_TURN',
        currentPlayer: this.playerOrder[this.currentPlayerIndex],
        sevenActive: this.sevenActive,
        pileTop: this.pile.length > 0 ? this.pile[this.pile.length - 1] : null,
        effectiveTopRank: effectiveTopRank(this.pile),
      });
    }
  }

  get playerCount() { return this.players.size; }
}

module.exports = { ShitheadGame, SHITHEAD_STATE, canPlay, effectiveTopRank, RANK_NAMES };
