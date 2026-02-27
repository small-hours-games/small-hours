'use strict';

const { Game } = require('./game');
const { ShitheadGame } = require('./shithead');

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATARS = ['🦊','🐸','🐼','🦁','🐯','🦋','🐨','🐧','🦄','🐙',
                 '🦖','🐻','🦀','🦩','🐬','🦝','🦔','🦦','🦜','🐳'];

function nameToAvatar(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATARS[h % AVATARS.length];
}

// ─── Internal broadcast helpers ───────────────────────────────────────────────

function _sendTo(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function _broadcastAll(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of [...room.playerSockets, ...room.displaySockets]) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function _broadcastToDisplays(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of room.displaySockets) {
    if (ws.readyState === 1) ws.send(s);
  }
}

// ─── Lobby state ──────────────────────────────────────────────────────────────

function buildLobbyState(room) {
  const players = [];
  for (const [username, p] of room.players.entries()) {
    players.push({
      username,
      avatar: p.avatar,
      isReady: room.readyPlayers.has(username),
      isAdmin: username === room.adminUsername,
    });
  }

  const gameSuggestions = {};
  for (const gameType of room.gameSuggestions.values()) {
    gameSuggestions[gameType] = (gameSuggestions[gameType] || 0) + 1;
  }

  const readyCount = room.readyPlayers.size;
  const totalCount = room.players.size;
  const allReady   = totalCount > 0 && readyCount >= totalCount;

  const voteTally = {};
  for (const cats of room.categoryVotes.values()) {
    for (const c of cats) voteTally[c] = (voteTally[c] || 0) + 1;
  }
  const allVoted = totalCount > 0 && room.categoryVotes.size >= totalCount;

  return {
    players,
    admin: room.adminUsername,
    gameSuggestions,
    readyCount,
    totalCount,
    allReady,
    allVoted,
    votedCount: room.categoryVotes.size,
    categoryVotes: voteTally,
    votedPlayers: [...room.categoryVotes.keys()],
    activeMiniGame: room.activeMiniGame,
    language: room.language,
  };
}

function broadcastLobbyUpdate(room) {
  _broadcastAll(room, { type: 'LOBBY_UPDATE', ...buildLobbyState(room) });
}

function broadcastVoteUpdate(room) {
  const tally = {};
  for (const cats of room.categoryVotes.values()) {
    for (const c of cats) tally[c] = (tally[c] || 0) + 1;
  }
  const totalPlayers = room.players.size;
  const allVoted = totalPlayers > 0 && room.categoryVotes.size >= totalPlayers;
  _broadcastAll(room, {
    type: 'VOTE_UPDATE',
    votes: tally,
    voted: [...room.categoryVotes.keys()],
    totalPlayers,
    allVoted,
  });
}

// ─── Player CRUD ──────────────────────────────────────────────────────────────

/**
 * Handle JOIN / JOIN_LOBBY messages from a player WebSocket.
 */
function handleJoin(ws, msg, room) {
  clearTimeout(room._cleanupTimer);
  if ((msg.username || '').trim() === room.adminUsername) {
    room._returningFromGame = false;
  }

  const username = (msg.username || '').trim().slice(0, 20);
  if (!username) {
    _sendTo(ws, { type: 'ERROR', code: 'INVALID_USERNAME', message: 'Username required.' });
    return;
  }

  if (room.players.size === 0) {
    room.adminUsername = username;
  }

  const avatar = nameToAvatar(username);
  room.players.set(username, { ws, isReady: false, avatar });
  room.wsToUsername.set(ws, username);

  if (!room.game) {
    room.game = new Game(room._broadcast);
  }
  const result = room.game.addPlayer(ws, username);

  if (room.activeMiniGame === 'shithead' && room.shitheadGame) {
    room.shitheadGame.addPlayer(ws, username);
  }

  const isAdmin    = username === room.adminUsername;
  const gameRunning = !!(room.game && room.game.state !== 'LOBBY');
  _sendTo(ws, { type: 'JOIN_OK', username, isAdmin, roomCode: room.code, avatar, lang: room.language, gameRunning });

  if (!result.ok) {
    _sendTo(ws, { type: 'ERROR', code: result.code, message: result.message });
  }

  broadcastLobbyUpdate(room);
  broadcastVoteUpdate(room);

  const playerNames = [...room.players.keys()];
  _broadcastToDisplays(room, { type: 'PLAYER_JOINED', players: playerNames, playerCount: room.players.size });
}

/**
 * Handle a player WebSocket closing (disconnect or page navigation).
 * @param {function(room): void} maybeCleanupRoom  — room-lifecycle hook from server.js
 */
function handleDisconnect(ws, room, maybeCleanupRoom) {
  const username = room.wsToUsername.get(ws);
  room.wsToUsername.delete(ws);

  if (!username) {
    maybeCleanupRoom(room);
    return;
  }

  const currentEntry = room.players.get(username);
  if (currentEntry && currentEntry.ws !== ws) {
    maybeCleanupRoom(room);
    return;
  }

  const wasLobby = room.activeMiniGame === 'lobby';

  if (wasLobby) {
    if (!room._returningFromGame) {
      room.players.delete(username);
      room.readyPlayers.delete(username);
      room.gameSuggestions.delete(username);
      room.categoryVotes.delete(username);

      if (username === room.adminUsername) {
        const nextAdmin = [...room.players.keys()][0];
        if (nextAdmin) {
          room.adminUsername = nextAdmin;
          _broadcastAll(room, { type: 'ADMIN_CHANGED', newAdmin: nextAdmin });
        }
      }
    }

    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
    broadcastLobbyUpdate(room);
    broadcastVoteUpdate(room);
  } else {
    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
  }

  maybeCleanupRoom(room);
}

// ─── Player state management ──────────────────────────────────────────────────

function handleSetReady(ws, msg, room) {
  const username = room.wsToUsername.get(ws);
  if (!username) return;
  if (msg.ready) {
    room.readyPlayers.add(username);
  } else {
    room.readyPlayers.delete(username);
  }
  broadcastLobbyUpdate(room);
}

function handleSuggestGame(ws, msg, room) {
  const username = room.wsToUsername.get(ws);
  if (!username) return;
  const gameType = msg.gameType;
  if (!['quiz', 'shithead'].includes(gameType)) return;
  room.gameSuggestions.set(username, gameType);
  broadcastLobbyUpdate(room);
}

function handleCategoryVote(ws, msg, room) {
  if (room.activeMiniGame !== 'lobby') return;
  const username = room.wsToUsername.get(ws);
  if (!username) return;
  const cats = Array.isArray(msg.categories)
    ? msg.categories.slice(0, 3).map(Number).filter(n => Number.isInteger(n) && n > 0)
    : [];
  if (cats.length === 0) return;
  room.categoryVotes.set(username, cats);
  broadcastLobbyUpdate(room);
  broadcastVoteUpdate(room);
}

// ─── Session / admin control ──────────────────────────────────────────────────

function handleRemovePlayer(ws, msg, room) {
  const requester = room.wsToUsername.get(ws);
  if (requester !== room.adminUsername) {
    _sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can remove players.' });
    return;
  }
  const target = msg.username;
  const targetPlayer = room.players.get(target);
  if (targetPlayer && targetPlayer.ws) {
    _sendTo(targetPlayer.ws, { type: 'PLAYER_REMOVED', username: target });
    targetPlayer.ws.close();
  }
}

function handleReturnToLobby(ws, room) {
  const username = room.wsToUsername.get(ws);
  if (username !== room.adminUsername) {
    _sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can return to lobby.' });
    return;
  }
  if (room.game) room.game.restart();
  if (room.shitheadGame) { room.shitheadGame = null; }
  room.categoryVotes.clear();
  room.readyPlayers.clear();
  room.gameSuggestions.clear();
  room.activeMiniGame = 'lobby';
  room._returningFromGame = true;
  broadcastLobbyUpdate(room);
  _broadcastAll(room, { type: 'RESTARTED' });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  AVATARS,
  nameToAvatar,
  buildLobbyState,
  broadcastLobbyUpdate,
  broadcastVoteUpdate,
  handleJoin,
  handleDisconnect,
  handleSetReady,
  handleSuggestGame,
  handleCategoryVote,
  handleRemovePlayer,
  handleReturnToLobby,
};
