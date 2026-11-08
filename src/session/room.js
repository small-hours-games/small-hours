// Small Hours - Room Management
// Each room represents a lobby where players gather and play mini-games.

import { createGame, processAction, getView, checkEnd } from '../engine/engine.js';
import { AI_PERSONAS } from '../engine/bots/personas.js';
import { getGame, listGames } from '../games/registry.js';
import { randomBytes } from 'node:crypto';

const AVATAR_POOL = [
  '\u{1F98A}', '\u{1F438}', '\u{1F43C}', '\u{1F981}', '\u{1F42F}',
  '\u{1F98B}', '\u{1F428}', '\u{1F427}', '\u{1F984}', '\u{1F419}',
  '\u{1F996}', '\u{1F43B}', '\u{1F980}', '\u{1F9A9}', '\u{1F42C}',
  '\u{1F9DD}', '\u{1F994}', '\u{1F9A6}', '\u{1F99C}', '\u{1F433}',
];

// Characters that can appear in room codes (excludes I, O, S)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXYZ0123456789';

let playerCounter = 0;
let observerCounter = 0;

function generatePlayerId() {
  playerCounter += 1;
  return `player_${Date.now()}_${playerCounter}`;
}

// Cryptographically unguessable token used to authenticate reconnection /
// admin reclaim, so identity cannot be hijacked by guessing a username.
// Uses crypto.randomBytes (not Math.random) since this token is the
// admin-identity secret.
function generateReconnectToken() {
  return `rt_${randomBytes(18).toString('base64url')}`;
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

// Capacity limits to bound per-room state (DoS protection).
const MAX_PLAYERS = 30;
const MAX_OBSERVERS = 30;

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
    this.bots = [];                      // AI seats of the running game: [{ playerId, username, avatar }]
    this.startingGame = false;           // a game is being prepared; further starts are ignored
  }

  /**
   * Add a player to the room.
   * First player automatically becomes admin.
   * Returns { playerId, avatar }.
   */
  addPlayer(username) {
    if (this.players.size >= MAX_PLAYERS) {
      throw new Error('Room is full');
    }
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    const clean = sanitizeUsername(username);
    const playerId = generatePlayerId();
    const avatar = this.freeAvatar(avatarFromUsername(clean));
    const isAdmin = this.players.size === 0;
    const reconnectToken = generateReconnectToken();

    this.players.set(playerId, {
      username: clean,
      avatar,
      ready: false,
      isAdmin,
      isBot: false,
      connected: true,
      lastSeen: Date.now(),
      sessionScore: 0,
      reconnectToken,
    });

    return { playerId, avatar, reconnectToken };
  }

  /** Avatars other players in the room already have. */
  takenAvatars(exceptId) {
    const taken = new Set();
    for (const [id, p] of this.players) if (id !== exceptId) taken.add(p.avatar);
    return taken;
  }

  /**
   * The preferred avatar if nobody has it yet, otherwise the next free one in the pool,
   * so faces on the TV tell players apart. With more players than avatars, repeats are allowed.
   */
  freeAvatar(preferred, exceptId) {
    const taken = this.takenAvatars(exceptId);
    if (!taken.has(preferred)) return preferred;
    const start = Math.max(0, AVATAR_POOL.indexOf(preferred));
    for (let i = 1; i <= AVATAR_POOL.length; i++) {
      const candidate = AVATAR_POOL[(start + i) % AVATAR_POOL.length];
      if (!taken.has(candidate)) return candidate;
    }
    return preferred;
  }

  /**
   * A player picks their own avatar from the pool.
   * Returns { ok: true, avatar } or { ok: false, error }.
   */
  setAvatar(playerId, avatar) {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Not in this room' };
    if (!AVATAR_POOL.includes(avatar)) return { ok: false, error: 'Unknown avatar' };
    if (player.avatar === avatar) return { ok: true, avatar };
    if (this.takenAvatars(playerId).has(avatar)) return { ok: false, error: 'Someone already has that avatar' };
    player.avatar = avatar;
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    return { ok: true, avatar };
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
    if (this.observers.size >= MAX_OBSERVERS) {
      throw new Error('Too many observers');
    }
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
   * Resolve the most-suggested game among those compatible with the connected player count.
   * Tie-break 1: admin's suggestion wins if admin voted for a tied game.
   * Tie-break 2: alphabetically first game type wins.
   * Returns null if no compatible game has been suggested.
   */
  resolveWinningGame() {
    const compatible = new Set(this.availableGames().map(g => g.type));
    const tallies = new Map();
    for (const gameType of this.gameSuggestions.values()) {
      if (!compatible.has(gameType)) continue;
      tallies.set(gameType, (tallies.get(gameType) || 0) + 1);
    }
    if (tallies.size === 0) return null;
    const maxCount = Math.max(...tallies.values());
    const tied = [...tallies.entries()]
      .filter(([, count]) => count === maxCount)
      .map(([gameType]) => gameType);
    if (tied.length === 1) return tied[0];
    let adminId = null;
    for (const [id, p] of this.players) {
      if (p.isAdmin) { adminId = id; break; }
    }
    if (adminId && this.gameSuggestions.has(adminId)) {
      const adminVote = this.gameSuggestions.get(adminId);
      if (tied.includes(adminVote)) return adminVote;
    }
    return tied.sort()[0];
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
    return listGames()
      .filter(g => !g.hidden && ((count >= g.min && count <= g.max) || (count === 1 && g.ai)))
      .map(g => ({
        type: g.id, label: g.label, minPlayers: g.min, maxPlayers: g.max,
        ...(count === 1 && g.ai && count < g.min ? { vsAi: true } : {}),
      }));
  }

  aiSeatCount(entry, humans, config = {}) {
    if (!entry.ai || humans !== 1) return 0;
    let max = Math.min(entry.ai.max, entry.max - humans);
    if (entry.ai.cardsPerSeat) {
      const decks = Number(config.decks) || 1;
      max = Math.min(max, Math.floor((52 * decks) / entry.ai.cardsPerSeat) - humans);
    }
    const wanted = Number.isInteger(config.bots) ? config.bots : entry.ai.default;
    return Math.max(Math.max(1, entry.min - humans), Math.min(wanted, max));
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
      leadingGame: this.resolveWinningGame(),
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
    const entry = getGame(gameType);
    if (!entry) throw new Error(`Unknown game type: ${gameType}`);
    const connectedCount = [...this.players.values()].filter(p => p.connected).length;
    const botCount = this.aiSeatCount(entry, connectedCount, config);
    if (connectedCount + botCount < entry.min) throw new Error(`${entry.label} requires at least ${entry.min} players`);
    if (connectedCount > entry.max) throw new Error(`${entry.label} supports at most ${entry.max} players`);

    const playerIds = [];
    for (const [id, p] of this.players) {
      if (p.connected) playerIds.push(id);
    }
    // Each AI seat is a character: its own name, face and way of playing (personas.js).
    const bots = AI_PERSONAS.slice(0, botCount).map((p, i) => ({ playerId: `bot_${i + 1}`, username: p.name, avatar: p.avatar }));
    playerIds.push(...bots.map(b => b.playerId));

    let gameConfig = { ...config };

    // Let the game definition prepare its own config (fetch questions, load files, etc.)
    if (entry.prepare) {
      const result = await entry.prepare(gameConfig, { usedQuestionIds: this.usedQuestionIds });
      gameConfig = result.config;
      for (const id of result.trackIds ?? []) {
        this.usedQuestionIds.delete(id);
        this.usedQuestionIds.add(id);
      }
    }

    this.lastActivity = Date.now();
    this.game = createGame(entry, { players: playerIds, config: gameConfig });
    this.gameType = gameType;
    this.bots = bots;
    this.gameSuggestions.clear();
    this.categoryVotes.clear();
    this.availableCategories = [];
    this.votingActive = false;
    return this.game;
  }

  /**
   * End the current game and return to the lobby.
   */
  /**
   * Award session scores to players. Scores is { [playerId]: number }.
   * Adds to each player's sessionScore (the persistent lobby leaderboard).
   */
  awardScores(scores) {
    if (!scores || typeof scores !== 'object') return;
    for (const [id, delta] of Object.entries(scores)) {
      const player = this.players.get(id);
      if (player) {
        player.sessionScore = (player.sessionScore || 0) + Number(delta || 0);
      }
    }
    this.stateVersion += 1;
    this.lastActivity = Date.now();
  }

  endGame() {
    this.stateVersion += 1;
    this.lastActivity = Date.now();
    this.game = null;
    this.bots = [];
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
