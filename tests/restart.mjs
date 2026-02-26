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
async function waitForUrl(page, substr, timeoutMs=10000) {
  const t = Date.now();
  while (Date.now()-t < timeoutMs) {
    if (page.url().includes(substr)) return true;
    await wait(300);
  }
  return false;
}

async function playAllQuestions(label) {
  console.log(`\n=== QUESTIONS (${label}) ===`);
  for (let i = 0; i < 12; i++) {
    const onQ = await waitFor(p1, 'question', 15000);
    if (!onQ) { console.log(`  Q${i+1}: timed out`); break; }

    const q = await js(p1, () => document.getElementById('pq-text')?.textContent?.trim() || '?');
    console.log(`  Q${i+1}: "${q.slice(0, 50)}..."`);

    await Promise.all([
      js(p1, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[0].click(); }),
      js(p2, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[1].click(); }),
    ]);

    await waitFor(p1, 'reveal', 12000);
    if (await js(p1, () => document.getElementById('gameover')?.classList.contains('active'))) {
      console.log('  → GAME OVER reached'); break;
    }
  }
}

try {
  // ── Setup ──────────────────────────────────────────────────────────────────
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
  console.log('Alice (admin) and Bob joined lobby');

  // ── Game 1 ─────────────────────────────────────────────────────────────────
  console.log('\n=== START GAME 1 ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => { document.querySelectorAll('.game-tile.available')[0].click(); document.getElementById('ready-btn').click(); });
  await wait(1500);
  await js(p1, () => document.getElementById('start-btn').click());
  await wait(3000);
  console.log('Both on quiz page:', p1.url().includes('/quiz') && p2.url().includes('/quiz') ? '✅' : '❌');

  const gotQ1 = await waitFor(p1, 'question', 20000);
  console.log('Q1 appeared:', gotQ1 ? '✅' : '❌ TIMEOUT');

  await playAllQuestions('Game 1');

  await waitFor(p1, 'gameover', 15000);
  const go1 = await js(p1, () => ({
    active: document.getElementById('gameover')?.classList.contains('active'),
    score:  document.getElementById('go-score')?.textContent?.trim(),
  }));
  console.log('\n=== GAME OVER (Game 1) ===');
  console.log('Active:', go1.active ? '✅' : '❌');
  console.log('Score:', go1.score);

  // ── Back to lobby ──────────────────────────────────────────────────────────
  console.log('\n=== BACK TO LOBBY ===');

  // Bob goes first (non-admin — just navigates, no WS message)
  await js(p2, () => document.getElementById('go-lobby-btn')?.click());
  const bobBack = await waitForUrl(p2, `/group/${roomCode}`, 8000);
  console.log('Bob back at lobby URL:', bobBack ? '✅' : '❌');

  // Alice goes second (admin — sends RETURN_TO_LOBBY + navigates)
  await js(p1, () => document.getElementById('go-lobby-btn')?.click());
  const aliceBack = await waitForUrl(p1, `/group/${roomCode}`, 8000);
  console.log('Alice back at lobby URL:', aliceBack ? '✅' : '❌');

  // Give WS time to reconnect and receive LOBBY_UPDATE
  await wait(3000);

  // ── Verify lobby state is reset ────────────────────────────────────────────
  console.log('\n=== LOBBY STATE AFTER RESTART ===');
  const lobby = await js(p1, () => ({
    url:          location.href,
    chips:        [...document.querySelectorAll('.player-chip')].map(c => c.innerText.replace(/\n/g,' ').trim()),
    startBtnDisabled: document.getElementById('start-btn')?.disabled,
    readyBtnText: document.getElementById('ready-btn')?.textContent?.trim(),
    tileVotes:    [...document.querySelectorAll('.tile-votes')].map(v => v.textContent.trim()),
  }));
  console.log('Chips:', JSON.stringify(lobby.chips));
  const crown = lobby.chips.find(c => c.includes('👑'));
  console.log('Admin crown:', crown || 'none');
  console.log('Alice kept admin:', crown?.includes('Alice') ? '✅ PASS' : '❌ FAIL');

  const allNotReady = lobby.chips.every(c => c.includes('🟡') && !c.includes('✅'.repeat(2)));
  console.log('All players not-ready (🟡):', allNotReady ? '✅' : '❌');
  console.log('Start btn disabled:', lobby.startBtnDisabled ? '✅' : '❌ (should be disabled)');
  console.log('Ready btn reset:', lobby.readyBtnText === "✅ I'm Ready" ? '✅' : `❌ (got "${lobby.readyBtnText}")`);
  console.log('No game votes shown:', lobby.tileVotes.length === 0 ? '✅' : `❌ (got ${JSON.stringify(lobby.tileVotes)})`);

  // ── Start Game 2 from clean lobby ──────────────────────────────────────────
  console.log('\n=== START GAME 2 ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => { document.querySelectorAll('.game-tile.available')[0].click(); document.getElementById('ready-btn').click(); });
  await wait(1500);

  const startBtnEnabled = await js(p1, () => !document.getElementById('start-btn')?.disabled);
  console.log('Start btn enabled after ready+vote:', startBtnEnabled ? '✅' : '❌');

  await js(p1, () => document.getElementById('start-btn').click());
  await wait(3000);
  console.log('Both on quiz page (Game 2):', p1.url().includes('/quiz') && p2.url().includes('/quiz') ? '✅' : '❌');

  const gotQ1G2 = await waitFor(p1, 'question', 20000);
  console.log('Game 2 Q1 appeared:', gotQ1G2 ? '✅ PASS' : '❌ TIMEOUT');

} catch(e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
