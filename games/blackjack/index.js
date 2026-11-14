import rules from './rules.js';

export default {
  ...rules,
  id: 'blackjack',
  order: 6,
  label: 'Blackjack',
  icon: '🃏',
  min: 1,
  max: 8,
  blurb: '1–8 players • Beat the dealer to 21 without busting!',
  soloBlurb: 'Solo vs Dealer • Bet chips, hit, stand or double down!',
  music: true,
  privateKeys: ['mySeat', 'myCanDouble', 'myCanSplit'],
};
