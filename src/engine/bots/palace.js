// Small Hours - Palace (shithead) AI opponent
// Pure: (state, botId) -> action payload or null. Mirrors the engine's pile rules.

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

function choosePlay(state, botId) {
  const hand = state.hands[botId] || [];
  const faceUp = state.faceUp[botId] || [];
  const faceDown = state.faceDown[botId] || [];
  const source = hand.length ? hand : faceUp.length ? faceUp : null;

  if (!source) {
    return faceDown.length ? { type: 'playFaceDown', cardId: faceDown[0].id } : null;
  }

  const legal = source.filter(c => canPlay(c.rank, state.pile));
  if (!legal.length) return { type: 'pickUpPile' };

  // Cheapest legal rank first; save 2s and 10s unless nothing else fits.
  const rank = legal.map(c => c.rank).sort((a, b) => keepValue(a) - keepValue(b) || a - b)[0];
  return { type: 'playCards', cardIds: source.filter(c => c.rank === rank).map(c => c.id) };
}

export function choosePalaceAction(state, botId) {
  if (state.phase === 'swap') return chooseSwap(state, botId);
  if (state.phase !== 'play') return null;
  if (state.players[state.currentPlayerIndex] !== botId) return null;
  return choosePlay(state, botId);
}
