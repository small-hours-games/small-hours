import rules from './rules.js';
import { chooseGinAction } from './bot.js';

export default {
  ...rules,
  id: 'gin-rummy',
  order: 4,
  label: 'Gin Rummy',
  icon: '♠️',
  min: 2,
  max: 2,
  blurb: '2 players • Build sets & runs, knock low!',
  soloBlurb: 'Solo vs AI • Knock before Nova-7 does!',
  music: true,
  ai: { default: 1, max: 1, choose: chooseGinAction },
  privateKeys: ['canKnock', 'lastDrawnCardId'],
};
