// Tilt-Ball Arena — 60 Hz P2P gyro/tilt bumper marbles on a shrinking neon ring.

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

export default {
  setup({ players, config = {} }) {
    const ids = players.map(p => (typeof p === 'string' ? p : (p.id ?? p.playerId)));
    const maxRounds = Math.max(1, Math.min(7, Number(config.maxRounds) || 3));
    const scores = {};
    const tilts = {};
    for (const id of ids) {
      scores[id] = 0;
      tilts[id] = { x: 0, y: 0, boost: 0 };
    }
    return {
      phase: 'playing', // playing | round_over | finished
      round: 1,
      maxRounds,
      players: ids,
      scores,
      tilts,
      lastRoundWinner: null,
    };
  },

  actions: {
    setTilt(state, { playerId, x, y, boost }) {
      if (state.phase !== 'playing') return { state, events: [] };
      if (!state.players.includes(playerId)) return { state, events: [] };
      return {
        state: {
          ...state,
          tilts: {
            ...state.tilts,
            [playerId]: {
              x: Math.round(clamp(x, -1, 1) * 100) / 100,
              y: Math.round(clamp(y, -1, 1) * 100) / 100,
              boost: boost ? 1 : 0,
            },
          },
        },
        events: [],
      };
    },

    finishRound(state, { round, winnerId, elimOrder = [] }) {
      if (state.phase !== 'playing') return { state, events: [] };
      if (round != null && Number(round) !== state.round) return { state, events: [] };

      const nextScores = { ...state.scores };
      const validWinner = state.players.includes(winnerId) ? winnerId : null;
      if (validWinner) nextScores[validWinner] = (nextScores[validWinner] || 0) + 3;

      // Award 1 point per rival outlasted based on elimination order.
      const cleanElim = Array.isArray(elimOrder)
        ? elimOrder.filter((id, i, arr) => state.players.includes(id) && arr.indexOf(id) === i)
        : [];
      cleanElim.forEach((id, idx) => {
        nextScores[id] = (nextScores[id] || 0) + idx;
      });

      const isFinal = state.round >= state.maxRounds;
      return {
        state: {
          ...state,
          phase: isFinal ? 'finished' : 'round_over',
          scores: nextScores,
          lastRoundWinner: validWinner,
        },
        events: [{ type: isFinal ? 'gameEnded' : 'roundEnded', winnerId: validWinner }],
      };
    },

    nextRound(state) {
      if (state.phase !== 'round_over') return { state, events: [] };
      const tilts = {};
      for (const id of state.players) {
        tilts[id] = { x: 0, y: 0, boost: 0 };
      }
      return {
        state: {
          ...state,
          phase: 'playing',
          round: state.round + 1,
          tilts,
          lastRoundWinner: null,
        },
        events: [{ type: 'roundStarted', round: state.round + 1 }],
      };
    },
  },

  view(state) {
    return {
      phase: state.phase,
      round: state.round,
      maxRounds: state.maxRounds,
      players: state.players,
      scores: state.scores,
      tilts: state.tilts,
      lastRoundWinner: state.lastRoundWinner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    const ranked = [...state.players].sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));
    return {
      winner: ranked[0] || null,
      scores: state.scores,
    };
  },
};
