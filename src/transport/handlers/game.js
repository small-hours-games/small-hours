// Small Hours - Game message handlers

import { processAction, getView, checkEnd } from '../../engine/engine.js';
import { saveAnswers } from '../../fetcher/question-file.js';

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

  let config = msg.config || {};

  // Quiz: resolve winning category from votes if no explicit override (per D-12, D-16)
  if (msg.gameType === 'quiz' && room.votingActive && !config.categoryId) {
    config = { ...config, categoryId: room.resolveWinningCategory() };
  }

  try {
    const game = await room.startGame(msg.gameType, config);
    broadcastToRoom(room.code, {
      type: 'MINI_GAME_STARTING',
      gameType: msg.gameType,
      gameId: game.id,
    });

    // Send initial game state to each player
    const pNames = getPlayerNames(room);
    for (const [id] of room.players) {
      const view = getView(room.game, id);
      sendToPlayer(id, { type: 'GAME_STATE', ...view, gameType: msg.gameType, playerNames: pNames });
    }
    // Also broadcast to host displays
    broadcastToRoom(room.code, { type: 'GAME_STATE', gameType: msg.gameType, phase: room.game.state.phase, playerNames: pNames }, { hostsOnly: true });

    // Schedule phase timer for timer-driven games
    roomGameTypes.set(room.code, msg.gameType);
    schedulePhaseTimer(room, msg.gameType);
  } catch (err) {
    send(ws, { type: 'ERROR', message: err.message });
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
  const { send, broadcastToRoom, sendToPlayer, roomGameTypes, schedulePhaseTimer, cancelPhaseTimer, getPlayerNames } = ctx;

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

  const action = { ...msg.action, playerId: meta.playerId };
  const { game: updatedGame, events } = processAction(room.game, action);
  room.game = updatedGame;
  room.lastActivity = Date.now();

  const playerNames = getPlayerNames(room);

  // Send per-player views (flattened into GAME_STATE)
  for (const [id] of room.players) {
    const view = getView(room.game, id);
    sendToPlayer(id, { type: 'GAME_STATE', ...view, playerNames });
  }

  // Broadcast shared state to host displays only (not players — they got personal views above)
  const hostView = getView(room.game, room.players.keys().next().value);
  const sharedState = { type: 'GAME_STATE', ...hostView, playerNames };
  delete sharedState.myHand;
  delete sharedState.myFaceUp;
  delete sharedState.myFaceDownCount;
  delete sharedState.myFaceDownIds;
  delete sharedState.myGuesses;
  delete sharedState.isMyTurn;
  delete sharedState.swapConfirmed;
  if (events.length > 0) sharedState.events = events;
  broadcastToRoom(room.code, sharedState, { hostsOnly: true });

  // Reschedule phase timer if phase changed due to player action
  const activeGameType = roomGameTypes.get(room.code);
  if (activeGameType) {
    schedulePhaseTimer(room, activeGameType);
  }

  // Check for game end
  const endResult = checkEnd(room.game);
  if (endResult) {
    // Send final views with end result
    for (const [id] of room.players) {
      const view = getView(room.game, id);
      sendToPlayer(id, { type: 'GAME_STATE', ...view, ...endResult });
    }
    broadcastToRoom(room.code, { type: 'GAME_STATE', phase: 'finished', ...endResult, playerNames }, { hostsOnly: true });

    // Save question-form answers to file
    const gameState = room.game?.state;
    if (gameState?.questions && gameState?.responses && gameState?._sourceFile) {
      saveAnswers(gameState._sourceFile, gameState.responses, playerNames).catch(() => {});
    }

    room.endGame();
    cancelPhaseTimer(room.code);
    roomGameTypes.delete(room.code);
    broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
  }
}
