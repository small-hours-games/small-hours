// Small Hours - Build information (version, commit, build time)
// Version comes from package.json. The commit comes from GIT_SHA (set by CI) or,
// for local `docker compose build` / `npm start`, from the checkout's .git refs
// (the image keeps only .git/HEAD, refs and packed-refs; see .dockerignore).
// The build time is written to .build-time by the Dockerfile.

import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA_RE = /^[0-9a-f]{7,40}$/i;

function readText(path) {
  try { return readFileSync(path, 'utf8').trim(); } catch { return null; }
}

/**
 * Resolve the commit HEAD points at, reading .git without running git.
 * Handles a detached HEAD, loose refs and packed-refs. Returns null if unknown.
 *
 * @param {string} root - repository root containing .git
 * @returns {string|null}
 */
export function readGitCommit(root) {
  const gitDir = join(root, '.git');
  const head = readText(join(gitDir, 'HEAD'));
  if (!head) return null;
  if (SHA_RE.test(head)) return head.toLowerCase();

  const ref = head.match(/^ref:\s*(\S+)$/)?.[1];
  if (!ref || ref.includes('..')) return null;

  const loose = readText(join(gitDir, ref));
  if (loose && SHA_RE.test(loose)) return loose.toLowerCase();

  const packed = readText(join(gitDir, 'packed-refs'));
  for (const line of (packed || '').split('\n')) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && SHA_RE.test(sha)) return sha.toLowerCase();
  }
  return null;
}

/**
 * Collect build information.
 *
 * @param {{root?: string, env?: object}} [opts]
 * @returns {{version: string, commit: string|null, shortCommit: string|null, builtAt: string|null}}
 */
export function getBuildInfo({ root = ROOT, env = process.env } = {}) {
  let version = 'dev';
  try {
    version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || 'dev';
  } catch { /* keep 'dev' */ }

  const envSha = (env.GIT_SHA || '').trim();
  const commit = SHA_RE.test(envSha) ? envSha.toLowerCase() : readGitCommit(root);

  const builtRaw = (env.BUILD_TIME || '').trim() || readText(join(root, '.build-time'));
  const builtAt = builtRaw && !Number.isNaN(Date.parse(builtRaw)) ? new Date(builtRaw).toISOString() : null;

  return { version, commit, shortCommit: commit ? commit.slice(0, 7) : null, builtAt };
}

// Computed once at startup: the running process never changes version.
export const BUILD_INFO = getBuildInfo();
