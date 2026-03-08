import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const p1 = await browser.newPage();
const js = (page, fn) => page.evaluate(fn);
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  console.log('=== DEBUGGING CARD CLICK ISSUE ===\n');

  // Quick setup to SWAP phase
  await p1.goto(BASE, { waitUntil: 'networkidle2' });
  await p1.evaluate(() => document.getElementById('create-btn').click());
  await p1.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = p1.url().split('/')[4];

  await js(p1, () => {
    document.getElementById('name-input').value = 'Test';
    document.getElementById('name-submit-btn').click();
  });
  await wait(1000);

  await js(p1, () => {
    document.getElementById('ready-btn').click();
  });
  await wait(500);

  await js(p1, () => {
    const tiles = document.querySelectorAll('.game-tile');
    tiles[1]?.click();
    document.getElementById('ready-btn').click();
  });
  await wait(1500);

  await js(p1, () => document.getElementById('start-btn').click());
  await wait(2000);

  // Wait for swap
  for (let i = 0; i < 15; i++) {
    const s = await js(p1, () => document.querySelector('.screen.active')?.id);
    if (s === 'swap') break;
    await wait(500);
  }

  console.log('In SWAP phase\n');

  // Check HTML structure and event listeners
  const debugInfo = await js(p1, () => {
    const handEl = document.getElementById('swap-hand');
    const card = document.querySelector('#swap-hand .play-card');

    return {
      handContainerExists: handEl !== null,
      handContainerHTML: handEl?.outerHTML.substring(0, 200),
      cardExists: card !== null,
      cardHTML: card?.outerHTML.substring(0, 200),
      cardClasses: card?.className,
      cardPointerEvents: window.getComputedStyle(card).pointerEvents,
      containerListenerAttached: handEl?._listenerAttached,
      cardClickable: card ? window.getComputedStyle(card).cursor : 'N/A'
    };
  });

  console.log('Container exists:', debugInfo.handContainerExists);
  console.log('Card exists:', debugInfo.cardExists);
  console.log('Card classes:', debugInfo.cardClasses);
  console.log('Card pointer-events:', debugInfo.cardPointerEvents);
  console.log('Card cursor:', debugInfo.cardClickable);
  console.log('Listener attached flag:', debugInfo.containerListenerAttached);

  console.log('\nContainer HTML:', debugInfo.handContainerHTML);
  console.log('Card HTML:', debugInfo.cardHTML);

  // Try to manually trigger a click event
  console.log('\n=== TESTING CLICK EVENT ===\n');

  const clickWorked = await js(p1, () => {
    const card = document.querySelector('#swap-hand .play-card');
    if (!card) return { error: 'Card not found' };

    let clickFired = false;
    card.addEventListener('click', () => {
      clickFired = true;
      console.log('[Manual listener] Click fired on card!');
    });

    console.log('[Test] Dispatching click event...');
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    console.log('[Test] Click dispatched, fired=' + clickFired);

    return { clickFired };
  });

  console.log('Click event result:', clickWorked);

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
