import rules from './rules.js';
import { chooseSjuanAction } from './bot.js';

export default {
  ...rules,
  id: 'sjuan',
  order: 5,
  label: 'Sjuan',
  icon: '7️⃣',
  min: 2,
  max: 8,
  blurb: '2–8 players • Build from the sevens, be first out!',
  soloBlurb: 'Solo vs AI • Build from the sevens, beat the bots!',
  music: true,
  ai: { default: 2, max: 4, choose: chooseSjuanAction },
};
