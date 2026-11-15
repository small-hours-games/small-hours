// Small Hours - Pot rooms
// A pot room is a normal room with a stake. An admin creates it from /admin,
// every player registers a Swish number and pays in, the admin ticks off each
// payment, and when the game ends the pot is split between the top three.
//
// Money never passes through the server. It only keeps track of who paid and
// who should get what; the admin pays out with Swish.

import { computePayouts, normalizeSwishNumber, formatSwishNumber, MIN_POT_PLAYERS, DEFAULT_BANK_PCT } from './payout.js';
import { getPotStore } from './store.js';
import { prefilledLink, paymentRequestLink } from './swish.js';

const S = store => store || getPotStore();

export const POT_GAMES = ['quiz', 'music-quiz'];
export const MAX_STAKE = 500;

function connectedIds(room) {
  return [...room.players.entries()].filter(([, p]) => p.connected).map(([id]) => id);
}

/** Validate admin input; returns { ok, config } or { ok: false, error }. */
export function parsePotConfig(body = {}) {
  const stake = Math.floor(Number(body.stake));
  if (!Number.isFinite(stake) || stake < 1 || stake > MAX_STAKE) return { ok: false, error: `Stake must be 1–${MAX_STAKE} kr` };
  const bankPct = body.bankPct === undefined || body.bankPct === '' ? DEFAULT_BANK_PCT : Number(body.bankPct);
  if (!Number.isFinite(bankPct) || bankPct < 0 || bankPct > 5) return { ok: false, error: 'Bank share must be 0–5 %' };
  const gameType = String(body.gameType || 'quiz');
  if (!POT_GAMES.includes(gameType)) return { ok: false, error: 'Pot rooms play Quiz or Music Quiz' };
  // With Swish Handel the stakes must go to the Handel number; otherwise the admin picks one.
  const payee = String(process.env.SWISH_CERT_PATH && process.env.SWISH_PAYEE
    ? process.env.SWISH_PAYEE
    : (body.payee || process.env.POT_SWISH_NUMBER || '')).replace(/[\s-]/g, '');
  if (!/^\d{8,15}$/.test(payee)) return { ok: false, error: 'Swish number to pay in to is missing' };
  return { ok: true, config: { stake, bankPct, gameType, payee } };
}

/** Turn a fresh room into a pot room. */
export function makePotRoom(room, config, { createdBy } = {}, store) {
  const id = S(store).createPot({ roomCode: room.code, ...config, createdBy });
  room.pot = { id, ...config, status: 'collecting', entries: new Map(), result: null, createdBy: createdBy || null };
  room.stateVersion += 1;
  return room.pot;
}

function entryFor(room, playerId) {
  let entry = room.pot.entries.get(playerId);
  if (!entry) {
    entry = { potPlayerId: null, last2: null, paid: false };
    room.pot.entries.set(playerId, entry);
  }
  return entry;
}

/** A phone joined: if it has registered a number before, it is remembered. */
export function attachPotPlayer(room, playerId, potKey, store) {
  if (!room.pot || !room.players.has(playerId)) return null;
  const entry = entryFor(room, playerId);
  if (entry.potPlayerId || !potKey) return entry;
  const found = S(store).findPlayer(String(potKey).slice(0, 100));
  if (found) {
    const p = room.players.get(playerId);
    entry.potPlayerId = found.id;
    entry.last2 = found.last2;
    S(store).touchPlayer(found.id, { nickname: p.username, avatar: p.avatar });
  }
  return entry;
}

/** A player gives (or changes) their Swish number. */
export function registerSwish(room, playerId, potKey, rawNumber, store) {
  if (!room.pot) return { ok: false, error: 'This is not a pot room' };
  const p = room.players.get(playerId);
  if (!p) return { ok: false, error: 'Not in this room' };
  if (!potKey || String(potKey).length < 16) return { ok: false, error: 'Missing phone key' };
  const number = normalizeSwishNumber(rawNumber);
  if (!number) return { ok: false, error: 'Enter a Swedish mobile number, like 070-123 45 67' };
  const entry = entryFor(room, playerId);
  if (entry.paid) return { ok: false, error: 'You have already paid in; ask the admin to change your number' };
  const saved = S(store).savePlayer({ potKey: String(potKey).slice(0, 100), swishNumber: number, nickname: p.username, avatar: p.avatar });
  entry.potPlayerId = saved.id;
  entry.last2 = saved.last2;
  room.stateVersion += 1;
  return { ok: true, last2: saved.last2 };
}

/**
 * The admin confirms (or undoes) that a player's stake arrived.
 * `bySwish`: Swish itself confirmed it; that is recorded even while a game runs,
 * because the money has arrived either way.
 */
export function setPotPaid(room, playerId, paid, store, { bySwish = false } = {}) {
  if (!room.pot) return { ok: false, error: 'This is not a pot room' };
  if (room.pot.status !== 'collecting' && !bySwish) return { ok: false, error: 'The pot is closed while a game runs or after it ended' };
  const p = room.players.get(playerId);
  if (!p) return { ok: false, error: 'Player not found' };
  const entry = entryFor(room, playerId);
  if (paid && !entry.potPlayerId) return { ok: false, error: `${p.username} has not given a Swish number yet` };
  entry.paid = Boolean(paid);
  if (entry.potPlayerId) S(store).setPaid(room.pot.id, { playerId: entry.potPlayerId, nickname: p.username, avatar: p.avatar, paid: entry.paid });
  room.stateVersion += 1;
  return { ok: true };
}

/** The players who have paid in and are here: they play. Everyone else watches. */
export function paidPlayerIds(room) {
  return connectedIds(room).filter(id => room.pot?.entries.get(id)?.paid);
}

/** Why the pot game can't start yet, or null when it can. */
export function potStartBlocker(room, gameType) {
  if (!room.pot) return null;
  if (room.pot.status === 'settled') return 'This pot is paid out. The admin can open a new round.';
  if (room.pot.status !== 'collecting') return 'The pot game is already running';
  if (gameType && gameType !== room.pot.gameType) return 'This pot room only plays its own game';
  const paid = paidPlayerIds(room).length;
  if (paid < MIN_POT_PLAYERS) return `A pot needs ${MIN_POT_PLAYERS} paid players (${paid} so far)`;
  return null;
}

/** In a pot game only the players who paid in may play. */
export function isPotSpectator(room, playerId) {
  return Boolean(room.pot && room.game && room.pot.participants && !room.pot.participants.includes(playerId));
}

/** The pot game started: the players in it are the pot. */
export function startPotGame(room, store) {
  if (!room.pot) return;
  room.pot.status = 'running';
  room.pot.participants = paidPlayerIds(room);
  S(store).setPotStatus(room.pot.id, 'running');
  room.stateVersion += 1;
}

/** The pot game ended without a result (stopped by the admin): open the pot again. */
export function abortPotGame(room, store) {
  if (!room.pot || room.pot.status !== 'running') return;
  room.pot.status = 'collecting';
  room.pot.participants = null;
  S(store).setPotStatus(room.pot.id, 'collecting');
  room.stateVersion += 1;
}

/**
 * The pot game finished: split the pot. A player who left mid-game stays in the
 * pot with the score they had.
 */
export function settlePot(room, endResult, store) {
  if (!room.pot || room.pot.status !== 'running') return null;
  const scores = endResult?.scores || {};
  const ids = room.pot.participants || [];
  const { pot, bank, payouts } = computePayouts({
    entries: ids.map(id => ({ id, score: Number(scores[id]) || 0 })),
    stake: room.pot.stake,
    bankPct: room.pot.bankPct,
  });
  const byId = new Map(payouts.map(p => [p.id, p]));
  const results = ids.map(id => {
    const p = room.players.get(id);
    const entry = room.pot.entries.get(id);
    const won = byId.get(id);
    return {
      roomPlayerId: id,
      playerId: entry?.potPlayerId,
      username: p?.username || '?',
      avatar: p?.avatar || '',
      score: Number(scores[id]) || 0,
      place: won?.place ?? null,
      amount: won?.amount ?? 0,
      paidOut: false,
    };
  });
  S(store).settlePot(room.pot.id, { pot, bank, results: results.filter(r => r.playerId) });
  room.pot.status = 'settled';
  room.pot.result = { pot, bank, results };
  room.stateVersion += 1;
  return room.pot.result;
}

/** The admin marks a winner as paid out. */
export function setPaidOut(room, roomPlayerId, paidOut, store) {
  const r = room.pot?.result?.results.find(x => x.roomPlayerId === roomPlayerId);
  if (!r || !r.amount) return { ok: false, error: 'Nothing to pay out to that player' };
  r.paidOut = Boolean(paidOut);
  if (r.playerId) S(store).setPaidOut(room.pot.id, r.playerId, r.paidOut);
  room.stateVersion += 1;
  return { ok: true };
}

/** After a settled pot: a new round with the same stake; everyone pays in again. */
export function newPotRound(room, store) {
  if (!room.pot) return { ok: false, error: 'This is not a pot room' };
  if (room.pot.status === 'running') return { ok: false, error: 'Wait for the game to end' };
  const { stake, bankPct, gameType, payee, createdBy } = room.pot;
  const entries = room.pot.entries;
  room.pot.id = S(store).createPot({ roomCode: room.code, stake, bankPct, gameType, payee, createdBy });
  room.pot.status = 'collecting';
  room.pot.result = null;
  room.pot.participants = null;
  for (const entry of entries.values()) {
    entry.paid = false;
    entry.claimedAt = null;
    entry.payment = null;
    entry.swishRef = null;
  }
  room.stateVersion += 1;
  return { ok: true };
}

// --- Paying in with Swish ---

// Swish payment request id → where it belongs. Swish calls back with this id.
const payments = new Map();
const PAYMENT_TTL_MS = 60 * 60 * 1000;
const RECLAIM_MS = 30 * 60 * 1000;

function prunePayments(now = Date.now()) {
  for (const [id, p] of payments) if (now - p.createdAt > PAYMENT_TTL_MS) payments.delete(id);
}

/**
 * A player taps "Pay": returns { ok, mode, url } where url opens Swish.
 * With a Swish Handel client the server makes a real payment request and Swish
 * brings the player back to the room afterwards; without it the link pre-fills
 * the stake and the admin confirms the payment.
 */
export async function startPotPayment(room, playerId, { client } = {}) {
  if (!room.pot) return { ok: false, error: 'This is not a pot room' };
  const p = room.players.get(playerId);
  const entry = room.pot.entries.get(playerId);
  if (!p) return { ok: false, error: 'Not in this room' };
  if (!entry?.potPlayerId) return { ok: false, error: 'Give your Swish number first' };
  if (entry.paid) return { ok: false, error: 'You have already paid in' };
  if (room.pot.status === 'settled') return { ok: false, error: 'This pot is paid out; wait for the next round' };
  const message = `Smallhours ${room.code} ${p.username}`;

  if (!client) {
    return { ok: true, mode: 'manual', url: prefilledLink({ payee: room.pot.payee, amount: room.pot.stake, message }) };
  }

  prunePayments();
  const req = await client.createPaymentRequest({ amount: room.pot.stake, message, reference: room.code });
  entry.payment = { id: req.id, createdAt: Date.now() };
  payments.set(req.id, { code: room.code, playerId, callbackIdentifier: req.callbackIdentifier, createdAt: Date.now() });
  const returnUrl = `${client.publicUrl}/player/${room.code}?pot=${req.id}`;
  return { ok: true, mode: 'swish', url: paymentRequestLink(req.token, returnUrl), paymentId: req.id };
}

/** Where a Swish payment request belongs, or null. */
export function lookupPayment(paymentId) {
  return payments.get(String(paymentId || '').toUpperCase()) || null;
}

/**
 * Ask Swish how a payment went and let the player in when it is PAID.
 * Swish's own answer over mutual TLS decides, never the callback body.
 * Returns { ok, status, room, changed }.
 */
export async function confirmPotPayment(paymentId, { client, getRoom, store } = {}) {
  const info = lookupPayment(paymentId);
  if (!info || !client) return { ok: false, error: 'Unknown payment' };
  const room = getRoom(info.code);
  if (!room?.pot || !room.players.has(info.playerId)) return { ok: false, error: 'Room or player is gone' };
  const entry = room.pot.entries.get(info.playerId);
  if (entry?.paid) return { ok: true, status: 'PAID', room, changed: false };

  const result = await client.getPaymentRequest(String(paymentId).toUpperCase());
  if (result.status !== 'PAID') return { ok: true, status: result.status, room, changed: false };
  if (result.amount < room.pot.stake || result.payeeAlias !== client.payee) {
    console.error(`[pot] payment ${paymentId} does not match the stake or payee`);
    return { ok: false, status: result.status, error: 'Payment does not match the stake' };
  }
  const done = setPotPaid(room, info.playerId, true, store, { bySwish: true });
  if (done.ok && entry) entry.swishRef = result.paymentReference;
  return { ok: done.ok, status: 'PAID', room, changed: done.ok };
}

/** After paying, Swish may open the room in another browser: find the player by payment. */
export function playerForPayment(room, paymentId) {
  const info = lookupPayment(paymentId);
  if (!info || info.code !== room.code || !room.players.has(info.playerId)) return null;
  if (Date.now() - info.createdAt > RECLAIM_MS) return null;
  return info.playerId;
}

export function forgetPotPlayer(room, playerId) {
  if (room.pot && room.pot.status === 'collecting') room.pot.entries.delete(playerId);
}

/** What everyone (TV and every phone) may see: no numbers at all. */
export function potPublicState(room) {
  const pot = room.pot;
  if (!pot) return null;
  const players = {};
  let paidCount = 0;
  for (const [id] of room.players) {
    const e = pot.entries.get(id);
    players[id] = { paid: Boolean(e?.paid), hasNumber: Boolean(e?.potPlayerId) };
    if (e?.paid) paidCount += 1;
  }
  const potSize = pot.status === 'collecting' ? paidCount * pot.stake : (pot.participants?.length || 0) * pot.stake;
  return {
    stake: pot.stake,
    bankPct: pot.bankPct,
    gameType: pot.gameType,
    payee: pot.payee,
    status: pot.status,
    minPlayers: MIN_POT_PLAYERS,
    potSize,
    players,
    result: pot.result
      ? {
        pot: pot.result.pot,
        bank: pot.result.bank,
        results: pot.result.results.map(r => ({ playerId: r.roomPlayerId, username: r.username, avatar: r.avatar, place: r.place, amount: r.amount, paidOut: r.paidOut })),
      }
      : null,
  };
}

/** What one phone may see about itself: the last two digits of its own number. */
export function potPrivateState(room, playerId) {
  const e = room.pot?.entries.get(playerId);
  return { last2: e?.last2 || null };
}

/** The admin portal's view: full numbers, behind the admin login. */
export function potAdminState(room, store) {
  const pub = potPublicState(room);
  if (!pub) return null;
  const players = [];
  for (const [id, p] of room.players) {
    const e = room.pot.entries.get(id);
    let swish = null;
    try { swish = e?.potPlayerId ? formatSwishNumber(S(store).revealNumber(e.potPlayerId)) : null; } catch { swish = '(unreadable)'; }
    players.push({
      playerId: id, username: p.username, avatar: p.avatar, connected: p.connected, paid: Boolean(e?.paid), swish,
      saysPaid: Boolean(e?.claimedAt && !e?.paid),
      paidBySwish: Boolean(e?.swishRef),
    });
  }
  const result = pub.result
    ? {
      ...pub.result,
      results: pub.result.results.map(r => {
        const entry = room.pot.entries.get(r.playerId);
        let swish = null;
        try { swish = entry?.potPlayerId ? formatSwishNumber(S(store).revealNumber(entry.potPlayerId)) : null; } catch { swish = '(unreadable)'; }
        return { ...r, swish };
      }),
    }
    : null;
  return { code: room.code, potId: room.pot.id, ...pub, players, result };
}
