import { describe, it, expect } from 'vitest';
import { rateLimit } from '../../src/transport/rate-limit.js';

function call(limiter, ip) {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { passed, res };
}

describe('rateLimit', () => {
  it('lets through up to max requests per window, then answers 429', () => {
    let t = 1000;
    const limiter = rateLimit({ windowMs: 60000, max: 3, now: () => t });
    for (let i = 0; i < 3; i++) expect(call(limiter, '1.2.3.4').passed).toBe(true);
    const blocked = call(limiter, '1.2.3.4');
    expect(blocked.passed).toBe(false);
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.headers['Retry-After']).toBe('60');
    expect(blocked.res.body.error).toBeTruthy();
  });

  it('counts each address on its own', () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1, now: () => 0 });
    expect(call(limiter, '1.1.1.1').passed).toBe(true);
    expect(call(limiter, '1.1.1.1').passed).toBe(false);
    expect(call(limiter, '2.2.2.2').passed).toBe(true);
  });

  it('opens again when the window has passed', () => {
    let t = 0;
    const limiter = rateLimit({ windowMs: 1000, max: 1, now: () => t });
    expect(call(limiter, '1.1.1.1').passed).toBe(true);
    expect(call(limiter, '1.1.1.1').passed).toBe(false);
    t = 1000;
    expect(call(limiter, '1.1.1.1').passed).toBe(true);
  });
});
