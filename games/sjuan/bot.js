// Small Hours - Sjuan AI opponent
// Pure: (state, botId) -> action payload or null.

import { personaFor } from '../../src/engine/bots/personas.js';

export function chooseSjuanAction(state, botId) {
  if (state.phase !== 'play' || state.turn !== botId) return null;
  const hand = state.hands[botId] || [];
  const legal = hand.filter(c => {
    const top = state.stacks[c.suit];
    return c.rank === top - 1 || c.rank === top + 1;
  });

  if (!legal.length) return { type: 'draw' };

  const style = personaFor(botId)?.style || 'calculating';
  if (style === 'chaotic' && legal.length > 1) {
    let h = 5;
    const key = botId + ':' + state.round + ':' + legal.map(c => c.id).join(',');
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return { type: 'playCard', cardId: legal[Math.abs(h) % legal.length].id };
  }

  // Aggressive plays extremes (furthest from 7) to unlock/dump fast; cautious/calculating prefers cards with fewer follow-ups in hand.
  const sorted = [...legal].sort((a, b) => {
    const da = Math.abs(a.rank - 7);
    const db = Math.abs(b.rank - 7);
    return style === 'aggressive' ? db - da : da - db;
  });
  return { type: 'playCard', cardId: sorted[0].id };
}
