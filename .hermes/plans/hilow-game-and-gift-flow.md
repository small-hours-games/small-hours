# Plan: Nytt spel (Högt/Lågt) + present-flöde + alla spel spelbara

**Godkänd av användaren:**
- Nytt snabbt tur-baserat partyspel → **Högt/Lågt (hilow)**
- Present: vinnaren får en **delbar digital presentlänk/QR** (diplom/förmånskod) att ge till en kompis
- "Fixa alla spel så man kan spela" → verifiera att alla 5+1 spel startar och skickar vinnare

## 1. Nytt spel: `hilow` (Högt/Lågt)

Tur-baserat partyspel. En "aktiv spelare" drar upp ett kort (synligt för alla).
Alla *andra* spelare gissar om nästa dragna kort blir **högre** eller **lägre**
än det nuvarande. Rätt gissning = +1 poäng. Rundor roterar aktiv spelare.
Först till `target` poäng (default 5) vinner.

Följer exakt `template.js`-mönstret: `{ setup, actions, view, endIf }`.

- `src/engine/games/hilow.js` (ny)
- Registrera i `src/engine/games/index.js` + `GAME_REGISTRY` i `src/session/room.js`
  (label 'Högt/Lågt', minPlayers 2, maxPlayers 8, complexity 1)
- `view()` returnerar: `phase`, `currentCard` (rank+suit), `scores`, `activePlayer`,
  `round`, `winner`, `lastResult` (för feedback)
- `endIf()` → `{ winner, scores }` (redan standard, host visar vinnare)
- `tests/engine/hilow.test.js` (ny) — setup, gissa högt/lågt, poäng, vinst

## 2. Present-flöde (digital delbar länk/QR)

Vid vinst genereras en delbar presentlänk som vinnaren ger till en kompis.

- `src/session/gifts.js` (ny): `createGift({ roomCode, winnerId, gameType })` →
  sparar `{ token: 'gift_'+randomBytes(12), roomCode, winnerId, gameType, awardedAt }`
  i `data/gifts.json` (append, atomic write) + returnerar token.
  `getGift(token)` läser upp.
- `src/transport/http.js`:
  - `POST /api/rooms/:code/gift` → skapar present för nuvarande vinnare,
    returnerar `{ url: 'https://'+DOMAIN+'/gift/'+token }`
  - `GET /gift/:token` → serverar `public/gift.html`
- `src/transport/ws-adapter.js`: när `endResult.winner` finns, anropa
  `createGift(...)` och lägg `giftUrl` i det broadcastade `GAME_STATE` (finished).
- `public/gift.html` (ny): visar "🎉 {winnerName} vann {gameLabel}!" + roligt diplom
  + en **förmånskod** (token) kompisen kan använda för att skapa ett eget rum
  (kopieras via Dela-knapp). Visar också en QR-kod (klient-genererad via qrcode-lib
  från CDN, eller förgenererad SVG av servern — vi använder en liten inline QR-render
  i JS för att undvika nytt beroende).
- `public/host.html`: vid `phase === 'finished'` med `giftUrl` → visa "Vinnare: X"
  + **Dela present**-knapp (kopierar länk) + QR för presenten.

**Ingen inlösning mot externt** — presenten är en delbar sida + förmånskod.

## 3. Alla spel spelbara

Redan startbara via `GAME_REGISTRY`. Verifiering:
- Enhetstest/integration som startar varje spel (number-guess, quiz, spy,
  shithead, gin-rummy, skogai, question-form, template, **hilow**) och
  bekräftar `availableGames()` listar dem vid rätt spelarantal.
- Bekräfta `winner` når host (redan i `endIf` för alla).

## Filer (sammanfattning)
- Nya: `src/engine/games/hilow.js`, `tests/engine/hilow.test.js`,
  `src/session/gifts.js`, `public/gift.html`
- Ändrade: `src/engine/games/index.js`, `src/session/room.js`,
  `src/transport/http.js`, `src/transport/ws-adapter.js`, `public/host.html`

## Verifiering
- `npm test` — allt grönt (nya hilow + gift-tester)
- Manuell smoke: starta server, skapa rum, spela hilow till vinst,
  bekräfta `giftUrl` dyker upp + `/gift/:token` renderar.
