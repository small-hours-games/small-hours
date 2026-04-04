// Unit tests for src/engine/games/quiz.js
// Covers: answer submission (incl. powerups), all 4 timerExpired transitions with
// actions/scoring, scoring mechanics, view filtering.
// Note: quiz-timer.test.js covers bare phase transitions — this file adds
// actions, scoring, powerups, and view behaviour.

import { describe, it, expect, beforeEach } from 'vitest';
import quiz, { PHASE_DURATIONS } from '../../src/engine/games/quiz.js';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';

// -----------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------
const Q1 = {
  id: 'q1',
  question: 'What is 1+1?',
  correct_answer: '2',
  incorrect_answers: ['1', '3', '4'],
  category: 'Math',
  difficulty: 'easy',
};
const Q2 = {
  id: 'q2',
  question: 'Capital of France?',
  correct_answer: 'Paris',
  incorrect_answers: ['London', 'Berlin', 'Rome'],
  category: 'Geography',
  difficulty: 'easy',
};

function makeGame(players = ['p1', 'p2'], questions = [Q1, Q2]) {
  return createGame(quiz, { players, config: { questions } });
}

/** Advance past the countdown phase so we're in 'question'. */
function toQuestion(game) {
  return processAction(game, { type: 'timerExpired', phase: 'countdown' }).game;
}

/** Advance past the question phase to 'reveal'. */
function toReveal(game) {
  const g1 = toQuestion(game);
  return processAction(g1, { type: 'timerExpired', phase: 'question' }).game;
}

// -----------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------
describe('Quiz - setup', () => {
  it('starts in countdown phase', () => {
    const game = makeGame();
    expect(game.state.phase).toBe('countdown');
  });

  it('initialises scores and streaks to 0 for all players', () => {
    const game = makeGame(['p1', 'p2', 'p3']);
    expect(game.state.scores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(game.state.streaks).toEqual({ p1: 0, p2: 0, p3: 0 });
  });

  it('initialises all powerups as available', () => {
    const game = makeGame(['p1']);
    expect(game.state.powerups.p1).toEqual({ double: true, fifty: true, freeze: true });
  });

  it('sets currentQuestion to 0', () => {
    const game = makeGame();
    expect(game.state.currentQuestion).toBe(0);
  });

  it('stores questions from config', () => {
    const game = makeGame();
    expect(game.state.questions).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------
// Answer submission
// -----------------------------------------------------------------------
describe('Quiz - answer action', () => {
  it('records a plain answer in the question phase', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2, events } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
    });
    expect(g2.state.answers.p1).toBeDefined();
    expect(g2.state.answers.p1.answerId).toBe('2');
    expect(events[0].type).toBe('answer_submitted');
    expect(events[0].playerId).toBe('p1');
    expect(events[0].usedPowerup).toBeNull();
  });

  it('records the timestamp on answer', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const before = Date.now();
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
    });
    const after = Date.now();
    expect(g2.state.answers.p1.timestamp).toBeGreaterThanOrEqual(before);
    expect(g2.state.answers.p1.timestamp).toBeLessThanOrEqual(after);
  });

  it('rejects answer when not in question phase', () => {
    const game = makeGame(['p1']);
    // Still in countdown
    const { events } = processAction(game, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/not in question/i);
  });

  it('rejects duplicate answer from same player', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, { type: 'answer', playerId: 'p1', answerId: '2' });
    const { events } = processAction(g2, { type: 'answer', playerId: 'p1', answerId: '1' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/already answered/i);
  });

  it('consuming double powerup marks it as used', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2, events } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
      powerupType: 'double',
    });
    expect(g2.state.powerups.p1.double).toBe(false);
    expect(events[0].usedPowerup).toBe('double');
  });

  it('consuming fifty powerup marks it as used', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
      powerupType: 'fifty',
    });
    expect(g2.state.powerups.p1.fifty).toBe(false);
  });

  it('rejects unavailable powerup', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    // Use double first
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
      powerupType: 'double',
    });
    // Move to next question
    const g3 = processAction(g2, { type: 'timerExpired', phase: 'question' }).game;
    const g4 = processAction(g3, { type: 'timerExpired', phase: 'reveal' }).game;
    const g5 = processAction(g4, { type: 'timerExpired', phase: 'between' }).game;
    // Try to use double again — should be unavailable
    const { events } = processAction(g5, {
      type: 'answer',
      playerId: 'p1',
      answerId: 'Paris',
      powerupType: 'double',
    });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toMatch(/not available/i);
  });

  it('does not consume powerup of other players', () => {
    const game = makeGame(['p1', 'p2']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: '2',
      powerupType: 'double',
    });
    expect(g2.state.powerups.p2.double).toBe(true);
  });
});

// -----------------------------------------------------------------------
// Scoring mechanics (timerExpired question)
// -----------------------------------------------------------------------
describe('Quiz - scoring', () => {
  it('correct answer awards points (>0)', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
    });
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'question' });
    expect(g3.state.scores.p1).toBeGreaterThan(0);
  });

  it('wrong answer awards 0 points and resets streak', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: 'WRONG',
    });
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'question' });
    expect(g3.state.scores.p1).toBe(0);
    expect(g3.state.streaks.p1).toBe(0);
  });

  it('no answer resets streak to 0', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    // No answer submitted — just expire timer
    const { game: g2 } = processAction(g1, { type: 'timerExpired', phase: 'question' });
    expect(g2.state.streaks.p1).toBe(0);
    expect(g2.state.scores.p1).toBe(0);
  });

  it('correct answer increments streak', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
    });
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'question' });
    expect(g3.state.streaks.p1).toBe(1);
  });

  it('double powerup doubles the score', () => {
    const game = makeGame(['p1', 'p2']);
    const g1 = toQuestion(game);
    // p1 uses double, p2 answers without powerup — same answerId
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
      powerupType: 'double',
    });
    const { game: g3 } = processAction(g2, {
      type: 'answer',
      playerId: 'p2',
      answerId: Q1.correct_answer,
    });
    const { game: g4 } = processAction(g3, { type: 'timerExpired', phase: 'question' });
    // p1 should have roughly double p2's score (both answered at nearly same time)
    expect(g4.state.scores.p1).toBeGreaterThan(g4.state.scores.p2);
  });

  it('correctPlayers in reveal event contains only correct answerers', () => {
    const game = makeGame(['p1', 'p2']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
    });
    const { game: g3 } = processAction(g2, {
      type: 'answer',
      playerId: 'p2',
      answerId: 'WRONG',
    });
    const { events } = processAction(g3, { type: 'timerExpired', phase: 'question' });
    const revealEvent = events.find(e => e.type === 'phase_change' && e.phase === 'reveal');
    expect(revealEvent.correctPlayers).toContain('p1');
    expect(revealEvent.correctPlayers).not.toContain('p2');
  });

  it('phase_change event includes correctAnswer on question expiry', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { events } = processAction(g1, { type: 'timerExpired', phase: 'question' });
    const ev = events.find(e => e.phase === 'reveal');
    expect(ev.correctAnswer).toBe(Q1.correct_answer);
  });
});

// -----------------------------------------------------------------------
// timerExpired — all 4 transitions (with action context)
// -----------------------------------------------------------------------
describe('Quiz - timerExpired with answer context', () => {
  it('countdown -> question: answers cleared and questionStartTime set', () => {
    const game = makeGame(['p1']);
    // Manually put an answer in state to confirm it gets cleared
    const { game: g2 } = processAction(game, { type: 'timerExpired', phase: 'countdown' });
    expect(g2.state.phase).toBe('question');
    expect(g2.state.answers).toEqual({});
    expect(g2.state.questionStartTime).not.toBeNull();
  });

  it('reveal -> between when more questions remain', () => {
    const game = makeGame(['p1'], [Q1, Q2]);
    const g1 = toReveal(game);
    expect(g1.state.phase).toBe('reveal');
    const { game: g2, events } = processAction(g1, { type: 'timerExpired', phase: 'reveal' });
    expect(g2.state.phase).toBe('between');
    expect(g2.state.currentQuestion).toBe(1);
    expect(events[0].phase).toBe('between');
  });

  it('reveal -> finished when no more questions', () => {
    const game = makeGame(['p1'], [Q1]); // only 1 question
    const g1 = toReveal(game);
    const { game: g2, events } = processAction(g1, { type: 'timerExpired', phase: 'reveal' });
    expect(g2.state.phase).toBe('finished');
    expect(events[0].phase).toBe('finished');
  });

  it('between -> question: answers cleared, round incremented', () => {
    const game = makeGame(['p1'], [Q1, Q2]);
    const g1 = toReveal(game);
    const g2 = processAction(g1, { type: 'timerExpired', phase: 'reveal' }).game;
    expect(g2.state.phase).toBe('between');
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'between' });
    expect(g3.state.phase).toBe('question');
    expect(g3.state.answers).toEqual({});
    expect(g3.state.round).toBe(1);
  });

  it('full 2-question cycle reaches finished and endIf returns result', () => {
    let game = makeGame(['p1'], [Q1, Q2]);
    game = processAction(game, { type: 'timerExpired', phase: 'countdown' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'question' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'reveal' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'between' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'question' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'reveal' }).game;

    expect(game.state.phase).toBe('finished');
    const result = checkEnd(game);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('scores');
  });

  it('timerExpired for wrong phase is a no-op', () => {
    const game = makeGame(['p1']);
    expect(game.state.phase).toBe('countdown');
    const { game: same, events } = processAction(game, { type: 'timerExpired', phase: 'question' });
    expect(same.state.phase).toBe('countdown');
    expect(events).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------
// View filtering
// -----------------------------------------------------------------------
describe('Quiz - view filtering', () => {
  it('shows player their own powerups', () => {
    const game = makeGame(['p1', 'p2']);
    const view = getView(game, 'p1');
    expect(view.myPowerups).toEqual({ double: true, fifty: true, freeze: true });
  });

  it('shows question data during question phase', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const view = getView(g1, 'p1');
    expect(view.question).toBeDefined();
    expect(view.question.text).toBe(Q1.question);
    expect(view.question.answers).toHaveLength(4);
  });

  it('hasAnswered is true after player answers', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, { type: 'answer', playerId: 'p1', answerId: '2' });
    const view = getView(g2, 'p1');
    expect(view.hasAnswered).toBe(true);
  });

  it('hasAnswered is false before answering', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const view = getView(g1, 'p1');
    expect(view.hasAnswered).toBe(false);
  });

  it('fifty-fifty reduces answers to 2 during question phase', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
      powerupType: 'fifty',
    });
    const view = getView(g2, 'p1');
    // After fifty-fifty: correct + 1 incorrect = 2 answers
    expect(view.question.answers).toHaveLength(2);
    expect(view.question.answers).toContain(Q1.correct_answer);
  });

  it('reveals correctAnswer during reveal phase', () => {
    const game = makeGame(['p1']);
    const g1 = toReveal(game);
    const view = getView(g1, 'p1');
    expect(view.correctAnswer).toBe(Q1.correct_answer);
  });

  it('shows correctPlayers during reveal phase', () => {
    const game = makeGame(['p1', 'p2']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
    });
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'question' });
    const view = getView(g3, 'p2');
    expect(view.correctPlayers).toContain('p1');
  });

  it('no question data in countdown phase', () => {
    const game = makeGame(['p1']);
    const view = getView(game, 'p1');
    expect(view.question).toBeUndefined();
  });

  it('finalScores visible in finished phase', () => {
    let game = makeGame(['p1'], [Q1]);
    game = processAction(game, { type: 'timerExpired', phase: 'countdown' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'question' }).game;
    game = processAction(game, { type: 'timerExpired', phase: 'reveal' }).game;
    const view = getView(game, 'p1');
    expect(view.finalScores).toBeDefined();
    expect(view.finalScores).toHaveProperty('p1');
  });

  it('shows total question count', () => {
    const game = makeGame(['p1'], [Q1, Q2]);
    const view = getView(game, 'p1');
    expect(view.totalQuestions).toBe(2);
  });

  it('shows myStreak for the player', () => {
    const game = makeGame(['p1']);
    const g1 = toQuestion(game);
    const { game: g2 } = processAction(g1, {
      type: 'answer',
      playerId: 'p1',
      answerId: Q1.correct_answer,
    });
    const { game: g3 } = processAction(g2, { type: 'timerExpired', phase: 'question' });
    const view = getView(g3, 'p1');
    expect(view.myStreak).toBe(1);
  });
});

// -----------------------------------------------------------------------
// endIf
// -----------------------------------------------------------------------
describe('Quiz - endIf', () => {
  it('returns null during active play', () => {
    const game = makeGame(['p1']);
    expect(checkEnd(game)).toBeNull();
  });

  it('returns winner with highest score when finished', () => {
    const game = makeGame(['p1', 'p2'], [Q1]);
    let g = processAction(game, { type: 'timerExpired', phase: 'countdown' }).game;
    // p1 answers correctly
    g = processAction(g, { type: 'answer', playerId: 'p1', answerId: Q1.correct_answer }).game;
    g = processAction(g, { type: 'timerExpired', phase: 'question' }).game;
    g = processAction(g, { type: 'timerExpired', phase: 'reveal' }).game;

    expect(g.state.phase).toBe('finished');
    const result = checkEnd(g);
    expect(result.winner).toBe('p1');
    expect(result.scores.p1).toBeGreaterThan(result.scores.p2);
  });
});
