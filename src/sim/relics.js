/* ═══════════════════════════════════════════════════════════
   藏品 (Relic) 系统：定义加载、效果解释器、授予与时效层
   sim 层禁止直接 import DOM / Three；运行时状态由 bindRelicState 注入
   ═══════════════════════════════════════════════════════════ */
import { BUILTIN_RELIC_DEFS } from '../data/relics-fallback.js';
import { BASE_RELIC_KEYS, CHEST_RELIC_WEIGHTS } from '../data/chest-weights.js';
import { REINFORCEMENT_RESERVE_BASE_LIMIT } from '../data/constants.js';

// 当前藏品定义（实际以 relics.json 为准；加载失败回退内置定义）
export let RELIC_DEFS = BUILTIN_RELIC_DEFS;

// 运行时状态引用（由 main / ctx 注入，避免 sim 直接 import 可变绑定）
const stateRefs = {
  getRelics: null, // () => playerRelics
  getBuffs:  null, // () => playerBuffs
  getGold:   null, // () => playerGold
  setGold:   null, // (v) => void
  getGs:     null, // () => gs
  addLog:    null, // (html) => void
  showTip:   null, // (msg) => void
};

export function bindRelicState(refs){
  Object.assign(stateRefs, refs);
}

// 从外部 JSON 加载藏品定义（失败则退回内置默认值）
export function loadRelicConfig(){
  try{
    fetch('relics.json').then(res => {
      if(!res.ok) throw new Error('relics.json load failed');
      return res.json();
    }).then(data => {
      if(data && typeof data === 'object'){
        RELIC_DEFS = data;
        if(stateRefs.getRelics){
          const playerRelics = stateRefs.getRelics();
          for(const key of Object.keys(RELIC_DEFS)){
            if(typeof playerRelics[key] !== 'number') playerRelics[key] = 0;
          }
        }
      }
    }).catch(err => {
      console.warn('Failed to load relics.json, using built-in relic defs', err);
    });
  }catch(e){
    console.warn('relic config fetch not available, using built-in relic defs', e);
  }
}

/**
 * 调试工具：将当前 RELIC_DEFS 导出为格式化 JSON 字符串，
 * 可直接复制粘贴到 relics.json 中保存。
 * 用法：在浏览器控制台执行 exportRelicDefs()
 */
export function exportRelicDefs(){
  const json = JSON.stringify(RELIC_DEFS, null, 2);
  console.log('%c=== RELIC_DEFS JSON（可复制到 relics.json）===', 'color:#4af;font-weight:bold');
  console.log(json);
  // 同时尝试写入剪贴板（支持的浏览器环境）
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(json).then(() => {
      console.log('%c✅ 已自动复制到剪贴板', 'color:#6f6');
    }).catch(() => {
      console.log('%c⚠ 剪贴板写入失败，请手动复制上方内容', 'color:#fa0');
    });
  }
  return json;
}

export function getRelicStacks(key){
  return stateRefs.getRelics()[key] || 0;
}

export function getRelicDef(key){
  return RELIC_DEFS[key] || null;
}

export function getRelicDurationByClearedBattles(key){
  const def = getRelicDef(key);
  if(!def) return 0;
  return Math.max(0, Math.floor(def.durationByClearedBattles || 0));
}

export function getTimedRelicRemaining(key){
  const map = stateRefs.getBuffs().relicTimedRemaining || {};
  return Math.max(0, map[key] || 0);
}

export function getActiveRelicStacks(key){
  const stacks = getRelicStacks(key);
  if(stacks <= 0) return 0;
  const duration = getRelicDurationByClearedBattles(key);
  if(duration <= 0) return stacks;
  return getTimedRelicRemaining(key) > 0 ? stacks : 0;
}

function effectMatchesUnit(effect, unitType){
  if(effect.unitType) return effect.unitType === unitType;
  return unitType === undefined;
}

export function getRelicEffectValue(effectType, unitType){
  let total = 0;
  for(const key of Object.keys(RELIC_DEFS)){
    const stacks = getActiveRelicStacks(key);
    if(stacks <= 0) continue;
    const def = RELIC_DEFS[key];
    const effects = Array.isArray(def.effects) ? def.effects : [];
    for(const effect of effects){
      if(effect.type !== effectType) continue;
      if(!effectMatchesUnit(effect, unitType)) continue;
      const perStack = effect.perStack !== false;
      total += (effect.value || 0) * (perStack ? stacks : 1);
    }
  }
  return total;
}

export function getRelicSpeedBonusByGold(effectType){
  let total = 0;
  for(const key of Object.keys(RELIC_DEFS)){
    const stacks = getActiveRelicStacks(key);
    if(stacks <= 0) continue;
    const def = RELIC_DEFS[key];
    const effects = Array.isArray(def.effects) ? def.effects : [];
    for(const effect of effects){
      if(effect.type !== effectType) continue;
      const goldStep = Math.max(1, effect.goldStep || 2);
      const stepBonus = effect.stepBonus || 0;
      const cap = effect.cap ?? 0.30;
      const perStack = effect.perStack !== false;
      const bonus = Math.min(cap, Math.floor(stateRefs.getGold() / goldStep) * stepBonus);
      total += bonus * (perStack ? stacks : 1);
    }
  }
  return total;
}

export function getReserveLimit(){
  return REINFORCEMENT_RESERVE_BASE_LIMIT + getRelicEffectValue('reserveCapFlat');
}

export function getShopRelicFinalPrice(offer){
  const discount = Math.max(0, Math.floor(stateRefs.getBuffs().nextRelicDiscount || 0));
  return Math.max(0, (offer?.price || 0) - discount);
}

export function applyRelicOnGain(key){
  const def = getRelicDef(key);
  if(!def || !Array.isArray(def.effects)) return;

  const duration = getRelicDurationByClearedBattles(key);
  if(duration > 0){
    const playerBuffs = stateRefs.getBuffs();
    playerBuffs.relicTimedRemaining = playerBuffs.relicTimedRemaining || {};
    playerBuffs.relicTimedRemaining[key] = Math.max(playerBuffs.relicTimedRemaining[key] || 0, duration);
  }

  for(const effect of def.effects){
    if(effect.type === 'instantGold'){
      stateRefs.setGold(stateRefs.getGold() + Math.max(0, Math.round(effect.value || 0)));
    } else if(effect.type === 'nextChestDropChanceBonus'){
      const playerBuffs = stateRefs.getBuffs();
      playerBuffs.nextChestDropBonus = (playerBuffs.nextChestDropBonus || 0) + (effect.value || 0);
    } else if(effect.type === 'nextRelicDiscount'){
      const playerBuffs = stateRefs.getBuffs();
      playerBuffs.nextRelicDiscount = (playerBuffs.nextRelicDiscount || 0) + (effect.value || 0);
    } else if(effect.type === 'instantDp'){
      const gs = stateRefs.getGs();
      if(gs && typeof gs.dp === 'number' && typeof gs.dpCap === 'number'){
        gs.dp = Math.min(gs.dpCap, gs.dp + Math.max(0, Math.round(effect.value || 0)));
      }
    } else if(effect.type === 'hqReviveOnce'){
      const playerBuffs = stateRefs.getBuffs();
      playerBuffs.hqReviveCharges = (playerBuffs.hqReviveCharges || 0) + Math.max(1, Math.round(effect.value || 1));
    }
  }
}

export function consumeTimedRelicsOnClearedBattleNode(){
  const playerBuffs = stateRefs.getBuffs();
  const map = playerBuffs.relicTimedRemaining;
  if(!map) return;
  for(const key of Object.keys(map)){
    if(map[key] <= 0) continue;
    if(getRelicStacks(key) <= 0) continue;
    map[key] -= 1;
    if(map[key] <= 0){
      map[key] = 0;
      const playerRelics = stateRefs.getRelics();
      playerRelics[key] = Math.max(0, getRelicStacks(key) - 1);
      const name = getRelicDef(key)?.name || key;
      stateRefs.addLog('<span class="log-move">⌛ 时效结束：'+name+' 已失效</span>');
      stateRefs.showTip(name + ' 已失效');
    }
  }
}

export function hasAllBaseRelics(){
  return BASE_RELIC_KEYS.every(k => getRelicStacks(k) > 0);
}

export function hasCollectedAllRelicsExceptLuckyClover(){
  const keys = Object.keys(RELIC_DEFS).filter(k => k !== 'luckyClover');
  if(keys.length <= 0) return false;
  return keys.every(k => {
    const def = RELIC_DEFS[k];
    return def && getRelicStacks(k) >= def.maxStacks;
  });
}

export function getTotalRelicStacks(){
  return Object.keys(RELIC_DEFS).reduce((sum, key) => sum + getRelicStacks(key), 0);
}

export function getRelicPressureBonus(){
  // 藏品越多，敌方基础属性越高：每层 +0.4%，封顶 +14%
  return Math.min(0.14, getTotalRelicStacks() * 0.004);
}

export function canGainRelic(key){
  const def = getRelicDef(key);
  if(!def) return false;
  return getRelicStacks(key) < def.maxStacks;
}

export function grantRelic(key){
  if(!canGainRelic(key)) return false;
  const playerRelics = stateRefs.getRelics();
  playerRelics[key] = getRelicStacks(key) + 1;
  return true;
}

export function getAvailableBaseRelics(){
  return BASE_RELIC_KEYS.filter(k => canGainRelic(k));
}

export function getChestRelicPool(){
  // 宝箱从配置权重表中抽取所有「仍可获得」的藏品（不含胜利的象征）
  const pool = [];
  for(const key in CHEST_RELIC_WEIGHTS){
    if(canGainRelic(key)) pool.push(key);
  }
  return pool;
}
