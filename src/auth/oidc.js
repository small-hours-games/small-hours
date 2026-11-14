// Small Hours - OIDC Authentication & Admin Session Management
// Uses Node 22 built-in fetch and node:crypto (Authorization Code + PKCE).

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const EPHEMERAL_SECRET = randomBytes(32).toString('hex');
const SESSION_COOKIE = 'sh_admin_session';
const TX_COOKIE = 'sh_oidc_tx';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TX_TTL_MS = 10 * 60 * 1000;

let discoveryCache = { issuer: null, doc: null, fetchedAt: 0 };

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || EPHEMERAL_SECRET;
}

export function isOidcConfigured() {
  return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
}

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signPayload(obj) {
  const payload = base64url(JSON.stringify(obj));
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function cookieFlags(req, maxAgeMs) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(isHttps ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookie(req, res, user) {
  const token = signPayload({
    sub: user.sub,
    email: user.email || '',
    name: user.name || user.email || user.sub,
    exp: Date.now() + SESSION_TTL_MS,
  });
  res.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(req, SESSION_TTL_MS)}`);
}

export function clearAdminCookies(req, res) {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.append('Set-Cookie', `${TX_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getAdminSession(req) {
  const cookies = parseCookies(req);
  const session = verifySignedToken(cookies[SESSION_COOKIE]);
  if (session && session.sub) return session;

  // Optional explicit local dev bypass when OIDC is not configured
  const devToken = process.env.ADMIN_DEV_TOKEN;
  if (devToken && !isOidcConfigured()) {
    const auth = req.headers['x-admin-dev-token'] || req.query?.devToken;
    if (auth && auth === devToken) {
      return { sub: 'dev-admin', email: 'dev@localhost', name: 'Local Dev Admin', dev: true };
    }
  }
  return null;
}

export function requireAdminSession(req, res, next) {
  const session = getAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  req.adminUser = session;
  next();
}

export function createPkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function getOidcDiscovery(issuer = process.env.OIDC_ISSUER) {
  if (!issuer) throw new Error('OIDC_ISSUER is not configured');
  const clean = issuer.replace(/\/+$/, '');
  const now = Date.now();
  if (discoveryCache.issuer === clean && discoveryCache.doc && now - discoveryCache.fetchedAt < 300_000) {
    return discoveryCache.doc;
  }
  const res = await fetch(`${clean}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  const doc = await res.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error('OIDC discovery document missing required endpoints');
  }
  discoveryCache = { issuer: clean, doc, fetchedAt: now };
  return doc;
}

export function resolveRedirectUri(req) {
  if (process.env.OIDC_REDIRECT_URI) return process.env.OIDC_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
  return `${proto}://${host}/admin/callback`;
}

export async function buildLoginRedirect(req, res) {
  const doc = await getOidcDiscovery();
  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));
  const { verifier, challenge } = createPkcePair();
  const redirectUri = resolveRedirectUri(req);

  const txToken = signPayload({ state, nonce, verifier, redirectUri, exp: Date.now() + TX_TTL_MS });
  res.append('Set-Cookie', `${TX_COOKIE}=${encodeURIComponent(txToken)}; ${cookieFlags(req, TX_TTL_MS)}`);

  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.OIDC_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', process.env.OIDC_SCOPES || 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function decodeJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function isUserAllowed(claims) {
  if (!claims || !claims.sub) return false;
  const allowedSubs = (process.env.OIDC_ALLOWED_SUBS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowedEmails = (process.env.OIDC_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!allowedSubs.length && !allowedEmails.length) return true;
  if (allowedSubs.includes(claims.sub)) return true;
  if (claims.email && allowedEmails.includes(String(claims.email).toLowerCase())) return true;
  return false;
}

export async function handleOidcCallback(req, res) {
  const { code, state, error, error_description: errorDesc } = req.query || {};
  if (error) throw new Error(errorDesc || String(error));
  if (!code || !state) throw new Error('Missing code or state');

  const cookies = parseCookies(req);
  const tx = verifySignedToken(cookies[TX_COOKIE]);
  if (!tx || tx.state !== state) throw new Error('Invalid or expired OIDC state');

  const doc = await getOidcDiscovery();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: tx.redirectUri,
    client_id: process.env.OIDC_CLIENT_ID,
    code_verifier: tx.verifier,
  });
  if (process.env.OIDC_CLIENT_SECRET) {
    body.set('client_secret', process.env.OIDC_CLIENT_SECRET);
  }

  const tokenRes = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!tokenRes.ok) {
    throw new Error(`OIDC token exchange failed (${tokenRes.status})`);
  }
  const tokens = await tokenRes.json();
  let claims = decodeJwtPayload(tokens.id_token) || {};

  if (tokens.access_token && doc.userinfo_endpoint && (!claims.email || !claims.sub)) {
    const infoRes = await fetch(doc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      claims = { ...claims, ...info };
    }
  }

  if (claims.nonce && tx.nonce && claims.nonce !== tx.nonce) {
    throw new Error('OIDC nonce mismatch');
  }
  if (!claims.sub) throw new Error('OIDC response missing subject');
  if (!isUserAllowed(claims)) throw new Error('User is not authorized for /admin');

  clearAdminCookies(req, res);
  setSessionCookie(req, res, claims);
  return claims;
}

export function resetDiscoveryCache() {
  discoveryCache = { issuer: null, doc: null, fetchedAt: 0 };
}
