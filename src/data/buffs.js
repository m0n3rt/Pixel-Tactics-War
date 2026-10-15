/* ═══════ Buff系统 ═══════ */
export const BUFF_TEMPLATES = {
  atkBoost: { icon:'⚔️', name:'锋利打击', desc:'所有单位攻击力 +0.5', rarity:'common', apply:(buffs)=>buffs.atk=(buffs.atk||0)+0.5 },
  hpBoost: { icon:'❤️', name:'体质强化', desc:'所有单位生命值 +1.5', rarity:'common', apply:(buffs)=>buffs.hp=(buffs.hp||0)+1.5 },
  rangeBoost: { icon:'🎯', name:'精准校射', desc:'弓手攻击力 +0.5', rarity:'rare', apply:(buffs)=>buffs.archerAtk=(buffs.archerAtk||0)+0.5 },
  speedBoost: { icon:'⚡', name:'迅捷之风', desc:'所有单位移动与攻击速度提升7.5%', rarity:'rare', apply:(buffs)=>buffs.speed=(buffs.speed||0)+0.075 },
  tankBoost: { icon:'🛡️', name:'重甲强化', desc:'重甲生命值 +4', rarity:'common', apply:(buffs)=>buffs.tankHp=(buffs.tankHp||0)+4 },
  dpBoost: { icon:'💰', name:'资源膨胀', desc:'每回合部署点数 +1', rarity:'rare', apply:(buffs)=>buffs.dpBonus=(buffs.dpBonus||0)+1 },
  unitCapBoost: { icon:'👥', name:'扩编', desc:'单位上限 +1', rarity:'rare', apply:(buffs)=>buffs.unitCap=(buffs.unitCap||0)+1 },
  fireBoost: { icon:'🔥', name:'炽焰之力', desc:'所有单位攻击力 +1', rarity:'epic', apply:(buffs)=>buffs.atk=(buffs.atk||0)+1 },
  holyBoost: { icon:'✨', name:'圣光庇护', desc:'所有单位生命值 +3', rarity:'epic', apply:(buffs)=>buffs.hp=(buffs.hp||0)+3 },
  berserk: { icon:'💢', name:'狂暴', desc:'所有单位攻击力 +1.5 但生命值 -2.5', rarity:'epic', apply:(buffs)=>{buffs.atk=(buffs.atk||0)+1.5;buffs.hp=(buffs.hp||0)-2.5;} },
  randomReinforcement: { icon:'🎲', name:'随机援军', desc:'下场准备阶段随机免费部署1个单位', rarity:'epic', apply:(buffs)=>{buffs.randomUnitTokens=(buffs.randomUnitTokens||0)+1;} },
  ultimateCannon: {
    icon:'🌈',
    name:'终极火炮',
    desc:'极其稀有：获得终极火炮。每场战斗开局发射巨型炮弹，轰击敌方全体单位，造成其生命上限 20% 的伤害（固定比例，不受加成影响）。同时我方城堡地块会出现一座终极火炮（2×2），它被击破时我方总部同步损失其生命值。',
    rarity:'mythic',
    unique:true,
    apply:(buffs)=>{buffs.ultimateCannon=true;}
  },
};
