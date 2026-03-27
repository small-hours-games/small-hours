---
phase: 05-card-game-gui
plan: 02
subsystem: frontend
tags: [card-rendering, svg, audio, shithead, gin-rummy, player-html, host-html]
dependency_graph:
  requires: ["05-01"]
  provides: ["SVG card rendering in player.html and host.html", "sound effects on host display"]
  affects: ["public/player.html", "public/host.html"]
tech_stack:
  added: []
  patterns: ["renderCardImg() for all card display sites", "audio.play() transitions keyed on state deltas"]
key_files:
  created: []
  modified:
    - public/player.html
    - public/host.html
decisions:
  - "playable:undefined passed when not player's turn so renderCardImg omits playable/unplayable class"
  - "Shithead face-up cards in play: when hand not empty use playable:false + opacity:0.5; when hand empty use full playability"
  - "Sound state tracking (lastShState/lastGrState) prevents duplicate audio on every re-render"
  - "Card assets checked out from phase-05-card-game-gui branch since worktree was based on main"
metrics:
  duration: ~7 minutes
  completed: "2026-03-27"
  tasks: 2
  files: 63
---

# Phase 05 Plan 02: SVG Card Rendering Port to player.html and host.html Summary

Replace all text-based card rendering with SVG images using the shared cards.js module, and wire sound effects into host.html game events for Shithead and Gin Rummy.

## What Was Built

Both `player.html` and `host.html` now load `/js/cards.js` and use `renderCardImg()` for all card display. Sound effects play on game state transitions in the host display.

### player.html changes

- Added `<script src="/js/cards.js"></script>` before the main script
- Removed `cardDisplay()` and `cardColor()` helper functions entirely
- **Shithead swap phase**: hand cards and face-up cards use `renderCardImg()` with `onclick`/`id` opts
- **Shithead pile top**: `renderCardImg()` with `width:80, height:112, pileCard:true`
- **Shithead play hand**: `renderCardImg()` with `selected`, `playable`, and `onclick` opts
- **Shithead face-up in play**: `renderCardImg()` with `playable` logic preserved; non-active use `playable:false, style:'opacity:0.5'`
- **Shithead face-down**: `renderCardImg({rank:0,suit:'x'}, {facedown:true})` with back.svg
- **Gin Rummy discard top**: `renderCardImg()` with `width:80, height:112, pileCard:true`
- **Gin Rummy hand**: `renderCardImg()` with `selected` based on `grSelectedCard`
- **Gin Rummy scoring melds**: `renderCardImg(c, {width:40, height:56})` for meld cards
- **Gin Rummy deadwood**: `renderCardImg(c, {width:36, height:50, style:'display:inline-block'})`

### host.html changes

- Added `<script src="/js/cards.js"></script>` before the main script
- Added `audio.init()` on first click/keydown interaction
- Added `lastShState` and `lastGrState` objects for sound transition tracking
- Removed `hostCard()` function definition
- **Gin Rummy discard top**: `renderCardImg()` with `width:68, height:96, pileCard:true`
- **Gin Rummy melds**: `renderCardImg(c, {width:40, height:56})` replacing `hostCard(c)` map calls
- **Gin Rummy deadwood**: `renderCardImg(c, {width:36, height:50})`
- **Shithead pile top**: `renderCardImg()` with `width:100, height:140, pileCard:true` replacing inline styled div
- **Shithead face-up cards**: `renderCardImg(c, {width:40, height:56})` with count badge overlay preserved
- **Sound effects wired**:
  - Shithead: `draw` (drawPileCount decreased), `place` (pileCount increased), `deck_redraw` (pile burned to 0), `win` (phase=finished)
  - Gin Rummy: `draw` (stockCount decreased during drawing), `place` (discardCount increased), `deck_redraw` (round number increased), `win` (phase=scoring or finished)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Card assets and cards.js missing from worktree**
- **Found during:** Task 1 setup
- **Issue:** Worktree `worktree-agent-a6e597fe` branched from `main`, which predates phase-05 plan-01 work. `public/js/cards.js` and `public/cards/` directory did not exist in the worktree.
- **Fix:** Used `git checkout gsd/phase-05-card-game-gui -- public/js/cards.js public/cards` to bring the assets into the worktree. Both included in the Task 1 commit.
- **Files modified:** `public/js/cards.js`, `public/cards/` (53 SVGs + 4 audio files)
- **Commit:** d4e2383

**2. [Rule 1 - Minor Adjustment] playable:undefined vs passing no key**
- **Found during:** Task 1, Shithead play hand rendering
- **Issue:** Plan specified `playable: playable` where playable is the `canPlayCard()` result, but when `msg.isMyTurn` is false the card should not show playable/unplayable class at all.
- **Fix:** Pass `playable: msg.isMyTurn ? playable : undefined` so the class is omitted when not the player's turn. The `renderCardImg` function skips both `playable` and `unplayable` classes when opts.playable is `undefined`.

## Known Stubs

None. All card rendering sites are fully wired to real card data.

## Self-Check: PASSED

- `public/player.html` exists: FOUND
- `public/host.html` exists: FOUND
- `public/js/cards.js` exists: FOUND
- Commit d4e2383 exists: FOUND (feat(05-02): update player.html)
- Commit db65df4 exists: FOUND (feat(05-02): update host.html)
- `npm test`: 214 tests pass, 0 failures
