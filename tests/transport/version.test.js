import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGitCommit, getBuildInfo } from '../../src/version.js';

const SHA = '2dbdd0b1c3a4e5f60718293a4b5c6d7e8f901234';
const OTHER = '8be7a044799c20d8369c868a8dfd5e3fa3fd89fb';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sh-version-'));
  mkdirSync(join(root, '.git', 'refs', 'heads'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.3.4' }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('readGitCommit', () => {
  it('follows HEAD to a loose branch ref', () => {
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(root, '.git', 'refs', 'heads', 'main'), SHA + '\n');
    expect(readGitCommit(root)).toBe(SHA);
  });

  it('falls back to packed-refs', () => {
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(root, '.git', 'packed-refs'),
      `# pack-refs with: peeled fully-peeled sorted\n${OTHER} refs/heads/other\n${SHA} refs/heads/main\n`);
    expect(readGitCommit(root)).toBe(SHA);
  });

  it('reads a detached HEAD', () => {
    writeFileSync(join(root, '.git', 'HEAD'), SHA + '\n');
    expect(readGitCommit(root)).toBe(SHA);
  });

  it('returns null without .git or for an unknown ref', () => {
    expect(readGitCommit(root)).toBeNull();
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/missing\n');
    expect(readGitCommit(root)).toBeNull();
  });
});

describe('getBuildInfo', () => {
  it('uses package.json version, the git commit and the build-time file', () => {
    writeFileSync(join(root, '.git', 'HEAD'), SHA);
    writeFileSync(join(root, '.build-time'), '2026-11-07T13:02:00Z\n');
    expect(getBuildInfo({ root, env: {} })).toEqual({
      version: '2.3.4', commit: SHA, shortCommit: '2dbdd0b', builtAt: '2026-11-07T13:02:00.000Z',
    });
  });

  it('prefers a valid GIT_SHA from the environment and ignores placeholders', () => {
    writeFileSync(join(root, '.git', 'HEAD'), SHA);
    expect(getBuildInfo({ root, env: { GIT_SHA: OTHER } }).commit).toBe(OTHER);
    expect(getBuildInfo({ root, env: { GIT_SHA: 'unknown' } }).commit).toBe(SHA);
  });

  it('degrades to dev / null when nothing is available', () => {
    rmSync(join(root, 'package.json'));
    expect(getBuildInfo({ root, env: {} })).toEqual({ version: 'dev', commit: null, shortCommit: null, builtAt: null });
  });
});
