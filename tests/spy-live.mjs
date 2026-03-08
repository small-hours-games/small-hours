import puppeteer from 'puppeteer-core';

const BASE_URL = 'https://quiz.aldervall.se';
const TIMEOUT = 10000;

async function runTest() {
  console.log('=== SPY GAME E2E TEST (quiz.aldervall.se) ===\n');
  
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    console.log('STEP 1: Loading landing page...');
    const p1 = await browser.newPage();
    await p1.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    
    const buttons = await p1.$$eval('button', btns => btns.map(b => ({ id: b.id, text: b.textContent.trim().substring(0, 40) })));
    console.log('✓ Page loaded');
    console.log('  Available buttons:', buttons.slice(0, 5));
    
    const spyBtn = await p1.$('#spy-btn');
    if (!spyBtn) {
      throw new Error('Spy button not found. Page may be loading different app.');
    }
    
    console.log('✓ Spy Game button found\n');
    console.log('STEP 2: Clicking Spy Game button...');
    await p1.click('#spy-btn');
    
    // Wait for navigation
    await p1.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT });
    const url = p1.url();
    console.log(`✓ Navigated to: ${url}\n`);
    
    const roomMatch = url.match(/\/group\/([A-Z]{4})/);
    if (!roomMatch) {
      throw new Error(`Could not extract room code from ${url}`);
    }
    const roomCode = roomMatch[1];
    console.log(`✓ Room created: ${roomCode}\n`);

    console.log('STEP 3: Verifying spy game UI...');
    await p1.waitForSelector('#game-starting', { timeout: TIMEOUT });
    const text = await p1.$eval('#game-starting', el => el.textContent);
    console.log(`✓ Game UI loaded: "${text.substring(0, 50)}..."\n`);

    console.log('=== ✓ SPY GAME DEPLOYED & WORKING ===\n');
    return { success: true, roomCode };

  } catch (error) {
    console.error('\n✗ FAILURE:', error.message);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

runTest().then(result => {
  if (!result.success) process.exit(1);
});
