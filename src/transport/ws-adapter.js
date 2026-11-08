// Small Hours - WebSocket Adapter
// Bridges WebSocket connections to the session layer.

import { WebSocketServer } from 'ws';
import { processAction, getView, checkEnd } from '../engine/engine.js';
import * as lobbyHandlers from './handlers/lobby.js';
import * as gameHandlers from './handlers/game.js';
import * as chatHandlers from './handlers/chat.js';
import * as voteHandlers from './handlers/vote.js';
import { getHostView } from './host-view.js';
import { nextBotAction } from '../engine/bots/index.js';
import { getGame } from '../games/registry.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const RATE_LIMIT_MAX = 30;          // messages per second
const RATE_LIMIT_WINDOW_MS = 1_000;
const CHAT_RATE_MAX = 3;            // chat messages per window
const CHAT_RATE_WINDOW_MS = 5_000;
const DISCONNECT_GRACE_MS = 30_000;
const BOT_MOVE_DELAY_MS = 1_100;    // AI pause per move, so the table can be followed
const BOT_SWAP_DELAY_MS = 400;
const BOT_FAST_DELAY_MS = 450;      // every person is out; bots finish the game

/**
 * Set up WebSocket handling on the given HTTP server.
 *
 * @param {import('http').Server} server - HTTP server to attach to
 * @param {import('../session/manager.js').RoomManager} manager - room manager instance
 * @returns {{ wss: WebSocketServer, broadcastToRoom: Function, sendToPlayer: Function }}
 */
export function setupWebSocket(server, manager) {
  // Limit frame size to 1MB to prevent message-size DoS (ws default ~100MB).
  const wss = new WebSocketServer({ server, maxPayload: 1_048_576 });

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
  // roomCode -> pending AI move timer
  const botTimers = new Map();

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
    for (const bot of room.bots || []) {
      names[bot.playerId] = bot.username;
    }
    return names;
  }

  /**
   * Award session scores based on a game's endResult.
   * - If endResult.scores is a { [playerId]: number } map, pass it directly.
   * - If only endResult.winner exists, award 3 points to the winner and 1 to all other connected players.
   * - If neither exists, skip scoring.
   */
  function applyEndResultScores(room, endResult) {
    if (endResult.scores && typeof endResult.scores === 'object') {
      room.awardScores(endResult.scores);
    } else if (typeof endResult.winner === 'string') {
      const scoresMap = {};
      for (const [id, p] of room.players) {
        if (p.connected) {
          scoresMap[id] = id === endResult.winner ? 3 : 1;
        }
      }
      room.awardScores(scoresMap);
    }
  }

  // --- Phase timers ---

  function cancelPhaseTimer(roomCode) {
    const existing = phaseTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      phaseTimers.delete(roomCode);
    }
  }

  function schedulePhaseTimer(room, gameType, { force = false } = {}) {
    if (!force) {
      // Don't reset an already-running timer for the same phase. A GAME_ACTION
      // re-enters here on every player move; rescheduling would restart the
      // countdown to full each time, stalling timed phases forever
      // while players keep acting. Only reschedule when the phase changed.
      const current = phaseTimers.get(room.code);
      if (current && current.phase === room.game?.state.phase) {
        return;
      }
    }
    cancelPhaseTimer(room.code);

    if (!room.game) return;

    const durations = getGame(gameType)?.phases;
    if (!durations) return;

    const phase = room.game.state.phase;
    const duration = durations[phase];
    if (!duration) return;

    const timer = setTimeout(() => {
      phaseTimers.delete(room.code);
      if (!room.game) return;
      try {
        advancePhase(room, gameType, phase);
      } catch (err) {
        // A throwing timer used to leave the game frozen forever. End it instead.
        console.error(`[timer] ${gameType} ${phase} failed in room ${room.code}:`, err);
        cancelPhaseTimer(room.code);
        roomGameTypes.delete(room.code);
        room.endGame();
        broadcastToRoom(room.code, { type: 'ERROR', message: 'The game hit a problem and was stopped' });
        broadcastToRoom(room.code, { type: 'LOBBY_UPDATE', state: room.getState() });
      }
    }, duration);

    timer.phase = phase;
    timer.endsAt = Date.now() + duration;
    timer.total = duration;
    if (timer.unref) timer.unref();
    phaseTimers.set(room.code, timer);
  }

  /**
   * Time left in the current timed phase, for clients' countdowns. Relative seconds
   * (not a deadline) so phone/TV clock differences don't matter. Empty when untimed.
   */
  function timing(room) {
    const timer = phaseTimers.get(room.code);
    if (!timer || !room.game || timer.phase !== room.game.state.phase) return {};
    const left = Math.max(0, timer.endsAt - Date.now());
    return { timeLeft: Math.round(left / 100) / 10, timeTotal: timer.total / 1000 };
  }

  // One timer step: dispatch timerExpired, schedule the next phase, broadcast, or end
  function advancePhase(room, gameType, phase) {
    // Dispatch the synthetic timerExpired action
    const action = { type: 'timerExpired', phase };
    const { game: updatedGame, events } = processAction(room.game, action);
    room.game = updatedGame;
    room.lastActivity = Date.now();

    // Timer-driven games (quiz) end on their last timer, not on a player action
    const endResult = checkEnd(room.game);
    // Schedule first so the broadcast carries the new phase's time left
    if (!endResult) schedulePhaseTimer(room, gameType, { force: true });

    const playerNames = getPlayerNames(room);
    const clock = timing(room);

    // Broadcast updated views to players
    for (const [id] of room.players) {
      const view = getView(room.game, id);
      sendToPlayer(id, { type: 'GAME_STATE', ...view, ...clock, playerNames });
    }

    // Broadcast to host displays
    const hostView = getHostView(room.game, room.players.keys().next().value);
    const sharedState = { type: 'GAME_STATE', ...hostView, ...clock, playerNames };
    if (events.length > 0) sharedState.events = events;
    broadcastToRoom(room.code, sharedState, { hostsOnly: true });

    if (endResult) gameHandlers.finishGame(room, endResult, ctx);
  }

  // --- AI seats ---
  // After every state change, if an AI seat has a move, play it after a short
  // pause so people can follow it on the TV. One pending move per room.

  function cancelBotTurn(roomCode) {
    const existing = botTimers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      botTimers.delete(roomCode);
    }
  }

  function scheduleBotTurn(room) {
    cancelBotTurn(room.code);
    if (!room.game || !room.bots?.length) return;
    const gameType = room.gameType;
    const botIds = room.bots.map(b => b.playerId);
    if (!nextBotAction(gameType, room.game.state, botIds)) return;

    const gameId = room.game.id;
    // Swaps are quick; once every person is out (Palace), the bots finish fast.
    const humansLeft = room.game.state.finishOrder
      ? room.game.state.players.some(id => !botIds.includes(id) && !room.game.state.finishOrder.includes(id))
      : true;
    const state = room.game.state;
    const delay = state.phase === 'swap' ? BOT_SWAP_DELAY_MS
      : !humansLeft ? BOT_FAST_DELAY_MS
      : getGame(gameType)?.ai?.delay?.(state) ?? BOT_MOVE_DELAY_MS;

    const timer = setTimeout(() => {
      botTimers.delete(room.code);
      if (!room.game || room.game.id !== gameId || manager.getRoom(room.code) !== room) return;
      const action = nextBotAction(gameType, room.game.state, botIds);
      if (!action) return;
      try {
        const before = room.game.state;
        const events = gameHandlers.applyGameAction(room, action, ctx);
        if (room.game && room.game.state === before && events.some(e => e.type === 'error')) {
          // An illegal bot move would otherwise retry forever.
          cancelBotTurn(room.code);
          console.error(`[bot] ${gameType} ${action.playerId} made an illegal move:`, events.find(e => e.type === 'error').message);
        }
      } catch (err) {
        console.error('[bot] move failed:', err.message);
      }
    }, delay);
    botTimers.set(room.code, timer);
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
    for (const timer of botTimers.values()) clearTimeout(timer);
    botTimers.clear();
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

    const role = pathParts[1];  // 'host', 'player', or 'observer'
    const code = pathParts[2].toUpperCase();

    if (role !== 'host' && role !== 'player' && role !== 'observer') {
      send(ws, { type: 'ERROR', message: 'Invalid role. Use host, player, or observer.' });
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

    // A TV (re)connecting mid-game gets the running game straight away, not the lobby
    if (role === 'host' && room.game && room.gameType) {
      const firstPlayer = room.players.keys().next().value;
      send(ws, { type: 'MINI_GAME_STARTING', gameType: room.gameType, resume: true });
      send(ws, {
        type: 'GAME_STATE',
        ...getHostView(room.game, firstPlayer),
        ...timing(room),
        gameType: room.gameType,
        playerNames: getPlayerNames(room),
      });
    }

    // Observer: wait for JOIN_OBSERVER to register; handled in message dispatch

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
      timing,
      scheduleBotTurn,
      cancelBotTurn,
      getPlayerNames,
      checkChatRateLimit,
    };
  }
  const ctx = makeCtx();

  // --- Message dispatch ---

  const OBSERVER_BLOCKED_TYPES = new Set([
    'GAME_ACTION',
    'SET_READY',
    'START_MINI_GAME',
    'START_VOTED_GAME',
    'SUGGEST_GAME',
    'SET_AVATAR',
    'RETURN_TO_LOBBY',
    'START_CATEGORY_VOTE',
    'CATEGORY_VOTE',
  ]);

  function handleMessage(ws, meta, room, msg) {
    // Block observers from sending game-altering messages
    if (meta.role === 'observer' && OBSERVER_BLOCKED_TYPES.has(msg.type)) {
      send(ws, { type: 'ERROR', message: 'Observers cannot perform this action' });
      return;
    }

    switch (msg.type) {
      case 'PING':
        // Phones check their line with this and time the round trip; answer at once.
        send(ws, { type: 'PONG', t: typeof msg.t === 'number' ? msg.t : null });
        break;
      case 'JOIN_LOBBY':
        lobbyHandlers.handleJoinLobby(ws, meta, room, msg, ctx);
        break;
      case 'JOIN_OBSERVER':
        handleJoinObserver(ws, meta, room, msg);
        break;
      case 'SET_READY':
        lobbyHandlers.handleSetReady(ws, meta, room, msg, ctx);
        break;
      case 'SUGGEST_GAME':
        lobbyHandlers.handleSuggestGame(ws, meta, room, msg, ctx);
        break;
      case 'SET_AVATAR':
        lobbyHandlers.handleSetAvatar(ws, meta, room, msg, ctx);
        break;
      case 'START_MINI_GAME':
        gameHandlers.handleStartMiniGame(ws, meta, room, msg, ctx).catch(err => {
          send(ws, { type: 'ERROR', message: err.message });
        });
        break;
      case 'START_VOTED_GAME':
        gameHandlers.handleStartVotedGame(ws, meta, room, msg, ctx).catch(err => {
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
    // Observer disconnects: remove immediately, no grace timer
    if (meta.role === 'observer') {
      if (meta.observerId) {
        room.removeObserver(meta.observerId);
      }
      return;
    }

    const { playerId } = meta;
    if (!playerId) return;
    // A refreshed page may reconnect before its old socket closes.
    if (playerSockets.get(playerId) !== ws) return;

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
