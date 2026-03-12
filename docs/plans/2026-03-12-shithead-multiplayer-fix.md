# Shithead Multiplayer Game - Playwright Investigation & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Investigate and fix the Shithead card game to ensure proper functionality with multiple players (2-5), correct state synchronization across all clients, and complete game lifecycle from setup through game over.

**Architecture:** This plan uses Playwright E2E tests to verify:
1. All game phases (SETUP → SWAP → REVEAL → PLAY → GAME_OVER)
2. Multi-player state synchronization (2, 3, 4, 5 players)
3. Card swapping mechanics and validation
4. Card playing mechanics and pile management
5. Turn order and player advancement
6. Timer/timeout handling
7. Bot player integration

**Tech Stack:**
- Playwright 1.58.2 (E2E testing)
- Node.js test runner (unit tests)
- ShiteadController (server game logic)
- Room helpers (`tests/playwright/helpers/room.js`)

---

## Phase 1: Fix Existing Playwright Test Syntax

### Task 1.1: Fix invalid selector syntax in current test

**Files:**
- Modify: `tests/playwright/shithead.spec.js:1-78`
- Reference: `tests/playwright/helpers/room.js` (test utilities)

**Step 1: Read current test to understand issues**

Run: `head -78 tests/playwright/shithead.spec.js`

Expected output: Show lines 1-78 with current test structure. Look for:
- Line 53: `.locator('#confirm-swap-btn', '#confirm-btn')` — Invalid Playwright syntax
- Line 61: Same invalid selector issue
- Missing proper element queries

**Step 2: Fix selector syntax - use proper Playwright element locators**

Current problematic code (line 53, 61):
```javascript
const confirmBtn = p1.locator('#confirm-swap-btn', '#confirm-btn');
```

Should be (use single selector with fallback logic):
```javascript
const confirmBtn = p1.locator('#confirm-swap-btn');
```

Replace the following lines in `tests/playwright/shithead.spec.js`:
- Line 53: Replace `.locator('#confirm-swap-btn', '#confirm-btn')` with `.locator('#confirm-swap-btn')`
- Line 61: Replace `.locator('#confirm-swap-btn', '#confirm-btn')` with `.locator('#confirm-swap-btn')`

**Step 3: Run test to see actual failures**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js -v`

Expected: Test runs and either passes or fails with clear Playwright errors (not syntax errors).

**Step 4: Commit syntax fix**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "fix: correct Playwright selector syntax in shithead test"
```

---

## Phase 2: Add Debug Helpers for Multi-Player Testing

### Task 2.1: Create test helper for card state verification

**Files:**
- Create: `tests/playwright/helpers/shithead.js` (new file)

**Step 1: Write helper functions for Shithead-specific assertions**

```javascript
// tests/playwright/helpers/shithead.js

const { expect } = require('@playwright/test');

/**
 * Get the current game state from the page.
 * Reads JSON from window.gameState variable.
 */
async function getGameState(page) {
  return await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    return window.gameState || {};
  });
}

/**
 * Get current player's hand cards.
 * Returns array of card elements.
 */
async function getHandCards(page) {
  const locator = page.locator('.hand .card');
  const count = await locator.count();
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({
      element: locator.nth(i),
      text: await locator.nth(i).textContent(),
      ariaLabel: await locator.nth(i).getAttribute('aria-label')
    });
  }
  return cards;
}

/**
 * Get current player's face-up cards.
 * Returns array of card elements.
 */
async function getFaceUpCards(page) {
  const locator = page.locator('.faceup .card');
  const count = await locator.count();
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({
      element: locator.nth(i),
      text: await locator.nth(i).textContent(),
      ariaLabel: await locator.nth(i).getAttribute('aria-label')
    });
  }
  return cards;
}

/**
 * Wait for all players to reach a specific phase.
 * Checks all player pages until they show the target phase screen.
 */
async function waitForAllPlayersInPhase(playerPages, phaseScreenId, timeout = 20_000) {
  const promises = playerPages.map(page =>
    page.locator(`#${phaseScreenId}.active`).waitFor({ state: 'visible', timeout })
  );
  await Promise.all(promises);
}

/**
 * Verify that all players have the expected number of cards.
 * Reads from game state.
 */
async function assertPlayerCardCounts(page, expectedHand, expectedFaceUp, expectedFaceDown) {
  const state = await getGameState(page);
  const playerState = state.players?.[0] || {};

  if (expectedHand !== undefined) {
    expect(playerState.handCount || 0).toBe(expectedHand);
  }
  if (expectedFaceUp !== undefined) {
    expect(playerState.faceUpCount || 0).toBe(expectedFaceUp);
  }
  if (expectedFaceDown !== undefined) {
    expect(playerState.faceDownCount || 0).toBe(expectedFaceDown);
  }
}

/**
 * Click a card in hand and then a card in face-up area.
 * Simulates a swap action.
 */
async function performCardSwap(page, handCardIndex = 0, faceUpCardIndex = 0) {
  const handCards = page.locator('.hand .card');
  const faceUpCards = page.locator('.faceup .card');

  await handCards.nth(handCardIndex).click();
  await page.waitForTimeout(300);
  await faceUpCards.nth(faceUpCardIndex).click();
  await page.waitForTimeout(500);
}

/**
 * Click the confirm/submit button for swap phase.
 */
async function confirmSwap(page) {
  const confirmBtn = page.locator('#confirm-swap-btn');
  const isVisible = await confirmBtn.isVisible().catch(() => false);

  if (isVisible) {
    await confirmBtn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Click a card in hand during PLAY phase.
 */
async function playCard(page, handCardIndex = 0) {
  const handCards = page.locator('.hand .card');
  if (await handCards.count() > handCardIndex) {
    await handCards.nth(handCardIndex).click();
    await page.waitForTimeout(500);
  }
}

module.exports = {
  getGameState,
  getHandCards,
  getFaceUpCards,
  waitForAllPlayersInPhase,
  assertPlayerCardCounts,
  performCardSwap,
  confirmSwap,
  playCard
};
```

**Step 2: Verify the helper file exists and exports are correct**

Run: `node -e "const h = require('./tests/playwright/helpers/shithead.js'); console.log(Object.keys(h))"`

Expected: Output shows all exported functions: `[ 'getGameState', 'getHandCards', ... ]`

**Step 3: Commit helper file**

```bash
git add tests/playwright/helpers/shithead.js
git commit -m "test: add Playwright helper functions for Shithead game testing"
```

---

## Phase 3: Fix and Expand Shithead Playwright Test Suite

### Task 3.1: Rewrite existing test with proper assertions and multi-player coverage

**Files:**
- Modify: `tests/playwright/shithead.spec.js:1-78` (replace entire test)
- Reference: `tests/playwright/helpers/room.js`, `tests/playwright/helpers/shithead.js`

**Step 1: Replace the existing test with improved version**

```javascript
// tests/playwright/shithead.spec.js
const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen } = require('./helpers/room');
const {
  waitForAllPlayersInPhase,
  performCardSwap,
  confirmSwap,
  getGameState,
  playCard
} = require('./helpers/shithead');

test.describe('Shithead Card Game - Multi-Player', () => {

  test('two players: setup → swap → reveal → play → game over', async ({ request, browser }) => {
    // Create room and join 2 players
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Join as Alice and Bob
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');

    // Start shithead game (as admin, usually first player)
    await startMiniGame(p1, 'shithead');

    // Phase 1: SETUP - navigate to game
    await p1.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });

    // Phase 2: SWAP - wait for swap screen and perform swaps
    await waitForAllPlayersInPhase([p1, p2], 'swap', 15_000);

    // Perform card swaps for both players
    await performCardSwap(p1, 0, 0);  // Alice swaps first hand card with first face-up
    await confirmSwap(p1);

    await performCardSwap(p2, 0, 0);  // Bob swaps first hand card with first face-up
    await confirmSwap(p2);

    // Phase 3: REVEAL - wait for reveal screen (shows face-up cards)
    await waitForAllPlayersInPhase([p1, p2], 'reveal', 10_000);

    // Phase 4: PLAY - wait for play screen
    await waitForAllPlayersInPhase([p1, p2], 'playing', 10_000);

    // Verify players can see the game in PLAY phase
    const state1 = await getGameState(p1);
    const state2 = await getGameState(p2);

    expect(state1.phase).toBe('PLAY');
    expect(state2.phase).toBe('PLAY');
    expect(state1.players?.length).toBe(2);
    expect(state2.players?.length).toBe(2);

    // Phase 5: GAME_OVER - play a few turns and wait for game to end
    // Each player plays their valid card
    let turn = 0;
    const maxTurns = 50;  // Safety limit to prevent infinite loop

    while (turn < maxTurns) {
      const gameOverVisible1 = await p1.locator('#game-over.active').isVisible().catch(() => false);
      const gameOverVisible2 = await p2.locator('#game-over.active').isVisible().catch(() => false);

      if (gameOverVisible1 && gameOverVisible2) {
        break;
      }

      // One of the players should be able to play
      const state = await getGameState(p1);
      const currentPlayer = state.currentPlayerUsername;
      const targetPage = currentPlayer === 'Alice' ? p1 : p2;

      // Play a card if it's this player's turn
      await playCard(targetPage, 0);
      await targetPage.waitForTimeout(500);

      turn++;
    }

    // Verify game reached GAME_OVER phase
    const finalState1 = await getGameState(p1);
    const finalState2 = await getGameState(p2);

    expect(finalState1.phase).toBe('GAME_OVER');
    expect(finalState2.phase).toBe('GAME_OVER');

    await ctx1.close();
    await ctx2.close();
  });

});
```

**Step 2: Run the updated test**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js -v`

Expected: Test runs and either passes or shows specific failures (not syntax errors).

**Step 3: If test fails, document failures**

If test fails, note:
- Which phase fails (SETUP, SWAP, REVEAL, PLAY, GAME_OVER)?
- What error message appears?
- What is the timeout error about?

This information helps identify server-side issues.

**Step 4: Commit updated test**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: rewrite shithead test with proper multi-player flow and state verification"
```

---

### Task 3.2: Add three-player comprehensive test

**Files:**
- Modify: `tests/playwright/shithead.spec.js:X-Y` (add new test)

**Step 1: Add three-player test after the two-player test**

```javascript
  test('three players: verify turn order and state sync', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const p3 = await ctx3.newPage();

    // Join 3 players
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');
    await joinRoom(p3, code, 'Charlie');

    // Start game
    await startMiniGame(p1, 'shithead');

    // Navigate to game
    await p1.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p3.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });

    // SWAP phase
    await waitForAllPlayersInPhase([p1, p2, p3], 'swap', 15_000);

    await performCardSwap(p1, 0, 0);
    await confirmSwap(p1);

    await performCardSwap(p2, 0, 0);
    await confirmSwap(p2);

    await performCardSwap(p3, 0, 0);
    await confirmSwap(p3);

    // REVEAL phase
    await waitForAllPlayersInPhase([p1, p2, p3], 'reveal', 10_000);

    // PLAY phase
    await waitForAllPlayersInPhase([p1, p2, p3], 'playing', 10_000);

    // Verify all 3 players see same game state
    const state1 = await getGameState(p1);
    const state2 = await getGameState(p2);
    const state3 = await getGameState(p3);

    // All should see same phase
    expect(state1.phase).toBe('PLAY');
    expect(state2.phase).toBe('PLAY');
    expect(state3.phase).toBe('PLAY');

    // All should see 3 players in game
    expect(state1.players?.length).toBe(3);
    expect(state2.players?.length).toBe(3);
    expect(state3.players?.length).toBe(3);

    // Player order should be consistent across all clients
    expect(state1.players?.[0]?.username).toBe(state2.players?.[0]?.username);
    expect(state2.players?.[0]?.username).toBe(state3.players?.[0]?.username);

    // Current player should be the same across all clients
    expect(state1.currentPlayerUsername).toBe(state2.currentPlayerUsername);
    expect(state2.currentPlayerUsername).toBe(state3.currentPlayerUsername);

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });
```

**Step 2: Run the new three-player test**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js --grep "three players" -v`

Expected: Test runs and verifies state synchronization across 3 clients.

**Step 3: Commit three-player test**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: add three-player Shithead test with turn order verification"
```

---

### Task 3.3: Add five-player stress test

**Files:**
- Modify: `tests/playwright/shithead.spec.js:X-Y` (add new test)

**Step 1: Add five-player stress test**

```javascript
  test('five players: stress test with maximum players', async ({ request, browser }) => {
    const code = await createRoom(request);
    const contexts = [];
    const pages = [];

    // Create 5 player contexts
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      pages.push(await ctx.newPage());
    }

    // Join all 5 players
    await joinRoom(pages[0], code, 'Alice');
    await joinRoom(pages[1], code, 'Bob');
    await joinRoom(pages[2], code, 'Charlie');
    await joinRoom(pages[3], code, 'Diana');
    await joinRoom(pages[4], code, 'Eve');

    // Start game (admin)
    await startMiniGame(pages[0], 'shithead');

    // All navigate to game
    for (const page of pages) {
      await page.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    }

    // SWAP phase - all players swap
    await waitForAllPlayersInPhase(pages, 'swap', 15_000);

    for (const page of pages) {
      await performCardSwap(page, 0, 0);
      await confirmSwap(page);
    }

    // Verify REVEAL and PLAY phases
    await waitForAllPlayersInPhase(pages, 'reveal', 10_000);
    await waitForAllPlayersInPhase(pages, 'playing', 10_000);

    // Verify all players see same state
    const states = [];
    for (const page of pages) {
      states.push(await getGameState(page));
    }

    // All should be in PLAY phase
    for (const state of states) {
      expect(state.phase).toBe('PLAY');
      expect(state.players?.length).toBe(5);
    }

    // All should see same current player
    const firstCurrentPlayer = states[0].currentPlayerUsername;
    for (const state of states) {
      expect(state.currentPlayerUsername).toBe(firstCurrentPlayer);
    }

    // Cleanup
    for (const ctx of contexts) {
      await ctx.close();
    }
  });
```

**Step 2: Run the five-player test**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js --grep "five players" -v`

Expected: Test runs successfully with 5 concurrent players.

**Step 3: Commit five-player test**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: add five-player stress test for Shithead game"
```

---

## Phase 4: Test Specific Game Mechanics

### Task 4.1: Test card swap mechanics and validation

**Files:**
- Modify: `tests/playwright/shithead.spec.js:X-Y` (add new test)

**Step 1: Add test for card swap mechanics**

```javascript
  test('card swaps: verify swap mechanics during SWAP phase', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');
    await startMiniGame(p1, 'shithead');

    // Navigate to game
    await p1.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });

    // SWAP phase
    await waitForAllPlayersInPhase([p1, p2], 'swap', 15_000);

    // Get initial card counts
    const initialHand1 = await p1.locator('.hand .card').count();
    const initialFaceUp1 = await p1.locator('.faceup .card').count();

    expect(initialHand1).toBeGreaterThan(0);
    expect(initialFaceUp1).toBeGreaterThan(0);

    // Perform multiple swaps
    for (let i = 0; i < 2; i++) {
      await performCardSwap(p1, 0, 0);
      await p1.waitForTimeout(200);
    }

    // Card counts should remain the same after swap
    const finalHand1 = await p1.locator('.hand .card').count();
    const finalFaceUp1 = await p1.locator('.faceup .card').count();

    expect(finalHand1).toBe(initialHand1);
    expect(finalFaceUp1).toBe(initialFaceUp1);

    // Confirm swaps
    await confirmSwap(p1);
    await confirmSwap(p2);

    // Verify transition to REVEAL
    await waitForAllPlayersInPhase([p1, p2], 'reveal', 10_000);

    await ctx1.close();
    await ctx2.close();
  });
```

**Step 2: Run the swap mechanics test**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js --grep "card swaps" -v`

Expected: Test verifies that card counts remain constant during swaps.

**Step 3: Commit swap mechanics test**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: add card swap mechanics verification test"
```

---

### Task 4.2: Test card playing mechanics in PLAY phase

**Files:**
- Modify: `tests/playwright/shithead.spec.js:X-Y` (add new test)

**Step 1: Add test for playing mechanics**

```javascript
  test('card playing: verify valid plays during PLAY phase', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');
    await startMiniGame(p1, 'shithead');

    // Navigate and complete SWAP phase
    await p1.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });

    await waitForAllPlayersInPhase([p1, p2], 'swap', 15_000);
    await confirmSwap(p1);
    await confirmSwap(p2);

    await waitForAllPlayersInPhase([p1, p2], 'reveal', 10_000);
    await waitForAllPlayersInPhase([p1, p2], 'playing', 10_000);

    // Get game state to see current player
    let state = await getGameState(p1);
    const currentPlayer = state.currentPlayerUsername;
    const targetPage = currentPlayer === 'Alice' ? p1 : p2;

    // Get initial hand count
    const initialHandCount = await targetPage.locator('.hand .card').count();
    expect(initialHandCount).toBeGreaterThan(0);

    // Play a card
    await playCard(targetPage, 0);
    await targetPage.waitForTimeout(500);

    // Verify hand count decreased or stayed the same (depends on replenishment)
    const afterPlayHandCount = await targetPage.locator('.hand .card').count();
    expect(afterPlayHandCount).toBeLessThanOrEqual(initialHandCount);

    // Verify current player changed (turn advanced)
    state = await getGameState(p1);
    const newCurrentPlayer = state.currentPlayerUsername;
    expect(newCurrentPlayer).not.toBe(currentPlayer);

    await ctx1.close();
    await ctx2.close();
  });
```

**Step 2: Run the playing mechanics test**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js --grep "card playing" -v`

Expected: Test verifies that cards can be played and turns advance.

**Step 3: Commit playing mechanics test**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: add card playing mechanics verification test"
```

---

## Phase 5: Run Full Test Suite and Document Results

### Task 5.1: Run all Shithead tests together

**Files:**
- Reference: `tests/playwright/shithead.spec.js`

**Step 1: Run full Shithead test suite**

Run: `npm run test:e2e -- tests/playwright/shithead.spec.js -v`

Expected: All 6 tests pass:
1. two players: setup → swap → reveal → play → game over ✓
2. three players: verify turn order and state sync ✓
3. five players: stress test with maximum players ✓
4. card swaps: verify swap mechanics during SWAP phase ✓
5. card playing: verify valid plays during PLAY phase ✓
6. (original test, now fixed) ✓

**Step 2: Capture test results**

Document which tests pass and which fail. If any fail:
- Note the exact error message
- Check server logs: `docker logs small-hours -f` (if running in Docker)
- Or check terminal output from `npm start` (if running locally)

**Step 3: Commit passing test suite**

```bash
git add tests/playwright/shithead.spec.js
git commit -m "test: complete Shithead multi-player test suite with all phases covered"
```

---

## Phase 6: Integration Verification

### Task 6.1: Run full E2E test suite including other games

**Files:**
- Reference: `tests/playwright/` (all games)

**Step 1: Run all E2E tests to ensure no regressions**

Run: `npm run test:e2e`

Expected: All tests pass, including Quiz, Spy, Lyrics, CAH, Guess, and Shithead.

**Step 2: Check for any server crashes**

Run: `npm run test:e2e 2>&1 | grep -i "error\|crash\|fatal"`

Expected: No errors logged to console.

**Step 3: Verify unit tests still pass**

Run: `npm test`

Expected: All unit tests pass, including `test/ShiteadController.test.js`.

**Step 4: Final commit and summary**

```bash
git add .
git commit -m "test: complete Shithead multiplayer E2E test suite - all phases and player counts verified"
```

---

## Success Criteria

✅ All Playwright tests pass with 2, 3, and 5 players
✅ Game states synchronized across all clients during all phases
✅ Card swaps and plays work correctly
✅ Turn order advances properly
✅ GAME_OVER phase reached with multiple players
✅ No server crashes or WebSocket disconnections
✅ Unit tests for ShiteadController still pass

---

## Known Test Utilities

Use these helper functions from `tests/playwright/helpers/`:

**room.js:**
- `createRoom(request)` — Create a new game room
- `joinRoom(page, code, name)` — Join room as player
- `startMiniGame(page, gameType)` — Admin starts game
- `waitForScreen(page, screenId, timeout)` — Wait for UI screen

**shithead.js:** (created in Task 2.1)
- `getGameState(page)` — Read game state from page
- `getHandCards(page)` — Get hand card elements
- `getFaceUpCards(page)` — Get face-up card elements
- `waitForAllPlayersInPhase(pages, phase, timeout)` — Wait for all players to reach phase
- `performCardSwap(page, hand, faceUp)` — Perform card swap
- `confirmSwap(page)` — Click confirm swap button
- `playCard(page, cardIndex)` — Play a card

---

## Troubleshooting

If tests fail:

1. **"Timeout waiting for screen"** → Server not advancing phases. Check:
   - `server.js` - WebSocket connection working?
   - `ShiteadController.js` - `tick()` method advancing phases?
   - Game state being broadcast?

2. **"Selector not found"** → UI element IDs don't match. Check:
   - `public/games/shithead/index.html` - element IDs match selectors in test
   - Verify class names (`.hand`, `.faceup`, `.card`)

3. **"WebSocket disconnected"** → Connection issues. Check:
   - Server running: `npm start`
   - Test server URL correct
   - No CORS issues

4. **"All 52 cards not dealt"** → Deck initialization issue. Check:
   - `ShiteadController._dealCards()` - dealing logic
   - `server/deck.js` - `createDeck()` returning 52 cards

---

## Next Steps After Plan Execution

1. If tests fail → Fix identified issues in ShiteadController.js or UI
2. If tests pass → Merge to main and deploy
3. Monitor production for any multi-player issues
4. Consider adding bot player integration tests (if bots are used)
