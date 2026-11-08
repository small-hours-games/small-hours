// A complete, small card game to copy: match the top card by suit or rank, first out wins.
import { createDeck, deal } from '../../src/cards/deck.js';

const nextPlayer = state => state.players[(state.players.indexOf(state.turn) + 1) % state.players.length];
const notYourTurn = { type: 'error', message: 'Not your turn' };

export default {
  setup({ players }) {
    const { hands, rest } = deal(createDeck(), players, 5);
    const deck = [...rest];
    return { phase: 'play', players: [...players], hands, deck, pile: [deck.pop()], turn: players[0], winner: null };
  },

  actions: {
    play(state, { playerId, cardId }) {
      if (playerId !== state.turn) return { state, events: [notYourTurn] };
      const card = state.hands[playerId].find(c => c.id === cardId);
      const top = state.pile[state.pile.length - 1];
      if (!card || (card.suit !== top.suit && card.rank !== top.rank)) {
        return { state, events: [{ type: 'error', message: 'That card does not match' }] };
      }
      const hand = state.hands[playerId].filter(c => c.id !== cardId);
      const hands = { ...state.hands, [playerId]: hand };
      const pile = [...state.pile, card];
      if (!hand.length) return { state: { ...state, hands, pile, phase: 'finished', winner: playerId } };
      return { state: { ...state, hands, pile, turn: nextPlayer(state) } };
    },

    // Take a card, or just pass when the deck is empty.
    draw(state, { playerId }) {
      if (playerId !== state.turn) return { state, events: [notYourTurn] };
      const deck = [...state.deck];
      const drawn = deck.pop();
      const hands = drawn ? { ...state.hands, [playerId]: [...state.hands[playerId], drawn] } : state.hands;
      return { state: { ...state, deck, hands, turn: nextPlayer(state) } };
    },
  },

  // Everything a phone may see. Fields named my* never reach the TV.
  view(state, playerId) {
    return {
      phase: state.phase,
      myHand: state.hands[playerId] || [],
      isMyTurn: playerId === state.turn,
      top: state.pile[state.pile.length - 1],
      deckCount: state.deck.length,
      turn: state.turn,
      handCounts: Object.fromEntries(state.players.map(p => [p, state.hands[p].length])),
      winner: state.winner,
    };
  },

  endIf(state) {
    return state.phase === 'finished' ? { winner: state.winner, scores: { [state.winner]: 1 } } : null;
  },
};
