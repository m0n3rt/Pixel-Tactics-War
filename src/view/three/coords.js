/* ═══════════════════════════════════════════════════════════
   Three 坐标换算（view 层，纯函数，依赖 data/constants）
   ═══════════════════════════════════════════════════════════ */
import { COLS, ROWS, TILE, THREE_CELL } from '../../data/constants.js';

export function gridToWorld(c, r){
  return {
    x: (c - (COLS - 1) / 2) * THREE_CELL,
    z: (r - (ROWS - 1) / 2) * THREE_CELL,
  };
}

export function worldToGrid(x, z){
  const c = Math.round(x / THREE_CELL + (COLS - 1) / 2);
  const r = Math.round(z / THREE_CELL + (ROWS - 1) / 2);
  if(c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

export function pixelToWorld(px, py){
  const gridX = px / TILE - 0.5;
  const gridY = py / TILE - 0.5;
  return {
    x: (gridX - (COLS - 1) / 2) * THREE_CELL,
    y: 0,
    z: (gridY - (ROWS - 1) / 2) * THREE_CELL,
  };
}
