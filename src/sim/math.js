/* ═══════════════════════════════════════════════════════════
   纯函数工具（sim 层，不依赖 DOM / Three / 运行时状态）
   ═══════════════════════════════════════════════════════════ */

export function clamp(v, min, max){
  return Math.max(min, Math.min(max, v));
}

export function lightenHexColor(hex, amount){
  if(typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  let h = hex.slice(1);
  if(h.length === 3){
    h = h.split('').map(ch => ch + ch).join('');
  }
  if(h.length !== 6) return hex;
  const n = parseInt(h, 16);
  if(Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = Math.max(0, Math.min(1, amount || 0));
  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);
  const toHex = v => v.toString(16).padStart(2, '0');
  return '#' + toHex(nr) + toHex(ng) + toHex(nb);
}
