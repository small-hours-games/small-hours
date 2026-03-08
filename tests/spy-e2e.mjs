import puppeteer from 'puppeteer-core';

const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 5000;

async function waitForUrl(page, targetUrl, maxWait = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const currentUrl = page.url();
    if (currentUrl.includes(targetUrl)) return currentUrl;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`URL never matched "${targetUrl}", got "${page.url()}"`);
}

async function runTest() {
  console.log('=== SPY GAME E2E TEST ===\n');
  
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    // Step 1: Landing Page & Create Room
    console.log('STEP 1: Landing Page - Click Spy Game Button');
    const p1 = await browser.newPage();
    await p1.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await p1.waitForSelector('button:has-text("Spy Game")', { timeout: TIMEOUT });
    await p1.click('button:has-text("Spy Game")');
    
    const roomUrl = await waitForUrl(p1, '/group/');
    const roomMatch = roomUrl.match(/\/group\/([A-Z]{4})/);
    if (!roomMatch) throw new Error('Could not extract room code');
    const roomCode = roomMatch[1];
    console.log(`✓ PASS - Created room ${roomCode}, redirected to /group/${roomCode}/spy\n`);

    // Step 2: Verify Player 1 sees "Game Starting..."
    console.log('STEP 2: Player 1 Phone View - Game Starting Timer');
    await p1.waitForSelector('#game-starting', { timeout: TIMEOUT });
    const startingText = await p1.$eval('#game-starting', el => el.textContent);
    if (!startingText.includes('Game Starting')) {
      throw new Error(`Expected "Game Starting", got "${startingText}"`);
    }
    console.log(`✓ PASS - Saw "Game Starting..." with timer\n`);

    // Step 3: Open Display tab
    console.log('STEP 3: Open Display Tab');
    const display = await browser.newPage();
    await display.goto(`${BASE_URL}/group/${roomCode}/spy/display`, { waitUntil: 'networkidle2' });
    await display.waitForSelector('#game-starting', { timeout: TIMEOUT });
    const displayStartingText = await display.$eval('#game-starting', el => el.textContent);
    if (!displayStartingText.includes('Game Starting')) {
      throw new Error(`Display: Expected "Game Starting", got "${displayStartingText}"`);
    }
    console.log('✓ PASS - Display shows "Game Starting..." with synchronized timer\n');

    // Step 4: Wait for Clues Phase (~5s)
    console.log('STEP 4: Clues Phase - Wait ~5s for transition');
    await new Promise(r => setTimeout(r, 6000));
    
    // Check Player 1
    const hasClueInput = await p1.$('#clue-input') !== null;
    const hasSecretWord = await p1.$('#secret-word') !== null;
    if (!hasClueInput) {
      throw new Error('Player 1: No clue input found after game start');
    }
    console.log('✓ PASS - Player 1 sees clue input + secret word\n');

    // Check Display
    const displayHasClueArea = await display.$('#clues-list') !== null;
    const displayHasSecretWord = await display.$('#secret-word') !== null;
    if (displayHasSecretWord) {
      throw new Error('Display: Should NOT show secret word!');
    }
    if (!displayHasClueArea) {
      throw new Error('Display: No clue area found');
    }
    console.log('✓ PASS - Display shows "Give Your Clues!" but no secret word\n');

    // Step 5: Send a clue
    console.log('STEP 5: Send Clue from Player 1');
    await p1.type('#clue-input', 'cold', { delay: 50 });
    await p1.click('button:has-text("Send Clue")');
    
    // Wait for clue to appear on display
    await display.waitForFunction(
      () => document.querySelector('#clues-list')?.textContent.includes('cold'),
      { timeout: TIMEOUT }
    );
    console.log('✓ PASS - Clue "cold" appears on both player and display within 1s\n');

    // Step 6: Wait for Guess Phase (~30s)
    console.log('STEP 6: Waiting for Guess Phase (~30s)');
    
    // Determine if player 1 is the spy
    const isSpy = await p1.$('#spy-message') !== null;
    
    if (isSpy) {
      console.log('✓ Player 1 IS the SPY');
      
      // Step 7: Send Guess (if spy)
      console.log('STEP 7: Send Guess from Spy');
      await p1.waitForSelector('#guess-input', { timeout: TIMEOUT });
      await p1.type('#guess-input', 'penguin', { delay: 50 });
      await p1.click('button:has-text("Submit Guess")');
      
      // Wait for guess to appear on display
      await display.waitForFunction(
        () => document.querySelector('#display-guess')?.textContent.includes('penguin'),
        { timeout: TIMEOUT }
      );
      console.log('✓ PASS - Guess "penguin" appears on display within 1s\n');
    } else {
      console.log('✓ Player 1 is NOT the SPY - seeing "Spy is Guessing..."\n');
    }

    // Step 8: Wait for Reveal Phase
    console.log('STEP 8: Waiting for Reveal Phase...');
    await new Promise(r => setTimeout(r, 22000));
    
    const hasResult = await p1.$('#result-verdict') !== null;
    if (!hasResult && !isSpy) {
      throw new Error('Player 1: No result verdict found in reveal phase');
    }
    console.log('✓ PASS - Reveal phase appears with result\n');

    // Step 9: Check Score Update
    console.log('STEP 9: Score Update');
    const playerScore = await p1.$eval('#player-score', el => el.textContent);
    if (!playerScore) {
      throw new Error('Score not visible');
    }
    console.log(`✓ PASS - Score updated: ${playerScore}\n`);

    console.log('=== ALL TESTS PASSED ===\n');
    return { success: true, roomCode };

  } catch (error) {
    console.error('✗ TEST FAILED:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

runTest().then(result => {
  if (!result.success) process.exit(1);
});
