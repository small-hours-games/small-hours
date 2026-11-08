// Small Hours - Uno (simplified party version)
// Players take turns playing a card that matches the discard pile's color or
// number, or a wild. Action cards: +2 (next draws 2), reverse, skip, wild.
// First player to empty their hand wins.
//
// Engine pattern: { setup, actions, view, endIf }.

const COLORS = ['r', 'y', 'g', 'b'];
const COLOR_NAME = { r: 'Röd', y: 'Gul', g: 'Grön', b: 'Blå' };
const COLOR_HEX = { r: '#e63946', y: '#ffd166', g: '#2a9d8f', b: '#457b9d' };
const SYMBOL = { r: '🟥', y: '🟨', g: '🟩', b: '🟦' };

function makeDeck() {
  const deck = [];
  for (const c of COLORS) {
    // One 0, two of 1-9 per color.
    deck.push({ id: `0${c}`, color: c, kind: 'number', value: 0 });
    for (let v = 1; v <= 9; v++) {
      deck.push({ id: `${v}a${c}`, color: c, kind: 'number', value: v });
      deck.push({ id: `${v}b${c}`, color: c, kind: 'number', value: v });
    }
    // Two of each action per color.
    for (const kind of ['skip', 'reverse', 'draw2']) {
      deck.push({ id: `${kind}1${c}`, color: c, kind });
      deck.push({ id: `${kind}2${c}`, color: c, kind });
    }
  }
  // Four wilds.
  for (let i = 1; i <= 4; i++) deck.push({ id: `wild${i}`, color: null, kind: 'wild' });
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
  return { id: card.id, color: card.color, kind: card.kind, value: card.value || null, symbol: card.color ? SYMBOL[card.color] : '🌈' };
}

const uno = {
  setup({ players, config }) {
    const handSize = (config && config.handSize) || 7;
    const deck = shuffle(makeDeck());
    const hands = {};
    const order = [...players];
    for (const id of players) hands[id] = [];

    let dealt = 0;
    while (dealt < handSize * players.length && deck.length > 0) {
      for (const id of players) {
        if (deck.length === 0) break;
        hands[id].push(deck.pop());
        dealt++;
      }
    }
    // First discard: a number card.
    let first = deck.pop();
    while (first && first.kind !== 'number') { deck.unshift(first); first = deck.pop(); }
    const discard = first ? [first] : [];

    return {
      phase: 'play',
      players: [...players],
      order,
      deck,
      hands,
      discard,
      currentColor: first ? first.color : 'r',
      turn: order[0],
      direction: 1,
      round: 1,
      pendingDraw: 0,
      lastPlay: null,
      lastResult: null,
      winner: null,
    };
  },

  actions: {
    playCard(state, { playerId, cardId, chosenColor }) {
      if (state.phase !== 'play') return { state, events: [{ type: 'error', playerId, message: 'Not playing' }] };
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      const hand = state.hands[playerId] || [];
      const idx = hand.findIndex(c => c.id === cardId);
      if (idx === -1) return { state, events: [{ type: 'error', playerId, message: 'Card not in hand' }] };
      const card = hand[idx];

      const top = state.discard[state.discard.length - 1];
      const matches = card.color === state.currentColor ||
        (card.kind === 'number' && top && top.kind === 'number' && card.value === top.value) ||
        card.kind === 'wild';
      if (!matches) return { state, events: [{ type: 'error', playerId, message: 'Card does not match' }] };

      // Apply pending draw from a previous +2.
      if (state.pendingDraw > 0) {
        // (handled when turn begins via draw action; here just clear)
      }

      const hands = { ...state.hands, [playerId]: hand.filter(c => c.id !== cardId) };
      const discard = [...state.discard, card];

      if (hands[playerId].length === 0) {
        return { state: { ...state, hands, discard, lastPlay: { playerId, card }, lastResult: { playerId, card, out: true }, phase: 'finished', winner: playerId }, events: [{ type: 'played', playerId, card }] };
      }

      // Resolve action card effects on turn order.
      let turn = state.turn;
      let direction = state.direction;
      let currentColor = card.color || state.currentColor;
      let pendingDraw = 0;
      if (card.kind === 'reverse') direction = -direction;
      if (card.kind === 'skip') { /* skip next */ }
      if (card.kind === 'draw2') pendingDraw = 2;
      if (card.kind === 'wild') currentColor = chosenColor || state.currentColor;

      const nextIdx = (state.order.length + state.order.indexOf(turn) + direction) % state.order.length;
      let nextTurn = state.order[nextIdx];
      if (card.kind === 'skip') {
        const skipIdx = (state.order.length + state.order.indexOf(nextTurn) + direction) % state.order.length;
        nextTurn = state.order[skipIdx];
      }

      return {
        state: { ...state, hands, discard, currentColor, turn: nextTurn, direction, pendingDraw, round: state.round + 1, lastPlay: { playerId, card }, lastResult: { playerId, card, color: currentColor } },
        events: [{ type: 'played', playerId, card }],
      };
    },

    // Draw (forced by +2, or voluntary if stuck).
    draw(state, { playerId }) {
      if (state.phase !== 'play') return { state };
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      let { deck, hands, pendingDraw, turn, direction, round } = state;
      const drawCount = pendingDraw > 0 ? pendingDraw : 1;
      const drawn = [];
      for (let i = 0; i < drawCount && deck.length > 0; i++) drawn.push(deck.pop());
      hands = { ...hands, [playerId]: [...hands[playerId], ...drawn] };
      pendingDraw = 0;
      // Pass turn.
      const nextIdx = (state.order.length + state.order.indexOf(turn) + direction) % state.order.length;
      const nextTurn = state.order[nextIdx];
      return { state: { ...state, deck, hands, pendingDraw, turn: nextTurn, round: round + 1, lastResult: { playerId, drew: drawn.length } }, events: [{ type: 'drew', playerId, count: drawn.length }] };
    },
  },

  view(state, playerId) {
    return {
      phase: state.phase,
      myHand: (state.hands[playerId] || []).map(cardView),
      myHandCount: (state.hands[playerId] || []).length,
      topCard: cardView(state.discard[state.discard.length - 1]),
      currentColor: state.currentColor,
      turn: state.turn,
      isMyTurn: playerId === state.turn,
      direction: state.direction,
      round: state.round,
      deckCount: state.deck.length,
      pendingDraw: state.pendingDraw,
      handCounts: Object.fromEntries(state.players.map(p => [p, (state.hands[p] || []).length])),
      lastPlay: state.lastPlay ? { playerId: state.lastPlay.playerId, card: cardView(state.lastPlay.card) } : null,
      winner: state.winner,
      colors: COLORS,
      colorName: COLOR_NAME,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return { winner: state.winner, scores: { [state.winner]: 1 } };
  },
};

export default uno;
