const { expect } = require('@playwright/test');

/**
 * Create a new room via API.
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<string>} 4-letter uppercase room code
 */
async function createRoom(request) {
  const res = await request.post('/api/rooms');
  expect(res.ok()).toBeTruthy();
  const { code } = await res.json();
  expect(code).toMatch(/^[A-Z]{4}$/);
  return code;
}

/**
 * Join a room as a player.
 * Navigates to /player/?room=CODE, fills in username, clicks join.
 * After JOIN_OK, the waiting screen appears (with game menu visible for admin).
 * @param {import('@playwright/test').Page} page
 * @param {string} code - 4-letter room code
 * @param {string} name - player display name
 */
async function joinRoom(page, code, name) {
  // Capture all console messages
  page.on('console', msg => {
    console.log(`[${name}] ${msg.text()}`);
  });

  // Navigate with room code in query parameter
  await page.goto(`/player/?room=${code}`);
  // Fill username
  await page.locator('#username-input').fill(name);
  await page.locator('#username-submit').click();

  // After JOIN_OK, the lobby state should appear with the player list populated
  await page.locator('#player-list').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Start a mini-game (admin only).
 * Injects START_MINI_GAME message via page.evaluate.
 * @param {import('@playwright/test').Page} adminPage
 * @param {string} gameType - 'quiz'|'shithead'|'spy'|'lyrics'|'cah'|'guess'
 */
async function startMiniGame(adminPage, gameType) {
  // The /player/:code page exposes a send() function in global scope
  await adminPage.evaluate((type) => {
    // eslint-disable-next-line no-undef
    send({ type: 'START_MINI_GAME', gameType: type });
  }, gameType);
}

/**
 * Wait for a screen element to become active.
 * Uses #screenId.active selector pattern.
 * @param {import('@playwright/test').Page} page
 * @param {string} screenId - HTML element ID
 * @param {number} timeout - max wait time in ms
 */
async function waitForScreen(page, screenId, timeout = 20_000) {
  await page.locator(`#${screenId}.active`).waitFor({ state: 'visible', timeout });
}

/**
 * Verify server health (no crash).
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function assertServerHealthy(request) {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
}

module.exports = { createRoom, joinRoom, startMiniGame, waitForScreen, assertServerHealthy };
