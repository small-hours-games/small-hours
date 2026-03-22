# Phase 3: Category Voting - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Players see available OpenTrivia DB categories, vote on one before the quiz starts, and the quiz launches with real questions for the winning category. Vote results are visible to all players and the host display in real time. Non-quiz games are unaffected.

</domain>

<decisions>
## Implementation Decisions

### Category source
- **D-01:** Fetch available categories from `https://opentdb.com/api_category.php` via a new `fetchCategories()` function in the fetcher layer (`src/fetcher/opentrivia.js`)
- **D-02:** Cache the category list to disk at `data/categories.json` (same pattern as question cache — read from disk first, fetch on miss)
- **D-03:** Categories cache never expires (OpenTrivia DB categories rarely change)
- **D-04:** Category shape: `{ id: number, name: string }` — matches the API response shape

### Voting flow
- **D-05:** When admin selects "quiz" as game type, the room enters a `categoryVoting` state (new room property)
- **D-06:** Players see the category list and tap to vote — one vote per player, can change vote
- **D-07:** Admin sees a live tally of votes per category on the host display
- **D-08:** Admin clicks "Start Quiz" to launch with the winning category — this triggers `room.startGame('quiz', { categoryId: winningId })`
- **D-09:** Non-quiz games skip the voting step entirely — existing `START_MINI_GAME` flow unchanged

### Vote resolution
- **D-10:** Simple plurality — category with most votes wins
- **D-11:** On tie, admin's vote breaks the tie. If admin didn't vote among tied categories, pick the first tied category (lowest ID)
- **D-12:** Admin can override and pick any category regardless of votes (satisfies CVOTE-03 "admin's choice on tie")

### Message protocol
- **D-13:** `START_CATEGORY_VOTE` — admin → server, initiates voting phase, server fetches categories and broadcasts them
- **D-14:** `CATEGORY_VOTE` — player → server, `{ type: 'CATEGORY_VOTE', categoryId: number }`, server validates categoryId exists
- **D-15:** Vote state is included in `room.getState()` so `LOBBY_UPDATE` broadcasts carry vote tallies automatically (reuses existing broadcast pattern)
- **D-16:** `START_MINI_GAME` with `gameType: 'quiz'` resolves the winning category from votes, then proceeds with normal quiz start flow

### Room state additions
- **D-17:** New room properties: `categoryVotes` (Map<playerId, categoryId>), `availableCategories` (array), `votingActive` (boolean)
- **D-18:** `getState()` includes categories and vote tallies when `votingActive` is true
- **D-19:** `categoryVotes` and `votingActive` reset when game starts or room returns to lobby

### Claude's Discretion
- Exact structure of category fetcher/cacher (separate module vs extending cached-fetcher)
- How `getState()` formats vote tallies for clients
- Test strategy and mock approach for category API
- Whether `availableCategories` is fetched eagerly (on vote start) or lazily

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fetcher layer (Phase 1-2 outputs)
- `src/fetcher/opentrivia.js` — Raw fetcher, `fetchQuestions()`. Category fetching (`fetchCategories()`) will be added here.
- `src/fetcher/cached-fetcher.js` — Cache-through wrapper. May need to wrap `fetchCategories()` too.

### Session layer
- `src/session/room.js` — Room class with `gameSuggestions` Map (line ~75), `getState()` (line ~156), `startGame()` (line ~196). All integration points for voting.
- `src/session/room.js` — `suggestGame()` method (line ~148) — similar pattern to category voting

### Transport layer
- `src/transport/ws-adapter.js` — `handleMessage` switch (line ~204), existing message types: `SUGGEST_GAME`, `START_MINI_GAME`. New handlers for `START_CATEGORY_VOTE` and `CATEGORY_VOTE` follow the same pattern.
- `src/transport/ws-adapter.js` — `broadcastToRoom()` (line ~41) — reuse for vote updates via `LOBBY_UPDATE`

### Project constraints
- `CLAUDE.md` — Zero production deps, Node.js 22 ESM, Vitest
- `SPEC.md` §5.1 — Quiz game spec
- OpenTrivia DB category API: `https://opentdb.com/api_category.php` returns `{ trivia_categories: [{ id, name }] }`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gameSuggestions` Map in Room — per-player game suggestion pattern, very similar to category voting
- `broadcastToRoom()` + `LOBBY_UPDATE` — existing real-time broadcast of room state changes
- `handleSuggestGame()` in ws-adapter — template for `handleCategoryVote()`
- `cached-fetcher.js` disk cache pattern — reusable for category list caching

### Established Patterns
- Message types are UPPER_SNAKE_CASE strings
- Handler functions follow `function handleXxx(ws, meta, room, msg)` signature
- Room state changes trigger `broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() })`
- Admin validation: `if (meta.role !== 'host')` check before privileged actions

### Integration Points
- `room.getState()` — add categories and vote tallies to lobby state object
- `handleMessage` switch — add `START_CATEGORY_VOTE` and `CATEGORY_VOTE` cases
- `room.startGame('quiz', config)` — resolve winning categoryId from votes before calling
- `src/fetcher/opentrivia.js` — add `fetchCategories()` export

</code_context>

<specifics>
## Specific Ideas

- The existing `gameSuggestions` pattern is almost exactly what category voting needs — a Map of playerId → choice, broadcast via getState(). The implementation should follow this proven pattern closely.
- OpenTrivia DB category API response: `{ trivia_categories: [{ id: 9, name: "General Knowledge" }, { id: 10, name: "Entertainment: Books" }, ...] }` — about 24 categories.
- Vote tallies in `getState()` should be aggregated (category → count), not raw (playerId → categoryId), to avoid exposing who voted for what to other players.

</specifics>

<deferred>
## Deferred Ideas

- Category filtering (show only categories with enough cached questions) — future optimization
- Custom category ordering or favorites — future milestone
- Multi-round voting or ranked choice — unnecessary complexity for v2.1
- Category icons or descriptions — API doesn't provide them

</deferred>

---

*Phase: 03-category-voting*
*Context gathered: 2026-03-22*
