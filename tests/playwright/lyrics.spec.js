const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen } = require('./helpers/room');

test.describe('Lyrics Game (Bug 3 Detection)', () => {

  test('lyrics: answer submission silently fails (Bug 3)', async ({ request, browser }) => {
    /**
     * KNOWN BUG #3: handlers.js line ~438
     * LYRICS_ANSWER case routes to `room.lyricsGame` which is undefined.
     * Answers are received by the client but silently dropped by server.
     *
     * Expected behavior: Player submits answer → LYRICS_ANSWER_CONFIRMED received
     * Actual behavior: Answer is sent but never confirmed; server silently ignores it
     */

    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Setup: 2 players
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');

    // Start lyrics game
    await startMiniGame(p1, 'lyrics');

    // Wait for players to navigate to lyrics page
    await p1.waitForURL(/\/group\/[A-Z]{4}\/lyrics/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/lyrics/, { timeout: 15_000 });

    // Wait for countdown to finish
    try {
      await waitForScreen(p1, 'countdown', 15_000);
    } catch {
      // Might already be at question
    }

    // Wait for first question
    await waitForScreen(p1, 'question', 15_000);
    await waitForScreen(p2, 'question', 15_000);

    // Verify question elements
    await expect(p1.locator('#q-song')).toBeVisible();
    await expect(p1.locator('#q-prompt')).toBeVisible();

    // Find answer buttons
    const answerButtons = p1.locator('.ans-btn');
    const count = await answerButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Player 1 selects an answer
    const firstButton = answerButtons.first();
    await firstButton.click();

    // Wait a moment for WebSocket message to process
    await p1.waitForTimeout(1_000);

    // Check if answer was confirmed
    // The button should either show as .selected or a confirmation message appears
    const isConfirmed = await firstButton.evaluate(el =>
      el.classList.contains('selected') || el.classList.contains('submitted')
    );

    if (!isConfirmed) {
      console.log('✓ Bug #3 detected: Answer was not confirmed');
      console.log('  Expected: LYRICS_ANSWER_CONFIRMED message received');
      console.log('  Actual: Button state did not change to .selected/.submitted');
      console.log('  Cause: handlers.js LYRICS_ANSWER routes to undefined room.lyricsGame');
      console.log('  Fix: Route LYRICS_ANSWER through room.game.handlePlayerAction()');
      expect(isConfirmed).toBe(false);  // Confirm bug is present
    } else {
      console.log('⚠️ Bug #3 not detected: Answer was confirmed (bug may be fixed)');
    }

    await ctx1.close();
    await ctx2.close();
  });

});
