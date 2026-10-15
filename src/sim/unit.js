/* ═══════════════════════════════════════════════════════════
   单位工厂与显示（sim 层，不依赖 DOM / Three）
   运行时状态（buff / 难度 / 地图进度 / 遭遇修正 / Boss）由 bindUnitState 注入
   ═══════════════════════════════════════════════════════════ */
import { TYPES } from '../data/units.js';
import { DIFFICULTY_LEVELS } from '../data/difficulty.js';
import {
  PLAYER, ENEMY,
  MAP_ENEMY_BONUS, LAYER_ENEMY_BONUS, HIDDEN_MAP_EXTRA_BONUS, MAP_BOSS_BONUS,
} from '../data/constants.js';
import { getRelicEffectValue, getRelicPressureBonus } from './relics.js';
import { lightenHexColor } from './math.js';

const stateRefs = {
  getBuffs: null,            // () => playerBuffs
  getDifficulty: null,       // () => gameDifficulty
  getMapIndex: null,         // () => currentMapIndex
  getMapLayer: null,         // () => currentMapLayer
  getMapIsHidden: null,      // () => currentMapIsHidden
  getNodeType: null,         // () => currentNodeType
  getEncounterModifiers: null, // () => currentEncounterModifiers
  getEliteMultiplier: null,  // () => eliteMultiplier
  getBossProfile: null,      // () => currentBossProfile
};

export function bindUnitState(refs){
  Object.assign(stateRefs, refs);
}

export function getGlobalStatMult(){
  const bonus = getRelicEffectValue('globalAllStatsMul');
  return 1 + bonus;
}

export function mkUnit(side, type, col, row, isBoss=false, extra={}) {
  if(!mkUnit._uidSeed) mkUnit._uidSeed = 1;
  const d = TYPES[type];
  let maxHp = d.maxHp;
  let atk = d.atk;
  let range = d.range;
  let movCD = d.movCD;
  let atkCD = d.atkCD;
  const playerBuffs = stateRefs.getBuffs();
  const bossProfile = isBoss ? stateRefs.getBossProfile() : null;

  if(bossProfile){
    maxHp = bossProfile.maxHp;
    atk = bossProfile.atk;
    range = bossProfile.range;
    movCD = bossProfile.movCD;
    atkCD = bossProfile.atkCD;
  }
  
  // 应用玩家Buff（终极火炮保持固定数值）
  if(side === PLAYER && type !== 'ultimateCannon') {
    const globalMult = getGlobalStatMult();
    maxHp += (playerBuffs.hp || 0);
    atk += (playerBuffs.atk || 0);
    if(type === 'infantry') atk += (playerBuffs.infantryAtk || 0);
    if(type === 'archer') atk += (playerBuffs.archerAtk || 0);
    if(type === 'archer') range += (playerBuffs.archerRange || 0);
    if(type === 'tank') maxHp += (playerBuffs.tankHp || 0);

    atk += getRelicEffectValue('atkFlat', type);
    atk += getRelicEffectValue('atkFlat');
    range += getRelicEffectValue('rangeFlat', type);
    range += getRelicEffectValue('rangeFlat');

    const hpMulBonus = getRelicEffectValue('hpMul', type) + getRelicEffectValue('hpMul');
    const atkMulBonus = getRelicEffectValue('atkMul', type) + getRelicEffectValue('atkMul');
    if(hpMulBonus) maxHp *= (1 + hpMulBonus);
    if(atkMulBonus) atk *= (1 + atkMulBonus);

    const moveSpeedBonus = Math.min(0.8, getRelicEffectValue('moveSpeedMul', type) + getRelicEffectValue('moveSpeedMul'));
    const atkSpeedBonus = Math.min(0.8, getRelicEffectValue('atkSpeedMul', type) + getRelicEffectValue('atkSpeedMul'));
    if(moveSpeedBonus) movCD *= (1 - moveSpeedBonus);
    if(atkSpeedBonus) atkCD *= (1 - atkSpeedBonus);

    maxHp *= globalMult;
    atk *= globalMult;
    movCD /= globalMult;
    atkCD /= globalMult;

    if(playerBuffs.speed) {
      movCD *= (1 - playerBuffs.speed);
      atkCD *= (1 - playerBuffs.speed);
    }

    if(playerBuffs.relicMovSpeedBonus){
      movCD *= (1 - playerBuffs.relicMovSpeedBonus);
    }
    if(playerBuffs.relicAtkSpeedBonus){
      atkCD *= (1 - playerBuffs.relicAtkSpeedBonus);
    }
  }
  
  // 应用敌人难度加成
  if(side === ENEMY) {
    const gameDifficulty = stateRefs.getDifficulty();
    const currentMapIndex = stateRefs.getMapIndex();
    const currentMapLayer = stateRefs.getMapLayer();
    const currentMapIsHidden = stateRefs.getMapIsHidden();
    const currentNodeType = stateRefs.getNodeType();
    const currentEncounterModifiers = stateRefs.getEncounterModifiers();
    const eliteMultiplier = stateRefs.getEliteMultiplier();
    const diffData = DIFFICULTY_LEVELS[gameDifficulty - 1];
    const floorBonus = Math.max(0, currentMapIndex - 1) * MAP_ENEMY_BONUS;
    const layerBase = Math.max(0, currentMapLayer - 1);
    // 第3层起额外加速成长，让后续层数逐步“超级强化”
    const layerBonus = layerBase * LAYER_ENEMY_BONUS + Math.max(0, currentMapLayer - 3) * 0.03;
    const hiddenBonus = currentMapIsHidden ? HIDDEN_MAP_EXTRA_BONUS : 0;
    // Boss 专属强化：更高基础增幅 + 随地图/层数成长（让 Boss 不再“平推”）
    const bossBonus = isBoss ? (MAP_BOSS_BONUS + (currentMapIndex - 1) * 0.08 + Math.max(0, currentMapLayer - 1) * 0.03) : 0;
    const relicPressureBonus = getRelicPressureBonus();
    const bonus = (isBoss ? diffData.bossBonus : diffData.enemyBonus) + floorBonus + layerBonus + bossBonus + relicPressureBonus;
    
    // 炮塔不受难度加成（除攻击力可能受影响）
    if(type !== 'cannon'){
      maxHp = Math.round(maxHp * (1 + bonus + hiddenBonus));
      if((currentNodeType === 'elite' || currentNodeType === 'boss')){
        const debuff = Math.max(0, Math.min(0.5, getRelicEffectValue('enemyHpDebuffEliteBoss')));
        if(debuff > 0) maxHp = Math.round(maxHp * (1 - debuff));
      }
      atk = Math.round(atk * (1 + bonus + hiddenBonus));
      if(currentEncounterModifiers.enemyHalf && !isBoss){
        maxHp = Math.max(1, Math.ceil(maxHp * (currentEncounterModifiers.enemyHpMul || 0.5)));
      }
      // 精英战难度额外增幅
      if(eliteMultiplier > 1) {
        maxHp = Math.round(maxHp * eliteMultiplier);
        atk = Math.round(atk * eliteMultiplier);
      }

      // 再叠一层 Boss 专属倍率（在所有加成后执行）
      if(isBoss){
        maxHp = Math.round(maxHp * 2.15);
        atk = Math.round(atk * 1.35);
      }
    } else {
      // 炮塔：应用难度加成到攻击力，但HP不受难度影响
      atk = Math.round(atk * (1 + bonus));
    }
  }

  maxHp = Math.max(1, maxHp);
  atk = Math.max(0.1, atk);
  
  // 炮塔特殊属性处理
  if(type === 'cannon' && extra.baseTowerRange !== undefined){
    range = extra.baseTowerRange;
    atkCD = extra.baseTowerAtkCD;
  }
  
  return { 
    id:(side===PLAYER?'p':'e')+Math.random().toString(36).slice(2),
    _uid: mkUnit._uidSeed++,
    side, type, col, row, hp:maxHp, maxHp, atk, range, movCD, atkCD,
    movT:Math.random()*.3, atkT:Math.random()*.3,
    flash:0, hurt:0, isBoss,
    displayName: bossProfile?.name || d.name,
    displayLetter: bossProfile?.letter || d.letter,
    renderColor: bossProfile?.color || d.color,
    bossMechanics: bossProfile,
    summonTimer: bossProfile?.summonInterval || 0,
    summonCount: 0,
    enraged: false,
    slowTimer: 0,
    slowFactor: 0,
    ...extra,
  };
}

export function getDisplayName(unit){
  return unit.displayName || TYPES[unit.type]?.name || unit.type;
}

export function getDisplayLetter(unit){
  return unit.displayLetter || TYPES[unit.type]?.letter || '?';
}

export function getRenderColor(unit){
  const base = unit.renderColor || TYPES[unit.type]?.color || '#fff';
  if(unit.oneTimeReinforcement){
    // 同色系提升亮度与饱和度，便于识别一次性增援
    return lightenHexColor(base, 0.22);
  }
  return base;
}
