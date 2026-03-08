import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, protocolTimeout: 90000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });

const page = await browser.newPage();
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  console.log('=== SOLO BOT TEST ===\n');
  
  // Create room
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  console.log('✓ Landed on home page');
  
  await page.evaluate(() => document.getElementById('create-btn').click());
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = page.url().split('/')[4];
  console.log(`✓ Room created: ${roomCode}`);
  
  // Join as solo player
  await page.evaluate(() => { 
    document.getElementById('name-input').value='TestPlayer'; 
    document.getElementById('name-submit-btn').click(); 
  });
  await wait(1500);
  console.log('✓ Player joined lobby');
  
  // Check for bot in player list
  const hasBot = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.player-chip'));
    return chips.some(chip => chip.textContent.includes('🤖'));
  });
  console.log(hasBot ? '✓ Bot auto-added to solo room' : '✗ Bot NOT found in solo room');
  
  // Get player list
  const playerList = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.player-chip'));
    return chips.map(chip => chip.textContent.trim());
  });
  console.log(`  Players: ${playerList.join(', ')}`);
  
  await browser.close();
} catch (e) {
  console.error('ERROR:', e.message);
  await browser.close();
  process.exit(1);
}
