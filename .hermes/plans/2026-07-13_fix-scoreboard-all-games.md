# Fix Scoreboard for All Games — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the host-screen scoreboard render consistently for every game by guaranteeing each game's `view()` emits a uniform `scores` field, and show player names instead of raw IDs.

**Architecture:** The host screen (`public/host.html`) already has a `renderScoreboard(msg.scores)` function that fires only when `msg.scores` is present. The transport layer broadcasts `getView(room.game, <firstPlayerId>)` to hosts, so whatever a game's `view()` returns is what the scoreboard sees. Two of the four card games (`shithead`, `gin-rummy`) omit `scores` from their `view()`, leaving the panel blank during play. The fix is entirely in the game `view()` functions (plus one small host-side name-resolution tweak) — no engine or transport changes needed.

**Tech Stack:** Node 22, ESM, vanilla browser JS (host.html). Tests via Vitest using `tests/engine/game-harness.js` (`createTestGame`, `viewFor`).

---

## ⚠️ Precondition: reconcile working-tree WIP first

A prior `requesting-code-review` session (`@session:developer/20260713_060839_d3ddd2`) left **8 uncommitted files** in the working tree and refactored transport:

- The **live** WS handlers now live in `src/transport/handlers/{game,lobby,chat,vote}.js`. A large **dead duplicate** handler block was deleted from `src/transport/ws-adapter.js` (that file is now 447 lines; the host-broadcast code that used to sit at `ws-adapter.js:144-147` no longer exists there).
- Uncommitted modified files: `src/fetcher/question-file.js`, `src/server.js`, `src/session/room.js`, `src/transport/handlers/game.js`, `src/transport/handlers/lobby.js`, `src/transport/http.js`, `src/transport/ws-adapter.js`, `tests/transport/ws-adapter.test.js`.
- **Baseline: 463 tests passing** (21 files), server boots, `/health` OK — captured at end of that session.

**Action before starting Task 1:** commit or stash that WIP so the scoreboard changes land on a clean, known-good base and this plan's diffs stay isolated. Recommended:
```bash
cd /opt/data/small-hours
git add -A && git commit -m "[verified] refactor transport handlers + code-review fixes"   # 463 tests green
```
Then proceed. The scoreboard work below does **not** depend on the transport refactor, but a clean tree makes review/rollback sane.

---

## Current State (verified by reading the code)

| Game | `scores` in `view()`? | Scoreboard during play |
|------|----------------------|------------------------|
| `quiz` (`src/engine/games/quiz.js:303`) | ✅ `scores: { ...state.scores }` | Works |
| `spy` (`src/engine/games/spy.js:235`) | ✅ `scores: { ...state.scores }` | Works |
| `shithead` (`src/engine/games/shithead.js:396`) | ❌ only in `endIf` | **Blank** |
| `gin-rummy` (`src/engine/games/gin-rummy.js:703`) | ❌ only `finalScores` in `scoring`/`finished` | **Blank during play** |

Host render path (verified against current working tree, post-refactor):
- `src/transport/handlers/game.js:114-125` (`handleGameAction`) — host `sharedState = { ...getView(room.game, firstPlayerId), playerNames }`, then deletes `my*`/`isMyTurn`/`swapConfirmed` fields. **`scores` is preserved** if the view emits it. This is the per-action broadcast that drives the live scoreboard.
- `src/transport/handlers/game.js:141` — at game end the host gets `{ phase:'finished', ...endResult, playerNames }` **without** spreading `hostView`; the finished-state scoreboard therefore relies entirely on `endResult.scores` (all 4 games' `endIf` provide it, so finish is fine — the gap is *during* play).
- `public/host.html:822` — `if (msg.scores) renderScoreboard(msg.scores);`
- `public/host.html:1308-1318` — `renderScoreboard(scores)` sorts `Object.entries(scores)` and prints the **playerId** as the name (ignores `playerNames`).

Note: `src/transport/ws-adapter.js` no longer contains the broadcast logic — do **not** edit it for this task.

The scoreboard panel itself is shown for all games (`public/host.html:793`) and hidden on lobby/finished (`1333`, `1341`).

---

## Proposed Approach

1. **Standardize `scores` in every game's `view()`.** Add a `scores` field (object keyed by `playerId` → number) to `shithead` and `gin-rummy` so they match `quiz`/`spy`. For gin-rummy use the running `state.cumulative` (or `finalScores` at end); for shithead derive a live standing from `finishOrder`. Leave `quiz`/`spy` as-is (already compliant).
2. **Resolve names on the host.** Pass `playerNames` into `renderScoreboard` so it displays usernames instead of raw IDs.
3. **Add a regression test** asserting every registered game's `view()` includes a `scores` object whose keys equal all player IDs.

This is the lower-risk of the two options in the todo (standardize view fields rather than build a new adaptive frontend component). It reuses the existing `renderScoreboard` and changes zero engine/transport logic.

---

## Files Likely to Change

- Modify: `src/engine/games/shithead.js` (add `scores` to `view()`)
- Modify: `src/engine/games/gin-rummy.js` (add `scores` to `view()` `base`)
- Modify: `public/host.html` (`renderScoreboard` signature + call site)
- Create: `tests/engine/scoreboard.test.js` (view-shape regression test)

---

## Step-by-Step Tasks

### Task 1: Add `scores` to `gin-rummy` view

**Objective:** Make the host scoreboard show live cumulative scores for gin-rummy in every phase.

**Files:**
- Modify: `src/engine/games/gin-rummy.js:708` (the `base` object in `view()`)

**Step 1: Write failing test**

In `tests/engine/scoreboard.test.js` (create file, see Task 4 for harness usage):
```js
import { describe, it, expect } from 'vitest';
import { createTestGame, viewFor } from '../game-harness.js';
import ginRummy from '../../src/engine/games/gin-rummy.js';

describe('gin-rummy scoreboard', () => {
  it('exposes scores in view for all players', () => {
    const game = createTestGame(ginRummy, ['p1', 'p2']);
    const view = viewFor(game, 'p1');
    expect(view.scores).toBeTypeOf('object');
    expect(Object.keys(view.scores).sort()).toEqual(['p1', 'p2']);
  });
});
```
Run: `cd /opt/data/small-hours && npx vitest run tests/engine/scoreboard.test.js`
Expected: FAIL — `view.scores` is `undefined` (gin-rummy doesn't emit it yet).

**Step 2: Add the field**
In `gin-rummy.js` `view()`, add one line to `base`:
```js
  const base = {
    phase: state.phase,
    isMyTurn,
    handNumber: state.handNumber,
    cumulative: state.cumulative,
    scores: { ...(state.finalScores || state.cumulative) },  // <-- add this line
    boxes: state.boxes,
    // ...rest unchanged
  };
```
Because all three return branches spread `...base`, this covers `play`, `scoring`/`finished`, and the default branch.

**Step 3: Run test to verify pass**
Run: `npx vitest run tests/engine/scoreboard.test.js`
Expected: PASS.

**Step 4: Commit**
```bash
git add src/engine/games/gin-rummy.js tests/engine/scoreboard.test.js
git commit -m "fix: expose scores in gin-rummy view for host scoreboard"
```

---

### Task 2: Add `scores` to `shithead` view

**Objective:** Derive a live standing from `finishOrder` and expose it as `scores` so the host scoreboard is never blank.

**Files:**
- Modify: `src/engine/games/shithead.js:399` (the returned object in `view()`)

**Step 1: Extend failing test**
Append to `tests/engine/scoreboard.test.js`:
```js
import shithead from '../../src/engine/games/shithead.js';

describe('shithead scoreboard', () => {
  it('exposes scores in view for all players', () => {
    const game = createTestGame(shithead, ['p1', 'p2', 'p3']);
    const view = viewFor(game, 'p1');
    expect(view.scores).toBeTypeOf('object');
    expect(Object.keys(view.scores).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});
```
Run: `npx vitest run tests/engine/scoreboard.test.js`
Expected: FAIL — `view.scores` undefined for shithead.

**Step 2: Add the field**
In `shithead.js` `view()`, compute a standing from `finishOrder` (same ranking formula the game already uses in `endIf`), then include it:
```js
function view(state, playerId) {
  const pileTop = state.pile.length > 0 ? state.pile[state.pile.length - 1] : null;

  // Live standing: players who have gone out rank above those still in (mirrors endIf scoring).
  const scores = {};
  for (const id of state.players) {
    const pos = state.finishOrder.indexOf(id);
    scores[id] = pos === -1 ? 0 : state.players.length - pos;
  }

  return {
    phase: state.phase,
    scores,                                  // <-- add this line
    currentPlayer: state.players[state.currentPlayerIndex],
    // ...rest unchanged
  };
}
```

**Step 3: Run test to verify pass**
Run: `npx vitest run tests/engine/scoreboard.test.js`
Expected: PASS (both gin-rummy and shithead cases).

**Step 4: Commit**
```bash
git add src/engine/games/shithead.js tests/engine/scoreboard.test.js
git commit -m "fix: derive and expose live scores in shithead view"
```

---

### Task 3: Show player names (not raw IDs) in the host scoreboard

**Objective:** `renderScoreboard` currently prints the playerId as the name. Use the `playerNames` map already sent in every host message.

**Files:**
- Modify: `public/host.html:822` (call site)
- Modify: `public/host.html:1308` (`renderScoreboard` definition)

**Step 1: Write a manual check (no unit test harness for host.html)**
Reason about the change; verify by `npm start` + playing a game (see Task 5 validation).

**Step 2: Update the call site**
```js
      if (msg.scores) renderScoreboard(msg.scores, msg.playerNames);
```

**Step 3: Update the function**
```js
    function renderScoreboard(scores, playerNames) {
      const list = document.getElementById('scoreList');
      const names = playerNames || {};
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

      list.innerHTML = sorted.map(([id, score], i) => {
        const name = names[id] || id;
        return '<div class="score-entry">' +
          '<span class="score-rank">' + (i + 1) + '</span>' +
          '<span class="score-name">' + escapeHtml(name) + '</span>' +
          '<span class="score-value">' + score + '</span></div>';
      }).join('');
    }
```

**Step 4: Commit**
```bash
git add public/host.html
git commit -m "fix: show player usernames in host scoreboard"
```

---

### Task 4: Add cross-game scoreboard regression test

**Objective:** Guarantee every registered game emits a `scores` object keyed by all player IDs, so this regression can't recur.

**Files:**
- Create: `tests/engine/scoreboard.test.js` (finalize; add quiz + spy + registry coverage)

**Step 1: Write the test**
```js
import { describe, it, expect } from 'vitest';
import { createTestGame, viewFor } from './game-harness.js';
import quiz from '../../src/engine/games/quiz.js';
import spy from '../../src/engine/games/spy.js';
import shithead from '../../src/engine/games/shithead.js';
import ginRummy from '../../src/engine/games/gin-rummy.js';
import numberGuess from '../../src/engine/games/number-guess.js';

const games = { quiz, spy, shithead, ginRummy, numberGuess };

describe('scoreboard consistency across games', () => {
  for (const [name, def] of Object.entries(games)) {
    it(`${name} view exposes scores keyed by all players`, () => {
      const players = ['alice', 'bob'];
      const game = createTestGame(def, players);
      const view = viewFor(game, 'alice');
      expect(view.scores).toBeTypeOf('object');
      expect(Object.keys(view.scores).sort()).toEqual([...players].sort());
      for (const p of players) expect(Number.isFinite(view.scores[p])).toBe(true);
    });
  }
});
```
Note: `numberGuess` is included as a control — if it also lacks `scores`, this test will surface it and we extend the fix. (Per AGENTS.md, `shithead.test.js` is co-located; all others live under `tests/`.)

**Step 2: Run the full suite**
Run: `npm test`
Expected: all pass; if `numberGuess` lacks `scores`, either fix it the same way or document the exception in this plan's TODO note.

**Step 3: Commit**
```bash
git add tests/engine/scoreboard.test.js
git commit -m "test: assert every game view exposes a scores field"
```

---

## Validation / Verification

1. `npm test` — full Vitest suite green (including new `scoreboard.test.js`).
2. `npm start`, open host screen (`public/host.html` via `/ws/host/:code`) and a player, start a **gin-rummy** and a **shithead** game:
   - Host scoreboard panel (`#scorePanel`) populates with live scores during play (not just at `finished`).
   - Names shown are usernames, not `alice`/`bob` raw IDs.
3. Spot-check `quiz` and `spy` still render (regression — they were already working).
4. Optional: `npx vitest run tests/engine/gin-rummy.test.js tests/engine/shithead.test.js` to confirm no behavior change in game logic.

---

## Risks / Tradeoffs / Open Questions

- **Scope:** Option B in the todo (a new adaptive frontend scoreboard component) was rejected as YAGNI — standardizing the `scores` field reuses existing infra with far less risk.
- **Shithead "score" semantics:** There is no natural in-game numeric score until players go out; the `finishOrder`-derived standing is presented as a proxy. If the desired UX is "show who's still in / who's out" rather than a number, swap the `scores` value for a label map — but keep the `scores` key present so `renderScoreboard` stays uniform. Confirm with user if unsure.
- **`numberGuess`:** Not named in the todo; the cross-game test will reveal whether it also needs the field. Treat as a possible extra fix, not in original scope.
- **Session vs game scores:** These are per-game `scores`, distinct from `room.awardScores` (cross-game session points shown elsewhere). This plan does not touch session scoring.
- **No engine/transport edits:** Deliberate — keeps blast radius limited to view serialization + one host render helper.
