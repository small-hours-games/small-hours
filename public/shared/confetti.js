/* ═══════════════════════════════════════════════════════════════════════════
   Game Night — Confetti & Particle System (Canvas-based, zero dependencies)
   ═══════════════════════════════════════════════════════════════════════════ */

window.GNConfetti = (() => {
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animFrame = null;

  const COLORS = [
    '#ff8906', '#e53170', '#00eaff', '#7f5af0', '#2cb67d',
    '#ffd700', '#ff6b6b', '#4ecdc4', '#a855f7', '#fb923c'
  ];

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'gn-confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function animate() {
    if (!ctx || particles.length === 0) {
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      animFrame = null;
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.99;
      p.rotation += p.rotationSpeed;
      p.life -= p.decay;

      if (p.life <= 0 || p.y > canvas.height + 20) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.min(1, p.life * 3);

      if (p.shape === 'rect') {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (p.shape === 'star') {
        drawStar(ctx, 0, 0, 5, p.r, p.r * 0.5, p.color);
      } else if (p.shape === 'emoji') {
        ctx.font = `${p.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
      }

      ctx.restore();
    }

    animFrame = requestAnimationFrame(animate);
  }

  function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function startAnimation() {
    if (!animFrame) animFrame = requestAnimationFrame(animate);
  }

  // ── Public effects ───────────────────────────────────────────────────────

  /** Classic confetti burst from the top */
  function burst(count = 80, originX, originY) {
    ensureCanvas();
    const cx = originX ?? canvas.width / 2;
    const cy = originY ?? canvas.height * 0.3;
    const shapes = ['rect', 'circle', 'star'];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];

      particles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        gravity: 0.12 + Math.random() * 0.08,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        life: 1,
        decay: 0.008 + Math.random() * 0.006,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 8,
        r: 3 + Math.random() * 4,
      });
    }
    startAnimation();
  }

  /** Shower from the top of the screen */
  function shower(duration = 3000, intensity = 4) {
    ensureCanvas();
    const shapes = ['rect', 'circle', 'star'];
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 50;
      if (elapsed > duration) { clearInterval(interval); return; }
      for (let i = 0; i < intensity; i++) {
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        particles.push({
          x: Math.random() * canvas.width,
          y: -10,
          vx: (Math.random() - 0.5) * 3,
          vy: 2 + Math.random() * 4,
          gravity: 0.04 + Math.random() * 0.03,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.15,
          life: 1,
          decay: 0.005 + Math.random() * 0.003,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          shape,
          w: 5 + Math.random() * 7,
          h: 4 + Math.random() * 8,
          r: 3 + Math.random() * 4,
        });
      }
      startAnimation();
    }, 50);
  }

  /** Emoji explosion (e.g., fire emojis for streaks) */
  function emojiBurst(emoji = '🔥', count = 15, originX, originY) {
    ensureCanvas();
    const cx = originX ?? canvas.width / 2;
    const cy = originY ?? canvas.height / 2;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 7;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        gravity: 0.1,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        life: 1,
        decay: 0.012 + Math.random() * 0.008,
        shape: 'emoji',
        emoji,
        size: 18 + Math.random() * 16,
      });
    }
    startAnimation();
  }

  /** Sparkle effect at a specific point */
  function sparkle(x, y, count = 12) {
    ensureCanvas();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: 0,
        life: 1,
        decay: 0.03 + Math.random() * 0.02,
        color: COLORS[Math.floor(Math.random() * 3)], // First 3 colors: orange, pink, cyan
        shape: 'star',
        r: 2 + Math.random() * 3,
      });
    }
    startAnimation();
  }

  /** Screen flash effect */
  function screenFlash(color = 'rgba(44, 182, 125, 0.3)') {
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;inset:0;background:${color};pointer-events:none;z-index:9998;opacity:1;transition:opacity 0.5s;`;
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 600);
    });
  }

  function clear() {
    particles = [];
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { burst, shower, emojiBurst, sparkle, screenFlash, clear };
})();
