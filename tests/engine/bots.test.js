import { describe, it, expect } from 'vitest';
import { createGame, processAction, checkEnd } from '../../src/engine/engine.js';
import ginRummy from '../../games/gin-rummy/rules.js';
import shithead from '../../games/shithead/rules.js';
import { nextBotAction, hasBot } from '../../src/engine/bots/index.js';

// Drive a game with bots only. Gin's scoring phase waits for a person to press
// "next hand", so the test plays that part.
function playOut(gameType, definition, players, config = {}, maxSteps = 20000) {
  let game = createGame(definition, { players, config });
  for (let step = 0; step < maxSteps; step++) {
    const end = checkEnd(game);
    if (end) return { game, end, step };
    let action = nextBotAction(gameType, game.state, players);
    if (!action && gameType === 'gin-rummy' && game.state.phase === 'scoring') {
      action = { type: 'nextHand', playerId: players[0] };
    }
    if (!action) throw new Error(`no move in phase ${game.state.phase}`);
    const before = game.state;
    const result = processAction(game, action);
    const error = result.events.find(e => e.type === 'error');
    if (error) throw new Error(`illegal bot move ${JSON.stringify(action)}: ${error.message}`);
    expect(result.game.state).not.toBe(before);
    game = result.game;
  }
  throw new Error('game did not finish');
}

describe('AI opponents', () => {
  it('knows which games have bots', () => {
    expect(hasBot('gin-rummy')).toBe(true);
    expect(hasBot('shithead')).toBe(true);
    expect(hasBot('quiz')).toBe(false);
  });

  it('plays legal Gin Rummy moves until someone reaches the target', () => {
    for (let i = 0; i < 5; i++) {
      const { end } = playOut('gin-rummy', ginRummy, ['bot_1', 'bot_2'], { targetScore: 60 });
      expect(['bot_1', 'bot_2']).toContain(end.winner);
    }
  });

  it('plays legal Palace moves with 2 to 5 players until one is left', () => {
    for (const n of [2, 3, 4, 5]) {
      const players = Array.from({ length: n }, (_, i) => `bot_${i + 1}`);
      const { end } = playOut('shithead', shithead, players);
      expect(players).toContain(end.loser);
      expect(Object.keys(end.scores)).toHaveLength(n);
    }
  });

  it('waits for the human: no bot move on a person\'s turn', () => {
    const game = createGame(ginRummy, { players: ['human', 'bot_1'], config: {} });
    const human = game.state.players[game.state.currentPlayerIndex] === 'human';
    const action = nextBotAction('gin-rummy', game.state, ['bot_1']);
    expect(action === null).toBe(human);
  });

  it('Palace bots finish the swap phase on their own and keep strong cards face-up', () => {
    let game = createGame(shithead, { players: ['human', 'bot_1'], config: {} });
    for (let i = 0; i < 10; i++) {
      const action = nextBotAction('shithead', game.state, ['bot_1']);
      if (!action) break;
      game = processAction(game, action).game;
    }
    expect(game.state.swapConfirmed.bot_1).toBe(true);
    const val = r => (r === 2 || r === 10 ? 20 : r);
    const minUp = Math.min(...game.state.faceUp.bot_1.map(c => val(c.rank)));
    const maxHand = Math.max(...game.state.hands.bot_1.map(c => val(c.rank)));
    expect(minUp).toBeGreaterThanOrEqual(maxHand);
  });
});
