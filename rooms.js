'use strict';

// ─── Room registry ───────────────────────────────────────────────────────────

const rooms = new Map();

// ─── Room code generator ─────────────────────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

function broadcastAll(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of [...room.playerSockets, ...room.displaySockets]) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function broadcastToDisplays(room, msg) {
  const s = JSON.stringify(msg);
  for (const ws of room.displaySockets) {
    if (ws.readyState === 1) ws.send(s);
  }
}

function sendTo(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ─── Room creation ────────────────────────────────────────────────────────────

function createRoomBroadcast(roomCode) {
  return (msg, targetWs) => {
    const str = JSON.stringify(msg);
    if (targetWs) {
      if (targetWs.readyState === 1) targetWs.send(str);
      return;
    }
    const room = rooms.get(roomCode);
    if (!room) return;
    for (const ws of [...room.playerSockets, ...room.displaySockets]) {
      if (ws.readyState === 1) ws.send(str);
    }
  };
}

function createRoom(code) {
  const broadcast = createRoomBroadcast(code);
  rooms.set(code, {
    code,
    adminUsername: null,
    activeMiniGame: 'lobby',
    game: null,                        // lazy-created on first JOIN_LOBBY
    playerSockets: new Set(),
    displaySockets: new Set(),
    wsToUsername: new Map(),           // ws → username
    players: new Map(),                // username → { ws, isReady, avatar }
    gameSuggestions: new Map(),        // username → gameType
    readyPlayers: new Set(),
    language: 'en',
    categoryVotes: new Map(),          // username → [catId, ...]
    createdAt: Date.now(),
    _broadcast: broadcast,
  });
  return rooms.get(code);
}

// ─── Lobby helpers ────────────────────────────────────────────────────────────

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

  // Tally game suggestions
  const gameSuggestions = {};
  for (const gameType of room.gameSuggestions.values()) {
    gameSuggestions[gameType] = (gameSuggestions[gameType] || 0) + 1;
  }

  const readyCount   = room.readyPlayers.size;
  const totalCount   = room.players.size;
  const allReady     = totalCount > 0 && readyCount >= totalCount;

  // Category vote tallying
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
  broadcastAll(room, { type: 'LOBBY_UPDATE', ...buildLobbyState(room) });
}

function broadcastVoteUpdate(room) {
  // Also emit legacy VOTE_UPDATE for old player/host pages
  const tally = {};
  for (const cats of room.categoryVotes.values()) {
    for (const c of cats) tally[c] = (tally[c] || 0) + 1;
  }
  const totalPlayers = room.players.size;
  const allVoted = totalPlayers > 0 && room.categoryVotes.size >= totalPlayers;
  broadcastAll(room, {
    type: 'VOTE_UPDATE',
    votes: tally,
    voted: [...room.categoryVotes.keys()],
    totalPlayers,
    allVoted,
  });
}

module.exports = {
  rooms,
  generateRoomCode,
  createRoom,
  broadcastAll,
  broadcastToDisplays,
  sendTo,
  buildLobbyState,
  broadcastLobbyUpdate,
  broadcastVoteUpdate,
};
