# Architecture Research: Small Hours Game Engine

**Researched:** 2026-03-15
**Mode:** Ecosystem + First Principles (boardgame.io, Colyseus patterns)
**Confidence:** HIGH

## Core Finding

The engine is a pure function: `(state, action) => {newState, events}`. Everything in the SPEC.md architecture is a layer above this.

## Seven SPEC.md Assumptions Challenged

### 1. 100ms Tick Loop — REJECT
**Spec says:** Server broadcasts game state every 100ms.
**Reality:** Turn-based party games are discrete event systems. Broadcasting empty diffs 10x/sec is waste.
**Evidence:** boardgame.io uses no tick loop. Colyseus's tick is optional.
**Instead:** Broadcast state when state changes. `setTimeout` for phase timers.

### 2. WebSocket-Only Transport — CONDITIONAL
**Spec says:** All real-time communication via WebSocket.
**Reality:** Engine must not know about WebSocket. Transport is an adapter.
**Instead:** Engine is `(state, action) => result`. Terminal calls directly. WS adapter wraps later.

### 3. Display + Phone as Engine Concepts — REJECT
**Spec says:** Display and Player are first-class roles.
**Reality:** Presentation concerns. Engine has `participant` (can act) vs `observer` (reads state).
**Instead:** How state renders on TV vs phone is presentation layer's problem.

### 4. GameController Inheritance — REJECT
**Spec says:** Games extend GameController base class.
**Reality:** boardgame.io uses plain objects with pure functions. Composition beats inheritance.
**Instead:** Each game exports `{setup, actions, view, endIf}`. No base class. Extract after 2-3 games.

### 5. Room/Session as Engine Concern — REJECT
**Spec says:** Room codes, player lists, admin, reconnection are part of game system.
**Reality:** Engine is `(state, action) => result`. Session is above.
**Instead:** Session layer manages rooms, calls engine. Engine has no "room" concept.

### 6. 30+ Typed Message Protocol — REJECT
**Spec says:** SHITHEAD_SWAP_CARD, CAH_CZAR_PICK, etc.
**Reality:** Three transport types: `action`, `state`, `event`. Game-specific names inside `action.type`.
**Instead:** Adding a game doesn't change the protocol.

### 7. Full State Every Tick — REJECT
**Spec says:** Broadcast full GAME_STATE every 100ms.
**Reality:** Broadcast on change + events for effects. Reconnecting clients get current state.

## Recommended Architecture (3 Layers)

```
┌─────────────────────────────────┐
│ Transport Layer                 │
│ WebSocket / HTTP / Terminal     │
│ Adapts generic JSON to/from     │
│ specific transport              │
├─────────────────────────────────┤
│ Session Layer                   │
│ Rooms, timers, broadcast        │
│ Calls engine functions          │
│ Manages player connections      │
├─────────────────────────────────┤
│ Engine Layer (pure functions)   │
│ (state, action) => {state, events} │
│ No side effects, no I/O        │
│ Fully testable, fully portable  │
└─────────────────────────────────┘
```

### Engine Layer
- Pure functions: `setup()`, `action(state, move)`, `view(state, playerId)`, `endIf(state)`
- No I/O, no timers, no transport awareness
- Each game is a plain object exporting these functions

### Session Layer
- Room lifecycle, player tracking
- Timer management (phase timers → synthetic actions fed to engine)
- State broadcasting (calls `view()` per player, sends result)
- Only exists when multiplayer sessions are needed

### Transport Layer
- WebSocket adapter, HTTP adapter, terminal adapter
- Maps transport-specific I/O to generic action/state JSON
- Terminal: readline → action JSON → engine → print state

### Timers as Synthetic Actions
1. Engine's `setup()` or `action()` returns phase with `timer: {duration: 15000}`
2. Session layer sets `setTimeout(15000)`
3. On expiry, session calls engine with `{type: 'TIMER_EXPIRED', phase: 'question'}`
4. Engine processes it like any other action — pure, testable

## Open Questions

- Exact shape of game definition object — discovered after Number Guess and Quiz
- Whether `view()` per game suffices or generic visibility system is better — discovered after Spy/CAH
