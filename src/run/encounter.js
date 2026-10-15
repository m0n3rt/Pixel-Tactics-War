/* ═══════════════════════════════════════════════════════════
   遭遇结算（run 层）
   - endBattle：回合胜负结算（总部伤害/复苏/战地医疗包/结束分支）
   - 战斗结果弹窗 / 金币掉落
   粒子特效（spawnHqHit/spawnDamageNum/spawnHqExplosion）Step H 前经 runRefs 注入。
   ═══════════════════════════════════════════════════════════ */
import { S } from '../state/run-access.js';
import { runRefs } from './refs.js';
import { ctx } from '../state/ctx.js';
import {
  PLAYER, ENEMY, COLS, TILE, ROWS, MAP_COUNT,
  HQ_DAMAGE_HP_RATIO, HQ_DAMAGE_ATK_RATIO, ENEMY_HQ_DAMAGE_MULT,
} from '../data/constants.js';
import { getRelicEffectValue } from '../sim/relics.js';
import { showVictoryScreen } from './flow.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const battleResultOverlay = $('battle-result-overlay');
const battleResultTitle = $('battle-result-title');
const battleResultText = $('battle-result-text');
const elMsg = $('message');
const btnStart = $('start-battle');
const btnPause = $('btn-pause');
const btnSpeed = $('btn-speed');
const btnNext  = $('next-round');
const btnAgain = $('btn-play-again');
const btnBack  = $('btn-back-title');
const pauseOverlay = $('pause-overlay');

export function computeBattleGoldDrop(){
  const goldBonus = getRelicEffectValue('battleGoldFlat');
  const gold = 3 + Math.floor(ctx.battle.dp / 4) + goldBonus;
  return Math.max(3, Math.min(8, gold));
}

export function applyBattleGoldDrop(){
  if(S.pendingGoldFromBattle > 0) return;
  const gold = computeBattleGoldDrop();
  S.pendingGoldFromBattle = gold;
  S.playerGold += gold;
  runRefs.showTip('获得金币 +' + gold);
  runRefs.addLog('<span class="log-kill">💰 结算金币 +'+gold+'（根据剩余部署点）</span>');
}

export function showBattleResultPopup(title, message){
  if(!battleResultOverlay) return;
  if(battleResultTitle) battleResultTitle.textContent = title || '战斗结果';
  if(battleResultText) battleResultText.textContent = message || '';
  battleResultOverlay.classList.remove('hidden');
}

export function closeBattleResultPopup(){
  if(!battleResultOverlay) return;
  battleResultOverlay.classList.add('hidden');
}

/* ═══════ 回合结算 ═══════ */
export function endBattle(winner){
  ctx.battle.winner=winner;
  const rem=ctx.battle.units.filter(u=>u.side===winner);
  const totalHp=rem.reduce((s,u)=>s+Math.max(0,u.hp),0);
  const totalAtk=rem.reduce((s,u)=>s+Math.max(0,u.atk),0);
  const baseDmg=Math.max(1, Math.round(totalHp*HQ_DAMAGE_HP_RATIO + totalAtk*HQ_DAMAGE_ATK_RATIO));
  const hqMitigation = Math.max(0, Math.min(0.9, getRelicEffectValue('hqDamageReduction')));
  const dmgToEnemy = winner===PLAYER ? baseDmg : 0;
  const dmgToPlayer = winner===ENEMY ? Math.max(1, Math.round(baseDmg * ENEMY_HQ_DAMAGE_MULT * (1 - hqMitigation))) : 0;

  if(winner===PLAYER){ctx.battle.eHp-=dmgToEnemy;ctx.battle.eFlash=.8;runRefs.spawnHqHit(ENEMY);runRefs.spawnDamageNum((COLS-1)*TILE,ROWS/2*TILE-10,dmgToEnemy,'#f80');}
  else               {ctx.battle.pHp-=dmgToPlayer;ctx.battle.pFlash=.8;runRefs.spawnHqHit(PLAYER);runRefs.spawnDamageNum(TILE,ROWS/2*TILE-10,dmgToPlayer,'#f80');}
  ctx.battle.phase='result';
  // clamp to 0
  ctx.battle.pHp=Math.max(0,ctx.battle.pHp); ctx.battle.eHp=Math.max(0,ctx.battle.eHp);

  if(ctx.battle.pHp<=0 && (S.playerBuffs.hqReviveCharges || 0) > 0){
    S.playerBuffs.hqReviveCharges -= 1;
    ctx.battle.pHp = 1;
    runRefs.addLog('<span class="log-kill">🌱 复苏火种触发：总部保留 1 点生命</span>');
    runRefs.showTip('复苏火种触发，避免了败北');
  }

  const hqRegen = Math.max(0, Math.round(getRelicEffectValue('hqRegenAfterBattle')));
  if(hqRegen > 0 && ctx.battle.pHp > 0){
    const oldHp = ctx.battle.pHp;
    ctx.battle.pHp = Math.min(runRefs.getPlayerHqMax(), ctx.battle.pHp + hqRegen);
    const realHeal = ctx.battle.pHp - oldHp;
    if(realHeal > 0) runRefs.addLog('<span class="log-move">🩹 战地医疗包：总部恢复 '+realHeal+' 生命</span>');
  }
  // 总部被摧毁 → 爆炸特效
  if(ctx.battle.pHp<=0) runRefs.spawnHqExplosion(PLAYER);
  if(ctx.battle.eHp<=0) runRefs.spawnHqExplosion(ENEMY);

  const ed=dmgToEnemy, pd=dmgToPlayer;
  let txt=winner===PLAYER?'🎉 本回合胜利！':'💀 本回合失败...';
  txt+=' 敌方总部 -'+ed+'  我方总部 -'+pd;

  runRefs.addLog('<span class="log-kill">— 战斗结束 — '+(winner===PLAYER?'胜利':'失败')+'</span>');
  runRefs.addLog('总部伤害：敌方 -'+ed+'  我方 -'+pd);

  const stageCleared = ctx.battle.eHp<=0;
  const defeated = ctx.battle.pHp<=0;
  let over = false;
  if(defeated && S.currentMapIsHidden){
    txt+='  ☁ 隐藏地图挑战失败，返回主线';
  } else if(defeated){
    txt+='  💔 游戏结束';
    ctx.battle.phase='gameover';
    over = true;
  } else if(stageCleared && S.currentNodeType === 'boss' && !S.currentMapIsHidden && S.currentMapIndex === MAP_COUNT){
    txt+='  🏆 你击败了Boss，通关成功！';
    ctx.battle.phase='gameover';
    over = true;
    setTimeout(() => showVictoryScreen(), 900);
  } else if(stageCleared && S.currentNodeType === 'boss' && S.currentMapIsHidden){
    txt+='  ✨ 隐藏地图已征服，即将返回主线';
  } else if(stageCleared){
    txt+= S.currentNodeType === 'boss' ? '  👑 本图Boss已击败，准备进入下一张图' : '  ✅ 已攻破本关城堡，可进入下一关';
  } else {
    txt+='  ⚔ 本关未攻破，需继续攻城';
  }

  elMsg.textContent=txt;
  btnStart.classList.add('hidden'); btnPause.classList.add('hidden'); btnSpeed.classList.add('hidden');
  pauseOverlay.classList.add('hidden');

  if(!over){
    btnNext.classList.remove('hidden');
    if(S.currentMapIsHidden && defeated) btnNext.textContent = '返回主线 →';
    else if(stageCleared && S.currentNodeType === 'boss') btnNext.textContent = S.currentMapIsHidden ? '返回主线 →' : '进入下一张图 →';
    else btnNext.textContent = stageCleared ? '进入下一关 →' : '继续攻城 →';
  } else {
    setTimeout(()=>{btnAgain.classList.remove('hidden');btnBack.classList.remove('hidden');},1200);
  }

  const popupTitle = defeated
    ? (S.currentMapIsHidden ? '☁ 隐藏图挑战失败' : '💔 战斗失利')
    : stageCleared
      ? (S.currentNodeType === 'boss' ? '👑 节点征服' : '✅ 攻城成功')
      : '⚔ 攻城继续';
  const popupMsg = '本回合：' + (winner===PLAYER?'胜利':'失败') + '\n'
    + '总部伤害：敌方 -' + ed + ' / 我方 -' + pd + '\n'
    + (defeated
      ? (S.currentMapIsHidden ? '隐藏图挑战失败，你将返回主线继续征程。' : '我方总部被摧毁，本局结束。')
      : (stageCleared
        ? (S.currentNodeType === 'boss' ? 'Boss节点已击破。' : '当前关卡城堡已攻破。')
        : '当前关卡未攻破，需要继续攻城。'));
  showBattleResultPopup(popupTitle, popupMsg);
}
