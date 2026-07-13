import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGift, getGift, giftUrl, gameLabel } from '../../src/session/gifts.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GIFTS_FILE = path.resolve(__dirname, '../../data/gifts.json');

describe('gifts store', () => {
  afterEach(() => {
    // clean up persisted gifts between tests
    if (fs.existsSync(GIFTS_FILE)) fs.unlinkSync(GIFTS_FILE);
  });

  it('createGift returns a token + url and persists the gift', () => {
    const { token, url, gift } = createGift({ roomCode: 'ABCD', winnerId: 'alice', gameType: 'hilow', winnerName: 'Alice' });
    expect(token).toMatch(/^gift_/);
    expect(url).toContain('/gift/' + token);
    expect(gift.roomCode).toBe('ABCD');
    expect(gift.winnerId).toBe('alice');
    expect(gift.gameType).toBe('hilow');
    // persisted
    const fetched = getGift(token);
    expect(fetched).not.toBeNull();
    expect(fetched.winnerName).toBe('Alice');
  });

  it('getGift returns null for unknown token', () => {
    expect(getGift('gift_doesnotexist')).toBeNull();
  });

  it('giftUrl respects DOMAIN env or falls back to localhost', () => {
    const prev = process.env.DOMAIN;
    delete process.env.DOMAIN;
    expect(giftUrl('gift_abc')).toBe('https://localhost:3001/gift/gift_abc');
    process.env.DOMAIN = 'quiz.example.com';
    expect(giftUrl('gift_abc')).toBe('https://quiz.example.com/gift/gift_abc');
    if (prev === undefined) delete process.env.DOMAIN; else process.env.DOMAIN = prev;
  });

  it('gameLabel maps known game types', () => {
    expect(gameLabel('hilow')).toBe('Högt/Lågt');
    expect(gameLabel('quiz')).toBe('Quiz');
    expect(gameLabel('unknown')).toBe('unknown');
  });
});
