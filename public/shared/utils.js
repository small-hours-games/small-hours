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

  // ── WebSocket connection helper ────────────────────────────────────────
  function connectWebSocket(roomCode, role, onMessage) {
    const wsUrl = buildWsUrl(roomCode, role);
    const ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      console.log(`[WS] Connected as ${role} to room ${roomCode}`);
    });

    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        onMessage(msg);
      } catch (err) {
        console.error('[WS] Invalid message:', evt.data, err);
      }
    });

    ws.addEventListener('error', (err) => {
      console.error('[WS] Error:', err);
    });

    ws.addEventListener('close', () => {
      console.log('[WS] Disconnected');
    });

    return ws;
  }

  // ── DOM helpers ────────────────────────────────────────────────────────
  function showElement(el) {
    if (el) el.style.display = '';
  }

  function hideElement(el) {
    if (el) el.style.display = 'none';
  }

  function toggleClass(el, className) {
    if (el) el.classList.toggle(className);
  }

  function setClass(el, className, condition) {
    if (el) {
      if (condition) el.classList.add(className);
      else el.classList.remove(className);
    }
  }

  // ── Notification helper ────────────────────────────────────────────────
  function notify(message, type = 'info', duration = 3000) {
    const notif = el('div', `notification notification-${type}`, message);
    notif.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === 'success' ? 'var(--correct)' : type === 'error' ? 'var(--wrong)' : 'var(--accent)'};
      color: white;
      padding: 12px 20px;
      border-radius: var(--radius-md);
      z-index: 1100;
      animation: slideUp 300ms ease-out;
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
  }

  return {
    AVATARS, nameToAvatar, esc, haptic,
    fmtScore, ordinal, ANS_COLORS, RANK_MEDALS, rankDisplay,
    buildWsUrl, connectWebSocket, el, sleep, animateNumber, getRoomCode,
    showElement, hideElement, toggleClass, setClass, notify
  };
})();
