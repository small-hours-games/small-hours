import { describe, it, expect } from 'vitest';
import { computePayouts, normalizeSwishNumber, maskSwishNumber, formatSwishNumber, normalizePayeeNumber } from '../../src/pot/payout.js';

const entries = scores => scores.map((score, i) => ({ id: `p${i + 1}`, score }));
const amounts = r => Object.fromEntries(r.payouts.map(p => [p.id, p.amount]));

describe('computePayouts', () => {
  it('splits 50/30/15 and the bank keeps 5%', () => {
    const r = computePayouts({ entries: entries([9, 7, 5, 3, 1, 0]), stake: 20 });
    expect(r.pot).toBe(120);
    expect(amounts(r)).toEqual({ p1: 60, p2: 36, p3: 18 });
    expect(r.bank).toBe(6);
  });

  it('ranks by score, not by order', () => {
    const r = computePayouts({ entries: entries([1, 9, 5, 7]), stake: 20 });
    expect(amounts(r)).toEqual({ p2: 40, p4: 24, p3: 12 });
  });

  it('players tied for 2nd share the 2nd and 3rd place money', () => {
    const r = computePayouts({ entries: entries([10, 6, 6, 2]), stake: 20 });
    // pot 80: 1st 40, 2nd+3rd 45% = 36 shared
    expect(amounts(r)).toEqual({ p1: 40, p2: 18, p3: 18 });
    expect(r.bank).toBe(4);
  });

  it('players tied for 1st share the top two places', () => {
    const r = computePayouts({ entries: entries([8, 8, 4, 2]), stake: 20 });
    expect(amounts(r)).toEqual({ p1: 32, p2: 32, p3: 12 });
  });

  it('three players tied for 3rd share the 3rd place money', () => {
    const r = computePayouts({ entries: entries([9, 8, 3, 3, 3]), stake: 20 });
    expect(amounts(r)).toEqual({ p1: 50, p2: 30, p3: 5, p4: 5, p5: 5 });
  });

  it('pays whole kronor and gives leftover kronor to the best placed', () => {
    const r = computePayouts({ entries: entries([5, 4, 4, 1]), stake: 15 });
    // pot 60, winners get 57: 30 + 13.5 + 13.5 → 31, 13, 13
    expect(amounts(r)).toEqual({ p1: 31, p2: 13, p3: 13 });
    expect(r.bank).toBe(3);
    const total = r.payouts.reduce((a, p) => a + p.amount, 0) + r.bank;
    expect(total).toBe(r.pot);
  });

  it('with no bank share the winners get the whole pot', () => {
    const r = computePayouts({ entries: entries([9, 7, 5, 3]), stake: 19, bankPct: 0 });
    expect(r.bank).toBe(0);
    expect(r.payouts.reduce((a, p) => a + p.amount, 0)).toBe(76);
  });

  it('never pays out more than the pot', () => {
    for (let n = 4; n <= 20; n++) {
      for (const stake of [7, 10, 13, 20, 50]) {
        const scores = Array.from({ length: n }, (_, i) => (i * 7) % 5);
        const r = computePayouts({ entries: entries(scores), stake });
        const paid = r.payouts.reduce((a, p) => a + p.amount, 0);
        expect(paid + r.bank).toBe(n * stake);
        expect(r.bank).toBeGreaterThanOrEqual(Math.floor(n * stake * 0.05));
      }
    }
  });

  it('refuses a stake that is not positive', () => {
    expect(() => computePayouts({ entries: entries([1, 2, 3, 4]), stake: 0 })).toThrow();
  });
});

describe('Swish numbers', () => {
  it('normalizes Swedish mobile numbers', () => {
    expect(normalizeSwishNumber('070-123 45 67')).toBe('46701234567');
    expect(normalizeSwishNumber('+46 70 123 45 67')).toBe('46701234567');
    expect(normalizeSwishNumber('0046701234567')).toBe('46701234567');
    expect(normalizeSwishNumber('46701234567')).toBe('46701234567');
  });

  it('refuses what is not a Swedish mobile number', () => {
    expect(normalizeSwishNumber('08-123 456 78')).toBeNull();
    expect(normalizeSwishNumber('1231181189')).toBeNull();
    expect(normalizeSwishNumber('hello')).toBeNull();
    expect(normalizeSwishNumber('')).toBeNull();
  });

  it('masks and formats', () => {
    expect(maskSwishNumber('46701234567')).toBe('•• 67');
    expect(formatSwishNumber('46701234567')).toBe('070-123 45 67');
    expect(normalizePayeeNumber('123 118 11 89')).toBe('1231181189');
  });
});
