// Tests for the Question Form game engine

import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import questionForm from '../../src/engine/games/question-form.js';

const sampleQuestions = [
  { text: 'Should we use TypeScript?', type: 'yesno' },
  { text: 'Preferred framework?', type: 'choice', options: ['React', 'Vue', 'Svelte'] },
  { text: 'Rate the DX (1-5)', type: 'rating', min: 1, max: 5 },
  { text: 'Any other feedback?', type: 'text' },
];

function createTestGame(players = ['p1', 'p2'], questions = sampleQuestions) {
  return createGame(questionForm, { players, config: { questions } });
}

describe('Question Form - setup', () => {
  it('initializes with answering phase and empty responses', () => {
    const game = createTestGame();
    expect(game.state.phase).toBe('answering');
    expect(game.state.questions).toHaveLength(4);
    expect(game.state.responses.p1).toEqual({});
    expect(game.state.responses.p2).toEqual({});
    expect(game.state.submitted).toEqual({});
  });
});

describe('Question Form - answer action', () => {
  it('saves a text answer', () => {
    const game = createTestGame();
    const { game: g2 } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 3, value: 'Looks good!' });
    expect(g2.state.responses.p1[3]).toBe('Looks good!');
  });

  it('saves a yesno answer', () => {
    const game = createTestGame();
    const { game: g2 } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' });
    expect(g2.state.responses.p1[0]).toBe('yes');
  });

  it('saves a choice answer', () => {
    const game = createTestGame();
    const { game: g2 } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 1, value: 'Vue' });
    expect(g2.state.responses.p1[1]).toBe('Vue');
  });

  it('saves a rating answer', () => {
    const game = createTestGame();
    const { game: g2 } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 2, value: 4 });
    expect(g2.state.responses.p1[2]).toBe(4);
  });

  it('rejects invalid choice', () => {
    const game = createTestGame();
    const { events } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 1, value: 'Angular' });
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'Invalid choice' })]);
  });

  it('rejects invalid yesno value', () => {
    const game = createTestGame();
    const { events } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'maybe' });
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'Answer must be yes or no' })]);
  });

  it('rejects out-of-range rating', () => {
    const game = createTestGame();
    const { events } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 2, value: 10 });
    expect(events).toEqual([expect.objectContaining({ type: 'error' })]);
  });

  it('rejects invalid question index', () => {
    const game = createTestGame();
    const { events } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 99, value: 'test' });
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'Invalid question index' })]);
  });

  it('rejects answer after submission', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    const { events } = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' });
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'Already submitted' })]);
  });

  it('allows overwriting a previous answer', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' }).game;
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'no' }).game;
    expect(game.state.responses.p1[0]).toBe('no');
  });
});

describe('Question Form - submit action', () => {
  it('marks player as submitted', () => {
    const game = createTestGame();
    const { game: g2, events } = processAction(game, { type: 'submit', playerId: 'p1' });
    expect(g2.state.submitted.p1).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'player_submitted' }));
  });

  it('transitions to review when all players submit', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    const { game: g3, events } = processAction(game, { type: 'submit', playerId: 'p2' });
    expect(g3.state.phase).toBe('review');
    expect(events).toContainEqual(expect.objectContaining({ type: 'phase_change', phase: 'review' }));
  });

  it('stays in answering when not all submitted', () => {
    const game = createTestGame();
    const { game: g2 } = processAction(game, { type: 'submit', playerId: 'p1' });
    expect(g2.state.phase).toBe('answering');
  });

  it('rejects double submission', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    const { events } = processAction(game, { type: 'submit', playerId: 'p1' });
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: 'Already submitted' })]);
  });
});

describe('Question Form - review actions', () => {
  function getReviewGame() {
    let game = createTestGame();
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' }).game;
    game = processAction(game, { type: 'answer', playerId: 'p2', questionIndex: 0, value: 'no' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p2' }).game;
    return game;
  }

  it('navigates between questions in review', () => {
    let game = getReviewGame();
    expect(game.state.currentQuestion).toBe(0);
    game = processAction(game, { type: 'reviewQuestion', playerId: 'p1', questionIndex: 2 }).game;
    expect(game.state.currentQuestion).toBe(2);
  });

  it('finishes review', () => {
    let game = getReviewGame();
    game = processAction(game, { type: 'finishReview', playerId: 'p1' }).game;
    expect(game.state.phase).toBe('finished');
  });
});

describe('Question Form - view', () => {
  it('shows questions and my responses during answering', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' }).game;

    const view = getView(game, 'p1');
    expect(view.phase).toBe('answering');
    expect(view.questions).toHaveLength(4);
    expect(view.myResponses[0]).toBe('yes');
    expect(view.isSubmitted).toBe(false);
    expect(view.submittedCount).toBe(0);
    expect(view.totalPlayers).toBe(2);
  });

  it('shows tally for yesno in review', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 0, value: 'yes' }).game;
    game = processAction(game, { type: 'answer', playerId: 'p2', questionIndex: 0, value: 'no' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p2' }).game;

    const view = getView(game, 'p1');
    expect(view.phase).toBe('review');
    expect(view.tally).toEqual({ yes: 1, no: 1 });
    expect(view.allResponses).toHaveLength(2);
  });

  it('computes average for rating in review', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'answer', playerId: 'p1', questionIndex: 2, value: 4 }).game;
    game = processAction(game, { type: 'answer', playerId: 'p2', questionIndex: 2, value: 2 }).game;
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p2' }).game;
    // Navigate to rating question
    game = processAction(game, { type: 'reviewQuestion', playerId: 'p1', questionIndex: 2 }).game;

    const view = getView(game, 'p1');
    expect(view.average).toBe(3);
  });
});

describe('Question Form - endIf', () => {
  it('returns null when not finished', () => {
    const game = createTestGame();
    expect(checkEnd(game)).toBeNull();
  });

  it('returns end result when finished', () => {
    let game = createTestGame();
    game = processAction(game, { type: 'submit', playerId: 'p1' }).game;
    game = processAction(game, { type: 'submit', playerId: 'p2' }).game;
    game = processAction(game, { type: 'finishReview', playerId: 'p1' }).game;

    const result = checkEnd(game);
    expect(result).toEqual({ winner: null, scores: {} });
  });
});
