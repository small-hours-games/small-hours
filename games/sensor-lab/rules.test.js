import { describe, it, expect } from 'vitest';
import manifest from './index.js';
import rules from './rules.js';
import { isGameVisibleInLobby } from '../../src/games/visibility.js';

describe('sensor-lab', () => {
  it('is hidden by default in the lobby and can be toggled on/off', () => {
    expect(manifest.hidden).toBe(true);
    expect(isGameVisibleInLobby(manifest, {})).toBe(false);
    expect(isGameVisibleInLobby(manifest, { 'sensor-lab': true })).toBe(true);
    expect(isGameVisibleInLobby(manifest, { 'sensor-lab': false })).toBe(false);
  });

  it('stores sanitized sensor snapshots per player', () => {
    const s0 = rules.setup({ players: ['p1', 'p2'] });
    expect(s0.phase).toBe('live');
    expect(s0.players).toEqual(['p1', 'p2']);

    const { state: s1 } = rules.actions.sensorUpdate(s0, {
      playerId: 'p1',
      orient: { alpha: 120.44, beta: -45.67, gamma: 999, absolute: true },
      accel: { x: 1.234, y: -2.5, z: 500 },
      device: { viewportW: 390, viewportH: 844, hasGyro: true, hasAccel: true, batteryLevel: 85 },
      hz: 15.2,
      seq: 7,
      permission: 'granted',
    });

    const snap = s1.sensors.p1;
    expect(snap.orient).toEqual({ alpha: 120.4, beta: -45.7, gamma: 180, absolute: true });
    expect(snap.accel).toEqual({ x: 1.23, y: -2.5, z: 100 });
    expect(snap.device.viewportW).toBe(390);
    expect(snap.device.batteryLevel).toBe(85);
    expect(snap.hz).toBe(15.2);
    expect(snap.permission).toBe('granted');
    expect(s1.sensors.p2).toBeNull();
  });

  it('finishes cleanly on finish action', () => {
    const s0 = rules.setup({ players: ['p1'] });
    expect(rules.endIf(s0)).toBeNull();
    const { state: s1 } = rules.actions.finish(s0);
    expect(s1.phase).toBe('finished');
    expect(rules.endIf(s1)).toEqual({ winner: null, scores: {} });
  });
});
