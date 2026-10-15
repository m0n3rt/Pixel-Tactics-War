/* ═══════ 常量 ═══════ */
export const TILE = 32;
export const COLS = 14;
export const ROWS = 8;
export const HQ_COLS = 2;
export const FIELD_LEFT  = HQ_COLS;          // 2
export const FIELD_RIGHT = COLS - HQ_COLS - 1; // 11
export const DEPLOY_COLS = 3;

export const PLAYER = 'player';
export const ENEMY  = 'enemy';

export const HQ_MAX    = 100;
export const PREP_TIME_BASE = 60;
export const PREP_TIME_INCREASE = 5;
export const PREP_TIME_MAX = 120;
export const PREP_TIME_BOSS = 180;
export const DP_START  = 10;
export const DP_PER_ROUND = 3;
export const DP_MAX    = 25;
export const HQ_DAMAGE_HP_RATIO = 0.45;
export const HQ_DAMAGE_ATK_RATIO = 0.55;
export const ENEMY_HQ_DAMAGE_MULT = 0.65;
export const REINFORCEMENT_RESERVE_BASE_LIMIT = 3;
export const UNIT_CAP_START = 6;
export const UNIT_CAP_PER_ROUND = 1;
export const UNIT_CAP_MAX = 12;
export const MAP_COUNT = 5;
export const MAIN_MAP_LAYER_COUNT = 10;
export const HIDDEN_MAP_LAYER_COUNT = 10;
export const MAP_ENEMY_BONUS = 0.05;
export const LAYER_ENEMY_BONUS = 0.02;
export const MAP_BOSS_BONUS = 0.12;
export const HIDDEN_MAP_CHANCE = 0.35;
export const HIDDEN_MAP_EXTRA_BONUS = 0.12;
export const BOSS_SUMMON_LIMIT = 4;

export const SPEEDS = [1, 2, 3];
export const THREE_CELL = 1.1;

export const LOG_LIMIT_PER_SECTION = 28;

// 地图生成布局常量
export const MAP_W = 380;
export const MAP_LAYER_GAP = 110;
export const MAP_PAD = 60;
