// Small Hours - Question Form Game
// A gamified question/polling tool for dev workflows.
// The host submits questions, players answer on their phones,
// results are shown on the shared screen.
//
// Question types: 'text', 'choice', 'yesno', 'rating'
// Questions are passed in via config.questions at game start.

const questionForm = {
  async prepare(config) {
    // If questions are already provided (e.g. via WebSocket START_MINI_GAME), use them as-is
    if (config.questions?.length) {
      return { config };
    }
    // Otherwise load from file
    const { loadQuestionFile } = await import('../../fetcher/question-file.js');
    const file = config.file || 'todo-poll.json';
    const loaded = await loadQuestionFile(file);
    if (!loaded.ok) {
      throw new Error(`Failed to load questions: ${loaded.error}`);
    }
    return { config: { ...config, questions: loaded.questions, _sourceFile: file } };
  },

  setup({ players, config }) {
    const questions = config.questions || [];

    const responses = {};
    for (const id of players) {
      responses[id] = {};
    }

    return {
      phase: 'answering',       // answering | review | finished
      questions,
      currentQuestion: 0,
      responses,                // { playerId: { questionIndex: answer } }
      submitted: {},            // { playerId: true } — who has submitted all answers
      _sourceFile: config._sourceFile || null,  // track origin file for saving answers
    };
  },

  actions: {
    // Player answers a single question
    answer(state, { playerId, questionIndex, value }) {
      if (state.phase !== 'answering') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Not in answering phase' }],
        };
      }

      if (questionIndex < 0 || questionIndex >= state.questions.length) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Invalid question index' }],
        };
      }

      if (state.submitted[playerId]) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Already submitted' }],
        };
      }

      const question = state.questions[questionIndex];
      const validated = validateAnswer(question, value);
      if (validated.error) {
        return {
          state,
          events: [{ type: 'error', playerId, message: validated.error }],
        };
      }

      const newResponses = {
        ...state.responses,
        [playerId]: {
          ...state.responses[playerId],
          [questionIndex]: validated.value,
        },
      };

      return {
        state: { ...state, responses: newResponses },
        events: [{ type: 'answer_saved', playerId, questionIndex }],
      };
    },

    // Player submits all their answers (locks them in)
    submit(state, { playerId }) {
      if (state.phase !== 'answering') {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Not in answering phase' }],
        };
      }

      if (state.submitted[playerId]) {
        return {
          state,
          events: [{ type: 'error', playerId, message: 'Already submitted' }],
        };
      }

      const newSubmitted = { ...state.submitted, [playerId]: true };

      // Check if all players have submitted
      const allPlayers = Object.keys(state.responses);
      const allSubmitted = allPlayers.every(pid => newSubmitted[pid]);

      return {
        state: {
          ...state,
          submitted: newSubmitted,
          phase: allSubmitted ? 'review' : state.phase,
        },
        events: [
          { type: 'player_submitted', playerId },
          ...(allSubmitted ? [{ type: 'phase_change', phase: 'review' }] : []),
        ],
      };
    },

    // Navigate between questions in review mode (host-driven)
    reviewQuestion(state, { questionIndex }) {
      if (state.phase !== 'review') {
        return { state, events: [] };
      }

      if (questionIndex < 0 || questionIndex >= state.questions.length) {
        return { state, events: [] };
      }

      return {
        state: { ...state, currentQuestion: questionIndex },
        events: [{ type: 'review_navigate', questionIndex }],
      };
    },

    // Admin closes review, ending the game
    finishReview(state) {
      if (state.phase !== 'review') {
        return { state, events: [] };
      }

      return {
        state: { ...state, phase: 'finished' },
        events: [{ type: 'phase_change', phase: 'finished' }],
      };
    },
  },

  view(state, playerId) {
    const base = {
      phase: state.phase,
      totalQuestions: state.questions.length,
      currentQuestion: state.currentQuestion,
    };

    if (state.phase === 'answering') {
      // Show questions to answer
      base.questions = state.questions.map((q, i) => ({
        index: i,
        text: q.text,
        type: q.type || 'text',
        options: q.options || null,
        min: q.min,
        max: q.max,
        label: q.label,
      }));
      base.myResponses = state.responses[playerId]
        ? { ...state.responses[playerId] }
        : {};
      base.isSubmitted = !!state.submitted[playerId];

      // Show submission progress
      const allPlayers = Object.keys(state.responses);
      base.submittedCount = allPlayers.filter(pid => state.submitted[pid]).length;
      base.totalPlayers = allPlayers.length;
    }

    if (state.phase === 'review' || state.phase === 'finished') {
      // Show question + aggregated responses
      const q = state.questions[state.currentQuestion];
      base.reviewQuestion = {
        index: state.currentQuestion,
        text: q.text,
        type: q.type || 'text',
        options: q.options || null,
      };

      // Aggregate all responses for this question
      base.allResponses = [];
      for (const [pid, answers] of Object.entries(state.responses)) {
        const answer = answers[state.currentQuestion];
        if (answer !== undefined) {
          base.allResponses.push({ playerId: pid, value: answer });
        }
      }

      // For choice/yesno, compute tallies
      if (q.type === 'choice' || q.type === 'yesno') {
        const tally = {};
        for (const r of base.allResponses) {
          tally[r.value] = (tally[r.value] || 0) + 1;
        }
        base.tally = tally;
      }

      // For rating, compute average
      if (q.type === 'rating') {
        const values = base.allResponses.map(r => r.value).filter(v => typeof v === 'number');
        base.average = values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
          : null;
      }

      base.questions = state.questions.map((qu, i) => ({
        index: i,
        text: qu.text,
        type: qu.type || 'text',
      }));
    }

    return base;
  },

  endIf(state) {
    if (state.phase !== 'finished') {
      return null;
    }

    // No winners in a form — just return completion
    return {
      winner: null,
      scores: {},
    };
  },
};

function validateAnswer(question, value) {
  const type = question.type || 'text';

  switch (type) {
    case 'text':
      if (typeof value !== 'string') {
        return { error: 'Text answer required' };
      }
      return { value: value.trim().slice(0, 500) };

    case 'choice':
      if (!question.options || !question.options.includes(value)) {
        return { error: 'Invalid choice' };
      }
      return { value };

    case 'yesno':
      if (value !== 'yes' && value !== 'no') {
        return { error: 'Answer must be yes or no' };
      }
      return { value };

    case 'rating': {
      const num = Number(value);
      const min = question.min ?? 1;
      const max = question.max ?? 5;
      if (!Number.isFinite(num) || num < min || num > max) {
        return { error: `Rating must be between ${min} and ${max}` };
      }
      return { value: num };
    }

    default:
      return { error: `Unknown question type: ${type}` };
  }
}

export default questionForm;
