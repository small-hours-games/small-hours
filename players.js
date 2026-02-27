'use strict';

const { rooms, broadcastAll, broadcastLobbyUpdate, broadcastVoteUpdate } = require('./rooms');

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATARS = ['🦊','🐸','🐼','🦁','🐯','🦋','🐨','🐧','🦄','🐙',
                 '🦖','🐻','🦀','🦩','🐬','🦝','🦔','🦦','🦜','🐳'];

function nameToAvatar(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATARS[h % AVATARS.length];
}

// ─── Room cleanup ─────────────────────────────────────────────────────────────

function maybeCleanupRoom(room) {
  const totalSockets = room.playerSockets.size + room.displaySockets.size;
  const idle = room.activeMiniGame === 'lobby' ||
    (room.game && room.game.state === 'GAME_OVER') ||
    (room.shitheadGame && room.shitheadGame.state === 'GAME_OVER');
  if (totalSockets === 0 && idle) {
    // Grace period: players navigating between pages temporarily have 0 sockets.
    // Wait 30s before deleting so back-to-lobby transitions don't destroy the room.
    clearTimeout(room._cleanupTimer);
    room._cleanupTimer = setTimeout(() => {
      if (room.playerSockets.size + room.displaySockets.size === 0) {
        rooms.delete(room.code);
        console.log(`[Room ${room.code}] Deleted after 30s idle.`);
      }
    }, 30_000);
  } else {
    clearTimeout(room._cleanupTimer);
  }
}

// ─── Player disconnect handler ────────────────────────────────────────────────

function handlePlayerDisconnect(ws, room) {
  const username = room.wsToUsername.get(ws);
  room.wsToUsername.delete(ws);

  if (!username) {
    maybeCleanupRoom(room);
    return;
  }

  // If the player already reconnected with a new WS (e.g. navigating between
  // pages), ignore this stale close so we don't delete them or hand off admin.
  const currentEntry = room.players.get(username);
  if (currentEntry && currentEntry.ws !== ws) {
    maybeCleanupRoom(room);
    return;
  }

  const wasLobby = room.activeMiniGame === 'lobby';

  if (wasLobby) {
    // During a game→lobby transition players are navigating and will reconnect
    // shortly — skip all deletion and handoff so room.players stays intact.
    if (!room._returningFromGame) {
      room.players.delete(username);
      room.readyPlayers.delete(username);
      room.gameSuggestions.delete(username);
      room.categoryVotes.delete(username);

      // Hand off admin if the admin truly left
      if (username === room.adminUsername) {
        const nextAdmin = [...room.players.keys()][0];
        if (nextAdmin) {
          room.adminUsername = nextAdmin;
          broadcastAll(room, { type: 'ADMIN_CHANGED', newAdmin: nextAdmin });
        }
      }
    }

    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
    broadcastLobbyUpdate(room);
    broadcastVoteUpdate(room);
  } else {
    // In game: null ws, keep score (existing Game behaviour)
    if (room.game) room.game.removePlayer(ws);
    if (room.shitheadGame) room.shitheadGame.removePlayer(ws);
  }

  maybeCleanupRoom(room);
}

module.exports = {
  AVATARS,
  nameToAvatar,
  handlePlayerDisconnect,
  maybeCleanupRoom,
};
