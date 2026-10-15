/* ═══════════════════════════════════════════════════════════
   Three 特效层（view 层）
   - pushThreeEffect / addThreeProjectile / addThreeDamageNum
   - addThreeHitFlash / addThreeExplosion / syncThreeEffects
   ═══════════════════════════════════════════════════════════ */
import * as THREE from '../../../vendor/three.module.js';
import { PLAYER } from '../../data/constants.js';
import { threeState, threeRefs } from './state.js';
import { bumpThreeShake } from './camera.js';
import { projectWorldToScreen, createOverlayNode } from './renderer.js';

export function pushThreeEffect(effect){
  if(!threeState.ready) return null;
  threeState.fx.push(effect);
  return effect;
}

export function addThreeProjectile(from, to, color){
  if(!threeState.ready) return;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#ffd966'), emissive: new THREE.Color(color || '#ffd966'), emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.2 })
  );
  mesh.castShadow = true;
  threeState.fxGroup.add(mesh);
  pushThreeEffect({ kind:'proj', mesh, from, to, life:0.22, max:0.22 });
}

export function addThreeDamageNum(worldX, worldY, worldZ, dmg, color){
  if(!threeState.ready) return;
  const dmgText = threeRefs.formatDisplayNumber(dmg);
  const node = createOverlayNode('three-dmg-num' + (Number(dmg) >= 10 ? ' crit' : ''), dmgText);
  node.style.color = color || '#ffd966';
  pushThreeEffect({ kind:'dmg', node, worldX, worldY, worldZ, life:0.85, max:0.85, rise:0.7 });
}

export function addThreeHitFlash(side){
  if(!threeState.ready) return;
  const castle = threeState.castles[side];
  if(castle){
    castle.hitFlash = Math.max(castle.hitFlash, 0.35);
    castle.shake = Math.max(castle.shake, 0.22);
    bumpThreeShake(0.18);
    const baseX = castle.group.position.x + (side === PLAYER ? 0.65 : -0.65);
    const baseZ = castle.group.position.z + (Math.random() - 0.5) * 0.35;
    for(let i = 0; i < 6; i++){
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 + Math.random() * 0.06, 0.06 + Math.random() * 0.05, 0.07 + Math.random() * 0.05),
        new THREE.MeshStandardMaterial({ color: 0x8d7c70, roughness: 0.98, metalness: 0.01, flatShading: true })
      );
      mesh.castShadow = true;
      mesh.position.set(baseX + (Math.random() - 0.5) * 0.9, 1.0 + Math.random() * 1.2, baseZ);
      threeState.fxGroup.add(mesh);
      pushThreeEffect({ kind:'debris', mesh, vx:(side === PLAYER ? -1 : 1) * (0.7 + Math.random()), vy:0.8 + Math.random() * 1.0, vz:(Math.random() - 0.5) * 0.8, spin:Math.random() * 4 - 2, life:0.65 + Math.random() * 0.2, max:0.85 });
    }
  }
}

export function addThreeExplosion(side){
  if(!threeState.ready) return;
  const castle = threeState.castles[side];
  if(castle){
    castle.destroyed = true;
    castle.collapse = 0;
    castle.shake = 0.5;
  }
  bumpThreeShake(0.42);
  const centerX = side === PLAYER ? threeState.castles.player.group.position.x : threeState.castles.enemy.group.position.x;
  for(let i = 0; i < 30; i++){
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 1.8;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff8d4a : 0xffcf66, emissive: 0xaa3311, emissiveIntensity: 0.45, roughness: 0.85 })
    );
    mesh.castShadow = true;
    mesh.position.set(centerX + (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.9);
    threeState.fxGroup.add(mesh);
    pushThreeEffect({ kind:'burst', mesh, vx: Math.cos(angle) * speed, vy: 1.0 + Math.random() * 1.5, vz: Math.sin(angle) * speed, life: 0.8 + Math.random() * 0.5, max: 1.2 });
  }
  for(let i = 0; i < 18; i++){
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 + Math.random() * 0.06, 0.06 + Math.random() * 0.06, 0.08 + Math.random() * 0.08),
      new THREE.MeshStandardMaterial({ color: 0x7c6a60, roughness: 0.98, metalness: 0.01, flatShading: true })
    );
    mesh.castShadow = true;
    mesh.position.set(centerX + (Math.random() - 0.5) * 1.3, 1.1 + Math.random() * 1.8, (Math.random() - 0.5) * 0.9);
    threeState.fxGroup.add(mesh);
    pushThreeEffect({ kind:'debris', mesh, vx:(side === PLAYER ? -1 : 1) * (0.8 + Math.random() * 1.2), vy:1.2 + Math.random() * 1.3, vz:(Math.random() - 0.5) * 1.0, spin:Math.random() * 8 - 4, life:0.95 + Math.random() * 0.45, max:1.35 });
  }
}

export function syncThreeEffects(dt){
  if(!threeState.ready) return;
  for(let i = threeState.fx.length - 1; i >= 0; i--){
    const fx = threeState.fx[i];
    fx.life -= dt;
    const t = 1 - Math.max(0, fx.life / fx.max);
    if(fx.kind === 'proj' && fx.mesh){
      const x = fx.from.x + (fx.to.x - fx.from.x) * t;
      const y = 0.55 + Math.sin(t * Math.PI) * 0.8;
      const z = fx.from.z + (fx.to.z - fx.from.z) * t;
      fx.mesh.position.set(x, y, z);
      fx.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.35);
      fx.mesh.material.opacity = 1;
    } else if(fx.kind === 'dmg' && fx.node){
      const scr = projectWorldToScreen(fx.worldX, fx.worldY + (1 - t) * fx.rise, fx.worldZ);
      fx.node.style.left = scr.x + 'px';
      fx.node.style.top = scr.y + 'px';
      fx.node.style.opacity = String(Math.max(0, 1 - t));
      fx.node.style.transform = 'translate(-50%,-50%) translateY(' + (-18 * t) + 'px) scale(' + (1 + t * 0.12) + ')';
    } else if(fx.kind === 'burst' && fx.mesh){
      fx.mesh.position.x += fx.vx * dt;
      fx.mesh.position.y += fx.vy * dt;
      fx.mesh.position.z += fx.vz * dt;
      fx.vy -= 2.3 * dt;
      fx.mesh.scale.setScalar(Math.max(0.2, 1 - t * 0.9));
    } else if(fx.kind === 'debris' && fx.mesh){
      fx.mesh.position.x += fx.vx * dt;
      fx.mesh.position.y += fx.vy * dt;
      fx.mesh.position.z += fx.vz * dt;
      fx.vy -= 3.1 * dt;
      fx.mesh.rotation.x += dt * (fx.spin || 0.6);
      fx.mesh.rotation.y += dt * ((fx.spin || 0.6) * 0.8);
      fx.mesh.rotation.z += dt * ((fx.spin || 0.6) * 0.5);
      fx.mesh.scale.setScalar(Math.max(0.4, 1 - t * 0.55));
    }

    if(fx.life <= 0){
      if(fx.mesh){
        threeState.fxGroup.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        if(Array.isArray(fx.mesh.material)) fx.mesh.material.forEach(m => m.dispose());
        else fx.mesh.material.dispose();
      }
      if(fx.node && fx.node.parentNode) fx.node.parentNode.removeChild(fx.node);
      threeState.fx.splice(i, 1);
    }
  }
}
