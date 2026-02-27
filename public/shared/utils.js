/* ═══════════════════════════════════════════════════════════════════════════
   Game Night — Shared Utilities
   ═══════════════════════════════════════════════════════════════════════════ */

window.GN = (() => {
  // ── Avatars ────────────────────────────────────────────────────────────
  const AVATARS = [
    '🦊','🐸','🐼','🦁','🐯','🦋','🐨','🐧','🦄','🐙',
    '🦖','🐻','🦀','🦩','🐬','🦝','🦔','🦦','🦜','🐳'
  ];

  function nameToAvatar(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
    return AVATARS[h % AVATARS.length];
  }

  // ── HTML escaping ──────────────────────────────────────────────────────
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Haptic feedback ────────────────────────────────────────────────────
  function haptic(pattern) {
    if (navigator.vibrate) {
      const patterns = {
        light: [15],
        medium: [30],
        heavy: [50],
        success: [15, 50, 30],
        error: [50, 30, 50, 30, 50],
        tick: [8],
        double: [15, 40, 15],
      };
      navigator.vibrate(patterns[pattern] || patterns.light);
    }
  }

  // ── Number formatting ─────────────────────────────────────────────────
  function fmtScore(n) {
    return n.toLocaleString();
  }

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // ── Answer color helpers ──────────────────────────────────────────────
  const ANS_COLORS = {
    A: { bg: '#e21b3c', text: '#fff' },
    B: { bg: '#1368ce', text: '#fff' },
    C: { bg: '#d89e00', text: '#222' },
    D: { bg: '#26890c', text: '#fff' },
  };

  // ── Rank helpers ──────────────────────────────────────────────────────
  const RANK_MEDALS = ['🥇', '🥈', '🥉'];

  function rankDisplay(rank) {
    if (rank <= 3) return RANK_MEDALS[rank - 1] + ` #${rank}`;
    return `#${rank}`;
  }

  // ── WebSocket helper ──────────────────────────────────────────────────
  function buildWsUrl(roomCode, role) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws?room=${roomCode}&role=${role}`;
  }

  // ── Simple element creator ────────────────────────────────────────────
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  // ── Delay / sleep ─────────────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Animated counter ──────────────────────────────────────────────────
  function animateNumber(element, from, to, duration = 600) {
    const start = performance.now();
    const diff = to - from;
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(from + diff * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ── Room code from URL ────────────────────────────────────────────────
  function getRoomCode() {
    return (location.pathname.split('/')[2] || '').toUpperCase();
  }

  return {
    AVATARS, nameToAvatar, esc, haptic,
    fmtScore, ordinal, ANS_COLORS, RANK_MEDALS, rankDisplay,
    buildWsUrl, el, sleep, animateNumber, getRoomCode
  };
})();
