import rules from './rules.js';
import { choosePalaceAction } from './bot.js';

// Let a card finish its flight to the pile on the TV (tcFlightMs) before the next bot move.
const AFTER_FLIGHT_MS = 2_000;
const FLIGHT_EVENTS = new Set(['play', 'burn', 'blind-miss']);
const afterFlight = state => (FLIGHT_EVENTS.has(state.lastEvent?.kind) ? AFTER_FLIGHT_MS : undefined);

export default {
  ...rules,
  id: 'shithead',
  order: 3,
  label: 'Palace',
  icon: '👑',
  min: 2,
  max: 6,
  blurb: '2–6 players • Beat the pile, don’t be last!',
  soloBlurb: 'Solo vs AI • Beat the bots, don’t be last!',
  music: true,
  ai: { default: 2, max: 4, cardsPerSeat: 9, choose: choosePalaceAction, delay: afterFlight },
  privateKeys: ['swapConfirmed'],
  story: {
    title: 'Palace',
    theme: 'orange',
    intro: 'Korten är lagda. Äran tillhör den som blir av med allt först. Den siste kvar bär skammens krona. Spela klokt, krigare.',
  },
};
