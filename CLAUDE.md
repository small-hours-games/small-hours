# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Small Hours Games** — a real-time multiplayer party game engine. One shared screen (TV/monitor) as the display, players join from phones via room code. This repo is a ground-up rewrite focused on building the engine first, not infrastructure.

The full game spec lives in `SPEC.md`. Planning state is in `.planning/`.

## Architecture (3 Layers)

The engine is a pure function: `(state, action) => {newState, events}`. Everything else layers on top.

```
Transport Layer  — WebSocket / HTTP / Terminal (adapts JSON to/from transport)
Session Layer    — Rooms, timers, broadcast (calls engine functions)
Engine Layer     — Pure functions, no I/O, no side effects
```

**Key rejected SPEC.md assumptions** (see `.planning/research/ARCHITECTURE.md` for rationale):
- No 100ms tick loop — event-driven, broadcast on state change
- No GameController base class — games are plain objects with `{setup, actions, view, endIf}`
- No WebSocket-specific protocol — engine is transport-agnostic JSON in/out
- No Display/Phone as engine concepts — presentation layer concern
- Timers are synthetic actions fed to the engine by the session layer

## Tech Stack

- **Runtime:** Node.js 22 LTS, JavaScript ESM (no TypeScript, no build step)
- **Testing:** Vitest
- **Dependencies:** Zero production npm deps initially — earn dependencies when needed (see `.planning/research/STACK.md`)
- **Terminal client** is the first consumer (readline + optional chalk)

## Development

```bash
# Tests (once source exists)
npx vitest              # run all tests
npx vitest run <file>   # run single test file
npx vitest --watch      # watch mode
```

## Design Principles

- **Engine-first, not infra-first.** Build games, let infrastructure needs emerge.
- **No abstraction before the second use case.** Build 2-3 games, then extract shared patterns.
- **Earn your dependencies.** Express, ws, Docker, etc. are added only when their trigger condition is met (see Stack research).
- **JSON boundary.** Engine input/output is always JSON. Transport is someone else's problem.
- **Players are ephemeral.** No auth, no accounts, no persistent identity — by design.

## Game Definition Pattern

Each game exports a plain object (not a class):

```js
export default {
  setup(ctx)              // => initial state
  actions: { move(state, action) } // => {state, events}
  view(state, playerId)   // => visible state for that player
  endIf(state)            // => truthy if game is over
}
```

Reference implementation: Number Guess (simplest game, build first).

## GSD Workflow

This project uses the GSD (Get Shit Done) planning system via `/gsd:*` slash commands. Planning state lives in `.planning/`. Key files:
- `.planning/PROJECT.md` — current milestone and requirements
- `.planning/ROADMAP.md` — 12-phase roadmap with success criteria
- `.planning/REQUIREMENTS.md` — 83 v1 requirements with traceability
