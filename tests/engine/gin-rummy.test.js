import { describe, it, expect } from 'vitest';
import {
  cardValue,
  calcDeadwoodValue,
  createGinDeck,
  findAllMelds,
  findOptimalMelds,
  findLayoffs,
  applyLayoffs,
  scoreHand,
} from '../../src/engine/games/gin-rummy.js';

// --- cardValue ---

describe('cardValue', () => {
  it('returns 1 for Ace (rank 1)', () => {
    expect(cardValue({ rank: 1, suit: 'h' })).toBe(1);
  });

  it('returns face value for 2-10', () => {
    for (let r = 2; r <= 10; r++) {
      expect(cardValue({ rank: r, suit: 'h' })).toBe(r);
    }
  });

  it('returns 10 for Jack (rank 11)', () => {
    expect(cardValue({ rank: 11, suit: 'h' })).toBe(10);
  });

  it('returns 10 for Queen (rank 12)', () => {
    expect(cardValue({ rank: 12, suit: 'h' })).toBe(10);
  });

  it('returns 10 for King (rank 13)', () => {
    expect(cardValue({ rank: 13, suit: 'h' })).toBe(10);
  });
});

// --- createGinDeck ---

describe('createGinDeck', () => {
  it('returns 52 cards', () => {
    const deck = createGinDeck();
    expect(deck).toHaveLength(52);
  });

  it('Ace has rank 1 (not 14)', () => {
    const deck = createGinDeck();
    const aces = deck.filter(c => c.rank === 1);
    expect(aces).toHaveLength(4);
    const rank14 = deck.filter(c => c.rank === 14);
    expect(rank14).toHaveLength(0);
  });

  it('has all 4 suits', () => {
    const deck = createGinDeck();
    const suits = new Set(deck.map(c => c.suit));
    expect(suits.size).toBe(4);
    expect(suits.has('h')).toBe(true);
    expect(suits.has('d')).toBe(true);
    expect(suits.has('c')).toBe(true);
    expect(suits.has('s')).toBe(true);
  });

  it('has ranks 1-13', () => {
    const deck = createGinDeck();
    const ranks = new Set(deck.map(c => c.rank));
    for (let r = 1; r <= 13; r++) {
      expect(ranks.has(r)).toBe(true);
    }
    expect(ranks.has(14)).toBe(false);
  });

  it('card IDs use rank-suit format like 1h_0', () => {
    const deck = createGinDeck();
    const aceOfHearts = deck.find(c => c.rank === 1 && c.suit === 'h');
    expect(aceOfHearts).toBeDefined();
    expect(aceOfHearts.id).toBe('1h_0');
  });
});

// --- calcDeadwoodValue ---

describe('calcDeadwoodValue', () => {
  it('returns 0 for empty array', () => {
    expect(calcDeadwoodValue([])).toBe(0);
  });

  it('returns 11 for [Ace, King]', () => {
    expect(calcDeadwoodValue([
      { rank: 1, suit: 'h' },
      { rank: 13, suit: 'd' },
    ])).toBe(11);
  });

  it('returns 8 for [5h, 3d]', () => {
    expect(calcDeadwoodValue([
      { rank: 5, suit: 'h' },
      { rank: 3, suit: 'd' },
    ])).toBe(8);
  });

  it('face cards count as 10 each', () => {
    expect(calcDeadwoodValue([
      { rank: 11, suit: 'h' },
      { rank: 12, suit: 'd' },
      { rank: 13, suit: 's' },
    ])).toBe(30);
  });
});

// --- findAllMelds ---

describe('findAllMelds', () => {
  it('finds a 3-card set meld', () => {
    const hand = [
      { id: '7h_0', rank: 7, suit: 'h' },
      { id: '7d_0', rank: 7, suit: 'd' },
      { id: '7s_0', rank: 7, suit: 's' },
    ];
    const melds = findAllMelds(hand);
    const sets = melds.filter(m => m.type === 'set');
    expect(sets).toHaveLength(1);
    expect(sets[0].cards).toHaveLength(3);
  });

  it('finds a 4-card set plus all 4 three-card subsets', () => {
    const hand = [
      { id: '7h_0', rank: 7, suit: 'h' },
      { id: '7d_0', rank: 7, suit: 'd' },
      { id: '7s_0', rank: 7, suit: 's' },
      { id: '7c_0', rank: 7, suit: 'c' },
    ];
    const melds = findAllMelds(hand);
    const sets = melds.filter(m => m.type === 'set');
    // 1 four-card set + 4 three-card subsets = 5
    expect(sets).toHaveLength(5);
    const setOf4 = sets.find(m => m.cards.length === 4);
    expect(setOf4).toBeDefined();
    const setsOf3 = sets.filter(m => m.cards.length === 3);
    expect(setsOf3).toHaveLength(4);
  });

  it('finds a 3-card run meld', () => {
    const hand = [
      { id: '4c_0', rank: 4, suit: 'c' },
      { id: '5c_0', rank: 5, suit: 'c' },
      { id: '6c_0', rank: 6, suit: 'c' },
    ];
    const melds = findAllMelds(hand);
    const runs = melds.filter(m => m.type === 'run');
    expect(runs).toHaveLength(1);
    expect(runs[0].cards).toHaveLength(3);
  });

  it('finds all sub-runs for a 4-card sequence', () => {
    const hand = [
      { id: '4c_0', rank: 4, suit: 'c' },
      { id: '5c_0', rank: 5, suit: 'c' },
      { id: '6c_0', rank: 6, suit: 'c' },
      { id: '7c_0', rank: 7, suit: 'c' },
    ];
    const melds = findAllMelds(hand);
    const runs = melds.filter(m => m.type === 'run');
    // [4,5,6], [5,6,7], [4,5,6,7] = 3
    expect(runs).toHaveLength(3);
    const runLengths = runs.map(m => m.cards.length).sort();
    expect(runLengths).toEqual([3, 3, 4]);
  });

  it('A-2-3 of same suit is a valid run (Ace is low)', () => {
    const hand = [
      { id: '1s_0', rank: 1, suit: 's' },
      { id: '2s_0', rank: 2, suit: 's' },
      { id: '3s_0', rank: 3, suit: 's' },
    ];
    const melds = findAllMelds(hand);
    const runs = melds.filter(m => m.type === 'run');
    expect(runs).toHaveLength(1);
  });

  it('K-A-2 is NOT a valid run (Ace is always low)', () => {
    const hand = [
      { id: '13s_0', rank: 13, suit: 's' },
      { id: '1s_0', rank: 1, suit: 's' },
      { id: '2s_0', rank: 2, suit: 's' },
    ];
    const melds = findAllMelds(hand);
    const runs = melds.filter(m => m.type === 'run');
    expect(runs).toHaveLength(0);
  });

  it('returns empty array for no melds', () => {
    const hand = [
      { id: '1h_0', rank: 1, suit: 'h' },
      { id: '5d_0', rank: 5, suit: 'd' },
      { id: '9c_0', rank: 9, suit: 'c' },
    ];
    expect(findAllMelds(hand)).toHaveLength(0);
  });
});

// --- findOptimalMelds ---

describe('findOptimalMelds', () => {
  it('returns deadwoodValue 0 when all cards in melds', () => {
    // Three 7s form a set, four-card sequence
    const hand = [
      { id: '7h_0', rank: 7, suit: 'h' },
      { id: '7d_0', rank: 7, suit: 'd' },
      { id: '7s_0', rank: 7, suit: 's' },
      { id: '4c_0', rank: 4, suit: 'c' },
      { id: '5c_0', rank: 5, suit: 'c' },
      { id: '6c_0', rank: 6, suit: 'c' },
    ];
    const result = findOptimalMelds(hand);
    expect(result.deadwoodValue).toBe(0);
    expect(result.deadwood).toHaveLength(0);
    expect(result.melds).toHaveLength(2);
  });

  it('returns all cards as deadwood when no melds', () => {
    const hand = [
      { id: '1h_0', rank: 1, suit: 'h' },
      { id: '5d_0', rank: 5, suit: 'd' },
      { id: '9c_0', rank: 9, suit: 'c' },
    ];
    const result = findOptimalMelds(hand);
    expect(result.melds).toHaveLength(0);
    expect(result.deadwood).toHaveLength(3);
    expect(result.deadwoodValue).toBe(1 + 5 + 9);
  });

  it('greedy-buster: prefers 3 sets of 3 over 1 set of 4 + leftover', () => {
    // Cards: 7h,7d,7s,7c, 8h,8d,8s, 9h,9d,9s
    // Greedy might pick 4-card set of 7s first, then only one more set of 3 → 3 leftover
    // Optimal: 3-card set of 7s + set of 8s + set of 9s → 1 leftover (the 4th 7)
    const hand = [
      { id: '7h_0', rank: 7, suit: 'h' },
      { id: '7d_0', rank: 7, suit: 'd' },
      { id: '7s_0', rank: 7, suit: 's' },
      { id: '7c_0', rank: 7, suit: 'c' },
      { id: '8h_0', rank: 8, suit: 'h' },
      { id: '8d_0', rank: 8, suit: 'd' },
      { id: '8s_0', rank: 8, suit: 's' },
      { id: '9h_0', rank: 9, suit: 'h' },
      { id: '9d_0', rank: 9, suit: 'd' },
      { id: '9s_0', rank: 9, suit: 's' },
    ];
    const result = findOptimalMelds(hand);
    // Best possible: 3 sets of 3 = 9 cards in melds, 1 leftover (value 7)
    expect(result.deadwoodValue).toBe(7);
    expect(result.deadwood).toHaveLength(1);
    expect(result.melds).toHaveLength(3);
  });

  it('finds structure with result having melds, deadwood, deadwoodValue', () => {
    const hand = [
      { id: '5h_0', rank: 5, suit: 'h' },
      { id: '6h_0', rank: 6, suit: 'h' },
      { id: '7h_0', rank: 7, suit: 'h' },
      { id: 'Kd_0', rank: 13, suit: 'd' },
    ];
    const result = findOptimalMelds(hand);
    expect(result).toHaveProperty('melds');
    expect(result).toHaveProperty('deadwood');
    expect(result).toHaveProperty('deadwoodValue');
    expect(result.deadwoodValue).toBe(10); // King
    expect(result.melds).toHaveLength(1);
  });
});

// --- findLayoffs ---

describe('findLayoffs', () => {
  it('can lay off on a 3-card set (extend to 4)', () => {
    const knockerMelds = [
      { type: 'set', cards: [
        { id: '7h_0', rank: 7, suit: 'h' },
        { id: '7d_0', rank: 7, suit: 'd' },
        { id: '7s_0', rank: 7, suit: 's' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '7c_0', rank: 7, suit: 'c' },
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs).toHaveLength(1);
    expect(layoffs[0].card.rank).toBe(7);
    expect(layoffs[0].meldIndex).toBe(0);
  });

  it('cannot lay off on a 4-card set (already full)', () => {
    const knockerMelds = [
      { type: 'set', cards: [
        { id: '7h_0', rank: 7, suit: 'h' },
        { id: '7d_0', rank: 7, suit: 'd' },
        { id: '7s_0', rank: 7, suit: 's' },
        { id: '7c_0', rank: 7, suit: 'c' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '7c_1', rank: 7, suit: 'c' }, // same rank, different id (hypothetical)
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs).toHaveLength(0);
  });

  it('can lay off at lower end of run', () => {
    const knockerMelds = [
      { type: 'run', cards: [
        { id: '5c_0', rank: 5, suit: 'c' },
        { id: '6c_0', rank: 6, suit: 'c' },
        { id: '7c_0', rank: 7, suit: 'c' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '4c_0', rank: 4, suit: 'c' },
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs).toHaveLength(1);
    expect(layoffs[0].card.rank).toBe(4);
  });

  it('can lay off at upper end of run', () => {
    const knockerMelds = [
      { type: 'run', cards: [
        { id: '5c_0', rank: 5, suit: 'c' },
        { id: '6c_0', rank: 6, suit: 'c' },
        { id: '7c_0', rank: 7, suit: 'c' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '8c_0', rank: 8, suit: 'c' },
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs).toHaveLength(1);
    expect(layoffs[0].card.rank).toBe(8);
  });

  it('cannot lay off wrong suit on a run', () => {
    const knockerMelds = [
      { type: 'run', cards: [
        { id: '5c_0', rank: 5, suit: 'c' },
        { id: '6c_0', rank: 6, suit: 'c' },
        { id: '7c_0', rank: 7, suit: 'c' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '4h_0', rank: 4, suit: 'h' },
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs).toHaveLength(0);
  });

  it('returns array of { card, meldIndex } objects', () => {
    const knockerMelds = [
      { type: 'set', cards: [
        { id: '7h_0', rank: 7, suit: 'h' },
        { id: '7d_0', rank: 7, suit: 'd' },
        { id: '7s_0', rank: 7, suit: 's' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '7c_0', rank: 7, suit: 'c' },
    ];
    const layoffs = findLayoffs(opponentDeadwood, knockerMelds);
    expect(layoffs[0]).toHaveProperty('card');
    expect(layoffs[0]).toHaveProperty('meldIndex');
  });
});

// --- applyLayoffs ---

describe('applyLayoffs', () => {
  it('removes laid-off cards from deadwood', () => {
    const knockerMelds = [
      { type: 'set', cards: [
        { id: '7h_0', rank: 7, suit: 'h' },
        { id: '7d_0', rank: 7, suit: 'd' },
        { id: '7s_0', rank: 7, suit: 's' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '7c_0', rank: 7, suit: 'c' },
      { id: '5h_0', rank: 5, suit: 'h' },
    ];
    const result = applyLayoffs(opponentDeadwood, knockerMelds);
    expect(result.remainingDeadwood).toHaveLength(1);
    expect(result.remainingDeadwood[0].rank).toBe(5);
  });

  it('extends knocker melds with laid-off cards', () => {
    const knockerMelds = [
      { type: 'set', cards: [
        { id: '7h_0', rank: 7, suit: 'h' },
        { id: '7d_0', rank: 7, suit: 'd' },
        { id: '7s_0', rank: 7, suit: 's' },
      ]},
    ];
    const opponentDeadwood = [
      { id: '7c_0', rank: 7, suit: 'c' },
    ];
    const result = applyLayoffs(opponentDeadwood, knockerMelds);
    expect(result.updatedMelds[0].cards).toHaveLength(4);
  });

  it('returns { remainingDeadwood, updatedMelds }', () => {
    const result = applyLayoffs([], []);
    expect(result).toHaveProperty('remainingDeadwood');
    expect(result).toHaveProperty('updatedMelds');
  });

  it('applies chain layoffs (run extended enables further extension)', () => {
    const knockerMelds = [
      { type: 'run', cards: [
        { id: '5c_0', rank: 5, suit: 'c' },
        { id: '6c_0', rank: 6, suit: 'c' },
        { id: '7c_0', rank: 7, suit: 'c' },
      ]},
    ];
    // 4c can lay off on low end, then 3c can lay off on newly extended run
    const opponentDeadwood = [
      { id: '4c_0', rank: 4, suit: 'c' },
      { id: '3c_0', rank: 3, suit: 'c' },
    ];
    const result = applyLayoffs(opponentDeadwood, knockerMelds);
    expect(result.remainingDeadwood).toHaveLength(0);
    expect(result.updatedMelds[0].cards).toHaveLength(5);
  });
});

// --- scoreHand ---

describe('scoreHand', () => {
  const knocker = 'player1';
  const opponent = 'player2';

  it('knock win: knocker wins when deadwood less than opponent', () => {
    const result = scoreHand(knocker, opponent, 5, 15, null);
    expect(result.winner).toBe(knocker);
    expect(result.points).toBe(10);
    expect(result.type).toBe('knock');
  });

  it('undercut: opponent wins when knocker deadwood >= opponent', () => {
    const result = scoreHand(knocker, opponent, 10, 8, null);
    expect(result.winner).toBe(opponent);
    // points = (knockerDW - opponentDW) + 10 = 2 + 10 = 12
    expect(result.points).toBe(12);
    expect(result.type).toBe('undercut');
  });

  it('undercut also applies when deadwood is equal', () => {
    const result = scoreHand(knocker, opponent, 7, 7, null);
    expect(result.winner).toBe(opponent);
    expect(result.points).toBe(10);
    expect(result.type).toBe('undercut');
  });

  it('gin: knocker wins with 20-point bonus', () => {
    const result = scoreHand(knocker, opponent, 0, 15, 'gin');
    expect(result.winner).toBe(knocker);
    expect(result.points).toBe(35); // 15 + 20
    expect(result.type).toBe('gin');
  });

  it('gin cannot be undercut even if opponent also has 0 deadwood', () => {
    const result = scoreHand(knocker, opponent, 0, 0, 'gin');
    expect(result.winner).toBe(knocker);
    expect(result.type).toBe('gin');
    expect(result.points).toBe(20); // 0 + 20
  });

  it('bigGin: knocker wins with 31-point bonus', () => {
    const result = scoreHand(knocker, opponent, 0, 20, 'bigGin');
    expect(result.winner).toBe(knocker);
    expect(result.points).toBe(51); // 20 + 31
    expect(result.type).toBe('bigGin');
  });

  it('knock with 0 deadwood difference: opponent wins (undercut)', () => {
    // Edge: knocker has 0, opponent has 0, no gin — should be undercut
    const result = scoreHand(knocker, opponent, 0, 0, null);
    expect(result.winner).toBe(opponent);
    expect(result.type).toBe('undercut');
  });
});
