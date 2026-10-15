/* ═══════════════════════════════════════════════════════════
   战斗推演（sim 层，不依赖 DOM / Three）
   - tickCombat(battle, dt)：每帧推进战斗
     · Buff 计时 / Boss 召唤与狂暴
     · 寻敌 / 攻击 / 移动 / 连射 / 终极火炮连锁
   - 返回 { winner } 表示一方全灭（由主循环调 endBattle），否则 null
   - 单位死亡仅在 tick 末尾 filter；触发胜负时与原逻辑一致不 filter。
   特效与日志经 simFx 注入。
   ═══════════════════════════════════════════════════════════ */
import { TYPES } from '../data/units.js';
import {
  PLAYER, ENEMY, ROWS, FIELD_LEFT, FIELD_RIGHT, TILE, BOSS_SUMMON_LIMIT,
} from '../data/constants.js';
import {
  manhattanBetweenUnits, canUnitOccupyAt, getUnitCenterCell, getUnitCenterPixel,
} from './grid.js';
import { getDisplayName, getRenderColor } from './unit.js';
import { getRelicEffectValue } from './relics.js';
import { spawnBossAdd, applyBossOnHit, updateBossState } from './bosses.js';
import { simFx } from './fx.js';

export function tickCombat(gs, dt){
  const us=gs.units;
  for(const u of us){
    if(u.flash>0)u.flash-=dt;
    if(u.hurt>0)u.hurt-=dt;
    if(u.slowTimer>0){
      u.slowTimer-=dt;
      if(u.slowTimer<=0){
        u.slowTimer=0;
        u.slowFactor=0;
      }
    }
    if(u.isBoss && u.bossMechanics?.summonType && u.summonCount < BOSS_SUMMON_LIMIT){
      u.summonTimer -= dt;
      if(u.summonTimer <= 0){
        const spawned = spawnBossAdd(us, u.bossMechanics.summonType, u.side, u.col, u.row);
        if(spawned){
          u.summonCount += 1;
          simFx.addLog('<span class="log-move">☠ '+getDisplayName(u)+' 召唤了'+TYPES[u.bossMechanics.summonType].name+'</span>');
        }
        u.summonTimer = u.bossMechanics.summonInterval;
      }
    }
    if(u.isBoss) updateBossState(u);
  }

  if(!us.some(u=>u.side===PLAYER&&u.hp>0))return { winner: ENEMY };
  if(!us.some(u=>u.side===ENEMY &&u.hp>0))return { winner: PLAYER };

  for(const u of us){
    if(u.hp<=0)continue;
    const d=TYPES[u.type]; if(!d)continue;
    u.movT+=dt; u.atkT+=dt;
    const moveCd = u.movCD * (1 + (u.slowTimer>0 ? u.slowFactor : 0));
    const atkCd = u.atkCD * (1 + (u.slowTimer>0 ? u.slowFactor : 0));

    let best=null,bDist=Infinity;
    const targets = us.filter(e => e.side !== u.side && e.hp > 0);
    const inRangeTargets = u.type === 'archer'
      ? targets.filter(e => manhattanBetweenUnits(u, e) <= u.range)
      : [];
    const candidates = inRangeTargets.length > 0 ? inRangeTargets : targets;
    for(const e of candidates){
      const dist=manhattanBetweenUnits(u, e);
      if(dist<bDist){bDist=dist;best=e;}
    }
    if(!best)continue;

    if(bDist<=u.range){
      if(u.atkT>=atkCd){
        u.atkT=0; best.hp-=u.atk;
        u.flash=.15; best.hurt=.2;
        const from = getUnitCenterCell(u);
        const to = getUnitCenterCell(best);
        if(u.range>1) simFx.spawnProj(from.col, from.row, to.col, to.row, getRenderColor(u));
        const tp = getUnitCenterPixel(best);
        simFx.spawnDamageNum(tp.x, tp.y - TILE/4, u.atk, '#fa0');
        applyBossOnHit(u, best, us);

        if(best.hp<=0){
          if(best.side===PLAYER && best.type==='ultimateCannon' && best.linkedToHq){
            const linkDmg = Math.max(0, Math.round(best.maxHp));
            if(linkDmg > 0){
              gs.pHp = Math.max(0, gs.pHp - linkDmg);
              simFx.addLog('<span class="log-kill">⛓ 终极火炮被击破！我方总部同步损失 '+linkDmg+' 生命</span>');
              simFx.spawnDamageNum(TILE, ROWS/2*TILE-26, linkDmg, '#ff6f6f');
            }
          }
          simFx.spawnDeath(best.col,best.row,getRenderColor(best));
          simFx.addLog('<span class="log-kill">💀 '+(best.side===PLAYER?'我':'敌')+'方'+getDisplayName(best)+' 被击破！</span>');
        } else if(u.side===PLAYER && u.type==='archer'){
          const extraChance = getRelicEffectValue('archerExtraArrowChance', 'archer') + getRelicEffectValue('archerExtraArrowChance');
          if(extraChance > 0 && Math.random() < extraChance){
            best.hp -= u.atk;
            best.hurt = .2;
            const from2 = getUnitCenterCell(u);
            const to2 = getUnitCenterCell(best);
            simFx.spawnProj(from2.col, from2.row, to2.col, to2.row, getRenderColor(u));
            const tp2 = getUnitCenterPixel(best);
            simFx.spawnDamageNum(tp2.x, tp2.y - TILE/4, u.atk, '#9df');
            simFx.addLog('<span class="log-atk">🏹 连射触发！'+getDisplayName(u)+' 追加一箭 -'+simFx.formatDisplayNumber(u.atk)+'</span>');
            if(best.hp<=0){
              if(best.side===PLAYER && best.type==='ultimateCannon' && best.linkedToHq){
                const linkDmg = Math.max(0, Math.round(best.maxHp));
                if(linkDmg > 0){
                  gs.pHp = Math.max(0, gs.pHp - linkDmg);
                  simFx.addLog('<span class="log-kill">⛓ 终极火炮被击破！我方总部同步损失 '+linkDmg+' 生命</span>');
                  simFx.spawnDamageNum(TILE, ROWS/2*TILE-26, linkDmg, '#ff6f6f');
                }
              }
              simFx.spawnDeath(best.col,best.row,getRenderColor(best));
              simFx.addLog('<span class="log-kill">💀 '+(best.side===PLAYER?'我':'敌')+'方'+getDisplayName(best)+' 被击破！</span>');
            }
          }
        }
      }
    } else if(u.type !== 'cannon'){
      // 炮塔不会移动
      if(u.movT>=moveCd){
        u.movT=0;
        const dx = best.col - u.col;
        const dy = best.row - u.row;
        const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
        const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        const candidates = [];

        // 优先前进，其次绕后（侧移/斜切）
        candidates.push({c:u.col + stepX, r:u.row});
        if(stepY !== 0) candidates.push({c:u.col + stepX, r:u.row + stepY});
        candidates.push({c:u.col, r:u.row + 1});
        candidates.push({c:u.col, r:u.row - 1});
        if(stepY !== 0) candidates.push({c:u.col, r:u.row - stepY});

        let bestMove = null;
        let bestScore = Infinity;
        for(const m of candidates){
          const nc=Math.max(FIELD_LEFT,Math.min(FIELD_RIGHT,m.c));
          const nr=Math.max(0,Math.min(ROWS-1,m.r));
          if(nc===u.col&&nr===u.row)continue;
          if(!canUnitOccupyAt(u, nc, nr, us)) continue;

          const dist = Math.abs(best.col - nc) + Math.abs(best.row - nr);
          const lanePenalty = Math.abs(best.row - nr) * 0.12;
          const score = dist + lanePenalty;
          if(score < bestScore){
            bestScore = score;
            bestMove = { c:nc, r:nr };
          }
        }
        if(bestMove){
          u.col = bestMove.c;
          u.row = bestMove.r;
        }
      }
    }
  }
  gs.units=us.filter(u=>u.hp>0);
  return null;
}
