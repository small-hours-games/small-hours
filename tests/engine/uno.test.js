import { describe, it, expect } from 'vitest';
import uno from '../../src/engine/games/uno.js';
import { createTestGame, act, viewFor, isOver } from './game-harness.js';

describe('Uno - setup', () => {
  it('initializes with play phase and 7-card hands', () => {
    const game = createTestGame(uno, ['p1', 'p2', 'p3']);
    expect(game.state.phase).toBe('play');
    expect(game.state.hands.p1).toHaveLength(7);
    expect(game.state.hands.p2).toHaveLength(7);
    expect(game.state.hands.p3).toHaveLength(7);
    expect(game.state.direction).toBe(1);
    expect(game.state.pendingDraw).toBe(0);
    expect(game.state.turn).toBe('p1');
  });

  it('starts with a number card on the discard pile', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const top = game.state.discard[game.state.discard.length - 1];
    expect(top.kind).toBe('number');
    expect(game.state.currentColor).toBe(top.color);
  });

  it('endIf returns null at start', () => {
    expect(isOver(createTestGame(uno, ['p1', 'p2']))).toBeNull();
  });
});

describe('Uno - playCard action', () => {
  it('rejects play when not your turn', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const { events } = act(game, 'playCard', 'p2', { cardId: 'any' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Not your turn');
  });

  it('rejects card not in hand', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const { events } = act(game, 'playCard', 'p1', { cardId: 'notacard' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Card not in hand');
  });

  it('rejects card that matches neither color nor value', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        discard: [{ id: '5ar', color: 'r', kind: 'number', value: 5 }],
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: '3ag', color: 'g', kind: 'number', value: 3 }] },
      },
    };
    const { events } = act(g, 'playCard', 'p1', { cardId: '3ag' });
    expect(events[0].type).toBe('error');
    expect(events[0].message).toBe('Card does not match');
  });

  it('accepts card matching current color', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        discard: [{ id: '5ar', color: 'r', kind: 'number', value: 5 }],
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: '3ar', color: 'r', kind: 'number', value: 3 }, { id: 'extra', color: 'g', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2, events } = act(g, 'playCard', 'p1', { cardId: '3ar' });
    expect(events[0].type).toBe('played');
    expect(g2.state.discard[g2.state.discard.length - 1].id).toBe('3ar');
    expect(g2.state.turn).toBe('p2');
  });

  it('accepts card matching number value across colors', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        discard: [{ id: '5ar', color: 'r', kind: 'number', value: 5 }],
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: '5ag', color: 'g', kind: 'number', value: 5 }, { id: 'extra', color: 'b', kind: 'number', value: 3 }] },
      },
    };
    const { game: g2, events } = act(g, 'playCard', 'p1', { cardId: '5ag' });
    expect(events[0].type).toBe('played');
    expect(g2.state.currentColor).toBe('g');
  });

  it('accepts wild and switches to chosenColor', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: 'wild1', color: null, kind: 'wild' }, { id: 'extra', color: 'r', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: 'wild1', chosenColor: 'b' });
    expect(g2.state.currentColor).toBe('b');
  });

  it('skip card skips the next player (3 players)', () => {
    const game = createTestGame(uno, ['p1', 'p2', 'p3']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: 'skip1r', color: 'r', kind: 'skip' }, { id: 'extra', color: 'r', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: 'skip1r' });
    expect(g2.state.turn).toBe('p3');
  });

  it('reverse card flips direction', () => {
    const game = createTestGame(uno, ['p1', 'p2', 'p3']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        direction: 1,
        hands: { ...game.state.hands, p1: [{ id: 'reverse1r', color: 'r', kind: 'reverse' }, { id: 'extra', color: 'r', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: 'reverse1r' });
    expect(g2.state.direction).toBe(-1);
  });

  it('draw2 card sets pendingDraw to 2 for next player', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        hands: { ...game.state.hands, p1: [{ id: 'draw21r', color: 'r', kind: 'draw2' }, { id: 'extra', color: 'r', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: 'draw21r' });
    expect(g2.state.pendingDraw).toBe(2);
    expect(g2.state.turn).toBe('p2');
  });

  it('finishes game when player empties hand', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        discard: [{ id: '5ar', color: 'r', kind: 'number', value: 5 }],
        hands: { ...game.state.hands, p1: [{ id: '3ar', color: 'r', kind: 'number', value: 3 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: '3ar' });
    expect(g2.state.phase).toBe('finished');
    expect(g2.state.winner).toBe('p1');
    expect(isOver(g2)).toMatchObject({ winner: 'p1' });
  });

  it('does not finish when player still has cards', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        currentColor: 'r',
        discard: [{ id: '5ar', color: 'r', kind: 'number', value: 5 }],
        hands: { ...game.state.hands, p1: [{ id: '3ar', color: 'r', kind: 'number', value: 3 }, { id: 'extra', color: 'g', kind: 'number', value: 1 }] },
      },
    };
    const { game: g2 } = act(g, 'playCard', 'p1', { cardId: '3ar' });
    expect(g2.state.phase).toBe('play');
    expect(isOver(g2)).toBeNull();
  });
});

describe('Uno - draw action', () => {
  it('draws one card voluntarily and passes turn', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const handBefore = game.state.hands.p1.length;
    const deckBefore = game.state.deck.length;
    const { game: g2, events } = act(game, 'draw', 'p1', {});
    expect(g2.state.hands.p1).toHaveLength(handBefore + 1);
    expect(g2.state.deck).toHaveLength(deckBefore - 1);
    expect(g2.state.turn).toBe('p2');
    expect(events[0].type).toBe('drew');
    expect(events[0].count).toBe(1);
  });

  it('draws pendingDraw cards when forced by a previous draw2', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = { ...game, state: { ...game.state, pendingDraw: 2, turn: 'p2' } };
    const handBefore = g.state.hands.p2.length;
    const { game: g2, events } = act(g, 'draw', 'p2', {});
    expect(g2.state.hands.p2).toHaveLength(handBefore + 2);
    expect(g2.state.pendingDraw).toBe(0);
    expect(events[0].count).toBe(2);
  });

  it('rejects draw when not your turn', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const { events } = act(game, 'draw', 'p2', {});
    expect(events[0].type).toBe('error');
  });
});

describe('Uno - view', () => {
  it('shows own hand and key game state', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.phase).toBe('play');
    expect(view.myHand).toHaveLength(7);
    expect(view.myHandCount).toBe(7);
    expect(view.isMyTurn).toBe(true);
    expect(view.topCard).toBeTruthy();
    expect(view.currentColor).toBeTruthy();
    expect(view.direction).toBe(1);
    expect(view.handCounts).toEqual({ p1: 7, p2: 7 });
  });

  it('isMyTurn is false for non-active player', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    expect(viewFor(game, 'p2').isMyTurn).toBe(false);
  });

  it('endIf reports winner and scores on finish', () => {
    const game = createTestGame(uno, ['p1', 'p2']);
    const g = {
      ...game, state: {
        ...game.state,
        phase: 'finished',
        winner: 'p1',
      },
    };
    const end = isOver(g);
    expect(end).toMatchObject({ winner: 'p1', scores: { p1: 1 } });
  });
});
