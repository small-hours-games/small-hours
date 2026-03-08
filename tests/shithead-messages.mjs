import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  protocolTimeout: 90000,
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
});

const p1 = await browser.newPage();
const p2 = await browser.newPage();

let p1Messages = [];
let p1Errors = [];

// Capture all network traffic
p1.on('requestfinished', req => {
  if (req.url().includes('/ws')) {
    console.log(`[Network] ${req.method()} ${req.url()}`);
  }
});

p1.on('console', msg => {
  if (msg.text().includes('Received') || msg.text().includes('GAME_STATE')) {
    console.log(`[P1-console] ${msg.text()}`);
  }
});

p1.on('pageerror', err => {
  p1Errors.push(err.message);
  console.log(`[P1-pageerror] ${err.message}`);
});

const js = (page, fn) => page.evaluate(fn);
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  console.log('=== SETUP ===');
  await p1.goto(BASE, { waitUntil: 'networkidle2' });
  await p1.evaluate(() => document.getElementById('create-btn').click());
  await p1.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = p1.url().split('/')[4];
  console.log('Room:', roomCode);

  await js(p1, () => {
    document.getElementById('name-input').value = 'Alice';
    document.getElementById('name-submit-btn').click();
  });
  await wait(1500);

  await p2.goto(`${BASE}/group/${roomCode}`, { waitUntil: 'networkidle2' });
  await js(p2, () => {
    document.getElementById('name-input').value = 'Bob';
    document.getElementById('name-submit-btn').click();
  });
  await wait(1500);
  console.log('Both in lobby ✅');

  // Select shithead
  console.log('\n=== SELECT SHITHEAD ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => {
    const tiles = document.querySelectorAll('.game-tile');
    tiles[1]?.click();
    document.getElementById('ready-btn').click();
  });
  await wait(1500);

  // Start game
  const btnExists = await js(p1, () => !!document.getElementById('start-btn'));
  if (btnExists) {
    await js(p1, () => document.getElementById('start-btn').click());
    await wait(3000);
    console.log('Both navigated to shithead page ✅');
  }

  console.log('\n=== TRACK MESSAGE FLOW ===');
  // Wait for messages
  for (let i = 0; i < 10; i++) {
    const msgs = await js(p1, () => {
      // Try to access any debug state or check console
      const allElements = document.querySelectorAll('[id]');
      const activeScreens = [...allElements]
        .filter(e => e.classList.contains('screen') && e.classList.contains('active'))
        .map(e => e.id);
      return {
        activeScreens,
        title: document.title,
        timeNow: Date.now(),
      };
    });
    console.log(`[${i}] Active: ${msgs.activeScreens.join(',') || 'none'}`);
    await wait(500);
  }

  console.log('\n=== TEST COMPLETE ===');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
