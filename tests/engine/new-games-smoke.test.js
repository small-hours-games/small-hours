// Smoke tests for the card games without a UI yet: sjuan, uno.
// Verifies setup produces valid state, legal moves advance it, and the game
// can reach an end (winner) without crashing. Uses a simple bot that always
// picks a legal move (so the game is proven winnable).
import { describe, it, expect } from 'vitest';
import { createGame, processAction, getView, checkEnd } from '../../src/engine/engine.js';
import sjuan from '../../games/sjuan/rules.js';
import uno from '../../games/uno/rules.js';

// Pick a legal action for the current player, or null if stuck.
function chooseAction(definition, game, turn) {
  const s = game.state;
  if (definition === sjuan) {
    const hand = s.hands[turn];
    const card = hand.find(c => s.stacks[c.suit] === c.rank + 1 || s.stacks[c.suit] === c.rank - 1);
    if (card) return { type: 'playCard', playerId: turn, cardId: card.id };
    return { type: 'draw', playerId: turn };
  }
  if (definition === uno) {
    const hand = s.hands[turn];
    const top = s.discard[s.discard.length - 1];
    const card = hand.find(c =>
      c.color === s.currentColor ||
      (c.kind === 'number' && top && top.kind === 'number' && c.value === top.value) ||
      c.kind === 'wild');
    if (card) return { type: 'playCard', playerId: turn, cardId: card.id, chosenColor: card.color || 'r' };
    return { type: 'draw', playerId: turn };
  }
  return null;
}

function playToEnd(definition, players, maxSteps = 5000, attempts = 30) {
  for (let a = 0; a < attempts; a++) {
    let game = createGame(definition, { players, config: {} });
    let steps = 0;
    while (!checkEnd(game) && steps < maxSteps) {
      const turn = game.state.turn;
      const action = chooseAction(definition, game, turn);
      if (!action) break;
      game = processAction(game, action).game;
      steps++;
    }
    if (checkEnd(game)) return { game, steps };
  }
  return { game: null, steps: maxSteps };
}

describe('new games smoke', () => {
  it('sjuan: setup + play to a winner', () => {
    const { game } = playToEnd(sjuan, ['a', 'b']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(end.winner).toBeTruthy();
  });

  it('uno: setup + play to a winner', () => {
    const { game } = playToEnd(uno, ['a', 'b', 'c']);
    const end = checkEnd(game);
    expect(end).toBeTruthy();
    expect(end.winner).toBeTruthy();
  });

});
