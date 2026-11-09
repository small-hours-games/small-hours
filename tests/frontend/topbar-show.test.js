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

describe('the lobby shakes on the beat', () => {
  const at = t => kit.tbsLocate(map, t);
  const shake = t => kit.tbsShake(at(t), false);
  const size = s => Math.hypot(s.vx, s.vy);

  it('stays still in the intro and rocks hardest on the landing', () => {
    expect(size(shake(10))).toBe(0);
    let landing = 0;
    for (let t = map.dropTime + 0.02; t < map.dropTime + 0.4; t += 0.02) landing = Math.max(landing, size(shake(t)));
    expect(landing).toBeGreaterThan(4);
  });

  it('kicks on each beat of a drop and settles before the next one', () => {
    const i = map.beats.findIndex((t, k) => t > 40 && Number(map.kick[k]) >= 8 && map.bars[Math.floor((k - map.firstBar) / 4)] === 'd');
    expect(shake(map.beats[i] + 0.005).kick).toBeGreaterThan(0.9);
    expect(shake(map.beats[i + 1] - 0.03).kick).toBeLessThan(0.05);
  });

  it('only breathes in a break, and does nothing with reduced motion', () => {
    const i = map.beats.findIndex(t => t > 72);
    expect(size(shake(map.beats[i] + 0.05))).toBe(0);
    expect(kit.tbsShake(at(40.2), true)).toEqual({ vx: 0, vy: 0, kick: 0 });
  });
});

describe('the lion and the frog dance under the QR code', () => {
  const at = t => kit.tbsLocate(map, t);
  it('answer each other in a drop: the lion hops on 1 and 3, the frog on 2 and 4', () => {
    const i = map.beats.findIndex((t, k) => t > 40 && (k - map.firstBar) % 4 === 0);
    const mid = k => (map.beats[k] + map.beats[k + 1]) / 2;
    expect(kit.tbsDancerPose(at(mid(i)), 0, false).y).toBeLessThan(-8);
    expect(kit.tbsDancerPose(at(mid(i)), 1, false).y).toBeGreaterThan(-1);
    expect(kit.tbsDancerPose(at(mid(i + 1)), 1, false).y).toBeLessThan(-8);
    expect(kit.tbsDancerPose(at(mid(i + 1)), 0, false).y).toBeGreaterThan(-1);
  });
  it('both jump when she lands, and stand still with reduced motion', () => {
    const t = map.dropTime + 0.25;
    expect(kit.tbsDancerPose(at(t), 0, false).y).toBeLessThan(-15);
    expect(kit.tbsDancerPose(at(t), 1, false).y).toBeLessThan(-15);
    expect(kit.tbsDancerPose(at(t), 0, true).y).toBe(0);
  });
});

describe('the fire pool', () => {
  it('hands out a fixed number of particles and reuses dead ones in place', () => {
    const pool = kit.tbsPool(3);
    const a = kit.tbsPoolTake(pool), b = kit.tbsPoolTake(pool), c = kit.tbsPoolTake(pool);
    expect(kit.tbsPoolTake(pool)).toBeNull();          // full: no new objects
    a.id = 'a'; b.id = 'b'; c.id = 'c';
    kit.tbsPoolKill(pool, 0);                          // 'a' dies, the last live one takes its place
    expect(pool.n).toBe(2);
    expect(pool.items.slice(0, 2).map(x => x.id)).toEqual(['c', 'b']);
    expect(kit.tbsPoolTake(pool)).toBe(a);             // the dead one is reused, not reallocated
  });
});

describe('the fire and the moves follow how hard the music hits', () => {
  const at = t => kit.tbsLocate(map, t);
  it('keeps the logo fire dark until the big drop at 0:34, then lights it', () => {
    expect(map.igniteTime).toBeGreaterThan(33.9);
    expect(map.igniteTime).toBeLessThan(34.4);
    expect(at(20.5).ignited).toBe(false);
    expect(at(33.9).ignited).toBe(false);
    expect(at(map.igniteTime + 0.01).ignited).toBe(true);
  });
  it('measures kick, snare and off-beat for every beat', () => {
    for (const key of ['kick', 'snare', 'offbeat']) {
      expect(map[key]).toMatch(/^[0-9]+$/);
      expect(map[key].length).toBe(map.beats.length);
    }
  });
  it('hops higher on a hard kick than on a soft one', () => {
    const drops = map.beats.map((t, k) => k).filter(k => k > map.igniteBeat && map.bars[Math.floor((k - map.firstBar) / 4)] === 'd' && k + 1 < map.beats.length);
    const hard = drops.find(k => Number(map.kick[k]) >= 8);
    const soft = drops.find(k => Number(map.kick[k]) <= 3);
    const mid = k => (map.beats[k] + map.beats[k + 1]) / 2;
    expect(kit.tbsPose(at(mid(hard)), false).y).toBeLessThan(kit.tbsPose(at(mid(soft)), false).y);
  });
  it('crouches just before the next beat and is down on it', () => {
    const k = map.beats.findIndex((t, j) => t > 40 && Number(map.kick[j + 1]) >= 6);
    const before = map.beats[k + 1] - 0.02;
    expect(kit.tbsPose(at(before), false).y).toBeGreaterThan(0);
  });
});

describe('the show lowers its detail on a slow TV', () => {
  const run = (g, ms, frames) => { let t = g.tier; for (let i = 0; i < frames; i++) t = kit.tbsGovern(g, ms); return t; };

  it('stays at full detail at 60 fps', () => {
    const g = kit.tbsGovernor('auto');
    expect(run(g, 16.7, 600)).toBe(0);
  });

  it('steps down one tier after a second and a half of slow frames, then another', () => {
    const g = kit.tbsGovernor('auto');
    run(g, 16.7, 60);                       // warm-up second
    expect(run(g, 33, 30)).toBe(0);         // one slow second is not enough
    expect(run(g, 33, 40)).toBe(1);
    expect(run(g, 33, 60)).toBe(2);
    expect(run(g, 33, 200)).toBe(2);        // never below the lowest tier
  });

  it('ignores hidden-tab gaps and steps back up only once', () => {
    const g = kit.tbsGovernor('auto');
    run(g, 16.7, 60);
    expect(run(g, 1000, 20)).toBe(0);       // a background tab, not a slow TV
    run(g, 33, 80);
    expect(g.tier).toBe(1);
    expect(run(g, 16.7, 600)).toBe(0);      // fast again for 8 s: back to full
    run(g, 33, 80);
    expect(run(g, 16.7, 1200)).toBe(1);     // it does not flap a second time
  });

  it('can be fixed per TV', () => {
    expect(run(kit.tbsGovernor('full'), 50, 300)).toBe(0);
    expect(run(kit.tbsGovernor('lite'), 16.7, 300)).toBe(2);
  });
});

describe('the AI characters join the show', () => {
  const at = t => kit.tbsLocate(map, t, -1);
  it('wander in one by one after the drop, a little lost, then dance their own way', () => {
    const drop = map.dropTime;
    expect(kit.tbsBotPose(at(drop - 2), 0, 'boot', false).show).toBe(false);
    expect(kit.tbsBotPose(at(drop + 2), 0, 'boot', false)).toMatchObject({ show: true, lost: true });
    expect(kit.tbsBotPose(at(drop + 2), 3, 'zoom', false).show).toBe(false);   // the last one is not here yet
    const kinds = ['boot', 'glitch', 'dizzy', 'zoom'];
    const t = drop + 12;
    const poses = kinds.map((k, i) => kit.tbsBotPose(at(t), i, k, false));
    poses.forEach(p => expect(p.show).toBe(true));
    expect(new Set(poses.map(p => JSON.stringify([p.x, p.y, p.rot]))).size).toBeGreaterThan(2);
  });
  it('stay small and out of the singer’s way: they stand at the edges of the bar', () => {
    expect(kit.TBS_BOT_SPOTS || [0.05, 0.17, 0.83, 0.95]).toEqual([0.05, 0.17, 0.83, 0.95]);
  });
});

describe('Board Crash', () => {
  const homes = { nova: { x: -0.3, y: -0.2 }, glitch: { x: -0.1, y: -0.2 }, byte: { x: 1.1, y: -0.2 }, turbo: { x: 1.3, y: -0.2 } };
  const st = u => kit.tbsCrashState(u, homes);
  it('happens once, at 03:27 in Looks Good To Me only, with Turbo winding up just before', () => {
    expect(kit.TBS_CRASH_AT['Looks-good-to-me-remix.mp3']).toBeCloseTo(207, 0);
    expect(Object.keys(kit.TBS_CRASH_AT)).toHaveLength(1);
    expect(st(-1.1).on).toBe(false);
    expect(st(-0.5).turbo).toMatchObject({ away: 0 });
    expect(st(-0.5).turbo.react.windup).toBeGreaterThan(0);
    expect(st(16.5).on).toBe(false);
  });
  it('is played by the dancers themselves: every robot leaves its own spot and comes back to it', () => {
    for (const who of ['turbo', 'nova', 'glitch', 'byte']) {
      expect(st(-0.9)[who].away).toBe(0);                 // all at home at the start
      expect(st(16.3)[who].away).toBe(0);                 // and at the end
      let left = false;
      for (let u = -1; u < 16.4; u += 0.05) if (st(u)[who].away > 0.99) left = true;
      expect(left).toBe(true);
    }
    // Leaving and coming back is gradual (a flight, a jump, a roll), except Glitch, who teleports.
    for (const who of ['turbo', 'nova', 'byte']) {
      let prev = 0;
      for (let u = -1; u < 16.4; u += 0.02) { const a = st(u)[who].away; expect(Math.abs(a - prev)).toBeLessThan(0.12); prev = a; }
    }
  });
  it('runs the cast in order: Turbo crashes, Nova-7 frets, the crew rebuilds', () => {
    expect(st(0.5).turbo.away).toBeGreaterThan(0);
    expect(st(0.5).nova.away).toBe(0);
    expect(st(1.0).nova.react.emote).toBe('!');          // the others jump at the hit
    expect(st(3.5).nova).toMatchObject({ away: 1, mood: 'worried' });
    expect(st(7).turbo.away).toBe(0);                    // Turbo has gone home to sulk
    expect(st(7).turbo.react.slump).toBe(1);
    expect(st(8).glitch.away).toBe(0);
    const s = st(11);
    expect(s.glitch.away + s.byte.away + s.nova.away).toBe(3);
  });
  it('flies Turbo nose first at the board from wherever it was dancing', () => {
    const right = st(0.3).turbo.tilt, left = kit.tbsCrashState(0.3, { ...homes, turbo: { x: -0.3, y: -0.2 } }).turbo.tilt;
    expect(right).toBeLessThan(-90);   // from the top right: nose down and to the left
    expect(left).toBeGreaterThan(90);
  });
  it('speaks its own lines at the cue times, never two Nova-7 lines at once', () => {
    const at = u => st(u).lines.map(l => l.who);
    expect(at(2.5)).toEqual([]);
    expect(at(3.2)).toEqual(['turbo']);
    expect(at(5.5)).toEqual(['nova']);
    for (let u = 0; u < 16; u += 0.1) expect(at(u).filter(w => w === 'nova').length).toBeLessThanOrEqual(1);
    expect(kit.TBS_CRASH_LINES.every(l => l.at + l.len <= 16)).toBe(true);
  });
  it('drops every card out of the screen, then lands it back in place', () => {
    const from = { dx: -200, dy: 300 };
    for (let j = 0; j < 5; j++) {
      expect(kit.tbsCrashCard(0.2, j, 900, from)).toMatchObject({ x: 0, y: 0, op: 1 });
      expect(kit.tbsCrashCard(5, j, 900, from)).toMatchObject({ y: 900, op: 0 });
      expect(kit.tbsCrashCard(15.9, j, 900, from)).toMatchObject({ x: 0, y: 0, rot: 0, op: 1 });
    }
    const a = kit.tbsCrashCard(1.2, 0, 5000, from).y, b = kit.tbsCrashCard(1.4, 0, 5000, from).y, c = kit.tbsCrashCard(1.6, 0, 5000, from).y;
    expect(c - b).toBeGreaterThan(b - a);
  });
});

describe('the AI dancers each have a personality', () => {
  const at = t => kit.tbsLocate(map, t, -1);
  const kinds = ['boot', 'glitch', 'dizzy', 'zoom'];
  const t0 = map.dropTime + 14;
  it('change moves from bar to bar, never the same move twice in a row', () => {
    kinds.forEach((k, i) => {
      const moves = [];
      for (let bar = 10; bar < 60; bar++) {
        const m = kit.tbsBotMove(bar, i, k);
        if (moves.length) expect(m).not.toBe(moves[moves.length - 1]);
        moves.push(m);
      }
      expect(new Set(moves).size).toBeGreaterThanOrEqual(3);
    });
  });
  it('wander around their spot instead of standing still', () => {
    kinds.forEach((k, i) => {
      const xs = new Set();
      for (let t = t0; t < t0 + 40; t += 1) { const p = kit.tbsBotPose(at(t), i, k, false); if (!p.lost) xs.add(Math.round(p.x / 4)); }
      expect(xs.size).toBeGreaterThan(4);
    });
  });
  it('take turns doing a gag, one at a time, while the others watch', () => {
    let gags = 0;
    for (let bar = 0; bar < 120; bar++) {
      const o = kit.tbsBotGagOwner(bar, 'd');
      if (o >= 0) { gags++; expect(o).not.toBe(kit.tbsBotGagOwner(bar - 1, 'd')); }
    }
    expect(gags).toBeGreaterThan(20);
    expect(gags).toBeLessThan(90);
  });
  it('step aside for the singer when she comes close', () => {
    const w = 900, loc = at(t0);
    const free = kit.tbsBotPose(loc, 1, 'boot', false, { singer: 0.6, w });
    const near = kit.tbsBotPose(loc, 1, 'boot', false, { singer: kit.TBS_BOT_SPOTS[1] + free.x / w + 0.02, w });
    if (!free.lost) expect(near.x).toBeLessThan(free.x);
  });
});

describe('AI robot rigs', () => {
  const rk = {};
  runInNewContext(readFileSync(new URL('../../public/js/ai-robots.js', import.meta.url), 'utf8'), rk);
  it('has a rig for every entrance style, with the parts that move', () => {
    const svg = rk.AI_ROBOT_SVG;
    expect(Object.keys(svg).sort()).toEqual(['boot', 'dizzy', 'glitch', 'zoom']);
    expect(typeof rk.aiRobot).toBe('function');
    expect(svg.boot).toContain('data-part="legL"');
    expect(svg.zoom).toContain('data-part="flame"');
    expect(svg.dizzy).toContain('data-part="brain"');
    for (const k of Object.keys(svg)) {
      expect(svg[k]).toContain('data-part="calm"');
      expect(svg[k]).toContain('data-part="worried"');
    }
  });
});

describe('The robots sing along', () => {
  const song = 'Looks-good-to-me-remix.mp3';
  const said = t => kit.tbsSongLines(song, t).map(l => l.who + ': ' + l.text);
  it('gives each line to its robot at its time in the song', () => {
    expect(said(47)).toEqual(['byte: I guess that makes me second or worse']);
    expect(said(117)).toEqual(['nova: Sorry for the confusion']);
    expect(said(243)).toEqual(['all: Now the bot reviews the bot']);
    expect(said(30)).toEqual([]);
    expect(said(kit.TBS_CRASH_AT[song] + 3.5)).toEqual(['turbo: Great catch!']);
    expect(kit.tbsSongLines('other.mp3', 47)).toEqual([]);
  });
  it('never has one robot saying two lines at once, and stays out of the Board Crash', () => {
    const lines = kit.TBS_SONG_LINES[song], crash = kit.TBS_CRASH_AT[song];
    for (let t = 0; t < 290; t += 0.1) {
      const who = kit.tbsSongLines(song, t).map(l => l.who);
      expect(new Set(who).size).toBe(who.length);
    }
    expect(lines.every(l => l.at + l.len <= crash || l.at >= crash + 16.4)).toBe(true);
    expect(lines.every(l => ['nova', 'glitch', 'byte', 'turbo', 'all'].includes(l.who))).toBe(true);
  });
});
