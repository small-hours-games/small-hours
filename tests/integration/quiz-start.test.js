// Integration test: Quiz game start flow through Room
// Tests that starting a quiz game fetches questions, creates game, and handles errors.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/fetcher/opentrivia.js', () => ({
  fetchQuestions: vi.fn(),
}));

import { fetchQuestions } from '../../src/fetcher/opentrivia.js';
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
});
