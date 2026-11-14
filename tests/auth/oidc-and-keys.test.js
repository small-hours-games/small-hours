import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createPkcePair,
  isUserAllowed,
  verifySignedToken,
  setSessionCookie,
  getAdminSession,
  buildLoginRedirect,
  handleOidcCallback,
  resetDiscoveryCache,
} from '../../src/auth/oidc.js';
import {
  createApiKey,
  listApiKeys,
  verifyApiKey,
  revokeApiKey,
} from '../../src/auth/api-keys.js';

describe('OIDC auth helpers', () => {
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetDiscoveryCache();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    globalThis.fetch = originalFetch;
    resetDiscoveryCache();
  });

  it('generates valid S256 PKCE verifier and challenge', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(40);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('enforces OIDC_ALLOWED_EMAILS and OIDC_ALLOWED_SUBS when set', () => {
    process.env.OIDC_ALLOWED_EMAILS = 'admin@example.com';
    expect(isUserAllowed({ sub: 'u1', email: 'ADMIN@example.com' })).toBe(true);
    expect(isUserAllowed({ sub: 'u2', email: 'stranger@example.com' })).toBe(false);
    delete process.env.OIDC_ALLOWED_EMAILS;
    expect(isUserAllowed({ sub: 'u2', email: 'anyone@example.com' })).toBe(true);
  });

  it('signs and verifies admin session cookies and rejects tampering', () => {
    const cookies = [];
    const req = { headers: { host: 'localhost:3001' }, secure: false };
    const res = { append: (_name, val) => cookies.push(val) };
    setSessionCookie(req, res, { sub: 'sub-1', email: 'a@b.se', name: 'Alice' });
    expect(cookies.length).toBe(1);
    const rawCookie = cookies[0].split(';')[0];
    const session = getAdminSession({ headers: { cookie: rawCookie } });
    expect(session.sub).toBe('sub-1');
    expect(session.email).toBe('a@b.se');

    const tampered = rawCookie.replace('sh_admin_session=', 'sh_admin_session=x');
    expect(getAdminSession({ headers: { cookie: tampered } })).toBeNull();
    expect(verifySignedToken('bad.token')).toBeNull();
  });

  it('performs OIDC discovery, login redirect, and PKCE callback exchange', async () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client-123';
    process.env.OIDC_CLIENT_SECRET = 'secret-456';

    globalThis.fetch = async (url) => {
      if (String(url).includes('.well-known/openid-configuration')) {
        return {
          ok: true,
          json: async () => ({
            authorization_endpoint: 'https://idp.example.com/auth',
            token_endpoint: 'https://idp.example.com/token',
          }),
        };
      }
      if (String(url) === 'https://idp.example.com/token') {
        const claims = { sub: 'oidc-user-1', email: 'owner@example.com', name: 'Owner' };
        const idToken = 'hdr.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.sig';
        return { ok: true, json: async () => ({ id_token: idToken, access_token: 'at' }) };
      }
      throw new Error('Unexpected fetch: ' + url);
    };

    const loginHeaders = [];
    const loginReq = { headers: { host: 'localhost:3001' }, protocol: 'http' };
    const loginRes = { append: (_k, v) => loginHeaders.push(v) };
    const redirectUrl = new URL(await buildLoginRedirect(loginReq, loginRes));
    expect(redirectUrl.origin + redirectUrl.pathname).toBe('https://idp.example.com/auth');
    expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const state = redirectUrl.searchParams.get('state');
    const txCookie = loginHeaders[0].split(';')[0];

    const cbHeaders = [];
    const cbReq = { query: { code: 'auth-code-1', state }, headers: { cookie: txCookie } };
    const cbRes = { append: (_k, v) => cbHeaders.push(v) };
    const claims = await handleOidcCallback(cbReq, cbRes);
    expect(claims.sub).toBe('oidc-user-1');
    expect(cbHeaders.some(h => h.startsWith('sh_admin_session='))).toBe(true);
  });
});

describe('API key store', () => {
  let tmpDir;
  let keysFile;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-keys-'));
    keysFile = path.join(tmpDir, 'api-keys.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates, verifies, lists without secrets, and revokes API keys', async () => {
    const { record, rawKey } = await createApiKey({ name: 'Test Bot', ownerSub: 'u1' }, keysFile);
    expect(rawKey.startsWith('sh_live_')).toBe(true);
    expect(record.name).toBe('Test Bot');

    const list = await listApiKeys(keysFile);
    expect(list).toHaveLength(1);
    expect(list[0].keyHash).toBeUndefined();

    const verified = await verifyApiKey(rawKey, keysFile);
    expect(verified).not.toBeNull();
    expect(verified.id).toBe(record.id);

    await revokeApiKey(record.id, keysFile);
    expect(await verifyApiKey(rawKey, keysFile)).toBeNull();
  });
});
