import rules from './rules.js';

export default {
  ...rules,
  id: 'tennis',
  order: 9,
  label: 'Small Hours Tennis',
  icon: '🎾',
  min: 2,
  max: 2,
  blurb: '1v1 • Swing your phone like a racket to rally and smash!',
  soloBlurb: 'Solo vs AI • Swing your phone like a racket!',
  music: true,
  roundCountdown: false,
  // TV physics drives bot_1 at 60 FPS; engine bot hook stays idle.
  ai: { default: 1, max: 1, choose: () => null },
};
