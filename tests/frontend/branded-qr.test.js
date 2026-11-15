import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadBrandedQr(globals = {}) {
  const ctx = {
    document: { createElement: () => ({ innerHTML: '', setAttribute() {} }) },
    ...globals,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  runInNewContext(readFileSync(new URL('../../public/js/branded-qr.js', import.meta.url), 'utf8'), ctx);
  return ctx.SH.brandedQr;
}

function makePatternMatrix(n) {
  const grid = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => ((r + c) % 2 === 0))
  );
  return grid;
}

describe('branded-qr renderer', () => {
  it('builds a Level-H safe SVG with a 4-module quiet zone, rounded #0b1530 modules, 3 colored finder eyes, and Small Hours center mark', () => {
    const api = loadBrandedQr();
    const n = 29;
    const svg = api.buildBrandedQrSvg(makePatternMatrix(n));

    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('class="branded-qr-modules" fill="#0b1530"');
    expect(svg).toContain('fill="#0284c7"');
    expect(svg).toContain('fill="#6d28d9"');
    expect(svg).toContain('fill="#e11d48"');
    expect(svg).toContain('class="branded-qr-emblem"');
    expect(svg).toContain('fill="#facc15"');
  });

  it('keeps the center cutout strictly inside ECC Level H recovery budget and clear of finders', () => {
    const api = loadBrandedQr();
    for (const n of [25, 29, 33, 37]) {
      const cut = api.computeCenterCutout(n);
      expect(cut.size % 2).toBe(1);
      expect(cut.start).toBeGreaterThanOrEqual(8); // outside 7x7 finders + 1-module separator
      const ratio = (cut.size * cut.size) / (n * n);
      expect(ratio).toBeLessThan(0.12); // well inside 30% Level-H recovery tolerance
    }
  });

  it('uses QRCode Level H matrix when available and falls back cleanly when matrix is missing', () => {
    const calls = [];
    class FakeQRCode {
      constructor(el, opts) {
        calls.push(opts);
        if (opts.text.includes('WITH_MATRIX')) {
          this._oQRCode = {
            getModuleCount: () => 25,
            isDark: (r, c) => (r * 3 + c) % 2 === 0,
          };
        }
      }
    }
    FakeQRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

    const api = loadBrandedQr({ QRCode: FakeQRCode });

    const makeEl = () => {
      const attrs = {};
      return {
        innerHTML: '',
        ownerDocument: { createElement: () => ({ innerHTML: '' }) },
        setAttribute: (k, v) => { attrs[k] = v; },
        getAttribute: (k) => attrs[k],
      };
    };

    const brandedEl = makeEl();
    api.renderBrandedQr(brandedEl, 'https://quiz.aldervall.se/player/WITH_MATRIX');
    expect(calls[0].correctLevel).toBe(2);
    expect(brandedEl.getAttribute('data-qr-mode')).toBe('branded');
    expect(brandedEl.innerHTML).toContain('branded-qr-svg');

    const fallbackEl = makeEl();
    api.renderBrandedQr(fallbackEl, 'https://quiz.aldervall.se/player/PLAIN');
    expect(fallbackEl.getAttribute('data-qr-mode')).toBe('fallback');
    expect(calls.length).toBe(3);
  });
});
