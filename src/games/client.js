// Small Hours - The phone and TV parts of each game plugin, written into the pages.
// A game may ship client/lib/*.js, client/phone.js, client/tv.js, client/phone.html
// (its phone section) and client/style.css. All of them are optional.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listGames, publicGames } from './registry.js';

export const GAMES_DIR = fileURLToPath(new URL('../../games/', import.meta.url));

const clientDir = id => join(GAMES_DIR, id, 'client');

function scriptsFor(id, screen) {
  const dir = clientDir(id);
  const lib = existsSync(join(dir, 'lib')) ? readdirSync(join(dir, 'lib')).filter(f => f.endsWith('.js')).sort().map(f => 'lib/' + f) : [];
  return [...lib, `${screen}.js`].filter(f => existsSync(join(dir, f))).map(f => `/games/${id}/${f}`);
}

/** Fill in the plugin markers of host.html ('tv') or player.html ('phone'). */
export function renderGamePage(html, screen) {
  const games = listGames().filter(g => !g.hidden);
  const catalog = '<script>var SH_GAMES = ' + JSON.stringify(publicGames()).replace(/</g, '\\u003c') + ';</script>';
  const styles = games.filter(g => existsSync(join(clientDir(g.id), 'style.css')))
    .map(g => `<link rel="stylesheet" href="/games/${g.id}/style.css">`).join('\n  ');
  const scripts = games.flatMap(g => scriptsFor(g.id, screen)).map(src => `<script src="${src}"></script>`).join('\n  ');
  const sections = screen === 'phone'
    ? games.map(g => join(clientDir(g.id), 'phone.html')).filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n')
    : '';
  return html
    .replace('<!-- game-catalog -->', () => catalog)
    .replace('<!-- game-styles -->', () => styles)
    .replace('<!-- game-sections -->', () => sections)
    .replace('<!-- game-scripts -->', () => scripts);
}
