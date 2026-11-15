// Small Hours — Unified SVG Character & Avatar System
// Maps every lobby avatar (AVATAR_POOL) and AI persona to a vibrant, expressive
// vector character badge, color palette, and 3D CanvasTexture for TV & phone games.
(function () {
  'use strict';

  var AVATAR_SPECS = {
    '\u{1F98A}': { id: 'fox',       name: 'Fox',       bg: '#ea580c', accent: '#fed7aa', rim: '#fb923c', ear: 'pointed', face: 'snout',   cheek: '#fdba74' },
    '\u{1F438}': { id: 'frog',      name: 'Frog',      bg: '#16a34a', accent: '#bbf7d0', rim: '#4ade80', ear: 'dome',    face: 'wide',    cheek: '#86efac' },
    '\u{1F43C}': { id: 'panda',     name: 'Panda',     bg: '#1e293b', accent: '#f8fafc', rim: '#94a3b8', ear: 'round',   face: 'panda',   cheek: '#fda4af' },
    '\u{1F981}': { id: 'lion',      name: 'Lion',      bg: '#d97706', accent: '#fef08a', rim: '#fbbf24', ear: 'mane',    face: 'snout',   cheek: '#fde047' },
    '\u{1F42F}': { id: 'tiger',     name: 'Tiger',     bg: '#f97316', accent: '#ffedd5', rim: '#fdba74', ear: 'round',   face: 'striped', cheek: '#fed7aa' },
    '\u{1F98B}': { id: 'butterfly', name: 'Butterfly', bg: '#7c3aed', accent: '#ddd6fe', rim: '#a78bfa', ear: 'antennae',face: 'cute',    cheek: '#f0abfc' },
    '\u{1F428}': { id: 'koala',     name: 'Koala',     bg: '#64748b', accent: '#e2e8f0', rim: '#94a3b8', ear: 'fluffy',  face: 'koala',   cheek: '#fda4af' },
    '\u{1F427}': { id: 'penguin',   name: 'Penguin',   bg: '#0f172a', accent: '#f8fafc', rim: '#38bdf8', ear: 'none',    face: 'beak',    cheek: '#7dd3fc' },
    '\u{1F984}': { id: 'unicorn',   name: 'Unicorn',   bg: '#db2777', accent: '#fce7f3', rim: '#f472b6', ear: 'horn',    face: 'cute',    cheek: '#f9a8d4' },
    '\u{1F419}': { id: 'octopus',   name: 'Octopus',   bg: '#e11d48', accent: '#fecdd3', rim: '#fb7185', ear: 'tentacle',face: 'cute',    cheek: '#fda4af' },
    '\u{1F996}': { id: 'dino',      name: 'Dino',      bg: '#059669', accent: '#a7f3d0', rim: '#34d399', ear: 'spikes',  face: 'wide',    cheek: '#6ee7b7' },
    '\u{1F43B}': { id: 'bear',      name: 'Bear',      bg: '#92400e', accent: '#fde68a', rim: '#d97706', ear: 'round',   face: 'snout',   cheek: '#fca5a5' },
    '\u{1F980}': { id: 'crab',      name: 'Crab',      bg: '#dc2626', accent: '#fecaca', rim: '#f87171', ear: 'claws',   face: 'wide',    cheek: '#fca5a5' },
    '\u{1F9A9}': { id: 'flamingo',  name: 'Flamingo',  bg: '#ec4899', accent: '#fbcfe8', rim: '#f472b6', ear: 'plume',   face: 'beak',    cheek: '#f9a8d4' },
    '\u{1F42C}': { id: 'dolphin',   name: 'Dolphin',   bg: '#0284c7', accent: '#bae6fd', rim: '#38bdf8', ear: 'fin',     face: 'cute',    cheek: '#7dd3fc' },
    '\u{1F9DD}': { id: 'elf',       name: 'Elf',       bg: '#0d9488', accent: '#ccfbf1', rim: '#2dd4bf', ear: 'elf',     face: 'cute',    cheek: '#99f6e4' },
    '\u{1F994}': { id: 'hedgehog',  name: 'Hedgehog',  bg: '#78350f', accent: '#fef3c7', rim: '#b45309', ear: 'spikes',  face: 'snout',   cheek: '#fda4af' },
    '\u{1F9A6}': { id: 'otter',     name: 'Otter',     bg: '#b45309', accent: '#fde68a', rim: '#f59e0b', ear: 'round',   face: 'snout',   cheek: '#fcd34d' },
    '\u{1F99C}': { id: 'parrot',    name: 'Parrot',    bg: '#15803d', accent: '#fef08a', rim: '#22c55e', ear: 'plume',   face: 'beak',    cheek: '#f87171' },
    '\u{1F433}': { id: 'whale',     name: 'Whale',     bg: '#1d4ed8', accent: '#dbeafe', rim: '#60a5fa', ear: 'spout',   face: 'wide',    cheek: '#93c5fd' },
    // AI Personas
    '\u{1F916}': { id: 'bot-nova',  name: 'Nova-7',    bg: '#334155', accent: '#38bdf8', rim: '#0ea5e9', ear: 'antennae',face: 'visor',   cheek: '#38bdf8' },
    '\u{1F47E}': { id: 'bot-glitch',name: 'Glitch',    bg: '#6d28d9', accent: '#e879f9', rim: '#c084fc', ear: 'antennae',face: 'pixel',   cheek: '#f472b6' },
    '\u{1F9E0}': { id: 'bot-brain', name: 'Cortex',    bg: '#be185d', accent: '#fbcfe8', rim: '#f472b6', ear: 'none',    face: 'visor',   cheek: '#f9a8d4' },
    '\u{1F680}': { id: 'bot-rocket',name: 'Boost',     bg: '#b91c1c', accent: '#fef08a', rim: '#f97316', ear: 'fin',     face: 'visor',   cheek: '#fbbf24' },
    '\u{1F6F0}\u{FE0F}': { id: 'bot-sat', name: 'Orbiter', bg: '#0f766e', accent: '#99f6e4', rim: '#14b8a6', ear: 'antennae', face: 'visor', cheek: '#2dd4bf' },
  };

  var DEFAULT_SPEC = { id: 'guest', name: 'Player', bg: '#4f46e5', accent: '#e0e7ff', rim: '#818cf8', ear: 'round', face: 'cute', cheek: '#a5b4fc' };

  function normalizeAvatarKey(avatar) {
    var s = String(avatar || '').trim();
    if (AVATAR_SPECS[s]) return s;
    // Strip variation selector FE0F if needed
    var stripped = s.replace(/\uFE0F/g, '');
    for (var k in AVATAR_SPECS) {
      if (k.replace(/\uFE0F/g, '') === stripped) return k;
    }
    return s;
  }

  function avatarMeta(avatar) {
    var key = normalizeAvatarKey(avatar);
    var spec = AVATAR_SPECS[key] || DEFAULT_SPEC;
    return Object.assign({ emoji: key || '\u{1F3AE}' }, spec);
  }

  function renderEars(s) {
    switch (s.ear) {
      case 'pointed':
        return '<polygon points="22,48 30,14 52,36" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<polygon points="106,48 98,14 76,36" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<polygon points="28,44 33,22 46,36" fill="' + s.accent + '"/>' +
               '<polygon points="100,44 95,22 82,36" fill="' + s.accent + '"/>';
      case 'round':
      case 'fluffy':
        var r = s.ear === 'fluffy' ? 19 : 15;
        return '<circle cx="30" cy="34" r="' + r + '" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<circle cx="98" cy="34" r="' + r + '" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<circle cx="30" cy="34" r="' + (r * 0.55) + '" fill="' + s.accent + '"/>' +
               '<circle cx="98" cy="34" r="' + (r * 0.55) + '" fill="' + s.accent + '"/>';
      case 'dome':
        return '<circle cx="40" cy="34" r="14" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<circle cx="88" cy="34" r="14" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<circle cx="40" cy="34" r="8" fill="#ffffff"/>' +
               '<circle cx="88" cy="34" r="8" fill="#ffffff"/>' +
               '<circle cx="41" cy="34" r="4" fill="#0f172a"/>' +
               '<circle cx="89" cy="34" r="4" fill="#0f172a"/>';
      case 'mane':
        var petals = '';
        for (var i = 0; i < 10; i++) {
          var a = (i / 10) * Math.PI * 2;
          var px = 64 + Math.cos(a) * 44;
          var py = 66 + Math.sin(a) * 44;
          petals += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="15" fill="#b45309"/>';
        }
        return petals;
      case 'horn':
        return '<polygon points="24,46 32,20 48,38" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<polygon points="104,46 96,20 80,38" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<polygon points="64,6 54,34 74,34" fill="#fde047" stroke="#f59e0b" stroke-width="2.5"/>';
      case 'antennae':
        return '<line x1="46" y1="30" x2="34" y2="12" stroke="' + s.rim + '" stroke-width="4" stroke-linecap="round"/>' +
               '<line x1="82" y1="30" x2="94" y2="12" stroke="' + s.rim + '" stroke-width="4" stroke-linecap="round"/>' +
               '<circle cx="34" cy="12" r="6" fill="' + s.accent + '"/>' +
               '<circle cx="94" cy="12" r="6" fill="' + s.accent + '"/>';
      case 'spikes':
        return '<polygon points="44,28 52,10 60,26" fill="' + s.rim + '"/>' +
               '<polygon points="58,25 64,6 70,25" fill="' + s.accent + '"/>' +
               '<polygon points="68,26 76,10 84,28" fill="' + s.rim + '"/>';
      case 'plume':
        return '<path d="M64,26 C56,8 78,6 72,26" fill="' + s.rim + '" stroke="' + s.accent + '" stroke-width="2.5"/>';
      case 'elf':
        return '<polygon points="24,62 6,48 28,48" fill="' + s.accent + '" stroke="' + s.rim + '" stroke-width="2.5"/>' +
               '<polygon points="104,62 122,48 100,48" fill="' + s.accent + '" stroke="' + s.rim + '" stroke-width="2.5"/>';
      case 'fin':
        return '<path d="M56,28 Q64,4 78,28 Z" fill="' + s.rim + '"/>';
      case 'claws':
        return '<circle cx="24" cy="34" r="11" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>' +
               '<circle cx="104" cy="34" r="11" fill="' + s.bg + '" stroke="' + s.rim + '" stroke-width="3"/>';
      case 'spout':
        return '<path d="M64,26 Q54,10 46,16" fill="none" stroke="' + s.accent + '" stroke-width="4" stroke-linecap="round"/>' +
               '<path d="M64,26 Q74,10 82,16" fill="none" stroke="' + s.accent + '" stroke-width="4" stroke-linecap="round"/>';
      default:
        return '';
    }
  }

  function renderFace(s) {
    if (s.face === 'visor') {
      return '<rect x="30" y="48" width="68" height="24" rx="12" fill="#0f172a" stroke="' + s.accent + '" stroke-width="3"/>' +
             '<circle cx="48" cy="60" r="5" fill="' + s.accent + '"/>' +
             '<circle cx="80" cy="60" r="5" fill="' + s.accent + '"/>' +
             '<path d="M48,84 Q64,92 80,84" fill="none" stroke="' + s.accent + '" stroke-width="3.5" stroke-linecap="round"/>';
    }
    if (s.face === 'pixel') {
      return '<rect x="38" y="50" width="12" height="12" fill="' + s.accent + '"/>' +
             '<rect x="78" y="50" width="12" height="12" fill="' + s.accent + '"/>' +
             '<rect x="44" y="76" width="40" height="8" rx="2" fill="' + s.accent + '"/>';
    }
    var eyes = s.ear === 'dome'
      ? ''
      : '<circle cx="47" cy="58" r="6.5" fill="#0f172a"/><circle cx="81" cy="58" r="6.5" fill="#0f172a"/>' +
        '<circle cx="49" cy="56" r="2.2" fill="#ffffff"/><circle cx="83" cy="56" r="2.2" fill="#ffffff"/>';

    if (s.face === 'panda') {
      eyes = '<ellipse cx="46" cy="58" rx="11" ry="9" transform="rotate(-14 46 58)" fill="#0f172a"/>' +
             '<ellipse cx="82" cy="58" rx="11" ry="9" transform="rotate(14 82 58)" fill="#0f172a"/>' +
             '<circle cx="47" cy="57" r="3.5" fill="#ffffff"/><circle cx="81" cy="57" r="3.5" fill="#ffffff"/>' +
             '<circle cx="48" cy="57" r="1.6" fill="#0f172a"/><circle cx="80" cy="57" r="1.6" fill="#0f172a"/>';
    }

    var cheeks = '<circle cx="34" cy="70" r="6" fill="' + s.cheek + '" opacity="0.55"/>' +
                 '<circle cx="94" cy="70" r="6" fill="' + s.cheek + '" opacity="0.55"/>';

    var mouth = '';
    if (s.face === 'beak') {
      mouth = '<polygon points="64,62 52,74 76,74" fill="#fbbf24" stroke="#d97706" stroke-width="2"/>';
    } else if (s.face === 'snout' || s.face === 'koala') {
      mouth = '<ellipse cx="64" cy="76" rx="17" ry="13" fill="' + s.accent + '"/>' +
              '<ellipse cx="64" cy="70" rx="6.5" ry="4.5" fill="#0f172a"/>' +
              '<path d="M56,80 Q64,86 72,80" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>';
    } else {
      mouth = '<path d="M52,74 Q64,85 76,74" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round"/>';
    }

    var stripes = s.face === 'striped'
      ? '<path d="M54,28 L58,40 M64,26 L64,40 M74,28 L70,40" stroke="#7c2d12" stroke-width="3.5" stroke-linecap="round"/>'
      : '';

    var headFill = s.face === 'panda' ? '#f8fafc' : s.bg;
    if (s.face === 'panda') {
      return '<circle cx="64" cy="66" r="38" fill="' + headFill + '" stroke="' + s.rim + '" stroke-width="3.5"/>' +
             eyes + cheeks + mouth;
    }

    var muzzlePatch = (s.id === 'penguin' || s.id === 'orca')
      ? '<ellipse cx="64" cy="72" rx="26" ry="24" fill="' + s.accent + '"/>'
      : '';

    return '<circle cx="64" cy="66" r="38" fill="' + headFill + '" stroke="' + s.rim + '" stroke-width="3.5"/>' +
           muzzlePatch + stripes + cheeks + eyes + mouth;
  }

  var svgCache = {};
  var urlCache = {};
  var texCache = {};

  function avatarSvg(avatar, opts) {
    opts = opts || {};
    var key = normalizeAvatarKey(avatar);
    var size = opts.size || 48;
    var cls = opts.className ? ' class="' + opts.className + '"' : '';
    var cacheKey = key;
    if (!svgCache[cacheKey]) {
      var s = avatarMeta(key);
      svgCache[cacheKey] =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="' + s.name + '">' +
          '<defs><radialGradient id="shg-' + s.id + '" cx="35%" cy="30%" r="70%">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>' +
            '<stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>' +
          '</radialGradient></defs>' +
          renderEars(s) +
          renderFace(s) +
          '<circle cx="64" cy="66" r="38" fill="url(#shg-' + s.id + ')" pointer-events="none"/>' +
        '</svg>';
    }
    return svgCache[cacheKey].replace('<svg ', '<svg width="' + size + '" height="' + size + '"' + cls + ' ');
  }

  function avatarDataUrl(avatar) {
    var key = normalizeAvatarKey(avatar);
    if (!urlCache[key]) {
      urlCache[key] = 'data:image/svg+xml;utf8,' + encodeURIComponent(avatarSvg(key, { size: 128 }));
    }
    return urlCache[key];
  }

  function avatarTexture(THREE, avatar) {
    var key = normalizeAvatarKey(avatar);
    if (texCache[key]) return texCache[key];
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var s = avatarMeta(key);
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    var img = new Image();
    img.onload = function () {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = s.bg;
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
      tex.needsUpdate = true;
    };
    img.src = avatarDataUrl(key);
    texCache[key] = tex;
    return tex;
  }

  var threePromise = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!threePromise) {
      threePromise = import('/vendor/three/three.module.min.js').then(function (mod) {
        window.THREE = mod;
        return mod;
      });
    }
    return threePromise;
  }

  if (typeof SH !== 'undefined') {
    SH.avatarMeta = avatarMeta;
    SH.avatarSvg = avatarSvg;
    SH.avatarDataUrl = avatarDataUrl;
    SH.avatarTexture = avatarTexture;
    SH.loadThree = loadThree;
  }
})();
