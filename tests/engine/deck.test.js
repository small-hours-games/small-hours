import { describe, it, expect } from 'vitest';
import { createDeck, deal, shuffle } from '../../src/cards/deck.js';

describe('createDeck', () => {
  it('holds 52 different cards, ace low by default', () => {
    const deck = createDeck();
    expect(new Set(deck.map(c => c.id)).size).toBe(52);
    expect(Math.min(...deck.map(c => c.rank))).toBe(1);
    expect(Math.max(...deck.map(c => c.rank))).toBe(13);
  });

  it('can count the ace high', () => {
    const ranks = createDeck({ aceHigh: true }).map(c => c.rank);
    expect(Math.min(...ranks)).toBe(2);
    expect(Math.max(...ranks)).toBe(14);
  });

  it('keeps ids unique across several decks', () => {
    const deck = createDeck({ decks: 2 });
    expect(deck).toHaveLength(104);
    expect(new Set(deck.map(c => c.id)).size).toBe(104);
  });

  it('never reveals the card through an opaque id', () => {
    const deck = createDeck({ opaqueIds: true });
    expect(deck.map(c => c.id)).toEqual(deck.map((_, i) => 'c' + i));
  });
});

describe('shuffle and deal', () => {
  it('shuffle keeps every item and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items).sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it('deals one at a time and returns the rest', () => {
    const { hands, rest } = deal(['a', 'b', 'c', 'd', 'e'], ['p1', 'p2'], 2);
    expect(hands).toEqual({ p1: ['e', 'c'], p2: ['d', 'b'] });
    expect(rest).toEqual(['a']);
  });

  it('stops when the deck runs out', () => {
    const { hands, rest } = deal(['a', 'b', 'c'], ['p1', 'p2'], 5);
    expect(hands.p1).toHaveLength(2);
    expect(hands.p2).toHaveLength(1);
    expect(rest).toEqual([]);
  });
});
