import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchQuestions } from '../../src/fetcher/opentrivia.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchResponse(body, ok = true) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve(body),
    })
  ));
}

const SAMPLE_RESULTS = [
  {
    type: 'multiple',
    difficulty: 'medium',
    category: 'Science &amp; Nature',
    question: 'What is H&#039;s atomic number?',
    correct_answer: 'One &amp; only',
    incorrect_answers: ['Two &amp; more', 'Three &lt;3&gt;', 'Four &quot;4&quot;'],
  },
  {
    type: 'multiple',
    difficulty: 'easy',
    category: 'General Knowledge',
    question: 'Is 2 &gt; 1?',
    correct_answer: 'Yes',
    incorrect_answers: ['No', 'Maybe', 'N/A'],
  },
];

describe('fetchQuestions', () => {
  describe('successful fetch', () => {
    it('returns ok: true with decoded question objects', async () => {
      mockFetchResponse({ response_code: 0, results: SAMPLE_RESULTS });
      const result = await fetchQuestions(9, 5);

      expect(result.ok).toBe(true);
      expect(result.questions).toHaveLength(2);

      const q = result.questions[0];
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('question');
      expect(q).toHaveProperty('correct_answer');
      expect(q).toHaveProperty('incorrect_answers');
      expect(q).toHaveProperty('category');
      expect(q).toHaveProperty('difficulty');
      expect(typeof q.id).toBe('string');
    });

    it('assigns unique string ids to each question', async () => {
      mockFetchResponse({ response_code: 0, results: SAMPLE_RESULTS });
      const result = await fetchQuestions(9, 5);
      const ids = result.questions.map(q => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('HTML entity decoding', () => {
    it('decodes &amp; &#039; &quot; &lt; &gt; in all text fields', async () => {
      mockFetchResponse({ response_code: 0, results: SAMPLE_RESULTS });
      const result = await fetchQuestions(9, 5);
      const [q1, q2] = result.questions;

      // category: "Science &amp; Nature" -> "Science & Nature"
      expect(q1.category).toBe('Science & Nature');
      // question: "What is H&#039;s atomic number?" -> "What is H's atomic number?"
      expect(q1.question).toBe("What is H's atomic number?");
      // correct_answer: "One &amp; only" -> "One & only"
      expect(q1.correct_answer).toBe('One & only');
      // incorrect_answers with &amp; &lt; &gt; &quot;
      expect(q1.incorrect_answers[0]).toBe('Two & more');
      expect(q1.incorrect_answers[1]).toBe('Three <3>');
      expect(q1.incorrect_answers[2]).toBe('Four "4"');
      // &gt;
      expect(q2.question).toBe('Is 2 > 1?');
    });
  });

  describe('API error codes', () => {
    it('returns error for response_code 1 (NO_RESULTS)', async () => {
      mockFetchResponse({ response_code: 1, results: [] });
      const result = await fetchQuestions(99, 50);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_RESULTS');
      expect(typeof result.error.message).toBe('string');
    });

    it('returns error for response_code 2 (INVALID_PARAMETER)', async () => {
      mockFetchResponse({ response_code: 2, results: [] });
      const result = await fetchQuestions(-1);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('INVALID_PARAMETER');
    });

    it('returns error for response_code 5 (RATE_LIMITED)', async () => {
      mockFetchResponse({ response_code: 5, results: [] });
      const result = await fetchQuestions();
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('network failure', () => {
    it('returns NETWORK_ERROR when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn(() =>
        Promise.reject(new TypeError('Failed to fetch'))
      ));
      const result = await fetchQuestions();
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('Failed to fetch');
    });
  });

  describe('default parameters', () => {
    it('uses amount=10 and no category when called with no args', async () => {
      mockFetchResponse({ response_code: 0, results: [] });
      await fetchQuestions();
      const url = fetch.mock.calls[0][0];
      expect(url).toContain('amount=10');
      expect(url).not.toContain('category=');
    });
  });

  describe('category parameter', () => {
    it('includes category and amount in URL when provided', async () => {
      mockFetchResponse({ response_code: 0, results: [] });
      await fetchQuestions(9, 5);
      const url = fetch.mock.calls[0][0];
      expect(url).toContain('category=9');
      expect(url).toContain('amount=5');
    });
  });
});
