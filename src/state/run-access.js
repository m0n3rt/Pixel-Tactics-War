/* ═══════════════════════════════════════════════════════════
   运行态访问代理（run 层 ↔ main.js 别名的同步桥）
   - main.js 通过 bindRunAccess 注入 getter/setter（返回/写回 main.js 的
     let 别名，保证与 runCtx.run 的解构副本实时一致）
   - run/* 模块统一通过 S.xxx 读写运行态，不再 import main.js
   ═══════════════════════════════════════════════════════════ */
export const S = {};

export function bindRunAccess(accessors){
  Object.defineProperties(S, Object.getOwnPropertyDescriptors(accessors));
}
