# 任务：Pixel-Tactics-War 在不损失任何游戏功能的前提下拆分 main.js

你是资深前端 / 游戏客户端重构工程师。请对 GitHub 仓库 **m0n3rt/Pixel-Tactics-War** 做**纯结构重构**。

目标：把约 5110 行的 `main.js` 拆成可维护的 ES module 目录，**玩法、数值、流程、UI、快捷键、3D 表现必须与重构前逐项一致**。本任务不是重做游戏，不是换引擎，不是优化手感，不是改平衡。

---

## 0. 硬性约束（违反任一条款即失败）

1. **零玩法变更。** 禁止改公式、概率、关卡生成、AI 布阵、藏品效果、准备时间、部署点、单位上限、总部伤害、隐藏地图、炮塔、Boss、骰子、宝箱权重。
2. **零功能缺失。** 首页、图鉴、难度、地图、事件、商店、奖励、战斗、暂停、倍速、再部署、清空部署、增援库存、镜头缩放/重置、增益总览、通关、回标题，全部保留。
3. **零视觉回归（逻辑层面）。** 不要顺便重做 3D 材质、不要删除 OrbitControls、不要关掉现有特效。旧 Canvas 绘制代码若仍被调用则必须保留；只有在你能证明 Three.js 路径已完全替代且行为一致时，才允许把它挪到 `canvas-legacy.js` 且仍导出同样函数。
4. **不要改 `index.html` 的 DOM 结构**（可以只改 script 路径，例如 `src/main.js`）。不要改文案、按钮 id、class（除非为修明显的引用错误）。
5. **不要改 `style.css` 的视觉**（除非选择器因文件移动必须微调，原则上不要动）。
6. **不要改 `vendor/three.module.js`、`vendor/OrbitControls.js`。**
7. **不要引入打包器、TypeScript、React、构建步骤。** 继续用浏览器原生 ES module：`index.html` 保持 `<script type="module" src="...">`。
8. **不要“顺便”重构算法、重命名玩家可见字符串、合并藏品、删除 +2% 类效果、把准备时间从 60 改掉。**
9. **`relics.json` 的 key / effects / 价格 / 叠层语义保持不变。** 加载失败时仍回退到内置 `RELIC_DEFS`（现有行为）。
10. **`exportRelicDefs()` 必须仍可在控制台调用**（可挂到 `window.exportRelicDefs`）。
11. 每个提交/每次改动后游戏必须能直接打开 `index.html`（或现有 `npm run serve`）运行。
12. 若不确定某段代码是否死代码：**默认保留**，只搬家，不删除。

---

## 1. 仓库现状（以当前 main 分支为准）

### 1.1 文件

```
index.html          # 已是完整 UI 壳：标题/图鉴/难度/地图/事件/商店/奖励/战斗/暂停 等
main.js             # ~5110 行，全部逻辑 + Three.js + DOM 事件，已是 ES module
style.css
relics.json
package.json        # 仅有 serve 脚本
vendor/three.module.js
vendor/OrbitControls.js
藏品配置使用说明.md
```

`index.html` 末尾：`<script type="module" src="main.js"></script>`

`main.js` 开头：

```js
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
```

战斗舞台同时存在：

- `#three-stage` / `#three-overlay`（Three.js 3D 战场，这是现行主表现）
- `#game-canvas`（legacy canvas，类名 `legacy-canvas`）

README 仍写“纯 Canvas、无依赖”，**以代码为准，不是 README**。

### 1.2 main.js 现有分区（约略行号，搬家时按符号名而不是死记行号）

| 区域 | 约略行 | 内容 |
|---|---|---|
| 常量 | 11–63 | TILE/COLS/ROWS/HQ、PREP_TIME_*、DP、伤害比、UNIT_CAP、MAP_*、TYPES |
| 难度 | 65–77 | DIFFICULTY_LEVELS |
| Buff | 79–100 | BUFF_TEMPLATES |
| 地图节点 | 102+ | NODE_TYPES |
| Boss / 祝福 | 112–145 | BOSS_POOLS、STARTER_BLESSINGS |
| 藏品 | 146–267 | RELIC_DEFS、BASE_RELIC_KEYS、CHEST_RELIC_WEIGHTS、loadRelicConfig、exportRelicDefs |
| DOM 查询 | 276–439 | 大量 getElementById |
| 全局 let | 440–490 | gs 相关、paused、speed、地图进度、金币、shopState、relics 等 |
| Three.js | 492–1639 | 坐标转换、单位 mesh、城堡、相机、HUD、特效、init/resize/render |
| 单位/占格/增援 | 1644–1890 | mkUnit、footprint、occupy、reinforcement stock |
| 藏品数值/商店 | 1958–2460 | getRelicEffectValue、grantRelic、商店宝箱/治疗/骰子 |
| 开局流程 | 2729–2962 | newGame、nextRound、enterPrep、backToTitle、victory |
| 增益面板 | 2988–3088 | buildStatsHTML |
| 难度 UI | 3095–3122 | |
| 地图 | 3130–3320 | generateMap、drawMap、点击 |
| 奖励 | 3343–3475 | |
| 事件 | 3489–3620 | EVENTS 数组 + 事件屏 |
| AI / 炮塔 | 3629–3730 | spawnAI、getTowerCount/Stats |
| 布阵交互 | 3731–3827 | |
| tooltip / 图鉴 | 3827–4112 | |
| 按钮与键盘 | 4225–4408 | |
| UI 更新 / 主循环 | 4409–4486 | |
| 战斗 tick / 结算 | 4487–4712 | |
| 旧 Canvas 绘制 | 4713–5104 | 网格/城堡/单位/粒子 |
| 启动 | 5105+ | |

**拆分时以函数名为准。** 行号会变。

---

## 2. 目标目录（必须按此形状，不要另起一套）

```
index.html                         # script 改为 src/main.js；DOM 保持
style.css
relics.json                        # 可保留根目录，或移到 src/data/relics.json（若移动，改加载路径）
vendor/                            # 原样
src/
  main.js                          # 入口 < 250 行：加载数据、创建状态、绑定屏幕、启动 rAF
  data/
    constants.js                   # TILE/COLS/公式常量/PLAYER 等
    units.js                       # 从 TYPES 抽出（可仍是 JS 对象；若改 JSON 必须深拷贝等价）
    difficulty.js
    buffs.js
    nodes.js
    bosses.js
    blessings.js
    events.js
    chest-weights.js               # BASE_RELIC_KEYS + CHEST_RELIC_WEIGHTS
    relics-fallback.js             # 内置 RELIC_DEFS 默认值（加载 JSON 失败时用）
  state/
    ctx.js                         # 单一可变上下文，避免 20 个文件互相 import let
    run-state.js                   # createRunState / resetRunState
    battle-state.js                # mkState → createBattleState
    relics-state.js                # createEmptyRelicState
  sim/
    math.js                        # clamp、lightenHexColor 等纯函数
    grid.js                        # footprint / occupy / manhattan / findSpawnTile
    unit.js                        # mkUnit、display name/letter/color
    relics.js                      # 效果解释器、grant、限时层、金币攻速等
    combat.js                      # 战斗 tick、投射物生成数据、总部伤害结算
    ai.js                          # spawnAI、炮塔数量与属性
    bosses.js                      # pickBosses、onHit、召唤、updateBossState
    particles.js                   # 逻辑粒子队列（若与 Three fx 紧耦合，可暂放 view，但不要复制两套伤害）
  run/
    flow.js                        # newGame / nextRound / enterPrep / backToTitle / 胜负跳转
    map.js                         # generateMap、isNodeAccessible、onMapNodeClick 的数据侧
    shop.js                        # 商店状态机（开箱/买/留/丢/治疗/骰子/离开）
    rewards.js                     # 三选一、starter blessing
    events.js                      # 事件选项结算（纯结果）
    encounter.js                   # 隐藏图、遭遇修正、进战斗前的敌人加成
  view/
    dom.js                         # 一次性查询 DOM 并导出引用（可选；或各 screen 自己查 id）
    hud.js                         # 顶栏、日志、tooltip、message、gold badge
    three/
      coords.js
      camera.js
      castle.js
      units.js
      fx.js
      renderer.js                  # initThreeRenderer / resize / renderThree
    canvas-legacy.js               # 旧 Canvas 绘制，保持可调用
    screens/
      title.js
      difficulty.js
      map.js                       # drawMap 的 DOM
      shop.js
      event.js
      reward.js
      codex.js
      stats.js
      pause.js
      victory.js
  input.js                         # 键盘、布阵点击、镜头按钮绑定
```

模块过少（仍然一个 4000 行文件）或过多（一函数一文件）都不合格。单个文件建议 80–400 行，`combat.js` / `renderer.js` 允许到 ~600 行。

---

## 3. 依赖方向（必须单向）

```
data  →  state  →  sim  →  run  →  view / input  →  main
```

- `sim` **禁止** import DOM、禁止 import Three、禁止 `getElementById`。
- `run` **禁止** 直接操作 mesh / OrbitControls；只改 run/battle 数据，再让 view 同步。
- `view` 可以读 state；写状态应通过调用 `run/` 或 `sim/` 的函数（例如 `grantRelic`、`gridPlace`），不要在 click 里复制一份伤害公式。
- 若出现循环依赖：用 `state/ctx.js` 持有运行时引用，或把共享纯函数下沉到 `sim/math.js` / `data/`。

---

## 4. 状态如何收拢（这是拆文件的前提）

当前失败模式：几十个顶层 `let`（paused、speed、playerGold、playerRelics、mapNodes、shopState、gs…），拆文件后会到处 import 可变绑定。

请改成：

```js
// src/state/ctx.js
export const ctx = {
  run: null,      // createRunState() 的返回对象
  battle: null,   // 原 gs
  view: null,     // three 句柄：scene/camera/renderer/groups 等
};
```

`createRunState()` 必须包含（字段名可内部整理，但语义一个不能少）：

- gameDifficulty、playerBuffs、playerGold、pendingGoldFromBattle
- playerRelics（经 createEmptyRelicState）
- mapNodes、currentNodeIndex、eliteMultiplier、currentNodeType
- stageLevel、currentMapIndex、currentMapLayer、routeLockedFromIndex
- currentBossProfile、currentMapBossProfile、selectedBosses
- currentMapIsHidden、towerCountBeforeHiddenMap、pendingMainMapIndex
- pendingStarterBlessing、pendingRewardAction
- currentEncounterModifiers
- shopState 及其附属（shopDiceRolling、lastShopChestOpensLeft 等）
- lastDeployment、reinforcementStock、selectedReserveIndex
- selUnit、paused、speed、hoverCol/hoverRow、particles 等战斗期字段

**重置点必须只走工厂函数：**

- `newGame()`
- `backToTitle()`
- 全局初始

现在藏品状态在多处手写初始对象，很容易漏 key。重构后 **只允许 `createEmptyRelicState()` 一处** 定义所有 relic key。这是行为保持：漏 key 的旧 bug 若存在，以 `createEmptyRelicState` 覆盖三处后的正确行为为准（即所有 `relics.json` 的 key 都要出现在空状态里）。

---

## 5. 必须保持的行为清单（验收用）

请在完成后自己对照。缺一条就不算完成。

### 流程

- 标题 → 图鉴 → 返回标题
- 标题 → 难度（按钮 + 滚轮）→ 确认开始 → loading → 地图
- 低难度的初始祝福（pendingStarterBlessing）仍按原条件出现
- 地图节点：普通战 / 精英 / 问号 / 商店 / Boss / 隐藏图逻辑与 `shouldEnterHiddenMap` 等原函数一致
- 战斗：准备阶段布阵 → Space/按钮开战 → 自动战斗 → 结算弹窗 → 奖励 → 回到地图或下一图
- 通关庆祝、失败再来一局 / 回标题
- 退出确认：暂停 → 退出 → 二次确认 → 回标题且进度丢弃

### 战斗与操作

- 1/2/3 选兵、点击放置、右键或点击己方单位移除（保持原逻辑）
- 一键再部署、清空部署、增援库存点击上场
- 终极火炮（ultimateCannon）不被清空部署删掉，开战时仍 triggerUltimateCannonStrike
- P 暂停、+/- 或原按钮倍速 1×/2×/3×
- 镜头：重置、放大、缩小
- 悬浮 tooltip、战斗日志分频道、伤害数字、受击闪、爆炸
- 总部 HP 钳制、摧毁表现

### 成长

- relics.json 热加载；失败回退内置定义
- 商店：开箱、买、留、丢、点燃篝火、掷骰、离开、决策确认框
- 藏品 effects 解释器支持的类型一个不删（含 timed durationByClearedBattles、hqReviveOnce、按金币加速等）
- 增益/藏品总览在地图、事件、商店、暂停、战斗中都可打开
- 控制台 `exportRelicDefs()`

### 技术

- `window.resize` 仍 fitCanvas + resizeThreeRenderer
- 窄屏布局对 log / reserve 宽度的原判断保留（innerWidth 1180 / 920 等）

---

## 6. 实施顺序（必须按这次序，每步可运行）

**Step A.** 建目录 + 把 `main.js` 原样移到 `src/main.js`，修正 three 的 import 路径为 `../vendor/...`，修正 index.html 的 script src。确认游戏能跑。

**Step B.** 抽出 `data/*`（常量、TYPES、难度、buff、boss、事件、宝箱权重）。`src/main.js` 改为 import 这些常量。行为不变。

**Step C.** 抽出 `createEmptyRelicState` / `loadRelicConfig` / 效果解释器到 `sim/relics.js` + `state/relics-state.js`。商店 UI 可仍留 main。确认开箱买藏品进战斗仍生效。

**Step D.** 建立 `ctx` + `createRunState` + `createBattleState`，删除散落 let（除模块局部缓存）。`newGame` / `backToTitle` 只重置工厂结果。

**Step E.** 抽出 `sim/grid.js`、`sim/unit.js`。布阵仍暂时在 main/input，但调用 sim。

**Step F.** 抽出 `view/three/*`，对外只留：

```js
initThree(container)
resizeThree()
renderThree()
syncFromBattle(battleState)
resetCamera()
zoomCamera(delta)
// 以及现有 addThreeProjectile / damage / explosion / shake 的等价导出
```

战斗 tick 不要在算伤害的同一函数里直接碰 mesh：先改数据，再 sync。若当前代码高度缠在一起，允许 **第一步先原样搬家到 three 模块且保持函数级调用**，不要为了“干净架构”重写战斗。优先保功能。

**Step G.** 抽出 `run/map.js`、`shop.js`、`rewards.js`、`events.js`、`flow.js` 和对应 `view/screens/*`。各 screen 自己 bind 按钮。

**Step H.** 抽出 `sim/combat.js`、`sim/ai.js`、`sim/bosses.js`。主循环只协调：倒计时 / combat.tick / particles / view.sync / hud.update。

**Step I.** `src/main.js` 瘦到入口。旧 Canvas 放到 `canvas-legacy.js`，仍被调用则继续调用。

每一步结束后用第 5 节清单抽测。不要积累“等全部拆完再测”。

---

## 7. 编码规范（配合本仓库）

- 继续用现有风格：普通 function、let/const、中文注释可保留。
- **不要**突然改成 class 继承体系、ECS、Redux。
- 导出用命名导出。不要 default export 大杂烩。
- DOM id 继续用现有字符串（`btn-start-game`、`map-screen` 等）。
- 相对路径 import，扩展名 `.js` 必须写上（浏览器原生 module）。
- Three 的 import 路径随文件位置调整，例如 `view/three/renderer.js` 使用 `../../../vendor/three.module.js`。
- 若使用 JSON：`fetch('./relics.json')` 的基准路径随页面位置变化；保证本地直接打开或 `npx serve .` 都能加载。若 `file://` 原可工作，不要弄坏；项目本来就建议 serve。
- 禁止引入 prettier 大规模重排无关代码，以免 diff 无法审查。搬家时尽量保持函数内部原样。

---

## 8. 交付物

1. 完整可运行的拆分后源码。
2. 更新 `index.html` 的 script src。
3. 在 README.md 顶部或新文件 `STRUCTURE.md` 用一页说明目录职责（中文）。
4. 更新 `藏品配置使用说明.md` 里的路径（若 `main.js` / relics 相对路径变了）。
5. 最后列出：**你改动过的行为**（按理应为空）。若不得不改，必须单独加粗说明原因。任何静默改数值都算失败。

---

## 9. 自检命令（无自动化测试时）

- 用本地静态服务器打开，浏览器控制台 **零报错**（含模块 404、import 循环导致的 TDZ）。
- 确认 `window.exportRelicDefs` 可用。
- 断网/错误 relics.json 时游戏仍能进标题（回退内置定义）。

不要写新的大型测试框架。若你加测试，必须是额外文件且不影响运行。

---

## 10. 给执行模型的工作方式

- 先读完整 `main.js` 和 `index.html`，列出将移动的符号表，再开始改文件。
- 不要凭 README 猜测功能。
- 不要把 Three 场景重写成新的渲染器。
- 不要把自动战棋改成回合制。
- 冲突时：**保功能 > 目录美观**。

开始执行。
