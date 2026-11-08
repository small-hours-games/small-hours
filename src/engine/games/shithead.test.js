// Tests for Shithead card game — focused on rank-2 special card behavior
import { describe, it, expect } from 'vitest';
import shithead from './shithead.js';

// --- Helper: build a minimal play-phase state ---

function makeState(overrides = {}) {
  const players = ['alice', 'bob'];
  const base = {
    phase: 'play',
    players,
    deckCount: 1,
    hands: {
      alice: [{ id: '5h_0', suit: 'h', rank: 5 }, { id: '8d_0', suit: 'd', rank: 8 }],
      bob: [{ id: '9c_0', suit: 'c', rank: 9 }],
    },
    faceUp: { alice: [], bob: [] },
    faceDown: { alice: [], bob: [] },
    drawPile: [],
    pile: [],
    burned: [],
    currentPlayerIndex: 0,
    swapConfirmed: { alice: true, bob: true },
    finishOrder: [],
    lastPlayedBy: null,
    lastPlayedCards: [],
  };
  return { ...base, ...overrides };
}

// --- canPlayOnPile helper is tested indirectly via playCards action ---

describe('Shithead rank-2 card — engine', () => {
  it('rank-2 can be played on an empty pile', () => {
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
    expect(result.state.pile.length > 0 || result.state.burned.length > 0).toBe(true);
  });

  it('rank-2 can be played on a pile with a high card (Ace, rank 14)', () => {
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
      pile: [{ id: '14s_0', suit: 's', rank: 14 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rank-2 can be played on a pile with a 7 on top (7 restricts to <= 7)', () => {
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
      pile: [{ id: '7d_0', suit: 'd', rank: 7 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rank-2 can be played on a pile with a 10 on top (after 10 normally burns)', () => {
    // A pile with 10 on top after burn-and-advance would already be empty — simulate
    // a state where 10 is somehow on top (edge case for rule completeness)
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
      pile: [{ id: '6c_0', suit: 'c', rank: 6 }, { id: '10h_0', suit: 'h', rank: 10 }],
    });
    // Normally a 10 on top would have triggered a burn, but test canPlayOnPile logic
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rank-2 can be played on a pile that already has 2s on top', () => {
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
      pile: [{ id: '14s_0', suit: 's', rank: 14 }, { id: '2d_0', suit: 'd', rank: 2 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('rank-2 can be played on a pile consisting entirely of 2s', () => {
    const state = makeState({
      hands: { alice: [{ id: '2h_0', suit: 'h', rank: 2 }], bob: [] },
      pile: [{ id: '2d_0', suit: 'd', rank: 2 }, { id: '2c_0', suit: 'c', rank: 2 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('after rank-2 is played, getTopRank (pileTopRank in view) returns null so next player can play anything', () => {
    // Play a 2 onto a pile with an Ace — resulting pile has 2 on top, getTopRank should return null
    const state = makeState({
      hands: {
        alice: [{ id: '2h_0', suit: 'h', rank: 2 }],
        bob: [{ id: '9c_0', suit: 'c', rank: 9 }],
      },
      pile: [{ id: '14s_0', suit: 's', rank: 14 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
    // pileTopRank in view should be null — meaning anything can be played next
    const view = shithead.view(result.state, 'bob');
    // If pile was not burned, pileTopRank should be null (2 is a wild/reset)
    // If pile was burned (4 2s), pile would be empty so pileTopRank is also null
    expect(view.pileTopRank).toBeNull();
  });

  it('playing multiple 2s at once succeeds', () => {
    const state = makeState({
      hands: {
        alice: [
          { id: '2h_0', suit: 'h', rank: 2 },
          { id: '2d_0', suit: 'd', rank: 2 },
        ],
        bob: [],
      },
      pile: [{ id: '14s_0', suit: 's', rank: 14 }],
    });
    const result = shithead.actions.playCards(state, {
      playerId: 'alice',
      cardIds: ['2h_0', '2d_0'],
    });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });

  it('playCards action with rank-2 returns valid new state (no error event)', () => {
    const state = makeState({
      hands: { alice: [{ id: '2s_0', suit: 's', rank: 2 }], bob: [] },
      pile: [{ id: '13c_0', suit: 'c', rank: 13 }], // King on top
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2s_0'] });
    expect(result.events.filter(e => e.type === 'error')).toHaveLength(0);
    expect(result.state).toBeDefined();
  });

  it('regular cards are still blocked by high cards (regression)', () => {
    // A 3 should NOT be playable on an Ace (rank 14)
    const state = makeState({
      hands: { alice: [{ id: '3h_0', suit: 'h', rank: 3 }], bob: [] },
      pile: [{ id: '14s_0', suit: 's', rank: 14 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['3h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(true);
  });

  it('7 on pile restricts next card to <= 7, but 2 is still playable', () => {
    const state = makeState({
      hands: {
        alice: [{ id: '2h_0', suit: 'h', rank: 2 }],
        bob: [],
      },
      pile: [{ id: '7d_0', suit: 'd', rank: 7 }],
    });
    const result = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['2h_0'] });
    expect(result.events.some(e => e.type === 'error')).toBe(false);
  });
});

describe('Shithead view — pileTopRank for rank-2 piles', () => {
  it('view returns pileTopRank as null when pile top is a 2', () => {
    const state = makeState({
      hands: { alice: [], bob: [] },
      pile: [{ id: '9h_0', suit: 'h', rank: 9 }, { id: '2d_0', suit: 'd', rank: 2 }],
    });
    const view = shithead.view(state, 'alice');
    expect(view.pileTopRank).toBeNull();
  });

  it('view returns pileTopRank as null when pile is empty', () => {
    const state = makeState({ pile: [] });
    const view = shithead.view(state, 'alice');
    expect(view.pileTopRank).toBeNull();
  });

  it('view returns correct pileTopRank when top card is non-2', () => {
    const state = makeState({
      pile: [{ id: '5c_0', suit: 'c', rank: 5 }, { id: '9h_0', suit: 'h', rank: 9 }],
    });
    const view = shithead.view(state, 'alice');
    expect(view.pileTopRank).toBe(9);
  });

  it('view exposes pilePreview (up to 4 cards), lastPlayedBy, lastPlayedCards, and loser when finished', () => {
    const state = makeState({
      hands: { alice: [{ id: '8h_0', suit: 'h', rank: 8 }, { id: '8s_0', suit: 's', rank: 8 }], bob: [{ id: '4c_0', suit: 'c', rank: 4 }] },
      pile: [
        { id: '3c_0', suit: 'c', rank: 3 },
        { id: '4d_0', suit: 'd', rank: 4 },
        { id: '5h_0', suit: 'h', rank: 5 },
      ],
    });
    const res = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['8h_0', '8s_0'] });
    const view = shithead.view(res.state, 'bob');
    expect(view.pilePreview).toHaveLength(4);
    expect(view.lastPlayedBy).toBe('alice');
    expect(view.lastPlayedCards).toHaveLength(2);
    expect(view.loser).toBe('bob');
  });
});

describe('Palace: hidden cards stay hidden', () => {
  it('card ids are opaque and say nothing about rank or suit', () => {
    const state = shithead.setup({ players: ['alice', 'bob'], config: {} });
    const all = [...state.drawPile, ...Object.values(state.hands).flat(),
      ...Object.values(state.faceUp).flat(), ...Object.values(state.faceDown).flat()];
    expect(all).toHaveLength(52);
    expect(new Set(all.map(c => c.id)).size).toBe(52);
    for (const c of all) expect(c.id).toMatch(/^c\d+$/);
  });

  it("a player's view never contains the rank or suit of any face-down card", () => {
    const state = shithead.setup({ players: ['alice', 'bob', 'carol'], config: {} });
    for (const viewer of state.players) {
      const json = JSON.stringify(shithead.view(state, viewer));
      for (const owner of state.players) {
        for (const card of state.faceDown[owner]) {
          expect(json).not.toContain(JSON.stringify(card));
          expect(json).not.toContain('"rank":' + card.rank + ',"suit":"' + card.suit + '","id":"' + card.id);
        }
      }
      const view = shithead.view(state, viewer);
      for (const p of view.players) expect(p.faceDown).toBeUndefined();
    }
  });
});

describe('Palace: move events', () => {
  it('a normal play records a play event with a seed', () => {
    const state = makeState({
      hands: { alice: [{ id: 'c1', suit: 'h', rank: 5 }, { id: 'c2', suit: 'd', rank: 9 }], bob: [{ id: 'c3', suit: 'c', rank: 9 }] },
    });
    const { state: next } = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['c1'] });
    expect(next.lastEvent).toMatchObject({ seq: 1, kind: 'play', by: 'alice' });
    expect(next.lastEvent.cards.map(c => c.id)).toEqual(['c1']);
    expect(Number.isInteger(next.lastEvent.seed)).toBe(true);
    expect(shithead.view(next, 'bob').lastEvent.seq).toBe(1);
  });

  it('a 10 records a burn event', () => {
    const state = makeState({
      hands: { alice: [{ id: 'c1', suit: 'h', rank: 10 }, { id: 'c2', suit: 'd', rank: 9 }], bob: [{ id: 'c3', suit: 'c', rank: 9 }] },
      pile: [{ id: 'c9', suit: 's', rank: 6 }],
    });
    const { state: next } = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['c1'] });
    expect(next.lastEvent.kind).toBe('burn');
  });

  it('picking up records who took how many cards, and seq keeps counting', () => {
    const state = makeState({
      hands: { alice: [{ id: 'c1', suit: 'h', rank: 3 }], bob: [{ id: 'c3', suit: 'c', rank: 9 }] },
      pile: [{ id: 'c8', suit: 's', rank: 6 }, { id: 'c9', suit: 's', rank: 13 }],
      eventSeq: 4,
    });
    const { state: next } = shithead.actions.pickUpPile(state, { playerId: 'alice' });
    expect(next.lastEvent).toMatchObject({ seq: 5, kind: 'pickup', by: 'alice', count: 2 });
  });
});

describe('Palace: throw speed', () => {
  it('keeps a clamped flick on the play event and ignores junk', () => {
    const state = makeState({
      hands: { alice: [{ id: 'c1', suit: 'h', rank: 5 }, { id: 'c2', suit: 'd', rank: 9 }], bob: [{ id: 'c3', suit: 'c', rank: 9 }] },
    });
    const thrown = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['c1'], flick: { vx: 0.5, vy: -99 } }).state;
    expect(thrown.lastEvent.flick).toEqual({ vx: 0.5, vy: -20 });
    const junk = shithead.actions.playCards(state, { playerId: 'alice', cardIds: ['c1'], flick: 'fast' }).state;
    expect(junk.lastEvent.flick).toBeUndefined();
  });
});
