# Test Coverage Analysis

## Current State

The project has **zero unit tests**. Running `npm test` (`node --test`) discovers 0 test files because the existing E2E tests in `tests/` use `.mjs` extension without the `.test.` naming convention.

### Existing Tests

| File | Type | What It Covers |
|------|------|----------------|
| `tests/fullgame.mjs` | E2E (Puppeteer) | Full quiz game flow: 2 players, 12 questions, game over screen |
| `tests/continue.mjs` | E2E (Puppeteer) | Multi-round quiz continuation, score carry-over |
| `tests/restart.mjs` | E2E (Puppeteer) | Quiz restart, lobby reset, admin crown persistence |
| `tests/spy-manual-test.md` | Manual checklist | Spy game phases, clues, guessing, scoring |

### Coverage Configuration

`nyc` is configured in `package.json` to instrument: `game.js`, `local-db.js`, `questions.js`, `server.js`, `server/*.js`, `shithead.js`, `translator.js`. However, since no tests are discovered by `node --test`, coverage is effectively **0%** across all modules.

---

## Recommended Test Improvements (Prioritized)

### 1. Game Logic Unit Tests (High Priority)

These are the highest-value targets — complex pure logic that can be tested without any I/O.

#### `game.js` — Quiz Game

- **Scoring algorithm** (`receiveAnswer`): Verify time-based scoring formula (`1000 * (0.5 + 0.5 * timeFraction) * scoreMult * powerupMult`). Test edge cases: answer at t=0, answer at timeout, score rounding.
- **Streak tracking**: Correct answers increment streak, wrong answers reset to 0.
- **Rank computation** (`_updateRanks`): Verify sorting by score, rank assignment after ties.
- **Power-up system** (`usePowerup`):
  - `doublePoints`: Score multiplier applied correctly.
  - `fiftyFifty`: Two wrong answers removed, correct answer never removed.
  - `timeFreeze`: Extra time granted.
  - Rejection cases: no uses remaining, already active, already answered, wrong game state.
- **Player management**: `addPlayer` during lobby vs. during game (reconnect vs reject), username validation (empty, >20 chars), duplicate name handling.
- **State machine transitions**: LOBBY → FETCHING → COUNTDOWN → QUESTION_ACTIVE → REVEAL → BETWEEN_QUESTIONS → GAME_OVER. Verify invalid transitions are rejected.
- **`continueGame`**: Scores preserved, `seenQuestions` deduplication works, per-round state reset.
- **Auto-advance**: When all players answer, timer is cleared and reveal triggers early.

#### `shithead.js` — Card Game

- **Card playability** (`_canPlay`): Rank 2 and 10 always playable, rank 7 restricts next play to ≤7, rank 3 is transparent.
- **Four-of-a-kind burn** (`_isFourOfAKind`): Pile burns when top 4 cards share a rank.
- **`_effectiveTopRank`**: Skips rank-3 cards to find the true top.
- **Turn order**: `_advanceTurn` wraps correctly, `_playerFinished` removes player from turn order and adjusts index.
- **Swap phase**: `swapCard` exchanges hand/faceUp cards, `confirmSwap` transitions to PLAYING when all ready.
- **Face-down play**: Unplayable face-down card forces player to pick up entire pile.
- **Inactivity timeout**: Player kicked after 40s, turn advances correctly.
- **Bot AI**: Bot plays highest valid card, picks up pile when no valid moves.
- **Game over detection**: Last remaining player becomes the "shithead".
- **Deck creation**: Correct card count (52 per deck × deckCount), all ranks/suits present.

#### `cah.js` — Cards Against Humanity

- **Czar rotation**: `czarIndex` advances each round, wraps around.
- **Card submission**: Czar cannot submit, correct `pick` count enforced, duplicate submissions rejected.
- **Judging phase**: Submissions shuffled for anonymity, czar pick awards point to correct player.
- **Hand replenishment**: Hands refilled to 7 after each round.
- **Game end**: Triggers after `maxRounds` or when black deck is exhausted.

### 2. Server Utility Unit Tests (High Priority)

#### `server/rooms.js`

- **`nameToAvatar`**: Deterministic hash-based avatar mapping. Same name always gets same avatar.
- **`generateRoomCode`**: Always 4 characters, only valid characters (no I, O), no duplicates with existing rooms.
- **`createRoom`**: Room object has all expected fields initialized.
- **`buildLobbyState`**: Correctly tallies game suggestions, ready counts, category votes, admin flag.

#### `server/broadcast.js`

- **`broadcastAll`**: Sends to all player + display sockets with readyState === 1.
- **`sendTo`**: Sends to single socket, handles null/closed gracefully.

### 3. Question Processing Unit Tests (Medium Priority)

#### `questions.js`

- **`processQuestions`** (extract and test directly): Decodes URL-encoded strings, shuffles answers, assigns correct `correctId`, calculates `timeLimit` based on difficulty and T/F vs multiple-choice.
- **`fetchQuestions`** (with mocked HTTP): Falls back to local DB first, respects rate limiting, handles API error codes (3, 4, 5), resets session token on code 3/4.

#### `local-db.js`

- **`getQuestionsFromLocalDB`**: Returns null when DB doesn't have enough questions, filters by category and difficulty, respects `seenQuestions`.
- **`markQuestionsUsed`**: Updates usage timestamps for LRU rotation.
- **`DIFFICULTY_CONFIG`**: Correct `timeMult` and `scoreMult` values for each difficulty.

### 4. Message Handler Integration Tests (Medium Priority)

#### `server/handlers.js`

- **`handleMessage`** routing: Each message type dispatches to the correct game method. Admin-only actions (START_MINI_GAME, RESTART, REMOVE_PLAYER, SKIP, SET_LANGUAGE) reject non-admins.
- **`handlePlayerDisconnect`**: Admin handoff to next player, stale WS ignored (player already reconnected with new WS), room cleanup after grace period.
- **`maybeCleanupRoom`**: Room deleted after 30s with 0 sockets and idle state, cleanup cancelled when socket connects.
- **Player minimum enforcement**: Shithead requires 2+, CAH requires 3+, Spy requires 3+.

### 5. Spy Game Unit Tests (Medium Priority)

#### `games/spy/server/game.js`

- **Phase transitions**: SETUP → CLUES → GUESS → REVEAL → SCORE → next round.
- **Role assignment**: Exactly one spy per round, spy gets different word.
- **Clue/guess submission**: One clue per non-spy player, spy guess evaluated correctly.
- **Scoring**: Points awarded correctly based on guess accuracy.

### 6. Client-Side Utility Tests (Low Priority)

#### `public/shared/utils.js`

- **`nameToAvatar`**: Should match server-side implementation in `rooms.js`.
- **`esc`**: HTML entity escaping (XSS prevention).
- **`fmtScore`**: Number formatting with separators.
- **`ordinal`**: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th edge cases.
- **`buildWsUrl`**: Correct ws:// vs wss:// based on protocol, correct path construction.

### 7. E2E Test Improvements (Low Priority)

- **Rename existing tests** to `*.test.mjs` so `node --test` discovers them.
- **Add Shithead E2E test**: Full card game flow with 2+ players.
- **Add CAH E2E test**: Full round with czar picking winner.
- **Automate Spy game test**: Convert `spy-manual-test.md` to Puppeteer test.
- **Add CI integration**: Run tests in GitHub Actions before deploy.

---

## Suggested Implementation Order

1. **Start with `game.js` scoring + powerup tests** — highest complexity, most users, pure logic.
2. **Add `shithead.js` card rule tests** — `_canPlay`, `_effectiveTopRank`, `_isFourOfAKind` are small pure functions.
3. **Add `server/rooms.js` tests** — small file, easy wins, `buildLobbyState` logic is important.
4. **Add `cah.js` round lifecycle tests** — czar rotation, submission validation, point awarding.
5. **Add `questions.js` `processQuestions` tests** — answer shuffling, time limit calculation.
6. **Rename E2E tests and add to CI** — quick infrastructure win.

## Quick Wins

These require minimal setup and test pure functions with no dependencies:

| Function | File | Why |
|----------|------|-----|
| `_canPlay(rank)` | `shithead.js` | Core game rule, 5 lines, easy to extract |
| `_effectiveTopRank()` | `shithead.js` | Transparent-3 logic, subtle bug potential |
| `_isFourOfAKind()` | `shithead.js` | Pile burn detection |
| `nameToAvatar(name)` | `server/rooms.js` | Pure hash function, 3 lines |
| `generateRoomCode()` | `server/rooms.js` | Character set validation |
| `buildLobbyState(room)` | `server/rooms.js` | Tally logic with Maps |
| `processQuestions(results)` | `questions.js` | URL decoding + answer shuffling |
| Scoring formula | `game.js` | Math in `receiveAnswer` |
| `usePowerup` validation | `game.js` | Multiple rejection branches |
