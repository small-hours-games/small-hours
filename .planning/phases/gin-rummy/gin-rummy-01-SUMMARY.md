---
phase: gin-rummy
plan: 01
subsystem: engine/games
tags: [gin-rummy, card-game, utilities, tdd]
dependency_graph:
  requires: []
  provides: [gin-rummy core utilities]
  affects: [src/engine/games/gin-rummy.js]
tech_stack:
  added: []
  patterns: [recursive-exhaustive-search, tdd-red-green]
key_files:
  created:
    - src/engine/games/gin-rummy.js
    - tests/engine/gin-rummy.test.js
  modified: []
decisions:
  - "Greedy-buster test uses Kh-Kd-Ks + Kc-Qc-Jc: 4-card king set vs 3-card king set + run; algorithm correctly finds deadwood=0"
  - "findOptimalMelds uses recursive exhaustive search over all findAllMelds candidates (not greedy)"
  - "applyLayoffs loops until no more layoffs possible to handle chained run extensions"
  - "findLayoffs blocks layoff on 4-card sets (only 3-card sets can be extended)"
  - "Ace is always low (rank 1): A-2-3 valid run, K-A-2 invalid"
metrics:
  duration: 15m
  completed: "2026-03-24"
  tasks_completed: 1
  files_created: 2
---

# Phase gin-rummy Plan 01: Gin Rummy Core Utilities Summary

**One-liner:** Recursive exhaustive-search meld finder with set/run detection, layoff computation, and complete gin scoring (knock/undercut/gin/bigGin) via TDD.

## What Was Built

`src/engine/games/gin-rummy.js` — Exported utility functions for gin rummy:

- **`cardValue(card)`** — Ace=1, face cards=10, 2-10 face value
- **`createGinDeck()`** — 52-card deck, Ace rank=1, IDs like `1h_0`
- **`calcDeadwoodValue(cards)`** — Sum of cardValue for each card
- **`findAllMelds(hand)`** — All valid melds: 3/4-card sets (with all 3-card subsets of 4-card groups), all sub-runs >= 3 of same suit; Ace always low
- **`findOptimalMelds(hand)`** — Recursive exhaustive search over all meld combinations, returns `{ melds, deadwood, deadwoodValue }` minimizing deadwood
- **`findLayoffs(opponentDeadwood, knockerMelds)`** — Cards from opponent deadwood that extend knocker melds; sets must have exactly 3 cards; runs at either end same suit
- **`applyLayoffs(opponentDeadwood, knockerMelds)`** — Greedily applies all layoffs, loops for chained extensions, returns `{ remainingDeadwood, updatedMelds }`
- **`scoreHand(...)`** — gin (+20 bonus, never undercuttable), bigGin (+31), knock (difference), undercut (difference + 10)
- **`shuffleArray`**, **`wrapAction`** — Copied verbatim from shithead.js

## Test Results

42 tests, all passing. Covers:
- All cardValue edge cases (Ace, face cards, 2-10)
- createGinDeck structure (52 cards, rank 1 aces, ID format)
- findAllMelds: sets, 4-card subsets, runs, sub-runs, A-2-3 valid, K-A-2 invalid
- findOptimalMelds: full coverage, greedy-buster (picks 3-card king set + run over 4-card king set)
- findLayoffs: set extension, run extension at both ends, wrong suit blocked, 4-card set blocked
- applyLayoffs: removal from deadwood, meld extension, chain layoffs
- scoreHand: all 4 outcomes including gin-cannot-be-undercut

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect greedy-buster test expectation**
- **Found during:** GREEN phase — test failed because algorithm correctly returned deadwoodValue=0
- **Issue:** Original test hand (four 7s + three 8s + three 9s) can have deadwood=0 via 4-card set of 7s + set of 8s + set of 9s — not a true greedy-buster scenario
- **Fix:** Changed to hand with Kh-Kd-Ks-Kc + Qc-Jc: 4-card king set greedy would leave Qc-Jc as deadwood (20pts), but optimal is 3-card king set + K-Q-J clubs run = deadwood 0
- **Files modified:** tests/engine/gin-rummy.test.js
- **Commit:** 9a8f115

## Known Stubs

None — utility functions are complete and wired. No UI rendering, no placeholder values.

## Self-Check: PASSED

Files exist:
- src/engine/games/gin-rummy.js: FOUND
- tests/engine/gin-rummy.test.js: FOUND

Commits exist:
- 49846fb (failing tests): FOUND
- 9a8f115 (implementation + fixed test): FOUND

All 272 project tests pass.
