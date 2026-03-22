---
phase: 02-question-cache
plan: "02"
subsystem: session
tags: [quiz, caching, deduplication, room-management]

requires:
  - phase: 02-question-cache-01
    provides: cached-fetcher.js with stable content-hash IDs and same fetchQuestions signature as opentrivia.js

provides:
  - Room.usedQuestionIds Set tracking all question IDs served in a room across multiple quiz games
  - Dedup logic in Room.startGame that filters cached questions against usedQuestionIds before use
  - Supplement fetch when unused pool is smaller than requested amount
  - Integration tests covering dedup and supplement behavior with cached-fetcher mock

affects:
  - 03-category-voting (wires the full pipeline into room.startGame — category IDs will flow through same dedup logic)

tech-stack:
  added: []
  patterns:
    - "Per-room Set<string> for deduplication — garbage collected naturally when Room is destroyed"
    - "Filter-then-supplement pattern: filter used IDs first, fetch fresh only when pool is insufficient"

key-files:
  created: []
  modified:
    - src/session/room.js
    - tests/integration/quiz-start.test.js

key-decisions:
  - "usedQuestionIds lives on Room instance and is garbage collected when Room is destroyed — no explicit cleanup needed"
  - "Supplement fetch is a second call to fetchQuestions (not opentrivia directly) — stays consistent with cache-through pattern"

patterns-established:
  - "Dedup pattern: filter -> supplement -> slice -> track (all within startGame quiz block)"

requirements-completed: [QCACHE-03]

duration: 10min
completed: 2026-03-22
---

# Phase 02 Plan 02: Question Deduplication Summary

**Per-room usedQuestionIds Set wired into Room.startGame with filter-then-supplement dedup preventing question repeats across quiz games in the same room**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-22T06:08:00Z
- **Completed:** 2026-03-22T06:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Room class now imports from cached-fetcher.js (transparent cache-through) instead of opentrivia.js directly
- Room constructor initializes a `usedQuestionIds` Set per instance, garbage collected with the room
- startGame quiz block filters fetched questions against usedQuestionIds before passing to quiz engine
- Supplement fetch triggers when filtered pool is smaller than the requested question count
- Integration tests updated to mock cached-fetcher.js; 3 new dedup tests added (7 new total: 4 original + 3 dedup)
- Full test suite: 91 tests passing across 8 test files

## Task Commits

1. **Task 1: Switch Room to cached-fetcher and add usedQuestionIds dedup** - `621ecaf` (feat)
2. **Task 2: Update integration tests for cached-fetcher mock + add dedup tests** - `5f8f0b8` (test)

## Files Created/Modified

- `src/session/room.js` - Switched import to cached-fetcher.js, added usedQuestionIds Set to constructor, replaced simple quiz fetch with filter-then-supplement-then-track logic
- `tests/integration/quiz-start.test.js` - Mock target updated from opentrivia.js to cached-fetcher.js; 3 new tests: ID tracking across games, supplement fetch, per-room isolation

## Decisions Made

- usedQuestionIds is a Set on the Room instance — no explicit cleanup needed as it's garbage collected when the Room is destroyed. This is the simplest possible approach (D-10 from RESEARCH.md).
- The supplement call goes through fetchQuestions (cached-fetcher) rather than the raw API, maintaining consistency with the cache-through pattern. Future optimization (cache bypass on supplement) deferred.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests passed after both changes were applied.

## Next Phase Readiness

Phase 02 complete. The full question pipeline is wired:
- OpenTrivia DB -> disk cache (cached-fetcher) -> room dedup -> quiz engine
- Phase 03 (category voting) can now add a lobby category selection flow; the category ID will flow through the same startGame path already established.

## Self-Check: PASSED

- FOUND: src/session/room.js
- FOUND: tests/integration/quiz-start.test.js
- FOUND: .planning/phases/02-question-cache/02-02-SUMMARY.md
- FOUND: commit 621ecaf (Task 1)
- FOUND: commit 5f8f0b8 (Task 2)

---
*Phase: 02-question-cache*
*Completed: 2026-03-22*
