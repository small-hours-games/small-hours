# Small Hours Game Engine

## What This Is

A game engine for creating multiplayer party games. JSON in, process, JSON out — the engine handles game logic (state, rules, phases, scoring) while remaining completely agnostic about how games are presented or how players connect. Terminal client is the first consumer; browser/phone/TV layers come later as presentation concerns.

## Core Value

Creating a new party game should be trivially simple — define state and rules, the engine handles everything else.

## Current Milestone: v1.1 Engine Foundation

**Goal:** Challenge every design assumption from the v1.0 spec, make research-backed decisions, then build the simplest possible game engine with proven patterns.

**Target features:**
- Research-validated architecture decisions (tick vs event-driven, WS vs HTTP, etc.)
- Clean game engine with JSON in/out boundary
- Terminal client as first consumer / dev tool
- First games built to discover (not prescribe) shared patterns

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Research and resolve 10 fundamental design questions from SPEC.md analysis
- [ ] Game engine with clean JSON in/out boundary
- [ ] Terminal client for playing and testing games
- [ ] First 2-3 games proving the engine works

### Out of Scope

- Native mobile apps — web-first, phones use browser
- User accounts/authentication — players are ephemeral per session
- Persistent player identity across sessions — by design
- Server-side rendering — SPA approach with WebSocket state
- Browser/phone/TV frontend — future milestone, consumes same JSON
- Docker/deployment infrastructure — earned after games work
- Security hardening (Helmet, rate limiting) — earned after there's something to secure

## Context

This is a ground-up rewrite of an existing party game platform. The original SPEC.md describes the full vision, but the v1.0 roadmap front-loaded infrastructure before any game logic was proven. This milestone inverts that: build games first, let infrastructure needs emerge from real usage.

The SPEC.md remains the reference for *what games exist and how they work*, but every architectural decision (100ms tick, WebSocket-first, Display+Phone roles, GameController base class) is being challenged through research before being adopted or rejected.

Key pivot from v1.0:
- Engine-first, not infrastructure-first
- JSON in/out boundary, not WebSocket-specific
- Discover patterns from building games, not prescribe them upfront
- Terminal client as first consumer, not browser

## Constraints

- **No auth**: Players are ephemeral — no login, no accounts, by design
- **JSON boundary**: Engine input/output is always JSON — transport is someone else's problem
- **Simplicity**: No abstraction before the second use case proves it's needed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Engine-first, not infra-first | v1.0 had 5 infra phases before any game logic | — Pending |
| JSON in/out boundary | Decouples engine from transport (WS, HTTP, terminal) | — Pending |
| Terminal as first client | Fastest path to playable games, permanent dev tool | — Pending |
| Discover patterns, don't prescribe | Build 2-3 games, extract shared patterns after | — Pending |
| Challenge every SPEC.md assumption | Previous "just build it" approach is why we're rewriting | — Pending |

---
*Last updated: 2026-03-15 after milestone v1.1 start*
