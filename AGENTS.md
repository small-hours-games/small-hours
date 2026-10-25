# AGENTS.md

Project guidance for coding agents working in this repository. Read this first, then inspect the code and tests relevant to the task. Keep this file current when commands, architecture, or workflows change.

## Product and stack

Small Hours Games is a real-time multiplayer party game platform. A shared TV or monitor displays the game; players join from phones with a room code. An Android TV app wraps the host experience.

- Node.js 22+, JavaScript ESM, Express 5, and `ws`.
- Vanilla browser JavaScript and HTML, with shared CSS and Tailwind loaded from a CDN. No frontend build step or framework.
- Vitest with explicit imports (`describe`, `it`, `expect`); test globals are disabled.
- Rooms and player identities are in memory. Reconnection tokens support reclaiming a session; there are no persistent user accounts.
- Prefer small changes, existing patterns, and dependencies justified by a concrete need.

## Start here

```bash
npm install                    # install dependencies if needed
npm start                      # server on port 3001, or PORT from environment
npm run dev                    # server with Node watch mode
npm test                       # all tests, single run
npx vitest run tests/engine/quiz.test.js  # one test file
npm run test:watch             # interactive test watch mode
curl -fsS http://localhost:3001/health
```

The server loads `.env` using Node's built-in support. See `.env.example` for example settings. Do not print secrets or assume an integration is configured from an old note.

Before editing, inspect `git status` and the relevant diff. Preserve existing uncommitted work. Do not reset, overwrite, or commit unrelated changes. Report what changed and what was verified, including any checks that could not run.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/server.js` | Express/HTTP/WebSocket wiring, startup cache warming, shutdown |
| `src/transport/http.js` | Health, room API, audio/music routes, static files and page routing |
| `src/transport/ws-adapter.js` | Connections, dispatch, broadcasts, heartbeat, rate limits, phase timers |
| `src/transport/handlers/` | Lobby, game lifecycle/actions, chat, and voting handlers |
| `src/session/manager.js` | Room creation, lookup, and cleanup |
| `src/session/room.js` | Players, reconnect identity, admin, lobby, scores, game registry and startup |
| `src/engine/engine.js` | `createGame`, `processAction`, `getView`, `checkEnd` |
| `src/engine/games/` | Plain-object game definitions; `index.js` re-exports them |
| `src/fetcher/` | Trivia, disk caches, Gemini TTS, question files, Deezer/music playlists |
| `src/session/stories.js` | Game introduction/narration text |
| `src/notifications/discord.js` | Room-created webhook |
| `public/host.html` | Shared display UI and game rendering |
| `public/player.html` | Phone UI and player controls |
| `public/tv.html` | TV room creation and recovery entry point |
| `public/js/`, `public/css/` | Shared browser helpers, game metadata, audio, styles |
| `android-tv/` | Android WebView app; read its README before building |
| `tests/` | Engine, session, transport, integration, fetcher, and frontend tests |
| `README.md` | Project overview, game catalog, setup and development guide |
| `public/images/` | Current brand assets |
| `smallhours-light-lobby/` | Current lobby design reference |

## Architecture and contracts

The flow is **transport → session → engine**. Game rules and state transitions belong in the engine; network and filesystem work belong outside it. Keep game state and action payloads JSON-compatible. Use event-driven updates; timers feed synthetic actions into the engine rather than adding a polling tick loop.

Game definitions are plain objects, not subclasses:

```js
export default {
  setup({ players, config }) { /* return initial state */ },
  actions: {
    move(state, { playerId, ...payload }) { /* return { state, events } */ },
  },
  view(state, playerId) { /* return the state this viewer may see */ },
  endIf(state) { /* return null, or the end result such as { winner, scores } */ },
};
```

`processAction` returns `{ game, events }`; an action handler returns `{ state, events }`. Preserve immutable state updates. Use `template.js` or `number-guess.js` as a small reference, then inspect a game with similar rules.

- Clients connect to `/ws/host/:code` or `/ws/player/:code`.
- Actions use `{ type: 'GAME_ACTION', action: { type: '<action-name>', ...payload } }`.
- Treat socket identity as authoritative; inspect existing authorization and validation before adding handlers.
- Preserve private information in per-player views: hands, answers, and hidden roles must only reach their intended viewers. Inspect the host broadcast path separately.
- Keep game scores, session scores, and the shared scoreboard consistent. Inspect the scoreboard tests when changing result shapes.
- Preserve reconnect, disconnect grace, admin reclaim, and timer cancellation behavior when changing lifecycle code.

## Adding or changing a game

1. Implement rules in `src/engine/games/` and cover legal moves, invalid moves, private views, and end conditions as appropriate.
2. Register the definition and metadata in `GAME_REGISTRY` in `src/session/room.js`, and re-export it from `src/engine/games/index.js`.
3. Inspect `public/js/games.js` plus host and player rendering/dispatch. Both screens need usable states and controls.
4. If the game needs fetched content, prepare it in the session/transport flow. If it needs phase timers, inspect `GAME_PHASE_DURATIONS` in `ws-adapter.js` and existing timer tests.
5. Check lobby selection, start, actions, scoring, end, and return to lobby. Update affected integration tests.

The `question-form` game is an optional in-app polling tool. Its definition and tests document question types and the answering/review flow; it is not required for ordinary development discussions.

## Frontend conventions

Browser helpers are loaded by plain `<script>` tags and expose globals. Check script order and existing helpers before adding another module or dependency. For UI changes, verify the shared display and phone layout, including reconnect and finished-game states when affected.

Card rendering lives in `public/js/cards.js` with SVGs/audio under `public/cards/`. Engine suits are `h`, `d`, `c`, `s`; ranks are numeric. Shithead's Ace-high rank 14 maps to the same card image as rank 1. Reuse the renderer and existing audio helpers.

Use `smallhours-light-lobby/` as the lobby design reference. Current shared styling lives in `public/css/`; brand images live in `public/images/`.

## Verification

Run focused tests for the behavior changed, then `npm test` for changes spanning shared rules, transport, or lifecycle. Documentation-only edits need path/command checks rather than a server restart.

- `tests/engine/game-harness.js`: `createTestGame`, `act`, `actChain`, `viewFor`, `isOver`, `playUntilEnd`. `act` returns `{ game, events }`; `isOver` returns the end result or `null`.
- `src/engine/games/shithead.test.js` is a co-located exception; other tests are under `tests/`.
- Frontend tests exercise browser code with lightweight test setups. Inspect the affected test's environment; do not assume every frontend test uses JSDOM.
- For UI changes, report whether browser/phone/TV behavior was actually checked. A passing unit test does not establish visual correctness.
- `/health` reports status, version, commit, uptime, room count, and player count.

## Runtime data and integrations

Preserve `.env`, `data/`, question files, local music, generated APKs, and Android signing keys. `data/` holds runtime caches and is mounted into the container. Inspect fetcher code/tests before changing cache formats or fallback behavior.

Gemini TTS uses `GEMINI_API_KEY`. Room creation can send a Discord webhook when `DISCORD_WEBHOOK_URL` is set. Tests and manual room creation should account for that external effect. Discord payloads must include both `content` and `embeds` so push notifications contain text.

## Deployment

Local context: server `10.10.0.21`, project `/opt/small-hours`. Confirm the executor/target before applying operational commands; do not assume a local workspace is the production host.

For completed and verified **application changes**, the established project preference is to rebuild and restart with `docker compose build && docker compose up -d`, then check `/health`. Source is baked into the image, so restarting alone does not apply source changes. This does not apply to documentation-only changes.

The repository also supports registry deployments: `.github/workflows/docker.yml` tests and publishes GHCR images on main and version tags. `./update.sh [tag]` pulls Git and the configured image, seeds questions, and restarts. Use it for registry updates or rollback; it does not deploy uncommitted local source changes. Inspect the script before running it in a dirty checkout.

Environment-only changes require container recreation rather than an image rebuild. Read `docker-compose.yml` for the actual mounts, image, and health check. Restarting the server interrupts in-memory rooms.
