import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../../public/js/lobby-music.js', import.meta.url), 'utf8');
function setup(fetcher = async () => ({ ok: true, json: async () => ({ tracks: ['/music/one.mp3', '/music/two.mp3'] }) })) {
  const listeners = {};
  const audio = {
    paused: true, src: '', muted: false,
    getAttribute: () => audio.src,
    addEventListener: (event, fn) => { listeners[event] = fn; },
    play: vi.fn(() => { audio.paused = false; return Promise.resolve(); }),
    pause: vi.fn(() => { audio.paused = true; }),
  };
  const context = { fetch: fetcher };
  runInNewContext(source, context);
  const onPlaybackChange = vi.fn();
  return { audio, listeners, onPlaybackChange, music: context.createLobbyMusic(audio, onPlaybackChange) };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
describe('Lobby soundtrack', () => {
  it('plays quietly, cycles songs, respects mute, and stops for gameplay', async () => {
    const { music, audio, listeners } = setup();
    music.setActive(true);
    await settle();
    expect(audio.volume).toBe(0.12);
    expect(audio.src).toBe('/music/one.mp3');
    audio.paused = true;
    listeners.ended();
    expect(audio.src).toBe('/music/two.mp3');
    music.setMuted(true);
    expect(audio.muted).toBe(true);
    music.setActive(false);
    const calls = audio.play.mock.calls.length;
    music.retry();
    listeners.ended();
    expect(audio.paused).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(calls);
    music.setActive(true);
    expect(audio.paused).toBe(false);
  });
  it('does not start a late-loaded playlist during a game', async () => {
    let resolve;
    const response = new Promise(r => { resolve = r; });
    const { music, audio } = setup(() => response);
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
  });
});


it('wobbles only during audible playback and stops on mute, buffering or gameplay', async () => {
  const { music, audio, listeners, onPlaybackChange } = setup();
  music.setActive(true);
  await settle();
  expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
  music.setMuted(true);
  expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
  music.setMuted(false);
  expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
  listeners.waiting();
  expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
  listeners.playing();
  expect(onPlaybackChange).toHaveBeenLastCalledWith(true);
  music.setActive(false);
  expect(audio.paused).toBe(true);
  expect(onPlaybackChange).toHaveBeenLastCalledWith(false);
});
