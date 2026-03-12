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
