# Shithead Game E2E Testing and Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create comprehensive Playwright E2E tests for the Shithead game, test thoroughly on quiz.aldervall.se, investigate issues, improve logging, and push improvements to git.

**Architecture:**
- Create Playwright test suite that simulates full game flow (2+ players, all phases)
- Test game state transitions (LOBBY → SETUP → SWAP → REVEAL → PLAY → GAME_OVER)
- Verify card swapping mechanics, play validation, and turn advancement
- Test both human players and bot players
- Add detailed logging for debugging on live server
- Fix any bugs discovered during testing
- Commit and push all improvements to auto-deploy on 10.10.0.21

**Tech Stack:**
- Playwright for E2E testing
- Node.js test runner
- quiz.aldervall.se live test environment
- git for version control

---

## Phase 1: Setup and Investigation

### Task 1.1: Read Shithead UI Implementation

**Files:**
- Reference: `public/games/shithead/index.html` (full 59KB UI file)
- Reference: `server/ShiteadController.js`
- Reference: `test/ShiteadController.test.js`

**Steps:**
1. Read the full shithead UI implementation to understand player interaction points
2. Identify key element selectors (buttons, card displays, phase indicators)
3. Document the state transitions visible in the UI
4. Note any potential issues or unclear behaviors

**Verification:**
- You understand the 5 game phases: LOBBY, SETUP, SWAP, REVEAL, PLAY, GAME_OVER
- You know which UI elements change in each phase
- You've identified how players interact with the game (selecting cards to swap, playing cards)

---

## Phase 2: Create E2E Test Suite

### Task 2.1: Create Playwright Config and Test Structure

**Files:**
- Create: `tests/shithead.e2e.mjs`
- Reference: `tests/fullgame.mjs` (existing E2E test example)

**Steps:**
1. Create new Playwright test file in ES modules format
2. Import Playwright from 'playwright'
3. Set up helper functions for:
   - `joinGame(page, username, roomCode)` - Navigate to game and join
   - `waitForPhase(page, phase)` - Wait for specific phase
   - `getGameState(page)` - Extract current game state from DOM
4. Define base test structure with beforeEach/afterEach
5. Add browser launch with headless=true by default

**Verification:**
- Run: `node tests/shithead.e2e.mjs` (should run tests without error)
- File imports Playwright successfully
- Helper functions are defined and ready to use

---

### Task 2.2: Test Basic Game Flow (2 Players)

**Files:**
- Modify: `tests/shithead.e2e.mjs`

**Steps:**
1. Create test: "Shithead - Full 2-player game flow"
2. Open two browser contexts (player 1 and player 2)
3. Both players navigate to quiz.aldervall.se/group/:code
4. Both players join the same room
5. Player 1 clicks "Start Shithead"
6. Verify game transitions to SETUP phase
7. Wait for SETUP → SWAP transition
8. Verify both players see swap UI
9. Wait for SWAP → REVEAL transition
10. Wait for REVEAL → PLAY transition
11. Verify players can see cards in PLAY phase
12. Advance through all remaining phases until GAME_OVER
13. Verify game state is final

**Verification:**
- Run: `node tests/shithead.e2e.mjs` (test completes without error)
- Console shows phase transitions
- Both players reach GAME_OVER

---

### Task 2.3: Test Card Swapping Mechanics

**Files:**
- Modify: `tests/shithead.e2e.mjs`

**Steps:**
1. Create test: "Shithead - Card swapping in SWAP phase"
2. Join 2 players, start game, reach SWAP phase
3. Player 1 clicks to select a hand card
4. Player 1 clicks to select a face-up card to swap with
5. Verify swap happens (cards exchange positions in UI)
6. Verify other player also sees updated cards
7. Repeat for Player 2

**Verification:**
- Run: `node tests/shithead.e2e.mjs` (swap test passes)
- Cards visibly change in the UI
- Both players see the same card states

---

### Task 2.4: Test Play Phase Card Validation

**Files:**
- Modify: `tests/shithead.e2e.mjs`

**Steps:**
1. Create test: "Shithead - Card validation in PLAY phase"
2. Join 2 players, start game, reach PLAY phase
3. Player 1 (current player) plays a card
4. Verify card is removed from their hand
5. Verify card appears in discard pile
6. Verify turn advances to Player 2
7. Player 2 plays a card of equal or higher rank
8. Verify turn advances back to Player 1
9. Test playing a "2" (wild card) - should always be valid
10. Test invalid play attempt (lower rank than top card) - should be rejected

**Verification:**
- Run: `node tests/shithead.e2e.mjs` (play validation tests pass)
- Valid cards are played successfully
- Invalid plays are rejected (no state change)
- Turn advancement works correctly

---

### Task 2.5: Test Game Completion and Scoring

**Files:**
- Modify: `tests/shithead.e2e.mjs`

**Steps:**
1. Create test: "Shithead - Game completion and scoring"
2. Run a full game to completion
3. Verify all players eventually reach empty hand state
4. Verify GAME_OVER phase is reached
5. Extract final scores/leaderboard from game state
6. Verify game records winner and loser
7. Verify "Play Again" button appears in GAME_OVER

**Verification:**
- Run: `node tests/shithead.e2e.mjs` (completion test passes)
- Game reaches GAME_OVER consistently
- Final state includes all players and their finishing order

---

## Phase 3: Test on Live Server

### Task 3.1: Deploy Current Code to Live Server

**Files:**
- Reference: `.github/workflows/deploy.yml`
- Reference: `CLAUDE.md` deployment section

**Steps:**
1. Ensure all code is committed locally
2. Push main branch: `git push origin main`
3. GitHub Actions automatically triggers deployment
4. Wait for deployment to complete (~2-3 minutes)
5. Verify server is healthy: `curl http://10.10.0.21:3001/health`
6. Expected: `{"ok":true,"uptime":...,"rooms":0}`

**Verification:**
- GitHub Actions workflow completes successfully
- All 5 deployment steps show green ✓
- Health check returns ok:true

---

### Task 3.2: Run E2E Tests Against Live Server

**Files:**
- Modify: `tests/shithead.e2e.mjs`

**Steps:**
1. Update test baseURL to use live server: `https://quiz.aldervall.se`
2. Add environment variable: `PLAYWRIGHT_TEST_BASE_URL=https://quiz.aldervall.se`
3. Run tests: `node tests/shithead.e2e.mjs` with baseURL set to live server
4. Test will create real game rooms on live server
5. Verify all tests pass with real network latency
6. Take screenshots of any failures for debugging

**Verification:**
- Run: `PLAYWRIGHT_TEST_BASE_URL=https://quiz.aldervall.se node tests/shithead.e2e.mjs`
- All tests pass or produce clear error messages
- Screenshots captured for any failures

---

### Task 3.3: Monitor Server Logs During Testing

**Files:**
- Reference: `CLAUDE.md` deployment monitoring section

**Steps:**
1. Open terminal: `ssh root@10.10.0.21 "docker logs small-hours -f"`
2. In another terminal, run live server tests
3. Monitor logs for:
   - `[Shithead]` log messages from ShiteadController
   - Any ERROR messages
   - Phase transition logs
   - Player action handling
4. Capture any anomalies or unexpected behavior
5. Note exact error messages if tests fail

**Verification:**
- Logs show `[Shithead]` messages during game
- No ERROR messages during normal gameplay
- Logs match expected phase transitions from tests

---

## Phase 4: Identify and Fix Issues

### Task 4.1: Analyze Test Results and Logs

**Files:**
- Reference: Test output from Phase 3.2
- Reference: Server logs from Phase 3.3

**Steps:**
1. Review all test results from live server testing
2. Identify any failing tests or unexpected behaviors
3. Check server logs for errors or warnings
4. Document each issue with:
   - Description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant log excerpts
5. Prioritize issues by severity (game-breaking vs cosmetic)

**Verification:**
- Create a list of 0-5 issues found
- Each issue has clear description and reproduction steps
- Issues are prioritized

---

### Task 4.2: Fix Critical Issues (If Any)

**Files:**
- Modify: `server/ShiteadController.js` (if needed)
- Modify: `public/games/shithead/index.html` (if needed)
- Modify: `server/handlers.js` (if needed)

**Steps:**
1. For each critical issue identified:
   - Read the relevant code
   - Understand the root cause
   - Implement minimal fix
   - Re-run specific E2E test to verify fix
   - Add unit test if needed to prevent regression
2. After each fix:
   - Run full test suite: `npm test`
   - Run E2E tests again
   - Commit with clear message

**Verification:**
- Each fix resolves the identified issue
- No new issues introduced by the fix
- All tests pass after fix

---

## Phase 5: Improve Logging and Error Handling

### Task 5.1: Add Detailed Logging to ShiteadController

**Files:**
- Modify: `server/ShiteadController.js:100-180` (tick and handlePlayerAction methods)

**Steps:**
1. Review current logging (note extensive logs already present)
2. Enhance logging for:
   - Player action validation failures
   - Card swaps that fail
   - Invalid plays with reason (rank check, etc.)
   - Turn advancement issues
3. Add structured logging format: `[Shithead][PHASE][ACTION]: details`
4. Include relevant state data in logs
5. Log only errors/warnings to avoid log spam

**Verification:**
- Run local tests: `npm test` (should pass)
- Run E2E tests against local server
- Verify new log messages appear when expected

---

### Task 5.2: Improve Error Handling and State Validation

**Files:**
- Modify: `server/ShiteadController.js:162-180` (handlePlayerAction)
- Modify: `public/games/shithead/index.html:` (error display)

**Steps:**
1. Add validation before each critical action:
   - Verify player exists
   - Verify game phase is correct
   - Verify action data is valid
2. Return descriptive error messages for invalid actions
3. Update UI to display errors to player
4. Add timeout handling for player turns
5. Prevent duplicate actions (stale socket check: `room.players.get(username).ws === ws`)

**Verification:**
- Run: `npm test` (all tests pass)
- E2E tests verify error scenarios work correctly
- Error messages are clear and helpful

---

## Phase 6: Commit and Deploy

### Task 6.1: Create Test Commit

**Files:**
- Create: `tests/shithead.e2e.mjs`

**Steps:**
1. Run all tests locally: `npm test && npm run test:e2e`
2. Verify all pass
3. Stage tests: `git add tests/shithead.e2e.mjs`
4. Commit with message:
   ```
   test: add comprehensive Playwright E2E tests for Shithead game

   - Test full 2-player game flow through all phases
   - Test card swapping mechanics in SWAP phase
   - Test card validation in PLAY phase
   - Test game completion and scoring
   - Verify phase transitions and state consistency

   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
   ```
5. Verify commit: `git log -1 --stat`

**Verification:**
- Commit appears in git log
- Commit message is clear and follows conventions
- All test files included

---

### Task 6.2: Create Bug Fixes Commit (If Needed)

**Files:**
- Modify: `server/ShiteadController.js` (if fixes needed)
- Modify: `public/games/shithead/index.html` (if fixes needed)

**Steps:**
1. If bugs were found and fixed in Phase 4:
   - Review all changes: `git diff`
   - Stage fixes: `git add server/ShiteadController.js public/games/shithead/index.html`
   - Commit with detailed message:
     ```
     fix: improve Shithead game stability and error handling

     - Fix [specific issue]: [description]
     - Fix [specific issue]: [description]
     - Add validation for [action]
     - Improve error messages for [scenario]

     Fixes issues discovered in E2E testing on quiz.aldervall.se

     Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
     ```
2. If no bugs found, skip this task

**Verification:**
- Commits appear in git log (if applicable)
- All fixes are included
- No debug code left in

---

### Task 6.3: Create Logging Improvements Commit

**Files:**
- Modify: `server/ShiteadController.js`

**Steps:**
1. Review all logging changes made in Phase 5
2. Verify logs are helpful without being verbose
3. Stage changes: `git add server/ShiteadController.js`
4. Commit with message:
   ```
   refactor: improve Shithead logging for debugging and monitoring

   - Add detailed logging for player actions
   - Log validation failures with context
   - Improve error messages for troubleshooting
   - Maintain structured log format for consistency

   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
   ```

**Verification:**
- Commit includes only logging changes
- Message is clear about improvements
- No other code changes mixed in

---

### Task 6.4: Push to Remote and Verify Deployment

**Files:**
- Reference: `.github/workflows/deploy.yml`

**Steps:**
1. Push all commits: `git push origin main`
2. GitHub Actions automatically triggers
3. Monitor workflow in GitHub Actions UI
4. Wait for all 5 steps to complete (≈2-3 minutes)
5. Verify deployment: `curl http://10.10.0.21:3001/health`
6. Check server is running tests: `ssh root@10.10.0.21 "docker logs small-hours -f" | grep Shithead`
7. Run final E2E tests against live server to confirm all changes deployed

**Verification:**
- GitHub Actions workflow completes with all green ✓
- Health check passes
- Logs show new code running on server
- E2E tests pass against live server with new code

---

## Summary

This plan ensures:
1. ✅ Comprehensive E2E test coverage of Shithead game
2. ✅ Testing on live production server (quiz.aldervall.se)
3. ✅ Full game flow validation (all phases)
4. ✅ Detailed logging for debugging
5. ✅ Bug fixes if issues found
6. ✅ Clean git commits with proper messages
7. ✅ Automatic deployment to 10.10.0.21

All work is tracked in git and automatically deployed via GitHub Actions.
