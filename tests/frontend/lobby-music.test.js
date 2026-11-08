import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../public/js/lobby-music.js', import.meta.url), 'utf8');
afterEach(() => vi.useRealTimers());
function setup(fetcher = async () => ({ ok: true, json: async () => ({ tracks: ['/music/one.mp3', '/music/two.mp3'] }) }), options) {
  vi.useFakeTimers();
  const listeners = {};
  const audio = {
    paused: true, src: '', muted: false, duration: 100, currentTime: 0,
    getAttribute: () => audio.src,
    addEventListener: (event, fn) => { listeners[event] = fn; },
    play: vi.fn(() => { audio.paused = false; listeners.playing(); return Promise.resolve(); }),
    pause: vi.fn(() => { audio.paused = true; listeners.pause(); }),
  };
  const context = { fetch: fetcher, Date, setInterval, clearInterval };
  runInNewContext(source, context);
  const onPlaybackChange = vi.fn();
  return { audio, listeners, onPlaybackChange, music: context.createLobbyMusic(audio, onPlaybackChange, options) };
}
const settle = () => vi.advanceTimersByTimeAsync(0);
describe('Lobby soundtrack fades', () => {
  it('fades in quietly on lobby entry and out before pausing for a game', async () => {
    const { music, audio } = setup();
    music.setActive(true);
    await settle();
    expect(audio.volume).toBe(0);
    expect(audio.src).toBe('/music/one.mp3');
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.06);
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.12);
    music.setActive(false);
    expect(audio.paused).toBe(false);
    vi.advanceTimersByTime(600);
    expect(audio.volume).toBeCloseTo(0.06);
    vi.advanceTimersByTime(600);
    expect(audio.volume).toBe(0);
    expect(audio.paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fades out over the track tail, then fades in the next song', async () => {
    const { music, audio, listeners } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(1500);
    audio.currentTime = 99;
    listeners.timeupdate();
    expect(audio.volume).toBeCloseTo(0.06);
    audio.currentTime = 100;
    listeners.timeupdate();
    expect(audio.volume).toBe(0);
    audio.paused = true;
    audio.currentTime = 0;
    listeners.ended();
    expect(audio.src).toBe('/music/two.mp3');
    expect(audio.volume).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(audio.volume).toBeCloseTo(0.12);
  });
  it('does not restart fades on repeated state updates or play a next song during gameplay', async () => {
    const { music, audio, listeners } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(750);
    music.setActive(true);
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.12);
    music.setActive(false);
    vi.advanceTimersByTime(600);
    music.setActive(false);
    vi.advanceTimersByTime(600);
    expect(audio.paused).toBe(true);
    const calls = audio.play.mock.calls.length;
    music.retry(); listeners.ended();
    expect(audio.play).toHaveBeenCalledTimes(calls);
  });
  it('reverses a fade-out smoothly if the lobby returns quickly', async () => {
    const { music, audio } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(1500);
    music.setActive(false);
    vi.advanceTimersByTime(600);
    music.setActive(true);
    expect(audio.volume).toBeCloseTo(0.06);
    vi.advanceTimersByTime(1500);
    expect(audio.volume).toBeCloseTo(0.12);
    expect(audio.paused).toBe(false);
  });
  it('loads the playlist it is given', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ tracks: ['/music/game.mp3'] }) }));
    const { music, audio } = setup(fetcher, { playlistUrl: '/api/game-music' });
    music.setActive(true);
    await settle();
    expect(fetcher).toHaveBeenCalledWith('/api/game-music');
    expect(audio.src).toBe('/music/game.mp3');
  });
  it('ducks under a voice and comes back to full level', async () => {
    const { music, audio } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(1500);
    music.setDucked(true);
    vi.advanceTimersByTime(300);
    expect(audio.volume).toBeCloseTo(0.042);
    music.setDucked(false);
    vi.advanceTimersByTime(250);
    expect(audio.volume).toBeCloseTo(0.081);
    vi.advanceTimersByTime(250);
    expect(audio.volume).toBeCloseTo(0.12);
  });
  it('keeps the duck ramp going through repeated calls', async () => {
    const { music, audio } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(1500);
    music.setDucked(true);
    vi.advanceTimersByTime(150);
    music.setDucked(true);
    vi.advanceTimersByTime(150);
    expect(audio.volume).toBeCloseTo(0.042);
  });
  it('fades on the undocked level, so a duck during a fade does not disturb it', async () => {
    const { music, audio } = setup();
    music.setActive(true);
    await settle();
    music.setDucked(true);
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.021);
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.042);
    music.setActive(false);
    vi.advanceTimersByTime(1200);
    expect(audio.volume).toBe(0);
    expect(audio.paused).toBe(true);
  });
  it('does not start a late-loaded playlist during a game', async () => {
    let resolve;
    const { music, audio } = setup(() => new Promise(r => { resolve = r; }));
    music.setActive(true);
    music.setActive(false);
    resolve({ ok: true, json: async () => ({ tracks: ['/music/one.mp3'] }) });
    await settle();
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('retries blocked autoplay on user interaction', async () => {
    const { music, audio } = setup();
    audio.play.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
    music.setActive(true);
    await settle();
    music.retry();
    expect(audio.play).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(750);
    expect(audio.volume).toBeCloseTo(0.06);
  });
  it('honors mute and stops mascot motion on buffering or gameplay', async () => {
    const { music, audio, listeners, onPlaybackChange } = setup();
    music.setActive(true);
    await settle();
    vi.advanceTimersByTime(1500);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
    music.setMuted(true);
    expect(audio.muted).toBe(true);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
    music.setMuted(false);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
    listeners.waiting();
    vi.advanceTimersByTime(50);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
    listeners.playing();
    expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
    music.setActive(false);
    expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
  });
});
