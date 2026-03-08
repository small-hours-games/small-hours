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

try {
  console.log('=== TESTING NAVIGATION TO SHITHEAD GAME ===\n');

  await p1.goto(BASE, { waitUntil: 'networkidle2' });
  await p1.evaluate(() => document.getElementById('create-btn').click());
  await p1.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = p1.url().split('/')[4];
  console.log('Room created:', roomCode);

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
  console.log('Both players in lobby');

  console.log('\nClicking ready/select...');
  await js(p2, () => document.getElementById('ready-btn').click());
  await wait(500);

  await js(p1, () => {
    const tiles = document.querySelectorAll('.game-tile');
    tiles[1]?.click();
    document.getElementById('ready-btn').click();
  });
  await wait(1500);
  console.log('Both ready with shithead selected');

  const url1 = p1.url();
  console.log('\nBefore start click - P1 URL:', url1);

  const startBtn = await js(p1, () => {
    const btn = document.getElementById('start-btn');
    return btn ? 'found' : 'not found';
  });
  console.log('Start button:', startBtn);

  console.log('\nClicking start button...');
  await js(p1, () => {
    document.getElementById('start-btn')?.click();
  });

  await wait(3000);

  const url2 = p1.url();
  console.log('After start click - P1 URL:', url2);

  if (url1 === url2) {
    console.log('\n❌ ERROR: URL did not change!');
  } else {
    console.log('\n✅ Navigation successful');
    if (url2.includes('/shithead')) {
      console.log('✅ Navigated to shithead page');
    }
  }

} finally {
  await browser.close();
}
