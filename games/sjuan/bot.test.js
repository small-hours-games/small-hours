import { describe, it, expect } from 'vitest';
import sjuan from './rules.js';
import { chooseSjuanAction } from './bot.js';
import { chooseHoldemAction } from '../texas-holdem/bot.js';
import holdem from '../texas-holdem/rules.js';

describe('Sjuan AI bot', () => {
  it('plays a legal card when one fits a stack', () => {
    const state = sjuan.setup({ players: ['p1', 'bot_1'], config: {} });
    state.hands.bot_1 = [{ id: 'h6', suit: 'h', rank: 6 }, { id: 's2', suit: 's', rank: 2 }];
    state.turn = 'bot_1';
    const action = chooseSjuanAction(state, 'bot_1');
    expect(action).toEqual({ type: 'playCard', cardId: 'h6' });
  });

  it('draws when no card fits', () => {
    const state = sjuan.setup({ players: ['p1', 'bot_1'], config: {} });
    state.hands.bot_1 = [{ id: 's2', suit: 's', rank: 2 }];
    state.turn = 'bot_1';
    const action = chooseSjuanAction(state, 'bot_1');
    expect(action).toEqual({ type: 'draw' });
  });
});

describe('Holdem AI personas', () => {
  it('returns valid actions across bot personas', () => {
    const state = holdem.setup({ players: ['p1', 'bot_1', 'bot_2', 'bot_3', 'bot_4'], config: {} });
    for (const botId of ['bot_1', 'bot_2', 'bot_3', 'bot_4']) {
      state.turn = botId;
      const action = chooseHoldemAction(state, botId);
      expect(action).toBeTruthy();
      expect(['fold', 'check', 'call', 'raise']).toContain(action.type);
    }
  });
});
