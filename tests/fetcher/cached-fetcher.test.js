import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be hoisted before any imports that use these mocks
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('../../src/fetcher/opentrivia.js', () => ({
  fetchQuestions: vi.fn(),
}));

import { readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { fetchQuestions as fetchFromApi } from '../../src/fetcher/opentrivia.js';
import { fetchQuestions, clearCache } from '../../src/fetcher/cached-fetcher.js';

const SAMPLE_QUESTIONS = [
  {
    question: 'What is the capital of France?',
    correct_answer: 'Paris',
    incorrect_answers: ['London', 'Berlin', 'Madrid'],
    category: 'Geography',
    difficulty: 'easy',
    id: 'otdb_0_old_timestamp',
  },
  {
    question: 'What is 2 + 2?',
    correct_answer: '4',
    incorrect_answers: ['3', '5', '6'],
    category: 'Math',
    difficulty: 'easy',
    id: 'otdb_1_old_timestamp',
  },
];

// Stable IDs derived from content hash for the above questions
// Question 1: 'What is the capital of France?\0Paris' -> sha1 -> first 12 hex chars
// Question 2: 'What is 2 + 2?\04' -> sha1 -> first 12 hex chars
// We'll verify they start with 'otdb_' and are consistent

beforeEach(() => {
  vi.clearAllMocks();
  mkdir.mockResolvedValue(undefined);
  writeFile.mockResolvedValue(undefined);
  rm.mockResolvedValue(undefined);
  unlink.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cached-fetcher', () => {
  describe('cold cache (cache miss)', () => {
    it('calls fetchFromApi when cache file does not exist (ENOENT)', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      const result = await fetchQuestions(9, 5);

      expect(fetchFromApi).toHaveBeenCalledWith(9, 5);
      expect(result.ok).toBe(true);
      expect(result.questions).toHaveLength(2);
    });

    it('writes questions to data/questions/{categoryId}.json on cache miss', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      await fetchQuestions(9, 5);

      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
      const [writePath, writeContent] = writeFile.mock.calls[0];
      expect(writePath).toMatch(/data[/\\]questions[/\\]9\.json/);
      const written = JSON.parse(writeContent);
      expect(Array.isArray(written)).toBe(true);
      expect(written).toHaveLength(2);
    });

    it('creates data/questions/ directory recursively on first write', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      await fetchQuestions(9, 5);

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('warm cache (cache hit)', () => {
    it('reads from disk and does NOT call fetchFromApi when cache file exists', async () => {
      const cachedQuestions = [
        {
          question: 'Q?',
          correct_answer: 'A',
          incorrect_answers: ['B', 'C', 'D'],
          category: 'Test',
          difficulty: 'easy',
          id: 'otdb_abc123abc123',
        },
      ];
      readFile.mockResolvedValue(JSON.stringify(cachedQuestions));

      const result = await fetchQuestions(9, 5);

      expect(fetchFromApi).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.questions).toEqual(cachedQuestions);
    });

    it('returns all expected question fields from cache', async () => {
      const cachedQuestions = [
        {
          question: 'What is H?',
          correct_answer: 'Hydrogen',
          incorrect_answers: ['Helium', 'Oxygen', 'Carbon'],
          category: 'Science',
          difficulty: 'medium',
          id: 'otdb_abc123abc123',
        },
      ];
      readFile.mockResolvedValue(JSON.stringify(cachedQuestions));

      const result = await fetchQuestions(9, 5);

      const q = result.questions[0];
      expect(q).toHaveProperty('question');
      expect(q).toHaveProperty('correct_answer');
      expect(q).toHaveProperty('incorrect_answers');
      expect(q).toHaveProperty('category');
      expect(q).toHaveProperty('difficulty');
      expect(q).toHaveProperty('id');
    });
  });

  describe('null categoryId uses "any" as cache key', () => {
    it('uses data/questions/any.json when categoryId is null', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      await fetchQuestions(null, 5);

      const [writePath] = writeFile.mock.calls[0];
      expect(writePath).toMatch(/data[/\\]questions[/\\]any\.json/);
    });

    it('uses data/questions/any.json when categoryId is undefined', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      await fetchQuestions(undefined, 5);

      const [writePath] = writeFile.mock.calls[0];
      expect(writePath).toMatch(/data[/\\]questions[/\\]any\.json/);
    });
  });

  describe('content-hashed (stable) question IDs', () => {
    it('assigns stable content-hashed IDs (not timestamp-based) before writing to cache', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      await fetchQuestions(9, 5);

      const [, writeContent] = writeFile.mock.calls[0];
      const written = JSON.parse(writeContent);
      // IDs must not contain timestamps (they are long numbers)
      for (const q of written) {
        expect(q.id).toMatch(/^otdb_[a-f0-9]{12}$/);
      }
    });

    it('same question text always produces the same ID (stable across fetches)', async () => {
      // Two fetches with same question should produce same ID
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: [SAMPLE_QUESTIONS[0]] });

      await fetchQuestions(9, 5);
      const [, writeContent1] = writeFile.mock.calls[0];
      const written1 = JSON.parse(writeContent1);

      // Reset and fetch again
      vi.clearAllMocks();
      mkdir.mockResolvedValue(undefined);
      writeFile.mockResolvedValue(undefined);
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: [SAMPLE_QUESTIONS[0]] });

      await fetchQuestions(9, 5);
      const [, writeContent2] = writeFile.mock.calls[0];
      const written2 = JSON.parse(writeContent2);

      expect(written1[0].id).toBe(written2[0].id);
    });

    it('returns questions with stable IDs from cold cache fetch', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      const result = await fetchQuestions(9, 5);

      for (const q of result.questions) {
        expect(q.id).toMatch(/^otdb_[a-f0-9]{12}$/);
      }
    });
  });

  describe('API error passthrough (no cache write)', () => {
    it('returns the API error as-is when API returns ok: false', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({
        ok: false,
        error: { code: 'NO_RESULTS', message: 'Not enough questions' },
      });

      const result = await fetchQuestions(9, 5);

      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('NO_RESULTS');
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('error degradation', () => {
    it('falls through to API fetch when readFile fails with non-ENOENT error', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      readFile.mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });

      const result = await fetchQuestions(9, 5);

      expect(warnSpy).toHaveBeenCalled();
      expect(fetchFromApi).toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });

    it('still returns questions when writeFile fails (degrade to fetch-through)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      fetchFromApi.mockResolvedValue({ ok: true, questions: SAMPLE_QUESTIONS });
      writeFile.mockRejectedValue(new Error('Disk full'));

      const result = await fetchQuestions(9, 5);

      expect(warnSpy).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.questions).toHaveLength(2);
    });
  });

  describe('clearCache', () => {
    it('clears a specific category file when categoryId is provided', async () => {
      await clearCache(9);

      expect(unlink).toHaveBeenCalled();
      const [unlinkPath] = unlink.mock.calls[0];
      expect(unlinkPath).toMatch(/data[/\\]questions[/\\]9\.json/);
    });

    it('uses "any" as key when clearCache is called with null', async () => {
      await clearCache(null);

      const [unlinkPath] = unlink.mock.calls[0];
      expect(unlinkPath).toMatch(/data[/\\]questions[/\\]any\.json/);
    });

    it('removes the entire data/questions/ directory when called with no args', async () => {
      await clearCache();

      expect(rm).toHaveBeenCalledWith(expect.stringMatching(/data[/\\]questions/), {
        recursive: true,
        force: true,
      });
    });

    it('does not throw if the specific file does not exist (unlink swallowed)', async () => {
      unlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(clearCache(9)).resolves.not.toThrow();
    });
  });
});
