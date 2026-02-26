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

// Play N questions, return final score seen by p1
async function playQuestions(count, label) {
  console.log(`\n=== QUESTIONS (${label}) ===`);
  let finalScore = null;
  for (let i = 0; i < count + 2; i++) {
    const onQ = await waitFor(p1, 'question', 15000);
    if (!onQ) { console.log(`  Q${i+1}: timed out waiting for question`); break; }

    const q = await js(p1, () => document.getElementById('pq-text')?.textContent?.trim() || '?');
    console.log(`  Q${i+1}: "${q.slice(0, 55)}..."`);

    await Promise.all([
      js(p1, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[0].click(); }),
      js(p2, () => { const b=document.querySelectorAll('.ans-btn'); if(b.length) b[1].click(); }),
    ]);

    await waitFor(p1, 'reveal', 12000);
    const rv = await js(p1, () => ({
      verdict: document.getElementById('result-title')?.textContent?.trim(),
      pts:     document.getElementById('result-points')?.textContent?.trim(),
      total:   document.getElementById('result-score')?.textContent?.trim(),
    }));
    console.log(`     → ${rv.verdict}  ${rv.pts || ''}  total: ${rv.total}`);
    finalScore = rv.total;

    if (await js(p1, () => document.getElementById('gameover')?.classList.contains('active'))) {
      console.log('     → GAME OVER reached'); break;
    }
  }
  return finalScore;
}

// Parse "1,234 pts" → 1234
function parseScore(str) {
  return parseInt((str || '0').replace(/[^0-9]/g, ''), 10) || 0;
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

  // ── Start game ─────────────────────────────────────────────────────────────
  console.log('\n=== START GAME ===');
  await js(p2, () => document.getElementById('ready-btn').click());
  await js(p1, () => { document.querySelectorAll('.game-tile.available')[0].click(); document.getElementById('ready-btn').click(); });
  await wait(1500);
  await js(p1, () => document.getElementById('start-btn').click());
  await wait(3000);
  console.log('Both on quiz page:', p1.url().includes('/quiz') && p2.url().includes('/quiz') ? '✅' : '❌');

  // ── Round 1: play all 10 questions ─────────────────────────────────────────
  const gotQ1 = await waitFor(p1, 'question', 20000);
  console.log('Q1 appeared:', gotQ1 ? '✅' : '❌ TIMEOUT');

  await playQuestions(10, 'Round 1');

  // ── Game over — Round 1 ────────────────────────────────────────────────────
  console.log('\n=== GAME OVER (Round 1) ===');
  await waitFor(p1, 'gameover', 15000);
  const go1A = await js(p1, () => ({
    active:      document.getElementById('gameover')?.classList.contains('active'),
    rank:        document.getElementById('go-rank')?.textContent?.trim(),
    score:       document.getElementById('go-score')?.textContent?.trim(),
    continueBtn: document.getElementById('go-continue-btn')?.style.display !== 'none',
  }));
  const go1B = await js(p2, () => ({
    active:      document.getElementById('gameover')?.classList.contains('active'),
    continueBtn: document.getElementById('go-continue-btn')?.style.display !== 'none',
  }));
  console.log('Alice R1:', JSON.stringify(go1A));
  console.log('Bob R1:  ', JSON.stringify(go1B));
  console.log('Alice has Continue btn:', go1A.continueBtn ? '✅' : '❌ FAIL');
  console.log('Bob has NO Continue btn:', !go1B.continueBtn ? '✅' : '❌ FAIL');

  const r1Score = parseScore(go1A.score);
  console.log('Round 1 score:', r1Score);

  // ── Continue to Round 2 ────────────────────────────────────────────────────
  console.log('\n=== CONTINUE GAME ===');
  await js(p1, () => document.getElementById('go-continue-btn').click());
  await wait(3000);
  console.log('Both still on quiz page:', p1.url().includes('/quiz') && p2.url().includes('/quiz') ? '✅' : '❌');

  const gotQ1R2 = await waitFor(p1, 'question', 20000);
  console.log('Round 2 Q1 appeared:', gotQ1R2 ? '✅' : '❌ TIMEOUT');

  // ── Round 2: play all 10 questions (loop until game over) ─────────────────
  await playQuestions(12, 'Round 2');

  // ── Game over — Round 2 ────────────────────────────────────────────────────
  console.log('\n=== GAME OVER (Round 2) ===');
  await waitFor(p1, 'gameover', 60000);
  const go2A = await js(p1, () => ({
    active: document.getElementById('gameover')?.classList.contains('active'),
    rank:   document.getElementById('go-rank')?.textContent?.trim(),
    score:  document.getElementById('go-score')?.textContent?.trim(),
  }));
  console.log('Alice R2:', JSON.stringify(go2A));

  const r2Score = parseScore(go2A.score);
  console.log('Round 2 score:', r2Score);
  // r2 >= r1: scores carry over (equal is valid if 0 correct in round 2)
  console.log('Scores not reset (R2 >= R1):', r2Score >= r1Score ? '✅ PASS' : `❌ FAIL (${r1Score} → ${r2Score})`);

  // ── Back to lobby ──────────────────────────────────────────────────────────
  console.log('\n=== BACK TO LOBBY ===');
  await js(p2, () => document.getElementById('go-lobby-btn')?.click());
  await js(p1, () => document.getElementById('go-lobby-btn')?.click());

  const exp = `${BASE}/group/${roomCode}`;
  const aliceBack = await (async () => { const t=Date.now(); while(Date.now()-t<8000){if(p1.url()===exp)return true;await wait(300);} return false; })();
  const bobBack   = await (async () => { const t=Date.now(); while(Date.now()-t<8000){if(p2.url()===exp)return true;await wait(300);} return false; })();
  await wait(2000); // let WS reconnect + LOBBY_UPDATE arrive
  console.log('Alice URL:', aliceBack ? '✅' : `❌ ${p1.url()}`);
  console.log('Bob URL:  ', bobBack   ? '✅' : `❌ ${p2.url()}`);
  const chips = await js(p1, () => [...document.querySelectorAll('.player-chip')].map(c=>c.innerText.replace(/\n/g,' ').trim()));
  const crown = chips.find(c=>c.includes('👑'));
  console.log('Admin crown:', crown || 'none');
  console.log('Alice kept admin:', crown?.includes('Alice') ? '✅ PASS' : '❌ FAIL');

} catch(e) {
  console.error('Error:', e.message);
} finally {
  await browser.close();
}
