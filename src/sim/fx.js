/* ═══════════════════════════════════════════════════════════
   sim 层副作用出口（战斗特效 / 日志 / 提示）
   - sim 不直接依赖 DOM / Three / 粒子数组，统一由 main.js 注入
   - 粒子 spawners（2D 粒子 + three fx）仍留在 main.js，Step I 再迁
   ═══════════════════════════════════════════════════════════ */
export const simFx = {
  addLog: null,            // (html, channel) => void
  showTip: null,           // (text) => void
  spawnProj: null,         // (fc, fr, tc, tr, color) => void
  spawnDamageNum: null,    // (x, y, dmg, color) => void
  spawnDeath: null,        // (c, r, color) => void
  formatDisplayNumber: null,// (n) => string
};

export function bindSimFx(fx){
  Object.assign(simFx, fx);
}
