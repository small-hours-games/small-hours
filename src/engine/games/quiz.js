// Small Hours - Quiz / Trivia Game

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const PHASE_DURATIONS = {
  countdown: 3000,
  question: 15000,
  reveal: 4000,
  between: 5000,
};

const quiz = {
  setup({ players, config }) {
    const questions = config.questions || [];
    const questionCount = config.questionCount || questions.length;
    const selectedQuestions = questions.slice(0, questionCount);

    const scores = {};
    const streaks = {};
    const powerups = {};
    for (const id of players) {
      scores[id] = 0;
      streaks[id] = 0;
      powerups[id] = { double: true, fifty: true, freeze: true };
    }

    return {
      phase: 'countdown',
      currentQuestion: 0,
      questions: selectedQuestions,
      answers: {},
      scores,
      streaks,
      powerups,
      questionStartTime: null,
      round: 0,
    };
  },

  actions: {
    answer(state, { playerId, answerId, powerupType }) {
      if (state.phase !== 'question') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Not in question phase' }],
        };
      }

      if (state.answers[playerId]) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Already answered' }],
        };
      }

      let newPowerups = state.powerups;
      if (powerupType) {
        const playerPowerups = state.powerups[playerId];
        if (!playerPowerups || !playerPowerups[powerupType]) {
          return {
            state,
            events: [{ type: 'error', playerId, message: `Powerup ${powerupType} not available` }],
          };
        }
        newPowerups = {
          ...state.powerups,
          [playerId]: {
            ...playerPowerups,
            [powerupType]: false,
          },
        };
      }

      const newAnswers = {
        ...state.answers,
        [playerId]: {
          answerId,
          timestamp: Date.now(),
          powerupType: powerupType || null,
        },
      };

      return {
        state: {
          ...state,
          answers: newAnswers,
          powerups: newPowerups,
        },
        events: [
          {
            type: 'answer_submitted',
            playerId,
            usedPowerup: powerupType || null,
          },
        ],
      };
    },

    timerExpired(state, { phase }) {
      if (state.phase !== phase) {
        return { state, events: [] };
      }

      switch (phase) {
        case 'countdown': {
          return {
            state: {
              ...state,
              phase: 'question',
              questionStartTime: Date.now(),
              answers: {},
            },
            events: [{ type: 'phase_change', phase: 'question', questionIndex: state.currentQuestion }],
          };
        }

        case 'question': {
          // Score answers
          const question = state.questions[state.currentQuestion];
          const correctAnswer = question.correct_answer;
          const newScores = { ...state.scores };
          const newStreaks = { ...state.streaks };
          const correctPlayers = [];

          for (const [pid, answer] of Object.entries(state.answers)) {
            const isCorrect = answer.answerId === correctAnswer;
            if (isCorrect) {
              const elapsed = answer.timestamp - state.questionStartTime;
              const timeRatio = Math.max(0, 1 - elapsed / PHASE_DURATIONS.question);
              let points = Math.round(1000 * (0.5 + 0.5 * timeRatio));

              if (answer.powerupType === 'double') {
                points *= 2;
              }

              newStreaks[pid] = (newStreaks[pid] || 0) + 1;
              newScores[pid] = (newScores[pid] || 0) + points;
              correctPlayers.push(pid);
            } else {
              newStreaks[pid] = 0;
            }
          }

          // Players who didn't answer get streak reset
          for (const pid of Object.keys(newStreaks)) {
            if (!state.answers[pid]) {
              newStreaks[pid] = 0;
            }
          }

          return {
            state: {
              ...state,
              phase: 'reveal',
              scores: newScores,
              streaks: newStreaks,
            },
            events: [
              {
                type: 'phase_change',
                phase: 'reveal',
                correctAnswer,
                correctPlayers,
              },
            ],
          };
        }

        case 'reveal': {
          const nextQuestion = state.currentQuestion + 1;
          const hasMore = nextQuestion < state.questions.length;

          if (!hasMore) {
            return {
              state: { ...state, phase: 'finished' },
              events: [{ type: 'phase_change', phase: 'finished' }],
            };
          }

          return {
            state: {
              ...state,
              phase: 'between',
              currentQuestion: nextQuestion,
            },
            events: [{ type: 'phase_change', phase: 'between', nextQuestion }],
          };
        }

        case 'between': {
          return {
            state: {
              ...state,
              phase: 'question',
              questionStartTime: Date.now(),
              answers: {},
              round: state.round + 1,
            },
            events: [{ type: 'phase_change', phase: 'question', questionIndex: state.currentQuestion }],
          };
        }

        default:
          return { state, events: [] };
      }
    },
  },

  view(state, playerId) {
    const base = {
      phase: state.phase,
      currentQuestion: state.currentQuestion,
      totalQuestions: state.questions.length,
      scores: { ...state.scores },
      myPowerups: state.powerups[playerId] ? { ...state.powerups[playerId] } : {},
      myStreak: state.streaks[playerId] || 0,
      round: state.round,
    };

    if (state.phase === 'question' || state.phase === 'reveal') {
      const question = state.questions[state.currentQuestion];
      if (question) {
        const allAnswers = [question.correct_answer, ...question.incorrect_answers];

        let answers;
        // Apply fifty-fifty: remove 2 incorrect answers
        const playerAnswer = state.answers[playerId];
        const usedFifty =
          (playerAnswer && playerAnswer.powerupType === 'fifty') ||
          (state.powerups[playerId] && !state.powerups[playerId].fifty && state.phase === 'question');

        if (usedFifty && state.phase === 'question') {
          const incorrect = [...question.incorrect_answers];
          // Keep only 1 incorrect answer
          const kept = incorrect.slice(0, 1);
          answers = shuffleArray([question.correct_answer, ...kept]);
        } else {
          answers = shuffleArray(allAnswers);
        }

        base.question = {
          id: question.id,
          question: question.question,
          answers,
          category: question.category,
          difficulty: question.difficulty,
        };

        base.hasAnswered = !!state.answers[playerId];
      }
    }

    if (state.phase === 'reveal') {
      const question = state.questions[state.currentQuestion];
      base.correctAnswer = question.correct_answer;

      const whoGotItRight = [];
      for (const [pid, answer] of Object.entries(state.answers)) {
        if (answer.answerId === question.correct_answer) {
          whoGotItRight.push(pid);
        }
      }
      base.correctPlayers = whoGotItRight;
    }

    if (state.phase === 'finished') {
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

export { PHASE_DURATIONS };
export default quiz;
