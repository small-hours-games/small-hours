# State: Small Hours Game Engine

**Last updated:** 2026-03-22
**Session:** Milestone v2.1 — Quiz Question Pipeline

## Project Reference

**Core value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

**Current focus:** Phase 1 — Question Fetcher (roadmap created, ready to plan)

## Current Position

Phase: 1 — Question Fetcher
Plan: --
Status: Not started
Last activity: 2026-03-22 — Roadmap created for v2.1

```
[          ] 0% — Phase 1 of 3
```

## Performance Metrics

- Phases complete: 0/3
- Plans complete: 0/?
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

## Session Continuity

### To Resume
1. Read this file to orient
2. Check `.planning/ROADMAP.md` for phase progress
3. Run `/gsd:plan-phase 1` to begin planning Phase 1

### Files
- `.planning/PROJECT.md` — updated project context
- `.planning/REQUIREMENTS.md` — milestone requirements (10 v2.1 requirements)
- `.planning/ROADMAP.md` — 3-phase roadmap

---
*State initialized: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation*
