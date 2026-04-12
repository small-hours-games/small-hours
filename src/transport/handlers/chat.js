// Small Hours - Chat message handler

/**
 * Handle CHAT_MESSAGE message — broadcast a chat message from a player.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleChatMessage(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }

  if (!ctx.checkChatRateLimit(meta)) {
    send(ws, { type: 'ERROR', message: 'Chat rate limit exceeded' });
    return;
  }

  const text = String(msg.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  if (!text) return;

  const player = room.players.get(meta.playerId);
  broadcastToRoom(room.code, {
    type: 'CHAT_MESSAGE',
    playerId: meta.playerId,
    username: player ? player.username : 'Unknown',
    text,
    timestamp: Date.now(),
  });
}
