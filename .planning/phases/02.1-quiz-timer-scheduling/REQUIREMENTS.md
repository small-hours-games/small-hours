# Phase 2.1: Quiz Timer Scheduling

**Type:** Bug fix (urgent insertion)
**Inserted after:** Phase 2 (Question Cache)
**Reason:** Quiz game starts in `countdown` phase but never transitions — no timer scheduling exists in the session/transport layer

## Problem

The quiz engine defines phase durations (`PHASE_DURATIONS`) and a `timerExpired` action handler for phase transitions:
- `countdown` (3s) → `question` (15s) → `reveal` (4s) → `between` (5s) → loop

But **nobody dispatches `timerExpired` actions**. The CLAUDE.md states:
> Timers are synthetic actions fed to the engine by the session layer

This was never implemented. The quiz (and spy game) start but stay frozen in their initial phase forever. Questions never appear because the game never transitions from `countdown` to `question`.

## Requirements

- **TIMER-01**: After a quiz game starts, the transport/session layer must schedule a `timerExpired` action for the current phase after its duration elapses
- **TIMER-02**: After each phase transition (detected via `phase_change` events or state comparison), schedule the next timer for the new phase's duration
- **TIMER-03**: Timers must be cancelled when a game ends or players return to lobby (no stale timer fires)
- **TIMER-04**: The spy game's `timerExpired` action must also be scheduled by the same mechanism

## Affected Files

- `src/transport/ws-adapter.js` — needs timer scheduling after `handleStartMiniGame` and `handleGameAction`
- `src/engine/games/quiz.js` — exports `PHASE_DURATIONS` (already correct, no changes needed)
- `src/engine/games/spy.js` — also has `timerExpired` (check if it exports durations)
