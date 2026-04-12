// Small Hours - Lobby message handlers

import { getView } from '../../engine/engine.js';

/**
 * Handle JOIN_LOBBY message — join as a new player or reconnect as existing player.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleJoinLobby(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom, sendToPlayer, playerSockets, graceTimers, getPlayerNames } = ctx;

  if (!msg.username) {
    send(ws, { type: 'ERROR', message: 'Username required' });
    return;
  }

  // Check if this username already exists (reconnection)
  let existingId = null;
  for (const [id, p] of room.players) {
    if (p.username === msg.username) {
      existingId = id;
      break;
    }
  }

  let playerId, avatar;
  if (existingId) {
    // Reconnect existing player
    playerId = existingId;
    const player = room.players.get(existingId);
    avatar = player.avatar;
    player.connected = true;
    player.lastSeen = Date.now();
  } else {
    // New player
    ({ playerId, avatar } = room.addPlayer(msg.username));
  }

  meta.playerId = playerId;
  playerSockets.set(playerId, ws);

  // Cancel any pending grace timer
  if (graceTimers.has(playerId)) {
    clearTimeout(graceTimers.get(playerId));
    graceTimers.delete(playerId);
  }

  send(ws, { type: 'JOIN_OK', playerId, avatar });
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });

  // If a game is running, send current game state to the reconnecting player
  if (room.game) {
    const view = getView(room.game, playerId);
    const playerNames = getPlayerNames(room);
    sendToPlayer(playerId, { type: 'GAME_STATE', ...view, playerNames });
  }
}

/**
 * Handle SET_READY message — mark a player as ready/not-ready.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleSetReady(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  room.setReady(meta.playerId, msg.ready);
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle SUGGEST_GAME message — player proposes a game type.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleSuggestGame(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  if (!msg.gameType) {
    send(ws, { type: 'ERROR', message: 'gameType required' });
    return;
  }
  room.suggestGame(meta.playerId, msg.gameType);
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle RETURN_TO_LOBBY message — admin ends the current game and returns to lobby.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleReturnToLobby(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom, cancelPhaseTimer, roomGameTypes } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }

  const player = room.players.get(meta.playerId);
  if (!player || !player.isAdmin) {
    send(ws, { type: 'ERROR', message: 'Only admin can return to lobby' });
    return;
  }

  cancelPhaseTimer(room.code);
  roomGameTypes.delete(room.code);
  room.endGame();
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}
