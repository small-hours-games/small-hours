# Phase 1: Question Fetcher - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a standalone fetcher module that retrieves decoded quiz questions from the OpenTrivia DB API and reports failure cleanly. Register the quiz game in GAME_REGISTRY and wire the fetcher into the session layer so quizzes can be started with real questions from the lobby.

</domain>

<decisions>
## Implementation Decisions

### Integration wiring
- **D-01:** Fetcher is a standalone module (e.g., `src/fetcher/opentrivia.js`) — separate from both engine and session layers
- **D-02:** `room.startGame()` in `src/session/room.js` calls the fetcher when game type is quiz — fetches questions before creating the game instance
- **D-03:** Quiz game is registered in `GAME_REGISTRY` in `room.js` so it's selectable from the lobby
- **D-04:** When the API fails, `room.startGame()` returns the error to the caller (transport layer). The game does not start. Transport sends an ERROR message to clients.

### Claude's Discretion
- Error object shape (result wrapper vs thrown error, error codes/types)
- HTML entity decoding approach (library like `he` vs hand-rolled for common entities)
- Exact module API surface (`fetchQuestions` signature, parameter validation)
- Test structure and coverage scope
- Whether `room.startGame()` becomes async or uses a pre-fetch pattern

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quiz engine
- `src/engine/games/quiz.js` — Question shape expected by engine: `{id, question, correct_answer, incorrect_answers, category, difficulty}`. See `setup()` for how `config.questions` is consumed.
- `src/engine/engine.js` — Core engine contract: `createGame`, `processAction`, `getView`, `checkEnd`

### Session layer
- `src/session/room.js` — `startGame(gameType, config)` method (line ~186). `GAME_REGISTRY` object (line ~18) — quiz must be added here.
- `src/session/manager.js` — RoomManager singleton

### Transport layer
- `src/transport/ws-adapter.js` — `handleStartMiniGame()` (line ~302) — calls `room.startGame()`, broadcasts result or error to clients

### Project constraints
- `CLAUDE.md` — Zero production npm deps initially, earn dependencies. Node.js 22 ESM. Vitest for tests.
- `SPEC.md` §5.1 — Quiz game spec including phases, scoring, powerups
- `SPEC.md` §7.1 — Question cache spec (Phase 2, but defines the shape the fetcher feeds into)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Quiz game engine (`src/engine/games/quiz.js`) is complete — phases, powerups, streaks, scoring all work. Just needs questions fed in.
- Node.js 22 native `fetch()` available — no HTTP library needed.

### Established Patterns
- Games are plain objects with `{setup, actions, view, endIf}` — no classes
- Engine is pure functions, no I/O — fetching MUST happen outside the engine
- ESM imports throughout (`import`/`export default`)
- No existing tests — Phase 1 will establish the test pattern

### Integration Points
- `room.startGame('quiz', { questions: [...] })` — this is where fetched questions enter the engine
- `ws-adapter.handleStartMiniGame()` — receives `START_MINI_GAME` WebSocket message, calls `room.startGame()`
- `GAME_REGISTRY` in `room.js` — quiz must be registered here for lobby selection

</code_context>

<specifics>
## Specific Ideas

- OpenTrivia DB API shape matches quiz engine shape closely — field names are the same (`correct_answer`, `incorrect_answers`, `category`, `difficulty`). Main transform is HTML decoding + generating an `id`.
- API rate limit is ~1 req/5s per IP — fetcher should respect this but Phase 1 doesn't need sophisticated rate limiting (Phase 2 cache will reduce API calls).
- API returns `response_code` field: 0=success, 1=no results, 2=invalid parameter, 3=token not found, 4=token exhausted, 5=rate limit. Fetcher should handle all codes.

</specifics>

<deferred>
## Deferred Ideas

- Disk caching of fetched questions — Phase 2
- Category list fetching and voting — Phase 3
- Session tokens for question deduplication — Phase 2/3
- Difficulty filtering — future milestone (QPOL-01)
- Background pre-fetching — future milestone (QPOL-02)

</deferred>

---

*Phase: 01-question-fetcher*
*Context gathered: 2026-03-22*
