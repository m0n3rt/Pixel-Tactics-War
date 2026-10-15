/* ═══════════════════════════════════════════════════════════
   Boss 机制（sim 层，不依赖 DOM / Three）
   - spawnBossAdd：Boss 开场 / 周期召唤小怪
   - applyBossOnHit：命中时机制（吸血 / 溅射 / 减速）
   - updateBossState：狂暴阈值
   特效与日志经 simFx 注入；units 由调用方显式传入。
   ═══════════════════════════════════════════════════════════ */
import { TILE } from '../data/constants.js';
import { mkUnit, getDisplayName } from './unit.js';
import { findSpawnTile } from './grid.js';
import { simFx } from './fx.js';

export function spawnBossAdd(units, type, side, preferCol, preferRow){
  const tile = findSpawnTile(side, preferCol, preferRow, units || []);
  if(!tile) return false;
  units.push(mkUnit(side, type, tile.col, tile.row));
  return true;
}

export function applyBossOnHit(attacker, target, units){
  const mechanics = attacker.bossMechanics;
  if(!mechanics) return;

  if(mechanics.lifestealPercent){
    const heal = Math.max(1, Math.round(attacker.atk * mechanics.lifestealPercent));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    simFx.addLog('<span class="log-move">🩸 '+getDisplayName(attacker)+' 吸收了 '+heal+' 点生命</span>');
  }

  if(mechanics.splashDamage){
    for(const other of units){
      if(other === target || other.side === attacker.side || other.hp <= 0) continue;
      const dist = Math.abs(other.col - target.col) + Math.abs(other.row - target.row);
      if(dist !== 1) continue;
      other.hp -= mechanics.splashDamage;
      other.hurt = .15;
      simFx.spawnDamageNum(other.col*TILE+TILE/2, other.row*TILE+TILE/4, mechanics.splashDamage, '#f6c');
      simFx.addLog('<span class="log-atk">✹ '+getDisplayName(attacker)+' 溅射 '+getDisplayName(other)+' -'+mechanics.splashDamage+'</span>');
    }
  }

  if(mechanics.slowOnHit){
    target.slowTimer = Math.max(target.slowTimer || 0, 3);
    target.slowFactor = Math.max(target.slowFactor || 0, mechanics.slowOnHit);
    simFx.addLog('<span class="log-move">❄ '+getDisplayName(target)+' 被减速</span>');
  }
}

export function updateBossState(unit){
  const mechanics = unit.bossMechanics;
  if(!mechanics) return;
  if(!unit.enraged && mechanics.enrageThreshold && unit.hp <= unit.maxHp * mechanics.enrageThreshold){
    unit.enraged = true;
    unit.atk += mechanics.enrageAtkBonus || 0;
    if(mechanics.enrageSpeedMult){
      unit.movCD /= mechanics.enrageSpeedMult;
      unit.atkCD /= mechanics.enrageSpeedMult;
    }
    simFx.showTip(getDisplayName(unit)+' 进入狂暴状态');
    simFx.addLog('<span class="log-kill">🔥 '+getDisplayName(unit)+' 狂暴了！</span>');
  }
}
