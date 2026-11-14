import { evaluateBestHand } from './hand-eval.js';
import { personaFor } from '../../src/engine/bots/personas.js';

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

/** Deterministic per-hand roll so each bot's bluffs/quirks stay consistent for the same state. */
function handRoll(state, botId) {
  let h = 13;
  const key = botId + ':' + (state.handNumber || 1) + ':' + state.phase + ':' + (state.pot || 0);
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 100) / 100;
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

  const style = personaFor(botId)?.style || 'calculating';
  const roll = handRoll(state, botId);

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

  const raiseThreshold = style === 'aggressive' ? 0.52 : style === 'cautious' ? 0.76 : 0.68;
  const reraiseThreshold = style === 'aggressive' ? 0.70 : style === 'cautious' ? 0.88 : 0.82;
  const foldCutoff = style === 'cautious' ? 0.45 : style === 'aggressive' ? 0.28 : 0.38;

  if (toCall === 0) {
    if ((strength > raiseThreshold || (style === 'chaotic' && roll < 0.22)) && maxTo > state.currentBet && chips > state.minRaise) {
      const bump = style === 'aggressive' ? Math.min(maxTo, minRaiseTo + state.minRaise) : minRaiseTo;
      return { type: 'raise', to: bump };
    }
    return { type: 'check' };
  }

  if (style === 'chaotic' && roll < 0.15 && maxTo > minRaiseTo && chips > toCall + state.minRaise) {
    return { type: 'raise', to: minRaiseTo };
  }
  if (toCall > chips * 0.5 && strength < (style === 'cautious' ? 0.65 : 0.55)) {
    return { type: 'fold' };
  }
  if (toCall > 40 && strength < foldCutoff) {
    return { type: 'fold' };
  }
  if (strength > reraiseThreshold && maxTo > minRaiseTo && chips > toCall + state.minRaise) {
    return { type: 'raise', to: minRaiseTo };
  }
  return { type: 'call' };
}
