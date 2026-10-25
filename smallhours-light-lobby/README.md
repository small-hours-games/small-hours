# Smallhours Light Lobby

A self-contained HTML/CSS/JavaScript mockup of the Smallhours light-mode lobby.

## Run it

Open `index.html` in a modern browser. No build step or external libraries are required.

## Included

- Responsive three-column lobby layout
- Room code and embedded QR code for `https://quiz.aldervall.se/player/944C`
- Game cards for Quiz, Music Quiz, Shithead and Gin Rummy
- Local demo voting interactions
- Player list and sample chat history
- Local message sending and emoji shortcut
- Muted/sound-on UI toggle

## Important integration note

Voting and chat are local browser-only demo interactions. They do not broadcast between players or persist after refresh. Connect the handlers in `index.html` to your existing API/WebSocket/realtime backend for multiplayer functionality. The sound toggle is visual only until an audio player is connected.
