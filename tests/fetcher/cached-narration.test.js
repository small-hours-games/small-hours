import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('node:fs/promises', () => ({ access: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('../../src/fetcher/gemini-tts.js', () => ({ synthesizeSpeech: vi.fn() }));
import { access, writeFile } from 'node:fs/promises';
import { synthesizeSpeech } from '../../src/fetcher/gemini-tts.js';
import { getNarration } from '../../src/fetcher/cached-narration.js';
beforeEach(() => {
  vi.clearAllMocks();
  access.mockRejectedValue(new Error('missing'));
  synthesizeSpeech.mockResolvedValue({ ok: true, audioData: Buffer.from('wav') });
});
describe('Cached host narration', () => {
  it('reuses existing clips without calling the speech provider', async () => {
    access.mockResolvedValue(undefined);
    expect(await getNarration('Cached', { style: 'game-show' })).toMatchObject({ ok: true, cached: true });
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });
  it('shares concurrent generation and separates delivery profiles', async () => {
    const [a, b] = await Promise.all([
      getNarration('Question?', { style: 'game-show' }), getNarration('Question?', { style: 'game-show' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const plain = await getNarration('Question?');
    expect(plain.id).not.toBe(a.id);
  });
  it('does not save failed generation', async () => {
    synthesizeSpeech.mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'Unavailable' } });
    const result = await getNarration('Failed question', { style: 'game-show' });
    expect(result.ok).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('falls back to server-side TTS caching when Gemini returns HTTP 429 quota error', async () => {
    synthesizeSpeech.mockResolvedValue({ ok: false, error: { code: 'API_ERROR', message: 'HTTP 429: RESOURCE_EXHAUSTED' } });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer,
    })));
    const result = await getNarration('Question 3 after quota?', { style: 'game-show' });
    expect(result.ok).toBe(true);
    expect(result.fallback).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toMatch(/\.mp3$/);
    vi.unstubAllGlobals();
  });
});
