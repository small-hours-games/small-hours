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

});
