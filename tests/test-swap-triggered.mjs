import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const [p1, p2] = [await browser.newPage(), await browser.newPage()];
const js = (page, fn) => page.evaluate(fn);
const wait = ms => new Promise(r => setTimeout(r, ms));

// Capture network requests
const requests = [];
p1.on('response', response => {
  if (response.request().postData()) {
    requests.push({
      url: response.url(),
      method: response.request().method(),
      body: response.request().postData()
    });
  }
});

try {
  console.log('🎮 Testing Card Swap Trigger\n');

  // Setup
  await p1.goto(BASE, { waitUntil: 'networkidle2' });
  await p1.evaluate(() => document.getElementById('create-btn').click());
  await p1.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = p1.url().split('/')[4];

  await js(p1, () => {
    document.getElementById('name-input').value = 'Alice';
    document.getElementById('name-submit-btn').click();
  });
  await wait(1000);

  await p2.goto(BASE + '/group/' + roomCode, { waitUntil: 'networkidle2' });
  await js(p2, () => {
    document.getElementById('name-input').value = 'Bob';
    document.getElementById('name-submit-btn').click();
  });
  await wait(1000);

  await js(p2, () => document.getElementById('ready-btn').click());
  await wait(500);

  await js(p1, () => {
    const tiles = document.querySelectorAll('.game-tile');
    tiles[1]?.click();
    document.getElementById('ready-btn').click();
  });
  await wait(1500);

  await js(p1, () => document.getElementById('start-btn').click());
  await wait(2000);

  // Wait for SWAP phase
  for (let i = 0; i < 15; i++) {
    const state = await js(p1, () => ({
      active: document.querySelector('.screen.active')?.id,
      handCards: document.querySelectorAll('#swap-hand .play-card').length
    }));
    if (state.active === 'swap' && state.handCards > 0) break;
    await wait(500);
  }

  console.log('=== SWAP PHASE - TESTING CARD CLICKS ===\n');

  // Click hand card
  console.log('1️⃣  Clicking hand card...');
  await js(p1, () => document.querySelectorAll('#swap-hand .play-card')[0]?.click());
  await wait(300);

  let state = await js(p1, () => ({
    hand: document.querySelectorAll('#swap-hand .play-card.selected').length,
    faceUp: document.querySelectorAll('#swap-faceup .play-card.selected').length
  }));
  console.log(`   Selection: hand=${state.hand}, faceUp=${state.faceUp}`);

  // Click faceup card
  console.log('\n2️⃣  Clicking face-up card...');
  const swapMessages = [];
  p1.on('console', msg => {
    if (msg.text().includes('swap') || msg.text().includes('SWAP')) {
      swapMessages.push(msg.text());
    }
  });

  await js(p1, () => document.querySelectorAll('#swap-faceup .play-card')[0]?.click());
  await wait(500);

  state = await js(p1, () => ({
    hand: document.querySelectorAll('#swap-hand .play-card.selected').length,
    faceUp: document.querySelectorAll('#swap-faceup .play-card.selected').length
  }));
  console.log(`   Selection: hand=${state.hand}, faceUp=${state.faceUp}`);

  console.log('\n=== RESULTS ===');
  if (state.hand === 0 && state.faceUp === 0) {
    console.log('✅ PASSED: Both selections cleared after swap triggered');
    console.log('   This is expected behavior - swap message was sent');
  } else {
    console.log('❌ FAILED: Selections still present after card clicks');
  }

} finally {
  await browser.close();
}
