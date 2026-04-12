// Small Hours - Category vote message handlers

import { fetchCategories } from '../../fetcher/cached-fetcher.js';

/**
 * Handle START_CATEGORY_VOTE message — admin kicks off a category vote by fetching categories.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export async function handleStartCategoryVote(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  const player = room.players.get(meta.playerId);
  if (!player || !player.isAdmin) {
    send(ws, { type: 'ERROR', message: 'Only admin can start voting' });
    return;
  }
  const result = await fetchCategories();
  if (!result.ok) {
    send(ws, { type: 'ERROR', message: result.error.message });
    return;
  }
  room.availableCategories = result.categories;
  room.votingActive = true;
  room.categoryVotes.clear();
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}

/**
 * Handle CATEGORY_VOTE message — player casts a vote for a category.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleCategoryVote(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  if (!room.votingActive) {
    send(ws, { type: 'ERROR', message: 'Voting not active' });
    return;
  }
  const categoryId = Number(msg.categoryId);
  if (!Number.isFinite(categoryId)) {
    send(ws, { type: 'ERROR', message: 'Invalid categoryId' });
    return;
  }
  const valid = room.availableCategories.some(c => c.id === categoryId);
  if (!valid) {
    send(ws, { type: 'ERROR', message: 'Invalid categoryId' });
    return;
  }
  room.categoryVotes.set(meta.playerId, categoryId);
  room.lastActivity = Date.now();
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}
