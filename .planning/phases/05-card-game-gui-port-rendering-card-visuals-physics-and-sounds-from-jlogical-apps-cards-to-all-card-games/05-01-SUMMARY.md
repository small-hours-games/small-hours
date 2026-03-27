---
phase: 05-card-game-gui
plan: 01
subsystem: frontend/card-rendering
tags: [assets, css, testing, svg, audio]
dependency_graph:
  requires: []
  provides:
    - public/js/cards.js (cardSvgSrc, renderCardImg, audio singleton)
    - public/cards/faces/*.svg (54 SVG card faces)
    - public/cards/backs/back.svg (facedown card back)
    - public/cards/sounds/*.wav (draw, place, deck_redraw, win)
    - public/css/style.css card game SVG styles
  affects:
    - public/host.html (Plan 02 will wire cards.js in)
    - public/player.html (Plan 02 will wire cards.js in)
tech_stack:
  added: []
  patterns:
    - Plain browser script globals (no module system)
    - Web Audio API singleton with lazy init on first user gesture
    - CSS transforms for card flip/fan/deal animations
key_files:
  created:
    - scripts/download-card-assets.sh
    - public/js/cards.js
    - tests/frontend/card-renderer.test.js
    - public/cards/faces/ (54 SVG files)
    - public/cards/backs/back.svg
    - public/cards/sounds/ (4 WAV files)
  modified:
    - public/css/style.css
decisions:
  - Plain browser script for cards.js (no module system) — avoids build step, loads via script tag in both HTML files, testable via inline re-declaration in test file
  - Rank 14 aliased to rank 1 SVG — Shithead uses rank 14 for Ace-high but JLogical SVGs only have SUIT-1.svg
  - Audio on host display only — TV has speakers, phone audio is deferred (per UI-SPEC)
  - var keyword inside audio methods, const for top-level maps — maximum compatibility with no-build-step context
metrics:
  duration: 3 minutes
  completed: "2026-03-27"
  tasks_completed: 2
  files_created_or_modified: 63
---

# Phase 05 Plan 01: Card Assets and Shared Module Summary

SVG card faces, WAV sounds, shared `cards.js` module (plain browser globals), CSS card styles (flip, fan, deal animations), and 16 unit tests — foundation assets for card game GUI upgrade.

## What Was Built

### Task 1: Download Card Assets and Create cards.js

Downloaded 54 SVG card face files and 4 WAV sound files from JLogical-Apps/cards (MIT license). Created `scripts/download-card-assets.sh` for reproducible downloads. Created `public/js/cards.js` as a plain browser script with three exports-as-globals:

- `cardSvgSrc(c)` — maps `{rank, suit}` to SVG path (handles Shithead rank 14 alias)
- `renderCardImg(c, opts)` — returns full `<img>` HTML string with CSS class management
- `audio` — Web Audio API singleton, lazy-initializes on first user gesture, buffers all 4 sounds

### Task 2: Card CSS Styles and Unit Tests

Added to `public/css/style.css`:
- `.playing-card` base styles — border-radius, cursor, transitions
- `.playing-card.selected` — neon-green glow lift effect
- `.playing-card.playable` / `.playing-card.unplayable` — hint and dim states
- `.card-flip-container` — 3D CSS flip animation for gin rummy scoring reveal
- `.card-hand` — overlapping fan layout for phone hand display
- `@keyframes cardDeal` / `.card-deal-in` — deal-in animation for host display

Created `tests/frontend/card-renderer.test.js` with 16 tests covering:
- All four suits (h, d, c, s) mapping correctly
- Ranks 1–13 including face card suffix names
- Rank 14 (Shithead Ace alias) mapping to rank 1 SVG
- `renderCardImg` options: facedown, selected, playable/unplayable, custom dimensions, onclick, pileCard

## Verification Results

- `npx vitest run tests/frontend/card-renderer.test.js` — 16/16 tests pass
- `npm test` — 464/464 tests pass (no regressions)
- `ls public/cards/faces/*.svg | wc -l` — 54 files
- `ls public/cards/sounds/*.wav | wc -l` — 4 files
- `grep -c 'module.exports' public/js/cards.js` — 0 (no CJS exports)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `4679cd2` — feat(05-01): download card assets and create shared cards.js module
- `73e31e0` — feat(05-01): add card CSS styles and unit tests for cardSvgSrc mapping

## Known Stubs

None. This plan is a pure asset-and-module plan. `cards.js` is wired into host.html and player.html in Plan 02.

## Self-Check: PASSED
