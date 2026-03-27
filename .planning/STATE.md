---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: milestone
status: Milestone complete
stopped_at: Phase 6 UI-SPEC approved
last_updated: "2026-03-27T09:01:59.832Z"
last_activity: 2026-03-27
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
---

# State: Small Hours Game Engine

**Last updated:** 2026-03-22
**Session:** Milestone v2.1 — Quiz Question Pipeline

## Project Reference

**Core value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

**Current focus:** Phase 05 — card-game-gui

## Current Position

Phase: 05
Plan: Not started

## Performance Metrics

- Phases complete: 1/3
- Plans complete: 2/2 (Phase 01)
- Requirements mapped: 10/10

## Accumulated Context

### Existing Codebase

- Engine: pure function contract with 4 games (Number Guess, Quiz, Spy, Shithead)
- Transport: Express + WebSocket with rooms, reconnection, rate limiting
- Frontend: Browser-based landing page, host display, player controller
- Deployment: Docker with health checks
- Total: ~2,200 lines backend, ~3,600 lines frontend

### Quiz Game Current State

- Engine complete: phases (countdown/question/reveal/between/finished), powerups, streaks, scoring
- Missing: question source — expects `config.questions` array passed at game start
- No OpenTrivia DB integration, no caching, no category selection
- Entry points: `src/engine/games/quiz.js`, `src/session/room.js`, `src/transport/ws-adapter.js`

### Key Design

- Questions flow: OpenTrivia DB API -> disk cache -> quiz engine `config.questions`
- Category voting happens in lobby before game starts
- Timer-based phase transitions via `timerExpired` synthetic actions
- OpenTrivia DB: free, ~4,000+ questions, 24 categories, rate limit ~1 req/5s per IP

### Roadmap Evolution

- Phase 5 added: Card Game GUI - Port rendering, card visuals, physics, and sounds from JLogical-Apps/cards to all card games
- Phase 6 added: Fanned pile display for card games - Show stacked pile cards as a fanned spread so players can see what cards are in the pile to inform gameplay decisions

### Decisions

- Phase 1 builds the fetcher as a standalone module callable independently of the quiz engine
- Phase 2 wraps the fetcher with a cache layer (same external interface)
- Phase 3 adds the lobby voting flow and wires the full pipeline into `room.startGame()`
- [Phase 01]: Used regex-based HTML entity decoder instead of external dependency
- [Phase 01]: Established result wrapper pattern {ok, data}/{ok, error} for fallible operations
- [Phase 01]: Made startGame async rather than separate prepareGame method
- [Phase 01]: Added .catch() at dispatch call site for async handler rather than making handleMessage async
- [Phase 02-question-cache]: Content-hash IDs via sha1(question+NUL+correct_answer) replace timestamp-based IDs for cross-session deduplication
- [Phase 02-question-cache]: ID normalization happens at write time so cache reads are zero-cost
- [Phase 02-question-cache]: clearCache(undefined) removes entire data/questions/ directory; clearCache(null) removes any.json
- [Phase 02-question-cache]: usedQuestionIds lives on Room instance, garbage collected with Room destruction — no explicit cleanup
- [Phase 02-question-cache]: Supplement fetch goes through cached-fetcher (not raw API) to maintain cache-through consistency
- [Phase gin-rummy]: Recursive exhaustive search for optimal melds (not greedy) to handle cases where greedy would fail
- [Phase gin-rummy]: Ace is always low in gin rummy (rank 1): A-2-3 is valid run, K-A-2 is not
- [Phase gin-rummy]: first_turn_draw sub-phase for both-decline case: non-dealer forced to draw from stock before normal play begins
- [Phase gin-rummy]: config stored in state (state.config) so actions can access targetScore/bigGinBonus without closures
- [Phase gin-rummy]: Stock exhaustion checked in both draw and discard actions (both code paths)
- [Phase gin-rummy]: State injection for testing: inject specific hands directly into game.state to test knock/scoring deterministically without mocking shuffle
- [Phase 05-card-game-gui]: cards.js as plain browser script globals (no module system) — avoids build step, loads via script tag, testable via inline re-declaration
- [Phase 05-card-game-gui]: Rank 14 aliased to rank 1 SVG in cardSvgSrc() — Shithead uses rank 14 for Ace-high but JLogical SVGs only have SUIT-1.svg
- [Phase 05-card-game-gui]: playable:undefined passed when not player's turn so renderCardImg omits playable/unplayable CSS class
- [Phase 05-card-game-gui]: Sound state tracking (lastShState/lastGrState) prevents duplicate audio triggers on every host re-render

### Pending Todos

- 2 pending:
  - `Add server deployment update script` (tooling)
  - `Run GSD commands via claude CLI as unix commands` (tooling)

## Session Continuity

### To Resume

Last session: 2026-03-27T09:01:59.820Z
Stopped at: Phase 6 UI-SPEC approved
Resume file: .planning/phases/06-fanned-pile-display-for-card-games-show-stacked-pile-cards-as-a-fanned-spread-so-players-can-see-what-cards-are-in-the-pile-to-inform-gameplay-decisions/06-UI-SPEC.md

### Files

- `.planning/PROJECT.md` — updated project context (updated 2026-03-22)
- `.planning/REQUIREMENTS.md` — milestone requirements (10 v2.1 requirements)
- `.planning/ROADMAP.md` — 3-phase roadmap

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260322-7zr | Fix shithead card 2 not playable | 2026-03-22 | fe713d7 | [260322-7zr-fix-shithead-card-2-not-playable](./quick/260322-7zr-fix-shithead-card-2-not-playable/) |

---
*State initialized: 2026-03-22*
Last activity: 2026-03-27
| Phase 02-question-cache P01 | 2 | 1 tasks | 2 files |
| Phase 02-question-cache P02 | 10 | 2 tasks | 2 files |
| Phase gin-rummy P01 | 15 | 1 tasks | 2 files |
| Phase gin-rummy P02 | 6 | 1 tasks | 4 files |
| Phase gin-rummy P03 | 3 | 1 tasks | 1 files |
| Phase 05-card-game-gui P01 | 3 | 2 tasks | 63 files |
| Phase 05-card-game-gui P02 | 7 | 2 tasks | 63 files |
