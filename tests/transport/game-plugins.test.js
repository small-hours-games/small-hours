import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import http from 'http';
import { loadGames, publicGames, listGames, getGame } from '../../src/games/registry.js';
import { setupRoutes } from '../../src/transport/http.js';
import { getHostView } from '../../src/transport/host-view.js';

const manifest = (id, extra = '') => `export default { id: '${id}', label: 'L', min: 1, max: 2, actions: {}, setup() {}, view() {}, endIf() { return null; }, ${extra} };`;

describe('loading game plugins', () => {
  let dir;
  const add = async (folder, source) => {
    await mkdir(join(dir, folder));
    await writeFile(join(dir, folder, 'index.js'), source);
  };
  beforeAll(async () => {
    // Inside the project: the test runner cannot import modules from outside it.
    await mkdir(join(process.cwd(), 'tmp'), { recursive: true });
    dir = await mkdtemp(join(process.cwd(), 'tmp', 'sh-games-'));
    await add('good', manifest('good', "icon: 'x', blurb: 'b'"));
    await add('secret', manifest('secret', 'hidden: true'));
    await add('_template', manifest('_template'));
    await add('wrong-folder', manifest('other'));
    await add('no-rules', "export default { id: 'no-rules', label: 'L', min: 1, max: 2, actions: {} };");
    await add('throws', "throw new Error('boom');");
    await add('bad-players', manifest('bad-players').replace('min: 1', 'min: 5'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('loads valid games and leaves out broken ones without failing', async () => {
    expect([...(await loadGames(dir)).keys()].sort()).toEqual(['good', 'secret']);
  });

  it('survives a missing games folder', async () => {
    expect((await loadGames(join(dir, 'nope'))).size).toBe(0);
  });

  it('never offers a hidden game', async () => {
    const games = [...(await loadGames(dir)).values()];
    expect(publicGames(games).map(g => g.type)).toEqual(['good']);
  });
});

describe('the games in this repo', () => {
  it('all load, with the four playable games first and in catalog order', () => {
    expect(publicGames().map(g => g.type)).toEqual(['quiz', 'music-quiz', 'shithead', 'gin-rummy']);
    expect(listGames().map(g => g.id)).toEqual(expect.arrayContaining(['hilow', 'sjuan', 'uno']));
  });

  it('keep a private key from a manifest away from the TV', () => {
    const game = { state: {}, definition: { ...getGame('hilow'), view: () => ({ isActive: true, round: 1 }) } };
    expect(getHostView(game, 'p1')).toEqual({ round: 1 });
  });
});

describe('game routes', () => {
  let server, base;
  beforeAll(async () => {
    const app = express();
    setupRoutes(app, { rooms: new Map(), stats: () => ({ roomCount: 0, playerCount: 0 }), getRoom: () => null, createRoom: () => ({ code: 'TEST' }) });
    server = http.createServer(app).listen(0);
    await new Promise(r => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server && server.close());

  it('lists only the games people can pick', async () => {
    const { games } = await (await fetch(base + '/api/games')).json();
    expect(games.map(g => g.type)).toEqual(['quiz', 'music-quiz', 'shithead', 'gin-rummy']);
  });

  it('writes the catalog into the phone and TV pages', async () => {
    for (const page of ['/host/ABCD', '/player/ABCD']) {
      const html = await (await fetch(base + page)).text();
      expect(html).toContain('var SH_GAMES = [{"type":"quiz"');
      expect(html).not.toContain('<!-- game-catalog -->');
    }
  });

  it('does not serve the rules of a game', async () => {
    const res = await fetch(base + '/games/shithead/rules.js');
    expect(await res.text()).not.toContain('swapCard');
  });
});
