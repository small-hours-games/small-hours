const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen } = require('./helpers/room');

test.describe('Shithead Card Game', () => {

  test('shithead: setup and swap phase', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Setup: 2 players
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');

    // Start shithead game
    await startMiniGame(p1, 'shithead');

    // Wait for players to navigate to shithead page
    await p1.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/shithead/, { timeout: 15_000 });

    // Wait for swap screen
    await waitForScreen(p1, 'swap', 15_000);
    await waitForScreen(p2, 'swap', 15_000);

    // Verify swap screen elements
    await expect(p1.locator('.card')).not.toHaveCount(0);

    // Try to swap a card (hand card with face-up card)
    const handCards = p1.locator('.hand .card');
    const faceUpCards = p1.locator('.faceup .card');

    const handCount = await handCards.count();
    const faceUpCount = await faceUpCards.count();

    expect(handCount).toBeGreaterThan(0);
    expect(faceUpCount).toBeGreaterThan(0);

    // Perform a swap
    if (handCount > 0 && faceUpCount > 0) {
      const handCard = handCards.first();
      const faceUpCard = faceUpCards.first();

      await handCard.click();
      await p1.waitForTimeout(300);
      await faceUpCard.click();
      await p1.waitForTimeout(500);
    }

    // Confirm swap
    const confirmBtn = p1.locator('#confirm-swap-btn', '#confirm-btn');
    const isVisible = await confirmBtn.isVisible().catch(() => false);

    if (isVisible) {
      await confirmBtn.click();
    }

    // Both players should confirm
    await p2.locator('#confirm-swap-btn', '#confirm-btn')
      .click()
      .catch(() => {});

    // Wait a bit for game to transition
    await p1.waitForTimeout(2_000);

    // After swap phase, game phase should begin
    // Should not still be on swap screen
    const stillOnSwap = await p1.locator('#swap.active').isVisible().catch(() => false);
    expect(stillOnSwap).toBe(false);

    await ctx1.close();
    await ctx2.close();
  });

});
