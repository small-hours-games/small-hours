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
      // Send per-player state to each player (hides word from spy)
      for (const socket of room.playerSockets) {
        const playerName = room.wsToUsername.get(socket);
        if (!playerName) continue;
        const state = game.getState(playerName);
        const broadcast = {
          type: 'CLUE_RECEIVED',
          username,
          clue: msg.clue,
          gameState: state
        };
        try {
          socket.send(JSON.stringify(broadcast));
        } catch (e) {
          // Socket closed
        }
      }

      // Displays see a display-safe state (word visible via known non-spy)
      const displayState = game.getState(null, { display: true });
      const displayBroadcast = {
        type: 'CLUE_RECEIVED',
        username,
        clue: msg.clue,
        gameState: displayState
      };
      const displayStr = JSON.stringify(displayBroadcast);
      for (const socket of room.displaySockets) {
        try {
          socket.send(displayStr);
        } catch (e) {
          // Socket closed
        }
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
      // Send per-player state to each player (hides word from spy)
      for (const socket of room.playerSockets) {
        const playerName = room.wsToUsername.get(socket);
        if (!playerName) continue;
        const state = game.getState(playerName);
        const broadcast = {
          type: 'GUESS_RECEIVED',
          username,
          gameState: state
        };
        try {
          socket.send(JSON.stringify(broadcast));
        } catch (e) {
          // Socket closed
        }
      }

      // Displays see a display-safe state
      const displayState = game.getState(null, { display: true });
      const displayBroadcast = {
        type: 'GUESS_RECEIVED',
        username,
        gameState: displayState
      };
      const displayStr = JSON.stringify(displayBroadcast);
      for (const socket of room.displaySockets) {
        try {
          socket.send(displayStr);
        } catch (e) {
          // Socket closed
        }
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

    // API endpoint: strip sensitive fields (word + spy identity)
    const state = game.getState(null);
    const { word, spy, ...publicState } = state;
    res.json(publicState);
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

    // Send per-player state to each player (hides word from spy)
    for (const socket of room.playerSockets) {
      const username = room.wsToUsername.get(socket);
      if (!username) continue;
      const state = game.getState(username);
      const message = {
        type: 'GAME_STATE',
        gameState: state
      };
      try {
        socket.send(JSON.stringify(message));
      } catch (e) {
        // Socket closed
      }
    }

    // Displays see a display-safe state (word visible via known non-spy)
    const displayState = game.getState(null, { display: true });
    const displayMessage = {
      type: 'GAME_STATE',
      gameState: displayState
    };
    const displayStr = JSON.stringify(displayMessage);
    for (const socket of room.displaySockets) {
      try {
        socket.send(displayStr);
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
