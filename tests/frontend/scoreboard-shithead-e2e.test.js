import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import shithead from '../../src/engine/games/shithead.js';

function getScoreboardData(msg) {
  const names = msg.playerNames || {};
  const scores = msg.scores || {};
  const ids = Object.keys(scores);
  const finishOrder = msg.finishOrder || [];
  const rankedIds = [...finishOrder, ...ids.filter(id => !finishOrder.includes(id))];
  const entries = rankedIds.map((id, i) => ({
    id, name: names[id] || id,
    valueText: finishOrder.includes(id) ? 'Plats ' + (i + 1) : 'Spelar',
    rank: i + 1, isOut: finishOrder.includes(id),
  }));
  const status = (msg.phase === 'finished') ? 'Klart' : 'Spelar';
  return { status, entries };
}

function canPlayOnPile(cardRank, pile) {
  if (pile.length === 0) return true;
  if (cardRank === 2) return true;
  if (cardRank === 10) return true;
  const top = pile[pile.length - 1];
  if (top.rank === 2) return true;
  if (top.rank === 7) return cardRank <= 7;
  return cardRank >= top.rank;
}

const names = { alice: 'Alice', bob: 'Bob', carol: 'Carol' };

describe('shithead scoreboard end-to-end (real engine, real finishOrder)', () => {
  it('renders placement + UTE badge as players go out', () => {
    let g = createGame(shithead, { players: ['alice', 'bob', 'carol'] });
    for (const p of ['alice', 'bob', 'carol']) {
      g = processAction(g, { type: 'confirmSwap', playerId: p }).game;
    }

    let turns = 0;
    while (!checkEnd(g) && turns < 800) {
      const state = g.state;
      const current = state.players[state.currentPlayerIndex];
      const src = (state.hands[current] || []).length ? state.hands[current]
        : (state.faceUp[current] || []).length ? state.faceUp[current]
        : (state.faceDown[current] || []).length ? state.faceDown[current] : [];
      const playable = src.filter(c => canPlayOnPile(c.rank, state.pile));
      if (playable.length) {
        const card = playable[0];
        const isFaceDown = (state.faceDown[current] || []).some(c => c.id === card.id);
        g = isFaceDown
          ? processAction(g, { type: 'playFaceDown', playerId: current, cardId: card.id }).game
          : processAction(g, { type: 'playCards', playerId: current, cardIds: [card.id] }).game;
      } else {
        g = processAction(g, { type: 'pickUpPile', playerId: current }).game;
      }
      turns++;
    }

    const over = checkEnd(g);
    expect(over).not.toBeNull();

    const view = getView(g, 'alice');
    const msg = { ...view, playerNames: names };
    const { entries, status } = getScoreboardData(msg);

    expect(msg.finishOrder.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe(msg.finishOrder[0]);
    expect(entries[0].rank).toBe(1);
    expect(entries[0].isOut).toBe(true);
    expect(entries[0].valueText).toBe('Plats 1');
    expect(entries.filter(e => e.isOut).length).toBe(msg.finishOrder.length);
    expect(status).toBe('Klart');
  });
});
