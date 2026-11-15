// Small Hours - Pot store
// SQLite (Node's built-in node:sqlite) in data/pot/pot.db.
//
// What is kept, and how:
// - players: one row per phone. The phone's secret pot key is stored only as a
//   SHA-256 hash. The Swish number is encrypted with AES-256-GCM; only the last
//   two digits are kept in clear, for "•• 45" on the player's own phone.
// - pots and pot_entries: who paid in, places and payouts, so a payout can be
//   checked after a restart. Entries point at the player row, never at a number.
//
// The encryption key comes from POT_SECRET, or from data/pot/secret.key, which is
// created on first use. Without the key the numbers in the database are unreadable.

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = fileURLToPath(new URL('../../data/pot/', import.meta.url));

let DatabaseSync = null;
function loadSqlite() {
  if (DatabaseSync) return DatabaseSync;
  // node:sqlite prints an ExperimentalWarning on Node 22; hide that one line.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w?.message ?? w).includes('SQLite') ? undefined : emit.call(process, w, ...rest));
  try {
    ({ DatabaseSync } = process.getBuiltinModule('node:sqlite'));
  } finally {
    process.emitWarning = emit;
  }
  return DatabaseSync;
}

function loadKey(dir) {
  if (process.env.POT_SECRET) return createHash('sha256').update(process.env.POT_SECRET).digest();
  const file = path.join(dir, 'secret.key');
  try {
    return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const key = randomBytes(32);
    fs.writeFileSync(file, key.toString('base64') + '\n', { mode: 0o600 });
    return key;
  }
}

export function hashPotKey(potKey) {
  return createHash('sha256').update(`pot:${potKey}`).digest('hex');
}

export class PotStore {
  constructor(db, key) {
    this.db = db;
    this.key = key;
    db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE NOT NULL,
        swish_enc TEXT NOT NULL,
        swish_last2 TEXT NOT NULL,
        nickname TEXT NOT NULL,
        avatar TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pots (
        id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        game_type TEXT NOT NULL,
        stake INTEGER NOT NULL,
        bank_pct REAL NOT NULL,
        payee TEXT NOT NULL,
        status TEXT NOT NULL,
        pot INTEGER,
        bank INTEGER,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        settled_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS pot_entries (
        pot_id TEXT NOT NULL REFERENCES pots(id),
        player_id TEXT NOT NULL REFERENCES players(id),
        nickname TEXT NOT NULL,
        avatar TEXT NOT NULL,
        paid_at INTEGER,
        score REAL,
        place INTEGER,
        payout INTEGER,
        paid_out_at INTEGER,
        PRIMARY KEY (pot_id, player_id)
      );
    `);
    PotStore.migrate(db);
  }

  static migrate(db) {
    const cols = db.prepare('PRAGMA table_info(pots)').all().map(c => c.name);
    if (!cols.includes('bank_paid_at')) db.exec('ALTER TABLE pots ADD COLUMN bank_paid_at INTEGER');
    if (!cols.includes('bank_payee')) db.exec('ALTER TABLE pots ADD COLUMN bank_payee TEXT');
  }

  static open({ dir = DEFAULT_DIR, file } = {}) {
    const Database = loadSqlite();
    if (file === ':memory:') return new PotStore(new Database(':memory:'), randomBytes(32));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const db = new Database(file || path.join(dir, 'pot.db'));
    db.exec('PRAGMA journal_mode = WAL;');
    return new PotStore(db, loadKey(dir));
  }

  encrypt(text) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
  }

  decrypt(blob) {
    const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** The player row for a phone's pot key, without the number. */
  findPlayer(potKey) {
    if (!potKey) return null;
    const row = this.db.prepare('SELECT id, swish_last2, nickname, avatar FROM players WHERE key_hash = ?').get(hashPotKey(potKey));
    return row ? { id: row.id, last2: row.swish_last2, nickname: row.nickname, avatar: row.avatar } : null;
  }

  /** Save (or change) the Swish number for a phone. Returns the player row. */
  savePlayer({ potKey, swishNumber, nickname, avatar }) {
    const now = Date.now();
    const keyHash = hashPotKey(potKey);
    const existing = this.db.prepare('SELECT id FROM players WHERE key_hash = ?').get(keyHash);
    const enc = this.encrypt(swishNumber);
    const last2 = swishNumber.slice(-2);
    if (existing) {
      this.db.prepare('UPDATE players SET swish_enc = ?, swish_last2 = ?, nickname = ?, avatar = ?, updated_at = ? WHERE id = ?')
        .run(enc, last2, nickname, avatar, now, existing.id);
      return { id: existing.id, last2, nickname, avatar };
    }
    const id = `pp_${randomUUID()}`;
    this.db.prepare('INSERT INTO players (id, key_hash, swish_enc, swish_last2, nickname, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, keyHash, enc, last2, nickname, avatar, now, now);
    return { id, last2, nickname, avatar };
  }

  touchPlayer(id, { nickname, avatar }) {
    this.db.prepare('UPDATE players SET nickname = ?, avatar = ?, updated_at = ? WHERE id = ?').run(nickname, avatar, Date.now(), id);
  }

  /** The full number: only for the admin portal. */
  revealNumber(playerId) {
    const row = this.db.prepare('SELECT swish_enc FROM players WHERE id = ?').get(playerId);
    return row ? this.decrypt(row.swish_enc) : null;
  }

  /** Forget a phone's number (GDPR erasure). Past pot entries keep nickname and amounts. */
  deletePlayer(playerId) {
    this.db.prepare("UPDATE players SET swish_enc = '', swish_last2 = '', key_hash = ? WHERE id = ?").run(`deleted:${randomUUID()}`, playerId);
  }

  createPot({ roomCode, gameType, stake, bankPct, payee, bankPayee, createdBy }) {
    const id = `pot_${randomUUID()}`;
    this.db.prepare('INSERT INTO pots (id, room_code, game_type, stake, bank_pct, payee, bank_payee, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, roomCode, gameType, stake, bankPct, payee, bankPayee || null, 'collecting', createdBy || null, Date.now());
    return id;
  }

  setBankPaid(potId, paid) {
    this.db.prepare('UPDATE pots SET bank_paid_at = ? WHERE id = ?').run(paid ? Date.now() : null, potId);
  }

  setPotStatus(potId, status) {
    this.db.prepare('UPDATE pots SET status = ? WHERE id = ?').run(status, potId);
  }

  setPaid(potId, { playerId, nickname, avatar, paid }) {
    this.db.prepare(`INSERT INTO pot_entries (pot_id, player_id, nickname, avatar, paid_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pot_id, player_id) DO UPDATE SET paid_at = excluded.paid_at, nickname = excluded.nickname, avatar = excluded.avatar`)
      .run(potId, playerId, nickname, avatar, paid ? Date.now() : null);
  }

  settlePot(potId, { pot, bank, results }) {
    const update = this.db.prepare('UPDATE pot_entries SET score = ?, place = ?, payout = ? WHERE pot_id = ? AND player_id = ?');
    for (const r of results) update.run(r.score, r.place ?? null, r.amount ?? 0, potId, r.playerId);
    this.db.prepare("UPDATE pots SET status = 'settled', pot = ?, bank = ?, settled_at = ? WHERE id = ?").run(pot, bank, Date.now(), potId);
  }

  setPaidOut(potId, playerId, paidOut) {
    this.db.prepare('UPDATE pot_entries SET paid_out_at = ? WHERE pot_id = ? AND player_id = ?').run(paidOut ? Date.now() : null, potId, playerId);
  }

  getPot(potId) {
    const pot = this.db.prepare('SELECT * FROM pots WHERE id = ?').get(potId);
    if (!pot) return null;
    const entries = this.db.prepare('SELECT * FROM pot_entries WHERE pot_id = ? ORDER BY place IS NULL, place, nickname').all(potId);
    return { ...pot, entries };
  }

  listPots(limit = 50) {
    return this.db.prepare('SELECT * FROM pots ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}

let shared = null;
/** The process-wide store, opened on first use. */
export function getPotStore() {
  if (!shared) shared = PotStore.open({ file: process.env.POT_DB_PATH || undefined });
  return shared;
}

/** Tests swap in an in-memory store. */
export function setPotStore(store) {
  shared = store;
}
