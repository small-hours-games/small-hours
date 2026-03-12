'use strict';

const QuizController = require('./QuizController');
const BotController = require('./BotController');
const ShiteadController = require('./ShiteadController');
const GuessController = require('../games/guess/server');
const SpyGameController = require('../games/spy/server');
const LyricsGameController = require('../games/lyrics/server');
const CAHGameController = require('../games/cah/server');
const { rooms, nameToAvatar } = require('./rooms');
const { broadcastAll, broadcastToDisplays, sendTo, broadcastLobbyUpdate, broadcastVoteUpdate } = require('./broadcast');
const Persistence = require('./persistence');

// ─── Room cleanup ─────────────────────────────────────────────────────────────

function maybeCleanupRoom(room) {
  const totalSockets = room.playerSockets.size + room.displaySockets.size;
  const idle = room.activeMiniGame === 'lobby' ||
    (room.game && room.game.phase === 'GAME_OVER') ||
    (room.shitheadGame && room.shitheadGame.phase === 'GAME_OVER');
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

// ─── Disconnect handler ───────────────────────────────────────────────────────

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

    if (room.game) room.game.removePlayer(username);
    broadcastLobbyUpdate(room);
    broadcastVoteUpdate(room);
  } else {
    // In game: keep score, remove from game
    if (room.game) room.game.removePlayer(username);
  }

  maybeCleanupRoom(room);
}

// ─── Message handler ──────────────────────────────────────────────────────────

function handleMessage(ws, role, msg, room) {
  const { type } = msg;

  // ── Display (TV / host compat) ───────────────────────────────────────────
  if (role === 'display') {
    switch (type) {
      case 'START_GAME': {
        // Compat: old host page sends START_GAME
        const totalPlayers = room.players.size;
        if (totalPlayers > 0 && room.categoryVotes.size < totalPlayers) {
          sendTo(ws, { type: 'ERROR', code: 'NOT_ALL_VOTED', message: `Waiting for votes (${room.categoryVotes.size}/${totalPlayers}).` });
          break;
        }
        const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
        const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
        const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
        if (!room.game) room.game = new QuizController(categories, gameDifficulty, questionCount);
        room.activeMiniGame = 'quiz';
        room.game.start();
        break;
      }
      case 'SKIP':
        // TODO: implement skipReveal for QuizController
        // if (room.game) room.game.skipReveal();
        break;
      case 'RESTART':
        // TODO: implement restart for QuizController
        // if (room.game) room.game.restart();
        if (room.shitheadGame) { room.shitheadGame = null; }
        room.categoryVotes.clear();
        room.readyPlayers.clear();
        room.gameSuggestions.clear();
        room.activeMiniGame = 'lobby';
        broadcastLobbyUpdate(room);
        break;
      case 'CONTINUE_GAME': {
        // TODO: implement continueGame for QuizController
        // const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
        // const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
        // const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
        // if (room.game) room.game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
        break;
      }
      case 'SET_LANGUAGE':
        if (typeof msg.lang === 'string' && /^[a-z]{2}$/.test(msg.lang)) {
          room.language = msg.lang;
          broadcastAll(room, { type: 'LANGUAGE_SET', lang: room.language });
        }
        break;
    }
    return;
  }

  // ── Player messages ───────────────────────────────────────────────────────
  switch (type) {

    case 'JOIN_LOBBY':
    case 'JOIN': {
      // Player reconnected — cancel any pending room cleanup
      clearTimeout(room._cleanupTimer);
      // If the original admin is reconnecting, clear the returning flag
      if ((msg.username || '').trim() === room.adminUsername) {
        room._returningFromGame = false;
      }
      // Input validation: sanitize username to prevent XSS or injection
      let username = (msg.username || '').trim().slice(0, 20);
      // Remove potentially dangerous characters: <, >, ", ', script tags
      username = username.replace(/[<>"']/g, '');

      if (!username) {
        sendTo(ws, { type: 'ERROR', code: 'INVALID_USERNAME', message: 'Username required.' });
        break;
      }

      // Assign admin if first player
      if (room.players.size === 0) {
        room.adminUsername = username;
      }

      const avatar = nameToAvatar(username);
      room.players.set(username, { ws, isReady: false, avatar });
      room.wsToUsername.set(ws, username);

      // Lazy-create game instance with default quiz parameters
      if (!room.game) {
        room.game = new QuizController([], 'medium', 10);
      }
      // Add player to game with default game state
      room.game.addPlayer(username, {
        score: 0,
        streak: 0,
        powerups: { doublePoints: 1, fiftyFifty: 1, timeFreeze: 1 },
        activePowerup: null,
        lastAnswerTime: null,
      });

      // Auto-manage bot: add bot if this is first human player
      const botWasAdded = BotController.maybeAddBot(room);
      if (botWasAdded) {
        room.readyPlayers.add(BotController.BOT_USERNAME);
      }

      const isAdmin = username === room.adminUsername;
      const gameRunning = !!(room.game && room.game.phase !== 'LOBBY');
      sendTo(ws, { type: 'JOIN_OK', username, isAdmin, roomCode: room.code, avatar, lang: room.language, gameRunning });

      // Reconnect to in-progress shithead game
      if (room.activeMiniGame === 'shithead' && room.shitheadGame) {
        const existingPlayer = room.shitheadGame.players.get(username);
        if (existingPlayer) {
          // Player already exists, just update WebSocket
          existingPlayer.ws = ws;
          // Send their current game state immediately
          const playerState = room.shitheadGame.getPlayerState(username);
          if (playerState) {
            sendTo(ws, { type: 'SHITHEAD_YOUR_STATE', ...playerState });
          }
        }
      }
      broadcastLobbyUpdate(room);
      broadcastVoteUpdate(room);

      // Broadcast PLAYER_JOINED to all players so they can see each other in lobby
      const playerNames = [...room.players.keys()];
      broadcastAll(room, { type: 'PLAYER_JOINED', players: playerNames, playerCount: room.players.size });
      break;
    }

    case 'SET_READY': {
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      if (msg.ready) {
        room.readyPlayers.add(username);
      } else {
        room.readyPlayers.delete(username);
      }

      // Auto-manage bot: remove bot if now 2+ humans
      const botWasRemoved = BotController.maybeRemoveBot(room);
      if (botWasRemoved) {
        room.readyPlayers.delete(BotController.BOT_USERNAME);
        broadcastAll(room, { type: 'PLAYER_REMOVED', username: BotController.BOT_USERNAME });
      }

      broadcastLobbyUpdate(room);
      break;
    }

    case 'SUGGEST_GAME': {
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      const gameType = msg.gameType;
      if (!['quiz', 'shithead', 'cah', 'spy', 'lyrics', 'guess'].includes(gameType)) break;
      room.gameSuggestions.set(username, gameType);
      broadcastLobbyUpdate(room);
      break;
    }

    case 'START_MINI_GAME': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can start the game.' });
        break;
      }
      const gameType = msg.gameType || 'quiz';
      const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
      const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
      const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';

      if (gameType === 'shithead' && room.players.size < 2) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Shithead requires at least 2 players.' });
        break;
      }
      if (gameType === 'cah' && room.players.size < 3) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Cards requires at least 3 players.' });
        break;
      }
      if (gameType === 'spy' && room.players.size < 3) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Spy Game requires at least 3 players.' });
        break;
      }
      if (gameType === 'guess' && room.players.size < 1) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Guess requires at least 1 player.' });
        break;
      }

      room.activeMiniGame = gameType;
      broadcastAll(room, { type: 'MINI_GAME_STARTING', gameType, url: `/group/${room.code}/${gameType}` });

      if (gameType === 'quiz') {
        // Create fresh quiz controller with specified parameters
        room.game = new QuizController(categories, gameDifficulty, questionCount);
        // Add all currently connected players to the game
        for (const [uname, playerData] of room.players) {
          room.game.addPlayer(uname, {
            score: playerData.score || 0,
            streak: 0,
            powerups: { doublePoints: 1, fiftyFifty: 1, timeFreeze: 1 },
            activePowerup: null,
            lastAnswerTime: null,
          });
        }
        room.game.start();
      } else if (gameType === 'shithead') {
        room.shitheadGame = new ShiteadController();
        for (const [uname, p] of room.players) {
          room.shitheadGame.addPlayer(uname, {
            username: uname,
            ws: p.ws,
            isBot: p.isBot,
            cardHand: [],
            cardFaceUp: [],
            cardFaceDown: [],
          });
        }
        room.shitheadGame.start();
      } else if (gameType === 'cah') {
        const maxRounds = Number.isInteger(msg.maxRounds) ? Math.max(1, Math.min(20, msg.maxRounds)) : 8;
        room.game = new CAHGameController(maxRounds);
        room.game.setRoom(room);
        for (const [uname, p] of room.players) {
          room.game.addPlayer(uname, { score: 0, ws: p.ws });
        }
        room.game.start();
      } else if (gameType === 'spy') {
        room.game = new SpyGameController();
        for (const [uname, p] of room.players) {
          room.game.addPlayer(uname, { score: 0 });
        }
        room.game.start();
      } else if (gameType === 'lyrics') {
        room.game = new LyricsGameController(questionCount);
        room.game.setRoom(room);
        for (const [uname, p] of room.players) {
          room.game.addPlayer(uname, { score: 0 });
        }
        room.game.start();
      } else if (gameType === 'guess') {
        // Example game using new GameController pattern
        room.game = new GuessController();
        for (const [uname, p] of room.players) {
          room.game.addPlayer(uname, {
            score: 0,
            lastGuess: null,
            feedback: ''
          });
        }
        room.game.start();
      }
      break;
    }

    case 'REMOVE_PLAYER': {
      const requester = room.wsToUsername.get(ws);
      if (requester !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can remove players.' });
        break;
      }
      const target = msg.username;
      const targetPlayer = room.players.get(target);
      if (targetPlayer && targetPlayer.ws) {
        sendTo(targetPlayer.ws, { type: 'PLAYER_REMOVED', username: target });
        targetPlayer.ws.close();
      }
      break;
    }

    case 'RETURN_TO_LOBBY':
    case 'RESTART': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) {
        sendTo(ws, { type: 'ERROR', code: 'NOT_ADMIN', message: 'Only admin can return to lobby.' });
        break;
      }

      // Save game history and update player stats before clearing game instances
      const gameType = room.activeMiniGame;
      if (room.game && room.game.phase === 'GAME_OVER') {
        (async () => {
          try {
            const finalState = room.game.getState();
            const sortedPlayers = [...finalState.players].sort((a, b) => (b.score || 0) - (a.score || 0));
            const gameRecord = {
              gameId: `${gameType}-${new Date().toISOString()}`,
              gameType,
              roomCode: room.code,
              startTime: room.game.startTime,
              endTime: Date.now(),
              duration: Date.now() - room.game.startTime,
              players: sortedPlayers
                .filter(p => !p.isBot)
                .map((p, idx) => ({
                  username: p.username || '',
                  finalScore: p.score || 0,
                  rank: idx + 1,
                  isBot: false
                }))
            };

            await Persistence.saveGameHistory(gameRecord);

            // Update individual player stats
            for (const player of gameRecord.players) {
              if (player.username) {
                const isWinner = player.rank === 1;
                await Persistence.updatePlayerStats(player.username, player.finalScore, gameType, isWinner);
              }
            }
          } catch (error) {
            console.error('Failed to save game history:', error);
          }
        })();
      } else if (room.shitheadGame && room.shitheadGame.phase === 'GAME_OVER') {
        (async () => {
          try {
            const finalState = room.shitheadGame.getState();
            const gameRecord = {
              gameId: `shithead-${new Date().toISOString()}`,
              gameType: 'shithead',
              roomCode: room.code,
              startTime: room.shitheadGame.startTime,
              endTime: Date.now(),
              duration: Date.now() - room.shitheadGame.startTime,
              players: finalState.players
                .filter(p => !p.isBot)
                .map((p, idx) => ({
                  username: p.username || '',
                  finalScore: p.score || 0,
                  rank: idx + 1,
                  isBot: false
                }))
            };

            await Persistence.saveGameHistory(gameRecord);

            // Update individual player stats
            for (const player of gameRecord.players) {
              if (player.username) {
                const isWinner = player.rank === 1;
                await Persistence.updatePlayerStats(player.username, player.finalScore, 'shithead', isWinner);
              }
            }
          } catch (error) {
            console.error('Failed to save game history:', error);
          }
        })();
      }

      // Reset all games
      if (room.game) { room.game = null; }
      if (room.shitheadGame) { room.shitheadGame = null; }
      room.categoryVotes.clear();
      room.readyPlayers.clear();
      room.gameSuggestions.clear();
      room.activeMiniGame = 'lobby';
      // Flag: suppress admin handoff while players navigate back to lobby
      room._returningFromGame = true;
      broadcastLobbyUpdate(room);
      // Legacy RESTARTED for old player page
      broadcastAll(room, { type: 'RESTARTED' });
      break;
    }

    case 'CATEGORY_VOTE': {
      if (room.activeMiniGame !== 'lobby') break;
      const username = room.wsToUsername.get(ws);
      if (!username) break;
      const cats = Array.isArray(msg.categories)
        ? msg.categories.slice(0, 3).map(Number).filter(n => Number.isInteger(n) && n > 0)
        : [];
      if (cats.length === 0) break;
      room.categoryVotes.set(username, cats);
      broadcastLobbyUpdate(room);
      broadcastVoteUpdate(room);
      break;
    }

    case 'ANSWER': {
      // QuizController uses handlePlayerAction instead
      const username = room.wsToUsername.get(ws);
      if (room.game && username) {
        room.game.handlePlayerAction(username, {
          answerIndex: msg.answerId,
          powerup: msg.powerupType
        });
      }
      break;
    }

    case 'LYRICS_ANSWER': {
      const username = room.wsToUsername.get(ws);
      if (username && room.game) {
        room.game.handlePlayerAction(username, { type: 'LYRICS_ANSWER', answerId: msg.answerId });
      }
      break;
    }

    case 'USE_POWERUP': {
      // Powerups are handled as part of ANSWER message
      // if (room.game && msg.powerupType) {
      //   const result = room.game.usePowerup(ws, msg.powerupType);
      //   if (!result.ok && result.code) {
      //     sendTo(ws, { type: 'ERROR', code: result.code, message: result.message });
      //   }
      // }
      break;
    }

    case 'SKIP': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      // TODO: implement skipReveal for QuizController
      // if (room.game) room.game.skipReveal();
      break;
    }

    case 'CONTINUE_GAME': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      // TODO: implement continueGame for QuizController
      // const categories = Array.isArray(msg.categories) && msg.categories.length > 0 ? msg.categories : [9];
      // const questionCount = Number.isInteger(msg.questionCount) && msg.questionCount > 0 ? Math.min(msg.questionCount, 50) : 20;
      // const gameDifficulty = ['easy', 'medium', 'hard'].includes(msg.gameDifficulty) ? msg.gameDifficulty : 'easy';
      // if (room.game) room.game.continueGame(categories, questionCount, gameDifficulty).catch(console.error);
      break;
    }

    case 'SET_LANGUAGE': {
      const username = room.wsToUsername.get(ws);
      if (username !== room.adminUsername) break;
      if (typeof msg.lang === 'string' && /^[a-z]{2}$/.test(msg.lang)) {
        room.language = msg.lang;
        broadcastAll(room, { type: 'LANGUAGE_SET', lang: room.language });
      }
      break;
    }

    case 'CAH_SUBMIT_CARDS': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.game || !Array.isArray(msg.cardIds)) break;
      room.game.handlePlayerAction(username, { type, cardIds: msg.cardIds });
      break;
    }

    case 'CAH_CZAR_PICK': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.game) break;
      room.game.handlePlayerAction(username, { type, submissionId: msg.submissionId });
      break;
    }

    case 'SHITHEAD_SWAP_CARD': {
      const username = room.wsToUsername.get(ws);
      if (!username || !room.shitheadGame) break;
      const { handCardId, faceUpCardId } = msg;
      if (handCardId && faceUpCardId) {
        const swapped = room.shitheadGame.swapCard(username, handCardId, faceUpCardId);
        // If swap succeeded, send updated player state back to client
        if (swapped) {
          const playerState = room.shitheadGame.getPlayerState(username);
          const response = { type: 'SHITHEAD_YOUR_STATE', ...playerState };
          if (ws.readyState === 1) ws.send(JSON.stringify(response));
          console.log(`[Shithead] ${username} swapped cards successfully`);
        } else {
          console.log(`[Shithead] ${username} swap failed - invalid indices`);
        }
      }
      break;
    }

    // ── Spy game messages ─────────────────────────────────────────────────
    case 'SEND_CLUE':
    case 'SEND_GUESS': {
      const username = room.wsToUsername.get(ws);
      if (username && room.game) {
        room.game.handlePlayerAction(username, { type, ...msg });
      }
      break;
    }
  }
}

module.exports = { handleMessage, handlePlayerDisconnect, maybeCleanupRoom };
