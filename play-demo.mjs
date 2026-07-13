// Headless "play" demo: drives number-guess + shithead through the real engine
// and prints exactly what the host scoreboard would render (getScoreboardData).
import { createGame, processAction, getView, checkEnd } from './src/engine/engine.js';
import numberGuess from './src/engine/games/number-guess.js';
import shithead from './src/engine/games/shithead.js';

function getScoreboardData(msg, gameType) {
  const names = msg.playerNames || {};
  const scores = msg.scores || {};
  const ids = Object.keys(scores);
  let entries, roundLabel = null;
  const status = (msg.phase === 'finished') ? 'Klart' : 'Spelar';
  if (gameType === 'shithead') {
    const finishOrder = msg.finishOrder || [];
    const rankedIds = [...finishOrder, ...ids.filter(id => !finishOrder.includes(id))];
    entries = rankedIds.map((id, i) => ({
      id, name: names[id] || id,
      valueText: finishOrder.includes(id) ? 'Plats ' + (i + 1) : 'Spelar',
      rank: i + 1, isOut: finishOrder.includes(id),
    }));
  } else if (gameType === 'number-guess') {
    const sorted = ids.slice().sort((a, b) => scores[b] - scores[a]);
    entries = sorted.map((id, i) => ({
      id, name: names[id] || id, valueText: scores[id] + ' gissningar kvar', rank: i + 1, isOut: false,
    }));
    if (msg.round != null) roundLabel = 'Round ' + (msg.round + 1) + ' / ' + msg.maxRounds;
  } else {
    const sorted = ids.slice().sort((a, b) => scores[b] - scores[a]);
    entries = sorted.map((id, i) => ({
      id, name: names[id] || id, valueText: scores[id] + ' p', rank: i + 1, isOut: false,
    }));
  }
  return { roundLabel, status, entries };
}

function render(score) {
  const meta = [score.roundLabel, score.status].filter(Boolean).join(' · ');
  return (meta ? meta + '\n' : '') +
    score.entries.map(e =>
      `  #${e.rank} ${e.name}` + (e.isOut ? ' [UTE]' : '') + ` — ${e.valueText}`
    ).join('\n');
}

function hostView(game, players, playerNames) {
  return { ...getView(game, players[0]), playerNames };
}

// ---- NUMBER-GUESS ----
console.log('=== NUMBER-GUESS (spelat) ===');
let g = createGame(numberGuess, { players: ['alice', 'bob'], config: { secret: 50, maxRounds: 10 } });
console.log(render(getScoreboardData(hostView(g, ['alice', 'bob'], { alice: 'Alice', bob: 'Bob' }), 'number-guess')));
g = processAction(g, { type: 'guess', playerId: 'alice', number: 25 }).game;
g = processAction(g, { type: 'guess', playerId: 'bob', number: 75 }).game;
console.log('--- efter 1 gissning var ---');
console.log(render(getScoreboardData(hostView(g, ['alice', 'bob'], { alice: 'Alice', bob: 'Bob' }), 'number-guess')));
g = processAction(g, { type: 'guess', playerId: 'bob', number: 50 }).game; // rätt
console.log('--- Bob gissade 50 (rätt) -> slut ---');
console.log(render(getScoreboardData(hostView(g, ['alice', 'bob'], { alice: 'Alice', bob: 'Bob' }), 'number-guess')));

// ---- SHITHEAD (spela till slut) ----
console.log('\n=== SHITHEAD (spelat till slut) ===');
let sh = createGame(shithead, { players: ['alice', 'bob', 'carol'] });
for (const p of ['alice', 'bob', 'carol']) sh = processAction(sh, { type: 'confirmSwap', playerId: p }).game;
function canPlay(rank, pile) {
  if (!pile.length) return true;
  if (rank === 2 || rank === 10) return true;
  const t = pile[pile.length - 1];
  if (t.rank === 2) return true;
  if (t.rank === 7) return rank <= 7;
  return rank >= t.rank;
}
let turns = 0;
while (!checkEnd(sh) && turns < 800) {
  const s = sh.state, cur = s.players[s.currentPlayerIndex];
  const src = (s.hands[cur] || []).length ? s.hands[cur]
    : (s.faceUp[cur] || []).length ? s.faceUp[cur]
    : (s.faceDown[cur] || []).length ? s.faceDown[cur] : [];
  const playable = src.filter(c => canPlay(c.rank, s.pile));
  if (playable.length) {
    const c = playable[0];
    sh = (s.faceDown[cur] || []).some(x => x.id === c.id)
      ? processAction(sh, { type: 'playFaceDown', playerId: cur, cardId: c.id }).game
      : processAction(sh, { type: 'playCards', playerId: cur, cardIds: [c.id] }).game;
  } else {
    sh = processAction(sh, { type: 'pickUpPile', playerId: cur }).game;
  }
  turns++;
}
console.log(render(getScoreboardData(hostView(sh, ['alice', 'bob', 'carol'], { alice: 'Alice', bob: 'Bob', carol: 'Carol' }), 'shithead')));
const over = checkEnd(sh);
console.log('Vinnare:', over ? over.winner : 'ingen', '| färdig:', !checkEnd(sh) === false);
