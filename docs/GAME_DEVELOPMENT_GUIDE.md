# Game Development Guide

This guide explains how to add new games to Small Hours Games using the **GameController pattern**.

## Quick Start: Adding a New Game

### 1️⃣ Create the Game Server

Create `games/{gameName}/server.js`:

```javascript
const GameController = require('../../server/GameController');

class MyGameController extends GameController {
  constructor() {
    super();
    // Initialize game-specific state
  }

  start() {
    this.startTime = Date.now();
    this.transitionTo('COUNTDOWN');
  }

  tick() {
    // Called ~100ms by room
    // Update game state, handle timers, transitions
    const now = Date.now();
    switch (this.phase) {
      case 'COUNTDOWN':
        // Your phase logic
        break;
    }
  }

  getState() {
    // Return current state for broadcasting to players
    return {
      type: 'GAME_STATE',
      phase: this.phase,
      players: Array.from(this.players.values()),
      // ... game-specific state
    };
  }

  handlePlayerAction(username, action) {
    // Handle player input (answers, moves, etc.)
    const player = this.players.get(username);
    if (!player) return;
    // Process action and update player state
  }

  addPlayer(username, playerData) {
    this.players.set(username, {
      username,
      score: 0,
      ...playerData
    });
  }

  removePlayer(username) {
    this.players.delete(username);
  }

  transitionTo(newPhase) {
    this.phase = newPhase;
    this.phaseStartTime = Date.now();
  }
}

module.exports = MyGameController;
```

### 2️⃣ Create the Game UIs

Create **two** UIs — one for TV/host display, one for player phones.

**TV Display** (`games/{gameName}/host/index.html`) — shows full game board:
```html
<!DOCTYPE html>
<html>
<head>
  <title>My Game</title>
  <link rel="stylesheet" href="/shared/theme.css">
</head>
<body>
  <div id="gameBoard">
    <!-- Scoreboard, cards, board state, etc. for TV -->
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = window.location.pathname.split('/')[2];

    const ws = new WebSocket(`ws://${location.host}?room=${roomCode}&role=display`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'GAME_STATE') {
        renderDisplay(msg);  // Render full game board for TV
      }
    };

    function renderDisplay(state) {
      // Update TV display with full game state
    }
  </script>
</body>
</html>
```

**Player Phones** (`games/{gameName}/player/index.html`) — shows only player controls:
```html
<!DOCTYPE html>
<html>
<head>
  <title>My Game</title>
  <link rel="stylesheet" href="/shared/theme.css">
</head>
<body>
  <div id="playerInterface">
    <!-- Answer buttons, input forms, player's score -->
  </div>

  <script>
    const roomCode = window.location.pathname.split('/')[2];
    const username = sessionStorage.getItem(`gn-username-${roomCode}`);

    const ws = new WebSocket(`ws://${location.host}?room=${roomCode}&role=player`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'GAME_STATE') {
        renderPlayerUI(msg);  // Render only player's relevant UI
      }
    };

    function renderPlayerUI(state) {
      // Update player interface (answer options, prompts, their score)
    }

    function sendAction(action) {
      ws.send(JSON.stringify({
        type: 'ANSWER_QUESTION',  // or custom message
        ...action
      }));
    }
  </script>
</body>
</html>
```

### 3️⃣ Register Game in Handlers (Temporary)

Add your game to `server/handlers.js` `START_MINI_GAME` case:

```javascript
} else if (gameType === 'myGame') {
  room.game = new MyGameController();
  for (const [uname, p] of room.players) {
    room.game.addPlayer(uname, { score: 0 });
  }
  room.game.start();
}
```

Also update the game type validation:
```javascript
if (!['quiz', 'shithead', 'myGame', ...].includes(gameType)) break;
```

### 4️⃣ Test with npm start

```bash
npm start
# Browser: http://localhost:3000
# 1. Create room from landing page → get room code (e.g., ABCD)
# 2. Open TV/host at /host/ABCD
# 3. Open player phones at /player/ABCD
# 4. Join, suggest your game, start, and play!
```

---

## Example: Number Guess Game

See `games/guess/server.js` (GameController), `games/guess/host/index.html` (TV display), and `games/guess/player/index.html` (player phones) for a complete, working example.

### Features Demonstrated

- **State machine**: COUNTDOWN → ACTIVE → REVEAL → GAME_OVER
- **Player management**: Add/remove players, track scores
- **Real-time updates**: Broadcast game state to all players every 100ms
- **Phase timers**: Automatic phase transitions based on time
- **Player feedback**: Per-player state in UI (feedback messages)

### How It Works

1. **Initialization**: When admin starts the game, `new GuessController()` is created
2. **Game loop**: `room.game.tick()` called ~100ms (updates state machine)
3. **Broadcasting**: `room.game.getState()` called ~100ms (sent to all players)
4. **Player input**: `ANSWER` messages → `game.handlePlayerAction(username, {guess: 42})`
5. **Scoring**: Points awarded based on game logic, sent back in getState()

---

## Architecture: Why This Pattern?

### Benefits

✅ **Isolation**: Games are state machines, testable without WebSocket
✅ **Consistency**: All games follow same pattern (tick/getState/handlePlayerAction)
✅ **Scalability**: Add games without touching handlers.js
✅ **Auto-discovery**: gameRegistry finds all games in `games/` directory
✅ **Clean separation**: Server code separate from UI

### How It Works

1. **room.game** — Single instance per game, holds all state
2. **tick()** — Logic only (no broadcasting), called ~100ms
3. **getState()** — Pure function, returns current state
4. **room broadcasts** — room.js calls game.getState(), sends to WebSocket clients
5. **handlePlayerAction** — Processes player input, updates game.game

---

## GameController API Reference

### Constructor

```javascript
constructor() {
  this.phase = 'LOBBY'              // Current game phase
  this.players = new Map()          // username → playerObj
  this.startTime = null             // Game start time
  this.phaseStartTime = null        // When current phase started
}
```

### Lifecycle Methods

```javascript
start()                    // Game starts, initial phase transition
tick()                     // Called ~100ms, update state & manage timers
getState()                 // Return state object for broadcasting
handlePlayerAction(u, a)   // Handle player input
addPlayer(username, data)  // Add player
removePlayer(username)     // Remove player
cleanup()                  // Cancel timers, free resources
```

### Utilities

```javascript
transitionTo(phase)        // Change phase, record phase start time
Date.now()                 // Use for timing (vs setInterval)
```

### State Pattern

```
// Define phases
LOBBY → COUNTDOWN (3s) → ACTIVE (varied) → REVEAL (4s) → ...

// In tick(), check phase and elapsed time:
const elapsed = Date.now() - this.phaseStartTime;
if (elapsed >= 3000) this.transitionTo('ACTIVE');
```

---

## WebSocket Message Format

### Player Action (Client → Server)

```javascript
{
  type: 'ANSWER',           // or custom type
  answerId: 42,             // or other action data
  powerupType: 'doublePoints'  // optional
}
```

### Game State (Server → Client)

```javascript
{
  type: 'GAME_STATE',       // or GUESS_STATE, QUIZ_STATE, etc.
  phase: 'ACTIVE',
  secretNumber: 42,         // game-specific
  players: [{
    username: 'alice',
    score: 100,
    lastGuess: 37,
    feedback: 'TOO LOW'
  }],
  timeRemaining: 30000
}
```

---

## Testing Your Game

### Manual Testing

```bash
npm start
# Browser: http://localhost:3000
# 1. Create room → get room code (e.g., ABCD)
# 2. Open TV display at /host/ABCD
# 3. Open player view at /player/ABCD (or from phone via QR code)
# 4. Join, suggest/start your game, and play!
```

### Unit Testing

```javascript
// game.test.js
const assert = require('assert');
const MyGame = require('./games/myGame/server');

test('initialization', () => {
  const game = new MyGame();
  assert.strictEqual(game.phase, 'LOBBY');
  assert.strictEqual(game.players.size, 0);
});

test('addPlayer', () => {
  const game = new MyGame();
  game.addPlayer('alice', { score: 0 });
  assert.strictEqual(game.players.size, 1);
});

test('getState returns object', () => {
  const game = new MyGame();
  game.addPlayer('alice', {});
  const state = game.getState();
  assert(state.phase);
  assert(Array.isArray(state.players));
});
```

---

## Common Patterns

### Time-based Transitions

```javascript
tick() {
  const elapsed = Date.now() - this.phaseStartTime;

  if (this.phase === 'COUNTDOWN' && elapsed >= 3000) {
    this.transitionTo('ACTIVE');
    this.activeStartTime = Date.now();
  }

  if (this.phase === 'ACTIVE' && elapsed >= 45000) {
    this.transitionTo('REVEAL');
  }
}
```

### Scoring

```javascript
handlePlayerAction(username, { answerIndex }) {
  const player = this.players.get(username);
  if (answerIndex === this.correctAnswer) {
    player.score += 100; // Correct answer points
    player.streak = (player.streak || 0) + 1;
  } else {
    player.streak = 0; // Reset streak on wrong answer
  }
}
```

### Per-Player State in UI

In your HTML, WebSocket handler:

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  const currentPlayer = msg.players.find(p => p.username === myUsername);
  if (currentPlayer) {
    updateMyScore(currentPlayer.score);
    updateMyFeedback(currentPlayer.feedback);
  }
};
```

---

## Troubleshooting

**Game doesn't start**
- Check handlers.js has START_MINI_GAME case for your game type
- Verify `new YourGameController()` is called

**UI doesn't update**
- Check WebSocket connection: `ws.readyState === WebSocket.OPEN`
- Log incoming messages: `console.log(msg)`
- Ensure game.getState() returns correct structure

**Phases don't transition**
- Check tick() is using `Date.now()` vs setTimeout()
- Verify phaseStartTime is set in transitionTo()
- Check phase comparison: `this.phase === 'ACTIVE'` (exact match)

---

## Future: Auto-discovery with gameRegistry

Once gameRegistry is fully integrated into handlers.js, you won't need step 3. Just create:
- `games/{name}/server.js` exporting GameController subclass
- `games/{name}/host/index.html` (TV display)
- `games/{name}/player/index.html` (player phones)

The gameRegistry will auto-discover it on startup.

See `server/gameRegistry.js` for implementation.
