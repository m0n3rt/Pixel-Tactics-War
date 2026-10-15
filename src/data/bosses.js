export const BOSS_POOLS = [
  [
    { key:'bone_warlord', name:'骸骨统帅', letter:'骸', color:'#d86', maxHp:180, atk:9, range:1, movCD:0.55, atkCD:0.75, mechanics:'半血后狂暴', enrageThreshold:0.5, enrageAtkBonus:3, enrageSpeedMult:1.15 },
    { key:'plague_hunter', name:'疫猎之眼', letter:'疫', color:'#8c6', maxHp:155, atk:8, range:4, movCD:0.7, atkCD:0.95, mechanics:'远程溅射', splashDamage:2 },
  ],
  [
    { key:'iron_guardian', name:'铁壁守卫', letter:'铁', color:'#aaa', maxHp:235, atk:10, range:1, movCD:0.85, atkCD:1.0, mechanics:'开场带护卫', openingAdds:[{ type:'tank', count:1 }, { type:'infantry', count:2 }] },
    { key:'bone_shaman', name:'枯骨祭司', letter:'祭', color:'#b6f', maxHp:175, atk:9, range:3, movCD:0.65, atkCD:0.85, mechanics:'周期召唤弓手', summonType:'archer', summonInterval:9 },
  ],
  [
    { key:'crimson_beast', name:'猩红巨兽', letter:'兽', color:'#f55', maxHp:230, atk:12, range:1, movCD:0.5, atkCD:0.72, mechanics:'攻击吸血', lifestealPercent:0.35 },
    { key:'storm_engine', name:'风暴核心', letter:'雷', color:'#6df', maxHp:195, atk:10, range:4, movCD:0.58, atkCD:0.8, mechanics:'远程溅射强化', splashDamage:3 },
  ],
  [
    { key:'frost_queen', name:'霜华女王', letter:'霜', color:'#9ef', maxHp:220, atk:11, range:3, movCD:0.55, atkCD:0.78, mechanics:'命中减速', slowOnHit:0.25 },
    { key:'abyss_knight', name:'深渊骑士', letter:'渊', color:'#95f', maxHp:280, atk:13, range:1, movCD:0.68, atkCD:0.86, mechanics:'半血狂暴并召唤重甲', enrageThreshold:0.4, enrageAtkBonus:4, enrageSpeedMult:1.2, summonType:'tank', summonInterval:12 },
  ],
  [
    { key:'void_eye', name:'虚空之眼', letter:'眼', color:'#f6f', maxHp:260, atk:12, range:5, movCD:0.52, atkCD:0.76, mechanics:'长射程与周期召唤', summonType:'infantry', summonInterval:8, splashDamage:2 },
    { key:'overlord', name:'终焉魔君', letter:'终', color:'#f33', maxHp:320, atk:14, range:2, movCD:0.5, atkCD:0.68, mechanics:'吸血与狂暴并存', lifestealPercent:0.25, enrageThreshold:0.5, enrageAtkBonus:4, enrageSpeedMult:1.2 },
  ],
];

export const HIDDEN_BOSS_POOL = BOSS_POOLS.flat().map(boss => ({
  ...boss,
  name: '隐域·' + boss.name,
  maxHp: Math.round(boss.maxHp * 1.15),
  atk: Math.round(boss.atk * 1.12),
}));
