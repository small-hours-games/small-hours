import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, protocolTimeout: 90000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });

const page = await browser.newPage();
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  console.log('=== BOT MESSAGE INSPECTION ===\n');
  
  // Intercept WebSocket messages
  const wsMessages = [];
  await page.evaluateOnNewDocument(() => {
    window.wsMessages = [];
    const OrigWS = WebSocket;
    window.WebSocket = class extends OrigWS {
      addEventListener(event, handler) {
        if (event === 'message') {
          const wrapped = (msg) => {
            try {
              const data = JSON.parse(msg.data);
              window.wsMessages.push({type: data.type, players: data.players?.length || 'N/A'});
            } catch (e) {}
            handler(msg);
          };
          super.addEventListener(event, wrapped);
        } else {
          super.addEventListener(event, handler);
        }
      }
    };
  });
  
  // Create room
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await page.evaluate(() => document.getElementById('create-btn').click());
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  const roomCode = page.url().split('/')[4];
  console.log(`Room: ${roomCode}\n`);
  
  // Join as solo player
  await page.evaluate(() => { 
    document.getElementById('name-input').value='Solo'; 
    document.getElementById('name-submit-btn').click(); 
  });
  await wait(2000);
  
  // Check WS messages
  const messages = await page.evaluate(() => window.wsMessages || []);
  console.log('WebSocket messages received:');
  messages.slice(0, 10).forEach((m, i) => {
    console.log(`  ${i+1}. ${m.type} (${m.players} players)`);
  });
  
  // Get player state from DOM
  const playerState = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.player-chip'));
    return {
      count: chips.length,
      list: chips.map(c => c.textContent.trim())
    };
  });
  console.log(`\nPlayer chips rendered: ${playerState.count}`);
  playerState.list.forEach(p => console.log(`  - ${p}`));
  
  await browser.close();
} catch (e) {
  console.error('ERROR:', e.message);
  await browser.close();
  process.exit(1);
}
