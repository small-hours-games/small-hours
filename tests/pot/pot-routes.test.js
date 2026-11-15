import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { RoomManager } from '../../src/session/manager.js';
import { PotStore, setPotStore } from '../../src/pot/store.js';
import { setupPotRoutes } from '../../src/transport/pot-routes.js';
import { registerSwish, startPotGame, settlePot, payeeNumber, hostBankTerms } from '../../src/pot/pot-room.js';

let server;
let base;
let manager;
const env = { ...process.env };

beforeAll(async () => {
  setPotStore(PotStore.open({ file: ':memory:' }));
  manager = new RoomManager();
  const app = express();
  app.set('trust proxy', true);   // like production behind its proxy: x-forwarded-for is the client
  setupPotRoutes(app, manager);
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => { server.close(); manager.destroy(); });
beforeEach(() => {
  process.env.POT_SWISH_NUMBER = '0732671231';
  delete process.env.POT_HOST_BANK_PCT;
  delete process.env.DISCORD_WEBHOOK_URL;
});
afterEach(() => { process.env = { ...env }; });

let ipCounter = 0;
const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ipCounter}`, ...headers },
  body: JSON.stringify(body),
});

describe('payee numbers', () => {
  it('accepts a mobile or a 123 number', () => {
    expect(payeeNumber('073-267 12 31')).toBe('0732671231');
    expect(payeeNumber('+46732671231')).toBe('0732671231');
    expect(payeeNumber('123 118 11 89')).toBe('1231181189');
    expect(payeeNumber('08-123 45 67')).toBeNull();
  });
  it('takes the host bank share from the server', () => {
    expect(hostBankTerms({ POT_SWISH_NUMBER: '0732671231' })).toEqual({ bankPct: 5, bankPayee: '0732671231' });
    expect(hostBankTerms({ POT_SWISH_NUMBER: '0732671231', POT_HOST_BANK_PCT: '2' }).bankPct).toBe(2);
    expect(hostBankTerms({})).toEqual({ bankPct: 0, bankPayee: null });
  });
});

describe('POST /api/pots (landing page)', () => {
  it('opens a pot room paid to the host, with the bank share from the server', async () => {
    const res = await post('/api/pots', { gameType: 'quiz', stake: 20, payee: '070-123 45 67', bankPct: 0 });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(data.hostKey.length).toBeGreaterThan(20);
    expect(data.manageUrl).toBe(`/pot/${data.code}#key=${data.hostKey}`);
    const room = manager.getRoom(data.code);
    expect(room.pot).toMatchObject({ payee: '0701234567', bankPct: 5, bankPayee: '0732671231', stake: 20 });
    expect(room.getState().pot.hosted).toBe(true);
    expect(JSON.stringify(room.getState())).not.toContain(data.hostKey);
  });

  it('refuses a bad number and slows down repeat creators', async () => {
    expect((await post('/api/pots', { stake: 20, payee: '12345' })).status).toBe(400);
    const headers = { 'x-forwarded-for': '10.9.9.9' };
    expect((await post('/api/pots', { stake: 20, payee: '0701234567' }, headers)).status).toBe(201);
    expect((await post('/api/pots', { stake: 20, payee: '0701234567' }, headers)).status).toBe(429);
  });

  it('without a bank number there is no bank share', async () => {
    delete process.env.POT_SWISH_NUMBER;
    const data = await (await post('/api/pots', { stake: 20, payee: '0701234567' })).json();
    expect(manager.getRoom(data.code).pot).toMatchObject({ bankPct: 0 });
    expect(manager.getRoom(data.code).pot.bankPayee).toBeUndefined();
  });
});

describe('host controls', () => {
  async function hostedRoom() {
    const data = await (await post('/api/pots', { stake: 20, payee: '0701234567' })).json();
    return { ...data, room: manager.getRoom(data.code) };
  }

  it('only the host key runs the room', async () => {
    const { code, hostKey } = await hostedRoom();
    expect((await fetch(`${base}/api/pots/${code}`)).status).toBe(403);
    expect((await fetch(`${base}/api/pots/${code}`, { headers: { 'x-pot-key': 'wrong' } })).status).toBe(403);
    const ok = await fetch(`${base}/api/pots/${code}`, { headers: { 'x-pot-key': hostKey } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).pot.code).toBe(code);
  });

  it('ticks payments, and asks for the bank share before a new round', async () => {
    const { code, hostKey, room } = await hostedRoom();
    const ids = ['Anna', 'Bo', 'Cia', 'Dan'].map((n, i) => {
      const { playerId } = room.addPlayer(n);
      registerSwish(room, playerId, `key-${code}-${i}-0123456789abcdef`, `070${i}${i}${i}${i}${i}${i}${i}`);
      return playerId;
    });
    const h = { 'x-pot-key': hostKey };
    for (const id of ids) expect((await post(`/api/pots/${code}/players/${id}/paid`, { paid: true }, h)).status).toBe(200);
    expect((await post(`/api/pots/${code}/players/${ids[0]}/paid`, { paid: true })).status).toBe(403);

    room.game = { state: {} };
    startPotGame(room);
    room.game = null;
    settlePot(room, { scores: { [ids[0]]: 3, [ids[1]]: 2, [ids[2]]: 1, [ids[3]]: 0 } });
    const state = (await (await fetch(`${base}/api/pots/${code}`, { headers: h })).json()).pot;
    expect(state.result.bank).toBe(4);
    expect(state.bankPayee).toBe('0732671231');
    expect(state.result.bankPaid).toBe(false);

    const blocked = await post(`/api/pots/${code}/new-round`, {}, h);
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toMatch(/bank its 4 kr/);
    expect((await post(`/api/pots/${code}/bank-paid`, { paid: true }, h)).status).toBe(200);
    expect((await post(`/api/pots/${code}/new-round`, {}, h)).status).toBe(200);
  });
});
