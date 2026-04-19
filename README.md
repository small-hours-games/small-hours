# Small Hours Games — Design System

**Small Hours Games** is a real-time multiplayer party game platform. One shared screen (TV/monitor) serves as the game display; players connect and control their input from their phones — no app download, no account required.

## Sources

- **Logo asset**: `uploads/Shg-gemeni-trans.png` (provided directly)
- **Codebase**: `https://github.com/small-hours-games/small-hours` — full Node.js game engine + vanilla JS frontend
- **Key frontend files**: `public/css/style.css`, `public/host.html`, `public/player.html`, `public/index.html`
- **Card assets**: `public/cards/` — SVG playing card faces + back, WAV audio clips

## Products / Surfaces

| Surface | File | Description |
|---|---|---|
| **Landing Page** | `public/index.html` | Create or join a room; mobile-first |
| **Host Display** | `public/host.html` | TV/monitor view — lobby + live game view, scoreboard sidebar, chat overlay |
| **Player Controller** | `public/player.html` | Phone UI — joins via room code, shows per-player game actions |

---

## Content Fundamentals

**Tone**: Casual, playful, late-night energy. Think friends huddled around a TV at 1am. Warm but sharp.

**Voice**:
- Second person: *"Join at…"*, *"Your Name"*, *"You're the spy!"*
- Short, punchy labels — never wordy
- Lower-cased labels where informal feel is wanted: *"or join an existing room"*, *"late-night party games with friends"*
- SHOUTING in all-caps only for room codes: `ABCD`
- Micro-copy is functional but has personality: *"Party games best played in the small hours"*

**Casing**:
- UI labels: Title Case for card titles, sentence case for body/instructions
- Room code: ALL CAPS monospace
- Game names: Title Case — *Number Guess*, *Spy Game*, *Shithead*, *Gin Rummy*

**Emoji**: Used sparingly and only for player avatars (🐸🐱🦄) and a few status icons (💩 for loser in Shithead). Not used in buttons or navigation.

**Copy examples**:
- `"Late-night party games with friends"`
- `"Waiting for players to join..."`
- `"Get ready for the next round..."`
- `"[Player] is the Shithead! 💩"`
- `"Party games best played in the small hours"`

---

## Visual Foundations

### Colors
Dark neon theme — deep space black backgrounds with multi-colored neon accents.

| Role | Value |
|---|---|
| Background | `#0a0a1a` deep navy-black |
| Card surface | `rgba(20, 20, 40, 0.8)` translucent midnight blue |
| Purple (primary) | `#b347d9` |
| Blue | `#4dc9f6` |
| Green | `#39ff14` neon chartreuse |
| Pink | `#ff6ec7` |
| Orange | `#ff9f43` |
| Red | `#ff4757` |
| Text primary | `#e0e0ff` slightly lavender white |
| Text secondary | `#8888aa` muted slate |
| Glass border | `rgba(179, 71, 217, 0.3)` semi-transparent purple |

### Typography
- **Primary font**: `'Segoe UI', system-ui, -apple-system, sans-serif` (substituted with **Outfit** from Google Fonts in design system — see note below)
- **Mono / room codes**: `'Courier New', monospace`
- **Weights**: 400 (body), 500 (labels), 600 (buttons/caps), 700 (scores, names), 900 (titles, room codes, big numbers)
- **Title size**: 3rem with gradient text clip (purple→blue→pink animated)
- **Room code size**: 5rem, letter-spacing 0.3em
- **Section labels**: 0.85rem, uppercase, letter-spacing 0.1em, secondary color
- **No serif usage anywhere**

### Spacing & Sizing
- Base unit: 8px
- Card padding: 24–28px (16px on mobile)
- Gap: 8px / 16px / 24px / 32px / 40px
- Min tap target: 48px (`min-height: 48px` on all buttons)

### Backgrounds
- Full-page animated gradient: 3 radial ellipses (purple @ 20% left, blue @ 80% right, pink @ center bottom), all low opacity (6–12%), layered on `#0a0a1a`
- Animation: `bgFloat` — 15s ease-in-out infinite alternate — slow hue-rotate (0°→15°→-10°) + scale(1→1.05)
- Floating particles: tiny 1–3px dots in brand colors rising from bottom (30 total, random speed/delay)
- **No full-bleed photography** — all atmosphere comes from the gradient + particle system

### Cards / Glass
- `background: rgba(20, 20, 40, 0.8)` + `backdrop-filter: blur(12px)`
- `border: 1px solid rgba(179, 71, 217, 0.3)` — subtle purple glass rim
- `border-radius: 16px`
- No traditional drop-shadow — glow only via `box-shadow: 0 0 N px rgba(color, opacity)`
- Ready state: green border + green tinted background

### Buttons
| Variant | Style |
|---|---|
| Primary | `linear-gradient(135deg, #b347d9, #4dc9f6)` — purple→blue |
| Secondary | Transparent bg, glass border |
| Success | `linear-gradient(135deg, #39ff14, #00cc88)` — dark text |
| Danger | `linear-gradient(135deg, #ff4757, #ff6ec7)` |
- Hover: `translateY(-2px)` + neon glow box-shadow
- Active/press: `scale(0.97)` 
- Disabled: `opacity: 0.4`, no transform
- Border-radius: 12px
- Min-height: 48px

### Animation & Motion
- Easing: `ease` or `ease-in-out` throughout — no spring/bounce
- Durations: 0.2s (hover/micro), 0.3s (fade-in/toast), 0.4s (card flip), 15s (bg float)
- `fadeIn`: `opacity 0 + translateY(10px)` → normal
- `pulse`: opacity 1→0.5→1 (used for disconnected state, waiting messages)
- Confetti: 60 pieces, brand colors, fall with random rotation over 2–5s
- Timer bar: left-to-right gradient (green→blue, orange→red when warning/critical)
- `iconPulse`: logo scale 1→1.05 + drop-shadow intensity, 3s loop

### Neon Glow System
- Text glow: multi-layer `text-shadow` — 10px, 40px, 80px at progressively lower opacity
- Box glow: `box-shadow: 0 0 10px color, 0 0 20px color` at focus or hover
- Gradient text: `-webkit-background-clip: text; -webkit-text-fill-color: transparent` on titles
- Scrollbar: purple tinted, 6px, transparent track

### Hover States
- Buttons: lift (`translateY(-2px)`) + neon glow box-shadow
- Player cards: subtle bg lighten (`rgba(255,255,255,0.06)`)
- Card hands: card rises (`translateY(-6px)`) + z-index lift

### Border Radius System
- Cards / major containers: `16px`
- Buttons: `12px`
- Inputs: `8px`
- Avatars / status dots: `50%`
- Playing cards: `8px`
- Pills / tags: `20px`

### Corner Vibe
Consistent rounded-rect language — nothing sharp, nothing pill-shaped for primary elements.

### Imagery
- **Playing card SVGs**: fully illustrated court cards (King, Queen, Jack, Jokers), pip cards — white background, full-color suits
- **No photos or raster illustrations**
- **Logo**: iridescent purple/blue/teal, clock + lightbulb + hexagonal network nodes + playing cards at bottom

### Iconography
Player avatars use HTML entity emoji (`&#128056;` frog, `&#128049;` cat, etc.) — a palette of 16 animal emoji. No icon font or SVG icon set is used in the current codebase. Unicode characters used for status/directional indicators (▲▼ for hot/cold, ◀ for current player).

---

## ICONOGRAPHY

- **Icon system**: None — no icon font, no SVG sprite. Pure emoji + unicode characters.
- **Player avatars**: 16 rotating animal emoji (frog, cat, unicorn, bee, mouse, hedgehog, owl, lion, whale, horse, parrot, kangaroo, whale, sheep, sloth, dog)
- **Status**: 🔊/🔇 sound toggle, ✓ for ready/out states, ◀ for current turn marker
- **Game results**: 💩 for Shithead loser
- **CDN substitution**: Not applicable — no icon library used. If adding icons, recommend **Lucide** (stroke, lightweight, consistent weight matches the clean UI language).

---

## File Index

```
README.md                    ← This file
SKILL.md                     ← Claude Code skill definition
colors_and_type.css          ← All CSS custom properties (colors, type, spacing, semantic)
assets/
  logo.png                   ← Primary brand logo (transparent PNG)
  cards/
    back.svg                 ← Playing card back
  style.css                  ← Full production stylesheet (copied from repo)
preview/
  colors-brand.html          ← Brand color palette swatches
  colors-semantic.html       ← Semantic / UI state colors
  type-scale.html            ← Typography scale specimen
  type-mono.html             ← Monospace / room code specimen
  components-buttons.html    ← Button variants
  components-inputs.html     ← Input + form elements
  components-cards.html      ← Card / glass surface system
  components-player.html     ← Player list, avatars, leaderboard
  components-timer.html      ← Timer bar + connection status
  components-toast.html      ← Toast notifications
  brand-logo.html            ← Logo usage
  brand-background.html      ← Animated background system
ui_kits/
  host/                      ← TV host display UI kit
    index.html               ← Full TV lobby + game view prototype
  player/                    ← Mobile player controller UI kit
    index.html               ← Full phone controller prototype
```
