#!/usr/bin/env node
// Pre-warm the question cache by fetching 50 questions per category from OpenTrivia DB.
// Skips categories that already have a cache file on disk.
// Usage: node scripts/seed-questions.js [--force]
//   --force: re-fetch even if cache file exists

import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchQuestions, clearCache } from '../src/fetcher/cached-fetcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '../data/questions');

const CATEGORIES = [
  { id: null, name: 'Any Category' },
  { id: 9,  name: 'General Knowledge' },
  { id: 10, name: 'Books' },
  { id: 11, name: 'Film' },
  { id: 12, name: 'Music' },
  { id: 14, name: 'Television' },
  { id: 15, name: 'Video Games' },
  { id: 17, name: 'Science & Nature' },
  { id: 18, name: 'Computers' },
  { id: 20, name: 'Mythology' },
  { id: 21, name: 'Sports' },
  { id: 22, name: 'Geography' },
  { id: 23, name: 'History' },
  { id: 27, name: 'Animals' },
];

const AMOUNT = 50; // max the API supports per request
const DELAY_MS = 6000; // respect rate limit (~1 req per 5s)

const force = process.argv.includes('--force');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function cacheExists(categoryId) {
  const key = categoryId ?? 'any';
  try {
    await readFile(join(CACHE_DIR, `${key}.json`), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Seeding question cache (${CATEGORIES.length} categories, ${AMOUNT} questions each)`);
  if (force) console.log('--force: re-fetching all categories');

  let fetched = 0;
  let skipped = 0;

  for (const cat of CATEGORIES) {
    const label = cat.name + (cat.id ? ` (${cat.id})` : '');

    if (!force && await cacheExists(cat.id)) {
      console.log(`  skip: ${label} (cached)`);
      skipped++;
      continue;
    }

    if (force && cat.id !== undefined) {
      await clearCache(cat.id);
    }

    // Rate limit delay (skip before first request)
    if (fetched > 0) {
      await sleep(DELAY_MS);
    }

    const result = await fetchQuestions(cat.id, AMOUNT);
    if (result.ok) {
      console.log(`  done: ${label} — ${result.questions.length} questions`);
      fetched++;
    } else {
      console.warn(`  FAIL: ${label} — ${result.error.code}: ${result.error.message}`);
    }
  }

  console.log(`\nSeeded ${fetched} categories, skipped ${skipped} (already cached).`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
