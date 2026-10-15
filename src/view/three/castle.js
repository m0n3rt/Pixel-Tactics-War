/* ═══════════════════════════════════════════════════════════
   城堡 3D 网格与破损表现（view 层）
   - createCastleGroup / updateCastleVisual / resetThreeCastleState
   ═══════════════════════════════════════════════════════════ */
import * as THREE from '../../../vendor/three.module.js';
import { PLAYER } from '../../data/constants.js';
import { clamp } from '../../sim/math.js';
import { threeState } from './state.js';

export function createCastleGroup(side){
  const group = new THREE.Group();
  const isPlayer = side === PLAYER;
  const wallColor = isPlayer ? 0x6ea278 : 0xb16363;
  const wallDark = isPlayer ? 0x3a5e48 : 0x7a3d3f;
  const roofColor = isPlayer ? 0x274a35 : 0x5e2430;
  const roofTrim = isPlayer ? 0xdbe8c9 : 0xf0d8d8;
  const stoneColor = isPlayer ? 0x8fa0a2 : 0x9c8f8a;
  const gateColor = 0x2a2014;
  const flameColor = isPlayer ? 0xffcb58 : 0xff914d;
  const stoneMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.94, metalness: 0.03, flatShading: true });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: wallDark, roughness: 0.95, metalness: 0.02, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.78, metalness: 0.06, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: roofTrim, roughness: 0.55, metalness: 0.12 });
  const stoneTrimMat = new THREE.MeshStandardMaterial({ color: stoneColor, roughness: 0.8, metalness: 0.04, flatShading: true });
  const gateMat = new THREE.MeshStandardMaterial({ color: gateColor, roughness: 1.0, metalness: 0.02 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2740, roughness: 0.35, metalness: 0.18, transparent: true, opacity: 0.88 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.42, 2.2), darkStoneMat);
  plinth.position.set(0, 0.18, 0.12);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const keep = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.45, 1.25), stoneMat);
  keep.position.set(0, 1.48, 0.02);
  keep.castShadow = true;
  keep.receiveShadow = true;
  group.add(keep);

  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.95, 8), roofMat);
  keepRoof.position.set(0, 3.1, 0.02);
  keepRoof.castShadow = true;
  group.add(keepRoof);

  const keepTrim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 8, 12), trimMat);
  keepTrim.rotation.x = Math.PI / 2;
  keepTrim.position.set(0, 2.55, 0.02);
  group.add(keepTrim);

  const leftTower = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 3.15, 8), stoneMat);
  leftTower.position.set(-1.25, 1.55, 0.56);
  leftTower.castShadow = true;
  leftTower.receiveShadow = true;
  group.add(leftTower);

  const rightTower = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 3.15, 8), stoneMat);
  rightTower.position.set(1.25, 1.55, 0.56);
  rightTower.castShadow = true;
  rightTower.receiveShadow = true;
  group.add(rightTower);

  const leftRoof = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.1, 8), roofMat);
  leftRoof.position.set(-1.25, 3.38, 0.56);
  leftRoof.castShadow = true;
  group.add(leftRoof);

  const rightRoof = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.1, 8), roofMat);
  rightRoof.position.set(1.25, 3.38, 0.56);
  rightRoof.castShadow = true;
  group.add(rightRoof);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.92), stoneMat);
  leftWall.position.set(-0.64, 1.05, -0.16);
  leftWall.castShadow = true;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.15, 0.92), stoneMat);
  rightWall.position.set(0.64, 1.05, -0.16);
  rightWall.castShadow = true;
  group.add(rightWall);

  const gateHouse = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.52, 0.92), darkStoneMat);
  gateHouse.position.set(0, 1.0, 0.6);
  gateHouse.castShadow = true;
  gateHouse.receiveShadow = true;
  group.add(gateHouse);

  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 14, Math.PI), stoneTrimMat);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 1.05, 1.06);
  group.add(arch);

  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.76, 0.12), gateMat);
  gate.position.set(0, 0.74, 1.1);
  group.add(gate);

  const portcullis = new THREE.Group();
  for(let i = 0; i < 4; i++){
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.66, 0.04), stoneTrimMat);
    bar.position.set(-0.18 + i * 0.12, 0.77, 1.14);
    portcullis.add(bar);
  }
  group.add(portcullis);

  const battlement = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.42, 1.55), trimMat);
  battlement.position.set(0, 2.8, 0.05);
  group.add(battlement);

  const crenellations = new THREE.Group();
  for(let i = 0; i < 6; i++){
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.2), trimMat);
    tooth.position.set(-0.82 + i * 0.32, 3.08, 0.06);
    crenellations.add(tooth);
  }
  group.add(crenellations);

  const frontBannerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), trimMat);
  frontBannerPole.position.set(0, 3.5, -0.15);
  group.add(frontBannerPole);

  const frontFlag = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.5), new THREE.MeshStandardMaterial({ color: isPlayer ? 0x5be0ab : 0xff8c8c, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.08 }));
  frontFlag.position.set(0.48, 3.28, -0.15);
  frontFlag.rotation.y = Math.PI / 2;
  group.add(frontFlag);

  const towerBannerA = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshStandardMaterial({ color: isPlayer ? 0xcdf9e1 : 0xffd6d6, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.06 }));
  towerBannerA.position.set(-1.65, 2.65, 0.98);
  towerBannerA.rotation.y = -Math.PI / 2;
  group.add(towerBannerA);

  const towerBannerB = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshStandardMaterial({ color: isPlayer ? 0xcdf9e1 : 0xffd6d6, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.06 }));
  towerBannerB.position.set(1.65, 2.65, 0.98);
  towerBannerB.rotation.y = Math.PI / 2;
  group.add(towerBannerB);

  const windowSlits = new THREE.Group();
  const windowPositions = [
    [-0.42, 1.85, 0.72], [0.42, 1.85, 0.72],
    [-1.25, 1.45, 0.86], [1.25, 1.45, 0.86],
    [-1.25, 2.1, 0.86], [1.25, 2.1, 0.86],
  ];
  for(const [x, y, z] of windowPositions){
    const wnd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), glassMat);
    wnd.position.set(x, y, z);
    windowSlits.add(wnd);
  }
  group.add(windowSlits);

  const torchGroup = new THREE.Group();
  for(const [x, y, z] of [[-0.78, 1.56, 1.08], [0.78, 1.56, 1.08], [-1.35, 2.65, 0.92], [1.35, 2.65, 0.92]]){
    const torchBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.24, 6), trimMat);
    torchBase.position.set(x, y, z);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshStandardMaterial({ color: flameColor, emissive: flameColor, emissiveIntensity: 0.95, roughness: 0.3 }));
    ember.position.set(x, y + 0.16, z);
    torchGroup.add(torchBase);
    torchGroup.add(ember);
  }
  group.add(torchGroup);

  const rubble = new THREE.Group();
  const groundShadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.7, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 })
  );
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.set(0, 0.02, 0.12);
  groundShadow.scale.set(isPlayer ? 1.08 : 1.05, 0.72, 1);
  group.add(groundShadow);

  const smokeGroup = new THREE.Group();
  const smokeMatA = new THREE.MeshStandardMaterial({ color: 0x7d848c, roughness: 1, transparent: true, opacity: 0.22, flatShading: true });
  const smokeMatB = new THREE.MeshStandardMaterial({ color: 0x5e646a, roughness: 1, transparent: true, opacity: 0.16, flatShading: true });
  const smokePositions = [
    [-0.42, 3.72, 0.02], [0.18, 3.98, 0.06], [0.56, 4.18, -0.05],
  ];
  smokePositions.forEach(([x, y, z], idx) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18 + idx * 0.06, 6, 5), idx % 2 ? smokeMatA : smokeMatB);
    puff.position.set(x, y, z);
    puff.scale.set(1.3 + idx * 0.2, 0.85 + idx * 0.15, 1.0 + idx * 0.1);
    smokeGroup.add(puff);
  });
  group.add(smokeGroup);

  const flameGroup = new THREE.Group();
  for(const [x, y, z] of [[-0.78, 1.72, 1.09], [0.78, 1.72, 1.09], [-1.38, 2.8, 0.95], [1.38, 2.8, 0.95]]){
    const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 5), new THREE.MeshStandardMaterial({ color: flameColor, emissive: flameColor, emissiveIntensity: 0.8, roughness: 0.35, flatShading: true, transparent: true, opacity: 0.95 }));
    flameOuter.position.set(x, y + 0.22, z);
    const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0xfff0a8, emissive: 0xffd966, emissiveIntensity: 1.0, roughness: 0.2, flatShading: true, transparent: true, opacity: 0.95 }));
    flameInner.position.set(x, y + 0.34, z);
    flameGroup.add(flameOuter, flameInner);
  }
  group.add(flameGroup);

  for(let i = 0; i < 10; i++){
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.12 + i * 0.02, 0.08 + (i % 3) * 0.02, 0.14 + (i % 4) * 0.03),
      new THREE.MeshStandardMaterial({ color: 0x5c5f60, roughness: 0.98, metalness: 0.02, flatShading: true })
    );
    shard.position.set(-1.05 + (i * 0.24), 0.08, -0.9 + (i % 2) * 0.25);
    shard.rotation.set(Math.random() * 0.5, Math.random() * 0.7, Math.random() * 0.4);
    shard.visible = false;
    rubble.add(shard);
  }
  group.add(rubble);

  return {
    group,
    pieces: {
      plinth,
      keep,
      keepRoof,
      keepTrim,
      leftTower,
      rightTower,
      leftRoof,
      rightRoof,
      leftWall,
      rightWall,
      gateHouse,
      arch,
      gate,
      portcullis,
      battlement,
      crenellations,
      frontBannerPole,
      frontFlag,
      towerBannerA,
      towerBannerB,
      windowSlits,
      torchGroup,
      rubble,
      debris: rubble,
      groundShadow,
      smokeGroup,
      flameGroup,
    },
    hitFlash: 0,
    shake: 0,
    collapse: 0,
    destroyed: false,
    hpRatio: 1,
    side,
    basePosition: new THREE.Vector3(),
    baseRotationY: 0,
  };
}

export function updateCastleVisual(castle, hp, maxHp, dt){
  if(!castle) return;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  castle.hpRatio = ratio;
  castle.hitFlash = Math.max(0, castle.hitFlash - dt * 1.6);
  castle.shake = Math.max(0, castle.shake - dt * 1.8);

  const damageFactor = 1 - ratio;
  const pieces = castle.pieces;
  pieces.groundShadow.scale.set(
    castle.side === PLAYER ? 1.08 : 1.05,
    0.72 + damageFactor * 0.18,
    1 + damageFactor * 0.1
  );
  pieces.groundShadow.material.opacity = Math.max(0.1, 0.24 - damageFactor * 0.08);
  pieces.smokeGroup.visible = ratio < 0.96;
  pieces.smokeGroup.children.forEach((puff, idx) => {
    puff.position.y += Math.sin(Date.now() / (480 + idx * 80)) * 0.012;
    puff.position.x += Math.cos(Date.now() / (520 + idx * 90)) * 0.01 * (castle.side === PLAYER ? 1 : -1);
    puff.scale.set(
      1.1 + idx * 0.16 + damageFactor * 0.5,
      0.8 + idx * 0.12 + damageFactor * 0.4,
      1.0 + idx * 0.1 + damageFactor * 0.45
    );
    puff.material.opacity = Math.max(0.08, 0.22 + damageFactor * 0.18 - idx * 0.03);
  });
  pieces.flameGroup.visible = ratio > 0.04;
  pieces.flameGroup.children.forEach((flame, idx) => {
    flame.scale.set(1 + Math.sin(Date.now() / (90 + idx * 20)) * 0.18, 1 + Math.cos(Date.now() / (110 + idx * 25)) * 0.18, 1);
    flame.position.y += Math.sin(Date.now() / (80 + idx * 10)) * 0.02;
    flame.material.emissiveIntensity = 0.7 + Math.sin(Date.now() / (95 + idx * 18)) * 0.18 + damageFactor * 0.12;
    flame.material.opacity = Math.max(0.22, 0.95 - damageFactor * 0.35);
  });
  pieces.keep.scale.set(1, 1 - damageFactor * 0.34, 1);
  pieces.keepRoof.scale.set(1, ratio < 0.55 ? Math.max(0.45, ratio + 0.22) : 1, 1);
  pieces.keepTrim.visible = ratio > 0.18;
  pieces.leftTower.scale.set(1, 1 - damageFactor * 0.48, 1);
  pieces.rightTower.scale.set(1, 1 - damageFactor * 0.48, 1);
  pieces.leftRoof.scale.set(1, ratio < 0.72 ? Math.max(0.45, ratio + 0.12) : 1, 1);
  pieces.rightRoof.scale.set(1, ratio < 0.72 ? Math.max(0.45, ratio + 0.12) : 1, 1);
  pieces.leftWall.scale.y = 1 - damageFactor * 0.3;
  pieces.rightWall.scale.y = 1 - damageFactor * 0.3;
  pieces.gateHouse.scale.set(1, 1 - damageFactor * 0.52, 1);
  pieces.arch.visible = ratio > 0.08;
  pieces.gate.scale.y = 1 - damageFactor * 0.24;
  pieces.portcullis.visible = ratio > 0.28;
  pieces.battlement.scale.set(1, 1 - damageFactor * 0.34, 1);
  pieces.crenellations.visible = ratio > 0.14;
  pieces.frontFlag.material.opacity = Math.max(0.18, ratio + 0.18);
  pieces.frontFlag.material.transparent = true;
  pieces.towerBannerA.material.opacity = Math.max(0.16, ratio + 0.12);
  pieces.towerBannerA.material.transparent = true;
  pieces.towerBannerB.material.opacity = Math.max(0.16, ratio + 0.12);
  pieces.towerBannerB.material.transparent = true;
  pieces.windowSlits.visible = ratio > 0.08;
  pieces.torchGroup.visible = ratio > 0.04;
  pieces.frontBannerPole.scale.y = 1 - damageFactor * 0.08;
  pieces.rubble.children.forEach((shard, idx) => {
    shard.visible = ratio < (0.74 - idx * 0.06);
    shard.position.y = 0.02 + (1 - ratio) * 0.24 * idx;
    shard.rotation.x += dt * 0.3;
    shard.rotation.y += dt * 0.5;
  });

  const collapseTarget = ratio <= 0 ? 1 : 0;
  castle.collapse = clamp(castle.collapse + (collapseTarget - castle.collapse) * dt * 1.6, 0, 1);
  castle.group.position.copy(castle.basePosition);
  castle.group.rotation.set(0, castle.baseRotationY, 0);
  if(castle.destroyed){
    castle.group.rotation.z = (castle.side === PLAYER ? 1 : -1) * (0.25 + castle.collapse * 0.9);
    castle.group.rotation.x = Math.min(0.62, 0.18 + castle.collapse * 0.35);
    castle.group.position.y -= castle.collapse * 1.05;
    pieces.rubble.visible = true;
    pieces.torchGroup.visible = false;
    pieces.smokeGroup.visible = true;
    pieces.flameGroup.visible = false;
  } else if(ratio < 0.2){
    castle.group.rotation.z = Math.sin(Date.now() / 150) * 0.04 * (0.2 - ratio) * 6;
    castle.group.position.x += Math.sin(Date.now() / 90) * castle.shake * 0.06;
    castle.group.position.y += Math.cos(Date.now() / 95) * castle.shake * 0.04;
  }

  if(castle.hitFlash > 0){
    const flash = castle.hitFlash;
    [pieces.keep, pieces.leftTower, pieces.rightTower, pieces.leftRoof, pieces.rightRoof, pieces.gate, pieces.battlement].forEach(mesh => {
      if(mesh.material && mesh.material.emissive){
        mesh.material.emissive.setHex(0xff5555);
        mesh.material.emissiveIntensity = flash * 0.9;
      }
    });
    if(pieces.keepRoof.material && pieces.keepRoof.material.emissive){
      pieces.keepRoof.material.emissive.setHex(0xffaa66);
      pieces.keepRoof.material.emissiveIntensity = flash * 0.45;
    }
    pieces.groundShadow.material.opacity = Math.max(0.12, pieces.groundShadow.material.opacity + flash * 0.04);
    castle.group.position.x += Math.sin(Date.now() / 40) * castle.shake * 0.08;
    castle.group.position.y += Math.cos(Date.now() / 47) * castle.shake * 0.06;
  } else {
    [pieces.keep, pieces.leftTower, pieces.rightTower, pieces.leftRoof, pieces.rightRoof, pieces.gate, pieces.battlement].forEach(mesh => {
      if(mesh.material && mesh.material.emissive){
        mesh.material.emissive.setHex(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    });
  }
}

export function resetThreeCastleState(){
  if(!threeState.ready || !threeState.castles) return;
  [threeState.castles.player, threeState.castles.enemy].forEach(castle => {
    if(!castle) return;
    castle.destroyed = false;
    castle.collapse = 0;
    castle.hitFlash = 0;
    castle.shake = 0;
    castle.group.position.copy(castle.basePosition);
    castle.group.rotation.set(0, castle.baseRotationY, 0);
  });
}
