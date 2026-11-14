// Small Hours - API Key Store & Bearer Middleware
// Persists hashed API keys in data/admin/api-keys.json.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_KEYS_FILE = fileURLToPath(new URL('../../data/admin/api-keys.json', import.meta.url));

function hashKey(rawKey) {
  return createHash('sha256').update(String(rawKey)).digest('hex');
}

async function readKeysFile(file = DEFAULT_KEYS_FILE) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.keys) ? data.keys : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeKeysFile(keys, file = DEFAULT_KEYS_FILE) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ keys }, null, 2) + '\n');
  await fs.rename(tmp, file);
}

/**
 * Create a new API key. Returns { record, rawKey }; rawKey is only returned once.
 */
export async function createApiKey({ name, ownerSub, ownerEmail, scopes = ['games:write', 'rooms:write', 'cards:read'] }, file = DEFAULT_KEYS_FILE) {
  const cleanName = String(name || 'API Key').trim().slice(0, 60) || 'API Key';
  const rawKey = `sh_live_${randomBytes(24).toString('base64url')}`;
  const record = {
    id: `key_${randomBytes(8).toString('hex')}`,
    name: cleanName,
    prefix: rawKey.slice(0, 16),
    keyHash: hashKey(rawKey),
    ownerSub: ownerSub || 'admin',
    ownerEmail: ownerEmail || '',
    scopes: Array.isArray(scopes) ? scopes : ['games:write', 'rooms:write', 'cards:read'],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  const keys = await readKeysFile(file);
  keys.push(record);
  await writeKeysFile(keys, file);
  const { keyHash: _omit, ...publicRecord } = record;
  return { record: publicRecord, rawKey };
}

export async function listApiKeys(file = DEFAULT_KEYS_FILE) {
  const keys = await readKeysFile(file);
  return keys.map(({ keyHash: _omit, ...rest }) => rest);
}

export async function revokeApiKey(id, file = DEFAULT_KEYS_FILE) {
  const keys = await readKeysFile(file);
  const target = keys.find(k => k.id === id);
  if (!target) return null;
  if (!target.revokedAt) {
    target.revokedAt = new Date().toISOString();
    await writeKeysFile(keys, file);
  }
  const { keyHash: _omit, ...rest } = target;
  return rest;
}

export async function verifyApiKey(rawKey, file = DEFAULT_KEYS_FILE) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('sh_live_')) return null;
  const keys = await readKeysFile(file);
  const targetHash = hashKey(rawKey);
  const match = keys.find(k => !k.revokedAt && k.keyHash === targetHash);
  if (!match) return null;
  match.lastUsedAt = new Date().toISOString();
  await writeKeysFile(keys, file).catch(() => {});
  const { keyHash: _omit, ...rest } = match;
  return rest;
}

export function extractBearerKey(req) {
  const auth = req.headers?.authorization || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const headerKey = req.headers?.['x-api-key'];
  return typeof headerKey === 'string' ? headerKey.trim() : null;
}

export function requireApiKey(file = DEFAULT_KEYS_FILE) {
  return async (req, res, next) => {
    const raw = extractBearerKey(req);
    if (!raw) {
      return res.status(401).json({ error: 'API key required (Authorization: Bearer sh_live_...)' });
    }
    const key = await verifyApiKey(raw, file);
    if (!key) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }
    req.apiKey = key;
    next();
  };
}
