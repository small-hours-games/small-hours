# Phase 05: Card Game GUI — Research

**Researched:** 2026-03-27
**Domain:** Browser-based card rendering, CSS/SVG card visuals, Web Audio API, vanilla JS animation
**Confidence:** HIGH

## Summary

The objective is to upgrade the card game frontend in Small Hours (Shithead and Gin Rummy) from the current text/Unicode symbol approach to rich SVG card faces with sound effects. The stated source is JLogical-Apps/cards — a Flutter/Dart project. **The code is not portable** — it is a mobile/desktop Flutter app and no JavaScript can be extracted from it. What IS portable are the assets: 54 SVG card face images (one per card plus suit symbols and jokers) and 5 WAV sound files. These assets are high-quality, MIT-compatible, and can be used directly in a browser.

The implementation is therefore: (1) download the SVG card faces and WAV sounds from the repo into `public/`, (2) update the `renderCard()` helpers in `host.html` and `player.html` to display `<img>` tags referencing the SVGs instead of the current text/symbol divs, and (3) wire up Web Audio API (no library needed) to play the WAV files in response to game events. No build step, no npm dependencies, no Canvas — pure vanilla JS/HTML matching the project's no-build-step philosophy.

CSS card flip and fan animations are well-supported in all modern browsers using `perspective` + `transform: rotateY()` and `transition`. These can be added progressively without library dependencies.

**Primary recommendation:** Extract SVG faces and WAV sounds from JLogical-Apps/cards, serve them as static assets, replace text-card divs with `<img src="/cards/SUIT-RANK.svg">` elements, add Web Audio for sound events, and add CSS keyframe animations for deal/flip. No external JS dependencies required.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase. No locked decisions have been made. All choices are at Claude's discretion.

## Source Repo Reality Check

| Claim | Reality | Impact |
|-------|---------|--------|
| "Port rendering from JLogical-Apps/cards" | The repo is Flutter/Dart — zero JS to port | Code = not usable |
| Card visual assets | 54 SVG card faces, 9 card back SVGs — browser-ready | Assets = directly usable |
| Physics/animations | Flutter widget animations — not portable | Must implement in CSS/JS |
| Sound effects | 5 WAV files (draw, place, undo, deck_redraw, win) — browser-ready | Assets = directly usable |
| Source license | MIT (JLogical Apps open-source project) | Assets free to use |

**Verified:** GitHub API confirms all SVG faces exist at `https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/faces/SUIT-RANK.svg` and WAV files at `assets/sounds/*.wav`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Browser built-in | Sound effects playback | No dependency, universal browser support, low-latency |
| CSS Animations / Transitions | Browser built-in | Card flip, deal, fan animations | Zero-dependency, GPU-accelerated via transform |
| SVG `<img>` elements | HTML5 standard | Card face rendering | Direct browser support, scalable, lightweight |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AudioContext (Web Audio) | Browser built-in | Decode WAV, manage playback | Must resume after user gesture on mobile |
| CSS `perspective` + `rotateY` | Browser built-in | 3D card flip effect | For flip animations during reveal |
| CSS `transform: translateY/rotate` | Browser built-in | Card fan layout | For phone hand display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SVG `<img>` | Canvas sprite sheet | Canvas is more performant for 100+ moving cards, but overkill here |
| Web Audio API | Howler.js (npm) | Howler adds polish (fade, sprite), but project philosophy is earn-dependencies-first |
| CSS animations | GSAP (npm) | GSAP is smoother but requires build step integration |
| WAV files direct | Convert to MP3/OGG | WAV works everywhere modern; conversion reduces size 70% but adds build step |

**Installation:** No npm packages needed. Assets only.

## Asset Inventory (from JLogical-Apps/cards)

### Card Faces (54 SVG files)
Format: `SUIT-RANK.svg` where SUIT is `CLUB|DIAMOND|HEART|SPADE` and RANK is `1..9|10|11-JACK|12-QUEEN|13-KING`.

Example filenames:
- `HEART-1.svg` (Ace of Hearts)
- `SPADE-13-KING.svg` (King of Spades)
- `CLUB-11-JACK.svg` (Jack of Clubs)
- `DIAMOND-10.svg` (Ten of Diamonds)
- `JOKER-1.svg`, `JOKER-2.svg`, `JOKER-3.svg`
- `HEART.svg`, `DIAMOND.svg`, `CLUB.svg`, `SPADE.svg` (suit symbols only)

Card dimensions: `261 x 355` units (viewBox) — standard poker card ratio ~2:3.

### Card Backs (9 SVG files)
`back.svg`, `red-poly.svg`, `red-steps.svg`, `sky-poly.svg`, etc. The plain `back.svg` is simplest for facedown cards.

### Sound Files (5 WAV files)
| File | Size | When to Play |
|------|------|-------------|
| `draw.wav` | ~35KB | Player draws a card from stock/discard |
| `place.wav` | ~30KB | Card played to pile or discarded |
| `deck_redraw.wav` | ~40KB | Deck shuffled / new hand dealt |
| `undo.wav` | ~26KB | Action undone (less relevant here) |
| `win.wav` | ~164KB | Game/hand won |

### Download URLs
```
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/faces/HEART-1.svg
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/backs/back.svg
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/sounds/draw.wav
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/sounds/place.wav
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/sounds/deck_redraw.wav
https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/sounds/win.wav
```

## Architecture Patterns

### Recommended Project Structure
```
public/
├── cards/
│   ├── faces/           # 54 SVG card face images (SUIT-RANK.svg)
│   ├── backs/           # back.svg (and optionals)
│   └── sounds/          # draw.wav, place.wav, deck_redraw.wav, win.wav
├── host.html            # TV display (update renderCard helpers)
└── player.html          # Phone controller (update renderCard helpers)
```

### Pattern 1: SVG Card Element Helper
**What:** Replace the current inline text-based card HTML with `<img>` referencing the downloaded SVG.
**When to use:** Every place a card face is rendered.

**Current approach (text-based):**
```js
// Both host.html and player.html have inline helpers like:
function hostCard(c) {
  const r = {1:'A', 11:'J', 12:'Q', 13:'K'}[c.rank] || c.rank;
  const s = {h:'\u2665', d:'\u2666', c:'\u2663', s:'\u2660'}[c.suit];
  return '<div style="width:48px;height:64px;...">' + r + s + '</div>';
}
```

**New approach (SVG-based):**
```js
// Shared utility (can be in a <script> block used by both HTML files,
// or duplicated since there's no build step)
function cardSvgPath(c) {
  const suitMap = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };
  const rankMap = {
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
    8: '8', 9: '9', 10: '10', 11: '11-JACK', 12: '12-QUEEN', 13: '13-KING',
    14: '14-ACE'   // if any game uses ace=14
  };
  const suit = suitMap[c.suit] || c.suit.toUpperCase();
  const rank = rankMap[c.rank] || c.rank;
  return '/cards/faces/' + suit + '-' + rank + '.svg';
}

function renderCard(c, opts = {}) {
  // opts: { width, height, selected, playable, facedown, onclick }
  const w = opts.width || 58;
  const h = opts.height || 82;
  const cls = ['playing-card', opts.selected ? 'selected' : '', opts.facedown ? 'facedown' : ''].filter(Boolean).join(' ');
  const src = opts.facedown ? '/cards/backs/back.svg' : cardSvgPath(c);
  const click = opts.onclick ? 'onclick="' + opts.onclick + '"' : '';
  return '<img class="' + cls + '" src="' + src + '" width="' + w + '" height="' + h + '" ' + click + ' draggable="false">';
}
```

### Pattern 2: Web Audio Sound System
**What:** Preload WAV files into AudioContext buffers on first user gesture, play on game events.
**When to use:** Triggered from the render functions when game events arrive via WebSocket.

```js
// Source: MDN Web Audio API documentation
// Place this in a <script> block in host.html and player.html

const audio = {
  ctx: null,
  buffers: {},

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = ['draw', 'place', 'deck_redraw', 'win'];
    await Promise.all(sounds.map(name => this._load(name)));
  },

  async _load(name) {
    try {
      const res = await fetch('/cards/sounds/' + name + '.wav');
      const buf = await res.arrayBuffer();
      this.buffers[name] = await this.ctx.decodeAudioData(buf);
    } catch (e) {
      // Sound loading failure is non-fatal — degrade gracefully
      console.warn('Sound load failed:', name, e);
    }
  },

  play(name) {
    if (!this.ctx || !this.buffers[name]) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.connect(this.ctx.destination);
    src.start(0);
  }
};

// Initialize on first user interaction (required by browser autoplay policy)
document.addEventListener('click', () => audio.init(), { once: true });
```

### Pattern 3: CSS Card Flip Animation
**What:** 3D flip reveal for scoring phase (Gin Rummy hand reveal, Shithead face-down plays).
**When to use:** When a facedown card is revealed.

```css
/* Source: MDN CSS transforms documentation */
.card-flip-container {
  perspective: 600px;
  display: inline-block;
}

.card-flip-inner {
  position: relative;
  transition: transform 0.4s ease;
  transform-style: preserve-3d;
}

.card-flip-container.flipped .card-flip-inner {
  transform: rotateY(180deg);
}

.card-face, .card-back {
  position: absolute;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.card-back {
  transform: rotateY(180deg);
}
```

### Pattern 4: Card Fan Layout (Phone Hand Display)
**What:** Cards in a player's hand displayed as overlapping fan.
**When to use:** Phone controller showing own cards.

```css
/* Overlapping fan for hand display */
.card-hand {
  display: flex;
  position: relative;
  padding-bottom: 12px; /* room for selected card to lift */
}

.card-hand .playing-card {
  margin-left: -20px;  /* overlap */
  transition: transform 0.15s ease, margin 0.15s ease;
  cursor: pointer;
}

.card-hand .playing-card:first-child {
  margin-left: 0;
}

.card-hand .playing-card.selected {
  transform: translateY(-12px);
}

.card-hand .playing-card:hover {
  transform: translateY(-6px);
  z-index: 10;
}
```

### Anti-Patterns to Avoid
- **Serving SVGs as inline HTML strings:** Bloats the DOM and prevents browser caching. Use `<img src="...">` instead.
- **Creating new AudioContext on every sound:** Browsers limit AudioContext instances. Create once, reuse.
- **Playing audio before user gesture:** Browser autoplay policy will silently block it on mobile. Always gate on first interaction.
- **One-to-one JS files for frontend:** Project uses no build step — shared utilities go in `<script>` blocks or a single `public/js/cards.js` loaded by both HTML files.
- **Separate CSS file per game:** Keep card CSS in the shared `public/css/style.css` or each HTML's existing `<style>` block.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card face artwork | Custom CSS/SVG card faces | JLogical-Apps SVG assets | 52 high-quality SVG files already exist and work in browsers |
| Sound effects | Record or synthesize audio | JLogical-Apps WAV files | 5 appropriate card sounds already exist |
| Audio library | Custom audio manager | Web Audio API | Built into every modern browser, no download needed |
| Card flip animation | JS-driven frame loop | CSS `transition` + `transform: rotateY` | GPU-accelerated, declarative, zero JS |
| Physics simulation | Physics engine (Matter.js etc.) | CSS transitions + transforms | Overkill for card games — simple deal/flip/select is enough |

**Key insight:** The only "porting" work is asset extraction + mapping the existing card data model `{rank, suit}` to SVG filenames. All animation and sound is achievable with platform APIs.

## Mapping: Card Data Model to SVG Filenames

The current card model uses `{rank: 1-14, suit: 'h'|'d'|'c'|'s'}`. The SVG filenames use `SUIT-RANK.svg` where:

| Engine field | SVG convention | Notes |
|-------------|---------------|-------|
| `suit: 'h'` | `HEART` | |
| `suit: 'd'` | `DIAMOND` | |
| `suit: 'c'` | `CLUB` | |
| `suit: 's'` | `SPADE` | |
| `rank: 1` | `1` (not `ACE`) | File is `HEART-1.svg` |
| `rank: 2-9` | `2`-`9` | Direct numeric |
| `rank: 10` | `10` | Direct numeric |
| `rank: 11` | `11-JACK` | Named suffix for face cards |
| `rank: 12` | `12-QUEEN` | Named suffix |
| `rank: 13` | `13-KING` | Named suffix |
| `rank: 14` | No SVG (use `1`) | Shithead uses rank 14 for Ace |

**Shithead note:** Shithead uses rank 14 for Ace (high). The SVG only has `SUIT-1.svg`. The display mapping must handle `rank: 14 → '1'` filename.

## Game-Specific Rendering Requirements

### Shithead (existing, `player.html` + `host.html`)

**Current state:** CSS text cards with `.playing-card`, `.card-rank`, `.card-suit` spans.

**Locations to update in `player.html`:**
- Swap phase hand/face-up card lists (lines ~1522-1527)
- Pile top display (line ~1579)
- Normal play hand, face-up, face-down card lists (lines ~1616-1655)

**Locations to update in `host.html`:**
- Pile top card in play phase (lines ~1166-1168)
- Player face-up cards in status display (lines ~1228-1231)

**Sound events:** `draw` → draw.wav; played card to pile → place.wav; burn pile (2/10/4-of-a-kind) → deck_redraw.wav.

### Gin Rummy (existing, `player.html` + `host.html`)

**Current state:** Inline `hostCard()` / `grCard()` functions generating text-based divs.

**Locations to update in `player.html`:**
- `grCard()` helper function (line ~1821)
- Discard top display (line ~1777)
- Scoring reveal meld display (lines ~1926-1945)

**Locations to update in `host.html`:**
- `hostCard()` function in `renderGinRummy` (lines ~1035-1044)
- Discard top display (lines ~1067-1070)
- Scoring meld reveal (lines ~1096-1111)

**Sound events:** Draw from stock/discard → draw.wav; discard card → place.wav; new hand deal → deck_redraw.wav; gin/win → win.wav.

## Common Pitfalls

### Pitfall 1: Browser Autoplay Policy Blocks Audio
**What goes wrong:** Audio calls are silently ignored or throw `NotAllowedError` until a user has interacted with the page.
**Why it happens:** All modern browsers (Chrome 2018+, Safari, Firefox) block autoplay audio without prior user gesture.
**How to avoid:** Wrap `AudioContext` creation in a listener on first `click` or `keydown`. The init call must happen inside a user event handler.
**Warning signs:** No errors but no audio on first card play; audio works after clicking elsewhere.

### Pitfall 2: SVG File Size for Face Cards
**What goes wrong:** Face cards (Jack, Queen, King) have complex artwork — CLUB-11-JACK.svg is 118KB. Loading 10 hand cards = 1.2MB of SVGs.
**Why it happens:** Illustrated face cards are complex SVG paths.
**How to avoid:** Preload only the visible hand cards, not the entire deck. Use browser caching (SVGs are cached after first load). Consider lazy loading on phone (only own hand visible).
**Warning signs:** Slow first render on phone on a weak WiFi connection.

### Pitfall 3: Shithead Rank 14 Has No SVG
**What goes wrong:** Ace in Shithead uses rank 14 (not 1). Looking up `HEART-14.svg` → 404.
**Why it happens:** JLogical-Apps SVGs use rank 1 for Ace only.
**How to avoid:** The `cardSvgPath()` mapper must alias `rank: 14 → '1'`.
**Warning signs:** Broken image icons on Ace cards in Shithead.

### Pitfall 4: `<img>` Inside Flexbox Needs Explicit Dimensions
**What goes wrong:** SVG `<img>` tags without explicit `width`/`height` attributes may render at their natural viewBox size (260px wide) causing layout explosion.
**Why it happens:** SVGs have a viewBox but no intrinsic pixel size unless explicitly set.
**How to avoid:** Always specify `width` and `height` on every `<img class="playing-card">` element.
**Warning signs:** Cards suddenly appear enormous.

### Pitfall 5: AudioContext Limit
**What goes wrong:** Each `new AudioContext()` consumes a browser resource; Chrome warns after 6.
**Why it happens:** Creating a new context per sound play.
**How to avoid:** Create one `AudioContext` (singleton), preload all buffers into it, create `BufferSourceNode` per play call (they are cheap and single-use by design).
**Warning signs:** Chrome warning "An AudioContext was prevented from starting automatically."

### Pitfall 6: CSS Backface Visibility Safari Bug
**What goes wrong:** Card flip shows both faces simultaneously on Safari/iOS.
**Why it happens:** Safari requires `-webkit-backface-visibility: hidden` in addition to the standard property.
**How to avoid:** Always include both vendor-prefixed and standard properties on `.card-face` and `.card-back`.
**Warning signs:** Both sides visible during flip animation on iPhone.

## Code Examples

### Loading and Serving SVG Assets
```bash
# Download all 54 SVG faces (run once)
mkdir -p public/cards/faces public/cards/backs public/cards/sounds

# Download faces (54 files)
for suit in CLUB DIAMOND HEART SPADE; do
  for rank in 1 2 3 4 5 6 7 8 9 10; do
    curl -s "https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/faces/${suit}-${rank}.svg" \
      -o "public/cards/faces/${suit}-${rank}.svg"
  done
  for named in "11-JACK" "12-QUEEN" "13-KING"; do
    curl -s "https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/faces/${suit}-${named}.svg" \
      -o "public/cards/faces/${suit}-${named}.svg"
  done
done

# Download back
curl -s "https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/backs/back.svg" \
  -o "public/cards/backs/back.svg"

# Download sounds
for sound in draw place deck_redraw win; do
  curl -s "https://raw.githubusercontent.com/JLogical-Apps/cards/master/assets/sounds/${sound}.wav" \
    -o "public/cards/sounds/${sound}.wav"
done
```

### CSS for SVG Card Elements
```css
/* Source: derived from existing .playing-card CSS in player.html */
.playing-card {
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
  -webkit-user-drag: none;
  display: block;
}

.playing-card.selected {
  transform: translateY(-10px);
  box-shadow: 0 0 14px rgba(57, 255, 20, 0.5);
  outline: 2px solid var(--neon-green);
  border-radius: 8px;
}

.playing-card.playable {
  box-shadow: 0 0 8px rgba(57, 255, 20, 0.25);
}

.playing-card.unplayable {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### Shared Card Renderer (shared between both HTML files via `/js/cards.js`)
```js
// public/js/cards.js
// Source: original pattern derived from existing renderCard helpers

const SUIT_MAP = { h: 'HEART', d: 'DIAMOND', c: 'CLUB', s: 'SPADE' };
const RANK_MAP = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5',
  6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: '11-JACK', 12: '12-QUEEN', 13: '13-KING',
  14: '1'  // Shithead uses 14 for Ace, maps to same SVG as rank 1
};

function cardSvgSrc(c) {
  const suit = SUIT_MAP[c.suit] || c.suit.toUpperCase();
  const rank = RANK_MAP[c.rank] || String(c.rank);
  return '/cards/faces/' + suit + '-' + rank + '.svg';
}

function renderCardImg(c, opts = {}) {
  const w = opts.width || 58;
  const h = opts.height || 82;
  const classes = ['playing-card'];
  if (opts.selected) classes.push('selected');
  if (opts.playable === true) classes.push('playable');
  if (opts.playable === false) classes.push('unplayable');
  const src = opts.facedown ? '/cards/backs/back.svg' : cardSvgSrc(c);
  const onclick = opts.onclick ? ' onclick="' + opts.onclick + '"' : '';
  return '<img class="' + classes.join(' ') + '" src="' + src + '" width="' + w + '" height="' + h + '" draggable="false"' + onclick + '>';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Canvas sprite sheets for cards | SVG per-card images | ~2018+ (SVG browser support matured) | Simpler, no sprite math, scalable |
| Flash/Java card games | CSS3 + Web Audio API | 2012-2015 | Universal browser support |
| JS animation libraries | CSS transitions + keyframes | 2016+ | GPU-accelerated, no dependencies |
| AudioPlayer object per sound | AudioContext + BufferSource | 2015+ | Lower latency, more control |

**Deprecated/outdated:**
- `<audio>` HTML element for game sound effects: Works but has ~100ms latency vs Web Audio API's near-zero latency. Acceptable for background music, not card sounds.
- Flash/Java applets: Dead since 2020.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | Serving static files | Already running | 22 LTS | — |
| curl | Asset download script | Checked: standard Linux tool | — | wget |
| Web Audio API | Sound effects | Browser built-in | All modern browsers | Silent degradation |
| CSS transforms | Card flip/fan | Browser built-in | All modern browsers | Static card display |
| GitHub raw content CDN | Asset download | Verified 200 OK | — | Manual download |

No new server-side dependencies needed. Express already serves `public/` as static files.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 |
| Config file | `package.json` (scripts.test: vitest run) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

This phase is a frontend visual upgrade with no backend logic changes and no new engine functions. The card rendering helpers are pure string functions embedded in HTML files. Vitest tests run in Node.js, not a browser, so DOM/audio testing requires a browser harness (not in this project's stack).

| Behavior | Test Type | Notes |
|----------|-----------|-------|
| `cardSvgSrc({rank:1, suit:'h'})` → `'/cards/faces/HEART-1.svg'` | Unit | Testable if extracted to `public/js/cards.js` |
| `cardSvgSrc({rank:14, suit:'s'})` → `'/cards/faces/SPADE-1.svg'` | Unit | Shithead ace=14 aliasing |
| `cardSvgSrc({rank:11, suit:'d'})` → `'/cards/faces/DIAMOND-11-JACK.svg'` | Unit | Face card naming |
| Sound plays on draw event | Manual | Requires browser |
| Card flip CSS | Manual | Requires browser |
| SVG assets accessible via HTTP | Smoke | `curl http://localhost:3001/cards/faces/HEART-1.svg` → 200 |

### Wave 0 Gaps
- [ ] `tests/frontend/card-renderer.test.js` — unit tests for `cardSvgSrc()` mapping function (only if `cards.js` is extracted to a testable module)
- [ ] Asset download script `scripts/download-card-assets.sh` — Wave 0 task to populate `public/cards/`

*(Note: if `renderCardImg` stays inline in HTML files as string concatenation, unit testing is impractical without a DOM. The mapping function `cardSvgSrc` should be extracted to a separate file for testability.)*

## Open Questions

1. **Shared JS file vs. duplication**
   - What we know: `host.html` and `player.html` both need `cardSvgSrc()` and `renderCardImg()`. There's no build step.
   - What's unclear: Should these be in a `public/js/cards.js` loaded by both with `<script src="/js/cards.js">`, or duplicated inline?
   - Recommendation: Extract to `public/js/cards.js` — enables testing and avoids sync drift.

2. **Sound on phone vs. TV only**
   - What we know: WAV sound effects exist for draw, place, win, deck_redraw.
   - What's unclear: Should sounds play on the phone (player.html) too, or only on the TV (host.html)?
   - Recommendation: Play sounds on host display only (TV has speakers). Phone receives WebSocket events but need not play audio.

3. **Animation scope**
   - What we know: The gin-rummy CONTEXT.md listed "Card animations on TV display" as a deferred idea.
   - What's unclear: Does this phase include deal animations and flip animations, or just static SVG upgrades + sound?
   - Recommendation: Phase 05 should include CSS flip animation for the gin rummy scoring reveal (the "big moment") and a deal animation (cards sliding in). Fan layout for phone is CSS only. Physics simulation (gravity, tumbling) is out of scope.

4. **Card back style selection**
   - What we know: 9 card back SVG variants exist (back.svg, red-poly.svg, etc.)
   - What's unclear: Should players be able to select a card back style?
   - Recommendation: Use `back.svg` as default. Selection feature is out of scope for this phase.

## Sources

### Primary (HIGH confidence)
- GitHub API: `https://api.github.com/repos/JLogical-Apps/cards/` — confirmed asset inventory, filenames, sizes, download URLs
- MDN Web Audio API — AudioContext, BufferSourceNode, decodeAudioData patterns
- MDN CSS Transforms — perspective, rotateY, backface-visibility
- Direct HTTP probe: all SVG and WAV files confirmed accessible via raw.githubusercontent.com (HTTP 200)

### Secondary (MEDIUM confidence)
- JLogical-Apps/cards `lib/services/audio_service.dart` — confirmed 5 sound events: draw, place, undo, deck_redraw, win
- Existing `player.html` and `host.html` source — confirmed current card rendering approach and all locations requiring update

### Tertiary (LOW confidence — needs browser validation)
- Safari `-webkit-backface-visibility` requirement — widely documented community knowledge, not verified in official Safari release notes

## Metadata

**Confidence breakdown:**
- Asset inventory: HIGH — verified via GitHub API with HTTP 200 checks
- Architecture approach: HIGH — matches existing no-build-step constraint
- Sound implementation: HIGH — Web Audio API is well-documented standard
- CSS animations: HIGH — CSS transforms are standard
- Update locations in HTML files: HIGH — verified by reading actual source

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable browser APIs; SVG assets unlikely to move from public GitHub repo)
