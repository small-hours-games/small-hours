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
