// Integration test: Quiz game start flow through Room
// Tests that starting a quiz game fetches questions, creates game, and handles errors.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/fetcher/cached-fetcher.js', () => ({
  fetchQuestions: vi.fn(),
}));

import { fetchQuestions } from '../../src/fetcher/cached-fetcher.js';
import { Room } from '../../src/session/room.js';

describe('Quiz start flow', () => {
  let room;

  beforeEach(() => {
    room = new Room('TEST');
    // Add a connected player so startGame doesn't reject for "no players"
    room.addPlayer('Alice');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts quiz with fetched questions', async () => {
    const mockQuestions = [
      {
        id: 'q1',
        question: 'Test question?',
        correct_answer: 'A',
        incorrect_answers: ['B', 'C', 'D'],
        category: 'General',
        difficulty: 'easy',
      },
    ];

    fetchQuestions.mockResolvedValue({ ok: true, questions: mockQuestions });

    const game = await room.startGame('quiz', { categoryId: 9, questionCount: 1 });

    expect(fetchQuestions).toHaveBeenCalledWith(9, 1);
    expect(game).not.toBeNull();
    expect(room.game).not.toBeNull();
    expect(room.game.state.questions).toHaveLength(1);
    expect(room.game.state.phase).toBe('countdown');
  });

  it('passes default amount when questionCount not specified', async () => {
    const mockQuestions = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      question: `Question ${i}?`,
      correct_answer: 'A',
      incorrect_answers: ['B', 'C', 'D'],
      category: 'General',
      difficulty: 'easy',
    }));

    fetchQuestions.mockResolvedValue({ ok: true, questions: mockQuestions });

    await room.startGame('quiz', {});

    expect(fetchQuestions).toHaveBeenCalledWith(undefined, 10);
  });

  it('throws when API fails', async () => {
    fetchQuestions.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });

    await expect(room.startGame('quiz', {})).rejects.toThrow('Failed to fetch questions');
  });

  it('non-quiz games still work without fetching', async () => {
    const game = await room.startGame('number-guess', {});

    expect(game).not.toBeNull();
    expect(room.game).not.toBeNull();
    expect(fetchQuestions).not.toHaveBeenCalled();
  });

  it('tracks used question IDs across quiz starts', async () => {
    const questions1 = [
      { id: 'otdb_aaa', question: 'Q1?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
      { id: 'otdb_bbb', question: 'Q2?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
    ];
    const questions2 = [
      { id: 'otdb_aaa', question: 'Q1?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
      { id: 'otdb_ccc', question: 'Q3?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
    ];

    fetchQuestions.mockResolvedValueOnce({ ok: true, questions: questions1 });
    await room.startGame('quiz', { questionCount: 2 });
    room.endGame();

    // Second game — same category returns overlapping questions
    fetchQuestions.mockResolvedValueOnce({ ok: true, questions: questions2 });
    await room.startGame('quiz', { questionCount: 1 });

    // otdb_aaa should be filtered out (already used), leaving otdb_ccc
    expect(room.game.state.questions).toHaveLength(1);
    expect(room.game.state.questions[0].id).toBe('otdb_ccc');
  });

  it('supplements with fresh fetch when too few unused questions', async () => {
    const cached = [
      { id: 'otdb_aaa', question: 'Q1?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
    ];
    const fresh = [
      { id: 'otdb_aaa', question: 'Q1?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
      { id: 'otdb_bbb', question: 'Q2?', correct_answer: 'A', incorrect_answers: ['B','C','D'], category: 'Test', difficulty: 'easy' },
    ];

    // First game uses otdb_aaa
    fetchQuestions.mockResolvedValueOnce({ ok: true, questions: cached });
    await room.startGame('quiz', { questionCount: 1 });
    room.endGame();

    // Second game — cache returns only otdb_aaa (used), supplement fetch returns otdb_aaa + otdb_bbb
    fetchQuestions
      .mockResolvedValueOnce({ ok: true, questions: cached })   // first call: cache hit
      .mockResolvedValueOnce({ ok: true, questions: fresh });    // second call: supplement

    await room.startGame('quiz', { questionCount: 1 });
    expect(room.game.state.questions).toHaveLength(1);
    expect(room.game.state.questions[0].id).toBe('otdb_bbb');
  });

  it('usedQuestionIds is per-room instance', () => {
    const room2 = new Room('TST2');
    room2.addPlayer('Bob');

    expect(room.usedQuestionIds).not.toBe(room2.usedQuestionIds);
    expect(room.usedQuestionIds).toBeInstanceOf(Set);
    expect(room2.usedQuestionIds).toBeInstanceOf(Set);
  });
});
