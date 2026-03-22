// Unit test: Quiz timer-driven phase transitions
// Verifies that timerExpired actions drive the full quiz phase cycle.

import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import quiz, { PHASE_DURATIONS } from '../../src/engine/games/quiz.js';

const mockQuestions = [
  {
    id: 'q1',
    question: 'What is 1+1?',
    correct_answer: '2',
    incorrect_answers: ['1', '3', '4'],
    category: 'Math',
    difficulty: 'easy',
  },
  {
    id: 'q2',
    question: 'What is 2+2?',
    correct_answer: '4',
    incorrect_answers: ['3', '5', '6'],
    category: 'Math',
    difficulty: 'easy',
  },
];

describe('Quiz timerExpired phase transitions', () => {
  it('exports PHASE_DURATIONS with expected phases', () => {
    expect(PHASE_DURATIONS).toHaveProperty('countdown');
    expect(PHASE_DURATIONS).toHaveProperty('question');
    expect(PHASE_DURATIONS).toHaveProperty('reveal');
    expect(PHASE_DURATIONS).toHaveProperty('between');
    expect(typeof PHASE_DURATIONS.countdown).toBe('number');
  });

  it('transitions countdown -> question on timerExpired', () => {
    const game = createGame(quiz, {
      players: ['p1', 'p2'],
      config: { questions: mockQuestions },
    });

    expect(game.state.phase).toBe('countdown');

    const { game: g2, events } = processAction(game, { type: 'timerExpired', phase: 'countdown' });
    expect(g2.state.phase).toBe('question');
    expect(events).toContainEqual(expect.objectContaining({ type: 'phase_change', phase: 'question' }));
  });

  it('transitions question -> reveal on timerExpired (scores answers)', () => {
    let game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });
    // Move to question phase
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'countdown' }));
    expect(game.state.phase).toBe('question');

    // Timer expires on question phase
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'question' }));
    expect(game.state.phase).toBe('reveal');
  });

  it('transitions reveal -> between when more questions remain', () => {
    let game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'countdown' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'question' }));
    expect(game.state.phase).toBe('reveal');

    ({ game } = processAction(game, { type: 'timerExpired', phase: 'reveal' }));
    expect(game.state.phase).toBe('between');
    expect(game.state.currentQuestion).toBe(1);
  });

  it('transitions between -> question for next question', () => {
    let game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'countdown' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'question' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'reveal' }));
    expect(game.state.phase).toBe('between');

    ({ game } = processAction(game, { type: 'timerExpired', phase: 'between' }));
    expect(game.state.phase).toBe('question');
    expect(game.state.currentQuestion).toBe(1);
  });

  it('full cycle ends in finished after all questions', () => {
    let game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });

    // Q1: countdown -> question -> reveal -> between
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'countdown' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'question' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'reveal' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'between' }));

    // Q2: question -> reveal -> finished (no more questions)
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'question' }));
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'reveal' }));
    expect(game.state.phase).toBe('finished');

    const result = checkEnd(game);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('scores');
  });

  it('ignores timerExpired for wrong phase', () => {
    const game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });
    expect(game.state.phase).toBe('countdown');

    // Send timerExpired for 'question' while in 'countdown' — should be no-op
    const { game: g2, events } = processAction(game, { type: 'timerExpired', phase: 'question' });
    expect(g2.state.phase).toBe('countdown');
    expect(events).toHaveLength(0);
  });

  it('view shows question data during question phase', () => {
    let game = createGame(quiz, {
      players: ['p1'],
      config: { questions: mockQuestions },
    });
    ({ game } = processAction(game, { type: 'timerExpired', phase: 'countdown' }));

    const view = getView(game, 'p1');
    expect(view.phase).toBe('question');
    expect(view.question).toBeDefined();
    expect(view.question.question).toBe('What is 1+1?');
    expect(view.question.answers).toHaveLength(4);
  });
});
