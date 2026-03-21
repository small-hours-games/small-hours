# Small Hours Games — Functional Specification

> Purpose: Complete functional spec for a ground-up rewrite. Captures *what* the system does, not *how* it's currently implemented.

---

## 1. Overview

A real-time multiplayer party game platform designed for local gatherings. One shared screen (TV/monitor) acts as the "display", and players join from their phones via a short room code or QR scan.

**Core concept:** Display + Phones. The display shows the game state for everyone; each phone is a personal controller.

---

## 2. Platform Architecture

### 2.1 Roles

| Role | Purpose | Connects via |
|------|---------|-------------|
| **Display** | Shared screen (TV) showing game state, lobby, leaderboards | `/host/:code` |
| **Player** | Individual controller on phone/tablet | `/player/:code` |

### 2.2 Communication

- All real-time communication uses **WebSockets** (JSON messages)
- Server broadcasts game state to all connected clients on a **100ms tick**
- Player-specific state (e.g., card hands) sent individually per player
- HTTP endpoints for room creation, stats, health checks, and database management

### 2.3 Room System

- **Room code:** 4-character alphanumeric (excludes I, O, S to avoid confusion)
- **Lifecycle:** Created on first connection → active during play → cleaned up after 4h idle or 30s with 0 sockets
- **Capacity:** No hard limit, but games have individual player limits
- **Transition handling:** Grace period during game→lobby transitions to prevent premature cleanup

---

## 3. Player Management

### 3.1 Identity

- **Username:** Free-text, sanitized (max 20 chars, no HTML)
- **Avatar:** Deterministic emoji from username hash (pool of 20 emojis: 🦊🐸🐼🦁🐯🦋🐨🐧🦄🐙🦖🐻🦀🦩🐬🦝🦔🦦🦜🐳)
- **No authentication** — players are ephemeral per session

### 3.2 Admin

- First player to join becomes admin
- Admin can: start games, remove players, set language
- If admin disconnects, next player is promoted (after grace period)

### 3.3 Bots

- Auto-added when a single human joins (solo play support)
- Auto-removed when a second human joins
- Bot name: "🤖 Bot"
- Bots auto-ready and make game moves with simulated delay

---

## 4. Lobby

The lobby is the central hub between games.

### 4.1 Features

- Player list with avatars and ready status
- Game suggestion voting (players suggest, admin decides)
- Category voting (for quiz)
- In-lobby chat (rate limited: 3 messages per 5 seconds)
- QR code for join URL
- Admin controls: start game, remove player, set language
- Language selection (persisted per room)

### 4.2 Flow

1. Players join room via code/QR
2. Players mark ready, suggest games
3. Admin starts chosen game
4. All clients receive redirect to game-specific page
5. After game ends, all return to lobby

---

## 5. Games

### 5.1 Quiz (Trivia)

**Players:** 1+ (bot fills in for solo)
**Source:** OpenTrivia Database API with local cache fallback

#### Phases

| Phase | Duration | Description |
|-------|----------|-------------|
| FETCHING | Variable | Fetching questions from API/cache |
| COUNTDOWN | 3s | Pre-game countdown |
| QUESTION_ACTIVE | 15s | Question displayed, players answer |
| REVEAL | 4s | Correct answer shown |
| BETWEEN_QUESTIONS | 5s | Pause between questions |
| GAME_OVER | — | Final leaderboard |

#### Features

- **Categories:** Player-voted from OpenTrivia DB categories
- **Difficulty:** Easy, medium, hard (affects timer)
- **Configurable question count**
- **Power-ups** (one per question):
  - Double Points — 2x score for correct answer
  - Fifty-Fifty — Removes 2 wrong answers
  - Time Freeze — Stops the timer
- **Scoring:** Based on correctness + speed (faster = more points)
- **Session tokens** prevent repeat questions
- **Streak tracking** per player

#### Bot Behavior

- Answers with random delay (500-1500ms)
- ~50% chance of correct answer

---

### 5.2 Shithead (Card Game)

**Players:** 2-6

#### Card System

- Standard 52-card deck (4 suits × 13 ranks)
- Rank hierarchy: 2 (wild/reset), 3→Ace (ascending)
- Each player dealt 9 cards: 3 hand, 3 face-up (visible to all), 3 face-down (hidden from everyone)

#### Phases

| Phase | Duration | Description |
|-------|----------|-------------|
| SETUP | 5s | Cards dealt |
| SWAP | 30s (or early exit) | Players swap hand ↔ face-up cards |
| REVEAL | 3s | Final card arrangement shown |
| PLAY | Turn-based | Main gameplay |
| GAME_OVER | — | Winner announced |

#### Play Rules

- Play card(s) with rank ≥ pile top card, or play a 2 (wild/reset)
- Multiple cards of same rank can be played together
- 4 matching ranks on pile → pile burns (discarded)
- After playing, draw from deck to maintain 3 cards in hand
- When hand + deck empty, play face-up cards
- When face-up empty, play face-down cards (blind)
- First player to empty all cards wins; last player is the "shithead"

#### SWAP Phase

- Players can swap any hand card with any face-up card
- All players can confirm ready to exit early
- If all confirm, SWAP ends immediately (no waiting for timer)

#### Player-Specific State

- Each player receives their own hand/face-up/face-down visibility
- Other players' face-down cards shown as count only

#### Bot Behavior

- Swaps worst hand card (lowest rank) for best face-up card (highest rank)
- Confirms after one swap

---

### 5.3 Spy Game (Social Deduction)

**Players:** 3+

#### Phases (per round)

| Phase | Duration | Description |
|-------|----------|-------------|
| SETUP | 5s | Random spy chosen, word assigned |
| CLUES | 30s | Non-spies give 1-word clues |
| GUESS | 20s | Spy guesses the word |
| REVEAL | 5s | Show spy's guess vs actual word |
| SCORE | 3s | Points awarded |

#### Rules

- One random player is the spy each round
- Non-spies see the secret word; spy does not
- Non-spies give one-word clues (must be subtle enough to not reveal the word)
- Spy guesses word based on clues
- **Scoring:** Spy gets +3 if correct, otherwise each non-spy gets +1
- Default: 10 rounds
- Word pool: ~150+ words

---

### 5.4 Cards Against Humanity

**Players:** 3-8

#### Phases

| Phase | Duration | Description |
|-------|----------|-------------|
| COUNTDOWN | 3s | Round start |
| ACTIVE | Per round | Card czar reads black card, others submit white cards, czar picks winner |
| GAME_OVER | — | Final scores |

#### Rules

- Rotating card czar each round
- Czar draws black card (prompt/question)
- Non-czars submit white card(s) as answers
- Submissions randomized for blind judging
- Czar picks best answer → that player gets +1 point
- Configurable max rounds (default: 8)

---

### 5.5 Lyrics Guessing

**Players:** 1+

- Players match/guess song lyrics
- Configurable question count
- Scoring by accuracy and speed

---

### 5.6 Number Guess (Reference/Template Game)

**Players:** 1+

- Secret number 1-100
- Players guess, receive "too high" / "too low" feedback
- Fewer guesses = higher score
- Serves as a template for adding new games

---

## 6. Message Protocol

### 6.1 Player → Server

| Message | Payload | Context |
|---------|---------|---------|
| `JOIN_LOBBY` | `{username}` | Join room |
| `SET_READY` | `{ready}` | Toggle ready |
| `SUGGEST_GAME` | `{gameType}` | Vote for game |
| `START_MINI_GAME` | `{gameType, categories?, questionCount?, gameDifficulty?}` | Admin starts game |
| `REMOVE_PLAYER` | `{username}` | Admin removes player |
| `RETURN_TO_LOBBY` | — | Admin ends game |
| `CATEGORY_VOTE` | `{categories: [id, ...]}` | Vote quiz categories |
| `ANSWER` | `{answerId, powerupType?}` | Quiz answer |
| `SHITHEAD_SWAP_CARD` | `{handCardId, faceUpCardId}` | Swap cards |
| `SHITHEAD_CONFIRM_SWAP` | — | Confirm swap done |
| `SHITHEAD_PLAY_CARDS` | `{cardIds: [...]}` | Play card(s) |
| `SHITHEAD_PLAY_FACEDOWN` | `{cardId}` | Play face-down |
| `CAH_SUBMIT_CARDS` | `{cardIds: [...]}` | Submit white cards |
| `CAH_CZAR_PICK` | `{submissionId}` | Czar picks winner |
| `SEND_CLUE` | `{text}` | Spy: give clue |
| `SEND_GUESS` | `{text}` | Spy: guess word |
| `LYRICS_ANSWER` | `{answerId}` | Lyrics answer |
| `CHAT_MESSAGE` | `{text}` | Lobby chat |
| `SET_LANGUAGE` | `{lang}` | Admin sets language |

### 6.2 Server → Client

| Message | Payload | Description |
|---------|---------|-------------|
| `CONNECTED` | `{lang}` | WebSocket connected |
| `DISPLAY_OK` | `{roomCode, state}` | Display connected |
| `JOIN_OK` | `{username, isAdmin, roomCode, avatar, lang, gameRunning}` | Join confirmed |
| `ERROR` | `{code, message}` | Error |
| `LOBBY_UPDATE` | `{players, admin, gameSuggestions, readyCount, totalCount, allReady}` | Lobby state |
| `VOTE_UPDATE` | `{votes, voted, totalPlayers, allVoted}` | Category votes |
| `PLAYER_JOINED` | `{players, playerCount}` | New player |
| `PLAYER_REMOVED` | `{username}` | Player removed |
| `ADMIN_CHANGED` | `{newAdmin}` | Admin transferred |
| `MINI_GAME_STARTING` | `{gameType, url}` | Redirect to game |
| `GAME_STATE` | `{phase, ...}` | Game state (100ms tick) |
| `SHITHEAD_YOUR_STATE` | `{hand, faceUp, faceDownIds}` | Per-player card state |
| `SHITHEAD_ERROR` | `{message}` | Invalid move |
| `LANGUAGE_SET` | `{lang}` | Language changed |
| `CHAT_MESSAGE` | `{username, avatar, text, timestamp}` | Chat message |
| `SERVER_RESTARTING` | `{message}` | Graceful shutdown notice |

---

## 7. Persistence

### 7.1 Question Cache

- Local JSON file caching questions from OpenTrivia DB
- Organized by category
- Background download with progress tracking
- Rate limited: 2 downloads/hour

### 7.2 Game History

- Append-only JSONL log of completed games
- Fields: gameId, gameType, roomCode, startTime, endTime, duration, players (with scores/ranks)

### 7.3 Player Statistics

- Aggregate stats per username: gamesPlayed, totalScore, wins, averageScore, lastPlayed, favoriteGame
- Updated after each game completes

### 7.4 Question Usage Tracking

- LRU tracking of recently used questions to avoid repeats

---

## 8. API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (uptime, room count) |
| `GET` | `/api/rooms` | List active rooms |
| `POST` | `/api/rooms` | Create new room |
| `GET` | `/api/stats?limit=N` | Leaderboard |
| `GET` | `/api/stats/:username` | Player stats |
| `GET` | `/api/history?limit=N` | Recent games |
| `GET` | `/api/db/status` | Question DB status |
| `POST` | `/api/db/download` | Trigger question download |

---

## 9. Security & Rate Limiting

| Scope | Limit |
|-------|-------|
| Page routes | 120 req/min per IP |
| API routes | 30 req/min per IP |
| DB download | 2/hour per IP |
| WebSocket messages | 30 msg/sec per socket |
| Chat messages | 3 per 5 seconds per player |
| WebSocket payload | 16KB max |
| Username | Sanitized, max 20 chars, no HTML |
| HTTP headers | Helmet security headers |

---

## 10. Frontend/UX

- **Responsive:** Mobile-first, works on phones + TV display
- **Theme:** Dark with neon/glass aesthetic
- **Animations:** Fade-in transitions, confetti on wins
- **Sound:** Sound effects (auto-muted on iOS)
- **Notifications:** Toast messages for events
- **Offline handling:** Detection + reconnection
- **Viewport:** Safe area support for notched phones
- **QR codes:** Generated for join URLs + optional donation

---

## 11. Deployment

- **Container:** Docker with Docker Compose
- **Networking:** Host mode (Linux) or port mapping
- **HTTPS:** Optional, auto-detected from cert files (required for iOS WebSocket)
- **CI/CD:** GitHub Actions → SSH deploy via Headscale VPN
- **Health checks:** Every 30s, auto-restart after 3 failures
- **Resources:** 512MB memory, 1 CPU limit
- **Persistence:** Data directory bind-mounted for game history/stats survival

---

## 12. Game Extension Pattern

New games follow this pattern:
1. Server-side controller extending GameController base class
2. Implements: `tick()` (called every 100ms), phase management, player action handlers
3. Frontend: Standalone HTML page receiving `GAME_STATE` via WebSocket
4. Registration: Added to room's game routing and message handler dispatch
5. Reference implementation: Number Guess game
