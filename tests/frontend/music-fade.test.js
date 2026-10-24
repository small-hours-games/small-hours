import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../public/js/music-fade.js', import.meta.url), 'utf8');
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  const listeners = {};
  const audio = { volume: 1, muted: false, pause: vi.fn(), addEventListener: (type, cb) => { listeners[type] = cb; } };
  const context = { Date, setInterval, clearInterval };
  runInNewContext(source, context);
  return { audio, listeners, fade: context.createMusicFade(audio) };
}
describe('Music question fades', () => {
  it('fades in for one second and out over the final two seconds', () => {
    const { audio, listeners, fade } = setup();
    fade.start(20);
    expect(audio.volume).toBe(0);
    listeners.playing();
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBeCloseTo(0.5);
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBe(1);
    vi.advanceTimersByTime(18000);
    expect(audio.volume).toBeCloseTo(0.5);
    vi.advanceTimersByTime(1000);
    expect(audio.volume).toBe(0);
    expect(audio.pause).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not restart fades on state updates or change mute preference', () => {
    const { audio, listeners, fade } = setup();
    audio.muted = true;
    fade.start(20);
    listeners.playing();
    vi.advanceTimersByTime(19000);
    fade.sync({ phase: 'question', timeLeft: 1 });
    expect(audio.volume).toBeCloseTo(0.5);
    expect(audio.muted).toBe(true);
    fade.sync({ phase: 'reveal' });
    expect(audio.volume).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('starts the fade when blocked playback is eventually unlocked', () => {
    const { audio, listeners, fade } = setup();
    fade.start(20);
    vi.advanceTimersByTime(5000);
    expect(audio.volume).toBe(0);
    listeners.playing();
    vi.advanceTimersByTime(500);
    expect(audio.volume).toBeCloseTo(0.5);
    fade.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
