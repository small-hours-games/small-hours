import { describe, it, expect } from 'vitest';
import { validateCardSpec, buildCardGameDefinition } from '../../src/cards/runtime.js';
import { createTestGame, act, viewFor, isOver } from './game-harness.js';

describe('Declarative Card Game Runtime', () => {
  it('validates card game specs and rejects invalid ids', () => {
    expect(validateCardSpec({ id: 'AB', label: 'Bad' }).ok).toBe(false);
    const valid = validateCardSpec({
      id: 'crazy-eights-test',
      label: 'Crazy Eights',
      deal: { hand: 5 },
      rules: { playMatch: 'suitOrRank', wildRanks: [8], specialEffects: { '2': 'nextDraw2' } },
    });
    expect(valid.ok).toBe(true);
    expect(valid.spec.rules.wildRanks).toEqual([8]);
  });

  it('deals private hands, enforces suit/rank rules, wild suits, and wins', () => {
    const { spec } = validateCardSpec({
      id: 'crazy-eights-test',
      label: 'Crazy Eights',
      min: 2,
      max: 4,
      aiMax: 2,
      deal: { hand: 5, flipStarter: true },
      rules: { playMatch: 'suitOrRank', wildRanks: [8], specialEffects: { '1': 'skip' } },
    });
    const def = buildCardGameDefinition(spec);
    let game = createTestGame(def, ['p1', 'p2']);

    // Private view isolation
    const v1 = viewFor(game, 'p1');
    const v2 = viewFor(game, 'p2');
    expect(v1.myHand).toHaveLength(5);
    expect(v2.myHand).toHaveLength(5);
    expect(v1.isMyTurn).toBe(true);
    expect(v2.isMyTurn).toBe(false);

    // Force a deterministic wild 8 in p1's hand and win condition
    const wild8 = { id: '8h', suit: 'h', rank: 8 };
    game = { ...game, state: { ...game.state, hands: { p1: [wild8], p2: v2.myHand } } };
    const res = act(game, 'playCards', 'p1', { cardIds: ['8h'], chosenSuit: 's' });
    expect(res.events[0].type).toBe('play');
    expect(res.game.state.activeSuit).toBe('s');
    const end = isOver(res.game);
    expect(end).not.toBeNull();
    expect(end.winner).toBe('p1');
  });

  it('draws from deck when requested and exposes legal AI moves', () => {
    const { spec } = validateCardSpec({
      id: 'draw-test',
      label: 'Draw Test',
      aiMax: 2,
      deal: { hand: 3 },
      rules: { playMatch: 'any' },
    });
    const def = buildCardGameDefinition(spec);
    let game = createTestGame(def, ['p1', 'bot_1']);
    const move = def.ai.chooseMove(game.state, 'bot_1');
    expect(['playCards', 'drawCard', 'passTurn']).toContain(move.type);

    game = act(game, 'drawCard', 'p1').game;
    expect(viewFor(game, 'p1').myHand).toHaveLength(4);
    expect(viewFor(game, 'bot_1').isMyTurn).toBe(true);
  });
});
