// Small Hours - Shared (host/TV) view of a running game.
// Host displays are visible to everyone in the room, so they must never get a
// player's private information. A game may define hostView(state); otherwise the
// first player's view is used with every per-player field removed.

import { getView } from '../engine/engine.js';

/**
 * True for keys that describe the viewing player rather than the shared game.
 * A game names any others in its manifest (privateKeys).
 * @param {string} key
 * @param {string[]} [extra]
 */
export function isPrivateViewKey(key, extra = []) {
  return /^my[A-Z]/.test(key) || key === 'isMyTurn' || extra.includes(key);
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
    if (!isPrivateViewKey(key, game.definition.privateKeys)) shared[key] = value;
  }
  return shared;
}
