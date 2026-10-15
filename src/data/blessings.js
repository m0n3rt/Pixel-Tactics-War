export const STARTER_BLESSINGS = [
  { key:'openingCull', icon:'🩸', name:'先声夺势', desc:'接下来的3场非Boss战中，敌方生命值减半', easyDesc:'接下来的5场非Boss战中，敌方生命值降低75%', rarity:'epic', apply:(buffs, difficulty)=>{
      const easy = difficulty <= 3;
      buffs.enemyHalfBattlesRemaining = Math.max(buffs.enemyHalfBattlesRemaining || 0, easy ? 5 : 3);
      buffs.enemyHalfHpMul = easy ? 0.25 : 0.5;
    } },
  { key:'infantryDrill', icon:'🪖', name:'步兵操典', desc:'步兵攻击力 +0.5', easyDesc:'步兵攻击力 +1', rarity:'rare', apply:(buffs, difficulty)=>{ buffs.infantryAtk = (buffs.infantryAtk || 0) + (difficulty <= 3 ? 1 : 0.5); } },
  { key:'tankFortify', icon:'🛡️', name:'重甲加固', desc:'重甲兵生命值 +1', easyDesc:'重甲兵生命值 +2', rarity:'rare', apply:(buffs, difficulty)=>{ buffs.tankHp = (buffs.tankHp || 0) + (difficulty <= 3 ? 2 : 1); } },
];
