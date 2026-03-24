// Gin Rummy card game for Small Hours game engine
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

// Create a standard 52-card gin rummy deck (Ace=1, King=13)
function createGinDeck() {
  const suits = ['h', 'd', 'c', 's'];
  const cards = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      cards.push({ id: `${rank}${suit}_0`, suit, rank });
    }
  }
  return shuffleArray(cards);
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

// --- Core Utility Functions ---

/**
 * Returns the deadwood point value of a card.
 * Ace=1, 2-10=face value, Jack/Queen/King=10
 */
function cardValue(card) {
  if (card.rank >= 11) return 10;
  return card.rank;
}

/**
 * Sum of cardValue for each card in the array.
 */
function calcDeadwoodValue(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

/**
 * Find all valid melds in a hand.
 * Returns array of { type: 'set'|'run', cards: [...] }
 *
 * Sets: 3 or 4 cards of same rank (different suits)
 *   - 4-card group also yields all 4 three-card subsets
 * Runs: 3+ consecutive ranks of same suit (Ace is always low: A=1, never wraps K-A-2)
 *   - Yields all sub-runs of length >= 3
 */
function findAllMelds(hand) {
  const melds = [];

  // --- Sets ---
  const byRank = {};
  for (const card of hand) {
    if (!byRank[card.rank]) byRank[card.rank] = [];
    byRank[card.rank].push(card);
  }
  for (const rank in byRank) {
    const group = byRank[rank];
    if (group.length === 4) {
      // The full 4-card set
      melds.push({ type: 'set', cards: [...group] });
      // All 4 three-card subsets
      for (let i = 0; i < 4; i++) {
        melds.push({ type: 'set', cards: group.filter((_, idx) => idx !== i) });
      }
    } else if (group.length === 3) {
      melds.push({ type: 'set', cards: [...group] });
    }
    // group.length < 3: not enough for a set
  }

  // --- Runs ---
  const bySuit = {};
  for (const card of hand) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(card);
  }
  for (const suit in bySuit) {
    const suitCards = bySuit[suit].slice().sort((a, b) => a.rank - b.rank);
    // Find maximal consecutive sequences
    let seqStart = 0;
    while (seqStart < suitCards.length) {
      let seqEnd = seqStart;
      while (
        seqEnd + 1 < suitCards.length &&
        suitCards[seqEnd + 1].rank === suitCards[seqEnd].rank + 1
      ) {
        seqEnd++;
      }
      const seqLen = seqEnd - seqStart + 1;
      if (seqLen >= 3) {
        // Emit all sub-runs of length >= 3
        for (let start = seqStart; start <= seqEnd; start++) {
          for (let end = start + 2; end <= seqEnd; end++) {
            melds.push({
              type: 'run',
              cards: suitCards.slice(start, end + 1),
            });
          }
        }
      }
      seqStart = seqEnd + 1;
    }
  }

  return melds;
}

/**
 * Find the optimal meld arrangement that minimizes deadwood value.
 * Uses recursive exhaustive search (not greedy).
 *
 * Returns { melds: [...], deadwood: [...], deadwoodValue: N }
 */
function findOptimalMelds(hand) {
  const allMelds = findAllMelds(hand);

  let best = {
    melds: [],
    deadwood: [...hand],
    deadwoodValue: calcDeadwoodValue(hand),
  };

  function search(meldIndex, usedCardIds, currentMelds, remainingCards) {
    // Update best if current arrangement is better
    const dw = calcDeadwoodValue(remainingCards);
    if (dw < best.deadwoodValue) {
      best = {
        melds: [...currentMelds],
        deadwood: [...remainingCards],
        deadwoodValue: dw,
      };
    }

    // Try each remaining meld
    for (let i = meldIndex; i < allMelds.length; i++) {
      const meld = allMelds[i];
      // Check all meld cards are still available
      const meldCardIds = meld.cards.map(c => c.id);
      if (meldCardIds.every(id => !usedCardIds.has(id))) {
        const newUsed = new Set(usedCardIds);
        meldCardIds.forEach(id => newUsed.add(id));
        const newRemaining = remainingCards.filter(c => !newUsed.has(c.id));
        search(i + 1, newUsed, [...currentMelds, meld], newRemaining);
      }
    }
  }

  search(0, new Set(), [], [...hand]);
  return best;
}

/**
 * Find all valid layoffs: opponent deadwood cards that can extend knocker melds.
 * - Set with 3 cards: can add 4th of same rank
 * - Run: can extend at either end (same suit, rank = min-1 or max+1)
 *
 * Returns array of { card, meldIndex }
 */
function findLayoffs(opponentDeadwood, knockerMelds) {
  const layoffs = [];

  for (const card of opponentDeadwood) {
    for (let i = 0; i < knockerMelds.length; i++) {
      const meld = knockerMelds[i];

      if (meld.type === 'set') {
        // Can extend if set has exactly 3 cards and card matches rank
        if (meld.cards.length === 3 && card.rank === meld.cards[0].rank) {
          layoffs.push({ card, meldIndex: i });
        }
      } else if (meld.type === 'run') {
        const ranks = meld.cards.map(c => c.rank);
        const minRank = Math.min(...ranks);
        const maxRank = Math.max(...ranks);
        const suit = meld.cards[0].suit;
        // Same suit and extends at either end
        if (card.suit === suit && (card.rank === minRank - 1 || card.rank === maxRank + 1)) {
          layoffs.push({ card, meldIndex: i });
        }
      }
    }
  }

  return layoffs;
}

/**
 * Apply all valid layoffs greedily (always beneficial).
 * Repeats until no more layoffs are possible (chained layoffs).
 *
 * Returns { remainingDeadwood: [...], updatedMelds: [...] }
 */
function applyLayoffs(opponentDeadwood, knockerMelds) {
  let remainingDeadwood = [...opponentDeadwood];
  let updatedMelds = knockerMelds.map(m => ({ ...m, cards: [...m.cards] }));

  let changed = true;
  while (changed) {
    changed = false;
    const layoffs = findLayoffs(remainingDeadwood, updatedMelds);
    if (layoffs.length > 0) {
      changed = true;
      // Apply all layoffs found in this round
      const appliedCardIds = new Set();
      for (const { card, meldIndex } of layoffs) {
        if (!appliedCardIds.has(card.id)) {
          appliedCardIds.add(card.id);
          updatedMelds[meldIndex] = {
            ...updatedMelds[meldIndex],
            cards: [...updatedMelds[meldIndex].cards, card],
          };
        }
      }
      remainingDeadwood = remainingDeadwood.filter(c => !appliedCardIds.has(c.id));
    }
  }

  return { remainingDeadwood, updatedMelds };
}

/**
 * Score a hand after knock/gin.
 *
 * ginType: null (knock), 'gin', or 'bigGin'
 * Returns { winner, points, type }
 */
function scoreHand(knockerId, opponentId, knockerDeadwoodValue, opponentDeadwoodValue, ginType) {
  if (ginType === 'gin') {
    return {
      winner: knockerId,
      points: opponentDeadwoodValue + 20,
      type: 'gin',
    };
  }
  if (ginType === 'bigGin') {
    return {
      winner: knockerId,
      points: opponentDeadwoodValue + 31,
      type: 'bigGin',
    };
  }
  // Normal knock or undercut
  if (knockerDeadwoodValue < opponentDeadwoodValue) {
    return {
      winner: knockerId,
      points: opponentDeadwoodValue - knockerDeadwoodValue,
      type: 'knock',
    };
  }
  // Undercut: knocker >= opponent deadwood
  return {
    winner: opponentId,
    points: knockerDeadwoodValue - opponentDeadwoodValue + 10,
    type: 'undercut',
  };
}

// ============================================================
// GAME DEFINITION
// ============================================================

/**
 * Deal a new hand from the given game state.
 * Increments handNumber, creates a fresh deck, deals 10 to each player,
 * places 1 upcard on discard, rest in stock.
 * Sets phase to 'first_turn', non-dealer acts first.
 */
function dealNewHand(state) {
  const deck = createGinDeck();
  const [p1, p2] = state.players;
  const hands = {
    [p1]: deck.slice(0, 10),
    [p2]: deck.slice(10, 20),
  };
  const discard = [deck[20]];
  const stock = deck.slice(21);
  const handNumber = state.handNumber + 1;
  const dealerIndex = state.dealerIndex;
  const currentPlayerIndex = 1 - dealerIndex; // non-dealer goes first

  return {
    ...state,
    phase: 'first_turn',
    hands,
    stock,
    discard,
    knocker: null,
    knockerMelds: null,
    knockerDeadwood: null,
    opponentMelds: null,
    opponentDeadwood: null,
    ginType: null,
    lastDrawFrom: null,
    lastDrawnCardId: null,
    handResult: null,
    handNumber,
    dealerIndex,
    currentPlayerIndex,
    turnPhase: 'draw',
    upcardDeclined: [],
    events: [],
  };
}

/**
 * setup({ players, config }) — initialize game state
 */
function setup({ players, config = {} }) {
  if (players.length !== 2) {
    throw new Error('Gin Rummy requires exactly 2 players');
  }
  const [p1, p2] = players;
  const targetScore = config.targetScore || 100;
  const bigGinBonus = config.bigGinBonus || 31;

  const initialState = {
    phase: 'first_turn',
    players,
    dealerIndex: 0,
    currentPlayerIndex: 1,
    hands: { [p1]: [], [p2]: [] },
    stock: [],
    discard: [],
    knocker: null,
    knockerMelds: null,
    knockerDeadwood: null,
    opponentMelds: null,
    opponentDeadwood: null,
    ginType: null,
    lastDrawFrom: null,
    lastDrawnCardId: null,
    handResult: null,
    handNumber: 0,
    cumulative: { [p1]: 0, [p2]: 0 },
    boxes: { [p1]: 0, [p2]: 0 },
    winner: null,
    finalScores: null,
    turnPhase: 'draw',
    upcardDeclined: [],
    events: [],
    config: { targetScore, bigGinBonus },
  };

  return dealNewHand(initialState);
}

// --- Action: takeUpcard ---

function takeUpcard(state, { playerId }) {
  if (state.phase !== 'first_turn') {
    throw new Error('takeUpcard only valid in first_turn phase');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (playerId !== currentPlayer) {
    throw new Error('Not your turn');
  }

  // Take the upcard (top of discard) into hand
  const upcard = state.discard[state.discard.length - 1];
  const newDiscard = state.discard.slice(0, -1);
  const newHand = [...state.hands[playerId], upcard];

  return {
    ...state,
    phase: 'drawing',
    hands: {
      ...state.hands,
      [playerId]: newHand,
    },
    discard: newDiscard,
    turnPhase: 'discard',
    lastDrawFrom: 'discard',
    lastDrawnCardId: upcard.id,
    events: [...state.events, { type: 'takeUpcard', playerId }],
  };
}

// --- Action: declineUpcard ---

function declineUpcard(state, { playerId }) {
  if (state.phase !== 'first_turn') {
    throw new Error('declineUpcard only valid in first_turn phase');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (playerId !== currentPlayer) {
    throw new Error('Not your turn');
  }

  const newDeclined = [...state.upcardDeclined, playerId];

  // If both players declined, non-dealer draws from stock to start normal play
  if (newDeclined.length === 2) {
    // Both declined — non-dealer (opposite of dealer) now draws from stock
    const nonDealerIndex = 1 - state.dealerIndex;
    const nonDealer = state.players[nonDealerIndex];
    return {
      ...state,
      upcardDeclined: newDeclined,
      currentPlayerIndex: nonDealerIndex,
      // Stay in first_turn but allow draw action for non-dealer from stock
      // We transition to drawing phase where the non-dealer must draw from stock
      phase: 'first_turn_draw', // special sub-phase: non-dealer must draw from stock
      events: [...state.events, { type: 'declineUpcard', playerId }],
    };
  }

  // First player declined (non-dealer) — switch to dealer
  const dealerIndex = state.dealerIndex;
  return {
    ...state,
    upcardDeclined: newDeclined,
    currentPlayerIndex: dealerIndex,
    events: [...state.events, { type: 'declineUpcard', playerId }],
  };
}

// --- Action: draw ---

function draw(state, { playerId, source }) {
  const validPhases = ['drawing', 'first_turn_draw'];
  if (!validPhases.includes(state.phase)) {
    throw new Error('draw only valid in drawing phase');
  }
  if (state.turnPhase !== 'draw') {
    throw new Error('Already drew this turn, must discard');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (playerId !== currentPlayer) {
    throw new Error('Not your turn');
  }
  if (source !== 'stock' && source !== 'discard') {
    throw new Error('source must be stock or discard');
  }

  let drawnCard;
  let newStock = [...state.stock];
  let newDiscard = [...state.discard];
  let lastDrawnCardId = null;

  if (source === 'stock') {
    if (newStock.length === 0) {
      throw new Error('Stock is empty');
    }
    drawnCard = newStock.pop();
  } else {
    // draw from discard
    if (newDiscard.length === 0) {
      throw new Error('Discard pile is empty');
    }
    drawnCard = newDiscard.pop();
    lastDrawnCardId = drawnCard.id;
  }

  const newHand = [...state.hands[playerId], drawnCard];

  const newState = {
    ...state,
    phase: 'drawing',
    hands: {
      ...state.hands,
      [playerId]: newHand,
    },
    stock: newStock,
    discard: newDiscard,
    turnPhase: 'discard',
    lastDrawFrom: source,
    lastDrawnCardId,
    events: [...state.events, { type: 'draw', playerId, source }],
  };

  // Stock exhaustion check: if stock <= 2 after drawing from stock, cancel hand
  if (source === 'stock' && newStock.length <= 2) {
    return {
      ...newState,
      phase: 'scoring',
      handResult: { type: 'cancelled' },
    };
  }

  return newState;
}

// --- Action: discard ---

function discard(state, { playerId, cardId }) {
  if (state.phase !== 'drawing') {
    throw new Error('discard only valid in drawing phase');
  }
  if (state.turnPhase !== 'discard') {
    throw new Error('Must draw before discarding');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (playerId !== currentPlayer) {
    throw new Error('Not your turn');
  }

  const hand = state.hands[playerId];
  const cardIndex = hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error('Card not in hand');
  }

  // Cannot discard the same card drawn from the discard pile
  if (state.lastDrawFrom === 'discard' && cardId === state.lastDrawnCardId) {
    throw new Error('Cannot discard the card you just drew from the discard pile');
  }

  const card = hand[cardIndex];
  const newHand = hand.filter((_, i) => i !== cardIndex);
  const newDiscard = [...state.discard, card];

  // Advance to next player
  const nextPlayerIndex = 1 - state.currentPlayerIndex;

  const newState = {
    ...state,
    hands: {
      ...state.hands,
      [playerId]: newHand,
    },
    discard: newDiscard,
    currentPlayerIndex: nextPlayerIndex,
    turnPhase: 'draw',
    lastDrawFrom: null,
    lastDrawnCardId: null,
    events: [...state.events, { type: 'discard', playerId, cardId }],
  };

  // Stock exhaustion check after discard: if stock <= 2, cancel hand
  if (newState.stock.length <= 2) {
    return {
      ...newState,
      phase: 'scoring',
      handResult: { type: 'cancelled' },
    };
  }

  return newState;
}

// --- Action: knock ---

function knock(state, { playerId }) {
  if (state.phase !== 'drawing') {
    throw new Error('knock only valid in drawing phase');
  }
  if (state.turnPhase !== 'discard') {
    throw new Error('Must draw before knocking');
  }
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (playerId !== currentPlayer) {
    throw new Error('Not your turn');
  }

  const knockerHand = state.hands[playerId];
  const opponentId = state.players.find(id => id !== playerId);
  const opponentHand = state.hands[opponentId];

  // Auto-compute optimal melds for knocker
  const knockerResult = findOptimalMelds(knockerHand);
  const knockerDeadwoodValue = knockerResult.deadwoodValue;

  if (knockerDeadwoodValue > 10) {
    throw new Error(`Cannot knock: deadwood (${knockerDeadwoodValue}) exceeds 10`);
  }

  // Determine gin type
  let ginType = null;
  if (knockerDeadwoodValue === 0 && knockerHand.length === 10) {
    ginType = 'gin';
  } else if (knockerDeadwoodValue === 0 && knockerHand.length === 11) {
    ginType = 'bigGin';
  }

  // Auto-compute opponent melds
  const opponentResult = findOptimalMelds(opponentHand);
  let opponentMelds = opponentResult.melds;
  let opponentDeadwood = opponentResult.deadwood;

  // Auto-apply layoffs (per D-07) — not for gin
  if (ginType !== 'gin' && ginType !== 'bigGin') {
    const layoffResult = applyLayoffs(opponentDeadwood, knockerResult.melds);
    opponentMelds = layoffResult.updatedMelds;
    opponentDeadwood = layoffResult.remainingDeadwood;
  }

  const opponentDeadwoodValue = calcDeadwoodValue(opponentDeadwood);

  // Score the hand
  const handResult = scoreHand(
    playerId,
    opponentId,
    knockerDeadwoodValue,
    opponentDeadwoodValue,
    ginType
  );

  // Update cumulative scores and boxes
  const winner = handResult.winner;
  const newCumulative = {
    ...state.cumulative,
    [winner]: state.cumulative[winner] + handResult.points,
  };
  const newBoxes = {
    ...state.boxes,
    [winner]: state.boxes[winner] + 1,
  };

  return {
    ...state,
    phase: 'scoring',
    knocker: playerId,
    knockerMelds: knockerResult.melds,
    knockerDeadwood: knockerResult.deadwood,
    opponentMelds,
    opponentDeadwood,
    ginType,
    handResult,
    cumulative: newCumulative,
    boxes: newBoxes,
    events: [
      ...state.events,
      { type: 'knock', playerId, ginType },
      { type: 'hand_result', ...handResult },
    ],
  };
}

// --- Action: nextHand ---

function nextHand(state, { playerId }) {
  if (state.phase !== 'scoring') {
    throw new Error('nextHand only valid in scoring phase');
  }

  const [p1, p2] = state.players;
  const targetScore = state.config.targetScore;

  // Check if game is over
  const p1Won = state.cumulative[p1] >= targetScore;
  const p2Won = state.cumulative[p2] >= targetScore;

  if (p1Won || p2Won) {
    const gameWinner = p1Won ? p1 : p2;
    const gameLoser = p1Won ? p2 : p1;

    // Determine game bonus: 200 for shutout (loser scored 0), 100 normally
    const gameBonus = state.cumulative[gameLoser] === 0 ? 200 : 100;

    const finalScores = {
      [p1]: state.cumulative[p1] + state.boxes[p1] * 20 + (gameWinner === p1 ? gameBonus : 0),
      [p2]: state.cumulative[p2] + state.boxes[p2] * 20 + (gameWinner === p2 ? gameBonus : 0),
    };

    return {
      ...state,
      phase: 'finished',
      winner: gameWinner,
      finalScores,
    };
  }

  // Game continues: deal new hand
  // Previous hand winner becomes dealer
  const handWinner = state.handResult && state.handResult.winner;
  let newDealerIndex = state.dealerIndex;
  if (handWinner) {
    const winnerIndex = state.players.indexOf(handWinner);
    if (winnerIndex !== -1) {
      newDealerIndex = winnerIndex;
    }
  }

  const newState = {
    ...state,
    dealerIndex: newDealerIndex,
  };

  return dealNewHand(newState);
}

// --- view function ---

function view(state, playerId) {
  const opponentId = state.players.find(id => id !== playerId);
  const discardTop = state.discard.length > 0 ? state.discard[state.discard.length - 1] : null;
  const isMyTurn = state.players[state.currentPlayerIndex] === playerId;

  const base = {
    phase: state.phase,
    isMyTurn,
    handNumber: state.handNumber,
    cumulative: state.cumulative,
    boxes: state.boxes,
    stockCount: state.stock.length,
    discardTop,
    winner: state.winner,
    turnPhase: state.turnPhase,
    events: (state.events || []).slice(-10),
  };

  // Play phases: hide opponent cards
  const playPhases = ['first_turn', 'first_turn_draw', 'drawing'];
  if (playPhases.includes(state.phase)) {
    // canKnock only relevant during discard phase
    let canKnock = false;
    if (state.turnPhase === 'discard' && isMyTurn) {
      const myResult = findOptimalMelds(state.hands[playerId] || []);
      canKnock = myResult.deadwoodValue <= 10;
    }

    return {
      ...base,
      myHand: state.hands[playerId] || [],
      opponentCardCount: (state.hands[opponentId] || []).length,
      canKnock,
    };
  }

  // Scoring/finished phases: reveal both hands
  if (state.phase === 'scoring' || state.phase === 'finished') {
    return {
      ...base,
      myHand: state.hands[playerId] || [],
      opponentCardCount: (state.hands[opponentId] || []).length,
      knocker: state.knocker,
      knockerMelds: state.knockerMelds,
      knockerDeadwood: state.knockerDeadwood,
      opponentMelds: state.opponentMelds,
      opponentDeadwood: state.opponentDeadwood,
      handResult: state.handResult,
      finalScores: state.finalScores,
    };
  }

  return base;
}

// --- endIf ---

function endIf(state) {
  if (state.phase !== 'finished') return null;
  return {
    winner: state.winner,
    scores: state.finalScores || state.cumulative,
  };
}

// --- Default export (game definition) ---

export default {
  setup,
  actions: {
    takeUpcard: wrapAction(takeUpcard),
    declineUpcard: wrapAction(declineUpcard),
    draw: wrapAction(draw),
    discard: wrapAction(discard),
    knock: wrapAction(knock),
    nextHand: wrapAction(nextHand),
  },
  view,
  endIf,
};

// --- Named exports (utility functions from Plan 01) ---

export {
  cardValue,
  calcDeadwoodValue,
  findAllMelds,
  findOptimalMelds,
  findLayoffs,
  applyLayoffs,
  scoreHand,
  createGinDeck,
  shuffleArray,
  wrapAction,
};
