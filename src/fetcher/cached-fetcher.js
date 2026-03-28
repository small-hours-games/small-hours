// Disk-based cache-through wrapper for the OpenTrivia DB fetcher.
// Exports the same fetchQuestions(categoryId, amount) signature as opentrivia.js.
// Questions are cached to data/questions/{categoryId}.json after fetching,
// and served from disk on subsequent calls. Question IDs are content-hashed
// for stable cross-session deduplication.

import { readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fetchQuestions as fetchFromApi, fetchCategories as fetchCategoriesFromApi } from './opentrivia.js';
import { generateAudioForQuestions } from './cached-tts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '../../data/questions');
const CATEGORY_CACHE_PATH = resolve(__dirname, '../../data/categories.json');

/**
 * Compute a stable, content-based question ID.
 * Uses sha1 of (question text + null byte + correct_answer).
 * This ensures the same question always gets the same ID regardless of when it was fetched.
 *
 * @param {object} question - Question object with .question and .correct_answer fields
 * @returns {string} Stable ID like "otdb_abc123def456"
 */
function stableId(question) {
  const key = question.question + '\0' + question.correct_answer;
  return 'otdb_' + createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/**
 * Normalize question IDs to stable content-hashes.
 *
 * @param {Array} questions - Array of question objects
 * @returns {Array} Questions with stable IDs replacing timestamp-based IDs
 */
function normalizeIds(questions) {
  return questions.map(q => ({ ...q, id: stableId(q) }));
}

/**
 * Fetch quiz questions, using disk cache when available.
 *
 * Cache hit: reads from data/questions/{categoryId}.json, returns without API call.
 * Cache miss: calls the raw API fetcher, normalizes IDs, writes to disk, returns result.
 * Error degradation: disk read errors (non-ENOENT) log a warning and fall through to API.
 *                    disk write errors log a warning but still return questions.
 *
 * @param {number|null} [categoryId] - OpenTrivia DB category ID. null/undefined uses "any".
 * @param {number} [amount=10] - Number of questions to fetch (used only on cache miss)
 * @returns {Promise<{ok: true, questions: Array} | {ok: false, error: {code, message}}>}
 */
export async function fetchQuestions(categoryId, amount = 10) {
  const cacheKey = categoryId ?? 'any';
  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);

  // Try to serve from cache
  try {
    const raw = await readFile(cachePath, 'utf8');
    const cached = JSON.parse(raw);
    return { ok: true, questions: cached };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Unexpected read error — log and fall through to API
      console.warn('[cache] read error:', err.message);
    }
    // ENOENT = normal cache miss, fall through silently
  }

  // Cache miss: fetch from API
  const result = await fetchFromApi(categoryId, amount);
  if (!result.ok) {
    // API error — don't cache, return error as-is
    return result;
  }

  // Normalize IDs from timestamp-based to content-hash before caching
  const normalized = normalizeIds(result.questions);

  // Write to cache (create directory on first write)
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(normalized), 'utf8');
  } catch (err) {
    // Write failure is non-fatal — degrade to fetch-through
    console.warn('[cache] write error:', err.message);
  }

  // Fire-and-forget: generate TTS audio in background
  generateAudioForQuestions(normalized).catch(err =>
    console.warn('[tts] batch generation error:', err.message)
  );

  return { ok: true, questions: normalized };
}

/**
 * Fetch quiz categories, using disk cache when available.
 *
 * Cache hit: reads from data/categories.json, returns without API call.
 * Cache miss: calls the raw API fetcher, writes to disk, returns result.
 * Cache never expires — categories are stable and rarely change.
 * Disk write errors are non-fatal: returns API result without writing.
 *
 * @returns {Promise<{ok: true, categories: Array<{id: number, name: string}>} | {ok: false, error: {code, message}}>}
 */
export async function fetchCategories() {
  // Try disk cache first (never expires)
  try {
    const raw = await readFile(CATEGORY_CACHE_PATH, 'utf8');
    return { ok: true, categories: JSON.parse(raw) };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[cache] category read error:', err.message);
    }
    // ENOENT = normal cache miss, fall through silently
  }

  // Cache miss: fetch from API
  const result = await fetchCategoriesFromApi();
  if (!result.ok) return result;

  // Write to disk (non-fatal on error)
  try {
    await mkdir(dirname(CATEGORY_CACHE_PATH), { recursive: true });
    await writeFile(CATEGORY_CACHE_PATH, JSON.stringify(result.categories), 'utf8');
  } catch (err) {
    console.warn('[cache] category write error:', err.message);
  }

  return result;
}

/**
 * Pre-warm the question cache at server startup.
 * Fetches all categories, then questions for each category.
 * Non-fatal: logs warnings on partial failures and continues.
 * Already-cached categories/questions are skipped (disk hit = no API call).
 */
export async function prewarmCache() {
  // 1. Fetch categories (hits disk if already cached)
  const catResult = await fetchCategories();
  if (!catResult.ok) {
    console.warn('[prewarm] could not fetch categories:', catResult.error.message);
    return;
  }
  console.log(`[prewarm] warming ${catResult.categories.length} categories...`);

  // 2. For each category, fetch questions (hits disk if already cached)
  let warmed = 0;
  for (const cat of catResult.categories) {
    const result = await fetchQuestions(cat.id, 50);
    if (result.ok) {
      warmed++;
    } else {
      console.warn(`[prewarm] failed category ${cat.id} (${cat.name}):`, result.error.message);
    }
  }
  // Also warm the "any category" bucket
  const anyResult = await fetchQuestions(null, 50);
  if (anyResult.ok) warmed++;

  console.log(`[prewarm] done — ${warmed}/${catResult.categories.length + 1} buckets ready`);
}

/**
 * Clear cached questions.
 *
 * @param {number|null} [categoryId] - If provided, removes only that category's file.
 *                                      If undefined, removes the entire data/questions/ directory.
 */
export async function clearCache(categoryId) {
  if (categoryId === undefined) {
    // Clear all: remove the entire cache directory
    await rm(CACHE_DIR, { recursive: true, force: true });
  } else {
    // Clear one category
    const key = categoryId ?? 'any';
    await unlink(join(CACHE_DIR, `${key}.json`)).catch(() => {});
  }
}
