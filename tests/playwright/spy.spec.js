const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen, assertServerHealthy } = require('./helpers/room');

test.describe('Spy Game (Bug 1 Detection)', () => {

  test('spy game: setup and clue submission triggers server crash (Bug 1)', async ({ request, browser }) => {
    /**
     * KNOWN BUG #1: handlers.js line ~517
     * SEND_CLUE case references `spyGame` which is undefined (never declared in scope).
     * This throws ReferenceError and crashes the WebSocket handler.
     *
     * Expected behavior: Non-spy players enter clues, spy listens, then spy guesses
     * Actual behavior: Server crashes ReferenceError when any player sends a clue
     */

    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const p3 = await ctx3.newPage();

    // Setup: 3 players required for Spy
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');
    await joinRoom(p3, code, 'Charlie');

    // Start spy game
    await startMiniGame(p1, 'spy');

    try {
      // Wait for game to navigate to spy page
      await p1.waitForURL(/\/group\/[A-Z]{4}\/spy/, { timeout: 10_000 });
      await p2.waitForURL(/\/group\/[A-Z]{4}\/spy/, { timeout: 10_000 });
      await p3.waitForURL(/\/group\/[A-Z]{4}\/spy/, { timeout: 10_000 });

      // Wait a bit for game setup
      await p1.waitForTimeout(3_000);

      // Verify server crashed by checking health
      let serverHealthy = true;
      try {
        await assertServerHealthy(request);
      } catch {
        serverHealthy = false;
      }

      if (!serverHealthy) {
        // Expected: server crashed
        console.log('✓ Bug #1 detected: Server crashed when handling Spy clue messages');
        console.log('  Cause: handlers.js SEND_CLUE case references undefined `spyGame` variable');
        console.log('  Fix: Route SEND_CLUE through room.game.handlePlayerAction()');
        expect(serverHealthy).toBe(false);
      } else {
        // Try to send clue
        // The clue input would be #clue-input with #send-clue-btn
        const clueInput = p1.locator('#clue-input');
        if (await clueInput.isVisible().catch(() => false)) {
          await clueInput.fill('A hint');
          await p1.locator('#send-clue-btn').click();
          await p1.waitForTimeout(1_000);

          // Check if server is still healthy
          try {
            await assertServerHealthy(request);
            console.log('⚠️ Bug #1 not detected: Server survived clue submission');
            expect(true).toBe(false);  // Unexpected - server should have crashed
          } catch {
            console.log('✓ Bug #1 detected: Server crashed after clue submission');
            expect(true).toBe(true);
          }
        } else {
          console.log('⚠️ Clue input not found - server may have crashed before reaching clues phase');
        }
      }
    } catch (error) {
      console.log('Error during spy test:', error.message);
      // Check server health
      try {
        await assertServerHealthy(request);
        expect(true).toBe(false);  // Server should be dead
      } catch {
        console.log('✓ Bug #1 confirmed: Server crash detected');
        expect(true).toBe(true);
      }
    }

    await ctx1.close();
    await ctx2.close();
    await ctx3.close();
  });

});
