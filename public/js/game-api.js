// The contract between the phone/TV pages and the game plugins (games/<id>/client/).
// A plugin is a plain script that calls SH.registerGame(id, { ... }). It may use the
// page's globals: state, send, escapeHtml, showToast, and audio on the TV.
//
// Phone: section (element id), render(msg), and optionally onEnter(), reset(),
//        redraw() (after a resize, an error or a setting), lobbyOptions(),
//        startConfig(), startLabel().
// TV:    render(msg), and optionally onEnter(msg), onLeave(msg), onMute(muted),
//        scoreboard(msg, { names, ids, scores }) -> { entries?, roundLabel? },
//        alwaysScoreboard (show it even before the game has scores).
var SH_PLUGINS = {};
var SH = {
  registerGame: function (id, plugin) { SH_PLUGINS[id] = plugin; },
  aliasGame: function (id, baseId) { if (SH_PLUGINS[baseId]) SH_PLUGINS[id] = SH_PLUGINS[baseId]; },
  game: function (id) { return SH_PLUGINS[id] || null; },
  eachGame: function (fn) { Object.keys(SH_PLUGINS).forEach(function (id) { fn(SH_PLUGINS[id], id); }); },
  // Set by the TV page: lower the game music while a voice speaks.
  duckMusic: function () {},
  // The character behind an AI seat (bot_1 …) from SH_AI (src/engine/bots/personas.js), or null.
  aiPersona: function (id) {
    var m = /^bot_(\d+)$/.exec(String(id || ''));
    if (!m || typeof SH_AI === 'undefined' || !SH_AI.length) return null;
    return SH_AI[(Number(m[1]) - 1) % SH_AI.length];
  },
  // Motion/orientation permission helper (iOS requires a direct user gesture per page session).
  motionState: (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')
    ? 'prompt'
    : (typeof DeviceOrientationEvent === 'undefined' ? 'unsupported' : 'auto'),
  motionGranted: function () {
    return SH.motionState === 'auto' || SH.motionState === 'granted';
  },
  ensureMotionPermission: function () {
    if (SH.motionState !== 'prompt') return Promise.resolve(SH.motionState);
    SH.motionState = 'prompting';
    try {
      var tasks = [];
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        tasks.push(DeviceOrientationEvent.requestPermission());
      }
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        tasks.push(DeviceMotionEvent.requestPermission());
      }
      if (!tasks.length) {
        SH.motionState = 'auto';
        return Promise.resolve('auto');
      }
      return Promise.all(tasks).then(function (results) {
        var ok = results.some(function (r) { return r === 'granted'; });
        SH.motionState = ok ? 'granted' : 'denied';
        return SH.motionState;
      }, function () {
        SH.motionState = 'denied';
        return 'denied';
      });
    } catch (e) {
      SH.motionState = 'denied';
      return Promise.resolve('denied');
    }
  },
};
