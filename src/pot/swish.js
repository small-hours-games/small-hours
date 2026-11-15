// Small Hours - Swish Commerce API (Swish Handel) client for pot rooms.
//
// Only used when a Swish Handel certificate is configured. Without it pot rooms
// still work: players pay with a pre-filled Swish link and the admin confirms.
//
//   SWISH_CERT_PATH        client certificate (.p12/.pfx) from the Swish certificate portal
//   SWISH_CERT_PASSPHRASE  its passphrase
//   SWISH_CA_PATH          Swish TLS root CA (.pem), optional
//   SWISH_PAYEE            the Swish Handel number the stakes are paid to (123xxxxxxx)
//   SWISH_ENV              'production' (default) or 'mss' (Merchant Swish Simulator)
//   PUBLIC_URL             https address of this server, e.g. https://quiz.aldervall.se
//
// Flow (m-commerce, https://developer.swish.nu/documentation/guides/trigger-the-swish-app):
// 1. createPaymentRequest → Swish answers with a PaymentRequestToken
// 2. the phone opens swish://paymentrequest?token=…&callbackurl=<back to the room>
// 3. Swish POSTs the result to /api/swish/callback; we never trust that body alone,
//    but fetch the payment request again over mutual TLS before letting anyone in.

import https from 'node:https';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const HOSTS = {
  production: 'cpc.getswish.net',
  mss: 'mss.cpc.getswish.net',
};

export function newInstructionId() {
  return randomUUID().replace(/-/g, '').toUpperCase();
}

export function newCallbackIdentifier() {
  return randomUUID().replace(/-/g, '');
}

/** Swish's message field: letters a-ö, digits, space and !?(),.-:; — max 50. */
export function swishMessage(text) {
  return String(text || '').replace(/[^a-zA-Z0-9åäöÅÄÖ !?(),.\-:;]/g, '').slice(0, 50);
}

/**
 * A Swish client, or null when Swish Handel is not configured.
 * `request` can be swapped in tests: (options, body) => Promise<{ status, headers, body }>.
 */
export function createSwishClient(env = process.env, { request } = {}) {
  const certPath = env.SWISH_CERT_PATH;
  const payee = String(env.SWISH_PAYEE || '').replace(/\s/g, '');
  const publicUrl = String(env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (!certPath || !payee || !publicUrl.startsWith('https://')) return null;

  const host = HOSTS[env.SWISH_ENV || 'production'] || HOSTS.production;
  let tls = null;
  const loadTls = () => {
    if (!tls) {
      tls = {
        pfx: fs.readFileSync(certPath),
        passphrase: env.SWISH_CERT_PASSPHRASE || '',
        ...(env.SWISH_CA_PATH ? { ca: fs.readFileSync(env.SWISH_CA_PATH) } : {}),
      };
    }
    return tls;
  };

  const send = request || ((options, body) => new Promise((resolve, reject) => {
    const req = https.request({ host, port: 443, ...loadTls(), ...options, timeout: 10000 }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('Swish did not answer in time')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  }));

  return {
    payee,
    publicUrl,
    callbackUrl: `${publicUrl}/api/swish/callback`,

    /** Create an m-commerce payment request. Returns { id, token, callbackIdentifier }. */
    async createPaymentRequest({ amount, message, reference }) {
      const id = newInstructionId();
      const callbackIdentifier = newCallbackIdentifier();
      const body = JSON.stringify({
        payeeAlias: payee,
        amount: Number(amount).toFixed(2),
        currency: 'SEK',
        callbackUrl: `${publicUrl}/api/swish/callback`,
        payeePaymentReference: String(reference || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 35) || undefined,
        message: swishMessage(message),
        callbackIdentifier,
      });
      const res = await send({
        method: 'PUT',
        path: `/swish-cpcapi/api/v2/paymentrequests/${id}`,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, body);
      if (res.status !== 201) {
        let detail = '';
        try { detail = JSON.parse(res.body).map(e => `${e.errorCode} ${e.errorMessage}`).join('; '); } catch { /* not JSON */ }
        throw new Error(`Swish refused the payment request (${res.status}${detail ? `: ${detail}` : ''})`);
      }
      const token = res.headers.paymentrequesttoken || res.headers.PaymentRequestToken;
      if (!token) throw new Error('Swish gave no payment token');
      return { id, token: String(token), callbackIdentifier };
    },

    /** Current status of a payment request: CREATED, PAID, DECLINED, ERROR or CANCELLED. */
    async getPaymentRequest(id) {
      if (!/^[0-9A-F]{32}$/.test(String(id))) throw new Error('Bad payment request id');
      const res = await send({ method: 'GET', path: `/swish-cpcapi/api/v1/paymentrequests/${id}` });
      if (res.status !== 200) throw new Error(`Swish status lookup failed (${res.status})`);
      const data = JSON.parse(res.body);
      return { status: data.status, amount: Number(data.amount), payeeAlias: data.payeeAlias, paymentReference: data.paymentReference || null };
    },
  };
}

/** The link that switches the phone to Swish and back to `returnUrl` afterwards. */
export function paymentRequestLink(token, returnUrl) {
  return `swish://paymentrequest?token=${encodeURIComponent(token)}&callbackurl=${encodeURIComponent(returnUrl)}`;
}

/** Pre-filled Swish link (no agreement needed): payee, amount and message locked. */
export function prefilledLink({ payee, amount, message }) {
  const data = {
    version: 1,
    payee: { value: String(payee), editable: false },
    amount: { value: Number(amount), editable: false },
    message: { value: swishMessage(message), editable: false },
  };
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`;
}

let shared;
/** The process-wide client from the environment (null when Swish Handel is off). */
export function getSwishClient() {
  if (shared === undefined) shared = createSwishClient(process.env);
  return shared;
}

/** Tests swap in a fake client. */
export function setSwishClient(client) {
  shared = client;
}
