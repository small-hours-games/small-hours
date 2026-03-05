'use strict';

const SpyGame = require('./game');
const path = require('path');

// Maps room code → SpyGame instance
const games = new Map();

// ─── Handlers for WebSocket messages ───────────────────────────────────────

const handlers = {
  SEND_CLUE: (ws, msg, room) => {
    const username = room.wsToUsername.get(ws);
    if (!username) return;

    const game = games.get(room.code);
    if (!game) return;

    const success = game.receiveClue(username, msg.clue);
    if (success) {
      // Broadcast clue to all players and displays
      const state = game.getState();
      const broadcast = {
        type: 'CLUE_RECEIVED',
        username,
        clue: msg.clue,
        gameState: state
      };

      // Send to all players
      for (const socket of room.playerSockets) {
        socket.send(JSON.stringify(broadcast));
      }

      // Send to all displays
      for (const socket of room.displaySockets) {
        socket.send(JSON.stringify(broadcast));
      }
    }
  },

  SEND_GUESS: (ws, msg, room) => {
    const username = room.wsToUsername.get(ws);
    if (!username) return;

    const game = games.get(room.code);
    if (!game) return;

    const success = game.receiveGuess(username, msg.guess);
    if (success) {
      // Broadcast guess to all players and displays
      const state = game.getState();
      const broadcast = {
        type: 'GUESS_RECEIVED',
        username,
        gameState: state
      };

      // Send to all players
      for (const socket of room.playerSockets) {
        socket.send(JSON.stringify(broadcast));
      }

      // Send to all displays
      for (const socket of room.displaySockets) {
        socket.send(JSON.stringify(broadcast));
      }
    }
  }
};

// ─── API Routes ───────────────────────────────────────────────────────────

const routes = {
  '/api/spy/state': (req, res, roomCode) => {
    const game = games.get(roomCode);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    res.json(game.getState());
  }
};

// ─── Game start handler ───────────────────────────────────────────────────

function onStartGame(room) {
  // Create new SpyGame instance
  const game = new SpyGame(room.players);

  // Store in games map
  games.set(room.code, game);

  // Start game loop (update every 100ms)
  let updateInterval = setInterval(() => {
    if (!games.has(room.code)) {
      clearInterval(updateInterval);
      return;
    }

    game.update();

    // Broadcast current state to all players and displays
    const state = game.getState();
    const message = {
      type: 'GAME_STATE',
      gameState: state
    };

    const messageStr = JSON.stringify(message);

    // Send to all players
    for (const socket of room.playerSockets) {
      try {
        socket.send(messageStr);
      } catch (e) {
        // Socket closed
      }
    }

    // Send to all displays
    for (const socket of room.displaySockets) {
      try {
        socket.send(messageStr);
      } catch (e) {
        // Socket closed
      }
    }

    // Clean up when game ends
    if (!game.gameRunning) {
      clearInterval(updateInterval);
      games.delete(room.code);
    }
  }, 100);
}

// ─── Exports ──────────────────────────────────────────────────────────────

const publicDir = path.join(__dirname, '../public');

module.exports = {
  handlers,
  routes,
  onStartGame,
  publicDir
};
