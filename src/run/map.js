/* ═══════════════════════════════════════════════════════════
   地图生成 / 渲染 / 点击 / 关卡推进（run 层）
   - generateMap / drawMap / showMapScreen / onMapNodeClick
   - Boss 池选择 / 隐藏地图进入与返回 / 奖励后推进
   运行态经 S 读写；main.js 局部依赖（getTowerCount/showTip）经 runRefs 注入。
   ═══════════════════════════════════════════════════════════ */
import { S } from '../state/run-access.js';
import { runRefs } from './refs.js';
import { NODE_TYPES } from '../data/nodes.js';
import { BOSS_POOLS, HIDDEN_BOSS_POOL } from '../data/bosses.js';
import {
  MAP_COUNT, MAIN_MAP_LAYER_COUNT, HIDDEN_MAP_LAYER_COUNT, HIDDEN_MAP_CHANCE,
  MAP_W, MAP_LAYER_GAP, MAP_PAD,
} from '../data/constants.js';
import { showEventScreen } from './events.js';
import { showShopScreen } from './shop.js';
import { proceedToNextRound } from './flow.js';
import { getTowerCount } from '../sim/ai.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const uiRoot       = $('ui-root');
const rewardScreen = $('reward-screen');
const shopScreen   = $('shop-screen');
const mapScreen    = $('map-screen');
const mapTitle     = $('map-title');
const mapInner     = $('map-inner');
const mapScrollWrapper = $('map-scroll-wrapper');

export function getNodeByRef(ref){
  return S.mapNodes.find(n => n.layer === ref.layer && n.index === ref.index) || null;
}

export function getCurrentMapBossPool(){
  return S.currentMapIsHidden ? HIDDEN_BOSS_POOL : BOSS_POOLS[S.currentMapIndex - 1];
}

export function getBossProfileForMap(mapIndex){
  return S.selectedBosses[mapIndex - 1] || null;
}

export function pickBosses(){
  S.selectedBosses = BOSS_POOLS.map(pool => pool[Math.floor(Math.random() * pool.length)]);
}

export function getMapProgressFloor(){
  const completedLayers = S.mapNodes.filter(n => n.completed).map(n => n.layer);
  if(!completedLayers.length) return 1;
  return Math.min(getCurrentMapLayerCount(), Math.max(...completedLayers) + 2);
}

export function getCurrentMapLayerCount(){
  return S.currentMapIsHidden ? HIDDEN_MAP_LAYER_COUNT : MAIN_MAP_LAYER_COUNT;
}

export function getCurrentMapName(){
  return S.currentMapIsHidden ? '隐藏地图' : '主线地图 ' + S.currentMapIndex;
}

export function shouldEnterHiddenMap(){
  return !S.currentMapIsHidden && (S.currentMapIndex === 3 || S.currentMapIndex === 4) && Math.random() < HIDDEN_MAP_CHANCE;
}

/* ═══════════════════════════════════════════════════════════
   地图生成系统 (Slay-the-Spire 风格竖向滚动地图)
   ═══════════════════════════════════════════════════════════ */

export function generateMap(){
  S.mapNodes = [];
  S.currentNodeIndex = -1;
  S.routeLockedFromIndex = -1;
  S.currentMapBossProfile = S.currentMapIsHidden
    ? { ...getCurrentMapBossPool()[Math.floor(Math.random() * getCurrentMapBossPool().length)] }
    : getBossProfileForMap(S.currentMapIndex);

  const mapLayers = getCurrentMapLayerCount();

  // 每张地图10层，最后一层固定为Boss
  const countPerLayer = [];
  for(let i = 0; i < mapLayers; i++){
    const isBossLayer = i === mapLayers - 1;
    if(isBossLayer) countPerLayer.push(1);
    else if(i === 0) countPerLayer.push(3);
    else if(i < 3) countPerLayer.push(2 + Math.floor(Math.random() * 2));
    else countPerLayer.push(2 + Math.floor(Math.random() * 3));
  }

  for(let layer = 0; layer < mapLayers; layer++){
    const cnt = countPerLayer[layer];
    const y = MAP_PAD + (mapLayers - 1 - layer) * MAP_LAYER_GAP;
    const floor = layer + 1;
    const isBossLayer = layer === mapLayers - 1;
    const bossProfile = isBossLayer ? S.currentMapBossProfile : null;

    for(let i = 0; i < cnt; i++){
      let nodeType;
      if(isBossLayer) nodeType = 'boss';
      else if(layer === 0) nodeType = 'battle';
      else {
        const r = Math.random();
        if(S.currentMapIsHidden){
          nodeType = r < 0.35 ? 'battle' : r < 0.7 ? 'elite' : r < 0.85 ? 'event' : 'rest';
        } else {
          nodeType = r < 0.45 ? 'battle' : r < 0.65 ? 'event' : r < 0.82 ? 'elite' : 'rest';
        }
      }

      const seg = MAP_W / cnt;
      const xBase = seg * (i + 0.5) + 10;
      const xOff = (Math.random() - 0.5) * seg * 0.3;

      S.mapNodes.push({
        layer, index: i, floor, type: nodeType,
        x: Math.round(xBase + xOff),
        y: Math.round(y),
        connections: [],
        completed: false,
        bossProfile,
        label: bossProfile?.name || null,
        icon: nodeType === 'boss' ? '👑' : null,
      });
    }
  }

  // 连接: 最小化交叉，每个节点连接下一层最近的1-2个节点
  for(let layer = 0; layer < mapLayers - 1; layer++){
    const cur = S.mapNodes.filter(n => n.layer === layer);
    const nxt = S.mapNodes.filter(n => n.layer === layer + 1);

    for(const node of cur){
      const sorted = [...nxt].sort((a, b) => Math.abs(a.x - node.x) - Math.abs(b.x - node.x));
      const cnt = Math.random() < 0.5 ? 1 : Math.min(2, sorted.length);
      for(let j = 0; j < cnt; j++){
        const c = { layer: layer + 1, index: sorted[j].index };
        if(!node.connections.some(e => e.layer === c.layer && e.index === c.index)){
          node.connections.push(c);
        }
      }
    }
    // 确保下一层每个节点至少有一条入边
    for(const nn of nxt){
      const has = cur.some(n => n.connections.some(c => c.layer === nn.layer && c.index === nn.index));
      if(!has){
        const closest = cur.reduce((b, n) => Math.abs(n.x - nn.x) < Math.abs(b.x - nn.x) ? n : b);
        closest.connections.push({ layer: nn.layer, index: nn.index });
      }
    }
  }
}

export function isNodeAccessible(node){
  if(node.completed) return false;
  if(S.routeLockedFromIndex < 0) return node.layer === 0;
  const routeNode = S.mapNodes[S.routeLockedFromIndex];
  if(!routeNode) return node.layer === 0;
  return routeNode.connections.some(c => c.layer === node.layer && c.index === node.index);
}

export function onMapNodeClick(idx, node){
  S.currentNodeIndex = idx;
  if(node.type === 'event'){
    node.completed = true;
    S.routeLockedFromIndex = idx;
    S.currentMapLayer = node.floor;
    mapScreen.classList.add('hidden');
    showEventScreen();
  } else if(node.type === 'rest'){
    node.completed = true;
    S.routeLockedFromIndex = idx;
    S.currentMapLayer = node.floor;
    showShopScreen();
  } else {
    mapScreen.classList.add('hidden');
    proceedToNextRound();
  }
}

export function drawMap(){
  if(!mapInner) return;
  mapInner.innerHTML = '';

  const mapLayers = getCurrentMapLayerCount();
  const totalH = MAP_PAD * 2 + (mapLayers - 1) * MAP_LAYER_GAP;
  const totalW = 400;
  mapInner.style.height = totalH + 'px';
  mapInner.style.width = totalW + 'px';

  // SVG 连接线
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  mapInner.appendChild(svg);

  for(const node of S.mapNodes){
    for(const conn of node.connections){
      const tgt = S.mapNodes.find(n => n.layer === conn.layer && n.index === conn.index);
      if(!tgt) continue;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', node.x);
      line.setAttribute('y1', node.y);
      line.setAttribute('x2', tgt.x);
      line.setAttribute('y2', tgt.y);
      const done = node.completed && tgt.completed;
      const active = node.completed && isNodeAccessible(tgt);
      line.setAttribute('stroke', done ? '#555' : active ? '#8bf' : '#333');
      line.setAttribute('stroke-width', active ? '3' : '2');
      if(!done && !active) line.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(line);
    }
  }

  // 层标签
  for(let layer = 0; layer < mapLayers; layer++){
    const y = MAP_PAD + (mapLayers - 1 - layer) * MAP_LAYER_GAP;
    const floor = layer + 1;
    const isBossLayer = layer === mapLayers - 1;
    const lbl = document.createElement('div');
    lbl.className = 'map-layer-label';
    lbl.style.top = (y - 8) + 'px';
    lbl.textContent = isBossLayer ? 'Boss' : floor + 'F';
    mapInner.appendChild(lbl);
  }

  // 节点
  for(let i = 0; i < S.mapNodes.length; i++){
    const node = S.mapNodes[i];
    const td = NODE_TYPES[node.type];
    const accessible = isNodeAccessible(node);

    const div = document.createElement('div');
    div.className = 'map-node';
    if(node.completed) div.classList.add('completed');
    else if(accessible) div.classList.add('accessible');
    else div.classList.add('locked');

    div.style.left = node.x + 'px';
    div.style.top = node.y + 'px';
    div.innerHTML = '<span class="node-icon">' + (node.icon || td.icon) + '</span><span class="node-label">' + (node.label || td.name) + '</span>';
    div.title = node.type === 'boss' && node.bossProfile ? node.bossProfile.name + '：' + node.bossProfile.mechanics : td.desc;

    if(accessible){
      div.addEventListener('click', ((idx, nd) => () => onMapNodeClick(idx, nd))(i, node));
    }

    mapInner.appendChild(div);
  }
}

export function showMapScreen(){
  uiRoot.classList.add('hidden');
  rewardScreen.classList.add('hidden');
  shopScreen.classList.add('hidden');
  mapScreen.classList.remove('hidden');
  if(mapTitle) mapTitle.textContent = (S.currentMapIsHidden ? '🕳 ' : '🗺 ') + getCurrentMapName() + ' · 选择你的路线';
  drawMap();
  $('map-progress-text').textContent = S.currentMapIsHidden
    ? '隐藏图 · 第 ' + getMapProgressFloor() + '/' + getCurrentMapLayerCount() + ' 层'
    : '主线 ' + S.currentMapIndex + '/' + MAP_COUNT + ' · 第 ' + getMapProgressFloor() + '/' + getCurrentMapLayerCount() + ' 层';

  // 自动滚动到当前可访问层
  if(mapScrollWrapper){
    const accessibleNode = S.mapNodes.find(n => isNodeAccessible(n));
    if(accessibleNode){
      const scrollTarget = accessibleNode.y - mapScrollWrapper.clientHeight / 2;
      setTimeout(() => { mapScrollWrapper.scrollTop = Math.max(0, scrollTarget); }, 50);
    } else {
      setTimeout(() => { mapScrollWrapper.scrollTop = mapScrollWrapper.scrollHeight; }, 50);
    }
  }
}

/* ═══════ 奖励后的关卡推进 ═══════ */
export function advanceToNextMainMap(){
  S.currentMapIndex += 1;
  S.currentMapLayer = 1;
  S.currentMapIsHidden = false;
  S.pendingMainMapIndex = null;
  S.currentBossProfile = null;
  S.currentMapBossProfile = null;
  S.currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };
  generateMap();
  showMapScreen();
}

export function maybeEnterHiddenMapOrAdvance(){
  if(shouldEnterHiddenMap()){
    // 保存进入隐藏地图前的炮塔数量
    S.towerCountBeforeHiddenMap = getTowerCount();
    
    S.pendingMainMapIndex = S.currentMapIndex + 1;
    S.currentMapIsHidden = true;
    S.currentMapLayer = 1;
    S.currentBossProfile = null;
    S.currentEncounterModifiers = { enemyHalf: false, dpPenalty: 0 };
    generateMap();
    runRefs.showTip('发现隐藏地图，挑战失败也不会终局');
    showMapScreen();
    return;
  }
  advanceToNextMainMap();
}

export function advanceAfterHiddenMap(cleared){
  const targetMap = S.pendingMainMapIndex || Math.min(MAP_COUNT, S.currentMapIndex + 1);
  S.currentMapIsHidden = false;
  S.currentMapIndex = targetMap;
  S.currentMapLayer = 1;
  S.currentBossProfile = null;
  S.currentMapBossProfile = null;
  S.currentEncounterModifiers = { enemyHalf: false, dpPenalty: 0 };
  S.pendingMainMapIndex = null;
  generateMap();
  runRefs.showTip(cleared ? '隐藏地图征服成功，返回主线' : '隐藏地图挑战失败，返回主线');
  showMapScreen();
}

export function resolvePostReward(){
  rewardScreen.classList.add('hidden');
  S.pendingGoldFromBattle = 0;
  if(S.pendingRewardAction === 'advance-map'){
    if(S.currentMapIsHidden) advanceAfterHiddenMap(true);
    else maybeEnterHiddenMapOrAdvance();
  } else {
    showMapScreen();
  }
}
