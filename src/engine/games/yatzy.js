// Small Hours - Yatzy (Yahtzee) party game (simplified scoring)
// Each round, the active player rolls 5 dice, may re-roll up to twice, then
// banks a score for one category. After all rounds, highest total wins.
//
// Engine pattern: { setup, actions, view, endIf }.

const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'pair', 'twoPairs', 'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yatzy', 'chance',
];

function rollDie() { return 1 + Math.floor(Math.random() * 6); }
function rollDice(n) { return Array.from({ length: n }, rollDie); }

// Score a set of dice for a category.
function scoreCategory(cat, dice) {
  const counts = {};
  for (const d of dice) counts[d] = (counts[d] || 0) + 1;
  const sum = dice.reduce((a, b) => a + b, 0);
  const uniq = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const has = n => Object.values(counts).includes(n);

  switch (cat) {
    case 'ones': return counts[1] ? counts[1] * 1 : 0;
    case 'twos': return counts[2] ? counts[2] * 2 : 0;
    case 'threes': return counts[3] ? counts[3] * 3 : 0;
    case 'fours': return counts[4] ? counts[4] * 4 : 0;
    case 'fives': return counts[5] ? counts[5] * 5 : 0;
    case 'sixes': return counts[6] ? counts[6] * 6 : 0;
    case 'pair': { const p = uniq.filter(x => counts[x] >= 2); return p.length ? Math.max(...p) * 2 : 0; }
    case 'twoPairs': {
      const pairs = uniq.filter(x => counts[x] >= 2);
      return pairs.length >= 2 ? pairs.slice(0, 2).reduce((a, x) => a + x * 2, 0) : 0;
    }
    case 'threeKind': return has(3) ? sum : 0;
    case 'fourKind': return has(4) ? sum : 0;
    case 'fullHouse': return has(3) && has(2) ? 25 : 0;
    case 'smallStraight': return [1,2,3,4,5].every(x => counts[x]) ? 30 : 0;
    case 'largeStraight': return [2,3,4,5,6].every(x => counts[x]) ? 40 : 0;
    case 'yatzy': return has(5) ? 50 : 0;
    case 'chance': return sum;
    default: return 0;
  }
}

const yatzy = {
  setup({ players, config }) {
    const rounds = (config && config.rounds) || CATEGORIES.length;
    const scores = {};
    const used = {};
    for (const id of players) { scores[id] = {}; used[id] = new Set(); }
    const first = players[0];
    return {
      phase: 'rolling',
      players: [...players],
      order: [...players],
      rounds,
      round: 1,
      turn: first,
      dice: rollDice(5),
      held: [false, false, false, false, false],
      rerolls: 2,
      scores,
      used,
      lastResult: null,
      winner: null,
    };
  },

  actions: {
    // Toggle hold on a die (before re-roll).
    toggleHold(state, { playerId, index }) {
      if (playerId !== state.turn) return { state };
      if (state.phase !== 'rolling') return { state };
      const held = [...state.held];
      held[index] = !held[index];
      return { state: { ...state, held }, events: [{ type: 'hold', playerId, index }] };
    },

    // Re-roll non-held dice (costs a reroll).
    reroll(state, { playerId }) {
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      if (state.phase !== 'rolling') return { state };
      if (state.rerolls <= 0) return { state, events: [{ type: 'error', playerId, message: 'No rerolls left' }] };
      const dice = state.dice.map((d, i) => state.held[i] ? d : rollDie());
      return { state: { ...state, dice, rerolls: state.rerolls - 1 }, events: [{ type: 'rerolled', playerId }] };
    },

    // Bank a category score and pass turn.
    bank(state, { playerId, category }) {
      if (playerId !== state.turn) return { state, events: [{ type: 'error', playerId, message: 'Not your turn' }] };
      if (state.phase !== 'rolling') return { state };
      if (!CATEGORIES.includes(category)) return { state, events: [{ type: 'error', playerId, message: 'Bad category' }] };
      if (state.used[playerId].has(category)) return { state, events: [{ type: 'error', playerId, message: 'Category already used' }] };

      const gained = scoreCategory(category, state.dice);
      const scores = { ...state.scores, [playerId]: { ...state.scores[playerId], [category]: gained } };
      const used = { ...state.used, [playerId]: new Set(state.used[playerId]).add(category) };

      const allUsed = state.players.every(p => used[p].size >= state.rounds);
      if (allUsed) {
        // Game over: winner = highest total.
        const totals = {};
        for (const id of state.players) totals[id] = Object.values(scores[id]).reduce((a, b) => a + b, 0);
        const winner = Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
        return { state: { ...state, scores, used, phase: 'finished', winner, lastResult: { playerId, category, gained, totals } }, events: [{ type: 'banked', playerId, category, gained }] };
      }

      // Next player.
      const idx = state.order.indexOf(playerId);
      const nextTurn = state.order[(idx + 1) % state.order.length];
      const newRound = (idx + 1 >= state.order.length) ? state.round + 1 : state.round;
      return {
        state: { ...state, scores, used, turn: nextTurn, round: newRound, dice: rollDice(5), held: [false, false, false, false, false], rerolls: 2, lastResult: { playerId, category, gained } },
        events: [{ type: 'banked', playerId, category, gained }],
      };
    },
  },

  view(state, playerId) {
    const totals = {};
    for (const id of state.players) totals[id] = Object.values(state.scores[id] || {}).reduce((a, b) => a + b, 0);
    return {
      phase: state.phase,
      dice: [...state.dice],
      held: [...state.held],
      rerolls: state.rerolls,
      turn: state.turn,
      isMyTurn: playerId === state.turn,
      round: state.round,
      rounds: state.rounds,
      myScores: { ...state.scores[playerId] },
      myTotal: totals[playerId] || 0,
      usedCategories: [...(state.used[playerId] || [])],
      availableCategories: CATEGORIES.filter(c => !state.used[playerId]?.has(c)),
      totals,
      lastResult: state.lastResult,
      winner: state.winner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    const totals = {};
    for (const id of state.players) totals[id] = Object.values(state.scores[id] || {}).reduce((a, b) => a + b, 0);
    return { winner: state.winner, scores: totals };
  },
};

export default yatzy;
