// Small Hours - Spy / Social Deduction Game

const SPY_WORDS = [
  'airplane', 'banana', 'castle', 'diamond', 'elephant',
  'fountain', 'guitar', 'hospital', 'igloo', 'jungle',
  'kangaroo', 'lighthouse', 'mountain', 'notebook', 'octopus',
  'penguin', 'quarter', 'rainbow', 'submarine', 'telescope',
  'umbrella', 'volcano', 'waterfall', 'xylophone', 'yacht',
  'zipper', 'anchor', 'butterfly', 'cathedral', 'dinosaur',
  'escalator', 'flamingo', 'giraffe', 'hammock', 'island',
  'jellyfish', 'kaleidoscope', 'labyrinth', 'mosquito', 'necklace',
  'orchestra', 'parachute', 'quicksand', 'restaurant', 'skeleton',
  'trampoline', 'unicorn', 'vending machine', 'windmill', 'zeppelin',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickSpy(players) {
  return players[Math.floor(Math.random() * players.length)];
}

function startNewRound(state, players, words) {
  const spy = pickSpy(players);
  const word = pickRandom(words);

  return {
    ...state,
    phase: 'clues',
    spy,
    word,
    clues: {},
    guess: null,
    round: state.round + 1,
  };
}

const spy = {
  setup({ players, config }) {
    const totalRounds = (config && config.rounds) || 10;
    const words = (config && config.words && config.words.length > 0) ? config.words : SPY_WORDS;

    const scores = {};
    for (const id of players) {
      scores[id] = 0;
    }

    const initial = {
      phase: 'setup',
      round: 0,
      totalRounds,
      spy: null,
      word: null,
      clues: {},
      guess: null,
      scores,
      players,
      words,
    };

    // Immediately start the first round
    return startNewRound(initial, players, words);
  },

  actions: {
    sendClue(state, { playerId, text }) {
      if (state.phase !== 'clues') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Not in clues phase' }],
        };
      }

      if (playerId === state.spy) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'The spy cannot send clues' }],
        };
      }

      if (state.clues[playerId]) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Already submitted a clue' }],
        };
      }

      // One word max - take the first word
      const clueWord = String(text).trim().split(/\s+/)[0] || '';
      if (!clueWord) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Clue cannot be empty' }],
        };
      }

      const newClues = { ...state.clues, [playerId]: clueWord };

      return {
        state: {
          ...state,
          clues: newClues,
        },
        events: [{ type: 'clue_submitted', playerId, clue: clueWord }],
      };
    },

    sendGuess(state, { playerId, text }) {
      if (state.phase !== 'guess') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Not in guess phase' }],
        };
      }

      if (playerId !== state.spy) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Only the spy can guess' }],
        };
      }

      const guessText = String(text).trim().toLowerCase();
      const correct = guessText === state.word.toLowerCase();

      const newScores = { ...state.scores };
      if (correct) {
        newScores[state.spy] = (newScores[state.spy] || 0) + 3;
      } else {
        for (const pid of state.players) {
          if (pid !== state.spy) {
            newScores[pid] = (newScores[pid] || 0) + 1;
          }
        }
      }

      return {
        state: {
          ...state,
          phase: 'reveal',
          guess: guessText,
          scores: newScores,
        },
        events: [
          {
            type: 'spy_guessed',
            playerId: state.spy,
            guess: guessText,
            correct,
            word: state.word,
          },
        ],
      };
    },

    timerExpired(state, { phase }) {
      if (state.phase !== phase) {
        return { state, events: [] };
      }

      switch (phase) {
        case 'clues': {
          return {
            state: { ...state, phase: 'guess' },
            events: [{ type: 'phase_change', phase: 'guess' }],
          };
        }

        case 'guess': {
          // Spy didn't guess in time - non-spies get points
          const newScores = { ...state.scores };
          for (const pid of state.players) {
            if (pid !== state.spy) {
              newScores[pid] = (newScores[pid] || 0) + 1;
            }
          }

          return {
            state: {
              ...state,
              phase: 'reveal',
              scores: newScores,
            },
            events: [
              {
                type: 'spy_timeout',
                spy: state.spy,
                word: state.word,
              },
            ],
          };
        }

        case 'reveal': {
          return {
            state: { ...state, phase: 'score' },
            events: [{ type: 'phase_change', phase: 'score' }],
          };
        }

        case 'score': {
          if (state.round >= state.totalRounds) {
            return {
              state: { ...state, phase: 'finished' },
              events: [{ type: 'phase_change', phase: 'finished' }],
            };
          }

          const newState = startNewRound(state, state.players, state.words);
          return {
            state: newState,
            events: [
              {
                type: 'new_round',
                round: newState.round,
              },
            ],
          };
        }

        default:
          return { state, events: [] };
      }
    },
  },

  view(state, playerId) {
    const isSpy = playerId === state.spy;

    const base = {
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      scores: { ...state.scores },
      isSpy,
      spy: (state.phase === 'reveal' || state.phase === 'score' || state.phase === 'finished')
        ? state.spy
        : null,
    };

    // Spy does not see the word; non-spies do
    if (isSpy) {
      base.word = null;
    } else {
      base.word = state.word;
    }

    // Show clues during and after clue phase
    if (['clues', 'guess', 'reveal', 'score'].includes(state.phase)) {
      base.clues = { ...state.clues };
    }

    // During reveal/score, show the word and guess to everyone
    if (state.phase === 'reveal' || state.phase === 'score') {
      base.revealedWord = state.word;
      base.spyGuess = state.guess;
    }

    if (state.phase === 'finished') {
      base.revealedWord = state.word;
      base.finalScores = { ...state.scores };
    }

    return base;
  },

  endIf(state) {
    if (state.phase !== 'finished') {
      return null;
    }

    let winner = null;
    let highScore = -1;
    for (const [pid, score] of Object.entries(state.scores)) {
      if (score > highScore) {
        highScore = score;
        winner = pid;
      }
    }

    return {
      winner,
      scores: { ...state.scores },
    };
  },
};

const PHASE_DURATIONS = {
  clues: 60000,
  guess: 30000,
  reveal: 5000,
  score: 5000,
};

export { SPY_WORDS, PHASE_DURATIONS };
export default spy;
