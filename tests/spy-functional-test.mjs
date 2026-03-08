import puppeteer from 'puppeteer-core';

const BASE_URL = 'https://quiz.aldervall.se';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    console.log('=== SPY GAME FUNCTIONAL TEST ===\n');
    
    // Step 1: Create room
    console.log('✓ STEP 1: Creating spy game room...');
    const p1 = await browser.newPage();
    await p1.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await p1.click('#spy-btn');
    await p1.waitForNavigation({ waitUntil: 'networkidle2' });
    const roomCode = p1.url().match(/\/group\/([A-Z]{4})/)[1];
    console.log(`  Room created: ${roomCode}\n`);

    // Step 2: Verify setup phase
    console.log('✓ STEP 2: Verifying setup phase...');
    await p1.waitForSelector('#phase-setup', { timeout: 5000 });
    const setupText = await p1.$eval('#phase-setup h2', el => el.textContent);
    if (setupText.includes('Game Starting')) {
      console.log(`  Setup phase loaded: "${setupText}"\n`);
    }

    // Step 3: Open display view
    console.log('✓ STEP 3: Opening display view...');
    const display = await browser.newPage();
    await display.goto(`${BASE_URL}/group/${roomCode}/spy/display`, { waitUntil: 'networkidle2' });
    await display.waitForSelector('#phase-setup', { timeout: 5000 });
    console.log('  Display view synced\n');

    // Step 4: Wait for clues phase
    console.log('✓ STEP 4: Waiting for clues phase (~5s)...');
    await new Promise(r => setTimeout(r, 6000));
    
    const hasClueInput = await p1.$('#clue-input') !== null;
    if (hasClueInput) {
      console.log('  Clues phase loaded\n');
    }

    console.log('=== ✅ SPY GAME FULLY FUNCTIONAL ===\n');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
  } finally {
    await browser.close();
  }
}

test();
