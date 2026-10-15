// 藏品空状态工厂 —— 所有 relic key 的唯一定义处
// 传入当前藏品定义（RELIC_DEFS），生成全 0 初始状态
export function createEmptyRelicState(defs){
  const state = {};
  for(const key of Object.keys(defs)) state[key] = 0;
  return state;
}
