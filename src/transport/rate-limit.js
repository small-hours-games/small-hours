// Small Hours - A small fixed-window rate limiter for HTTP routes.
// In memory, per client address; enough to stop a flood or a key-guessing loop.

export function clientIp(req) {
  const raw = req.ip || req.headers?.['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return String(raw).replace(/^::ffff:/, '');
}

/**
 * Express middleware: at most `max` requests per `windowMs` from one address.
 * Answers 429 with Retry-After once the window is full.
 */
export function rateLimit({ windowMs = 60 * 1000, max = 60, message = 'Too many requests. Try again in a moment.', now = Date.now } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  return function rateLimiter(req, res, next) {
    const t = now();
    const ip = clientIp(req);
    let entry = hits.get(ip);
    if (!entry || t >= entry.resetAt) {
      if (hits.size > 5000) {
        for (const [key, value] of hits) if (t >= value.resetAt) hits.delete(key);
        if (hits.size > 5000) hits.clear();
      }
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
