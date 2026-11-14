// Small Hours - Remote / Webhook Card Game Adapter
// Lets an external service implement arbitrary card game rules while Small Hours
// manages rooms, WebSockets, card-table rendering, and deck primitives.

import { createHmac } from 'node:crypto';
import { createDeck, deal } from './deck.js';

export function validateRemoteSpec(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Game spec must be an object' };
  const id = String(raw.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(id)) {
    return { ok: false, error: 'id must be 3-40 lowercase letters, numbers, or hyphens' };
  }
  const label = String(raw.label || '').trim();
  if (!label || label.length > 40) return { ok: false, error: 'label (1-40 chars) is required' };
  const min = raw.min == null ? 2 : Number(raw.min);
  const max = raw.max == null ? 6 : Number(raw.max);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 12 || min > max) {
    return { ok: false, error: 'min and max must be integers (1 <= min <= max <= 12)' };
  }
  let webhookUrl = '';
  if (raw.webhookUrl) {
    try {
      const u = new URL(String(raw.webhookUrl));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
      webhookUrl = u.toString();
    } catch {
      return { ok: false, error: 'webhookUrl must be a valid http(s) URL' };
    }
  }
  return {
    ok: true,
    spec: {
      id,
      kind: 'card-remote',
      label,
      icon: String(raw.icon || '🌐').slice(0, 8),
      blurb: String(raw.blurb || 'External card game').slice(0, 120),
      story: raw.story ? String(raw.story).slice(0, 500) : undefined,
      music: raw.music !== false,
      visibility: raw.visibility === 'unlisted' ? 'unlisted' : 'public',
      min,
      max,
      webhookUrl,
      webhookSecret: raw.webhookSecret ? String(raw.webhookSecret).slice(0, 128) : '',
      deck: {
        decks: Math.min(6, Math.max(1, Number(raw.deck?.decks) || 1)),
        aceHigh: Boolean(raw.deck?.aceHigh),
        opaqueIds: Boolean(raw.deck?.opaqueIds),
      },
      deal: {
        hand: Math.min(20, Math.max(0, raw.deal?.hand == null ? 5 : Number(raw.deal.hand))),
      },
    },
  };
}

export async function dispatchRemoteWebhook(spec, payload) {
  if (!spec.webhookUrl) return null;
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (spec.webhookSecret) {
    headers['X-SmallHours-Signature'] = createHmac('sha256', spec.webhookSecret).update(body).digest('hex');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(spec.webhookUrl, { method: 'POST', headers, body, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function buildRemoteCardDefinition(spec) {
  return {
    id: spec.id,
    kind: 'card-remote',
    label: spec.label,
    icon: spec.icon,
    blurb: spec.blurb,
    ...(spec.story ? { story: spec.story } : {}),
    music: spec.music,
    min: spec.min,
    max: spec.max,
    hidden: spec.visibility === 'unlisted',
    privateKeys: ['myHand', 'isMyTurn'],
    webhookUrl: spec.webhookUrl,

    async prepare(config, { players }) {
      const rawDeck = createDeck(spec.deck);
      const { hands, rest } = deal(rawDeck, players || [], spec.deal.hand);
      const remote = await dispatchRemoteWebhook(spec, {
        event: 'setup',
        gameId: spec.id,
        players,
        hands,
        drawPile: rest,
        config,
      });
      return {
        config: { ...config, initialHands: hands, initialDeck: rest, remoteInit: remote },
      };
    },

    setup({ players, config }) {
      if (config?.remoteInit?.state) return config.remoteInit.state;
      return {
        phase: 'play',
        players: [...players],
        currentIndex: 0,
        hands: config?.initialHands || Object.fromEntries(players.map(id => [id, []])),
        drawPile: config?.initialDeck || [],
        pile: [],
        winner: null,
        scores: null,
        seq: 0,
        lastEvent: null,
      };
    },

    actions: {
      // Allows external controller via /api/v1/rooms/:code/actions to push updated state
      applyRemoteState(state, { nextState, lastEvent }) {
        if (!nextState || typeof nextState !== 'object') {
          return { state, events: [{ type: 'error', message: 'nextState object required' }] };
        }
        return {
          state: { ...state, ...nextState, seq: (state.seq || 0) + 1, ...(lastEvent ? { lastEvent } : {}) },
          events: [{ type: 'remote-update' }],
        };
      },
      playCards(state, payload) {
        const seq = (state.seq || 0) + 1;
        return {
          state: { ...state, seq, lastEvent: { seq, kind: 'play', by: payload.playerId, cards: payload.cardIds || [] } },
          events: [{ type: 'remote-action', action: 'playCards', payload }],
        };
      },
      drawCard(state, payload) {
        const seq = (state.seq || 0) + 1;
        return {
          state: { ...state, seq, lastEvent: { seq, kind: 'draw', by: payload.playerId, count: 1 } },
          events: [{ type: 'remote-action', action: 'drawCard', payload }],
        };
      },
    },

    view(state, playerId) {
      if (state.views && state.views[playerId]) return state.views[playerId];
      const pileTop = (state.pile || []).length ? state.pile[state.pile.length - 1] : null;
      return {
        phase: state.phase || 'play',
        currentPlayer: state.currentPlayer ?? (state.players ? state.players[state.currentIndex || 0] : null),
        isMyTurn: (state.currentPlayer ?? state.players?.[state.currentIndex || 0]) === playerId,
        myHand: (state.hands && state.hands[playerId]) || [],
        pileTop,
        pilePreview: (state.pile || []).slice(-4),
        pileCount: (state.pile || []).length,
        drawPileCount: (state.drawPile || []).length,
        players: (state.players || []).map(id => ({
          playerId: id,
          handCount: ((state.hands && state.hands[id]) || []).length,
          isOut: false,
        })),
        winner: state.winner || null,
        lastEvent: state.lastEvent || null,
      };
    },

    endIf(state) {
      if (state.phase !== 'finished') return null;
      return {
        winner: state.winner || null,
        scores: state.scores || Object.fromEntries((state.players || []).map(id => [id, id === state.winner ? 100 : 0])),
      };
    },
  };
}
