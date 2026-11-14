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
      gin: {
        knock: ['Deadwood within tolerance. Knocking.', 'Optimal moment to knock.'],
        gin: ['Zero deadwood. Pure precision.', 'Gin. As modeled.'],
        undercut: ['Undercut detected. Thank you for the bonus.'],
        drawDiscard: ['That card completes my sequence.'],
      },
      holdem: {
        raise: ['Adjusting pot odds upward.', 'Statistically, I like my hand.'],
        allIn: ['Maximum commitment. Run the simulation.'],
        fold: ['Negative EV. Folding.', 'Disengaging from this pot.'],
        win: ['Expected value realized.', 'Probability favours the patient.'],
      },
      sjuan: {
        play: ['Extending the sequence.', 'Logical placement.'],
        draw: ['Acquiring additional data.', 'Drawing one.'],
        stuck: ['No valid branches remain.'],
        out: ['Hand cleared. Efficient.', 'Zero cards remaining.'],
      },
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
      gin: {
        knock: ['KNOCK KNOCK! Who’s there? My melds!', 'Ship it! Knocking!'],
        gin: ['GIN!! Did I break the deck?!', 'Zero deadwood.exe!'],
        undercut: ['YOINK! Undercut!!'],
        drawDiscard: ['Ooooh, shiny! Mine now!'],
      },
      holdem: {
        raise: ['B-b-bump it up!', 'Why? Because chaos!'],
        allIn: ['ALL THE CHIPS! YOLO.exe!'],
        fold: ['Noping out!', 'Crash! Rebooting next hand.'],
        win: ['Wait, that worked?!', 'Glitched straight to the pot!'],
      },
      sjuan: {
        play: ['Boop! Fits right there!', '7-up! Wait, wrong game.'],
        draw: ['More cards = more fun, right?'],
        stuck: ['404: playable card not found.'],
        out: ['Byeee! *disconnects*', 'I won? That was not a bug?'],
      },
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
      gin: {
        knock: ['I believe that concludes my research. Knock!', 'Low deadwood, just as taught.'],
        gin: ['A flawless Gin! Take notes, class.'],
        undercut: ['Ah! A classic undercut.'],
        drawDiscard: ['Precisely the specimen I needed.'],
      },
      holdem: {
        raise: ['A measured wager.', 'Let us test your hypothesis.'],
        allIn: ['I stake my entire tenure on this!'],
        fold: ['Discretion is the better part of valour.', 'Too rich for my grant.'],
        win: ['Peer-reviewed victory!', 'Just as I deduced.'],
      },
      sjuan: {
        play: ['Orderly, as it should be.', 'Right on the seven.'],
        draw: ['Back to the library for another card.'],
        stuck: ['A temporary impasse.'],
        out: ['Class dismissed.', 'A fine result, if I may say.'],
      },
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
      gin: {
        knock: ['Too slow! Knocking NOW!', 'Pedal to the metal — KNOCK!'],
        gin: ['GIN! New lap record!'],
        undercut: ['Overtaken on the inside! Undercut!'],
        drawDiscard: ['Grab and go!'],
      },
      holdem: {
        raise: ['Raise! Keep up!', 'More gas!'],
        allIn: ['FULL THROTTLE! ALL IN!'],
        fold: ['Braking hard. Next hand!'],
        win: ['VROOM! Ship the pot!', 'First across the line!'],
      },
      sjuan: {
        play: ['Snap! Next!', 'Full speed!'],
        draw: ['Quick pit stop.'],
        stuck: ['Out of fuel!'],
        out: ['Checkered flag!', 'Too fast for you!'],
      },
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
      gin: {
        knock: ['Knock… knock…'],
        gin: ['Gin… gin… gin.'],
        undercut: ['Undercut… cut…'],
        drawDiscard: ['Mine… mine…'],
      },
      holdem: {
        raise: ['Raise… raise…'],
        allIn: ['All in… in… in…'],
        fold: ['Fold… fold…'],
        win: ['Pot… pot… pot.'],
      },
      sjuan: {
        play: ['Play… play…'],
        draw: ['Draw… draw…'],
        stuck: ['Stuck… stuck…'],
        out: ['Out… out… out.'],
      },
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
