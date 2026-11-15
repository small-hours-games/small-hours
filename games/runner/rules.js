// After Hours Runner — Simultaneous 1–4 player synthwave cosmos race.
// TV runs 60 FPS Three.js track, obstacles, gems, and H-O-U-R-S letter pickups.

export const TARGET_WORD = ['H', 'O', 'U', 'R', 'S'];

export default {
  setup({ players }) {
    const ids = players.map(p => (typeof p === 'string' ? p : (p.id ?? p.playerId)));
    const scores = {};
    const stats = {};
    for (const id of ids) {
      scores[id] = 0;
      stats[id] = { lives: 3, gems: 0, letters: 0, alive: true };
    }
    return {
      phase: 'playing', // playing | finished
      players: ids,
      scores,
      stats,
      winner: null,
    };
  },

  actions: {
    reportRaceEnd(state, { winnerId, scores = {}, stats = {} }) {
      if (state.phase !== 'playing') return { state, events: [] };
      const nextScores = { ...state.scores };
      const nextStats = { ...state.stats };
      for (const id of state.players) {
        if (scores[id] != null && Number.isFinite(Number(scores[id]))) {
          nextScores[id] = Math.max(0, Math.round(Number(scores[id])));
        }
        if (stats[id] && typeof stats[id] === 'object') {
          nextStats[id] = {
            lives: Math.max(0, Number(stats[id].lives ?? nextStats[id].lives)),
            gems: Math.max(0, Number(stats[id].gems ?? nextStats[id].gems)),
            letters: Math.max(0, Math.min(TARGET_WORD.length, Number(stats[id].letters ?? nextStats[id].letters))),
            alive: Boolean(stats[id].alive),
          };
        }
      }

      let resolvedWinner = state.players.includes(winnerId) ? winnerId : null;
      if (!resolvedWinner && state.players.length) {
        resolvedWinner = [...state.players].sort((a, b) => (nextScores[b] || 0) - (nextScores[a] || 0))[0];
      }

      return {
        state: {
          ...state,
          phase: 'finished',
          scores: nextScores,
          stats: nextStats,
          winner: resolvedWinner,
        },
        events: [{ type: 'gameEnded', winnerId: resolvedWinner }],
      };
    },
  },

  view(state) {
    return {
      phase: state.phase,
      players: state.players,
      scores: state.scores,
      stats: state.stats,
      winner: state.winner,
      targetWord: TARGET_WORD,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return {
      winner: state.winner,
      scores: state.scores,
    };
  },
};
