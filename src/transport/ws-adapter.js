// Small Hours - WebSocket Adapter
// Bridges WebSocket connections to the session layer.

import { WebSocketServer } from 'ws';
import { processAction, getView, checkEnd } from '../engine/engine.js';
import { saveAnswers } from '../fetcher/question-file.js';
import { fetchCategories } from '../fetcher/cached-fetcher.js';
import { PHASE_DURATIONS as QUIZ_DURATIONS } from '../engine/games/quiz.js';
import { PHASE_DURATIONS as SPY_DURATIONS } from '../engine/games/spy.js';

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

  // --- Helpers ---

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

  // --- Message dispatch ---

  function handleMessage(ws, meta, room, msg) {
    switch (msg.type) {
      case 'JOIN_LOBBY':
        handleJoinLobby(ws, meta, room, msg);
        break;
      case 'SET_READY':
        handleSetReady(ws, meta, room, msg);
        break;
      case 'SUGGEST_GAME':
        handleSuggestGame(ws, meta, room, msg);
        break;
      case 'START_MINI_GAME':
        handleStartMiniGame(ws, meta, room, msg).catch(err => {
          send(ws, { type: 'ERROR', message: err.message });
        });
        break;
      case 'RETURN_TO_LOBBY':
        handleReturnToLobby(ws, meta, room, msg);
        break;
      case 'GAME_ACTION':
        handleGameAction(ws, meta, room, msg);
        break;
      case 'CHAT_MESSAGE':
        handleChatMessage(ws, meta, room, msg);
        break;
      case 'START_CATEGORY_VOTE':
        handleStartCategoryVote(ws, meta, room, msg).catch(err => {
          send(ws, { type: 'ERROR', message: err.message });
        });
        break;
      case 'CATEGORY_VOTE':
        handleCategoryVote(ws, meta, room, msg);
        break;
      default:
        send(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
    }
  }

  function handleJoinLobby(ws, meta, room, msg) {
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

  function handleSetReady(ws, meta, room, msg) {
    if (!meta.playerId) {
      send(ws, { type: 'ERROR', message: 'Not joined yet' });
      return;
    }
    room.setReady(meta.playerId, msg.ready);
    broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
  }

  function handleSuggestGame(ws, meta, room, msg) {
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

  async function handleStartMiniGame(ws, meta, room, msg) {
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

  function handleReturnToLobby(ws, meta, room) {
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

  function handleGameAction(ws, meta, room, msg) {
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

  function handleChatMessage(ws, meta, room, msg) {
    if (!meta.playerId) {
      send(ws, { type: 'ERROR', message: 'Not joined yet' });
      return;
    }

    if (!checkChatRateLimit(meta)) {
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

  async function handleStartCategoryVote(ws, meta, room) {
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

  function handleCategoryVote(ws, meta, room, msg) {
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

  return { wss, broadcastToRoom, sendToPlayer, hasActiveSockets };
}
