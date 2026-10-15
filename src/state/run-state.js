/* ═══════════════════════════════════════════════════════════
   对局状态工厂 —— 所有 run 字段初始值的唯一出处
   newGame / backToTitle / 模块初始化 都必须经它重置
   ═══════════════════════════════════════════════════════════ */
import { createEmptyRelicState } from './relics-state.js';

export function createRunState(relicDefs){
  return {
    // 难度 / buff / 经济
    gameDifficulty: 3,
    playerBuffs: {},
    playerGold: 0,
    pendingGoldFromBattle: 0,
    playerRelics: createEmptyRelicState(relicDefs),

    // 地图进度
    mapNodes: [],
    currentNodeIndex: 0,
    eliteMultiplier: 1,
    currentNodeType: 'battle',
    stageLevel: 1,
    currentMapIndex: 1,
    currentMapLayer: 1,
    routeLockedFromIndex: -1,
    currentBossProfile: null,
    currentMapBossProfile: null,
    selectedBosses: [],
    currentMapIsHidden: false,
    towerCountBeforeHiddenMap: 0,
    pendingMainMapIndex: null,
    pendingStarterBlessing: false,
    pendingRewardAction: 'show-map',
    currentEncounterModifiers: { enemyHalf: false, enemyHpMul: 1, dpPenalty: 0 },

    // 商店
    shopState: {
      currentOffer: null,
      savedOffer: null,
      savedOfferLocked: false,
      chestOpensLeft: 5,
      lastChestResultEmpty: false,
      diceUsed: false,
      healUsed: false,
      pendingDecision: null,
    },
    shopDiceRolling: false,
    lastShopChestOpensLeft: null,

    // 布阵 / 增援
    lastDeployment: [],
    reinforcementStock: [],
    selectedReserveIndex: -1,

    // 战斗期字段
    selUnit: 'infantry',
    paused: false,
    speed: 1,
    hoverCol: -1,
    hoverRow: -1,
    particles: [],
  };
}
