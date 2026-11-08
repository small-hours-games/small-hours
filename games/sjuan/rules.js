// Small Hours - Sjuan (the 7-card game) party game
// Players try to get rid of their cards. A card may be played on a suit's
// stack if it is exactly one rank below or above the current top of that
// suit's stack (each suit starts at 7). First player out of cards wins.
//
// Engine pattern: { setup, actions, view, endIf }.

const SUITS = ['h', 'd', 'c', 's'];
const SUIT_SYMBOL = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_NAME = { h: 'Hjärter', d: 'Ruter', c: 'Klöver', s: 'Spader' };
const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function rankLabel(rank) { return RANK_LABEL[rank] || String(rank); }

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${rank}${suit}`, suit, rank });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardView(card) {
  if (!card) return null;
  return { id: card.id, suit: card.suit, rank: card.rank, label: rankLabel(card.rank), symbol: SUIT_SYMBOL[card.suit] };
}

// Each suit stack starts at 7 (special: can build both up and down from 7).
function initialStacks() {
  const stacks = {};
  for (const suit of SUITS) stacks[suit] = 7;
  return stacks;
}

// Can the given player legally play any card from their hand?
function canPlayAny(state, playerId) {
  const hand = state.hands[playerId] || [];
  return hand.some(c => state.stacks[c.suit] === c.rank + 1 || state.stacks[c.suit] === c.rank - 1);
}

// If the deck is empty and the current player cannot play, the game is stuck:
// finish it, winner = fewest cards (tie -> current player).
function maybeFinishStuck(state) {
  if (state.deck.length > 0) return null;
  if (canPlayAny(state, state.turn)) return null;
  // Count cards; lowest wins.
  const ranked = state.players
    .map(p => ({ p, n: (state.hands[p] || []).length }))
    .sort((a, b) => a.n - b.n);
  return { ...state, phase: 'finished', winner: ranked[0].p, lastResult: { stuck: true, winner: ranked[0].p } };
}

const sjuan = {
  setup({ players, config }) {
    const handSize = (config && config.handSize) || 7;
    const deck = shuffle(makeDeck());
    const hands = {};
    const order = [];
    for (const id of players) {
      hands[id] = [];
      order.push(id);
    }
    // Deal handSize to each (cap at available cards).
    let dealt = 0;
    while (dealt < handSize * players.length && deck.length > 0) {
      for (const id of players) {
        if (deck.length === 0) break;
        hands[id].push(deck.pop());
        dealt++;
      }
    }
    return {
      phase: 'play',
      players: [...players],
      order,
      deck,
      hands,
      stacks: initialStacks(),
      turn: order[0],
      round: 1,
      lastPlay: null,        // { playerId, card }
      lastResult: null,
      winner: null,
    };
  },

  actions: {
    // Play a card from hand onto its suit stack.
    playCard(state, { playerId, cardId }) {
      if (state.phase !== 'play') return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      const hand = state.hands[playerId] || [];
      const idx = hand.findIndex(c => c.id === cardId);
      if (idx === -1) return { state, events: [{ type: 'error', playerId, message: 'Card not in hand' }] };
      const card = hand[idx];
      const top = state.stacks[card.suit];
      if (card.rank !== top - 1 && card.rank !== top + 1) {
        return { state, events: [{ type: 'error', playerId, message: `Must play ${top - 1} or ${top + 1} in ${SUIT_NAME[card.suit]}` }] };
      }

      const hands = { ...state.hands, [playerId]: hand.filter(c => c.id !== cardId) };
      const stacks = { ...state.stacks, [card.suit]: card.rank };

      // Out of cards?
      if (hands[playerId].length === 0) {
        return { state: { ...state, hands, stacks, lastPlay: { playerId, card }, lastResult: { playerId, card, out: true }, phase: 'finished', winner: playerId }, events: [{ type: 'played', playerId, card }] };
      }

      // Next player's turn.
      const idxTurn = state.order.indexOf(playerId);
      const nextTurn = state.order[(idxTurn + 1) % state.order.length];
      return { state: { ...state, hands, stacks, turn: nextTurn, round: state.round + 1, lastPlay: { playerId, card }, lastResult: { playerId, card, out: false } }, events: [{ type: 'played', playerId, card }] };
    },

    // Draw a card if you can't (or don't want to) play.
    draw(state, { playerId }) {
      if (state.phase !== 'play') return { state };
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      if (state.deck.length === 0) {
        // No cards to draw: if stuck (can't play either), finish the game.
        const stuck = maybeFinishStuck(state);
        if (stuck) return { state: stuck, events: [{ type: 'stuck', playerId }] };
        // Otherwise just pass the turn.
        const idxTurn = state.order.indexOf(playerId);
        const nextTurn = state.order[(idxTurn + 1) % state.order.length];
        return { state: { ...state, turn: nextTurn, round: state.round + 1 }, events: [{ type: 'passed', playerId }] };
      }
      const card = state.deck.pop();
      const hands = { ...state.hands, [playerId]: [...state.hands[playerId], card] };
      const idxTurn = state.order.indexOf(playerId);
      const nextTurn = state.order[(idxTurn + 1) % state.order.length];
      return { state: { ...state, hands, turn: nextTurn, round: state.round + 1, lastResult: { playerId, drew: cardView(card) } }, events: [{ type: 'drew', playerId }] };
    },

    // Host skip (if a player is stuck).
    skip(state, { playerId }) {
      if (state.phase !== 'play') return { state };
      const idxTurn = state.order.indexOf(state.turn);
      const nextTurn = state.order[(idxTurn + 1) % state.order.length];
      return { state: { ...state, turn: nextTurn, round: state.round + 1 }, events: [{ type: 'skipped', playerId: state.turn }] };
    },
  },

  view(state, playerId) {
    const hand = (state.hands[playerId] || []).map(cardView);
    return {
      phase: state.phase,
      myHand: hand,
      myHandCount: hand.length,
      stacks: state.stacks,
      turn: state.turn,
      isMyTurn: playerId === state.turn,
      round: state.round,
      deckCount: state.deck.length,
      lastPlay: state.lastPlay ? { playerId: state.lastPlay.playerId, card: cardView(state.lastPlay.card) } : null,
      lastResult: state.lastResult,
      handCounts: Object.fromEntries(state.players.map(p => [p, (state.hands[p] || []).length])),
      winner: state.winner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return { winner: state.winner, scores: { [state.winner]: 1 } };
  },
};

export default sjuan;
