---
phase: gin-rummy
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/engine/games/gin-rummy.js
  - tests/engine/gin-rummy.test.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "cardValue returns 1 for Ace, 10 for face cards, face value for 2-10"
    - "findAllMelds detects 3-card sets, 4-card sets, 3-card runs, and longer runs"
    - "findOptimalMelds minimizes deadwood (does not use greedy approach)"
    - "A-2-3 of same suit is a valid run; K-A-2 is NOT a valid run"
    - "findLayoffs correctly extends knocker sets and runs"
    - "scoreHand computes gin bonus, undercut bonus, knock difference, big gin bonus"
    - "Gin cannot be undercut even if opponent also has 0 deadwood"
  artifacts:
    - path: "src/engine/games/gin-rummy.js"
      provides: "Exported utility functions for gin rummy"
      contains: "function cardValue"
    - path: "tests/engine/gin-rummy.test.js"
      provides: "Unit tests for all utility functions"
      contains: "describe.*cardValue"
  key_links:
    - from: "tests/engine/gin-rummy.test.js"
      to: "src/engine/games/gin-rummy.js"
      via: "import"
      pattern: "import.*gin-rummy"
---

<objective>
Implement and test the core utility functions for Gin Rummy: card value calculation, meld detection (sets and runs), optimal meld finding (recursive exhaustive search), deadwood calculation, layoff computation, and hand scoring.

Purpose: These are the algorithmic building blocks that the game actions (Plan 02) depend on. TDD ensures the meld finder is correct (not greedy) and scoring handles all edge cases (gin, undercut, big gin, shutout).

Output: `src/engine/games/gin-rummy.js` with exported utilities, `tests/engine/gin-rummy.test.js` with comprehensive unit tests.
</objective>

<execution_context>
@/home/dellvall/small-hours/.claude/get-shit-done/workflows/execute-plan.md
@/home/dellvall/small-hours/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/gin-rummy-research/RESEARCH.md
@.planning/phases/gin-rummy-research/gin-rummy-CONTEXT.md

<interfaces>
<!-- From src/engine/games/shithead.js — utilities to copy and adapt -->

```js
// Lines 6-13: Fisher-Yates shuffle (copy verbatim)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lines 15-26: Deck creation (adapt: rank 1-13 instead of 2-14)
function createDeck(deckCount = 1) {
  const suits = ['h', 'd', 'c', 's'];
  const cards = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        cards.push({ id: `${rank}${suit}_${d}`, suit, rank });
      }
    }
  }
  return shuffleArray(cards);
}

// Lines 448-457: Error-to-event wrapper (copy verbatim)
function wrapAction(fn) {
  return (state, payload) => {
    try {
      const newState = fn(state, payload);
      return { state: newState, events: [] };
    } catch (err) {
      return { state, events: [{ type: 'error', playerId: payload.playerId, message: err.message }] };
    }
  };
}
```

<!-- Card shape used across engine -->
Card object: `{ id: '5h_0', suit: 'h', rank: 5 }`
</interfaces>
</context>

<feature>
  <name>Gin Rummy Core Utilities</name>
  <files>src/engine/games/gin-rummy.js, tests/engine/gin-rummy.test.js</files>

  <behavior>
    ## cardValue(card)
    - Ace (rank 1) returns 1
    - Ranks 2-10 return face value (2, 3, ... 10)
    - Jack (rank 11) returns 10
    - Queen (rank 12) returns 10
    - King (rank 13) returns 10

    ## createGinDeck()
    - Returns 52 cards shuffled
    - Ace has rank 1 (not 14 like shithead)
    - Card IDs use format `${rank}${suit}_0` (e.g., '1h_0' for Ace of Hearts)
    - All 4 suits present, ranks 1-13

    ## findAllMelds(hand)
    - Hand of [7h, 7d, 7s] returns 1 set meld of 3
    - Hand of [7h, 7d, 7s, 7c] returns 1 set of 4 + 4 sets of 3 (all 3-card subsets)
    - Hand of [4c, 5c, 6c] returns 1 run meld
    - Hand of [4c, 5c, 6c, 7c] returns sub-runs: [4,5,6], [5,6,7], [4,5,6,7]
    - A-2-3 of spades (ranks 1,2,3) is a valid run
    - K-A-2 (ranks 13,1,2) is NOT a valid run (Ace is always low)

    ## findOptimalMelds(hand)
    - Returns { melds: [...], deadwood: [...], deadwoodValue: N }
    - Greedy-buster test: hand with cards that could form 3 sets of 3 (deadwood=1 card) should NOT choose a set of 4 + smaller arrangement that leaves higher deadwood
    - Hand with all cards in melds returns deadwoodValue 0
    - Hand with no possible melds returns all cards as deadwood

    ## calcDeadwoodValue(cards)
    - Empty array returns 0
    - [Ace, King] returns 11
    - [5h, 3d] returns 8

    ## findLayoffs(opponentDeadwood, knockerMelds)
    - Card matching a 3-card set rank can lay off (extend to 4)
    - Card cannot lay off on a 4-card set (already full)
    - Card extending a run at either end can lay off
    - Card of wrong suit cannot lay off on a run
    - Returns array of { card, meldIndex } objects

    ## applyLayoffs(opponentDeadwood, knockerMelds)
    - Applies all valid layoffs greedily (always beneficial)
    - Returns { remainingDeadwood: [...], updatedMelds: [...] }

    ## scoreHand(knockerId, opponentId, knockerDeadwoodValue, opponentDeadwoodValue, ginType)
    - Knock (no gin): knocker deadwood < opponent deadwood -> knocker wins, points = difference
    - Undercut: knocker deadwood >= opponent deadwood (and not gin) -> opponent wins, points = difference + 10
    - Gin: ginType='gin' -> knocker wins, points = opponent deadwood + 20, cannot be undercut
    - Big Gin: ginType='bigGin' -> knocker wins, points = opponent deadwood + 31 (configurable)
    - Gin with opponent 0 deadwood: knocker STILL wins (gin is never undercuttable)
  </behavior>

  <implementation>
    Create `src/engine/games/gin-rummy.js` with these exported functions:

    1. Copy `shuffleArray` from shithead.js verbatim (lines 6-13)
    2. Create `createGinDeck()` — like shithead's createDeck but rank range is 1-13 (Ace=1, King=13), IDs like `1h_0` for Ace of Hearts
    3. Copy `wrapAction` from shithead.js verbatim (lines 448-457)
    4. Implement `cardValue(card)` — rank >= 11 returns 10, else returns rank
    5. Implement `calcDeadwoodValue(cards)` — sum of cardValue for each card
    6. Implement `findAllMelds(hand)`:
       - Group by rank, emit sets of 3 and 4 (and all 3-card subsets of 4-card groups)
       - Group by suit, sort by rank, find consecutive sequences >= 3, emit all sub-runs
       - Each meld: `{ type: 'set'|'run', cards: [...] }`
    7. Implement `findOptimalMelds(hand)`:
       - Recursive exhaustive search over findAllMelds results
       - Track best = lowest deadwoodValue
       - For each meld candidate: if all its cards still in remaining hand, try including it (remove cards, recurse) and skipping it
       - Return `{ melds, deadwood, deadwoodValue }`
    8. Implement `findLayoffs(opponentDeadwood, knockerMelds)`:
       - For each opponent deadwood card, check each knocker meld
       - Set with 3 cards: can add 4th of same rank
       - Run: can extend at either end (same suit, rank = min-1 or max+1)
       - Return `[{ card, meldIndex }]`
    9. Implement `applyLayoffs(opponentDeadwood, knockerMelds)`:
       - Call findLayoffs, apply all greedily (remove card from deadwood, add to meld)
       - Repeat until no more layoffs possible (layoff may enable further layoffs on extended runs)
       - Return `{ remainingDeadwood, updatedMelds }`
    10. Implement `scoreHand(knockerId, opponentId, knockerDeadwoodValue, opponentDeadwoodValue, ginType)`:
        - If ginType === 'gin': return { winner: knockerId, points: opponentDeadwoodValue + 20, type: 'gin' }
        - If ginType === 'bigGin': return { winner: knockerId, points: opponentDeadwoodValue + 31, type: 'bigGin' }
        - If knockerDeadwoodValue < opponentDeadwoodValue: return { winner: knockerId, points: opponentDeadwoodValue - knockerDeadwoodValue, type: 'knock' }
        - Else (undercut): return { winner: opponentId, points: knockerDeadwoodValue - opponentDeadwoodValue + 10, type: 'undercut' }

    All functions should be named exports AND also used internally. The default export (game definition object) will be added in Plan 02.

    Export pattern at bottom of file:
    ```js
    export { cardValue, calcDeadwoodValue, findAllMelds, findOptimalMelds, findLayoffs, applyLayoffs, scoreHand, createGinDeck, shuffleArray, wrapAction };
    ```
  </implementation>
</feature>

<verification>
npx vitest run tests/engine/gin-rummy.test.js
</verification>

<success_criteria>
- All utility function tests pass (cardValue, findAllMelds, findOptimalMelds, calcDeadwoodValue, findLayoffs, applyLayoffs, scoreHand)
- Greedy-buster test proves optimal meld finder is not greedy
- A-2-3 run test passes, K-A-2 run test confirms invalid
- Gin scoring test confirms gin cannot be undercut
- createGinDeck produces 52 cards with Ace at rank 1
</success_criteria>

<output>
After completion, create `.planning/phases/gin-rummy/gin-rummy-01-SUMMARY.md`
</output>
