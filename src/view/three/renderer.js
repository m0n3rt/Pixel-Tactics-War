/* ═══════════════════════════════════════════════════════════
   Three.js 战场渲染器（view 层）
   - initThreeRenderer / resizeThreeRenderer / renderThree
   - 单位/城堡 HUD 与 2D 覆盖层（three-overlay）
   - 点击 / 右键 / 悬浮事件（布阵交互，回调经 refs 注入自 main.js）
   main.js 局部依赖（threeStage / gridPlace / hover 别名等）经 refs.js 注入
   ═══════════════════════════════════════════════════════════ */
import * as THREE from '../../../vendor/three.module.js';
import { OrbitControls } from '../../../vendor/OrbitControls.js';
import {
  COLS, ROWS, THREE_CELL, FIELD_LEFT, FIELD_RIGHT, DEPLOY_COLS, PLAYER, ENEMY, HQ_MAX,
} from '../../data/constants.js';
import { ctx } from '../../state/ctx.js';
import { threeState, threeRefs } from './state.js';
import { gridToWorld, worldToGrid } from './coords.js';
import { resetThreeCamera } from './camera.js';
import { createUnitMesh3D, clearThreeGroup, createRangeRing } from './units.js';
import { createCastleGroup, updateCastleVisual } from './castle.js';
import { getUnitCenterCell, unitOccupiesCell } from '../../sim/grid.js';
import { getDisplayName } from '../../sim/unit.js';

export function createOverlayNode(className, html){
  const node = document.createElement('div');
  node.className = className;
  if(html) node.innerHTML = html;
  threeRefs.threeOverlay.appendChild(node);
  return node;
}

export function projectWorldToScreen(worldX, worldY, worldZ){
  const rect = threeRefs.threeStage.getBoundingClientRect();
  const v = new THREE.Vector3(worldX, worldY, worldZ).project(threeState.camera);
  return {
    x: ((v.x + 1) * 0.5) * rect.width,
    y: ((1 - v.y) * 0.5) * rect.height,
    visible: v.z >= -1 && v.z <= 1,
  };
}

export function ensureUnitHud(u){
  if(threeState.unitHudMap.has(u._uid)) return threeState.unitHudMap.get(u._uid);
  const hud = createOverlayNode('three-unit-hud',
    '<div class="three-unit-name"></div>' +
    '<div class="three-hp-track"><div class="three-hp-fill"></div></div>' +
    '<div class="three-hp-value"></div>'
  );
  threeState.unitHudMap.set(u._uid, hud);
  return hud;
}

export function ensureCastleHud(side){
  if(!threeState.castleHud) threeState.castleHud = {};
  if(threeState.castleHud[side]) return threeState.castleHud[side];
  const hud = createOverlayNode('three-hq-badge',
    '<div class="three-hq-title">' + (side === PLAYER ? '我方总部' : '敌方总部') + '</div>' +
    '<div class="three-hq-track"><div class="three-hq-fill ' + (side === PLAYER ? '' : 'enemy') + '"></div></div>' +
    '<div class="three-hq-value"></div>'
  );
  threeState.castleHud[side] = hud;
  return hud;
}

export function syncThreeHudForUnit(u){
  const hud = ensureUnitHud(u);
  const nameEl = hud.querySelector('.three-unit-name');
  const fillEl = hud.querySelector('.three-hp-fill');
  const valueEl = hud.querySelector('.three-hp-value');
  const hpRatio = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
  nameEl.textContent = getDisplayName(u);
  valueEl.textContent = Math.max(0, Math.round(u.hp)) + '/' + Math.round(u.maxHp);
  fillEl.style.transform = 'scaleX(' + hpRatio.toFixed(3) + ')';
  fillEl.classList.toggle('enemy', u.side === ENEMY);
  hud.style.display = hpRatio <= 0 ? 'none' : 'flex';
  const center = getUnitCenterCell(u);
  const world = gridToWorld(center.col, center.row);
  const extraY = (u.type === 'boss' ? 0.5 : (u.type === 'cannon' ? 0.25 : 0));
  const scr = projectWorldToScreen(world.x, 1.52 + extraY, world.z);
  if(!scr.visible){
    hud.style.display = 'none';
    return;
  }
  hud.style.left = scr.x + 'px';
  hud.style.top = scr.y + 'px';
  const hpText = Math.max(0, Math.round(u.hp)) + '/' + Math.round(u.maxHp);
  valueEl.innerHTML = hpText + '<span class="three-hp-unit"> HP</span>';
}

export function syncThreeCastleHud(side, hp, maxHp){
  const castle = threeState.castles[side];
  if(!castle) return;
  const hud = ensureCastleHud(side);
  const title = hud.querySelector('.three-hq-title');
  const fill = hud.querySelector('.three-hq-fill');
  const value = hud.querySelector('.three-hq-value');
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  title.textContent = side === PLAYER ? '我方总部' : '敌方总部';
  fill.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
  fill.classList.toggle('enemy', side !== PLAYER);
  value.textContent = Math.max(0, Math.round(hp)) + '/' + Math.round(maxHp);
  const scr = projectWorldToScreen(castle.group.position.x, 2.0, castle.group.position.z);
  if(!scr.visible){
    hud.style.display = 'none';
    return;
  }
  hud.style.left = scr.x + 'px';
  hud.style.top = scr.y + 'px';
  hud.style.display = ratio <= 0 ? 'none' : 'flex';
}

export function syncHoverRangeIndicator(){
  if(!threeState.ready) return;
  const hoverCol = threeRefs.getHoverCol();
  const hoverRow = threeRefs.getHoverRow();
  const unit = (hoverCol >= 0 && hoverRow >= 0 && ctx.battle)
    ? ctx.battle.units.find(u => u.hp > 0 && unitOccupiesCell(u, hoverCol, hoverRow))
    : null;
  const visible = !!unit;
  if(threeState.hoverMesh) threeState.hoverMesh.visible = visible;
  if(threeState.hoverRangeMesh) threeState.hoverRangeMesh.visible = visible;
  if(threeState.hoverRangeGlow) threeState.hoverRangeGlow.visible = visible;
  if(!visible) return;
  const center = getUnitCenterCell(unit);
  const wp = gridToWorld(center.col, center.row);
  threeState.hoverMesh.position.set(wp.x, 0.06, wp.z);
  const radius = Math.max(THREE_CELL * 1.2, (unit.range + 0.5) * THREE_CELL);
  if(threeState.hoverRangeMesh){
    threeState.hoverRangeMesh.scale.setScalar(radius);
    threeState.hoverRangeMesh.position.set(wp.x, 0.045, wp.z);
  }
  if(threeState.hoverRangeGlow){
    threeState.hoverRangeGlow.scale.setScalar(radius);
    threeState.hoverRangeGlow.position.set(wp.x, 0.03, wp.z);
  }
}

export function clearThreeOverlay(){
  if(!threeState.ready || !threeState.overlayRoot) return;
  threeState.unitHudMap.forEach(node => { if(node && node.parentNode) node.parentNode.removeChild(node); });
  threeState.unitHudMap.clear();
  if(threeState.castleHud){
    Object.values(threeState.castleHud).forEach(node => { if(node && node.parentNode) node.parentNode.removeChild(node); });
    threeState.castleHud = {};
  }
  while(threeState.overlayRoot.firstChild) threeState.overlayRoot.removeChild(threeState.overlayRoot.firstChild);
  if(threeState.fxGroup){
    while(threeState.fxGroup.children.length){
      const child = threeState.fxGroup.children.pop();
      if(child.geometry) child.geometry.dispose();
      if(child.material){
        if(Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
  }
}

export function getGridFromPointer(e){
  if(!threeState.ready || !threeRefs.threeStage) return null;
  const rect = threeRefs.threeStage.getBoundingClientRect();
  if(rect.width <= 0 || rect.height <= 0) return null;
  threeState.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  threeState.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  threeState.raycaster.setFromCamera(threeState.mouseNdc, threeState.camera);
  const hit = new THREE.Vector3();
  if(!threeState.raycaster.ray.intersectPlane(threeState.boardPlane, hit)) return null;
  return worldToGrid(hit.x, hit.z);
}

export function initThreeRenderer(){
  if(threeState.ready || !threeRefs.threeStage) return;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090b12);
  scene.fog = new THREE.Fog(0x090b12, 12, 42);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 180);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.imageRendering = 'pixelated';
  renderer.domElement.style.touchAction = 'none';
  threeRefs.threeStage.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.3;
  controls.zoomSpeed = 0.72;
  controls.minDistance = 8;
  controls.maxDistance = 24;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.48;

  const hemi = new THREE.HemisphereLight(0x90b5ff, 0x1f2130, 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff2d8, 1.06);
  key.position.set(9, 16, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  scene.add(key);

  const boardGroup = new THREE.Group();
  const unitGroup = new THREE.Group();
  const fxGroup = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 22),
    new THREE.MeshStandardMaterial({ color: 0x0c1017, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  // 放到更低层，避免遮住棋盘底座侧面
  ground.position.y = -1.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // 棋盘大底座（仅视觉）：给战场一个更厚实的台座
  const boardBaseW = COLS * THREE_CELL + 3.2;
  const boardBaseD = ROWS * THREE_CELL + 2.4;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x171d2a, roughness: 0.95, metalness: 0.04, flatShading: true });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x273248, roughness: 0.88, metalness: 0.08, flatShading: true });
  const boardBase = new THREE.Mesh(new THREE.BoxGeometry(boardBaseW, 0.78, boardBaseD), baseMat);
  boardBase.position.set(0, -0.62, 0);
  boardBase.castShadow = true;
  boardBase.receiveShadow = true;
  scene.add(boardBase);

  const boardRim = new THREE.Mesh(new THREE.BoxGeometry(boardBaseW - 0.65, 0.18, boardBaseD - 0.65), rimMat);
  boardRim.position.set(0, -0.28, 0);
  boardRim.castShadow = true;
  boardRim.receiveShadow = true;
  scene.add(boardRim);

  for(let r = 0; r < ROWS; r++){
    for(let c = 0; c < COLS; c++){
      const wp = gridToWorld(c, r);
      const isPlayerZone = c >= FIELD_LEFT && c < FIELD_LEFT + DEPLOY_COLS;
      const isEnemyZone = c <= FIELD_RIGHT && c > FIELD_RIGHT - DEPLOY_COLS;
      const tileColor = isPlayerZone ? 0x163126 : isEnemyZone ? 0x331a1a : 0x1a1d27;
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(THREE_CELL * 0.95, 0.14, THREE_CELL * 0.95),
        new THREE.MeshStandardMaterial({ color: tileColor, roughness: 0.92, metalness: 0.05 })
      );
      tile.position.set(wp.x, -0.08, wp.z);
      tile.receiveShadow = true;
      boardGroup.add(tile);
    }
  }

  const hoverMesh = new THREE.Mesh(
    new THREE.RingGeometry(THREE_CELL * 0.22, THREE_CELL * 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0xffde6f, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.position.y = 0.06;
  hoverMesh.visible = false;

  const hoverRangeMesh = createRangeRing(0x7fd7ff, 0.24);
  hoverRangeMesh.scale.setScalar(THREE_CELL * 2.5);
  hoverRangeMesh.position.y = 0.045;

  const hoverRangeGlow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0x7fd7ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  hoverRangeGlow.scale.setScalar(THREE_CELL * 2.5);
  hoverRangeGlow.rotation.x = -Math.PI / 2;
  hoverRangeGlow.position.y = 0.03;
  hoverRangeGlow.visible = false;

  boardGroup.add(hoverMesh);
  boardGroup.add(hoverRangeMesh);
  boardGroup.add(hoverRangeGlow);
  scene.add(boardGroup);
  scene.add(unitGroup);
  scene.add(fxGroup);

  const boardHalfX = (COLS * THREE_CELL) / 2;
  const castleOffset = 2.9;
  const playerCastle = createCastleGroup(PLAYER);
  playerCastle.group.position.set(-boardHalfX - castleOffset, -0.1, 0.15);
  playerCastle.group.rotation.y = 0.18;
  playerCastle.basePosition.copy(playerCastle.group.position);
  playerCastle.baseRotationY = playerCastle.group.rotation.y;
  scene.add(playerCastle.group);

  // 城堡独立底座：避免城堡位于棋盘外侧时出现悬空感
  const castlePadMat = new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.92, metalness: 0.05, flatShading: true });
  const castlePadTopMat = new THREE.MeshStandardMaterial({ color: 0x243049, roughness: 0.86, metalness: 0.07, flatShading: true });
  const playerCastlePad = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.75, 0.84, 8), castlePadMat);
  playerCastlePad.position.set(playerCastle.group.position.x, -0.52, playerCastle.group.position.z);
  playerCastlePad.castShadow = true;
  playerCastlePad.receiveShadow = true;
  scene.add(playerCastlePad);
  const playerCastlePadTop = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.38, 0.1, 8), castlePadTopMat);
  playerCastlePadTop.position.set(playerCastle.group.position.x, -0.09, playerCastle.group.position.z);
  playerCastlePadTop.castShadow = true;
  playerCastlePadTop.receiveShadow = true;
  scene.add(playerCastlePadTop);

  const enemyCastle = createCastleGroup(ENEMY);
  enemyCastle.group.position.set(boardHalfX + castleOffset, -0.1, -0.1);
  enemyCastle.group.rotation.y = -0.18;
  enemyCastle.basePosition.copy(enemyCastle.group.position);
  enemyCastle.baseRotationY = enemyCastle.group.rotation.y;
  scene.add(enemyCastle.group);
  const enemyCastlePad = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.75, 0.84, 8), castlePadMat);
  enemyCastlePad.position.set(enemyCastle.group.position.x, -0.52, enemyCastle.group.position.z);
  enemyCastlePad.castShadow = true;
  enemyCastlePad.receiveShadow = true;
  scene.add(enemyCastlePad);
  const enemyCastlePadTop = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.38, 0.1, 8), castlePadTopMat);
  enemyCastlePadTop.position.set(enemyCastle.group.position.x, -0.09, enemyCastle.group.position.z);
  enemyCastlePadTop.castShadow = true;
  enemyCastlePadTop.receiveShadow = true;
  scene.add(enemyCastlePadTop);

  threeState.scene = scene;
  threeState.camera = camera;
  threeState.renderer = renderer;
  threeState.controls = controls;
  threeState.boardGroup = boardGroup;
  threeState.unitGroup = unitGroup;
  threeState.fxGroup = fxGroup;
  threeState.overlayRoot = threeRefs.threeOverlay;
  threeState.hoverMesh = hoverMesh;
  threeState.hoverRangeMesh = hoverRangeMesh;
  threeState.hoverRangeGlow = hoverRangeGlow;
  threeState.raycaster = new THREE.Raycaster();
  threeState.mouseNdc = new THREE.Vector2();
  threeState.boardWidth = COLS * THREE_CELL;
  threeState.boardDepth = ROWS * THREE_CELL;
  threeState.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  threeState.castles = {
    player: playerCastle,
    enemy: enemyCastle,
  };
  threeState.ready = true;
  document.body.classList.add('three-ready');

  resetThreeCamera(true);
  threeRefs.fitCanvas();

  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerMoved = false;

  renderer.domElement.addEventListener('pointerdown', e => {
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerMoved = false;
  });

  renderer.domElement.addEventListener('pointermove', e => {
    const dx = Math.abs(e.clientX - pointerDownX);
    const dy = Math.abs(e.clientY - pointerDownY);
    if(dx + dy > 6) pointerMoved = true;
  });

  renderer.domElement.addEventListener('click', e => {
    if(!ctx.battle || ctx.battle.phase !== 'prepare' || threeRefs.getPaused()) return;
    if(pointerMoved) return;
    const grid = getGridFromPointer(e);
    if(!grid) return;
    threeRefs.gridPlace(grid.c, grid.r);
  });

  renderer.domElement.addEventListener('contextmenu', e => {
    e.preventDefault();
    if(!ctx.battle || ctx.battle.phase !== 'prepare' || threeRefs.getPaused()) return;
    if(pointerMoved) return;
    const grid = getGridFromPointer(e);
    if(!grid) return;
    threeRefs.gridRemove(grid.c, grid.r);
  });

  renderer.domElement.addEventListener('mousemove', e => {
    const grid = getGridFromPointer(e);
    if(!grid){
      threeRefs.setHover(-1, -1);
      hoverMesh.visible = false;
      if(threeState.hoverRangeMesh) threeState.hoverRangeMesh.visible = false;
      if(threeState.hoverRangeGlow) threeState.hoverRangeGlow.visible = false;
      threeRefs.elTooltip.classList.add('hidden');
      return;
    }
    threeRefs.setHover(grid.c, grid.r);
    threeRefs.updateTooltip(e.clientX, e.clientY);
  });

  renderer.domElement.addEventListener('mouseleave', () => {
    threeRefs.setHover(-1, -1);
    hoverMesh.visible = false;
    if(threeState.hoverRangeMesh) threeState.hoverRangeMesh.visible = false;
    if(threeState.hoverRangeGlow) threeState.hoverRangeGlow.visible = false;
    threeRefs.elTooltip.classList.add('hidden');
  });

  resizeThreeRenderer(threeRefs.canvas.width, threeRefs.canvas.height);
}

export function resizeThreeRenderer(width, height){
  if(!threeState.ready) return;
  const w = Math.max(1, width|0);
  const h = Math.max(1, height|0);
  threeState.camera.aspect = w / h;
  threeState.camera.updateProjectionMatrix();
  threeState.renderer.setSize(w, h, false);
}

export function renderThree(){
  if(!threeState.ready || !ctx.battle) return;
  const dt = Math.min(0.05, threeState.lastDt || 0.016);
  const activeUnits = new Set();
  clearThreeGroup(threeState.unitGroup);
  for(const u of ctx.battle.units){
    activeUnits.add(u._uid);
    const mesh = createUnitMesh3D(u);
    const center = getUnitCenterCell(u);
    const wp = gridToWorld(center.col, center.row);
    mesh.position.set(wp.x, 0, wp.z);
    const hpRate = Math.max(0.2, Math.min(1, (u.maxHp > 0 ? u.hp / u.maxHp : 1)));
    mesh.scale.y = 0.8 + hpRate * 0.2;
    if(u.side === ENEMY) mesh.rotation.y = Math.PI;
    threeState.unitGroup.add(mesh);
    syncThreeHudForUnit(u);
  }
  threeState.unitHudMap.forEach((node, uid) => {
    if(activeUnits.has(uid)) return;
    if(node && node.parentNode) node.parentNode.removeChild(node);
    threeState.unitHudMap.delete(uid);
  });
  const pCastle = threeState.castles.player;
  const eCastle = threeState.castles.enemy;
  if(pCastle) updateCastleVisual(pCastle, ctx.battle.pHp, threeRefs.getPlayerHqMax(), dt);
  if(eCastle) updateCastleVisual(eCastle, ctx.battle.eHp, HQ_MAX, dt);
  syncThreeCastleHud(PLAYER, ctx.battle.pHp, threeRefs.getPlayerHqMax());
  syncThreeCastleHud(ENEMY, ctx.battle.eHp, HQ_MAX);
  syncHoverRangeIndicator();
  threeState.controls.update();
  if(threeState.shake > 0.001){
    threeState.shake = Math.max(0, threeState.shake - dt * 2.6);
    const shake = threeState.shake;
    const offsetX = (Math.random() - 0.5) * shake * 0.18;
    const offsetY = (Math.random() - 0.5) * shake * 0.14;
    const offsetZ = (Math.random() - 0.5) * shake * 0.12;
    threeState.camera.position.x += offsetX;
    threeState.camera.position.y += offsetY;
    threeState.camera.position.z += offsetZ;
    threeState.renderer.render(threeState.scene, threeState.camera);
    threeState.camera.position.x -= offsetX;
    threeState.camera.position.y -= offsetY;
    threeState.camera.position.z -= offsetZ;
    return;
  }
  threeState.renderer.render(threeState.scene, threeState.camera);
}
