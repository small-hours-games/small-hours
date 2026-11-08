import { describe, it, expect } from 'vitest';
import { createTestGame, viewFor } from '../engine/game-harness.js';
import { getHostView, isPrivateViewKey } from '../../src/transport/host-view.js';
import ginRummy from '../../games/gin-rummy/index.js';
import shithead from '../../games/shithead/index.js';
import uno from '../../games/uno/index.js';
import quiz from '../../games/quiz/index.js';

function expectNoPrivateKeys(view, game) {
  const leaked = Object.keys(view).filter(key => isPrivateViewKey(key, game.definition.privateKeys));
  expect(leaked).toEqual([]);
}

describe('getHostView', () => {
  it('strips gin rummy hand, melds and deadwood but keeps the shared table', () => {
    const game = createTestGame(ginRummy, ['p1', 'p2']);
    const host = getHostView(game, 'p1');
    expectNoPrivateKeys(host, game);
    expect(host.myMelds).toBeUndefined();
    expect(host.myDeadwoodValue).toBeUndefined();
    expect(host.lastDrawnCardId).toBeUndefined();
    expect(host.discardTop).toEqual(viewFor(game, 'p1').discardTop);
    expect(host.stockCount).toBe(viewFor(game, 'p1').stockCount);
  });

  it('strips hands from shithead and uno', () => {
    for (const def of [shithead, uno]) {
      const game = createTestGame(def, ['p1', 'p2', 'p3']);
      const host = getHostView(game, 'p1');
      expectNoPrivateKeys(host, game);
      expect(host.myHand).toBeUndefined();
      expect(host.phase).toBe(game.state.phase);
    }
  });

  it("strips the first player's quiz answer state", () => {
    const game = createTestGame(quiz, ['p1', 'p2'], {
      questions: [{ id: 'q1', question: 'Q?', correct_answer: 'A', incorrect_answers: ['B', 'C', 'D'] }],
    });
    const host = getHostView({ ...game, state: { ...game.state, phase: 'question' } }, 'p1');
    expectNoPrivateKeys(host, game);
    expect(host.question).toBeDefined();
  });

  it('prefers a game-defined hostView and handles a room with no players', () => {
    const game = createTestGame(uno, ['p1', 'p2', 'p3']);
    const custom = { ...game, definition: { ...game.definition, hostView: s => ({ phase: s.phase, custom: true }) } };
    expect(getHostView(custom, 'p1')).toEqual({ phase: game.state.phase, custom: true });
    expect(getHostView(game, undefined)).toEqual({ phase: game.state.phase });
  });
});
