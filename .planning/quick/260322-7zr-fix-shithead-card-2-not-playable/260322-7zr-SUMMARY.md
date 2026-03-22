---
phase: quick
plan: 260322-7zr
subsystem: engine/games
tags: [bug-fix, shithead, card-game, regression-test]
dependency_graph:
  requires: []
  provides: [rank-2-playability-fix, shithead-regression-tests]
  affects: [src/engine/games/shithead.js, src/engine/games/shithead.test.js, public/player.html]
tech_stack:
  added: []
  patterns: [vitest-regression-test]
key_files:
  created:
    - src/engine/games/shithead.test.js
  modified:
    - src/engine/games/shithead.js
    - public/player.html
decisions:
  - "Fixed getTopRank to return null when top card is rank 2, not the first non-2 beneath it"
  - "Added Number() coercion in frontend canPlayCard as defensive hardening"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-22"
  tasks_completed: 1
  files_changed: 3
---

# Quick Task 260322-7zr: Fix Shithead Rank-2 Card Not Playable — Summary

**One-liner:** Fixed `getTopRank` returning the rank beneath a 2 instead of null, causing the frontend to display nearly all cards as unplayable after any 2 was played.

## Root Cause

`getTopRank(pile)` was designed to walk back through the pile, skip 2s, and return the first non-2 rank. The intent was to find the "effective" pile rank for comparison. However, this logic is inverted from the game rules:

- A 2 played on an Ace means the **next player can play anything** — the 2 *resets* the pile.
- The old code returned the Ace's rank (14) as the effective top rank, so `pileTopRank = 14` appeared in every player's view.
- The frontend `canPlayCard` then required `rank >= 14` for non-special cards, making every card except Ace, 2, and 10 appear unplayable.

## Fix

`getTopRank` now checks only the literal top card. If it is a 2, return `null` immediately (null = "anything goes"). If the pile is empty, also return null.

```js
// Before (wrong — walked back through 2s to underlying rank)
function getTopRank(pile) {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== 2) return pile[i].rank;
  }
  return null;
}

// After (correct — 2 on top means reset, return null)
function getTopRank(pile) {
  if (pile.length === 0) return null;
  const topCard = pile[pile.length - 1];
  if (topCard.rank === 2) return null;
  return topCard.rank;
}
```

The `canPlayOnPile` function already had `if (cardRank === 2) return true` correctly at the top, so it was not affected.

The frontend `canPlayCard` was also already correct in its rank-2 special case (`if (rank === 2) return true`), but it was receiving a wrong `pileTopRank` from the server view. Defensive `Number()` coercion was added as hardening.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write regression tests and fix rank-2 bug | fe713d7 | shithead.js, shithead.test.js, player.html |

## Deviations from Plan

None - plan executed exactly as written. The TDD RED phase revealed two failing tests (`pileTopRank` tests), confirming the engine bug. The fix turned both RED to GREEN.

## Known Stubs

None.

## Self-Check: PASSED

- `src/engine/games/shithead.test.js` exists and contains 14 tests
- `src/engine/games/shithead.js` modified with correct `getTopRank`
- `public/player.html` modified with defensive coercion
- Commit fe713d7 exists
