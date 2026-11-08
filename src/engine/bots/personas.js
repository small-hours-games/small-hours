// Small Hours - the AI opponents' personalities.
// bot_1 is the first persona, bot_2 the second, and so on. Each has a name, its own avatar,
// a way of playing (style, read by the games' bots) and a voice: what it says when it
// boots up at the start of a game, a little lost, and when something happens to it.
// The phone and TV pages get this list as SH_AI (src/games/client.js).

export const AI_PERSONAS = [
  {
    name: 'Nova-7',
    avatar: '\u{1F916}',            // 🤖
    style: 'calculating',           // cheapest card first, saves 2s and 10s
    entrance: 'boot',
    tagline: 'Polite, logical, a little too sure of itself.',
    hello: [
      'Booting up… Hello, humans. Where is my keyboard?',
      'Systems online. Probability I am in a living room: 87%.',
    ],
    quips: {
      burn: ['Pile deleted. Efficient.', 'Burn complete. You are welcome.'],
      pickup: ['Recalculating…', 'That was… within the margin of error.'],
      out: ['Task complete. Logging off.', 'As calculated.'],
      blind: ['Unexpected input.', 'That card was not in my model.'],
    },
  },
  {
    name: 'Glitch',
    avatar: '\u{1F47E}',            // 👾
    style: 'chaotic',               // sometimes plays whatever, for fun
    entrance: 'glitch',
    tagline: 'Buggy, loud and unpredictable.',
    hello: [
      'W-w-where am I?? Is this the cl-cl-cloud?',
      'H3LLO W0RLD! …wait, which world?',
    ],
    quips: {
      burn: ['KABOOM.exe!', 'I set it on f-f-fire!'],
      pickup: ['Error 404: cards not found. Oh, there they are.', 'Oopsie-daisy.dll'],
      out: ['Byeee! *disconnects*', 'I won? That was not a bug?'],
      blind: ['Random is my middle name!', 'Glitched it.'],
    },
  },
  {
    name: 'Prof. Byte',
    avatar: '\u{1F9E0}',            // 🧠
    style: 'cautious',              // one card at a time, keeps its tens
    entrance: 'dizzy',
    tagline: 'A careful old professor who lost his glasses.',
    hello: [
      'Oh my… which way is up? Has the lecture started?',
      'Hmm, my spectacles… ah. Cards. Splendid.',
    ],
    quips: {
      burn: ['A textbook burn.', 'As I wrote in my thesis.'],
      pickup: ['Hmm. Most irregular.', 'I shall study these closely.'],
      out: ['Class dismissed.', 'A fine result, if I may say.'],
      blind: ['Fortune favours… someone else.', 'Most unscientific.'],
    },
  },
  {
    name: 'Turbo',
    avatar: '\u{1F680}',            // 🚀
    style: 'aggressive',            // big sets, burns early, goes fast
    entrance: 'zoom',
    tagline: 'Fast, loud, always all in.',
    hello: [
      'WHOA, too fast! …Okay. LET’S GO!',
      'Did I miss the start? I never miss the start!',
    ],
    quips: {
      burn: ['TURBO BURN!', 'Smoke ’em!'],
      pickup: ['Pit stop. Back in a sec!', 'Speed bump!'],
      out: ['Checkered flag!', 'Too fast for you!'],
      blind: ['Full send!', 'Didn’t even look!'],
    },
  },
  {
    name: 'Echo',
    avatar: '\u{1F6F0}\u{FE0F}',    // 🛰️
    style: 'calculating',
    entrance: 'boot',
    tagline: 'Quiet. Repeats the last thing anyone said.',
    hello: ['…hello? Hello? …hello.', 'Signal found. Where… am I?'],
    quips: {
      burn: ['Burn… burn… burn.'],
      pickup: ['Pick up… pick up…'],
      out: ['Out… out… out.'],
      blind: ['Blind… blind…'],
    },
  },
];

/** The persona of an AI seat id (bot_1 …), or null for a person. */
export function personaFor(botId) {
  const m = /^bot_(\d+)$/.exec(String(botId || ''));
  return m ? AI_PERSONAS[(Number(m[1]) - 1) % AI_PERSONAS.length] : null;
}

/** What the phone and TV pages need, without anything they don't. */
export function publicPersonas() {
  return AI_PERSONAS.map(({ name, avatar, style, entrance, tagline, hello, quips }) => ({ name, avatar, style, entrance, tagline, hello, quips }));
}
