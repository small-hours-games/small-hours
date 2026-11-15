// Small Hours - Lobby message handlers

import { getView } from '../../engine/engine.js';
import { AVATAR_POOL } from '../../session/room.js';
import { stopRoomGame } from './game.js';
import { attachPotPlayer, registerSwish, potPrivateState, startPotPayment, confirmPotPayment, playerForPayment } from '../../pot/pot-room.js';
import { getSwishClient } from '../../pot/swish.js';

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

  // Check for an existing player to reconnect. Reconnection requires the
  // unguessable reconnectToken, NOT the username — prevents admin/identity
  // hijack via username collision.
  let existingId = null;
  if (msg.reconnectToken) {
    for (const [id, p] of room.players) {
      if (p.reconnectToken === msg.reconnectToken) {
        existingId = id;
        break;
      }
    }
  }

  // Back from Swish, maybe in another browser: the payment id finds the player.
  if (!existingId && room.pot && msg.potPayment) existingId = playerForPayment(room, msg.potPayment);

  let playerId, avatar, reconnectToken;
  if (existingId) {
    // Reconnect existing player
    playerId = existingId;
    const player = room.players.get(existingId);
    avatar = player.avatar;
    reconnectToken = player.reconnectToken;
    player.connected = true;
    player.lastSeen = Date.now();
    if (meta.device) player.device = meta.device;
  } else {
    // New player
    ({ playerId, avatar, reconnectToken } = room.addPlayer(msg.username));
    const player = room.players.get(playerId);
    if (player && meta.device) player.device = meta.device;
  }

  meta.playerId = playerId;
  playerSockets.set(playerId, ws);

  // Cancel any pending grace timer
  if (graceTimers.has(playerId)) {
    clearTimeout(graceTimers.get(playerId));
    graceTimers.delete(playerId);
  }

  send(ws, { type: 'JOIN_OK', playerId, avatar, reconnectToken, avatarPool: AVATAR_POOL });
  if (room.pot) {
    try {
      attachPotPlayer(room, playerId, msg.potKey);
    } catch (err) {
      console.error('[pot] could not look up player:', err.message);
    }
    send(ws, { type: 'POT_PRIVATE', ...potPrivateState(room, playerId) });
  }
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });

  // If a game is running and this player hasn't surrendered, send current game state
  if (room.game && !room.surrendered?.has(playerId)) {
    const view = getView(room.game, playerId);
    const playerNames = getPlayerNames(room);
    const clock = ctx.timing ? ctx.timing(room) : {};
    sendToPlayer(playerId, { type: 'GAME_STATE', ...view, ...clock, gameType: room.gameType, playerNames });
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
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }

  const player = room.players.get(meta.playerId);
  if (!player || !player.isAdmin) {
    send(ws, { type: 'ERROR', message: 'Only admin can return to lobby' });
    return;
  }

  stopRoomGame(room, ctx);
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle SET_AVATAR message — a player picks an avatar from the pool.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleSetAvatar(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;
  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  const result = room.setAvatar(meta.playerId, String(msg.avatar || ''));
  if (!result.ok) {
    send(ws, { type: 'ERROR', message: result.error });
    return;
  }
  send(ws, { type: 'AVATAR_OK', avatar: result.avatar });
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle SET_USERNAME message — a player updates their nickname.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleSetUsername(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;
  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  const result = room.setUsername(meta.playerId, String(msg.username || ''));
  if (!result.ok) {
    send(ws, { type: 'ERROR', message: result.error });
    return;
  }
  send(ws, { type: 'USERNAME_OK', username: result.username });
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle POT_SET_SWISH message — in a pot room, a player gives the Swish number
 * their winnings go to. The phone also sends its pot key, a random secret kept
 * on the phone, so the number is remembered for the next pot room.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg - { number, potKey }
 * @param {object} ctx
 */
export function handleSetSwish(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;
  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  let result;
  try {
    result = registerSwish(room, meta.playerId, msg.potKey, msg.number);
  } catch (err) {
    console.error('[pot] could not save number:', err.message);
    result = { ok: false, error: 'Could not save the number, try again' };
  }
  if (!result.ok) {
    send(ws, { type: 'POT_ERROR', message: result.error });
    return;
  }
  send(ws, { type: 'POT_PRIVATE', last2: result.last2 });
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle POT_START_PAYMENT message — the player taps "Pay". Answers POT_PAY with
 * the link that opens Swish (a real payment request with Swish Handel, otherwise
 * a pre-filled payment the admin confirms).
 */
export async function handleStartPotPayment(ws, meta, room, msg, ctx) {
  const { send } = ctx;
  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  try {
    const result = await startPotPayment(room, meta.playerId, { client: getSwishClient() });
    if (!result.ok) send(ws, { type: 'POT_ERROR', message: result.error });
    else send(ws, { type: 'POT_PAY', mode: result.mode, url: result.url, paymentId: result.paymentId || null });
  } catch (err) {
    console.error('[pot] could not start a payment:', err.message);
    send(ws, { type: 'POT_ERROR', message: 'Swish could not start the payment. Try again in a moment.' });
  }
}

/**
 * Handle POT_CHECK_PAYMENT message — the phone is back from Swish and asks how
 * it went (in case Swish's callback is late or never came).
 */
export async function handleCheckPotPayment(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;
  if (!meta.playerId || !room.pot) return;
  const entry = room.pot.entries.get(meta.playerId);
  const client = getSwishClient();
  if (!client || !entry?.payment) {
    // No Swish Handel: the admin confirms. Show them who says they have paid.
    // The admin page polls, so it shows up there within a few seconds.
    if (entry && !entry.paid && !entry.claimedAt) entry.claimedAt = Date.now();
    send(ws, { type: 'POT_PAYMENT_STATUS', status: entry?.paid ? 'PAID' : 'WAITING_FOR_ADMIN' });
    return;
  }
  try {
    const result = await confirmPotPayment(entry.payment.id, { client, getRoom: () => room });
    send(ws, { type: 'POT_PAYMENT_STATUS', status: result.status || 'UNKNOWN' });
    if (result.changed) broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
  } catch (err) {
    console.error('[pot] could not check a payment:', err.message);
    send(ws, { type: 'POT_PAYMENT_STATUS', status: 'UNKNOWN' });
  }
}
