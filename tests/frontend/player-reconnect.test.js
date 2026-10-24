import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../public/player.html', import.meta.url), 'utf8');
const restore = source.slice(source.indexOf('      state.code = pathParts'), source.indexOf('      const params = new URLSearchParams'));
const remember = source.slice(source.indexOf("        case 'JOIN_OK':") + "        case 'JOIN_OK':".length, source.indexOf('          state.playerId = msg.playerId;'));
const join = source.match(/send\(\{ type: 'JOIN_LOBBY'.*\}\);/)[0];

describe('Phone refresh identity', () => {
  it('persists the issued token, restores it after refresh, and sends it when joining', () => {
    const storage = new Map();
    const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    const state = { code: 'ABCD' };
    runInNewContext(remember, { state, localStorage, msg: { reconnectToken: 'secret-token' } });
    const refreshed = { name: 'Alice' };
    runInNewContext(restore, { state: refreshed, localStorage, pathParts: ['', 'player', 'abcd'] });
    let sent;
    runInNewContext(join, { state: refreshed, send: msg => { sent = msg; } });
    expect(sent.reconnectToken).toBe('secret-token');
    const otherRoom = {};
    runInNewContext(restore, { state: otherRoom, localStorage, pathParts: ['', 'player', 'WXYZ'] });
    expect(otherRoom.reconnectToken).toBeNull();
  });

  it('keeps the token in memory when browser storage is blocked', () => {
    const state = {};
    const localStorage = { setItem() { throw new Error('blocked'); } };
    runInNewContext(remember, { state, localStorage, msg: { reconnectToken: 'secret-token' } });
    expect(state.reconnectToken).toBe('secret-token');
  });
});
