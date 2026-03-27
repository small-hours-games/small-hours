# Phase 05 — UI Review

**Audited:** 2026-03-27
**Baseline:** 05-UI-SPEC.md (approved design contract)
**Screenshots:** Captured (desktop 1440x900, mobile 375x812) — landing page only; card game views require in-session state

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | "Draw from Stock" / "Draw from Discard" violate the spec-declared "Draw" CTA; dead `.playing-card.red/.black` CSS still present |
| 2. Visuals | 3/4 | SVG cards wired correctly at all sites; card-flip-container and card-deal-in CSS defined but neither class applied anywhere in the HTML |
| 3. Color | 3/4 | All accent colors come from pre-existing custom properties; hardcoded `#0a0a1a` used inline in two places outside style.css |
| 4. Typography | 3/4 | Spec allows only 400 and 700 weights; inline style.css block in player.html introduces 500 (score-name) and 600 (multiple) weights not declared in spec |
| 5. Spacing | 3/4 | Card-specific spacing matches spec tokens; Shithead host pile top uses 100x140px (not 68x96 from spec table) — intentional decision per SUMMARY but undocumented in spec |
| 6. Experience Design | 3/4 | Sound state tracking solid with lastShState/lastGrState; audio.init() correctly deferred; card-flip reveal animation defined but not wired into scoring phase |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Dead CSS block in player.html (lines 410–450) overrides style.css card states** — The inline `<style>` block inside player.html still contains the old text-card rules (`.playing-card.red`, `.playing-card.black`, `.card-rank`, `.card-suit`, `.pile-card` width/height, `.playing-card.selected { translateY(-6px) }`) which conflict with the canonical rules in `style.css` (selected lift is `-12px` per spec, inline override locks it at `-6px`). Since inline styles have higher specificity, the specced lift and glow are silently wrong on the phone controller. Fix: delete lines 395–450 of player.html's inline `<style>` block that duplicate card rules.

2. **CTA labels "Draw from Stock" / "Draw from Discard" violate spec** — The UI-SPEC copywriting contract declares the primary CTA as "Draw" (not "Draw from Stock"). Two buttons in player.html (lines 1820–1821) use expanded labels. This is a minor clarity tradeoff but constitutes a direct spec deviation. Fix: change to `"Draw"` and `"Draw (discard)"` or simply `"Draw"` on the primary button as specified, moving the source distinction to context (pile state) rather than button label.

3. **card-flip-container and card-deal-in are CSS dead code** — Both animation systems are fully defined in style.css (lines 655–719) but neither class is applied anywhere in player.html or host.html. The scoring reveal phase shows cards via simple `renderCardImg()` without the flip wrapper, meaning opponent card reveals during gin rummy scoring have no visual animation. Fix: wrap scoring cards in `.card-flip-container > .card-flip-inner > .card-face / .card-back` structure in the scoring rendering block, and apply `.card-deal-in` with `style="--i: N"` on initial card deal renders in host.html.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

**Deviations from spec copywriting contract:**

- `player.html:1820` — Button label is `"Draw from Stock"`. Spec declares this CTA as `"Draw"`.
- `player.html:1821` — Button label is `"Draw from Discard"`. Spec declares this CTA as `"Draw"`.
- `player.html:1835` — Button label is `"Knock!"` (with exclamation). Spec declares `"Knock"` (no exclamation). Minor but a contract deviation.
- `player.html:1886` — `typeLabels = { knock: 'Knock', undercut: 'Undercut!', gin: 'GIN!', bigGin: 'BIG GIN!' }` — "GIN!" matches the spec-declared "Gin!" but uses all-caps. "Knock" label here is consistent.
- `host.html:1099` — Same `typeLabels` object. "Gin!" in spec vs "GIN!" in code — minor case deviation.

**Spec-compliant copywriting found:**
- `player.html:1586` — `"Your turn!"` present (spec: "Your turn" implied by neon-green indicator)
- `player.html:1595` — `"Waiting for [PlayerName]..."` matches spec pattern
- `player.html:1618` — Empty hand state uses `"Empty"` rather than spec-declared `"No cards"`
- Empty pile states use `"Empty"` throughout; spec declares `"No cards"` for empty hand state specifically

**Dead CSS strings:** The old inline `<style>` block in player.html still contains commented intent for `.card-rank`, `.card-suit`, `.playing-card.red`, `.playing-card.black` — these rules are not in use by any generated HTML (no `cardColor()` function remains) but they pollute the source and cause the specificity conflict described in Priority Fix 1.

---

### Pillar 2: Visuals (3/4)

**What works correctly:**
- 54 SVG card faces on disk, card back SVG present, all 4 WAV sound files present
- All 14 `renderCardImg()` calls in player.html and 7 in host.html confirmed
- `draggable="false"` is set in the `renderCardImg()` template in cards.js (line 38), preventing browser drag interference
- Shithead facedown cards correctly use `back.svg` via `{facedown: true}` option
- Selected card: lift + neon-green glow declared in style.css (line 626–631) at `-12px`
- Playable card hint glow and unplayable dim both defined in style.css
- Focal point for host: Shithead pile top at 100x140 is visually dominant
- Focal point for phone: hand row at bottom with selected lift is the active anchor

**Gaps:**

- `card-flip-container` CSS class defined in style.css (lines 655–679) but `grep -c "card-flip-container" player.html host.html` returns 0 for both files. The spec Animation Contract explicitly calls for this during scoring reveal. The scoring section uses plain `renderCardImg()` output with no flip wrapper.
- `card-deal-in` CSS class defined in style.css (lines 718–719) but not applied in either HTML file. Spec says cards should animate in via `cardDeal` keyframe on the host display. This is listed as "optional progressive enhancement" in the spec but is still a defined contract.
- Player.html inline `<style>` block (lines 413–416) redefines `.playing-card.selected` with `transform: translateY(-6px)`, which overrides the style.css value of `-12px`. Because the inline `<style>` tag loads after the external stylesheet and has equal specificity for non-cascaded rules, the actual lift seen on the phone controller is `-6px` — half the specced value.
- No alt text or aria-labels on `<img class="playing-card">` elements. Cards are interactive but carry only `onclick` handlers with no screen-reader equivalent.

---

### Pillar 3: Color (3/4)

**Spec-compliant color usage:**
- All card state colors use CSS custom properties from the existing system: `var(--neon-green)`, `var(--neon-blue)`, `var(--neon-purple)`, `var(--text-secondary)`
- Accent `var(--neon-green)` correctly scoped to: selected card glow, playable hint, turn indicator (20 refs in player.html — all intentional)
- No new CSS custom properties introduced
- `--neon-red` correctly avoided for card states (spec says opacity-only for unplayable)

**Issues:**

- `player.html:2038` — Inline style `background:var(--neon-green);color:#000;` on "Submit All" button uses hardcoded `#000` instead of the documented `#0a0a1a` (which is `--bg-primary`). Minor but a hardcoded value.
- `host.html:1341` — `const colors = ['#b347d9', '#4dc9f6', '#39ff14', '#ff6ec7', '#ff9f43', '#ff4757']` defines a raw hex array for player scoreboard colors. These match the custom property values exactly but bypass the token system. Not in card-specific code but worth noting.
- `player.html:410–411` — Dead CSS for `.playing-card.red` uses `#ff4757` and `#e0e0ff` inline instead of `var(--neon-red)` and `var(--text-primary)`. These rules are unreachable by any current HTML output, so no live visual impact — but they should be removed.
- `style.css:131` — `.btn-primary` gradient includes hardcoded `#00cc88` alongside `var(--neon-green)`. Pre-existing issue, not introduced by phase 05.

---

### Pillar 4: Typography (3/4)

**Spec declares:** body 400/16px, label 400/14px, heading 700/20px, display 700/32px. Maximum 2 weights: 400 and 700.

**Weights found in style.css:**
- `font-weight: 600` — lines 88, 221, 230, 248, 415, 446, 497 (7 occurrences)
- `font-weight: 900` — lines 382, 545 (2 occurrences)
- `font-weight: 500` — line 215

These are pre-existing in the global stylesheet (non-card sections) and were not introduced by phase 05. The spec for phase 05 is card-specific and does not require restyling pre-existing game UI.

**Card-specific typography:**
- Scoring zone labels use `font-size: 0.85rem` (14px) — matches spec label size
- Event log uses `font-size: 1rem` — matches body
- Score headers at `font-size: 1.8rem` / `font-weight: 700` — slightly below 32px/2rem display spec but within a reasonable range
- `host.html:1134` — "Game Over!" rendered at `font-size: 2rem` with `color: var(--neon-green)` — matches spec display size

**Player.html inline style block overlap:** The inline `<style>` in player.html adds card-specific typography (`font-size: 1.3rem`, `1.8rem` on `.card-rank`, `.card-suit`) that reference the old text-card structure. These are dead rules that will never match any rendered output, but they bloat the inline style block with non-spec sizes.

---

### Pillar 5: Spacing (3/4)

**Spec spacing tokens and their implementation:**

| Token | Value | Expected usage | Found |
|-------|-------|----------------|-------|
| xs (4px) | gap between meld cards | `gap: 2px` on `host.html:1115` | Minor under-spec (2px vs 4px) |
| sm (8px) | gap between cards in hand row | Not explicitly set; fan uses `-20px` overlap | Fan layout uses margin overlap, not gap — matches spec exception |
| md (16px) | section padding | Various `padding: 12px 16px` in game panels | Consistent |
| lg (24px) | vertical zone padding | `margin-top: 24px`, `.mt-3` | Present |

**Card element dimensions vs spec:**

| Context | Spec | Actual | Match |
|---------|------|--------|-------|
| Phone hand card default | 58x82 | `renderCardImg` default `w=58, h=82` | Exact match |
| Phone pile top | 80x112 | `player.html:1578, 1760` — `{width:80, height:112}` | Exact match |
| Host GR discard top | 68x96 | `host.html:1086` — `{width:68, height:96}` | Exact match |
| Scoring meld card | 40x56 | `player.html:1911, host.html:1115` — `{width:40, height:56}` | Exact match |
| Host Shithead pile top | Not specified (spec table says 68x96 for "Host display pile top") | `host.html:1195` — `{width:100, height:140}` | Over-spec — larger than declared table value |

The Shithead host pile top at 100x140 was a deliberate executor decision documented in 05-02-SUMMARY.md ("Shithead pile top: renderCardImg() with width:100, height:140"). The spec card size table entry "Host display pile top | 68px | 96px" appears to have been written for Gin Rummy only. This is not a defect but a spec ambiguity — the size is visually appropriate and the decision is logged.

**Fan overlap:** `.card-hand .playing-card { margin-left: -20px }` matches the spec-declared 20px overlap. First-child margin reset is present. Selection lift is `-12px` in style.css per spec (though the inline override in player.html partially negates this as noted in Pillar 2).

**Meld gap:** `host.html:1115` uses `gap:2px` instead of the spec's xs=4px. This is a minor underspec.

---

### Pillar 6: Experience Design (3/4)

**State coverage:**

- **Sound transitions:** `lastShState` and `lastGrState` objects correctly track state deltas to prevent duplicate sound fires on re-render (host.html:600–601, 1045–1174). All 4 sound events wired: `draw`, `place`, `deck_redraw`, `win`.
- **Audio init:** `audio.init()` deferred to first `click` or `keydown` event with `{ once: true }` (host.html:604–605). Correct per browser autoplay policy.
- **Audio failure:** `cards.js:59` uses `.catch(function(e) { console.warn(...) })` — non-fatal as specified.
- **Turn state:** `"Your turn!"` and `"Waiting for [name]..."` states both implemented in player.html.
- **Empty pile:** Shithead empty pile uses a styled empty div (player.html:1580). Gin Rummy discard uses `"Empty"` text.
- **Facedown cards:** `back.svg` used consistently via `{facedown: true}` option. No "?" text fallback needed since back.svg is present.
- **Playability:** `playable: msg.isMyTurn ? playable : undefined` pattern correctly omits playable/unplayable class when not the player's turn.

**Gaps:**

- **card-flip animation not wired:** The scoring reveal in both player.html (lines 1891–1930) and host.html (lines 1093–1132) renders cards via plain `renderCardImg()` with no `.card-flip-container` wrapper. Opponent cards in gin rummy scoring appear instantly — the spec's 400ms flip reveal never fires.
- **card-deal-in not applied:** No cards receive the `.card-deal-in` class on deal. The `@keyframes cardDeal` animation is defined but unreachable.
- **No loading state for SVG assets:** If the card SVG files fail to load (404), the browser renders a broken-image icon. The spec accepts this as the fallback, so it is not a defect, but there is no skeleton or placeholder.
- **No aria-label on interactive card images:** `<img onclick="...">` elements have no `alt` or `aria-label`. Screen readers cannot identify card rank/suit. This is a pre-existing pattern in the codebase and not a phase 05 regression, but worth flagging.

---

## Registry Safety

Registry audit: No shadcn components.json found. Third-party dependency for this phase is static asset download only (SVG/WAV files from JLogical-Apps/cards, MIT license). No executable code from external registries. Registry safety gate not required.

---

## Files Audited

- `/home/dellvall/small-hours/public/js/cards.js` — shared module
- `/home/dellvall/small-hours/public/css/style.css` — card game styles (lines 615–720)
- `/home/dellvall/small-hours/public/player.html` — phone controller (2144 lines)
- `/home/dellvall/small-hours/public/host.html` — TV display (1364 lines)
- `/home/dellvall/small-hours/public/cards/faces/` — 54 SVG files confirmed
- `/home/dellvall/small-hours/public/cards/backs/back.svg` — present
- `/home/dellvall/small-hours/public/cards/sounds/` — 4 WAV files confirmed
- `/home/dellvall/small-hours/tests/frontend/card-renderer.test.js` — 16 unit tests
- `.planning/phases/05-.../05-UI-SPEC.md` — design contract baseline
