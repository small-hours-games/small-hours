// Small Hours - Palace (shithead) AI opponent
// Pure: (state, botId) -> action payload or null. Mirrors the engine's pile rules.
// Each AI seat plays in its own style (src/engine/bots/personas.js).

import { personaFor } from '../../src/engine/bots/personas.js';

// How much a card is worth keeping for later: 2 (reset) and 10 (burn) are the
// strongest, then plain rank. Used to pick face-up cards and to play cheap first.
function keepValue(rank) {
  if (rank === 2 || rank === 10) return 20;
  return rank;
}

function canPlay(rank, pile) {
  if (pile.length === 0 || rank === 2 || rank === 10) return true;
  const top = pile[pile.length - 1].rank;
  if (top === 2) return true;
  if (top === 7) return rank <= 7;
  return rank >= top;
}

function chooseSwap(state, botId) {
  if (state.swapConfirmed[botId]) return null;
  const hand = state.hands[botId] || [];
  const faceUp = state.faceUp[botId] || [];
  // Strong cards belong face-up (played last, after the hand). Swap the best
  // hand card for the weakest face-up card while that is an upgrade.
  const bestHand = [...hand].sort((a, b) => keepValue(b.rank) - keepValue(a.rank))[0];
  const worstUp = [...faceUp].sort((a, b) => keepValue(a.rank) - keepValue(b.rank))[0];
  if (bestHand && worstUp && keepValue(bestHand.rank) > keepValue(worstUp.rank)) {
    return { type: 'swapCard', handCardId: bestHand.id, faceUpCardId: worstUp.id };
  }
  return { type: 'confirmSwap' };
}

/** A small number from the table, so a "random" choice is the same every time for the same table. */
function tableRoll(state, botId, n) {
  let h = 7;
  const key = botId + ':' + state.pile.length + ':' + (state.hands[botId] || []).map(c => c.id).join(',') + ':' + (state.drawPile || []).length;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

function choosePlay(state, botId, style) {
  const hand = state.hands[botId] || [];
  const faceUp = state.faceUp[botId] || [];
  const faceDown = state.faceDown[botId] || [];
  const source = hand.length ? hand : faceUp.length ? faceUp : null;

  if (!source) {
    return faceDown.length ? { type: 'playFaceDown', cardId: faceDown[tableRoll(state, botId, faceDown.length)].id } : null;
  }

  const legal = source.filter(c => canPlay(c.rank, state.pile));
  if (!legal.length) return { type: 'pickUpPile' };

  const ranks = [...new Set(legal.map(c => c.rank))];
  const ofRank = rank => source.filter(c => c.rank === rank).map(c => c.id);
  // Calculating (default): cheapest legal rank first; save 2s and 10s unless nothing else fits.
  const cheapest = [...ranks].sort((a, b) => keepValue(a) - keepValue(b) || a - b)[0];

  if (style === 'chaotic' && ranks.length > 1 && tableRoll(state, botId, 10) < 4) {
    // Glitch: now and then it plays any legal rank at all, specials included.
    return { type: 'playCards', cardIds: ofRank(ranks[tableRoll(state, botId, ranks.length)]) };
  }
  if (style === 'aggressive') {
    // Turbo: burns a pile worth burning, otherwise dumps its biggest set, cheap before dear.
    const ten = source.find(c => c.rank === 10);
    if (ten && state.pile.length >= 4) return { type: 'playCards', cardIds: [ten.id] };
    const bySize = [...ranks].sort((a, b) => ofRank(b).length - ofRank(a).length || keepValue(a) - keepValue(b) || a - b);
    return { type: 'playCards', cardIds: ofRank(bySize[0]) };
  }
  if (style === 'cautious') {
    // Prof. Byte: one card at a time keeps its hand flexible (a set of four still burns).
    const ids = ofRank(cheapest);
    const onPile = state.pile.length ? state.pile.filter((c, i, a) => i >= a.length - 3 && c.rank === cheapest).length : 0;
    return { type: 'playCards', cardIds: ids.length + onPile >= 4 ? ids : [ids[0]] };
  }
  return { type: 'playCards', cardIds: ofRank(cheapest) };
}

export function choosePalaceAction(state, botId) {
  const style = personaFor(botId)?.style || 'calculating';
  if (state.phase === 'swap') {
    // Glitch can't be bothered to swap; the others put their strongest cards face-up.
    if (style === 'chaotic') return state.swapConfirmed[botId] ? null : { type: 'confirmSwap' };
    return chooseSwap(state, botId);
  }
  if (state.phase !== 'play') return null;
  if (state.players[state.currentPlayerIndex] !== botId) return null;
  return choosePlay(state, botId, style);
}
