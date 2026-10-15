/* ═══════════════════════════════════════════════════════════
   单一可变上下文
   - run:    createRunState() 的对局进度（地图/金币/藏品/商店等）
   - battle: createBattleState() 的战斗状态（原 gs）
   - view:   Three.js 句柄（scene/camera/renderer/groups 等）
   各层通过它共享运行时引用，避免模块间互相 import 可变绑定。
   ═══════════════════════════════════════════════════════════ */
export const ctx = {
  run: null,      // 对局状态
  battle: null,   // 战斗状态
  view: null,     // 3D 句柄
};
