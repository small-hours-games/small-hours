import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, protocolTimeout: 90000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
const [p1, p2] = [await browser.newPage(), await browser.newPage()];
const js = (page, fn) => page.evaluate(fn);
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, id, timeoutMs=20000) {
  const t = Date.now();
  while (Date.now()-t < timeoutMs) {
    if (await page.evaluate((screenId) => document.getElementById(screenId)?.classList.contains('active'), id)) return true;
    await wait(300);
  }
  return false;
}

try {
  console.log('=== SETUP ===');
  await p1.goto(BASE, { waitUntil: 'networkidle2' });
  await p1.evaluate(() => document.getElementById('create-btn').click());
  await p1.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = p1.url().split('/')[4];
  console.log('Room:', roomCode);
  await js(p1, () => { document.getElementById('name-input').value='Alice'; document.getElementById('name-submit-btn').click(); });
  await wait(1500);
  await p2.goto(`${BASE}/group/${roomCode}`, { waitUntil: 'networkidle2' });
  await js(p2, () => { document.getElementById('name-input').value='Bob'; document.getElementById('name-submit-btn').click(); });
  await wait(1500);
  console.log('Alice (admin) and Bob joined lobby ✅');

  console.log('\n=== SELECT SHITHEAD GAME ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => { 
    const tiles = document.querySelectorAll('.game-tile');
    console.log('Found tiles:', tiles.length);
    // Find shithead tile (should be index 1 or contain "shithead" text)
    tiles.forEach((t, i) => console.log(`Tile ${i}:`, t.textContent?.trim()));
    tiles[1]?.click(); // Try second tile for shithead
    document.getElementById('ready-btn').click(); 
  });
  await wait(1500);
  const btnExists = await js(p1, () => !!document.getElementById('start-btn'));
  console.log('Start button exists:', btnExists ? '✅' : '❌');
  
  if (btnExists) {
    await js(p1, () => document.getElementById('start-btn').click());
    await wait(3000);
    console.log('Both on shithead page:', p1.url().includes('/shithead') && p2.url().includes('/shithead') ? '✅' : '❌');
    console.log('P1 URL:', p1.url());
    console.log('P2 URL:', p2.url());
  }

  console.log('\n=== WAIT FOR GAME START ===');
  // Wait for swap or playing screens to activate (game has started)
  const gameStarted = await waitFor(p1, 'swap', 15000) || await waitFor(p1, 'playing', 5000);
  console.log('Shithead game started:', gameStarted ? '✅' : '❌ TIMEOUT');

  if (gameStarted) {
    console.log('\n=== GAME STATE ===');
    const state = await js(p1, () => ({
      swapActive: document.getElementById('swap')?.classList.contains('active'),
      playingActive: document.getElementById('playing')?.classList.contains('active'),
      cardsVisible: !!document.querySelector('.cards-grid'),
    }));
    console.log('Swap screen:', state.swapActive ? '✅' : '❌');
    console.log('Playing screen:', state.playingActive ? '✅' : '❌');
    console.log('Cards visible:', state.cardsVisible ? '✅' : '❌');
  }

  console.log('\n=== TEST COMPLETE ===');
} catch(e) {
  console.error('Error:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
