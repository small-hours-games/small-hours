// Small Hours - Game plugins
// Every folder in games/ is one game: games/<id>/index.js exports its manifest and
// rules. Folders starting with "_" are skipped. A broken game is logged and left
// out, so it can never take the server down.

import { readdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadCustomGames, buildCustomGameDefinition } from './custom-store.js';
import { isGameVisibleInLobby } from './visibility.js';

const GAMES_DIR = fileURLToPath(new URL('../../games/', import.meta.url));

/** Why a manifest cannot be used, or null when it is fine. */
export function manifestProblem(game, folder) {
  if (!game || typeof game !== 'object') return 'index.js has no default export';
  if (game.id !== folder) return `id "${game.id}" does not match the folder`;
  for (const fn of ['setup', 'view', 'endIf']) {
    if (typeof game[fn] !== 'function') return `${fn}() is missing`;
  }
  if (!game.actions || typeof game.actions !== 'object') return 'actions are missing';
  if (!game.label) return 'label is missing';
  if (!Number.isInteger(game.min) || !Number.isInteger(game.max) || game.min > game.max) return 'min/max players are invalid';
  return null;
}

/** Load every game in a folder. Returns a Map of id to manifest. */
export async function loadGames(dir = GAMES_DIR) {
  const games = new Map();
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.error('[games] cannot read', dir, err.message);
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    try {
      const { default: game } = await import(pathToFileURL(join(dir, entry.name, 'index.js')).href);
      const problem = manifestProblem(game, entry.name);
      if (problem) { console.error(`[games] skipping ${entry.name}: ${problem}`); continue; }
      games.set(game.id, game);
    } catch (err) {
      console.error(`[games] skipping ${entry.name}:`, err.message);
    }
  }
  return games;
}

const GAMES = await loadGames();
const BUILTIN_IDS = new Set(GAMES.keys());

for (const spec of await loadCustomGames()) {
  if (spec.enabled && !BUILTIN_IDS.has(spec.id)) {
    GAMES.set(spec.id, { ...buildCustomGameDefinition(spec), isCustom: true });
  }
}

export function isBuiltInGame(id) {
  return BUILTIN_IDS.has(id);
}

export function registerDynamicGame(game) {
  if (!game || !game.id || BUILTIN_IDS.has(game.id)) return false;
  GAMES.set(game.id, { ...game, isCustom: true });
  return true;
}

export function unregisterDynamicGame(id) {
  if (BUILTIN_IDS.has(id)) return false;
  return GAMES.delete(id);
}

export function getGame(id) {
  return GAMES.get(id);
}

/** All loaded games, in catalog order. */
export function listGames() {
  return [...GAMES.values()].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
}

/** The games people can pick, in the shape the phone and TV use. */
export function publicGames(games = listGames()) {
  return games.filter(g => isGameVisibleInLobby(g)).map(g => ({
    type: g.id,
    label: g.label,
    ...(g.title ? { title: g.title } : {}),
    ...(g.music ? { music: true } : {}),
    icon: g.icon,
    min: g.min,
    max: g.max,
    hasUi: true,
    blurb: g.blurb,
    ...(g.soloBlurb ? { soloBlurb: g.soloBlurb } : {}),
    ...(g.ai ? { aiMax: g.ai.max } : {}),
  }));
}

/** Intro stories by game id, for the TV's story overlay. */
export function gameStories() {
  return Object.fromEntries(listGames().filter(g => g.story).map(g => [g.id, g.story]));
}
