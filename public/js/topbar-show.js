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
 */
function tbsPose(loc, reduced) {
  var p = loc.phase;
  var hit = Math.pow(1 - p, 3);              // 1 on the beat, fading through it
  var x2 = loc.beatInBar + p;                 // position in the bar, in beats
  var pose = {
    y: 0, sx: 1, sy: 1, rot: 0, travel: null, flip: 1,
    head: 0, armFree: -18, armMic: 0, pony: 0, mouth: 0.15, eyes: 1, show: true,
  };
  if (loc.stage === 'intro') { pose.show = false; return pose; }
  if (loc.stage === 'fall') {
    var f = Math.max(0, Math.min(1, loc.fallProgress));
    pose.y = -150 * (1 - f * f);              // gravity: slow at the top, fastest at the hit
    pose.armFree = -150; pose.armMic = -30; pose.pony = -40; pose.mouth = 0.9; pose.sy = 1.04; pose.sx = 0.97;
    return pose;
  }
  if (loc.stage === 'outro') {
    // The song is over: wave goodbye until the music stops.
    pose.armFree = -160 + 25 * Math.sin(loc.t * 9); pose.mouth = 0.5; pose.rot = -4;
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
    pose.y = 7 * r + 1.4 * Math.sin(p * Math.PI * 8);
    pose.sy = 1 - 0.1 * r; pose.sx = 1 + 0.05 * r;
    pose.armFree = -40 + 30 * r; pose.armMic = -10 * r; pose.head = -6 * r;
    pose.mouth = 0.2 + 0.6 * r; pose.eyes = 1 - 0.85 * r;
  } else if (loc.kind === 'd') {
    var h = 7 + 6 * loc.energy;
    pose.y = -h * Math.sin(Math.PI * p);     // hop: airborne mid-beat, lands on the beat
    pose.sy = 1 - 0.13 * hit; pose.sx = 1 + 0.09 * hit;
    pose.rot = (loc.beatInBar % 2 ? -1 : 1) * 7 * Math.sin(Math.PI * p);
    pose.armFree = loc.beatInBar % 2 === 0 ? -165 + 30 * p : -60 - 40 * hit; // punch up on 1 and 3
    pose.head = 8 * hit * (loc.beatInBar % 2 ? -1 : 1);
    pose.pony = -30 * Math.sin(Math.PI * p) + 18 * hit;
    pose.mouth = 0.45 + 0.55 * hit;
    if (loc.sectionStart) pose.flip = Math.cos(2 * Math.PI * p); // a quick spin into the drop
    // Travel to a new spot every two bars, stepping on the beats.
    var leg = Math.floor(loc.bar / 2);
    var from = TBS_SPOTS[leg % TBS_SPOTS.length];
    var to = TBS_SPOTS[(leg + 1) % TBS_SPOTS.length];
    var k = (loc.bar % 2) * 4 + x2;          // 0..8 beats into the two bars
    var step = k < 4 ? 0 : (Math.floor(k - 4) + Math.min(1, (k - Math.floor(k)) * 2)) / 4;
    pose.travel = from + (to - from) * Math.min(1, step);
  } else if (loc.kind === 'g') {
    pose.y = 4 * hit;                          // knees: lowest on the beat
    pose.sy = 1 - 0.06 * hit;
    pose.rot = 6 * Math.sin(Math.PI * x2);     // sway over two beats
    pose.head = 7 * hit;
    pose.armFree = -30 + 28 * Math.sin(Math.PI * x2);
    pose.pony = -16 * Math.sin(Math.PI * x2);
    pose.mouth = 0.3 + 0.6 * hit;
  } else {
    // Break: half-time sway, eyes closed, holding the long notes.
    var half = Math.pow(1 - ((x2 % 2) / 2), 3);
    pose.y = 3 * half;
    pose.rot = 8 * Math.sin(Math.PI * x2 / 2);
    pose.head = -5 + 5 * Math.sin(Math.PI * x2 / 2);
    pose.armFree = -95 + 25 * Math.sin(Math.PI * x2 / 2);
    pose.armMic = -12;
    pose.pony = -12 * Math.sin(Math.PI * x2 / 2);
    pose.mouth = 0.55 + 0.35 * Math.sin(Math.PI * x2);
    pose.eyes = 0.12;
  }
  if (land) { pose.sy -= 0.22 * land; pose.sx += 0.16 * land; pose.y += 4 * land; pose.armFree = -150; }
  return pose;
}

// The singer: an original Smallhours character, drawn upright with her feet at (60, 150).
var TBS_SINGER_SVG =
  '<svg class="tbs-singer-svg" viewBox="0 0 120 152" aria-hidden="true">' +
  '<g class="tbs-root">' +
    '<ellipse class="tbs-shadow" cx="60" cy="149" rx="22" ry="3.5"/>' +
    '<g class="tbs-body">' +
      // legs and boots
      '<path d="M50 112 L47 141" stroke="#f2c6a0" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M70 112 L73 141" stroke="#f2c6a0" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M41 140 h12 a3 3 0 0 1 3 3 v3 h-17 a3 3 0 0 1 -1 -3 z" fill="#0b1530"/>' +
      '<path d="M67 140 h12 a3 3 0 0 1 2 3 v3 h-17 v-3 a3 3 0 0 1 3 -3 z" fill="#0b1530"/>' +
      // skirt
      '<path d="M44 92 L76 92 L86 118 Q60 124 34 118 Z" fill="#fb7185" stroke="#0b1530" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M48 104 L72 104" stroke="#fda4af" stroke-width="2"/>' +
      // top with a star
      '<path d="M45 66 Q60 60 75 66 L77 94 L43 94 Z" fill="#facc15" stroke="#0b1530" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<path d="M60 72 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6 z" fill="#0b1530"/>' +
      // free arm (left on screen), pivots at the shoulder
      '<g class="tbs-arm-free"><path d="M46 70 L30 92" stroke="#f2c6a0" stroke-width="7" stroke-linecap="round"/>' +
        '<circle cx="29" cy="94" r="4.6" fill="#f2c6a0" stroke="#0b1530" stroke-width="1.6"/></g>' +
      // head
      '<g class="tbs-head">' +
        '<g class="tbs-pony"><path d="M80 34 Q100 36 98 64 Q88 54 80 46 Z" fill="#7c3aed" stroke="#0b1530" stroke-width="2.5" stroke-linejoin="round"/>' +
          '<circle cx="80" cy="36" r="4" fill="#38bdf8" stroke="#0b1530" stroke-width="2"/></g>' +
        '<rect x="56" y="52" width="8" height="10" rx="3" fill="#f2c6a0"/>' +
        '<ellipse cx="60" cy="38" rx="19" ry="20" fill="#f2c6a0" stroke="#0b1530" stroke-width="2.5"/>' +
        '<path d="M40 40 Q38 16 60 15 Q82 16 80 38 Q70 26 54 28 Q46 32 40 40 Z" fill="#7c3aed" stroke="#0b1530" stroke-width="2.5" stroke-linejoin="round"/>' +
        '<g class="tbs-eyes"><ellipse cx="52.5" cy="39" rx="2.6" ry="3.4" fill="#0b1530"/><ellipse cx="67.5" cy="39" rx="2.6" ry="3.4" fill="#0b1530"/></g>' +
        '<circle cx="48" cy="46" r="3" fill="#fb7185" opacity=".55"/><circle cx="72" cy="46" r="3" fill="#fb7185" opacity=".55"/>' +
        '<ellipse class="tbs-mouth" cx="60" cy="49" rx="4.2" ry="3.6" fill="#7f1d1d" stroke="#0b1530" stroke-width="1.4"/>' +
      '</g>' +
      // mic arm (right on screen) holding the mic up to her mouth
      '<g class="tbs-arm-mic"><path d="M74 70 L86 82 L79 72" stroke="#f2c6a0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '<g transform="rotate(-35 76 66)"><rect x="73.5" y="60" width="5" height="15" rx="2.3" fill="#1e293b" stroke="#0b1530" stroke-width="1.5"/>' +
        '<circle cx="76" cy="57" r="5.2" fill="#cbd5e1" stroke="#0b1530" stroke-width="2"/>' +
        '<path d="M72.8 55.5 h6.4 M72.6 58.4 h6.8" stroke="#64748b" stroke-width="1"/>' +
        '<circle cx="74.3" cy="55.3" r="1.3" fill="#fff"/></g>' +
        '<circle cx="78.5" cy="71.5" r="4.6" fill="#f2c6a0" stroke="#0b1530" stroke-width="1.6"/></g>' +
    '</g>' +
  '</g></svg>';

var TBS_EQ_BARS = 44;
var TBS_NOTES = 6;

/**
 * Wire the show to the lobby music.
 * opts: header (the topbar element), audio (the lobby Audio), shows (file -> map url),
 *       latencyMs (TV audio delay to wait for), fetch (for tests)
 * Returns { setMuted(bool), stop(), state() }.
 */
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
  var bounds = { left: 0, right: 0 };

  // ---- DOM ----
  var stage = document.createElement('div');
  stage.className = 'tbs-stage';
  stage.setAttribute('aria-hidden', 'true');
  var eqHtml = '';
  for (var e = 0; e < TBS_EQ_BARS; e++) eqHtml += '<i></i>';
  var notesHtml = '';
  for (var m = 0; m < TBS_NOTES; m++) notesHtml += '<span class="tbs-note">' + (m % 2 ? '♫' : '♪') + '</span>';
  stage.innerHTML =
    '<div class="tbs-wash"></div>' +
    '<div class="tbs-spot tbs-spot-l"></div><div class="tbs-spot tbs-spot-r"></div>' +
    '<div class="tbs-sweep"></div>' +
    '<div class="tbs-eq">' + eqHtml + '</div>' +
    '<div class="tbs-beatline"></div>' +
    '<div class="tbs-ring"></div>' +
    notesHtml +
    '<div class="tbs-chip"><span class="tbs-chip-note">♪</span><span class="tbs-chip-title"></span>' +
      '<span class="tbs-chip-dots"><i></i><i></i><i></i><i></i></span></div>' +
    '<div class="tbs-singer">' + TBS_SINGER_SVG + '</div>' +
    '<div class="tbs-flash"></div>';
  header.insertBefore(stage, header.firstChild);
  var q = function (sel) { return stage.querySelector(sel); };
  var el = {
    wash: q('.tbs-wash'), spotL: q('.tbs-spot-l'), spotR: q('.tbs-spot-r'), sweep: q('.tbs-sweep'),
    eq: Array.prototype.slice.call(stage.querySelectorAll('.tbs-eq i')), beatline: q('.tbs-beatline'),
    ring: q('.tbs-ring'), notes: Array.prototype.slice.call(stage.querySelectorAll('.tbs-note')),
    chip: q('.tbs-chip'), chipTitle: q('.tbs-chip-title'), dots: Array.prototype.slice.call(stage.querySelectorAll('.tbs-chip-dots i')),
    singer: q('.tbs-singer'), root: q('.tbs-root'), body: q('.tbs-body'), head: q('.tbs-head'),
    armFree: q('.tbs-arm-free'), armMic: q('.tbs-arm-mic'), pony: q('.tbs-pony'),
    eyes: q('.tbs-eyes'), mouth: q('.tbs-mouth'), flash: q('.tbs-flash'),
  };

  function trackName() {
    var src = audio.currentSrc || audio.getAttribute('src') || '';
    try { src = decodeURIComponent(src.split('?')[0]); } catch (_) { /* keep raw */ }
    return src.slice(src.lastIndexOf('/') + 1);
  }

  // The space the singer may use: between the logo and the badges on the right.
  function measure() {
    var hr = header.getBoundingClientRect();
    var inner = header.querySelector('.max-w-7xl') || header;
    var left = inner.firstElementChild, right = inner.lastElementChild;
    var l = left ? left.getBoundingClientRect().right - hr.left + 28 : hr.width * 0.3;
    var r = right ? right.getBoundingClientRect().left - hr.left - 28 : hr.width * 0.7;
    if (r - l < 140) { l = hr.width * 0.35; r = hr.width * 0.65; }
    bounds = { left: l, right: r, width: hr.width };
    stage.style.setProperty('--tbs-left', l.toFixed(0) + 'px');
    stage.style.setProperty('--tbs-right', (hr.width - r).toFixed(0) + 'px');
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

  function frame(now) {
    raf = 0;
    if (!running || !map) return;
    var t = songTime(now);
    var loc = tbsLocate(map, t, hint);
    hint = loc.i;
    var exiting = exitAt > 0;
    var stageOn = loc.stage !== 'intro' || t > map.beats[Math.max(0, map.dropBeat - 4)];
    header.classList.toggle('tbs-open', stageOn && !exiting);

    // --- singer ---
    var pose = tbsPose(loc, reduced);
    var singerVisible = pose.show && !exiting;
    var exitLift = 0;
    if (exiting) {
      var ex = Math.min(1, (now - exitAt) / 650);
      exitLift = -170 * ex * ex;
      if (ex >= 1) { finish(); return; }
    }
    var w = bounds.right - bounds.left;
    // She travels in the drops and stays where she is otherwise.
    var spot = pose.travel != null ? pose.travel : (el.singer._x != null ? el.singer._x : 0.5);
    el.singer._x = spot;
    var px = bounds.left + w * spot;
    el.singer.style.transform = 'translate(' + px.toFixed(1) + 'px,' + (pose.y + exitLift).toFixed(1) + 'px)';
    el.singer.style.opacity = singerVisible || exiting ? '1' : '0';
    setT(el.root, 'translate(60 150) scale(' + (pose.sx * pose.flip).toFixed(3) + ' ' + pose.sy.toFixed(3) + ') rotate(' + pose.rot.toFixed(2) + ') translate(-60 -150)');
    setT(el.head, 'rotate(' + pose.head.toFixed(2) + ' 60 56)');
    setT(el.armFree, 'rotate(' + (pose.armFree + 18).toFixed(1) + ' 46 70)');
    setT(el.armMic, 'rotate(' + pose.armMic.toFixed(1) + ' 74 70)');
    setT(el.pony, 'rotate(' + pose.pony.toFixed(1) + ' 80 36)');
    setT(el.eyes, 'translate(0 39) scale(1 ' + Math.max(0.1, pose.eyes).toFixed(2) + ') translate(0 -39)');
    setT(el.mouth, 'translate(60 49) scale(1 ' + (0.35 + pose.mouth * 0.9).toFixed(2) + ') translate(-60 -49)');

    // --- the bar itself ---
    var p = loc.phase;
    var hit = Math.pow(1 - p, 3);
    var kindLevel = loc.kind === 'd' ? 1 : loc.kind === 'g' ? 0.6 : 0.32;
    var live = loc.stage === 'intro' ? 0.25 + 0.35 * Math.min(1, Math.max(0, t / Math.max(1, map.dropTime))) : kindLevel;
    var riserAmt = loc.riser ? (loc.beatInBar + p) / 4 : 0;
    stage.style.setProperty('--tbs-hit', (hit * live).toFixed(3));
    stage.style.setProperty('--tbs-live', live.toFixed(3));
    stage.style.setProperty('--tbs-riser', riserAmt.toFixed(3));
    stage.style.setProperty('--tbs-x', px.toFixed(0) + 'px');
    stage.style.setProperty('--tbs-hue', String(loc.kind === 'd' ? (loc.bar % 4) * 32 : 0));
    // Strobe on the eighths while a drop builds.
    el.wash.style.opacity = (0.35 + 0.5 * live * hit + (loc.riser && !reduced ? 0.35 * riserAmt * (Math.sin(p * Math.PI * 4) > 0 ? 1 : 0.2) : 0)).toFixed(3);
    // Light sweep across the bar, once per bar, in the drops.
    el.sweep.style.opacity = loc.kind === 'd' && !reduced ? '0.55' : '0';
    el.sweep.style.left = (((loc.beatInBar + p) / 4) * 125 - 25).toFixed(2) + '%';
    el.beatline.style.opacity = (0.25 + 0.75 * hit * live).toFixed(3);
    // Equalizer along the bottom edge: each beat deals new heights.
    for (var b = 0; b < el.eq.length; b++) {
      var r1 = tbsRand(Math.max(0, loc.i), b);
      var lvl = (0.18 + 0.82 * r1) * (0.25 + 0.75 * hit) * (0.35 + 0.65 * live) * (0.5 + 0.5 * (loc.energy || 0.3));
      el.eq[b].style.transform = 'scaleY(' + Math.max(0.04, lvl).toFixed(3) + ')';
    }
    // Spotlights lean in toward the singer and swing with the beat.
    var lean = ((px / Math.max(1, bounds.width)) - 0.5) * 40;
    var swing = loc.stage === 'intro' ? 0 : 6 * Math.sin(Math.PI * (loc.beatInBar + p) / 2);
    el.spotL.style.transform = 'rotate(' + (-24 + lean + swing).toFixed(1) + 'deg)';
    el.spotR.style.transform = 'rotate(' + (24 + lean - swing).toFixed(1) + 'deg)';
    el.spotL.style.opacity = el.spotR.style.opacity = (loc.stage === 'intro' ? 0.15 * live : 0.25 + 0.45 * live * (0.5 + 0.5 * hit)).toFixed(3);

    // The flash and shockwave: the landing, and every drop after a quieter bar.
    var flashBeat = loc.stage !== 'intro' && loc.stage !== 'fall' && (loc.sectionStart || (loc.i === map.dropBeat));
    if (flashBeat && loc.i !== lastFlashBeat && !reduced) {
      lastFlashBeat = loc.i;
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

  function restart(node, cls) {
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
      clock = { ct: -1, at: 0, base: 0, baseAt: 0 };
      measure();
      header.classList.add('tbs-on');
      stage.classList.add('tbs-stage-on');
      if (!raf) raf = requestAnimationFrame(frame);
    };
    if (maps[url]) { go(maps[url]); return; }
    doFetch(url).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m && m.beats && m.beats.length > 8) { maps[url] = m; go(m); } })
      .catch(function () {});
  }

  // Let her fly up out of the bar, then put the bar back.
  function stop() {
    if (!running) return;
    if (!exitAt) exitAt = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function finish() {
    running = false;
    exitAt = 0;
    map = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    header.classList.remove('tbs-on', 'tbs-open');
    stage.classList.remove('tbs-stage-on');
    el.singer.style.opacity = '0';
    el.singer._x = null;
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
  audio.addEventListener('seeked', function () { hint = -1; clock.baseAt = 0; });
  window.addEventListener('resize', function () { if (running) measure(); });

  return {
    setMuted: function (value) { muted = !!value; check(); },
    stop: stop,
    state: function () { return { running: running, track: trackName(), exiting: exitAt > 0 }; },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tbsBeatIndex: tbsBeatIndex, tbsLocate: tbsLocate, tbsPose: tbsPose, tbsRand: tbsRand, createTopbarShow: createTopbarShow, TBS_SHOWS: TBS_SHOWS };
}
