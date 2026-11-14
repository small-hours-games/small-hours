// Small Hours - Lobby Game Visibility Overrides
// Persists per-game shown/hidden overrides in data/admin/lobby-visibility.json.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_VISIBILITY_FILE = fileURLToPath(new URL('../../data/admin/lobby-visibility.json', import.meta.url));

let overrides = loadSync(DEFAULT_VISIBILITY_FILE);

function loadSync(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data.overrides === 'object' && data.overrides ? { ...data.overrides } : {};
  } catch {
    return {};
  }
}

export function isGameVisibleInLobby(game, map = overrides) {
  if (!game || !game.id) return false;
  if (Object.prototype.hasOwnProperty.call(map, game.id)) {
    return Boolean(map[game.id]);
  }
  return !game.hidden;
}

export function getLobbyVisibilityOverrides() {
  return { ...overrides };
}

export async function setGameLobbyVisibility(id, visible, file = DEFAULT_VISIBILITY_FILE) {
  const cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('Game id required');
  if (visible === null || visible === undefined) {
    delete overrides[cleanId];
  } else {
    overrides[cleanId] = Boolean(visible);
  }
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ overrides }, null, 2) + '\n');
  await fsp.rename(tmp, file);
  return getLobbyVisibilityOverrides();
}

export function resetVisibilityCacheForTest(next = {}) {
  overrides = { ...next };
}
