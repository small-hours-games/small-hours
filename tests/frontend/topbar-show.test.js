// Topbar show timing: the beat map and the pose math that keeps the singer on the beat.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const kit = {};
runInNewContext(readFileSync(new URL('../../public/js/topbar-show.js', import.meta.url), 'utf8'), kit);
const map = JSON.parse(readFileSync(new URL('../../public/shows/looks-good-to-me.json', import.meta.url), 'utf8'));

describe('Looks Good To Me beat map', () => {
  it('has every beat in order, about half a second apart', () => {
    const b = map.beats;
    expect(b.length).toBeGreaterThan(500);
    for (let i = 1; i < b.length; i++) {
      expect(b[i] - b[i - 1]).toBeGreaterThan(0.44);
      expect(b[i] - b[i - 1]).toBeLessThan(0.56);
    }
    expect(b[b.length - 1]).toBeLessThan(map.duration);
  });

  it('drops at 0:20 on a downbeat, with one bar described per four beats', () => {
    expect(map.dropTime).toBeGreaterThan(19.9);
    expect(map.dropTime).toBeLessThan(20.2);
    expect((map.dropBeat - map.firstBar) % 4).toBe(0);
    expect(Math.abs(map.beats[map.dropBeat] - map.dropTime)).toBeLessThan(0.08);
    expect(map.bars.length).toBe(map.energy.length);
    expect(map.bars.length).toBeGreaterThanOrEqual(Math.floor((map.beats.length - map.firstBar) / 4));
    expect(map.bars).toMatch(/^[dgb]+$/);
  });

  it('belongs to a song that is in the lobby playlist', () => {
    for (const [file, url] of Object.entries(kit.TBS_SHOWS)) {
      expect(existsSync(new URL('../../music/lobby/' + file, import.meta.url))).toBe(true);
      expect(existsSync(new URL('../../public' + url, import.meta.url))).toBe(true);
    }
  });
});

describe('finding the beat', () => {
  const beats = [0, 0.5, 1, 1.5, 2];
  it('returns the beat at or before a time, with or without a hint', () => {
    expect(kit.tbsBeatIndex(beats, -0.1)).toBe(-1);
    expect(kit.tbsBeatIndex(beats, 0.75)).toBe(1);
    expect(kit.tbsBeatIndex(beats, 0.75, 1)).toBe(1);
    expect(kit.tbsBeatIndex(beats, 1.2, 1)).toBe(2);
    expect(kit.tbsBeatIndex(beats, 1.9, 0)).toBe(3);
    expect(kit.tbsBeatIndex(beats, 5)).toBe(4);
  });
});

describe('the show follows the song', () => {
  const at = t => kit.tbsLocate(map, t);
  const pose = t => kit.tbsPose(at(t), false);

  it('waits through the intro, then she falls in on the last beat before the drop', () => {
    expect(at(10).stage).toBe('intro');
    expect(pose(10).show).toBe(false);
    const fallStart = map.beats[map.dropBeat - 1];
    expect(at(fallStart + 0.01).stage).toBe('fall');
    expect(pose(fallStart + 0.01).y).toBeLessThan(-140);
    // Gravity: still in the air just before the drop, on the floor on it.
    expect(pose(map.dropTime - 0.05).y).toBeLessThan(-5);
    expect(at(map.dropTime + 0.001).stage).toBe('dance');
  });

  it('builds up in the bar before the drop', () => {
    expect(at(map.dropTime - 1).riser).toBe(true);
    expect(at(map.dropTime + 5).riser).toBe(false);
  });

  it('lands every hop on the beat in a drop', () => {
    // Bar starting at 36.1 s is a full drop.
    const i = map.beats.findIndex(t => t > 40);
    expect(at(map.beats[i] + 0.01).kind).toBe('d');
    const onBeat = pose(map.beats[i] + 0.001);
    const midBeat = pose((map.beats[i] + map.beats[i + 1]) / 2);
    expect(Math.abs(onBeat.y)).toBeLessThan(1);
    expect(midBeat.y).toBeLessThan(-6);
    expect(onBeat.sy).toBeLessThan(0.9);   // squash on landing
  });

  it('bobs lowest on the beat and stays on the floor in a break', () => {
    const i = map.beats.findIndex(t => t > 72);
    const loc = at(map.beats[i] + 0.001);
    expect(loc.kind).toBe('b');
    const p = pose(map.beats[i] + 0.001);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.eyes).toBeLessThan(0.5);
  });

  it('travels across the bar in the drops and stays inside it', () => {
    for (let t = 34; t < 120; t += 0.37) {
      const p = pose(t);
      if (p.travel != null) {
        expect(p.travel).toBeGreaterThanOrEqual(0);
        expect(p.travel).toBeLessThanOrEqual(1);
      }
      expect(p.y).toBeGreaterThan(-20); // never jumps out of the bar
    }
  });

  it('waves goodbye after the last beat', () => {
    expect(at(map.beats[map.beats.length - 1] + 0.1).stage).toBe('outro');
  });
});
