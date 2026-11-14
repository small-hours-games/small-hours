// 5-card and 7-card Texas Hold'em hand evaluator (ace-high: 2..14).

const CATEGORY_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

function encodeScore(category, tiebreakers) {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 15 + (tiebreakers[i] || 0);
  }
  return score;
}

function straightHigh(ranksDesc) {
  const unique = [...new Set(ranksDesc)].sort((a, b) => b - a);
  if (unique.length !== 5) return 0;
  if (unique[0] - unique[4] === 4) return unique[0];
  // Ace-low wheel: A-5-4-3-2
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return 5;
  }
  return 0;
}

export function evaluateFive(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  const sHigh = straightHigh(ranks);

  if (isFlush && sHigh > 0) {
    return {
      category: 8,
      tiebreakers: [sHigh],
      name: sHigh === 14 ? 'Royal Flush' : 'Straight Flush',
      score: encodeScore(8, [sHigh]),
    };
  }

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (groups[0][1] === 4) {
    const tb = [groups[0][0], groups[1][0]];
    return { category: 7, tiebreakers: tb, name: CATEGORY_NAMES[7], score: encodeScore(7, tb) };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const tb = [groups[0][0], groups[1][0]];
    return { category: 6, tiebreakers: tb, name: CATEGORY_NAMES[6], score: encodeScore(6, tb) };
  }

  if (isFlush) {
    return { category: 5, tiebreakers: ranks, name: CATEGORY_NAMES[5], score: encodeScore(5, ranks) };
  }

  if (sHigh > 0) {
    return { category: 4, tiebreakers: [sHigh], name: CATEGORY_NAMES[4], score: encodeScore(4, [sHigh]) };
  }

  if (groups[0][1] === 3) {
    const tb = [groups[0][0], groups[1][0], groups[2][0]];
    return { category: 3, tiebreakers: tb, name: CATEGORY_NAMES[3], score: encodeScore(3, tb) };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const tb = [groups[0][0], groups[1][0], groups[2][0]];
    return { category: 2, tiebreakers: tb, name: CATEGORY_NAMES[2], score: encodeScore(2, tb) };
  }

  if (groups[0][1] === 2) {
    const tb = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
    return { category: 1, tiebreakers: tb, name: CATEGORY_NAMES[1], score: encodeScore(1, tb) };
  }

  return { category: 0, tiebreakers: ranks, name: CATEGORY_NAMES[0], score: encodeScore(0, ranks) };
}

export function evaluateBestHand(cards) {
  if (cards.length < 5) return null;
  if (cards.length === 5) return evaluateFive(cards);

  let best = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const ev = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || ev.score > best.score) best = ev;
          }
        }
      }
    }
  }
  return best;
}
