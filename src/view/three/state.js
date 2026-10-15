/* ═══════════════════════════════════════════════════════════
   view/three 层的可变状态与 main.js 局部依赖注入
   - threeState：Three 句柄（scene/camera/renderer/groups/fx…）
   - threeRefs：  main.js 局部函数/变量（showTip、gridPlace、hover 别名等），
                 避免 view 层直接 import main.js
   ═══════════════════════════════════════════════════════════ */

export const threeState = {
  ready: false,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  boardGroup: null,
  unitGroup: null,
  fxGroup: null,
  overlayRoot: null,
  hoverMesh: null,
  hoverRangeMesh: null,
  hoverRangeGlow: null,
  raycaster: null,
  mouseNdc: null,
  boardPlane: null,
  boardWidth: 0,
  boardDepth: 0,
  unitHudMap: new Map(),
  fx: [],
  castles: { player: null, enemy: null },
  shake: 0,
};

export const threeRefs = {
  showTip: null,            // (msg) => void
  formatDisplayNumber: null, // (n) => string
  fitCanvas: null,          // () => void
  gridPlace: null,          // (c, r) => void
  gridRemove: null,         // (c, r) => void
  updateTooltip: null,      // (x, y) => void
  getPaused: null,          // () => boolean
  getHoverCol: null,        // () => number
  getHoverRow: null,        // () => number
  setHover: null,           // (c, r) => void
  getPlayerHqMax: null,     // () => number
  threeStage: null,         // DOM: #three-stage
  threeOverlay: null,       // DOM: #three-overlay
  elTooltip: null,          // DOM: #unit-tooltip
  canvas: null,             // DOM: #game-canvas
};

export function bindThreeRefs(refs){
  Object.assign(threeRefs, refs);
}
