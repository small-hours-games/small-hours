import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchCategories } from '../../src/fetcher/opentrivia.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_TRIVIA_CATEGORIES = [
  { id: 9, name: 'General Knowledge' },
  { id: 10, name: 'Entertainment: Books' },
  { id: 11, name: 'Entertainment: Film' },
];

function mockFetchCategories(body) {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    })
  ));
}

describe('fetchCategories (raw API)', () => {
  it('returns { ok: true, categories: [{id, name}, ...] } when API succeeds', async () => {
    mockFetchCategories({ trivia_categories: SAMPLE_TRIVIA_CATEGORIES });

    const result = await fetchCategories();

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
    expect(result.categories).toHaveLength(3);
    expect(result.categories[0]).toEqual({ id: 9, name: 'General Knowledge' });
  });

  it('returns { ok: false, error: { code: "NETWORK_ERROR", message } } when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    ));

    const result = await fetchCategories();

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('NETWORK_ERROR');
    expect(result.error.message).toBe('Failed to fetch');
  });

  it('returns categories with shape { id: number, name: string } and no extra fields', async () => {
    const categories = [
      { id: 9, name: 'General Knowledge', extra_field: 'should be stripped' },
    ];
    mockFetchCategories({ trivia_categories: categories });

    const result = await fetchCategories();

    expect(result.ok).toBe(true);
    const cat = result.categories[0];
    expect(typeof cat.id).toBe('number');
    expect(typeof cat.name).toBe('string');
    expect(Object.keys(cat)).toEqual(['id', 'name']);
  });

  it('hits the correct URL: https://opentdb.com/api_category.php', async () => {
    mockFetchCategories({ trivia_categories: [] });

    await fetchCategories();

    const url = fetch.mock.calls[0][0];
    expect(url).toBe('https://opentdb.com/api_category.php');
  });
});
