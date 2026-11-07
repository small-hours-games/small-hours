import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function load(extra = {}) {
  const context = { ...extra };
  runInNewContext(readFileSync(new URL('../../public/js/build-info.js', import.meta.url), 'utf8'), context);
  return context;
}

function fakeEl() {
  const classes = new Set(['hidden']);
  return { textContent: '', title: '', classList: { remove: c => classes.delete(c), contains: c => classes.has(c) } };
}

const INFO = { version: '2.1.0', commit: 'abc1234def', shortCommit: 'abc1234', builtAt: '2026-11-07T14:00:05.000Z' };

describe('build-info helper', () => {
  it('labels version and short commit', () => {
    const { shBuildLabel } = load();
    expect(shBuildLabel(INFO)).toBe('v2.1.0 · abc1234');
    expect(shBuildLabel({ version: '2.1.0', shortCommit: null })).toBe('v2.1.0');
    expect(shBuildLabel(null)).toBe('');
  });

  it('fills and un-hides a badge, with the build time in the tooltip', () => {
    const { shFillBuildBadge } = load();
    const el = fakeEl();
    shFillBuildBadge(el, INFO);
    expect(el.textContent).toBe('v2.1.0 · abc1234');
    expect(el.title).toMatch(/^Running build, built /);
    expect(el.classList.contains('hidden')).toBe(false);
  });

  it('leaves the badge hidden without version info', () => {
    const { shFillBuildBadge } = load();
    const el = fakeEl();
    shFillBuildBadge(el, {});
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('loads /api/version and ignores failures', async () => {
    const calls = [];
    const ok = load({ fetch: async url => { calls.push(url); return { ok: true, json: async () => INFO }; } });
    let got = null;
    await ok.shLoadBuildInfo(info => { got = info; });
    expect(calls).toEqual(['/api/version']);
    expect(got).toEqual(INFO);

    const failing = load({ fetch: async () => { throw new Error('offline'); } });
    let called = false;
    await failing.shLoadBuildInfo(() => { called = true; });
    expect(called).toBe(false);
  });
});
