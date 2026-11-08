// Small Hours - Högt/Lågt (Hi-Lo) party game
// A tur-based party game: the active player draws a card (visible to all).
// Every other player guesses whether the NEXT drawn card will be HIGHER or LOWER
// than the current one. Correct guess -> +1 point. Active player rotates each round.
// First to `target` points wins.
//
// Follows the engine pattern: { setup, actions, view, endIf }.

const SUITS = ['h', 'd', 'c', 's'];
const SUIT_SYMBOL = { h: '♥', d: '♦', c: '♣', s: '♠' };
// rank 2..14 (J=11, Q=12, K=13, A=14)
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `${rank}${suit}`, suit, rank });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardView(card) {
  if (!card) return null;
  return { id: card.id, suit: card.suit, rank: card.rank, label: rankLabel(card.rank), symbol: SUIT_SYMBOL[card.suit] };
}

const hilow = {
  setup({ players, config }) {
    const target = (config && config.target) || 5;
    const scores = {};
    for (const id of players) scores[id] = 0;

    const deck = shuffle(makeDeck());
    // Draw the first "current" card so players have something to guess against.
    const current = deck.pop();

    return {
      phase: 'guessing',
      players: [...players],
      deck,
      current,                 // the visible card
      scores,
      target,
      activePlayer: players[0],
      round: 1,
      guesses: {},            // playerId -> 'higher' | 'lower'
      lastResult: null,       // { activePlayer, current, next, higher, winners: [] }
      winner: null,
    };
  },

  actions: {
    // A non-active player submits a guess for the next card.
    guess(state, { playerId, direction }) {
      if (state.phase !== 'guessing') {
        return { state, events: [{ type: 'error', playerId, message: 'Not accepting guesses now' }] };
      }
      if (playerId === state.activePlayer) {
        return { state, events: [{ type: 'error', playerId, message: 'Active player cannot guess' }] };
      }
      if (state.guesses[playerId]) {
        return { state, events: [{ type: 'error', playerId, message: 'Already guessed this round' }] };
      }
      if (direction !== 'higher' && direction !== 'lower') {
        return { state, events: [{ type: 'error', playerId, message: 'direction must be higher or lower' }] };
      }

      const guesses = { ...state.guesses, [playerId]: direction };
      const others = state.players.filter(p => p !== state.activePlayer);
      const allGuessed = others.every(p => guesses[p]);

      let next = state;
      if (allGuessed) {
        next = resolveRound({ ...state, guesses });
      } else {
        next = { ...state, guesses };
      }

      return { state: next, events: [{ type: 'guessed', playerId, direction }] };
    },

    // Test/debug helper: force-resolve even if not all guessed (host skip).
    resolveNow(state) {
      if (state.phase !== 'guessing') return { state };
      return { state: resolveRound(state), events: [{ type: 'round_resolved' }] };
    },
  },

  view(state, playerId) {
    return {
      phase: state.phase,
      current: cardView(state.current),
      scores: { ...state.scores },
      target: state.target,
      activePlayer: state.activePlayer,
      round: state.round,
      myGuess: state.guesses[playerId] || null,
      haveIGuessed: !!state.guesses[playerId],
      isActive: playerId === state.activePlayer,
      lastResult: state.lastResult
        ? {
            ...state.lastResult,
            current: cardView(state.lastResult.current),
            next: cardView(state.lastResult.next),
          }
        : null,
      winner: state.winner,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return { winner: state.winner, scores: { ...state.scores } };
  },
};

// Internal: reveal next card, score guesses, rotate active player, maybe finish.
function resolveRound(state) {
  if (state.deck.length === 0) {
    // Out of cards: end the game, winner = highest score.
    const winner = Object.entries(state.scores).sort((a, b) => b[1] - a[1])[0][0];
    return { ...state, phase: 'finished', winner, lastResult: state.lastResult };
  }

  const next = state.deck.pop();
  const current = state.current;
  const higher = next.rank > current.rank;

  const others = state.players.filter(p => p !== state.activePlayer);
  const winners = others.filter(p => {
    const g = state.guesses[p];
    return (g === 'higher' && higher) || (g === 'lower' && !higher);
  });

  const scores = { ...state.scores };
  for (const w of winners) scores[w] = (scores[w] || 0) + 1;

  // Did someone reach the target?
  const reached = winners.find(w => scores[w] >= state.target);
  if (reached) {
    return {
      ...state,
      current: next,
      scores,
      phase: 'finished',
      winner: reached,
      lastResult: { activePlayer: state.activePlayer, current, next, higher, winners },
    };
  }

  // Rotate the active player to the next in line.
  const idx = state.players.indexOf(state.activePlayer);
  const nextActive = state.players[(idx + 1) % state.players.length];

  return {
    ...state,
    current: next,
    scores,
    activePlayer: nextActive,
    round: state.round + 1,
    guesses: {},
    phase: 'guessing',
    lastResult: { activePlayer: state.activePlayer, current, next, higher, winners },
  };
}

export default hilow;
