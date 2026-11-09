// Topbar show: when a song with a beat map starts in the lobby, the blue topbar on the TV
// comes alive. For "Looks Good To Me" a singer drops into the bar on the drop at 0:20 and
// dances to the beat until the song ends; she never leaves the bar.
//
// Timing comes from a beat map (public/shows/*.json, made by scripts/song-beatmap.py):
// the real time of every beat, so the show stays on the beat even though the song drifts
// from about 118 to 123 BPM. The clock is the audio element's own currentTime.
// Plain browser script exposing globals, loaded after lobby-music.js.

var TBS_SHOWS = {
  // file name in music/lobby  ->  beat map
  'Looks-good-to-me-remix.mp3': '/shows/looks-good-to-me.json',
};

// Songs with a "Board Crash" in them: the song second it starts (the last big drop).
var TBS_CRASH_AT = {
  'Looks-good-to-me-remix.mp3': 207.0,
};

/**
 * Board Crash, an event in one song. The cast is the four AI dancers from the topbar
 * themselves: each one leaves its own spot in the bar, plays its part over the vote board and
 * goes back. Turbo winds up and rockets into the board, knocking every game card off the
 * screen; Nova-7 jumps down into the empty board and frets; Glitch teleports and Prof. Byte
 * rolls down, carefully and late, and they put the cards back one per beat.
 * u: seconds since the hit cue (it starts a second earlier with Turbo's wind-up).
 * homes: where each robot stands in the bar, in vote-board fractions (x across, y down; feet).
 * Each robot: { x, y } its spot on the board, away 0..1 how far it has left home for it
 * (0: dancing in the bar), lift extra height while it travels, and pose values; a robot that
 * is still home gets react: { emote, mood, face, jump, slump } instead. Pure; for tests.
 */
var TBS_CRASH_LEN = 16.4;
var TBS_CRASH_PRE = 1.0;        // Turbo's wind-up before the cue
var TBS_CRASH_LINES = [
  // On the song's own words (timed from a word-level transcription of the track): the crash
  // starts at 03:27, so u 3.0 is 03:30.
  { who: 'turbo', at: 3.0, len: 2.3, text: 'Great catch!' },
  { who: 'nova', at: 5.3, len: 1.9, text: 'Oh, restore from backup!' },
  { who: 'nova', at: 7.2, len: 1.4, text: 'Oh, we don’t have a backup?' },
  { who: 'nova', at: 9.25, len: 1.6, text: 'Oh, restore from backup?' },
  { who: 'nova', at: 10.95, len: 1.5, text: 'Oh, we don’t have a backup!' },
  { who: 'glitch', at: 10.8, len: 1.8, text: 'R-r-rebuilding… 40%!' },
  { who: 'byte', at: 12.4, len: 2.0, text: 'Ah, a fascinating stacking problem.' },
];
var TBS_CRASH_HIT = 0.85;

/**
 * The robots sing along: lines the AI cast says during a song, in song seconds, outside the
 * Board Crash (which has its own lines above). who: 'nova', 'glitch', 'byte', 'turbo', or
 * 'all' for the whole cast. A line shows in a speech bubble under the robot's spot in the bar.
 * Times where the vocal is clear come from a word-level transcription of the track (03:10-03:38,
 * 02:16, 04:03, 04:31); the rest follow the lyric sheet.
 */
var TBS_SONG_LINES = {
  'Looks-good-to-me-remix.mp3': [
    { who: 'byte', at: 46.0, len: 3.5, text: 'I guess that makes me second or worse' },
    { who: 'byte', at: 71.1, len: 2.3, text: 'But the tests are all mocked' },
    { who: 'glitch', at: 106.9, len: 1.7, text: 'And I’m going to sleep' },
    { who: 'byte', at: 108.6, len: 3.3, text: 'All done, it is' },
    { who: 'glitch', at: 111.9, len: 3.5, text: 'All done, it is' },
    { who: 'nova', at: 116.7, len: 2.3, text: 'Sorry for the confusion' },
    { who: 'glitch', at: 119.0, len: 2.9, text: 'All done, it is' },
    { who: 'glitch', at: 136.1, len: 1.4, text: '…tokens instead' },
    { who: 'byte', at: 152.1, len: 2.8, text: 'And nobody knows what the code does inside' },
    { who: 'glitch', at: 182.0, len: 3.5, text: 'And I’m going to sleep' },
    { who: 'byte', at: 186.2, len: 2.1, text: 'All done, it is!' },
    { who: 'glitch', at: 188.3, len: 2.1, text: 'All done, it is!' },
    { who: 'nova', at: 191.7, len: 2.4, text: 'Sorry for the confusion' },
    { who: 'byte', at: 194.3, len: 1.2, text: 'All done… isn’t.' },
    { who: 'all', at: 242.1, len: 1.4, text: 'Now the bot reviews the bot' },
    { who: 'all', at: 243.5, len: 3.0, text: 'A million lines and the humans all got cut' },
    { who: 'all', at: 246.8, len: 1.7, text: 'Approved in three seconds' },
    { who: 'all', at: 256.1, len: 1.2, text: 'Let’s ship it to prod' },
    { who: 'all', at: 257.3, len: 2.5, text: 'It’s Friday at five' },
    { who: 'all', at: 259.8, len: 2.4, text: 'So I’ll leave it with God' },
    { who: 'byte', at: 271.8, len: 1.6, text: 'And I’m going to sleep' },
  ],
};
/** The song lines being said at song second t (the Board Crash lines included). Pure; for tests. */
function tbsSongLines(name, t) {
  var out = (TBS_SONG_LINES[name] || []).filter(function (l) { return t >= l.at && t < l.at + l.len; });
  var at = TBS_CRASH_AT[name];
  if (at != null) TBS_CRASH_LINES.forEach(function (l) { if (t - at >= l.at && t - at < l.at + l.len) out.push(l); });
  return out;
}
var TBS_CRASH_HOMES = { nova: { x: -0.35, y: -0.3 }, glitch: { x: -0.2, y: -0.3 }, byte: { x: 1.2, y: -0.3 }, turbo: { x: 1.35, y: -0.3 } };
function tbsCrashCardBack(j) { return 9.2 + j * 1.0; }
function tbsEase(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function tbsLerp(a, b, x) { return a + (b - a) * x; }
function tbsSpan(u, a, b) { return Math.max(0, Math.min(1, (u - a) / (b - a))); }
/** Nose-first heading (degrees, 0 = up) for a flight from a to b in board fractions. */
function tbsHeading(a, b) { return Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI; }
function tbsCrashState(u, homes) {
  var H = homes || TBS_CRASH_HOMES;
  var hT = H.turbo || TBS_CRASH_HOMES.turbo, hN = H.nova || TBS_CRASH_HOMES.nova;
  var hG = H.glitch || TBS_CRASH_HOMES.glitch, hB = H.byte || TBS_CRASH_HOMES.byte;
  var out = { on: u >= -TBS_CRASH_PRE && u < TBS_CRASH_LEN, turbo: null, nova: null, glitch: null, byte: null, lines: [] };
  if (!out.on) return out;
  var shock = u >= TBS_CRASH_HIT && u < TBS_CRASH_HIT + 1.1;     // everyone left in the bar jumps
  var home = function (react) { return { away: 0, x: 0, y: 0, lift: 0, react: react }; };

  // Turbo: winds up in the bar, rockets nose first into the board, spins out against the right
  // edge, sulks there smoking, flies home and sulks in the bar (until Nova-7 yells at it).
  var impact = { x: 0.5, y: 0.45 }, wall = { x: 0.97, y: 0.62 };
  if (u < 0) {
    var wind = u + TBS_CRASH_PRE;
    out.turbo = home({ emote: wind > 0.5 ? '!' : '', mood: 'calm', face: 'board', windup: wind, boost: 0.4 + 0.6 * wind });
  } else if (u < 1.0) {
    out.turbo = { away: u * u, x: impact.x, y: impact.y, lift: 0, tilt: tbsHeading(hT, impact), boost: 1, mood: 'calm' };
  } else if (u < 2.0) {
    var f = tbsEase(u - 1.0);
    out.turbo = { away: 1, x: tbsLerp(impact.x, wall.x, f), y: tbsLerp(impact.y, wall.y, f), lift: 0, tilt: tbsLerp(tbsHeading(hT, impact), 520, f), boost: 0.3, mood: 'worried' };
  } else if (u < 5.0) {
    out.turbo = { away: 1, x: wall.x, y: wall.y, lift: 0, tilt: 160 + 5 * Math.sin(u * 6), boost: 0, mood: 'worried', smoke: true };
  } else if (u < 6.4) {
    var g = tbsSpan(u, 5.0, 6.4);
    out.turbo = { away: 1 - tbsEase(g), x: wall.x, y: wall.y, lift: 0, tilt: tbsLerp(160, tbsHeading(wall, hT), Math.min(1, g * 3)) * (1 - tbsEase(g)), boost: 1, mood: 'calm' };
  } else {
    var yelled = u >= 10.0 && u < 10.9;
    out.turbo = home(yelled ? { emote: '!', mood: 'worried', face: 'nova', jump: Math.sin(Math.PI * tbsSpan(u, 10.0, 10.5)) }
      : { emote: '…', mood: 'worried', face: 'away', slump: 1 });
  }

  // Nova-7: startled in the bar, jumps down into the empty board, frets on the spot,
  // walks to the bottom edge to peer down after the cards, yells at Turbo, then jumps home.
  var land = { x: 0.24, y: 0.42 }, fret = { x: 0.36, y: 0.42 }, edge = { x: 0.5, y: 0.97 };
  if (u < 1.9) {
    out.nova = home(shock ? { emote: '!', mood: 'worried', face: 'board', jump: Math.sin(Math.PI * tbsSpan(u, TBS_CRASH_HIT, TBS_CRASH_HIT + 0.45)) }
      : u >= TBS_CRASH_HIT ? { emote: '?', mood: 'worried', face: 'board' } : null);
  } else if (u < 14.4) {
    var hop = tbsSpan(u, 1.9, 2.7);
    var walkA = tbsSpan(u, 2.7, 3.3), walkB = tbsSpan(u, 7.7, 8.5);
    var x = hop < 1 ? land.x : walkB > 0 ? tbsLerp(fret.x, edge.x, tbsEase(walkB)) : tbsLerp(land.x, fret.x, tbsEase(walkA));
    var y = hop < 1 ? land.y : walkB > 0 ? tbsLerp(fret.y, edge.y, tbsEase(walkB)) : fret.y;
    var walking = (walkA > 0 && walkA < 1) || (walkB > 0 && walkB < 1);
    var peer = u >= 8.5 && u < 9.9, yell = u >= 10.0 && u < 11.6, wring = u >= 11.6;
    out.nova = {
      away: tbsEase(hop), x: x, y: y, lift: -0.18 * Math.sin(Math.PI * hop),
      step: walking ? u * 1.8 : 0, mood: u >= 2.7 ? 'worried' : 'calm',
      tilt: peer ? 14 : yell ? -6 : 0,
      look: hop < 1 ? 0 : peer ? 18 : yell ? -16 : u < 7.7 ? 14 * Math.sin(u * 1.3) : 10,   // looking around, then down
      flip: yell ? 1 : 1,
      arm: u >= 7.0 && u < 7.9 ? 0.6 * Math.abs(Math.sin(u * 14)) : yell ? 0.9 : wring ? 0.35 + 0.25 * Math.sin(u * 9) : hop < 1 ? 0.8 : 0,
    };
  } else {
    var back = tbsSpan(u, 14.4, 15.4);
    out.nova = back < 1 ? { away: 1 - tbsEase(back), x: edge.x, y: edge.y, lift: -0.25 * Math.sin(Math.PI * back), step: 0, mood: 'calm', tilt: 0, look: 0, arm: 0.8 }
      : home({ emote: '', mood: 'calm', face: 'board' });
  }

  // The repair crew. Glitch teleports down (flickering out of the bar and into the board);
  // Prof. Byte rolls the long way down, wobbling, and arrives a bit late.
  var gSpot = { x: 0.08, y: 1.02 }, bSpot = { x: 0.92, y: 1.02 };
  var crewArm = function (who) {
    var a = 0;
    for (var j = who; j < 5; j += 2) {
      var since = u - tbsCrashCardBack(j);
      if (since > -0.3 && since < 0.4) a = Math.max(a, Math.sin(Math.PI * Math.max(0, Math.min(1, (since + 0.3) / 0.7))));
    }
    return a;
  };
  var gOut = u >= 8.2 && u < 8.6, gBack = u >= 14.5 && u < 14.9;
  if ((u >= 8.4 && u < 14.7)) {
    out.glitch = { away: 1, x: gSpot.x, y: gSpot.y, lift: 0, wheel: u * 90, tilt: 4 * Math.sin(u * 9),
      jitter: Math.sin(u * 23) > 0.6 ? 1 : 0, arm: crewArm(0), mood: 'calm',
      flicker: (u < 8.6 || u >= 14.5) ? (Math.floor(u * 24) % 2 ? 0.25 : 1) : 1 };
  } else {
    out.glitch = home(gOut || gBack ? { emote: '', mood: 'calm', face: 'board', flicker: Math.floor(u * 24) % 2 ? 0.2 : 1 }
      : shock ? { emote: '!', mood: 'worried', face: 'board', jump: Math.sin(Math.PI * tbsSpan(u, TBS_CRASH_HIT + 0.1, TBS_CRASH_HIT + 0.5)), jitter: 1 }
      : u >= TBS_CRASH_HIT && u < 8.2 ? { emote: u % 2 < 1 ? '?' : '', mood: 'worried', face: 'board', jitter: Math.sin(u * 17) > 0.7 ? 1 : 0 } : null);
  }
  var bDown = tbsSpan(u, 7.4, 8.9), bUp = tbsSpan(u, 14.6, 16.0);
  if (u >= 7.4 && u < 16.0) {
    var travel = u < 8.9 ? bDown : bUp;
    var moving = (u < 8.9) || (u >= 14.6);
    out.byte = { away: u < 8.9 ? tbsEase(bDown) : 1 - tbsEase(bUp), x: bSpot.x, y: bSpot.y,
      lift: moving ? -0.12 * Math.sin(Math.PI * travel) : 0,
      wheel: -u * (moving ? 420 : 200), tilt: (moving ? 16 : 10) * Math.sin(u * 2.6), step: u * 0.7, arm: moving ? 0.5 : crewArm(1), mood: 'calm' };
  } else {
    out.byte = home(shock ? { emote: '!', mood: 'worried', face: 'board', wobble: 1 - tbsSpan(u, TBS_CRASH_HIT, TBS_CRASH_HIT + 1.1) }
      : u >= 2.5 && u < 7.4 ? { emote: '✎', mood: 'calm', face: 'board', notes: 1 } : null);
  }
  TBS_CRASH_LINES.forEach(function (l) { if (u >= l.at && u < l.at + l.len) out.lines.push(l); });
  return out;
}

/**
 * Where game card j is during the crash, in screen px from its own place: knocked off at the
 * hit and falling out of the screen with real gravity, then thrown back up from the robot that
 * carries it, landing with a bounce. fall: px to clear the screen; from: { dx, dy } of the robot.
 */
function tbsCrashCard(u, j, fall, from) {
  var dir = j % 2 ? 1 : -1;
  var t = u - (TBS_CRASH_HIT + j * 0.07);
  var back = u - tbsCrashCardBack(j);
  if (t < 0) return { x: 0, y: 0, rot: 0, op: 1 };
  if (back < 0) {
    var y = -260 * t + 0.5 * 2600 * t * t;
    if (y > fall) return { x: 0, y: fall, rot: 0, op: 0 };
    return { x: dir * (90 + 40 * j) * t, y: y, rot: dir * (160 + 50 * j) * t, op: 1 };
  }
  if (back < 0.55) {
    var k = back / 0.55;
    var c1 = 1.70158, eb = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);   // ease-out back
    return { x: from.dx * (1 - eb), y: from.dy * (1 - eb) - 60 * Math.sin(Math.PI * k), rot: dir * 25 * (1 - k), op: Math.min(1, k * 4) };
  }
  return { x: 0, y: 0, rot: 0, op: 1 };
}

/** Index of the beat at or before t (−1 before the first beat). Pure; for tests. */
function tbsBeatIndex(beats, t, hint) {
  var n = beats.length;
  var i = hint != null && hint >= -1 && hint < n ? hint : -1;
  // Usually a step or two from last frame; fall back to a binary search on seeks.
  if (i >= -1 && i < n && (i < 0 || beats[i] <= t) && (i + 1 >= n || beats[i + 1] > t)) return i;
  if (i + 1 < n && beats[i + 1] <= t && (i + 2 >= n || beats[i + 2] > t)) return i + 1;
  var lo = 0, hi = n - 1;
  if (t < beats[0]) return -1;
  while (lo < hi) {
    var mid = (lo + hi + 1) >> 1;
    if (beats[mid] <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * Where the song is at time t: beat, phase within it, bar, section kind and energy,
 * and the show phase (intro / fall / dance / outro). Pure; for tests.
 */
function tbsLocate(map, t, hint) {
  var beats = map.beats;
  var n = beats.length;
  var i = tbsBeatIndex(beats, t, hint);
  var start = i < 0 ? 0 : beats[i];
  var next = i + 1 < n ? beats[i + 1] : start + (n > 1 ? beats[n - 1] - beats[n - 2] : 0.5);
  if (i < 0) { next = beats[0]; start = next - (beats[1] - beats[0]); }
  var len = Math.max(0.05, next - start);
  var phase = Math.max(0, Math.min(0.9999, (t - start) / len));
  var rel = i - (map.firstBar || 0);
  var bar = Math.floor(rel / 4);
  var beatInBar = ((rel % 4) + 4) % 4;
  var kind = map.bars.charAt(bar) || 'b';
  var nextKind = map.bars.charAt(bar + 1) || '';
  var energy = (Number(map.energy.charAt(bar)) || 0) / 9;
  var fallStart = beats[Math.max(0, map.dropBeat - 1)];
  // How hard this beat hits (0-1), measured from the song: kick and snare on the beat,
  // hi-hat on the off-beat. Maps without them count every beat as a full hit.
  var dig = function (str, k, dflt) { var c = str ? str.charAt(k) : ''; return c ? Number(c) / 9 : dflt; };
  var igniteTime = map.igniteTime != null ? map.igniteTime : map.dropTime;
  var lastBeat = beats[n - 1];
  var stage = t < fallStart ? 'intro' : t < map.dropTime ? 'fall' : t < lastBeat ? 'dance' : 'outro';
  return {
    t: t, i: i, phase: phase, beatLen: len, bar: bar, beatInBar: beatInBar,
    kind: kind, nextKind: nextKind, energy: energy, stage: stage,
    // The last bar before a drop (and before her landing) builds up to it.
    riser: kind !== 'd' && (nextKind === 'd' || bar + 1 === Math.floor((map.dropBeat - (map.firstBar || 0)) / 4)),
    // A drop that follows a quieter bar opens with a spin.
    sectionStart: kind === 'd' && bar > 0 && map.bars.charAt(bar - 1) !== 'd' && beatInBar === 0 &&
      bar !== Math.floor((map.dropBeat - (map.firstBar || 0)) / 4),
    sinceDrop: t - map.dropTime,
    kick: dig(map.kick, i, 1), snare: dig(map.snare, i, 0.5), offbeat: dig(map.offbeat, i, 0.5),
    nextKick: dig(map.kick, i + 1, 1),
    // The fire over the logo stays dark until the big drop.
    ignited: t >= igniteTime, sinceIgnite: t - igniteTime,
    fallProgress: stage === 'fall' ? (t - fallStart) / Math.max(0.05, map.dropTime - fallStart) : stage === 'intro' ? 0 : 1,
  };
}

/** Small deterministic hash -> [0, 1), so the equalizer moves the same way every time. */
function tbsRand(a, b) {
  var h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

var TBS_SPOTS = [0.5, 0.22, 0.78, 0.36, 0.64, 0.12, 0.88, 0.5];

/**
 * The singer's pose at a located moment. Numbers only (px, degrees, 0-1); pure, for tests.
 * Every accent falls on the beat: hops land on it, bobs bottom out on it.
 * y < 0 lifts her off the floor; y > 0 bends her knees. yaw (-1..1) turns her head and
 * body toward a side, which is what makes her read as round rather than flat.
 */
function tbsPose(loc, reduced) {
  var p = loc.phase;
  var hit = Math.pow(1 - p, 3);              // 1 on the beat, fading through it
  var x2 = loc.beatInBar + p;                 // position in the bar, in beats
  var pose = {
    y: 0, sx: 1, sy: 1, rot: 0, travel: null, flip: 1, yaw: 0,
    head: 0, armFree: -18, elbow: 25, armMic: 0, mouth: 0.15, eyes: 1, skirt: 0, show: true,
  };
  if (loc.stage === 'intro') { pose.show = false; return pose; }
  if (loc.stage === 'fall') {
    var f = Math.max(0, Math.min(1, loc.fallProgress));
    pose.y = -150 * (1 - f * f);              // gravity: slow at the top, fastest at the hit
    pose.armFree = -150; pose.elbow = 5; pose.armMic = -30; pose.mouth = 0.9; pose.sy = 1.04; pose.sx = 0.97;
    pose.skirt = 0.6; pose.yaw = 0.2;
    return pose;
  }
  if (loc.stage === 'outro') {
    // The song is over: wave goodbye until the music stops.
    pose.armFree = -160 + 25 * Math.sin(loc.t * 9); pose.elbow = 30 + 20 * Math.sin(loc.t * 9);
    pose.mouth = 0.5; pose.rot = -4; pose.yaw = -0.3;
    return pose;
  }
  var land = loc.sinceDrop < loc.beatLen ? Math.pow(1 - loc.sinceDrop / loc.beatLen, 2) : 0;
  if (reduced) {
    pose.rot = 3 * Math.sin(Math.PI * x2 / 2);
    pose.mouth = 0.3 + 0.4 * hit;
    return pose;
  }
  if (loc.riser) {
    // Crouch through the bar and shiver on the 16ths, then spring at the drop.
    var r = x2 / 4;
    pose.y = 8 * r + 1.4 * Math.sin(p * Math.PI * 8);
    pose.sy = 1 - 0.06 * r; pose.sx = 1 + 0.03 * r;
    pose.armFree = -40 + 30 * r; pose.elbow = 60 * r; pose.armMic = -10 * r; pose.head = -6 * r;
    pose.mouth = 0.2 + 0.6 * r; pose.eyes = 1 - 0.85 * r; pose.yaw = 0.15 * Math.sin(p * Math.PI * 8);
  } else if (loc.kind === 'd') {
    // Hop as high as the kick hits: off the floor through the beat, a quick crouch just
    // before the next one (more for a harder next kick), and down exactly on it.
    var h = (6 + 7 * loc.energy) * (0.45 + 0.55 * loc.kick);
    var air = p < 0.85 ? Math.sin(Math.PI * p / 0.85) : 0;
    var load = p >= 0.85 ? (p - 0.85) / 0.15 : 0;
    pose.y = -h * air + 3 * loc.nextKick * load;
    pose.sy = 1 - 0.13 * hit * (0.5 + 0.5 * loc.kick) - 0.05 * load; pose.sx = 1 + 0.09 * hit * (0.5 + 0.5 * loc.kick);
    pose.rot = (loc.beatInBar % 2 ? -1 : 1) * 7 * air;
    // The snare drives the arm and the head: a punch up on 1 and 3, a hit down on 2 and 4.
    pose.armFree = loc.beatInBar % 2 === 0 ? -165 + 30 * p : -60 - (25 + 30 * loc.snare) * hit;
    pose.elbow = loc.beatInBar % 2 === 0 ? 8 : 70 * (1 - hit);
    pose.head = (5 + 9 * loc.snare) * hit * (loc.beatInBar % 2 ? -1 : 1);
    pose.mouth = 0.45 + 0.55 * hit;
    pose.skirt = air;                         // flares while she is in the air
    if (loc.sectionStart) pose.flip = Math.cos(2 * Math.PI * p); // a quick spin into the drop
    // Travel to a new spot every two bars, stepping on the beats, turned toward where she goes.
    var leg = Math.floor(loc.bar / 2);
    var from = TBS_SPOTS[leg % TBS_SPOTS.length];
    var to = TBS_SPOTS[(leg + 1) % TBS_SPOTS.length];
    var k = (loc.bar % 2) * 4 + x2;          // 0..8 beats into the two bars
    var step = k < 4 ? 0 : (Math.floor(k - 4) + Math.min(1, (k - Math.floor(k)) * 2)) / 4;
    pose.travel = from + (to - from) * Math.min(1, step);
    pose.yaw = k < 4 ? 0.35 * Math.sin(Math.PI * x2) : (to > from ? 0.7 : -0.7);
  } else if (loc.kind === 'g') {
    // Knees: lowest on the beat (as deep as the kick), with a small pump on the hi-hat between.
    var pump = Math.max(0, 1 - Math.abs(p - 0.5) * 6);
    pose.y = (2 + 3 * loc.kick) * hit + 1.8 * loc.offbeat * pump;
    pose.sy = 1 - 0.03 * hit;
    pose.rot = 6 * Math.sin(Math.PI * x2);     // sway over two beats
    pose.head = (4 + 6 * loc.snare) * hit;
    pose.armFree = -30 + 28 * Math.sin(Math.PI * x2);
    pose.elbow = 30 + 25 * Math.sin(Math.PI * x2);
    pose.mouth = 0.3 + 0.6 * hit;
    pose.yaw = 0.45 * Math.sin(Math.PI * x2 / 2);
    pose.skirt = 0.3 * hit;
  } else {
    // Break: half-time sway, eyes closed, holding the long notes.
    var half = Math.pow(1 - ((x2 % 2) / 2), 3);
    pose.y = 3 * half;
    pose.rot = 8 * Math.sin(Math.PI * x2 / 2);
    pose.head = -5 + 5 * Math.sin(Math.PI * x2 / 2);
    pose.armFree = -95 + 25 * Math.sin(Math.PI * x2 / 2);
    pose.elbow = 35;
    pose.armMic = -12;
    pose.mouth = 0.55 + 0.35 * Math.sin(Math.PI * x2);
    pose.eyes = 0.12;
    pose.yaw = 0.3 * Math.sin(Math.PI * x2 / 2);
  }
  if (land) { pose.sy -= 0.16 * land; pose.sx += 0.12 * land; pose.y += 6 * land; pose.armFree = -150; pose.elbow = 5; }
  return pose;
}

/**
 * How hard the lobby boxes shake at a located moment: { vx, vy } in px and kick (0-1) for a
 * small swell and brightening. Locked to the beat: the shake starts on the beat and dies
 * away through it. Pure; for tests.
 */
function tbsShake(loc, reduced) {
  var out = { vx: 0, vy: 0, kick: 0 };
  if (reduced || loc.stage === 'intro' || loc.stage === 'outro') return out;
  var p = loc.phase, hit = Math.pow(1 - p, 3), x2 = loc.beatInBar + p;
  var amp = 0, wiggles = 3;
  if (loc.stage === 'fall') {
    amp = 0;
  } else if (loc.sinceDrop < loc.beatLen * 1.5) {
    amp = 7 * (1 - loc.sinceDrop / (loc.beatLen * 1.5)); out.kick = 1; // the landing rocks everything
  } else if (loc.riser) {
    amp = 2.4 * (x2 / 4); wiggles = 4; out.kick = 0.3 * (x2 / 4);    // trembling on the 16ths toward the drop
  } else if (loc.kind === 'd') {
    amp = (2.2 + 1.6 * loc.energy) * hit * (0.4 + 0.6 * loc.kick); out.kick = hit * (0.5 + 0.5 * loc.kick);
  } else if (loc.kind === 'g') {
    amp = 1.4 * hit; out.kick = 0.6 * hit;
  } else {
    out.kick = 0.35 * Math.pow(1 - ((x2 % 2) / 2), 3);                 // breaks: a slow breath on 1 and 3
  }
  var a = 2 * Math.PI * wiggles * p;
  out.vx = amp * Math.sin(a);
  out.vy = amp * 0.6 * Math.cos(a * 1.3);
  return out;
}

/**
 * The lion (side 0) and the frog (side 1) dancing under the QR code: { y, rot, sx, sy } for
 * the body and { px, py } for the free paw. In the drops they answer each other, the lion
 * hopping on 1 and 3 and the frog on 2 and 4; in the grooves they bob and sway apart; in
 * the breaks they wave their paws in the air together. Pure; for tests.
 */
function tbsDancerPose(loc, side, reduced) {
  var out = { y: 0, rot: 0, sx: 1, sy: 1, px: 0, py: 0 };
  var p = loc.phase, hit = Math.pow(1 - p, 3), x2 = loc.beatInBar + p;
  var dir = side ? -1 : 1;                    // the frog mirrors the lion
  if (reduced) { out.rot = 2 * dir * Math.sin(Math.PI * x2 / 2); return out; }
  if (loc.stage === 'intro') {
    out.y = 3 * hit; out.sy = 1 - 0.03 * hit;   // nodding along from the first beat
    return out;
  }
  if (loc.stage === 'fall') { out.y = 5; out.sy = 0.94; out.px = 4 * dir; out.py = -30; return out; }
  if (loc.stage === 'outro') {
    out.px = (8 + 6 * Math.sin(loc.t * 9)) * dir; out.py = -42; out.rot = 4 * dir; return out;
  }
  if (loc.sinceDrop < loc.beatLen) {
    // Her landing: both jump with her.
    var j = loc.sinceDrop / loc.beatLen;
    out.y = -22 * Math.sin(Math.PI * j); out.px = 6 * dir; out.py = -46; out.sy = 1.06; out.sx = 0.96;
    return out;
  }
  if (loc.riser) {
    var r = x2 / 4;
    out.y = 6 * r + 1.5 * Math.sin(p * Math.PI * 8); out.sy = 1 - 0.08 * r; out.sx = 1 + 0.05 * r;
    out.py = -10 * r;
  } else if (loc.kind === 'd') {
    var mine = (loc.beatInBar % 2) === side;
    if (mine) {
      out.y = -(12 + 6 * loc.energy) * (0.5 + 0.5 * loc.kick) * Math.sin(Math.PI * p);
      out.rot = 9 * dir * Math.sin(Math.PI * p);
      out.px = 10 * dir; out.py = -44 + 10 * p;
    } else {
      out.y = 3 * hit; out.px = 4 * dir; out.py = -12;
    }
    out.sy = 1 - 0.12 * hit; out.sx = 1 + 0.08 * hit;
  } else if (loc.kind === 'g') {
    out.y = 4 * hit; out.sy = 1 - 0.06 * hit;
    out.rot = 7 * dir * Math.sin(Math.PI * x2);
    out.px = 10 * dir * Math.sin(Math.PI * x2); out.py = -18 - 8 * hit;
  } else {
    out.rot = 8 * Math.sin(Math.PI * x2 / 2);   // swaying together, paws up like lighters
    out.px = 10 * Math.sin(Math.PI * x2 / 2); out.py = -48;
    out.y = 2 * Math.pow(1 - ((x2 % 2) / 2), 3);
  }
  return out;
}

/**
 * The AI characters (SH_AI) as small backup dancers along the bar. Each has its own
 * personality, timing and set of moves, and picks a new move every bar (seeded, so every
 * TV shows the same show, and never the same move twice in a row):
 *   Nova-7 ('boot')   calculating and stiff: exactly on every beat, straight lines, keeps
 *                     checking the singer; marches, does the robot, scans, computes.
 *   Glitch ('glitch') chaotic: twitches on 8ths with skipped hits, skids, freezes, teleports.
 *   Prof. Byte ('dizzy') cautious and always half a beat late: sways in arcs, pedals,
 *                     takes notes, nearly falls off its wheel.
 *   Turbo ('zoom')    a show-off on beats 1 and 3: hops, boosts, struts at the singer,
 *                     flies a loop, always overshooting.
 * Only one robot does a big gag in a bar (TBS_BOT_GAGS); the others turn and watch it.
 * Small and at the edges of the bar, they step aside when the singer comes close, so she
 * stays the show. ctx: { singer: her place in the bar 0..1, w: bar width in px } (optional).
 * Returns { show, op, x, y, rot, sx, sy, flip, lost, emote, mood, move, step, arm, wheel,
 * boost, look, jitter }. Pure; for tests.
 */
var TBS_BOT_SPOTS = [0.05, 0.17, 0.83, 0.95];
var TBS_BOT_MOVES = {
  boot: { moves: ['robot', 'march', 'scan', 'robot', 'wave'], gag: 'compute', wander: 26 },
  glitch: { moves: ['twitch', 'skid', 'freeze', 'twitch'], gag: 'teleport', wander: 34 },
  dizzy: { moves: ['sway', 'pedal', 'notes', 'sway'], gag: 'wobble', wander: 18 },
  zoom: { moves: ['hop', 'boost', 'strut', 'hop'], gag: 'loop', wander: 30 },
};
/** Which robot (0-3) gets the bar's gag, or -1. About every other bar in the busy parts. */
function tbsBotGagOwner(bar, kind) {
  if (kind === 'v' || bar < 0) return -1;
  if (tbsRand(bar, 7771) > (kind === 'd' ? 0.55 : 0.4)) return -1;
  var owner = Math.floor(tbsRand(bar, 7772) * 4);
  return owner === tbsBotGagOwner(bar - 1, kind) ? -1 : owner;   // no one hogs the stage
}
/** The move robot idx dances in a bar: weighted by personality, never twice in a row. */
var tbsBotMoveMemo = {};
function tbsBotMove(bar, idx, kind) {
  var set = (TBS_BOT_MOVES[kind] || TBS_BOT_MOVES.boot).moves;
  var key = kind + idx, list = tbsBotMoveMemo[key] || (tbsBotMoveMemo[key] = []);
  bar = Math.max(0, bar);
  for (var b = list.length; b <= bar; b++) {
    var m = set[Math.floor(tbsRand(b, idx * 13 + 5) * set.length)];
    for (var n = 1; b > 0 && m === list[b - 1]; n++) m = set[(set.indexOf(m) + n) % set.length];
    list.push(m);
  }
  return list[bar];
}
/** Where robot idx wanders to in a bar, px from its spot. */
function tbsBotWander(bar, idx, kind) {
  var r = (TBS_BOT_MOVES[kind] || TBS_BOT_MOVES.boot).wander;
  return (tbsRand(Math.max(0, bar), idx * 7 + 3) - 0.5) * 2 * r;
}
function tbsBotPose(loc, idx, kind, reduced, ctx) {
  var out = { show: false, x: 0, y: 0, rot: 0, sx: 1, sy: 1, flip: idx < 2 ? 1 : -1, lost: false, op: 0,
    emote: '', mood: 'calm', move: '', step: 0, arm: 0, wheel: 0, boost: 0.35, look: 0, jitter: 0 };
  if (loc.stage !== 'dance') return out;
  var since = loc.sinceDrop - (1.6 + idx * 1.9);       // they arrive one after the other
  if (since < 0) return out;
  out.show = true;
  out.op = Math.min(1, since / 0.5);
  var p = loc.phase, x2 = loc.beatInBar + p, hit = Math.pow(1 - p, 3);
  var beatPos = Math.max(0, loc.i) + p;
  var level = loc.kind === 'd' ? 1 : loc.kind === 'g' ? 0.7 : 0.45;
  var inward = idx < 2 ? 1 : -1;
  out.wheel = beatPos * 90 * inward;
  out.step = beatPos / 2;
  // Wandering: each bar it heads for a new place near its spot, the way it moves.
  var from = tbsBotWander(loc.bar - 1, idx, kind), to = tbsBotWander(loc.bar, idx, kind);
  var k = x2 / 4;
  var travel = kind === 'boot' ? Math.min(1, Math.floor(x2) / 3)                      // one step per beat
    : kind === 'glitch' ? (x2 >= 1 + Math.floor(tbsRand(loc.bar, idx + 61) * 2) ? 1 : 0) // snaps there
    : kind === 'dizzy' ? tbsEase((k - 0.4) / 0.6)                                       // sets off late
    : Math.min(1.08, tbsEase(k / 0.45) * 1.08 - Math.max(0, k - 0.45) * 0.15);          // overshoots
  out.x = tbsLerp(from, to, travel);
  var walking = travel > 0 && travel < 1 && Math.abs(to - from) > 6;

  // Just arrived, or one of their lost moments (one bar in eight, each at its own time).
  var arriving = since < 2.4;
  var lostBar = ((loc.bar + idx * 3) % 8) === 5 && loc.kind !== 'd';
  if (arriving || lostBar) {
    out.lost = true; out.emote = '?'; out.mood = 'worried'; out.move = 'lost';
    out.flip = (Math.floor((arriving ? since : loc.t) * 2.2 + idx) % 2) ? 1 : -1;   // looking left, right
    out.look = out.flip * 14;
    out.y = arriving ? -4 * Math.abs(Math.sin(since * 7)) * (1 - since / 2.4) : 0;
    out.rot = arriving ? 10 * Math.sin(since * 5) * (1 - since / 2.4) : 4 * Math.sin(loc.t * 3 + idx);
    out.x = arriving ? -18 * (1 - Math.min(1, since / 0.8)) * inward : out.x;      // stumbling in
    out.step = 0;
    return out;
  }
  if (reduced) { out.rot = 3 * Math.sin(Math.PI * x2 / 2); out.x = 0; return out; }

  var gagOwner = tbsBotGagOwner(loc.bar, loc.kind);
  var move = gagOwner === idx ? (TBS_BOT_MOVES[kind] || TBS_BOT_MOVES.boot).gag : tbsBotMove(loc.bar, idx, kind);
  out.move = move;
  if (!walking) out.step = 0;

  if (kind === 'boot') {
    // Nova-7: snaps between poses exactly on the beat.
    var side = loc.beatInBar % 2 ? -1 : 1;
    if (move === 'robot') { out.rot = side * 7 * level; out.arm = loc.beatInBar % 2; out.y = 3 * hit * level; out.sy = 1 - 0.05 * hit; }
    else if (move === 'march') { out.step = beatPos / 2; out.y = -3 * hit * level; out.arm = 0.3; out.rot = side * 2; }
    else if (move === 'scan') { out.look = [-16, 0, 16, 0][loc.beatInBar]; out.flip = loc.beatInBar === 0 ? -inward : inward; out.emote = loc.beatInBar === 3 ? '…' : ''; out.y = 2 * hit; }
    else if (move === 'wave') { out.arm = loc.beatInBar % 2 ? 1 : 0.2; out.rot = side * 3; out.y = 2 * hit; }
    else if (move === 'compute') {
      // Freezes, thinks, then gets it: a jump and an exclamation on beat 4.
      out.look = x2 < 3 ? 10 : 0; out.rot = x2 < 3 ? 6 : 0; out.arm = x2 < 3 ? 0.5 : 1;
      out.emote = x2 < 3 ? '?' : '!';
      out.y = x2 >= 3 ? -14 * Math.sin(Math.PI * (x2 - 3)) : 0;
    }
  } else if (kind === 'glitch') {
    // Glitch: on the eighths, but it skips some, and flickers.
    var eighth = Math.floor(x2 * 2), skip = tbsRand(loc.bar * 8 + eighth, idx + 19) > 0.7;
    var r = tbsRand(Math.max(0, loc.i) * 2 + (p >= 0.5 ? 1 : 0), idx + 11);
    out.jitter = p % 0.5 < 0.1 && !skip ? 1 : 0;
    if (move === 'twitch') { out.x += skip ? 0 : (r - 0.5) * 10 * level; out.rot = skip ? out.rot : (tbsRand(loc.i, idx + 31) - 0.5) * 22 * level; out.y = -6 * level * (r > 0.7 ? 1 : 0); out.flip = r > 0.5 ? 1 : -1; out.arm = r; }
    else if (move === 'skid') { out.rot = -inward * 14 * level * (1 - p); out.wheel = beatPos * 400 * inward; out.arm = 0.8; }
    else if (move === 'freeze') {
      var frozen = x2 < 2;
      out.emote = frozen ? '…' : ''; out.rot = frozen ? 0 : (r - 0.5) * 30 * level; out.jitter = frozen ? 0 : 1;
      out.y = frozen ? 0 : -8 * level * (r > 0.5 ? 1 : 0);
    } else if (move === 'teleport') {
      // Flickers out on beat 2 and back in on beat 3, somewhere else.
      var gone = x2 >= 1.5 && x2 < 2.5;
      out.op = gone ? (Math.floor(x2 * 16) % 2 ? 0.1 : 0.5) : 1;
      out.x += x2 >= 2 ? -inward * 36 : 0; out.jitter = 1; out.emote = x2 >= 2.5 && x2 < 3.5 ? '!' : '';
    }
    if (move !== 'teleport' && tbsRand(loc.i, idx + 47) > 0.9 && p < 0.25) out.op = 0.4;
  } else if (kind === 'dizzy') {
    // Prof. Byte: everything half a beat late, in arcs, wobbling on its one wheel.
    var late = x2 - 0.5;
    if (move === 'sway') { out.rot = 12 * level * Math.sin(Math.PI * late / 2); out.x += 5 * level * Math.sin(Math.PI * late / 2); out.y = -3 * level * Math.abs(Math.sin(Math.PI * late)); }
    else if (move === 'pedal') { out.x += 16 * Math.sin(Math.PI * late / 2); out.wheel = -16 * Math.cos(Math.PI * late / 2) * 8; out.rot = 8 * Math.cos(Math.PI * late / 2); }
    else if (move === 'notes') {
      // Stops to take notes on the singer, arm up on the off-beats.
      out.flip = inward; out.arm = p > 0.5 ? 0.9 : 0.5; out.rot = 4 * Math.sin(loc.t * 2); out.emote = x2 >= 1 && x2 < 3 ? '✎' : '';
    } else if (move === 'wobble') {
      // Nearly falls off: leans further every beat, flails, and catches itself on beat 4.
      var lean = x2 < 3 ? Math.pow(x2 / 3, 2) : Math.max(0, 1 - (x2 - 3) * 2.2);
      out.rot = inward * 34 * lean + (x2 >= 3 ? -inward * 8 * Math.sin(Math.PI * (x2 - 3) * 2) : 0);
      out.arm = 0.5 + 0.5 * Math.sin(loc.t * 22) * lean; out.emote = x2 >= 2 && x2 < 3.4 ? '!' : '';
      out.mood = lean > 0.5 ? 'worried' : 'calm';
    }
    out.step = beatPos;
  } else {
    // Turbo: big on beats 1 and 3, always overshooting the landing.
    var half = (x2 % 2) / 2;
    out.boost = 0.3 + 0.7 * Math.pow(1 - half, 3) * (loc.kind === 'd' ? 1 : 0.6);
    if (move === 'hop') { out.y = -(8 + (loc.kind === 'd' ? 8 * loc.kick : 0)) * level * Math.abs(Math.sin(2 * Math.PI * p)); out.rot = 8 * level * Math.sin(2 * Math.PI * p); out.sx = 1 + 0.08 * hit; out.sy = 1 - 0.08 * hit; }
    else if (move === 'boost') {
      var air = x2 < 2 ? Math.sin(Math.PI * x2 / 2) : 0, land2 = x2 >= 2 && x2 < 2.6 ? Math.sin(Math.PI * (x2 - 2) / 0.6) : 0;
      out.y = -26 * level * air + 3 * land2; out.sy = 1 - 0.12 * land2; out.sx = 1 + 0.1 * land2; out.boost = air > 0 ? 1 : out.boost; out.arm = air;
    } else if (move === 'strut') {
      // Shows off at the singer: leans in, arms up on 1 and 3.
      out.flip = inward; out.rot = inward * 10 * level; out.arm = half < 0.25 ? 1 : 0.3; out.y = -4 * Math.abs(Math.sin(Math.PI * half * 2));
    } else if (move === 'loop') {
      // A loop-the-loop over three beats, landing hard on 4.
      var lp = Math.min(1, x2 / 3);
      out.x += -inward * 18 * Math.sin(2 * Math.PI * lp); out.y = -22 * (1 - Math.cos(2 * Math.PI * lp)) / 2 - 10 * Math.sin(Math.PI * lp);
      out.rot = -inward * 360 * tbsEase(lp); out.boost = lp < 1 ? 1 : out.boost; out.emote = x2 >= 3 ? '★' : '';
      if (x2 >= 3) { var sq = Math.sin(Math.PI * Math.min(1, (x2 - 3) / 0.5)); out.sy = 1 - 0.14 * sq; out.sx = 1 + 0.12 * sq; }
    }
  }

  // Watching: when another robot does its gag, the rest turn to look (beats 2-4).
  if (gagOwner >= 0 && gagOwner !== idx && x2 >= 1) {
    out.flip = gagOwner > idx ? 1 : -1;
    out.look = out.flip * 12;
    out.rot = out.rot * 0.5 + out.flip * 4; out.y *= 0.5;
  }
  // Make room for the star: step back when she lands nearby, and look at her.
  if (ctx && ctx.singer != null && ctx.w > 0) {
    var dist = ctx.singer - (TBS_BOT_SPOTS[idx] + out.x / ctx.w);
    if (Math.abs(dist) < 0.1) {
      var push = (0.1 - Math.abs(dist)) * ctx.w * 0.9;
      out.x -= (dist > 0 ? 1 : -1) * push;
      out.flip = dist > 0 ? 1 : -1;
      out.look = out.flip * 10;
      if (kind === 'zoom' && move === 'strut') out.emote = '♥';
    }
  }
  return out;
}

// ---- 2D affine helpers (SVG matrix order: a b c d e f) ----
function tbsMul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function tbsT(x, y) { return [1, 0, 0, 1, x, y]; }
function tbsS(x, y) { return [x, 0, 0, y, 0, 0]; }
function tbsR(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; }
function tbsAt(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function tbsMat(m) { return 'matrix(' + m.map(function (v) { return v.toFixed(4); }).join(' ') + ')'; }

/** Two-bone leg: knee position for a hip and ankle, bending toward `side` (-1 left, 1 right). */
function tbsKnee(hx, hy, fx, fy, l1, l2, side) {
  var dx = fx - hx, dy = fy - hy;
  var d = Math.max(0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  var a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  var base = Math.atan2(dy, dx) - side * a;
  return [hx + Math.cos(base) * l1, hy + Math.sin(base) * l1];
}

/** A tapered ribbon through points: the shape of a lock of hair. */
function tbsRibbon(pts, w0, w1) {
  var n = pts.length, left = [], right = [];
  for (var i = 0; i < n; i++) {
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    var tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    var w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([pts[i][0] - ty / len * w, pts[i][1] + tx / len * w]);
    right.push([pts[i][0] + ty / len * w, pts[i][1] - tx / len * w]);
  }
  var f = function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); };
  var d = 'M' + f(left[0]);
  for (var k = 1; k < n; k++) {
    var m = [(left[k - 1][0] + left[k][0]) / 2, (left[k - 1][1] + left[k][1]) / 2];
    d += ' Q' + f(left[k - 1]) + ' ' + f(m);
  }
  d += ' L' + f(left[n - 1]) + ' Q' + f(pts[n - 1]) + ' ' + f(right[n - 1]);
  for (var j = n - 2; j >= 0; j--) {
    var mm = [(right[j + 1][0] + right[j][0]) / 2, (right[j + 1][1] + right[j][1]) / 2];
    d += ' Q' + f(right[j + 1]) + ' ' + f(mm);
  }
  return d + ' L' + f(right[0]) + ' Z';
}

/**
 * Hair that swings: a chain of points with inertia and gravity that keeps returning to its
 * styled shape. Anchor and rest shape are given in head coordinates and carried along by the
 * head's matrix, so every hop, sway, step and spin throws the hair around.
 */
function tbsHair(anchor, restDirs, segLen, stiff) {
  return { anchor: anchor, dirs: restDirs, seg: segLen, stiff: stiff, pts: null, prev: null };
}
function tbsHairStep(h, headM, off, dt) {
  var n = h.dirs.length + 1;
  var rest = [h.anchor];
  for (var i = 0; i < h.dirs.length; i++) {
    var q = rest[i];
    rest.push([q[0] + h.dirs[i][0] * h.seg, q[1] + h.dirs[i][1] * h.seg]);
  }
  var world = rest.map(function (q) { var w = tbsAt(headM, q[0], q[1]); return [w[0] + off[0], w[1] + off[1]]; });
  if (!h.pts || Math.hypot(h.pts[0][0] - world[0][0], h.pts[0][1] - world[0][1]) > 80) {
    h.pts = world.map(function (q) { return q.slice(); });
    h.prev = world.map(function (q) { return q.slice(); });
  }
  var g = 900 * dt * dt;
  h.pts[0] = world[0]; h.prev[0] = world[0];
  for (var k = 1; k < n; k++) {
    var p = h.pts[k], pr = h.prev[k];
    var vx = (p[0] - pr[0]) * 0.9, vy = (p[1] - pr[1]) * 0.9;
    h.prev[k] = [p[0], p[1]];
    p[0] += vx; p[1] += vy + g;
    var s = h.stiff * (1 - 0.6 * k / n);       // the root holds its style, the tip flies
    p[0] += (world[k][0] - p[0]) * s; p[1] += (world[k][1] - p[1]) * s;
  }
  for (var it = 0; it < 3; it++) {
    for (var j = 1; j < n; j++) {
      var a = h.pts[j - 1], b = h.pts[j];
      var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.001;
      var diff = (d - h.seg) / d;
      if (j === 1) { b[0] -= dx * diff; b[1] -= dy * diff; }
      else { a[0] += dx * diff * 0.5; a[1] += dy * diff * 0.5; b[0] -= dx * diff * 0.5; b[1] -= dy * diff * 0.5; }
    }
  }
  return h.pts.map(function (q) { return [q[0] - off[0], q[1] - off[1]]; });
}

// The singer: an original Smallhours character, drawn with light from the top left so she
// reads as round. Feet at (60, 150). Legs, arms and hair are drawn each frame.
var TBS_SKIN = '#f6cfac';
var TBS_SINGER_SVG =
  '<svg class="tbs-singer-svg" viewBox="0 0 120 152" aria-hidden="true">' +
  '<defs>' +
    '<radialGradient id="tbs-g-skin" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffe6d0"/><stop offset=".55" stop-color="#f6cfac"/><stop offset="1" stop-color="#d99a74"/></radialGradient>' +
    '<linearGradient id="tbs-g-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".45" stop-color="#7c3aed"/><stop offset="1" stop-color="#3b1680"/></linearGradient>' +
    '<radialGradient id="tbs-g-cap" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#c4b5fd"/><stop offset=".35" stop-color="#8b5cf6"/><stop offset="1" stop-color="#3b1680"/></radialGradient>' +
    '<linearGradient id="tbs-g-top" x1="0" x2="1"><stop offset="0" stop-color="#0b1220"/><stop offset=".35" stop-color="#334155"/><stop offset=".6" stop-color="#1e293b"/><stop offset="1" stop-color="#0b1220"/></linearGradient>' +
    '<linearGradient id="tbs-g-skirt" x1="0" x2="1"><stop offset="0" stop-color="#be123c"/><stop offset=".35" stop-color="#fda4af"/><stop offset=".6" stop-color="#fb7185"/><stop offset="1" stop-color="#9f1239"/></linearGradient>' +
    '<radialGradient id="tbs-g-mic" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#cbd5e1"/><stop offset="1" stop-color="#475569"/></radialGradient>' +
    '<radialGradient id="tbs-g-eye" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#60a5fa"/><stop offset=".6" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0b1530"/></radialGradient>' +
    '<linearGradient id="tbs-g-boot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0c4a6e"/></linearGradient>' +
  '</defs>' +
  '<ellipse class="tbs-shadow" cx="60" cy="149.5" rx="22" ry="3.5"/>' +
  '<path class="tbs-hair-back" fill="url(#tbs-g-hair)" stroke="#1e0b45" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path class="tbs-hair-back-hi" fill="none" stroke="#c4b5fd" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>' +
  '<g class="tbs-root">' +
    // legs: outline, skin, highlight (filled in per frame)
    '<path class="tbs-leg-o" fill="none" stroke="#0b1530" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path class="tbs-leg" fill="none" stroke="' + TBS_SKIN + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path class="tbs-leg-hi" fill="none" stroke="#ffeede" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>' +
    '<g class="tbs-boot-l"><path d="M-7 -4 h9 a4 4 0 0 1 4 4 v3 h-15 a2 2 0 0 1 -1 -2 z" fill="url(#tbs-g-boot)" stroke="#0b1530" stroke-width="1.6"/><path d="M-5 -2 h5" stroke="#bae6fd" stroke-width="1.2" stroke-linecap="round"/></g>' +
    '<g class="tbs-boot-r"><path d="M7 -4 h-9 a4 4 0 0 0 -4 4 v3 h15 a2 2 0 0 0 1 -2 z" fill="url(#tbs-g-boot)" stroke="#0b1530" stroke-width="1.6"/><path d="M5 -2 h-5" stroke="#bae6fd" stroke-width="1.2" stroke-linecap="round"/></g>' +
    '<g class="tbs-upper">' +
      '<g class="tbs-skirt"><path d="M44 92 L76 92 L87 117 Q60 125 33 117 Z" fill="url(#tbs-g-skirt)" stroke="#0b1530" stroke-width="2.2" stroke-linejoin="round"/>' +
        '<path d="M52 95 L48 119 M60 95 V121 M68 95 L72 119" stroke="#9f1239" stroke-width="1.1" opacity=".55"/>' +
        '<path d="M37 115 Q60 122 83 115" fill="none" stroke="#ffe4e6" stroke-width="1.2" opacity=".6"/></g>' +
      '<path d="M45 66 Q60 60 75 66 L77 94 L43 94 Z" fill="url(#tbs-g-top)" stroke="#0b1530" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M48 70 Q50 82 47 92" stroke="#94a3b8" stroke-width="1.6" fill="none" opacity=".55" stroke-linecap="round"/>' +
      // The Smallhours mark on her chest: four fanned cards, the front one with the moon.
      '<g class="tbs-mark"><g transform="translate(58.5 95) scale(0.52) translate(-32 -62)">' +
        '<g transform="rotate(-24 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#38bdf8" stroke="#0b1530" stroke-width="3"/></g>' +
        '<g transform="rotate(-8 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#a78bfa" stroke="#0b1530" stroke-width="3"/></g>' +
        '<g transform="rotate(8 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#fb7185" stroke="#0b1530" stroke-width="3"/></g>' +
        '<g transform="rotate(24 32 62)"><rect x="21" y="10" width="22" height="36" rx="5" fill="#facc15" stroke="#0b1530" stroke-width="3"/>' +
          '<circle cx="31" cy="26" r="7" fill="#0b1530"/><circle cx="34.3" cy="23.2" r="5.9" fill="#facc15"/></g>' +
      '</g></g>' +
      // free arm (drawn per frame)
      '<path class="tbs-arm-o" fill="none" stroke="#0b1530" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="tbs-arm" fill="none" stroke="' + TBS_SKIN + '" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="tbs-arm-hi" fill="none" stroke="#ffeede" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>' +
      '<circle class="tbs-hand" r="4.4" fill="url(#tbs-g-skin)" stroke="#0b1530" stroke-width="1.5"/>' +
      '<g class="tbs-head">' +
        '<rect x="55.5" y="51" width="9" height="12" rx="3.5" fill="#d99a74"/>' +
        '<ellipse cx="60" cy="58" rx="10" ry="3" fill="#000" opacity=".18"/>' +
        '<g class="tbs-ears"><ellipse cx="41.5" cy="41" rx="3.2" ry="4.4" fill="url(#tbs-g-skin)" stroke="#0b1530" stroke-width="1.6"/>' +
          '<ellipse cx="78.5" cy="41" rx="3.2" ry="4.4" fill="url(#tbs-g-skin)" stroke="#0b1530" stroke-width="1.6"/></g>' +
        '<ellipse cx="60" cy="38" rx="19" ry="20" fill="url(#tbs-g-skin)" stroke="#0b1530" stroke-width="2.2"/>' +
        '<g class="tbs-face">' +
          '<g class="tbs-eyes">' +
            '<ellipse cx="52.5" cy="39.5" rx="3.6" ry="4.4" fill="#fff" stroke="#0b1530" stroke-width="1.1"/>' +
            '<ellipse cx="67.5" cy="39.5" rx="3.6" ry="4.4" fill="#fff" stroke="#0b1530" stroke-width="1.1"/>' +
            '<circle class="tbs-iris" cx="53" cy="40" r="2.6" fill="url(#tbs-g-eye)"/><circle class="tbs-iris" cx="68" cy="40" r="2.6" fill="url(#tbs-g-eye)"/>' +
            '<circle cx="52" cy="38.8" r=".95" fill="#fff"/><circle cx="67" cy="38.8" r=".95" fill="#fff"/>' +
          '</g>' +
          '<path d="M48.5 33.5 Q52.5 31.5 56 33.2 M64 33.2 Q67.5 31.5 71.5 33.5" stroke="#3b1680" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
          '<path d="M59.5 43 Q61 45.5 59 46" stroke="#c98a66" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
          '<ellipse cx="47.5" cy="46.5" rx="3.4" ry="2.2" fill="#fb7185" opacity=".45"/><ellipse cx="72.5" cy="46.5" rx="3.4" ry="2.2" fill="#fb7185" opacity=".45"/>' +
          '<g class="tbs-mouth"><ellipse cx="60" cy="50.5" rx="4.2" ry="3.4" fill="#7f1d1d" stroke="#0b1530" stroke-width="1.3"/>' +
            '<ellipse cx="60" cy="52.2" rx="2.4" ry="1.2" fill="#fb7185"/><path d="M57 48.4 h6" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></g>' +
        '</g>' +
        // hair cap and fringe, with a shine on top
        '<path d="M40 41 Q37 15 60 14 Q83 15 80 40 Q77 30 70 27 Q64 33 54 30 Q50 34 44 33 Q41 36 40 41 Z" fill="url(#tbs-g-cap)" stroke="#1e0b45" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M48 19.5 Q57 15.5 66 18" stroke="#ddd6fe" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".8"/>' +
        '<g class="tbs-scrunchie"><circle cx="79" cy="30" r="4.2" fill="#38bdf8" stroke="#0b1530" stroke-width="1.6"/><circle cx="77.8" cy="28.7" r="1.2" fill="#e0f2fe"/></g>' +
      '</g>' +
      // mic arm holding the mic just under her chin
      '<g class="tbs-arm-mic"><path d="M74 70 L86 82 L79 72" stroke="#0b1530" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '<path d="M74 70 L86 82 L79 72" stroke="' + TBS_SKIN + '" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '<g transform="rotate(-35 76 66)"><rect x="73.5" y="60" width="5" height="15" rx="2.3" fill="#1e293b" stroke="#0b1530" stroke-width="1.5"/>' +
          '<rect x="74.3" y="61" width="1.3" height="12" rx=".6" fill="#64748b"/>' +
          '<circle cx="76" cy="57" r="5.4" fill="url(#tbs-g-mic)" stroke="#0b1530" stroke-width="1.8"/>' +
          '<path d="M72.6 55.6 h6.8 M72.4 58.4 h7.2" stroke="#64748b" stroke-width=".9"/></g>' +
        '<circle cx="78.5" cy="71.5" r="4.4" fill="url(#tbs-g-skin)" stroke="#0b1530" stroke-width="1.5"/></g>' +
    '</g>' +
  '</g>' +
  '<path class="tbs-lock-l" fill="url(#tbs-g-hair)" stroke="#1e0b45" stroke-width="1.2" stroke-linejoin="round"/>' +
  '<path class="tbs-lock-r" fill="url(#tbs-g-hair)" stroke="#1e0b45" stroke-width="1.2" stroke-linejoin="round"/>' +
  '</svg>';

var TBS_EQ_BARS = 44;
var TBS_NOTES = 6;

/**
 * Everything the fire draws, rendered once into small offscreen canvases: hot core, flame,
 * ember glow, smoke, and the glowing rim along the logo (warm and hot). The frame loop only
 * calls drawImage with a globalAlpha, never creates a gradient.
 */
function tbsFireSprites() {
  var dot = function (stops) {
    var c = document.createElement('canvas');
    c.width = c.height = 32;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    stops.forEach(function (s) { grad.addColorStop(s[0], s[1]); });
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  };
  var rim = function (mid) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 16;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 16);
    grad.addColorStop(0, 'rgba(255,120,0,0)');
    grad.addColorStop(0.6, mid);
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 16);
    return c;
  };
  return {
    core: dot([[0, 'rgba(255,255,225,1)'], [0.45, 'rgba(255,205,60,.8)'], [1, 'rgba(255,90,0,0)']]),
    flame: dot([[0, 'rgba(255,170,30,.9)'], [0.55, 'rgba(240,60,15,.55)'], [1, 'rgba(170,10,0,0)']]),
    glow: dot([[0, 'rgba(225,45,35,.5)'], [1, 'rgba(60,10,10,0)']]),
    smoke: dot([[0, 'rgba(90,60,70,.25)'], [1, 'rgba(30,20,30,0)']]),
    rimWarm: rim('rgba(255,130,40,1)'),
    rimHot: rim('rgba(255,220,40,1)'),
  };
}

/** A 2D context that may skip the compositor's frame sync where the browser supports it. */
function tbsCanvas2d(canvas) {
  try { return canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d'); } catch (_) { return canvas.getContext('2d'); }
}

// Fixed pools for the fire: no allocation and no array shuffling while it burns, so the
// garbage collector never interrupts a frame. Dead particles swap with the last live one.
var TBS_MAX_FLAMES = 260;
var TBS_MAX_EMBERS = 100;
function tbsPool(size) {
  var items = [];
  for (var i = 0; i < size; i++) items.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, life: 0, max: 1 });
  return { items: items, n: 0 };
}
function tbsPoolTake(pool) {
  return pool.n < pool.items.length ? pool.items[pool.n++] : null;
}
function tbsPoolKill(pool, i) {
  var last = pool.n - 1, dead = pool.items[i];
  pool.items[i] = pool.items[last];
  pool.items[last] = dead;
  pool.n = last;
}

/**
 * Wire the show to the lobby music.
 * opts: header (the topbar element), audio (the lobby Audio), shows (file -> map url),
 *       latencyMs (TV audio delay to wait for), fetch (for tests)
 * Returns { setMuted(bool), stop(), state() }.
 */
/**
 * Quality governor: a weak TV (Android TV boxes, old smart-TV browsers) can't draw the
 * whole show at 60 fps, and a show that stutters looks worse than a simpler one that
 * flows. Feed it the time between frames; it steps down a tier after 1.5 s of slow
 * frames (under ~42 fps) and back up after 8 s of fast ones, at most once, so it never
 * flaps. Tier 0 is the full show, 1 drops the panel shake and halves the fire,
 * 2 also sends the dancers home and draws the equalizer at half rate. Pure; for tests.
 */
function tbsGovernor(mode) {
  var fixed = mode === 'full' ? 0 : mode === 'lite' ? 2 : -1;
  return { tier: fixed < 0 ? 0 : fixed, fixed: fixed, ema: 16.7, slow: 0, fast: 0, warm: 0, ups: 0 };
}
function tbsGovern(g, frameMs) {
  if (g.fixed >= 0) return g.tier;
  if (!(frameMs > 0) || frameMs > 250) return g.tier;   // a hidden tab or a hiccup, not a slow TV
  g.warm += frameMs;
  g.ema = g.ema * 0.9 + frameMs * 0.1;
  if (g.warm < 1000) return g.tier;                      // the first second loads and measures
  g.slow = g.ema > 24 ? g.slow + frameMs : 0;
  g.fast = g.ema < 18 ? g.fast + frameMs : 0;
  if (g.slow > 1500 && g.tier < 2) { g.tier++; g.slow = 0; g.fast = 0; }
  else if (g.fast > 8000 && g.tier > 0 && g.ups < 1) { g.tier--; g.ups++; g.fast = 0; }
  return g.tier;
}

function createTopbarShow(opts) {
  var header = opts.header;
  var audio = opts.audio;
  var shows = opts.shows || TBS_SHOWS;
  var latency = (opts.latencyMs || 0) / 1000;
  var doFetch = opts.fetch || (typeof fetch === 'function' ? fetch.bind(window) : null);
  if (!header || !audio || typeof document === 'undefined') return { setMuted: function () {}, stop: function () {}, state: function () { return null; } };

  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var maps = {};
  var map = null;
  var running = false;
  var muted = false;
  var raf = 0;
  var hint = -1;
  var clock = { ct: -1, at: 0, base: 0, baseAt: 0 };
  var lastNoteBeat = -1;
  var noteIdx = 0;
  var lastFlashBeat = -1;
  var exitAt = 0;
  var lastNow = 0;
  var frameNo = 0;
  var gov = tbsGovernor(opts.quality);
  var tier = gov.tier;
  var bounds = { left: 0, right: 0, width: 0 };
  var hdr = { left: 0, top: 0, h: 0 };
  var fire = { parts: tbsPool(TBS_MAX_FLAMES), embers: tbsPool(TBS_MAX_EMBERS), ctx: null, lastBeat: -1, lastHalf: -1, box: null, sprites: null, w: 0, h: 0, dpr: 1, burst: false };
  var hair = {
    pony: tbsHair([80, 30], [[0.95, 0.1], [0.75, 0.6], [0.4, 0.9], [0.15, 1], [0, 1], [-0.1, 1]], 6.2, 0.16),
    lockL: tbsHair([42, 36], [[-0.25, 1], [-0.1, 1], [0, 1], [0.05, 1]], 5, 0.3),
    lockR: tbsHair([78, 36], [[0.25, 1], [0.1, 1], [0, 1], [-0.05, 1]], 5, 0.3),
  };

  // ---- DOM ----
  var stage = document.createElement('div');
  stage.className = 'tbs-stage';
  stage.setAttribute('aria-hidden', 'true');
  var notesHtml = '';
  for (var m = 0; m < TBS_NOTES; m++) notesHtml += '<span class="tbs-note">' + (m % 2 ? '♫' : '♪') + '</span>';
  stage.innerHTML =
    '<div class="tbs-wash"></div><div class="tbs-wash-spot"></div><div class="tbs-wash-bright"></div>' +
    '<div class="tbs-logo-glow"></div>' +
    '<div class="tbs-spot tbs-spot-l"></div><div class="tbs-spot tbs-spot-r"></div>' +
    '<div class="tbs-sweep"></div>' +
    '<canvas class="tbs-fire"></canvas>' +
    '<canvas class="tbs-eq"></canvas>' +
    '<div class="tbs-beatline"></div>' +
    '<div class="tbs-ring"></div>' +
    notesHtml +
    '<div class="tbs-chip"><span class="tbs-chip-note">♪</span><span class="tbs-chip-title"></span>' +
      '<span class="tbs-chip-dots"><i></i><i></i><i></i><i></i></span></div>' +
    '<div class="tbs-singer"><div class="tbs-singer-glow"></div>' + TBS_SINGER_SVG + '</div>' +
    '<div class="tbs-flash"></div>';
  // The AI cast: one body per character, never a copy (aiRobot in ai-robots.js). Each robot
  // dances in the bar, behind the singer, and moves to the cast layer over the page (above the
  // topbar, which would clip it) while it is away from its spot, as in the Board Crash.
  var TBS_ROLE = { boot: 'nova', glitch: 'glitch', dizzy: 'byte', zoom: 'turbo' };
  var TBS_BAR_H = 64;                       // a robot's height in the bar, px
  var bots = [];
  var castLayer = null;
  var cast = typeof SH_AI !== 'undefined' && SH_AI ? SH_AI.slice(0, TBS_BOT_SPOTS.length) : [];
  cast.forEach(function (persona, i) {
    var kind = persona.entrance || 'boot';
    var wrap = document.createElement('div');
    wrap.className = 'tbs-actor tbs-actor-' + kind;
    var rig = typeof aiRobot === 'function' ? aiRobot(persona.name, kind) : typeof createAiRobot === 'function' ? createAiRobot(kind) : null;
    if (!rig) { var face = document.createElement('span'); face.className = 'tbs-actor-face'; face.textContent = persona.avatar; wrap.appendChild(face); }
    var emote = document.createElement('span');
    emote.className = 'tbs-actor-emote';
    wrap.appendChild(emote);
    var smoke = null;
    if (kind === 'zoom') { smoke = document.createElement('span'); smoke.className = 'tbs-crash-smoke'; wrap.appendChild(smoke); }
    stage.insertBefore(wrap, stage.querySelector('.tbs-singer'));
    bots.push({ wrap: wrap, rig: rig, kind: kind, role: TBS_ROLE[kind] || 'nova', idx: i, emote: emote, smoke: smoke, host: 'bar', emoteText: '' });
  });
  function castRoot() {
    if (!castLayer) { castLayer = document.createElement('div'); castLayer.className = 'tbs-cast'; castLayer.setAttribute('aria-hidden', 'true'); document.body.appendChild(castLayer); }
    return castLayer;
  }
  function botHost(b, where) {
    if (b.host === where) return;
    b.host = where;
    if (where === 'cast') {
      castRoot().appendChild(b.wrap);
    } else stage.insertBefore(b.wrap, el.singer);
  }
  /** Feet at (X, Y) in the host's px; rot turns it around its middle (rocket nose first). */
  function botPlace(b, X, Y, rot, s, flip, sy) {
    var c = 120 * s;
    css(b.wrap, 'transform', 'translate(' + (X - 100).toFixed(1) + 'px,' + (Y - 240).toFixed(1) + 'px)' +
      (rot ? ' translate(0,' + (-c).toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg) translate(0,' + c.toFixed(1) + 'px)' : '') +
      ' scale(' + (s * flip).toFixed(3) + ',' + (s * (sy || 1)).toFixed(3) + ')');
    css(b.emote, 'transform', flip < 0 ? 'scaleX(-1)' : 'none');
  }
  function botEmote(b, text) {
    if (b.emoteText === text) return;
    b.emoteText = text;
    if (text) b.emote.textContent = text;
    b.emote.classList.toggle('on', !!text);
  }
  header.insertBefore(stage, header.firstChild);
  var q = function (sel) { return stage.querySelector(sel); };
  var el = {
    wash: q('.tbs-wash'), washSpot: q('.tbs-wash-spot'), washBright: q('.tbs-wash-bright'), logoGlow: q('.tbs-logo-glow'),
    singerGlow: q('.tbs-singer-glow'), spotL: q('.tbs-spot-l'), spotR: q('.tbs-spot-r'), sweep: q('.tbs-sweep'),
    fire: q('.tbs-fire'),
    eq: q('.tbs-eq'), beatline: q('.tbs-beatline'),
    ring: q('.tbs-ring'), notes: Array.prototype.slice.call(stage.querySelectorAll('.tbs-note')),
    chip: q('.tbs-chip'), chipTitle: q('.tbs-chip-title'), dots: Array.prototype.slice.call(stage.querySelectorAll('.tbs-chip-dots i')),
    singer: q('.tbs-singer'), svg: q('.tbs-singer-svg'), root: q('.tbs-root'), upper: q('.tbs-upper'), head: q('.tbs-head'),
    face: q('.tbs-face'), ears: q('.tbs-ears'), skirt: q('.tbs-skirt'), star: q('.tbs-mark'),
    legO: q('.tbs-leg-o'), leg: q('.tbs-leg'), legHi: q('.tbs-leg-hi'), bootL: q('.tbs-boot-l'), bootR: q('.tbs-boot-r'),
    armO: q('.tbs-arm-o'), arm: q('.tbs-arm'), armHi: q('.tbs-arm-hi'), hand: q('.tbs-hand'), armMic: q('.tbs-arm-mic'),
    hairBack: q('.tbs-hair-back'), hairBackHi: q('.tbs-hair-back-hi'), lockL: q('.tbs-lock-l'), lockR: q('.tbs-lock-r'),
    eyes: q('.tbs-eyes'), mouth: q('.tbs-mouth'), shadow: q('.tbs-shadow'), flash: q('.tbs-flash'),
  };
  var logo = header.querySelector('.brand-logo');

  // The lion and the frog from the mascot duel, dancing under the QR code.
  var dancers = [];
  function buildDancers() {
    var box = opts.dancers;
    if (!box || dancers.length || typeof buildMascotStageHtml !== 'function') return;
    var tmp = document.createElement('div');
    tmp.innerHTML = buildMascotStageHtml();
    ['lion', 'frog'].forEach(function (side) {
      var fighter = tmp.querySelector('[data-role="' + side + '"]');
      if (!fighter) return;
      Array.prototype.forEach.call(fighter.querySelectorAll('[data-role]'), function (n) { n.removeAttribute('data-role'); });
      fighter.removeAttribute('data-role');
      var slot = document.createElement('div');
      slot.className = 'tbs-dancer-slot';
      slot.appendChild(fighter);
      box.appendChild(slot);
      dancers.push({ rig: fighter.querySelector('.fighter-3d-rig'), paw: fighter.querySelector('.fighter-arm-throw') });
    });
  }

  // Only touch the DOM when a value really changes: every write costs a style pass.
  function css(node, prop, value) {
    if (!node) return;
    var cache = node._tbs || (node._tbs = {});
    if (cache[prop] === value) return;
    cache[prop] = value;
    node.style[prop] = value;
  }
  var svgScale = 0.67;
  var eqCtx = null, eqGrad = null, eqW = 0, eqH = 30, eqDpr = 1;
  var remeasureUntil = 0;
  var shakeEls = { options: [], panels: [], invite: null, at: -1 };

  function trackName() {
    var src = audio.currentSrc || audio.getAttribute('src') || '';
    try { src = decodeURIComponent(src.split('?')[0]); } catch (_) { /* keep raw */ }
    return src.slice(src.lastIndexOf('/') + 1);
  }

  // The space the singer may use: between the logo and the controls on the right.
  function measure() {
    var hr = header.getBoundingClientRect();
    var inner = header.querySelector('.max-w-7xl') || header;
    var left = inner.firstElementChild, right = inner.lastElementChild;
    var l = left ? left.getBoundingClientRect().right - hr.left + 28 : hr.width * 0.3;
    var r = right ? right.getBoundingClientRect().left - hr.left - 28 : hr.width * 0.7;
    if (r - l < 140) { l = hr.width * 0.35; r = hr.width * 0.65; }
    bounds = { left: l, right: r, width: hr.width };
    hdr = { left: hr.left, top: hr.top, h: hr.height };
    svgScale = (el.singer.offsetHeight || 102) / 152;
    // Canvas pixels cost fill rate: on 4K TVs and retina screens cap the density.
    eqDpr = Math.min(1.25, window.devicePixelRatio || 1);
    eqW = hr.width;
    var ew = Math.round(eqW * eqDpr), eh = Math.round(eqH * eqDpr);
    if (el.eq.width !== ew || el.eq.height !== eh) { el.eq.width = ew; el.eq.height = eh; }
    eqCtx = eqCtx || tbsCanvas2d(el.eq);
    eqGrad = eqCtx.createLinearGradient(0, eqH, 0, 0);
    [[0, '#38bdf8'], [0.55, '#a78bfa'], [0.85, '#fb7185'], [1, '#facc15']].forEach(function (c) { eqGrad.addColorStop(c[0], c[1]); });
    measureFire(hr);
  }

  // The fire burns from behind the Smallhours logo up to the top edge of the bar.
  function measureFire(hr) {
    if (!logo || !el.fire) return;
    hr = hr || header.getBoundingClientRect();
    var lr = logo.getBoundingClientRect();
    var box = { left: lr.left - hr.left - 30, width: lr.width + 60, height: hr.height, logoTop: lr.top - hr.top, logoH: lr.height };
    var dpr = Math.min(1.25, window.devicePixelRatio || 1);
    el.fire.style.left = box.left.toFixed(0) + 'px';
    el.fire.style.width = box.width.toFixed(0) + 'px';
    el.fire.style.height = box.height.toFixed(0) + 'px';
    var w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (el.fire.width !== w || el.fire.height !== h) { el.fire.width = w; el.fire.height = h; }
    fire.box = box; fire.dpr = dpr;
    if (el.logoGlow) {
      el.logoGlow.style.left = (lr.left - hr.left + lr.width / 2).toFixed(0) + 'px';
      el.logoGlow.style.top = (lr.top - hr.top + lr.height / 2).toFixed(0) + 'px';
    }
    if (!fire.sprites) fire.sprites = tbsFireSprites();
    if (!fire.ctx) fire.ctx = tbsCanvas2d(el.fire);
  }

  // Song time: the audio clock, run forward smoothly between its updates.
  function songTime(now) {
    var ct = audio.currentTime;
    if (ct !== clock.ct) { clock.ct = ct; clock.at = now; }
    var predicted = clock.base + (now - clock.baseAt) / 1000 * (audio.playbackRate || 1);
    var measured = ct + Math.min(0.3, (now - clock.at) / 1000) * (audio.paused ? 0 : (audio.playbackRate || 1));
    if (!clock.baseAt || Math.abs(measured - predicted) > 0.06) { clock.base = measured; clock.baseAt = now; return measured - latency; }
    clock.base = predicted + (measured - predicted) * 0.08; clock.baseAt = now;
    return clock.base - latency;
  }

  function setT(node, tf) { if (node) node.setAttribute('transform', tf); }
  function setD(node, d) { if (node) node.setAttribute('d', d); }
  function pt(q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }

  // ---- fire ----
  function spawnFlame(n, power, spread) {
    var b = fire.box;
    if (!b) return;
    if (tier) n = Math.round(n * (tier >= 2 ? 0.35 : 0.6));
    // Flames start on the top edge of the logo and rise to the top of the bar.
    var base = b.logoTop + b.logoH * 0.2;
    for (var i = 0; i < n; i++) {
      var f = tbsPoolTake(fire.parts);
      if (!f) return;
      f.x = 34 + Math.random() * (b.width - 68); f.y = base - Math.random() * 4;
      f.vx = (Math.random() - 0.5) * 30 * (spread || 1); f.vy = -(55 + Math.random() * 90) * power;
      f.r = (7 + Math.random() * 10) * (0.7 + 0.5 * power); f.life = 0; f.max = 0.32 + Math.random() * 0.35;
    }
  }
  function spawnEmbers(n, power) {
    var b = fire.box;
    if (!b) return;
    if (tier) n = Math.round(n * (tier >= 2 ? 0.35 : 0.6));
    for (var i = 0; i < n; i++) {
      var e = tbsPoolTake(fire.embers);
      if (!e) return;
      e.x = 34 + Math.random() * (b.width - 68); e.y = b.logoTop + b.logoH * 0.15;
      e.vx = (Math.random() - 0.5) * 120; e.vy = -(90 + Math.random() * 160) * power;
      e.r = 1.2 + Math.random() * 2; e.life = 0; e.max = 0.6 + Math.random() * 0.6;
    }
  }
  function drawFire(dt, loc, hit, exiting) {
    var b = fire.box, ctx = fire.ctx;
    if (!b || !ctx) return;
    var t = loc.t;
    // How hard the fire burns: from a pilot light in the build-up to a blaze in the drops.
    var rate = 0, power = 1;
    var lit = loc.ignited && !exiting;           // dark until the big drop, then it burns
    if (lit) {
      if (loc.stage === 'outro') { rate = 40; power = 0.6; }
      else if (loc.riser) { rate = 40 + 180 * ((loc.beatInBar + loc.phase) / 4); power = 0.7 + 0.4 * ((loc.beatInBar + loc.phase) / 4); }
      else if (loc.kind === 'd') { rate = 150 + 110 * loc.energy; power = 1 + 0.35 * loc.energy; }
      else if (loc.kind === 'g') { rate = 90; power = 0.85; }
      else { rate = 28; power = 0.55; }
    }
    if (reduced) rate *= 0.35;
    if (rate > 0) spawnFlame(Math.round(rate * dt + Math.random() * 0.5), power, 1);
    // Bursts on the beat: every beat in the drops and grooves, 1 and 3 in the breaks,
    // eighths while a drop builds. The big one is the landing.
    if (lit && !reduced && loc.i !== fire.lastBeat) {
      fire.lastBeat = loc.i;
      var igniteBeat = map.igniteBeat != null ? map.igniteBeat : map.dropBeat;
      if (loc.i === igniteBeat) { spawnFlame(130, 2, 2.4); spawnEmbers(90, 1.5); }     // it lights with a blast
      else if (loc.stage === 'dance') {
        var kk = 0.4 + 0.6 * loc.kick;           // bursts as big as the kick
        if (loc.kind === 'd') { spawnFlame(Math.round((24 + 20 * loc.energy) * kk), (1.55 + 0.4 * loc.energy) * (0.8 + 0.2 * kk), 1.4); spawnEmbers(Math.round((loc.beatInBar === 0 ? 30 : 12) * kk), 1.1); }
        else if (loc.kind === 'g') { spawnFlame(16, 1.3, 1.2); spawnEmbers(6, 0.9); }
        else if (loc.beatInBar % 2 === 0) { spawnFlame(8, 1, 1); spawnEmbers(4, 0.7); }
      }
    }
    var half = loc.i * 2 + (loc.phase >= 0.5 ? 1 : 0);
    if (lit && !reduced && loc.riser && half !== fire.lastHalf) { fire.lastHalf = half; spawnFlame(10 + Math.round(20 * (loc.beatInBar + loc.phase) / 4), 1.3, 1); }

    var dpr = fire.dpr, sp = fire.sprites;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.fire.width, el.fire.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    var flames = fire.parts.items;
    for (var i = fire.parts.n - 1; i >= 0; i--) {
      var p = flames[i];
      p.life += dt;
      if (p.life >= p.max) { tbsPoolKill(fire.parts, i); continue; }
      var k = p.life / p.max;
      p.x += p.vx * dt + Math.sin(p.life * 18 + p.x * 0.05) * 0.8;
      p.y += p.vy * dt;
      var rad = Math.max(1, p.r * (0.55 + 0.45 * Math.min(1, k * 4)) * (1 - k * 0.6));
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, k - 0.5) * 2 * 0.9;
      // Tall, narrow tongues rather than round puffs.
      ctx.drawImage(k < 0.28 ? sp.core : k < 0.65 ? sp.flame : k < 0.85 ? sp.glow : sp.smoke, p.x - rad * 0.7, p.y - rad * 1.7, rad * 1.4, rad * 2.6);
    }
    var embers = fire.embers.items;
    for (var j = fire.embers.n - 1; j >= 0; j--) {
      var em = embers[j];
      em.life += dt;
      if (em.life >= em.max) { tbsPoolKill(fire.embers, j); continue; }
      em.x += em.vx * dt; em.y += em.vy * dt; em.vy += 140 * dt; em.vx *= 0.98;
      ctx.globalAlpha = 1 - em.life / em.max;
      ctx.drawImage(sp.core, em.x - em.r * 2, em.y - em.r * 2, em.r * 4, em.r * 4);
    }
    // A glowing rim along the top of the logo that flares, warm to hot, on the beat.
    var rimY = b.logoTop + b.logoH * 0.2;
    var rimA = exiting ? 0 : (0.2 + 0.6 * hit) * Math.min(1, rate / 120);
    if (rimA > 0.01) {
      ctx.globalAlpha = rimA * (1 - hit);
      ctx.drawImage(sp.rimWarm, 30, rimY - 10, b.width - 60, 16);
      ctx.globalAlpha = rimA * hit;
      ctx.drawImage(sp.rimHot, 30, rimY - 10, b.width - 60, 16);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return rate;
  }

  // ---- singer ----
  function drawSinger(pose, px, air, dt, exitLift) {
    var crouch = Math.max(0, pose.y);
    var lift = Math.min(0, pose.y) + exitLift;
    var yaw = Math.max(-1, Math.min(1, pose.yaw));
    var rootM = tbsMul(tbsMul(tbsMul(tbsT(60, 150), tbsS(pose.sx * pose.flip, pose.sy)), tbsR(pose.rot)), tbsT(-60, -150));
    var upperM = tbsMul(rootM, tbsT(0, crouch));
    var headM = tbsMul(tbsMul(tbsMul(upperM, tbsT(60, 56)), tbsR(pose.head + yaw * 4)), tbsT(-60, -56));
    el.singer.style.transform = 'translate(' + px.toFixed(1) + 'px,' + lift.toFixed(1) + 'px)';
    el.root.setAttribute('transform', tbsMat(rootM));
    setT(el.upper, 'translate(0 ' + crouch.toFixed(2) + ')');
    setT(el.head, 'rotate(' + (pose.head + yaw * 4).toFixed(2) + ' 60 56)');
    // Turning: the face slides toward the side she looks at and narrows a little; the far
    // ear hides behind the head. Light stays where it is, so she reads as round.
    setT(el.face, 'translate(' + (60 + yaw * 5).toFixed(2) + ' 40) scale(' + (1 - 0.18 * Math.abs(yaw)).toFixed(3) + ' 1) translate(-60 -40)');
    setT(el.ears, 'translate(' + (-yaw * 3).toFixed(2) + ' 0)');
    // The mark on her top turns with her body: it slides toward the side she faces and narrows.
    setT(el.star, 'translate(' + (60 + yaw * 4).toFixed(2) + ' 82) scale(' + (1 - 0.3 * Math.abs(yaw)).toFixed(3) + ' 1) translate(-60 -82)');
    setT(el.eyes, 'translate(0 40) scale(1 ' + Math.max(0.1, pose.eyes).toFixed(2) + ') translate(0 -40)');
    setT(el.mouth, 'translate(60 50) scale(1 ' + (0.35 + pose.mouth * 0.95).toFixed(2) + ') translate(-60 -50)');
    setT(el.skirt, 'translate(60 92) scale(' + (1 + 0.12 * pose.skirt).toFixed(3) + ' ' + (1 - 0.06 * pose.skirt).toFixed(3) + ') translate(-60 -92)');
    setT(el.armMic, 'rotate(' + pose.armMic.toFixed(1) + ' 74 70)');

    // Legs: knees bend as she sinks, feet stay planted.
    var hipY = 109 + crouch;
    var kL = tbsKnee(51, hipY, 48.5, 141, 16.5, 16.5, -1);
    var kR = tbsKnee(69, hipY, 71.5, 141, 16.5, 16.5, 1);
    var legs = 'M51 ' + hipY.toFixed(1) + ' L' + pt(kL) + ' L48.5 141 M69 ' + hipY.toFixed(1) + ' L' + pt(kR) + ' L71.5 141';
    setD(el.legO, legs); setD(el.leg, legs);
    setD(el.legHi, 'M50 ' + (hipY + 3).toFixed(1) + ' L' + pt([kL[0] - 1, kL[1]]) + ' M68 ' + (hipY + 3).toFixed(1) + ' L' + pt([kR[0] - 1, kR[1]]));
    setT(el.bootL, 'translate(48 145)');
    setT(el.bootR, 'translate(72 145)');

    // Free arm: shoulder, elbow, hand.
    // armFree: degrees out from hanging straight down (-18 rest, -95 out to the side,
    // -160 straight up); the elbow bends the forearm back in toward her.
    var ua = -pose.armFree * Math.PI / 180;
    var ud = [-Math.sin(ua), Math.cos(ua)];
    var elbowP = [46 + ud[0] * 13, 70 + ud[1] * 13];
    var fa = ua - pose.elbow * Math.PI / 180;
    var fd = [-Math.sin(fa), Math.cos(fa)];
    var handP = [elbowP[0] + fd[0] * 13, elbowP[1] + fd[1] * 13];
    var arm = 'M46 70 L' + pt(elbowP) + ' L' + pt(handP);
    setD(el.armO, arm); setD(el.arm, arm);
    setD(el.armHi, 'M45 69 L' + pt([elbowP[0] - 0.8, elbowP[1] - 0.8]));
    el.hand.setAttribute('cx', handP[0].toFixed(1)); el.hand.setAttribute('cy', handP[1].toFixed(1));

    // Shadow on the floor: smaller and fainter the higher she is.
    var h = Math.min(1, -lift / 60);
    el.shadow.setAttribute('transform', 'translate(60 149.5) scale(' + (1 - 0.5 * h).toFixed(3) + ') translate(-60 -149.5)');
    css(el.shadow, 'opacity', (1 - 0.7 * h).toFixed(2));

    // Hair in "world" svg units: the singer's own movement on the bar feeds the swing.
    var s = svgScale;
    var off = [px / s, lift / s];
    var flipYaw = tbsMul(headM, tbsT(0, 0));
    var pony = tbsHairStep(hair.pony, flipYaw, off, dt);
    var lockL = tbsHairStep(hair.lockL, headM, off, dt);
    var lockR = tbsHairStep(hair.lockR, headM, off, dt);
    setD(el.hairBack, tbsRibbon(pony, 9.5, 2));
    setD(el.hairBackHi, 'M' + pony.slice(1, 5).map(pt).join(' L'));
    setD(el.lockL, tbsRibbon(lockL, 5, 1.6));
    setD(el.lockR, tbsRibbon(lockR, 5, 1.6));
  }

  function frame(now) {
    raf = 0;
    if (!running || !map) return;
    if (lastNow) {
      var nextTier = tbsGovern(gov, now - lastNow);
      if (nextTier !== tier) setTier(nextTier);
    }
    var dt = lastNow ? Math.min(1 / 20, Math.max(0.001, (now - lastNow) / 1000)) : 1 / 60;
    lastNow = now;
    frameNo++;
    var t = songTime(now);
    var loc = tbsLocate(map, t, hint);
    hint = loc.i;
    var exiting = exitAt > 0;
    var stageOn = loc.stage !== 'intro' || t > map.beats[Math.max(0, map.dropBeat - 4)];
    var open = stageOn && !exiting;
    if (open !== header.classList.contains('tbs-open')) {
      header.classList.toggle('tbs-open', open);
      document.body.classList.toggle('tbs-bar-open', open);   // the lobby makes room for the taller bar
      remeasureUntil = now + 900;              // the bar grows for a moment; follow the logo
    }
    if (now < remeasureUntil && frameNo % 6 === 0) measure();

    // --- singer ---
    var pose = tbsPose(loc, reduced);
    var singerVisible = pose.show && !exiting;
    var exitLift = 0;
    if (exiting) {
      var ex = Math.min(1, (now - exitAt) / 650);
      exitLift = -170 * ex * ex;
      if (ex >= 1 && !fire.parts.n && !fire.embers.n) { finish(); return; }
    }
    var w = bounds.right - bounds.left;
    // She travels in the drops and stays where she is otherwise.
    var spot = pose.travel != null ? pose.travel : (el.singer._x != null ? el.singer._x : 0.5);
    el.singer._x = spot;
    var px = bounds.left + w * spot;
    css(el.singer, 'opacity', singerVisible || (exiting && exitLift > -170) ? '1' : '0');
    if (pose.show || exiting) drawSinger(pose, px, 0, dt, exitLift);

    // --- the bar itself ---
    var p = loc.phase;
    var hit = Math.pow(1 - p, 3);
    var kindLevel = loc.kind === 'd' ? 1 : loc.kind === 'g' ? 0.6 : 0.32;
    var live = loc.stage === 'intro' ? 0.25 + 0.35 * Math.min(1, Math.max(0, t / Math.max(1, map.dropTime))) : kindLevel;
    var riserAmt = loc.riser ? (loc.beatInBar + p) / 4 : 0;
    // Everything below changes only transform and opacity, which the GPU composites
    // without repainting the bar.
    css(el.washSpot, 'transform', 'translateX(' + px.toFixed(0) + 'px)');
    css(el.washSpot, 'opacity', (0.5 + 0.5 * live).toFixed(2));
    css(el.wash, 'filter', loc.kind === 'd' && loc.stage === 'dance' ? 'hue-rotate(' + ((loc.bar % 4) * 32) + 'deg)' : 'none'); // once per bar
    // Strobe on the eighths while a drop builds.
    css(el.wash, 'opacity', (0.35 + 0.5 * live * hit + (loc.riser && !reduced ? 0.35 * riserAmt * (Math.sin(p * Math.PI * 4) > 0 ? 1 : 0.2) : 0)).toFixed(3));
    css(el.washBright, 'opacity', (0.22 * riserAmt).toFixed(3));
    // Light sweep across the bar, once per bar, in the drops.
    css(el.sweep, 'opacity', loc.kind === 'd' && loc.stage === 'dance' && !reduced ? '0.55' : '0');
    css(el.sweep, 'transform', 'translateX(' + ((((loc.beatInBar + p) / 4) * 1.25 - 0.25) * bounds.width).toFixed(0) + 'px) skewX(-18deg)');
    css(el.beatline, 'opacity', (0.25 + 0.75 * hit * live).toFixed(3));
    css(el.singerGlow, 'opacity', (hit * live).toFixed(3));
    if (el.chip.classList.contains('tbs-chip-on')) css(el.chip, 'transform', 'translate(-50%, -50%) scale(' + (1 + hit * live * 0.08).toFixed(3) + ')');
    // Equalizer along the bottom edge, drawn on one canvas: each beat deals new heights.
    if (eqCtx && (tier < 2 || frameNo % 2 === 0)) {
      eqCtx.setTransform(eqDpr, 0, 0, eqDpr, 0, 0);
      eqCtx.clearRect(0, 0, eqW, eqH);
      eqCtx.globalAlpha = 0.35 + live * 0.45;
      eqCtx.fillStyle = eqGrad;
      var bw = (eqW - 12) / TBS_EQ_BARS;
      for (var b = 0; b < TBS_EQ_BARS; b++) {
        var r1 = tbsRand(Math.max(0, loc.i), b);
        var lvl = Math.max(0.04, (0.18 + 0.82 * r1) * (0.25 + 0.75 * hit) * (0.35 + 0.65 * live) * (0.5 + 0.5 * (loc.energy || 0.3)));
        var bh = lvl * eqH;
        eqCtx.fillRect(6 + b * bw + 1.5, eqH - bh, bw - 3, bh);
      }
    }
    // Spotlights lean in toward the singer and swing with the beat.
    var lean = ((px / Math.max(1, bounds.width)) - 0.5) * 40;
    var swing = loc.stage === 'intro' ? 0 : 6 * Math.sin(Math.PI * (loc.beatInBar + p) / 2);
    css(el.spotL, 'transform', 'translateX(' + px.toFixed(0) + 'px) rotate(' + (-24 + lean + swing).toFixed(1) + 'deg)');
    css(el.spotR, 'transform', 'translateX(' + px.toFixed(0) + 'px) rotate(' + (24 + lean - swing).toFixed(1) + 'deg)');
    var spotO = (loc.stage === 'intro' ? 0.15 * live : 0.25 + 0.45 * live * (0.5 + 0.5 * hit)).toFixed(2);
    css(el.spotL, 'opacity', spotO); css(el.spotR, 'opacity', spotO);

    // --- fire over the logo, and the logo itself pulsing on the beat ---
    var rate = drawFire(dt, loc, hit, exiting) || 0;
    var heat = exiting ? 0 : Math.min(1, rate / 200);
    css(logo, 'transform', 'scale(' + (1 + hit * heat * 0.07).toFixed(3) + ')');
    css(el.logoGlow, 'opacity', (heat * (0.35 + 0.65 * hit)).toFixed(2));
    css(el.logoGlow, 'transform', 'translate(-50%, -50%) scale(' + (0.9 + 0.25 * hit * heat).toFixed(3) + ')');

    // The AI characters: dancing their own way along the bar, or away on the Board Crash.
    var cs = crashState(t);
    var said = exiting ? [] : cs ? cs.lines.concat((TBS_SONG_LINES[trackName()] || []).filter(function (l) { return t >= l.at && t < l.at + l.len; }))
      : tbsSongLines(trackName(), t);
    for (var bi = 0; bi < bots.length; bi++) {
      var B = bots[bi], role = cs && cs[B.role];
      if (B.rig && B.rig.el.parentNode !== B.wrap) B.wrap.insertBefore(B.rig.el, B.wrap.firstChild);  // back from a game intro
      if (role && role.away > 0.001) { botAway(B, role, cs); continue; }
      botHost(B, 'bar');
      // Four small transforms are cheap, so they stay on a slow TV too (only less often there).
      if (tier >= 2 && frameNo % 2 && !cs) continue;
      var bp = exiting ? { show: false, op: 0 } : tbsBotPose(loc, bi, B.kind, reduced, { singer: el.singer._x, w: w });
      var re = role && role.react;
      if (re || (!exiting && talking(said, B.role))) { bp.show = true; bp.op = Math.max(bp.op, 1); }
      css(B.wrap, 'opacity', bp.show ? ((re && re.flicker != null ? re.flicker : 1) * bp.op).toFixed(2) : '0');
      if (!bp.show) continue;
      var pose = {
        step: bp.step, wheel: bp.wheel, boost: bp.boost, mood: bp.mood, arm: bp.arm, look: bp.look, jitter: bp.jitter,
      };
      var emote = bp.emote, by = bp.y, brot = bp.rot, bflip = bp.flip, bsy = bp.sy, bx = bounds.left + w * TBS_BOT_SPOTS[bi] + bp.x;
      if (re) {
        // Reacting to the crash from its spot: startled, watching, sulking.
        var boardX = cs.board.left + cs.board.width / 2 - hdr.left;
        emote = re.emote || ''; pose.mood = re.mood || pose.mood; pose.step = 0;
        bflip = re.face === 'away' ? (boardX > bx ? -1 : 1) : re.face === 'nova' ? -1 : (boardX > bx ? 1 : -1);
        pose.look = bflip * 14;
        brot = bflip * 5; by = 0; bsy = 1;
        if (re.jump) by = -16 * re.jump;
        if (re.slump) { brot = -bflip * 8; bsy = 0.94; pose.arm = 0; }
        if (re.windup != null) { bx += (Math.random() - 0.5) * 3 * re.windup; bsy = 1 - 0.1 * re.windup; brot = -6 * re.windup; pose.boost = re.boost; }
        if (re.wobble) brot = 26 * re.wobble * Math.sin(t * 14);
        if (re.notes) { pose.arm = 0.6 + 0.3 * Math.sin(t * 8); brot = 3 * Math.sin(t * 2); }
        if (re.jitter) pose.jitter = re.jitter;
      }
      B.barX = bx;
      botPlace(B, bx, hdr.h - 4 + by, brot, TBS_BAR_H / 240, bflip * (re ? 1 : bp.sx || 1), bsy);
      if (B.rig) B.rig.pose(pose);
      botEmote(B, emote);
    }
    crashBubbles(cs, said);

    // The lion and the frog dance under the QR code.
    for (var dn = 0; tier < 2 && dn < dancers.length; dn++) {
      var dp = exiting ? { y: 0, rot: 0, sx: 1, sy: 1, px: 0, py: 0 } : tbsDancerPose(loc, dn, reduced);
      if (dancers[dn].rig) css(dancers[dn].rig, 'transform', 'translate3d(0,' + dp.y.toFixed(1) + 'px,0) rotateZ(' + dp.rot.toFixed(1) + 'deg) scale(' + dp.sx.toFixed(3) + ',' + dp.sy.toFixed(3) + ')');
      if (dancers[dn].paw) css(dancers[dn].paw, 'transform', 'translate3d(' + (dp.px * 1.6).toFixed(1) + 'px,' + (dp.py * 1.6).toFixed(1) + 'px,26px)');
    }

    // The lobby boxes (vote options and panels) shake on the beat with her.
    // During the Board Crash the vote board belongs to the robots; otherwise it shakes along.
    if (!crashCards(cs, t)) {
      var shake = exiting || tier >= 2 ? { vx: 0, vy: 0, kick: 0 } : tbsShake(loc, reduced);
      applyShake(shake, now);
    }

    // The flash and shockwave: the landing, and every drop after a quieter bar.
    var flashBeat = loc.stage !== 'intro' && loc.stage !== 'fall' && (loc.sectionStart || (loc.i === map.dropBeat));
    if (flashBeat && loc.i !== lastFlashBeat && !reduced) {
      lastFlashBeat = loc.i;
      el.ring.style.left = px.toFixed(0) + 'px';
      restart(el.flash, 'tbs-flash-go');
      restart(el.ring, 'tbs-ring-go');
    }
    // Notes float up from the mic in the breaks, on beats 1 and 3.
    if (loc.stage === 'dance' && loc.kind === 'b' && !loc.riser && loc.beatInBar % 2 === 0 && loc.i !== lastNoteBeat) {
      lastNoteBeat = loc.i;
      var note = el.notes[noteIdx++ % el.notes.length];
      note.style.left = (px + 18).toFixed(0) + 'px';
      restart(note, 'tbs-note-go');
    }
    // "Now playing" chip in the middle of the bar until she arrives; its dots count the beats.
    el.chip.classList.toggle('tbs-chip-on', loc.stage === 'intro' && !exiting);
    for (var d = 0; d < el.dots.length; d++) el.dots[d].classList.toggle('on', loc.i >= 0 && d === loc.beatInBar);

    raf = requestAnimationFrame(frame);
  }

  // A lower tier undoes what it no longer draws, so nothing is left frozen mid-move.
  function setTier(next) {
    tier = next;
    if (tier >= 1) {
      shakeEls.panels.concat(shakeEls.invite ? [shakeEls.invite] : []).forEach(function (n) { css(n, 'transform', ''); });
      shakeEls.options.forEach(function (o) { if (o._tbsShine) css(o._tbsShine, 'opacity', '0'); });
    }
    document.body.classList.toggle('tbs-lite', tier >= 2);
  }

  // ---- Board Crash (TBS_CRASH_AT): the cast and the vote board ----
  var crash = { active: false, cards: [], bubbles: {}, board: null, boardAt: -99 };
  function hostScale() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--host-scale'));
    return v > 0 ? v : 1;
  }
  /** The crash state this frame (tbsCrashState with each robot's real spot), or null. */
  function crashState(t) {
    var at = TBS_CRASH_AT[trackName()];
    var u = at == null ? -99 : t - at;
    if (at == null || reduced || exiting() || u < -TBS_CRASH_PRE || u >= TBS_CRASH_LEN || !bots.length) {
      if (crash.active) crashReset();
      return null;
    }
    var board = document.getElementById('hostVotes');
    if (!board || !board.offsetParent) { if (crash.active) crashReset(); return null; }
    // Measure once a second, not every frame: the lobby does not move during the song.
    if (!crash.active || frameNo - crash.boardAt > 60) {
      var br = board.getBoundingClientRect();
      crash.board = { left: br.left, top: br.top, width: br.width, height: br.height };
      crash.boardAt = frameNo;
      if (!crash.active) measure();
    }
    crash.active = true;
    var r = crash.board, wbar = bounds.right - bounds.left, homes = {};
    bots.forEach(function (b) {
      homes[b.role] = { x: (hdr.left + bounds.left + wbar * TBS_BOT_SPOTS[b.idx] - r.left) / r.width, y: (hdr.top + hdr.h - 4 - r.top) / r.height };
    });
    var st = tbsCrashState(u, homes);
    st.u = u; st.board = r; st.homes = homes;
    st.size = Math.max(110, Math.min(200, r.width * 0.2));
    st.screen = {};
    return st;
  }
  /** A robot away from its spot: in the cast layer over the page, at full size. */
  function botAway(b, p, st) {
    botHost(b, 'cast');
    var r = st.board, h = st.homes[b.role], a = p.away;
    var X = r.left + tbsLerp(h.x, p.x, a) * r.width;
    var Y = r.top + (tbsLerp(h.y, p.y, a) + (p.lift || 0)) * r.height;
    var big = st.size * 1.2 / 240 * (b.kind === 'zoom' ? 0.85 : 1);
    var s = tbsLerp(TBS_BAR_H / 240, big, tbsEase(a));
    Y = Math.max(Y, 240 * s + 10);          // the head always stays on the screen
    var flip = p.flip === -1 ? -1 : 1;
    css(b.wrap, 'opacity', (p.flicker != null ? p.flicker : 1).toFixed(2));
    botPlace(b, X, Y, b.kind === 'zoom' ? (p.tilt || 0) : 0, s, flip, 1);
    if (b.rig) b.rig.pose({ step: p.step, mood: p.mood, wheel: p.wheel, boost: p.boost, tilt: b.kind === 'zoom' ? 0 : p.tilt, arm: p.arm, look: p.look, jitter: p.jitter });
    if (b.smoke) css(b.smoke, 'opacity', p.smoke ? '1' : '0');
    botEmote(b, '');
    st.screen[b.role] = { x: X, y: Y - 240 * s };
  }
  function talking(lines, who) {
    for (var k = 0; k < lines.length; k++) if (lines[k].who === who || lines[k].who === 'all') return true;
    return false;
  }
  /**
   * Speech bubbles for the robots that are talking: over the head of a robot that is away on the
   * board, or hanging just under the bar from a robot at its spot. 'all' lines get one bubble
   * under each pair of robots (left and right of the singer).
   */
  function crashBubbles(st, lines) {
    lines = lines || [];
    var wbar = bounds.right - bounds.left, used = {};
    var barAt = function (idxs) {
      var xs = idxs.map(function (i) { var b = bots[i]; return b ? (b.barX != null ? b.barX : bounds.left + wbar * TBS_BOT_SPOTS[i]) : null; })
        .filter(function (x) { return x != null; });
      if (!xs.length) return null;
      return { x: hdr.left + xs.reduce(function (a, x) { return a + x; }, 0) / xs.length, y: hdr.top + hdr.h + 14, below: true };
    };
    var show = function (key, line, at) {
      if (!at) return;
      used[key] = true;
      var bub = crash.bubbles[key];
      if (!bub) {
        bub = crash.bubbles[key] = document.createElement('div');
        bub.className = 'tbs-crash-bubble';
        castRoot().appendChild(bub);
      }
      if (bub.textContent !== line.text) { bub.textContent = line.text; bub._w = 0; }
      bub.classList.toggle('below', !!at.below);
      if (!bub._w) bub._w = bub.offsetWidth || 300;
      // Keep the whole bubble on the screen; the tail still points at the robot.
      var half = bub._w / 2, vw = window.innerWidth || 1920;
      var x = Math.max(half + 24, Math.min(vw - half - 24, at.x));
      bub.style.setProperty('--tail', (half + at.x - x).toFixed(0) + 'px');
      css(bub, 'transform', 'translate(' + x.toFixed(0) + 'px,' + (at.below ? at.y : at.y - 8).toFixed(0) + 'px) translate(-50%, ' + (at.below ? '0' : '-100%') + ')');
      bub.classList.add('on');
    };
    lines.forEach(function (line) {
      if (line.who === 'all') {
        var half = Math.ceil(bots.length / 2), left = [], right = [];
        bots.forEach(function (b, i) { (i < half ? left : right).push(i); });
        show('allL', line, barAt(left));
        show('allR', line, barAt(right));
        return;
      }
      var b = bots.filter(function (x) { return x.role === line.who; })[0];
      if (!b || used[line.who]) return;
      show(line.who, line, (st && st.screen && st.screen[line.who]) || barAt([b.idx]));
    });
    Object.keys(crash.bubbles).forEach(function (k) { if (!used[k]) crash.bubbles[k].classList.remove('on'); });
  }
  /** The game cards: off the board and out of the screen, then back from the repair crew. */
  function crashCards(st, t) {
    if (!st) return false;
    var r = st.board, u = st.u;
    var scale = hostScale();
    var opts = Array.prototype.slice.call(document.querySelectorAll('#hostVotes .lobby-game-option'));
    opts.forEach(function (o, j) {
      if (!o._crashHome || o._crashHome.w !== r.width) {
        var prev = o.style.transform; o.style.transform = '';
        var hb = o.getBoundingClientRect();
        o.style.transform = prev;
        o._crashHome = { cx: hb.left + hb.width / 2, cy: hb.top + hb.height / 2, w: r.width };
      }
      var carrier = j % 2 ? st.byte : st.glitch;
      var from = carrier && carrier.away > 0.5 ? { dx: (r.left + carrier.x * r.width) - o._crashHome.cx, dy: (r.top + carrier.y * r.height - st.size * 0.6) - o._crashHome.cy } : { dx: 0, dy: 400 };
      var c = tbsCrashCard(u, j, window.innerHeight - o._crashHome.cy + 200, from);
      css(o, 'transform', 'translate(' + (c.x / scale).toFixed(1) + 'px,' + (c.y / scale).toFixed(1) + 'px) rotate(' + c.rot.toFixed(1) + 'deg)');
      css(o, 'opacity', c.op.toFixed(2));
    });
    crash.cards = opts;
    return true;
  }
  function crashReset() {
    crash.active = false;
    bots.forEach(function (b) { botHost(b, 'bar'); if (b.smoke) css(b.smoke, 'opacity', '0'); botEmote(b, ''); });
    Object.keys(crash.bubbles).forEach(function (k) { crash.bubbles[k].classList.remove('on'); });
    (crash.cards || []).forEach(function (o) { css(o, 'transform', ''); css(o, 'opacity', ''); o._crashHome = null; });
    crash.cards = [];
  }
  function exiting() { return exitAt > 0; }

  // Shake the lobby: transforms written straight onto the few boxes, so no style
  // inheritance runs through the page. The vote list re-renders, so look it up again now and then.
  function applyShake(sh, now) {
    if (now - shakeEls.at > 1000) {
      shakeEls.at = now;
      shakeEls.options = Array.prototype.slice.call(document.querySelectorAll('.lobby-game-option'));
      shakeEls.panels = Array.prototype.slice.call(document.querySelectorAll('.lobby-panel:not(.invite-panel)'));
      shakeEls.invite = document.querySelector('.invite-panel');
    }
    var sc = (1 + sh.kick * 0.025).toFixed(4);
    var shine = (sh.kick * 0.12).toFixed(3);
    for (var i = 0; i < shakeEls.options.length; i++) {
      var o = shakeEls.options[i], sign = i % 2 ? -1 : 1;
      css(o, 'transform', 'translate(' + (sh.vx * sign).toFixed(1) + 'px,' + sh.vy.toFixed(1) + 'px) scale(' + sc + ')');
      if (tier) continue;
      if (!o._tbsShine) { o._tbsShine = document.createElement('span'); o._tbsShine.className = 'tbs-shine'; o.appendChild(o._tbsShine); }
      css(o._tbsShine, 'opacity', shine);
    }
    if (tier) return;
    for (var j = 0; j < shakeEls.panels.length; j++) {
      css(shakeEls.panels[j], 'transform', 'translate(' + (sh.vx * 0.5).toFixed(1) + 'px,' + (-sh.vy * 0.5).toFixed(1) + 'px) scale(' + (1 + sh.kick * 0.006).toFixed(4) + ')');
    }
    css(shakeEls.invite, 'transform', 'scale(' + (1 + sh.kick * 0.004).toFixed(4) + ')');
  }
  function clearShake() {
    shakeEls.options.concat(shakeEls.panels, shakeEls.invite ? [shakeEls.invite] : []).forEach(function (n) {
      if (!n) return;
      n.style.transform = ''; if (n._tbs) n._tbs.transform = '';
      if (n._tbsShine) { n._tbsShine.remove(); n._tbsShine = null; }
    });
    shakeEls.at = -1;
  }

  // Replay a one-shot effect. The Web Animations API restarts it without forcing a layout.
  var TBS_ANIMS = {
    'tbs-flash-go': { frames: [{ opacity: 0.85 }, { opacity: 0 }], opts: { duration: 500, easing: 'ease-out' } },
    'tbs-ring-go': { frames: [{ opacity: 1, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(9, 3)' }], opts: { duration: 700, easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)' } },
    'tbs-note-go': { frames: [
      { opacity: 0, transform: 'translate(0, 10px) rotate(-10deg) scale(0.7)' },
      { opacity: 1, offset: 0.2 },
      { opacity: 0, transform: 'translate(26px, -48px) rotate(14deg) scale(1.1)' }], opts: { duration: 1600, easing: 'ease-out' } },
  };
  function restart(node, cls) {
    var a = TBS_ANIMS[cls];
    if (a && typeof node.animate === 'function') {
      if (node._tbsAnim) node._tbsAnim.cancel();
      node._tbsAnim = node.animate(a.frames, a.opts);
      return;
    }
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function start(name) {
    var url = shows[name];
    if (!url || !doFetch) return;
    var go = function (m) {
      if (!m || trackName() !== name || audio.paused) return;
      map = m;
      el.chipTitle.textContent = m.title || name;
      running = true;
      exitAt = 0;
      hint = -1;
      lastNow = 0;
      clock = { ct: -1, at: 0, base: 0, baseAt: 0 };
      buildDancers();
      measure();
      header.classList.add('tbs-on');
      document.body.classList.add('tbs-lobby-live');
      if (tier) setTier(tier);
      stage.classList.add('tbs-stage-on');
      if (!raf) raf = requestAnimationFrame(frame);
    };
    if (maps[url]) { go(maps[url]); return; }
    doFetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m && m.beats && m.beats.length > 8) { maps[url] = m; go(m); } })
      .catch(function () {});
  }

  // Let her fly up out of the bar and the fire die down, then put the bar back.
  function stop() {
    if (!running) return;
    if (!exitAt) exitAt = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function finish() {
    crashReset();
    running = false;
    exitAt = 0;
    map = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    header.classList.remove('tbs-on', 'tbs-open');
    document.body.classList.remove('tbs-bar-open');
    if (logo) { logo.style.transform = ''; if (logo._tbs) logo._tbs.transform = ''; }
    document.body.classList.remove('tbs-lobby-live', 'tbs-lite');
    clearShake();
    stage.classList.remove('tbs-stage-on');
    el.singer.style.opacity = '0';
    el.singer._x = null;
    bots.forEach(function (b) { b.wrap.style.opacity = '0'; if (b.wrap._tbs) b.wrap._tbs.opacity = '0'; botEmote(b, ''); });
    fire.parts.n = 0; fire.embers.n = 0; fire.lastBeat = -1;
    if (fire.ctx) { fire.ctx.setTransform(1, 0, 0, 1, 0, 0); fire.ctx.clearRect(0, 0, el.fire.width, el.fire.height); }
    hair.pony.pts = hair.lockL.pts = hair.lockR.pts = null;
  }

  function check() {
    var name = trackName();
    if (!audio.paused && !muted && shows[name]) {
      if (!running || exitAt) start(name);
    } else if (running) stop();
  }
  audio.addEventListener('playing', check);
  audio.addEventListener('pause', check);
  audio.addEventListener('ended', function () { stop(); });
  audio.addEventListener('emptied', check);
  audio.addEventListener('seeked', function () { hint = -1; clock.baseAt = 0; fire.lastBeat = -1; });
  window.addEventListener('resize', function () { if (running) measure(); });

  return {
    setMuted: function (value) { muted = !!value; check(); },
    stop: stop,
    state: function () { return { running: running, track: trackName(), exiting: exitAt > 0, tier: tier }; },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    tbsBeatIndex: tbsBeatIndex, tbsLocate: tbsLocate, tbsPose: tbsPose, tbsShake: tbsShake, tbsDancerPose: tbsDancerPose, tbsBotPose: tbsBotPose, tbsCrashState: tbsCrashState, tbsSongLines: tbsSongLines, TBS_SONG_LINES: TBS_SONG_LINES, tbsCrashCard: tbsCrashCard, TBS_CRASH_AT: TBS_CRASH_AT, TBS_CRASH_LINES: TBS_CRASH_LINES, tbsRand: tbsRand, tbsKnee: tbsKnee,
    tbsGovernor: tbsGovernor, tbsGovern: tbsGovern, tbsHair: tbsHair, tbsHairStep: tbsHairStep, tbsPool: tbsPool, tbsPoolTake: tbsPoolTake, tbsPoolKill: tbsPoolKill, createTopbarShow: createTopbarShow, TBS_SHOWS: TBS_SHOWS, tbsBotMove: tbsBotMove, tbsBotGagOwner: tbsBotGagOwner, TBS_BOT_SPOTS: TBS_BOT_SPOTS,
  };
}
