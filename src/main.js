import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  TILE, COLS, ROWS, HQ_COLS, FIELD_LEFT, FIELD_RIGHT, DEPLOY_COLS,
  PLAYER, ENEMY, HQ_MAX, PREP_TIME_BASE, PREP_TIME_INCREASE, PREP_TIME_MAX, PREP_TIME_BOSS,
  DP_START, DP_PER_ROUND, HQ_DAMAGE_HP_RATIO, HQ_DAMAGE_ATK_RATIO, ENEMY_HQ_DAMAGE_MULT,
  REINFORCEMENT_RESERVE_BASE_LIMIT, UNIT_CAP_START, UNIT_CAP_PER_ROUND, UNIT_CAP_MAX,
  MAP_COUNT, MAIN_MAP_LAYER_COUNT, HIDDEN_MAP_LAYER_COUNT,
  MAP_ENEMY_BONUS, LAYER_ENEMY_BONUS, MAP_BOSS_BONUS, HIDDEN_MAP_CHANCE, HIDDEN_MAP_EXTRA_BONUS,
  SPEEDS, THREE_CELL, LOG_LIMIT_PER_SECTION, MAP_W, MAP_LAYER_GAP, MAP_PAD,
} from './data/constants.js';
import { TYPES } from './data/units.js';
import { DIFFICULTY_LEVELS } from './data/difficulty.js';
import { BUFF_TEMPLATES } from './data/buffs.js';
import { NODE_TYPES } from './data/nodes.js';
import { BOSS_POOLS, HIDDEN_BOSS_POOL } from './data/bosses.js';
import { STARTER_BLESSINGS } from './data/blessings.js';
import { CHEST_RELIC_WEIGHTS } from './data/chest-weights.js';
import { ctx as runCtx } from './state/ctx.js';
import { createRunState } from './state/run-state.js';
import { createBattleState } from './state/battle-state.js';
import { bindUnitState, mkUnit, getDisplayName, getDisplayLetter, getRenderColor, getGlobalStatMult } from './sim/unit.js';
import { getUnitFootprintByType, unitOccupiesCell } from './sim/grid.js';
import { bindAiState, getTowerStatsForDifficulty } from './sim/ai.js';
import { tickCombat } from './sim/combat.js';
import { bindSimFx } from './sim/fx.js';
import {
  RELIC_DEFS,
  loadRelicConfig,
  exportRelicDefs,
  bindRelicState,
  getRelicStacks,
  getRelicDef,
  getRelicDurationByClearedBattles,
  getTimedRelicRemaining,
  getActiveRelicStacks,
  getRelicEffectValue,
  getRelicSpeedBonusByGold,
  getReserveLimit,
  getShopRelicFinalPrice,
  applyRelicOnGain,
  consumeTimedRelicsOnClearedBattleNode,
  hasAllBaseRelics,
  hasCollectedAllRelicsExceptLuckyClover,
  getTotalRelicStacks,
  getRelicPressureBonus,
  canGainRelic,
  grantRelic,
  getAvailableBaseRelics,
  getChestRelicPool,
} from './sim/relics.js';
import { threeState, bindThreeRefs } from './view/three/state.js';
import { gridToWorld, pixelToWorld } from './view/three/coords.js';
import { resetThreeCamera, zoomThreeCamera } from './view/three/camera.js';
import { resetThreeCastleState } from './view/three/castle.js';
import {
  pushThreeEffect,
  addThreeProjectile,
  addThreeDamageNum,
  addThreeHitFlash,
  addThreeExplosion,
  syncThreeEffects,
} from './view/three/fx.js';
import {
  initThreeRenderer,
  resizeThreeRenderer,
  renderThree,
  clearThreeOverlay,
} from './view/three/renderer.js';
import { bindRunAccess } from './state/run-access.js';
import { bindEventEnv } from './state/event-env.js';
import { bindRunRefs } from './run/refs.js';
import { newGame, backToTitle, nextRound, mkState, triggerUltimateCannonStrike } from './run/flow.js';
import {
  closeShopDecision, openShopChest, buyShopRelic, keepShopRelic, discardShopRelic,
  resolveShopDecision, triggerShopHeal, applyShopDiceReward, leaveShopScreen,
} from './run/shop.js';
import { closeEventResultPopup } from './run/events.js';
import { endBattle, showBattleResultPopup, closeBattleResultPopup } from './run/encounter.js';

window.exportRelicDefs = exportRelicDefs;
loadRelicConfig();

// ═══════════════════════════════════════════════════════════
//  像素战棋 — 正式版
//  首页 → 加载 → 回合提示 → 布阵(60s) → 自动战斗 → 结算
//  暂停 / 变速 / 战斗日志 / 悬浮提示 / 键盘快捷键
//  总部城堡随 HP 破损 + 受击特效
// ═══════════════════════════════════════════════════════════

/* ═══════ DOM ═══════ */
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const compactLayout = window.innerWidth <= 920;
  const sideGap = compactLayout ? 10 : 36;
  const logW = window.innerWidth > 1180 ? 180 : 0;
  const reserveW = window.innerWidth > 1180 ? 156 : 0;
  const maxW = window.innerWidth - 20 - logW - reserveW - sideGap;
  const maxH = window.innerHeight - (compactLayout ? 260 : 180);
  const r = canvas.width / canvas.height;
  let w = maxW, h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  canvas.style.width  = Math.floor(w) + 'px';
  canvas.style.height = Math.floor(h) + 'px';
  const stageEl = document.getElementById('battle-stage');
  const threeEl = document.getElementById('three-stage');
  if(stageEl){
    stageEl.style.width = Math.floor(w) + 'px';
    stageEl.style.height = Math.floor(h) + 'px';
  }
  if(threeEl){
    threeEl.style.width = Math.floor(w) + 'px';
    threeEl.style.height = Math.floor(h) + 'px';
  }
  if(typeof resizeThreeRenderer === 'function') resizeThreeRenderer(Math.floor(w), Math.floor(h));
  // match log height to canvas
  const logEl = $('battle-log');
  if(logEl) logEl.style.height = Math.floor(h) + 'px';
  const reserveEl = $('reinforcement-reserve');
  if(reserveEl && window.innerWidth > 1180) reserveEl.style.height = Math.floor(h) + 'px';
  if(reserveEl && window.innerWidth <= 1180) reserveEl.style.height = '';
}
window.addEventListener('resize', fitCanvas);

const $  = id => document.getElementById(id);
const titleScreen  = $('title-screen');
const codexScreen  = $('codex-screen');
const victoryScreen = $('victory-screen');
const victoryStats = $('victory-stats');
const btnVictoryBackTitle = $('btn-victory-back-title');
const difficultyScreen = $('difficulty-screen');
const loadingScreen= $('loading-screen');
const roundBanner  = $('round-banner');
const roundNumText = $('round-number-text');
const pauseOverlay = $('pause-overlay');
const rewardScreen = $('reward-screen');
const mapScreen    = $('map-screen');
const eventScreen  = $('event-screen');
const uiRoot       = $('ui-root');

const elPHp    = $('player-hq-hp');
const elEHp    = $('enemy-hq-hp');
const elPHpMax = document.querySelector('.player-side .hp-max');
const elEHpMax = document.querySelector('.enemy-side .hp-max');
const elPBar   = $('player-hq-bar');
const elEBar   = $('enemy-hq-bar');
const elRound  = $('round-display');
const elCount  = $('countdown');
const elDP     = $('deploy-points');
const elUnitCount = $('unit-count');
const elUnitCap = $('unit-cap');
const elPhase  = $('phase-badge');
const elMsg    = $('message');
const elSummary= $('army-summary');
const elLogWrap= $('battle-log');
const elLogBody= $('log-body');
const elTooltip= $('unit-tooltip');
const elFloatingTip = $('floating-tip');
const reserveDOM = {
  panel: $('reinforcement-reserve'),
  body: $('reinforcement-reserve-body'),
  count: $('reinforcement-reserve-count'),
};

const unitBtns = Array.from(document.querySelectorAll('button[data-unit]'));
const btnStart = $('start-battle');
const btnPause = $('btn-pause');
const btnSpeed = $('btn-speed');
const btnZoomOut = $('btn-zoom-out');
const btnZoomIn = $('btn-zoom-in');
const btn3dView = $('btn-3d-view');
const btnNext  = $('next-round');
const btnAgain = $('btn-play-again');
const btnBack  = $('btn-back-title');
const btnBegin = $('btn-start-game');
const btnResume = $('btn-resume');
const btnQuit   = $('btn-quit');
const btnRedeploy = $('btn-redeploy');
const btnClearDeploy = $('btn-clear-deploy');
const btnCodex = $('btn-codex');
const btnBackTitleFromCodex = $('btn-back-title-from-codex');
const codexUnits = $('codex-units');
const confirmOverlay = $('confirm-overlay');
const btnConfirmYes  = $('btn-confirm-yes');
const btnConfirmNo   = $('btn-confirm-no');
const gameArea = document.querySelector('.game-area');
const battleStage = $('battle-stage');
const threeStage = $('three-stage');
const threeOverlay = $('three-overlay');

const difficultyDOM = {
  screen: difficultyScreen,
  levelNum: $('diff-level'),
  levelText: $('diff-text'),
  enemyBonus: $('enemy-bonus'),
  bossBonus: $('boss-bonus'),
  starterRow: $('diff-starter-row'),
  starterInfo: $('diff-starter-info'),
  towerRow: $('diff-tower-row'),
  towerInfo: $('diff-tower-info'),
  btnConfirm: $('btn-start-game-confirm'),
  btnBack: $('btn-back-to-title'),
  btnPrev: $('diff-prev'),
  btnNext: $('diff-next'),
};

const mapCanvas = null; // 不再使用Canvas
const mapCtx = null;
const mapScrollWrapper = $('map-scroll-wrapper');
const mapInner = $('map-inner');
const rewardTitle = $('reward-title');
const rewardHint = $('reward-hint');
const mapTitle = $('map-title');
const elGold = $('gold-display');
const globalGoldBadge = $('global-gold-badge');
const eventResultOverlay = $('event-result-overlay');
const eventResultTitle = $('event-result-title');
const eventResultText = $('event-result-text');
const eventResultConfirm = $('event-result-confirm');
const battleResultOverlay = $('battle-result-overlay');
const battleResultTitle = $('battle-result-title');
const battleResultText = $('battle-result-text');
const battleResultClose = $('battle-result-close');

const shopScreen = $('shop-screen');
const statsPanel = $('stats-panel');
const statsPanelBody = $('stats-panel-body');
const shopDOM = {
  gold: $('shop-gold-text'),
  relicCard: $('shop-relic-card'),
  openChest: $('shop-open-chest'),
  chestProgress: $('shop-chest-progress'),
  relicOffer: $('shop-relic-offer'),
  buyRelic: $('shop-buy-relic'),
  keepRelic: $('shop-keep-relic'),
  discardRelic: $('shop-discard-relic'),
  healBtn: $('shop-heal-btn'),
  healInfo: $('shop-heal-info'),
  diceCard: $('shop-dice-card'),
  diceBtn: $('shop-dice-btn'),
  diceInfo: $('shop-dice-info'),
  decisionOverlay: $('shop-decision-overlay'),
  decisionTitle: $('shop-decision-title'),
  decisionText: $('shop-decision-text'),
  decisionConfirm: $('shop-decision-confirm'),
  decisionCancel: $('shop-decision-cancel'),
  leaveBtn: $('shop-leave-btn'),
};

/* ═══════ 全局状态 ═══════ */
// 运行状态：唯一事实来源是 state/run-state.js 的 createRunState() 工厂。
// main.js 保留同名 let 别名以兼容既有引用（过渡期）；重置点（模块初始化 /
// newGame / backToTitle）一律通过 initRun() 从工厂整体同步到别名与 runCtx.run。
let run = null;
let gameDifficulty, playerBuffs, playerGold, pendingGoldFromBattle, playerRelics;
let mapNodes, currentNodeIndex, eliteMultiplier, currentNodeType, stageLevel;
let currentMapIndex, currentMapLayer, routeLockedFromIndex, currentBossProfile;
let currentMapBossProfile, selectedBosses, currentMapIsHidden, towerCountBeforeHiddenMap;
let pendingMainMapIndex, pendingStarterBlessing, pendingRewardAction, currentEncounterModifiers;
let shopState, shopDiceRolling, lastShopChestOpensLeft;
let lastDeployment, reinforcementStock, selectedReserveIndex;
let selUnit, paused, speed, hoverCol, hoverRow, particles;

// 战斗状态（原 gs）：由 battle-state.js 的 createBattleState() 工厂生成
let gs;            // gameState → runCtx.battle

// 模块局部缓存（不进入 run 状态）
let lfTime = 0;    // lastFrameTime
let tipTimer = null;
let lastReserveRenderKey = '';

function initRun(){
  run = createRunState(RELIC_DEFS);
  runCtx.run = run;
  ({
    gameDifficulty, playerBuffs, playerGold, pendingGoldFromBattle, playerRelics,
    mapNodes, currentNodeIndex, eliteMultiplier, currentNodeType, stageLevel,
    currentMapIndex, currentMapLayer, routeLockedFromIndex, currentBossProfile,
    currentMapBossProfile, selectedBosses, currentMapIsHidden, towerCountBeforeHiddenMap,
    pendingMainMapIndex, pendingStarterBlessing, pendingRewardAction, currentEncounterModifiers,
    shopState, shopDiceRolling, lastShopChestOpensLeft,
    lastDeployment, reinforcementStock, selectedReserveIndex,
    selUnit, paused, speed, hoverCol, hoverRow, particles
  } = run);
}
initRun();

function setBattle(state){
  gs = state;
  runCtx.battle = state;
}

// 把运行时状态注入 sim/relics.js（避免 sim 层直接 import 可变全局）
bindRelicState({
  getRelics: () => playerRelics,
  getBuffs:  () => playerBuffs,
  getGold:   () => playerGold,
  setGold:   (v) => { playerGold = v; },
  getGs:     () => gs,
  addLog,
  showTip,
});

// 把对局相关运行时状态注入 sim/unit.js（避免 sim 层直接 import 可变绑定）
bindUnitState({
  getBuffs: () => playerBuffs,
  getDifficulty: () => gameDifficulty,
  getMapIndex: () => currentMapIndex,
  getMapLayer: () => currentMapLayer,
  getMapIsHidden: () => currentMapIsHidden,
  getNodeType: () => currentNodeType,
  getEncounterModifiers: () => currentEncounterModifiers,
  getEliteMultiplier: () => eliteMultiplier,
  getBossProfile: () => currentBossProfile,
});

function getPlayerHqMax(){
  return Math.max(20, Math.round(HQ_MAX * (playerBuffs.hqMaxMul || 1)));
}

bindThreeRefs({
  showTip,
  formatDisplayNumber,
  fitCanvas,
  gridPlace,
  gridRemove,
  updateTooltip,
  getPaused: () => paused,
  getHoverCol: () => hoverCol,
  getHoverRow: () => hoverRow,
  setHover: (c, r) => { hoverCol = c; hoverRow = r; },
  getPlayerHqMax: () => getPlayerHqMax(),
  threeStage,
  threeOverlay,
  elTooltip,
  canvas,
});

// 运行态访问代理（run/* 模块通过它读写 main.js 别名，保证与 initRun 解构副本实时一致）
bindRunAccess({
  get gameDifficulty(){ return gameDifficulty; }, set gameDifficulty(v){ gameDifficulty = v; },
  get playerBuffs(){ return playerBuffs; }, set playerBuffs(v){ playerBuffs = v; },
  get playerGold(){ return playerGold; }, set playerGold(v){ playerGold = v; },
  get pendingGoldFromBattle(){ return pendingGoldFromBattle; }, set pendingGoldFromBattle(v){ pendingGoldFromBattle = v; },
  get playerRelics(){ return playerRelics; },
  get mapNodes(){ return mapNodes; }, set mapNodes(v){ mapNodes = v; },
  get currentNodeIndex(){ return currentNodeIndex; }, set currentNodeIndex(v){ currentNodeIndex = v; },
  get eliteMultiplier(){ return eliteMultiplier; }, set eliteMultiplier(v){ eliteMultiplier = v; },
  get currentNodeType(){ return currentNodeType; }, set currentNodeType(v){ currentNodeType = v; },
  get stageLevel(){ return stageLevel; }, set stageLevel(v){ stageLevel = v; },
  get currentMapIndex(){ return currentMapIndex; }, set currentMapIndex(v){ currentMapIndex = v; },
  get currentMapLayer(){ return currentMapLayer; }, set currentMapLayer(v){ currentMapLayer = v; },
  get routeLockedFromIndex(){ return routeLockedFromIndex; }, set routeLockedFromIndex(v){ routeLockedFromIndex = v; },
  get currentBossProfile(){ return currentBossProfile; }, set currentBossProfile(v){ currentBossProfile = v; },
  get currentMapBossProfile(){ return currentMapBossProfile; }, set currentMapBossProfile(v){ currentMapBossProfile = v; },
  get selectedBosses(){ return selectedBosses; }, set selectedBosses(v){ selectedBosses = v; },
  get currentMapIsHidden(){ return currentMapIsHidden; }, set currentMapIsHidden(v){ currentMapIsHidden = v; },
  get towerCountBeforeHiddenMap(){ return towerCountBeforeHiddenMap; }, set towerCountBeforeHiddenMap(v){ towerCountBeforeHiddenMap = v; },
  get pendingMainMapIndex(){ return pendingMainMapIndex; }, set pendingMainMapIndex(v){ pendingMainMapIndex = v; },
  get pendingStarterBlessing(){ return pendingStarterBlessing; }, set pendingStarterBlessing(v){ pendingStarterBlessing = v; },
  get pendingRewardAction(){ return pendingRewardAction; }, set pendingRewardAction(v){ pendingRewardAction = v; },
  get currentEncounterModifiers(){ return currentEncounterModifiers; }, set currentEncounterModifiers(v){ currentEncounterModifiers = v; },
  get shopState(){ return shopState; }, set shopState(v){ shopState = v; },
  get shopDiceRolling(){ return shopDiceRolling; }, set shopDiceRolling(v){ shopDiceRolling = v; },
  get lastShopChestOpensLeft(){ return lastShopChestOpensLeft; }, set lastShopChestOpensLeft(v){ lastShopChestOpensLeft = v; },
  get lastDeployment(){ return lastDeployment; }, set lastDeployment(v){ lastDeployment = v; },
  get reinforcementStock(){ return reinforcementStock; }, set reinforcementStock(v){ reinforcementStock = v; },
  get selectedReserveIndex(){ return selectedReserveIndex; }, set selectedReserveIndex(v){ selectedReserveIndex = v; },
  get selUnit(){ return selUnit; }, set selUnit(v){ selUnit = v; },
  get paused(){ return paused; }, set paused(v){ paused = v; },
  get speed(){ return speed; }, set speed(v){ speed = v; },
  get hoverCol(){ return hoverCol; }, set hoverCol(v){ hoverCol = v; },
  get hoverRow(){ return hoverRow; }, set hoverRow(v){ hoverRow = v; },
  get particles(){ return particles; }, set particles(v){ particles = v; },
});

// run 层对 main.js 局部依赖的注入（showTip/addLog 等后续 Step 迁出后改 import）
bindRunRefs({
  showTip,
  addLog,
  setBattle,
  initRun,
  applyRandomUnitRewardInPrep,
  updateRelicSpeedBonusesForNextBattle,
  updateUI,
  fitCanvas,
  clearLog,
  resetLastReserveRenderKey: () => { lastReserveRenderKey = ''; },
  getPlayerHqMax: () => getPlayerHqMax(),
  spawnDeath,
  spawnHqHit,
  spawnDamageNum,
  spawnHqExplosion,
});

// sim 层运行态注入（敌军生成：难度 / 地图进度 / Boss 配置）
bindAiState({
  getDifficulty: () => gameDifficulty,
  getMapLayer: () => currentMapLayer,
  getMapIndex: () => currentMapIndex,
  getMapIsHidden: () => currentMapIsHidden,
  getNodeType: () => currentNodeType,
  getBossProfile: () => currentBossProfile,
  getTowerCountBeforeHiddenMap: () => towerCountBeforeHiddenMap,
});

// sim 层战斗副作用出口（日志 / 提示 / 粒子特效）
bindSimFx({
  addLog,
  showTip,
  spawnProj,
  spawnDamageNum,
  spawnDeath,
  formatDisplayNumber,
});

// 事件 effect 运行环境注入（data/events.js）
bindEventEnv({
  get playerGold(){ return playerGold; },
  set playerGold(v){ playerGold = v; },
  get playerBuffs(){ return playerBuffs; },
  get gs(){ return gs; },
  getPlayerHqMax: () => getPlayerHqMax(),
  showTip,
});
if(btn3dView) btn3dView.addEventListener('click', () => resetThreeCamera(false));
if(btnZoomIn) btnZoomIn.addEventListener('click', () => zoomThreeCamera(-1.0));
if(btnZoomOut) btnZoomOut.addEventListener('click', () => zoomThreeCamera(1.0));
initThreeRenderer();

/* ═══════ 工具 ═══════ */

function getReserveSourceLabel(source){
  return source === 'random' ? '随机援军' : '特殊援军';
}

function addReinforcementToStock(type, source='special'){
  if(!TYPES[type] || reinforcementStock.length >= getReserveLimit()) return false;
  reinforcementStock.push({
    id: 'reserve-' + Math.random().toString(36).slice(2),
    type,
    source,
  });
  return true;
}

function setActive(k){
  selUnit = k;
  selectedReserveIndex = -1;
  refreshReinforcementReserveUI();
  unitBtns.forEach(b=>b.classList.toggle('active',b.dataset.unit===k));
}

function selectReserveUnit(index){
  if(index < 0 || index >= reinforcementStock.length){
    selectedReserveIndex = -1;
  } else {
    selectedReserveIndex = selectedReserveIndex === index ? -1 : index;
  }
  unitBtns.forEach(b=>b.classList.remove('active'));
  refreshReinforcementReserveUI();
  if(selectedReserveIndex >= 0){
    const entry = reinforcementStock[selectedReserveIndex];
    showTip('已选中增援：' + (TYPES[entry.type]?.name || entry.type) + '，点击我方部署区放置');
  }
}

function refreshReinforcementReserveUI(force=false){
  if(!reserveDOM.body || !reserveDOM.count) return;
  const renderKey = reinforcementStock.map(entry => entry.type + ':' + entry.source).join('|') + '#' + selectedReserveIndex;
  if(!force && renderKey === lastReserveRenderKey) return;
  lastReserveRenderKey = renderKey;
  const reserveLimit = getReserveLimit();
  reserveDOM.count.textContent = reinforcementStock.length + '/' + reserveLimit;
  let html = '';
  for(let i = 0; i < reserveLimit; i++){
    const entry = reinforcementStock[i];
    if(entry){
      const def = TYPES[entry.type];
      html += '<button type="button" class="reserve-slot' + (i === selectedReserveIndex ? ' active' : '') + '" data-reserve-index="' + i + '">' +
        '<span class="reserve-slot-type">' + (def?.name || entry.type) + '</span>' +
        '<span class="reserve-slot-meta">' + getReserveSourceLabel(entry.source) + '</span>' +
      '</button>';
    } else {
      html += '<div class="reserve-slot-empty">空位</div>';
    }
  }
  reserveDOM.body.innerHTML = html;
}



function getUnitCapForRound(round){
  return Math.min(UNIT_CAP_MAX, UNIT_CAP_START + (round - 1) * UNIT_CAP_PER_ROUND)
    + (playerBuffs.unitCap || 0)
    + getRelicEffectValue('unitCapFlat');
}

function findFreePlayerDeployCell(){
  for(let c = FIELD_LEFT; c < FIELD_LEFT + DEPLOY_COLS; c++){
    for(let r = 0; r < ROWS; r++){
      if(!gs.units.some(u => u.hp > 0 && u.col === c && u.row === r)){
        return { col: c, row: r };
      }
    }
  }
  return null;
}

function applyRandomUnitRewardInPrep(){
  const queue = playerBuffs.bonusUnitsQueue || [];
  const reserveLimit = getReserveLimit();
  let storedSpecial = 0;
  while(queue.length > 0 && reinforcementStock.length < reserveLimit){
    const queuedType = queue.shift();
    if(!TYPES[queuedType]) continue;
    if(addReinforcementToStock(queuedType, 'special')){
      storedSpecial += 1;
      addLog('<span class="log-move">🎁 特殊援军入库：'+TYPES[queuedType].name+'</span>');
    }
  }

  const tokens = playerBuffs.randomUnitTokens || 0;
  let storedRandom = 0;
  const pool = ['infantry', 'archer', 'tank'];
  for(let i = 0; i < tokens && reinforcementStock.length < reserveLimit; i++){
    const type = pool[Math.floor(Math.random() * pool.length)];
    if(addReinforcementToStock(type, 'random')){
      storedRandom += 1;
      addLog('<span class="log-move">🎲 随机援军入库：'+TYPES[type].name+'</span>');
    }
  }

  playerBuffs.randomUnitTokens = Math.max(0, tokens - storedRandom);
  const storedTotal = storedSpecial + storedRandom;
  if(storedTotal > 0){
    showTip('增援已收入库存 ' + storedTotal + ' 个');
  } else if(queue.length > 0 || tokens > 0){
    showTip('增援库存已满，未使用的增援会继续保留');
  }
  refreshReinforcementReserveUI();
}

// 根据当前金币与相应藏品，更新本场战斗的攻速/移速加成快照
function updateRelicSpeedBonusesForNextBattle(){
  const atkBonus = getRelicSpeedBonusByGold('atkSpeedByGold');
  const movBonus = getRelicSpeedBonusByGold('moveSpeedByGold');
  playerBuffs.relicAtkSpeedBonus = atkBonus;
  playerBuffs.relicMovSpeedBonus = movBonus;
}

function spawnProj(fc,fr,tc,tr,c){
  if(threeState.ready){
    const from = gridToWorld(fc, fr);
    const to = gridToWorld(tc, tr);
    addThreeProjectile({ x: from.x, y: 0.5, z: from.z }, { x: to.x, y: 0.5, z: to.z }, c);
  }
  particles.push({k:'proj',x:fc*TILE+TILE/2,y:fr*TILE+TILE/2,
    tx:tc*TILE+TILE/2,ty:tr*TILE+TILE/2,color:c,life:.25,max:.25});
}
function spawnDeath(c,r,col){
  if(threeState.ready){
    const world = gridToWorld(c, r);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(col || '#ffffff'), emissive: new THREE.Color(col || '#ffffff'), emissiveIntensity: 0.9, roughness: 0.8 })
    );
    mesh.castShadow = true;
    mesh.position.set(world.x, 0.45, world.z);
    threeState.fxGroup.add(mesh);
    pushThreeEffect({ kind:'burst', mesh, vx:0, vy:1.15, vz:0, life:0.45, max:0.45 });
  }
  for(let i=0;i<8;i++){const a=Math.PI*2*i/8;
    particles.push({k:'spark',x:c*TILE+TILE/2,y:r*TILE+TILE/2,
      vx:Math.cos(a)*45,vy:Math.sin(a)*45,color:col,life:.5,max:.5});}
}
function spawnHqHit(side){
  if(threeState.ready) addThreeHitFlash(side);
  const cx=side===PLAYER?TILE:(COLS-1)*TILE, cy=ROWS/2*TILE;
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=20+Math.random()*35;
    particles.push({k:'spark',x:cx+Math.random()*TILE*2-TILE,
      y:cy+Math.random()*TILE*2-TILE,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      color:side===PLAYER?'#4f4':'#f44',life:.7,max:.7});}
}
function spawnDamageNum(x,y,dmg,color){
  if(threeState.ready){
    const world = pixelToWorld(x, y);
    addThreeDamageNum(world.x, 1.25, world.z, dmg, color);
  }
  particles.push({k:'dmgNum',x,y,dmg:formatDisplayNumber(dmg),color:color||'#fa0',life:.8,max:.8,vy:-35});
}
function spawnHqExplosion(side){
  if(threeState.ready){
    addThreeExplosion(side);
  }
  const x0=side===PLAYER?0:(COLS-HQ_COLS)*TILE;
  const w=HQ_COLS*TILE, h=ROWS*TILE;
  const cx=x0+w/2, cy=h/2;
  // 大量火焰/碎片粒子
  const colors=['#f80','#fa0','#ff0','#f44','#e60','#fc0','#fff'];
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2, sp=30+Math.random()*80;
    const c=colors[Math.floor(Math.random()*colors.length)];
    particles.push({k:'spark',x:cx+Math.random()*w*.6-w*.3,
      y:cy+Math.random()*h*.4-h*.2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-20,
      color:c,life:.6+Math.random()*.8,max:1.4});
  }
  // 烟雾粒子（较大、较慢、灰色）
  for(let i=0;i<20;i++){
    const a=Math.random()*Math.PI*2, sp=8+Math.random()*20;
    particles.push({k:'smoke',x:cx+Math.random()*w*.5-w*.25,
      y:cy+Math.random()*h*.3-h*.15,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-12,
      color:'#555',life:1+Math.random()*.6,max:1.6,size:6+Math.random()*6});
  }
}
function tickParticles(dt){
  for(const p of particles){
    p.life-=dt;
    if(p.k==='spark'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=35*dt;}
    else if(p.k==='smoke'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=15*dt;}
    else if(p.k==='dmgNum'){p.y+=p.vy*dt;}
  }
  particles=particles.filter(p=>p.life>0);
}

/* ═══════ 战斗日志 ═══════ */
let logSections = { kill: [], effect: [] };

function inferLogChannel(html){
  const text = String(html || '');
  if(text.includes('log-kill') || text.includes('💀') || text.includes('⚠️ Boss') || text.includes('战斗结束')) return 'kill';
  return 'effect';
}

function renderBattleLog(){
  const mkSection = (title, key) => {
    const rows = logSections[key];
    const body = rows.length
      ? rows.map(e => '<div class="log-entry">' + e + '</div>').join('')
      : '<div class="log-empty">暂无</div>';
    return '<div class="log-section">'
      + '<div class="log-section-title">' + title + '</div>'
      + '<div class="log-section-body">' + body + '</div>'
      + '</div>';
  };

  elLogBody.innerHTML =
    mkSection('关键击杀', 'kill') +
    mkSection('特殊效果触发', 'effect');
  elLogBody.scrollTop = elLogBody.scrollHeight;
}

function addLog(html, channel){
  const key = channel || inferLogChannel(html);
  const bucket = logSections[key] || logSections.effect;
  bucket.push(html);
  if(bucket.length > LOG_LIMIT_PER_SECTION) bucket.shift();
  renderBattleLog();
}

function clearLog(){
  logSections = { kill: [], effect: [] };
  renderBattleLog();
}

function showTip(text){
  if(!elFloatingTip) return;
  elFloatingTip.textContent = text;
  elFloatingTip.classList.remove('hidden');
  requestAnimationFrame(()=>elFloatingTip.classList.add('show'));
  if(tipTimer) clearTimeout(tipTimer);
  tipTimer = setTimeout(()=>{
    elFloatingTip.classList.remove('show');
    setTimeout(()=>elFloatingTip.classList.add('hidden'), 200);
  }, 1400);
}

/* ═══════ 状态 ═══════ */


/* ═══════ 增益/藏品总览面板 ═══════ */
function buildStatsHTML(){
  let html = '';

  // — 增益汇总 —
  html += '<div class="stats-section-title">☔ 当前增益</div>';
  const rows = [];

  if(playerBuffs.atk) rows.push(['全体攻击力', (playerBuffs.atk > 0 ? '+' : '') + playerBuffs.atk, playerBuffs.atk < 0]);
  if(playerBuffs.hp) rows.push(['全体生命上限', (playerBuffs.hp > 0 ? '+' : '') + playerBuffs.hp, playerBuffs.hp < 0]);
  if(playerBuffs.speed) rows.push(['全体移动/攻速', (playerBuffs.speed >= 0 ? '+' : '') + (playerBuffs.speed * 100).toFixed(1) + '%', playerBuffs.speed < 0]);
  if((playerBuffs.hqMaxMul || 1) !== 1) rows.push(['我方总部生命上限', Math.round((playerBuffs.hqMaxMul || 1) * 100) + '%（当前 ' + getPlayerHqMax() + '）', playerBuffs.hqMaxMul < 1]);
  if(playerBuffs.infantryAtk) rows.push(['步兵额外攻击力', (playerBuffs.infantryAtk > 0 ? '+' : '') + playerBuffs.infantryAtk, playerBuffs.infantryAtk < 0]);
  if(playerBuffs.tankHp) rows.push(['重甲额外生命', (playerBuffs.tankHp > 0 ? '+' : '') + playerBuffs.tankHp, playerBuffs.tankHp < 0]);
  if(playerBuffs.archerAtk) rows.push(['弓手额外攻击力', (playerBuffs.archerAtk > 0 ? '+' : '') + playerBuffs.archerAtk, playerBuffs.archerAtk < 0]);
  if(playerBuffs.dpBonus) rows.push(['每回合部署点上限', (playerBuffs.dpBonus > 0 ? '+' : '') + playerBuffs.dpBonus, playerBuffs.dpBonus < 0]);
  if(playerBuffs.unitCap) rows.push(['单位上限', (playerBuffs.unitCap > 0 ? '+' : '') + playerBuffs.unitCap, playerBuffs.unitCap < 0]);
  if((playerBuffs.enemyHalfBattlesRemaining || 0) > 0)
    rows.push(['先声夺势剩余次数', playerBuffs.enemyHalfBattlesRemaining + ' 次', false]);
  if((playerBuffs.nextBattleDpPenalty || 0) > 0)
    rows.push(['下场准备点惩罚', '-' + playerBuffs.nextBattleDpPenalty, true]);
  if((playerBuffs.bonusUnitsQueue || []).length > 0)
    rows.push(['待放特殊援军', playerBuffs.bonusUnitsQueue.map(t => TYPES[t]?.name || t).join('、'), false]);
  if((playerBuffs.randomUnitTokens || 0) > 0)
    rows.push(['随机援军令牌', playerBuffs.randomUnitTokens + ' 次', false]);

  // 藏品层面的属性加成简述
  const vs = getRelicStacks('victorySymbol');
  if(vs > 0) rows.push(['胜利象征属性加成', '+' + (vs * 4) + '%（×' + vs + '层）']);
  if(getRelicStacks('unsealedSword') > 0) rows.push(['启封之剑．攻击力', '+2（固定）']);
  if(getRelicStacks('unsealedShield') > 0) rows.push(['启封之盾．生命上限', '+10%（固定）']);
  if(getRelicStacks('unsealedBanner') > 0) rows.push(['启封旗帜．部署点上限', '+2（固定）']);
  if(getRelicStacks('ironMedal') > 0) rows.push(['铁誓军章．重甲生命', '+15%（固定）']);
  const boots = getRelicStacks('infantryBoots');
  if(boots > 0) rows.push(['步兵靴．步兵移速/攻速', '+' + (boots * 3) + '%']);
  const arrow = getRelicStacks('archerSecondArrow');
  if(arrow > 0) rows.push(['第二支箭．弓手追加箭', '+' + (arrow * 10) + '%概率']);
  const beltStacks = getRelicStacks('belt');
  if(beltStacks > 0) rows.push(['腰带．步兵生命', '+2%（固定）']);
  const bracerStacks = getRelicStacks('bracer');
  if(bracerStacks > 0) rows.push(['护腕．弓手生命', '+2%（固定）']);
  const pauldronStacks = getRelicStacks('pauldron');
  if(pauldronStacks > 0) rows.push(['肩甲．重甲攻击', '+2%（固定）']);
  if(getRelicStacks('tacticalManual') > 0) rows.push(['战术手册．全体攻击', '+1（固定）']);
  if(getRelicStacks('legionVest') > 0) rows.push(['军团背心．全体生命', '+5%（固定）']);
  if(getRelicStacks('bladeCharm') > 0) rows.push(['锋刃护符．步兵攻击', '+8%（固定）']);
  if(getRelicStacks('eaglePendant') > 0) rows.push(['鹰眼吊坠．弓手射程', '+1（固定）']);
  if(getRelicStacks('fortressGear') > 0) rows.push(['堡垒齿轮．重甲移速', '+8%（固定）']);
  if((playerBuffs.relicAtkSpeedBonus || 0) > 0)
    rows.push(['神秘剑鞘．攻速', '+' + (playerBuffs.relicAtkSpeedBonus * 100).toFixed(0) + '%（随金币变动）']);
  if((playerBuffs.relicMovSpeedBonus || 0) > 0)
    rows.push(['神秘盾牌．移速', '+' + (playerBuffs.relicMovSpeedBonus * 100).toFixed(0) + '%（随金币变动）']);
  const cloverStacks = getRelicStacks('luckyClover');
  if(cloverStacks > 0)
    rows.push(['幸运草．全体移速/攻速', '+' + cloverStacks + '%（×' + cloverStacks + '层）']);

  if(rows.length === 0){
    html += '<div class="stats-empty">暂无增益</div>';
  } else {
    rows.forEach(([label, value, neg]) => {
      html += `<div class="stats-row${neg ? ' stats-row--negative' : ''}"><span class="stats-row-label">${label}</span><span class="stats-row-value">${value}</span></div>`;
    });
  }

  // — 持有藏品 —
  html += '<div class="stats-section-title" style="margin-top:18px">📦 持有藏品</div>';
  const owned = Object.keys(RELIC_DEFS).filter(k => (playerRelics[k] || 0) > 0);
  if(owned.length === 0){
    html += '<div class="stats-empty">尚未持有任何藏品</div>';
  } else {
    html += '<div class="stats-relic-grid">';
    owned.forEach(k => {
      const def = RELIC_DEFS[k];
      const stacks = getRelicStacks(k);
      const rarityColor = def.rarity === 'legendary' ? '#e8a' : def.rarity === 'epic' ? '#a6f' : '#4af';
      const relicIcon = def.icon || (def.rarity === 'legendary' ? '✦' : def.rarity === 'epic' ? '◆' : '●');
      const duration = getRelicDurationByClearedBattles(k);
      const remain = duration > 0 ? getTimedRelicRemaining(k) : 0;
      const timerBadge = duration > 0
        ? ('<span class="stats-relic-timer-badge" title="攻破战斗/精英关卡后-1">' + remain + '</span>')
        : '';
      html += `
        <div class="stats-relic-card">
          <div class="stats-relic-icon-box"><span class="stats-relic-icon">${relicIcon}</span>${timerBadge}</div>
          <div class="stats-relic-name" style="color:${rarityColor}">${def.name}</div>
          <div class="stats-relic-stack">${stacks} / ${def.maxStacks} 层 · ${def.rarity}</div>
          <div class="stats-relic-desc">${def.desc}</div>
        </div>`;
    });
    html += '</div>';
  }

  return html;
}

function showStatsPanel(){
  if(statsPanelBody) statsPanelBody.innerHTML = buildStatsHTML();
  statsPanel.classList.remove('hidden');
}

function hideStatsPanel(){
  statsPanel.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════
   难度选择系统
   ═══════════════════════════════════════════════════════════ */
function showDifficultyScreen(){
  titleScreen.classList.add('hidden');
  difficultyScreen.classList.remove('hidden');
  updateDifficultyDisplay();
}

function updateDifficultyDisplay(){
  const diff = DIFFICULTY_LEVELS[gameDifficulty - 1];
  difficultyDOM.levelNum.textContent = diff.level;
  difficultyDOM.levelNum.style.color = diff.color;
  difficultyDOM.levelText.textContent = diff.name;
  difficultyDOM.enemyBonus.textContent = (diff.enemyBonus >= 0 ? '+' : '') + (diff.enemyBonus * 100).toFixed(1) + '%';
  difficultyDOM.bossBonus.textContent = (diff.bossBonus >= 0 ? '+' : '') + (diff.bossBonus * 100).toFixed(1) + '%';
  if(difficultyDOM.starterRow){
    difficultyDOM.starterRow.classList.remove('hidden');
  }
  if(difficultyDOM.starterInfo){
    difficultyDOM.starterInfo.textContent = diff.level <= 3 ? '获得更强大的初始增益选择' : '获得初始增益选择';
  }
  if(difficultyDOM.towerRow){
    difficultyDOM.towerRow.classList.toggle('hidden', diff.level < 7);
  }
  if(difficultyDOM.towerInfo){
    difficultyDOM.towerInfo.textContent = diff.towerDesc || '';
  }
}

function changeDifficulty(delta){
  gameDifficulty = Math.max(1, Math.min(10, gameDifficulty + delta));
  updateDifficultyDisplay();
}

/* ═══════════════════════════════════════════════════════════
   地图生成系统 (Slay-the-Spire 风格竖向滚动地图)
   ═══════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════
   奖励选择系统
   ═══════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════
   事件系统
   ═══════════════════════════════════════════════════════════ */

/* ═══════ 布阵交互 ═══════ */
unitBtns.forEach(b=>b.addEventListener('click',()=>{if(b.dataset.unit)setActive(b.dataset.unit);}));
if(reserveDOM.body){
  reserveDOM.body.addEventListener('click', e => {
    const target = e.target.closest('[data-reserve-index]');
    if(!target) return;
    selectReserveUnit(Number(target.dataset.reserveIndex));
  });
}

canvas.addEventListener('click',e=>{
  if(threeState.ready)return;
  if(gs.phase!=='prepare')return;
  if(paused)return;
  const rc=canvas.getBoundingClientRect();
  const c=Math.floor(((e.clientX-rc.left)/rc.width)*COLS);
  const r=Math.floor(((e.clientY-rc.top)/rc.height)*ROWS);
  gridPlace(c,r);
});
canvas.addEventListener('contextmenu',e=>{
  if(threeState.ready)return;
  e.preventDefault();
  if(gs.phase!=='prepare')return;
  if(paused)return;
  const rc=canvas.getBoundingClientRect();
  const c=Math.floor(((e.clientX-rc.left)/rc.width)*COLS);
  const r=Math.floor(((e.clientY-rc.top)/rc.height)*ROWS);
  gridRemove(c,r);
});

canvas.addEventListener('mousemove',e=>{
  if(threeState.ready)return;
  const rc=canvas.getBoundingClientRect();
  hoverCol=Math.floor(((e.clientX-rc.left)/rc.width)*COLS);
  hoverRow=Math.floor(((e.clientY-rc.top)/rc.height)*ROWS);
  updateTooltip(e.clientX, e.clientY);
});
canvas.addEventListener('mouseleave',()=>{hoverCol=hoverRow=-1;elTooltip.classList.add('hidden');});

function gridPlace(c,r){
  if(gs.phase!=='prepare')return;
  if(c<FIELD_LEFT||c>=FIELD_LEFT+DEPLOY_COLS||r<0||r>=ROWS)return;
  if(gs.units.find(u=>u.col===c&&u.row===r&&u.side===PLAYER)){
    showTip('该位置已有棋子（右键可撤回）');
    return;
  }
  if(selectedReserveIndex >= 0){
    const entry = reinforcementStock[selectedReserveIndex];
    if(!entry || !TYPES[entry.type]){
      selectedReserveIndex = -1;
      refreshReinforcementReserveUI(true);
      showTip('该增援不可用，请重新选择');
      return;
    }
    gs.units.push(mkUnit(PLAYER, entry.type, c, r, false, {
      freeDeploy: true,
      deploymentSource: 'reserve',
      reserveSource: entry.source,
      oneTimeReinforcement: true,
    }));
    reinforcementStock.splice(selectedReserveIndex, 1);
    selectedReserveIndex = -1;
    refreshReinforcementReserveUI(true);
    showTip('已部署一次性增援：' + TYPES[entry.type].name + '（不占单位上限）');
    updateUI();
    return;
  }
  const d=TYPES[selUnit];
  const pCount = gs.units.filter(u=>u.side===PLAYER && !u.oneTimeReinforcement).length;
  const unitCap=getUnitCapForRound(gs.round);
  if(pCount>=unitCap){
    showTip('已达到单位上限（'+unitCap+'）');
    return;
  }
  if(!d||d.cost>gs.dp){
    showTip('点数不足，无法部署');
    return;
  }
  gs.units.push(mkUnit(PLAYER,selUnit,c,r)); gs.dp-=d.cost;
  updateUI();
}
function gridRemove(c,r){
  if(gs.phase!=='prepare')return;
  if(c<FIELD_LEFT||c>=FIELD_LEFT+DEPLOY_COLS||r<0||r>=ROWS)return;
  const ex=gs.units.find(u=>u.col===c&&u.row===r&&u.side===PLAYER);
  if(ex){
    if(ex.freeDeploy && ex.deploymentSource === 'reserve'){
      showTip('一次性增援已消耗，移除后不会返还');
    } else {
      gs.dp=Math.min(gs.dp+TYPES[ex.type].cost,gs.dpCap);
    }
    gs.units=gs.units.filter(u=>u!==ex);
    updateUI();
  }
}

/* ═══════ 悬浮提示 ═══════ */
function updateTooltip(mx,my){
  if(hoverCol<0||hoverRow<0){elTooltip.classList.add('hidden');return;}
  const u=gs.units.find(u=>u.hp>0 && unitOccupiesCell(u, hoverCol, hoverRow));
  if(!u){elTooltip.classList.add('hidden');return;}
  const d=TYPES[u.type]; if(!d){elTooltip.classList.add('hidden');return;}
  const sideLabel = u.side===PLAYER?'<span style="color:#6f6">我方</span>':'<span style="color:#f66">敌方</span>';
  
  // 显示实际数값（已应用buff和难度）
  let buffInfo = '';
  if(u.side === PLAYER && Object.keys(playerBuffs).length > 0){
    buffInfo = '<div class="tt-stat" style="color:#4af">💫 已应用增益</div>';
  } else if(u.isBoss && u.bossMechanics){
    buffInfo = '<div class="tt-stat" style="color:#f7a">👑 '+u.bossMechanics.mechanics+'</div>';
  }
  if(u.oneTimeReinforcement){
    buffInfo += '<div class="tt-stat" style="color:#9ed0ff">🎁 一次性增援单位</div>';
  }
  
  elTooltip.innerHTML=
    '<div class="tt-name">'+sideLabel+' '+getDisplayName(u)+'</div>'+
    '<div class="tt-stat">❤ HP <b>'+Math.max(0, Math.round(u.hp))+'/'+Math.round(u.maxHp)+'</b></div>'+
    '<div class="tt-stat">⚔ 攻击 <b>'+formatDisplayNumber(u.atk)+'</b></div>'+
    '<div class="tt-stat">🎯 射程 <b>'+u.range+'</b></div>'+
    '<div class="tt-stat">🏃 移速 <b>'+u.movCD.toFixed(2)+'s</b></div>'+
    '<div class="tt-stat">⏱ 攻速 <b>'+u.atkCD.toFixed(2)+'s</b></div>'+
    buffInfo;
  elTooltip.classList.remove('hidden');
  // 定位
  const ga=document.querySelector('.game-area').getBoundingClientRect();
  let tx=mx-ga.left+12, ty=my-ga.top-80;
  if(tx+140>ga.width) tx=mx-ga.left-140;
  if(ty<0) ty=my-ga.top+16;
  elTooltip.style.left=tx+'px'; elTooltip.style.top=ty+'px';
}

function formatDisplayNumber(n){
  const v = Number(n);
  if(!Number.isFinite(v)) return String(n);
  if(Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return v.toFixed(1);
}

function openCodex(){
  if(!codexScreen) return;
  if(titleScreen) titleScreen.classList.add('hidden');
  codexScreen.classList.remove('hidden');
  renderCodexUnits();
  codexScreen.scrollTop = 0;
  if(codexUnits) codexUnits.scrollTop = 0;
}

function closeCodex(){
  if(!codexScreen) return;
  codexScreen.classList.add('hidden');
  if(titleScreen) titleScreen.classList.remove('hidden');
}

function renderCodexUnits(){
  if(!codexUnits) return;
  codexUnits.innerHTML = '';

  const order = ['infantry', 'archer', 'tank', 'cavalry', 'cannon', 'ultimateCannon', 'boss'];
  for(const type of order){
    const def = TYPES[type];
    if(!def) continue;

    const card = document.createElement('div');
    card.className = 'codex-card';

    const title = document.createElement('div');
    title.className = 'codex-card-title';
    title.textContent = `${def.letter} ${def.name}`;

    const body = document.createElement('div');
    body.className = 'codex-card-body';

    const canvas = document.createElement('canvas');
    canvas.className = 'codex-mini';
    canvas.width = 440;
    canvas.height = 280;
    canvas.setAttribute('aria-label', `${def.name} 占格与射程示意`);

    const kv = document.createElement('div');
    kv.className = 'codex-kv';

    const addKV = (k, v) => {
      const kEl = document.createElement('div');
      kEl.className = 'codex-k';
      kEl.textContent = k;
      const vEl = document.createElement('div');
      vEl.className = 'codex-v';
      vEl.textContent = v;
      kv.appendChild(kEl);
      kv.appendChild(vEl);
    };

    const fp = getUnitFootprintByType(type);
    addKV('占格', `${fp.w}×${fp.h}`);
    addKV('费用', String(def.cost));
    addKV('生命', String(formatDisplayNumber(def.maxHp)));
    addKV('攻击', String(formatDisplayNumber(def.atk)));

    if(type === 'cannon'){
      const normalStats = getTowerStatsForDifficulty(7);
      const abyssStats = getTowerStatsForDifficulty(10);
      addKV('射程', `${normalStats.range}（深渊：${abyssStats.range}）`);
      addKV('攻速间隔', `${normalStats.atkCD}s（深渊：${abyssStats.atkCD}s）`);
      addKV('移动', '不会移动');
      addKV('说明', '难度7+，第3张地图起出现（位置在敌方军阵后方）');
    }else if(type === 'ultimateCannon'){
      addKV('射程', '—');
      addKV('攻速间隔', '—');
      addKV('移动', '不会移动');
      addKV('开局效果', '对敌方全体造成其最大生命 20% 伤害（固定比例）');
      addKV('铁索连环', '火炮被击破时，我方总部同步损失其生命值');
    }else{
      addKV('射程', String(def.range));
      addKV('移速', `${def.movCD.toFixed(2)}s`);
      addKV('攻速间隔', `${def.atkCD.toFixed(2)}s`);
      if(type === 'boss') addKV('说明', '实际Boss会随地图变化（此处展示基础模板）');
    }

    body.appendChild(canvas);
    body.appendChild(kv);

    // 终极火炮：在图鉴里展示“极稀有奖励卡”样式预览
    if(type === 'ultimateCannon'){
      const sampleWrap = document.createElement('div');
      sampleWrap.className = 'codex-reward-sample';
      sampleWrap.innerHTML = `
        <div class="reward-card mythic reward-card-mythic" style="margin-top:10px;max-width:360px">
          <div class="reward-rarity">MYTHIC</div>
          <div class="reward-icon">🌈</div>
          <div class="reward-name mythic-flame">终极火炮</div>
          <div class="reward-desc">极其稀有：每场战斗开局轰击敌方全体（20%最大生命伤害），并与我方总部铁索连环</div>
        </div>
      `;
      kv.appendChild(sampleWrap);
    }

    card.appendChild(title);
    card.appendChild(body);
    codexUnits.appendChild(card);

    drawCodexUnitPreview(canvas, type);
  }

  // Boss 详细图鉴：列出所有 Boss 条目（含机制）
  const section = document.createElement('div');
  section.className = 'codex-section-title';
  section.textContent = '👑 Boss 图鉴（详细）';
  codexUnits.appendChild(section);

  const allBosses = (Array.isArray(BOSS_POOLS) ? BOSS_POOLS.flat() : []).filter(Boolean);
  for(const b of allBosses){
    const card = document.createElement('div');
    card.className = 'codex-card';

    const title = document.createElement('div');
    title.className = 'codex-card-title';
    title.textContent = `${b.letter} ${b.name}`;

    const body = document.createElement('div');
    body.className = 'codex-card-body';

    const canvas = document.createElement('canvas');
    canvas.className = 'codex-mini';
    canvas.width = 440;
    canvas.height = 280;
    canvas.setAttribute('aria-label', `${b.name} 占格与射程示意`);

    const kv = document.createElement('div');
    kv.className = 'codex-kv';

    const addKV = (k, v) => {
      const kEl = document.createElement('div');
      kEl.className = 'codex-k';
      kEl.textContent = k;
      const vEl = document.createElement('div');
      vEl.className = 'codex-v';
      vEl.textContent = v;
      kv.appendChild(kEl);
      kv.appendChild(vEl);
    };

    addKV('占格', '2×2');
    addKV('生命', String(formatDisplayNumber(b.maxHp)));
    addKV('攻击', String(formatDisplayNumber(b.atk)));
    addKV('射程', String(b.range));
    addKV('移速', `${Number(b.movCD).toFixed(2)}s`);
    addKV('攻速间隔', `${Number(b.atkCD).toFixed(2)}s`);
    if(b.mechanics) addKV('机制', b.mechanics);
    if(b.openingAdds && Array.isArray(b.openingAdds) && b.openingAdds.length){
      const addsText = b.openingAdds.map(x => (TYPES[x.type]?.name || x.type) + '×' + x.count).join('，');
      addKV('开场护卫', addsText);
    }

    body.appendChild(canvas);
    body.appendChild(kv);
    card.appendChild(title);
    card.appendChild(body);
    codexUnits.appendChild(card);

    drawCodexBossPreview(canvas, b);
  }
}

function drawCodexBossPreview(canvas, bossProfile){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const b = bossProfile;
  if(!b) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0b0e16';
  ctx.fillRect(0, 0, W, H);

  const range = Math.max(1, Math.round(b.range || 1));
  const pad = 18;
  const cols = Math.max(9, Math.min(17, range * 2 + 5));
  const rows = Math.max(7, Math.min(13, range * 2 + 5));
  const cell = Math.max(8, Math.floor(Math.min((W - pad * 2) / cols, (H - pad * 2) / rows)));
  const gx = Math.floor((W - cols * cell) / 2);
  const gy = Math.floor((H - rows * cell) / 2);

  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const x = gx + c * cell;
      const y = gy + r * cell;
      ctx.fillStyle = 'rgba(20,22,32,0.55)';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(45,57,84,0.7)';
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const center = { x: gx + cx * cell, y: gy + cy * cell };

  ctx.strokeStyle = 'rgba(255,218,114,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - range * cell);
  ctx.lineTo(center.x + range * cell, center.y);
  ctx.lineTo(center.x, center.y + range * cell);
  ctx.lineTo(center.x - range * cell, center.y);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1;

  const occ = [{ c: cx - 1, r: cy - 1 }, { c: cx, r: cy - 1 }, { c: cx - 1, r: cy }, { c: cx, r: cy }];
  const fill = b.color || '#f0f';
  for(const o of occ){
    const x = gx + o.c * cell;
    const y = gy + o.r * cell;
    ctx.fillStyle = fill;
    ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(x + 3.5, y + 3.5, cell - 7, cell - 7);
  }

  const labelW = cell * 2 - 12;
  const labelH = cell * 2 - 12;
  const labelX = gx + (cx - 1) * cell + 6;
  const labelY = gy + (cy - 1) * cell + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(labelX, labelY, labelW, labelH);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(18, Math.floor(cell * 0.9))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.letter || 'B', labelX + labelW / 2, labelY + labelH / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(200,220,255,0.65)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('示意：占格(2×2) + 射程（菱形/曼哈顿距离）', 12, H - 10);
}

function drawCodexUnitPreview(canvas, type){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const def = TYPES[type];
  if(!def) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = '#0b0e16';
  ctx.fillRect(0, 0, W, H);

  const fp = getUnitFootprintByType(type);
  const range = (type === 'cannon') ? getTowerStatsForDifficulty(7).range : def.range;

  const pad = 18;
  const cols = Math.max(9, Math.min(17, range * 2 + (fp.w === 2 ? 5 : 3)));
  const rows = Math.max(7, Math.min(13, range * 2 + (fp.h === 2 ? 5 : 3)));
  const cell = Math.max(8, Math.floor(Math.min((W - pad * 2) / cols, (H - pad * 2) / rows)));
  const gx = Math.floor((W - cols * cell) / 2);
  const gy = Math.floor((H - rows * cell) / 2);

  // grid
  for(let r = 0; r < rows; r++){
    for(let c = 0; c < cols; c++){
      const x = gx + c * cell;
      const y = gy + r * cell;
      ctx.fillStyle = 'rgba(20,22,32,0.55)';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = 'rgba(45,57,84,0.7)';
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const center = (fp.w === 2 || fp.h === 2)
    ? { x: gx + cx * cell, y: gy + cy * cell }
    : { x: gx + cx * cell + cell / 2, y: gy + cy * cell + cell / 2 };

  // range diamond (Manhattan)
  ctx.strokeStyle = 'rgba(255,218,114,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y - range * cell);
  ctx.lineTo(center.x + range * cell, center.y);
  ctx.lineTo(center.x, center.y + range * cell);
  ctx.lineTo(center.x - range * cell, center.y);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1;

  // occupied cells
  const occ = [];
  if(fp.w === 2 || fp.h === 2){
    occ.push({ c: cx - 1, r: cy - 1 }, { c: cx, r: cy - 1 }, { c: cx - 1, r: cy }, { c: cx, r: cy });
  }else{
    occ.push({ c: cx, r: cy });
  }
  for(const o of occ){
    const x = gx + o.c * cell;
    const y = gy + o.r * cell;
    ctx.fillStyle = def.color;
    ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(x + 3.5, y + 3.5, cell - 7, cell - 7);
  }

  // label
  const labelW = (fp.w === 2 ? cell * 2 : cell) - 12;
  const labelH = (fp.h === 2 ? cell * 2 : cell) - 12;
  const labelX = (fp.w === 2 ? (gx + (cx - 1) * cell) : (gx + cx * cell)) + 6;
  const labelY = (fp.h === 2 ? (gy + (cy - 1) * cell) : (gy + cy * cell)) + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(labelX, labelY, labelW, labelH);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(18, Math.floor(cell * (fp.w === 2 ? 0.9 : 0.8)))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.letter, labelX + labelW / 2, labelY + labelH / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // hint
  ctx.fillStyle = 'rgba(200,220,255,0.65)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('示意：占格 + 射程（菱形/曼哈顿距离）', 12, H - 10);
}

function clearPlayerDeployment({ refundDp = true } = {}){
  if(!gs) return { removed: 0 };
  let removed = 0;
  for(const u of gs.units){
    if(u.side !== PLAYER) continue;
    if(u.type === 'ultimateCannon') continue;
    removed++;
    if(!refundDp) continue;
    if(u.freeDeploy && u.deploymentSource === 'reserve'){
      continue;
    }
    const cost = TYPES[u.type]?.cost ?? 0;
    gs.dp = Math.min(gs.dpCap, gs.dp + Math.max(0, cost));
  }
  // 只移除“部署单位”，终极火炮永远保留
  gs.units = gs.units.filter(u => u.side !== PLAYER || u.type === 'ultimateCannon');
  selectedReserveIndex = -1;
  refreshReinforcementReserveUI(true);
  return { removed };
}

/* ═══════ 按钮事件 ═══════ */
btnBegin.addEventListener('click',()=>showDifficultyScreen());
if(btnCodex) btnCodex.addEventListener('click',()=>{
  openCodex();
});
if(btnBackTitleFromCodex) btnBackTitleFromCodex.addEventListener('click', closeCodex);
if(btnVictoryBackTitle) btnVictoryBackTitle.addEventListener('click', backToTitle);

// 难度选择按钮
difficultyDOM.btnPrev.addEventListener('click', () => changeDifficulty(-1));
difficultyDOM.btnNext.addEventListener('click', () => changeDifficulty(1));
difficultyDOM.btnConfirm.addEventListener('click', () => {
  difficultyScreen.classList.add('hidden');
  newGame();
});
difficultyDOM.btnBack.addEventListener('click', () => {
  difficultyScreen.classList.add('hidden');
  titleScreen.classList.remove('hidden');
});

// 难度选择滚轮
difficultyScreen.addEventListener('wheel', (e) => {
  e.preventDefault();
  changeDifficulty(e.deltaY > 0 ? 1 : -1);
});

// 地图点击已在 drawMap() 中通过 DOM 事件绑定

btnStart.addEventListener('click',()=>{
  if(gs.phase!=='prepare')return;
  gs.countdown=0; startBattle();
});

btnPause.addEventListener('click',()=>togglePause());
btnResume.addEventListener('click',()=>{ if(paused) togglePause(); });
btnSpeed.addEventListener('click',()=>cycleSpeed());

const btnStats = $('btn-stats');
const btnStatsPause = $('btn-stats-pause');
if(btnStats) btnStats.addEventListener('click', showStatsPanel);
if(btnStatsPause) btnStatsPause.addEventListener('click', showStatsPanel);
const _statsBtns = ['btn-stats-map','btn-stats-event','btn-stats-shop'];
_statsBtns.forEach(id => { const el = $(id); if(el) el.addEventListener('click', showStatsPanel); });
$('stats-close-btn').addEventListener('click', hideStatsPanel);
statsPanel.addEventListener('click', e => { if(e.target === statsPanel) hideStatsPanel(); });

btnNext.addEventListener('click',()=>{if(gs.phase==='result')nextRound();});
btnAgain.addEventListener('click',()=>{if(gs.phase==='gameover')newGame();});
btnBack.addEventListener('click',()=>{if(gs.phase==='gameover')backToTitle();});
btnRedeploy.addEventListener('click',()=>redeployLast());
if(btnClearDeploy) btnClearDeploy.addEventListener('click',()=>{
  if(gs.phase!=='prepare'||paused) return;
  const { removed } = clearPlayerDeployment({ refundDp: true });
  showTip('已移除 '+removed+' 个单位');
  updateUI();
});

if(shopDOM.openChest) shopDOM.openChest.addEventListener('click', openShopChest);
if(shopDOM.buyRelic) shopDOM.buyRelic.addEventListener('click', buyShopRelic);
if(shopDOM.keepRelic) shopDOM.keepRelic.addEventListener('click', keepShopRelic);
if(shopDOM.discardRelic) shopDOM.discardRelic.addEventListener('click', discardShopRelic);
if(shopDOM.decisionConfirm) shopDOM.decisionConfirm.addEventListener('click', resolveShopDecision);
if(shopDOM.decisionCancel) shopDOM.decisionCancel.addEventListener('click', closeShopDecision);
if(shopDOM.decisionOverlay) shopDOM.decisionOverlay.addEventListener('click', e => { if(e.target === shopDOM.decisionOverlay) closeShopDecision(); });
if(shopDOM.healBtn) shopDOM.healBtn.addEventListener('click', triggerShopHeal);
if(shopDOM.diceBtn) shopDOM.diceBtn.addEventListener('click', applyShopDiceReward);
if(shopDOM.leaveBtn) shopDOM.leaveBtn.addEventListener('click', leaveShopScreen);

if(eventResultConfirm) eventResultConfirm.addEventListener('click', closeEventResultPopup);
if(eventResultOverlay) eventResultOverlay.addEventListener('click', e => { if(e.target === eventResultOverlay) closeEventResultPopup(); });
if(battleResultClose) battleResultClose.addEventListener('click', closeBattleResultPopup);
if(battleResultOverlay) battleResultOverlay.addEventListener('click', e => { if(e.target === battleResultOverlay) closeBattleResultPopup(); });

/* 退出确认流程 */
btnQuit.addEventListener('click',()=>{
  // 显示确认弹窗
  confirmOverlay.classList.remove('hidden');
});
btnConfirmYes.addEventListener('click',()=>{
  confirmOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  paused=false;
  backToTitle();
});
btnConfirmNo.addEventListener('click',()=>{
  confirmOverlay.classList.add('hidden');
});

function togglePause(){
  if(gs.phase!=='battle'&&gs.phase!=='prepare')return;
  paused=!paused;
  pauseOverlay.classList.toggle('hidden',!paused);
  btnPause.innerHTML=(paused?'<kbd>P</kbd> 继续':'<kbd>P</kbd> 暂停');
}
function cycleSpeed(){
  const i=(SPEEDS.indexOf(speed)+1)%SPEEDS.length;
  speed=SPEEDS[i];
  btnSpeed.textContent=speed+'×';
}

function redeployLast(){
  if(gs.phase!=='prepare'||paused)return;
  if(!lastDeployment.length){showTip('没有上回合部署记录');return;}
  const unitCap=getUnitCapForRound(gs.round);
  // 先清除当前玩家单位
  clearPlayerDeployment({ refundDp: true });
  let placed=0;
  let blocked = 0;
  let stoppedByDpAt = -1;
  for(let i = 0; i < lastDeployment.length; i++){
    if(placed>=unitCap) break;
    const rec = lastDeployment[i];
    const d = TYPES[rec.type];
    if(!d) continue;
    if(d.cost > gs.dp){
      stoppedByDpAt = i;
      break;
    }
    if(gs.units.some(u=>unitOccupiesCell(u, rec.col, rec.row))){
      blocked++;
      continue;
    }
    gs.units.push(mkUnit(PLAYER, rec.type, rec.col, rec.row));
    gs.dp -= d.cost;
    placed++;
  }
  if(stoppedByDpAt >= 0){
    const dpNotDeployed = lastDeployment.slice(stoppedByDpAt);
    const preview = dpNotDeployed
      .slice(0, 8)
      .map(x => (TYPES[x.type]?.name || x.type) + '（' + (TYPES[x.type]?.cost ?? '?') + 'DP）')
      .join('\n- ');
    const msg =
      '本次已尽可能复现上回合部署，但部署点数不足，已停止部署尾部单位。\n\n' +
      '已部署：' + placed + ' 个\n' +
      '剩余DP：' + gs.dp + '\n' +
      (blocked ? ('占位冲突跳过：' + blocked + ' 个\n') : '') +
      (preview ? ('\n未部署（DP不足）：\n- ' + preview + (dpNotDeployed.length > 8 ? '\n…（其余省略）' : '')) : '');
    showBattleResultPopup('⚠ DP不足，已部分再部署', msg);
  }
  showTip('已部署 '+placed+' 个单位');
  updateUI();
}

function startBattle(){
  if(gs.phase!=='prepare')return;
  if(!gs.units.some(u=>u.side===PLAYER && u.type!=='ultimateCannon')){
    showTip('请至少部署 1 个单位再开战');
    return;
  }
  // 保存本回合部署
  lastDeployment=gs.units
    .filter(u=>u.side===PLAYER && !u.freeDeploy && u.type!=='ultimateCannon')
    .map(u=>({type:u.type,col:u.col,row:u.row}));
  gs.phase='battle'; paused=false; speed=1;
  clearLog();
  btnStart.classList.add('hidden');
  btnPause.classList.remove('hidden'); btnSpeed.classList.remove('hidden');
  btnSpeed.textContent='1×';
  btnPause.innerHTML='<kbd>P</kbd> 暂停';
  btnNext.classList.add('hidden'); btnAgain.classList.add('hidden'); btnBack.classList.add('hidden');
  elMsg.textContent='⚔️ 战斗进行中...';
  addLog('<span class="log-move">— 战斗开始 —</span>');
  triggerUltimateCannonStrike();
}

/* ═══════ 键盘快捷键 ═══════ */
document.addEventListener('keydown',e=>{
  if(!gs)return;
  const key=e.key.toLowerCase();
  if(gs.phase==='prepare'){
    if(key==='1'&&!paused) setActive('infantry');
    else if(key==='2'&&!paused) setActive('archer');
    else if(key==='3'&&!paused) setActive('tank');
    else if((key===' '||key==='enter')&&!paused){e.preventDefault(); btnStart.click();}
    else if(key==='p') togglePause();
    else if(key==='v'&&!paused){e.preventDefault(); resetThreeCamera(false);}
  }
  if(gs.phase==='battle' && key==='p') togglePause();
  if(gs.phase==='battle' && (key==='+'||key==='=')) cycleSpeed();
  if(gs.phase==='result' && (key===' '||key==='enter')){e.preventDefault();btnNext.click();}
  if(key==='escape') hideStatsPanel();
});

/* ═══════ UI 更新 ═══════ */
function updateUI(){
  if(!gs)return;
  refreshReinforcementReserveUI();
  const pMax = getPlayerHqMax();
  const pDisp=Math.max(0,gs.pHp), eDisp=Math.max(0,gs.eHp);
  elPHp.textContent=pDisp; elEHp.textContent=eDisp;
  if(elPHpMax) elPHpMax.textContent='/' + pMax;
  if(elEHpMax) elEHpMax.textContent='/' + HQ_MAX;
  elPBar.style.width=(pDisp/pMax*100)+'%';
  elEBar.style.width=(eDisp/HQ_MAX*100)+'%';
  elRound.textContent=gs.round;
  elCount.textContent=Math.max(0,Math.ceil(gs.countdown));
  elDP.textContent=gs.dp;
  if(elGold) elGold.textContent = String(playerGold);
  if(globalGoldBadge) globalGoldBadge.textContent = '💎 ' + playerGold;
  if(globalGoldBadge) globalGoldBadge.classList.toggle('hidden', !uiRoot.classList.contains('hidden'));
  const pUnits=gs.units.filter(u=>u.side===PLAYER);
  const unitCap=getUnitCapForRound(gs.round);
  const capCount = pUnits.filter(u=>!u.oneTimeReinforcement).length;
  const oneTimeCount = pUnits.length - capCount;
  elUnitCount.textContent=String(capCount) + (oneTimeCount > 0 ? ('+' + oneTimeCount) : '');
  elUnitCap.textContent=String(unitCap);

  // 阶段标志
  if(gs.phase==='prepare'){
    elPhase.textContent='准备阶段'; elPhase.className='phase-badge';
  } else if(gs.phase==='battle'){
    elPhase.textContent='战斗阶段'; elPhase.className='phase-badge battle';
  } else {
    elPhase.textContent='攻城阶段'; elPhase.className='phase-badge result';
  }

  // 军队摘要
  const eUnits=gs.units.filter(u=>u.side===ENEMY);
  const count=(arr,t)=>arr.filter(u=>u.type===t).length;
  let summary='我方('+pUnits.length+'/'+unitCap+'): ';
  for(const t of Object.keys(TYPES)){const n=count(pUnits,t);if(n)summary+=TYPES[t].name+'×'+n+' ';}
  summary+='  敌方: ';
  for(const t of Object.keys(TYPES)){const n=count(eUnits,t);if(n)summary+=TYPES[t].name+'×'+n+' ';}
  elSummary.textContent=summary;

  // 显隐倒计时/点数
  const isPrep = gs.phase==='prepare';
  $('countdown-wrap').style.opacity = isPrep?'1':'0.3';
  $('points-wrap').style.opacity    = isPrep?'1':'0.3';
  if(btn3dView) btn3dView.disabled = !threeState.ready;
  if(btnZoomIn) btnZoomIn.disabled = !threeState.ready;
  if(btnZoomOut) btnZoomOut.disabled = !threeState.ready;
}

/* ═══════ 主循环 ═══════ */
function loop(ts){
  const raw=(ts-lfTime)/1000; lfTime=ts;
  if(!Number.isFinite(raw)||raw>.5){requestAnimationFrame(loop);return;}
  if(gs){
    const dt = paused ? 0 : raw * speed;
    update(dt, raw);
    render();
  }
  requestAnimationFrame(loop);
}

function update(dt, rawDt){
  threeState.lastDt = rawDt;
  if(gs.phase==='prepare'){
    gs.countdown-=dt;
    if(gs.countdown<=0){gs.countdown=0;startBattle();}
  } else if(gs.phase==='battle'&&!paused){
    const combatResult = tickCombat(gs, dt);
    if(combatResult) endBattle(combatResult.winner);
  }
  if(gs.pFlash>0) gs.pFlash-=rawDt;
  if(gs.eFlash>0) gs.eFlash-=rawDt;
  tickParticles(rawDt); // 粒子始终更新（即使暂停也播完）
  syncThreeEffects(rawDt);
  updateUI();
}

/* ═══════ 回合结算 ═══════ */

/* ╔══════════════════════════════════╗
   ║           渲    染              ║
   ╚══════════════════════════════════╝ */

function render(){
  if(threeState.ready){
    renderThree();
    return;
  }
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle='#08080e'; ctx.fillRect(0,0,W,H);
  drawHQ(PLAYER); drawHQ(ENEMY);
  drawGrid(); drawUnits(); drawParticles();
  if(paused) drawPauseVeil();
}

/* --- 网格 --- */
function drawGrid(){
  const isPrep=gs.phase==='prepare';
  for(let r=0;r<ROWS;r++){
    for(let c=FIELD_LEFT;c<=FIELD_RIGHT;c++){
      const x=c*TILE,y=r*TILE;
      const pZone=c<FIELD_LEFT+DEPLOY_COLS;
      const eZone=c>FIELD_RIGHT-DEPLOY_COLS;

      // 基础色
      ctx.fillStyle=pZone?'#0d1818':eZone?'#180d0d':'#101014';
      ctx.fillRect(x,y,TILE,TILE);

      // 准备阶段：己方区域脉冲高亮
      if(isPrep && pZone){
        const pulse=Math.sin(Date.now()/400)*0.06+0.06;
        ctx.fillStyle='rgba(60,180,120,'+pulse.toFixed(3)+')';
        ctx.fillRect(x,y,TILE,TILE);
      }

      // 鼠标悬浮高亮
      if(c===hoverCol&&r===hoverRow){
        ctx.fillStyle='rgba(255,255,255,0.08)';
        ctx.fillRect(x,y,TILE,TILE);
        ctx.strokeStyle='#666'; ctx.lineWidth=1.5;
        ctx.strokeRect(x+1,y+1,TILE-2,TILE-2);
        ctx.lineWidth=1;
      }

      // 网格线
      ctx.strokeStyle='#1e1e24';
      ctx.strokeRect(x+.5,y+.5,TILE-1,TILE-1);
    }
  }

  // 区域标签
  ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
  ctx.fillStyle='rgba(100,200,140,0.35)';
  ctx.fillText('我方区域',(FIELD_LEFT+DEPLOY_COLS/2)*TILE, 10);
  ctx.fillStyle='rgba(200,100,100,0.35)';
  ctx.fillText('敌方区域',(FIELD_RIGHT-DEPLOY_COLS/2+.5)*TILE, 10);
}

/* --- 总部城堡 --- */
function drawHQ(side){
  const rawHp=side===PLAYER?gs.pHp:gs.eHp;
  const hp=Math.max(0,rawHp);
  const fl=side===PLAYER?gs.pFlash:gs.eFlash;
  const hqMax=side===PLAYER?getPlayerHqMax():HQ_MAX;
  const ratio=hp/hqMax;
  const x0=side===PLAYER?0:(COLS-HQ_COLS)*TILE;
  const w=HQ_COLS*TILE, h=ROWS*TILE;
  const cx=x0+w/2,cy=h/2,bw=w*.72,bh=h*.54;

  // 背景
  ctx.fillStyle=side===PLAYER?'#0a160a':'#160a0a';
  ctx.fillRect(x0,0,w,h);
  // 受击闪
  if(fl>0){ctx.fillStyle='rgba(255,60,60,'+(fl*.7).toFixed(2)+')';ctx.fillRect(x0,0,w,h);}

  if(hp<=0){
    // ═══ 废墟状态 ═══
    drawRuins(cx,cy,bw,bh,x0,w,h,side);
  } else {
    // ═══ 正常城堡 ═══
    // 墙色
    const wc=ratio>.6?(side===PLAYER?'#3a7a3a':'#7a3a3a')
             :ratio>.3?(side===PLAYER?'#5a6a30':'#6a5a30'):'#4a4a4a';
    ctx.fillStyle=wc;
    ctx.fillRect(cx-bw/2,cy-bh/2+12,bw,bh-12);

    // 城垛
    const mw=bw/5,mh=14;
    for(let i=0;i<3;i++){
      if(ratio<.3&&i===1)continue;
      if(ratio<.15&&i===2)continue;
      ctx.fillRect(cx-bw/2+(i*2+.5)*mw,cy-bh/2+12-mh,mw,mh);
    }

    // 城门
    ctx.fillStyle=ratio>.3?'#2a1a0a':'#1a1a1a';
    const gw=bw*.32,gh=bh*.36;
    ctx.fillRect(cx-gw/2,cy+bh/2-gh,gw,gh);

    // 窗户
    if(ratio>.4){
      ctx.fillStyle='#1a1a1a';
      ctx.fillRect(cx-bw/3.5,cy-bh/6,6,8);
      ctx.fillRect(cx+bw/3.5-6,cy-bh/6,6,8);
    }

    // 裂痕
    if(ratio<.7){
      ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2;
      const n=ratio<.2?6:ratio<.4?4:ratio<.55?2:1;
      for(let i=0;i<n;i++){
        const sx=cx-bw/3+(i*17)%(bw*.6), sy=cy-bh/4+(i*23)%(bh*.4);
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+7+i*3,sy+10+i*4);ctx.lineTo(sx+2+i*2,sy+18+i*3);ctx.stroke();
      }
      ctx.lineWidth=1;
    }
    // 碎石
    if(ratio<.35){
      ctx.fillStyle='#444';
      for(let i=0;i<5;i++) ctx.fillRect(cx-bw/3+i*11,cy+bh/2+2+i%3*3,5+i%2*3,3+i%2*2);
    }
    // 旗帜
    const fx=cx,fy=cy-bh/2-4;
    ctx.strokeStyle='#777';ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-22);ctx.stroke();
    ctx.fillStyle=side===PLAYER?'#4a4':'#a44';
    const wave=Math.sin(Date.now()/300)*2;
    ctx.beginPath();ctx.moveTo(fx+1,fy-22);ctx.lineTo(fx+12,fy-18+wave);ctx.lineTo(fx+1,fy-14);ctx.closePath();ctx.fill();
  }

  // HP 文字+条
  ctx.fillStyle=hp<=0?'#f44':'#ccc';ctx.font='bold 13px monospace';ctx.textAlign='center';
  ctx.fillText(hp+'/'+hqMax,cx,cy+bh/2+18);
  const bwBar=bw*.8,bhBar=4,bxBar=cx-bwBar/2,byBar=cy+bh/2+22;
  ctx.fillStyle='#222';ctx.fillRect(bxBar,byBar,bwBar,bhBar);
  if(hp>0){
    ctx.fillStyle=ratio>.5?'#0d0':ratio>.25?'#ff0':'#f00';
    ctx.fillRect(bxBar,byBar,bwBar*ratio,bhBar);
  }
}

/* --- 废墟 --- */
function drawRuins(cx,cy,bw,bh,x0,w,h,side){
  // 烟雾背景氛围
  const smokeAlpha=(Math.sin(Date.now()/800)*.08+.12).toFixed(3);
  ctx.fillStyle='rgba(60,30,10,'+smokeAlpha+')';
  ctx.fillRect(x0,0,w,h);

  // 残垣（矮墙碎块）
  ctx.fillStyle='#3a3a3a';
  // 左侧断墙
  ctx.fillRect(cx-bw/2,cy+bh*.12,bw*.25,bh*.28);
  // 右侧断墙
  ctx.fillRect(cx+bw*.15,cy+bh*.06,bw*.28,bh*.22);
  // 中间碎块
  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(cx-bw*.08,cy+bh*.2,bw*.2,bh*.16);

  // 散落碎石
  ctx.fillStyle='#444';
  const seed=side===PLAYER?7:13;
  for(let i=0;i<12;i++){
    const sx=cx-bw/2.5+((i*seed*17+3)%(bw*1.1));
    const sy=cy+bh*.1+((i*seed*11+7)%(bh*.45));
    const sw=3+i%4*2, sh=2+i%3*2;
    ctx.fillRect(sx,sy,sw,sh);
  }

  // 焦痕地面
  ctx.fillStyle='#1a1008';
  ctx.fillRect(cx-bw*.4,cy+bh*.35,bw*.8,bh*.08);

  // 持续冒烟效果（动态小烟柱）
  ctx.globalAlpha=0.35;
  const t=Date.now()/1000;
  for(let i=0;i<3;i++){
    const sx=cx-bw*.25+i*bw*.25;
    const drift=Math.sin(t*1.2+i*2)*4;
    const smokeH=12+Math.sin(t*.8+i)*6;
    ctx.fillStyle='#555';
    ctx.beginPath();
    ctx.arc(sx+drift,cy-bh*.05-smokeH-i*8,5+i*1.5,0,Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx+drift*.7,cy-bh*.05-smokeH*1.5-i*6,3+i,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha=1;

  // 倒下的旗杆
  ctx.strokeStyle='#555';ctx.lineWidth=2;
  const fx=cx-bw*.15,fy=cy+bh*.15;
  ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx+18,fy-6);ctx.stroke();
  ctx.lineWidth=1;

  // DESTROYED 标签
  ctx.fillStyle='#f44';ctx.font='bold 10px monospace';ctx.textAlign='center';
  ctx.fillText('DESTROYED',cx,cy+bh/2+6);
}

/* --- 单位 --- */
function drawUnits(){
  for(const u of gs.units){
    const d=TYPES[u.type]; if(!d)continue;
    
    // Boss特殊渲染（2x2格子大小）
    if(d.shape === 'boss'){
      const x = u.col * TILE - TILE/2;
      const y = u.row * TILE - TILE/2;
      const size = TILE * 2;
      const pad = 4;
      
      let fill = getRenderColor(u);
      if(u.flash>0) fill='#fff';
      else if(u.hurt>0) fill='#f44';
      
      // Boss外圈
      ctx.fillStyle = fill;
      ctx.fillRect(x+pad, y+pad, size-pad*2, size-pad*2);
      
      // Boss内圈
      ctx.fillStyle = u.flash>0 ? '#ccc' : '#808';
      ctx.fillRect(x+pad+8, y+pad+8, size-pad*2-16, size-pad*2-16);
      
      // Boss边框（红色粗边）
      ctx.strokeStyle = u.side===PLAYER?'#0f0':'#f00';
      ctx.lineWidth = 3;
      ctx.strokeRect(x+pad, y+pad, size-pad*2, size-pad*2);
      ctx.lineWidth = 1;
      
      // Boss文字
      ctx.fillStyle='rgba(0,0,0,0.7)';
      ctx.font='bold 32px sans-serif'; 
      ctx.textAlign='center'; 
      ctx.textBaseline='middle';
      ctx.fillText(getDisplayLetter(u), x+size/2+1, y+size/2-1);
      ctx.fillStyle='#fff';
      ctx.fillText(getDisplayLetter(u), x+size/2, y+size/2-2);
      ctx.textBaseline='alphabetic';
      
      // Boss血条（更粗）
      const hpR=Math.max(0,u.hp)/u.maxHp;
      ctx.fillStyle='#1a1a1a';
      ctx.fillRect(x+pad+4, y+size-12, size-pad*2-8, 6);
      ctx.fillStyle=hpR>.5?'#0d0':hpR>.25?'#ff0':'#f00';
      ctx.fillRect(x+pad+4, y+size-12, (size-pad*2-8)*hpR, 6);
      
      // Boss HP数值显示
      ctx.fillStyle='#fff';
      ctx.font='bold 12px sans-serif';
      ctx.textAlign='center';
      ctx.fillText(Math.max(0, Math.round(u.hp)) + '/' + Math.round(u.maxHp), x+size/2, y+size-18);
      
      continue;
    }

    // 炮塔特殊渲染（2x2格子大小）
    if(d.shape === 'cannon'){
      const x = u.col * TILE - TILE/2;
      const y = u.row * TILE - TILE/2;
      const size = TILE * 2;
      const pad = 4;

      let fill = getRenderColor(u);
      if(u.flash>0) fill='#fff';
      else if(u.hurt>0) fill='#f44';

      // 外框
      ctx.fillStyle = fill;
      ctx.fillRect(x+pad, y+pad, size-pad*2, size-pad*2);

      // 炮口/内层
      ctx.fillStyle = u.flash>0 ? '#ddd' : '#3a2f1a';
      ctx.fillRect(x+pad+10, y+pad+10, size-pad*2-20, size-pad*2-20);

      // 边框
      ctx.strokeStyle = u.side===PLAYER?'#0f0':'#f00';
      ctx.lineWidth = 2;
      ctx.strokeRect(x+pad, y+pad, size-pad*2, size-pad*2);
      ctx.lineWidth = 1;

      // 文字
      ctx.fillStyle='rgba(0,0,0,0.7)';
      ctx.font='bold 28px sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(getDisplayLetter(u), x+size/2+1, y+size/2);
      ctx.fillStyle='#fff';
      ctx.fillText(getDisplayLetter(u), x+size/2, y+size/2-1);
      ctx.textBaseline='alphabetic';

      // 血条
      const hpR=Math.max(0,u.hp)/u.maxHp;
      ctx.fillStyle='#1a1a1a';
      ctx.fillRect(x+pad+4, y+size-12, size-pad*2-8, 5);
      ctx.fillStyle=hpR>.5?'#0d0':hpR>.25?'#ff0':'#f00';
      ctx.fillRect(x+pad+4, y+size-12, (size-pad*2-8)*hpR, 5);

      continue;
    }
    
    // 普通单位渲染
    const x=u.col*TILE,y=u.row*TILE,pad=3,w=TILE-pad*2,h=TILE-pad*2;

    let fill=getRenderColor(u);
    if(u.flash>0) fill='#fff';
    else if(u.hurt>0) fill='#f44';

    ctx.fillStyle=fill;
    if(d.shape==='diamond'){
      ctx.beginPath();
      ctx.moveTo(x+TILE/2,y+pad); ctx.lineTo(x+TILE-pad,y+TILE/2);
      ctx.lineTo(x+TILE/2,y+TILE-pad); ctx.lineTo(x+pad,y+TILE/2);
      ctx.closePath();ctx.fill();
    } else if(d.shape==='triangle'){
      ctx.beginPath();
      ctx.moveTo(x+TILE/2, y+pad);
      ctx.lineTo(x+TILE-pad, y+TILE-pad);
      ctx.lineTo(x+pad, y+TILE-pad);
      ctx.closePath();ctx.fill();
    } else if(d.shape==='heavy'){
      ctx.fillRect(x+2,y+2,TILE-4,TILE-4);
      ctx.fillStyle=u.flash>0?'#ccc':'#a33';
      ctx.fillRect(x+7,y+7,TILE-14,TILE-14);
    } else {
      ctx.fillRect(x+pad,y+pad,w,h);
    }

    // 阵营边框
    ctx.strokeStyle=u.side===PLAYER?'#0f0':'#f00';
    ctx.strokeRect(x+pad,y+pad,w,h);

    // 类型文字
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(getDisplayLetter(u),x+TILE/2+1,y+TILE/2-1);
    ctx.fillStyle='#fff';
    ctx.fillText(getDisplayLetter(u),x+TILE/2,y+TILE/2-2);
    ctx.textBaseline='alphabetic';

    // 血条
    const hpR=Math.max(0,u.hp)/u.maxHp;
    ctx.fillStyle='#1a1a1a';ctx.fillRect(x+pad,y+TILE-6,w,3);
    ctx.fillStyle=hpR>.5?'#0d0':hpR>.25?'#ff0':'#f00';
    ctx.fillRect(x+pad,y+TILE-6,w*hpR,3);

    // 一次性增援标识（右上角）
    if(u.oneTimeReinforcement){
      ctx.fillStyle='#1c2f4f';
      ctx.fillRect(x+TILE-12, y+2, 10, 10);
      ctx.strokeStyle='#8fc6ff';
      ctx.strokeRect(x+TILE-12.5, y+1.5, 11, 11);
      ctx.fillStyle='#d9ecff';
      ctx.font='bold 8px sans-serif';
      ctx.textAlign='center';
      ctx.fillText('援', x+TILE-7, y+9);
    }
  }
}

/* --- 粒子 --- */
function drawParticles(){
  for(const p of particles){
    const a=Math.max(0,p.life/p.max);ctx.globalAlpha=a;
    if(p.k==='proj'){
      const t=1-p.life/p.max;
      ctx.fillStyle=p.color;ctx.fillRect(p.x+(p.tx-p.x)*t-2,p.y+(p.ty-p.y)*t-2,5,5);
    } else if(p.k==='spark'){
      ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);
    } else if(p.k==='smoke'){
      const sz=p.size||6;
      ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,sz*a,0,Math.PI*2);ctx.fill();
    } else if(p.k==='dmgNum'){
      ctx.fillStyle=p.color;
      ctx.font='bold 14px sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(p.dmg,p.x,p.y);
    }
    ctx.globalAlpha=1;
  }
}

/* --- 暂停面纱 --- */
function drawPauseVeil(){
  ctx.fillStyle='rgba(0,0,0,0.45)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ffd966';ctx.font='bold 24px sans-serif';ctx.textAlign='center';
  ctx.fillText('⏸ 已暂停',canvas.width/2,canvas.height/2);
}

/* ═══════ 启动 ═══════ */
setBattle(mkState(getPlayerHqMax(),HQ_MAX,1));
gs.phase='title';
setActive('infantry');
fitCanvas();
requestAnimationFrame(loop);
