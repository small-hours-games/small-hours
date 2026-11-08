// Builds the four-colour variants of the classic number cards (A to 10):
// clubs blue, diamonds orange. Court cards keep their drawn colours; only their
// corner index changes colour, which table-cards.css handles.
//   node scripts/four-colour-faces.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FACES = new URL('../public/cards/faces/', import.meta.url);
const OUT = new URL('../public/cards/faces-4c/', import.meta.url);
// Keep in step with --tc-four-c / --tc-four-d in public/css/table-cards.css.
const CLUB = '#1f4fd6';
const DIAMOND = '#d35a0c';
const DIAMOND_LIGHT = '#ffc9a3';

mkdirSync(OUT, { recursive: true });
for (let rank = 1; rank <= 10; rank++) {
  // Diamonds: the red pips become orange (the light pink only appears in the deck's index).
  const d = readFileSync(new URL(`DIAMOND-${rank}.svg`, FACES), 'utf8')
    .replace(/#c8102e|#d40000/gi, DIAMOND)
    .replace(/#ffaaaa/gi, DIAMOND_LIGHT);
  writeFileSync(new URL(`DIAMOND-${rank}.svg`, OUT), d);

  // Clubs: pips are paths with no fill of their own (black by default); give them blue.
  const c = readFileSync(new URL(`CLUB-${rank}.svg`, FACES), 'utf8')
    .replace(/<path([^>]*?)style="([^"]*)"/g, (m, pre, style) =>
      /fill\s*:/.test(style) ? m : `<path${pre}style="${style};fill:${CLUB}"`);
  writeFileSync(new URL(`CLUB-${rank}.svg`, OUT), c);
}
console.log('Wrote 20 four-colour faces to public/cards/faces-4c/');
