/* ═══════════════════════════════════════════════════════════
   run 层对 main.js 局部依赖的注入点
   - 后续 Step 迁入独立模块后可直接 import 替代，此处保留过渡期桥接
   ═══════════════════════════════════════════════════════════ */
export const runRefs = {
  showTip: null,                    // (text) => void
  addLog: null,                     // (html) => void
  setBattle: null,                  // (state) => void（同步 gs 别名与 ctx.battle）
  initRun: null,                    // () => void（main.js 重置对局与别名）
  applyRandomUnitRewardInPrep: null,// () => void（Step I 迁入 run/ 相关模块）
  updateRelicSpeedBonusesForNextBattle: null, // () => void（Step I 处理）
  updateUI: null,                   // () => void（Step I 迁入 view/hud.js）
  fitCanvas: null,                  // () => void（Step I 迁入 view/dom.js）
  clearLog: null,                   // () => void（Step I 迁入 view/hud.js）
  resetLastReserveRenderKey: null,  // () => void（main.js 局部缓存）
  getPlayerHqMax: null,             // () => number
  spawnDeath: null,                 // (c, r, col) => void（Step H 后粒子仍在 main，Step I 再迁）
  spawnHqHit: null,                 // (side) => void（Step H 迁入）
  spawnDamageNum: null,             // (x, y, dmg, color) => void（Step H 迁入）
  spawnHqExplosion: null,           // (side) => void（Step H 迁入）
};

export function bindRunRefs(refs){
  Object.assign(runRefs, refs);
}
