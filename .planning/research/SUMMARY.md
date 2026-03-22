# Research Summary: Small Hours Game Engine

**Synthesized:** 2026-03-15
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

## Executive Summary

Every SPEC.md architectural assumption was challenged. All 7 were rejected or made conditional. The engine is a pure function: `(state, action) => {newState, events}` with zero dependencies. The old roadmap's first 5 phases (infrastructure) become the last phases. Games come first.

## Key Findings

### Stack
- **Zero production dependencies** for the engine itself
- NOW: Node.js 22, ESM, Vitest, readline
- EARN IT: Express, ws, Vite, Docker, Helmet, HTTPS — each has a specific trigger

### Architecture — 7 Assumptions Rejected
1. **100ms tick** → Event-driven (broadcast on state change)
2. **WebSocket-only** → Engine is transport-agnostic; WS is one adapter
3. **Display + Phone roles** → Engine has participants + observers
4. **GameController inheritance** → Plain objects with pure functions
5. **Rooms in engine** → Session layer concern above engine
6. **30+ message types** → 3 generic types: action, state, event
7. **Full state every tick** → State on change + events for effects

### Engine Primitives (7)
1. State with visibility layers (shared/private/per-player)
2. Action processing with validation
3. Phase definitions with allowed actions
4. Transition conditions (timer/all-acted/win/count)
5. Score accumulation
6. Role assignment + visibility mapping
7. Win/end detection

### Critical Pitfalls
- **UE-3: Private state must be in engine contract from game 1** — `view(state, playerId)` even for Number Guess
- **UE-5: Explicit pattern extraction step needed between game 2 and 3**
- **UE-7: Timers as synthetic actions, not setTimeout in game code**
- **UE-1: Engine must be testable without any server from day 1**

## Design Questions That Must Become Phases

These are the hard questions the research surfaced. Each needs a decision backed by working code:

1. **Engine boundary** — What's the exact contract? `setup()`, `action()`, `view()`, `endIf()`? Prove it with Number Guess.
2. **Visibility model** — How does `view(state, playerId)` work for shared vs private state? Needs to work for Number Guess (trivial) AND Shithead (complex).
3. **Timer model** — How do phase timers work without side effects in engine? Session emits synthetic actions?
4. **Game definition shape** — What does a game export? Plain object? What functions? Discovered after 2 games.
5. **Pattern extraction** — What's shared between Number Guess and Quiz? Extract before building game 3.
6. **Terminal client design** — How does it consume engine JSON without coupling? Permanent dev tool, not throwaway.
7. **Transport abstraction** — When games work in terminal, how does WS/HTTP plug in without changing engine code?
8. **Session layer** — Rooms, player tracking, timer management. Only built when multiplayer is needed.

## Build Order

```
Engine contract + Number Guess + Terminal → Quiz → Extract patterns → Spy/CAH → Shithead → Transport layer → Session layer → Browser client
```

## What Changed From v1.0

| v1.0 Order | v1.1 Order |
|-----------|-----------|
| 1. Docker/HTTPS/security | 1. Engine contract + first game |
| 2. WebSocket transport | 2. Second game (timers) |
| 3. Room management | 3. Pattern extraction |
| 4. Lobby | 4. Third game (roles/private state) |
| 5. Persistence | 5. Complex game (Shithead) |
| 6. Game engine | 6. Transport layer (WS/HTTP) |
| 7-11. Individual games | 7. Session layer (rooms) |
| 12. Frontend polish | 8. Browser/frontend |
