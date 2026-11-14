import { evaluateBestHand } from './hand-eval.js';

function preflopScore(hand) {
  if (!hand || hand.length < 2) return 0;
  const [a, b] = hand;
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  if (pair) return 0.6 + (hi / 14) * 0.4;
  return ((hi + lo) / 28) * 0.55 + (suited ? 0.08 : 0) + (hi - lo <= 3 ? 0.05 : 0);
}

export function chooseHoldemAction(state, botId) {
  if (state.phase === 'showdown') {
    const hasHuman = state.players.some(id => !id.startsWith('bot_'));
    if (!hasHuman && state.players[0] === botId) {
      return { type: 'nextHand' };
    }
    return null;
  }

  if (state.phase === 'finished' || state.turn !== botId) return null;

  const chips = state.chips[botId] || 0;
  const streetBet = state.streetBets[botId] || 0;
  const toCall = Math.max(0, state.currentBet - streetBet);
  const maxTo = streetBet + chips;
  const minRaiseTo = Math.min(maxTo, state.currentBet + state.minRaise);

  const hand = state.hands[botId] || [];
  let strength = preflopScore(hand);
  if (state.board && state.board.length >= 3) {
    const ev = evaluateBestHand([...hand, ...state.board]);
    if (ev) strength = Math.min(1, 0.25 + ev.category * 0.14);
  }

  if (toCall === 0) {
    if (strength > 0.68 && maxTo > state.currentBet && chips > state.minRaise) {
      return { type: 'raise', to: minRaiseTo };
    }
    return { type: 'check' };
  }

  if (toCall > chips * 0.5 && strength < 0.55) {
    return { type: 'fold' };
  }
  if (toCall > 40 && strength < 0.38) {
    return { type: 'fold' };
  }
  if (strength > 0.82 && maxTo > minRaiseTo && chips > toCall + state.minRaise) {
    return { type: 'raise', to: minRaiseTo };
  }
  return { type: 'call' };
}
