// Small Hours - Template Game
// Minimal reference game. Players take turns incrementing a counter.
// First player to reach the target wins.
//
// Use this as a starting point for new games.
// Game definition interface: { setup, actions, view, endIf }

const template = {
  setup({ players, config }) {
    const target = (config && config.target) || 3;
    const scores = {};
    for (const id of players) {
      scores[id] = 0;
    }
    return {
      phase: 'playing',
      scores,
      target,
      winner: null,
      lastAction: null,
    };
  },

  actions: {
    increment(state, { playerId }) {
      if (state.phase !== 'playing') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Game is over' }],
        };
      }

      const newScore = (state.scores[playerId] || 0) + 1;
      const scores = { ...state.scores, [playerId]: newScore };
      const won = newScore >= state.target;

      return {
        state: {
          ...state,
          scores,
          phase: won ? 'finished' : 'playing',
          winner: won ? playerId : null,
          lastAction: { playerId, newScore },
        },
        events: [
          { type: 'incremented', playerId, score: newScore },
          ...(won ? [{ type: 'game_over', winner: playerId }] : []),
        ],
      };
    },
  },

  view(state, playerId) {
    return {
      phase: state.phase,
      myScore: state.scores[playerId] || 0,
      target: state.target,
      scores: state.scores,
      winner: state.winner,
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

export default template;
