import { describe, it, expect } from 'vitest';
import { createTestGame, viewFor } from '../engine/game-harness.js';
import { getHostView, isPrivateViewKey } from '../../src/transport/host-view.js';
import spy from '../../src/engine/games/spy.js';
import ginRummy from '../../src/engine/games/gin-rummy.js';
import shithead from '../../src/engine/games/shithead.js';
import uno from '../../src/engine/games/uno.js';
import quiz from '../../src/engine/games/quiz.js';

function expectNoPrivateKeys(view) {
  const leaked = Object.keys(view).filter(isPrivateViewKey);
  expect(leaked).toEqual([]);
}

describe('getHostView', () => {
  it('never sends the spy word to the TV, whoever is first in the room', () => {
    const game = createTestGame(spy, ['p1', 'p2', 'p3'], { words: ['banana'] });
    const first = game.state.players.find(id => id !== game.state.spy);
    expect(viewFor(game, first).word).toBe('banana');

    const host = getHostView(game, first);
    expect(host.word).toBeUndefined();
    expect(host.isSpy).toBeUndefined();
    expect(JSON.stringify(host)).not.toContain('banana');
    expect(host.phase).toBe(game.state.phase);
  });

  it('strips gin rummy hand, melds and deadwood but keeps the shared table', () => {
    const game = createTestGame(ginRummy, ['p1', 'p2']);
    const host = getHostView(game, 'p1');
    expectNoPrivateKeys(host);
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
      expectNoPrivateKeys(host);
      expect(host.myHand).toBeUndefined();
      expect(host.phase).toBe(game.state.phase);
    }
  });

  it("strips the first player's quiz answer state", () => {
    const game = createTestGame(quiz, ['p1', 'p2'], {
      questions: [{ id: 'q1', question: 'Q?', correct_answer: 'A', incorrect_answers: ['B', 'C', 'D'] }],
    });
    const host = getHostView({ ...game, state: { ...game.state, phase: 'question' } }, 'p1');
    expectNoPrivateKeys(host);
    expect(host.question).toBeDefined();
  });

  it('prefers a game-defined hostView and handles a room with no players', () => {
    const game = createTestGame(spy, ['p1', 'p2', 'p3']);
    const custom = { ...game, definition: { ...game.definition, hostView: s => ({ phase: s.phase, custom: true }) } };
    expect(getHostView(custom, 'p1')).toEqual({ phase: game.state.phase, custom: true });
    expect(getHostView(game, undefined)).toEqual({ phase: game.state.phase });
  });
});
