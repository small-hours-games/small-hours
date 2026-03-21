// Small Hours - Number Guess Game
// Secret number 1-100. Players guess, get feedback.

const numberGuess = {
  setup({ players, config }) {
    const secret = Math.floor(Math.random() * 100) + 1;
    const guesses = {};
    for (const id of players) {
      guesses[id] = [];
    }
    return {
      secret,
      guesses,
      phase: 'playing',
      round: 0,
      maxRounds: (config && config.maxRounds) || 10,
      winner: null,
    };
  },

  actions: {
    guess(state, { playerId, number }) {
      if (state.phase !== 'playing') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Game is not in playing phase' }],
        };
      }

      if (typeof number !== 'number' || number < 1 || number > 100 || !Number.isInteger(number)) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Guess must be an integer between 1 and 100' }],
        };
      }

      let result;
      if (number === state.secret) {
        result = 'correct';
      } else if (number > state.secret) {
        result = 'too_high';
      } else {
        result = 'too_low';
      }

      const playerGuesses = [...(state.guesses[playerId] || []), { number, result }];
      const newGuesses = { ...state.guesses, [playerId]: playerGuesses };
      const newRound = state.round + 1;

      const isCorrect = result === 'correct';
      const newPhase = isCorrect ? 'finished' : state.phase;
      const winner = isCorrect ? playerId : null;

      return {
        state: {
          ...state,
          guesses: newGuesses,
          round: newRound,
          phase: newPhase,
          winner,
        },
        events: [
          {
            type: 'guess_result',
            playerId,
            number,
            result,
            round: newRound,
          },
        ],
      };
    },
  },

  view(state, playerId) {
    const ownGuesses = state.guesses[playerId] || [];

    const otherPlayerGuesses = {};
    for (const [id, guesses] of Object.entries(state.guesses)) {
      if (id !== playerId) {
        otherPlayerGuesses[id] = guesses.length;
      }
    }

    const view = {
      phase: state.phase,
      round: state.round,
      maxRounds: state.maxRounds,
      myGuesses: ownGuesses,
      otherPlayers: otherPlayerGuesses,
    };

    if (state.phase === 'finished') {
      view.winner = state.winner;
      view.secret = state.secret;
    }

    return view;
  },

  endIf(state) {
    if (state.phase !== 'finished') {
      return null;
    }

    const scores = {};
    for (const [id, guesses] of Object.entries(state.guesses)) {
      scores[id] = state.maxRounds - guesses.length;
    }

    return {
      winner: state.winner,
      scores,
    };
  },
};

export default numberGuess;
