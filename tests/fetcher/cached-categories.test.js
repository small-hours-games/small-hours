// Tests for the cache-through fetchCategories() in cached-fetcher.js
// Uses vi.mock for fs/promises and opentrivia.js to avoid I/O and network calls.

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
  fetchCategories: vi.fn(),
  fetchQuestions: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchCategories as fetchCategoriesFromApi } from '../../src/fetcher/opentrivia.js';
import { fetchCategories as cachedFetchCategories } from '../../src/fetcher/cached-fetcher.js';

const SAMPLE_CATEGORIES = [
  { id: 9, name: 'General Knowledge' },
  { id: 10, name: 'Entertainment: Books' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mkdir.mockResolvedValue(undefined);
  writeFile.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cached fetchCategories', () => {
  it('cache hit: readFile returns JSON, returns it without calling API', async () => {
    readFile.mockResolvedValue(JSON.stringify(SAMPLE_CATEGORIES));

    const result = await cachedFetchCategories();

    expect(fetchCategoriesFromApi).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.categories).toEqual(SAMPLE_CATEGORIES);
  });

  it('cache miss (ENOENT): calls fetchCategoriesFromApi, writes to disk, returns categories', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fetchCategoriesFromApi.mockResolvedValue({ ok: true, categories: SAMPLE_CATEGORIES });

    const result = await cachedFetchCategories();

    expect(fetchCategoriesFromApi).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    const [writePath, writeContent] = writeFile.mock.calls[0];
    expect(writePath).toMatch(/data[/\\]categories\.json/);
    const written = JSON.parse(writeContent);
    expect(written).toEqual(SAMPLE_CATEGORIES);
    expect(result.ok).toBe(true);
    expect(result.categories).toEqual(SAMPLE_CATEGORIES);
  });

  it('API error on cache miss: returns {ok: false, error} without writing to disk', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fetchCategoriesFromApi.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'Connection refused' },
    });

    const result = await cachedFetchCategories();

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NETWORK_ERROR');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('disk write error is non-fatal: still returns categories from API', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fetchCategoriesFromApi.mockResolvedValue({ ok: true, categories: SAMPLE_CATEGORIES });
    writeFile.mockRejectedValue(new Error('Disk full'));

    const result = await cachedFetchCategories();

    expect(warnSpy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.categories).toEqual(SAMPLE_CATEGORIES);
  });

  it('cache file path resolves to data/categories.json relative to project root', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fetchCategoriesFromApi.mockResolvedValue({ ok: true, categories: SAMPLE_CATEGORIES });

    await cachedFetchCategories();

    // Verify readFile was called with a path ending in data/categories.json
    const [readPath] = readFile.mock.calls[0];
    expect(readPath).toMatch(/data[/\\]categories\.json$/);
    // Should NOT be inside data/questions/
    expect(readPath).not.toMatch(/data[/\\]questions/);
  });
});
