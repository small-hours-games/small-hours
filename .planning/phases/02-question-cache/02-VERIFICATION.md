---
phase: 02-question-cache
verified: 2026-03-22T05:13:36Z
status: passed
score: 12/12 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 12/12
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 02: Question Cache Verification Report

**Phase Goal:** Fetched questions are saved to disk and reused on subsequent games, with used questions tracked to avoid repeats
**Verified:** 2026-03-22T05:13:36Z
**Status:** passed
**Re-verification:** Yes -- confirming previous pass, no regressions

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | After fetchQuestions(9, 5) on cold cache, data/questions/9.json exists on disk containing a JSON array of question objects | VERIFIED | Implementation at lines 69-87 of cached-fetcher.js: ENOENT triggers API call, writeFile writes to `CACHE_DIR/{cacheKey}.json`; test "writes questions to data/questions/{categoryId}.json on cache miss" asserts path matches `/data[/\\]questions[/\\]9\.json/` |
| 2  | After fetchQuestions(9, 5) on warm cache, no API call is made -- questions returned from disk | VERIFIED | Lines 56-66: readFile is tried first; on success, returns immediately without calling fetchFromApi; test "reads from disk and does NOT call fetchFromApi when cache file exists" asserts `expect(fetchFromApi).not.toHaveBeenCalled()` |
| 3  | fetchQuestions(null, 5) uses data/questions/any.json as cache key | VERIFIED | Line 52: `const cacheKey = categoryId ?? 'any'`; two tests confirm null and undefined both route to any.json |
| 4  | clearCache(9) removes data/questions/9.json; clearCache() removes the entire data/questions/ directory | VERIFIED | Lines 96-104: `clearCache(undefined)` calls `rm(CACHE_DIR, {recursive,force})`; `clearCache(categoryId)` calls `unlink(join(CACHE_DIR, key+'.json'))`; 4 clearCache tests all pass |
| 5  | Question IDs are content-hashed (stable across fetches), not timestamp-based | VERIFIED | stableId() at lines 24-27 uses `createHash('sha1')` on `question+'\0'+correct_answer`, slicing to 12 hex chars; test "same question text always produces the same ID" confirms determinism across two fetch calls |
| 6  | Disk read/write errors degrade gracefully -- fetch-through, not crash | VERIFIED | Read errors: ENOENT is silent, other codes warn and fall through (lines 60-66); write errors caught and warned, questions still returned (lines 79-85); two error degradation tests pass |
| 7  | Room instance has a usedQuestionIds Set that tracks question IDs served in that room | VERIFIED | `this.usedQuestionIds = new Set()` at room.js line 76; integration test "usedQuestionIds is per-room instance" asserts instanceof Set |
| 8  | Questions returned by fetchQuestions are filtered against usedQuestionIds before being passed to the quiz engine | VERIFIED | room.js line 215: `let unused = result.questions.filter(q => !this.usedQuestionIds.has(q.id))`; integration test "tracks used question IDs across quiz starts" asserts otdb_aaa is excluded leaving only otdb_ccc |
| 9  | If filtering leaves fewer unused questions than requested, the room calls fetchQuestions again to supplement (and deduplicates the combined pool) | VERIFIED | room.js lines 218-230: supplement block calls fetchQuestions again, de-dupes by existingIds Set; integration test "supplements with fresh fetch when too few unused questions" passes |
| 10 | The usedQuestionIds set is populated after questions are selected for a game | VERIFIED | room.js lines 233-236: `for (const q of selected) { this.usedQuestionIds.add(q.id); }` executes after slice |
| 11 | The same question never appears twice in the same room across multiple quiz games | VERIFIED | Dedup filter (truth 8) + per-room isolation (truth 7) together enforce this; integration tests validate end-to-end behavior |
| 12 | Integration test mocks cached-fetcher.js (not opentrivia.js) since room.js now imports from cached-fetcher | VERIFIED | quiz-start.test.js line 6: `vi.mock('../../src/fetcher/cached-fetcher.js', ...)`; no opentrivia reference in quiz-start.test.js |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/fetcher/cached-fetcher.js` | Cache-through wrapper around opentrivia.js fetchQuestions; exports fetchQuestions and clearCache | VERIFIED | 105 lines, substantive implementation; exports confirmed; content-hash IDs, graceful error handling, disk I/O all present |
| `tests/fetcher/cached-fetcher.test.js` | Unit tests for cache read, cache write, cache miss, stable IDs, clearCache, error degradation; min 80 lines | VERIFIED | 286 lines; 17 tests across 7 describe blocks; all specified behaviors covered |
| `src/session/room.js` | Room with usedQuestionIds Set, cached-fetcher import, dedup + supplement logic; contains "usedQuestionIds" | VERIFIED | 283 lines; usedQuestionIds appears 4 times; full dedup+supplement logic at lines 205-238 |
| `tests/integration/quiz-start.test.js` | Updated integration tests mocking cached-fetcher, plus used-question dedup tests; min 80 lines | VERIFIED | 138 lines; 7 tests (4 original + 3 dedup); mock target is cached-fetcher |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/fetcher/cached-fetcher.js` | `src/fetcher/opentrivia.js` | `import { fetchQuestions as fetchFromApi }` | VERIFIED | Line 11 of cached-fetcher.js: `import { fetchQuestions as fetchFromApi } from './opentrivia.js'`; fetchFromApi called on cache miss at line 69 |
| `src/fetcher/cached-fetcher.js` | `data/questions/{categoryId}.json` | `fs/promises readFile/writeFile` | VERIFIED | readFile at line 57, writeFile at line 81; cachePath constructed as `join(CACHE_DIR, cacheKey + '.json')` |
| `src/session/room.js` | `src/fetcher/cached-fetcher.js` | `import { fetchQuestions } from '../fetcher/cached-fetcher.js'` | VERIFIED | Line 8 of room.js: exact import; zero opentrivia references remain in room.js |
| `src/session/room.js` | `this.usedQuestionIds` | `Set<string> for tracking used question IDs` | VERIFIED | Constructor line 76 initializes Set; filter at line 215 reads it; add at line 235 writes it |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QCACHE-01 | 02-01 | Fetched questions are saved to disk as JSON files organized by category | SATISFIED | cached-fetcher.js writes to `data/questions/{categoryId}.json` on cache miss; writeFile called with correct path (17 unit tests, all passing) |
| QCACHE-02 | 02-01 | Subsequent games in the same category use cached questions before hitting API | SATISFIED | cached-fetcher.js reads from disk first; fetchFromApi only called on ENOENT; warm-cache tests confirm no API call made |
| QCACHE-03 | 02-02 | Cache tracks which questions have been used to avoid repeats within a session | SATISFIED | Room.usedQuestionIds Set persists across game starts; filter+supplement logic prevents repeat delivery; 3 integration tests validate this |

No orphaned requirements: REQUIREMENTS.md marks QCACHE-01, QCACHE-02, QCACHE-03 all assigned to Phase 2 and complete. All three are accounted for in plans.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| -- | -- | -- | -- | None found |

Scan performed on: `src/fetcher/cached-fetcher.js`, `src/session/room.js`, `tests/fetcher/cached-fetcher.test.js`, `tests/integration/quiz-start.test.js`. No TODO, FIXME, placeholder stubs, empty implementations, or hardcoded empty collections that flow to output were found.

---

### Human Verification Required

None required. All behaviors are verifiable programmatically through unit and integration tests.

---

### Test Suite Results

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/fetcher/cached-fetcher.test.js` | 17 | All pass |
| `tests/integration/quiz-start.test.js` | 7 | All pass |
| Full suite (`npx vitest run`) | 91 | All pass (8 files) |

---

### Summary

Phase 02 goal is fully achieved. The question cache pipeline is complete end-to-end:

1. **Disk persistence (QCACHE-01):** `cached-fetcher.js` writes fetched questions to `data/questions/{categoryId}.json` on first fetch. Cache key `any` is used for null/undefined categoryId. Directory is created recursively on first write.

2. **Cache-through reads (QCACHE-02):** Subsequent calls read from disk without hitting the OpenTrivia API. Non-ENOENT read errors and all write errors degrade gracefully (warn + continue) rather than crashing.

3. **Used-question deduplication (QCACHE-03):** `Room` instances carry a `usedQuestionIds` Set initialized in the constructor. Before each quiz start, fetched questions are filtered against this set. When the filtered pool is too small, a supplement fetch is made and de-duplicated against both the used set and the already-selected pool. Selected questions are added to `usedQuestionIds` before the game starts.

All requirement IDs (QCACHE-01, QCACHE-02, QCACHE-03) are satisfied with substantive implementation and test coverage. No stubs, no orphaned artifacts, no broken wiring.

---

_Verified: 2026-03-22T05:13:36Z_
_Verifier: Claude (gsd-verifier)_
