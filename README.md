<p align="center">
  <img src="public/images/smallhours-logo.png" alt="Smallhours — Good games. Better together." width="460">
</p>

# Small Hours Games

**Real-time party games for one TV and a few phones.**

The TV runs the show and everyone plays from their phone's browser. No accounts, no app to install, no missing controller.

## Quickstart

Needs Node.js 22 or later.

```bash
git clone https://github.com/small-hours-games/small-hours.git
cd small-hours
npm install
npm start
```

You should see:

```text
Small Hours server listening on port 3001
  Local:   http://localhost:3001
  Health:  http://localhost:3001/health
```

Open `http://<your-computer's-address>:3001/tv` on the TV, then scan the QR code with your phones. That's game night.

## What is small-hours?

Small Hours turns a living room into a game show. One shared screen (a TV, a monitor, a projector) shows the questions, the board and the scores; up to 20 players join from their phones with a four-letter room code and play in the browser. It is for friends and families on the same couch, and it replaces passing one controller around or everyone squinting at a laptop.

You host it yourself: on a laptop for one evening, or on a small home server that is always on.

## Key features

- **Five games in the lobby.** Quiz, Music Quiz, Palace, Gin Rummy and Sjuan, from 1 to 20 players.
- **Phones are the controllers.** Players join with a code or a QR code; nothing to install.
- **Play alone against AI.** A lone player can start Palace or Gin Rummy against AI opponents while the others arrive.
- **A host that talks.** Questions and reveals are read aloud on the TV (Gemini voice, or the browser's own speech).
- **Votes, chat and avatars.** Players vote for the next game and category, chat, and see who picked which answer.
- **Lobby music with a show.** Local tracks play on the TV; songs with a beat map light up the top bar with a dancing singer, fire over the logo and dancing mascots.
- **Survives a refresh.** A player who reloads within 30 seconds comes back as the same player.
- **Android TV app.** Opens the TV screen fullscreen and keeps the screen awake.

## Prerequisites

| What | Version | Check |
| --- | --- | --- |
| Node.js | 22 or later | `node --version` |
| npm | comes with Node.js | `npm --version` |
| Git | any recent | `git --version` |
| Docker with Compose (optional, for a server) | Compose v2 | `docker compose version` |

The TV and the phones must be on the same network as the computer running the server. Internet access is needed for trivia questions, Music Quiz previews and the fonts and libraries the screens load from a CDN.

## Installation

```bash
git clone https://github.com/small-hours-games/small-hours.git
cd small-hours
npm install
npm start
```

Check that it works:

```bash
curl http://localhost:3001/health
# {"status":"ok","version":"2.14.0",...}
```

Then find the computer's address on your network (for example `192.168.1.50`) and use that on the TV and phones: `http://192.168.1.50:3001`. `localhost` on a phone means the phone itself.

## How to play

1. Open `/tv` on the shared screen. It creates a room and shows a room code and a QR code. (Already have a room? Open `/host/CODE`.)
2. Players scan the QR code or open the address on their phones and enter the code.
3. Everyone picks a name and an avatar and votes for the next game. The first player to join is the room admin.
4. The admin starts the game. Quiz first asks for a category; Music Quiz starts straight away.

The TV shows the questions, reveals, live scores and party chat. Phones hold the answers and the game controls.

### Games

| Game | Players | What you're getting into |
| --- | --- | --- |
| 🎯 **Quiz** | 1–20 | Vote for a category, race the timer, defend your trivia reputation. |
| 🎵 **Music Quiz** | 1–20 | Hear the clip, name the artist or song, try not to sing along. |
| 👑 **Palace** | 1–6 | Get rid of your cards, don't be the last one left. Alone? Play 1–4 AI opponents. |
| ♠️ **Gin Rummy** | 1–2 | Build sets and runs, watch the discards, knock low. Alone? Play Robo, the AI. |
| 7️⃣ **Sjuan** | 2–8 | Build out from the sevens and be first out. |

AI seats are only added for a lone player and never earn session points.

## Examples

**A game night on your laptop.** Start the server and point the TV at it:

```bash
npm start
# TV:     http://192.168.1.50:3001/tv
# Phones: scan the QR code on the TV
```

**An always-on home server with Docker** (Linux host):

```bash
cp .env.example .env          # optional settings, see Configuration
docker compose build
docker compose up -d
curl http://localhost:3001/health
```

**Your own lobby music.** Drop audio files in `music/lobby/` and reload the TV page:

```bash
cp ~/Music/our-party-song.mp3 music/lobby/
# Docker: the music is built into the image, so rebuild
docker compose build && docker compose up -d
```

**A topbar show for a song.** Make a beat map for a lobby track and list it in `TBS_SHOWS` in `public/js/topbar-show.js`:

```bash
pip install librosa
python3 scripts/song-beatmap.py music/lobby/our-party-song.mp3 --drop 20.0 --title "Our Party Song" \
  > public/shows/our-party-song.json
```

## Configuration

Copy `.env.example` to `.env` to change a setting. Nothing is required: the games play without any key.

| Setting | Where | Default | What it changes |
| --- | --- | --- | --- |
| `PORT` | `.env` | `3001` | HTTP and WebSocket port. |
| `DOMAIN` | `.env` | `localhost:3001` | Address used in room-created notification links. |
| `GEMINI_API_KEY` | `.env` | none | Turns on the Gemini game-show voice. Without it the TV uses the browser's speech where available. |
| `DISCORD_WEBHOOK_URL` | `.env` | none | Posts a Discord message when a room is created. |
| `IMAGE_TAG` | `.env` | `latest` | Which published Docker image `update.sh` and Compose use. |
| `showDelay` | TV address, `?showDelay=150` | `0` ms | Delays the topbar show to match a TV whose sound lags the picture. Saved on that TV. |
| Lobby music | `music/lobby/` | the tracks in the repo | Songs played on the TV in the lobby (`.mp3`, `.ogg`, `.m4a`, `.wav`). |
| Game music | `music/quiz-card/` | the tracks in the repo | Songs played during games that use music. |

Trivia comes from OpenTrivia DB and is cached in `data/`. Music Quiz uses Deezer playlists and previews; availability depends on that service.

## Troubleshooting

**The phone says "This site can't be reached."**
The phone is using `localhost` or a different network. Use the server computer's network address (`http://192.168.1.50:3001`), keep the phone on the same Wi-Fi, and allow port 3001 in the computer's firewall.

**`Error: listen EADDRINUSE: address already in use :::3001`**
Something else uses port 3001, often an earlier `npm start`. Stop it, or pick another port:

```bash
PORT=3002 npm start
```

**No sound on the TV.**
Browsers block audio until the page has been touched. Press a key or click once on the TV page, and check the Sound button in the top bar. For Music Quiz on a phone, tap "Tap to hear".

**A lobby song stops early, or the topbar show runs without music.**
The MP3 has no length header, so the browser guesses its length wrong. Rewrite the header without re-encoding:

```bash
ffmpeg -i song.mp3 -c copy -write_xing 1 song-fixed.mp3
```

**`Failed to fetch questions`** when a quiz starts.
The server cannot reach OpenTrivia DB. Check the server's internet connection; categories already cached in `data/` still work.

## Running a server

The Compose setup uses host networking and keeps runtime data in `./data`, so rebuilding keeps caches and speech audio. After changing the code, rebuild and restart:

```bash
docker compose build && docker compose up -d
```

The front page footer and `/health` show the running version and commit, so you can see that a deploy is live. Reload the TV and phones after an update.

To deploy a published image from GitHub Container Registry instead, use [`update.sh`](update.sh): `./update.sh` for `latest`, or `./update.sh 2.14.0` to deploy or roll back to a release.

Rooms, scores and reconnect identities live in memory: a restart ends the current sessions, and the TV page makes a new room.

## Under the hood

JavaScript end to end: **Node.js, Express and WebSockets** on the server; plain HTML, CSS and browser JavaScript on the screens, with no frontend build step. The game engine is a pure function, `(state, action) → { newState, events }`.

| Folder | What lives there |
| --- | --- |
| `src/transport/` | HTTP routes, WebSocket messages, rate limits, broadcasts. |
| `src/session/` | Rooms, players, lobby votes, game lifecycle. |
| `src/engine/` | Game rules, actions, scoring, private player views. |
| `games/` | One folder per game, found by the server at startup. |
| `public/` | The TV, phone and landing pages and shared assets. |
| `src/fetcher/` | Trivia, music, caching and speech. |
| `tests/` | Engine, session, transport, integration and frontend tests. |
| `android-tv/` | The Android TV app ([build instructions](android-tv/README.md)). |

[`AGENTS.md`](AGENTS.md) describes the conventions in more detail.

## Contributing

```bash
npm install
npm run dev     # restart the server when a file changes
npm test        # the full test suite (Vitest)
```

1. Branch from `main`.
2. Make the change with tests. To add a game, copy `games/_template/` and follow [`games/README.md`](games/README.md).
3. Raise the version once per push: `npm version patch --no-git-tag-version` for fixes, `minor` for features.
4. Open a pull request against `main`. CI runs the tests and checks that the version went up.

Keep game rules in the engine, private information (hands, answers) out of other players' views, and the next round easy to start.

## Roadmap

- **Next:** screens for Högt/Lågt and Uno, which already exist in the engine but are hidden from the lobby.
- **Out of scope today:** user accounts and saved profiles (rooms live in memory by design), and a native phone app (the browser is the controller).

Ideas and bugs go in [GitHub issues](https://github.com/small-hours-games/small-hours/issues).

## License

No open-source license has been chosen yet, so all rights are reserved by the authors. Ask before reusing the code. The card faces in `public/cards/faces/` are Chris Aguilar's Vector Playing Cards, under LGPL-3.0.

---

**Good games. Better together.**
