/* ═══════════════════════════════════════════════════════════
   敌军生成（sim 层，不依赖 DOM / Three）
   - spawnAI：布阵开始时按难度 / 地图 / 节点类型生成敌军与炮塔
   - getTowerCount / getTowerStats(ForDifficulty)：炮塔数量与数值
   运行态（难度 / 地图进度 / Boss 配置）由 bindAiState 注入；
   战斗状态由 spawnAI(battle) 显式传入，日志经 simFx。
   ═══════════════════════════════════════════════════════════ */
import { TYPES } from '../data/units.js';
import {
  PLAYER, ENEMY, ROWS, COLS, FIELD_RIGHT, DEPLOY_COLS, DP_MAX,
} from '../data/constants.js';
import { mkUnit, getDisplayName } from './unit.js';
import { canUnitOccupyAt } from './grid.js';
import { spawnBossAdd } from './bosses.js';
import { simFx } from './fx.js';

const aiRefs = {
  getDifficulty: null,                 // () => gameDifficulty
  getMapLayer: null,                   // () => currentMapLayer
  getMapIndex: null,                   // () => currentMapIndex
  getMapIsHidden: null,                // () => currentMapIsHidden
  getNodeType: null,                   // () => currentNodeType
  getBossProfile: null,                // () => currentBossProfile
  getTowerCountBeforeHiddenMap: null,  // () => towerCountBeforeHiddenMap
};

export function bindAiState(refs){
  Object.assign(aiRefs, refs);
}

export function getTowerStatsForDifficulty(difficulty){
  const isModeHard = (difficulty || 0) >= 10;
  return {
    range: isModeHard ? 6 : 5,
    atkCD: isModeHard ? 3.5 : 4.5,
  };
}

export function getTowerStats(){
  return getTowerStatsForDifficulty(aiRefs.getDifficulty());
}

export function getTowerCount(){
  const gameDifficulty = aiRefs.getDifficulty();
  if(gameDifficulty < 7) return 0;
  if(aiRefs.getMapIsHidden()) return aiRefs.getTowerCountBeforeHiddenMap();
  // 地图3: 1个, 地图4: 2个, 地图5: 3个
  const currentMapIndex = aiRefs.getMapIndex();
  if(currentMapIndex < 3) return 0;
  return Math.min(currentMapIndex - 2, 3);
}

export function spawnAI(gs){
  const gameDifficulty = aiRefs.getDifficulty();
  const currentMapIsHidden = aiRefs.getMapIsHidden();
  const currentMapIndex = aiRefs.getMapIndex();
  const currentMapLayer = aiRefs.getMapLayer();
  const currentNodeType = aiRefs.getNodeType();
  const currentBossProfile = aiRefs.getBossProfile();

  const towerCount = getTowerCount();
  const wantTowers = (gameDifficulty >= 7 && towerCount > 0);

  const sc=FIELD_RIGHT-DEPLOY_COLS+1, cols=[];
  // 炮塔放到敌方 HQ 地块（最右2列）后，不再需要为炮塔预留战场列
  for(let c=sc;c<=FIELD_RIGHT;c++) cols.push(c);

  // 检查是否是Boss战
  if(currentNodeType === 'boss'){
    // 生成Boss
    const bossCol = FIELD_RIGHT - 1;
    const bossRow = Math.floor(ROWS / 2);
    const boss = mkUnit(ENEMY, 'boss', bossCol, bossRow, true);
    gs.units = gs.units.filter(u => u.side === PLAYER);
    gs.units.push(boss);
    const adds = currentBossProfile?.openingAdds || [];
    for(const add of adds){
      for(let i = 0; i < add.count; i++){
        spawnBossAdd(gs.units, add.type, ENEMY, bossCol, bossRow + i - 1);
      }
    }
    simFx.addLog('<span class="log-kill">⚠️ Boss "'+getDisplayName(boss)+'" 出现！</span>');
    if(currentBossProfile?.mechanics){
      simFx.addLog('<span class="log-move">机制：'+currentBossProfile.mechanics+'</span>');
    }
    return;
  }

  const layerDpBase = Math.max(0, currentMapLayer - 1);
  const layerDpBonus = Math.floor(layerDpBase / 2) + Math.max(0, currentMapLayer - 3);
  let rem=Math.min(
    DP_MAX + currentMapIndex * 2 + layerDpBonus + (currentMapIsHidden ? 3 : 0),
    gs.dpCap + (currentMapIndex - 1) * 2 + layerDpBonus + (currentNodeType === 'elite' ? 2 : 0) + (currentMapIsHidden ? 3 : 0)
  );
  const eu=[]; let tries=0;

  // 7难度及以上，添加炮塔（2x2，占敌方 HQ 两列地块）
  if(wantTowers){
    const cannonStats = getTowerStats();
    const towerRows = [];
    if(towerCount === 1){
      towerRows.push(4);
    } else if(towerCount === 2){
      towerRows.push(2);
      towerRows.push(6);
    } else if(towerCount === 3){
      towerRows.push(1);
      towerRows.push(4);
      towerRows.push(7);
    }
    for(let i = 0; i < towerCount; i++){
      const row = Math.max(1, Math.min(ROWS - 1, towerRows[i] ?? 4));
      const col = COLS - 1;
      const probe = { type: 'cannon', col, row, hp: 1 };
      if(!canUnitOccupyAt(probe, col, row, eu)) continue;
      const tower = mkUnit(ENEMY, 'cannon', col, row, false, {
        baseTowerRange: cannonStats.range,
        baseTowerAtkCD: cannonStats.atkCD,
      });
      eu.push(tower);
    }
    if(towerCount > 0){
      simFx.addLog('<span class="log-kill">⚠️ 敌方部署了 '+towerCount+' 架防御炮塔！</span>');
    }
  }

  while(rem>0&&tries<200){tries++;
    const ks=['infantry', 'archer', 'tank']; // 排除boss类型
    const k=ks[Math.floor(Math.random()*ks.length)];
    const d=TYPES[k];
    if(d.cost>rem){if(rem<1)break;continue;}
    const c=cols[Math.floor(Math.random()*cols.length)],r=Math.floor(Math.random()*ROWS);
    const probe = { type: k, col: c, row: r, hp: 1 };
    if(!canUnitOccupyAt(probe, c, r, eu)) continue;
    eu.push(mkUnit(ENEMY,k,c,r)); rem-=d.cost;
  }
  gs.units=gs.units.filter(u=>u.side===PLAYER);
  gs.units.push(...eu);
}
