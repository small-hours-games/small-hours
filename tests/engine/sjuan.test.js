import { describe, it, expect } from 'vitest';
import sjuan from '../../src/engine/games/sjuan.js';
import { createTestGame, act, viewFor, isOver } from './game-harness.js';

describe('Sjuan - setup', () => {
  it('initializes with play phase and correct structure', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    expect(game.state.phase).toBe('play');
    expect(game.state.players).toEqual(['p1', 'p2']);
    expect(game.state.turn).toBe('p1');
    expect(game.state.stacks).toEqual({ h: 7, d: 7, c: 7, s: 7 });
    expect(game.state.winner).toBeNull();
  });

  it('deals 7 cards to each of 2 players leaving 38 in deck', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    expect(game.state.hands.p1).toHaveLength(7);
    expect(game.state.hands.p2).toHaveLength(7);
    expect(game.state.deck).toHaveLength(38);
  });

  it('deals to 4 players leaving 24 in deck', () => {
    const game = createTestGame(sjuan, ['a', 'b', 'c', 'd']);
    expect(game.state.hands.a).toHaveLength(7);
    expect(game.state.deck).toHaveLength(52 - 28);
  });

  it('endIf returns null at start', () => {
    expect(isOver(createTestGame(sjuan, ['p1', 'p2']))).toBeNull();
  });
});

describe('Sjuan - playCard action', () => {
  it('rejects play when not your turn', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const { events } = act(game, 'playCard', 'p2', { cardId: '6h' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Not your turn');
  });

  it('rejects unknown card id', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const { events } = act(game, 'playCard', 'p1', { cardId: 'notacard' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Card not in hand');
  });

  it('rejects card not adjacent to stack top', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    // rank 5 is not adjacent to stack top of 7 (only 6 and 8 are)
    const g = { ...game, state: { ...game.state, hands: { ...game.state.hands, p1: [{ id: '5h', suit: 'h', rank: 5 }] } } };
    const { events } = act(g, 'playCard', 'p1', { cardId: '5h' });
    expect(events[0].type).toBe('error');
  });

  it('accepts rank-6 card (stack-top - 1) and updates stack', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, hands: { ...game.state.hands, p1: [{ id: '6h', suit: 'h', rank: 6 }, { id: 'extra', suit: 'd', rank: 8 }] } } };
    const { game: g2, events } = act(g, 'playCard', 'p1', { cardId: '6h' });
    expect(events[0].type).toBe('played');
    expect(g2.state.stacks.h).toBe(6);
    expect(g2.state.hands.p1).toHaveLength(1);
    expect(g2.state.turn).toBe('p2');
  });

  it('accepts rank-8 card (stack-top + 1) and updates stack', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, hands: { ...game.state.hands, p1: [{ id: '8h', suit: 'h', rank: 8 }, { id: 'extra', suit: 'd', rank: 6 }] } } };
    const { game: g2, events } = act(g, 'playCard', 'p1', { cardId: '8h' });
    expect(g2.state.stacks.h).toBe(8);
    expect(events[0].type).toBe('played');
  });

  it('passes turn after valid play', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, hands: { ...game.state.hands, p1: [{ id: '6h', suit: 'h', rank: 6 }, { id: 'extra', suit: 'd', rank: 8 }] } } };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: '6h' });
    expect(g2.state.turn).toBe('p2');
    expect(g2.state.round).toBe(game.state.round + 1);
  });

  it('finishes game when player empties hand', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, hands: { ...game.state.hands, p1: [{ id: '6h', suit: 'h', rank: 6 }] } } };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: '6h' });
    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBe('p1');
    const end = isOver(g2);
    expect(end).toMatchObject({ winner: 'p1', scores: { p1: 1 } });
  });

  it('wraps turn around from last player back to first', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        turn: 'p2',
        hands: { ...game.state.hands, p2: [{ id: '6h', suit: 'h', rank: 6 }, { id: 'extra', suit: 'd', rank: 8 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p2', { cardId: '6h' });
    expect(g2.state.turn).toBe('p1');
  });
});

describe('Sjuan - draw action', () => {
  it('draws one card and passes turn', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const handBefore = game.state.hands.p1.length;
    const deckBefore = game.state.deck.length;
    const { game: g2, events } = act(game, 'draw', 'p1', {});
    expect(g2.state.hands.p1).toHaveLength(handBefore + 1);
    expect(g2.state.deck).toHaveLength(deckBefore - 1);
    expect(g2.state.turn).toBe('p2');
    expect(events[0].type).toBe('drew');
  });

  it('rejects draw when not your turn', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const { events } = act(game, 'draw', 'p2', {});
    expect(events[0].type).toBe('error');
  });

  it('passes turn when deck empty and player can still play', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    // rank 6 is adjacent to stack top 7
    const g = {
      ...game, state: {
        ...game.state,
        deck: [],
        hands: { p1: [{ id: '6h', suit: 'h', rank: 6 }], p2: [{ id: '8d', suit: 'd', rank: 8 }] },
      },
    };
    const { game: g2, events } = act(g, 'draw', 'p1', {});
    expect(g2.state.turn).toBe('p2');
    expect(events[0].type).toBe('passed');
  });

  it('finishes stuck when deck empty and current player cannot play', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    // rank 3 is not adjacent to stack top 7
    const g = {
      ...game, state: {
        ...game.state,
        deck: [],
        stacks: { h: 7, d: 7, c: 7, s: 7 },
        hands: { p1: [{ id: '3h', suit: 'h', rank: 3 }], p2: [{ id: '3d', suit: 'd', rank: 3 }] },
      },
    };
    const { game: g2, events } = act(g, 'draw', 'p1', {});
    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBeTruthy();
    expect(events[0].type).toBe('stuck');
    expect(isOver(g2)).toBeTruthy();
  });
});

describe('Sjuan - skip action', () => {
  it('advances turn to next player regardless of who skips', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const { game: g2, events } = act(game, 'skip', 'p1', {});
    expect(g2.state.turn).toBe('p2');
    expect(events[0].type).toBe('skipped');
  });
});

describe('Sjuan - view', () => {
  it('shows own hand, stacks, deck count and turn info', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.phase).toBe('play');
    expect(view.myHand).toHaveLength(7);
    expect(view.myHandCount).toBe(7);
    expect(view.stacks).toEqual({ h: 7, d: 7, c: 7, s: 7 });
    expect(view.turn).toBe('p1');
    expect(view.isMyTurn).toBe(true);
    expect(view.deckCount).toBe(38);
    expect(view.handCounts).toEqual({ p1: 7, p2: 7 });
  });

  it('isMyTurn is false for non-active player', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    expect(viewFor(game, 'p2').isMyTurn).toBe(false);
  });

  it('exposes card suit and rank in myHand entries', () => {
    const game = createTestGame(sjuan, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    for (const card of view.myHand) {
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('suit');
      expect(card).toHaveProperty('rank');
      expect(card).toHaveProperty('label');
    }
  });
});
