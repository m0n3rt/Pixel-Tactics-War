/* ═══════════════════════════════════════════════════════════
   事件效果运行环境（data/events.js 的 effect 通过它访问运行时）
   - main.js 注入 getter/setter 与函数，避免 data 层直接引用全局
   ═══════════════════════════════════════════════════════════ */
export const eventEnv = {};

export function bindEventEnv(env){
  Object.defineProperties(eventEnv, Object.getOwnPropertyDescriptors(env));
}
