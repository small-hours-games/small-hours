// Small Hours - WebSocket Adapter
// Bridges WebSocket connections to the session layer.

import { WebSocketServer } from 'ws';
import { processAction, getView, checkEnd } from '../engine/engine.js';
import { saveAnswers } from '../fetcher/question-file.js';
import { PHASE_DURATIONS as QUIZ_DURATIONS } from '../engine/games/quiz.js';
import { PHASE_DURATIONS as SPY_DURATIONS } from '../engine/games/spy.js';
import * as lobbyHandlers from './handlers/lobby.js';
import * as gameHandlers from './handlers/game.js';
import * as chatHandlers from './handlers/chat.js';
import * as voteHandlers from './handlers/vote.js';

const GAME_PHASE_DURATIONS = {
  quiz: QUIZ_DURATIONS,
  spy: SPY_DURATIONS,
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const RATE_LIMIT_MAX = 30;          // messages per second
const RATE_LIMIT_WINDOW_MS = 1_000;
const CHAT_RATE_MAX = 3;            // chat messages per window
const CHAT_RATE_WINDOW_MS = 5_000;
const DISCONNECT_GRACE_MS = 30_000;

/**
 * Set up WebSocket handling on the given HTTP server.
 *
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {import('../session/manager.js').RoomManager} manager - room manager instance
 * @returns {{ wss: WebSocketServer, broadcastToRoom: Function, sendToPlayer: Function }}
 */
export function setupWebSocket(server, manager) {
  const wss = new WebSocketServer({ server });

  // socket -> metadata mapping
  const socketMeta = new Map();
  // playerId -> socket mapping (for targeted sends)
  const playerSockets = new Map();
  // playerId -> disconnect grace timer
  const graceTimers = new Map();
  // roomCode -> Set of sockets (tracks all connections including displays)
  const roomSockets = new Map();
  // roomCode -> phase timer handle
  const phaseTimers = new Map();
  // roomCode -> active gameType string (for timer duration lookups)
  const roomGameTypes = new Map();

  // --- Helpers ---

  function send(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function broadcastToRoom(code, message, { hostsOnly = false } = {}) {
    const payload = JSON.stringify(message);
    for (const [ws, meta] of socketMeta) {
      if (meta.roomCode === code && ws.readyState === ws.OPEN) {
        if (hostsOnly && meta.role !== 'host') continue;
        ws.send(payload);
      }
    }
  }

  function sendToPlayer(playerId, message) {
    const ws = playerSockets.get(playerId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /** Build a playerId → username map from room players */
  function getPlayerNames(room) {
    const names = {};
    for (const [id, p] of room.players) {
      names[id] = p.username;
    }
    return names;
  }

  // --- Phase timers ---

  function cancelPhaseTimer(roomCode) {
    const existing = phaseTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      phaseTimers.delete(roomCode);
    }
  }

  function schedulePhaseTimer(room, gameType) {
    cancelPhaseTimer(room.code);

    if (!room.game) return;

    const durations = GAME_PHASE_DURATIONS[gameType];
    if (!durations) return;

    const phase = room.game.state.phase;
    const duration = durations[phase];
    if (!duration) return;

    const timer = setTimeout(() => {
      phaseTimers.delete(room.code);
      if (!room.game) return;

      // Dispatch the synthetic timerExpired action
      const action = { type: 'timerExpired', phase };
      const { game: updatedGame, events } = processAction(room.game, action);
      room.game = updatedGame;
      room.lastActivity = Date.now();

      const playerNames = getPlayerNames(room);

      // Broadcast updated views to players
      for (const [id] of room.players) {
        const view = getView(room.game, id);
        sendToPlayer(id, { type: 'GAME_STATE', ...view, playerNames });
      }

      // Broadcast to host displays
      const hostView = getView(room.game, room.players.keys().next().value);
      const sharedState = { type: 'GAME_STATE', ...hostView, playerNames };
      if (events.length > 0) sharedState.events = events;
      broadcastToRoom(room.code, sharedState, { hostsOnly: true });

      // Check for game end
      const endResult = checkEnd(room.game);
      if (endResult) {
        for (const [id] of room.players) {
          const view = getView(room.game, id);
          sendToPlayer(id, { type: 'GAME_STATE', ...view, ...endResult });
        }
        broadcastToRoom(room.code, { type: 'GAME_STATE', phase: 'finished', ...endResult, playerNames }, { hostsOnly: true });

        const gameState = room.game?.state;
        if (gameState?.questions && gameState?.responses && gameState?._sourceFile) {
          saveAnswers(gameState._sourceFile, gameState.responses, playerNames).catch(() => {});
        }

        room.endGame();
        cancelPhaseTimer(room.code);
        broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
        return;
      }

      // Schedule next phase timer
      schedulePhaseTimer(room, gameType);
    }, duration);

    if (timer.unref) timer.unref();
    phaseTimers.set(room.code, timer);
  }

  // --- Rate limiting ---

  function checkRateLimit(meta) {
    const now = Date.now();
    meta.messageTimestamps = (meta.messageTimestamps || [])
      .filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (meta.messageTimestamps.length >= RATE_LIMIT_MAX) {
      return false;
    }
    meta.messageTimestamps.push(now);
    return true;
  }

  function checkChatRateLimit(meta) {
    const now = Date.now();
    meta.chatTimestamps = (meta.chatTimestamps || [])
      .filter(t => now - t < CHAT_RATE_WINDOW_MS);
    if (meta.chatTimestamps.length >= CHAT_RATE_MAX) {
      return false;
    }
    meta.chatTimestamps.push(now);
    return true;
  }

  // --- Heartbeat ---

  const heartbeat = setInterval(() => {
    for (const [ws, meta] of socketMeta) {
      if (!meta.alive) {
        ws.terminate();
        continue;
      }
      meta.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  if (heartbeat.unref) heartbeat.unref();

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  // --- Connection handling ---

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Expected: /ws/host/:code or /ws/player/:code
    if (pathParts.length < 3 || pathParts[0] !== 'ws') {
      send(ws, { type: 'ERROR', message: 'Invalid connection path' });
      ws.close(4000, 'Invalid path');
      return;
    }

    const role = pathParts[1];  // 'host' or 'player'
    const code = pathParts[2].toUpperCase();

    if (role !== 'host' && role !== 'player') {
      send(ws, { type: 'ERROR', message: 'Invalid role. Use host or player.' });
      ws.close(4001, 'Invalid role');
      return;
    }

    const room = manager.getRoom(code);
    if (!room) {
      send(ws, { type: 'ERROR', message: 'Room not found' });
      ws.close(4004, 'Room not found');
      return;
    }

    const meta = {
      roomCode: code,
      playerId: null,
      role,
      alive: true,
      messageTimestamps: [],
      chatTimestamps: [],
    };
    socketMeta.set(ws, meta);

    // Track socket in room's socket set
    if (!roomSockets.has(code)) roomSockets.set(code, new Set());
    roomSockets.get(code).add(ws);

    ws.on('pong', () => {
      meta.alive = true;
    });

    // Send appropriate welcome message
    if (role === 'host') {
      send(ws, { type: 'DISPLAY_OK', roomCode: code, state: room.getState() });
    }
    send(ws, { type: 'LOBBY_UPDATE', state: room.getState() });

    ws.on('message', (data) => {
      meta.alive = true;

      if (!checkRateLimit(meta)) {
        send(ws, { type: 'ERROR', message: 'Rate limit exceeded' });
        return;
      }

      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        send(ws, { type: 'ERROR', message: 'Invalid JSON' });
        return;
      }

      if (!msg || !msg.type) {
        send(ws, { type: 'ERROR', message: 'Missing message type' });
        return;
      }

      handleMessage(ws, meta, room, msg);
    });

    ws.on('close', () => {
      handleDisconnect(ws, meta, room);
      socketMeta.delete(ws);
      const sockets = roomSockets.get(code);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) roomSockets.delete(code);
      }
    });

    ws.on('error', () => {
      // Error will trigger close, handled above
    });
  });

  // --- Context object passed to all handlers ---

  function makeCtx() {
    return {
      send,
      broadcastToRoom,
      sendToPlayer,
      playerSockets,
      graceTimers,
      phaseTimers,
      roomGameTypes,
      schedulePhaseTimer,
      cancelPhaseTimer,
      getPlayerNames,
      checkChatRateLimit,
    };
  }

  // --- Message dispatch ---

  function handleMessage(ws, meta, room, msg) {
    const ctx = makeCtx();
    switch (msg.type) {
      case 'JOIN_LOBBY':
        lobbyHandlers.handleJoinLobby(ws, meta, room, msg, ctx);
        break;
      case 'SET_READY':
        lobbyHandlers.handleSetReady(ws, meta, room, msg, ctx);
        break;
      case 'SUGGEST_GAME':
        lobbyHandlers.handleSuggestGame(ws, meta, room, msg, ctx);
        break;
      case 'START_MINI_GAME':
        gameHandlers.handleStartMiniGame(ws, meta, room, msg, ctx).catch(err => {
          send(ws, { type: 'ERROR', message: err.message });
        });
        break;
      case 'RETURN_TO_LOBBY':
        lobbyHandlers.handleReturnToLobby(ws, meta, room, msg, ctx);
        break;
      case 'GAME_ACTION':
        gameHandlers.handleGameAction(ws, meta, room, msg, ctx);
        break;
      case 'CHAT_MESSAGE':
        chatHandlers.handleChatMessage(ws, meta, room, msg, ctx);
        break;
      case 'START_CATEGORY_VOTE':
        voteHandlers.handleStartCategoryVote(ws, meta, room, msg, ctx).catch(err => {
          send(ws, { type: 'ERROR', message: err.message });
        });
        break;
      case 'CATEGORY_VOTE':
        voteHandlers.handleCategoryVote(ws, meta, room, msg, ctx);
        break;
      default:
        send(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
    }
  }

  // --- Disconnect handling ---

  function handleDisconnect(ws, meta, room) {
    const { playerId } = meta;
    if (!playerId) return;

    playerSockets.delete(playerId);

    // Mark player as disconnected
    const player = room.players.get(playerId);
    if (player) {
      player.connected = false;
      player.lastSeen = Date.now();
      broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
    }

    // Start grace period - remove player after timeout
    const timer = setTimeout(() => {
      graceTimers.delete(playerId);
      const currentPlayer = room.players.get(playerId);
      if (currentPlayer && !currentPlayer.connected) {
        room.removePlayer(playerId);
        broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
      }
    }, DISCONNECT_GRACE_MS);

    if (timer.unref) timer.unref();
    graceTimers.set(playerId, timer);
  }

  function hasActiveSockets(code) {
    const sockets = roomSockets.get(code);
    return sockets ? sockets.size > 0 : false;
  }

  return { wss, broadcastToRoom, sendToPlayer, hasActiveSockets };
}
