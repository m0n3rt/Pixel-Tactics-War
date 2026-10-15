/* ═══════════════════════════════════════════════════════════
   开局 / 回合 / 胜负流程（run 层）
   - newGame / nextRound / proceedToNextRound / enterPrep
   - backToTitle / showVictoryScreen / showLoading / showBanner
   - mkState（战斗状态工厂包装）/ 终极火炮相关
   运行态经 S（state/run-access.js）读写；main.js 局部依赖经 runRefs 注入。
   ═══════════════════════════════════════════════════════════ */
import { S } from '../state/run-access.js';
import { runRefs } from './refs.js';
import { ctx } from '../state/ctx.js';
import { createBattleState } from '../state/battle-state.js';
import {
  PLAYER, ENEMY, ROWS, TILE, HQ_MAX, MAP_COUNT,
} from '../data/constants.js';
import { NODE_TYPES } from '../data/nodes.js';
import { DIFFICULTY_LEVELS } from '../data/difficulty.js';
import { getRelicEffectValue, consumeTimedRelicsOnClearedBattleNode } from '../sim/relics.js';
import { canUnitOccupyAt, getUnitCenterPixel } from '../sim/grid.js';
import { mkUnit, getDisplayName, getRenderColor } from '../sim/unit.js';
import { spawnAI } from '../sim/ai.js';
import { resetThreeCamera } from '../view/three/camera.js';
import { resetThreeCastleState } from '../view/three/castle.js';
import { clearThreeOverlay } from '../view/three/renderer.js';
import { threeState } from '../view/three/state.js';
import {
  pickBosses, generateMap, advanceAfterHiddenMap, getCurrentMapLayerCount, showMapScreen,
} from './map.js';
import { showStarterBlessingScreen, showRewardScreen } from './rewards.js';
import { applyBattleGoldDrop, closeBattleResultPopup } from './encounter.js';
import { closeShopDecision } from './shop.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const titleScreen   = $('title-screen');
const loadingScreen = $('loading-screen');
const roundBanner   = $('round-banner');
const roundNumText  = $('round-number-text');
const uiRoot        = $('ui-root');
const pauseOverlay  = $('pause-overlay');
const confirmOverlay = $('confirm-overlay');
const rewardScreen  = $('reward-screen');
const mapScreen     = $('map-screen');
const eventScreen   = $('event-screen');
const shopScreen    = $('shop-screen');
const codexScreen   = $('codex-screen');
const victoryScreen = $('victory-screen');
const victoryStats  = $('victory-stats');
const btnStart  = $('start-battle');
const btnPause  = $('btn-pause');
const btnSpeed  = $('btn-speed');
const btnNext   = $('next-round');
const btnAgain  = $('btn-play-again');
const btnBack   = $('btn-back-title');

/* ═══════ 状态 ═══════ */
export function mkState(pHp,eHp,round){
  return createBattleState(pHp, eHp, round, {
    dpPenalty: S.currentEncounterModifiers.dpPenalty || 0,
    dpBonus: S.playerBuffs.dpBonus || 0,
    relicDpBonus: getRelicEffectValue('dpCapFlat'),
    isBoss: S.currentNodeType === 'boss',
  });
}

export function newGame(){
  runRefs.initRun();
  closeBattleResultPopup();
  resetThreeCamera(true);
  resetThreeCastleState();
  clearThreeOverlay();
  if(threeState.ready) threeState.fx.length = 0;
  runRefs.setBattle(mkState(runRefs.getPlayerHqMax(),HQ_MAX,1));
  runRefs.clearLog();
  runRefs.resetLastReserveRenderKey();
  // newGame 特有覆盖（其余字段由工厂重置）
  S.stageLevel = 0;
  S.pendingStarterBlessing = true;
  pickBosses();
  generateMap();
  showLoading(()=>{
    if(S.pendingStarterBlessing) showStarterBlessingScreen();
    else showMapScreen();
  });
}

export function nextRound(){
  closeBattleResultPopup();
  if(S.currentMapIsHidden && ctx.battle.pHp<=0){
    advanceAfterHiddenMap(false);
    return;
  }

  // 只有攻破当前关城堡后才进入奖励和选路
  if(ctx.battle.eHp<=0 && !(S.currentNodeType==='boss' && !S.currentMapIsHidden && S.currentMapIndex===MAP_COUNT)) {
    if(S.currentNodeType === 'battle' || S.currentNodeType === 'elite'){
      consumeTimedRelicsOnClearedBattleNode();
    }
    applyBattleGoldDrop();
    S.pendingRewardAction = S.currentNodeType === 'boss' ? 'advance-map' : 'show-map';
    showRewardScreen();
  } else if(ctx.battle.eHp>0 && ctx.battle.pHp>0){
    // 本关未攻破，继续攻城（不推进关卡）。
    // 注意：此处故意不重置 currentEncounterModifiers，
    // 保证「先声夺势」等本节点增益在重试中持续生效，且不再额外消耗层数。
    const p=ctx.battle.pHp,e=ctx.battle.eHp,r=ctx.battle.round;
    runRefs.setBattle(mkState(p,e,r)); S.particles=[]; S.paused=false; S.speed=1; runRefs.clearLog();
    if(S.currentEncounterModifiers.enemyHalf){
      runRefs.showTip('攻城继续 · 开局祝福持续生效，敌方援军仍为半血');
    }
    showBanner(()=>enterPrep());
  } else {
    // Boss关会在结算中直接结束
  }
}

export function proceedToNextRound(){
  // 从地图选择的节点进入相应界面
  const currentNode = S.mapNodes[S.currentNodeIndex];
  if(currentNode){
    currentNode.completed = true;
    S.routeLockedFromIndex = S.currentNodeIndex;
    S.eliteMultiplier = 1; // 重置精英倍数
    S.currentNodeType = currentNode.type;
    S.currentMapLayer = currentNode.floor;
    S.currentBossProfile = currentNode.type === 'boss' ? currentNode.bossProfile : null;
    S.currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };

    if((S.playerBuffs.nextBattleDpPenalty || 0) > 0){
      S.currentEncounterModifiers.dpPenalty = S.playerBuffs.nextBattleDpPenalty;
      runRefs.addLog('<span class="log-move">🎲 骰子惩罚：本场准备点数 -'+S.playerBuffs.nextBattleDpPenalty+'</span>');
      S.playerBuffs.nextBattleDpPenalty = 0;
    }

    // 开局增益「先声夺势」：每进入一个新节点消耗一次层数，
    // 同一节点内的重试攻城不额外消耗（由 nextRound 重试分支保证）。
    if(currentNode.type !== 'boss' && (S.playerBuffs.enemyHalfBattlesRemaining || 0) > 0){
      S.currentEncounterModifiers.enemyHalf = true;
      S.currentEncounterModifiers.enemyHpMul = S.playerBuffs.enemyHalfHpMul || 0.5;
      S.playerBuffs.enemyHalfBattlesRemaining -= 1;
      const left = S.playerBuffs.enemyHalfBattlesRemaining;
      runRefs.showTip('开局祝福生效：本场敌军生命减半' + (left > 0 ? '（剩余 ' + left + ' 次）' : '（最后一次）'));
    }
    
    if(currentNode.type === 'elite'){
      S.eliteMultiplier = 1.3; // 精英战增加30%难度
      runRefs.showTip('精英战斗！敌人更强！');
    }
  }

  S.stageLevel += 1;
  const p=runRefs.getPlayerHqMax(),e=HQ_MAX,r=S.stageLevel;
  runRefs.setBattle(mkState(p,e,r)); S.particles=[]; S.paused=false; S.speed=1; runRefs.clearLog();
  resetThreeCastleState();
  
  showBanner(()=>enterPrep());
}

export function enterPrep(){
  uiRoot.classList.remove('hidden');
  roundBanner.classList.add('hidden');
  ctx.battle.phase='prepare';
  spawnAI(ctx.battle);
  ensureUltimateCannonInPrep();
  runRefs.applyRandomUnitRewardInPrep();
  runRefs.updateRelicSpeedBonusesForNextBattle();
  btnStart.classList.remove('hidden');
  btnPause.classList.remove('hidden'); btnPause.innerHTML='<kbd>P</kbd> 暂停';
  btnSpeed.classList.add('hidden');
  btnNext.classList.add('hidden'); btnAgain.classList.add('hidden'); btnBack.classList.add('hidden');
  runRefs.updateUI(); runRefs.fitCanvas();
}

export function ensureUltimateCannonInPrep(){
  if(!ctx.battle) return;
  if(!S.playerBuffs.ultimateCannon) return;
  if(ctx.battle.units.some(u => u.side === PLAYER && u.type === 'ultimateCannon' && u.hp > 0)) return;

  // 放置在我方 HQ 地块（最左2列）上，2×2 锚点放在第 2 列（col=1）
  const col = 1;
  const row = Math.max(1, Math.min(ROWS - 1, Math.floor(ROWS / 2)));
  const probe = { type: 'ultimateCannon', col, row, hp: 1 };
  if(!canUnitOccupyAt(probe, col, row, ctx.battle.units)) return;
  ctx.battle.units.push(mkUnit(PLAYER, 'ultimateCannon', col, row, false, { linkedToHq:true }));
}

export function triggerUltimateCannonStrike(){
  if(!ctx.battle) return;
  if(!S.playerBuffs.ultimateCannon) return;
  // 需要场上存在终极火炮（可被击破）
  const cannon = ctx.battle.units.find(u => u.side === PLAYER && u.type === 'ultimateCannon' && u.hp > 0);
  if(!cannon) return;

  const percent = 0.20;
  let hitCount = 0;
  for(const e of ctx.battle.units){
    if(e.side !== ENEMY) continue;
    if(e.hp <= 0) continue;
    const dmg = Math.max(1, Math.round(e.maxHp * percent));
    e.hp -= dmg;
    const p = getUnitCenterPixel(e);
    runRefs.spawnDamageNum(p.x, p.y - TILE/4, dmg, '#ffda72');
    hitCount++;
    if(e.hp <= 0){
      runRefs.spawnDeath(e.col, e.row, getRenderColor(e));
      runRefs.addLog('<span class="log-kill">💥 终极火炮轰击：敌方'+getDisplayName(e)+' 被炸毁！</span>');
    }
  }
  runRefs.addLog('<span class="log-kill">🌈 终极火炮开火！敌军全体受到其生命上限 20% 的伤害（命中 '+hitCount+' 个目标）</span>');
}

export function showLoading(cb){
  titleScreen.classList.add('hidden'); loadingScreen.classList.remove('hidden');
  setTimeout(()=>{loadingScreen.classList.add('hidden');cb();},1200);
}

export function showBanner(cb){
  uiRoot.classList.add('hidden'); roundBanner.classList.remove('hidden');
  const nodeInfo = NODE_TYPES[S.currentNodeType] || { name: '战斗' };
  const nodeName = S.currentNodeType === 'boss' && S.currentBossProfile ? S.currentBossProfile.name : nodeInfo.name;
  const prefix = S.currentMapIsHidden ? '隐藏图' : '第 '+S.currentMapIndex+' 张图';
  roundNumText.textContent = prefix+' · 第 '+S.currentMapLayer+'/'+getCurrentMapLayerCount()+' 层 · '+nodeName+' · 第 '+ctx.battle.round+' 战';
  setTimeout(()=>{roundBanner.classList.add('hidden');cb();},1800);
}

export function backToTitle(){
  runRefs.initRun();
  closeBattleResultPopup();
  resetThreeCamera(true);
  resetThreeCastleState();
  clearThreeOverlay();
  if(threeState.ready) threeState.fx.length = 0;
  uiRoot.classList.add('hidden'); pauseOverlay.classList.add('hidden'); confirmOverlay.classList.add('hidden');
  rewardScreen.classList.add('hidden'); mapScreen.classList.add('hidden'); eventScreen.classList.add('hidden'); shopScreen.classList.add('hidden');
  if(codexScreen) codexScreen.classList.add('hidden');
  if(victoryScreen) victoryScreen.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  runRefs.setBattle(mkState(runRefs.getPlayerHqMax(),HQ_MAX,1));
  ctx.battle.phase='title';
  runRefs.resetLastReserveRenderKey();
  // backToTitle 特有覆盖（其余字段由工厂重置）
  S.currentNodeIndex = -1;
  closeShopDecision();
}

export function showVictoryScreen(){
  if(!victoryScreen) return;
  uiRoot.classList.add('hidden');
  rewardScreen.classList.add('hidden');
  mapScreen.classList.add('hidden');
  eventScreen.classList.add('hidden');
  shopScreen.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  confirmOverlay.classList.add('hidden');
  if(codexScreen) codexScreen.classList.add('hidden');
  titleScreen.classList.add('hidden');
  victoryScreen.classList.remove('hidden');

  const diff = DIFFICULTY_LEVELS[S.gameDifficulty - 1];
  const diffName = diff ? (diff.level + ' · ' + diff.name) : String(S.gameDifficulty);
  const relicCount = (S.playerRelics && Array.isArray(S.playerRelics.list)) ? S.playerRelics.list.length : (S.playerRelics?.owned?.length || 0);
  const lines = [
    '难度：' + diffName,
    '通关主线：' + MAP_COUNT + '/' + MAP_COUNT,
    '金币：' + S.playerGold,
    '获得藏品：' + (Number.isFinite(relicCount) ? relicCount : '—'),
    '终极火炮：' + (S.playerBuffs.ultimateCannon ? '已获得' : '未获得'),
  ];
  if(victoryStats) victoryStats.innerHTML = lines.map(x => '<div>• ' + x + '</div>').join('');
}
