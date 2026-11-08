// Small Hours - Shared (host/TV) view of a running game.
// Host displays are visible to everyone in the room, so they must never get a
// player's private information. A game may define hostView(state); otherwise the
// first player's view is used with every per-player field removed.

import { getView } from '../engine/engine.js';

// Per-player fields that do not follow the `my*` naming convention.
const PRIVATE_KEYS = new Set([
  'isMyTurn', 'swapConfirmed', 'canKnock', 'lastDrawnCardId', // card games
  'hasAnswered', 'selectedAnswer', 'eliminatedAnswers',      // quiz / music-quiz
  'isActive',                                                // hilow
]);

/**
 * True for keys that describe the viewing player rather than the shared game.
 * @param {string} key
 */
export function isPrivateViewKey(key) {
  return /^my[A-Z]/.test(key) || PRIVATE_KEYS.has(key);
}

/**
 * The view sent to host/TV sockets.
 *
 * @param {object} game - engine game instance
 * @param {string|undefined} firstPlayerId - any player in the room, used as a base view
 * @returns {object}
 */
export function getHostView(game, firstPlayerId) {
  if (typeof game.definition.hostView === 'function') {
    return game.definition.hostView(game.state);
  }
  if (!firstPlayerId) return { phase: game.state.phase };
  const view = getView(game, firstPlayerId);
  const shared = {};
  for (const [key, value] of Object.entries(view)) {
    if (!isPrivateViewKey(key)) shared[key] = value;
  }
  return shared;
}
