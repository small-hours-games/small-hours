import { describe, it, expect } from 'vitest';
import { createTestGame, viewFor } from './game-harness.js';
import quiz from '../../src/engine/games/quiz.js';
import spy from '../../src/engine/games/spy.js';
import shithead from '../../src/engine/games/shithead.js';
import ginRummy from '../../src/engine/games/gin-rummy.js';
import numberGuess from '../../src/engine/games/number-guess.js';

// Guards against regressions in the host scoreboard contract: every game's
// view() must emit a `scores` object keyed by all player IDs, so the host
// scoreboard renders consistently (see .hermes/plans/2026-07-13_fix-scoreboard-all-games.md).
const games = { quiz, spy, shithead, ginRummy, numberGuess };

describe('scoreboard consistency across games', () => {
  for (const [name, def] of Object.entries(games)) {
    it(`${name} view exposes scores keyed by all players`, () => {
      const players = ['alice', 'bob'];
      const game = createTestGame(def, players);
      const view = viewFor(game, 'alice');
      expect(view.scores, `${name} should expose a scores object`).toBeTypeOf('object');
      expect(Object.keys(view.scores).sort()).toEqual([...players].sort());
      for (const p of players) {
        expect(Number.isFinite(view.scores[p]), `${name} score for ${p} should be a finite number`).toBe(true);
      }
    });
  }
});
