// Small Hours - Pot room routes for hosts.
// Anyone can open a pot room from the landing page. They get a host key, once;
// with it /pot/CODE ticks off payments and shows the winners' numbers to pay out.
// The same actions are mounted for the site admin under /admin/api/pots.

import express from 'express';
import {
  parsePotConfig, makePotRoom, setPotPaid, setPaidOut, newPotRound, setBankPaid, potAdminState, isPotHost, hostBankTerms,
} from '../pot/pot-room.js';
import { notifyRoomCreated } from '../notifications/discord.js';

const MAX_HOSTED_POTS = 30;                 // open pot rooms made from the landing page
const POT_CREATE_INTERVAL_MS = 30 * 1000;   // one new pot room per address per 30 s
const potCreateByIp = new Map();

function clientIp(req) {
  const raw = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return String(raw).replace(/^::ffff:/, '');
}

/**
 * Mount the actions that run a pot: tick a payment, mark a payout, open a new round.
 * `auth(req, res, room)` returns true when the caller may run that room's pot.
 */
export function mountPotActions(app, base, { manager, auth, before = [] }) {
  function roomFor(req, res) {
    const room = manager.getRoom(String(req.params.code || '').toUpperCase());
    if (!room || !room.pot) {
      res.status(404).json({ error: 'Pot room not found' });
      return null;
    }
    return auth(req, res, room) ? room : null;
  }
  const changed = room => manager.wsControls?.broadcastLobby?.(room.code);

  app.post(`${base}/:code/players/:playerId/paid`, ...before, express.json(), (req, res) => {
    const room = roomFor(req, res);
    if (!room) return;
    const result = setPotPaid(room, String(req.params.playerId), Boolean(req.body?.paid));
    if (!result.ok) return res.status(400).json({ error: result.error });
    changed(room);
    res.json({ pot: potAdminState(room) });
  });

  app.post(`${base}/:code/players/:playerId/paid-out`, ...before, express.json(), (req, res) => {
    const room = roomFor(req, res);
    if (!room) return;
    const result = setPaidOut(room, String(req.params.playerId), Boolean(req.body?.paidOut));
    if (!result.ok) return res.status(400).json({ error: result.error });
    changed(room);
    res.json({ pot: potAdminState(room) });
  });

  app.post(`${base}/:code/bank-paid`, ...before, express.json(), (req, res) => {
    const room = roomFor(req, res);
    if (!room) return;
    const result = setBankPaid(room, Boolean(req.body?.paid));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ pot: potAdminState(room) });
  });

  app.post(`${base}/:code/new-round`, ...before, (req, res) => {
    const room = roomFor(req, res);
    if (!room) return;
    const result = newPotRound(room);
    if (!result.ok) return res.status(400).json({ error: result.error });
    changed(room);
    res.json({ pot: potAdminState(room) });
  });

  return { roomFor };
}

export function setupPotRoutes(app, manager) {
  // What the landing page tells a host before they open a room.
  app.get('/api/pots-terms', (_req, res) => {
    const { bankPct } = hostBankTerms();
    res.json({ bankPct, minPlayers: 4, maxStake: 500, games: ['quiz', 'music-quiz'] });
  });

  // A host opens a pot room from the landing page.
  app.post('/api/pots', express.json({ limit: '4kb' }), (req, res) => {
    const hosted = [...manager.rooms.values()].filter(r => r.pot?.hostKeyHash).length;
    if (hosted >= MAX_HOSTED_POTS) return res.status(503).json({ error: 'Too many pot rooms open right now. Try again later.' });
    const ip = clientIp(req);
    const now = Date.now();
    if (now - (potCreateByIp.get(ip) || 0) < POT_CREATE_INTERVAL_MS) {
      return res.status(429).json({ error: 'You just made a pot room. Wait half a minute.' });
    }
    const parsed = parsePotConfig(req.body || {}, { host: true });
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    if (potCreateByIp.size > 1000) potCreateByIp.clear();
    potCreateByIp.set(ip, now);

    let room;
    let pot;
    try {
      room = manager.createRoom();
      pot = makePotRoom(room, parsed.config, { createdBy: 'host', host: true });
    } catch (err) {
      if (room) manager.removeRoom(room.code);
      return res.status(500).json({ error: `Could not open the pot room: ${err.message}` });
    }
    notifyRoomCreated(room.code).catch(() => {});
    res.status(201).json({ code: room.code, hostKey: pot.hostKey, hostUrl: `/host/${room.code}`, manageUrl: `/pot/${room.code}#key=${pot.hostKey}` });
  });

  const hostAuth = (req, res, room) => {
    if (isPotHost(room, req.get('x-pot-key'))) return true;
    res.status(403).json({ error: 'This link does not run that pot room' });
    return false;
  };

  const { roomFor } = mountPotActions(app, '/api/pots', { manager, auth: hostAuth });

  app.get('/api/pots/:code', (req, res) => {
    const room = roomFor(req, res);
    if (!room) return;
    res.json({ pot: potAdminState(room) });
  });
}
