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
| `games/<id>/` | One game each: `index.js` manifest, `rules.js`, optional `bot.js`, tests, and `client/` (`phone.js`, `tv.js`, `phone.html`, `style.css`, `lib/`) |
| `src/games/registry.js`, `client.js` | Find and validate the games; write their scripts, styles and phone section into the pages |
| `public/js/game-api.js` | The contract between the pages and a game's client code |
| `src/fetcher/` | Trivia, disk caches, Gemini TTS narration, Deezer/music playlists |
| `src/notifications/discord.js` | Room-created webhook |
| `public/host.html` | Shared display shell: lobby, scoreboard, music, story |
| `public/player.html` | Phone shell: joining, voting, chat, reconnect |
| `public/tv.html` | TV room creation and recovery entry point |
| `public/js/`, `public/css/` | Shared browser helpers, game metadata, audio, styles |
| `android-tv/` | Android WebView app; read its README before building |
| `tests/` | Engine, session, transport, integration, fetcher, and frontend tests |
| `README.md` | Project overview, game catalog, setup and development guide |
| `public/images/` | Current brand assets |

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

`processAction` returns `{ game, events }`; an action handler returns `{ state, events }`. Preserve immutable state updates. Use `games/_template/` as a small reference, then inspect a game with similar rules.

- Clients connect to `/ws/host/:code` or `/ws/player/:code`.
- Actions use `{ type: 'GAME_ACTION', action: { type: '<action-name>', ...payload } }`.
- Treat socket identity as authoritative; inspect existing authorization and validation before adding handlers.
- Preserve private information in per-player views: hands, answers, and hidden roles must only reach their intended viewers. Host/TV sockets get `getHostView` (`src/transport/host-view.js`): a game's optional `hostView(state)`, or the first player's view minus `my*` and `isMyTurn` and the manifest's `privateKeys`. Name new private fields `my*` or list them in the manifest as `privateKeys`.
- Keep game scores, session scores, and the shared scoreboard consistent. Inspect the scoreboard tests when changing result shapes.
- Preserve reconnect, disconnect grace, admin reclaim, and timer cancellation behavior when changing lifecycle code.

## Adding or changing a game

See `games/README.md`.

1. Make a folder `games/<id>/`, implement the rules there, and cover legal moves, invalid moves, private views, and end conditions as appropriate.
2. Export the manifest from `games/<id>/index.js` (see the other games). The server finds it by itself; `hidden: true` keeps a game without screens out of the lobby.
3. Add `client/phone.js`, `client/tv.js` and `client/phone.html` and call `SH.registerGame` (see `public/js/game-api.js`). Do not edit the shell pages for one game. Both screens need usable states and controls.
4. If the game needs fetched content, prepare it in the session/transport flow. Phase timers go in the manifest as `phases`; see the quiz.
5. Check lobby selection, start, actions, scoring, end, and return to lobby. Update affected integration tests.

## Frontend conventions

Browser helpers are loaded by plain `<script>` tags and expose globals. Check script order and existing helpers before adding another module or dependency. For UI changes, verify the shared display and phone layout, including reconnect and finished-game states when affected.

A lone player can play Gin Rummy and Palace against AI seats: games with `ai` in their manifest, `room.bots` (`bot_N` ids, never in `room.players`, so they get no session score), and `scheduleBotTurn` in `ws-adapter.js`, which plays each AI move after a short pause through the same `applyGameAction` path as people. Keep bot moves legal: `tests/engine/bots.test.js` plays full bot games and fails on any engine error.

Card games use `src/cards/deck.js` on the server and the card-table kit `public/js/table-cards.js` (with `table-cards-phone.js` and `table-cards-tv.js`) + `public/css/table-cards.css` (vector cards, stacks, 2-row rack/fan, tap / swipe-up / drag gestures, hand ordering), shared by phone and TV. The phone hand lifts and enlarges the card under the thumb (press and slide, let go to pick), and a big Palace hand stacks same ranks with a ×N count. Four-colour suits (clubs blue, diamonds orange) are on by default on the TV and a toggle on the phone (`tcSetFourColour`); the A–10 art for them lives in `public/cards/faces-4c/`, made by `node scripts/four-colour-faces.js`. Card sounds are in `public/js/card-sounds.js`, with SVGs and audio under `public/cards/`. Engine suits are `h`, `d`, `c`, `s`; ranks are numeric. Shithead's Ace-high rank 14 maps to the same card image as rank 1. Reuse the renderer and existing audio helpers.

The TV plays music from `music/`: `music/lobby/` is served by `/api/lobby-music` for the lobby and join screen, and `music/quiz-card/` by `/api/game-music` for games with `music: true` in their manifest. Both use `createLobbyMusic` (`public/js/lobby-music.js`, volume, fades, rotation); `setDucked` lowers the game music while the quiz narrator or a game story speaks.

Shared styling lives in `public/css/`; brand images live in `public/images/`.

## Verification

Run focused tests for the behavior changed, then `npm test` for changes spanning shared rules, transport, or lifecycle. Documentation-only edits need path/command checks rather than a server restart.

- `tests/engine/game-harness.js`: `createTestGame`, `act`, `actChain`, `viewFor`, `isOver`, `playUntilEnd`. `act` returns `{ game, events }`; `isOver` returns the end result or `null`.
- Game tests live next to the game in `games/<id>/`; other tests are under `tests/`.
- Frontend tests exercise browser code with lightweight test setups. Inspect the affected test's environment; do not assume every frontend test uses JSDOM.
- For UI changes, report whether browser/phone/TV behavior was actually checked. A passing unit test does not establish visual correctness.
- `/health` reports status, version, commit, build time, uptime, room count, and player count. `/api/version` returns the same build info for the front-page footer; see `src/version.js`.

## Runtime data and integrations

Preserve `.env`, `data/`, local music, generated APKs, and Android signing keys. `data/` holds runtime caches and is mounted into the container. Inspect fetcher code/tests before changing cache formats or fallback behavior. Quiz plays from easy-only buckets (`data/questions/{category}_easy.json`, filled at startup) and uses the mixed `{category}.json` buckets when they run out.

Gemini TTS uses `GEMINI_API_KEY`. Room creation can send a Discord webhook when `DISCORD_WEBHOOK_URL` is set. Tests and manual room creation should account for that external effect. Discord payloads must include both `content` and `embeds` so push notifications contain text.

## Deployment

Local context: server `10.10.0.21`, project `/opt/small-hours`. Confirm the executor/target before applying operational commands; do not assume a local workspace is the production host.

For completed and verified **application changes**, the established project preference is to rebuild and restart with `docker compose build && docker compose up -d`, then check `/health`. Source is baked into the image, so restarting alone does not apply source changes. This does not apply to documentation-only changes.

The repository also supports registry deployments: `.github/workflows/docker.yml` tests and publishes GHCR images on main and version tags. `./update.sh [tag]` pulls Git and the configured image, seeds questions, and restarts. Use it for registry updates or rollback; it does not deploy uncommitted local source changes. Inspect the script before running it in a dirty checkout.

Versioning: `package.json` `version` is the release number shown on the front page and in `/health`; the commit comes from `GIT_SHA` (CI) or the checkout's `.git` refs, which `.dockerignore` keeps for local builds. **Every push of commits raises the version** in that same push: `npm version patch --no-git-tag-version` for fixes, docs and chores, `minor` for features (`major` only when asked). Bump once per push, in the last commit before pushing; it updates `package.json` and `package-lock.json`. The version is shown in the TV/host header and on the front page, so each deploy is identifiable. `.github/workflows/version-check.yml` fails a PR whose version is not higher than `main`'s. Tags are optional: `npm version <level>` (commit plus `vX.Y.Z` tag) and `git push --follow-tags` also publish a semver image; CI fails a tag that does not match `package.json`.

Environment-only changes require container recreation rather than an image rebuild. Read `docker-compose.yml` for the actual mounts, image, and health check. Restarting the server interrupts in-memory rooms.

<!-- trail:start -->
## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->
