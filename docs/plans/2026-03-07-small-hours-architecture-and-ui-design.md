# Small-Hours Gaming: Architecture & UI Design
**Date:** 2026-03-07
**Status:** Approved Design
**Timeline:** 1-2 weeks focused effort

---

## Overview

Redesign the small-hours multiplayer gaming platform to:
1. **UI Refresh:** Integrate moon logotype, refine warm/cozy theme
2. **Architecture:** Enable easy game extensibility (GameController pattern)
3. **Stability:** Improve room/player management, testing, persistence
4. **Mode Support:** Multiplayer-first with solo-vs-bots fallback

---

## Architecture: Unified GameController Pattern

### Problem & Solution

**Current state (fragile):**
- `quiz.js` and `shithead.js` each manage own state, timers, player tracking
- No standardized interface; adding new game means code duplication
- Hard to test game logic in isolation
- Room/game interaction is tangled

**New approach:**
- **GameController** abstract base class defines standardized lifecycle
- **QuizController** and **ShiteadController** extend it
- Each game implements same interface: `getState()`, `handlePlayerAction()`, `tick()`, `cleanup()`
- Room owns and orchestrates the game (pull-based: calls `tick()`, broadcasts `getState()`)
- **Result:** Testable, extensible, clear separation of concerns

### GameController Interface

```javascript
// server/GameController.js (abstract base)
class GameController {
  // Lifecycle & state
  getState()                          // Returns {phase, players, timeRemaining, ...}
  start()                             // Initialize game, set first phase
  handlePlayerAction(username, data)  // Process player move/answer
  tick()                              // Called ~100ms, handles timers & phase transitions
  cleanup()                           // Cancel timers, free resources

  // Player management
  addPlayer(username, playerObj)      // Register player in game
  getPlayerState(username)            // Returns {score, streak, powerups, ...}
  removePlayer(username)              // Handle disconnect mid-game

  // Phases (Quiz: LOBBY→COUNTDOWN→QUESTION→REVEAL→BETWEEN→GAME_OVER)
  getPhase()                          // Current phase string
  transitionTo(newPhase)              // Trigger phase change
  getRemainingTime()                  // Ms until next phase or timeout
}
```

### Standardized Player State

All players (human & bot) have same state shape:

```javascript
{
  username,           // "Alice" or "🤖 Bot"
  avatar,
  isBot,              // false = human, true = auto-player
  ws,                 // null if bot, Socket if human

  // Game state (identical across all games)
  score,
  streak,
  powerups: {
    doublePoints: 0|1,
    fiftyFifty: 0|1,
    timeFreeze: 0|1
  },
  activePowerup,      // Currently active power-up (if any)
  lastAnswerTime,     // Timestamp of last action
  isReady,            // Lobby readiness

  // Bot-specific (ignored for humans)
  difficulty,         // "easy", "medium", "hard"
}
```

### Room Orchestration Loop

```javascript
// server.js
room.game = new QuizController()  // or ShiteadController at start

room.gameInterval = setInterval(() => {
  room.game.tick()                // Game handles all timing/phase transitions
  const state = room.game.getState()

  // Broadcast to all players & displays
  broadcast(room.playerSockets, 'GAME_STATE', state)
  broadcast(room.displaySockets, 'GAME_STATE', state)
}, 100)

// On player WebSocket message
server.on('message', (ws, msg) => {
  const {room, username} = getContext(ws, msg)
  room.game.handlePlayerAction(username, msg.data)
  // game updates internal state; tick() broadcasts on next cycle
})
```

**Key design principle:** Game logic is **pull-based** (room calls `tick()`) not **push-based** (game calls broadcast). Games never reach back to room.

---

## Player Modes: Multiplayer-First with Solo Fallback

### Multiplayer Mode (Primary)
- 2+ players join room → group game
- Optional TV display shows game state (passive, no input)
- QR code encodes `/group/XXXX` URL
- Admin (first player) controls game start/return-to-lobby

### Solo with Bots (Fallback)
- 1 real player joins → auto-add bot opponent
- When 2nd real player joins → auto-remove bot
- Bot auto-readies during setup, auto-plays with 1-2s random delay
- Same game logic, bot AI plays strategically
- Bot doesn't count toward persistent stats

```javascript
// server/rooms.js - bot auto-management
function maybeAddBot(room) {
  const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length
  if (humanCount === 1 && room.players.size < 6) {
    room.players.set('🤖 Bot', {username: '🤖 Bot', isBot: true, ws: null, ...})
  }
}

function maybeRemoveBot(room) {
  const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length
  if (humanCount >= 2) {
    room.players.delete('🤖 Bot')
  }
}
```

---

## Testing Strategy

### Unit Tests (Game Logic in Isolation)

```javascript
// test/QuizController.test.js
import QuizController from '../server/QuizController.js'

test('scoring with doublePoints powerup', () => {
  const game = new QuizController()
  game.addPlayer('alice', {powerups: {doublePoints: 1}})

  game.handlePlayerAction('alice', {
    answerIndex: 0,
    powerup: 'doublePoints'
  })
  game.tick()

  const state = game.getState()
  expect(state.players.alice.score).toBe(200)  // 100 * 2
  expect(state.players.alice.powerups.doublePoints).toBe(0)
})

test('phase transitions work', () => {
  const game = new QuizController()
  expect(game.getPhase()).toBe('LOBBY')

  game.start()
  expect(game.getPhase()).toBe('COUNTDOWN')

  // Tick until phase changes
  for (let i = 0; i < 35; i++) game.tick()
  expect(game.getPhase()).toBe('QUESTION_ACTIVE')
})
```

**Advantages:**
- No server, no WebSocket, no mocks
- Deterministic & fast
- Test game state in → action → state out

### E2E Tests (Existing)
- Keep Puppeteer tests (`tests/fullgame.mjs`, `tests/continue.mjs`, `tests/restart.mjs`)
- Validate multi-player + TV display sync
- Run after architectural changes to ensure backward compatibility

---

## UI & Branding Refresh

### Logo Integration
- **Landing page (`public/index.html`):** Large moon logo in hero
- **Lobby (`public/group/index.html`):** Logo in header (small, always visible)
- **Game screens:** Logo in top-left corner (small badge)
- **TV display (`public/group/XXXX/display`):** Logo in scoreboard header

### Theme Refinement (Warm/Cozy Enhanced)
- **Keep:** Glass-card effects, animated mesh backgrounds
- **New palette:** Warm yellows/oranges (from logo), soft blues, deeper purples
- **Typography:** Friendly sans-serif matching logo aesthetic
- **Animations:** Subtle, cozy (confetti on wins, gentle easing)
- **Visual hierarchy:** Refined spacing, consistent borders

### Component Patterns (Code Reuse)

Create shared UI components to reduce duplication:

```
/public/shared/
  ├── components.js          // <PlayerChip>, <Button>, <GamePhaseDisplay>
  ├── game-events.js         // Standard game event handlers
  ├── theme.css              // Color palette, animations
  ├── sounds.js              // GNSound (existing)
  ├── confetti.js            // GNConfetti (existing)
  └── utils.js               // Utilities (existing)
```

Example:
```javascript
// <PlayerChip> used in lobby, opponent strip, scoreboard
<PlayerChip
  username="alice"
  avatar="👩"
  score={1250}
  isAdmin={true}
  isBot={false}
/>
```

### Game-Specific UI Structure
```
/public/games/
  ├── quiz/
  │   ├── index.html         // Quiz player UI
  │   └── quiz.js            // Quiz-specific logic
  ├── shithead/
  │   ├── index.html         // Shithead player UI
  │   └── shithead.js        // Shithead-specific logic
```

---

## Migration Path (Current → New Architecture)

### Phase 1: Foundation (Days 1-2)
1. Create `server/GameController.js` (abstract base with interface from above)
2. Create `server/QuizController.js`, move `game.js` logic into it
3. Update `server.js` room setup to use `new QuizController()`
4. Route all WebSocket handlers through `room.game.handlePlayerAction()`
5. **Test:** Quiz game works exactly as before

### Phase 2: Stabilization (Days 2-3)
1. Refactor `shithead.js` → `server/ShiteadController.js`
2. Unify player state across both games
3. Implement bot controller + auto-add/remove logic
4. **Test:** Both games work, bots join/leave correctly

### Phase 3: UI & Branding (Days 3-5)
1. Integrate logotype throughout (landing, lobby, game screens)
2. Refine warm/cozy theme (colors, spacing, animations)
3. Create shared components (`/public/shared/components.js`)
4. Add persistence layer (gameHistory.json, playerStats.json)
5. **Test:** E2E tests pass

### Phase 4: Testing & Deploy (Days 5-7)
1. Write unit tests for game logic
2. Run full E2E test suite
3. Code review
4. Deploy to production

---

## Data & Persistence Layer

### Game History

Append-only log of completed games:

```json
// data/gameHistory.json
[
  {
    "gameId": "quiz-2026-03-07-1430",
    "gameType": "quiz",
    "roomCode": "ABCD",
    "startTime": "2026-03-07T14:30:00Z",
    "endTime": "2026-03-07T14:45:00Z",
    "duration": 900,
    "players": [
      { "username": "alice", "finalScore": 1250, "rank": 1, "isBot": false },
      { "username": "bob", "finalScore": 980, "rank": 2, "isBot": false }
    ]
  }
]
```

### Player Stats

Rolling statistics (updated after each game):

```json
// data/playerStats.json
{
  "alice": {
    "gamesPlayed": 42,
    "totalScore": 45230,
    "wins": 18,
    "averageScore": 1077,
    "lastPlayed": "2026-03-07",
    "favoriteGame": "quiz"
  },
  "bob": {
    "gamesPlayed": 38,
    "totalScore": 38920,
    "wins": 12,
    "averageScore": 1024,
    "lastPlayed": "2026-03-06",
    "favoriteGame": "shithead"
  }
}
```

### Implementation

```javascript
// server.js - on game end
room.game.cleanup()
const finalState = room.game.getState()

// Write game history
const gameRecord = {
  gameId: `${gameType}-${new Date().toISOString()}`,
  gameType,
  roomCode: room.code,
  startTime: room.startTime,
  endTime: new Date(),
  players: finalState.players.map(p => ({
    username: p.username,
    finalScore: p.score,
    rank: p.rank,
    isBot: p.isBot
  }))
}
fs.appendFileSync('data/gameHistory.json', JSON.stringify(gameRecord) + '\n')

// Update player stats (only non-bots)
for (const {username, finalScore} of gameRecord.players) {
  if (!finalState.players.get(username).isBot) {
    updatePlayerStats(username, finalScore)
  }
}
```

### API Endpoints

- `GET /api/stats` — Top players, leaderboard
- `GET /api/stats/:username` — Personal stats
- `GET /api/history` — Recent games

---

## Success Criteria

- ✅ GameController pattern working (both quiz & shithead)
- ✅ Unit tests for game logic (80%+ coverage)
- ✅ E2E tests pass (Puppeteer suite)
- ✅ UI refreshed with logo integrated
- ✅ Persistence working (game history, player stats)
- ✅ Bots auto-manage (add/remove)
- ✅ Deployed to production without regressions
- ✅ Code is ready for next game (game #3 can be added in <1 day)

---

## Files to Create/Modify

### New Files
- `server/GameController.js` — Abstract base class
- `server/QuizController.js` — Quiz game implementation
- `server/ShiteadController.js` — Shithead game implementation
- `server/BotController.js` — Bot logic & auto-management
- `public/shared/components.js` — Reusable UI components
- `test/QuizController.test.js` — Unit tests
- `test/ShiteadController.test.js` — Unit tests
- `data/gameHistory.json` — Game history log
- `data/playerStats.json` — Player stats
- `docs/plans/2026-03-07-small-hours-architecture-and-ui-design.md` — This design

### Modified Files
- `server.js` — Use GameController, update orchestration
- `server/handlers.js` — Route through game.handlePlayerAction()
- `server/rooms.js` — Bot auto-management, player state
- `public/index.html` — Integrate logo, refine theme
- `public/group/index.html` — Integrate logo, shared components
- `public/games/quiz/index.html` — Use shared components
- `public/games/shithead/index.html` — Use shared components
- `public/shared/theme.css` — Enhanced warm/cozy palette

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking existing multiplayer during refactor | High | Keep old game.js working until QuizController stable; parallel implementation |
| Bot logic bugs affecting real games | Medium | Extensive unit tests; E2E tests validate |
| Room cleanup race conditions | Medium | Test room lifecycle thoroughly; existing 30s grace period helps |
| Persistence file corruption | Low | Append-only log; validate JSON on read |

---

## Next Steps

1. ✅ **Design approved** (this document)
2. 🔲 Create detailed implementation plan (writing-plans skill)
3. 🔲 Set up isolated git worktree
4. 🔲 Begin Phase 1 (GameController foundation)
