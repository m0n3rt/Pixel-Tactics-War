/* ═══════════════════════════════════════════════════════════
   战斗状态工厂（原 mkState）
   倒计时与准备点数规则集中在此，数据侧保持与重构前逐项一致
   ═══════════════════════════════════════════════════════════ */
import {
  PREP_TIME_BASE, PREP_TIME_INCREASE, PREP_TIME_MAX, PREP_TIME_BOSS,
  DP_START, DP_PER_ROUND, DP_MAX,
} from '../data/constants.js';

export function createBattleState(pHp, eHp, round, opts){
  opts = opts || {};
  const r = round || 1;
  const baseDP = Math.min(DP_MAX, DP_START + (r - 1) * DP_PER_ROUND);
  const dpCap = Math.max(0, baseDP + (opts.dpBonus || 0) + (opts.relicDpBonus || 0) - (opts.dpPenalty || 0));
  // 倒计时随回合增加
  let prepTime = PREP_TIME_BASE;
  if(opts.isBoss){
    prepTime = PREP_TIME_BOSS; // Boss战3分钟
  } else {
    prepTime = Math.min(PREP_TIME_MAX, PREP_TIME_BASE + Math.floor((r - 1) / 2) * PREP_TIME_INCREASE);
  }
  return { phase:'prepare', countdown:prepTime, maxCountdown:prepTime,
    pHp, eHp, dp:dpCap, dpCap,
    units:[], winner:null, round:r,
    pFlash:0, eFlash:0 };
}
