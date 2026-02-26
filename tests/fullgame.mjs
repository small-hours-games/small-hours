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

  // ── Start ──────────────────────────────────────────────────────────────────
  console.log('\n=== START GAME ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => { document.querySelectorAll('.game-tile.available')[0].click(); document.getElementById('ready-btn').click(); });
  await wait(1500);
  await js(p1, () => document.getElementById('start-btn').click());
  await wait(3000);
  console.log('Both on quiz page:', p1.url().includes('/quiz') && p2.url().includes('/quiz') ? '✅' : '❌');

  // ── Wait for Q1 (categories chosen in lobby, no vote on quiz page) ────────
  console.log('\n=== WAITING FOR Q1 ===');
  const gotQ1 = await waitFor(p1, 'question', 20000);
  console.log('Q1 appeared:', gotQ1 ? '✅' : '❌ TIMEOUT');

  // ── Play 10 questions ──────────────────────────────────────────────────────
  console.log('\n=== QUESTIONS ===');
  for (let i = 0; i < 12; i++) {
    const onQ = await waitFor(p1, 'question', 15000);
    if (!onQ) { console.log(`Q${i+1}: timed out waiting for question`); break; }

    const q = await js(p1, () => document.getElementById('pq-text')?.textContent?.trim() || '?');
    console.log(`Q${i+1}: "${q.slice(0,55)}..."`);

    // Both answer simultaneously
    await Promise.all([
      js(p1, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[0].click(); }),
      js(p2, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[1].click(); }),
    ]);

    // Wait for reveal
    await waitFor(p1, 'reveal', 12000);
    const rv = await js(p1, () => ({
      verdict: document.getElementById('result-title')?.textContent?.trim(),
      pts:     document.getElementById('result-points')?.textContent?.trim(),
      total:   document.getElementById('result-score')?.textContent?.trim(),
    }));
    console.log(`   → ${rv.verdict}  ${rv.pts || ''}  total: ${rv.total}`);

    // Check for game over
    if (await js(p1, () => document.getElementById('gameover')?.classList.contains('active'))) {
      console.log('   → GAME OVER after this reveal'); break;
    }
  }

  // ── Game over ──────────────────────────────────────────────────────────────
  console.log('\n=== GAME OVER SCREEN ===');
  await waitFor(p1, 'gameover', 15000);
  const goA = await js(p1, () => ({
    active:      document.getElementById('gameover')?.classList.contains('active'),
    rank:        document.getElementById('go-rank')?.textContent?.trim(),
    score:       document.getElementById('go-score')?.textContent?.trim(),
    lobbyBtn:    !!document.getElementById('go-lobby-btn'),
    continueBtn: document.getElementById('go-continue-btn')?.style.display !== 'none',
  }));
  const goB = await js(p2, () => ({
    active:      document.getElementById('gameover')?.classList.contains('active'),
    rank:        document.getElementById('go-rank')?.textContent?.trim(),
    score:       document.getElementById('go-score')?.textContent?.trim(),
    lobbyBtn:    !!document.getElementById('go-lobby-btn'),
    continueBtn: document.getElementById('go-continue-btn')?.style.display !== 'none',
  }));
  console.log('Alice:', JSON.stringify(goA));
  console.log('Bob:  ', JSON.stringify(goB));

  // ── Back to lobby ──────────────────────────────────────────────────────────
  console.log('\n=== BACK TO LOBBY ===');
  await js(p2, () => document.getElementById('go-lobby-btn')?.click());
  await wait(2500);
  await js(p1, () => document.getElementById('go-lobby-btn')?.click());
  await wait(4000);

  const exp = `${BASE}/group/${roomCode}`;
  console.log('Alice URL:', p1.url() === exp ? '✅' : `❌ ${p1.url()}`);
  console.log('Bob URL:  ', p2.url() === exp ? '✅' : `❌ ${p2.url()}`);
  const chips = await js(p1, () => [...document.querySelectorAll('.player-chip')].map(c=>c.innerText.replace(/\n/g,' ').trim()));
  console.log('Lobby chips:', JSON.stringify(chips));
  const crown = chips.find(c=>c.includes('👑'));
  console.log('Admin crown:', crown || 'none');
  console.log('Alice kept admin:', crown?.includes('Alice') ? '✅ PASS' : '❌ FAIL');

} catch(e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
