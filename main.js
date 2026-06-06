import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// ═══════════════════════════════════════════════════════════
//  像素战棋 — 正式版
//  首页 → 加载 → 回合提示 → 布阵(60s) → 自动战斗 → 结算
//  暂停 / 变速 / 战斗日志 / 悬浮提示 / 键盘快捷键
//  总部城堡随 HP 破损 + 受击特效
// ═══════════════════════════════════════════════════════════

/* ═══════ 常量 ═══════ */
const TILE = 32;
const COLS = 14;
const ROWS = 8;
const HQ_COLS = 2;
const FIELD_LEFT  = HQ_COLS;          // 2
const FIELD_RIGHT = COLS - HQ_COLS - 1; // 11
const DEPLOY_COLS = 3;

const PLAYER = 'player';
const ENEMY  = 'enemy';

const HQ_MAX    = 100;
const PREP_TIME_BASE = 60;
const PREP_TIME_INCREASE = 5;
const PREP_TIME_MAX = 120;
const PREP_TIME_BOSS = 180;
const DP_START  = 10;
const DP_PER_ROUND = 3;
const DP_MAX    = 25;
const HQ_DAMAGE_HP_RATIO = 0.45;
const HQ_DAMAGE_ATK_RATIO = 0.55;
const ENEMY_HQ_DAMAGE_MULT = 0.65;
const REINFORCEMENT_RESERVE_BASE_LIMIT = 3;
const UNIT_CAP_START = 6;
const UNIT_CAP_PER_ROUND = 1;
const UNIT_CAP_MAX = 12;
const MAP_COUNT = 5;
const MAIN_MAP_LAYER_COUNT = 10;
const HIDDEN_MAP_LAYER_COUNT = 10;
const MAP_ENEMY_BONUS = 0.05;
const LAYER_ENEMY_BONUS = 0.02;
const MAP_BOSS_BONUS = 0.12;
const HIDDEN_MAP_CHANCE = 0.35;
const HIDDEN_MAP_EXTRA_BONUS = 0.12;
const BOSS_SUMMON_LIMIT = 4;

const TYPES = {
  infantry: { name:'步兵', letter:'步', cost:1, maxHp:12, atk:3, range:1,
              movCD:0.6, atkCD:0.9, color:'#6cf', shape:'rect' },
  archer:   { name:'弓手', letter:'弓', cost:2, maxHp:8,  atk:3, range:3,
              movCD:0.8, atkCD:1.2, color:'#fd6', shape:'diamond' },
  tank:     { name:'重甲', letter:'甲', cost:3, maxHp:25, atk:4, range:1,
              movCD:1.0, atkCD:1.0, color:'#f77', shape:'heavy' },
  cavalry:  { name:'骑兵', letter:'骑', cost:2, maxHp:15, atk:3, range:2,
              movCD:0.8, atkCD:1.0, color:'#7ff', shape:'triangle' },
  boss:     { name:'魔王', letter:'魔', cost:0, maxHp:200, atk:10, range:2,
              movCD:0.5, atkCD:0.8, color:'#f0f', shape:'boss' },
  cannon:   { name:'炮塔', letter:'炮', cost:0, maxHp:30, atk:8, range:5,
              movCD:999, atkCD:4.5, color:'#fc4', shape:'cannon', isStationary:true },
  ultimateCannon: { name:'终极火炮', letter:'终', cost:0, maxHp:20, atk:0, range:0,
              movCD:999, atkCD:999, color:'#7ff', shape:'cannon', isStationary:true },
};

/* ═══════ 难度系统 ═══════ */
const DIFFICULTY_LEVELS = [
  { level: 1, name: '简单', enemyBonus: -0.04, bossBonus: -0.03, color: '#6f6' },
  { level: 2, name: '简单', enemyBonus: -0.02, bossBonus: -0.03, color: '#9f9' },
  { level: 3, name: '标准', enemyBonus: 0, bossBonus: 0, color: '#ff6' },
  { level: 4, name: '标准', enemyBonus: 0.02, bossBonus: 0.03, color: '#fa0' },
  { level: 5, name: '困难', enemyBonus: 0.04, bossBonus: 0.03, color: '#f80' },
  { level: 6, name: '困难', enemyBonus: 0.06, bossBonus: 0.03, color: '#f60' },
  { level: 7, name: '困难', enemyBonus: 0.08, bossBonus: 0.06, color: '#f44', towerDesc: '从第三张地图开始，敌方获得逐渐增强的炮台支援' },
  { level: 8, name: '极难', enemyBonus: 0.105, bossBonus: 0.06, color: '#f22', towerDesc: '从第三张地图开始，敌方获得逐渐增强的炮台支援' },
  { level: 9, name: '极难', enemyBonus: 0.13, bossBonus: 0.06, color: '#f0a', towerDesc: '从第三张地图开始，敌方获得逐渐增强的炮台支援' },
  { level: 10, name: '深渊', enemyBonus: 0.155, bossBonus: 0.10, color: '#a0f', towerDesc: '从第三章地图开始，敌方获得的支援炮台属性进一步增强' },
];

/* ═══════ Buff系统 ═══════ */
const BUFF_TEMPLATES = {
  atkBoost: { icon:'⚔️', name:'锋利打击', desc:'所有单位攻击力 +0.5', rarity:'common', apply:(buffs)=>buffs.atk=(buffs.atk||0)+0.5 },
  hpBoost: { icon:'❤️', name:'体质强化', desc:'所有单位生命值 +1.5', rarity:'common', apply:(buffs)=>buffs.hp=(buffs.hp||0)+1.5 },
  rangeBoost: { icon:'🎯', name:'精准校射', desc:'弓手攻击力 +0.5', rarity:'rare', apply:(buffs)=>buffs.archerAtk=(buffs.archerAtk||0)+0.5 },
  speedBoost: { icon:'⚡', name:'迅捷之风', desc:'所有单位移动与攻击速度提升7.5%', rarity:'rare', apply:(buffs)=>buffs.speed=(buffs.speed||0)+0.075 },
  tankBoost: { icon:'🛡️', name:'重甲强化', desc:'重甲生命值 +4', rarity:'common', apply:(buffs)=>buffs.tankHp=(buffs.tankHp||0)+4 },
  dpBoost: { icon:'💰', name:'资源膨胀', desc:'每回合部署点数 +1', rarity:'rare', apply:(buffs)=>buffs.dpBonus=(buffs.dpBonus||0)+1 },
  unitCapBoost: { icon:'👥', name:'扩编', desc:'单位上限 +1', rarity:'rare', apply:(buffs)=>buffs.unitCap=(buffs.unitCap||0)+1 },
  fireBoost: { icon:'🔥', name:'炽焰之力', desc:'所有单位攻击力 +1', rarity:'epic', apply:(buffs)=>buffs.atk=(buffs.atk||0)+1 },
  holyBoost: { icon:'✨', name:'圣光庇护', desc:'所有单位生命值 +3', rarity:'epic', apply:(buffs)=>buffs.hp=(buffs.hp||0)+3 },
  berserk: { icon:'💢', name:'狂暴', desc:'所有单位攻击力 +1.5 但生命值 -2.5', rarity:'epic', apply:(buffs)=>{buffs.atk=(buffs.atk||0)+1.5;buffs.hp=(buffs.hp||0)-2.5;} },
  randomReinforcement: { icon:'🎲', name:'随机援军', desc:'下场准备阶段随机免费部署1个单位', rarity:'epic', apply:(buffs)=>{buffs.randomUnitTokens=(buffs.randomUnitTokens||0)+1;} },
  ultimateCannon: {
    icon:'🌈',
    name:'终极火炮',
    desc:'极其稀有：获得终极火炮。每场战斗开局发射巨型炮弹，轰击敌方全体单位，造成其生命上限 20% 的伤害（固定比例，不受加成影响）。同时我方城堡地块会出现一座终极火炮（2×2），它被击破时我方总部同步损失其生命值。',
    rarity:'mythic',
    unique:true,
    apply:(buffs)=>{buffs.ultimateCannon=true;}
  },
};

/* ═══════ 地图节点类型 ═══════ */
const NODE_TYPES = {
  battle: { icon:'⚔️', name:'战斗', desc:'与敌军交战', color:'#f66' },
  elite: { icon:'💀', name:'精英战斗', desc:'强敌但奖励丰厚', color:'#a0f' },
  event: { icon:'🎭', name:'随机事件', desc:'未知的机遇或挑战', color:'#4af' },
  shop: { icon:'🏪', name:'商店', desc:'购买增益（待实现）', color:'#fa0' },
  rest: { icon:'🔥', name:'营火商店', desc:'进入商店并作出抉择', color:'#6f6' },
  boss: { icon:'👹', name:'Boss战', desc:'最终决战！', color:'#f06' },
};

const BOSS_POOLS = [
  [
    { key:'bone_warlord', name:'骸骨统帅', letter:'骸', color:'#d86', maxHp:180, atk:9, range:1, movCD:0.55, atkCD:0.75, mechanics:'半血后狂暴', enrageThreshold:0.5, enrageAtkBonus:3, enrageSpeedMult:1.15 },
    { key:'plague_hunter', name:'疫猎之眼', letter:'疫', color:'#8c6', maxHp:155, atk:8, range:4, movCD:0.7, atkCD:0.95, mechanics:'远程溅射', splashDamage:2 },
  ],
  [
    { key:'iron_guardian', name:'铁壁守卫', letter:'铁', color:'#aaa', maxHp:235, atk:10, range:1, movCD:0.85, atkCD:1.0, mechanics:'开场带护卫', openingAdds:[{ type:'tank', count:1 }, { type:'infantry', count:2 }] },
    { key:'bone_shaman', name:'枯骨祭司', letter:'祭', color:'#b6f', maxHp:175, atk:9, range:3, movCD:0.65, atkCD:0.85, mechanics:'周期召唤弓手', summonType:'archer', summonInterval:9 },
  ],
  [
    { key:'crimson_beast', name:'猩红巨兽', letter:'兽', color:'#f55', maxHp:230, atk:12, range:1, movCD:0.5, atkCD:0.72, mechanics:'攻击吸血', lifestealPercent:0.35 },
    { key:'storm_engine', name:'风暴核心', letter:'雷', color:'#6df', maxHp:195, atk:10, range:4, movCD:0.58, atkCD:0.8, mechanics:'远程溅射强化', splashDamage:3 },
  ],
  [
    { key:'frost_queen', name:'霜华女王', letter:'霜', color:'#9ef', maxHp:220, atk:11, range:3, movCD:0.55, atkCD:0.78, mechanics:'命中减速', slowOnHit:0.25 },
    { key:'abyss_knight', name:'深渊骑士', letter:'渊', color:'#95f', maxHp:280, atk:13, range:1, movCD:0.68, atkCD:0.86, mechanics:'半血狂暴并召唤重甲', enrageThreshold:0.4, enrageAtkBonus:4, enrageSpeedMult:1.2, summonType:'tank', summonInterval:12 },
  ],
  [
    { key:'void_eye', name:'虚空之眼', letter:'眼', color:'#f6f', maxHp:260, atk:12, range:5, movCD:0.52, atkCD:0.76, mechanics:'长射程与周期召唤', summonType:'infantry', summonInterval:8, splashDamage:2 },
    { key:'overlord', name:'终焉魔君', letter:'终', color:'#f33', maxHp:320, atk:14, range:2, movCD:0.5, atkCD:0.68, mechanics:'吸血与狂暴并存', lifestealPercent:0.25, enrageThreshold:0.5, enrageAtkBonus:4, enrageSpeedMult:1.2 },
  ],
];

const STARTER_BLESSINGS = [
  { key:'openingCull', icon:'🩸', name:'先声夺势', desc:'接下来的3场非Boss战中，敌方生命值减半', easyDesc:'接下来的5场非Boss战中，敌方生命值降低75%', rarity:'epic', apply:(buffs, difficulty)=>{
      const easy = difficulty <= 3;
      buffs.enemyHalfBattlesRemaining = Math.max(buffs.enemyHalfBattlesRemaining || 0, easy ? 5 : 3);
      buffs.enemyHalfHpMul = easy ? 0.25 : 0.5;
    } },
  { key:'infantryDrill', icon:'🪖', name:'步兵操典', desc:'步兵攻击力 +0.5', easyDesc:'步兵攻击力 +1', rarity:'rare', apply:(buffs, difficulty)=>{ buffs.infantryAtk = (buffs.infantryAtk || 0) + (difficulty <= 3 ? 1 : 0.5); } },
  { key:'tankFortify', icon:'🛡️', name:'重甲加固', desc:'重甲兵生命值 +1', easyDesc:'重甲兵生命值 +2', rarity:'rare', apply:(buffs, difficulty)=>{ buffs.tankHp = (buffs.tankHp || 0) + (difficulty <= 3 ? 2 : 1); } },
];

// 藏品定义（内置默认值，实际以 relics.json 为准）
let RELIC_DEFS = {
  infantryBoots: { key:'infantryBoots', name:'步兵的靴子', price:6, maxStacks:3, rarity:'rare', desc:'+3%步兵移速与攻速（最多叠3层）', effects:[{ type:'moveSpeedMul', value:0.03, unitType:'infantry' },{ type:'atkSpeedMul', value:0.03, unitType:'infantry' }] },
  archerSecondArrow: { key:'archerSecondArrow', name:'弓手的第二支箭', price:6, maxStacks:3, rarity:'rare', desc:'+10%弓手追加箭概率（最多叠3层）', effects:[{ type:'archerExtraArrowChance', value:0.10, unitType:'archer' }] },
  ironMedal: { key:'ironMedal', name:'铁誓军章', price:8, maxStacks:1, rarity:'epic', desc:'+15%重甲兵生命值', effects:[{ type:'hpMul', value:0.15, unitType:'tank' }] },
  unsealedSword: { key:'unsealedSword', name:'启封的剑', price:10, maxStacks:1, rarity:'epic', desc:'+2全体攻击力', effects:[{ type:'atkFlat', value:2 }] },
  unsealedShield: { key:'unsealedShield', name:'启封的盾', price:10, maxStacks:1, rarity:'epic', desc:'+10%全体生命值', effects:[{ type:'hpMul', value:0.10 }] },
  unsealedBanner: { key:'unsealedBanner', name:'启封的旗帜', price:10, maxStacks:1, rarity:'epic', desc:'+2部署点上限', effects:[{ type:'dpCapFlat', value:2 }] },
  victorySymbol: { key:'victorySymbol', name:'胜利的象征', price:12, maxStacks:5, rarity:'legendary', desc:'+4%全属性（集齐6件基础藏品后解锁，可叠5层）', effects:[{ type:'globalAllStatsMul', value:0.04 }] },
  belt: { key:'belt', name:'腰带', price:3, maxStacks:1, rarity:'rare', desc:'+2%步兵生命值', effects:[{ type:'hpMul', value:0.02, unitType:'infantry' }] },
  bracer: { key:'bracer', name:'护腕', price:3, maxStacks:1, rarity:'rare', desc:'+2%弓手生命值', effects:[{ type:'hpMul', value:0.02, unitType:'archer' }] },
  pauldron: { key:'pauldron', name:'肩甲', price:3, maxStacks:1, rarity:'rare', desc:'+2%重甲兵攻击力', effects:[{ type:'atkMul', value:0.02, unitType:'tank' }] },
  mysticScabbard: { key:'mysticScabbard', name:'神秘剑鞘', price:6, maxStacks:1, rarity:'epic', desc:'每有2金币，全体攻速+2%（封顶30%）', effects:[{ type:'atkSpeedByGold', goldStep:2, stepBonus:0.02, cap:0.30 }] },
  mysticShield: { key:'mysticShield', name:'神秘盾牌', price:6, maxStacks:1, rarity:'epic', desc:'每有2金币，全体移速+2%（封顶30%）', effects:[{ type:'moveSpeedByGold', goldStep:2, stepBonus:0.02, cap:0.30 }] },
  luckyClover: { key:'luckyClover', name:'幸运草', price:0, maxStacks:999, rarity:'legendary', desc:'+1%全体移速与攻速（仅在集齐所有藏品后固定刷新）', effects:[{ type:'moveSpeedMul', value:0.01 },{ type:'atkSpeedMul', value:0.01 }] },
  tacticalManual: { key:'tacticalManual', name:'战术手册', price:5, maxStacks:1, rarity:'rare', desc:'+1全体攻击力', effects:[{ type:'atkFlat', value:1 }] },
  legionVest: { key:'legionVest', name:'军团背心', price:5, maxStacks:1, rarity:'rare', desc:'+5%全体生命上限', effects:[{ type:'hpMul', value:0.05 }] },
  bladeCharm: { key:'bladeCharm', name:'锋刃护符', price:4, maxStacks:1, rarity:'rare', desc:'+8%步兵攻击力', effects:[{ type:'atkMul', value:0.08, unitType:'infantry' }] },
  eaglePendant: { key:'eaglePendant', name:'鹰眼吊坠', price:4, maxStacks:1, rarity:'rare', desc:'+1弓手攻击距离', effects:[{ type:'rangeFlat', value:1, unitType:'archer' }] },
  fortressGear: { key:'fortressGear', name:'堡垒齿轮', price:5, maxStacks:1, rarity:'rare', desc:'+8%重甲移速', effects:[{ type:'moveSpeedMul', value:0.08, unitType:'tank' }] },
  recruitHorn: { key:'recruitHorn', name:'征募号角', price:6, maxStacks:1, rarity:'epic', desc:'+1单位上限', effects:[{ type:'unitCapFlat', value:1 }] },
  fieldLedger: { key:'fieldLedger', name:'战地账簿', price:6, maxStacks:2, rarity:'epic', desc:'+1每场结算金币（最多2层）', effects:[{ type:'battleGoldFlat', value:1 }] },
  swiftSeal: { key:'swiftSeal', name:'急行军印章', price:6, maxStacks:2, rarity:'epic', desc:'+1部署点上限（最多2层）', effects:[{ type:'dpCapFlat', value:1 }] },
  coinPouch: { key:'coinPouch', name:'金币袋', price:4, maxStacks:3, rarity:'rare', desc:'购买后立刻获得5金币', effects:[{ type:'instantGold', value:5 }] },
  treasureMapShard: { key:'treasureMapShard', name:'宝图残页', price:6, maxStacks:1, rarity:'epic', desc:'下一次开箱出货率+20%', effects:[{ type:'nextChestDropChanceBonus', value:0.20 }] },
  discountSigil: { key:'discountSigil', name:'折扣徽记', price:6, maxStacks:1, rarity:'epic', desc:'下一次购买藏品-2金币', effects:[{ type:'nextRelicDiscount', value:2 }] },
  emergencyFund: { key:'emergencyFund', name:'应急军费', price:5, maxStacks:2, rarity:'rare', desc:'当前部署点+3（超出无效）', effects:[{ type:'instantDp', value:3 }] },
  reinforcementTag: { key:'reinforcementTag', name:'援军军牌', price:7, maxStacks:2, rarity:'epic', desc:'+1增援库存上限（最多2层）', effects:[{ type:'reserveCapFlat', value:1 }] },
  tradeContract: { key:'tradeContract', name:'商路契约', price:7, maxStacks:1, rarity:'epic', desc:'骰子奖励概率+10%', effects:[{ type:'diceRewardChanceBonus', value:0.10 }] },
  preBattleStim: { key:'preBattleStim', name:'战前兴奋剂', price:4, maxStacks:1, rarity:'rare', desc:'接下来2个攻破战斗关卡内，+10%全体攻速', durationByClearedBattles:2, effects:[{ type:'atkSpeedMul', value:0.10 }] },
  fortressCrew: { key:'fortressCrew', name:'堡垒工程队', price:5, maxStacks:1, rarity:'rare', desc:'接下来2个攻破战斗关卡内，我方总部受伤害-15%', durationByClearedBattles:2, effects:[{ type:'hqDamageReduction', value:0.15 }] },
  huntOrder: { key:'huntOrder', name:'猎首令', price:6, maxStacks:1, rarity:'epic', desc:'接下来1个攻破战斗关卡内，精英/Boss战敌方生命-10%', durationByClearedBattles:1, effects:[{ type:'enemyHpDebuffEliteBoss', value:0.10 }] },
  medkit: { key:'medkit', name:'战地医疗包', price:5, maxStacks:1, rarity:'rare', desc:'接下来3个攻破战斗关卡内，每场战后回复总部6生命', durationByClearedBattles:3, effects:[{ type:'hqRegenAfterBattle', value:6 }] },
  allIn: { key:'allIn', name:'孤注一掷', price:6, maxStacks:1, rarity:'epic', desc:'接下来1个攻破战斗关卡内，+20%攻击且-12%生命', durationByClearedBattles:1, effects:[{ type:'atkMul', value:0.20 },{ type:'hpMul', value:-0.12 }] },
  reviveSpark: { key:'reviveSpark', name:'复苏火种', price:8, maxStacks:1, rarity:'legendary', desc:'总部将被击破时保留1点生命（一次）', effects:[{ type:'hqReviveOnce', value:1, perStack:false }] },
};

// 参与「集齐基础藏品后解锁胜利的象征」判定的基础藏品（仍为最初的6件）
const BASE_RELIC_KEYS = ['infantryBoots', 'archerSecondArrow', 'ironMedal', 'unsealedSword', 'unsealedShield', 'unsealedBanner'];

// 商店宝箱内各藏品的抽取权重（不含胜利的象征）
const CHEST_RELIC_WEIGHTS = {
  infantryBoots: 10,
  archerSecondArrow: 10,
  ironMedal: 8,
  unsealedSword: 7,
  unsealedShield: 7,
  unsealedBanner: 7,
  belt: 12,
  bracer: 12,
  pauldron: 12,
  mysticScabbard: 8,
  mysticShield: 8,
  tacticalManual: 9,
  legionVest: 9,
  bladeCharm: 9,
  eaglePendant: 9,
  fortressGear: 9,
  recruitHorn: 7,
  fieldLedger: 7,
  swiftSeal: 7,
  coinPouch: 10,
  treasureMapShard: 7,
  discountSigil: 7,
  emergencyFund: 8,
  reinforcementTag: 6,
  tradeContract: 6,
  preBattleStim: 8,
  fortressCrew: 8,
  huntOrder: 6,
  medkit: 8,
  allIn: 6,
  reviveSpark: 4,
};

function createEmptyRelicState(){
  const state = {};
  for(const key of Object.keys(RELIC_DEFS)) state[key] = 0;
  return state;
}

// 从外部 JSON 加载藏品定义（失败则退回内置默认值）
function loadRelicConfig(){
  try{
    fetch('relics.json').then(res => {
      if(!res.ok) throw new Error('relics.json load failed');
      return res.json();
    }).then(data => {
      if(data && typeof data === 'object'){
        RELIC_DEFS = data;
        for(const key of Object.keys(RELIC_DEFS)){
          if(typeof playerRelics[key] !== 'number') playerRelics[key] = 0;
        }
      }
    }).catch(err => {
      console.warn('Failed to load relics.json, using built-in relic defs', err);
    });
  }catch(e){
    console.warn('relic config fetch not available, using built-in relic defs', e);
  }
}

loadRelicConfig();

/**
 * 调试工具：将当前 RELIC_DEFS 导出为格式化 JSON 字符串，
 * 可直接复制粘贴到 relics.json 中保存。
 * 用法：在浏览器控制台执行 exportRelicDefs()
 */
function exportRelicDefs(){
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

const HIDDEN_BOSS_POOL = BOSS_POOLS.flat().map(boss => ({
  ...boss,
  name: '隐域·' + boss.name,
  maxHp: Math.round(boss.maxHp * 1.15),
  atk: Math.round(boss.atk * 1.12),
}));

/* ═══════ DOM ═══════ */
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const sideGap = window.innerWidth > 1180 ? 36 : 16;
  const logW = window.innerWidth > 1180 ? 180 : 0;
  const reserveW = window.innerWidth > 1180 ? 156 : 0;
  const maxW = window.innerWidth - 20 - logW - reserveW - sideGap;
  const maxH = window.innerHeight - 180;
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
let gs;            // gameState
let lfTime = 0;    // lastFrameTime
let selUnit = 'infantry';
let particles = [];
let paused = false;
let speed = 1;     // 1, 2, 3
const SPEEDS = [1, 2, 3];
let hoverCol = -1, hoverRow = -1; // 鼠标悬浮格
let tipTimer = null;
let lastDeployment = [];  // 保存上一回合部署的棋子
let reinforcementStock = [];
let selectedReserveIndex = -1;
let lastReserveRenderKey = '';

let gameDifficulty = 3;    // 当前难度 1-10
let playerBuffs = {};      // 玩家buff：{atk:2, hp:5, speed:0.15, ...}
let mapNodes = [];         // 地图节点
let currentNodeIndex = 0;  // 当前节点索引
let eliteMultiplier = 1;   // 精英战斗难度倍增
let currentNodeType = 'battle'; // 当前关卡节点类型
let stageLevel = 1;        // 关卡层级进度
let currentMapIndex = 1;   // 当前主线地图 1-5
let currentMapLayer = 1;   // 当前地图层数 1-10
let routeLockedFromIndex = -1; // 已选路线锚点
let currentBossProfile = null;
let currentMapBossProfile = null;
let selectedBosses = [];
let currentMapIsHidden = false;
let towerCountBeforeHiddenMap = 0; // 进入隐藏地图前的炮塔数量
let pendingMainMapIndex = null;
let pendingStarterBlessing = false;
let pendingRewardAction = 'show-map';
let currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };
let playerGold = 0;
let pendingGoldFromBattle = 0;

let playerRelics = createEmptyRelicState();

let shopState = {
  currentOffer: null,
  savedOffer: null,
  savedOfferLocked: false,
  chestOpensLeft: 5,
  lastChestResultEmpty: false,
  diceUsed: false,
  healUsed: false,
  pendingDecision: null,
};
let shopDiceRolling = false;
let lastShopChestOpensLeft = null;

const THREE_CELL = 1.1;
const threeState = {
  ready: false,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  boardGroup: null,
  unitGroup: null,
  fxGroup: null,
  overlayRoot: null,
  hoverMesh: null,
  hoverRangeMesh: null,
  raycaster: null,
  mouseNdc: null,
  boardPlane: null,
  boardWidth: 0,
  boardDepth: 0,
  unitHudMap: new Map(),
  fx: [],
  castles: { player: null, enemy: null },
  shake: 0,
};

function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

function getPlayerHqMax(){
  return Math.max(20, Math.round(HQ_MAX * (playerBuffs.hqMaxMul || 1)));
}

function resetThreeCastleState(){
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

function gridToWorld(c, r){
  return {
    x: (c - (COLS - 1) / 2) * THREE_CELL,
    z: (r - (ROWS - 1) / 2) * THREE_CELL,
  };
}

function worldToGrid(x, z){
  const c = Math.round(x / THREE_CELL + (COLS - 1) / 2);
  const r = Math.round(z / THREE_CELL + (ROWS - 1) / 2);
  if(c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

function pixelToWorld(px, py){
  const gridX = px / TILE - 0.5;
  const gridY = py / TILE - 0.5;
  return {
    x: (gridX - (COLS - 1) / 2) * THREE_CELL,
    y: 0,
    z: (gridY - (ROWS - 1) / 2) * THREE_CELL,
  };
}

function createUnitMesh3D(u){
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

function clearThreeGroup(group){
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

function resetThreeCamera(silent){
  if(!threeState.ready) return;
  const cam = threeState.camera;
  const controls = threeState.controls;
  cam.position.set(0, 13.2, 12.6);
  controls.target.set(0, 0, 0);
  controls.update();
  if(!silent) showTip('3D镜头已重置');
}

function zoomThreeCamera(delta){
  if(!threeState.ready) return;
  const controls = threeState.controls;
  const camera = threeState.camera;
  const target = controls.target.clone();
  const offset = camera.position.clone().sub(target);
  const current = offset.length();
  const step = delta < 0 ? 0.76 : 1.32;
  const nextDistance = clamp(current * step, controls.minDistance, controls.maxDistance);
  offset.setLength(nextDistance);
  camera.position.copy(target).add(offset);
  controls.update();
}

function bumpThreeShake(amount){
  if(!threeState.ready) return;
  threeState.shake = Math.max(threeState.shake || 0, amount);
}

function createRangeRing(color, opacity){
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
function createCastleGroup(side){
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

function createOverlayNode(className, html){
  const node = document.createElement('div');
  node.className = className;
  if(html) node.innerHTML = html;
  threeOverlay.appendChild(node);
  return node;
}

function projectWorldToScreen(worldX, worldY, worldZ){
  const rect = threeStage.getBoundingClientRect();
  const v = new THREE.Vector3(worldX, worldY, worldZ).project(threeState.camera);
  return {
    x: ((v.x + 1) * 0.5) * rect.width,
    y: ((1 - v.y) * 0.5) * rect.height,
    visible: v.z >= -1 && v.z <= 1,
  };
}

function ensureUnitHud(u){
  if(threeState.unitHudMap.has(u._uid)) return threeState.unitHudMap.get(u._uid);
  const hud = createOverlayNode('three-unit-hud',
    '<div class="three-unit-name"></div>' +
    '<div class="three-hp-track"><div class="three-hp-fill"></div></div>' +
    '<div class="three-hp-value"></div>'
  );
  threeState.unitHudMap.set(u._uid, hud);
  return hud;
}

function ensureCastleHud(side){
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

function pushThreeEffect(effect){
  if(!threeState.ready) return null;
  threeState.fx.push(effect);
  return effect;
}

function addThreeProjectile(from, to, color){
  if(!threeState.ready) return;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color || '#ffd966'), emissive: new THREE.Color(color || '#ffd966'), emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.2 })
  );
  mesh.castShadow = true;
  threeState.fxGroup.add(mesh);
  pushThreeEffect({ kind:'proj', mesh, from, to, life:0.22, max:0.22 });
}

function addThreeDamageNum(worldX, worldY, worldZ, dmg, color){
  if(!threeState.ready) return;
  const dmgText = formatDisplayNumber(dmg);
  const node = createOverlayNode('three-dmg-num' + (Number(dmg) >= 10 ? ' crit' : ''), dmgText);
  node.style.color = color || '#ffd966';
  pushThreeEffect({ kind:'dmg', node, worldX, worldY, worldZ, life:0.85, max:0.85, rise:0.7 });
}

function addThreeHitFlash(side){
  if(!threeState.ready) return;
  const castle = threeState.castles[side];
  if(castle){
    castle.hitFlash = Math.max(castle.hitFlash, 0.35);
    castle.shake = Math.max(castle.shake, 0.22);
    bumpThreeShake(0.18);
    const baseX = castle.group.position.x + (side === PLAYER ? 0.65 : -0.65);
    const baseZ = castle.group.position.z + (Math.random() - 0.5) * 0.35;
    for(let i = 0; i < 6; i++){
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.09 + Math.random() * 0.06, 0.06 + Math.random() * 0.05, 0.07 + Math.random() * 0.05),
        new THREE.MeshStandardMaterial({ color: 0x8d7c70, roughness: 0.98, metalness: 0.01, flatShading: true })
      );
      mesh.castShadow = true;
      mesh.position.set(baseX + (Math.random() - 0.5) * 0.9, 1.0 + Math.random() * 1.2, baseZ);
      threeState.fxGroup.add(mesh);
      pushThreeEffect({ kind:'debris', mesh, vx:(side === PLAYER ? -1 : 1) * (0.7 + Math.random()), vy:0.8 + Math.random() * 1.0, vz:(Math.random() - 0.5) * 0.8, spin:Math.random() * 4 - 2, life:0.65 + Math.random() * 0.2, max:0.85 });
    }
  }
}

function addThreeExplosion(side){
  if(!threeState.ready) return;
  const castle = threeState.castles[side];
  if(castle){
    castle.destroyed = true;
    castle.collapse = 0;
    castle.shake = 0.5;
  }
  bumpThreeShake(0.42);
  const centerX = side === PLAYER ? threeState.castles.player.group.position.x : threeState.castles.enemy.group.position.x;
  for(let i = 0; i < 30; i++){
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 1.8;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 8, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0xff8d4a : 0xffcf66, emissive: 0xaa3311, emissiveIntensity: 0.45, roughness: 0.85 })
    );
    mesh.castShadow = true;
    mesh.position.set(centerX + (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.9);
    threeState.fxGroup.add(mesh);
    pushThreeEffect({ kind:'burst', mesh, vx: Math.cos(angle) * speed, vy: 1.0 + Math.random() * 1.5, vz: Math.sin(angle) * speed, life: 0.8 + Math.random() * 0.5, max: 1.2 });
  }
  for(let i = 0; i < 18; i++){
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 + Math.random() * 0.06, 0.06 + Math.random() * 0.06, 0.08 + Math.random() * 0.08),
      new THREE.MeshStandardMaterial({ color: 0x7c6a60, roughness: 0.98, metalness: 0.01, flatShading: true })
    );
    mesh.castShadow = true;
    mesh.position.set(centerX + (Math.random() - 0.5) * 1.3, 1.1 + Math.random() * 1.8, (Math.random() - 0.5) * 0.9);
    threeState.fxGroup.add(mesh);
    pushThreeEffect({ kind:'debris', mesh, vx:(side === PLAYER ? -1 : 1) * (0.8 + Math.random() * 1.2), vy:1.2 + Math.random() * 1.3, vz:(Math.random() - 0.5) * 1.0, spin:Math.random() * 8 - 4, life:0.95 + Math.random() * 0.45, max:1.35 });
  }
}

function syncThreeEffects(dt){
  if(!threeState.ready) return;
  for(let i = threeState.fx.length - 1; i >= 0; i--){
    const fx = threeState.fx[i];
    fx.life -= dt;
    const t = 1 - Math.max(0, fx.life / fx.max);
    if(fx.kind === 'proj' && fx.mesh){
      const x = fx.from.x + (fx.to.x - fx.from.x) * t;
      const y = 0.55 + Math.sin(t * Math.PI) * 0.8;
      const z = fx.from.z + (fx.to.z - fx.from.z) * t;
      fx.mesh.position.set(x, y, z);
      fx.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.35);
      fx.mesh.material.opacity = 1;
    } else if(fx.kind === 'dmg' && fx.node){
      const scr = projectWorldToScreen(fx.worldX, fx.worldY + (1 - t) * fx.rise, fx.worldZ);
      fx.node.style.left = scr.x + 'px';
      fx.node.style.top = scr.y + 'px';
      fx.node.style.opacity = String(Math.max(0, 1 - t));
      fx.node.style.transform = 'translate(-50%,-50%) translateY(' + (-18 * t) + 'px) scale(' + (1 + t * 0.12) + ')';
    } else if(fx.kind === 'burst' && fx.mesh){
      fx.mesh.position.x += fx.vx * dt;
      fx.mesh.position.y += fx.vy * dt;
      fx.mesh.position.z += fx.vz * dt;
      fx.vy -= 2.3 * dt;
      fx.mesh.scale.setScalar(Math.max(0.2, 1 - t * 0.9));
    } else if(fx.kind === 'debris' && fx.mesh){
      fx.mesh.position.x += fx.vx * dt;
      fx.mesh.position.y += fx.vy * dt;
      fx.mesh.position.z += fx.vz * dt;
      fx.vy -= 3.1 * dt;
      fx.mesh.rotation.x += dt * (fx.spin || 0.6);
      fx.mesh.rotation.y += dt * ((fx.spin || 0.6) * 0.8);
      fx.mesh.rotation.z += dt * ((fx.spin || 0.6) * 0.5);
      fx.mesh.scale.setScalar(Math.max(0.4, 1 - t * 0.55));
    }

    if(fx.life <= 0){
      if(fx.mesh){
        threeState.fxGroup.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        if(Array.isArray(fx.mesh.material)) fx.mesh.material.forEach(m => m.dispose());
        else fx.mesh.material.dispose();
      }
      if(fx.node && fx.node.parentNode) fx.node.parentNode.removeChild(fx.node);
      threeState.fx.splice(i, 1);
    }
  }
}

function syncThreeHudForUnit(u){
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

function syncThreeCastleHud(side, hp, maxHp){
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

function syncHoverRangeIndicator(){
  if(!threeState.ready) return;
  const unit = (hoverCol >= 0 && hoverRow >= 0)
    ? gs.units.find(u => u.hp > 0 && unitOccupiesCell(u, hoverCol, hoverRow))
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

function clearThreeOverlay(){
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

function updateCastleVisual(castle, hp, maxHp, dt){
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

function getGridFromPointer(e){
  if(!threeState.ready || !threeStage) return null;
  const rect = threeStage.getBoundingClientRect();
  if(rect.width <= 0 || rect.height <= 0) return null;
  threeState.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  threeState.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  threeState.raycaster.setFromCamera(threeState.mouseNdc, threeState.camera);
  const hit = new THREE.Vector3();
  if(!threeState.raycaster.ray.intersectPlane(threeState.boardPlane, hit)) return null;
  return worldToGrid(hit.x, hit.z);
}

function initThreeRenderer(){
  if(threeState.ready || !threeStage) return;
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
  threeStage.appendChild(renderer.domElement);

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
  threeState.overlayRoot = threeOverlay;
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
  fitCanvas();

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
    if(!gs || gs.phase !== 'prepare' || paused) return;
    if(pointerMoved) return;
    const grid = getGridFromPointer(e);
    if(!grid) return;
    gridPlace(grid.c, grid.r);
  });

  renderer.domElement.addEventListener('contextmenu', e => {
    e.preventDefault();
    if(!gs || gs.phase !== 'prepare' || paused) return;
    if(pointerMoved) return;
    const grid = getGridFromPointer(e);
    if(!grid) return;
    gridRemove(grid.c, grid.r);
  });

  renderer.domElement.addEventListener('mousemove', e => {
    const grid = getGridFromPointer(e);
    if(!grid){
      hoverCol = hoverRow = -1;
      hoverMesh.visible = false;
      if(threeState.hoverRangeMesh) threeState.hoverRangeMesh.visible = false;
      if(threeState.hoverRangeGlow) threeState.hoverRangeGlow.visible = false;
      elTooltip.classList.add('hidden');
      return;
    }
    hoverCol = grid.c;
    hoverRow = grid.r;
    updateTooltip(e.clientX, e.clientY);
  });

  renderer.domElement.addEventListener('mouseleave', () => {
    hoverCol = hoverRow = -1;
    hoverMesh.visible = false;
    if(threeState.hoverRangeMesh) threeState.hoverRangeMesh.visible = false;
    if(threeState.hoverRangeGlow) threeState.hoverRangeGlow.visible = false;
    elTooltip.classList.add('hidden');
  });

  resizeThreeRenderer(canvas.width, canvas.height);
}

function resizeThreeRenderer(width, height){
  if(!threeState.ready) return;
  const w = Math.max(1, width|0);
  const h = Math.max(1, height|0);
  threeState.camera.aspect = w / h;
  threeState.camera.updateProjectionMatrix();
  threeState.renderer.setSize(w, h, false);
}

function renderThree(){
  if(!threeState.ready || !gs) return;
  const dt = Math.min(0.05, threeState.lastDt || 0.016);
  const activeUnits = new Set();
  clearThreeGroup(threeState.unitGroup);
  for(const u of gs.units){
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
  if(pCastle) updateCastleVisual(pCastle, gs.pHp, getPlayerHqMax(), dt);
  if(eCastle) updateCastleVisual(eCastle, gs.eHp, HQ_MAX, dt);
  syncThreeCastleHud(PLAYER, gs.pHp, getPlayerHqMax());
  syncThreeCastleHud(ENEMY, gs.eHp, HQ_MAX);
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

if(btn3dView) btn3dView.addEventListener('click', () => resetThreeCamera(false));
if(btnZoomIn) btnZoomIn.addEventListener('click', () => zoomThreeCamera(-1.0));
if(btnZoomOut) btnZoomOut.addEventListener('click', () => zoomThreeCamera(1.0));
initThreeRenderer();

/* ═══════ 工具 ═══════ */

function mkUnit(side, type, col, row, isBoss=false, extra={}) {
  if(!mkUnit._uidSeed) mkUnit._uidSeed = 1;
  const d = TYPES[type];
  let maxHp = d.maxHp;
  let atk = d.atk;
  let range = d.range;
  let movCD = d.movCD;
  let atkCD = d.atkCD;
  const bossProfile = isBoss ? currentBossProfile : null;

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

function getUnitFootprintByType(type){
  const shape = TYPES[type]?.shape;
  if(shape === 'boss' || shape === 'cannon') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

function getUnitOccupiedCells(unit, colOverride, rowOverride){
  const col = colOverride ?? unit.col;
  const row = rowOverride ?? unit.row;
  const fp = getUnitFootprintByType(unit.type);
  const cells = [];
  for(let dc = 0; dc < fp.w; dc++){
    for(let dr = 0; dr < fp.h; dr++){
      cells.push({ col: col - (fp.w - 1) + dc, row: row - (fp.h - 1) + dr });
    }
  }
  return cells;
}

function unitOccupiesCell(unit, col, row){
  return getUnitOccupiedCells(unit).some(p => p.col === col && p.row === row);
}

function canUnitOccupyAt(unitLike, col, row, units){
  const unit = unitLike;
  const cells = getUnitOccupiedCells(unit, col, row);
  for(const p of cells){
    if(p.col < 0 || p.col >= COLS || p.row < 0 || p.row >= ROWS) return false;
    for(const other of units){
      if(other === unit) continue;
      if(other.hp <= 0) continue;
      if(unitOccupiesCell(other, p.col, p.row)) return false;
    }
  }
  return true;
}

function getUnitCenterCell(unit){
  const fp = getUnitFootprintByType(unit.type);
  return {
    col: unit.col - (fp.w - 1) / 2,
    row: unit.row - (fp.h - 1) / 2,
  };
}

function getUnitCenterPixel(unit){
  const center = getUnitCenterCell(unit);
  return {
    x: center.col * TILE + TILE / 2,
    y: center.row * TILE + TILE / 2,
  };
}

function manhattanBetweenUnits(a, b){
  const ca = getUnitCenterCell(a);
  const cb = getUnitCenterCell(b);
  return Math.abs(cb.col - ca.col) + Math.abs(cb.row - ca.row);
}

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

function getNodeByRef(ref){
  return mapNodes.find(n => n.layer === ref.layer && n.index === ref.index) || null;
}

function getCurrentMapBossPool(){
  return currentMapIsHidden ? HIDDEN_BOSS_POOL : BOSS_POOLS[currentMapIndex - 1];
}

function getBossProfileForMap(mapIndex){
  return selectedBosses[mapIndex - 1] || null;
}

function getDisplayName(unit){
  return unit.displayName || TYPES[unit.type]?.name || unit.type;
}

function getDisplayLetter(unit){
  return unit.displayLetter || TYPES[unit.type]?.letter || '?';
}

function getRenderColor(unit){
  const base = unit.renderColor || TYPES[unit.type]?.color || '#fff';
  if(unit.oneTimeReinforcement){
    // 同色系提升亮度与饱和度，便于识别一次性增援
    return lightenHexColor(base, 0.22);
  }
  return base;
}

function lightenHexColor(hex, amount){
  if(typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  let h = hex.slice(1);
  if(h.length === 3){
    h = h.split('').map(ch => ch + ch).join('');
  }
  if(h.length !== 6) return hex;
  const n = parseInt(h, 16);
  if(Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = Math.max(0, Math.min(1, amount || 0));
  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);
  const toHex = v => v.toString(16).padStart(2, '0');
  return '#' + toHex(nr) + toHex(ng) + toHex(nb);
}

function pickBosses(){
  selectedBosses = BOSS_POOLS.map(pool => pool[Math.floor(Math.random() * pool.length)]);
}

function getMapProgressFloor(){
  const completedLayers = mapNodes.filter(n => n.completed).map(n => n.layer);
  if(!completedLayers.length) return 1;
  return Math.min(getCurrentMapLayerCount(), Math.max(...completedLayers) + 2);
}

function getCurrentMapLayerCount(){
  return currentMapIsHidden ? HIDDEN_MAP_LAYER_COUNT : MAIN_MAP_LAYER_COUNT;
}

function getCurrentMapName(){
  return currentMapIsHidden ? '隐藏地图' : '主线地图 ' + currentMapIndex;
}

function getGlobalStatMult(){
  const bonus = getRelicEffectValue('globalAllStatsMul');
  return 1 + bonus;
}

function getRelicStacks(key){
  return playerRelics[key] || 0;
}

function getRelicDef(key){
  return RELIC_DEFS[key] || null;
}

function getRelicDurationByClearedBattles(key){
  const def = getRelicDef(key);
  if(!def) return 0;
  return Math.max(0, Math.floor(def.durationByClearedBattles || 0));
}

function getTimedRelicRemaining(key){
  const map = playerBuffs.relicTimedRemaining || {};
  return Math.max(0, map[key] || 0);
}

function getActiveRelicStacks(key){
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

function getRelicEffectValue(effectType, unitType){
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

function getRelicSpeedBonusByGold(effectType){
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
      const bonus = Math.min(cap, Math.floor(playerGold / goldStep) * stepBonus);
      total += bonus * (perStack ? stacks : 1);
    }
  }
  return total;
}

function getReserveLimit(){
  return REINFORCEMENT_RESERVE_BASE_LIMIT + getRelicEffectValue('reserveCapFlat');
}

function getShopRelicFinalPrice(offer){
  const discount = Math.max(0, Math.floor(playerBuffs.nextRelicDiscount || 0));
  return Math.max(0, (offer?.price || 0) - discount);
}

function applyRelicOnGain(key){
  const def = getRelicDef(key);
  if(!def || !Array.isArray(def.effects)) return;

  const duration = getRelicDurationByClearedBattles(key);
  if(duration > 0){
    playerBuffs.relicTimedRemaining = playerBuffs.relicTimedRemaining || {};
    playerBuffs.relicTimedRemaining[key] = Math.max(playerBuffs.relicTimedRemaining[key] || 0, duration);
  }

  for(const effect of def.effects){
    if(effect.type === 'instantGold'){
      playerGold += Math.max(0, Math.round(effect.value || 0));
    } else if(effect.type === 'nextChestDropChanceBonus'){
      playerBuffs.nextChestDropBonus = (playerBuffs.nextChestDropBonus || 0) + (effect.value || 0);
    } else if(effect.type === 'nextRelicDiscount'){
      playerBuffs.nextRelicDiscount = (playerBuffs.nextRelicDiscount || 0) + (effect.value || 0);
    } else if(effect.type === 'instantDp'){
      if(gs && typeof gs.dp === 'number' && typeof gs.dpCap === 'number'){
        gs.dp = Math.min(gs.dpCap, gs.dp + Math.max(0, Math.round(effect.value || 0)));
      }
    } else if(effect.type === 'hqReviveOnce'){
      playerBuffs.hqReviveCharges = (playerBuffs.hqReviveCharges || 0) + Math.max(1, Math.round(effect.value || 1));
    }
  }
}

function consumeTimedRelicsOnClearedBattleNode(){
  const map = playerBuffs.relicTimedRemaining;
  if(!map) return;
  for(const key of Object.keys(map)){
    if(map[key] <= 0) continue;
    if(getRelicStacks(key) <= 0) continue;
    map[key] -= 1;
    if(map[key] <= 0){
      map[key] = 0;
      playerRelics[key] = Math.max(0, getRelicStacks(key) - 1);
      const name = getRelicDef(key)?.name || key;
      addLog('<span class="log-move">⌛ 时效结束：'+name+' 已失效</span>');
      showTip(name + ' 已失效');
    }
  }
}

function hasAllBaseRelics(){
  return BASE_RELIC_KEYS.every(k => getRelicStacks(k) > 0);
}

function hasCollectedAllRelicsExceptLuckyClover(){
  const keys = Object.keys(RELIC_DEFS).filter(k => k !== 'luckyClover');
  if(keys.length <= 0) return false;
  return keys.every(k => {
    const def = RELIC_DEFS[k];
    return def && getRelicStacks(k) >= def.maxStacks;
  });
}

function getTotalRelicStacks(){
  return Object.keys(RELIC_DEFS).reduce((sum, key) => sum + getRelicStacks(key), 0);
}

function getRelicPressureBonus(){
  // 藏品越多，敌方基础属性越高：每层 +0.4%，封顶 +14%
  return Math.min(0.14, getTotalRelicStacks() * 0.004);
}

function canGainRelic(key){
  const def = getRelicDef(key);
  if(!def) return false;
  return getRelicStacks(key) < def.maxStacks;
}

function grantRelic(key){
  if(!canGainRelic(key)) return false;
  playerRelics[key] = getRelicStacks(key) + 1;
  return true;
}

function getAvailableBaseRelics(){
  return BASE_RELIC_KEYS.filter(k => canGainRelic(k));
}

function getChestRelicPool(){
  // 宝箱从配置权重表中抽取所有「仍可获得」的藏品（不含胜利的象征）
  const pool = [];
  for(const key in CHEST_RELIC_WEIGHTS){
    if(canGainRelic(key)) pool.push(key);
  }
  return pool;
}

function computeBattleGoldDrop(){
  const goldBonus = getRelicEffectValue('battleGoldFlat');
  const gold = 3 + Math.floor(gs.dp / 4) + goldBonus;
  return Math.max(3, Math.min(8, gold));
}

function applyBattleGoldDrop(){
  if(pendingGoldFromBattle > 0) return;
  const gold = computeBattleGoldDrop();
  pendingGoldFromBattle = gold;
  playerGold += gold;
  showTip('获得金币 +' + gold);
  addLog('<span class="log-kill">💰 结算金币 +'+gold+'（根据剩余部署点）</span>');
}

function closeShopDecision(){
  shopState.pendingDecision = null;
  if(shopDOM.decisionOverlay) shopDOM.decisionOverlay.classList.add('hidden');
}

function startShopVisit(){
  shopState.currentOffer = null;
  shopState.diceUsed = false;
  shopState.healUsed = false;
  shopState.pendingDecision = null;
  shopDiceRolling = false;
  if(shopState.savedOffer && !canGainRelic(shopState.savedOffer.key)){
    shopState.savedOffer = null;
    shopState.savedOfferLocked = false;
  }
  const hasRetainedOffer = !!shopState.savedOffer && !!shopState.savedOfferLocked;
  if(!hasRetainedOffer){
    shopState.chestOpensLeft = 5;
    shopState.lastChestResultEmpty = false;
  }
  lastShopChestOpensLeft = shopState.chestOpensLeft;
  closeShopDecision();
}

function playTransientClass(el, className, duration){
  if(!el) return;
  el.classList.remove(className);
  // 触发重排，保证同一动画可重复播放
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), duration || 500);
}

function formatRelicOffer(offer){
  if(!offer) return '暂无藏品';
  const finalPrice = getShopRelicFinalPrice(offer);
  const discount = Math.max(0, (offer.price || 0) - finalPrice);
  const priceLine = discount > 0
    ? (offer.name + '（' + offer.price + '→' + finalPrice + '金币）')
    : (offer.name + '（' + finalPrice + '金币）');
  return priceLine + '\n' + offer.desc;
}

function openShopDecision(action){
  const offer = shopState.currentOffer;
  if(!offer || !shopDOM.decisionOverlay) return;
  shopState.pendingDecision = action;
  if(action === 'keep'){
    shopDOM.decisionTitle.textContent = '保留该藏品？';
    shopDOM.decisionText.textContent = '你将保留：' + offer.name + '。\n保留后，本轮与后续商店仅保留购买按钮，不能再丢弃，也不能开启新宝箱。\n如若仍有开启次数，将被直接清零。';
    shopDOM.decisionConfirm.textContent = '确认保留';
  } else {
    shopDOM.decisionTitle.textContent = '丢弃该藏品？';
    shopDOM.decisionText.textContent = '你将丢弃：' + offer.name + '。\n若开启次数尚未耗尽，你仍可以再次开启宝箱。\n本轮商店丢弃后，下次进入商店也有机会再次刷新到它。';
    shopDOM.decisionConfirm.textContent = '确认丢弃';
  }
  shopDOM.decisionOverlay.classList.remove('hidden');
}

function resolveShopDecision(){
  const offer = shopState.currentOffer;
  if(!offer || !shopState.pendingDecision){
    closeShopDecision();
    return;
  }
  if(shopState.pendingDecision === 'keep'){
    shopState.savedOffer = offer;
    shopState.savedOfferLocked = true;
    shopState.chestOpensLeft = 0;
    shopState.currentOffer = null;
    showTip('已保留该藏品，当前仅可购买');
  } else {
    shopState.currentOffer = null;
    const left = Math.max(0, shopState.chestOpensLeft || 0);
    showTip(left > 0 ? ('已丢弃，可继续开箱（剩余'+left+'次）') : '已丢弃，开箱次数已耗尽');
  }
  closeShopDecision();
  refreshShopUI();
}

function refreshShopUI(){
  if(shopDOM.gold) shopDOM.gold.textContent = String(playerGold);
  if(elGold) elGold.textContent = String(playerGold);
  if(globalGoldBadge) globalGoldBadge.textContent = '💎 ' + playerGold;

  let offer = shopState.currentOffer || shopState.savedOffer;
  if(offer && !canGainRelic(offer.key)){
    if(shopState.currentOffer && shopState.currentOffer.key === offer.key) shopState.currentOffer = null;
    if(shopState.savedOffer && shopState.savedOffer.key === offer.key) shopState.savedOffer = null;
    shopState.savedOfferLocked = false;
    offer = null;
  }
  const hasLockedSavedOffer = !shopState.currentOffer && !!shopState.savedOffer && !!shopState.savedOfferLocked;
  shopDOM.relicOffer.textContent = offer
    ? (hasLockedSavedOffer ? ('已保留\n' + formatRelicOffer(offer)) : formatRelicOffer(offer))
    : ('尚未开启（剩余开箱次数：' + Math.max(0, shopState.chestOpensLeft || 0) + '）');
  const canBuy = !!offer && playerGold >= getShopRelicFinalPrice(offer) && canGainRelic(offer.key);
  const canOpenChest = !offer && (shopState.chestOpensLeft || 0) > 0;
  if(shopDOM.chestProgress){
    const left = Math.max(0, Math.min(5, shopState.chestOpensLeft || 0));
    const prevLeft = typeof lastShopChestOpensLeft === 'number' ? lastShopChestOpensLeft : left;
    shopDOM.chestProgress.innerHTML = Array.from({ length: 5 }, (_, i) =>
      '<span class="shop-chest-dot ' +
      (i < left ? 'active ' : '') +
      (i >= left && i < prevLeft ? 'extinguish' : '') +
      '"></span>'
    ).join('');
    lastShopChestOpensLeft = left;
  }
  if(shopDOM.openChest){
    shopDOM.openChest.disabled = !canOpenChest;
    const openLabel = shopState.lastChestResultEmpty ? '再试一次' : '开启宝箱';
    shopDOM.openChest.textContent = canOpenChest
      ? (openLabel + '（' + shopState.chestOpensLeft + '/5）')
      : '次数已耗尽';
  }
  shopDOM.buyRelic.disabled = !canBuy;
  shopDOM.keepRelic.disabled = !shopState.currentOffer;
  shopDOM.discardRelic.disabled = !shopState.currentOffer;

  const healLost = Math.max(0, getPlayerHqMax() - gs.pHp);
  const canHeal = !shopState.healUsed && healLost > 0;
  shopDOM.healBtn.disabled = !canHeal;
  shopDOM.healInfo.textContent = healLost > 0 ? ('可回复生命：' + healLost) : '我方城堡生命已满';

  shopDOM.diceBtn.disabled = shopState.diceUsed || shopDiceRolling;
  if(!shopDOM.diceInfo.textContent){
    shopDOM.diceInfo.textContent = '尚未掷骰';
  }
}

function generateRelicOfferFromChest(extraDropChance=0){
  if(hasCollectedAllRelicsExceptLuckyClover()){
    return { ...RELIC_DEFS.luckyClover };
  }
  if(hasAllBaseRelics() && canGainRelic('victorySymbol')){
    const vsStacks = getRelicStacks('victorySymbol');
    if(vsStacks === 0 || Math.random() < 0.06){
      return { ...RELIC_DEFS.victorySymbol };
    }
  }
  const chestDropChance = Math.max(0, Math.min(0.95, 0.55 + extraDropChance));
  if(Math.random() > chestDropChance) return null;
  const pool = getChestRelicPool();
  if(pool.length <= 0) return null;
  // 按权重从可选藏品中抽取一个
  let totalW = 0;
  const weights = pool.map(k => {
    const w = CHEST_RELIC_WEIGHTS[k] || 1;
    totalW += w;
    return w;
  });
  let r = Math.random() * totalW;
  let key = pool[0];
  for(let i = 0; i < pool.length; i++){
    r -= weights[i];
    if(r <= 0){
      key = pool[i];
      break;
    }
  }
  const def = RELIC_DEFS[key];
  if(!def) return null;
  return { ...def };
}

function openShopChest(){
  if(shopState.currentOffer || shopState.savedOffer) return;
  if((shopState.chestOpensLeft || 0) <= 0){
    refreshShopUI();
    showTip('宝箱开启次数已耗尽');
    return;
  }
  shopState.chestOpensLeft -= 1;
  playTransientClass(shopDOM.relicCard, 'shop-card-chest-open', 520);
  const chestBoost = playerBuffs.nextChestDropBonus || 0;
  playerBuffs.nextChestDropBonus = 0;
  const offer = generateRelicOfferFromChest(chestBoost);
  if(!offer){
    shopState.currentOffer = null;
    shopState.lastChestResultEmpty = true;
    const left = Math.max(0, shopState.chestOpensLeft || 0);
    shopDOM.relicOffer.textContent = '宝箱空空如也\n剩余开启次数：' + left;
    playTransientClass(shopDOM.relicOffer, 'shop-offer-reveal', 360);
    showTip(left > 0 ? ('这次没有发现藏品（剩余'+left+'次）') : '这次没有发现藏品，次数已耗尽');
    refreshShopUI();
    return;
  }
  shopState.currentOffer = offer;
  shopState.lastChestResultEmpty = false;
  const left = Math.max(0, shopState.chestOpensLeft || 0);
  shopDOM.relicOffer.textContent = formatRelicOffer(offer) + '\n剩余开启次数：' + left;
  playTransientClass(shopDOM.relicOffer, 'shop-offer-reveal', 360);
  showTip('发现藏品：' + offer.name + '（剩余' + left + '次）');
  refreshShopUI();
}

function buyShopRelic(){
  const offer = shopState.currentOffer || shopState.savedOffer;
  if(!offer) return;
  const finalPrice = getShopRelicFinalPrice(offer);
  if(playerGold < finalPrice){
    showTip('金币不足');
    return;
  }
  if(!grantRelic(offer.key)){
    shopState.currentOffer = null;
    shopState.savedOffer = null;
    showTip('该藏品已完成收集，已自动刷新候选');
    refreshShopUI();
    return;
  }
  playerGold -= finalPrice;
  if((playerBuffs.nextRelicDiscount || 0) > 0){
    playerBuffs.nextRelicDiscount = 0;
  }
  applyRelicOnGain(offer.key);
  addLog('<span class="log-kill">🧰 购买藏品：'+offer.name+'</span>');
  showTip('购买成功：' + offer.name);
  shopState.currentOffer = null;
  shopState.savedOffer = null;
  shopState.savedOfferLocked = false;
  shopState.lastChestResultEmpty = false;
  const left = Math.max(0, shopState.chestOpensLeft || 0);
  if(left > 0) shopDOM.relicOffer.textContent = '可继续开箱（剩余开启次数：' + left + '）';
  refreshShopUI();
}

function keepShopRelic(){
  if(!shopState.currentOffer) return;
  openShopDecision('keep');
}

function discardShopRelic(){
  if(!shopState.currentOffer) return;
  openShopDecision('discard');
}

function triggerShopHeal(){
  if(shopState.healUsed) return;
  const pMax = getPlayerHqMax();
  const healLost = Math.max(0, pMax - gs.pHp);
  if(healLost <= 0){
    showTip('城堡生命已满');
    return;
  }
  gs.pHp = pMax;
  shopState.healUsed = true;
  showTip('城堡生命已回复到上限');
  addLog('<span class="log-move">🔥 篝火生效：城堡生命恢复</span>');
  refreshShopUI();
}

function applyShopDiceReward(){
  if(shopState.diceUsed || shopDiceRolling) return;
  shopDiceRolling = true;
  shopDOM.diceInfo.textContent = '骰子滚动中...';
  playTransientClass(shopDOM.diceCard, 'shop-card-dice-roll', 620);

  setTimeout(() => {
  const roll = Math.random();
  const rewardBonus = getRelicEffectValue('diceRewardChanceBonus');
  const rewardRate = Math.max(0.1, Math.min(0.9, 0.5 + rewardBonus));
  const rewardSplit = rewardRate / 2;
  let isReward = false;
  if(roll < rewardSplit){
    const types = ['infantry', 'archer', 'tank', 'cavalry'];
    const t = types[Math.floor(Math.random() * types.length)];
    playerBuffs.bonusUnitsQueue = playerBuffs.bonusUnitsQueue || [];
    playerBuffs.bonusUnitsQueue.push(t);
    shopDOM.diceInfo.textContent = '奖励：下场获得特殊援军（' + TYPES[t].name + '）';
    showTip('骰子奖励：下场援军 ' + TYPES[t].name);
    isReward = true;
  } else if(roll < rewardRate){
    const add = 2 + Math.floor(Math.random() * 3);
    playerGold += add;
    shopDOM.diceInfo.textContent = '奖励：金币 +' + add;
    showTip('骰子奖励：金币 +' + add);
    isReward = true;
  } else if(roll < 0.75){
    const lose = 2 + Math.floor(Math.random() * 2);
    playerGold = Math.max(0, playerGold - lose);
    shopDOM.diceInfo.textContent = '惩罚：金币 -' + lose;
    showTip('骰子惩罚：金币 -' + lose);
  } else {
    const loss = 1 + Math.floor(Math.random() * 2);
    playerBuffs.nextBattleDpPenalty = (playerBuffs.nextBattleDpPenalty || 0) + loss;
    shopDOM.diceInfo.textContent = '惩罚：下场准备点数 -' + loss;
    showTip('骰子惩罚：准备点数 -' + loss);
  }
  playTransientClass(shopDOM.diceCard, isReward ? 'shop-card-reward-hit' : 'shop-card-punish-hit', 650);
  playTransientClass(shopDOM.diceInfo, 'shop-offer-reveal', 360);
  shopState.diceUsed = true;
  shopDiceRolling = false;
  refreshShopUI();
  }, 620);
}

function showShopScreen(){
  uiRoot.classList.add('hidden');
  mapScreen.classList.add('hidden');
  eventScreen.classList.add('hidden');
  rewardScreen.classList.add('hidden');
  shopScreen.classList.remove('hidden');
  shopDOM.diceInfo.textContent = '';
  startShopVisit();
  if(shopState.savedOffer){
    shopDOM.relicOffer.textContent = formatRelicOffer(shopState.savedOffer);
  }
  refreshShopUI();
}

function leaveShopScreen(){
  shopScreen.classList.add('hidden');
  showMapScreen();
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

function shouldEnterHiddenMap(){
  return !currentMapIsHidden && (currentMapIndex === 3 || currentMapIndex === 4) && Math.random() < HIDDEN_MAP_CHANCE;
}

function findSpawnTile(side, preferCol, preferRow){
  const units = gs?.units || [];
  const colRange = [];
  if(side === ENEMY){
    for(let i = 0; i < DEPLOY_COLS; i++) colRange.push(FIELD_RIGHT - i);
  } else {
    for(let i = 0; i < DEPLOY_COLS; i++) colRange.push(FIELD_LEFT + i);
  }
  const rowOffsets = [0, -1, 1, -2, 2, -3, 3];
  for(const col of colRange){
    if(col < FIELD_LEFT || col > FIELD_RIGHT) continue;
    for(const offset of rowOffsets){
      const row = Math.max(0, Math.min(ROWS - 1, preferRow + offset));
      const probe = { type: 'infantry', col, row };
      if(canUnitOccupyAt(probe, col, row, units)){
        return { col, row };
      }
    }
  }
  return null;
}

function spawnBossAdd(type, side, preferCol, preferRow){
  const tile = findSpawnTile(side, preferCol, preferRow);
  if(!tile) return false;
  gs.units.push(mkUnit(side, type, tile.col, tile.row));
  return true;
}

function applyBossOnHit(attacker, target, units){
  const mechanics = attacker.bossMechanics;
  if(!mechanics) return;

  if(mechanics.lifestealPercent){
    const heal = Math.max(1, Math.round(attacker.atk * mechanics.lifestealPercent));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    addLog('<span class="log-move">🩸 '+getDisplayName(attacker)+' 吸收了 '+heal+' 点生命</span>');
  }

  if(mechanics.splashDamage){
    for(const other of units){
      if(other === target || other.side === attacker.side || other.hp <= 0) continue;
      const dist = Math.abs(other.col - target.col) + Math.abs(other.row - target.row);
      if(dist !== 1) continue;
      other.hp -= mechanics.splashDamage;
      other.hurt = .15;
      spawnDamageNum(other.col*TILE+TILE/2, other.row*TILE+TILE/4, mechanics.splashDamage, '#f6c');
      addLog('<span class="log-atk">✹ '+getDisplayName(attacker)+' 溅射 '+getDisplayName(other)+' -'+mechanics.splashDamage+'</span>');
    }
  }

  if(mechanics.slowOnHit){
    target.slowTimer = Math.max(target.slowTimer || 0, 3);
    target.slowFactor = Math.max(target.slowFactor || 0, mechanics.slowOnHit);
    addLog('<span class="log-move">❄ '+getDisplayName(target)+' 被减速</span>');
  }
}

function updateBossState(unit){
  const mechanics = unit.bossMechanics;
  if(!mechanics) return;
  if(!unit.enraged && mechanics.enrageThreshold && unit.hp <= unit.maxHp * mechanics.enrageThreshold){
    unit.enraged = true;
    unit.atk += mechanics.enrageAtkBonus || 0;
    if(mechanics.enrageSpeedMult){
      unit.movCD /= mechanics.enrageSpeedMult;
      unit.atkCD /= mechanics.enrageSpeedMult;
    }
    showTip(getDisplayName(unit)+' 进入狂暴状态');
    addLog('<span class="log-kill">🔥 '+getDisplayName(unit)+' 狂暴了！</span>');
  }
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
const LOG_LIMIT_PER_SECTION = 28;
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

function mkState(pHp,eHp,round){
  const baseDP = Math.min(DP_MAX, DP_START + ((round || 1) - 1) * DP_PER_ROUND);
  const dpPenalty = currentEncounterModifiers.dpPenalty || 0;
  const relicDpBonus = getRelicEffectValue('dpCapFlat');
  const dpCap = Math.max(0, baseDP + (playerBuffs.dpBonus || 0) + relicDpBonus - dpPenalty);
  // 倒计时随回合增加
  let prepTime = PREP_TIME_BASE;
  if(currentNodeType === 'boss'){
    prepTime = PREP_TIME_BOSS; // Boss战3分钟
  } else {
    prepTime = Math.min(PREP_TIME_MAX, PREP_TIME_BASE + Math.floor((round - 1) / 2) * PREP_TIME_INCREASE);
  }
  return { phase:'prepare', countdown:prepTime, maxCountdown:prepTime,
    pHp:pHp, eHp:eHp, dp:dpCap, dpCap,
    units:[], winner:null, round:round||1,
    pFlash:0, eFlash:0 };
}

function newGame(){
  playerBuffs = {};
  closeBattleResultPopup();
  resetThreeCamera(true);
  resetThreeCastleState();
  clearThreeOverlay();
  if(threeState.ready) threeState.fx.length = 0;
  gs=mkState(getPlayerHqMax(),HQ_MAX,1);
  particles=[]; paused=false; speed=1; clearLog();
  reinforcementStock = [];
  selectedReserveIndex = -1;
  lastReserveRenderKey = '';
  lastShopChestOpensLeft = null;
  playerGold = 0;
  pendingGoldFromBattle = 0;
  playerRelics = createEmptyRelicState();
  shopState = { currentOffer:null, savedOffer:null, savedOfferLocked:false, chestOpensLeft:5, lastChestResultEmpty:false, diceUsed:false, healUsed:false, pendingDecision:null };
  shopDiceRolling = false;
  stageLevel = 0;
  currentMapIndex = 1;
  currentMapLayer = 1;
  currentNodeType = 'battle';
  currentBossProfile = null;
  currentMapBossProfile = null;
  currentMapIsHidden = false;
  pendingMainMapIndex = null;
  pendingRewardAction = 'show-map';
  currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };
  pendingStarterBlessing = true;
  routeLockedFromIndex = -1;
  pickBosses();
  generateMap();
  showLoading(()=>{
    if(pendingStarterBlessing) showStarterBlessingScreen();
    else showMapScreen();
  });
}
function nextRound(){
  closeBattleResultPopup();
  if(currentMapIsHidden && gs.pHp<=0){
    advanceAfterHiddenMap(false);
    return;
  }

  // 只有攻破当前关城堡后才进入奖励和选路
  if(gs.eHp<=0 && !(currentNodeType==='boss' && !currentMapIsHidden && currentMapIndex===MAP_COUNT)) {
    if(currentNodeType === 'battle' || currentNodeType === 'elite'){
      consumeTimedRelicsOnClearedBattleNode();
    }
    applyBattleGoldDrop();
    pendingRewardAction = currentNodeType === 'boss' ? 'advance-map' : 'show-map';
    showRewardScreen();
  } else if(gs.eHp>0 && gs.pHp>0){
    // 本关未攻破，继续攻城（不推进关卡）。
    // 注意：此处故意不重置 currentEncounterModifiers，
    // 保证「先声夺势」等本节点增益在重试中持续生效，且不再额外消耗层数。
    const p=gs.pHp,e=gs.eHp,r=gs.round;
    gs=mkState(p,e,r); particles=[]; paused=false; speed=1; clearLog();
    if(currentEncounterModifiers.enemyHalf){
      showTip('攻城继续 · 开局祝福持续生效，敌方援军仍为半血');
    }
    showBanner(()=>enterPrep());
  } else {
    // Boss关会在结算中直接结束
  }
}

function proceedToNextRound(){
  // 从地图选择的节点进入相应界面
  const currentNode = mapNodes[currentNodeIndex];
  if(currentNode){
    currentNode.completed = true;
    routeLockedFromIndex = currentNodeIndex;
    eliteMultiplier = 1; // 重置精英倍数
    currentNodeType = currentNode.type;
    currentMapLayer = currentNode.floor;
    currentBossProfile = currentNode.type === 'boss' ? currentNode.bossProfile : null;
    currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };

    if((playerBuffs.nextBattleDpPenalty || 0) > 0){
      currentEncounterModifiers.dpPenalty = playerBuffs.nextBattleDpPenalty;
      addLog('<span class="log-move">🎲 骰子惩罚：本场准备点数 -'+playerBuffs.nextBattleDpPenalty+'</span>');
      playerBuffs.nextBattleDpPenalty = 0;
    }

    // 开局增益「先声夺势」：每进入一个新节点消耗一次层数，
    // 同一节点内的重试攻城不额外消耗（由 nextRound 重试分支保证）。
    if(currentNode.type !== 'boss' && (playerBuffs.enemyHalfBattlesRemaining || 0) > 0){
      currentEncounterModifiers.enemyHalf = true;
      currentEncounterModifiers.enemyHpMul = playerBuffs.enemyHalfHpMul || 0.5;
      playerBuffs.enemyHalfBattlesRemaining -= 1;
      const left = playerBuffs.enemyHalfBattlesRemaining;
      showTip('开局祝福生效：本场敌军生命减半' + (left > 0 ? '（剩余 ' + left + ' 次）' : '（最后一次）'));
    }
    
    if(currentNode.type === 'elite'){
      eliteMultiplier = 1.3; // 精英战增加30%难度
      showTip('精英战斗！敌人更强！');
    }
  }

  stageLevel += 1;
  const p=getPlayerHqMax(),e=HQ_MAX,r=stageLevel;
  gs=mkState(p,e,r); particles=[]; paused=false; speed=1; clearLog();
  resetThreeCastleState();
  
  showBanner(()=>enterPrep());
}
function enterPrep(){
  uiRoot.classList.remove('hidden');
  roundBanner.classList.add('hidden');
  gs.phase='prepare';
  spawnAI();
  ensureUltimateCannonInPrep();
  applyRandomUnitRewardInPrep();
  updateRelicSpeedBonusesForNextBattle();
  btnStart.classList.remove('hidden');
  btnPause.classList.remove('hidden'); btnPause.innerHTML='<kbd>P</kbd> 暂停';
  btnSpeed.classList.add('hidden');
  btnNext.classList.add('hidden'); btnAgain.classList.add('hidden'); btnBack.classList.add('hidden');
  updateUI(); fitCanvas();
}

function ensureUltimateCannonInPrep(){
  if(!gs) return;
  if(!playerBuffs.ultimateCannon) return;
  if(gs.units.some(u => u.side === PLAYER && u.type === 'ultimateCannon' && u.hp > 0)) return;

  // 放置在我方 HQ 地块（最左2列）上，2×2 锚点放在第 2 列（col=1）
  const col = 1;
  const row = Math.max(1, Math.min(ROWS - 1, Math.floor(ROWS / 2)));
  const probe = { type: 'ultimateCannon', col, row, hp: 1 };
  if(!canUnitOccupyAt(probe, col, row, gs.units)) return;
  gs.units.push(mkUnit(PLAYER, 'ultimateCannon', col, row, false, { linkedToHq:true }));
}

function triggerUltimateCannonStrike(){
  if(!gs) return;
  if(!playerBuffs.ultimateCannon) return;
  // 需要场上存在终极火炮（可被击破）
  const cannon = gs.units.find(u => u.side === PLAYER && u.type === 'ultimateCannon' && u.hp > 0);
  if(!cannon) return;

  const percent = 0.20;
  let hitCount = 0;
  for(const e of gs.units){
    if(e.side !== ENEMY) continue;
    if(e.hp <= 0) continue;
    const dmg = Math.max(1, Math.round(e.maxHp * percent));
    e.hp -= dmg;
    const p = getUnitCenterPixel(e);
    spawnDamageNum(p.x, p.y - TILE/4, dmg, '#ffda72');
    hitCount++;
    if(e.hp <= 0){
      spawnDeath(e.col, e.row, getRenderColor(e));
      addLog('<span class="log-kill">💥 终极火炮轰击：敌方'+getDisplayName(e)+' 被炸毁！</span>');
    }
  }
  addLog('<span class="log-kill">🌈 终极火炮开火！敌军全体受到其生命上限 20% 的伤害（命中 '+hitCount+' 个目标）</span>');
}

function showLoading(cb){
  titleScreen.classList.add('hidden'); loadingScreen.classList.remove('hidden');
  setTimeout(()=>{loadingScreen.classList.add('hidden');cb();},1200);
}
function showBanner(cb){
  uiRoot.classList.add('hidden'); roundBanner.classList.remove('hidden');
  const nodeInfo = NODE_TYPES[currentNodeType] || { name: '战斗' };
  const nodeName = currentNodeType === 'boss' && currentBossProfile ? currentBossProfile.name : nodeInfo.name;
  const prefix = currentMapIsHidden ? '隐藏图' : '第 '+currentMapIndex+' 张图';
  roundNumText.textContent = prefix+' · 第 '+currentMapLayer+'/'+getCurrentMapLayerCount()+' 层 · '+nodeName+' · 第 '+gs.round+' 战';
  setTimeout(()=>{roundBanner.classList.add('hidden');cb();},1800);
}
function backToTitle(){
  playerBuffs = {};
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
  gs=mkState(getPlayerHqMax(),HQ_MAX,1); gs.phase='title'; particles=[]; paused=false;
  reinforcementStock = [];
  selectedReserveIndex = -1;
  lastReserveRenderKey = '';
  lastShopChestOpensLeft = null;
  // 重置游戏数据
  mapNodes = [];
  currentNodeIndex = -1;
  eliteMultiplier = 1;
  currentNodeType = 'battle';
  stageLevel = 1;
  currentMapIndex = 1;
  currentMapLayer = 1;
  currentBossProfile = null;
  currentMapBossProfile = null;
  routeLockedFromIndex = -1;
  selectedBosses = [];
  currentMapIsHidden = false;
  pendingMainMapIndex = null;
  pendingStarterBlessing = false;
  pendingRewardAction = 'show-map';
  currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };
  playerGold = 0;
  pendingGoldFromBattle = 0;
  playerRelics = createEmptyRelicState();
  shopState = { currentOffer:null, savedOffer:null, savedOfferLocked:false, chestOpensLeft:5, lastChestResultEmpty:false, diceUsed:false, healUsed:false, pendingDecision:null };
  shopDiceRolling = false;
  closeShopDecision();
}

function showVictoryScreen(){
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

  const diff = DIFFICULTY_LEVELS[gameDifficulty - 1];
  const diffName = diff ? (diff.level + ' · ' + diff.name) : String(gameDifficulty);
  const relicCount = (playerRelics && Array.isArray(playerRelics.list)) ? playerRelics.list.length : (playerRelics?.owned?.length || 0);
  const lines = [
    '难度：' + diffName,
    '通关主线：' + MAP_COUNT + '/' + MAP_COUNT,
    '金币：' + playerGold,
    '获得藏品：' + (Number.isFinite(relicCount) ? relicCount : '—'),
    '终极火炮：' + (playerBuffs.ultimateCannon ? '已获得' : '未获得'),
  ];
  if(victoryStats) victoryStats.innerHTML = lines.map(x => '<div>• ' + x + '</div>').join('');
}

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
const MAP_W = 380;
const MAP_LAYER_GAP = 110;
const MAP_PAD = 60;

function generateMap(){
  mapNodes = [];
  currentNodeIndex = -1;
  routeLockedFromIndex = -1;
  currentMapBossProfile = currentMapIsHidden
    ? { ...getCurrentMapBossPool()[Math.floor(Math.random() * getCurrentMapBossPool().length)] }
    : getBossProfileForMap(currentMapIndex);

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
    const bossProfile = isBossLayer ? currentMapBossProfile : null;

    for(let i = 0; i < cnt; i++){
      let nodeType;
      if(isBossLayer) nodeType = 'boss';
      else if(layer === 0) nodeType = 'battle';
      else {
        const r = Math.random();
        if(currentMapIsHidden){
          nodeType = r < 0.35 ? 'battle' : r < 0.7 ? 'elite' : r < 0.85 ? 'event' : 'rest';
        } else {
          nodeType = r < 0.45 ? 'battle' : r < 0.65 ? 'event' : r < 0.82 ? 'elite' : 'rest';
        }
      }

      const seg = MAP_W / cnt;
      const xBase = seg * (i + 0.5) + 10;
      const xOff = (Math.random() - 0.5) * seg * 0.3;

      mapNodes.push({
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
    const cur = mapNodes.filter(n => n.layer === layer);
    const nxt = mapNodes.filter(n => n.layer === layer + 1);

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

function isNodeAccessible(node){
  if(node.completed) return false;
  if(routeLockedFromIndex < 0) return node.layer === 0;
  const routeNode = mapNodes[routeLockedFromIndex];
  if(!routeNode) return node.layer === 0;
  return routeNode.connections.some(c => c.layer === node.layer && c.index === node.index);
}

function onMapNodeClick(idx, node){
  currentNodeIndex = idx;
  if(node.type === 'event'){
    node.completed = true;
    routeLockedFromIndex = idx;
    currentMapLayer = node.floor;
    mapScreen.classList.add('hidden');
    showEventScreen();
  } else if(node.type === 'rest'){
    node.completed = true;
    routeLockedFromIndex = idx;
    currentMapLayer = node.floor;
    showShopScreen();
  } else {
    mapScreen.classList.add('hidden');
    proceedToNextRound();
  }
}

function drawMap(){
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

  for(const node of mapNodes){
    for(const conn of node.connections){
      const tgt = mapNodes.find(n => n.layer === conn.layer && n.index === conn.index);
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
  for(let i = 0; i < mapNodes.length; i++){
    const node = mapNodes[i];
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

function showMapScreen(){
  uiRoot.classList.add('hidden');
  rewardScreen.classList.add('hidden');
  shopScreen.classList.add('hidden');
  mapScreen.classList.remove('hidden');
  if(mapTitle) mapTitle.textContent = (currentMapIsHidden ? '🕳 ' : '🗺 ') + getCurrentMapName() + ' · 选择你的路线';
  drawMap();
  $('map-progress-text').textContent = currentMapIsHidden
    ? '隐藏图 · 第 ' + getMapProgressFloor() + '/' + getCurrentMapLayerCount() + ' 层'
    : '主线 ' + currentMapIndex + '/' + MAP_COUNT + ' · 第 ' + getMapProgressFloor() + '/' + getCurrentMapLayerCount() + ' 层';

  // 自动滚动到当前可访问层
  if(mapScrollWrapper){
    const accessibleNode = mapNodes.find(n => isNodeAccessible(n));
    if(accessibleNode){
      const scrollTarget = accessibleNode.y - mapScrollWrapper.clientHeight / 2;
      setTimeout(() => { mapScrollWrapper.scrollTop = Math.max(0, scrollTarget); }, 50);
    } else {
      setTimeout(() => { mapScrollWrapper.scrollTop = mapScrollWrapper.scrollHeight; }, 50);
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   奖励选择系统
   ═══════════════════════════════════════════════════════════ */
function renderRewardSelection(options, title, hint, onPick){
  uiRoot.classList.add('hidden');
  rewardScreen.classList.remove('hidden');
  if(rewardTitle) rewardTitle.textContent = title;
  if(rewardHint) rewardHint.textContent = hint;

  const rewardContainer = $('reward-options');
  rewardContainer.innerHTML = '';

  options.forEach(buff => {
    const card = document.createElement('div');
    const extraCls = buff.rarity === 'mythic' ? ' reward-card-mythic' : '';
    card.className = `reward-card ${buff.rarity}${extraCls}`;
    card.innerHTML = `
      <div class="reward-rarity">${String(buff.rarity || '').toUpperCase()}</div>
      <div class="reward-icon">${buff.icon}</div>
      <div class="reward-name ${buff.rarity === 'mythic' ? 'mythic-flame' : ''}">${buff.name}</div>
      <div class="reward-desc">${buff.displayDesc || buff.desc}</div>
    `;
    card.addEventListener('click', () => onPick(buff));
    rewardContainer.appendChild(card);
  });
}

function advanceToNextMainMap(){
  currentMapIndex += 1;
  currentMapLayer = 1;
  currentMapIsHidden = false;
  pendingMainMapIndex = null;
  currentBossProfile = null;
  currentMapBossProfile = null;
  currentEncounterModifiers = { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 };
  generateMap();
  showMapScreen();
}

function maybeEnterHiddenMapOrAdvance(){
  if(shouldEnterHiddenMap()){
    // 保存进入隐藏地图前的炮塔数量
    towerCountBeforeHiddenMap = getTowerCount();
    
    pendingMainMapIndex = currentMapIndex + 1;
    currentMapIsHidden = true;
    currentMapLayer = 1;
    currentBossProfile = null;
    currentEncounterModifiers = { enemyHalf: false, dpPenalty: 0 };
    generateMap();
    showTip('发现隐藏地图，挑战失败也不会终局');
    showMapScreen();
    return;
  }
  advanceToNextMainMap();
}

function advanceAfterHiddenMap(cleared){
  const targetMap = pendingMainMapIndex || Math.min(MAP_COUNT, currentMapIndex + 1);
  currentMapIsHidden = false;
  currentMapIndex = targetMap;
  currentMapLayer = 1;
  currentBossProfile = null;
  currentMapBossProfile = null;
  currentEncounterModifiers = { enemyHalf: false, dpPenalty: 0 };
  pendingMainMapIndex = null;
  generateMap();
  showTip(cleared ? '隐藏地图征服成功，返回主线' : '隐藏地图挑战失败，返回主线');
  showMapScreen();
}

function resolvePostReward(){
  rewardScreen.classList.add('hidden');
  pendingGoldFromBattle = 0;
  if(pendingRewardAction === 'advance-map'){
    if(currentMapIsHidden) advanceAfterHiddenMap(true);
    else maybeEnterHiddenMapOrAdvance();
  } else {
    showMapScreen();
  }
}

function showRewardScreen(){
  const buffKeys = Object.keys(BUFF_TEMPLATES).filter(k => {
    const b = BUFF_TEMPLATES[k];
    if(!b) return false;
    // 终极火炮只通过“极稀有注入”出现，不进入常规随机池
    if(k === 'ultimateCannon') return false;
    if(b.unique && k === 'ultimateCannon' && playerBuffs.ultimateCannon) return false;
    return true;
  });
  const selectedBuffs = [];
  while(selectedBuffs.length < 3){
    const key = buffKeys[Math.floor(Math.random() * buffKeys.length)];
    if(!selectedBuffs.includes(key)) selectedBuffs.push(key);
  }

  // 极稀有掉落：终极火炮（从第3层起才有概率出现）
  if(!playerBuffs.ultimateCannon && currentMapLayer >= 3){
    const chance = 0.012; // 1.2% / 次奖励
    if(Math.random() < chance){
      const replaceIndex = Math.floor(Math.random() * selectedBuffs.length);
      selectedBuffs[replaceIndex] = 'ultimateCannon';
    }
  }

  renderRewardSelection(
    selectedBuffs.map(key => ({ key, ...BUFF_TEMPLATES[key] })),
    '🎁 选择你的奖励',
    '选择一项增益来强化你的军队',
    reward => selectReward(reward.key)
  );
}

function showStarterBlessingScreen(){
  const easyMode = gameDifficulty <= 3;
  const starterOptions = STARTER_BLESSINGS.map(blessing => ({
    ...blessing,
    displayDesc: easyMode && blessing.easyDesc ? blessing.easyDesc : blessing.desc,
  }));
  renderRewardSelection(
    starterOptions,
    '✨ 选择开局增益',
    easyMode ? '低难度会获得更强的增益选择，放心挑一个开局更舒服的' : '首战前选择一个起始祝福',
    blessing => {
      blessing.apply(playerBuffs, gameDifficulty);
      pendingStarterBlessing = false;
      showTip('获得开局增益：' + blessing.name);
      addLog('<span class="log-kill">✨ 开局增益：'+blessing.name+'</span>');
      rewardScreen.classList.add('hidden');
      showMapScreen();
    }
  );
}

function selectReward(buffKey){
  const buff = BUFF_TEMPLATES[buffKey];
  if(buff){
    buff.apply(playerBuffs);
    showTip(`获得：${buff.name}`);
    addLog(`<span class="log-kill">🎁 获得奖励：${buff.name}</span>`);
  }

  resolvePostReward();
}

/* ═══════════════════════════════════════════════════════════
   事件系统
   ═══════════════════════════════════════════════════════════ */
const EVENTS = [
  {
    title: '神秘商人',
    desc: '一个神秘的商人出现在你面前，他似乎有些特别的东西要出售...',
    choices: [
      { text: '购买强化药剂（2金币，获得攻击+1）', effect: () => {
        if(playerGold < 2){
          showTip('金币不足，无法购买强化药剂');
          return;
        }
        playerGold -= 2;
        playerBuffs.atk = (playerBuffs.atk || 0) + 1;
        showTip('购买成功：攻击力 +1');
      } },
      { text: '购买生命药水（2金币，获得生命+3）', effect: () => {
        if(playerGold < 2){
          showTip('金币不足，无法购买生命药水');
          return;
        }
        playerGold -= 2;
        playerBuffs.hp = (playerBuffs.hp || 0) + 3;
        showTip('购买成功：生命上限 +3');
      } },
      { text: '离开', effect: () => {} },
    ]
  },
  {
    title: '古老祭坛',
    desc: '你发现了一座古老的祭坛，散发着神秘的力量。你可以献祭城堡稳固度，换取更强大的军势。',
    choices: [
      { text: '献祭（总部上限-20%，攻击+3）', effect: () => {
        const beforeMax = getPlayerHqMax();
        playerBuffs.hqMaxMul = (playerBuffs.hqMaxMul || 1) * 0.8;
        const afterMax = getPlayerHqMax();
        playerBuffs.atk = (playerBuffs.atk || 0) + 3;
        gs.pHp = Math.min(gs.pHp, afterMax);
        const reduced = Math.max(0, beforeMax - afterMax);
        return {
          popup: true,
          title: '☠ 祭坛献祭',
          message: '你以总部坚固度换取了军势强化。\n本次结果：\n- 我方总部生命上限 -20%（-' + reduced + '，' + beforeMax + '→' + afterMax + '）\n- 全体攻击力 +3'
        };
      } },
      { text: '谨慎离开（生命+1）', effect: () => { playerBuffs.hp = (playerBuffs.hp || 0) + 1; } },
    ]
  },
  {
    title: '训练场',
    desc: '你遇到了一个训练场，可以在这里提升你的军队。',
    choices: [
      { text: '训练攻击（攻击+0.5）', effect: () => { playerBuffs.atk = (playerBuffs.atk || 0) + 0.5; } },
      { text: '训练防御（生命+2）', effect: () => { playerBuffs.hp = (playerBuffs.hp || 0) + 2; } },
      { text: '训练速度（速度+6%）', effect: () => { playerBuffs.speed = (playerBuffs.speed || 0) + 0.06; } },
    ]
  },
  {
    title: '幸运泉水',
    desc: '你发现了一口闪闪发光的泉水，喝下去会发生什么呢？',
    choices: [
      { text: '喝下泉水（随机效果）', effect: () => {
        const rand = Math.random();
        if(rand < 0.45) {
          playerBuffs.atk = (playerBuffs.atk || 0) + 1;
          playerBuffs.hp = (playerBuffs.hp || 0) + 2;
          showTip('泉水效果极佳！');
          return {
            popup: true,
            title: '✨ 泉水祝福',
            message: '你感到力量与生命力涌现！\n获得增益：\n- 全体攻击力 +1\n- 全体生命上限 +2'
          };
        } else {
          playerBuffs.hp = (playerBuffs.hp || 0) - 8;
          playerGold = Math.max(0, playerGold - 2);
          showTip('泉水似乎有副作用...');
          return {
            popup: true,
            title: '⚠ 泉水副作用',
            message: '泉水混入了杂质，身体感到沉重。\n本次结果：\n- 全体生命上限 -8\n- 金币 -2'
          };
        }
      }},
      { text: '不碰泉水', effect: () => {} },
    ]
  },
];

function showEventResultPopup(title, message){
  if(!eventResultOverlay) return;
  if(eventResultTitle) eventResultTitle.textContent = title || '事件结果';
  if(eventResultText) eventResultText.textContent = message || '本次事件没有额外效果。';
  eventResultOverlay.classList.remove('hidden');
}

function showBattleResultPopup(title, message){
  if(!battleResultOverlay) return;
  if(battleResultTitle) battleResultTitle.textContent = title || '战斗结果';
  if(battleResultText) battleResultText.textContent = message || '';
  battleResultOverlay.classList.remove('hidden');
}

function closeBattleResultPopup(){
  if(!battleResultOverlay) return;
  battleResultOverlay.classList.add('hidden');
}

function closeEventResultPopup(){
  if(!eventResultOverlay) return;
  eventResultOverlay.classList.add('hidden');
  showMapScreen();
}

function showEventScreen(){
  uiRoot.classList.add('hidden');
  eventScreen.classList.remove('hidden');
  
  // 随机选择一个事件
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  $('event-title').textContent = event.title;
  $('event-description').textContent = event.desc;
  
  const choicesContainer = $('event-choices');
  choicesContainer.innerHTML = '';
  
  event.choices.forEach(choice => {
    const choiceDiv = document.createElement('div');
    choiceDiv.className = 'event-choice';
    choiceDiv.innerHTML = `<div class="choice-title">${choice.text}</div>`;
    choiceDiv.addEventListener('click', () => {
      const outcome = choice.effect();
      eventScreen.classList.add('hidden');
      if(outcome && outcome.popup){
        showEventResultPopup(outcome.title, outcome.message);
      } else {
        showMapScreen();
      }
    });
    choicesContainer.appendChild(choiceDiv);
  });
}

/* ═══════  AI 布阵 ═══════ */
function getTowerCount(){
  if(gameDifficulty < 7) return 0;
  if(currentMapIsHidden) return towerCountBeforeHiddenMap;
  // 地图3: 1个, 地图4: 2个, 地图5: 3个
  if(currentMapIndex < 3) return 0;
  return Math.min(currentMapIndex - 2, 3);
}

function getTowerStats(){
  return getTowerStatsForDifficulty(gameDifficulty);
}

function getTowerStatsForDifficulty(difficulty){
  const isModeHard = (difficulty || 0) >= 10;
  return {
    range: isModeHard ? 6 : 5,
    atkCD: isModeHard ? 3.5 : 4.5,
  };
}

function spawnAI(){
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
        spawnBossAdd(add.type, ENEMY, bossCol, bossRow + i - 1);
      }
    }
    addLog('<span class="log-kill">⚠️ Boss "'+getDisplayName(boss)+'" 出现！</span>');
    if(currentBossProfile?.mechanics){
      addLog('<span class="log-move">机制：'+currentBossProfile.mechanics+'</span>');
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
      addLog('<span class="log-kill">⚠️ 敌方部署了 '+towerCount+' 架防御炮塔！</span>');
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
    updateBattle(dt);
  }
  if(gs.pFlash>0) gs.pFlash-=rawDt;
  if(gs.eFlash>0) gs.eFlash-=rawDt;
  tickParticles(rawDt); // 粒子始终更新（即使暂停也播完）
  syncThreeEffects(rawDt);
  updateUI();
}

/* ═══════ 战斗逻辑 ═══════ */
function updateBattle(dt){
  const us=gs.units;
  for(const u of us){
    if(u.flash>0)u.flash-=dt;
    if(u.hurt>0)u.hurt-=dt;
    if(u.slowTimer>0){
      u.slowTimer-=dt;
      if(u.slowTimer<=0){
        u.slowTimer=0;
        u.slowFactor=0;
      }
    }
    if(u.isBoss && u.bossMechanics?.summonType && u.summonCount < BOSS_SUMMON_LIMIT){
      u.summonTimer -= dt;
      if(u.summonTimer <= 0){
        const spawned = spawnBossAdd(u.bossMechanics.summonType, u.side, u.col, u.row);
        if(spawned){
          u.summonCount += 1;
          addLog('<span class="log-move">☠ '+getDisplayName(u)+' 召唤了'+TYPES[u.bossMechanics.summonType].name+'</span>');
        }
        u.summonTimer = u.bossMechanics.summonInterval;
      }
    }
    if(u.isBoss) updateBossState(u);
  }

  if(!us.some(u=>u.side===PLAYER&&u.hp>0)){endBattle(ENEMY);return;}
  if(!us.some(u=>u.side===ENEMY &&u.hp>0)){endBattle(PLAYER);return;}

  for(const u of us){
    if(u.hp<=0)continue;
    const d=TYPES[u.type]; if(!d)continue;
    u.movT+=dt; u.atkT+=dt;
    const moveCd = u.movCD * (1 + (u.slowTimer>0 ? u.slowFactor : 0));
    const atkCd = u.atkCD * (1 + (u.slowTimer>0 ? u.slowFactor : 0));

    let best=null,bDist=Infinity;
    for(const e of us){if(e.side===u.side||e.hp<=0)continue;
      const dist=manhattanBetweenUnits(u, e);
      if(dist<bDist){bDist=dist;best=e;}}
    if(!best)continue;

    if(bDist<=u.range){
      if(u.atkT>=atkCd){
        u.atkT=0; best.hp-=u.atk;
        u.flash=.15; best.hurt=.2;
        const from = getUnitCenterCell(u);
        const to = getUnitCenterCell(best);
        if(u.range>1) spawnProj(from.col, from.row, to.col, to.row, getRenderColor(u));
        const tp = getUnitCenterPixel(best);
        spawnDamageNum(tp.x, tp.y - TILE/4, u.atk, '#fa0');
        applyBossOnHit(u, best, us);

        if(best.hp<=0){
          if(best.side===PLAYER && best.type==='ultimateCannon' && best.linkedToHq){
            const linkDmg = Math.max(0, Math.round(best.maxHp));
            if(linkDmg > 0){
              gs.pHp = Math.max(0, gs.pHp - linkDmg);
              addLog('<span class="log-kill">⛓ 终极火炮被击破！我方总部同步损失 '+linkDmg+' 生命</span>');
              spawnDamageNum(TILE, ROWS/2*TILE-26, linkDmg, '#ff6f6f');
            }
          }
          spawnDeath(best.col,best.row,getRenderColor(best));
          addLog('<span class="log-kill">💀 '+(best.side===PLAYER?'我':'敌')+'方'+getDisplayName(best)+' 被击破！</span>');
        } else if(u.side===PLAYER && u.type==='archer'){
          const extraChance = getRelicEffectValue('archerExtraArrowChance', 'archer') + getRelicEffectValue('archerExtraArrowChance');
          if(extraChance > 0 && Math.random() < extraChance){
            best.hp -= u.atk;
            best.hurt = .2;
            const from2 = getUnitCenterCell(u);
            const to2 = getUnitCenterCell(best);
            spawnProj(from2.col, from2.row, to2.col, to2.row, getRenderColor(u));
            const tp2 = getUnitCenterPixel(best);
            spawnDamageNum(tp2.x, tp2.y - TILE/4, u.atk, '#9df');
            addLog('<span class="log-atk">🏹 连射触发！'+getDisplayName(u)+' 追加一箭 -'+formatDisplayNumber(u.atk)+'</span>');
            if(best.hp<=0){
              if(best.side===PLAYER && best.type==='ultimateCannon' && best.linkedToHq){
                const linkDmg = Math.max(0, Math.round(best.maxHp));
                if(linkDmg > 0){
                  gs.pHp = Math.max(0, gs.pHp - linkDmg);
                  addLog('<span class="log-kill">⛓ 终极火炮被击破！我方总部同步损失 '+linkDmg+' 生命</span>');
                  spawnDamageNum(TILE, ROWS/2*TILE-26, linkDmg, '#ff6f6f');
                }
              }
              spawnDeath(best.col,best.row,getRenderColor(best));
              addLog('<span class="log-kill">💀 '+(best.side===PLAYER?'我':'敌')+'方'+getDisplayName(best)+' 被击破！</span>');
            }
          }
        }
      }
    } else if(u.type !== 'cannon'){
      // 炮塔不会移动
      if(u.movT>=moveCd){
        u.movT=0;
        const dx = best.col - u.col;
        const dy = best.row - u.row;
        const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
        const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        const candidates = [];

        // 优先前进，其次绕后（侧移/斜切）
        candidates.push({c:u.col + stepX, r:u.row});
        if(stepY !== 0) candidates.push({c:u.col + stepX, r:u.row + stepY});
        candidates.push({c:u.col, r:u.row + 1});
        candidates.push({c:u.col, r:u.row - 1});
        if(stepY !== 0) candidates.push({c:u.col, r:u.row - stepY});

        let bestMove = null;
        let bestScore = Infinity;
        for(const m of candidates){
          const nc=Math.max(FIELD_LEFT,Math.min(FIELD_RIGHT,m.c));
          const nr=Math.max(0,Math.min(ROWS-1,m.r));
          if(nc===u.col&&nr===u.row)continue;
          if(!canUnitOccupyAt(u, nc, nr, us)) continue;

          const dist = Math.abs(best.col - nc) + Math.abs(best.row - nr);
          const lanePenalty = Math.abs(best.row - nr) * 0.12;
          const score = dist + lanePenalty;
          if(score < bestScore){
            bestScore = score;
            bestMove = { c:nc, r:nr };
          }
        }
        if(bestMove){
          u.col = bestMove.c;
          u.row = bestMove.r;
        }
      }
    }
  }
  gs.units=us.filter(u=>u.hp>0);
}

/* ═══════ 回合结算 ═══════ */
function endBattle(winner){
  gs.winner=winner;
  const rem=gs.units.filter(u=>u.side===winner);
  const totalHp=rem.reduce((s,u)=>s+Math.max(0,u.hp),0);
  const totalAtk=rem.reduce((s,u)=>s+Math.max(0,u.atk),0);
  const baseDmg=Math.max(1, Math.round(totalHp*HQ_DAMAGE_HP_RATIO + totalAtk*HQ_DAMAGE_ATK_RATIO));
  const hqMitigation = Math.max(0, Math.min(0.9, getRelicEffectValue('hqDamageReduction')));
  const dmgToEnemy = winner===PLAYER ? baseDmg : 0;
  const dmgToPlayer = winner===ENEMY ? Math.max(1, Math.round(baseDmg * ENEMY_HQ_DAMAGE_MULT * (1 - hqMitigation))) : 0;

  if(winner===PLAYER){gs.eHp-=dmgToEnemy;gs.eFlash=.8;spawnHqHit(ENEMY);spawnDamageNum((COLS-1)*TILE,ROWS/2*TILE-10,dmgToEnemy,'#f80');}
  else               {gs.pHp-=dmgToPlayer;gs.pFlash=.8;spawnHqHit(PLAYER);spawnDamageNum(TILE,ROWS/2*TILE-10,dmgToPlayer,'#f80');}
  gs.phase='result';
  // clamp to 0
  gs.pHp=Math.max(0,gs.pHp); gs.eHp=Math.max(0,gs.eHp);

  if(gs.pHp<=0 && (playerBuffs.hqReviveCharges || 0) > 0){
    playerBuffs.hqReviveCharges -= 1;
    gs.pHp = 1;
    addLog('<span class="log-kill">🌱 复苏火种触发：总部保留 1 点生命</span>');
    showTip('复苏火种触发，避免了败北');
  }

  const hqRegen = Math.max(0, Math.round(getRelicEffectValue('hqRegenAfterBattle')));
  if(hqRegen > 0 && gs.pHp > 0){
    const oldHp = gs.pHp;
    gs.pHp = Math.min(getPlayerHqMax(), gs.pHp + hqRegen);
    const realHeal = gs.pHp - oldHp;
    if(realHeal > 0) addLog('<span class="log-move">🩹 战地医疗包：总部恢复 '+realHeal+' 生命</span>');
  }
  // 总部被摧毁 → 爆炸特效
  if(gs.pHp<=0) spawnHqExplosion(PLAYER);
  if(gs.eHp<=0) spawnHqExplosion(ENEMY);

  const ed=dmgToEnemy, pd=dmgToPlayer;
  let txt=winner===PLAYER?'🎉 本回合胜利！':'💀 本回合失败...';
  txt+=' 敌方总部 -'+ed+'  我方总部 -'+pd;

  addLog('<span class="log-kill">— 战斗结束 — '+(winner===PLAYER?'胜利':'失败')+'</span>');
  addLog('总部伤害：敌方 -'+ed+'  我方 -'+pd);

  const stageCleared = gs.eHp<=0;
  const defeated = gs.pHp<=0;
  let over = false;
  if(defeated && currentMapIsHidden){
    txt+='  ☁ 隐藏地图挑战失败，返回主线';
  } else if(defeated){
    txt+='  💔 游戏结束';
    gs.phase='gameover';
    over = true;
  } else if(stageCleared && currentNodeType === 'boss' && !currentMapIsHidden && currentMapIndex === MAP_COUNT){
    txt+='  🏆 你击败了Boss，通关成功！';
    gs.phase='gameover';
    over = true;
    setTimeout(() => showVictoryScreen(), 900);
  } else if(stageCleared && currentNodeType === 'boss' && currentMapIsHidden){
    txt+='  ✨ 隐藏地图已征服，即将返回主线';
  } else if(stageCleared){
    txt+= currentNodeType === 'boss' ? '  👑 本图Boss已击败，准备进入下一张图' : '  ✅ 已攻破本关城堡，可进入下一关';
  } else {
    txt+='  ⚔ 本关未攻破，需继续攻城';
  }

  elMsg.textContent=txt;
  btnStart.classList.add('hidden'); btnPause.classList.add('hidden'); btnSpeed.classList.add('hidden');
  pauseOverlay.classList.add('hidden');

  if(!over){
    btnNext.classList.remove('hidden');
    if(currentMapIsHidden && defeated) btnNext.textContent = '返回主线 →';
    else if(stageCleared && currentNodeType === 'boss') btnNext.textContent = currentMapIsHidden ? '返回主线 →' : '进入下一张图 →';
    else btnNext.textContent = stageCleared ? '进入下一关 →' : '继续攻城 →';
  } else {
    setTimeout(()=>{btnAgain.classList.remove('hidden');btnBack.classList.remove('hidden');},1200);
  }

  const popupTitle = defeated
    ? (currentMapIsHidden ? '☁ 隐藏图挑战失败' : '💔 战斗失利')
    : stageCleared
      ? (currentNodeType === 'boss' ? '👑 节点征服' : '✅ 攻城成功')
      : '⚔ 攻城继续';
  const popupMsg = '本回合：' + (winner===PLAYER?'胜利':'失败') + '\n'
    + '总部伤害：敌方 -' + ed + ' / 我方 -' + pd + '\n'
    + (defeated
      ? (currentMapIsHidden ? '隐藏图挑战失败，你将返回主线继续征程。' : '我方总部被摧毁，本局结束。')
      : (stageCleared
        ? (currentNodeType === 'boss' ? 'Boss节点已击破。' : '当前关卡城堡已攻破。')
        : '当前关卡未攻破，需要继续攻城。'));
  showBattleResultPopup(popupTitle, popupMsg);
}

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
gs=mkState(getPlayerHqMax(),HQ_MAX,1);
gs.phase='title';
setActive('infantry');
fitCanvas();
requestAnimationFrame(loop);
