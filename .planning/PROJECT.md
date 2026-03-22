# Small Hours Game Engine

## What This Is

A real-time multiplayer party game platform. One shared screen (TV/monitor) as the display, players join from phones via room code — zero downloads, zero accounts. The engine is a pure function: `(state, action) => {newState, events}`, transport-agnostic with WebSocket as the current adapter.

## Core Value

Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

## Current Milestone: v2.1 Quiz Question Pipeline

**Goal:** Make the quiz game playable with real questions from OpenTrivia DB, with disk caching and player category voting.

**Target features:**
- OpenTrivia DB integration as question source
- Disk-based question caching by category
- Player category voting before quiz starts

## Requirements

### Validated

- Engine with pure function contract (setup/actions/view/endIf)
- 4 working games: Number Guess, Quiz, Spy, Shithead
- WebSocket transport with rooms, reconnection, chat, rate limiting
- Browser frontend (landing page, host display, player controller)
- Docker deployment with health checks

### Active

- [x] OpenTrivia DB API integration for quiz questions — Validated in Phase 01: Question Fetcher
- [ ] Disk-based question caching by category
- [ ] Player category voting before quiz starts

### Out of Scope

- Native mobile apps — web-first, phones use browser
- User accounts/authentication — players are ephemeral per session
- Persistent player identity across sessions — by design
- Additional games (CAH, Lyrics) — future milestone
- Bot system — future milestone
- Game history/stats persistence — future milestone
- HTTP rate limiting / security headers — future milestone
- Terminal client — browser-first approach taken

## Context

This is a ground-up rewrite of a party game platform. The codebase has ~2,200 lines of backend JS (engine + session + transport) and ~3,600 lines of frontend HTML/CSS/JS. The quiz game engine is complete with phases, powerups, and scoring — but expects questions to be passed in via config with no built-in source. This milestone adds that pipeline.

The OpenTrivia DB API (opentdb.com) is the question source. It's free, has ~4,000+ questions across 24 categories, and rate limits at roughly 1 req/5s per IP.

## Constraints

- **Zero auth**: Players are ephemeral — no login, no accounts
- **JSON boundary**: Engine input/output is always JSON
- **Simplicity**: No abstraction before the second use case proves it's needed
- **Runtime**: Node.js 22, ESM, Express + ws as only production deps

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pure function engine | Testable, predictable, transport-agnostic | Validated |
| Plain object game definitions | No class hierarchy needed for 4 games | Validated |
| Express + WS over raw HTTP | Session/room management needed it | Validated |
| Browser-first (skipped terminal client) | Faster to usable product | Validated |
| OpenTrivia DB as question source | Free, sufficient variety, well-known API | Validated (Phase 01) |
| Disk caching for questions | Offline resilience, reduce API load | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-22 after Phase 01 (Question Fetcher) complete*
