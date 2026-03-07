# Test Coverage Analysis

## Current State

### Existing Tests
The project has **3 end-to-end (E2E) tests** using Puppeteer against a live deployed server (`https://quiz.aldervall.se`):

| Test file | What it covers |
|---|---|
| `tests/fullgame.mjs` | Full quiz game: create room → join → answer questions → game over → return to lobby |
| `tests/continue.mjs` | Quiz "Continue Game" flow: play round 1 → continue → round 2 scores carry over |
| `tests/restart.mjs` | Quiz restart: play game → return to lobby → verify state reset → start game 2 |

### What's Missing: **Zero Unit Tests**

Running `npm test` (`node --test`) finds **0 tests**. The `nyc` coverage config exists in `package.json` but has nothing to measure — there are no unit or integration tests, only Puppeteer E2E scripts that run against a remote server and aren't wired into `npm test`.

---

## Coverage Gaps (by module)

### 1. `game.js` — Quiz Game (HIGH PRIORITY)

The `Game` class has ~530 lines of complex stateful logic with **zero unit tests**. Key areas to test:

- **Player management**: `addPlayer()` validation (empty name, too-long name, duplicate in lobby, reconnection during game), `removePlayer()` behavior in lobby vs in-game
- **Scoring logic**: `receiveAnswer()` — time-based scoring formula, `doublePoints` powerup multiplier, streak tracking, correct vs incorrect delta
- **State machine transitions**: LOBBY → FETCHING → COUNTDOWN → QUESTION_ACTIVE → REVEAL → BETWEEN_QUESTIONS → GAME_OVER (and error states like FETCHING → LOBBY on failure)
- **Powerups**: `usePowerup()` — all three types (doublePoints, fiftyFifty, timeFreeze), edge cases (no uses remaining, already active, already answered, invalid type)
- **`continueGame()`**: scores preserved across rounds, `seenQuestions` deduplication, state reset on fetch failure
- **`handleMessage()`**: admin-only actions (SKIP, CONTINUE_GAME), answer routing
- **Auto-advance**: everyone answered triggers early reveal
- **`_buildScores()` / `_buildRevealPayload()`**: answer breakdown percentages, rank calculation, rank changes

### 2. `shithead.js` — Shithead Card Game (HIGH PRIORITY)

~750 lines of card game logic with **zero tests** and **zero E2E coverage**:

- **Card rules**: `_canPlay()` — rank-based play validation, special cards (2=reset, 10=burn, 7=reverse), rank-3 transparency
- **`_isFourOfAKind()`**: pile burn detection
- **`playCards()`**: multi-card plays (same rank), zone progression (hand → faceUp → faceDown), replenish from deck
- **`playFaceDown()`**: blind play — unplayable card forces pile pickup
- **Turn management**: `_advanceTurn()`, `_playerFinished()` removing from turn order, last-player-standing becomes shithead
- **Swap phase**: `swapCard()` hand↔faceUp exchange, `confirmSwap()` ready gate
- **Bot AI**: `_botPlay()` — plays highest valid card, picks up when stuck
- **Inactivity kick**: `_kickInactivePlayer()` after 40s timeout
- **Edge cases**: 2-player endgame, player disconnect mid-game, reconnection state sync

### 3. `cah.js` — Cards Against Humanity (HIGH PRIORITY)

~440 lines with **zero tests** and **zero E2E coverage**:

- **Round flow**: LOBBY → PICKING → JUDGING → ROUND_OVER → next round or GAME_OVER
- **`submitCards()`**: czar cannot submit, correct pick count validation, card removal from hand
- **`czarPick()`**: only czar can pick, point awarding, czar rotation
- **Hand replenishment**: `_replenishHands()` draws from white deck
- **`startGame()`**: deck shuffling, hand dealing, maxRounds clamping
- **Edge cases**: reconnection during JUDGING phase (czar sees judge UI), player disconnect

### 4. `games/spy/server/game.js` — Spy Game (MEDIUM PRIORITY)

~230 lines with **zero tests** and **zero E2E coverage**:

- **Phase transitions**: SETUP → CLUES → GUESS → REVEAL → SCORE → next round
- **`receiveClue()`**: only non-spies during CLUES phase
- **`receiveGuess()`**: only spy during GUESS phase
- **Scoring**: spy correct guess = +3, spy wrong = non-spies each +1
- **`getState()`**: information hiding — spy shouldn't see the word until REVEAL, display always sees word
- **`update()`**: time-based auto-transition between phases

### 5. `server/rooms.js` — Room Management (MEDIUM PRIORITY)

- **`generateRoomCode()`**: uniqueness, character set (no ambiguous I/O/0)
- **`createRoom()`**: all fields initialized correctly
- **`buildLobbyState()`**: game suggestion tallying, vote tallying, ready/allReady logic
- **`nameToAvatar()`**: deterministic hash → emoji mapping
- **`createRoomBroadcast()`**: targeted send vs broadcast-all

### 6. `server/handlers.js` — Message Handler (MEDIUM PRIORITY)

- **`handleMessage()`**: routing ~20 message types to correct game methods
- **Admin authorization**: START_MINI_GAME, RETURN_TO_LOBBY, REMOVE_PLAYER, SKIP, SET_LANGUAGE — all require admin
- **Player count validation**: Shithead ≥ 2, CAH ≥ 3, Spy ≥ 3
- **`handlePlayerDisconnect()`**: admin handoff, `_returningFromGame` flag, stale WS detection
- **`maybeCleanupRoom()`**: 30s grace period, cleanup conditions

### 7. `server/broadcast.js` — Broadcast Utilities (LOW PRIORITY)

- **`broadcastAll()`**: sends to both player and display sockets
- **`broadcastVoteUpdate()`**: vote tally calculation, allVoted logic
- Simple functions — test if time permits

### 8. `local-db.js` — Local Question Database (MEDIUM PRIORITY)

- **`processRaw()`**: answer shuffling, time limit calculation per difficulty, score multiplier
- **`getQuestionsFromLocalDB()`**: category filtering, difficulty filtering, LRU ordering (never-used first, then oldest-used), `seenQuestions` deduplication
- **`markQuestionsUsed()`**: usage timestamp recording
- **`dbStatus()`**: question/category counting from DB file

### 9. `questions.js` — Question Fetching (LOW PRIORITY)

- **`processQuestions()`**: URL decoding, answer shuffling, time limit logic, question ID generation
- API interactions are hard to unit test without mocking — lower priority

### 10. `translator.js` — Translation (LOW PRIORITY)

- **`cacheKey()`**: deterministic hash generation
- **`translateQuestions()`**: parallel translation, cache usage, English passthrough
- Requires network mocking — lower priority

---

## Recommendations

### Phase 1: Unit tests for game logic classes (highest value)

These are pure logic classes that take a `broadcast` callback — trivially testable by passing a mock function. Start here:

1. **`game.js`** — Quiz game scoring, player management, powerups, state machine
2. **`shithead.js`** — Card play validation, turn management, endgame detection
3. **`cah.js`** — Round flow, submission/judging, czar rotation

Each of these can be tested by:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { Game } = require('../game');

test('addPlayer rejects empty username', () => {
  const msgs = [];
  const game = new Game(msg => msgs.push(msg));
  const result = game.addPlayer({readyState:1, send:()=>{}}, '');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 'INVALID_USERNAME');
});
```

### Phase 2: Room/handler integration tests

Test `handleMessage()` and `handlePlayerDisconnect()` with mock room objects — verifies message routing, admin authorization, and player count gates without needing a real WebSocket server.

### Phase 3: Data layer tests

Test `processRaw()`, `getQuestionsFromLocalDB()`, and `buildLobbyState()` with synthetic data fixtures.

### Phase 4: Improve E2E tests

- Wire existing Puppeteer tests to run against a local server (currently hardcoded to `https://quiz.aldervall.se`)
- Add E2E coverage for Shithead, CAH, and Spy games
- Add assertions (current tests mostly `console.log` with emoji indicators rather than using a test framework's assertions)

---

## Summary Table

| Module | Lines | Unit Tests | E2E Coverage | Priority |
|---|---|---|---|---|
| `game.js` | 571 | None | Partial (quiz only) | **HIGH** |
| `shithead.js` | 752 | None | None | **HIGH** |
| `cah.js` | 443 | None | None | **HIGH** |
| `games/spy/server/game.js` | 231 | None | None | **MEDIUM** |
| `server/handlers.js` | 423 | None | Indirect | **MEDIUM** |
| `server/rooms.js` | 109 | None | None | **MEDIUM** |
| `local-db.js` | 267 | None | None | **MEDIUM** |
| `server/broadcast.js` | 46 | None | None | LOW |
| `questions.js` | 163 | None | None | LOW |
| `translator.js` | 105 | None | None | LOW |
