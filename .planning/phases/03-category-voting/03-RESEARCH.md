# Phase 03: Category Voting - Research

**Researched:** 2026-03-22
**Domain:** WebSocket session layer state extension, disk caching, real-time vote broadcast
**Confidence:** HIGH

## Summary

Phase 03 adds a pre-game voting step to the existing room lobby. The design is almost entirely constrained by CONTEXT.md — there is no technology selection to make. All decisions have been locked. The research goal is to verify integration points so the planner can write exact, correct tasks.

The existing codebase has a precise analogue for category voting already: `gameSuggestions` is a `Map<playerId, gameType>` stored on `Room`, serialized via `getState()`, and broadcast via `LOBBY_UPDATE`. Category voting follows an identical pattern. The primary implementation risk is async coordination: `START_CATEGORY_VOTE` must await a disk read (or API fetch) before broadcasting the category list, which is the same async pattern already in place for `handleStartMiniGame`.

The category cache follows the existing `cached-fetcher.js` pattern almost exactly — read from disk first, fetch on miss, write to disk, never expire. The main difference is the cache key is a fixed filename (`categories.json`) rather than a per-category ID.

**Primary recommendation:** Model every new piece after the nearest existing pattern. `fetchCategories()` mirrors `fetchQuestions()`. `categoryVotes` mirrors `gameSuggestions`. `handleCategoryVote()` mirrors `handleSuggestGame()`. `handleStartCategoryVote()` mirrors `handleStartMiniGame()` for the async fetch.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Category source**
- D-01: Fetch available categories from `https://opentdb.com/api_category.php` via a new `fetchCategories()` function in the fetcher layer (`src/fetcher/opentrivia.js`)
- D-02: Cache the category list to disk at `data/categories.json` (same pattern as question cache — read from disk first, fetch on miss)
- D-03: Categories cache never expires (OpenTrivia DB categories rarely change)
- D-04: Category shape: `{ id: number, name: string }` — matches the API response shape

**Voting flow**
- D-05: When admin selects "quiz" as game type, the room enters a `categoryVoting` state (new room property)
- D-06: Players see the category list and tap to vote — one vote per player, can change vote
- D-07: Admin sees a live tally of votes per category on the host display
- D-08: Admin clicks "Start Quiz" to launch with the winning category — this triggers `room.startGame('quiz', { categoryId: winningId })`
- D-09: Non-quiz games skip the voting step entirely — existing `START_MINI_GAME` flow unchanged

**Vote resolution**
- D-10: Simple plurality — category with most votes wins
- D-11: On tie, admin's vote breaks the tie. If admin didn't vote among tied categories, pick the first tied category (lowest ID)
- D-12: Admin can override and pick any category regardless of votes (satisfies CVOTE-03 "admin's choice on tie")

**Message protocol**
- D-13: `START_CATEGORY_VOTE` — admin to server, initiates voting phase, server fetches categories and broadcasts them
- D-14: `CATEGORY_VOTE` — player to server, `{ type: 'CATEGORY_VOTE', categoryId: number }`, server validates categoryId exists
- D-15: Vote state is included in `room.getState()` so `LOBBY_UPDATE` broadcasts carry vote tallies automatically (reuses existing broadcast pattern)
- D-16: `START_MINI_GAME` with `gameType: 'quiz'` resolves the winning category from votes, then proceeds with normal quiz start flow

**Room state additions**
- D-17: New room properties: `categoryVotes` (Map<playerId, categoryId>), `availableCategories` (array), `votingActive` (boolean)
- D-18: `getState()` includes categories and vote tallies when `votingActive` is true
- D-19: `categoryVotes` and `votingActive` reset when game starts or room returns to lobby

### Claude's Discretion
- Exact structure of category fetcher/cacher (separate module vs extending cached-fetcher)
- How `getState()` formats vote tallies for clients
- Test strategy and mock approach for category API
- Whether `availableCategories` is fetched eagerly (on vote start) or lazily

### Deferred Ideas (OUT OF SCOPE)
- Category filtering (show only categories with enough cached questions)
- Custom category ordering or favorites
- Multi-round voting or ranked choice
- Category icons or descriptions
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CVOTE-01 | Available categories are fetched from OpenTrivia DB and presented to players | `fetchCategories()` in opentrivia.js, disk cache at `data/categories.json`, broadcast via `LOBBY_UPDATE` when `votingActive` |
| CVOTE-02 | Players can vote for a category in the lobby before quiz starts | `CATEGORY_VOTE` message handler in ws-adapter, `categoryVotes` Map on Room, rebroadcast via existing `LOBBY_UPDATE` pattern |
| CVOTE-03 | Admin starts quiz with the winning category (or admin's choice on tie) | `resolveWinner()` helper uses plurality, admin's vote breaks ties, lowest ID as final fallback; `START_MINI_GAME` with `gameType: 'quiz'` invokes this |
| CVOTE-04 | Category vote results are broadcast to all players and host display | `getState()` includes `voteTallies` (aggregated category-to-count) and `availableCategories` when `votingActive`; `LOBBY_UPDATE` carries this to all connected sockets |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs/promises | built-in | Read/write categories.json cache | Same as cached-fetcher.js |
| node:path / node:url | built-in | Resolve cache file path portably | Same as cached-fetcher.js |
| ws (already installed) | ^8.18.0 | WebSocket server | Already in use |
| express (already installed) | ^5.1.0 | HTTP server | Already in use |

No new npm dependencies. This phase is zero-dep.

**Installation:** None needed.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^3.1.0 | Unit tests for fetcher and Room voting logic | All test files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `category-cache.js` module | Extending `cached-fetcher.js` with a second export | Separate module is simpler to test; adding to cached-fetcher risks coupling. Claude's discretion — either works. |

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Touch these files only:

```
src/
├── fetcher/
│   └── opentrivia.js          # Add fetchCategories() export
├── session/
│   └── room.js                # Add categoryVotes Map, availableCategories, votingActive;
│                              # update getState(), startGame(), endGame(), removePlayer()
└── transport/
    └── ws-adapter.js          # Add START_CATEGORY_VOTE, CATEGORY_VOTE cases to handleMessage

data/
└── categories.json            # Created at runtime by fetchCategories() on first call

tests/
├── fetcher/
│   └── opentrivia-categories.test.js   # fetchCategories() unit tests
└── session/
    └── room-voting.test.js             # Room category voting logic unit tests
```

### Pattern 1: Fetcher — fetchCategories()

**What:** Add a named export to `src/fetcher/opentrivia.js` that hits the category endpoint and returns normalized data.
**When to use:** Called once per `START_CATEGORY_VOTE` (or on cold cache miss via the cache wrapper).

```js
// Source: opentrivia.js existing pattern (fetchQuestions is the model)
export async function fetchCategories() {
  try {
    const response = await fetch('https://opentdb.com/api_category.php');
    const data = await response.json();
    // API returns: { trivia_categories: [{ id: 9, name: "General Knowledge" }, ...] }
    const categories = data.trivia_categories.map(c => ({ id: c.id, name: c.name }));
    return { ok: true, categories };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}
```

### Pattern 2: Category Cache (Claude's discretion — recommended approach)

**What:** A small inline cache-through wrapper, either as a second export in `cached-fetcher.js` or a standalone `src/fetcher/category-cache.js`.

Recommended: add to `cached-fetcher.js` as `fetchCategories()` export — keeps cache logic colocated.

```js
// Source: cached-fetcher.js pattern (fetchQuestions is the model)
// Key difference: fixed filename 'categories.json', never expires
const CATEGORY_CACHE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/categories.json');

export async function fetchCategories() {
  try {
    const raw = await readFile(CATEGORY_CACHE_PATH, 'utf8');
    return { ok: true, categories: JSON.parse(raw) };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[cache] category read error:', err.message);
  }
  const result = await fetchCategoriesFromApi();
  if (!result.ok) return result;
  try {
    await mkdir(dirname(CATEGORY_CACHE_PATH), { recursive: true });
    await writeFile(CATEGORY_CACHE_PATH, JSON.stringify(result.categories), 'utf8');
  } catch (err) {
    console.warn('[cache] category write error:', err.message);
  }
  return result;
}
```

### Pattern 3: Room — New Voting State

**What:** Three new properties on the Room constructor, cleanup in existing lifecycle hooks.

```js
// src/session/room.js — constructor additions
this.categoryVotes = new Map();     // Map<playerId, categoryId>
this.availableCategories = [];      // [{ id, name }]
this.votingActive = false;

// removePlayer — also clean up votes (mirror gameSuggestions)
this.categoryVotes.delete(playerId);

// endGame / return to lobby — reset voting state
this.categoryVotes.clear();
this.availableCategories = [];
this.votingActive = false;
```

### Pattern 4: Room — getState() Vote Tally

**What:** Aggregate votes into category-to-count object. Do NOT expose who voted for what.

```js
// getState() addition — only included when votingActive
if (this.votingActive) {
  const tallies = {};
  for (const categoryId of this.categoryVotes.values()) {
    tallies[categoryId] = (tallies[categoryId] || 0) + 1;
  }
  state.votingActive = true;
  state.availableCategories = this.availableCategories;
  state.voteTallies = tallies;    // { "9": 3, "17": 1 }
  state.myVote = null;            // resolved per-player in ws-adapter if needed
}
```

Note: `getState()` is broadcast-level (not per-player). For per-player "which category did I vote for", the ws-adapter can optionally attach `myVote` when building the player-targeted message. Given that voting is public (players see tallies not names), this is low priority.

### Pattern 5: Room — resolveWinningCategory()

**What:** New method that implements plurality + tie-break logic.

```js
resolveWinningCategory() {
  if (this.categoryVotes.size === 0) {
    // No votes — pick first available (lowest id)
    return this.availableCategories[0]?.id ?? null;
  }
  // Build tally
  const tallies = new Map();
  for (const [, catId] of this.categoryVotes) {
    tallies.set(catId, (tallies.get(catId) || 0) + 1);
  }
  const maxCount = Math.max(...tallies.values());
  const tied = [...tallies.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([catId]) => catId);

  if (tied.length === 1) return tied[0];

  // Tie — check if admin voted for one of the tied categories
  let adminId = null;
  for (const [id, p] of this.players) {
    if (p.isAdmin) { adminId = id; break; }
  }
  if (adminId && this.categoryVotes.has(adminId)) {
    const adminVote = this.categoryVotes.get(adminId);
    if (tied.includes(adminVote)) return adminVote;
  }
  // Final fallback — lowest id among tied
  return tied.sort((a, b) => a - b)[0];
}
```

### Pattern 6: ws-adapter — New Message Handlers

**What:** Two new cases in the `handleMessage` switch; one async, one sync.

```js
// handleMessage switch additions
case 'START_CATEGORY_VOTE':
  handleStartCategoryVote(ws, meta, room, msg).catch(err => {
    send(ws, { type: 'ERROR', message: err.message });
  });
  break;
case 'CATEGORY_VOTE':
  handleCategoryVote(ws, meta, room, msg);
  break;
```

```js
// handleStartCategoryVote — admin only, async (awaits disk/network)
async function handleStartCategoryVote(ws, meta, room, msg) {
  if (!meta.playerId) { send(ws, { type: 'ERROR', message: 'Not joined yet' }); return; }
  const player = room.players.get(meta.playerId);
  if (!player?.isAdmin) { send(ws, { type: 'ERROR', message: 'Only admin can start voting' }); return; }

  const result = await fetchCategories();   // from cached-fetcher
  if (!result.ok) { send(ws, { type: 'ERROR', message: result.error.message }); return; }

  room.availableCategories = result.categories;
  room.votingActive = true;
  room.categoryVotes.clear();

  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}
```

```js
// handleCategoryVote — any player, sync
function handleCategoryVote(ws, meta, room, msg) {
  if (!meta.playerId) { send(ws, { type: 'ERROR', message: 'Not joined yet' }); return; }
  if (!room.votingActive) { send(ws, { type: 'ERROR', message: 'Voting not active' }); return; }

  const categoryId = Number(msg.categoryId);
  const valid = room.availableCategories.some(c => c.id === categoryId);
  if (!valid) { send(ws, { type: 'ERROR', message: 'Invalid categoryId' }); return; }

  room.categoryVotes.set(meta.playerId, categoryId);
  room.lastActivity = Date.now();
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}
```

### Pattern 7: START_MINI_GAME quiz path — resolve winner

**What:** In `handleStartMiniGame`, when `gameType === 'quiz'` and no explicit `categoryId` is in `msg.config`, resolve from votes.

```js
// handleStartMiniGame — quiz category resolution
async function handleStartMiniGame(ws, meta, room, msg) {
  // ... existing admin / joined checks ...

  let config = msg.config || {};

  // If quiz and voting was active, resolve the winner
  if (msg.gameType === 'quiz' && room.votingActive) {
    config = { ...config, categoryId: room.resolveWinningCategory() };
  }

  try {
    const game = await room.startGame(msg.gameType, config);
    // ... existing broadcast logic ...
  } catch (err) {
    send(ws, { type: 'ERROR', message: err.message });
  }
}
```

`room.startGame()` already resets `gameSuggestions`. It must also reset voting state (handled in D-19 via `endGame()` or directly in `startGame()`).

### Anti-Patterns to Avoid

- **Exposing raw votes (playerId → categoryId) in getState():** Aggregated tallies only. Per-player identity leaks are against "players are ephemeral" principle.
- **Fetching categories on every LOBBY_UPDATE:** Fetch once per `START_CATEGORY_VOTE` (stored in `room.availableCategories`). getState() reads from the in-memory array.
- **Letting voting state survive into the running game:** `startGame()` must clear `votingActive`, `categoryVotes`, and `availableCategories` (D-19).
- **Making the voting step mandatory for non-quiz games:** D-09 is explicit — `START_CATEGORY_VOTE` is a separate message the admin initiates only for quiz. The existing `START_MINI_GAME` path for other games is untouched.
- **Using globals: true in vitest:** Project config explicitly sets `globals: false` — always import `describe`, `it`, `expect` from `vitest`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vote aggregation (count per category) | Custom class | Plain `Map` / object accumulator | Already sufficient for < 24 categories |
| Category list fetching | Custom HTTP client | `fetch()` (Node 22 built-in) | Same pattern as `fetchQuestions()` |
| Disk caching | Custom persistence layer | Node `fs/promises` + JSON | Already proven in `cached-fetcher.js` |
| Real-time broadcast | Custom pub/sub | Existing `broadcastToRoom()` + `LOBBY_UPDATE` | Already connects every socket in the room |

**Key insight:** This phase has zero "new" technical problems — every sub-problem has an existing solved analogue in the codebase.

---

## Common Pitfalls

### Pitfall 1: Voting state not reset on game start

**What goes wrong:** `votingActive` remains `true` after the quiz starts. `getState()` keeps broadcasting an empty category list. Returning to lobby still shows old votes.
**Why it happens:** `startGame()` clears `gameSuggestions` but has no knowledge of voting state unless explicitly added.
**How to avoid:** Reset all three properties (`categoryVotes`, `availableCategories`, `votingActive`) inside `startGame()` (or via `endGame()` which is called from return-to-lobby).
**Warning signs:** `LOBBY_UPDATE` after game start still includes `votingActive: true` in the state object.

### Pitfall 2: categoryId type mismatch (string vs number)

**What goes wrong:** API returns category IDs as numbers. WebSocket JSON payload comes in as a number. But somewhere in the chain a comparison uses `===` between a string `"9"` (from `msg.categoryId`) and a number `9` (from `availableCategories`).
**Why it happens:** JSON numbers survive JSON.parse as numbers, but if a frontend or test sends `categoryId: "9"` it is a string.
**How to avoid:** Always coerce with `Number(msg.categoryId)` before validation and storage.
**Warning signs:** `availableCategories.some(c => c.id === categoryId)` returns false for a known-valid category.

### Pitfall 3: fetchCategories() called on every vote, not once

**What goes wrong:** `handleCategoryVote()` calls `fetchCategories()` on each vote. 24 votes = 24 disk reads (or network hits if cache cold).
**Why it happens:** Placing the fetch inside the vote handler instead of the vote-start handler.
**How to avoid:** Fetch once in `handleStartCategoryVote()`, store in `room.availableCategories`. Vote handler validates against that array (pure sync).
**Warning signs:** `readFile` mock called multiple times in category vote tests.

### Pitfall 4: Admin override path missing

**What goes wrong:** D-12 allows admin to pass an explicit `categoryId` in `START_MINI_GAME` config, overriding votes. If the resolution logic always overwrites `config.categoryId`, the admin override is broken.
**Why it happens:** Unconditional `config.categoryId = room.resolveWinningCategory()` assignment.
**How to avoid:** Only resolve from votes if `config.categoryId` is not already set. The condition should be: `if (msg.gameType === 'quiz' && room.votingActive && !config.categoryId)`.
**Warning signs:** Admin-provided `categoryId` is silently replaced by the vote winner.

### Pitfall 5: Category cache path resolution

**What goes wrong:** `data/categories.json` resolves relative to CWD, not to the source file. Works in dev (CWD = project root), breaks in test (CWD may differ).
**Why it happens:** Using `'./data/categories.json'` instead of `__dirname`-based resolution.
**How to avoid:** Use `resolve(dirname(fileURLToPath(import.meta.url)), '../../data/categories.json')` — same pattern as `cached-fetcher.js` uses for question cache.
**Warning signs:** Cache file created in wrong directory; tests write real files.

### Pitfall 6: Disconnected player's vote persists in tally

**What goes wrong:** Player votes for category X, then disconnects during the grace period, then is removed. Their vote still counts in `resolveWinningCategory()`.
**Why it happens:** `removePlayer()` was not updated to call `this.categoryVotes.delete(playerId)`.
**How to avoid:** Mirror the existing `this.gameSuggestions.delete(playerId)` in `removePlayer()`.
**Warning signs:** Vote tally count exceeds connected player count.

---

## Code Examples

### fetchCategories() — raw API call
```js
// Source: models opentrivia.js fetchQuestions() pattern
export async function fetchCategories() {
  try {
    const response = await fetch('https://opentdb.com/api_category.php');
    const data = await response.json();
    // { trivia_categories: [{ id: 9, name: "General Knowledge" }, ...] }
    const categories = data.trivia_categories.map(c => ({ id: c.id, name: c.name }));
    return { ok: true, categories };
  } catch (err) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
}
```

### Test mock pattern for fetchCategories() (mirrors cached-fetcher.test.js)
```js
// Source: tests/fetcher/cached-fetcher.test.js pattern
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('../../src/fetcher/opentrivia.js', () => ({
  fetchCategories: vi.fn(),
  fetchQuestions: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchCategories as fetchCategoriesFromApi } from '../../src/fetcher/opentrivia.js';
import { fetchCategories } from '../../src/fetcher/cached-fetcher.js';
```

### resolveWinningCategory — unit test pattern
```js
// Source: models existing room tests
import { Room } from '../../src/session/room.js';

it('resolves plurality winner', () => {
  const room = new Room('TEST');
  room.availableCategories = [{ id: 9 }, { id: 17 }, { id: 21 }];
  room.votingActive = true;
  room.categoryVotes.set('p1', 9);
  room.categoryVotes.set('p2', 9);
  room.categoryVotes.set('p3', 17);
  expect(room.resolveWinningCategory()).toBe(9);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| gameType sent directly in START_MINI_GAME for quiz | START_CATEGORY_VOTE initiates lobby voting before START_MINI_GAME | Phase 03 | Admin must initiate vote first; quiz cannot start without going through voting flow |

**No deprecated patterns involved.** This phase extends existing patterns without replacing them.

---

## Open Questions

1. **Should `getState()` include `myVote` per player?**
   - What we know: `getState()` is broadcast-identical to all sockets. Per-player state requires either a separate targeted message or `sendToPlayer()` after each vote.
   - What's unclear: Whether the frontend needs to highlight "your current vote" vs. just seeing the tally.
   - Recommendation: Omit `myVote` from `getState()`. The tally is public; if the frontend needs it, add a targeted `VOTE_ACK` to the voter only when processing `CATEGORY_VOTE`. This is out-of-scope for the requirements as written.

2. **What if `availableCategories` is empty when `START_MINI_GAME` resolves the winner?**
   - What we know: This happens if `START_MINI_GAME` is called without prior `START_CATEGORY_VOTE` and `votingActive` is false.
   - What's unclear: Should quiz be allowed to start without voting?
   - Recommendation: The condition `if (msg.gameType === 'quiz' && room.votingActive)` handles this correctly — if voting never happened, use whatever `config.categoryId` was passed (or null for any-category, which existing `fetchQuestions()` handles).

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 |
| Config file | `vitest.config.js` (globals: false) |
| Quick run command | `npm test -- --reporter=verbose tests/fetcher/opentrivia-categories.test.js tests/session/room-voting.test.js` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CVOTE-01 | `fetchCategories()` fetches from API and caches to disk | unit | `npx vitest run tests/fetcher/opentrivia-categories.test.js` | Wave 0 |
| CVOTE-01 | Cache hit returns disk data without API call | unit | `npx vitest run tests/fetcher/opentrivia-categories.test.js` | Wave 0 |
| CVOTE-02 | `room.categoryVotes` updated by vote; invalid category rejected | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |
| CVOTE-02 | `getState()` voteTallies reflects current votes | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |
| CVOTE-03 | `resolveWinningCategory()` — plurality, admin tie-break, lowest-id fallback | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |
| CVOTE-03 | Admin override (explicit categoryId in START_MINI_GAME) not overwritten | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |
| CVOTE-04 | `getState()` includes `availableCategories` and `voteTallies` when `votingActive` | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |
| CVOTE-04 | `votingActive`, `categoryVotes`, `availableCategories` reset on game start | unit | `npx vitest run tests/session/room-voting.test.js` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/fetcher/opentrivia-categories.test.js tests/session/room-voting.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/fetcher/opentrivia-categories.test.js` — covers CVOTE-01 (fetchCategories raw + cached)
- [ ] `tests/session/room-voting.test.js` — covers CVOTE-02, CVOTE-03, CVOTE-04

*(Existing test infrastructure — vitest, fs mocks, vi.mock patterns — fully covers needs. No framework gaps.)*

---

## Sources

### Primary (HIGH confidence)
- Direct read of `src/fetcher/opentrivia.js` — fetchQuestions pattern for fetchCategories
- Direct read of `src/fetcher/cached-fetcher.js` — cache-through pattern including path resolution
- Direct read of `src/session/room.js` — gameSuggestions Map, getState(), startGame(), removePlayer()
- Direct read of `src/transport/ws-adapter.js` — handleMessage switch, broadcastToRoom, handleSuggestGame template
- Direct read of `tests/fetcher/cached-fetcher.test.js` — vi.mock patterns, test structure
- Direct read of `.planning/phases/03-category-voting/03-CONTEXT.md` — all locked decisions
- OpenTrivia DB category API shape: `https://opentdb.com/api_category.php` → `{ trivia_categories: [{ id, name }] }` (documented in CONTEXT.md canonical refs)

### Secondary (MEDIUM confidence)
- OpenTrivia DB returns ~24 categories (from STATE.md accumulated context, corroborated by API docs)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all libraries already in use
- Architecture: HIGH — all patterns verified against existing source code
- Pitfalls: HIGH — derived from direct code inspection (not speculation)
- Test patterns: HIGH — copied from adjacent test files in the same repo

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase, no fast-moving dependencies)
