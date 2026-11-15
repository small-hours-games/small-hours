import rules from './rules.js';

export default {
  ...rules,
  id: 'sensor-lab',
  order: 99,
  label: 'Sensor Lab',
  icon: '📱',
  hidden: true, // Development game: toggle on/off in /admin -> Lobby Visibility
  min: 1,
  max: 8,
  blurb: 'Dev tool • Live 3D phone gyro, accel & device telemetry',
  music: false,
  roundCountdown: false,
};
