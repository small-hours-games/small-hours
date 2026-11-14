// Small Hours - Game message handlers

import { processAction, getView, checkEnd } from '../../engine/engine.js';
import { handleStartCategoryVote } from './vote.js';
import { getHostView } from '../host-view.js';

/**
 * Handle START_VOTED_GAME message — admin starts whichever game the players voted for most.
 * Quiz chains through the category vote: first call opens it, second call starts the quiz.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export async function handleStartVotedGame(ws, meta, room, msg, ctx) {
  const { send } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }
  const player = room.players.get(meta.playerId);
  if (!player || !player.isAdmin) {
    send(ws, { type: 'ERROR', message: 'Only admin can start a game' });
    return;
  }

  if (room.game || room.startingGame) return; // a repeated tap on Start

  const gameType = room.resolveWinningGame();
  if (!gameType) {
    send(ws, { type: 'ERROR', message: 'No playable game has been voted for yet' });
    return;
  }

  if (gameType === 'quiz' && !room.votingActive) {
    await handleStartCategoryVote(ws, meta, room, msg, ctx);
    return;
  }

  await handleStartMiniGame(ws, meta, room, { type: 'START_MINI_GAME', gameType, config: msg.config }, ctx);
}

/**
 * Handle START_MINI_GAME message — admin starts a mini-game (async: may fetch questions).
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export async function handleStartMiniGame(ws, meta, room, msg, ctx) {
  const { send, broadcastToRoom, sendToPlayer, roomGameTypes, schedulePhaseTimer, getPlayerNames } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }

  const player = room.players.get(meta.playerId);
  if (!player || !player.isAdmin) {
    send(ws, { type: 'ERROR', message: 'Only admin can start a game' });
    return;
  }

  if (!msg.gameType) {
    send(ws, { type: 'ERROR', message: 'gameType required' });
    return;
  }

  // Preparing a quiz can take seconds. A second tap meanwhile would start a second
  // game and restart the countdown on every screen.
  if (room.game || room.startingGame) return;

  let config = msg.config || {};

  // Quiz: resolve winning category from votes if no explicit override (per D-12, D-16)
  if (msg.gameType === 'quiz' && room.votingActive && !config.categoryId) {
    config = { ...config, categoryId: room.resolveWinningCategory() };
  }

  room.startingGame = true;
  try {
    const game = await room.startGame(msg.gameType, config);

    // A concurrent RETURN_TO_LOBBY or second start may have cleared the game
    // while we awaited. Guard before touching room.game to avoid a crash.
    if (!room.game) {
      send(ws, { type: 'ERROR', message: 'Game was cancelled before it started' });
      return;
    }

    broadcastToRoom(room.code, {
      type: 'MINI_GAME_STARTING',
      gameType: msg.gameType,
      gameId: game.id,
    });

    // Schedule phase timer for timer-driven games (first, so the views carry the time left)
    roomGameTypes.set(room.code, msg.gameType);
    const counting = ctx.startRoundCountdown?.(room, msg.gameType, 1);
    if (!counting) schedulePhaseTimer(room, msg.gameType, { force: true });
    const clock = ctx.timing ? ctx.timing(room) : {};

    // Send initial game state to each player
    const pNames = getPlayerNames(room);
    for (const [id] of room.players) {
      const view = getView(room.game, id);
      sendToPlayer(id, { type: 'GAME_STATE', ...view, ...clock, gameType: msg.gameType, playerNames: pNames });
    }
    // Also broadcast to host displays
    // Host displays get the shared table straight away (same view as every later update)
    const hostView = getHostView(room.game, room.players.keys().next().value);
    broadcastToRoom(room.code, { type: 'GAME_STATE', ...hostView, gameType: msg.gameType, phase: room.game.state.phase, ...clock, playerNames: pNames }, { hostsOnly: true });
    if (!counting) ctx.scheduleBotTurn?.(room);
  } catch (err) {
    send(ws, { type: 'ERROR', message: err.message });
  } finally {
    room.startingGame = false;
  }
}

/**
 * Handle GAME_ACTION message — player performs an in-game action.
 *
 * @param {import('ws')} ws
 * @param {object} meta
 * @param {object} room
 * @param {object} msg
 * @param {object} ctx
 */
export function handleGameAction(ws, meta, room, msg, ctx) {
  const { send } = ctx;

  if (!meta.playerId) {
    send(ws, { type: 'ERROR', message: 'Not joined yet' });
    return;
  }

  if (!room.game) {
    send(ws, { type: 'ERROR', message: 'No game running' });
    return;
  }

  if (!msg.action || !msg.action.type) {
    send(ws, { type: 'ERROR', message: 'action with type required' });
    return;
  }

  // A phone resends a move after a reconnect when it never heard back. If this move already
  // went through, don't play it twice: just send the player where the game stands now.
  const { moveId, ...action } = msg.action;
  const player = room.players.get(meta.playerId);
  if (moveId && player && player.lastMoveId === String(moveId)) {
    const view = getView(room.game, meta.playerId);
    const clock = ctx.timing ? ctx.timing(room) : {};
    ctx.sendToPlayer(meta.playerId, { type: 'GAME_STATE', ...view, ...clock, playerNames: ctx.getPlayerNames(room), ack: String(moveId) });
    return;
  }
  if (moveId && player) player.lastMoveId = String(moveId).slice(0, 40);

  applyGameAction(room, { ...action, playerId: meta.playerId, ...(moveId ? { moveId: String(moveId).slice(0, 40) } : {}) }, ctx);
}

/**
 * Apply one action (a player's or an AI seat's), broadcast the new views and end
 * the game if it is over. Returns the engine events.
 *
 * @param {object} room
 * @param {object} action - { type, playerId, ...payload }; playerId is trusted here
 * @param {object} ctx
 */
export function applyGameAction(room, action, ctx) {
  const { broadcastToRoom, sendToPlayer, roomGameTypes, schedulePhaseTimer, getPlayerNames } = ctx;
  const { moveId: _moveId, ...engineAction } = action;   // the engine never sees transport ids
  const prevRound = room.game?.state ? (room.game.state.handNumber || room.game.state.round || 0) : 0;
  const { game: updatedGame, events } = processAction(room.game, engineAction);
  room.game = updatedGame;
  room.lastActivity = Date.now();
  const nextRound = room.game?.state ? (room.game.state.handNumber || room.game.state.round || 0) : 0;

  // Reschedule phase timer if phase changed due to player action (before sending,
  // so the views carry the current phase's time left)
  const activeGameType = roomGameTypes.get(room.code);
  const endResult = checkEnd(room.game);
  const newRound = !endResult && activeGameType && nextRound > prevRound;
  const counting = newRound ? ctx.startRoundCountdown?.(room, activeGameType, nextRound) : false;
  if (activeGameType && !counting) {
    schedulePhaseTimer(room, activeGameType);
  }
  const clock = ctx.timing ? ctx.timing(room) : {};

  const playerNames = getPlayerNames(room);

  // Send per-player views (flattened into GAME_STATE). The mover's copy acknowledges the move.
  for (const [id] of room.players) {
    const view = getView(room.game, id);
    const ack = action.moveId && id === action.playerId ? { ack: action.moveId } : {};
    sendToPlayer(id, { type: 'GAME_STATE', ...view, ...clock, playerNames, ...ack });
  }

  // Broadcast shared state to host displays only (not players — they got personal views above)
  const hostView = getHostView(room.game, room.players.keys().next().value);
  const sharedState = { type: 'GAME_STATE', ...hostView, ...clock, playerNames };
  if (events.length > 0) sharedState.events = events;
  broadcastToRoom(room.code, sharedState, { hostsOnly: true });

  // A refused move: only the one who made it needs to hear why.
  const refused = events.find(e => e.type === 'error');
  if (refused && action.playerId) sendToPlayer(action.playerId, { type: 'ERROR', message: refused.message });

  // Check for game end
  if (endResult) finishGame(room, endResult, ctx);
  else if (!counting) ctx.scheduleBotTurn?.(room);
  return events;
}

/**
 * End a finished game: final views, session scores, back to lobby.
 * Shared by player actions (handleGameAction) and phase timers (ws-adapter).
 *
 * @param {object} room
 * @param {object} endResult - from checkEnd()
 * @param {object} ctx
 */
export function finishGame(room, endResult, ctx) {
  const { broadcastToRoom, sendToPlayer, roomGameTypes, cancelPhaseTimer, getPlayerNames } = ctx;
  const playerNames = getPlayerNames(room);

  // Send final views with end result
  for (const [id] of room.players) {
    const view = getView(room.game, id);
    sendToPlayer(id, { type: 'GAME_STATE', ...view, ...endResult });
  }
  broadcastToRoom(room.code, {
    type: 'GAME_STATE',
    phase: 'finished',
    ...endResult,
    playerNames,
  }, { hostsOnly: true });

  // Award session scores (mirrors the timer-driven end path). endResult
  // carries either a per-player scores map or a single winner.
  try {
    if (endResult.scores && typeof endResult.scores === 'object') {
      room.awardScores(endResult.scores);
    } else if (typeof endResult.winner === 'string') {
      const scoresMap = {};
      for (const [id, p] of room.players) {
        if (p.connected) scoresMap[id] = id === endResult.winner ? 3 : 1;
      }
      room.awardScores(scoresMap);
    }
  } catch (err) {
    console.error('[score] failed to award session scores:', err.message);
  }

  room.endGame();
  ctx.cancelRoundCountdown?.(room.code);
  cancelPhaseTimer(room.code);
  ctx.cancelBotTurn?.(room.code);
  roomGameTypes.delete(room.code);
  broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
}
