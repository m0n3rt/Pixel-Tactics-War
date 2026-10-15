/* ═══════ 难度系统 ═══════ */
export const DIFFICULTY_LEVELS = [
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
