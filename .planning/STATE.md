---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: milestone
status: Ready to execute
stopped_at: Completed gin-rummy-02-PLAN.md
last_updated: "2026-03-24T11:39:41.069Z"
last_activity: 2026-03-24
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
---

# State: Small Hours Game Engine

**Last updated:** 2026-03-22
**Session:** Milestone v2.1 — Quiz Question Pipeline

## Project Reference

**Core value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

**Current focus:** Phase gin-rummy — Gin Rummy

## Current Position

Phase: gin-rummy (Gin Rummy) — EXECUTING
Plan: 3 of 3

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

### Pending Todos

- 2 pending:
  - `Add server deployment update script` (tooling)
  - `Run GSD commands via claude CLI as unix commands` (tooling)

## Session Continuity

### To Resume

Last session: 2026-03-24T11:39:41.065Z
Stopped at: Completed gin-rummy-02-PLAN.md
Resume file: None

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
Last activity: 2026-03-24
| Phase 02-question-cache P01 | 2 | 1 tasks | 2 files |
| Phase 02-question-cache P02 | 10 | 2 tasks | 2 files |
| Phase gin-rummy P01 | 15 | 1 tasks | 2 files |
| Phase gin-rummy P02 | 6 | 1 tasks | 4 files |
