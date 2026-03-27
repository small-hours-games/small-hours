# Phase 6: Fanned Pile Display - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Show the top 4-5 cards of the Shithead pile as a fanned/cascading spread on both TV (host) and phone (player) displays, so players can see what's in the pile to inform gameplay decisions like burning.

</domain>

<decisions>
## Implementation Decisions

### Pile Data
- **D-01:** Engine view sends top 4-5 pile cards (not just pileTop). Always send up to 5 regardless of whether they match — players need to see the full recent pile history.
- **D-02:** `pileTop` still needed for backward compatibility. Add a new `pileCards` array (top 5, ordered bottom-to-top) alongside existing fields.

### Fan Layout
- **D-03:** Solitaire-style cascading vertical fan — each card slightly offset downward, overlapping the previous card. Not a rotated arc or horizontal spread.
- **D-04:** Cards should overlap enough that you can identify each card's rank/suit from the visible portion.

### Game Scope
- **D-05:** Shithead only for now. Gin Rummy discard pile stays as single top card.
- **D-06:** Implementation should be reusable — if future card games need a fanned pile, the rendering function should be easy to apply.

### Display Targets
- **D-07:** Show fanned pile on BOTH TV (host.html) and phone (player.html).
- **D-08:** TV version can be larger cards; phone version should be appropriately sized for mobile.

### Claude's Discretion
- Exact card offset distance (px) for the cascade
- Whether to cap at 4 or 5 cards in the fan
- CSS implementation approach (absolute positioning vs flexbox vs negative margins)
- Whether to add a subtle shadow/depth effect between cards
- Card dimensions for the fan (smaller than current 100x140 pile-top to fit multiple)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Engine
- `src/engine/games/shithead.js` — view() function (line ~396) currently sends pileTop and pileCount. Must be modified to send pileCards array.
- `src/engine/games/shithead.js` — countTopMatching() (line ~64) shows how pile is traversed

### Frontend
- `public/js/cards.js` — renderCardImg() used for all card rendering
- `public/host.html` — Shithead pile rendering (line ~1192) currently shows single pileTop card
- `public/player.html` — Shithead pile rendering uses renderCardImg with pileCard:true
- `public/css/style.css` — Card CSS styles including .playing-card, .pile-card classes

### Test Harness
- `tests/engine/game-harness.js` — Test helpers for game definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `renderCardImg(c, opts)` in cards.js — already handles all card states, can render fan cards at smaller sizes
- `.pile-card` CSS class — existing pile card styling (larger dimensions)
- `countTopMatching(pile)` — already traverses pile from top, similar pattern needed for pileCards extraction

### Established Patterns
- Engine view sends only what the player needs to see (information hiding)
- Card rendering via shared cards.js module (no duplication between host/player)
- State-delta tracking for sound effects (lastShState pattern)

### Integration Points
- `shithead.js view()` — add pileCards to the returned object
- `host.html renderShitheadState()` — replace single pileTop render with fanned pile
- `player.html` — same pile rendering update for phone view

</code_context>

<specifics>
## Specific Ideas

- User explicitly requested "sunfeather" / solitaire-style cascade — vertical offset, not horizontal poker-style fan
- Key use case: seeing multiples of same rank (e.g., 3x 6 of hearts) to decide whether to burn the pile with a 4th
- Pile visibility helps players make strategic decisions about when to play 10s or complete 4-of-a-kind burns

</specifics>

<deferred>
## Deferred Ideas

- Gin Rummy fanned discard pile — future phase if needed
- Animated card-to-pile transition when playing a card
- Pile card count badge on the fan

</deferred>

---

*Phase: 06-fanned-pile-display*
*Context gathered: 2026-03-27*
