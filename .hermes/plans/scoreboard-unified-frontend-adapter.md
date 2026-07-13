# Plan: Unified host scoreboard (frontend adapter, engine untouched)

**Approved approach:** Väg B — no engine/game `view()` changes. All scoreboard
normalization lives in one frontend function.

## Audit findings (why the scoreboard is inconsistent today)

Server sends `GAME_STATE = { ...view(playerId), playerNames }` to the host.
`host.html` renders a shared sidebar via `renderScoreboard(scores, playerNames)`
that **always** sorts descending and labels the value as a raw number.

The `scores` field means different things per game, and sort direction happens
to be "higher = better" for all five — so sorting is fine, but the *label* and
*supplementary info* are wrong/inconsistent:

| Game | `scores` meaning | Problem in sidebar |
|------|------------------|--------------------|
| quiz | accumulated points | OK, but no round label |
| spy | accumulated points | OK, but no round label |
| gin-rummy | box/cumulative points | OK, but no hand label |
| shithead | `players.length - pos` (placement) | Shows a number that is really a rank; no "OUT" badge for finished players |
| number-guess | `maxRounds - guesses` ("guesses left") | Number is meaningless as a score; should read "N guesses left" |

Extra problems:
- `renderNumberGuess` and `renderTemplate` draw their **own** embedded score list
  (host.html:861-863, :1007-1019) *in addition to* the sidebar → double rendering.
- No unified round/status line ("Question 3/10", "Hand 2", "Round 4/10").

## Solution

Add one pure function in `host.html` (same scope as `renderScoreboard`):

```js
function getScoreboardData(msg, gameType) {
  // returns {
  //   roundLabel: string | null,   // localized: "Fråga 3 / 10", "Hand 2", "Round 4 / 10"
  //   status: string | null,       // "Spelar" | "Klart"
  //   entries: [{ id, name, valueText, rank, isOut }]  // already sorted best-first
  // }
}
```

Per-game mapping (all already sort descending correctly):
- quiz: valueText = `${score} p`; roundLabel = `Fråga ${currentQuestion+1} / ${totalQuestions}`
- spy: valueText = `${score} p`; roundLabel = `Round ${round} / ${totalRounds}`
- gin-rummy: valueText = `${score} p`; roundLabel = `Hand ${handNumber}`
- shithead: valueText = `Plats ${rank}` using finishOrder; isOut = finishOrder.includes(id); roundLabel = null
- number-guess: valueText = `${guessesLeft} gissningar kvar` (guessesLeft = maxRounds - guesses); roundLabel = `Round ${round} / ${maxRounds}`

`renderScoreboard(msg, gameType)` calls `getScoreboardData` and renders the
unified sidebar (rank gold/silver/bronze, name, valueText, optional "OUT" badge).

Remove the embedded score lists in `renderNumberGuess` (host.html:861-863) and
`renderTemplate` (host.html:1007-1019) — the sidebar owns scoring now.

## Files touched
- `public/host.html` — add `getScoreboardData`, update `renderScoreboard`, remove duplicate embedded score lists, pass `state.gameType` into `renderScoreboard`.
- `tests/frontend/scoreboard-adapter.test.js` — NEW: polyfills `getScoreboardData` (matches repo convention in `scoreboard-panel.test.js`), asserts per-game output shape, rank labels, isOut for shithead, "gissningar kvar" for number-guess, and CSS contract in `style.css`.

## Verification
- `npm test` (vitest) — all suites green, new adapter suite passes.
- Manual sanity: `npm start`, open host screen, play one round of quiz + shithead, confirm sidebar shows correct labels and no duplicate list.
