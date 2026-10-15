/* ═══════════════════════════════════════════════════════════
   网格 / 占格 / 寻路数据侧（sim 层，不依赖 DOM / Three）
   ═══════════════════════════════════════════════════════════ */
import { TILE, COLS, ROWS, DEPLOY_COLS, FIELD_LEFT, FIELD_RIGHT } from '../data/constants.js';
import { TYPES } from '../data/units.js';

export function getUnitFootprintByType(type){
  const shape = TYPES[type]?.shape;
  if(shape === 'boss' || shape === 'cannon') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

export function getUnitOccupiedCells(unit, colOverride, rowOverride){
  const col = colOverride ?? unit.col;
  const row = rowOverride ?? unit.row;
  const fp = getUnitFootprintByType(unit.type);
  const cells = [];
  for(let dc = 0; dc < fp.w; dc++){
    for(let dr = 0; dr < fp.h; dr++){
      cells.push({ col: col - (fp.w - 1) + dc, row: row - (fp.h - 1) + dr });
    }
  }
  return cells;
}

export function unitOccupiesCell(unit, col, row){
  return getUnitOccupiedCells(unit).some(p => p.col === col && p.row === row);
}

export function canUnitOccupyAt(unitLike, col, row, units){
  const unit = unitLike;
  const cells = getUnitOccupiedCells(unit, col, row);
  for(const p of cells){
    if(p.col < 0 || p.col >= COLS || p.row < 0 || p.row >= ROWS) return false;
    for(const other of units){
      if(other === unit) continue;
      if(other.hp <= 0) continue;
      if(unitOccupiesCell(other, p.col, p.row)) return false;
    }
  }
  return true;
}

export function getUnitCenterCell(unit){
  const fp = getUnitFootprintByType(unit.type);
  return {
    col: unit.col - (fp.w - 1) / 2,
    row: unit.row - (fp.h - 1) / 2,
  };
}

export function getUnitCenterPixel(unit){
  const center = getUnitCenterCell(unit);
  return {
    x: center.col * TILE + TILE / 2,
    y: center.row * TILE + TILE / 2,
  };
}

export function manhattanBetweenUnits(a, b){
  const ca = getUnitCenterCell(a);
  const cb = getUnitCenterCell(b);
  return Math.abs(cb.col - ca.col) + Math.abs(cb.row - ca.row);
}

export function findSpawnTile(side, preferCol, preferRow, units){
  const allUnits = units || [];
  const colRange = [];
  if(side === ENEMY){
    for(let i = 0; i < DEPLOY_COLS; i++) colRange.push(FIELD_RIGHT - i);
  } else {
    for(let i = 0; i < DEPLOY_COLS; i++) colRange.push(FIELD_LEFT + i);
  }
  const rowOffsets = [0, -1, 1, -2, 2, -3, 3];
  for(const col of colRange){
    if(col < FIELD_LEFT || col > FIELD_RIGHT) continue;
    for(const offset of rowOffsets){
      const row = Math.max(0, Math.min(ROWS - 1, preferRow + offset));
      const probe = { type: 'infantry', col, row };
      if(canUnitOccupyAt(probe, col, row, allUnits)){
        return { col, row };
      }
    }
  }
  return null;
}
