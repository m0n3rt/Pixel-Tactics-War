/* ═══════════════════════════════════════════════════════════
   单位 3D 网格工厂（view 层）
   - createUnitMesh3D / clearThreeGroup / createRangeRing
   ═══════════════════════════════════════════════════════════ */
import * as THREE from '../../../vendor/three.module.js';
import { PLAYER } from '../../data/constants.js';

export function createUnitMesh3D(u){
  const isPlayer = u.side === PLAYER;
  const teamColor = isPlayer ? 0x6ad0ff : 0xff7d7d;
  const trimColor = isPlayer ? 0xeaf7ff : 0xffebeb;
  const shadowColor = 0x0a0b10;
  const accent = {
    infantry: 0x8fe6ff,
    archer: 0xffd46f,
    tank: 0xd5dbe6,
    cavalry: 0x7ef2d4,
    boss: 0xc97dff,
  }[u.type] || 0xffffff;

  const group = new THREE.Group();
  const flatMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.82, metalness: 0.04, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.5, metalness: 0.08, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.38, metalness: 0.14, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.9, metalness: 0.02, flatShading: true });
  const shadowMat = new THREE.MeshBasicMaterial({ color: shadowColor, transparent: true, opacity: 0.28 });

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 10), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.scale.set(u.type === 'boss' ? 1.7 : 1, u.type === 'boss' ? 1.28 : 1, 1);
  group.add(shadow);

  const baseGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.18, 6);
  const bodyGeo = u.type === 'tank'
    ? new THREE.BoxGeometry(0.68, 0.6, 0.62)
    : u.type === 'archer'
      ? new THREE.CylinderGeometry(0.23, 0.29, 0.72, 6)
      : u.type === 'boss'
        ? new THREE.OctahedronGeometry(0.56, 0)
        : new THREE.CylinderGeometry(0.24, 0.31, 0.82, 6);
  const headGeo = u.type === 'boss'
    ? new THREE.IcosahedronGeometry(0.28, 0)
    : new THREE.SphereGeometry(0.2, 6, 5);

  const base = new THREE.Mesh(baseGeo, darkMat);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;

  const body = new THREE.Mesh(bodyGeo, flatMat);
  body.position.y = u.type === 'boss' ? 0.9 : 0.72;
  body.castShadow = true;
  body.receiveShadow = true;

  const head = new THREE.Mesh(headGeo, trimMat);
  head.position.y = u.type === 'boss' ? 1.36 : 1.1;
  head.castShadow = true;

  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), accentMat);
  shoulderL.position.set(-0.24, u.type === 'boss' ? 1.02 : 0.96, 0.02);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 0.24;

  const weapon = new THREE.Group();
  if(u.type === 'archer'){
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 4, 7, Math.PI), accentMat);
    bow.rotation.z = Math.PI / 2;
    bow.position.set(0.28, 0.78, 0.02);
    const string = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.34, 0.015), trimMat);
    string.position.set(0.38, 0.78, 0.02);
    weapon.add(bow, string);
  } else if(u.type === 'tank'){
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.08), accentMat);
    shield.position.set(-0.35, 0.8, 0.12);
    const mace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.56, 5), trimMat);
    mace.rotation.z = Math.PI / 2;
    mace.position.set(0.34, 0.74, 0.1);
    weapon.add(shield, mace);
  } else if(u.type === 'cavalry'){
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 5), trimMat);
    lance.rotation.z = -0.55;
    lance.position.set(0.42, 1.0, -0.05);
    weapon.add(lance);
  } else if(u.type === 'boss'){
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.38, 6), accentMat);
    crown.position.set(0, 1.72, 0);
    weapon.add(crown);
  } else {
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), accentMat);
    sword.rotation.z = -0.28;
    sword.position.set(0.32, 0.76, 0.08);
    weapon.add(sword);
  }

  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(u.type === 'boss' ? 0.78 : 0.44, u.type === 'boss' ? 1.0 : 0.72, 2, 2),
    new THREE.MeshStandardMaterial({ color: isPlayer ? 0x306ea8 : 0x8d2f3f, side: THREE.DoubleSide, roughness: 0.85, flatShading: true })
  );
  cape.position.set(0, u.type === 'boss' ? 0.95 : 0.82, -0.18);
  cape.rotation.y = Math.PI;

  const emblem = new THREE.Mesh(new THREE.CircleGeometry(u.type === 'boss' ? 0.18 : 0.11, 6), trimMat);
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.set(0, u.type === 'boss' ? 0.83 : 0.7, 0.34);

  group.add(base, body, head, shoulderL, shoulderR, cape, emblem, weapon);
  if(u.type === 'boss' || u.type === 'cannon'){
    group.scale.set(1.45, 1, 1.45);
  }
  return group;
}

export function clearThreeGroup(group){
  if(!group) return;
  while(group.children.length){
    const child = group.children.pop();
    if(child.geometry) child.geometry.dispose();
    if(child.material){
      if(Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
    if(child.children && child.children.length) clearThreeGroup(child);
  }
}

export function createRangeRing(color, opacity){
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
