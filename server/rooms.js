'use strict';

// ─── Room registry ────────────────────────────────────────────────────────────

const rooms = new Map();

const AVATARS = ['🦊','🐸','🐼','🦁','🐯','🦋','🐨','🐧','🦄','🐙',
                 '🦖','🐻','🦀','🦩','🐬','🦝','🦔','🦦','🦜','🐳'];

function nameToAvatar(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATARS[h % AVATARS.length];
}

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
    shitheadGame: null,
    playerSockets: new Set(),
    displaySockets: new Set(),
    wsToUsername: new Map(),           // ws → username
    players: new Map(),                // username → { ws, isReady, avatar }
    gameSuggestions: new Map(),        // username → gameType
    readyPlayers: new Set(),
    language: 'en',
    categoryVotes: new Map(),          // username → [catId, ...]
    chatHistory: [],                   // recent messages (last 50)
    chatRateLimit: new Map(),          // username → { count, resetTime }
    createdAt: Date.now(),
    _broadcast: broadcast,
  });
  return rooms.get(code);
}

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
    chatHistory: room.chatHistory,
  };
}

module.exports = { rooms, AVATARS, nameToAvatar, generateRoomCode, createRoom, buildLobbyState };
