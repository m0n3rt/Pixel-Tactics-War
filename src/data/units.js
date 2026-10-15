// 兵种定义
export const TYPES = {
  infantry: { name:'步兵', letter:'步', cost:1, maxHp:12, atk:3, range:1,
              movCD:0.6, atkCD:0.9, color:'#6cf', shape:'rect' },
  archer:   { name:'弓手', letter:'弓', cost:2, maxHp:8,  atk:3, range:3,
              movCD:0.8, atkCD:1.2, color:'#fd6', shape:'diamond' },
  tank:     { name:'重甲', letter:'甲', cost:3, maxHp:25, atk:4, range:1,
              movCD:1.0, atkCD:1.0, color:'#f77', shape:'heavy' },
  cavalry:  { name:'骑兵', letter:'骑', cost:2, maxHp:15, atk:3, range:2,
              movCD:0.8, atkCD:1.0, color:'#7ff', shape:'triangle' },
  boss:     { name:'魔王', letter:'魔', cost:0, maxHp:200, atk:10, range:2,
              movCD:0.5, atkCD:0.8, color:'#f0f', shape:'boss' },
  cannon:   { name:'炮塔', letter:'炮', cost:0, maxHp:30, atk:8, range:5,
              movCD:999, atkCD:4.5, color:'#fc4', shape:'cannon', isStationary:true },
  ultimateCannon: { name:'终极火炮', letter:'终', cost:0, maxHp:20, atk:0, range:0,
              movCD:999, atkCD:999, color:'#7ff', shape:'cannon', isStationary:true },
};
