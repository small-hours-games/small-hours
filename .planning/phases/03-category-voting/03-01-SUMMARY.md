---
phase: 03-category-voting
plan: 01
subsystem: api
tags: [opentrivia, fetcher, cache, disk-cache]

# Dependency graph
requires:
  - phase: 02-question-cache
    provides: cached-fetcher.js cache-through pattern and result wrapper {ok, data}/{ok, error}
provides:
  - fetchCategories() raw API export from src/fetcher/opentrivia.js
  - fetchCategories() cache-through export from src/fetcher/cached-fetcher.js
  - Category shape {id: number, name: string} with no extra fields
  - data/categories.json disk cache (never expires)
affects: [03-02-category-voting-game, quiz game integration, room.startGame]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-through fetch: read disk -> API on miss -> write disk; errors non-fatal"
    - "Result wrapper: {ok: true, data} / {ok: false, error: {code, message}}"
    - "vi.mock hoisting requires separate test files when mixing real-module and mock-module tests"

key-files:
  created:
    - tests/fetcher/opentrivia-categories.test.js
    - tests/fetcher/cached-categories.test.js
  modified:
    - src/fetcher/opentrivia.js
    - src/fetcher/cached-fetcher.js

key-decisions:
  - "Split test file into two (opentrivia-categories.test.js and cached-categories.test.js) because vi.mock is hoisted to top of file, making it impossible to test the real opentrivia.js fetchCategories in the same file as cached tests that mock opentrivia.js"
  - "CATEGORY_CACHE_PATH is separate from CACHE_DIR (data/questions/) — stored at data/categories.json per plan D-02"
  - "Category cache never expires per D-03 — categories are stable"

patterns-established:
  - "fetchCategories follows same result wrapper pattern as fetchQuestions: {ok, categories}/{ok, error}"
  - "Category disk cache at data/categories.json (flat file, not per-category subdirectory)"
  - "Cached wrapper imports both fetchQuestions and fetchCategories from opentrivia.js in same import statement"

requirements-completed: [CVOTE-01]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 03 Plan 01: Category Fetching and Caching Summary

**fetchCategories() added to opentrivia.js and cached-fetcher.js, returning [{id, name}] from OpenTrivia DB with disk cache at data/categories.json that never expires**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T12:38:25Z
- **Completed:** 2026-03-24T12:41:30Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4

## Accomplishments

- fetchCategories() raw export in opentrivia.js hits https://opentdb.com/api_category.php and maps trivia_categories to [{id, name}] stripping extra fields
- fetchCategories() cache-through export in cached-fetcher.js reads data/categories.json on hit, fetches from API on miss, writes to disk; write errors non-fatal
- 9 new tests across 2 test files; full suite 338/338 pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fetchCategories() to opentrivia.js** - `3738420` (feat)
2. **Task 2: Add cached fetchCategories() to cached-fetcher.js** - `728dbb8` (feat)

**Plan metadata:** (pending)

_Note: Both tasks executed TDD (RED -> GREEN)_

## Files Created/Modified

- `src/fetcher/opentrivia.js` - Added fetchCategories() export
- `src/fetcher/cached-fetcher.js` - Added fetchCategoriesFromApi import, CATEGORY_CACHE_PATH constant, and fetchCategories() export
- `tests/fetcher/opentrivia-categories.test.js` - Raw API tests (4 tests)
- `tests/fetcher/cached-categories.test.js` - Cached wrapper tests (5 tests)

## Decisions Made

- Split the test file into two files. The plan called for two describe blocks in one file, but `vi.mock` is hoisted to the top of the file in Vitest — this means mocking opentrivia.js for the cached describe block would also affect the raw API describe block, making it impossible to test the real implementation. Splitting ensures each file has clean, independent mocking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split single test file into two separate test files**
- **Found during:** Task 2 (cached fetchCategories tests)
- **Issue:** Plan called for two describe blocks in the same test file, but vi.mock is hoisted to top of the file in Vitest. Placing vi.mock('../../src/fetcher/opentrivia.js') in the same file as tests that import the real fetchCategories() caused all 4 raw API tests to fail with "fetchCategories is not a function" (the mock function, not the real export)
- **Fix:** Created separate `tests/fetcher/cached-categories.test.js` for the cached layer tests. `tests/fetcher/opentrivia-categories.test.js` retains the raw API tests unaffected
- **Files modified:** tests/fetcher/opentrivia-categories.test.js (trimmed), tests/fetcher/cached-categories.test.js (new)
- **Verification:** npx vitest run tests/fetcher/opentrivia-categories.test.js tests/fetcher/cached-categories.test.js — 9 passed
- **Committed in:** 728dbb8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Structural test file split only. All planned behavior, acceptance criteria, and must_have truths are satisfied. The two-file approach is strictly equivalent to the intended two-describe-block approach.

## Issues Encountered

None beyond the vi.mock hoisting issue documented above.

## Next Phase Readiness

- fetchCategories() available from both opentrivia.js and cached-fetcher.js
- Category shape {id, name} established per D-04
- data/categories.json cache path ready for Phase 03 Plan 02 (voting flow)
- No blockers

---
*Phase: 03-category-voting*
*Completed: 2026-03-24*

## Self-Check: PASSED

- FOUND: src/fetcher/opentrivia.js
- FOUND: src/fetcher/cached-fetcher.js
- FOUND: tests/fetcher/opentrivia-categories.test.js
- FOUND: tests/fetcher/cached-categories.test.js
- FOUND: .planning/phases/03-category-voting/03-01-SUMMARY.md
- FOUND commit: 3738420 (feat(03-01): add fetchCategories() to opentrivia.js)
- FOUND commit: 728dbb8 (feat(03-01): add cached fetchCategories() to cached-fetcher.js)
