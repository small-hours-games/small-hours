const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen } = require('./helpers/room');

test.describe('Number Guess Game', () => {

  test('guess: full round gameplay', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();

    // Setup: 1 player (guess supports solo)
    await joinRoom(p1, code, 'Alice');

    // Start guess game
    await startMiniGame(p1, 'guess');

    // Wait for guess page to load
    await p1.waitForURL(/\/group\/[A-Z]{4}\/guess/, { timeout: 15_000 });

    // Wait for game to start with countdown
    const countdownVisible = await p1.locator('#countdownDisplay', '[id*="countdown"]')
      .isVisible()
      .catch(() => false);

    if (countdownVisible) {
      // Wait for countdown to finish
      await p1.waitForTimeout(4_000);
    }

    // Game should now be active
    const guessInput = p1.locator('#guessInput', 'input[type="number"]');
    await guessInput.waitFor({ state: 'visible', timeout: 10_000 });

    // Get the range hints
    const minRange = await p1.locator('#minRange', '#min-range').textContent().catch(() => '1');
    const maxRange = await p1.locator('#maxRange', '#max-range').textContent().catch(() => '100');

    console.log(`Range: ${minRange} - ${maxRange}`);

    // Submit a guess
    const mid = Math.floor((parseInt(minRange) + parseInt(maxRange)) / 2);
    await guessInput.fill(mid.toString());

    const guessBtn = p1.locator('#guessButton', 'button[type="submit"]');
    await guessBtn.click();

    // Wait for feedback
    await p1.waitForTimeout(1_000);

    // Check for feedback element
    const feedback = p1.locator('#feedbackDisplay', '[class*="feedback"]');
    const isFeedbackVisible = await feedback.isVisible().catch(() => false);

    if (isFeedbackVisible) {
      const feedbackText = await feedback.textContent();
      console.log(`Feedback: ${feedbackText}`);
    } else {
      console.log('Warning: Feedback display not found');
    }

    // Wait for next question or game over
    await p1.waitForTimeout(3_000);

    // Verify game is still active or transitioned to game over
    const gameDisplay = p1.locator('#gameDisplay', '[id*="game"]');
    const gameOverDisplay = p1.locator('#gameOverDisplay', '[id*="gameover"]', '[id*="game-over"]');

    const isGameActive = await gameDisplay.isVisible().catch(() => false);
    const isGameOver = await gameOverDisplay.isVisible().catch(() => false);

    expect(isGameActive || isGameOver).toBe(true);

    await ctx1.close();
  });

});
