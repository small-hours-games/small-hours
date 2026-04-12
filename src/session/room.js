// Small Hours - Room Management
// Each room represents a lobby where players gather and play mini-games.

import { createGame, processAction, getView, checkEnd } from '../engine/engine.js';
import numberGuess from '../engine/games/number-guess.js';
import shithead from '../engine/games/shithead.js';
import quiz from '../engine/games/quiz.js';
import questionForm from '../engine/games/question-form.js';
import template from '../engine/games/template.js';
import ginRummy from '../engine/games/gin-rummy.js';
import { saveAnswers } from '../fetcher/question-file.js';

const AVATAR_POOL = [
  '\u{1F98A}', '\u{1F438}', '\u{1F43C}', '\u{1F981}', '\u{1F42F}',
  '\u{1F98B}', '\u{1F428}', '\u{1F427}', '\u{1F984}', '\u{1F419}',
  '\u{1F996}', '\u{1F43B}', '\u{1F980}', '\u{1F9A9}', '\u{1F42C}',
  '\u{1F9DD}', '\u{1F994}', '\u{1F9A6}', '\u{1F99C}', '\u{1F433}',
];

// Characters that can appear in room codes (excludes I, O, S)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXYZ0123456789';

const GAME_REGISTRY = {
  'number-guess': { definition: numberGuess, label: 'Number Guess', minPlayers: 2, maxPlayers: 10, complexity: 1 },
  'shithead':     { definition: shithead,     label: 'Shithead',     minPlayers: 2, maxPlayers: 6,  complexity: 3 },
  'quiz':         { definition: quiz,         label: 'Quiz',         minPlayers: 1, maxPlayers: 20, complexity: 1 },
  'question-form':{ definition: questionForm, label: 'Question Form',minPlayers: 2, maxPlayers: 20, complexity: 1 },
  'template':     { definition: template,     label: 'Template',     minPlayers: 1, maxPlayers: 20, complexity: 1 },
  'gin-rummy':    { definition: ginRummy,     label: 'Gin Rummy',    minPlayers: 2, maxPlayers: 4,  complexity: 4 },
};

let playerCounter = 0;
let observerCounter = 0;

function generatePlayerId() {
  playerCounter += 1;
  return `player_${Date.now()}_${playerCounter}`;
}

function generateObserverId() {
  observerCounter += 1;
  return `observer_${Date.now()}_${observerCounter}`;
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
    this.observers = new Map();
    this.game = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.language = 'en';
    this.gameSuggestions = new Map();
    this.usedQuestionIds = new Set();
    this.categoryVotes = new Map();      // Map<playerId, categoryId>
    this.availableCategories = [];       // [{id, name}]
    this.votingActive = false;
    this.stateVersion = 0;
  }

  /**
   * Add a player to the room.
   * First player automatically becomes admin.
   * Returns { playerId, avatar }.
   */
  addPlayer(username) {
    this.stateVersion += 1;
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
      sessionScore: 0,
    });

    return { playerId, avatar };
  }

  /**
   * Remove a player from the room.
   * If the removed player was admin, promote the next connected player.
   * NOTE: When a player is removed their sessionScore is lost along with their record.
   */
  removePlayer(playerId) {
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    const player = this.players.get(playerId);
    if (!player) return;

    const wasAdmin = player.isAdmin;
    this.players.delete(playerId);
    this.gameSuggestions.delete(playerId);
    this.categoryVotes.delete(playerId);

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
   * Add an observer to the room.
   * Returns { observerId }.
   */
  addObserver(username) {
    this.lastActivity = Date.now();
    const clean = sanitizeUsername(username);
    const observerId = generateObserverId();
    this.observers.set(observerId, {
      username: clean,
      connected: true,
      lastSeen: Date.now(),
    });
    return { observerId };
  }

  /**
   * Remove an observer from the room.
   */
  removeObserver(observerId) {
    this.lastActivity = Date.now();
    this.observers.delete(observerId);
  }

  /**
   * Set a player's ready status.
   */
  setReady(playerId, ready) {
    this.stateVersion += 1;
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
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    if (this.players.has(playerId)) {
      this.gameSuggestions.set(playerId, gameType);
    }
  }

  /**
   * Resolve the winning category from player votes using plurality with tie-breaking.
   * Tie-break 1: admin's vote wins if admin voted for a tied category.
   * Tie-break 2: lowest category ID wins.
   * If no votes cast, returns first available category ID (or null).
   */
  resolveWinningCategory() {
    if (this.categoryVotes.size === 0) {
      return this.availableCategories[0]?.id ?? null;
    }
    const tallies = new Map();
    for (const [, catId] of this.categoryVotes) {
      tallies.set(catId, (tallies.get(catId) || 0) + 1);
    }
    const maxCount = Math.max(...tallies.values());
    const tied = [...tallies.entries()]
      .filter(([, count]) => count === maxCount)
      .map(([catId]) => catId);
    if (tied.length === 1) return tied[0];
    // Tie-break: admin's vote
    let adminId = null;
    for (const [id, p] of this.players) {
      if (p.isAdmin) { adminId = id; break; }
    }
    if (adminId && this.categoryVotes.has(adminId)) {
      const adminVote = this.categoryVotes.get(adminId);
      if (tied.includes(adminVote)) return adminVote;
    }
    // Final fallback: lowest ID
    return tied.sort((a, b) => a - b)[0];
  }

  /**
   * Return the list of games compatible with the current connected player count.
   */
  availableGames() {
    const count = [...this.players.values()].filter(p => p.connected).length;
    return Object.entries(GAME_REGISTRY)
      .filter(([, m]) => count >= m.minPlayers && count <= m.maxPlayers)
      .map(([type, m]) => ({ type, label: m.label, minPlayers: m.minPlayers, maxPlayers: m.maxPlayers, complexity: m.complexity }));
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
        sessionScore: p.sessionScore,
      });
    }

    const suggestions = {};
    for (const [id, gameType] of this.gameSuggestions) {
      suggestions[id] = gameType;
    }

    const state = {
      code: this.code,
      players,
      gameRunning: this.game !== null,
      gameSuggestions: suggestions,
      language: this.language,
      observerCount: this.observers.size,
    };

    if (this.votingActive) {
      const tallies = {};
      for (const categoryId of this.categoryVotes.values()) {
        tallies[categoryId] = (tallies[categoryId] || 0) + 1;
      }
      state.votingActive = true;
      state.availableCategories = this.availableCategories;
      state.voteTallies = tallies;
    }

    return state;
  }

  /**
   * Start a mini-game in this room.
   * Creates a game instance via the engine.
   */
  async startGame(gameType, config = {}) {
    const entry = GAME_REGISTRY[gameType];
    if (!entry) throw new Error(`Unknown game type: ${gameType}`);
    const connectedCount = [...this.players.values()].filter(p => p.connected).length;
    if (connectedCount < entry.minPlayers) throw new Error(`${entry.label} requires at least ${entry.minPlayers} players`);
    if (connectedCount > entry.maxPlayers) throw new Error(`${entry.label} supports at most ${entry.maxPlayers} players`);

    const { definition } = entry;

    const playerIds = [];
    for (const [id, p] of this.players) {
      if (p.connected) playerIds.push(id);
    }

    let gameConfig = { ...config };

    // Let the game definition prepare its own config (fetch questions, load files, etc.)
    if (definition.prepare) {
      const result = await definition.prepare(gameConfig, { usedQuestionIds: this.usedQuestionIds });
      gameConfig = result.config;
      for (const id of result.trackIds ?? []) {
        this.usedQuestionIds.add(id);
      }
    }

    this.lastActivity = Date.now();
    this.game = createGame(definition, { players: playerIds, config: gameConfig });
    this.gameSuggestions.clear();
    this.categoryVotes.clear();
    this.availableCategories = [];
    this.votingActive = false;
    return this.game;
  }

  /**
   * End the current game and return to the lobby.
   */
  endGame() {
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    this.game = null;
    // Reset ready states
    for (const [, player] of this.players) {
      player.ready = false;
    }
    this.categoryVotes.clear();
    this.availableCategories = [];
    this.votingActive = false;
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
