<p align="center">
  <img src="public/images/Shg-gemeni-trans.png" alt="Small Hours Games" width="220">
</p>

# Small Hours Games

**One TV. A few phones. “Just one more round.”**

Turn your living room into a game night. Small Hours is a real-time multiplayer party game platform: the big screen runs the show, and everyone plays from their phone. No accounts, no phone app, no hunting for the missing controller.

Bring your friends. Bring questionable trivia confidence. Stay for the music round.

## Get the party started

1. Open `/tv` on the shared screen to create a room automatically. Already have a room? Open `/host/CODE` instead.
2. Join from your phones using the four-character room code or the QR code on the TV.
3. Pick a nickname and vote for an activity. The first player to join becomes the room admin.
4. Let the admin start the game. Quiz first opens a category vote; Music Quiz goes straight to its countdown.

You can also create or join a room from the home page. Keep the TV and phones in the same room—the code is what connects them.

The TV shows the questions, reveals, live scores, and party chat. Your phone holds your answers and game controls. Player avatars follow the action, so you can spot who picked *that* answer.

## Pick your next obsession

These games are available in the dashboard:

| Game | Players | What you're getting into |
| --- | --- | --- |
| 🎯 **Quiz** | 1–20 | Vote for a category, race the timer, and defend your trivia reputation. |
| 🎵 **Music Quiz** | 1–20 | Hear the clip. Name the artist or song. Try not to sing the answer out loud. |
| 🃏 **Shithead** | 2–6 | Empty your cards and avoid being the last player standing. |
| ♠️ **Gin Rummy** | 2–4 | Build your hand, watch the discards, and pick your moment. |

Music Quiz mixes genres and decades, rotates songs, and builds believable alternatives from the same playlist. Each quiz starts with a five-second countdown; music clips fade in for one second and out over the final two seconds of the question.

The engine also includes Number Guess, Spy, Högt/Lågt, Sjuan, Uno, Yatzy, Labyrint, SkogAI, a question-form tool, and a starter template. Dashboard availability is controlled separately in [`public/js/games.js`](public/js/games.js).

## Small touches, better game nights

- **Vote together.** Players choose the next activity and trivia category from their phones.
- **See the reveal.** Quiz answers show who guessed what, with player names and avatars.
- **Keep the banter going.** Party chat shows player names and avatars. On the TV it sits beneath the players in the lobby, then moves below the scoreboard during games.
- **A lighter lobby.** White panels, soft blue backgrounds, colored activity cards, and a compact TV layout that keeps longer lists inside scrollable panels.
- **A soundtrack while you wait.** Local tracks play quietly through the TV in the lobby and stop when gameplay starts. The little animal mascots sway at 136 BPM while music is audible. Reduced-motion preferences are respected.
- **Accidental refresh?** Rejoin as the same player within the 30-second disconnect grace period, using the same browser with local storage available.
- **Questions that rotate.** Unseen questions and songs come first; older picks return when the available pool runs out. History lasts for the room session.
- **A proper TV option.** The [Android TV app](android-tv/README.md) opens the host display fullscreen and keeps the screen awake.

## Run your own game night

### With Node.js

Requires **Node.js 22+** and npm.

```bash
git clone https://github.com/small-hours-games/small-hours.git
cd small-hours
npm install
npm start
```

Open **http://localhost:3001**. On phones and the TV, use the server computer's local network address, for example `http://192.168.1.50:3001`. Devices must be able to reach the server; `localhost` on a phone points to the phone itself.

Internet access is needed for external trivia, Music Quiz previews, and CDN-hosted frontend assets. Lobby music comes from local files.

### With Docker Compose

Build and run the checked-out source:

```bash
docker compose build
docker compose up -d
```

The Compose setup uses host networking and is intended for a Linux host. Runtime data is mounted in `./data`.

To update a source deployment after changing the code, rebuild and restart with the same commands. Check the server with:

```bash
curl http://localhost:3001/health
```

For published images, [`update.sh`](update.sh) pulls the configured GHCR image, seeds questions, and restarts the service. Pass a released tag to deploy or roll back to that version:

```bash
./update.sh              # IMAGE_TAG from .env, or latest
./update.sh 2.1.0        # example: requires this image tag to exist
```

### Optional settings

Copy `.env.example` to `.env` if you want to customize the server. Core play does not require an API key.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP and WebSocket port; defaults to `3001`. |
| `DOMAIN` | Domain used in room notification links. |
| `GEMINI_API_KEY` | Optional generated speech. Replace the example placeholder to enable it. |
| `DISCORD_WEBHOOK_URL` | Optional notification when a room is created. |
| `IMAGE_TAG` | Published Docker image tag; defaults to `latest`. |

Trivia comes from OpenTrivia DB and is cached on disk. Music Quiz uses Deezer playlists and playable previews; availability depends on the upstream service.

## Sound, music, and your own tracks

**Lobby music** plays through the TV at 12% volume. Tracks rotate while everyone joins and votes, pause when a game starts (including its countdown), and resume when the display returns to the lobby. Phones stay quiet for the lobby soundtrack.

To change the playlist:

1. Add or remove audio files in [`music/`](music/). Supported extensions: `.mp3`, `.ogg`, `.m4a`, and `.wav`; playback support depends on the browser.
2. For Docker deployments, rebuild and restart—the music folder is baked into the image.
3. Refresh the TV page to reload the playlist.

The server discovers the files automatically through `/api/lobby-music`. No playlist configuration or API key is required for local music.

**Music Quiz** plays Deezer previews on the TV and phones. TV sound is controlled by the header's Sound button; phones have their own sound control. If a browser blocks autoplay, tap or press a key on the TV page, or use the phone's “Tap to hear” button.

## Data and updates

- `data/` contains generated trivia caches and speech audio. It is ignored by Git and mounted into Docker, so rebuilding the image preserves it.
- Rooms, scores, and reconnect identities live in memory. A server restart ends current sessions; the TV entry page can create a new room.
- `music/` contains the local lobby soundtrack. Android signing keys, build output, and APK copies are ignored by Git; see the [Android TV instructions](android-tv/README.md) for building and signing.
- The original light-lobby mockup lives in [`smallhours-light-lobby/`](smallhours-light-lobby/). Its demo interactions are local only; the application uses the existing WebSocket backend.
- GitHub Actions runs tests and publishes GHCR images from `main` and version tags. Pulling an image and building local source are separate deployment paths; use the commands above for the one you need.

After a frontend update, refresh both TV and phone pages so they load the new JavaScript and styles.

## Under the hood

JavaScript, end to end. **Node.js + Express + WebSockets** on the server; vanilla HTML, CSS, and browser JavaScript on the screens. No frontend build step.

The engine is a pure function:

```text
(state, action) → { newState, events }
```

Three layers keep the responsibilities clear:

| Layer | Responsibility |
| --- | --- |
| `src/transport/` | HTTP routes, WebSocket messages, rate limiting, and broadcasting. |
| `src/session/` | Rooms, players, lobby votes, and game lifecycle. |
| `src/engine/` | Game rules, actions, scoring, and private player views. |

Game timers arrive as synthetic actions from the session/transport side. The engine doesn't need to know whether a player is holding a phone or looking at a TV.

Useful places to start:

- [`public/`](public/) — landing page, phone controller, TV display, and shared assets.
- [`public/css/light-lobby.css`](public/css/light-lobby.css) — shared light-lobby styling and compact TV layout.
- [`public/js/lobby-music.js`](public/js/lobby-music.js) — TV lobby playback and mascot motion state.
- [`music/`](music/) — local lobby tracks.
- [`src/engine/games/`](src/engine/games/) — game definitions, including the minimal [`template.js`](src/engine/games/template.js).
- [`src/fetcher/`](src/fetcher/) — trivia, music, caching, and speech fetching.
- [`tests/`](tests/) — engine, session, transport, integration, and frontend tests.
- [`android-tv/`](android-tv/) — Android TV app source and build instructions.
- [`AGENTS.md`](AGENTS.md) — repository conventions and development guidance.

## Build the next round

```bash
npm run dev              # restart the server when source files change
npm test                 # run the full Vitest suite
npm run test:watch        # rerun tests while working
npx vitest run tests/engine/quiz.test.js
```

To add a game, start with `src/engine/games/template.js`. Define `setup`, `actions`, `view`, and `endIf`, register it in `src/session/room.js`, and export it from `src/engine/games/index.js`. Add phone and TV renderers, tests, and a dashboard entry when it's ready to play.

Keep rules in the engine, secrets out of player views, and the next round easy to start.

---

**Good games. Better together.**

*Party games best played in the small hours.*
