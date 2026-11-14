// Shared TV stage helpers for the AI cast (Nova-7, Glitch, Prof. Byte, Turbo, Echo).
// Gives every card game consistent robot seat rigs, entrance animations, and quip bubbles.
(function (root) {
  'use strict';

  var bubbles = {};
  var introDone = false;

  function findSeat(id) {
    var content = document.getElementById('gameContent');
    if (!content || !id) return null;
    var esc = root.CSS && CSS.escape ? CSS.escape(id) : String(id);
    return content.querySelector('[data-player-id="' + esc + '"]');
  }

  function say(id, text, ms) {
    var seat = findSeat(id);
    if (!seat || !text) return;
    var r = seat.getBoundingClientRect();
    if (!r.width && !r.height) return;
    if (bubbles[id]) bubbles[id].remove();
    var b = document.createElement('div');
    b.className = 'ai-bubble';
    b.textContent = text;
    b.style.left = (r.left + r.width / 2).toFixed(0) + 'px';
    b.style.top = (r.top + 6).toFixed(0) + 'px';
    document.body.appendChild(b);
    bubbles[id] = b;
    setTimeout(function () {
      b.classList.add('ai-bubble-out');
      setTimeout(function () { b.remove(); }, 400);
      if (bubbles[id] === b) delete bubbles[id];
    }, ms || 2600);
  }

  function quip(id, gameKey, eventKey, seed, ms) {
    var p = root.SH && SH.aiPersona ? SH.aiPersona(id) : null;
    if (!p || !p.quips) return;
    var pool = (gameKey && p.quips[gameKey] && p.quips[gameKey][eventKey]) || p.quips[eventKey];
    if (!pool || !pool.length) return;
    var idx = Math.abs(Number(seed) || 0) % pool.length;
    say(id, pool[idx], ms);
  }

  function entrance(id, index) {
    var p = root.SH && SH.aiPersona ? SH.aiPersona(id) : null;
    var seat = findSeat(id);
    if (!p || !seat) return;
    var r = seat.getBoundingClientRect();
    if (!r.width && !r.height) return;
    var el = document.createElement('div');
    el.className = 'ai-intro ai-intro-' + (p.entrance || 'boot');
    el.style.left = (r.left + r.width / 2).toFixed(0) + 'px';
    el.style.top = (r.top + r.height / 2).toFixed(0) + 'px';
    el.setAttribute('aria-hidden', 'true');

    var face = document.createElement('div');
    face.className = 'ai-intro-face';
    var lost = document.createElement('span');
    lost.className = 'ai-intro-lost';
    lost.textContent = p.entrance === 'dizzy' ? '💫' : '❓';

    if (typeof createAiRobot === 'function') {
      face.classList.add('ai-intro-rig');
      var rig = typeof aiRobot === 'function' ? aiRobot(p.name, p.entrance || 'boot') : createAiRobot(p.entrance || 'boot');
      rig.pose({ mood: 'calm' });
      face.appendChild(rig.el);
    } else {
      face.textContent = p.avatar || '🤖';
    }
    face.appendChild(lost);

    var nameEl = document.createElement('div');
    nameEl.className = 'ai-intro-name';
    nameEl.textContent = p.name;

    el.appendChild(face);
    el.appendChild(nameEl);
    document.body.appendChild(el);
    setTimeout(function () { say(id, p.hello[index % p.hello.length], 3200); }, 900);
    setTimeout(function () { el.remove(); }, 4300);
  }

  function intro(players) {
    if (introDone) return;
    introDone = true;
    var ids = (players || []).map(function (pl) { return typeof pl === 'string' ? pl : pl.playerId; })
      .filter(function (id) { return root.SH && SH.aiPersona && SH.aiPersona(id); });
    ids.forEach(function (id, i) {
      setTimeout(function () { entrance(id, i); }, 300 + i * 850);
    });
  }

  /**
   * Mounts each bot's live SVG robot rig into a `.ai-seat-slot` (or `.tc-seat-av`) inside its seat element.
   * `moodFn(id)` can return `{ mood: 'calm'|'worried', arm: 0..1, boost: 0..1 }`.
   */
  function mountSeats(rootEl, players, moodFn) {
    if (!rootEl || typeof createAiRobot !== 'function') return;
    (players || []).forEach(function (pl) {
      var id = typeof pl === 'string' ? pl : pl.playerId;
      var p = root.SH && SH.aiPersona ? SH.aiPersona(id) : null;
      if (!p) return;
      var esc = root.CSS && CSS.escape ? CSS.escape(id) : String(id);
      var seat = rootEl.querySelector('[data-player-id="' + esc + '"]');
      if (!seat) return;
      var slot = seat.querySelector('.ai-seat-slot, .tc-seat-av');
      if (!slot) return;
      slot.textContent = '';
      slot.classList.add('ai-seat-rig');
      var rig = typeof aiRobot === 'function' ? aiRobot(p.name, p.entrance || 'boot') : createAiRobot(p.entrance || 'boot');
      var pose = typeof moodFn === 'function' ? (moodFn(id) || { mood: 'calm' }) : { mood: 'calm' };
      rig.pose(pose);
      slot.appendChild(rig.el);
    });
  }

  function reset() {
    introDone = false;
    Object.keys(bubbles).forEach(function (k) {
      if (bubbles[k]) bubbles[k].remove();
      delete bubbles[k];
    });
    document.querySelectorAll('.ai-bubble, .ai-intro').forEach(function (el) { el.remove(); });
  }

  root.SH = root.SH || {};
  root.SH.aiStage = {
    say: say,
    quip: quip,
    intro: intro,
    mountSeats: mountSeats,
    reset: reset,
  };
})(window);
