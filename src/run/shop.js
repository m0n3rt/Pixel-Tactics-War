/* ═══════════════════════════════════════════════════════════
   商店状态机（run 层）
   - 开箱 / 买 / 留 / 丢 / 治疗 / 骰子 / 离开 / 决策确认
   - 保留旧藏品 / 宝箱进度点 / 折扣价显示
   运行态经 S 读写；main.js 局部依赖（showTip/addLog/getPlayerHqMax）经 runRefs 注入。
   ═══════════════════════════════════════════════════════════ */
import { S } from '../state/run-access.js';
import { runRefs } from './refs.js';
import { ctx } from '../state/ctx.js';
import { TYPES } from '../data/units.js';
import { CHEST_RELIC_WEIGHTS } from '../data/chest-weights.js';
import {
  RELIC_DEFS,
  canGainRelic,
  getShopRelicFinalPrice,
  grantRelic,
  applyRelicOnGain,
  hasAllBaseRelics,
  hasCollectedAllRelicsExceptLuckyClover,
  getRelicStacks,
  getChestRelicPool,
  getRelicEffectValue,
} from '../sim/relics.js';
import { showMapScreen } from './map.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const uiRoot       = $('ui-root');
const mapScreen    = $('map-screen');
const eventScreen  = $('event-screen');
const rewardScreen = $('reward-screen');
const shopScreen   = $('shop-screen');
const elGold       = $('gold-display');
const globalGoldBadge = $('global-gold-badge');
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

export function closeShopDecision(){
  S.shopState.pendingDecision = null;
  if(shopDOM.decisionOverlay) shopDOM.decisionOverlay.classList.add('hidden');
}

export function startShopVisit(){
  S.shopState.currentOffer = null;
  S.shopState.diceUsed = false;
  S.shopState.healUsed = false;
  S.shopState.pendingDecision = null;
  S.shopDiceRolling = false;
  if(S.shopState.savedOffer && !canGainRelic(S.shopState.savedOffer.key)){
    S.shopState.savedOffer = null;
    S.shopState.savedOfferLocked = false;
  }
  const hasRetainedOffer = !!S.shopState.savedOffer && !!S.shopState.savedOfferLocked;
  if(!hasRetainedOffer){
    S.shopState.chestOpensLeft = 5;
    S.shopState.lastChestResultEmpty = false;
  }
  S.lastShopChestOpensLeft = S.shopState.chestOpensLeft;
  closeShopDecision();
}

export function playTransientClass(el, className, duration){
  if(!el) return;
  el.classList.remove(className);
  // 触发重排，保证同一动画可重复播放
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), duration || 500);
}

export function formatRelicOffer(offer){
  if(!offer) return '暂无藏品';
  const finalPrice = getShopRelicFinalPrice(offer);
  const discount = Math.max(0, (offer.price || 0) - finalPrice);
  const priceLine = discount > 0
    ? (offer.name + '（' + offer.price + '→' + finalPrice + '金币）')
    : (offer.name + '（' + finalPrice + '金币）');
  return priceLine + '\n' + offer.desc;
}

export function openShopDecision(action){
  const offer = S.shopState.currentOffer;
  if(!offer || !shopDOM.decisionOverlay) return;
  S.shopState.pendingDecision = action;
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

export function resolveShopDecision(){
  const offer = S.shopState.currentOffer;
  if(!offer || !S.shopState.pendingDecision){
    closeShopDecision();
    return;
  }
  if(S.shopState.pendingDecision === 'keep'){
    S.shopState.savedOffer = offer;
    S.shopState.savedOfferLocked = true;
    S.shopState.chestOpensLeft = 0;
    S.shopState.currentOffer = null;
    runRefs.showTip('已保留该藏品，当前仅可购买');
  } else {
    S.shopState.currentOffer = null;
    const left = Math.max(0, S.shopState.chestOpensLeft || 0);
    runRefs.showTip(left > 0 ? ('已丢弃，可继续开箱（剩余'+left+'次）') : '已丢弃，开箱次数已耗尽');
  }
  closeShopDecision();
  refreshShopUI();
}

export function refreshShopUI(){
  if(shopDOM.gold) shopDOM.gold.textContent = String(S.playerGold);
  if(elGold) elGold.textContent = String(S.playerGold);
  if(globalGoldBadge) globalGoldBadge.textContent = '💎 ' + S.playerGold;

  let offer = S.shopState.currentOffer || S.shopState.savedOffer;
  if(offer && !canGainRelic(offer.key)){
    if(S.shopState.currentOffer && S.shopState.currentOffer.key === offer.key) S.shopState.currentOffer = null;
    if(S.shopState.savedOffer && S.shopState.savedOffer.key === offer.key) S.shopState.savedOffer = null;
    S.shopState.savedOfferLocked = false;
    offer = null;
  }
  const hasLockedSavedOffer = !S.shopState.currentOffer && !!S.shopState.savedOffer && !!S.shopState.savedOfferLocked;
  shopDOM.relicOffer.textContent = offer
    ? (hasLockedSavedOffer ? ('已保留\n' + formatRelicOffer(offer)) : formatRelicOffer(offer))
    : ('尚未开启（剩余开箱次数：' + Math.max(0, S.shopState.chestOpensLeft || 0) + '）');
  const canBuy = !!offer && S.playerGold >= getShopRelicFinalPrice(offer) && canGainRelic(offer.key);
  const canOpenChest = !offer && (S.shopState.chestOpensLeft || 0) > 0;
  if(shopDOM.chestProgress){
    const left = Math.max(0, Math.min(5, S.shopState.chestOpensLeft || 0));
    const prevLeft = typeof S.lastShopChestOpensLeft === 'number' ? S.lastShopChestOpensLeft : left;
    shopDOM.chestProgress.innerHTML = Array.from({ length: 5 }, (_, i) =>
      '<span class="shop-chest-dot ' +
      (i < left ? 'active ' : '') +
      (i >= left && i < prevLeft ? 'extinguish' : '') +
      '"></span>'
    ).join('');
    S.lastShopChestOpensLeft = left;
  }
  if(shopDOM.openChest){
    shopDOM.openChest.disabled = !canOpenChest;
    const openLabel = S.shopState.lastChestResultEmpty ? '再试一次' : '开启宝箱';
    shopDOM.openChest.textContent = canOpenChest
      ? (openLabel + '（' + S.shopState.chestOpensLeft + '/5）')
      : '次数已耗尽';
  }
  shopDOM.buyRelic.disabled = !canBuy;
  shopDOM.keepRelic.disabled = !S.shopState.currentOffer;
  shopDOM.discardRelic.disabled = !S.shopState.currentOffer;

  const healLost = Math.max(0, runRefs.getPlayerHqMax() - ctx.battle.pHp);
  const canHeal = !S.shopState.healUsed && healLost > 0;
  shopDOM.healBtn.disabled = !canHeal;
  shopDOM.healInfo.textContent = healLost > 0 ? ('可回复生命：' + healLost) : '我方城堡生命已满';

  shopDOM.diceBtn.disabled = S.shopState.diceUsed || S.shopDiceRolling;
  if(!shopDOM.diceInfo.textContent){
    shopDOM.diceInfo.textContent = '尚未掷骰';
  }
}

export function generateRelicOfferFromChest(extraDropChance=0){
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

export function openShopChest(){
  if(S.shopState.currentOffer || S.shopState.savedOffer) return;
  if((S.shopState.chestOpensLeft || 0) <= 0){
    refreshShopUI();
    runRefs.showTip('宝箱开启次数已耗尽');
    return;
  }
  S.shopState.chestOpensLeft -= 1;
  playTransientClass(shopDOM.relicCard, 'shop-card-chest-open', 520);
  const chestBoost = S.playerBuffs.nextChestDropBonus || 0;
  S.playerBuffs.nextChestDropBonus = 0;
  const offer = generateRelicOfferFromChest(chestBoost);
  if(!offer){
    S.shopState.currentOffer = null;
    S.shopState.lastChestResultEmpty = true;
    const left = Math.max(0, S.shopState.chestOpensLeft || 0);
    shopDOM.relicOffer.textContent = '宝箱空空如也\n剩余开启次数：' + left;
    playTransientClass(shopDOM.relicOffer, 'shop-offer-reveal', 360);
    runRefs.showTip(left > 0 ? ('这次没有发现藏品（剩余'+left+'次）') : '这次没有发现藏品，次数已耗尽');
    refreshShopUI();
    return;
  }
  S.shopState.currentOffer = offer;
  S.shopState.lastChestResultEmpty = false;
  const left = Math.max(0, S.shopState.chestOpensLeft || 0);
  shopDOM.relicOffer.textContent = formatRelicOffer(offer) + '\n剩余开启次数：' + left;
  playTransientClass(shopDOM.relicOffer, 'shop-offer-reveal', 360);
  runRefs.showTip('发现藏品：' + offer.name + '（剩余' + left + '次）');
  refreshShopUI();
}

export function buyShopRelic(){
  const offer = S.shopState.currentOffer || S.shopState.savedOffer;
  if(!offer) return;
  const finalPrice = getShopRelicFinalPrice(offer);
  if(S.playerGold < finalPrice){
    runRefs.showTip('金币不足');
    return;
  }
  if(!grantRelic(offer.key)){
    S.shopState.currentOffer = null;
    S.shopState.savedOffer = null;
    runRefs.showTip('该藏品已完成收集，已自动刷新候选');
    refreshShopUI();
    return;
  }
  S.playerGold -= finalPrice;
  if((S.playerBuffs.nextRelicDiscount || 0) > 0){
    S.playerBuffs.nextRelicDiscount = 0;
  }
  applyRelicOnGain(offer.key);
  runRefs.addLog('<span class="log-kill">🧰 购买藏品：'+offer.name+'</span>');
  runRefs.showTip('购买成功：' + offer.name);
  S.shopState.currentOffer = null;
  S.shopState.savedOffer = null;
  S.shopState.savedOfferLocked = false;
  S.shopState.lastChestResultEmpty = false;
  const left = Math.max(0, S.shopState.chestOpensLeft || 0);
  if(left > 0) shopDOM.relicOffer.textContent = '可继续开箱（剩余开启次数：' + left + '）';
  refreshShopUI();
}

export function keepShopRelic(){
  if(!S.shopState.currentOffer) return;
  openShopDecision('keep');
}

export function discardShopRelic(){
  if(!S.shopState.currentOffer) return;
  openShopDecision('discard');
}

export function triggerShopHeal(){
  if(S.shopState.healUsed) return;
  const pMax = runRefs.getPlayerHqMax();
  const healLost = Math.max(0, pMax - ctx.battle.pHp);
  if(healLost <= 0){
    runRefs.showTip('城堡生命已满');
    return;
  }
  ctx.battle.pHp = pMax;
  S.shopState.healUsed = true;
  runRefs.showTip('城堡生命已回复到上限');
  runRefs.addLog('<span class="log-move">🔥 篝火生效：城堡生命恢复</span>');
  refreshShopUI();
}

export function applyShopDiceReward(){
  if(S.shopState.diceUsed || S.shopDiceRolling) return;
  S.shopDiceRolling = true;
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
    S.playerBuffs.bonusUnitsQueue = S.playerBuffs.bonusUnitsQueue || [];
    S.playerBuffs.bonusUnitsQueue.push(t);
    shopDOM.diceInfo.textContent = '奖励：下场获得特殊援军（' + TYPES[t].name + '）';
    runRefs.showTip('骰子奖励：下场援军 ' + TYPES[t].name);
    isReward = true;
  } else if(roll < rewardRate){
    const add = 2 + Math.floor(Math.random() * 3);
    S.playerGold += add;
    shopDOM.diceInfo.textContent = '奖励：金币 +' + add;
    runRefs.showTip('骰子奖励：金币 +' + add);
    isReward = true;
  } else if(roll < 0.75){
    const lose = 2 + Math.floor(Math.random() * 2);
    S.playerGold = Math.max(0, S.playerGold - lose);
    shopDOM.diceInfo.textContent = '惩罚：金币 -' + lose;
    runRefs.showTip('骰子惩罚：金币 -' + lose);
  } else {
    const loss = 1 + Math.floor(Math.random() * 2);
    S.playerBuffs.nextBattleDpPenalty = (S.playerBuffs.nextBattleDpPenalty || 0) + loss;
    shopDOM.diceInfo.textContent = '惩罚：下场准备点数 -' + loss;
    runRefs.showTip('骰子惩罚：准备点数 -' + loss);
  }
  playTransientClass(shopDOM.diceCard, isReward ? 'shop-card-reward-hit' : 'shop-card-punish-hit', 650);
  playTransientClass(shopDOM.diceInfo, 'shop-offer-reveal', 360);
  S.shopState.diceUsed = true;
  S.shopDiceRolling = false;
  refreshShopUI();
  }, 620);
}

export function showShopScreen(){
  uiRoot.classList.add('hidden');
  mapScreen.classList.add('hidden');
  eventScreen.classList.add('hidden');
  rewardScreen.classList.add('hidden');
  shopScreen.classList.remove('hidden');
  shopDOM.diceInfo.textContent = '';
  startShopVisit();
  if(S.shopState.savedOffer){
    shopDOM.relicOffer.textContent = formatRelicOffer(S.shopState.savedOffer);
  }
  refreshShopUI();
}

export function leaveShopScreen(){
  shopScreen.classList.add('hidden');
  showMapScreen();
}
