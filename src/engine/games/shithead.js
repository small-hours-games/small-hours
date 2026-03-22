// Shithead (Vandtia) card game for Small Hours game engine
// ESM, pure functions, immutable state

// --- Helper Functions ---

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createDeck(deckCount = 1) {
  const suits = ['h', 'd', 'c', 's'];
  const cards = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        cards.push({ id: `${rank}${suit}_${d}`, suit, rank });
      }
    }
  }
  return shuffleArray(cards);
}

function getTopRank(pile) {
  // Walk from top of pile backwards, skipping 3s (transparent)
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== 3) {
      return pile[i].rank;
    }
  }
  // Entire pile is 3s (or empty) — anything can be played
  return null;
}

function canPlayOnPile(cardRank, pile) {
  if (pile.length === 0) return true;
  if (cardRank === 2) return true; // wild/reset
  if (cardRank === 3) return true; // transparent, always playable
  if (cardRank === 10) return true; // 10 always burns
  const topRank = getTopRank(pile);
  if (topRank === null) return true;
  if (topRank === 7) {
    return cardRank <= 7;
  }
  return cardRank >= topRank;
}

function nextPlayerIndex(state) {
  const { players, currentPlayerIndex, finishOrder } = state;
  const count = players.length;
  let idx = currentPlayerIndex;
  for (let i = 0; i < count; i++) {
    idx = (idx + 1) % count;
    if (!finishOrder.includes(players[idx])) {
      return idx;
    }
  }
  // Should not happen if game isn't over
  return currentPlayerIndex;
}

function countTopMatching(pile) {
  if (pile.length === 0) return 0;
  const topRank = pile[pile.length - 1].rank;
  let count = 0;
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank === topRank) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function isPlayerOut(state, playerId) {
  return (
    (state.hands[playerId] || []).length === 0 &&
    (state.faceUp[playerId] || []).length === 0 &&
    (state.faceDown[playerId] || []).length === 0
  );
}

function checkBurnAndAdvance(state) {
  // Check for burn: 10 on top, or 4-of-a-kind on top
  let pile = [...state.pile];
  let burned = [...state.burned];
  let shouldBurn = false;

  if (pile.length > 0) {
    const topCard = pile[pile.length - 1];
    if (topCard.rank === 10) {
      shouldBurn = true;
    } else if (countTopMatching(pile) >= 4) {
      shouldBurn = true;
    }
  }

  if (shouldBurn) {
    burned = [...burned, ...pile];
    pile = [];
  }

  const currentPlayerId = state.players[state.currentPlayerIndex];

  // Draw cards to maintain 3 in hand (if draw pile has cards and player has fewer than 3)
  let hands = { ...state.hands };
  let drawPile = [...state.drawPile];
  const currentHand = [...(hands[currentPlayerId] || [])];
  while (currentHand.length < 3 && drawPile.length > 0) {
    currentHand.push(drawPile.shift());
  }
  hands = { ...hands, [currentPlayerId]: currentHand };

  // Check if current player is out
  let finishOrder = [...state.finishOrder];
  const tempState = { ...state, hands, faceUp: state.faceUp, faceDown: state.faceDown };
  if (isPlayerOut(tempState, currentPlayerId) && !finishOrder.includes(currentPlayerId)) {
    finishOrder = [...finishOrder, currentPlayerId];
  }

  // Count remaining players
  const remainingPlayers = state.players.filter(id => !finishOrder.includes(id));

  if (remainingPlayers.length <= 1) {
    return {
      ...state,
      pile,
      burned,
      drawPile,
      hands,
      finishOrder,
      phase: 'finished',
    };
  }

  // Advance turn: if burn, same player goes again; otherwise next player
  let newIndex = state.currentPlayerIndex;
  if (!shouldBurn) {
    newIndex = nextPlayerIndex({ ...state, finishOrder });
  } else {
    // Same player goes again, but if they are out, advance
    if (finishOrder.includes(currentPlayerId)) {
      newIndex = nextPlayerIndex({ ...state, finishOrder });
    }
  }

  return {
    ...state,
    pile,
    burned,
    drawPile,
    hands,
    finishOrder,
    currentPlayerIndex: newIndex,
  };
}

function getPlayableSource(state, playerId) {
  // Returns 'hands', 'faceUp', or 'faceDown' depending on what the player should play from
  if ((state.hands[playerId] || []).length > 0) return 'hands';
  if ((state.faceUp[playerId] || []).length > 0) return 'faceUp';
  if ((state.faceDown[playerId] || []).length > 0) return 'faceDown';
  return null;
}

// --- Game Definition ---

function setup({ players, config }) {
  if (players.length < 2) {
    throw new Error('Shithead requires at least 2 players');
  }

  const deckCount = (config && config.decks) || 1;
  const deck = createDeck(deckCount);
  let deckIndex = 0;

  const hands = {};
  const faceUp = {};
  const faceDown = {};
  const swapConfirmed = {};

  for (const playerId of players) {
    faceDown[playerId] = deck.slice(deckIndex, deckIndex + 3);
    deckIndex += 3;
    faceUp[playerId] = deck.slice(deckIndex, deckIndex + 3);
    deckIndex += 3;
    hands[playerId] = deck.slice(deckIndex, deckIndex + 3);
    deckIndex += 3;
    swapConfirmed[playerId] = false;
  }

  const drawPile = deck.slice(deckIndex);

  return {
    phase: 'swap',
    players: [...players],
    deckCount,
    hands,
    faceUp,
    faceDown,
    drawPile,
    pile: [],
    burned: [],
    currentPlayerIndex: 0,
    swapConfirmed,
    finishOrder: [],
    lastPlayedBy: null,
    lastPlayedCards: [],
  };
}

function swapCard(state, { playerId, handCardId, faceUpCardId }) {
  if (state.phase !== 'swap') {
    throw new Error('Can only swap cards during swap phase');
  }
  if (state.swapConfirmed[playerId]) {
    throw new Error('Player has already confirmed swap');
  }

  const hand = state.hands[playerId] || [];
  const faceUpCards = state.faceUp[playerId] || [];

  const handIdx = hand.findIndex(c => c.id === handCardId);
  const faceUpIdx = faceUpCards.findIndex(c => c.id === faceUpCardId);

  if (handIdx === -1) throw new Error('Card not found in hand');
  if (faceUpIdx === -1) throw new Error('Card not found in face-up cards');

  const newHand = [...hand];
  const newFaceUp = [...faceUpCards];

  // Swap
  const temp = newHand[handIdx];
  newHand[handIdx] = newFaceUp[faceUpIdx];
  newFaceUp[faceUpIdx] = temp;

  return {
    ...state,
    hands: { ...state.hands, [playerId]: newHand },
    faceUp: { ...state.faceUp, [playerId]: newFaceUp },
  };
}

function confirmSwap(state, { playerId }) {
  if (state.phase !== 'swap') {
    throw new Error('Can only confirm swap during swap phase');
  }
  if (state.swapConfirmed[playerId]) {
    throw new Error('Player has already confirmed swap');
  }

  const newConfirmed = { ...state.swapConfirmed, [playerId]: true };
  const allConfirmed = state.players.every(id => newConfirmed[id]);

  return {
    ...state,
    swapConfirmed: newConfirmed,
    phase: allConfirmed ? 'play' : 'swap',
  };
}

function playCards(state, { playerId, cardIds }) {
  if (state.phase !== 'play') {
    throw new Error('Can only play cards during play phase');
  }
  if (state.players[state.currentPlayerIndex] !== playerId) {
    throw new Error('Not your turn');
  }
  if (!cardIds || cardIds.length === 0) {
    throw new Error('Must play at least one card');
  }

  const source = getPlayableSource(state, playerId);
  if (source === 'faceDown') {
    throw new Error('Must use playFaceDown action when playing face-down cards');
  }
  if (source === null) {
    throw new Error('Player has no cards to play');
  }

  const sourceCards = state[source][playerId] || [];
  const cards = cardIds.map(id => {
    const card = sourceCards.find(c => c.id === id);
    if (!card) throw new Error(`Card ${id} not found in ${source}`);
    return card;
  });

  // All cards must be same rank
  const rank = cards[0].rank;
  if (!cards.every(c => c.rank === rank)) {
    throw new Error('All played cards must be the same rank');
  }

  // Must be playable on pile
  if (!canPlayOnPile(rank, state.pile)) {
    throw new Error('Cannot play that rank on the current pile');
  }

  // Remove cards from source
  const newSourceCards = sourceCards.filter(c => !cardIds.includes(c.id));
  const newPile = [...state.pile, ...cards];

  const newState = {
    ...state,
    [source]: { ...state[source], [playerId]: newSourceCards },
    pile: newPile,
    lastPlayedBy: playerId,
    lastPlayedCards: cards,
  };

  return checkBurnAndAdvance(newState);
}

function playFaceDown(state, { playerId, cardId }) {
  if (state.phase !== 'play') {
    throw new Error('Can only play cards during play phase');
  }
  if (state.players[state.currentPlayerIndex] !== playerId) {
    throw new Error('Not your turn');
  }

  const hand = state.hands[playerId] || [];
  const faceUpCards = state.faceUp[playerId] || [];
  const faceDownCards = state.faceDown[playerId] || [];

  if (hand.length > 0) {
    throw new Error('Must play hand cards first');
  }
  if (faceUpCards.length > 0) {
    throw new Error('Must play face-up cards first');
  }

  const cardIdx = faceDownCards.findIndex(c => c.id === cardId);
  if (cardIdx === -1) {
    throw new Error('Card not found in face-down cards');
  }

  const card = faceDownCards[cardIdx];
  const newFaceDown = faceDownCards.filter(c => c.id !== cardId);

  if (canPlayOnPile(card.rank, state.pile)) {
    // Valid play — treat like normal
    const newPile = [...state.pile, card];
    const newState = {
      ...state,
      faceDown: { ...state.faceDown, [playerId]: newFaceDown },
      pile: newPile,
      lastPlayedBy: playerId,
      lastPlayedCards: [card],
    };
    return checkBurnAndAdvance(newState);
  } else {
    // Invalid — player picks up entire pile plus the attempted card
    const newHand = [...state.pile, card];
    const advancedIndex = nextPlayerIndex({
      ...state,
      finishOrder: state.finishOrder,
    });
    return {
      ...state,
      faceDown: { ...state.faceDown, [playerId]: newFaceDown },
      hands: { ...state.hands, [playerId]: newHand },
      pile: [],
      lastPlayedBy: playerId,
      lastPlayedCards: [card],
      currentPlayerIndex: advancedIndex,
    };
  }
}

function pickUpPile(state, { playerId }) {
  if (state.phase !== 'play') {
    throw new Error('Can only pick up pile during play phase');
  }
  if (state.players[state.currentPlayerIndex] !== playerId) {
    throw new Error('Not your turn');
  }

  const hand = state.hands[playerId] || [];
  const newHand = [...hand, ...state.pile];
  const advancedIndex = nextPlayerIndex(state);

  return {
    ...state,
    hands: { ...state.hands, [playerId]: newHand },
    pile: [],
    lastPlayedBy: null,
    lastPlayedCards: [],
    currentPlayerIndex: advancedIndex,
  };
}

function view(state, playerId) {
  const pileTop = state.pile.length > 0 ? state.pile[state.pile.length - 1] : null;

  return {
    phase: state.phase,
    currentPlayer: state.players[state.currentPlayerIndex],
    myHand: state.hands[playerId] || [],
    myFaceUp: state.faceUp[playerId] || [],
    myFaceDownCount: (state.faceDown[playerId] || []).length,
    myFaceDownIds: (state.faceDown[playerId] || []).map(c => c.id),
    pileTop,
    pileCount: state.pile.length,
    drawPileCount: state.drawPile.length,
    players: state.players.map(id => ({
      playerId: id,
      handCount: (state.hands[id] || []).length,
      faceUp: state.faceUp[id] || [],
      faceDownCount: (state.faceDown[id] || []).length,
      isOut: state.finishOrder.includes(id),
    })),
    finishOrder: state.finishOrder,
    isMyTurn: state.players[state.currentPlayerIndex] === playerId,
    swapConfirmed: state.phase === 'swap' ? state.swapConfirmed : undefined,
    deckCount: state.deckCount,
  };
}

function endIf(state) {
  if (state.phase !== 'finished') return null;

  const remaining = state.players.filter(id => !state.finishOrder.includes(id));
  const loser = remaining[0];
  const winner = state.finishOrder[0];

  // Position-based scores: first out gets highest, shithead gets 0
  const scores = {};
  state.finishOrder.forEach((id, i) => {
    scores[id] = state.players.length - i;
  });
  if (loser) {
    scores[loser] = 0;
  }

  return {
    winner,
    loser,
    scores,
  };
}

// Wrap raw state-returning functions into {state, events} format expected by engine
function wrapAction(fn) {
  return (state, payload) => {
    try {
      const newState = fn(state, payload);
      return { state: newState, events: [] };
    } catch (err) {
      return { state, events: [{ type: 'error', playerId: payload.playerId, message: err.message }] };
    }
  };
}

export default {
  setup,
  actions: {
    swapCard: wrapAction(swapCard),
    confirmSwap: wrapAction(confirmSwap),
    playCards: wrapAction(playCards),
    playFaceDown: wrapAction(playFaceDown),
    pickUpPile: wrapAction(pickUpPile),
  },
  view,
  endIf,
};
