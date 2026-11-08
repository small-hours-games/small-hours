// Small Hours - Shared playing cards for the card games.
// A card is { id, suit: 'h'|'d'|'c'|'s', rank }. Ace is rank 1, or 14 with aceHigh.

export const SUITS = ['h', 'd', 'c', 's'];

/** A shuffled copy; the array passed in is left alone. */
export function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A shuffled deck of 52 cards per deck.
 * opaqueIds: ids are numbered after the shuffle and say nothing about the card, for
 * games where a face-down card's id reaches a phone.
 * idSuffix: added to readable ids, like '8s_0'.
 */
export function createDeck({ aceHigh = false, decks = 1, opaqueIds = false, idSuffix = '' } = {}) {
  const [low, high] = aceHigh ? [2, 14] : [1, 13];
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (let rank = low; rank <= high; rank++) {
        cards.push({ id: `${rank}${suit}${idSuffix}${decks > 1 ? '_' + d : ''}`, suit, rank });
      }
    }
  }
  const deck = shuffle(cards);
  return opaqueIds ? deck.map(({ suit, rank }, i) => ({ id: 'c' + i, suit, rank })) : deck;
}

/**
 * Deal count cards to each player, one at a time, off the end of the deck.
 * Stops early when the deck runs out. Returns { hands, rest }; deck is left alone.
 */
export function deal(deck, players, count) {
  const rest = [...deck];
  const hands = Object.fromEntries(players.map(id => [id, []]));
  for (let round = 0; round < count; round++) {
    for (const id of players) {
      if (rest.length) hands[id].push(rest.pop());
    }
  }
  return { hands, rest };
}
