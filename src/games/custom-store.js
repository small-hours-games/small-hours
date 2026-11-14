// Small Hours - Custom Game Persistence Store
// Saves and loads API-created games under data/custom-games/<id>.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCardSpec, buildCardGameDefinition } from '../cards/runtime.js';
import { validateRemoteSpec, buildRemoteCardDefinition } from '../cards/remote-runtime.js';
import { validateQuizSpec, buildCustomQuizDefinition } from './quiz-custom.js';

export const DEFAULT_CUSTOM_GAMES_DIR = fileURLToPath(new URL('../../data/custom-games/', import.meta.url));

export function validateCustomGameSpec(raw) {
  const kind = raw?.kind || 'card-rules';
  if (kind === 'card-rules') return validateCardSpec(raw);
  if (kind === 'card-remote') return validateRemoteSpec(raw);
  if (kind === 'quiz') return validateQuizSpec(raw);
  return { ok: false, error: 'kind must be card-rules, card-remote, or quiz' };
}

export function buildCustomGameDefinition(spec) {
  if (spec.kind === 'card-rules') return buildCardGameDefinition(spec);
  if (spec.kind === 'card-remote') return buildRemoteCardDefinition(spec);
  if (spec.kind === 'quiz') return buildCustomQuizDefinition(spec);
  throw new Error(`Unsupported custom game kind: ${spec.kind}`);
}

export async function saveCustomGame(rawSpec, dir = DEFAULT_CUSTOM_GAMES_DIR, { builtInIds = new Set() } = {}) {
  const check = validateCustomGameSpec(rawSpec);
  if (!check.ok) return { ok: false, error: check.error };
  const spec = check.spec;
  if (builtInIds.has(spec.id)) {
    return { ok: false, error: `"${spec.id}" is a built-in game id and cannot be overwritten` };
  }
  const record = {
    ...spec,
    enabled: rawSpec.enabled !== false,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${spec.id}.json`);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record, null, 2) + '\n');
  await fs.rename(tmp, file);
  return { ok: true, spec: record, definition: buildCustomGameDefinition(record) };
}

export async function loadCustomGames(dir = DEFAULT_CUSTOM_GAMES_DIR) {
  const specs = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return specs;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, entry.name), 'utf8'));
      const check = validateCustomGameSpec(raw);
      if (!check.ok) continue;
      specs.push({ ...check.spec, enabled: raw.enabled !== false, updatedAt: raw.updatedAt || null });
    } catch {
      /* ignore corrupt file */
    }
  }
  return specs;
}

export async function getCustomGameSpec(id, dir = DEFAULT_CUSTOM_GAMES_DIR) {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));
    return raw;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function deleteCustomGame(id, dir = DEFAULT_CUSTOM_GAMES_DIR) {
  if (!/^[a-z0-9-]+$/.test(id)) return false;
  try {
    await fs.unlink(path.join(dir, `${id}.json`));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}
