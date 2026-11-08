// The AI seats are characters: their own name and face, and their own way of playing.
import { describe, it, expect } from 'vitest';
import { AI_PERSONAS, personaFor, publicPersonas } from '../../src/engine/bots/personas.js';
import { choosePalaceAction } from '../../games/shithead/bot.js';
import { Room, AVATAR_POOL } from '../../src/session/room.js';

const card = (rank, suit, id) => ({ rank, suit, id });
function table(hand, pile = []) {
  return {
    phase: 'play', players: ['bot_1', 'bot_2', 'bot_3', 'bot_4'], currentPlayerIndex: 0,
    hands: {}, faceUp: {}, faceDown: {}, pile, drawPile: [], swapConfirmed: {},
    _hand: hand,
  };
}
const as = (botId, t) => {
  const s = { ...t, currentPlayerIndex: t.players.indexOf(botId), hands: { [botId]: t._hand }, faceUp: { [botId]: [] }, faceDown: { [botId]: [] } };
  return choosePalaceAction(s, botId);
};

describe('AI characters', () => {
  it('each has a name, a face no player can have, a style and lines to say', () => {
    const four = AI_PERSONAS.slice(0, 4);
    expect(new Set(four.map(p => p.name)).size).toBe(4);
    expect(new Set(four.map(p => p.avatar)).size).toBe(4);
    four.forEach(p => {
      expect(AVATAR_POOL).not.toContain(p.avatar);
      expect(p.hello.length).toBeGreaterThan(0);
      ['burn', 'pickup', 'out', 'blind'].forEach(k => expect(p.quips[k].length).toBeGreaterThan(0));
    });
    expect(personaFor('bot_2').name).toBe('Glitch');
    expect(personaFor('player_1')).toBeNull();
    expect(publicPersonas()[0]).toMatchObject({ name: 'Nova-7', avatar: '🤖' });
  });

  it('sits at the table with its own name and avatar', async () => {
    const room = new Room('ABCD');
    room.addPlayer('Anna');
    await room.startGame('shithead', { bots: 4 });
    expect(room.bots.map(b => [b.username, b.avatar])).toEqual(AI_PERSONAS.slice(0, 4).map(p => [p.name, p.avatar]));
  });

  it('plays in its own style from the same hand', () => {
    const hand = [card(4, 'h', 'a'), card(4, 's', 'b'), card(9, 'c', 'c'), card(9, 'd', 'd'), card(9, 'h', 'e'), card(10, 's', 't')];
    const pile = [card(3, 'c', 'p1'), card(3, 'd', 'p2'), card(5, 'h', 'p3'), card(3, 's', 'p4')];
    const t = table(hand, pile);
    expect(as('bot_1', t).cardIds).toEqual(['a', 'b']);       // Nova-7: cheapest rank, all of it
    expect(as('bot_3', t).cardIds).toEqual(['a']);            // Prof. Byte: one card at a time
    expect(as('bot_4', t).cardIds).toEqual(['t']);            // Turbo: a pile of four is worth burning
    const small = table(hand, [card(3, 'c', 'p1')]);
    expect(as('bot_4', small).cardIds).toEqual(['c', 'd', 'e']); // otherwise its biggest set
  });
});
