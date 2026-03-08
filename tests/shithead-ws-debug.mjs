import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
const chromePath = execSync('which chromium 2>/dev/null || echo /usr/bin/chromium').toString().trim();
const BASE = 'https://quiz.aldervall.se';
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, protocolTimeout: 90000, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
const p1 = await browser.newPage();
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
    document.getElementById('name-input').value='Alice'; 
    document.getElementById('name-submit-btn').click(); 
  });
  await wait(1500);

  console.log('\n=== SELECT SHITHEAD ===');
  await js(p1, () => { 
    const tiles = document.querySelectorAll('.game-tile');
    tiles[1]?.click(); 
    document.getElementById('ready-btn').click(); 
  });
  await wait(1500);
  
  await js(p1, () => document.getElementById('start-btn').click());
  await wait(3000);

  console.log('\n=== WS DEBUG ===');
  const wsDebug = await js(p1, () => {
    console.log('Window.ws:', typeof window.ws);
    console.log('RoomCode from URL:', new URL(window.location).pathname.split('/')[3]);
    
    // Try to manually check WebSocket
    return {
      wsExists: typeof window.ws !== 'undefined',
      wsType: typeof window.ws,
      wsReadyState: window.ws?.readyState,
      wsURL: window.ws?.url,
      roomCodeFromURL: new URL(window.location).pathname.split('/')[3],
      pageTitle: document.title,
      bodyClasses: document.body.className,
      errorLogs: [],
    };
  });
  
  console.log('WS Debug info:');
  console.log('  WS exists:', wsDebug.wsExists);
  console.log('  WS type:', wsDebug.wsType);
  console.log('  WS ready state:', wsDebug.wsReadyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
  console.log('  WS URL:', wsDebug.wsURL);
  console.log('  Room from URL:', wsDebug.roomCodeFromURL);
  console.log('  Page title:', wsDebug.pageTitle);
  
  // Check for console errors
  console.log('\n=== CONSOLE ERRORS ===');
  const logs = [];
  p1.on('console', msg => {
    if (msg.type() === 'error') {
      logs.push(msg.text());
      console.log('ERROR:', msg.text());
    }
  });
  
  await wait(2000);
  if (logs.length === 0) {
    console.log('No console errors detected');
  }

  // Check if connect function exists
  console.log('\n=== FUNCTION CHECK ===');
  const funcCheck = await js(p1, () => {
    return {
      connectExists: typeof window.connect !== 'undefined',
      buildWsUrlExists: typeof window.buildWsUrl !== 'undefined',
    };
  });
  console.log('Functions:');
  console.log('  connect():', funcCheck.connectExists);
  console.log('  buildWsUrl():', funcCheck.buildWsUrlExists);

} catch(e) {
  console.error('Error:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
