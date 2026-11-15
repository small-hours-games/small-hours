// Sensor Lab — live mobile sensor diagnostic & 3D orientation visualizer.

const MAX_ACCEL = 100;

function clampNum(v, min, max, decimals = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(min, Math.min(max, n));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function sanitizeVec3(obj, min, max, decimals = 2) {
  if (!obj || typeof obj !== 'object') return null;
  const x = clampNum(obj.x, min, max, decimals);
  const y = clampNum(obj.y, min, max, decimals);
  const z = clampNum(obj.z, min, max, decimals);
  if (x === null && y === null && z === null) return null;
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}

function sanitizeOrient(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const alpha = clampNum(obj.alpha, -360, 360, 1);
  const beta = clampNum(obj.beta, -180, 180, 1);
  const gamma = clampNum(obj.gamma, -180, 180, 1);
  if (alpha === null && beta === null && gamma === null) return null;
  return {
    alpha: alpha ?? 0,
    beta: beta ?? 0,
    gamma: gamma ?? 0,
    absolute: Boolean(obj.absolute),
  };
}

function sanitizeRotRate(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const alpha = clampNum(obj.alpha, -2000, 2000, 1);
  const beta = clampNum(obj.beta, -2000, 2000, 1);
  const gamma = clampNum(obj.gamma, -2000, 2000, 1);
  if (alpha === null && beta === null && gamma === null) return null;
  return { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0 };
}

function sanitizeDevice(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return {
    screenOrient: typeof obj.screenOrient === 'string' ? obj.screenOrient.slice(0, 32) : null,
    screenAngle: clampNum(obj.screenAngle, 0, 360, 0),
    viewportW: clampNum(obj.viewportW, 0, 10000, 0),
    viewportH: clampNum(obj.viewportH, 0, 10000, 0),
    dpr: clampNum(obj.dpr, 0.5, 8, 2),
    maxTouch: clampNum(obj.maxTouch, 0, 32, 0),
    touches: clampNum(obj.touches, 0, 32, 0),
    batteryLevel: clampNum(obj.batteryLevel, 0, 100, 0),
    batteryCharging: typeof obj.batteryCharging === 'boolean' ? obj.batteryCharging : null,
    netType: typeof obj.netType === 'string' ? obj.netType.slice(0, 16) : null,
    netRtt: clampNum(obj.netRtt, 0, 10000, 0),
    hasGyro: Boolean(obj.hasGyro),
    hasAccel: Boolean(obj.hasAccel),
  };
}

export default {
  setup({ players }) {
    const ids = players.map(p => (typeof p === 'string' ? p : (p.id ?? p.playerId)));
    const sensors = {};
    for (const id of ids) {
      sensors[id] = null;
    }
    return {
      phase: 'live',
      players: ids,
      sensors,
    };
  },

  actions: {
    sensorUpdate(state, { playerId, orient, accel, accelG, rotRate, device, hz, seq, clientTs, permission }) {
      if (state.phase !== 'live') return { state, events: [] };
      if (!state.players.includes(playerId)) return { state, events: [] };

      const snapshot = {
        orient: sanitizeOrient(orient),
        accel: sanitizeVec3(accel, -MAX_ACCEL, MAX_ACCEL, 2),
        accelG: sanitizeVec3(accelG, -MAX_ACCEL, MAX_ACCEL, 2),
        rotRate: sanitizeRotRate(rotRate),
        device: sanitizeDevice(device),
        hz: clampNum(hz, 0, 240, 1) ?? 0,
        seq: clampNum(seq, 0, Number.MAX_SAFE_INTEGER, 0) ?? 0,
        clientTs: clampNum(clientTs, 0, Number.MAX_SAFE_INTEGER, 0),
        serverTs: Date.now(),
        permission: typeof permission === 'string' ? permission.slice(0, 24) : 'unknown',
      };

      return {
        state: {
          ...state,
          sensors: {
            ...state.sensors,
            [playerId]: snapshot,
          },
        },
        events: [],
      };
    },

    finish(state) {
      if (state.phase === 'finished') return { state, events: [] };
      return {
        state: { ...state, phase: 'finished' },
        events: [{ type: 'gameEnded' }],
      };
    },
  },

  view(state) {
    return {
      phase: state.phase,
      players: state.players,
      sensors: state.sensors,
    };
  },

  endIf(state) {
    if (state.phase !== 'finished') return null;
    return { winner: null, scores: {} };
  },
};
