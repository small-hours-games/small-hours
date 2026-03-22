# Features Research: Small Hours Game Engine

**Researched:** 2026-03-15
**Mode:** Ecosystem + First Principles
**Confidence:** HIGH

## Core Finding

The engine needs exactly **7 primitives**. Everything else is game-level logic or platform-level concern that the spec misclassified as engine.

## Engine-Level Primitives (7)

| # | Primitive | What It Does | Why Engine-Level |
|---|-----------|-------------|-----------------|
| 1 | State with visibility layers | Shared / role-private / per-player / engine-only | Every game has state; visibility makes multiplayer work |
| 2 | Action processing | Validate + apply player actions to state | Every game accepts input |
| 3 | Phase definitions | Named states with allowed actions per phase | All 5 games have phases |
| 4 | Transition conditions | Timer / all-acted / win-condition / count triggers | All games transition between phases |
| 5 | Score accumulation | Track points per player | 4 of 5 games score |
| 6 | Role assignment | Assign roles + map roles to visibility | Spy, CAH czar, Shithead turns |
| 7 | Win/end detection | Evaluate end conditions | Every game ends |

## Game-Level (NOT Engine)

| Feature | Why It's Game Logic |
|---------|-------------------|
| 100ms tick | Transport concern |
| Power-ups (Quiz) | Score formula modifier |
| Streak tracking (Quiz) | Derived from answer history |
| Card hierarchy (Shithead) | Game-defined validity rules |
| Pile burn rules (Shithead) | Game-specific state transition |
| Category voting (Quiz) | Pre-game data assembly |
| Question fetching (Quiz) | External data source |
| Bot behavior | Bots submit actions like any player; engine doesn't know they're bots |
| Czar rotation (CAH) | Turn order variant using role primitive |

## Platform-Level (NOT Engine)

| Feature | Why It's Platform |
|---------|-----------------|
| Room management | Session grouping |
| Admin system | Lobby concern |
| Language/i18n | Display concern |
| Rate limiting | Transport concern |
| Persistence | Storage concern |
| Chat | Lobby feature |

## Game Analysis — What Each Actually Needs

| Game | Phases | Private State | Roles | Timers | Turn Order |
|------|--------|--------------|-------|--------|------------|
| Number Guess | 2 | Per-player guesses | None | Optional | Simultaneous |
| Quiz | 6 | None | None | Yes | Simultaneous |
| Spy | 5 | Spy identity, word | Spy vs non-spy | Yes | Sequential then spy |
| CAH | 3 | Hands | Czar vs non-czar | Optional | Czar rotation |
| Shithead | 5 | Hands, face-down | Current player | Yes (swap) | Turn-based |

## Build Order

1. **Number Guess** — simplest, proves engine boundary
2. **Quiz** — adds timers and simultaneous play
3. **Spy or CAH** — adds roles and private state
4. **Shithead** — most complex validity rules, build last

## Key Simplification

Replace `GameController` base class with pure function: `(state, action) → new state`. No OOP, no 100ms clock. Timers are phase properties that emit synthetic actions when they expire.
