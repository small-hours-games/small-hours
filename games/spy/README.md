# Spy Game

A fast-paced deduction word-guessing game where one player secretly becomes the spy, others give clues, and the spy tries to guess the hidden word. Designed for the Game Night platform with real-time WebSocket synchronization across phones and TV displays.

## Game Overview

**Spy** is a social deduction game that combines strategy, wordplay, and psychology. One randomly-selected player becomes the spy but is not told the secret word. All other players know the word and must give one-word clues to help (or mislead) the spy. After each round of clues, the spy has limited time to guess what the word is. Points are awarded based on whether the spy's guess is correct, creating tension and strategic thinking about clue quality.

The game runs for **10 rounds**, with a different spy each round. Final scores are tallied across all rounds. It's perfect for parties and local game nights—quick rounds keep the energy high!

## How to Play

### Phase 1: Setup (5 seconds)

The game begins by assigning:
- A random **secret word** from the word list (visible only to non-spies and displays)
- A random **spy player** who sees the role assignment but NOT the word
- All players are notified it's time for clues

**What players see:**
- **Non-spies**: The word is displayed prominently at the top
- **Spy**: A "You are the spy!" badge with a red pulsing animation
- **Display (TV)**: Shows the word, round number, and timer

### Phase 2: Clues (30 seconds)

Non-spy players must think strategically and submit one-word clues simultaneously within 30 seconds:
- Clues should help the spy guess the word but shouldn't be too obvious (or the spy wins easily)
- Clues are broadcast in real-time to all players and the TV display
- The spy cannot submit a clue (validation on server prevents it)
- Players who don't submit a clue before time expires simply don't contribute

**What players see:**
- A text input field for entering their clue
- A countdown timer (red warning when < 5 seconds)
- Real-time list of clues submitted by other players

### Phase 3: Guess (20 seconds)

The spy has 20 seconds to read all the clues and make their guess:
- Spy submits a text guess of what they think the word is
- Non-spies watch the spy's reaction (phones show a "Guess submitted" confirmation)
- Only the spy can submit during this phase; non-spies see a waiting message

**What players see:**
- **Spy**: Text input for their guess + countdown timer
- **Non-spies**: "Waiting for spy to guess..." message
- **Display (TV)**: List of all clues + countdown timer

### Phase 4: Reveal (5 seconds)

The correct word is revealed and the spy's guess is shown:
- The word is displayed in large text on all screens
- The spy's guess appears next to it for comparison
- All players see the result: "Spy guessed correctly! ✓" or "Spy guessed wrong ✗"

**What players see:**
- The secret word in large, centered text
- The spy's guess displayed prominently
- A verdict badge (green for correct, red for wrong)

### Phase 5: Scoring (3 seconds)

Points are distributed based on the outcome:
- **Spy guessed correctly**: Spy gets +3 points, non-spies get +0
- **Spy guessed wrong**: Spy gets +0 points, each non-spy gets +1 point

The current round scores and cumulative player rankings are displayed.

### Repeat: 10 Rounds

Phases repeat for 10 complete rounds. After round 10, the game ends and final scores are shown. The player with the highest cumulative score wins!

## Scoring System

| Scenario | Spy Score | Non-Spy Score |
|----------|-----------|---------------|
| Spy guesses correctly | +3 | 0 |
| Spy guesses incorrectly | 0 | +1 each |

**Strategy Notes:**
- Non-spies benefit when the spy fails, incentivizing clever or vague clues
- The spy's challenge is reading between the lines and using context
- Scoring encourages both honest gameplay and a bit of psychological warfare

## Architecture

### Server-Side

#### `games/spy/server/game.js` — State Machine
The `SpyGame` class manages all game logic:
- **Phase Transitions**: Automatically transitions through SETUP → CLUES → GUESS → REVEAL → SCORE → (next round)
- **Phase Durations**: Configurable timings (SETUP: 5s, CLUES: 30s, GUESS: 20s, REVEAL: 5s, SCORE: 3s)
- **Round Management**: Tracks current round (1–10), word, spy, clues, guess, and scoring
- **Word Selection**: Randomly picks words from `words.json` without replacement per game
- **Spy Assignment**: Randomly selects a spy from active players each round
- **Clue Validation**: Only accepts clues from non-spies during the CLUES phase
- **Guess Validation**: Only accepts guesses from the spy during the GUESS phase
- **Scoring Logic**: Applies rules in `transitionToScore()`, updates player totals
- **State Serialization**: `getState()` returns current game state (filtered for spy-specific data)

#### `games/spy/server/index.js` — Message Handlers & Exports
Integration point between the main server and Spy game:
- **Handler: `SEND_CLUE`** — Receives clue from non-spy, broadcasts to all players/displays via `CLUE_RECEIVED`
- **Handler: `SEND_GUESS`** — Receives guess from spy, broadcasts via `GUESS_RECEIVED`
- **Game Loop** (`onStartGame`): Runs every 100ms, calls `game.update()`, broadcasts `GAME_STATE` to all players/displays
- **Route: `/api/spy/state`** — RESTful endpoint to fetch current game state (for clients catching up)
- **Exports**: `handlers`, `routes`, `onStartGame`, `publicDir` (used by main server.js)

### Frontend

#### `games/spy/public/index.html` — Player Phone UI
Mobile-optimized interface for phones:
- **Phase Containers**: Five div sections (one per phase) shown/hidden dynamically
  - `#phase-setup`: Displays role assignment (word for non-spies, "YOU ARE SPY" for spy)
  - `#phase-clues`: Text input, submit button, live clue list from others
  - `#phase-guess`: Text input for spy's guess; waiting message for non-spies
  - `#phase-reveal`: Shows word, spy's guess, verdict
  - `#phase-score`: Round points and cumulative leaderboard
- **Responsive Design**: Uses CSS Grid/Flexbox, fits phones and tablets
- **Animations**: Slide-in transitions between phases, pulsing spy badge
- **Timer Display**: Large countdown in red when < 5 seconds (warning state)
- **Status Badges**: "You are the spy!", "Waiting for spy...", etc.

#### `games/spy/public/display.html` — TV Display UI
Large-screen passive display (no user input):
- **Display Container**: Centered flex layout, optimized for 16:9 displays
- **Phase Sections**: Same five phases as player UI, showing all information
  - Shows word (even during CLUES/GUESS phases for audience)
  - Shows clues as they arrive in real-time
  - Shows spy's guess after submission
  - Shows verdict and scoring
- **Header**: Round indicator + large countdown timer
- **Clues Grid**: Displays all clues in a card-based layout (updated live)
- **No Input**: Display is passive; all interactions happen on player phones

#### `games/spy/public/spy-game.js` — Frontend Controller
Shared JavaScript module loaded by both `index.html` and `display.html`:
- **WebSocket Connection**: Connects to `/ws?room=XXXX&role=player` (or `role=display`)
- **Message Handlers**: Processes incoming messages (GAME_STATE, CLUE_RECEIVED, GUESS_RECEIVED, etc.)
- **Phase Rendering**: Updates DOM based on current phase and role (spy vs non-spy)
- **Input Handling**: Attaches event listeners to clue/guess input fields, sends via SEND_CLUE/SEND_GUESS
- **Timer Management**: Updates countdown display, applies CSS classes (warning state)
- **Data Filtering**: Hides word from spy, hides guess until reveal phase, etc.
- **State Sync**: Handles JOIN_OK to initialize player info, polls `/api/spy/state` if needed

### Data Files

#### `games/spy/data/words.json`
JSON file containing the word pool:
```json
{
  "words": [
    "penguin", "telescope", "tornado", "volcano", ..., "zebra"
  ]
}
```
- **Word Count**: 54 words (extensible)
- **Word Selection**: Random pick each round (no built-in de-duplication within a game, intentional for variety)
- **Format**: Simple array for fast access via `WORDS[Math.random() * WORDS.length]`
- **Reloaded**: At server startup from `games/spy/server/game.js`

## WebSocket Messages

### Client → Server

#### `SEND_CLUE`
```json
{
  "type": "SEND_CLUE",
  "clue": "fuzzy"
}
```
- **Sender**: Non-spy player during CLUES phase
- **Validation**: Server rejects if sender is spy or phase is not CLUES
- **Response**: Broadcasts `CLUE_RECEIVED` to all players/displays

#### `SEND_GUESS`
```json
{
  "type": "SEND_GUESS",
  "guess": "penguin"
}
```
- **Sender**: Spy player during GUESS phase
- **Validation**: Server rejects if sender is not spy or phase is not GUESS
- **Response**: Broadcasts `GUESS_RECEIVED` to all players/displays

### Server → Client (Broadcast)

#### `GAME_STATE` (sent every 100ms)
```json
{
  "type": "GAME_STATE",
  "gameState": {
    "roundNumber": 1,
    "phase": "clues",
    "timeRemaining": 25000,
    "spy": "alice",
    "word": "penguin",
    "clues": { "bob": "fluffy", "carol": "waddles" },
    "spyGuess": null,
    "spyGuessCorrect": null,
    "scores": { "alice": 0, "bob": 0, "carol": 0 },
    "gameRunning": true,
    "currentRound": 1,
    "maxRounds": 10,
    "playerScores": [
      { "username": "alice", "score": 3 },
      { "username": "bob", "score": 1 },
      { "username": "carol", "score": 1 }
    ]
  }
}
```
- **Frequency**: Every 100ms (for smooth timer updates)
- **Data Filtering** (client-side):
  - If player is spy: hide `word`
  - If phase is not REVEAL/SCORE: hide `spyGuess` and `spyGuessCorrect`

#### `CLUE_RECEIVED`
```json
{
  "type": "CLUE_RECEIVED",
  "username": "bob",
  "clue": "fluffy",
  "gameState": { ... }
}
```
- Broadcast when a non-spy submits a clue
- Includes full game state for clients to update

#### `GUESS_RECEIVED`
```json
{
  "type": "GUESS_RECEIVED",
  "username": "alice",
  "gameState": { ... }
}
```
- Broadcast when spy submits a guess
- Game state now includes `spyGuess` (still hidden from next phase's REVEAL)

## Customization Guide

### Add More Words

Edit `games/spy/data/words.json` and add new words to the array:

```json
{
  "words": [
    "penguin", "telescope", ...,
    "yourNewWord", "anotherWord"
  ]
}
```

No server restart needed—words are reloaded at startup. For hot-reload, modify `games/spy/server/game.js` to use `fs.readFileSync()` inside `initializeRound()` instead of at module load.

### Change Phase Durations

Edit `PHASE_DURATIONS` in `games/spy/server/game.js`:

```javascript
const PHASE_DURATIONS = {
  [PHASES.SETUP]: 3000,    // 3 seconds
  [PHASES.CLUES]: 45000,   // 45 seconds
  [PHASES.GUESS]: 30000,   // 30 seconds
  [PHASES.REVEAL]: 8000,   // 8 seconds
  [PHASES.SCORE]: 5000     // 5 seconds
};
```

Longer CLUES phase gives non-spies more thinking time. Shorter GUESS phase creates urgency for the spy.

### Change Scoring

Edit the `transitionToScore()` method in `games/spy/server/game.js`:

```javascript
transitionToScore() {
  const round = this.getCurrentRound();
  round.phase = PHASES.SCORE;
  round.phaseStartTime = Date.now();

  if (round.spyGuessCorrect) {
    // Spy guesses correctly
    round.scores[round.spy] = 5; // Change from 3 to 5
  } else {
    // Spy guesses wrong
    for (const username of this.players.keys()) {
      if (username !== round.spy) {
        round.scores[username] = 2; // Change from 1 to 2
      }
    }
  }

  // Update player scores
  for (const [username, points] of Object.entries(round.scores)) {
    if (this.players.has(username)) {
      this.players.get(username).score += points;
    }
  }
}
```

### Change Round Count

Edit `maxRounds` in `games/spy/server/game.js`:

```javascript
class SpyGame {
  constructor(players) {
    // ...
    this.maxRounds = 5; // Change from 10 to 5 for shorter games
  }
}
```

### Add Spycraft Themes

Extend `words.json` with themed word lists (e.g., animals, professions, movies):

```json
{
  "words": [...existing words...],
  "animals": ["penguin", "giraffe", "elephant", ...],
  "professions": ["chef", "teacher", "engineer", ...],
  "movies": ["inception", "avatar", "matrix", ...]
}
```

Then modify `initializeRound()` to pick a theme and select from it:

```javascript
initializeRound() {
  const themes = Object.keys(wordsData).filter(k => k !== 'words');
  const randomTheme = themes[Math.floor(Math.random() * themes.length)];
  const themeWords = wordsData[randomTheme];
  const word = themeWords[Math.floor(Math.random() * themeWords.length)];
  // ... rest of method
}
```

## File Structure

```
games/spy/
├── README.md                    # This file
├── package.json                 # NPM metadata
├── server/
│   ├── index.js                 # Message handlers, game loop, exports
│   └── game.js                  # SpyGame class, state machine
├── public/
│   ├── index.html               # Player phone UI
│   ├── display.html             # TV display UI
│   └── spy-game.js              # Frontend controller
└── data/
    └── words.json               # Word pool
```

## Integration with Main Server

The Spy game is integrated into the main Game Night server via:

1. **Server Registration** (`server.js`):
   ```javascript
   const spyGameModule = require('./games/spy/server');
   // Register in game types map
   ```

2. **Routes** (`server.js`):
   - `/group/:roomCode/spy` — Loads player UI (`games/spy/public/index.html`)
   - `/group/:roomCode/spy/display` — Loads TV display (`games/spy/public/display.html`)

3. **Game Selection** (`public/index.html`):
   - Add "Spy Game" option to game selection menu
   - Navigates to `/group/XXXX` with game type = 'spy'

4. **WebSocket Routing** (`server/handlers.js`):
   - Routes game-specific messages (SEND_CLUE, SEND_GUESS) to Spy game handlers
   - `START_MINI_GAME` message with `gameType: 'spy'` triggers `spyGameModule.onStartGame(room)`

## Gameplay Tips

**For Non-Spies:**
- Give clues that are relevant but not too obvious
- Watch other players' reactions—if everyone says the same thing, the spy will guess easily
- Use synonyms or associations to be subtle

**For the Spy:**
- Pay attention to the emotion and tone of clues
- Look for patterns or repeated words
- Ask yourself: "What would a normal person guess from these clues?"
- Don't let on you're confused—bluff confidence!

**For Organizers:**
- Play with 4–8 players for best gameplay (minimum 2 non-spies, 1 spy)
- With fewer players, clues are harder to hide; with more, the spy has more to parse
- Encourage fun and creativity over optimal strategy

## Troubleshooting

### Issue: Word shows to spy during CLUES phase
- **Cause**: Client-side filtering not working
- **Fix**: Check `spy-game.js` that `word` is filtered from gameState when `isSpy === true`

### Issue: Non-spy can submit clues after game ends
- **Cause**: Phase not transitioning properly
- **Fix**: Verify `game.update()` is being called every 100ms; check timer logic in `server/index.js`

### Issue: Spy's guess visible to other players before REVEAL
- **Cause**: `getState()` in `game.js` not filtering `spyGuess` correctly
- **Fix**: Ensure `spyGuess` is only included when `phase === REVEAL || phase === SCORE`

### Issue: Scores not accumulating across rounds
- **Cause**: Player score object not being updated
- **Fix**: Check that `player.score += points` is executed in `transitionToScore()`

---

**Version**: 1.0
**Last Updated**: 2026-03-05
**Maintainer**: Small Hours Games
**GitHub**: [small-hours-games/small-hours](https://github.com/small-hours-games/small-hours)
