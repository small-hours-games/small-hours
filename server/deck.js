'use strict';

/**
 * Shared playing card utility for Small Hours Games.
 *
 * Exports pure functions — no state, no class, no dependencies.
 * Standard 52-card deck only. Game-specific logic stays in game controllers.
 *
 * Card shape: { id: number, rank: string, suit: string, code: string }
 *   id   — stable 0–51 index in canonical (unshuffled) ordering, never changes
 *   rank — '2' … 'A'
 *   suit — '♠' '♥' '♦' '♣'
 *   code — rank+suit shorthand, e.g. 'K♥'
 */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Build a standard 52-card deck (unshuffled).
 *
 * @param {object} [options]
 * @param {number} [options.decks=1]   Number of standard 52-card decks to include.
 * @returns {Card[]}
 */
function createDeck(options = {}) {
  const { decks = 1 } = options;
  const single = [];

  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      single.push({
        id:   s * RANKS.length + r,   // 0–51, stable canonical position
        rank: RANKS[r],
        suit: SUITS[s],
        code: RANKS[r] + SUITS[s],
      });
    }
  }

  if (decks === 1) return single;

  const result = [];
  for (let d = 0; d < decks; d++) {
    // Each additional deck gets ids offset by 52*d so they remain unique across decks
    const offset = d * 52;
    for (const card of single) {
      result.push({ ...card, id: card.id + offset });
    }
  }
  return result;
}

/**
 * Fisher-Yates shuffle. Pure — does not mutate the input array.
 *
 * Works on any array (cards, strings, objects).
 *
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * Deal cards round-robin to numPlayers, cardsEach cards each.
 *
 * Does not mutate input. Returns dealt hands and the undealt remainder.
 *
 * @param {any[]}  cards       Source deck (shuffled or not).
 * @param {number} numPlayers  Number of hands to deal into.
 * @param {number} cardsEach   Cards per hand.
 * @returns {{ hands: any[][], remaining: any[] }}
 * @throws {Error} If the deck has fewer cards than numPlayers * cardsEach.
 */
function deal(cards, numPlayers, cardsEach) {
  const total = numPlayers * cardsEach;
  if (cards.length < total) {
    throw new Error(
      `deck.deal: not enough cards. Need ${total}, have ${cards.length}.`
    );
  }

  const hands = Array.from({ length: numPlayers }, () => []);

  for (let i = 0; i < total; i++) {
    hands[i % numPlayers].push(cards[i]);
  }

  return { hands, remaining: cards.slice(total) };
}

module.exports = { SUITS, RANKS, createDeck, shuffle, deal };
