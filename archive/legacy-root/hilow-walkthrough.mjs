// Hilow walkthrough: plays a real game through the engine and prints every round
// so you can see exactly how Högt/Lågt plays.
import { createGame, processAction, getView, checkEnd } from './src/engine/engine.js';
import hilow from './src/engine/games/hilow.js';

const SUIT = { h: '♥', d: '♦', c: '♣', s: '♠' };
const label = c => (c ? `${c.rank}${SUIT[c.suit]}` : '—');

const players = ['Anna', 'Beppe', 'Cissi'];
let g = createGame(hilow, { players, config: { target: 3 } });

console.log('🎴 HÖGT/LÅGT — först till ' + g.state.target + ' poäng vinner\n');
console.log('Spelare: ' + players.join(', ') + '\n');

let round = 0;
while (!checkEnd(g) && round < 200) {
  round++;
  const s = g.state;
  if (s.phase !== 'guessing') break;
  const active = s.activePlayer;
  console.log(`\n=== ROND ${round} ===`);
  console.log(`🔓 Aktiv (drar): ${active}`);
  console.log(`🃏 Nuvarande kort: ${label(s.current)}`);

  // Each non-active player guesses.
  const others = players.filter(p => p !== active);
  const guesses = {};
  for (const p of others) {
    // Simple AI: guess higher if current rank is low, lower if high.
    const dir = s.current.rank < 8 ? 'higher' : 'lower';
    g = processAction(g, { type: 'guess', playerId: p, direction: dir }).game;
    guesses[p] = dir;
  }
  console.log('🤔 Gissningar: ' + others.map(p => `${p}→${guesses[p] === 'higher' ? 'HÖGRE' : 'LÄGRE'}`).join(', '));

  // Resolve the round (reveals next card, scores, rotates active).
  g = processAction(g, { type: 'resolveNow' }).game;
  const res = g.state.lastResult;
  if (res) {
    console.log(`🃏 Nästa kort: ${label(res.next)} → ${res.higher ? 'HÖGRE' : 'LÄGRE'} än ${label(res.current)}`);
    console.log('✅ Rätt: ' + (res.winners.length ? res.winners.join(', ') : '(ingen)'));
  }
  const sc = players.map(p => `${p}:${g.state.scores[p]}`).join('  ');
  console.log('📊 Ställning: ' + sc);
}

const end = checkEnd(g);
console.log('\n' + (end ? `🏆 VINNARE: ${end.winner} (${g.state.scores[end.winner]} p)` : 'Spelet avslutades inte inom gränsen'));
