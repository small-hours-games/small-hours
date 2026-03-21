// Small Hours - Room Management
// Each room represents a lobby where players gather and play mini-games.

import { createGame, processAction, getView, checkEnd } from '../engine/engine.js';
import numberGuess from '../engine/games/number-guess.js';
import shithead from '../engine/games/shithead.js';

const AVATAR_POOL = [
  '\u{1F98A}', '\u{1F438}', '\u{1F43C}', '\u{1F981}', '\u{1F42F}',
  '\u{1F98B}', '\u{1F428}', '\u{1F427}', '\u{1F984}', '\u{1F419}',
  '\u{1F996}', '\u{1F43B}', '\u{1F980}', '\u{1F9A9}', '\u{1F42C}',
  '\u{1F9DD}', '\u{1F994}', '\u{1F9A6}', '\u{1F99C}', '\u{1F433}',
];

// Characters that can appear in room codes (excludes I, O, S)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXYZ0123456789';

const GAME_REGISTRY = {
  'number-guess': numberGuess,
  'shithead': shithead,
};

let playerCounter = 0;

function generatePlayerId() {
  playerCounter += 1;
  return `player_${Date.now()}_${playerCounter}`;
}

/**
 * Generate a random 4-character room code.
 * Uses alphanumeric characters excluding I, O, S to avoid confusion.
 */
export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Deterministic avatar selection based on username hash.
 */
function avatarFromUsername(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_POOL.length;
  return AVATAR_POOL[index];
}

/**
 * Sanitize a username: strip HTML tags, trim, cap at 20 chars.
 */
function sanitizeUsername(raw) {
  const stripped = String(raw).replace(/<[^>]*>/g, '').trim();
  return stripped.slice(0, 20) || 'Player';
}

export { AVATAR_POOL };

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.game = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.language = 'en';
    this.gameSuggestions = new Map();
  }

  /**
   * Add a player to the room.
   * First player automatically becomes admin.
   * Returns { playerId, avatar }.
   */
  addPlayer(username) {
    this.lastActivity = Date.now();
    const clean = sanitizeUsername(username);
    const playerId = generatePlayerId();
    const avatar = avatarFromUsername(clean);
    const isAdmin = this.players.size === 0;

    this.players.set(playerId, {
      username: clean,
      avatar,
      ready: false,
      isAdmin,
      isBot: false,
      connected: true,
      lastSeen: Date.now(),
    });

    return { playerId, avatar };
  }

  /**
   * Remove a player from the room.
   * If the removed player was admin, promote the next connected player.
   */
  removePlayer(playerId) {
    this.lastActivity = Date.now();
    const player = this.players.get(playerId);
    if (!player) return;

    const wasAdmin = player.isAdmin;
    this.players.delete(playerId);
    this.gameSuggestions.delete(playerId);

    if (wasAdmin && this.players.size > 0) {
      // Promote the first connected player, or first player if none connected
      let promoted = false;
      for (const [id, p] of this.players) {
        if (p.connected) {
          p.isAdmin = true;
          promoted = true;
          break;
        }
      }
      if (!promoted) {
        const firstPlayer = this.players.values().next().value;
        if (firstPlayer) firstPlayer.isAdmin = true;
      }
    }
  }

  /**
   * Set a player's ready status.
   */
  setReady(playerId, ready) {
    this.lastActivity = Date.now();
    const player = this.players.get(playerId);
    if (player) {
      player.ready = !!ready;
    }
  }

  /**
   * Record a game suggestion from a player.
   */
  suggestGame(playerId, gameType) {
    this.lastActivity = Date.now();
    if (this.players.has(playerId)) {
      this.gameSuggestions.set(playerId, gameType);
    }
  }

  /**
   * Get the current lobby state suitable for broadcast.
   */
  getState() {
    const players = [];
    for (const [id, p] of this.players) {
      players.push({
        playerId: id,
        username: p.username,
        avatar: p.avatar,
        ready: p.ready,
        isAdmin: p.isAdmin,
        isBot: p.isBot,
        connected: p.connected,
      });
    }

    const suggestions = {};
    for (const [id, gameType] of this.gameSuggestions) {
      suggestions[id] = gameType;
    }

    return {
      code: this.code,
      players,
      gameRunning: this.game !== null,
      gameSuggestions: suggestions,
      language: this.language,
    };
  }

  /**
   * Start a mini-game in this room.
   * Creates a game instance via the engine.
   */
  startGame(gameType, config = {}) {
    const definition = GAME_REGISTRY[gameType];
    if (!definition) {
      throw new Error(`Unknown game type: ${gameType}`);
    }

    const playerIds = [];
    for (const [id, p] of this.players) {
      if (p.connected) playerIds.push(id);
    }

    if (playerIds.length === 0) {
      throw new Error('No connected players to start a game');
    }

    this.lastActivity = Date.now();
    this.game = createGame(definition, { players: playerIds, config });
    this.gameSuggestions.clear();
    return this.game;
  }

  /**
   * End the current game and return to the lobby.
   */
  endGame() {
    this.lastActivity = Date.now();
    this.game = null;
    // Reset ready states
    for (const [, player] of this.players) {
      player.ready = false;
    }
  }

  /**
   * Serializable representation of the room.
   */
  toJSON() {
    const players = {};
    for (const [id, p] of this.players) {
      players[id] = { ...p };
    }

    const suggestions = {};
    for (const [id, gameType] of this.gameSuggestions) {
      suggestions[id] = gameType;
    }

    return {
      code: this.code,
      players,
      game: this.game ? { id: this.game.id } : null,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      language: this.language,
      gameSuggestions: suggestions,
    };
  }
}
