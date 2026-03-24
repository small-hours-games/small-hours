---
phase: gin-rummy
plan: 03
type: execute
wave: 3
depends_on: ["gin-rummy-02"]
files_modified:
  - src/engine/games/index.js
  - src/session/room.js
  - tests/engine/gin-rummy.test.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "gin-rummy is exported from src/engine/games/index.js"
    - "gin-rummy is registered in GAME_REGISTRY in src/session/room.js"
    - "A full game can be played through the engine API (createGame -> processAction -> checkEnd)"
    - "Game is unavailable when player count is not 2 (per D-02)"
    - "TV display view shows scoreboard + events during play, both hands during scoring (per D-03, D-04, D-05)"
  artifacts:
    - path: "src/engine/games/index.js"
      provides: "Re-export of gin-rummy game"
      contains: "ginRummy"
    - path: "src/session/room.js"
      provides: "gin-rummy in GAME_REGISTRY"
      contains: "gin-rummy"
    - path: "tests/engine/gin-rummy.test.js"
      provides: "Integration tests via game harness"
      contains: "describe.*integration"
  key_links:
    - from: "src/engine/games/index.js"
      to: "src/engine/games/gin-rummy.js"
      via: "re-export"
      pattern: "export.*ginRummy.*gin-rummy"
    - from: "src/session/room.js"
      to: "src/engine/games/gin-rummy.js"
      via: "import and GAME_REGISTRY entry"
      pattern: "gin-rummy.*ginRummy"
---

<objective>
Register Gin Rummy in the game engine and add integration tests that drive a full game through the engine API using the test harness.

Purpose: Makes gin-rummy playable via the normal game start flow (room.startGame('gin-rummy')). Integration tests verify the full lifecycle works end-to-end through the engine layer.

Output: Updated `index.js` and `room.js` with gin-rummy registration, integration tests in `gin-rummy.test.js`.
</objective>

<execution_context>
@/home/dellvall/small-hours/.claude/get-shit-done/workflows/execute-plan.md
@/home/dellvall/small-hours/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/gin-rummy-research/gin-rummy-CONTEXT.md
@.planning/phases/gin-rummy/gin-rummy-02-SUMMARY.md

<interfaces>
<!-- From src/engine/games/index.js — current exports -->

```js
export { default as numberGuess } from './number-guess.js';
export { default as quiz } from './quiz.js';
export { default as spy } from './spy.js';
export { default as shithead } from './shithead.js';
export { default as questionForm } from './question-form.js';
export { default as template } from './template.js';
```

<!-- From src/session/room.js — GAME_REGISTRY (lines 23-29) -->

```js
import numberGuess from '../engine/games/number-guess.js';
import shithead from '../engine/games/shithead.js';
import quiz from '../engine/games/quiz.js';
import questionForm from '../engine/games/question-form.js';
import template from '../engine/games/template.js';

const GAME_REGISTRY = {
  'number-guess': numberGuess,
  'shithead': shithead,
  'quiz': quiz,
  'question-form': questionForm,
  'template': template,
};
```

<!-- From tests/engine/game-harness.js — test helpers -->

```js
import { createTestGame, act, actChain, viewFor, isOver, playUntilEnd } from '../../tests/engine/game-harness.js';
```

<!-- From gin-rummy.js default export (from Plan 02) -->

```js
export default {
  setup,
  actions: {
    takeUpcard: wrapAction(takeUpcard),
    declineUpcard: wrapAction(declineUpcard),
    draw: wrapAction(draw),
    discard: wrapAction(discard),
    knock: wrapAction(knock),
    nextHand: wrapAction(nextHand),
  },
  view,
  endIf,
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Register gin-rummy in game index and GAME_REGISTRY</name>
  <files>src/engine/games/index.js, src/session/room.js</files>
  <read_first>
    - src/engine/games/index.js (current exports to match pattern)
    - src/session/room.js (current imports and GAME_REGISTRY to match pattern)
    - src/engine/games/gin-rummy.js (verify default export exists)
  </read_first>
  <action>
    **In `src/engine/games/index.js`:** Add a new export line following the existing pattern:
    ```js
    export { default as ginRummy } from './gin-rummy.js';
    ```
    Place it alphabetically or at the end of the existing exports.

    **In `src/session/room.js`:**
    1. Add import at line ~9 (after the template import):
       ```js
       import ginRummy from '../engine/games/gin-rummy.js';
       ```
    2. Add to GAME_REGISTRY object (inside the existing object literal at line ~23):
       ```js
       'gin-rummy': ginRummy,
       ```

    Per D-02 (game unavailable when player count !== 2): The setup function already throws for non-2-player count. The room's startGame method will catch this error and report it. No additional lobby-level gating is needed for MVP — the engine-level enforcement (throw in setup) handles it.
  </action>
  <verify>
    <automated>grep -n "ginRummy" src/engine/games/index.js && grep -n "gin-rummy" src/session/room.js</automated>
  </verify>
  <acceptance_criteria>
    - src/engine/games/index.js contains `export { default as ginRummy } from './gin-rummy.js'`
    - src/session/room.js contains `import ginRummy from '../engine/games/gin-rummy.js'`
    - src/session/room.js GAME_REGISTRY contains `'gin-rummy': ginRummy`
  </acceptance_criteria>
  <done>gin-rummy is importable from the games index and registered in GAME_REGISTRY</done>
</task>

<task type="auto">
  <name>Task 2: Add integration tests via game harness</name>
  <files>tests/engine/gin-rummy.test.js</files>
  <read_first>
    - tests/engine/gin-rummy.test.js (existing tests from Plans 01 and 02)
    - tests/engine/game-harness.js (test helper API)
    - src/engine/games/gin-rummy.js (full game definition)
  </read_first>
  <action>
    Add a new `describe('integration - full game via engine API', ...)` block at the end of gin-rummy.test.js. Import from game-harness if not already imported:
    ```js
    import { createTestGame, act, viewFor, isOver, playUntilEnd } from './game-harness.js';
    ```

    Import the default export:
    ```js
    import ginRummy from '../../src/engine/games/gin-rummy.js';
    ```

    **Test 1: createTestGame creates a valid game instance**
    - `const game = createTestGame(ginRummy, ['p1', 'p2']);`
    - Assert `game.state.phase` is `'first_turn'`
    - Assert `game.state.hands.p1.length` is 10
    - Assert `game.state.hands.p2.length` is 10
    - Assert `isOver(game)` is null

    **Test 2: Full hand played through engine (draw-discard cycle to knock)**
    - Create game, handle first_turn phase (decline both, or take upcard)
    - Play several draw/discard turns using act()
    - Manually set up a hand state where a player CAN knock (mock the hand to have low deadwood)
    - Knock, verify phase transitions to 'scoring'
    - Call nextHand, verify new hand starts or game ends

    **Test 3: View filtering through engine API**
    - Create game, use viewFor(game, 'p1') and viewFor(game, 'p2')
    - During drawing phase: assert p1 view has myHand array, opponentCardCount number (not opponent's cards)
    - Assert viewFor does NOT contain opponent's actual hand cards

    **Test 4: playUntilEnd drives game to completion**
    - Use playUntilEnd with an actionFn that makes valid moves:
      - During first_turn: decline upcard for both, then draw from stock
      - During drawing with turnPhase 'draw': draw from stock
      - During drawing with turnPhase 'discard': discard first valid card
      - During scoring: call nextHand
    - Set targetScore low (e.g., config.targetScore = 5) for fast completion
    - Assert isOver(game) returns { winner, scores } after playUntilEnd
    - Assert winner is one of the two players

    **Test 5: 2-player enforcement via engine**
    - `createTestGame(ginRummy, ['p1'])` — assert it throws (1 player)
    - `createTestGame(ginRummy, ['p1', 'p2', 'p3'])` — assert it throws (3 players)

    **Test 6: Display view (null playerId)**
    - viewFor(game, null) during play: should show both hand counts but no cards
    - viewFor(game, null) during scoring: should show both hands, melds, deadwood (per D-04)
    - (If view doesn't handle null playerId, note this as a known limitation and test with a non-player ID instead)
  </action>
  <verify>
    <automated>npx vitest run tests/engine/gin-rummy.test.js</automated>
  </verify>
  <acceptance_criteria>
    - tests/engine/gin-rummy.test.js contains `describe('integration`
    - tests/engine/gin-rummy.test.js imports from `game-harness.js`
    - tests/engine/gin-rummy.test.js imports `ginRummy` default export
    - Test for createTestGame validates initial state
    - Test for view filtering checks opponent cards are hidden
    - Test for 2-player enforcement checks throws for 1 and 3 players
    - `npx vitest run tests/engine/gin-rummy.test.js` exits 0
    - `npm test` exits 0 (no regressions in other games)
  </acceptance_criteria>
  <done>Integration tests pass, full game lifecycle verified through engine API, no regressions in existing test suite</done>
</task>

</tasks>

<verification>
npx vitest run tests/engine/gin-rummy.test.js && npm test
</verification>

<success_criteria>
- gin-rummy exported from src/engine/games/index.js
- gin-rummy registered in GAME_REGISTRY in src/session/room.js
- Integration tests create game, play actions, verify views, and drive to completion
- 2-player enforcement tested via engine
- All tests pass (gin-rummy tests + full suite)
- No regressions in existing games
</success_criteria>

<output>
After completion, create `.planning/phases/gin-rummy/gin-rummy-03-SUMMARY.md`
</output>
