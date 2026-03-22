---
phase: 02-question-cache
plan: 01
subsystem: api
tags: [node-fs, crypto, sha1, cache, opentrivia, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-question-fetcher
    provides: opentrivia.js fetchQuestions(categoryId, amount) with {ok, questions/error} result wrapper
provides:
  - Disk-based cache-through wrapper: src/fetcher/cached-fetcher.js
  - Same fetchQuestions/clearCache API as opentrivia.js (transparent to callers)
  - Content-hash stable question IDs (sha1 of question+correct_answer)
  - Cache at data/questions/{categoryId}.json, graceful error degradation
affects:
  - 02-02 (used-question tracking — builds on this cache layer)
  - 03-category-voting (room.js import switch to cached-fetcher)

# Tech tracking
tech-stack:
  added: [node:fs/promises, node:crypto (sha1), node:url (fileURLToPath)]
  patterns:
    - Cache-through wrapper with same public interface as wrapped module
    - Content-hash IDs for stable cross-session deduplication
    - Graceful error degradation (warn + fetch-through, never crash)
    - mkdir({recursive:true}) idempotent directory creation on first write

key-files:
  created:
    - src/fetcher/cached-fetcher.js
    - tests/fetcher/cached-fetcher.test.js
  modified: []

key-decisions:
  - "Content-hash IDs via sha1(question+null+correct_answer) replace timestamp-based IDs from opentrivia.js — necessary for cross-session deduplication to work"
  - "dirname(cachePath) used for mkdir call — matches plan's explicit path.dirname approach over URL-based approach from research Pattern 1"
  - "ID normalization happens at write time so cache reads are zero-cost (no re-hashing needed)"
  - "clearCache(undefined) removes entire data/questions/ directory; clearCache(null) removes any.json"

patterns-established:
  - "Pattern: cache-through wrapper — same fetchQuestions(categoryId, amount) signature, reads cache first, writes on miss"
  - "Pattern: content-hash stable IDs — stableId(q) = 'otdb_' + sha1(q.question + NUL + q.correct_answer).slice(0,12)"
  - "Pattern: graceful fs degradation — ENOENT is silent, other read errors warn+fallthrough, write errors warn+return"
  - "Pattern: vi.mock with factory for node:fs/promises and opentrivia.js in Vitest"

requirements-completed: [QCACHE-01, QCACHE-02]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 02 Plan 01: Question Cache — cached-fetcher Summary

**Disk-based cache-through wrapper using sha1 content-hash IDs: fetchQuestions reads from data/questions/{id}.json on warm cache, fetches API and writes disk on cold cache, degrades gracefully on I/O errors**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-22T05:03:41Z
- **Completed:** 2026-03-22T05:05:27Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- `src/fetcher/cached-fetcher.js`: transparent cache-through wrapper with identical signature to opentrivia.js
- Stable content-hash IDs (sha1) replacing timestamp-based IDs — enables cross-session deduplication in Plan 02
- Full test coverage: 17 tests covering cold/warm cache, null categoryId, stable IDs, API error passthrough, I/O error degradation, clearCache variants

## Task Commits

1. **Task 1: TDD cached-fetcher — tests and implementation** - `2c6fbc8` (feat)

**Plan metadata:** (docs commit below)

_Note: TDD tasks have RED (failing tests) then GREEN (implementation) in a single commit per the plan's instruction to combine them._

## Files Created/Modified

- `src/fetcher/cached-fetcher.js` — Cache-through wrapper: fetchQuestions reads disk cache or falls through to API, clearCache removes file(s)
- `tests/fetcher/cached-fetcher.test.js` — 17 unit tests with vi.mock for fs/promises and opentrivia.js; covers all specified behaviors

## Decisions Made

- Used `dirname(fileURLToPath(import.meta.url))` + `resolve(__dirname, '../../data/questions')` for ESM-safe cache path (matches research docs exactly)
- stableId uses `'\0'` (null byte) as separator between question and correct_answer — same as plan spec, collision-resistant
- ID normalization at write time: cache always stores stable IDs, reads are zero-cost
- `clearCache(null)` uses 'any' key (matches null categoryId convention); `clearCache(undefined)` removes entire directory

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/fetcher/cached-fetcher.js` ready for Phase 02 Plan 02 (used-question tracking on top of this cache)
- Phase 03 (category voting) will switch `room.js` import from `opentrivia.js` to `cached-fetcher.js` — interface is identical, no callers change
- `data/questions/` directory is gitignored (pre-existing .gitignore entry confirmed in research)

---
*Phase: 02-question-cache*
*Completed: 2026-03-22*
