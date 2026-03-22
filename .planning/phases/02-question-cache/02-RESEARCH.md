# Phase 02: Question Cache - Research

**Researched:** 2026-03-22
**Domain:** Node.js file-system caching, module wrapping, per-session state tracking
**Confidence:** HIGH

## Summary

Phase 2 wraps the existing `fetchQuestions` function with a disk-based cache layer. The cache is a transparent cache-through: callers invoke `fetchQuestions` as before, but results are persisted to `data/questions/{categoryId}.json`. On subsequent calls for the same category the cache file is read instead of hitting the API.

The second concern is per-room used-question deduplication. Each Room instance holds a `Set<string>` of question IDs already served in this session. Questions are filtered against that set before being handed to the engine. If the filtered pool is too small, fresh questions are fetched from the API to supplement.

All required APIs (`fs/promises`, `path`, `crypto`) are Node.js 22 built-ins — no new production dependencies are introduced.

**Primary recommendation:** Build `src/fetcher/cached-fetcher.js` as a pure wrapper around `opentrivia.js`, using `fs/promises` for all I/O and a content-hash for stable question IDs.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cache-through wrapper — create `src/fetcher/cached-fetcher.js` that exports the same `fetchQuestions(categoryId, amount)` signature as the raw fetcher
- **D-02:** `room.js` switches its import from `../fetcher/opentrivia.js` to `../fetcher/cached-fetcher.js` — the cache is transparent to callers
- **D-03:** The raw fetcher (`src/fetcher/opentrivia.js`) remains unchanged as a dependency of the cache module
- **D-04:** Cache files live at `data/questions/{categoryId}.json` relative to project root
- **D-05:** Uncategorized fetches (no categoryId) use `data/questions/any.json`
- **D-06:** Each file contains the full array of decoded question objects for that category
- **D-07:** Cache directory (`data/questions/`) is created on first write, not at startup
- **D-08:** Per-room tracking — each Room instance holds a `Set<questionId>` of used question IDs
- **D-09:** When pulling from cache, filter out questions whose IDs are in the used set
- **D-10:** The used set resets when the room is destroyed (natural lifecycle cleanup)
- **D-11:** If cache has fewer unused questions than requested, fetch fresh questions from API to supplement
- **D-12:** No TTL for v2.1 — cached questions never expire automatically
- **D-13:** Cache is permanent until manually deleted (e.g., `rm -rf data/questions/`)
- **D-14:** A `clearCache(categoryId?)` utility function is exported for manual/test use

### Claude's Discretion
- File I/O approach (fs/promises vs sync — async preferred for consistency)
- Exact error handling for disk read/write failures (should degrade to fetch-through)
- Whether to lock files during concurrent writes (probably unnecessary for single-process Node)
- Test structure and mock strategy for filesystem operations

### Deferred Ideas (OUT OF SCOPE)
- TTL-based cache invalidation — future milestone
- Category list caching — Phase 3 may need this for voting UI
- Background pre-fetching of popular categories — future milestone (QPOL-02)
- Session tokens for API-level deduplication — future milestone (QPOL-03)
- Cache size limits / eviction policy — unnecessary for ~24 categories of JSON
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QCACHE-01 | Fetched questions are saved to disk as JSON files organized by category | `fs/promises.writeFile` + `mkdir({recursive:true})` pattern; path `data/questions/{categoryId}.json` |
| QCACHE-02 | Subsequent games in the same category use cached questions before hitting API | `fs/promises.readFile` on cache path; if file exists, parse and return without calling raw fetcher |
| QCACHE-03 | Cache tracks which questions have been used to avoid repeats within a session | `usedQuestionIds = new Set()` on Room; filter cache results before serving; supplement with API fetch if pool too small |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` | built-in (Node 22) | Async read/write/mkdir for cache files | Stdlib; no dep; promise-based matches project async style |
| `node:path` | built-in (Node 22) | Cross-platform path construction (`path.join`, `path.resolve`) | Stdlib; prevents hardcoded separators |
| `node:crypto` | built-in (Node 22) | Content-hash for stable question IDs (see ID problem below) | Stdlib; `crypto.createHash('sha1')` is the correct tool |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:url` (`fileURLToPath`, `import.meta.url`) | built-in (Node 22) | Resolve project root in ESM context | ESM modules cannot use `__dirname`; use `fileURLToPath(new URL('../..', import.meta.url))` |

**No new production npm dependencies required.**

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs/promises` | `fs` sync (`readFileSync`) | Sync blocks event loop; project uses async throughout — rejected |
| content-hash IDs | timestamp IDs (Phase 1 pattern) | Timestamps change on every fetch, breaking cross-session deduplication — content hash is required |
| in-memory Map cache | disk files | In-memory cache lost on server restart; disk is the requirement |

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── fetcher/
│   ├── opentrivia.js        # unchanged raw fetcher (Phase 1)
│   └── cached-fetcher.js    # NEW: cache-through wrapper (this phase)
├── session/
│   └── room.js              # updated: import from cached-fetcher, add usedQuestionIds
data/
└── questions/               # runtime cache (gitignored, created on first write)
    ├── 9.json
    ├── 11.json
    └── any.json
tests/
├── fetcher/
│   ├── opentrivia.test.js   # existing, unchanged
│   └── cached-fetcher.test.js  # NEW
└── integration/
    └── quiz-start.test.js   # existing — update mock target to cached-fetcher
```

### Pattern 1: Cache-Through Wrapper
**What:** Module with the same public signature as the wrapped module. Checks disk before calling upstream. Writes result to disk after upstream call succeeds.
**When to use:** When callers must not change, but behavior needs wrapping.
**Example:**
```js
// Source: Node.js fs/promises docs (official)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchQuestions as fetchFromApi } from './opentrivia.js';

const CACHE_DIR = new URL('../../data/questions/', import.meta.url);

export async function fetchQuestions(categoryId, amount = 10) {
  const cacheKey = categoryId ?? 'any';
  const cachePath = new URL(`${cacheKey}.json`, CACHE_DIR);

  // Try cache read
  try {
    const raw = await readFile(cachePath, 'utf8');
    const cached = JSON.parse(raw);
    // cached is full question array — deduplication handled by room
    return { ok: true, questions: cached };
  } catch {
    // cache miss — fall through to API
  }

  // Cache miss: fetch from API
  const result = await fetchFromApi(categoryId, amount);
  if (!result.ok) return result;

  // Write to cache (create dir on first write)
  await mkdir(new URL('.', cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(result.questions), 'utf8');

  return result;
}
```

### Pattern 2: Content-Hash Question IDs
**What:** Instead of `otdb_${index}_${Date.now()}`, derive ID from question content so the same question always gets the same ID across fetches.
**When to use:** Required for cross-session used-question tracking to work correctly.

The critical problem: Phase 1 uses `otdb_${index}_${Date.now()}` for IDs. The same question fetched at two different times gets two different IDs. If the cache stores Phase-1-generated IDs, the used-set from one session will never match IDs generated by a supplemental fetch in another session — deduplication breaks.

**Solution:** The cached-fetcher normalises IDs before writing to disk:
```js
// Source: Node.js crypto docs (official)
import { createHash } from 'node:crypto';

function stableId(question) {
  const content = question.question + '|' + question.correct_answer;
  return 'otdb_' + createHash('sha1').update(content).digest('hex').slice(0, 12);
}
```
IDs stored in `data/questions/*.json` use this hash. IDs generated by supplemental API fetches also use this hash (the cached-fetcher re-maps them before returning). The raw `opentrivia.js` is unchanged — it still uses timestamps — but `cached-fetcher.js` overwrites the `id` field.

### Pattern 3: Per-Room Used-Question Set
**What:** Room instance holds `usedQuestionIds = new Set()`. After `startGame` returns questions, the IDs are added to the set. On the next `startGame` call, questions in the set are filtered out.

The filtering must happen **inside** `cached-fetcher.fetchQuestions` or in `room.startGame`. Given D-09 says "when pulling from cache, filter out questions whose IDs are in the used set", the used set must be passed into the cached-fetcher — OR filtering happens in `room.js` after calling `fetchQuestions`.

**Recommended: filter in room.js after the call** (simpler, no need to thread the set through the fetcher interface which would change the signature):
```js
// In room.startGame (room.js)
const result = await fetchQuestions(config.categoryId, amount);
if (!result.ok) throw new Error(...);
const unused = result.questions.filter(q => !this.usedQuestionIds.has(q.id));
// If unused < amount, supplement ... (see Pitfall 2)
unused.forEach(q => this.usedQuestionIds.add(q.id));
gameConfig.questions = unused.slice(0, amount);
```

This keeps `fetchQuestions` signature unchanged and avoids threading room state into the fetcher layer.

### Pattern 4: mkdir recursive on first write
**What:** `fs/promises.mkdir(dir, { recursive: true })` is idempotent — safe to call even if directory exists. Correct approach per Node.js docs.
**When to use:** Always call before `writeFile` to ensure parent directories exist.

```js
// Source: Node.js fs/promises official docs
await mkdir(cacheDir, { recursive: true }); // no-op if already exists
await writeFile(cachePath, JSON.stringify(data), 'utf8');
```

### Anti-Patterns to Avoid
- **`__dirname` in ESM:** Always use `fileURLToPath(new URL('.', import.meta.url))` or `URL` objects in ESM modules.
- **Sync fs in async project:** `readFileSync`/`writeFileSync` blocks the event loop; use `fs/promises` throughout.
- **Swallowing write errors silently:** If cache write fails, log a warning but return the questions — degrading to fetch-through is correct, silently ignoring is not.
- **Using raw fetcher IDs in the cache:** Timestamps in IDs make deduplication impossible across sessions. Normalize to content-hash before writing.
- **Missing error propagation shape:** Cache must return `{ ok: false, error: ... }` when both cache and API fail — not `throw`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async file I/O | Custom promise wrappers | `node:fs/promises` | Built-in since Node 10; promise-native |
| Directory creation | Manual `existsSync` + `mkdir` | `mkdir(path, { recursive: true })` | Atomic, race-safe, one line |
| Content hashing | Custom checksum | `node:crypto` `sha1`/`sha256` | Collision-resistant, stdlib |
| Path construction | String concatenation | `node:path` `join`/`resolve` | Handles `/` vs `\`, relative segments |

**Key insight:** Every tool needed for this phase is a Node.js stdlib built-in. The "earn your dependencies" rule is fully satisfied — no new npm packages required.

---

## Common Pitfalls

### Pitfall 1: Timestamp-Based IDs Break Cross-Session Deduplication
**What goes wrong:** Phase 1 generates IDs as `otdb_${index}_${Date.now()}`. The same question fetched twice gets different IDs. When the cache stores these IDs and a new session loads from cache, the `usedQuestionIds` Set from the previous session cannot match IDs from a future supplemental API fetch.
**Why it happens:** `fetchQuestions` in `opentrivia.js` always generates fresh IDs at fetch time.
**How to avoid:** The cached-fetcher normalizes IDs to a content-hash of `(question text + correct_answer)` before writing to disk AND before returning from cache reads. Supplemental API fetches also go through the same normalization.
**Warning signs:** Same question appearing twice in different sessions; `usedQuestionIds` never matching anything.

### Pitfall 2: Insufficient Pool When Supplementing
**What goes wrong:** Cache has 10 questions, 8 are used, caller wants 5 — only 2 unused remain. Naively slicing to 5 returns 2 questions.
**Why it happens:** D-11 says "fetch fresh questions from API to supplement" but the logic to merge and deduplicate is subtle.
**How to avoid:** After filtering, if `unused.length < amount`, call `fetchFromApi` and merge results. Deduplicate by ID between cached and fresh questions before slicing to `amount`.
**Warning signs:** Rooms with repeated questions or games starting with fewer questions than requested.

### Pitfall 3: Concurrent Write Races (low risk but worth noting)
**What goes wrong:** Two rooms start a quiz in the same category simultaneously on a cold cache. Both get a cache miss. Both fetch from API. Both try to write the cache file. The second write overwrites the first.
**Why it happens:** Node.js is single-threaded but two `await fetchFromApi` calls interleave at the await point.
**How to avoid:** The context marks file locking as "probably unnecessary for single-process Node" (Claude's Discretion). The worst case is a redundant write with slightly different content — acceptable for v2.1. No lock needed.
**Warning signs:** Only visible under load testing; not a concern for party game scale.

### Pitfall 4: `data/` Not in `.gitignore`
**What goes wrong:** Cached question JSON files (potentially thousands of lines) get committed.
**Why it happens:** New directory added to project.
**How to avoid:** Verify `.gitignore` already contains `data/` — it does (confirmed in existing `.gitignore`). No action needed.

### Pitfall 5: Cache Write Error Swallowed Too Broadly
**What goes wrong:** An unrelated error (e.g., disk full, permissions) is silently ignored and the cache never populates. Every call hits the API.
**Why it happens:** `try/catch` around cache write catches too broadly.
**How to avoid:** On write failure, `console.warn` the error message and continue. On read failure (expected: ENOENT), silently fall through. Distinguish error types.

### Pitfall 6: Integration Test Still Mocks `opentrivia.js`
**What goes wrong:** `tests/integration/quiz-start.test.js` currently mocks `../../src/fetcher/opentrivia.js`. After `room.js` switches import to `cached-fetcher.js`, the test mock no longer intercepts the call.
**Why it happens:** Vitest mocks resolve at the import path used in the module under test.
**How to avoid:** Update `quiz-start.test.js` to mock `../../src/fetcher/cached-fetcher.js` instead.

---

## Code Examples

Verified patterns from official Node.js docs:

### Reading a JSON cache file
```js
// Source: Node.js fs/promises docs
import { readFile } from 'node:fs/promises';

let cached;
try {
  const raw = await readFile(cachePath, 'utf8');
  cached = JSON.parse(raw);
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.warn('[cache] read error:', err.message);
  }
  cached = null; // cache miss
}
```

### Writing a JSON cache file (mkdir + writeFile)
```js
// Source: Node.js fs/promises docs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

await mkdir(dirname(cachePath), { recursive: true });
await writeFile(cachePath, JSON.stringify(questions), 'utf8');
```

### Stable ID from question content
```js
// Source: Node.js crypto docs
import { createHash } from 'node:crypto';

function stableId(question) {
  const key = question.question + '\0' + question.correct_answer;
  return 'otdb_' + createHash('sha1').update(key).digest('hex').slice(0, 12);
}
```

### ESM-safe path resolution (no __dirname)
```js
// Source: Node.js ESM docs
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '../../data/questions');
```

### Vitest mock for fs/promises (test pattern)
```js
// Source: Vitest docs — vi.mock with factory
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';

beforeEach(() => {
  readFile.mockReset();
  writeFile.mockReset();
  mkdir.mockReset();
  mkdir.mockResolvedValue(undefined);
  writeFile.mockResolvedValue(undefined);
});
```

### Clearing the cache (utility function)
```js
// clearCache(categoryId?) — exported from cached-fetcher.js
import { unlink } from 'node:fs/promises';

export async function clearCache(categoryId) {
  if (categoryId === undefined) {
    // clear all: readdir + unlink each file (or rm -rf via rmdir recursive)
    const { readdir, rm } = await import('node:fs/promises');
    await rm(CACHE_DIR, { recursive: true, force: true });
  } else {
    const key = categoryId ?? 'any';
    await unlink(join(CACHE_DIR, `${key}.json`)).catch(() => {});
  }
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 |
| Config file | none — Vitest uses package.json `"test": "vitest run"` |
| Quick run command | `npx vitest run tests/fetcher/cached-fetcher.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QCACHE-01 | Questions written to `data/questions/{id}.json` after API fetch | unit | `npx vitest run tests/fetcher/cached-fetcher.test.js` | Wave 0 |
| QCACHE-01 | Cache file contains decoded question array as JSON | unit | `npx vitest run tests/fetcher/cached-fetcher.test.js` | Wave 0 |
| QCACHE-02 | Second call with same categoryId returns cached data, no API call | unit | `npx vitest run tests/fetcher/cached-fetcher.test.js` | Wave 0 |
| QCACHE-02 | Cold cache (no file) falls through to API transparently | unit | `npx vitest run tests/fetcher/cached-fetcher.test.js` | Wave 0 |
| QCACHE-03 | Used question IDs are tracked per room in a Set | unit | `npx vitest run tests/integration/quiz-start.test.js` | needs update |
| QCACHE-03 | Filtered questions exclude used IDs | unit | `npx vitest run tests/integration/quiz-start.test.js` | needs update |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/fetcher/cached-fetcher.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/fetcher/cached-fetcher.test.js` — covers QCACHE-01, QCACHE-02 (new file)
- [ ] `tests/integration/quiz-start.test.js` — update mock target from `opentrivia.js` to `cached-fetcher.js`; add QCACHE-03 test cases

*(All other infrastructure: Vitest, test dirs — already in place)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `__dirname` in Node.js | `fileURLToPath(import.meta.url)` | Node 12+ with ESM | Required in this project (ESM) |
| `fs.mkdir` callback | `fs/promises.mkdir({ recursive })` | Node 10.12 | Idempotent, promise-native |
| `fs.writeFile` sync | `fs/promises.writeFile` | Node 10 | Non-blocking |

**No deprecated APIs in this phase's stack.**

---

## Open Questions

1. **Where exactly does the `usedQuestionIds` set get updated?**
   - What we know: D-08 says it lives on the Room instance; D-09 says filter on cache read
   - What's unclear: Whether the ID addition happens inside `cached-fetcher.js` (requiring the set to be passed in) or in `room.js` after the call (no signature change)
   - Recommendation: Filter in `room.js` after `fetchQuestions` returns — keeps fetcher signature identical to Phase 1, aligns with D-02

2. **Should `clearCache` be exported from `cached-fetcher.js` or a separate `cache-utils.js`?**
   - What we know: D-14 requires a `clearCache(categoryId?)` export
   - What's unclear: Co-locating it in `cached-fetcher.js` is simplest; a separate file is cleaner if tests import it independently
   - Recommendation: Export from `cached-fetcher.js` directly — simpler, single module to import in tests

3. **Should the cache store the raw question objects (with stable IDs already normalized), or the raw API response?**
   - What we know: D-06 says "full array of decoded question objects"; Phase 1 already decodes HTML on fetch
   - What's unclear: Whether to re-normalize IDs when writing vs. when reading
   - Recommendation: Normalize IDs on write (one-time cost); read is then zero-cost — store stable-ID objects in the JSON file

---

## Sources

### Primary (HIGH confidence)
- Node.js 22 official docs — `fs/promises` API (readFile, writeFile, mkdir, rm, unlink)
- Node.js 22 official docs — `path` module (join, resolve, dirname)
- Node.js 22 official docs — `crypto` module (createHash)
- Node.js 22 official docs — ESM / `import.meta.url` for `__dirname` equivalent
- Vitest 3.x docs — `vi.mock` factory pattern, `mockReset`, module mocking

### Secondary (MEDIUM confidence)
- Phase 1 implementation (`src/fetcher/opentrivia.js`) — ID generation pattern and result wrapper shape confirmed by direct file read
- Existing test files — `vi.mock`, `vi.stubGlobal`, `mockResolvedValue` patterns confirmed by direct file read

### Tertiary (LOW confidence)
- None — all claims verified from code or official stdlib

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Node.js stdlib, confirmed against project constraints
- Architecture: HIGH — based on direct reading of existing files and locked decisions in CONTEXT.md
- Pitfalls: HIGH — derived from analysis of existing code (ID timestamp problem confirmed by reading `opentrivia.js` line 70); integration test mock issue confirmed by reading `quiz-start.test.js` line 6

**Research date:** 2026-03-22
**Valid until:** 2026-09-22 (Node.js stdlib is stable; 6-month validity)
