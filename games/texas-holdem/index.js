import rules from './rules.js';
import { chooseHoldemAction } from './bot.js';

export default {
  ...rules,
  id: 'texas-holdem',
  order: 7,
  label: "Texas Hold'em",
  icon: '🤠',
  min: 2,
  max: 8,
  blurb: '2–8 players • No-Limit Hold’em on the TV, hole cards on your phone!',
  soloBlurb: 'Solo vs AI • Play No-Limit Hold’em against the bots!',
  music: true,
  ai: { default: 3, max: 5, choose: chooseHoldemAction },
  privateKeys: ['myHand', 'myToCall', 'myMinRaiseTo', 'myMaxBetTo', 'myCanCheck'],
};
