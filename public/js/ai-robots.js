// The AI characters as drawn robots (vector rigs) for the TV: Nova-7 walks on two legs,
// Glitch rolls on tank tracks, Prof. Byte balances on one wheel and Turbo is a rocket.
// Plain browser script exposing globals. aiRobot(name, kind) gives a character's one body;
// createAiRobot(kind) returns { el, pose(p) }:
// pose({ step, mood, wheel, boost, tilt }) moves the parts (legs, wheels, flame, eyes) by
// attribute, so the robot animates without repainting the page around it.
// kind: 'boot' (Nova-7), 'glitch', 'dizzy' (Prof. Byte), 'zoom' (Turbo): the personas' entrance.

var AI_ROBOT_SVG = {
  boot:
    '<ellipse cx="100" cy="232" rx="50" ry="7" fill="#000" opacity="0.35"/>' +
    '<g data-part="body">' +
    '<g data-part="legL"><path d="M84 174 L76 202 L84 224" stroke="#a9b6d3" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="66" y="220" width="30" height="12" rx="6" fill="#38bdf8"/></g>' +
    '<g data-part="legR"><path d="M116 174 L124 202 L116 224" stroke="#a9b6d3" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="104" y="220" width="30" height="12" rx="6" fill="#38bdf8"/></g>' +
    '<g data-part="armL"><path d="M58 116 L34 146 L40 170" stroke="#a9b6d3" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="40" cy="172" r="8" fill="#e6ecf8"/></g>' +
    '<g data-part="armR"><path d="M142 116 L166 146 L160 170" stroke="#a9b6d3" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="160" cy="172" r="8" fill="#e6ecf8"/></g>' +
    '<rect x="88" y="96" width="24" height="10" fill="#a9b6d3"/>' +
    '<rect x="58" y="104" width="84" height="70" rx="18" fill="#e6ecf8"/>' +
    '<circle cx="100" cy="132" r="15" fill="#38bdf8"/>' +
    '<text x="100" y="139" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="20" fill="#0b1530">7</text>' +
    '<g data-part="head">' +
    '<line x1="100" y1="26" x2="100" y2="8" stroke="#a9b6d3" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="8" r="7" fill="#facc15"/>' +
    '<rect x="52" y="24" width="96" height="72" rx="24" fill="#e6ecf8"/><rect x="62" y="38" width="76" height="40" rx="16" fill="#0b1530"/>' +
    '<g data-part="calm"><rect x="76" y="52" width="14" height="10" rx="5" fill="#38bdf8"/><rect x="110" y="52" width="14" height="10" rx="5" fill="#38bdf8"/>' +
    '<path d="M90 70 Q100 76 110 70" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
    '<g data-part="worried" style="display:none"><path d="M76 52 L90 56 M124 52 L110 56" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>' +
    '<circle cx="84" cy="64" r="5" fill="#38bdf8"/><circle cx="116" cy="64" r="5" fill="#38bdf8"/>' +
    '<path d="M92 73 Q100 68 108 73" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M146 40 q6 10 0 14 q-6 -4 0 -14z" fill="#7cc0fd"/></g>' +
    '</g></g>',
  glitch:
    '<ellipse cx="100" cy="232" rx="64" ry="7" fill="#000" opacity="0.35"/>' +
    '<g data-part="body">' +
    '<g data-part="ghosts"><rect x="37" y="43" width="112" height="96" rx="14" fill="#fb7185" opacity="0.55"/><rect x="51" y="37" width="112" height="96" rx="14" fill="#38bdf8" opacity="0.55"/></g>' +
    '<rect x="44" y="40" width="112" height="96" rx="14" fill="#a78bfa"/>' +
    '<path d="M86 40 L74 12 L92 6" stroke="#a78bfa" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="88" y="0" width="10" height="10" fill="#34d399"/>' +
    '<rect x="58" y="54" width="84" height="64" rx="6" fill="#0b1530"/>' +
    '<g data-part="calm"><rect x="72" y="70" width="12" height="12" fill="#34d399"/><rect x="116" y="70" width="12" height="12" fill="#34d399"/>' +
    '<path d="M80 96 h8 v4 h8 v-4 h8 v4 h8 v-4 h8" stroke="#34d399" stroke-width="5" fill="none"/></g>' +
    '<g data-part="worried" style="display:none"><rect x="70" y="72" width="16" height="6" fill="#34d399"/><rect x="114" y="72" width="16" height="6" fill="#34d399"/>' +
    '<rect x="90" y="96" width="20" height="8" fill="#34d399"/></g>' +
    '<rect x="58" y="84" width="84" height="3" fill="#a78bfa" opacity="0.6"/>' +
    '<g data-part="armL"><path d="M44 100 L22 120" stroke="#a78bfa" stroke-width="9" stroke-linecap="round"/></g>' +
    '<g data-part="armR"><path d="M156 100 L182 84" stroke="#a78bfa" stroke-width="9" stroke-linecap="round"/></g>' +
    '<rect x="70" y="136" width="60" height="34" rx="6" fill="#7c5fd6"/>' +
    '</g>' +
    '<rect x="34" y="166" width="132" height="54" rx="27" fill="#13234a" stroke="#34467a" stroke-width="4"/>' +
    '<g data-part="w1"><circle cx="62" cy="193" r="17" fill="#22335f" stroke="#a9b6d3" stroke-width="4"/><path d="M62 180 V206 M49 193 H75" stroke="#a9b6d3" stroke-width="3"/></g>' +
    '<g data-part="w2"><circle cx="100" cy="193" r="17" fill="#22335f" stroke="#a9b6d3" stroke-width="4"/><path d="M100 180 V206 M87 193 H113" stroke="#a9b6d3" stroke-width="3"/></g>' +
    '<g data-part="w3"><circle cx="138" cy="193" r="17" fill="#22335f" stroke="#a9b6d3" stroke-width="4"/><path d="M138 180 V206 M125 193 H151" stroke="#a9b6d3" stroke-width="3"/></g>',
  dizzy:
    '<ellipse cx="100" cy="232" rx="40" ry="6" fill="#000" opacity="0.35"/>' +
    '<g data-part="body">' +
    '<path d="M52 86 A48 48 0 0 1 148 86 Z" fill="#b9ddfe" opacity="0.35" stroke="#e6ecf8" stroke-width="4"/>' +
    '<g data-part="brain"><path d="M72 82 q-4 -22 14 -26 q4 -14 20 -8 q16 -8 22 8 q14 6 8 26 z" fill="#fb7185"/>' +
    '<path d="M86 60 q6 8 0 16 M104 52 q-6 10 2 20 M120 60 q-8 6 0 18" stroke="#be4b63" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
    '<rect x="48" y="86" width="104" height="14" rx="7" fill="#a9b6d3"/>' +
    '<rect x="60" y="100" width="80" height="78" rx="22" fill="#34d399"/>' +
    '<circle cx="84" cy="124" r="13" fill="#0b1530" stroke="#facc15" stroke-width="4"/><circle cx="116" cy="124" r="13" fill="#0b1530" stroke="#facc15" stroke-width="4"/>' +
    '<line x1="97" y1="124" x2="103" y2="124" stroke="#facc15" stroke-width="4"/>' +
    '<g data-part="calm"><circle cx="86" cy="126" r="4" fill="#e6ecf8"/><circle cx="118" cy="126" r="4" fill="#e6ecf8"/></g>' +
    '<g data-part="worried" style="display:none"><circle cx="84" cy="122" r="5" fill="#e6ecf8"/><circle cx="116" cy="122" r="5" fill="#e6ecf8"/></g>' +
    '<path d="M82 146 q9 -7 18 0 q9 -7 18 0 q-9 8 -18 2 q-9 6 -18 -2z" fill="#e6ecf8"/>' +
    '<path d="M88 166 L100 160 L112 166 L100 172 Z" fill="#fb7185"/>' +
    '<g data-part="armL"><path d="M60 136 L40 154" stroke="#2bb589" stroke-width="9" stroke-linecap="round"/></g>' +
    '<g data-part="armR"><path d="M140 136 L156 112" stroke="#2bb589" stroke-width="9" stroke-linecap="round"/></g>' +
    '<line x1="100" y1="178" x2="100" y2="196" stroke="#a9b6d3" stroke-width="8"/>' +
    '</g>' +
    '<g data-part="w1"><circle cx="100" cy="206" r="24" fill="#22335f" stroke="#a9b6d3" stroke-width="5"/><path d="M100 182 V230 M76 206 H124" stroke="#34467a" stroke-width="3"/><circle cx="100" cy="206" r="5" fill="#a9b6d3"/></g>',
  zoom:
    '<g data-part="flame"><path d="M84 186 Q100 250 116 186 Z" fill="#fb7185"/><path d="M90 186 Q100 228 110 186 Z" fill="#facc15"/></g>' +
    '<g data-part="body">' +
    '<path d="M60 150 L36 196 L72 180 Z" fill="#fb7185"/><path d="M140 150 L164 196 L128 180 Z" fill="#fb7185"/>' +
    '<path d="M100 10 C138 40 140 120 132 184 L68 184 C60 120 62 40 100 10 Z" fill="#e6ecf8"/>' +
    '<path d="M100 10 C118 24 126 40 130 56 L70 56 C74 40 82 24 100 10 Z" fill="#fb7185"/>' +
    '<rect x="68" y="176" width="64" height="12" rx="4" fill="#a9b6d3"/>' +
    '<circle cx="100" cy="98" r="27" fill="#13234a" stroke="#38bdf8" stroke-width="6"/>' +
    '<g data-part="calm"><circle cx="91" cy="96" r="5" fill="#facc15"/><circle cx="109" cy="96" r="5" fill="#facc15"/>' +
    '<path d="M90 108 Q100 116 110 108" stroke="#facc15" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
    '<g data-part="worried" style="display:none"><path d="M86 92 l10 8 M96 92 l-10 8 M104 92 l10 8 M114 92 l-10 8" stroke="#facc15" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="100" cy="110" r="4" fill="#facc15"/></g>' +
    '<path d="M74 140 L126 140" stroke="#38bdf8" stroke-width="6" stroke-linecap="round"/><path d="M78 156 L122 156" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" opacity="0.6"/>' +
    '<g data-part="armL"><path d="M64 120 L40 104" stroke="#a9b6d3" stroke-width="8" stroke-linecap="round"/></g>' +
    '<g data-part="armR"><path d="M136 120 L162 100" stroke="#a9b6d3" stroke-width="8" stroke-linecap="round"/></g>' +
    '</g>',
};

/** One robot, ready to place: { el, kind, pose(p) }. el is a 200×240 viewBox SVG in a span. */
function createAiRobot(kind) {
  var k = AI_ROBOT_SVG[kind] ? kind : 'boot';
  var el = document.createElement('span');
  el.className = 'ai-robot ai-robot-' + k;
  el.innerHTML = '<svg viewBox="0 0 200 240" width="100%" height="100%" aria-hidden="true" overflow="visible">' + AI_ROBOT_SVG[k] + '</svg>';
  var part = {};
  Array.prototype.forEach.call(el.querySelectorAll('[data-part]'), function (n) { part[n.getAttribute('data-part')] = n; });
  var last = {};
  function set(name, tf) {
    if (!part[name] || last[name] === tf) return;
    last[name] = tf;
    part[name].setAttribute('transform', tf);
  }
  var mood = 'calm';
  return {
    el: el,
    kind: k,
    /**
     * step: walking phase in turns (0..1 repeats); wheel: wheel angle in degrees;
     * boost: 0..1 flame size; tilt: body lean in degrees; arm: 0..1 arms up; mood: 'calm'|'worried'.
     */
    pose: function (p) {
      p = p || {};
      var tilt = p.tilt || 0, arm = p.arm || 0;
      if ((p.mood || 'calm') !== mood && part.calm && part.worried) {
        mood = p.mood || 'calm';
        part.calm.style.display = mood === 'worried' ? 'none' : '';
        part.worried.style.display = mood === 'worried' ? '' : 'none';
      }
      if (k === 'boot') {
        var s = Math.sin(2 * Math.PI * (p.step || 0));
        set('legL', 'rotate(' + (s * 22).toFixed(1) + ' 84 174)');
        set('legR', 'rotate(' + (-s * 22).toFixed(1) + ' 116 174)');
        set('armL', 'rotate(' + (-s * 16 + arm * 60).toFixed(1) + ' 58 116)');
        set('armR', 'rotate(' + (s * 16 - arm * 60).toFixed(1) + ' 142 116)');
        set('body', 'translate(0 ' + (-Math.abs(s) * 4).toFixed(1) + ') rotate(' + tilt.toFixed(1) + ' 100 224)');
        set('head', 'rotate(' + (p.look || 0).toFixed(1) + ' 100 96)');
      } else if (k === 'glitch') {
        var w = p.wheel || 0;
        set('w1', 'rotate(' + w.toFixed(0) + ' 62 193)');
        set('w2', 'rotate(' + w.toFixed(0) + ' 100 193)');
        set('w3', 'rotate(' + w.toFixed(0) + ' 138 193)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 166)');
        set('armL', 'rotate(' + (arm * 50).toFixed(1) + ' 44 100)');
        set('armR', 'rotate(' + (-arm * 40).toFixed(1) + ' 156 100)');
        set('ghosts', 'translate(' + ((p.jitter || 0) * 6).toFixed(1) + ' 0)');
      } else if (k === 'dizzy') {
        set('w1', 'rotate(' + (p.wheel || 0).toFixed(0) + ' 100 206)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 206)');
        set('brain', 'translate(0 ' + (Math.sin((p.step || 0) * 2 * Math.PI) * 2).toFixed(1) + ')');
        set('armL', 'rotate(' + (arm * 70).toFixed(1) + ' 60 136)');
        set('armR', 'rotate(' + (-arm * 30).toFixed(1) + ' 140 136)');
      } else {
        var b = 0.5 + 0.9 * Math.max(0, Math.min(1, p.boost == null ? 0.4 : p.boost));
        set('flame', 'translate(100 186) scale(' + (0.8 + 0.2 * b).toFixed(2) + ' ' + b.toFixed(2) + ') translate(-100 -186)');
        set('body', 'rotate(' + tilt.toFixed(1) + ' 100 120)');
        set('armL', 'rotate(' + (arm * 40).toFixed(1) + ' 64 120)');
        set('armR', 'rotate(' + (-arm * 40).toFixed(1) + ' 136 120)');
      }
    },
  };
}

/**
 * The one body of a character: made the first time it is asked for, then the same element
 * wherever the character appears (topbar dancer, Board Crash, game intro), so a robot can
 * never be on screen twice. key: the persona's name; kind: its rig.
 */
var AI_ROBOT_CAST = {};
function aiRobot(key, kind) {
  var r = AI_ROBOT_CAST[key];
  if (!r) {
    r = AI_ROBOT_CAST[key] = createAiRobot(kind || key);
    r.key = key;
    r.el.setAttribute('data-actor', key);
  }
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AI_ROBOT_SVG: AI_ROBOT_SVG, aiRobot: aiRobot };
}
