// Small Hours - AI opponents
// A bot policy is a pure (state, botId) -> action | null. The transport layer
// feeds the chosen action through processAction like any player's move.

import { chooseGinAction } from './gin-rummy.js';
import { choosePalaceAction } from './palace.js';

const BOTS = {
  'gin-rummy': chooseGinAction,
  'shithead': choosePalaceAction,
};

export const BOT_NAMES = ['Robo', 'Bitsy', 'Chip', 'Pixel', 'Turbo'];

export function hasBot(gameType) {
  return Object.hasOwn(BOTS, gameType);
}

/**
 * The next move any bot wants to make, or null when it is a human's move.
 * @returns {{ type: string, playerId: string } | null}
 */
export function nextBotAction(gameType, state, botIds) {
  const choose = BOTS[gameType];
  if (!choose) return null;
  for (const botId of botIds) {
    const action = choose(state, botId);
    if (action) return { ...action, playerId: botId };
  }
  return null;
}
