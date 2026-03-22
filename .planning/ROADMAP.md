# Roadmap: v2.1 Quiz Question Pipeline

**Milestone:** v2.1 — Quiz Question Pipeline
**Created:** 2026-03-22
**Granularity:** Fine
**Requirements covered:** 10/10

## Phases

- [ ] **Phase 1: Question Fetcher** - Fetch and decode questions from OpenTrivia DB with graceful error handling
- [ ] **Phase 2: Question Cache** - Persist questions to disk by category and avoid repeated questions within a session
- [ ] **Phase 3: Category Voting** - Players vote on quiz category in lobby, admin starts quiz with winning category and real questions

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
- [ ] 01-01-PLAN.md — Standalone OpenTrivia DB fetcher module with HTML decoding, error handling, and tests
- [ ] 01-02-PLAN.md — Wire fetcher into session/transport layers (GAME_REGISTRY, async startGame, integration tests)

### Phase 2: Question Cache

**Goal**: Fetched questions are saved to disk and reused on subsequent games, with used questions tracked to avoid repeats
**Depends on**: Phase 1 (Question Fetcher must exist before cache can wrap it)
**Requirements**: QCACHE-01, QCACHE-02, QCACHE-03
**Success Criteria** (what must be TRUE):
  1. After the first quiz game in a category, JSON files appear on disk organized by category (e.g. `cache/questions/9.json`)
  2. Starting a second quiz game in the same category does not trigger an API request — questions come from disk
  3. Questions used in a session are marked so the same question does not appear twice in the same session
  4. When the cache is cold (first run or cache deleted), the system fetches from API and populates the cache transparently
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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Question Fetcher | 0/2 | Planning complete | - |
| 2. Question Cache | 0/? | Not started | - |
| 3. Category Voting | 0/? | Not started | - |
