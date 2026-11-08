import rules from './rules.js';

export default {
  ...rules,
  id: 'hilow',
  hidden: true, // no screens yet
  label: 'Högt/Lågt',
  icon: '🃏',
  min: 2,
  max: 8,
  privateKeys: ['isActive'],
};
