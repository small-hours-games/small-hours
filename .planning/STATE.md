# State: Small Hours Game Engine

**Last updated:** 2026-03-22
**Session:** Milestone v2.1 — Quiz Question Pipeline

## Project Reference

**Core value:** Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

**Current focus:** Defining requirements for quiz question pipeline

## Current Position

Phase: Not started (defining requirements)
Plan: --
Status: Defining requirements
Last activity: 2026-03-22 — Milestone v2.1 started

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

### Key Design
- Questions flow: source -> cache -> quiz engine `config.questions`
- Category voting happens in lobby before game starts
- Timer-based phase transitions via `timerExpired` synthetic actions

## Session Continuity

### To Resume
1. Read this file to orient
2. Check .planning/ROADMAP.md for phase progress
3. Continue with next phase

### Files
- `.planning/PROJECT.md` — updated project context
- `.planning/REQUIREMENTS.md` — milestone requirements
- `SPEC.md` — original functional specification (reference)

---
*State initialized: 2026-03-22*
