# Phase: Gin Rummy - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement Gin Rummy as a new game in the Small Hours engine. Single-file game definition following the existing `{setup, actions, view, endIf}` pattern. 2-player only card game with multi-hand scoring to 100 points. Register in GAME_REGISTRY.

</domain>

<decisions>
## Implementation Decisions

### Player Count & Party Fit
- **D-01:** Strict 2-player game. Engine throws error if players.length !== 2.
- **D-02:** Game should be grayed out / unavailable in lobby when player count is not exactly 2.

### Display / TV Screen
- **D-03:** No player cards shown on TV during normal play. TV shows scoreboard + game event feed ("Player drew from stock", "Player knocked!", "Gin! +20 bonus").
- **D-04:** During scoring phase (after knock), TV DOES reveal both hands laid out — melds grouped, deadwood highlighted. This is the dramatic reveal moment.
- **D-05:** Cumulative scores, hand number, and whose turn it is always visible on TV.

### Knock & Layoff Flow
- **D-06:** Auto-compute optimal melds on knock (engine finds best arrangement, player just sends `{type: 'knock'}`).
- **D-07:** Auto-layoff for opponent (engine computes optimal layoffs automatically). No manual layoff interaction needed.

### Game Length
- **D-08:** Standard 100-point target. Configurable via `config.targetScore`.

### Claude's Discretion
- Player count enforcement strategy (engine-level, lobby-level, or both)
- First-turn upcard refusal flow implementation (dedicated phase vs inline logic)
- Big Gin bonus amount (31 recommended, config-overridable)
- Exact event feed message format and content

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Game Engine Pattern
- `src/engine/games/template.js` — Minimal game definition reference (setup/actions/view/endIf contract)
- `src/engine/games/shithead.js` — Complex card game reference (deck creation, shuffle, hand management, wrapAction, multi-phase flow)
- `src/engine/engine.js` — Core engine contract (createGame, processAction, getView, checkEnd)

### Game Registration
- `src/engine/games/index.js` — Re-exports all games (new game must be added here)
- `src/session/room.js` — GAME_REGISTRY object (new game must be registered here)

### Rules Source
- `https://www.pagat.com/rummy/ginrummy.html` — Authoritative Gin Rummy rules (fetched and summarized in RESEARCH.md)

### Research
- `.planning/phases/gin-rummy-research/RESEARCH.md` — Complete rules summary, meld detection algorithm, state machine design, scoring rules, common pitfalls

### Test Harness
- `tests/engine/game-harness.js` — Test helpers (createTestGame, act, actChain, viewFor, isOver, playUntilEnd)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shuffleArray(arr)` from shithead.js — Fisher-Yates shuffle (copy into gin-rummy.js)
- `createDeck(deckCount)` from shithead.js — 52-card deck generator (adapt: Ace=1 instead of 14)
- `wrapAction(fn)` from shithead.js — error-to-event conversion pattern
- `game-harness.js` test helpers — createTestGame, act, viewFor, isOver

### Established Patterns
- Single-file game definitions (no subdirectories)
- Card shape: `{id: '5h_0', suit: 'h', rank: 5}`
- Phase-based state machines with `state.phase` string
- `currentPlayerIndex` for turn tracking
- Actions throw errors for invalid input; wrapAction catches and converts to events

### Integration Points
- `src/engine/games/index.js` — add re-export
- `src/session/room.js` — add to GAME_REGISTRY
- WebSocket protocol: `{ type: 'GAME_ACTION', action: { type: 'draw', ... } }`

</code_context>

<specifics>
## Specific Ideas

- Event feed on TV narrates the game: draw events, knock announcements, scoring results
- Scoring reveal on TV is the "big moment" — both hands displayed with melds grouped and deadwood called out
- During normal play, TV is a scoreboard — no card information leaked

</specifics>

<deferred>
## Deferred Ideas

- Manual layoff mode (let opponent choose which cards to lay off interactively)
- Tournament/round-robin mode for more than 2 players
- Spectator view on phones for non-playing room members
- Card animations on TV display

</deferred>

---

*Phase: gin-rummy*
*Context gathered: 2026-03-24*
