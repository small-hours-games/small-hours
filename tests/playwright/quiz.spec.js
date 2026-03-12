const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, startMiniGame, waitForScreen } = require('./helpers/room');

test.describe('Quiz Game', () => {

  test('quiz flow: setup, question, answer, reveal', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Setup: join room
    await joinRoom(p1, code, 'Alice');
    await joinRoom(p2, code, 'Bob');

    // Admin clicks "Quiz" button from game menu (or uses startMiniGame)
    await startMiniGame(p1, 'quiz');

    // Wait for players to navigate to quiz page
    await p1.waitForURL(/\/group\/[A-Z]{4}\/quiz/, { timeout: 15_000 });
    await p2.waitForURL(/\/group\/[A-Z]{4}\/quiz/, { timeout: 15_000 });

    // Vote screen should appear after START_MINI_GAME
    // Wait for vote buttons and vote for 3 categories each
    async function voteForCategories(page) {
      await page.locator('.vote-cat-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
      const buttons = await page.locator('.vote-cat-btn').all();
      for (let i = 0; i < 3 && i < buttons.length; i++) {
        await buttons[i].click();
        await page.waitForTimeout(100);
      }
      await page.locator('#vote-submit-btn').click();
    }

    await voteForCategories(p1);
    await voteForCategories(p2);
    await p1.waitForTimeout(1000);

    // Wait longer for countdown and question to appear (countdown is 3s, questions need to be fetched from API)
    await waitForScreen(p1, 'question', 30_000);
    await waitForScreen(p2, 'question', 30_000);

    // Verify question renders
    await expect(p1.locator('#pq-text')).toBeVisible();
    await expect(p2.locator('#pq-text')).toBeVisible();

    // Verify 4 answer buttons
    const p1Buttons = await p1.locator('.ans-btn').count();
    expect(p1Buttons).toBe(4);

    // Players answer
    await p1.locator('.ans-btn').first().click();
    await p2.locator('.ans-btn').nth(1).click();
    await p1.waitForTimeout(500);

    // Wait for reveal screen
    await waitForScreen(p1, 'reveal', 15_000);
    await waitForScreen(p2, 'reveal', 15_000);

    // Verify reveal screen shows result
    await expect(p1.locator('#result-title')).toBeVisible();
    await expect(p1.locator('#result-points')).toBeVisible();
    await expect(p1.locator('#result-score')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('quiz: game over screen displays scores', async ({ request, browser }) => {
    const code = await createRoom(request);
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();

    await joinRoom(p1, code, 'Solo');

    // Start quiz with very few questions
    await p1.evaluate((type) => {
      // eslint-disable-next-line no-undef
      send({ type: 'START_MINI_GAME', gameType: type, questionCount: 1 });
    }, 'quiz');

    // Wait for quiz page to load
    await p1.waitForURL(/\/group\/[A-Z]{4}\/quiz/, { timeout: 15_000 });

    // Vote for categories (will appear after START_MINI_GAME)
    await p1.locator('.vote-cat-btn').first().waitFor({ state: 'visible', timeout: 15_000 });
    const buttons = await p1.locator('.vote-cat-btn').all();
    for (let i = 0; i < 3 && i < buttons.length; i++) {
      await buttons[i].click();
      await p1.waitForTimeout(100);
    }
    await p1.locator('#vote-submit-btn').click();
    await p1.waitForTimeout(1000);

    // Wait for question screen (questions take time to fetch from API)
    await waitForScreen(p1, 'question', 30_000);

    // Answer the single question
    await p1.locator('.ans-btn').first().click();
    await p1.waitForTimeout(500);

    // Wait for game over
    await waitForScreen(p1, 'gameover', 15_000);

    // Verify game over screen
    await expect(p1.locator('#go-rank')).toBeVisible();
    await expect(p1.locator('#go-score')).toBeVisible();

    await ctx1.close();
  });

});
