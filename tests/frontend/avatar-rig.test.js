// Every avatar a player can pick, and every AI persona, has its own 3D character
// for the TV games (public/js/avatar-3d.js), with the parts the games animate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from '../../public/vendor/three/three.module.min.js';
import { AVATAR_POOL } from '../../src/session/room.js';
import { AI_PERSONAS } from '../../src/engine/bots/personas.js';

const read = file => readFileSync(new URL('../../public/js/' + file, import.meta.url), 'utf8');
const context = { SH: {} };
runInNewContext(read('avatars.js') + '\n' + read('avatar-3d.js'), context);
const { SH } = context;

describe('3D avatar characters', () => {
  const picks = [...AVATAR_POOL, ...AI_PERSONAS.map(p => p.avatar)];

  it('knows every avatar in the lobby pool and every AI persona', () => {
    for (const avatar of picks) expect(SH.avatarMeta(avatar).id, avatar).not.toBe('guest');
  });

  it.each(picks)('%s is its own character with legs, arms and a head', avatar => {
    const rig = SH.avatarRig(THREE, avatar);
    expect(rig.meta.id).toBe(SH.avatarMeta(avatar).id);
    for (const part of ['group', 'head', 'legL', 'legR', 'armL', 'armR']) expect(rig[part], part).toBeTruthy();
  });

  it('gives no two avatars the same build', () => {
    const shapes = picks.map(avatar => {
      const parts = [];
      SH.avatarRig(THREE, avatar).group.traverse(o => {
        if (o.isMesh) parts.push(o.geometry.type + o.position.toArray().map(v => v.toFixed(2)).join(','));
      });
      return parts.join('|');
    });
    expect(new Set(shapes).size).toBe(picks.length);
  });

  it('an unknown avatar still gets a plain character', () => {
    const rig = SH.avatarRig(THREE, '?');
    expect(rig.legL && rig.armL && rig.head).toBeTruthy();
  });
});
