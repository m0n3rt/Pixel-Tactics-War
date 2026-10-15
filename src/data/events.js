/* ═══════ 事件系统 ═══════ */
import { eventEnv } from '../state/event-env.js';

export const EVENTS = [
  {
    title: '神秘商人',
    desc: '一个神秘的商人出现在你面前，他似乎有些特别的东西要出售...',
    choices: [
      { text: '购买强化药剂（2金币，获得攻击+1）', effect: () => {
        if(eventEnv.playerGold < 2){
          eventEnv.showTip('金币不足，无法购买强化药剂');
          return;
        }
        eventEnv.playerGold -= 2;
        eventEnv.playerBuffs.atk = (eventEnv.playerBuffs.atk || 0) + 1;
        eventEnv.showTip('购买成功：攻击力 +1');
      } },
      { text: '购买生命药水（2金币，获得生命+3）', effect: () => {
        if(eventEnv.playerGold < 2){
          eventEnv.showTip('金币不足，无法购买生命药水');
          return;
        }
        eventEnv.playerGold -= 2;
        eventEnv.playerBuffs.hp = (eventEnv.playerBuffs.hp || 0) + 3;
        eventEnv.showTip('购买成功：生命上限 +3');
      } },
      { text: '离开', effect: () => {} },
    ]
  },
  {
    title: '古老祭坛',
    desc: '你发现了一座古老的祭坛，散发着神秘的力量。你可以献祭城堡稳固度，换取更强大的军势。',
    choices: [
      { text: '献祭（总部上限-20%，攻击+3）', effect: () => {
        const beforeMax = eventEnv.getPlayerHqMax();
        eventEnv.playerBuffs.hqMaxMul = (eventEnv.playerBuffs.hqMaxMul || 1) * 0.8;
        const afterMax = eventEnv.getPlayerHqMax();
        eventEnv.playerBuffs.atk = (eventEnv.playerBuffs.atk || 0) + 3;
        eventEnv.gs.pHp = Math.min(eventEnv.gs.pHp, afterMax);
        const reduced = Math.max(0, beforeMax - afterMax);
        return {
          popup: true,
          title: '☠ 祭坛献祭',
          message: '你以总部坚固度换取了军势强化。\n本次结果：\n- 我方总部生命上限 -20%（-' + reduced + '，' + beforeMax + '→' + afterMax + '）\n- 全体攻击力 +3'
        };
      } },
      { text: '谨慎离开（生命+1）', effect: () => { eventEnv.playerBuffs.hp = (eventEnv.playerBuffs.hp || 0) + 1; } },
    ]
  },
  {
    title: '训练场',
    desc: '你遇到了一个训练场，可以在这里提升你的军队。',
    choices: [
      { text: '训练攻击（攻击+0.5）', effect: () => { eventEnv.playerBuffs.atk = (eventEnv.playerBuffs.atk || 0) + 0.5; } },
      { text: '训练防御（生命+2）', effect: () => { eventEnv.playerBuffs.hp = (eventEnv.playerBuffs.hp || 0) + 2; } },
      { text: '训练速度（速度+6%）', effect: () => { eventEnv.playerBuffs.speed = (eventEnv.playerBuffs.speed || 0) + 0.06; } },
    ]
  },
  {
    title: '幸运泉水',
    desc: '你发现了一口闪闪发光的泉水，喝下去会发生什么呢？',
    choices: [
      { text: '喝下泉水（随机效果）', effect: () => {
        const rand = Math.random();
        if(rand < 0.45) {
          eventEnv.playerBuffs.atk = (eventEnv.playerBuffs.atk || 0) + 1;
          eventEnv.playerBuffs.hp = (eventEnv.playerBuffs.hp || 0) + 2;
          eventEnv.showTip('泉水效果极佳！');
          return {
            popup: true,
            title: '✨ 泉水祝福',
            message: '你感到力量与生命力涌现！\n获得增益：\n- 全体攻击力 +1\n- 全体生命上限 +2'
          };
        } else {
          eventEnv.playerBuffs.hp = (eventEnv.playerBuffs.hp || 0) - 8;
          eventEnv.playerGold = Math.max(0, eventEnv.playerGold - 2);
          eventEnv.showTip('泉水似乎有副作用...');
          return {
            popup: true,
            title: '⚠ 泉水副作用',
            message: '泉水混入了杂质，身体感到沉重。\n本次结果：\n- 全体生命上限 -8\n- 金币 -2'
          };
        }
      }},
      { text: '不碰泉水', effect: () => {} },
    ]
  },
];
