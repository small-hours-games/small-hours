import { describe, it, expect } from 'vitest';
import { createTestGame, act, isOver, viewFor } from '../../tests/engine/game-harness.js';
import { manifestProblem } from '../../src/games/registry.js';
import template from './index.js';

describe('the card game template', () => {
  it('is a valid plugin', () => {
    expect(manifestProblem(template, '_template')).toBeNull();
  });

  it('can be played to a winner', () => {
    let game = createTestGame(template, ['a', 'b']);
    // Deterministic deal so empty-deck stalemates cannot flake the test.
    game.state = {
      ...game.state,
      hands: {
        a: [{ id: '1h', suit: 'h', rank: 1 }, { id: '2h', suit: 'h', rank: 2 }],
        b: [{ id: '3h', suit: 'h', rank: 3 }, { id: '4d', suit: 'd', rank: 4 }],
      },
      pile: [{ id: '5h', suit: 'h', rank: 5 }],
      deck: [{ id: '6d', suit: 'd', rank: 6 }],
    };
    for (let guard = 0; guard < 50 && !isOver(game); guard++) {
      const { turn, hands, pile } = game.state;
      const top = pile[pile.length - 1];
      const card = hands[turn].find(c => c.suit === top.suit || c.rank === top.rank);
      game = (card ? act(game, 'play', turn, { cardId: card.id }) : act(game, 'draw', turn)).game;
    }
    expect(isOver(game)?.winner).toBeTruthy();
  });

  it('shows a player only their own hand', () => {
    const game = createTestGame(template, ['a', 'b']);
    expect(viewFor(game, 'a').myHand).toEqual(game.state.hands.a);
    expect(viewFor(game, 'a').hands).toBeUndefined();
  });
});
