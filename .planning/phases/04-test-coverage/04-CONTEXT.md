# Phase 4: Test Coverage - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Achieve comprehensive test coverage across all untested core modules: engine core (engine.js), game definitions (spy.js, quiz.js action/scoring paths), session management (room.js player lifecycle, manager.js), and transport layer (ws-adapter.js). This is a quality/reliability phase — no new features, no behavior changes.

</domain>

<decisions>
## Implementation Decisions

### Scope — what needs tests
- **D-01:** engine.js — all 4 core functions (createGame, processAction, getView, checkEnd) including error paths
- **D-02:** spy.js — setup (spy assignment), clue submission, guess scoring, timer phase transitions, per-player view filtering
- **D-03:** quiz.js — answer submission (with powerups), all 4 timerExpired transitions, scoring mechanics, view filtering (quiz-timer.test.js covers transitions but not actions/scoring)
- **D-04:** room.js — player lifecycle (add/remove), admin promotion, ready state, game suggestions, game registry (room-voting.test.js covers voting but not core lifecycle)
- **D-05:** manager.js — room creation (code uniqueness), lookup, cleanup of stale rooms, player-to-room mapping
- **D-06:** ws-adapter.js — message dispatch, rate limiting, reconnection grace period

### What already has coverage (skip or extend)
- **D-07:** number-guess.js — 12 tests exist, covers setup/guess/view/endIf (sufficient)
- **D-08:** gin-rummy.js — 99 tests exist (sufficient)
- **D-09:** shithead.js — 14 tests exist (sufficient)
- **D-10:** question-form.js — tests exist (sufficient)
- **D-11:** template.js — 9 tests exist (sufficient)
- **D-12:** fetcher layer — opentrivia, cached-fetcher, categories all covered (sufficient)

### Claude's Discretion
- Test file organization (one file per module vs grouped)
- Mock strategy for WebSocket connections in ws-adapter tests
- Whether to use real timers or fake timers for spy/quiz timer tests
- Depth of error path coverage — cover the likely paths, don't aim for 100%
- Whether manager.js cleanup tests use real setTimeout or vi.advanceTimersByTime

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Engine core
- `src/engine/engine.js` — Core functions: createGame, processAction, getView, checkEnd
- `src/engine/games/quiz.js` — Quiz game with timerExpired, answer action, scoring
- `src/engine/games/spy.js` — Spy game with clues, guessing, per-player view filtering

### Session layer
- `src/session/room.js` — Room class: players Map, admin logic, ready state, game lifecycle, GAME_REGISTRY
- `src/session/manager.js` — RoomManager singleton: room creation, lookup, cleanup timer

### Transport layer
- `src/transport/ws-adapter.js` — WebSocket server: message dispatch, rate limiting, heartbeat, reconnection

### Existing test patterns
- `tests/engine/number-guess.test.js` — Example of engine-level game tests
- `tests/engine/gin-rummy.test.js` — Example of comprehensive game tests with harness
- `tests/engine/game-harness.js` — Test helpers: createTestGame, act, viewFor, isOver
- `tests/session/room-voting.test.js` — Example of room unit tests with direct instantiation

### Project constraints
- `CLAUDE.md` — Vitest with globals: false, ESM, import describe/it/expect explicitly

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/engine/game-harness.js` — createTestGame, act, actChain, viewFor, isOver, playUntilEnd
- Existing vi.mock/vi.stubGlobal patterns in fetcher tests
- Room direct instantiation pattern in room-voting.test.js

### Established Patterns
- TDD style: import from vitest, describe blocks per function/feature
- Game tests use game-harness helpers, not raw engine calls
- Fetcher tests mock global fetch with vi.stubGlobal
- No test database or external services — everything is in-memory

### Integration Points
- ws-adapter tests will need mock WebSocket connections
- manager tests will need fake timers for cleanup interval
- room tests need mock game definitions for startGame testing

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Follow existing test patterns established in prior phases.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-test-coverage*
*Context gathered: 2026-03-24*
