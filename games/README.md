# Games

Every folder here is one game. The server finds them at startup, so adding a game means adding a folder and nothing else. Folders starting with `_` are skipped.

## Add a card game

1. Copy `_template/` to `games/<id>/`, and set `id` in `index.js` to that same name. Rename the screen's ids and functions (`ex...`) so they do not clash with another game.
2. Change the rules in `rules.js`, and keep its test passing.
3. Change the screens in `client/`. Cards, hands, gestures and seats come from `public/js/table-cards*.js`.
4. Start the server. The game is in the lobby.

Set `hidden: true` while a game has no screens.

## What is in a game folder

| File | What it does |
| --- | --- |
| `index.js` | The manifest: name, players, and the options below |
| `rules.js` | `setup`, `actions`, `view`, `endIf`. Use `src/cards/deck.js` for cards |
| `bot.js` | Optional AI: `(state, botId) -> action or null` |
| `client/phone.js`, `client/phone.html` | The phone screen |
| `client/tv.js` | The TV screen |
| `client/style.css`, `client/lib/*.js` | Optional styles and helpers |

Manifest options: `order`, `title`, `icon`, `blurb`, `soloBlurb`, `hidden`, `music`, `phases` (timed phases), `story` (intro on the TV), `privateKeys`, and `ai: { default, max, cardsPerSeat, choose, delay }`.

The screens register themselves with `SH.registerGame`; `public/js/game-api.js` lists the hooks. Do not edit `host.html` or `player.html` for one game: if a game needs something new, add it to the shell as something every game can use.

Fields in a view named `my*`, plus `isMyTurn` and the manifest's `privateKeys`, never reach the TV.
