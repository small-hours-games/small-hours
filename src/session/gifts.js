// Small Hours - Gift store
// Persists "winner gifts": a shareable link/QR a winner gives to a friend.
// Storage is a simple JSON file under data/gifts.json (append + atomic write),
// so no external DB is needed.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const GIFTS_FILE = path.join(DATA_DIR, 'gifts.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(GIFTS_FILE)) fs.writeFileSync(GIFTS_FILE, '{}', 'utf-8');
}

function readAll() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(GIFTS_FILE, 'utf-8') || '{}');
  } catch {
    return {};
  }
}

function writeAll(obj) {
  ensureStore();
  const tmp = GIFTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  fs.renameSync(tmp, GIFTS_FILE); // atomic replace
}

/**
 * Create a gift for a game winner.
 * @param {object} params
 * @param {string} params.roomCode
 * @param {string} params.winnerId
 * @param {string} params.gameType
 * @param {string} [params.winnerName]
 * @returns {{ token: string, url: string, gift: object }}
 */
export function createGift({ roomCode, winnerId, gameType, winnerName }) {
  const token = 'gift_' + randomBytes(12).toString('base64url');
  const gift = {
    token,
    roomCode,
    winnerId,
    winnerName: winnerName || null,
    gameType,
    awardedAt: new Date().toISOString(),
  };
  const all = readAll();
  all[token] = gift;
  writeAll(all);
  return { token, url: giftUrl(token), gift };
}

export function getGift(token) {
  const all = readAll();
  return all[token] || null;
}

export function giftUrl(token) {
  // DOMAIN env mirrors discord.js usage; falls back to localhost.
  const DOMAIN = process.env.DOMAIN || 'localhost:3001';
  return `https://${DOMAIN}/gift/${token}`;
}

// Human-friendly game label map (kept in sync with GAME_REGISTRY labels).
const GAME_LABELS = {
  'number-guess': 'Number Guess',
  quiz: 'Quiz',
  spy: 'Spy',
  shithead: 'Shithead',
  skogai: 'SkogAI',
  'question-form': 'Question Form',
  template: 'Template',
  'gin-rummy': 'Gin Rummy',
  hilow: 'Högt/Lågt',
};

export function gameLabel(gameType) {
  return GAME_LABELS[gameType] || gameType;
}
