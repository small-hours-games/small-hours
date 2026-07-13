// Multiplayer Hilow over the live WebSocket server — "play together".
// Host is also a player, so it must guess too. We drive host + p1 + p2.
// Player view (p1) is the source of truth for game state; we track per-round
// guesses locally (reset whenever the visible card changes) so nobody double-guesses.
import WebSocket from 'ws';

const BASE = 'http://localhost:3001';
const WS = 'ws://localhost:3001';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const res = await fetch(BASE + '/api/rooms', { method: 'POST' });
const code = (await res.json()).code;
console.log('🏠 Rum skapat: ' + code + '  (host: ' + BASE + '/host/' + code + ')\n');

const host = new WebSocket(WS + '/ws/host/' + code);
const p1 = new WebSocket(WS + '/ws/player/' + code);
const p2 = new WebSocket(WS + '/ws/player/' + code);

const views = { host: null, p1: null, p2: null };
let hostGift = null;   // capture giftUrl from any host GAME_STATE that has it
function onMsg(ws, key) {
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.type === 'GAME_STATE') {
      views[key] = m;
      if (key === 'host' && m.giftUrl) hostGift = m.giftUrl;
    }
  });
}
onMsg(host, 'host'); onMsg(p1, 'p1'); onMsg(p2, 'p2');

host.on('open', () => host.send(JSON.stringify({ type: 'JOIN_LOBBY', username: 'VÄRD' })));
p1.on('open', () => p1.send(JSON.stringify({ type: 'JOIN_LOBBY', username: 'Anna' })));
p2.on('open', () => p2.send(JSON.stringify({ type: 'JOIN_LOBBY', username: 'Beppe' })));

await sleep(400);
console.log('👥 Spelare joinade: VÄRD (host), Anna, Beppe\n');

host.send(JSON.stringify({ type: 'START_MINI_GAME', gameType: 'hilow', config: { target: 3 } }));
await sleep(500);
console.log('🎴 HÖGT/LÅGT startat!\n');

const SUIT = { h: '♥', d: '♦', c: '♣', s: '♠' };
const lbl = c => (c ? c.rank + SUIT[c.suit] : '—');

let printedCardId = null;
let round = 0;
const guessedThisRound = new Set();   // playerIds who already guessed current card

while (round < 100) {
  await sleep(120);
  const v = views.p1;          // full player view = source of truth
  const hv = views.host;
  if (!v) continue;
  if (v.phase === 'finished') break;
  if (!v.current) continue;

  // New card -> reset per-round guess tracking.
  if (v.current.id !== printedCardId) {
    printedCardId = v.current.id;
    guessedThisRound.clear();
    const an = v.playerNames?.[v.activePlayer] || v.activePlayer;
    console.log('🔓 Aktiv: ' + an + '   Kort: ' + lbl(v.current));
  }

  // Each socket guesses if it's not the active player and hasn't guessed this card.
  const vardId = Object.keys(v.playerNames || {}).find(id => v.playerNames[id] === 'VÄRD');
  const sockets = [
    { ws: host, key: 'host', isActive: vardId ? v.activePlayer === vardId : false },
    { ws: p1, key: 'p1', isActive: !!views.p1?.isActive },
    { ws: p2, key: 'p2', isActive: !!views.p2?.isActive },
  ];
  for (const s of sockets) {
    if (s.isActive) continue;
    if (guessedThisRound.has(s.key)) continue;
    const dir = v.current.rank < 8 ? 'higher' : 'lower';
    s.ws.send(JSON.stringify({ type: 'GAME_ACTION', action: { type: 'guess', direction: dir } }));
    guessedThisRound.add(s.key);
  }

  if (v.lastResult) {
    console.log('🃏 Nästa: ' + lbl(v.lastResult.next) + ' → ' + (v.lastResult.higher ? 'HÖGRE' : 'LÄGRE') +
      '   Rätt: ' + (v.lastResult.winners.length ? v.lastResult.winners.map(w => v.playerNames?.[w] || w).join(', ') : '(ingen)'));
    const sc = Object.entries(v.scores).map(([id, s]) => (v.playerNames?.[id] || id) + ':' + s).join('  ');
    console.log('📊 ' + sc);
    round++;
  }
}

await sleep(300);
const hv = views.host;
if (hv && hv.phase === 'finished') {
  const gift = hv.giftUrl || hostGift;
  console.log('[host finished] winner=' + (hv.playerNames?.[hv.winner] || hv.winner) +
    ' giftUrl=' + (gift || '(saknas)') +
    ' giftToken=' + (hv.giftToken || '(saknas)') +
    ' gameLabel=' + (hv.gameLabel || '(saknas)'));
  console.log('\n🏆 VINNARE: ' + (hv.playerNames?.[hv.winner] || hv.winner) +
    (gift ? '\n🎁 Present att ge till en kompis: ' + gift : '\n(ingen present-länk i denna vy)'));
}
host.close(); p1.close(); p2.close();
process.exit(0);
