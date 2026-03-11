'use strict';

// ─── Card Deck ────────────────────────────────────────────────────────────────

const BLACK_CARDS = [
  { text: 'My life would be complete if I just had _____.', pick: 1 },
  { text: "What's the real reason you're always late?", pick: 1 },
  { text: 'Scientists have discovered that _____ is actually good for you.', pick: 1 },
  { text: '_____: great at parties, terrible at funerals.', pick: 1 },
  { text: 'The new company policy strictly prohibits _____.', pick: 1 },
  { text: 'What do I think about in the shower?', pick: 1 },
  { text: 'Instead of sleeping, I spent the night _____.', pick: 1 },
  { text: "What's my secret superpower?", pick: 1 },
  { text: 'Studies show that most adults spend 3 hours a day _____.', pick: 1 },
  { text: 'The doctor said my condition was caused by _____.', pick: 1 },
  { text: "What's in my search history?", pick: 1 },
  { text: 'For my birthday, all I want is _____.', pick: 1 },
  { text: 'After years of research, experts agree that _____ is the meaning of life.', pick: 1 },
  { text: 'My résumé secretly lists _____ as a skill.', pick: 1 },
  { text: 'What am I explaining to HR on Monday?', pick: 1 },
  { text: 'The new blockbuster film is about _____.', pick: 1 },
  { text: 'At my funeral, please remember me for _____.', pick: 1 },
  { text: 'My biggest regret? _____.', pick: 1 },
  { text: 'How do I end every argument?', pick: 1 },
  { text: 'Why did the meeting get cancelled?', pick: 1 },
  { text: "What's the best way to break the ice?", pick: 1 },
  { text: 'I came, I saw, I _____.', pick: 1 },
  { text: 'In a shocking plot twist, _____ turned out to be the secret ingredient.', pick: 1 },
  { text: "Therapists hate this one weird trick: _____.", pick: 1 },
  { text: "According to my GPS, I'm currently lost because of _____.", pick: 1 },
  { text: "Tonight on the news: local resident arrested for _____.", pick: 1 },
  { text: "I can't believe they made a documentary about _____.", pick: 1 },
  { text: 'New app idea: Uber, but for _____.', pick: 1 },
  { text: 'The secret to a happy marriage is _____ and _____.', pick: 2 },
  { text: 'My bucket list: _____, _____, and world domination.', pick: 2 },
];

const WHITE_CARDS = [
  'Making aggressive eye contact for too long',
  'A very detailed spreadsheet',
  'Eating lunch at your desk in silence',
  'Sending a "Reply All" by accident',
  'An unsolicited thumbs up',
  'A meeting that could have been an email',
  'Synergising the core competencies',
  'A casual LinkedIn connection request',
  'Confidently mispronouncing everyone\'s name',
  'Power naps in the bathroom',
  'Aggressive positivity',
  'A strongly worded letter to no one in particular',
  'Passive-aggressive sticky notes',
  'Spending 45 minutes choosing a font',
  'Crying quietly in the parking lot',
  'Sending a follow-up to the follow-up',
  'Bringing your own seasoning to the office kitchen',
  'The world\'s longest voicemail',
  'Nodding enthusiastically while not listening at all',
  'A three-hour meeting about having fewer meetings',
  'Air quotes around the word "feedback"',
  'A vague promise to circle back',
  'Googling yourself at 2am',
  'A surprisingly emotional response to a TV commercial',
  'An unopened voicemail from 2019',
  'Stress-eating an entire bag of salad',
  'Whatever "wellness" actually means',
  'A single firm handshake',
  'Using "per my last email" passive-aggressively',
  'An unsolicited opinion from a stranger',
  'A very passionate opinion about parking',
  'Organising your desk instead of actually working',
  'Confidently giving wrong directions',
  'The moment you say "you too" to a waiter who says "enjoy your meal"',
  'A very thorough out-of-office reply',
  'Cancelling plans for no real reason',
  'Ghosting someone who definitely remembers you',
  'Falling asleep immediately in moving vehicles',
  'An extremely long recipe preamble before the actual recipe',
  'Muting yourself instead of unmuting',
  'Just vibing',
  'A suspicious amount of enthusiasm',
  'The contents of your junk drawer',
  'Pretending to understand something the second time it\'s explained',
  'Sending a text to the wrong person',
  'A joke that only you laughed at',
  'Making up a fake dietary restriction',
  'Actually reading the terms and conditions',
  'Getting a notification at the worst possible moment',
  'The look on someone\'s face when their card declines',
  'Confidently taking the wrong exit',
  'Spilling coffee on your laptop and hoping it dries by itself',
  'The voice you use when calling customer service',
  'Answering "fine" when nothing is fine',
  'A very confident wrong answer',
  'Taking a personal day for unclear reasons',
  'Accidentally starting a group chat',
  'The audacity',
  'Confidently mispronouncing a word you\'ve only ever read',
  'Loudly eating a snack during an awkward silence',
  'A vague gesture toward the future',
  'Forgetting what you were about to say mid-sentence',
  'Pretending your phone died to avoid a conversation',
  'Wearing the same outfit twice and hoping nobody notices',
  'Buying something at 3am and immediately regretting it',
  'Getting emotionally invested in a reality show you accidentally watched',
  'A firm belief that you invented something everyone else also invented',
  'Over-explaining a simple concept',
  'Showing up to a party you RSVP\'d "no" to',
  'A politely declined calendar invite',
  'Pretending to remember someone\'s name',
  'Autocorrect changing something at the absolute worst moment',
  'Replying "sounds good" to something that definitely does not sound good',
  'A six-minute video that could have been a single sentence',
  'Arriving at a social event exactly on time like a psychopath',
  'Ordering the most expensive thing on the menu to make the free lunch worthwhile',
  'Sending a meme instead of addressing your feelings',
  'A deeply unqualified life coach',
  'Having strong opinions about the correct way to load a dishwasher',
  'The look someone gives you when you say something wildly incorrect with total confidence',
];

// ─── CAHGame class ────────────────────────────────────────────────────────────

class CAHGame {
  /**
   * @param {(msg: object) => void} broadcast – sends to all connected sockets
   */
  constructor(broadcast) {
    this._broadcast = broadcast;
    this.state       = 'LOBBY';  // LOBBY | PICKING | JUDGING | ROUND_OVER | GAME_OVER
    /** @type {Map<string, {ws, hand, points}>} */
    this.players     = new Map();
    this.czarIndex   = 0;
    this.round       = 0;
    this.maxRounds   = 8;
    this.currentBlackCard = null;
    /** @type {Map<string, string[]>} username → submitted card texts */
    this.submissions = new Map();
    /** Shuffled submissions for anonymous judging: [{id, cards, username}] */
    this.shuffledSubmissions = [];
    this.whiteDeck   = [];
    this.blackDeck   = [];
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _sendTo(ws, msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _currentCzar() {
    const usernames = [...this.players.keys()];
    if (usernames.length === 0) return null;
    return usernames[this.czarIndex % usernames.length];
  }

  _replenishHands() {
    for (const [, p] of this.players) {
      while (p.hand.length < 7 && this.whiteDeck.length > 0) {
        p.hand.push(this.whiteDeck.pop());
      }
    }
  }

  _buildGameState() {
    return {
      type:           'CAH_GAME_STATE',
      state:           this.state,
      round:           this.round,
      maxRounds:       this.maxRounds,
      czar:            this._currentCzar(),
      blackCard:       this.currentBlackCard,
      submittedCount:  this.submissions.size,
      totalNonCzar:    Math.max(0, this.players.size - 1),
      players: [...this.players.entries()].map(([username, p]) => ({
        username,
        points:       p.points,
        hasSubmitted: this.submissions.has(username),
      })),
    };
  }

  _broadcastGameState() {
    this._broadcast(this._buildGameState());
  }

  _sendPlayerState(username) {
    const p = this.players.get(username);
    if (!p) return;
    this._sendTo(p.ws, {
      type:   'CAH_YOUR_STATE',
      hand:    p.hand,
      isCzar:  username === this._currentCzar(),
      points:  p.points,
    });
  }

  _broadcastPlayers() {
    const players = [...this.players.keys()].map(u => ({ username: u }));
    this._broadcast({ type: 'CAH_PLAYERS', players, playerCount: players.length });
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  addPlayer(ws, username) {
    if (!username) {
      this._sendTo(ws, { type: 'CAH_ERROR', code: 'INVALID_USERNAME', message: 'Username required.' });
      return;
    }
    if (this.players.has(username)) {
      // Reconnect
      const p = this.players.get(username);
      p.ws = ws;
      this._sendTo(ws, { type: 'CAH_JOIN_OK', username });
      this._sendPlayerState(username);
      this._sendTo(ws, this._buildGameState());
      if (this.state === 'JUDGING') {
        this._sendTo(ws, {
          type:         'CAH_JUDGING',
          submissions:   this.shuffledSubmissions.map(s => ({ id: s.id, cards: s.cards })),
          blackCard:     this.currentBlackCard,
        });
        if (username === this._currentCzar()) {
          this._sendTo(ws, {
            type:         'CAH_CZAR_JUDGE',
            submissions:   this.shuffledSubmissions.map(s => ({ id: s.id, cards: s.cards })),
            blackCard:     this.currentBlackCard,
          });
        }
      }
      return;
    }
    if (this.state !== 'LOBBY') {
      this._sendTo(ws, { type: 'CAH_ERROR', code: 'GAME_IN_PROGRESS', message: 'Game already in progress.' });
      return;
    }
    this.players.set(username, { ws, hand: [], points: 0 });
    this._sendTo(ws, { type: 'CAH_JOIN_OK', username });
    this._broadcastPlayers();
  }

  startGame(maxRounds) {
    if (this.state !== 'LOBBY' || this.players.size < 2) return;
    this.maxRounds  = Math.max(1, Math.min(20, maxRounds ?? 8));
    this.whiteDeck  = this._shuffle(WHITE_CARDS.map((text, id) => ({ id: String(id), text })));
    this.blackDeck  = this._shuffle([...BLACK_CARDS]);
    this.round      = 0;
    this.czarIndex  = 0;
    for (const [, p] of this.players) {
      p.hand   = [];
      p.points = 0;
    }
    this._replenishHands();
    this._nextRound();
  }

  _nextRound() {
    if (this.round >= this.maxRounds || this.blackDeck.length === 0) {
      this._endGame();
      return;
    }
    this.round++;
    this.currentBlackCard    = this.blackDeck.pop();
    this.submissions.clear();
    this.shuffledSubmissions  = [];
    this.state               = 'PICKING';

    this._broadcastGameState();
    for (const [username] of this.players) {
      this._sendPlayerState(username);
    }
    this._broadcast({
      type:         'CAH_NEW_ROUND',
      round:         this.round,
      maxRounds:     this.maxRounds,
      blackCard:     this.currentBlackCard,
      czar:          this._currentCzar(),
      totalNonCzar:  Math.max(0, this.players.size - 1),
    });
  }

  submitCards(username, cardIds) {
    if (this.state !== 'PICKING') return;
    const czar = this._currentCzar();
    if (username === czar) {
      const p = this.players.get(username);
      if (p) this._sendTo(p.ws, { type: 'CAH_ERROR', code: 'CZAR_CANNOT_SUBMIT', message: 'The Czar does not submit cards.' });
      return;
    }
    if (this.submissions.has(username)) return;

    const p = this.players.get(username);
    if (!p) return;

    const pick = this.currentBlackCard ? (this.currentBlackCard.pick || 1) : 1;
    if (!Array.isArray(cardIds) || cardIds.length !== pick) {
      this._sendTo(p.ws, { type: 'CAH_ERROR', code: 'WRONG_CARD_COUNT', message: `Pick exactly ${pick} card(s).` });
      return;
    }

    const cards = cardIds.map(id => p.hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== pick) {
      this._sendTo(p.ws, { type: 'CAH_ERROR', code: 'INVALID_CARDS', message: 'Invalid card selection.' });
      return;
    }

    // Remove submitted cards from hand
    p.hand = p.hand.filter(c => !cardIds.includes(c.id));
    this.submissions.set(username, cards.map(c => c.text));
    this._sendTo(p.ws, { type: 'CAH_SUBMISSION_OK' });
    this._sendPlayerState(username);
    this._broadcastGameState();

    // Check if all non-czar players have submitted
    const nonCzar = [...this.players.keys()].filter(u => u !== czar);
    if (nonCzar.length > 0 && nonCzar.every(u => this.submissions.has(u))) {
      this._startJudging();
    }
  }

  _startJudging() {
    this.state = 'JUDGING';
    const entries = [...this.submissions.entries()].map(([username, cards]) => ({ username, cards }));
    this.shuffledSubmissions = this._shuffle(entries).map((e, i) => ({ id: i, cards: e.cards, username: e.username }));

    this._broadcastGameState();
    // Broadcast anonymous submissions to all
    this._broadcast({
      type:         'CAH_JUDGING',
      submissions:   this.shuffledSubmissions.map(s => ({ id: s.id, cards: s.cards })),
      blackCard:     this.currentBlackCard,
    });
    // Send judging prompt specifically to czar
    const czar = this._currentCzar();
    const czarPlayer = this.players.get(czar);
    if (czarPlayer) {
      this._sendTo(czarPlayer.ws, {
        type:         'CAH_CZAR_JUDGE',
        submissions:   this.shuffledSubmissions.map(s => ({ id: s.id, cards: s.cards })),
        blackCard:     this.currentBlackCard,
      });
    }
  }

  czarPick(czarUsername, submissionId) {
    if (this.state !== 'JUDGING') return;
    if (this._currentCzar() !== czarUsername) {
      const p = this.players.get(czarUsername);
      if (p) this._sendTo(p.ws, { type: 'CAH_ERROR', code: 'NOT_CZAR', message: 'Only the Card Czar can pick.' });
      return;
    }

    const id = Number(submissionId);
    const submission = this.shuffledSubmissions.find(s => s.id === id);
    if (!submission) {
      const p = this.players.get(czarUsername);
      if (p) this._sendTo(p.ws, { type: 'CAH_ERROR', code: 'INVALID_SUBMISSION', message: 'Invalid submission.' });
      return;
    }

    const winner = submission.username;
    const winnerPlayer = this.players.get(winner);
    if (winnerPlayer) winnerPlayer.points++;

    this.state = 'ROUND_OVER';

    // Replenish all hands for next round
    this._replenishHands();

    this._broadcast({
      type:      'CAH_ROUND_WINNER',
      winner,
      cards:      submission.cards,
      blackCard:  this.currentBlackCard,
      scores:    [...this.players.entries()].map(([u, p]) => ({ username: u, points: p.points })),
    });

    // Advance czar for next round
    this.czarIndex = (this.czarIndex + 1) % this.players.size;

    // Automatically advance after a delay
    setTimeout(() => {
      if (this.state === 'ROUND_OVER') this._nextRound();
    }, 6000);
  }

  _endGame() {
    this.state = 'GAME_OVER';
    const scores = [...this.players.entries()]
      .map(([username, p]) => ({ username, points: p.points }))
      .sort((a, b) => b.points - a.points)
      .map((s, i) => ({ ...s, rank: i + 1 }));
    this._broadcastGameState();
    this._broadcast({ type: 'CAH_GAME_OVER', scores });
  }

  restart() {
    this.state               = 'LOBBY';
    this.round               = 0;
    this.czarIndex           = 0;
    this.currentBlackCard    = null;
    this.submissions.clear();
    this.shuffledSubmissions  = [];
    this.whiteDeck           = [];
    this.blackDeck           = [];
    for (const [, p] of this.players) {
      p.hand   = [];
      p.points = 0;
    }
    this._broadcast({ type: 'CAH_RESTARTED' });
    this._broadcastGameState();
  }

  removePlayer(ws) {
    for (const [username, p] of this.players) {
      if (p.ws === ws) {
        if (this.state === 'LOBBY') {
          this.players.delete(username);
        } else {
          p.ws = null;
        }
        break;
      }
    }
    this._broadcastPlayers();
  }

  hostConnected(ws) {
    this._sendTo(ws, { type: 'CAH_HOST_CONNECTED' });
    this._broadcastPlayers();
    this._sendTo(ws, this._buildGameState());
  }
}

module.exports = { CAHGame };
