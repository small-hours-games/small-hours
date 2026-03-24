---
phase: gin-rummy
plan: 02
subsystem: engine/games
tags: [gin-rummy, card-game, game-definition, tdd, state-machine]

requires:
  - phase: gin-rummy-01
    provides: cardValue, calcDeadwoodValue, findAllMelds, findOptimalMelds, findLayoffs, applyLayoffs, scoreHand, createGinDeck, shuffleArray, wrapAction
provides:
  - Complete gin rummy game definition (setup/actions/view/endIf)
  - first_turn upcard flow (takeUpcard, declineUpcard)
  - draw/discard/knock/nextHand actions with full state machine
  - Multi-hand scoring loop to targetScore
  - gin-rummy registered in GAME_REGISTRY and index.js
affects: [src/session/room.js, src/engine/games/index.js]

tech-stack:
  added: []
  patterns: [tdd-red-green, state-machine, multi-hand-loop, auto-meld-computation, auto-layoff]

key-files:
  created:
    - .planning/phases/gin-rummy/gin-rummy-02-SUMMARY.md
  modified:
    - src/engine/games/gin-rummy.js
    - tests/engine/gin-rummy.test.js
    - src/engine/games/index.js
    - src/session/room.js

key-decisions:
  - "first_turn_draw sub-phase: when both players decline upcard, transitions to first_turn_draw so non-dealer must draw from stock; cleaner than inline conditional in draw action"
  - "Stock exhaustion triggers on draw (stock <= 2 after draw from stock) and on discard (stock <= 2 after discard) — covers both code paths"
  - "dealerIndex after cancelled hand: hand result has no winner, so dealerIndex unchanged for re-deal (same dealer deals again per rules)"
  - "config stored in state (state.config) so actions can access targetScore and bigGinBonus without closures"

requirements-completed: []

duration: 6min
completed: "2026-03-24"
---

# Phase gin-rummy Plan 02: Gin Rummy Game Definition Summary

**Full gin rummy state machine with first-turn upcard flow, auto-meld/layoff on knock, multi-hand scoring loop, stock exhaustion handling, and secure opponent-hand hiding in view.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T12:35:00Z
- **Completed:** 2026-03-24T12:41:00Z
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Complete gin rummy game definition with all actions: takeUpcard, declineUpcard, draw, discard, knock, nextHand
- first_turn phase with upcard selection flow (non-dealer first, dealer second, both-decline draws from stock)
- Auto-computes optimal melds on knock (D-06) and auto-applies layoffs (D-07) — phone UI just sends `{type:'knock'}`
- Multi-hand loop: nextHand re-deals or ends game at targetScore, with box bonus (boxes*20) and game bonus (100/200 for shutout)
- Stock exhaustion cancels hand with no score change when stock <= 2
- View hides opponent cards during play (D-03), reveals full scoring breakdown during scoring phase (D-04)
- Registered gin-rummy in GAME_REGISTRY in room.js and index.js

## Task Commits

1. **RED phase (failing tests)** - `a429d4d` (test)
2. **GREEN phase (implementation)** - `b23818d` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/engine/games/gin-rummy.js` - Added setup, dealNewHand, takeUpcard, declineUpcard, draw, discard, knock, nextHand, view, endIf, default export; kept all Plan 01 named exports intact
- `tests/engine/gin-rummy.test.js` - Added 49 game-level tests (91 total, all passing)
- `src/engine/games/index.js` - Added ginRummy export
- `src/session/room.js` - Added gin-rummy to GAME_REGISTRY

## Decisions Made

- **first_turn_draw sub-phase:** When both players decline the upcard, state transitions to `first_turn_draw` so the non-dealer is forced to draw from stock. The `draw` action accepts both `drawing` and `first_turn_draw` phases, then normalizes to `drawing` after the draw. Cleaner than adding inline conditional logic inside the draw action's phase check.
- **config stored in state:** `state.config` stores `{ targetScore, bigGinBonus }` so all actions (especially nextHand and knock) can access config values without relying on closures or re-passing config each call.
- **Stock exhaustion in both draw and discard:** The plan spec says exhaustion triggers "after draw from stock" and "after discard" — both paths implemented so neither path can bypass the check.
- **dealerIndex on cancelled hand:** When handResult.type === 'cancelled', there's no hand winner, so dealerIndex is unchanged. Same dealer re-deals per standard gin rules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Registered gin-rummy in GAME_REGISTRY and index.js**
- **Found during:** Implementation phase
- **Issue:** Plan 02 focused on game definition but didn't explicitly task registering the game in GAME_REGISTRY (room.js) and index.js — without this, the game is unreachable via WebSocket
- **Fix:** Added `import ginRummy` and `'gin-rummy': ginRummy` to room.js GAME_REGISTRY; added `export { default as ginRummy }` to index.js
- **Files modified:** src/session/room.js, src/engine/games/index.js
- **Verification:** Full test suite (436 tests) passes; game is importable
- **Committed in:** b23818d (implementation commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical)
**Impact on plan:** Essential for game to be reachable via WebSocket. No scope creep.

## Issues Encountered

None — implementation followed the plan spec cleanly. All 91 tests pass on first run after implementation.

## Known Stubs

None — all actions are fully implemented, view function wires real state, no placeholder values.

## Next Phase Readiness

- Plan 03 (frontend / display integration) can proceed: gin-rummy is registered, state machine is complete
- All 436 project tests pass
- game definition exports default object with setup/actions/view/endIf — engine contract satisfied

---

*Phase: gin-rummy*
*Completed: 2026-03-24*
