import { describe, it, expect, beforeEach } from 'vitest';
import { Room } from '../../src/session/room.js';
import { PotStore, setPotStore } from '../../src/pot/store.js';
import {
  parsePotConfig, makePotRoom, registerSwish, attachPotPlayer, setPotPaid, potStartBlocker,
  startPotGame, settlePot, setPaidOut, newPotRound, potPublicState, potAdminState, potPrivateState,
} from '../../src/pot/pot-room.js';

const KEY = n => `phone-key-${n}-0123456789abcdef`;
const NUMBERS = ['070-111 11 11', '070-222 22 22', '070-333 33 33', '070-444 44 44', '070-555 55 55'];

let store;
let room;
let ids;

function joinAll(count = 4) {
  ids = [];
  for (let i = 0; i < count; i++) {
    const { playerId } = room.addPlayer(`P${i + 1}`);
    ids.push(playerId);
    expect(registerSwish(room, playerId, KEY(i), NUMBERS[i]).ok).toBe(true);
  }
}

beforeEach(() => {
  store = PotStore.open({ file: ':memory:' });
  setPotStore(store);
  room = new Room('POTS');
  makePotRoom(room, { stake: 20, bankPct: 5, gameType: 'quiz', payee: '1231181189' }, { createdBy: 'admin@test' });
});

describe('parsePotConfig', () => {
  it('accepts a stake, bank share, game and payee', () => {
    expect(parsePotConfig({ stake: '20', bankPct: '5', gameType: 'music-quiz', payee: '123 118 11 89' }))
      .toEqual({ ok: true, config: { stake: 20, bankPct: 5, gameType: 'music-quiz', payee: '1231181189' } });
  });
  it('defaults the bank share to 5%', () => {
    expect(parsePotConfig({ stake: 10, payee: '1231181189' }).config.bankPct).toBe(5);
  });
  it('refuses other games, bad stakes and a bank share over 5%', () => {
    expect(parsePotConfig({ stake: 20, gameType: 'sjuan', payee: '1231181189' }).ok).toBe(false);
    expect(parsePotConfig({ stake: 0, payee: '1231181189' }).ok).toBe(false);
    expect(parsePotConfig({ stake: 20, bankPct: 10, payee: '1231181189' }).ok).toBe(false);
    expect(parsePotConfig({ stake: 20, payee: '' }).ok).toBe(false);
  });
});

describe('pot room', () => {
  it('only offers its own game in the lobby', () => {
    joinAll();
    expect(room.availableGames().map(g => g.type)).toEqual(['quiz']);
  });

  it('keeps numbers out of the shared lobby state', () => {
    joinAll();
    const json = JSON.stringify(room.getState());
    expect(json).not.toContain('4670');
    expect(json).not.toContain('111 11');
    expect(room.getState().pot.players[ids[0]]).toEqual({ paid: false, hasNumber: true });
    expect(potPrivateState(room, ids[0])).toEqual({ last2: '11' });
  });

  it('stores the number encrypted and remembers the phone in the next room', () => {
    joinAll(1);
    const raw = JSON.stringify(store.db.prepare('SELECT * FROM players').all());
    expect(raw).not.toContain('46701111111');

    const next = new Room('NEXT');
    makePotRoom(next, { stake: 10, bankPct: 5, gameType: 'quiz', payee: '1231181189' });
    const { playerId } = next.addPlayer('Again');
    attachPotPlayer(next, playerId, KEY(0));
    expect(potPrivateState(next, playerId)).toEqual({ last2: '11' });
    expect(potAdminState(next).players[0].swish).toBe('070-111 11 11');
  });

  it('refuses a number that is not a Swedish mobile', () => {
    const { playerId } = room.addPlayer('X');
    expect(registerSwish(room, playerId, KEY(9), '08-123 45 67').ok).toBe(false);
  });

  it('cannot start until four players have paid in', () => {
    joinAll(3);
    expect(potStartBlocker(room, 'quiz')).toMatch(/4 paid players \(0 so far\)/);
    const { playerId } = room.addPlayer('P4');
    expect(setPotPaid(room, playerId, true).ok).toBe(false); // no number yet
    registerSwish(room, playerId, KEY(3), NUMBERS[3]);
    for (const id of [...ids, playerId]) setPotPaid(room, id, true);
    expect(potStartBlocker(room, 'quiz')).toBeNull();
    expect(potStartBlocker(room, 'music-quiz')).toMatch(/own game/);
    expect(room.getState().pot.potSize).toBe(80);
  });

  it('settles the pot when the game ends and logs it', () => {
    joinAll(5);
    for (const id of ids) setPotPaid(room, id, true);
    startPotGame(room);
    expect(setPotPaid(room, ids[0], false).ok).toBe(false); // closed while running

    const result = settlePot(room, { scores: { [ids[0]]: 300, [ids[1]]: 900, [ids[2]]: 500, [ids[3]]: 100, [ids[4]]: 0 } });
    expect(result.pot).toBe(100);
    const byName = Object.fromEntries(result.results.map(r => [r.username, r.amount]));
    expect(byName).toEqual({ P1: 15, P2: 50, P3: 30, P4: 0, P5: 0 });
    expect(result.bank).toBe(5);

    const pub = room.getState().pot;
    expect(pub.status).toBe('settled');
    expect(potStartBlocker(room, 'quiz')).toMatch(/paid out/);

    expect(setPaidOut(room, ids[1], true).ok).toBe(true);
    expect(setPaidOut(room, ids[4], true).ok).toBe(false);
    const saved = store.getPot(room.pot.id);
    expect(saved.status).toBe('settled');
    expect(saved.entries.find(e => e.nickname === 'P2')).toMatchObject({ place: 1, payout: 50 });
    expect(saved.entries.find(e => e.nickname === 'P2').paid_out_at).toBeTruthy();
  });

  it('a stopped game opens the pot again', () => {
    joinAll(4);
    for (const id of ids) setPotPaid(room, id, true);
    startPotGame(room);
    room.endGame();
    expect(room.pot.status).toBe('collecting');
    expect(potStartBlocker(room, 'quiz')).toBeNull();
  });

  it('a new round needs everyone to pay again', () => {
    joinAll(4);
    for (const id of ids) setPotPaid(room, id, true);
    startPotGame(room);
    settlePot(room, { scores: {} });
    const oldId = room.pot.id;
    expect(newPotRound(room).ok).toBe(true);
    expect(room.pot.id).not.toBe(oldId);
    expect(potPublicState(room).players[ids[0]]).toEqual({ paid: false, hasNumber: true });
  });
});
