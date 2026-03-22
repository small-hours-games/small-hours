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
});
