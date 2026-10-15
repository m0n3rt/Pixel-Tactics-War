/* ═══════════════════════════════════════════════════════════
   3D 相机控制（view 层）
   - resetThreeCamera / zoomThreeCamera / bumpThreeShake
   提示文案经 refs.showTip 注入（来自 main.js）
   ═══════════════════════════════════════════════════════════ */
import { clamp } from '../../sim/math.js';
import { threeState, threeRefs } from './state.js';

export function resetThreeCamera(silent){
  if(!threeState.ready) return;
  const cam = threeState.camera;
  const controls = threeState.controls;
  cam.position.set(0, 13.2, 12.6);
  controls.target.set(0, 0, 0);
  controls.update();
  if(!silent) threeRefs.showTip('3D镜头已重置');
}

export function zoomThreeCamera(delta){
  if(!threeState.ready) return;
  const controls = threeState.controls;
  const camera = threeState.camera;
  const target = controls.target.clone();
  const offset = camera.position.clone().sub(target);
  const current = offset.length();
  const step = delta < 0 ? 0.76 : 1.32;
  const nextDistance = clamp(current * step, controls.minDistance, controls.maxDistance);
  offset.setLength(nextDistance);
  camera.position.copy(target).add(offset);
  controls.update();
}

export function bumpThreeShake(amount){
  if(!threeState.ready) return;
  threeState.shake = Math.max(threeState.shake || 0, amount);
}
