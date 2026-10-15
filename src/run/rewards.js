/* ═══════════════════════════════════════════════════════════
   奖励选择系统（run 层）
   - 战后三选一奖励 / 开局增益选择 / 通用奖励卡渲染
   运行态经 S 读写；main.js 局部依赖（showTip/addLog）经 runRefs 注入。
   ═══════════════════════════════════════════════════════════ */
import { S } from '../state/run-access.js';
import { runRefs } from './refs.js';
import { BUFF_TEMPLATES } from '../data/buffs.js';
import { STARTER_BLESSINGS } from '../data/blessings.js';
import { showMapScreen, resolvePostReward } from './map.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const uiRoot      = $('ui-root');
const rewardScreen = $('reward-screen');
const rewardTitle = $('reward-title');
const rewardHint  = $('reward-hint');

export function renderRewardSelection(options, title, hint, onPick){
  uiRoot.classList.add('hidden');
  rewardScreen.classList.remove('hidden');
  if(rewardTitle) rewardTitle.textContent = title;
  if(rewardHint) rewardHint.textContent = hint;

  const rewardContainer = $('reward-options');
  rewardContainer.innerHTML = '';

  options.forEach(buff => {
    const card = document.createElement('div');
    const extraCls = buff.rarity === 'mythic' ? ' reward-card-mythic' : '';
    card.className = `reward-card ${buff.rarity}${extraCls}`;
    card.innerHTML = `
      <div class="reward-rarity">${String(buff.rarity || '').toUpperCase()}</div>
      <div class="reward-icon">${buff.icon}</div>
      <div class="reward-name ${buff.rarity === 'mythic' ? 'mythic-flame' : ''}">${buff.name}</div>
      <div class="reward-desc">${buff.displayDesc || buff.desc}</div>
    `;
    card.addEventListener('click', () => onPick(buff));
    rewardContainer.appendChild(card);
  });
}

export function showRewardScreen(){
  const buffKeys = Object.keys(BUFF_TEMPLATES).filter(k => {
    const b = BUFF_TEMPLATES[k];
    if(!b) return false;
    // 终极火炮只通过“极稀有注入”出现，不进入常规随机池
    if(k === 'ultimateCannon') return false;
    if(b.unique && k === 'ultimateCannon' && S.playerBuffs.ultimateCannon) return false;
    return true;
  });
  const selectedBuffs = [];
  while(selectedBuffs.length < 3){
    const key = buffKeys[Math.floor(Math.random() * buffKeys.length)];
    if(!selectedBuffs.includes(key)) selectedBuffs.push(key);
  }

  // 极稀有掉落：终极火炮（从第3层起才有概率出现）
  if(!S.playerBuffs.ultimateCannon && S.currentMapLayer >= 3){
    const chance = 0.012; // 1.2% / 次奖励
    if(Math.random() < chance){
      const replaceIndex = Math.floor(Math.random() * selectedBuffs.length);
      selectedBuffs[replaceIndex] = 'ultimateCannon';
    }
  }

  renderRewardSelection(
    selectedBuffs.map(key => ({ key, ...BUFF_TEMPLATES[key] })),
    '🎁 选择你的奖励',
    '选择一项增益来强化你的军队',
    reward => selectReward(reward.key)
  );
}

export function showStarterBlessingScreen(){
  const easyMode = S.gameDifficulty <= 3;
  const starterOptions = STARTER_BLESSINGS.map(blessing => ({
    ...blessing,
    displayDesc: easyMode && blessing.easyDesc ? blessing.easyDesc : blessing.desc,
  }));
  renderRewardSelection(
    starterOptions,
    '✨ 选择开局增益',
    easyMode ? '低难度会获得更强的增益选择，放心挑一个开局更舒服的' : '首战前选择一个起始祝福',
    blessing => {
      blessing.apply(S.playerBuffs, S.gameDifficulty);
      S.pendingStarterBlessing = false;
      runRefs.showTip('获得开局增益：' + blessing.name);
      runRefs.addLog('<span class="log-kill">✨ 开局增益：'+blessing.name+'</span>');
      rewardScreen.classList.add('hidden');
      showMapScreen();
    }
  );
}

export function selectReward(buffKey){
  const buff = BUFF_TEMPLATES[buffKey];
  if(buff){
    buff.apply(S.playerBuffs);
    runRefs.showTip(`获得：${buff.name}`);
    runRefs.addLog(`<span class="log-kill">🎁 获得奖励：${buff.name}</span>`);
  }

  resolvePostReward();
}
