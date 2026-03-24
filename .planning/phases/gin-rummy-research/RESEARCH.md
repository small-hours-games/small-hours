# Phase: Gin Rummy — Research

**Researched:** 2026-03-24
**Domain:** Card game implementation — Gin Rummy on the Small Hours party game engine
**Confidence:** HIGH (rules from pagat.com authoritative source, engine patterns from direct source inspection)

## Summary

Gin Rummy is a 2-player card game where players draw and discard until one player can "knock" with 10 or fewer points of unmatched cards (deadwood). The game is well-understood and maps cleanly onto the Small Hours engine's `{setup, actions, view, endIf}` pattern. The main implementation complexity is the meld detection / deadwood minimization algorithm — finding the optimal way to arrange a 10-card hand into sets (same-rank groups) and runs (same-suit sequences) to minimize unmatched card value.

The existing `shithead.js` provides directly reusable utilities: `shuffleArray`, `createDeck`, the `{ id, suit, rank }` card shape, and the `wrapAction` error-to-event pattern. The game is multi-hand (play continues until someone reaches 100 cumulative points), which requires an outer loop around single hands — a pattern not yet in the codebase but straightforward to implement in engine state.

**Primary recommendation:** Implement gin-rummy as a single-file game definition (`src/engine/games/gin-rummy.js`) using copied helpers from shithead, a recursive meld-finder, and multi-hand state with cumulative scoring. Register it in `GAME_REGISTRY` in `src/session/room.js`.

## Rules Summary

Complete rules from pagat.com (HIGH confidence — official authoritative source).

### Setup

- 2 players, 1 standard 52-card deck
- Each player receives 10 cards dealt one at a time
- The 21st card is placed face-up to start the discard pile
- Remaining cards form the stock pile face-down
- First dealer: lower drawn card deals. Subsequent hands: previous winner deals

### Card Values (for deadwood scoring)

| Card | Value |
|------|-------|
| Ace | 1 point |
| 2–10 | Face value (2 pts, 3 pts, … 10 pts) |
| Jack | 10 points |
| Queen | 10 points |
| King | 10 points |

**Ace is always low.** A-2-3 is a valid run. A-K-Q is NOT valid.

### Meld Types

- **Set (group):** Three or four cards of the same rank (e.g., 7-hearts, 7-diamonds, 7-spades)
- **Run (sequence):** Three or more consecutive cards of the same suit (e.g., 4-5-6 of clubs)
- **A card belongs to exactly one meld.** Cannot double-count a card in both a set and a run.

### Turn Structure

Each turn:
1. **Draw:** Take top card from stock (face-down) OR top card from discard pile (face-up)
2. **Discard:** Place one card face-up on the discard pile
3. **Optional knock:** After drawing, if deadwood is 10 or fewer, player may knock instead of discarding normally

**Special first-turn rule:** Non-dealer chooses first whether to take the face-up upcard. If non-dealer declines, dealer may take it. If both decline, non-dealer draws from stock and normal play begins.

**Constraint:** Cannot discard the same card just drawn from the discard pile in that same turn.

### Knocking

- After drawing, if deadwood total is 10 or fewer points, player MAY knock
- Discard one card face-down (the knock discard)
- Expose entire hand arranged into melds + deadwood
- **Opponent lays off:** Opponent may add their unmatched cards onto the knocker's melds (extending sets to 4-of-kind, extending runs)
  - Exception: opponent CANNOT lay off if knocker went gin
- After layoff, both count their remaining deadwood

**Going Gin:** Knocking with 0 deadwood.
**Big Gin (variant):** Player draws such that all 11 cards (10 in hand + drawn) form melds without discarding — special bonus applies.

### Stock Exhaustion

If stock is reduced to 2 cards and the player who drew the third-to-last card discards without knocking: **hand is cancelled, no score, same dealer deals again.** This counts as a wash round.

### Scoring Per Hand

| Situation | Who Scores | Points |
|-----------|-----------|--------|
| Knocker's deadwood < opponent's | Knocker | Difference in deadwood counts |
| Knocker's deadwood >= opponent's (undercut) | Opponent | Difference + 10-point undercut bonus |
| Knocker goes gin (0 deadwood) | Knocker | Opponent's deadwood + 20-point gin bonus |
| Big Gin (all 11 cards melded) | Knocker | Opponent's deadwood + 31-point bonus (some rules use 50) |

**Gin is never undercuttable** — even if opponent also has 0 deadwood, the gin player gets the 20-point bonus and opponent scores nothing.

### Game-Level Scoring (Line/Box Bonus)

- Each **won hand** earns an additional 20 points (line/box bonus) per player who won that hand
- Box bonuses do NOT count toward the 100-point target
- Game ends when one player's cumulative score reaches **100 points or more**
- Game winner receives **100-point game bonus**
- If loser scored 0 points throughout the entire game (shutout/blitz), winner gets **200-point game bonus** instead

### Layoff Rules

When the knocker exposes their melds:
- Opponent arranges their cards into their own melds where possible
- Opponent may lay off remaining unmatched cards onto the knocker's melds
- Cannot lay off onto deadwood (unmatched cards)
- Cannot lay off if knocker went gin

---

## Standard Stack

### Core — Reuse from Shithead

| Code | Source | Purpose | Notes |
|------|--------|---------|-------|
| `shuffleArray(arr)` | Copy from shithead.js | Fisher-Yates shuffle | Identical utility needed |
| `createDeck()` | Copy from shithead.js | 52-card deck with `{id, suit, rank}` | Use rank 1=Ace, 2-10, 11=Jack, 12=Queen, 13=King |
| `wrapAction(fn)` | Copy from shithead.js | Convert throw-errors to `{state, events}` | Engine contract requires `{state, events}` |

### Build New

| Code | Purpose | Complexity |
|------|---------|-----------|
| `cardValue(card)` | Deadwood point value of one card | LOW — simple lookup |
| `findAllMelds(hand)` | Generate all valid sets and runs from a hand | MEDIUM |
| `findOptimalMelds(hand)` | Find meld combination that minimizes deadwood | HIGH — recursive |
| `calcDeadwood(hand, melds)` | Sum card values of cards not in any meld | LOW |
| `canLayOff(card, melds)` | Check if a card extends any existing meld | MEDIUM |
| `applyLayoffs(knockerMelds, opponentDeadwood)` | Opponent lays off cards onto knocker melds | MEDIUM |

### No External Dependencies Needed

Gin Rummy has no external data requirements. No fetch, no cache, no config files.

---

## Architecture Patterns

### Game Phase State Machine

```
dealing → drawing → [knock → layoff → scoring] → [next_hand | finished]
              ^                                          |
              |__________________________________________|
                          (loop per hand)
```

**Phases per hand:**
- `dealing` — brief initial phase (or skip directly to `drawing`)
- `drawing` — active play: current player must draw then discard (or knock)
- `opponent_layoff` — knocker revealed, opponent arranges melds and lays off
- `scoring` — display hand result before next hand or game end

**Multi-hand outer loop:** State carries `handScores` (points per hand), `cumulative` (running totals), `handNumber`, and `boxesWon` (hand wins for box bonus).

### Recommended State Shape

```js
{
  phase: 'drawing',           // 'dealing' | 'drawing' | 'opponent_layoff' | 'scoring' | 'finished'
  players: ['p1', 'p2'],
  dealerIndex: 0,             // index of current hand's dealer
  currentPlayerIndex: 0,      // index of player whose turn it is
  hands: { p1: [...cards], p2: [...cards] },
  stock: [...cards],          // face-down draw pile
  discard: [...cards],        // face-up discard pile, top = last element
  knocker: null,              // playerId who knocked, or null
  knockerMelds: null,         // [{type:'set'|'run', cards:[...]}] after knock
  knockerDeadwood: null,      // cards not in any meld after knock
  opponentMelds: null,        // opponent's arranged melds
  opponentDeadwood: null,     // opponent's remaining deadwood after layoff
  ginType: null,              // null | 'gin' | 'bigGin'
  lastDrawFrom: null,         // 'stock' | 'discard' — for discard-same-card constraint
  handResult: null,           // { winner, knockerPoints, opponentPoints, bonus, type }
  handNumber: 1,
  cumulative: { p1: 0, p2: 0 },
  boxes: { p1: 0, p2: 0 },   // count of hands won (for box bonus)
  winner: null,               // set when game ends
}
```

### Recommended Project Structure

```
src/engine/games/
├── gin-rummy.js        # Full game definition (single file)

tests/engine/
├── gin-rummy.test.js   # Unit tests using game-harness.js
```

No subdirectory needed — follows existing single-file pattern (shithead.js, quiz.js, spy.js).

### Pattern 1: Multi-Hand Loop

The engine's `endIf` only triggers once. Multi-hand Gin Rummy is handled by keeping all state within a single game instance:

```js
// In scoring phase, after displaying result:
// Either advance to next hand (increment handNumber, re-deal)
// or set phase:'finished' if cumulative >= 100

function advanceHand(state) {
  const { cumulative, boxes } = state;
  const [p1, p2] = state.players;
  const winner = cumulative[p1] >= 100 ? p1 : (cumulative[p2] >= 100 ? p2 : null);
  if (winner) {
    return { ...state, phase: 'finished', winner };
  }
  // Deal new hand
  return dealNewHand(state);
}
```

### Pattern 2: wrapAction (from shithead.js)

All action functions throw errors for invalid input; `wrapAction` catches them and converts to `{state, events: [{type:'error', ...}]}`:

```js
// Source: shithead.js (direct copy is appropriate)
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

### Pattern 3: Knock Action with Meld Declaration

The player provides their proposed meld arrangement on knock; the engine validates and calculates deadwood:

```js
// Client sends: { type: 'GAME_ACTION', action: { type: 'knock', melds: [[cardId, cardId, cardId], ...] } }
// Engine validates melds, calculates deadwood, checks <= 10 threshold
function knock(state, { playerId, melds }) {
  // validate it's their turn, they just drew, melds are valid, deadwood <= 10
  // transition to 'opponent_layoff' phase
}
```

Alternatively (simpler for MVP): engine automatically finds the OPTIMAL meld arrangement for the knocker so the client only needs to say "knock" without sending meld data. The engine calls `findOptimalMelds(hand)` and verifies the result meets the threshold.

**Recommendation: auto-find melds on knock.** The client sends `{type:'knock'}` only. Engine computes optimal melds. This removes client-side meld logic and simplifies the phone UI significantly.

### Pattern 4: Layoff Phase

After knock, the opponent action `arrangeMelds` transitions to `opponent_layoff` resolution:

```js
// Client sends their meld arrangement + which cards to lay off
// Engine validates, computes final deadwood counts, scores the hand
function arrangeMelds(state, { playerId, melds, layoffs }) { ... }
```

Or simpler MVP: engine auto-arranges opponent melds and computes optimal layoffs automatically.

**Recommendation: auto-arrange for MVP.** Skip opponent interaction during layoff — engine computes the best possible layoffs automatically. Add manual layoff as a future enhancement if desired.

### Anti-Patterns to Avoid

- **Storing meld state per-turn:** Don't track "current proposed melds" in state during normal play — only commit meld arrangement at knock time.
- **Client-managed deadwood:** Never trust the client's deadwood count. Always recompute server-side.
- **Greedy meld finder:** A greedy approach (find largest meld first) does NOT always minimize deadwood. Must use full recursive search or dynamic programming.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deck creation and shuffle | Custom implementation | Copy `createDeck()` + `shuffleArray()` from shithead.js | Already battle-tested, same card format |
| Error-to-event conversion | Custom try/catch per action | Copy `wrapAction()` from shithead.js | Established engine pattern for error handling |
| Card identity | String-based card IDs | `{id, suit, rank}` objects (shithead format) | Consistent with existing games, enables fast lookup |
| Greedy meld finder | Pick biggest meld iteratively | Recursive exhaustive search (see algorithm below) | Greedy fails: e.g., three sets of three vs. one set of three + one run of seven |

**Key insight for meld finding:** With a 10-card hand, the maximum number of possible melds is bounded (~40–60 combinations). Exhaustive recursive search is fully practical — no need for heuristics or ML approaches. The Ruby gist at https://gist.github.com/yalue/2622575 confirms this approach works well in practice.

---

## Meld Detection Algorithm

**Confidence:** MEDIUM — algorithm design is well-established; specific code is authored here based on the problem structure

### Step 1: Generate All Valid Melds from a Hand

```js
function findAllMelds(hand) {
  const melds = [];

  // Sets: group by rank, collect groups of 3-4
  const byRank = {};
  for (const card of hand) {
    if (!byRank[card.rank]) byRank[card.rank] = [];
    byRank[card.rank].push(card);
  }
  for (const group of Object.values(byRank)) {
    if (group.length >= 3) {
      // Add group of 3 (all combinations) and group of 4
      melds.push({ type: 'set', cards: group.slice(0, 3) });
      if (group.length === 4) {
        melds.push({ type: 'set', cards: group.slice(0, 4) });
        // Also add each 3-card subset
        for (let i = 0; i < 4; i++) {
          melds.push({ type: 'set', cards: group.filter((_, idx) => idx !== i) });
        }
      }
    }
  }

  // Runs: group by suit, sort by rank, find consecutive sequences >= 3
  const bySuit = {};
  for (const card of hand) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(card);
  }
  for (const group of Object.values(bySuit)) {
    const sorted = [...group].sort((a, b) => a.rank - b.rank);
    // Find all runs of length >= 3
    for (let start = 0; start < sorted.length - 2; start++) {
      let end = start;
      while (end + 1 < sorted.length && sorted[end + 1].rank === sorted[end].rank + 1) {
        end++;
      }
      const runLen = end - start + 1;
      if (runLen >= 3) {
        // Add all sub-runs of length 3 to runLen
        for (let len = 3; len <= runLen; len++) {
          for (let s = start; s + len - 1 <= end; s++) {
            melds.push({ type: 'run', cards: sorted.slice(s, s + len) });
          }
        }
      }
    }
  }

  return melds;
}
```

### Step 2: Recursive Optimal Meld Finder

```js
// Returns { melds: [...], deadwood: [...], deadwoodValue: N }
function findOptimalMelds(hand) {
  const allMelds = findAllMelds(hand);
  let best = { melds: [], deadwood: hand, deadwoodValue: hand.reduce((s, c) => s + cardValue(c), 0) };

  function search(remaining, chosenMelds, availableMelds) {
    // Prune: if no more melds possible, evaluate
    if (availableMelds.length === 0) {
      const dw = remaining.reduce((s, c) => s + cardValue(c), 0);
      if (dw < best.deadwoodValue) {
        best = { melds: [...chosenMelds], deadwood: remaining, deadwoodValue: dw };
      }
      return;
    }

    // Try each remaining meld
    for (let i = 0; i < availableMelds.length; i++) {
      const meld = availableMelds[i];
      const meldIds = new Set(meld.cards.map(c => c.id));

      // Skip if any card in this meld already used
      if (meld.cards.some(c => !remaining.find(r => r.id === c.id))) continue;

      // Remove meld cards from remaining
      const newRemaining = remaining.filter(c => !meldIds.has(c.id));
      // Remove all melds that share a card with chosen meld
      const newAvailable = availableMelds.slice(i + 1).filter(
        m => !m.cards.some(c => meldIds.has(c.id))
      );

      search(newRemaining, [...chosenMelds, meld], newAvailable);
    }

    // Also evaluate: skip all remaining melds (base deadwood case)
    const dw = remaining.reduce((s, c) => s + cardValue(c), 0);
    if (dw < best.deadwoodValue) {
      best = { melds: [...chosenMelds], deadwood: remaining, deadwoodValue: dw };
    }
  }

  search(hand, [], allMelds);
  return best;
}
```

### Step 3: Card Value Helper

```js
function cardValue(card) {
  if (card.rank >= 11) return 10;  // J, Q, K
  return card.rank;                 // Ace=1, 2-10=face value
}
```

**Note on Ace rank encoding:** `createDeck()` in shithead.js uses rank 14 for Ace. Gin Rummy needs Ace=1 (low only). Two options:
1. Use rank 1 for Ace in the gin-rummy deck (override `createDeck` locally)
2. Remap: treat rank 14 as rank 1 in all gin-rummy logic

**Recommendation:** Create a local `createGinDeck()` that uses rank 1 for Ace. This avoids confusion with the shithead Ace=14 convention and keeps gin-rummy self-contained.

---

## Deadwood Calculation

```js
function calcDeadwoodValue(cards) {
  return cards.reduce((sum, card) => sum + cardValue(card), 0);
}

// After findOptimalMelds:
const { melds, deadwood, deadwoodValue } = findOptimalMelds(hand);
const canKnock = deadwoodValue <= 10;
const isGin = deadwoodValue === 0;
```

---

## Layoff Algorithm

When the knocker's melds are fixed, the opponent can extend them:

```js
function findLayoffs(opponentCards, knockerMelds) {
  const layoffs = [];
  for (const card of opponentCards) {
    for (const meld of knockerMelds) {
      if (meld.type === 'set') {
        // Can add a 4th card of the same rank
        if (meld.cards.length === 3 && card.rank === meld.cards[0].rank) {
          layoffs.push({ card, meld });
        }
      } else if (meld.type === 'run') {
        // Can extend at either end
        const sorted = [...meld.cards].sort((a, b) => a.rank - b.rank);
        const minRank = sorted[0].rank;
        const maxRank = sorted[sorted.length - 1].rank;
        const isSameSuit = card.suit === sorted[0].suit;
        if (isSameSuit && (card.rank === minRank - 1 || card.rank === maxRank + 1)) {
          layoffs.push({ card, meld });
        }
      }
    }
  }
  return layoffs;
}
```

For MVP auto-layoff: greedily apply all valid layoffs (each reduces opponent deadwood, never hurts). This is always correct — there's no strategic reason for an opponent NOT to lay off.

---

## Common Pitfalls

### Pitfall 1: Greedy Meld Detection
**What goes wrong:** Finding the first/largest meld and removing those cards, then repeating. Produces suboptimal deadwood.
**Why it happens:** Greedy is O(n) vs recursive O(n!), tempting for simplicity.
**How to avoid:** Always use the recursive exhaustive search on a 10-card hand. The search space is small enough (~40-60 melds max).
**Warning signs:** Test case: hand with 3 sets of 3 (9 cards melded, 1 deadwood) vs 1 set of 4 + 1 run of 4 (8 melded, 2 deadwood). Greedy may choose wrong first meld.

### Pitfall 2: Ace Rank Ambiguity
**What goes wrong:** If Ace is encoded as rank 14 (shithead convention), A-2-3 runs won't be detected as consecutive.
**Why it happens:** Shithead uses Ace=14. Gin Rummy needs Ace=1 and Ace-high runs (A-K-Q) are INVALID.
**How to avoid:** Create local `createGinDeck()` with Ace as rank 1. Add a test case: A-2-3 of spades is a valid run. K-A-2 is not.
**Warning signs:** Tests for A-2-3 runs fail.

### Pitfall 3: Discard Constraint Not Enforced
**What goes wrong:** Player draws from discard pile and immediately discards that same card.
**Why it happens:** Easy to forget this rule exists.
**How to avoid:** Track `lastDrawFrom: 'discard'` and `lastDrawnCardId` in state. In `discard` action, throw if `lastDrawFrom === 'discard' && cardId === lastDrawnCardId`.
**Warning signs:** Tests for "draw from discard then discard same card" don't reject the action.

### Pitfall 4: Stock Exhaustion Handling
**What goes wrong:** Game hangs or crashes when stock runs to 0.
**Why it happens:** Drawing from an empty stock — not guarded.
**How to avoid:** Check `stock.length === 0` before draw. At 2 cards remaining after a non-knock discard, set `phase: 'cancelled'` → trigger new hand deal with no score change.
**Warning signs:** Test: play 40+ turns with no one knocking — verify hand cancels correctly.

### Pitfall 5: Layoff onto Deadwood
**What goes wrong:** Opponent attempts to lay off a card onto knocker's unmatched (deadwood) cards.
**Why it happens:** UI might allow it; engine might not validate.
**How to avoid:** `findLayoffs` operates only on `knockerMelds`, never `knockerDeadwood`. Validate in `arrangeMelds` action.

### Pitfall 6: Gin Player Cannot Be Undercut
**What goes wrong:** If knocker has 0 deadwood (gin) and opponent also has 0 deadwood, opponent wins undercut.
**Why it happens:** Scoring logic checks "knocker's deadwood >= opponent's" without gin exception.
**How to avoid:** Check gin BEFORE undercut check: `if (ginType === 'gin') { /* gin bonus, no undercut possible */ }`.

### Pitfall 7: Box Bonus vs. Game Score Conflation
**What goes wrong:** Box bonus points (20 per won hand) are counted toward the 100-point target.
**Why it happens:** Cumulative score tracking doesn't separate hand points from box bonuses.
**How to avoid:** Track `cumulative` (hand scores only) and `boxes` (count of wins) separately. Game ends when `cumulative >= 100`. Final score = `cumulative + boxes * 20 + gameBonus`.

### Pitfall 8: Multi-Hand Dealer Rotation
**What goes wrong:** Same player deals every hand.
**Why it happens:** `dealerIndex` not rotated after each hand.
**How to avoid:** Previous hand winner deals next hand (per standard rules). After hand result, set `dealerIndex` to winner index.

---

## State Machine (Complete)

```
Phase: drawing
  draw(playerId, source:'stock'|'discard')  → phase stays 'drawing', advances turn if discard
  discard(playerId, cardId)                 → phase stays 'drawing', advances to next player
  knock(playerId)                           → phase → 'opponent_layoff'

Phase: opponent_layoff
  arrangeMelds(playerId, ...)               → phase → 'scoring'
  (auto-resolve if no manual layoff)        → phase → 'scoring' immediately

Phase: scoring
  nextHand(playerId)                        → phase → 'drawing' (new hand dealt)
                                              OR phase → 'finished' if someone hit 100

Phase: finished
  (terminal — endIf returns non-null)
```

Actions needed:
- `draw` — draw from stock or discard
- `discard` — discard a card (end turn)
- `knock` — declare knock (engine validates deadwood <= 10, auto-finds melds)
- `arrangeMelds` — opponent action after knock (or auto-resolve)
- `nextHand` — advance past scoring screen to next deal

---

## View Design

### Phone (player) view

Each player sees:
- Their own hand (full cards)
- Opponent hand count only (NOT card contents)
- Current player (whose turn)
- Top of discard pile (always visible)
- Stock count
- Their cumulative score + boxes
- Opponent cumulative score + boxes

During `opponent_layoff`: non-knocker sees knocker's laid-out melds + deadwood to enable layoff decision. If auto-layoff, just show result.

During `scoring`: both players see full scoring breakdown (knocker melds, opponent melds, deadwood counts, points scored).

```js
view(state, playerId) {
  const opponentId = state.players.find(id => id !== playerId);
  const discardTop = state.discard.length > 0 ? state.discard[state.discard.length - 1] : null;

  return {
    phase: state.phase,
    isMyTurn: state.players[state.currentPlayerIndex] === playerId,
    myHand: state.hands[playerId] || [],
    opponentCardCount: (state.hands[opponentId] || []).length,
    discardTop,
    stockCount: state.stock.length,
    cumulative: state.cumulative,
    boxes: state.boxes,
    handNumber: state.handNumber,
    // In layoff/scoring phases, reveal both hands
    ...(state.phase === 'opponent_layoff' || state.phase === 'scoring' ? {
      knocker: state.knocker,
      knockerMelds: state.knockerMelds,
      knockerDeadwood: state.knockerDeadwood,
      opponentMelds: state.opponentMelds,
      opponentDeadwood: state.opponentDeadwood,
      handResult: state.handResult,
    } : {}),
    winner: state.winner,
  };
}
```

### Shared screen (host/display) view

Display receives the same view structure but can show both hands face-up during scoring phases. Implementation: the display could be wired to a `null` playerId or a dedicated display role. For MVP, same view as either player is acceptable.

---

## Code Examples

### Full Setup Function Skeleton

```js
// Source: design from this research document
function setup({ players, config }) {
  if (players.length !== 2) {
    throw new Error('Gin Rummy requires exactly 2 players');
  }
  const [p1, p2] = players;
  return dealNewHand({
    phase: 'drawing',
    players,
    dealerIndex: 0,
    currentPlayerIndex: 1,  // non-dealer goes first
    hands: { [p1]: [], [p2]: [] },
    stock: [],
    discard: [],
    knocker: null,
    knockerMelds: null,
    knockerDeadwood: null,
    opponentMelds: null,
    opponentDeadwood: null,
    ginType: null,
    lastDrawFrom: null,
    lastDrawnCardId: null,
    handResult: null,
    handNumber: 0,
    cumulative: { [p1]: 0, [p2]: 0 },
    boxes: { [p1]: 0, [p2]: 0 },
    winner: null,
  });
}

function dealNewHand(state) {
  const deck = createGinDeck();  // Ace=1
  const [p1, p2] = state.players;
  const hands = {
    [p1]: deck.slice(0, 10),
    [p2]: deck.slice(10, 20),
  };
  const discard = [deck[20]];
  const stock = deck.slice(21);
  const handNumber = state.handNumber + 1;
  const dealerIndex = state.dealerIndex;
  const currentPlayerIndex = 1 - dealerIndex;  // non-dealer goes first

  return {
    ...state,
    phase: 'drawing',
    hands,
    stock,
    discard,
    knocker: null,
    knockerMelds: null,
    knockerDeadwood: null,
    opponentMelds: null,
    opponentDeadwood: null,
    ginType: null,
    lastDrawFrom: null,
    lastDrawnCardId: null,
    handResult: null,
    handNumber,
    dealerIndex,
    currentPlayerIndex,
  };
}
```

### Score Calculation

```js
function scoreHand(knocker, knockerDeadwood, opponentDeadwood, ginType) {
  const kd = calcDeadwoodValue(knockerDeadwood);
  const od = calcDeadwoodValue(opponentDeadwood);

  if (ginType === 'gin') {
    return { winner: knocker, points: od + 20, type: 'gin' };
  }
  if (ginType === 'bigGin') {
    return { winner: knocker, points: od + 31, type: 'bigGin' };
  }
  if (kd < od) {
    return { winner: knocker, points: od - kd, type: 'knock' };
  }
  // Undercut
  const opponent = /* other player */;
  return { winner: opponent, points: kd - od + 10, type: 'undercut' };
}
```

---

## Reusable Code from Shithead

The following functions can be **copied verbatim** from `shithead.js`:

- `shuffleArray(arr)` — lines 6–13
- `createDeck(deckCount)` — lines 15–26 (then override Ace rank to 1)
- `wrapAction(fn)` — lines 448–457

No shared module is needed — straight copy into `gin-rummy.js` is consistent with how shithead duplicates these vs quiz/spy duplicating `shuffleArray` independently.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — gin-rummy is a pure card game, no API calls, no external tools required)

---

## Validation Architecture

nyquist_validation is enabled in config.json.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (globals: false — must import describe/it/expect) |
| Config file | None detected (inline with package.json scripts) |
| Quick run command | `npx vitest run tests/engine/gin-rummy.test.js` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Behavior | Test Type | Automated Command |
|----------|-----------|-------------------|
| Setup: exactly 2 players, 20 cards dealt, 31-card stock, 1 discard | unit | `npx vitest run tests/engine/gin-rummy.test.js` |
| cardValue: Ace=1, face cards=10, others=face value | unit | same |
| findAllMelds: detects 3-card set, 4-card set, 3-card run, longer run | unit | same |
| findOptimalMelds: chooses lower deadwood over greedy meld | unit | same |
| A-2-3 is a valid run; K-A-2 is not | unit | same |
| draw from stock removes from stock, adds to hand | unit | same |
| draw from discard removes from discard top, adds to hand | unit | same |
| discard same card just drawn from discard is rejected | unit | same |
| knock with deadwood > 10 is rejected | unit | same |
| knock with deadwood <= 10 transitions to opponent_layoff | unit | same |
| gin (0 deadwood) sets ginType correctly | unit | same |
| undercut: opponent scores difference + 10 | unit | same |
| gin: knocker scores opponent deadwood + 20, opponent cannot undercut | unit | same |
| stock exhaustion: hand cancelled, no score | unit | same |
| layoff: opponent can extend knocker's run at either end | unit | same |
| layoff: opponent cannot lay off if knocker went gin | unit | same |
| box bonus: not counted toward 100-point threshold | unit | same |
| game ends when cumulative >= 100 | unit | same |
| shutout: winner gets 200-point game bonus if opponent scored 0 | unit | same |
| view: opponent's hand is not revealed (only count) | unit | same |
| view: both hands revealed during scoring phase | unit | same |

### Wave 0 Gaps

- [ ] `tests/engine/gin-rummy.test.js` — does not exist, must be created in Wave 0 (before or alongside implementation)
- [ ] No framework config gaps — vitest already installed and working

---

## Open Questions

1. **Manual vs auto layoff**
   - What we know: pagat.com describes opponent manually laying off. Auto-layoff always benefits the opponent.
   - What's unclear: Does the party game format benefit from an interactive layoff phase, or is it noise?
   - Recommendation: Auto-layoff for MVP. The correct optimal layoff is always "lay off everything you can." Add manual layoff as enhancement if desired.

2. **Big Gin bonus amount**
   - What we know: Pagat.com says "big gin" is a variant, not standard. Bonus is either 31 or 50 points depending on source.
   - What's unclear: Which value is most widely expected.
   - Recommendation: Use 31 for now (pagat.com sourced), make it config-overridable (`config.bigGinBonus`).

3. **First-turn upcard refusal flow**
   - What we know: Non-dealer first chooses the face-up card; if declined, dealer may take it; if both decline, non-dealer draws from stock.
   - What's unclear: In the phone UI, this requires two sequential decisions before normal play begins. Does this need its own phase state?
   - Recommendation: Add a `first_turn` phase with `takeUpcard(playerId)` and `declineUpcard(playerId)` actions. Track who has declined. Cleaner than handling in normal draw logic.

4. **Shared screen display role**
   - What we know: Small Hours uses a TV display + phone controllers. Display connects as a host, not a player.
   - What's unclear: Whether the display gets a separate view or reuses a player view.
   - Recommendation: For gin-rummy, pass `null` (or a `'display'` sentinel) as `playerId` to `view()` during scoring phase, return both full hands. During play, show both hand counts and the discard top.

---

## Sources

### Primary (HIGH confidence)

- https://www.pagat.com/rummy/ginrummy.html — Full rules: dealing, knock rules, scoring (line/box bonus, gin bonus, undercut, game bonus, shutout), stock exhaustion, layoff restrictions. Fetched directly 2026-03-24.
- `src/engine/games/shithead.js` — Deck creation, shuffle, card format, wrapAction pattern. Read directly 2026-03-24.
- `src/engine/engine.js` — Engine contract (createGame, processAction, getView, checkEnd). Read directly 2026-03-24.

### Secondary (MEDIUM confidence)

- https://gist.github.com/yalue/2622575 — Recursive optimal meld finder algorithm in Ruby. Algorithm structure directly applicable to JS.
- https://www.mplgames.com/gin-rummy/gin-rummy-scoring — Big Gin bonus amounts cross-reference.

### Tertiary (LOW confidence)

- WebSearch results for meld algorithm approaches — confirms recursive exhaustive search is standard practice for 10-card hands; not formally verified.

---

## Metadata

**Confidence breakdown:**
- Rules (dealing, phases, scoring): HIGH — directly from pagat.com
- Meld detection algorithm: MEDIUM — algorithm structure from Ruby gist + standard CS reasoning
- Deadwood calculation: HIGH — simple arithmetic, confirmed by multiple sources
- Engine integration patterns: HIGH — directly read from source code
- Big Gin bonus amount (31 vs 50): MEDIUM — pagat says variant, MPL says 31, others say 50

**Research date:** 2026-03-24
**Valid until:** 2027-03-24 (game rules are stable; engine patterns valid until engine refactor)
