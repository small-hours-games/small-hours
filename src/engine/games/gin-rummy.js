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
