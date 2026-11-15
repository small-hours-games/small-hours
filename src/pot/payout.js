// Small Hours - Pot payouts
// Pure money math for pot rooms: who gets what from the pot when a game ends.
// Amounts are whole kronor. Nothing here touches the network or the database.

/** Share of the pot for 1st, 2nd and 3rd place, in percent. */
export const PLACE_SPLIT = [50, 30, 15];
export const DEFAULT_BANK_PCT = 5;
export const MIN_POT_PLAYERS = 4;

/**
 * Split a pot between the top three places.
 *
 * Players who tie share the places they cover: two players tied for 2nd share
 * the 2nd and 3rd place money. Amounts are rounded down to whole kronor and the
 * kronor left over go to the best-placed players, one at a time, in rank order.
 * The bank keeps `bankPct` percent; with a lower bank share the rest goes to the
 * winners in the same 50:30:15 proportion.
 *
 * @param {object} opts
 * @param {Array<{ id: string, score: number }>} opts.entries - everyone who paid in and played
 * @param {number} opts.stake - kronor per player
 * @param {number} [opts.bankPct]
 * @returns {{ pot: number, bank: number, payouts: Array<{ id: string, place: number, amount: number }> }}
 */
export function computePayouts({ entries, stake, bankPct = DEFAULT_BANK_PCT }) {
  const stakeKr = Math.floor(Number(stake));
  if (!Number.isFinite(stakeKr) || stakeKr <= 0) throw new Error('Stake must be a positive number of kronor');
  const bankShare = Math.min(Math.max(Number(bankPct) || 0, 0), 5);
  const pot = stakeKr * entries.length;

  // The winners' part of the pot, split 50:30:15 between the places.
  const placesTotal = PLACE_SPLIT.reduce((a, b) => a + b, 0);
  const winnersPct = 100 - bankShare;
  const placePct = PLACE_SPLIT.map(p => (p / placesTotal) * winnersPct);

  // Rank by score, highest first; equal scores share a place.
  const sorted = [...entries]
    .map(e => ({ id: e.id, score: Number.isFinite(Number(e.score)) ? Number(e.score) : 0 }))
    .sort((a, b) => b.score - a.score);

  const groups = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.score === e.score) last.ids.push(e.id);
    else groups.push({ score: e.score, ids: [e.id] });
  }

  // Each group covers the places from its start index; it shares the percent of those places.
  const exact = [];   // { id, place, value } with value in kronor, unrounded
  let index = 0;
  for (const group of groups) {
    const covered = placePct.slice(index, index + group.ids.length);
    const groupPct = covered.reduce((a, b) => a + b, 0);
    if (groupPct > 0) {
      for (const id of group.ids) exact.push({ id, place: index + 1, value: (pot * groupPct) / 100 / group.ids.length });
    }
    index += group.ids.length;
  }

  const payouts = exact.map(e => ({ id: e.id, place: e.place, amount: Math.floor(e.value + 1e-9) }));
  const winnersTotal = Math.floor((pot * winnersPct) / 100 + 1e-9);
  let leftover = winnersTotal - payouts.reduce((a, p) => a + p.amount, 0);
  for (let i = 0; leftover > 0 && payouts.length > 0; i = (i + 1) % payouts.length) {
    payouts[i].amount += 1;
    leftover -= 1;
  }
  const paidOut = payouts.reduce((a, p) => a + p.amount, 0);
  return { pot, bank: pot - paidOut, payouts };
}

/**
 * Normalize a Swedish mobile number to the Swish format 46XXXXXXXXX.
 * Accepts 07x-xxx xx xx, +467..., 00467..., 467...
 * Returns null when it is not a Swedish mobile number.
 */
export function normalizeSwishNumber(raw) {
  let digits = String(raw ?? '').replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '46' + digits.slice(1);
  return /^467\d{8}$/.test(digits) ? digits : null;
}

/** A company Swish number: 10 digits starting with 123. */
export function normalizePayeeNumber(raw) {
  const digits = String(raw ?? '').replace(/[\s\-]/g, '');
  return /^123\d{7}$/.test(digits) ? digits : null;
}

/** "•• 45": enough for a player to recognise their own number, nothing more. */
export function maskSwishNumber(number) {
  const s = String(number || '');
  return s.length >= 2 ? `•• ${s.slice(-2)}` : '';
}

/** 46701234567 → 070-123 45 67, for the admin's eyes only. */
export function formatSwishNumber(number) {
  const s = String(number || '');
  if (!/^467\d{8}$/.test(s)) return s;
  const local = '0' + s.slice(2);
  return `${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
}
