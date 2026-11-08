// Small Hours - AI opponents
// A game's bot is a pure (state, botId) -> action | null in its manifest (ai.choose).
// The transport layer feeds the chosen action through processAction like any player's move.

import { getGame } from '../../games/registry.js';

export const BOT_NAMES = ['Robo', 'Bitsy', 'Chip', 'Pixel', 'Turbo'];

export function hasBot(gameType) {
  return typeof getGame(gameType)?.ai?.choose === 'function';
}

/**
 * The next move any bot wants to make, or null when it is a human's move.
 * @returns {{ type: string, playerId: string } | null}
 */
export function nextBotAction(gameType, state, botIds) {
  const choose = getGame(gameType)?.ai?.choose;
  if (!choose) return null;
  for (const botId of botIds) {
    const action = choose(state, botId);
    if (action) return { ...action, playerId: botId };
  }
  return null;
}
