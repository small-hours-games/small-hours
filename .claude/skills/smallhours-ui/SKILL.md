---
name: smallhours-ui
description: >-
  Smallhours house rules for anything visual or interactive in this repo: the TV/host screen, the phone controller, the landing page, lobby, scoreboards, game client screens (games/<id>/client), CSS, animations, sounds and accessibility. Use this skill whenever a task touches public/*.html, public/css, public/js, games/*/client, brand assets, or asks to design, restyle, polish, fix the layout of, or review the UI/UX of Smallhours, even if the request doesn't say "UI". Read it before frontend-design or web-design-guidelines; where they disagree, this skill wins.
---

# Smallhours UI

Smallhours is a party game for one shared screen and up to 20 phones. Every UI decision
starts from that: people are on a sofa, slightly distracted, talking to each other, and
holding a phone in one hand. AGENTS.md has the code map and architecture; this skill is
about how the screens should look, feel and behave.

## Two screens, two jobs

**The TV (`/tv`, `/host/CODE`, `public/host.html`, `games/<id>/client/tv.js`)** is read
from three metres away and is the shared stage. Design for 1920×1080 first and check
1280×720. Body text at least 28px at 1080p, scores and timers much bigger, high contrast,
no hover states, nothing that needs a pointer after the first click (browsers block audio
until one interaction; the Android TV app is a WebView driven by a remote). Show what
everyone needs at once: the question or board, whose turn it is, the timer, scores, and
who has answered. Leave room around the edges for TV overscan.

**The phone (`public/player.html`, `games/<id>/client/phone.js`, `phone.html`)** is a
private controller. Portrait, one thumb, 360–430px wide. Touch targets at least 48px with
space between them, primary actions in the lower half, respect `env(safe-area-inset-*)`.
The phone should say at a glance what the player can do right now, and say clearly when
the answer is "nothing, wait" (and for whom). Expect flaky Wi-Fi: every state must survive
a reload and the 30-second reconnect.

Never put private information on the TV: hands, a player's answer before the reveal,
hidden roles. The engine already sends private fields only to their owner (`my*`,
`privateKeys`); the UI must not undo that by echoing them to the host screen.

## Stack constraints

- No build step and no framework. Plain `<script>` tags that expose globals; check script
  order and existing helpers in `public/js/` before adding a file.
- Tailwind 3.4.17 from the CDN, configured by `public/js/tailwind-config.js`; shared CSS in
  `public/css/`; a game's own styles in `games/<id>/client/style.css`.
- A game's screens go through `SH.registerGame` (`public/js/game-api.js`). Do not edit the
  shell pages (`host.html`, `player.html`) for one game.
- Card games reuse the table-cards kit (`public/js/table-cards*.js`,
  `public/css/table-cards.css`) and `card-sounds.js`; music goes through `lobby-music.js`.
- New dependencies only for a concrete need, loaded from a pinned CDN URL.

## Brand

The name is **Smallhours**, one word. Display font Fredoka, text font Plus Jakarta Sans
(both already loaded from Google Fonts on every page). Brand palette from the README:
night `#0b1530`, sun `#facc15`, sky `#38bdf8`, lilac `#a78bfa`, coral `#fb7185`,
mint `#34d399`. Logos and icons are in `public/images/`; use the light or dark logo to
match the background.

The working tokens live in `public/css/smallhours.css` (`--bg-primary`, `--text-primary`,
the `--neon-*` accents) and the `brand` colours in `tailwind-config.js`. Reuse those
before adding new ones; the `--neon-*` names are historical, not a style instruction. If a
change needs a new colour, add it as a variable next to the others and say so.

**How this fits with `frontend-design`:** that skill pushes for a fresh visual identity.
Smallhours already has one, so keep its fonts, palette and logo, and use frontend-design
for composition, hierarchy and the big moments inside the brand (a reveal, a winner
screen, a new game's board) rather than for a new look.

## Party-game UX

- **Legibility of state beats decoration.** At every moment someone glancing at the TV
  should know the phase, whose turn it is and how long is left.
- **Make the reveal a moment.** Reveals, round ends and winners deserve one strong,
  well-timed animation and a sound; everyday state changes should be quick (150–300ms).
- **Feedback within 100ms on the phone.** A tap shows a pressed or locked-in state before
  the server answers; send one action per tap and disable the control until the reply.
- **Don't rely on colour alone.** Players, suits and right/wrong answers also need a
  shape, icon, label or avatar (the four-colour suits keep their suit symbols).
- **Respect `prefers-reduced-motion`.** Existing CSS already has blocks for it; new
  animation (topbar show, confetti, mascots) gets one too.
- **Sound is optional.** Anything announced by the narrator or a sound must also be shown.
- **The next round should be one tap away** for the admin, and nobody should be stuck on a
  screen with no way back to the lobby.

## Accessibility baseline

Semantic buttons and links (no clickable `div`s), labels on inputs (name, room code, chat),
`aria-label` on icon-only buttons, `alt` on images (`alt=""` for decoration),
`aria-live="polite"` for chat and "your turn" notices on the phone, visible
`:focus-visible` styles (the TV remote moves focus), contrast at least 4.5:1 for text and
3:1 for large text and UI parts. For a fuller review, use `web-design-guidelines`.

## Before you call a UI change done

1. Check the TV at 1920×1080 and a phone at about 390×844, including the waiting,
   reconnect and finished-game states the change affects.
2. Check a long player name, 20 players, and an empty or single-player room where relevant.
3. Run the affected frontend tests (`npx vitest run tests/...`) and `npm test` for shared
   changes.
4. Report what you actually saw in a browser and what you only reasoned about; a passing
   unit test does not prove the screen looks right.
