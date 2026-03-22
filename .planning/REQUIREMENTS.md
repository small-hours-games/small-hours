# Requirements: Small Hours Games

**Defined:** 2026-03-15
**Core Value:** Players at a local gathering can instantly join a shared game from their phones and play together on a big screen — zero downloads, zero accounts, just a room code.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: Server runs in Docker container with health checks (30s interval, 3 failure restart)
- [ ] **INFRA-02**: Server supports HTTPS with auto-detection from cert files (required for iOS WebSocket)
- [ ] **INFRA-03**: HTTP security headers applied via Helmet
- [ ] **INFRA-04**: Page routes rate limited at 120 req/min per IP
- [ ] **INFRA-05**: API routes rate limited at 30 req/min per IP
- [ ] **INFRA-06**: Static file serving for frontend assets
- [ ] **INFRA-07**: Graceful shutdown with SERVER_RESTARTING message to connected clients
- [ ] **INFRA-08**: Node.js memory limited to prevent OOM kill in 512MB container

### WebSocket Transport

- [ ] **WS-01**: WebSocket server attached to HTTP server on same port
- [ ] **WS-02**: JSON message protocol for all real-time communication
- [ ] **WS-03**: Per-socket rate limiting at 30 msg/sec
- [ ] **WS-04**: 16KB max payload per WebSocket message
- [ ] **WS-05**: Heartbeat/ping-pong to detect zombie connections
- [ ] **WS-06**: CONNECTED message sent on WebSocket open with language info

### Room System

- [ ] **ROOM-01**: 4-character alphanumeric room codes (excluding I, O, S)
- [ ] **ROOM-02**: Room created on first connection, cleaned up after 4h idle or 30s with 0 sockets
- [ ] **ROOM-03**: Grace period during game-to-lobby transitions to prevent premature cleanup
- [ ] **ROOM-04**: Display connects via `/host/:code`, receives DISPLAY_OK
- [ ] **ROOM-05**: Player connects via `/player/:code`, receives JOIN_OK
- [ ] **ROOM-06**: Player reconnection within grace period restores state
- [ ] **ROOM-07**: Username sanitized (max 20 chars, no HTML)
- [ ] **ROOM-08**: Deterministic emoji avatar from username hash (pool of 20 emojis)

### Admin

- [ ] **ADMIN-01**: First player to join becomes admin
- [ ] **ADMIN-02**: Admin can start games with game type and optional config
- [ ] **ADMIN-03**: Admin can remove players from the room
- [ ] **ADMIN-04**: Admin can set room language
- [ ] **ADMIN-05**: If admin disconnects, next player promoted after grace period
- [ ] **ADMIN-06**: ADMIN_CHANGED message broadcast on admin transfer

### Bot System

- [ ] **BOT-01**: Bot auto-added when single human joins (solo play support)
- [ ] **BOT-02**: Bot auto-removed when second human joins
- [ ] **BOT-03**: Bot auto-readies and makes game moves with simulated delay
- [ ] **BOT-04**: Bot name is "🤖 Bot"

### Lobby

- [ ] **LOBBY-01**: Player list with avatars and ready status displayed
- [ ] **LOBBY-02**: Game suggestion voting (players suggest, admin decides)
- [ ] **LOBBY-03**: In-lobby chat with rate limiting (3 messages per 5 seconds per player)
- [ ] **LOBBY-04**: QR code displayed for join URL (scannable from ~3m)
- [ ] **LOBBY-05**: LOBBY_UPDATE broadcast with players, admin, suggestions, ready count
- [ ] **LOBBY-06**: All clients receive MINI_GAME_STARTING redirect when admin starts game
- [ ] **LOBBY-07**: All clients return to lobby after game ends

### Persistence

- [ ] **PERS-01**: OpenTrivia DB questions cached locally as JSON files by category
- [ ] **PERS-02**: Background question download with progress tracking, rate limited 2/hour per IP
- [ ] **PERS-03**: Game history stored as append-only JSONL log (gameId, type, room, times, players, scores)
- [ ] **PERS-04**: Player statistics aggregated per username (gamesPlayed, totalScore, wins, avgScore, lastPlayed, favoriteGame)
- [ ] **PERS-05**: LRU tracking of recently used questions to avoid repeats
- [ ] **PERS-06**: Session tokens prevent repeat questions within a quiz session

### API

- [ ] **API-01**: GET /health returns uptime and room count
- [ ] **API-02**: GET /api/rooms lists active rooms
- [ ] **API-03**: POST /api/rooms creates new room
- [ ] **API-04**: GET /api/stats?limit=N returns leaderboard
- [ ] **API-05**: GET /api/stats/:username returns player stats
- [ ] **API-06**: GET /api/history?limit=N returns recent games
- [ ] **API-07**: GET /api/db/status returns question database status
- [ ] **API-08**: POST /api/db/download triggers question download

### Game Engine

- [ ] **ENG-01**: GameController base class with tick(), handleMessage(), getSharedState(), getPlayerState()
- [ ] **ENG-02**: 100ms server tick broadcasting GAME_STATE to all connected clients
- [ ] **ENG-03**: Per-player private state sent individually (not in shared broadcast)
- [ ] **ENG-04**: Phase-based game state machine with time-based transitions (Date.now(), not counters)
- [ ] **ENG-05**: Pre-serialized broadcast (JSON.stringify once per tick, not per socket)
- [ ] **ENG-06**: Number Guess reference implementation validating extension pattern

### Quiz

- [ ] **QUIZ-01**: Questions sourced from OpenTrivia DB with local cache fallback
- [ ] **QUIZ-02**: Category voting by players before game starts
- [ ] **QUIZ-03**: Configurable question count and difficulty (easy/medium/hard affects timer)
- [ ] **QUIZ-04**: Phases: FETCHING → COUNTDOWN(3s) → QUESTION_ACTIVE(15s) → REVEAL(4s) → BETWEEN(5s) → GAME_OVER
- [ ] **QUIZ-05**: Power-ups: Double Points, Fifty-Fifty, Time Freeze (one per question per player)
- [ ] **QUIZ-06**: Scoring based on correctness + speed (faster = more points)
- [ ] **QUIZ-07**: Streak tracking per player
- [ ] **QUIZ-08**: Bot answers with random delay (500-1500ms), ~50% correct

### Shithead

- [ ] **SH-01**: Standard 52-card deck, rank hierarchy (2 wild/reset, 3→Ace ascending)
- [ ] **SH-02**: Deal 9 cards per player: 3 hand, 3 face-up, 3 face-down
- [ ] **SH-03**: SWAP phase (30s or early exit): players swap hand ↔ face-up cards
- [ ] **SH-04**: Play rules: card ≥ pile top, or play 2 (wild/reset)
- [ ] **SH-05**: Multiple same-rank cards playable together
- [ ] **SH-06**: 4 matching ranks on pile → pile burns
- [ ] **SH-07**: Draw from deck to maintain 3 hand cards; then face-up; then face-down (blind)
- [ ] **SH-08**: First to empty all cards wins; last player is "shithead"
- [ ] **SH-09**: Per-player private hand state via individual WebSocket messages
- [ ] **SH-10**: Bot swaps worst hand for best face-up, confirms after one swap
- [ ] **SH-11**: 2-6 players

### Spy Game

- [ ] **SPY-01**: One random player is spy each round; non-spies see secret word
- [ ] **SPY-02**: Non-spies give one-word clues (30s)
- [ ] **SPY-03**: Spy guesses word based on clues (20s)
- [ ] **SPY-04**: Scoring: spy +3 if correct, else each non-spy +1
- [ ] **SPY-05**: Default 10 rounds, word pool 150+ words
- [ ] **SPY-06**: 3+ players

### Cards Against Humanity

- [ ] **CAH-01**: Rotating card czar each round
- [ ] **CAH-02**: Czar draws black card (prompt), non-czars submit white card(s)
- [ ] **CAH-03**: Submissions randomized for blind judging
- [ ] **CAH-04**: Czar picks best answer → that player gets +1 point
- [ ] **CAH-05**: Configurable max rounds (default: 8)
- [ ] **CAH-06**: 3-8 players

### Lyrics Guessing

- [ ] **LYR-01**: Players match/guess song lyrics
- [ ] **LYR-02**: Configurable question count
- [ ] **LYR-03**: Scoring by accuracy and speed
- [ ] **LYR-04**: 1+ players

### Frontend

- [ ] **UI-01**: Responsive mobile-first layout for phone controllers
- [ ] **UI-02**: Dark theme with neon/glass aesthetic
- [ ] **UI-03**: Fade-in transitions between states
- [ ] **UI-04**: Confetti animation on wins
- [ ] **UI-05**: Sound effects with iOS auto-mute handling (AudioContext on gesture)
- [ ] **UI-06**: Toast notifications for events
- [ ] **UI-07**: Offline detection + reconnection UI
- [ ] **UI-08**: Viewport safe area support for notched phones
- [ ] **UI-09**: Display screen layout optimized for TV viewing distance

## v2 Requirements

### Audience

- **AUD-01**: Spectator/audience mode for streaming scenarios

### Content

- **CONT-01**: Player-created custom card submissions for CAH
- **CONT-02**: User-submitted quiz questions via config

### Moderation

- **MOD-01**: Player reporting system
- **MOD-02**: Content filtering for chat and submissions

### Networking

- **NET-01**: Remote/internet play with NAT traversal

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app | Destroys zero-friction join value proposition |
| User accounts / authentication | Adds onboarding friction at party; creates GDPR obligations |
| Persistent cross-session identity | Requires auth, which is excluded |
| Binary WebSocket / MessagePack | Premature optimization at party scale (<20 players) |
| Server-side rendering | State-heavy tick-driven app, no SEO benefit |
| Real-time continuous leaderboard | Distracting mid-game; show at phase boundaries instead |
| Per-player sound settings persistence | Over-complex; single mute toggle per device sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Pending |
| INFRA-08 | Phase 1 | Pending |
| WS-01 | Phase 2 | Pending |
| WS-02 | Phase 2 | Pending |
| WS-03 | Phase 2 | Pending |
| WS-04 | Phase 2 | Pending |
| WS-05 | Phase 2 | Pending |
| WS-06 | Phase 2 | Pending |
| ROOM-01 | Phase 3 | Pending |
| ROOM-02 | Phase 3 | Pending |
| ROOM-03 | Phase 3 | Pending |
| ROOM-04 | Phase 3 | Pending |
| ROOM-05 | Phase 3 | Pending |
| ROOM-06 | Phase 3 | Pending |
| ROOM-07 | Phase 3 | Pending |
| ROOM-08 | Phase 3 | Pending |
| ADMIN-01 | Phase 3 | Pending |
| ADMIN-02 | Phase 3 | Pending |
| ADMIN-03 | Phase 3 | Pending |
| ADMIN-04 | Phase 3 | Pending |
| ADMIN-05 | Phase 3 | Pending |
| ADMIN-06 | Phase 3 | Pending |
| BOT-01 | Phase 3 | Pending |
| BOT-02 | Phase 3 | Pending |
| BOT-03 | Phase 3 | Pending |
| BOT-04 | Phase 3 | Pending |
| LOBBY-01 | Phase 4 | Pending |
| LOBBY-02 | Phase 4 | Pending |
| LOBBY-03 | Phase 4 | Pending |
| LOBBY-04 | Phase 4 | Pending |
| LOBBY-05 | Phase 4 | Pending |
| LOBBY-06 | Phase 4 | Pending |
| LOBBY-07 | Phase 4 | Pending |
| PERS-01 | Phase 5 | Pending |
| PERS-02 | Phase 5 | Pending |
| PERS-03 | Phase 5 | Pending |
| PERS-04 | Phase 5 | Pending |
| PERS-05 | Phase 5 | Pending |
| PERS-06 | Phase 5 | Pending |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |
| API-03 | Phase 5 | Pending |
| API-04 | Phase 5 | Pending |
| API-05 | Phase 5 | Pending |
| API-06 | Phase 5 | Pending |
| API-07 | Phase 5 | Pending |
| API-08 | Phase 5 | Pending |
| ENG-01 | Phase 6 | Pending |
| ENG-02 | Phase 6 | Pending |
| ENG-03 | Phase 6 | Pending |
| ENG-04 | Phase 6 | Pending |
| ENG-05 | Phase 6 | Pending |
| ENG-06 | Phase 6 | Pending |
| QUIZ-01 | Phase 7 | Pending |
| QUIZ-02 | Phase 7 | Pending |
| QUIZ-03 | Phase 7 | Pending |
| QUIZ-04 | Phase 7 | Pending |
| QUIZ-05 | Phase 7 | Pending |
| QUIZ-06 | Phase 7 | Pending |
| QUIZ-07 | Phase 7 | Pending |
| QUIZ-08 | Phase 7 | Pending |
| SPY-01 | Phase 8 | Pending |
| SPY-02 | Phase 8 | Pending |
| SPY-03 | Phase 8 | Pending |
| SPY-04 | Phase 8 | Pending |
| SPY-05 | Phase 8 | Pending |
| SPY-06 | Phase 8 | Pending |
| CAH-01 | Phase 9 | Pending |
| CAH-02 | Phase 9 | Pending |
| CAH-03 | Phase 9 | Pending |
| CAH-04 | Phase 9 | Pending |
| CAH-05 | Phase 9 | Pending |
| CAH-06 | Phase 9 | Pending |
| SH-01 | Phase 10 | Pending |
| SH-02 | Phase 10 | Pending |
| SH-03 | Phase 10 | Pending |
| SH-04 | Phase 10 | Pending |
| SH-05 | Phase 10 | Pending |
| SH-06 | Phase 10 | Pending |
| SH-07 | Phase 10 | Pending |
| SH-08 | Phase 10 | Pending |
| SH-09 | Phase 10 | Pending |
| SH-10 | Phase 10 | Pending |
| SH-11 | Phase 10 | Pending |
| LYR-01 | Phase 11 | Pending |
| LYR-02 | Phase 11 | Pending |
| LYR-03 | Phase 11 | Pending |
| LYR-04 | Phase 11 | Pending |
| UI-01 | Phase 12 | Pending |
| UI-02 | Phase 12 | Pending |
| UI-03 | Phase 12 | Pending |
| UI-04 | Phase 12 | Pending |
| UI-05 | Phase 12 | Pending |
| UI-06 | Phase 12 | Pending |
| UI-07 | Phase 12 | Pending |
| UI-08 | Phase 12 | Pending |
| UI-09 | Phase 12 | Pending |

**Coverage:**
- v1 requirements: 83 total
- Mapped to phases: 83
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after roadmap creation — traceability confirmed 83/83 ✓
