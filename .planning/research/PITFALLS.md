# Pitfalls Research: Small Hours Game Engine

**Researched:** 2026-03-15
**Mode:** Ecosystem + First Principles
**Confidence:** HIGH

## Core Finding

The project already fell into 5 over-engineering traps. The "just build games" correction risks 7 under-engineering traps. **Private vs shared state** is the single highest-risk decision — cannot be retrofitted after game 2.

## Over-Engineering Pitfalls (5)

### OE-1: Prescribing Base Class Before Games Exist
Base class with tick(), handleMessage(), getSharedState(), getPlayerState() designed before any game. You can't know what's shared until you have things to share.
**Prevention:** Build 2-3 games standalone, extract after.

### OE-2: 100ms Tick for Turn-Based Games
All games forced through same broadcast loop. Shithead/CAH/Spy have no state change without player action.
**Prevention:** Event-driven broadcast.

### OE-3: 30+ Message Types Before Game 1
Protocol designed for all games before any exist. Adding a game shouldn't change transport.
**Prevention:** Generic `{type: 'action', payload: {...}}`.

### OE-4: Room/Admin/Bot as Platform Features
Session concerns built as infrastructure. Engine doesn't need rooms.
**Prevention:** Engine is `(state, action) => result`. Rooms are above.

### OE-5: Docker/HTTPS/Security Before Anything to Secure
Phase 1 was infrastructure with zero user-facing functionality.
**Prevention:** Build something that works, then secure it.

## Under-Engineering Pitfalls (7)

### UE-1: No Engine/Game Separation
Game state on room object. Game logic mixed with session management. Game 2 can't reuse anything.
**Detection:** Can't run a game without a server.
**Prevention:** Engine importable and testable as pure functions from day 1.

### UE-2: Game-Specific Hacks (God Object)
Each game grows the room: `room.secretNumber`, `room.questions`. By game 3, room is a god object.
**Detection:** `room.` references in game logic.
**Prevention:** Engine owns its own state. Room doesn't touch it.

### UE-3: Ignoring Private State Until Shithead Forces It ⚠️ CRITICAL
Number Guess and Quiz have no private state. Engine built assuming all state is shared. Then Shithead needs private hands — retrofit is a rewrite.
**Detection:** Adding `if (game === 'shithead')` to broadcast layer.
**Prevention:** Engine contract includes `view(state, playerId)` from game 1. Number Guess returns same view for all — that's fine.

### UE-4: Terminal-Only Thinking
Engine returns formatted strings instead of structured data. Browser client can't use "Player 1 guessed 42 — too high!" as a string.
**Detection:** Engine functions return strings or call console.log.
**Prevention:** Engine returns JSON objects. Terminal formats them.

### UE-5: No Pattern Extraction Step ⚠️ HIGH RISK
Build 3 games, each with own setup/action/state. No shared patterns extracted. Game 4 starts from scratch.
**Detection:** Copy-pasting boilerplate between games.
**Prevention:** After game 2, explicitly review both and extract shared patterns BEFORE game 3.

### UE-6: Turn Order Reinvented Per Game
Shithead, CAH, Spy each implement turn tracking differently. Same mechanism, three implementations.
**Detection:** Each game has its own `currentPlayerIndex` / `nextPlayer()`.
**Prevention:** Flag as extraction candidate during the step after game 2.

### UE-7: Timers Done Wrong
Game logic uses `setTimeout` directly or `Date.now()` comparisons. Makes games untestable.
**Detection:** Game code imports `setTimeout` or calls `Date.now()`.
**Prevention:** Timers are synthetic actions: session fires `TIMER_EXPIRED` into engine. Pure, testable.

## Risk Matrix

| Pitfall | Likelihood | Impact | When | Phase |
|---------|-----------|--------|------|-------|
| UE-3 Private state | HIGH | CRITICAL | Shithead | Engine design |
| UE-1 No separation | HIGH | HIGH | Game 2 | Engine design |
| UE-5 No extraction | MEDIUM | HIGH | Game 3 | After game 2 |
| UE-7 Timers wrong | HIGH | MEDIUM | Quiz | Engine design |
| UE-4 Terminal coupling | MEDIUM | MEDIUM | Browser time | Terminal design |
| UE-6 Turn reinvention | MEDIUM | LOW | Game 3+ | Extraction step |
| UE-2 God object | MEDIUM | HIGH | Game 2 | Engine design |
