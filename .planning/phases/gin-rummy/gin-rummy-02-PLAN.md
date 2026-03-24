---
phase: gin-rummy
plan: 02
type: tdd
wave: 2
depends_on: ["gin-rummy-01"]
files_modified:
  - src/engine/games/gin-rummy.js
  - tests/engine/gin-rummy.test.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "setup throws if players.length !== 2 (per D-01)"
    - "setup deals 10 cards to each player, 1 upcard on discard, 31 cards in stock"
    - "Non-dealer acts first in the first_turn phase choosing whether to take the upcard"
    - "Draw from stock removes top card from stock and adds to player hand"
    - "Draw from discard removes top card from discard and adds to player hand"
    - "Cannot discard the same card just drawn from the discard pile"
    - "Knock with deadwood > 10 is rejected"
    - "Knock transitions to scoring with auto-computed melds and auto-layoffs (per D-06, D-07)"
    - "Gin (0 deadwood) awards knocker opponent deadwood + 20, cannot be undercut"
    - "Stock exhaustion (2 cards left) cancels the hand with no score change"
    - "Multi-hand loop: nextHand re-deals or ends game when cumulative >= 100 (per D-08)"
    - "View hides opponent cards during play, reveals both hands during scoring (per D-03, D-04)"
    - "endIf returns non-null with winner and final scores when game is finished"
  artifacts:
    - path: "src/engine/games/gin-rummy.js"
      provides: "Complete game definition with default export"
      contains: "export default"
    - path: "tests/engine/gin-rummy.test.js"
      provides: "Game action and state machine tests"
      contains: "describe.*setup"
  key_links:
    - from: "src/engine/games/gin-rummy.js"
      to: "src/engine/engine.js"
      via: "game definition contract"
      pattern: "setup.*actions.*view.*endIf"
    - from: "tests/engine/gin-rummy.test.js"
      to: "tests/engine/game-harness.js"
      via: "import createTestGame, act, viewFor, isOver"
      pattern: "import.*game-harness"
---

<objective>
Implement and test the full Gin Rummy game definition: setup, all actions (draw, discard, knock, declineUpcard, takeUpcard, nextHand), view function, and endIf. This is the game state machine with first-turn upcard flow, multi-hand scoring loop, and stock exhaustion handling.

Purpose: Builds on Plan 01 utilities (cardValue, findOptimalMelds, applyLayoffs, scoreHand) to create the playable game. TDD ensures the state machine transitions are correct and edge cases (undercut, gin, stock exhaustion, multi-hand) are covered.

Output: Complete `src/engine/games/gin-rummy.js` with default export, updated `tests/engine/gin-rummy.test.js` with game-level tests.
</objective>

<execution_context>
@/home/dellvall/small-hours/.claude/get-shit-done/workflows/execute-plan.md
@/home/dellvall/small-hours/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/gin-rummy-research/RESEARCH.md
@.planning/phases/gin-rummy-research/gin-rummy-CONTEXT.md
@.planning/phases/gin-rummy/gin-rummy-01-SUMMARY.md

<interfaces>
<!-- From src/engine/engine.js — game definition contract -->

```js
// Engine expects game definition: { setup, actions, view, endIf }
// setup({ players, config }) => initial state object
// actions: { actionName(state, payload) => { state, events } }
// view(state, playerId) => player-visible state
// endIf(state) => null | { winner, scores }
```

<!-- From tests/engine/game-harness.js — test helpers -->

```js
import { createTestGame, act, actChain, viewFor, isOver } from '../../tests/engine/game-harness.js';
// createTestGame(gameDef, players, config) => game instance
// act(game, actionType, playerId, payload) => { game, events }
// viewFor(game, playerId) => view object
// isOver(game) => null | { winner, scores }
```

<!-- From Plan 01 — utility exports expected in gin-rummy.js -->

```js
export { cardValue, calcDeadwoodValue, findAllMelds, findOptimalMelds, findLayoffs, applyLayoffs, scoreHand, createGinDeck, shuffleArray, wrapAction };
```
</interfaces>
</context>

<feature>
  <name>Gin Rummy Game Definition</name>
  <files>src/engine/games/gin-rummy.js, tests/engine/gin-rummy.test.js</files>

  <behavior>
    ## setup({ players, config })
    - Throws Error('Gin Rummy requires exactly 2 players') if players.length !== 2 (per D-01)
    - Deals 10 cards to each player, 1 face-up discard, 31 cards in stock
    - Sets phase to 'first_turn', currentPlayerIndex to non-dealer (index 1)
    - Config: targetScore defaults to 100 (per D-08), bigGinBonus defaults to 31
    - handNumber starts at 1, cumulative scores start at 0

    ## first_turn phase actions
    - takeUpcard(playerId): non-dealer (or dealer if non-dealer declined) takes the upcard from discard into hand, transitions to drawing phase with that player needing to discard
    - declineUpcard(playerId): non-dealer declines -> dealer gets chance; dealer declines -> non-dealer draws from stock, transitions to normal drawing phase
    - Wrong player acting throws error

    ## draw(state, { playerId, source })
    - source must be 'stock' or 'discard'
    - Only current player can draw
    - Player must not have already drawn this turn (state tracks turnPhase: 'draw' | 'discard')
    - Drawing from stock: remove top of stock, add to hand, set lastDrawFrom='stock'
    - Drawing from discard: remove top of discard, add to hand, set lastDrawFrom='discard', set lastDrawnCardId
    - After draw, turnPhase becomes 'discard' (player must discard or knock)
    - Stock exhaustion check: if stock.length <= 2 after draw from stock, cancel hand

    ## discard(state, { playerId, cardId })
    - Player must have drawn (turnPhase === 'discard')
    - Card must be in player's hand
    - Cannot discard lastDrawnCardId if lastDrawFrom === 'discard'
    - Remove card from hand, add to discard pile
    - Advance currentPlayerIndex to other player, reset turnPhase to 'draw'
    - Stock exhaustion check after discard: if stock.length <= 2, cancel hand (phase='scoring', handResult with type='cancelled')

    ## knock(state, { playerId })
    - Player must have drawn (turnPhase === 'discard')
    - Engine calls findOptimalMelds on player's hand
    - If deadwoodValue > 10, throw error
    - Determine ginType: deadwoodValue === 0 with 10 cards in hand -> 'gin'; all 11 cards meld -> 'bigGin'
    - Auto-compute opponent melds via findOptimalMelds (per D-06)
    - If ginType !== 'gin' and ginType !== 'bigGin', auto-apply layoffs via applyLayoffs (per D-07)
    - Call scoreHand to determine hand result
    - Update cumulative scores and boxes (winner gets +1 box)
    - Set phase='scoring' with all reveal data (knockerMelds, knockerDeadwood, opponentMelds, opponentDeadwood, handResult)

    ## nextHand(state, { playerId })
    - Only valid in phase 'scoring'
    - Check if any player reached targetScore (cumulative >= config.targetScore)
    - If yes: phase='finished', compute final scores (cumulative + boxes*20 + gameBonus 100 or 200 for shutout)
    - If no: deal new hand (increment handNumber, winner deals, non-dealer goes first, reset all hand state)

    ## view(state, playerId)
    - Always: phase, isMyTurn, handNumber, cumulative, boxes, stockCount, discardTop, winner
    - During play (first_turn, drawing): myHand (full cards), opponentCardCount (number only, per D-03)
    - During scoring: reveal knocker, knockerMelds, knockerDeadwood, opponentMelds, opponentDeadwood, handResult (per D-04)
    - During finished: finalScores with breakdown
    - Events array (last N game events for TV feed: draws, knocks, scores — per D-03)

    ## endIf(state)
    - Returns null unless phase === 'finished'
    - Returns { winner: playerId, scores: { p1: finalScore, p2: finalScore } }

    ## Stock exhaustion
    - When stock reaches 2 cards and current player discards without knocking: hand cancelled
    - No score change, same dealer re-deals (handNumber does NOT increment)

    ## Multi-hand loop
    - After scoring, nextHand either starts new hand or ends game
    - Previous hand winner becomes dealer (dealerIndex updates)
    - Box bonus tracked separately from cumulative (per pitfall 7)
    - Game ends when cumulative >= targetScore (default 100, per D-08)
  </behavior>

  <implementation>
    Build on the utility functions from Plan 01 (already exported from gin-rummy.js).

    1. **Add internal helper `dealNewHand(state)`:**
       - Create deck via createGinDeck(), deal 10 cards each, 1 upcard, rest as stock
       - Set phase='first_turn', currentPlayerIndex = 1 - dealerIndex (non-dealer first)
       - Reset hand-specific state: knocker, knockerMelds, knockerDeadwood, opponentMelds, opponentDeadwood, ginType, lastDrawFrom, lastDrawnCardId, handResult, turnPhase='draw', events=[]

    2. **Add `setup({ players, config })` function:**
       - Validate players.length === 2, throw if not
       - Initialize state with players, dealerIndex: 0, handNumber: 0, cumulative: {p1:0, p2:0}, boxes: {p1:0, p2:0}, winner: null
       - Extract config: targetScore = config.targetScore || 100, bigGinBonus = config.bigGinBonus || 31
       - Call dealNewHand(state) to set up first hand

    3. **Add first-turn actions:**
       - `takeUpcard(state, { playerId })`: validate correct player's turn, remove discard top, add to hand, set turnPhase='discard', transition phase to 'drawing'
       - `declineUpcard(state, { playerId })`: if non-dealer declined, switch to dealer for upcard choice; if dealer also declined, non-dealer draws from stock, transition to normal drawing phase
       - Track `upcardDeclined` array in state to know who has declined

    4. **Add `draw(state, { playerId, source })` action:**
       - Validate: phase==='drawing', correct player, turnPhase==='draw', source is 'stock' or 'discard'
       - Execute draw, update hand, stock/discard, set lastDrawFrom and lastDrawnCardId
       - Set turnPhase='discard'
       - Add event: { type: 'draw', playerId, source }
       - Stock exhaustion: if source==='stock' && stock.length <= 2, set phase='scoring', handResult={type:'cancelled'}

    5. **Add `discard(state, { playerId, cardId })` action:**
       - Validate: turnPhase==='discard', card in hand, not same card drawn from discard
       - Remove from hand, push to discard
       - Add event: { type: 'discard', playerId, cardId }
       - Switch currentPlayerIndex, reset turnPhase='draw', clear lastDrawFrom/lastDrawnCardId
       - Stock exhaustion: if stock.length <= 2, cancel hand

    6. **Add `knock(state, { playerId })` action:**
       - Validate: turnPhase==='discard' (must have drawn)
       - Call findOptimalMelds(hand) for knocker
       - Check deadwoodValue <= 10
       - Determine ginType: if deadwoodValue===0 and hand.length===10 -> 'gin'; check bigGin (all 11 cards including any drawn card form melds with deadwoodValue===0 and hand.length===11) -> 'bigGin'
       - Call findOptimalMelds on opponent hand
       - If not gin: call applyLayoffs(opponentDeadwood, knockerMelds)
       - Call scoreHand(knockerId, opponentId, knockerDW, opponentDW, ginType)
       - Update cumulative[winner] += points, boxes[winner] += 1
       - Set phase='scoring' with all reveal data and handResult
       - Add events: { type: 'knock', playerId, ginType }, { type: 'hand_result', ...handResult }

    7. **Add `nextHand(state, { playerId })` action:**
       - Validate phase==='scoring'
       - Check if cumulative[p1] >= targetScore or cumulative[p2] >= targetScore
       - If game over: compute finalScores (cumulative + boxes*20 + gameBonus), set phase='finished', set winner
         - gameBonus: 100 normally, 200 if loser cumulative === 0 (shutout)
       - If not over: update dealerIndex to hand winner, call dealNewHand

    8. **Add `view(state, playerId)` function:**
       - Compute opponentId = state.players.find(id => id !== playerId)
       - Base view: phase, isMyTurn, handNumber, cumulative, boxes, stockCount, discardTop (last element of discard array or null), winner, turnPhase, events (last 10), canKnock (during discard phase: run findOptimalMelds and check deadwoodValue <= 10)
       - Play phases (first_turn, drawing): myHand, opponentCardCount
       - Scoring/finished: knocker, knockerMelds, knockerDeadwood, opponentMelds, opponentDeadwood, handResult, finalScores (if finished)
       - NEVER include opponent's actual cards during play phases

    9. **Add `endIf(state)` function:**
       - If phase !== 'finished' return null
       - Return { winner: state.winner, scores: state.finalScores || state.cumulative }

    10. **Add default export:**
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

    Keep all existing named exports from Plan 01 intact.
  </implementation>
</feature>

<verification>
npx vitest run tests/engine/gin-rummy.test.js
</verification>

<success_criteria>
- setup creates correct initial state (10 cards each, 31 stock, 1 discard, phase first_turn)
- setup throws for non-2-player count (per D-01)
- First-turn upcard flow works (decline/take transitions correctly)
- Draw from stock/discard works correctly, hand size increases by 1
- Discard-same-card constraint enforced (throw when discarding card just drawn from discard)
- Knock validates deadwood <= 10, auto-computes melds (per D-06), auto-layoffs (per D-07)
- Gin scoring gives knocker opponent deadwood + 20, not undercuttable
- Stock exhaustion cancels hand with no score change
- Multi-hand: nextHand deals new hand or ends game at targetScore (per D-08)
- View hides opponent cards during play, reveals during scoring (per D-03, D-04)
- endIf returns null during play, {winner, scores} when finished
- All tests pass via `npx vitest run tests/engine/gin-rummy.test.js`
</success_criteria>

<output>
After completion, create `.planning/phases/gin-rummy/gin-rummy-02-SUMMARY.md`
</output>
