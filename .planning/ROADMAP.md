# Roadmap: v2.1 Quiz Question Pipeline

**Milestone:** v2.1 — Quiz Question Pipeline
**Created:** 2026-03-22
**Granularity:** Fine
**Requirements covered:** 10/10 (Phase 4 is quality, not feature requirements)

## Phases

- [ ] **Phase 1: Question Fetcher** - Fetch and decode questions from OpenTrivia DB with graceful error handling
- [ ] **Phase 2: Question Cache** - Persist questions to disk by category and avoid repeated questions within a session
- [ ] **Phase 2.1: Quiz Timer Scheduling** - Wire up timerExpired action dispatch so quiz/spy phase transitions actually fire
- [ ] **Phase 3: Category Voting** - Players vote on quiz category in lobby, admin starts quiz with winning category and real questions
- [ ] **Phase 4: Test Coverage** - Comprehensive test coverage for untested core modules: engine, game definitions, session layer, and transport layer
- [ ] **Phase Gin Rummy** - Implement Gin Rummy as a new 2-player card game in the engine

## Phase Details

### Phase 1: Question Fetcher

**Goal**: A standalone fetcher module delivers decoded quiz questions from OpenTrivia DB or reports failure cleanly
**Depends on**: Nothing (uses existing codebase infrastructure)
**Requirements**: QSRC-01, QSRC-02, QSRC-03
**Success Criteria** (what must be TRUE):
  1. Calling `fetchQuestions(categoryId, amount)` returns an array of question objects with decoded text (no HTML entities like `&amp;` or `&#039;`)
  2. Questions have the correct shape expected by the quiz engine: question text, correct answer, wrong answers
  3. When OpenTrivia DB is unreachable or returns an error code, the fetcher returns a structured error (not a crash or unhandled rejection)
  4. The quiz game can be started with fetched questions via the existing `room.startGame()` path
**Plans:** 2 plans
Plans:
- [x] 01-01-PLAN.md — Standalone OpenTrivia DB fetcher module with HTML decoding, error handling, and tests
- [x] 01-02-PLAN.md — Wire fetcher into session/transport layers (GAME_REGISTRY, async startGame, integration tests)

### Phase 2: Question Cache

**Goal**: Fetched questions are saved to disk and reused on subsequent games, with used questions tracked to avoid repeats
**Depends on**: Phase 1 (Question Fetcher must exist before cache can wrap it)
**Requirements**: QCACHE-01, QCACHE-02, QCACHE-03
**Success Criteria** (what must be TRUE):
  1. After the first quiz game in a category, JSON files appear on disk organized by category (e.g. `data/questions/9.json`)
  2. Starting a second quiz game in the same category does not trigger an API request — questions come from disk
  3. Questions used in a session are marked so the same question does not appear twice in the same session
  4. When the cache is cold (first run or cache deleted), the system fetches from API and populates the cache transparently
**Plans:** 1/2 plans executed
Plans:
- [x] 02-01-PLAN.md — Cache-through wrapper (cached-fetcher.js) with disk persistence, content-hash IDs, and unit tests
- [x] 02-02-PLAN.md — Wire cached-fetcher into Room, add per-room used-question dedup, update integration tests

### Phase 2.1: Quiz Timer Scheduling

**Goal**: The session/transport layer schedules `timerExpired` synthetic actions so quiz and spy games transition through phases automatically
**Depends on**: Phase 1, Phase 2 (quiz must be startable with real questions)
**Requirements**: TIMER-01, TIMER-02, TIMER-03, TIMER-04
**Type**: Bug fix — games start but freeze in initial phase because timers were never wired up
**Success Criteria** (what must be TRUE):
  1. Starting a quiz game transitions from `countdown` → `question` after 3 seconds without any player action
  2. The full phase cycle (`countdown` → `question` → `reveal` → `between` → `question` → ... → `finished`) runs automatically on timers
  3. Returning to lobby or ending the game cancels any pending timers (no stale fires)
  4. The spy game's timer phases also fire correctly
**Plans**: TBD

### Phase 3: Category Voting

**Goal**: Players see available categories, vote before the quiz starts, and the quiz launches with real questions for the winning category
**Depends on**: Phase 1 (needs category list from API), Phase 2 (questions come from cache/fetcher pipeline)
**Requirements**: CVOTE-01, CVOTE-02, CVOTE-03, CVOTE-04
**Success Criteria** (what must be TRUE):
  1. After a host initiates category voting, all connected players see a list of available OpenTrivia DB categories on their phone controller
  2. A player can tap a category to cast their vote, and their vote is reflected on the host display in real time
  3. When the admin starts the quiz, it launches with questions from the category that received the most votes (admin breaks ties)
  4. All players and the host display see the final vote tally before questions begin
**Plans**: TBD

### Phase 4: Test Coverage

**Goal**: Achieve comprehensive test coverage across all untested core modules — engine core, game definitions, session management, and transport layer
**Depends on**: Nothing (tests existing code, can run in parallel with Phase 3)
**Requirements**: None (quality/reliability improvement, not feature work)
**Success Criteria** (what must be TRUE):
  1. `engine.js` has unit tests for all 4 core functions (createGame, processAction, getView, checkEnd) including error paths
  2. `number-guess.js` has tests covering setup, guess validation (too high/too low/correct), view filtering, and endIf scoring
  3. `spy.js` has tests covering setup (spy assignment), clue submission, guess scoring, timer phase transitions, and per-player view filtering
  4. `quiz.js` has action tests for answer submission (with powerups), all 4 timerExpired phase transitions, scoring mechanics, and view filtering
  5. `room.js` has tests for player lifecycle (add/remove), admin promotion, ready state, game suggestions, and game registry
  6. `manager.js` has tests for room creation (code uniqueness), lookup, cleanup of stale rooms, and player-to-room mapping
  7. `ws-adapter.js` has tests for message dispatch, rate limiting, and reconnection grace period
**Plans**: TBD

### Phase Gin Rummy

**Goal**: A fully playable 2-player Gin Rummy card game registered in the engine, with multi-hand scoring to 100 points, auto-computed melds and layoffs, and proper view filtering for phone and TV display
**Depends on**: Nothing (standalone game, uses existing engine infrastructure)
**Requirements**: None (standalone game implementation, no mapped requirement IDs)
**Success Criteria** (what must be TRUE):
  1. Starting a gin-rummy game with 2 players deals 10 cards each, sets up stock and discard piles correctly
  2. Players can draw from stock or discard, discard cards, and knock when deadwood is 10 or fewer
  3. Engine auto-computes optimal melds on knock and auto-applies layoffs for opponent
  4. Scoring correctly handles knock, undercut (+10 bonus), gin (+20 bonus), and big gin (+31 bonus)
  5. Multi-hand loop continues until a player reaches 100 cumulative points (configurable)
  6. Phone view shows own cards but only opponent card count; TV scoreboard during play, full reveal during scoring
  7. Game is registered in GAME_REGISTRY and playable via room.startGame('gin-rummy')
**Plans:** 3 plans
Plans:
- [x] gin-rummy-01-PLAN.md — Core utility functions TDD (cardValue, meld detection, optimal meld finder, layoffs, scoring)
- [ ] gin-rummy-02-PLAN.md — Game definition TDD (setup, actions, view, endIf, state machine, multi-hand loop)
- [ ] gin-rummy-03-PLAN.md — Registration in GAME_REGISTRY and integration tests via game harness

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Question Fetcher | 2/2 | Complete | 2026-03-22 |
| 2. Question Cache | 2/2 | Complete | 2026-03-22 |
| 2.1 Quiz Timer Scheduling | 0/? | Not started | - |
| 3. Category Voting | 0/? | Not started | - |
| 4. Test Coverage | 0/? | Not started | - |
| Gin Rummy | 0/3 | Not started | - |
