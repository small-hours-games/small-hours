// Small Hours - Gin Rummy AI opponent
// Pure: (state, botId) -> action payload or null. Uses the engine's own meld search,
// so the bot's idea of deadwood is exactly what knock() will score.

import { findOptimalMelds, cardValue } from '../games/gin-rummy.js';

const PLAY_PHASES = new Set(['first_turn', 'first_turn_draw', 'drawing']);

// Best 10-card hand after discarding one card from an 11-card hand.
// Ties keep the higher-value card out of the hand (less deadwood risk).
function bestDiscard(hand, forbiddenId) {
  let best = null;
  for (const card of hand) {
    if (card.id === forbiddenId) continue;
    const rest = hand.filter(c => c.id !== card.id);
    const dw = findOptimalMelds(rest).deadwoodValue;
    if (!best || dw < best.deadwood || (dw === best.deadwood && cardValue(card) > cardValue(best.card))) {
      best = { card, deadwood: dw };
    }
  }
  return best;
}

// Would taking `card` give a better 10-card hand than the current one?
function wantsCard(hand, card) {
  const now = findOptimalMelds(hand).deadwoodValue;
  const after = bestDiscard([...hand, card], card.id);
  return !!after && after.deadwood < now;
}

export function chooseGinAction(state, botId) {
  if (!PLAY_PHASES.has(state.phase)) return null; // scoring/finished: the human moves on
  if (state.players[state.currentPlayerIndex] !== botId) return null;

  const hand = state.hands[botId] || [];
  const top = state.discard[state.discard.length - 1];

  if (state.phase === 'first_turn') {
    return top && wantsCard(hand, top) ? { type: 'takeUpcard' } : { type: 'declineUpcard' };
  }

  if (state.turnPhase === 'draw') {
    if (state.phase === 'drawing' && top && wantsCard(hand, top)) return { type: 'draw', source: 'discard' };
    return { type: 'draw', source: 'stock' };
  }

  // Discard step (11 cards). The engine scores a knock on all 11 cards.
  if (findOptimalMelds(hand).deadwoodValue <= 10) return { type: 'knock' };
  const forbidden = state.lastDrawFrom === 'discard' ? state.lastDrawnCardId : null;
  const pick = bestDiscard(hand, forbidden);
  return pick ? { type: 'discard', cardId: pick.card.id } : null;
}
