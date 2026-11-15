import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Room } from '../../src/session/room.js';
import { PotStore, setPotStore } from '../../src/pot/store.js';
import {
  makePotRoom, registerSwish, setPotPaid, startPotPayment, confirmPotPayment, playerForPayment,
  potStartBlocker, startPotGame, isPotSpectator, potAdminState, paidPlayerIds,
} from '../../src/pot/pot-room.js';
import { createSwishClient, paymentRequestLink, prefilledLink, swishMessage } from '../../src/pot/swish.js';

const KEY = n => `phone-key-${n}-0123456789abcdef`;

function fakeSwish({ status = 'PAID', amount = 20, payee = '1231181189' } = {}) {
  const calls = [];
  return {
    calls,
    payee,
    publicUrl: 'https://quiz.example.se',
    async createPaymentRequest(req) {
      calls.push(['create', req]);
      return { id: 'AB'.repeat(16), token: 'tok123', callbackIdentifier: 'cb'.repeat(16) };
    },
    async getPaymentRequest(id) {
      calls.push(['get', id]);
      return { status, amount, payeeAlias: payee, paymentReference: 'REF1' };
    },
  };
}

let room;
let anna;
beforeEach(() => {
  setPotStore(PotStore.open({ file: ':memory:' }));
  room = new Room('SWSH');
  makePotRoom(room, { stake: 20, bankPct: 5, gameType: 'quiz', payee: '1231181189' });
  anna = room.addPlayer('Anna').playerId;
  registerSwish(room, anna, KEY(1), '0701111111');
});

describe('Swish links', () => {
  it('builds the documented app-switch link with a return address', () => {
    expect(paymentRequestLink('tok 1', 'https://x.se/player/ABCD?pot=1'))
      .toBe('swish://paymentrequest?token=tok%201&callbackurl=https%3A%2F%2Fx.se%2Fplayer%2FABCD%3Fpot%3D1');
  });
  it('pre-fills payee, amount and message without an agreement', () => {
    const link = prefilledLink({ payee: '1231181189', amount: 20, message: 'Smallhours ABCD <Anna>' });
    const data = JSON.parse(decodeURIComponent(link.split('data=')[1]));
    expect(data).toMatchObject({ payee: { value: '1231181189' }, amount: { value: 20 }, message: { value: 'Smallhours ABCD Anna' } });
  });
  it('keeps messages to what Swish allows', () => {
    expect(swishMessage('Åsa <3 🎉 quiz!')).toBe('Åsa 3  quiz!');
    expect(swishMessage('x'.repeat(80))).toHaveLength(50);
  });
});

describe('createSwishClient', () => {
  it('is off without a certificate, a payee or an https address', () => {
    expect(createSwishClient({})).toBeNull();
    expect(createSwishClient({ SWISH_CERT_PATH: '/c.p12', SWISH_PAYEE: '1231181189', PUBLIC_URL: 'http://x' })).toBeNull();
  });

  it('creates an m-commerce payment request and reads the token', async () => {
    const sent = [];
    const client = createSwishClient(
      { SWISH_CERT_PATH: '/c.p12', SWISH_PAYEE: '1231181189', PUBLIC_URL: 'https://quiz.example.se/' },
      { request: async (opts, body) => { sent.push([opts, body]); return { status: 201, headers: { paymentrequesttoken: 'TOKEN' }, body: '' }; } },
    );
    const req = await client.createPaymentRequest({ amount: 20, message: 'Smallhours ABCD Anna', reference: 'ABCD' });
    expect(req.token).toBe('TOKEN');
    expect(req.id).toMatch(/^[0-9A-F]{32}$/);
    const [opts, body] = sent[0];
    expect(opts.method).toBe('PUT');
    expect(opts.path).toBe(`/swish-cpcapi/api/v2/paymentrequests/${req.id}`);
    const json = JSON.parse(body);
    expect(json).toMatchObject({ payeeAlias: '1231181189', amount: '20.00', currency: 'SEK', callbackUrl: 'https://quiz.example.se/api/swish/callback' });
    expect(json.payerAlias).toBeUndefined();   // m-commerce: the payer picks in the app
  });

  it('reports Swish errors', async () => {
    const client = createSwishClient(
      { SWISH_CERT_PATH: '/c.p12', SWISH_PAYEE: '1231181189', PUBLIC_URL: 'https://q.se' },
      { request: async () => ({ status: 422, headers: {}, body: '[{"errorCode":"PA02","errorMessage":"Amount value is missing"}]' }) },
    );
    await expect(client.createPaymentRequest({ amount: 20 })).rejects.toThrow(/PA02/);
  });
});

describe('paying in', () => {
  it('without Swish Handel gives a pre-filled link and waits for the admin', async () => {
    const r = await startPotPayment(room, anna, {});
    expect(r).toMatchObject({ ok: true, mode: 'manual' });
    expect(r.url).toMatch(/^swish:\/\/payment\?data=/);
    expect(room.pot.entries.get(anna).paid).toBe(false);
  });

  it('refuses to pay before a number is given, or twice', async () => {
    const bo = room.addPlayer('Bo').playerId;
    expect((await startPotPayment(room, bo, {})).ok).toBe(false);
    setPotPaid(room, anna, true);
    expect((await startPotPayment(room, anna, {})).ok).toBe(false);
  });

  it('with Swish Handel lets the player in when Swish says PAID', async () => {
    const client = fakeSwish();
    const r = await startPotPayment(room, anna, { client });
    expect(r.mode).toBe('swish');
    expect(r.url).toBe('swish://paymentrequest?token=tok123&callbackurl=' + encodeURIComponent(`https://quiz.example.se/player/SWSH?pot=${'AB'.repeat(16)}`));
    expect(client.calls[0][1]).toMatchObject({ amount: 20, reference: 'SWSH' });

    const done = await confirmPotPayment(r.paymentId, { client, getRoom: () => room });
    expect(done).toMatchObject({ ok: true, status: 'PAID', changed: true });
    expect(room.pot.entries.get(anna).paid).toBe(true);
    expect(potAdminState(room).players[0]).toMatchObject({ paid: true, paidBySwish: true });
  });

  it('does not let anyone in on a payment that is not PAID or is too small', async () => {
    let client = fakeSwish({ status: 'DECLINED' });
    let r = await startPotPayment(room, anna, { client });
    expect((await confirmPotPayment(r.paymentId, { client, getRoom: () => room })).status).toBe('DECLINED');
    expect(room.pot.entries.get(anna).paid).toBe(false);

    client = fakeSwish({ amount: 1 });
    r = await startPotPayment(room, anna, { client });
    expect((await confirmPotPayment(r.paymentId, { client, getRoom: () => room })).ok).toBe(false);
    expect(room.pot.entries.get(anna).paid).toBe(false);
  });

  it('finds the player again by payment id after the trip to Swish', async () => {
    const r = await startPotPayment(room, anna, { client: fakeSwish() });
    expect(playerForPayment(room, r.paymentId)).toBe(anna);
    expect(playerForPayment(room, 'CD'.repeat(16))).toBeNull();
    expect(playerForPayment(new Room('OTHR'), r.paymentId)).toBeNull();
  });
});

describe('only paid players play', () => {
  it('starts with four paid players while others watch', () => {
    const ids = [anna];
    for (let i = 2; i <= 5; i++) {
      const id = room.addPlayer(`P${i}`).playerId;
      registerSwish(room, id, KEY(i), `070${i}${i}${i}${i}${i}${i}${i}`);
      ids.push(id);
    }
    for (const id of ids.slice(0, 3)) setPotPaid(room, id, true);
    expect(potStartBlocker(room, 'quiz')).toMatch(/4 paid players \(3 so far\)/);
    setPotPaid(room, ids[3], true);
    expect(potStartBlocker(room, 'quiz')).toBeNull();
    expect(paidPlayerIds(room)).toEqual(ids.slice(0, 4));

    room.game = { state: {} };   // a game is on
    startPotGame(room);
    expect(isPotSpectator(room, ids[4])).toBe(true);
    expect(isPotSpectator(room, ids[0])).toBe(false);
  });
});
