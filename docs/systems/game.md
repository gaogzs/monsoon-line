# 主控、状态机与 UI 装配

代码：`js/game.js`（3358 行） · 导出全局对象 `Game` 与 `Radio`

> 这是加载顺序的**最后一个模块**，也是唯一“看得见全部其它模块”的地方。它干四件事：切屏幕、跑主循环、装配所有 DOM 界面、把玩家输入翻译成 `Ent` / `AI` 能吃的指令。启动靠 `js/game.js` 文件末尾（IIFE 之外）的 `window.addEventListener('load', ...)` → `Game.init()`，所以它必须最后一个加载。输入映射表与设置项清单在 [hud.md](hud.md#输入映射)，本文只讲它们**背后怎么实现**。

---
## 模块定位与对外接口
文件里是两个互相独立的 IIFE，各自挂一个全局 `var`：

| 全局 | 依赖 | 职责 |
|---|---|---|
| `Radio` | `VOICES`、`SFX`、DOM 元素 `#radio` | 台词队列 + 字幕淡入淡出 |
| `Game` | 其余全部模块 | 状态机、主循环、UI 装配、设置、输入、相机、发射、结算 |

`Radio` 定义在 `Game` 之前；`Game` 通过 `newWorld()` 里的 `w.radio = Radio` 把它交给任务脚本，所以 `missions.js` 里写的是 `world.radio.raw(...)`，而不是直接抓全局。文件第一行是 `'use strict';`，`Game` / `Radio` 都是 `var` 挂上去的全局。

### `Game` 的导出（`game.js` 末尾）

| 成员 | 签名 | 语义 |
|---|---|---|
| `init` | `init()` | 唯一入口：自检 → 载设置 → `Renderer.init` → `bindInput` → 绑按钮 → `show('title')` → 启动 `loop` |
| `startMission` | `startMission(idx)` | 用 `MISSIONS[idx]` 起一局。出击、重试、下一关都走它 |
| `__player` | `__player()` | 返回当前 `player`，未开局为 `null` |
| `__world` | `__world()` | 返回当前 `world`，未开局为 `null` |
| `__pushStores` | `__pushStores(a)` | 直接暴露内部的 `pushStores`：断言要能单独喂一架飞机进来，数它画了几个挂载 |

后三个是**给 `tools/smoke.js` 做断言用的调试口**，不是玩法接口。局内状态全部藏在 IIFE 闭包里：`state / paused / world / player / mission / missionIdx / activeCampaign / selectedAC / loadouts / activeHpGroup / keys / mouse / aimMode / camYawBase / camPitchSmooth / banner / hits / stats / cleared / S`。

### `Radio` 的导出

| 成员 | 签名 | 语义 |
|---|---|---|
| `play` | `play(missionId, evt)` | 把 `VOICES[missionId][evt]` 整组台词压入队列；表或键不存在时静默返回 |
| `raw` | `raw(line)` | 压入单条台词对象 `{ who, cls, tx, gap }` |
| `update` | `update(dt)` | 推进出队计时与淡出。**只有 `update(dt)` 会调它** |
| `clear` | `clear()` | 清空队列、活动字幕数组与 `#radio` 的 `innerHTML` |

---
## 屏幕状态机
`state` 是字符串，取值与 DOM 屏幕 id 一一对应（`#scr-<id>`）：`title · campaign · brief · hangar · codex · settings · help · changelog · debrief`，外加一个**没有 DOM 屏幕**的 `playing`。`show(id)` 是唯一的菜单切换入口：

```js
function show(id) {
  if (id) Radio.clear();                 // 离开战斗界面时清掉通讯记录
  var all = document.querySelectorAll('.screen');
  for (...) all[i].classList.remove('active');
  if (id) { var s = document.getElementById('scr-' + id); if (s) s.classList.add('active'); }
  state = id || 'playing';               // 没给 id 就是进战斗
}
```

三个要点：

1. **`playing` 不是 DOM 屏幕**。`startMission()` 直接 `hideAll(); state = 'playing';`，`show()` 不被调用（`hideAll()` 只摘 `active`，不动 `state`）。
2. **`state = id || 'playing'`** 意味着 `show(null)` / `show('')` 也等于进战斗；而 `show('foo')` 会**把 `state` 设成 `'foo'` 却什么屏幕都不激活** —— 这是没有兜底 `else` 的副作用。
3. **离开战斗必须 `Radio.clear()`**。字幕的淡出靠战斗循环里的 `Radio.update()` 推进；一回到菜单就再没人管它们，最后几条会永远挂在屏幕上（从战斗返回主菜单后残留的通讯记录就是这个原因）。

### `data-go` 与“没有兜底 `else`”
`init()` 把 `document.querySelectorAll('[data-go]')` 全部绑上同一个 `click`：

| `data-go` | 动作 |
|---|---|
| `campaign` | `buildCampaignList(); show('campaign')` |
| `hangar` | `buildHangar(); show('hangar')` |
| `brief` | 若 `activeCampaign` 不含 `missionIdx` 则夹回本战役首关，然后 `buildBrief(); show('brief')` |
| `codex` | `buildCodex(); show('codex')` |
| `settings` | `buildSettingsInto(#setWrap); show('settings')` |
| `help` | `buildHelpPage(); show('help')` |
| `changelog` | `buildChangelog(); show('changelog')` |
| `title` | `show('title')` |

**先 `build*` 再 `show`**：机库/简报的内容随任务与机体变化，每次进屏幕都重新装配一遍，省掉“数据变了但界面还是旧的”这类同步问题。

**为什么没有兜底 `else`**（源码注释明写）：早先的写法让任何拼错的 `data-go` 值都静默跳回标题页，出问题时完全看不出哪里错了。现在未知值**什么也不做** —— 改动时如果点了按钮没反应，第一件事就是查 `data-go` 字符串。

**别的入口**：`Esc` 在 `playing` 时 `togglePause()`、在 `campaign / hangar / codex / help / changelog / brief` 时回 `show('title')`、其余状态什么也不做；`window` 的 `blur` 清空 `keys`、松开左右键并**战斗中自动暂停**（切出去不会让飞机继续飞）；暂停菜单三页签 `main / settings / help` 由 `switchPauseTab(name)` 切 `[data-ptab]` 与 `#pane-*` 的 `.on`。

### 战役层（`campaign`）

标题 → **campaign** → brief → hangar → playing 是现在的菜单主链。战役层只做两件事：

- **分组**：`buildCampaignList()` 按 `CAMPAIGNS` 渲染卡片；`missions: []` 的战役画成不可点的“资料封存”卡（不写地名与年份）。
- **限定范围**：`buildMissionList()` 只列 `CAMPAIGNS[activeCampaign].missions` 里的关卡，
  序号按战役内位置重编为 `OPERATION 01…10`（**不看 `m.no`** —— 那是全局编号，
  新战役的关会是 11，直接拿来当战役内序号会跳号）。

**关卡卡片的排布用 grid，不是 flex。** `.msn-list` 原来是
`display:flex; flex-wrap:wrap` 配 `.msn-item{ flex:1 1 190px }` ——
同一行里的卡片会互相拉伸填满整行，于是十一关排出来是
“第一行六张被压窄、第二行四张被撑宽”，行与行宽度不一致。
现在用 `grid-template-columns:repeat(auto-fill, minmax(200px,1fr))`：
**所有卡片同宽**，列数随窗口变化，最后一行不满只留空位。
`.nm` / `.st` 配了 `nowrap + ellipsis`，卡片再窄也不会折行。

**索引只有一套。** `missionIdx` 始终是 `MISSIONS` 的全局下标，`startMission(idx)` 的语义
和 `tools/smoke.js` 的 `Game.startMission(mi)` 都没变；`activeCampaign` 只决定
“列哪几关”和“返回回哪一层”。战役 → 简报时若 `missionIdx` 不在本战役里就夹回首关，
避免看到别人战役的简报。

“下一任务”（`#btnNext`）**只在本战役内推进**，到本战役末关置灰并显示“本战役已完结”，
跨战役必须回战役选择屏。战役的分组数据与加战役清单见
[missions.md §2.4](missions.md#24-战役campaigns) 与 [DESIGN.md §11](../DESIGN.md#11-如何加一场战役)。

---
## 主循环
```js
function loop(ts) {
  requestAnimationFrame(loop);              // 先排队，再干活：中途异常也不断帧
  var dt = (ts - last) / 1000;
  last = ts;
  if (!isFinite(dt) || dt <= 0) dt = 0.016; // 首帧/异常时间戳的兜底
  if (dt > 0.05) dt = 0.05;                 // 上限
  if (state === 'playing') {
    if (!paused) { update(dt); render(); }
    else         { render(); }              // 暂停：只画，不推进
  } else {
    if (player && world) render();          // 结算页背后继续画战场快照
    else { Renderer.begin(); Renderer.end(); }
  }
}
```

- **`dt` 上限 0.05s**：切标签页再切回来时，两帧间的真实间隔可能是几秒；不夹的话一次 `update` 会把飞机瞬移出几公里、导弹瞬间命中。0.05 = 20 FPS，是“最慢的可玩帧率”的等价步长。
- **暂停时只停 `update`，`render` 照跑** —— 这是设置能热调整的前提：玩家在暂停菜单里拖 FOV / 镜头距离滑块，画面立刻变。见 [DESIGN.md §4.2](../DESIGN.md#42-主循环)。
- 首帧的 `last` 不是 0：`init()` 结尾用 `requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); })` 把第一帧时间戳先吃掉，避免第一帧 `dt` 巨大。
- 正常玩下来 **`update` 永远在 `render` 之前**，而相机计算是 `update` 的最后一步。

### `update(dt)` 的顺序（顺序有语义）
```
world.time += dt;  Radio.update(dt)                     ← 字幕计时
if (player.alive) controlPlayer(dt) else SFX.gun(false)
Ent.stepAircraft(player);  updateEWAuto(dt)             ← 协处理器可能已自主开机
                           updateLock(dt);  updateDEW(dt, player)
                           updateJamming(dt)            ← 范围压制场（下游的烧穿路线）
                           updateAewc(dt)               ← 预警机：通报 / 调度 / 沉默
for 每架 AI：AI.update → Ent.stepAircraft → updateDEW
watchdog(dt)                                            ← 所有飞机步进之后
导弹 / 子弹 step → resolveBullets(dt) → updateTargets(dt) → Ent.stepParticles
最近一架 NPC 的引擎声 / 导弹告警 / 引擎音 / 地形与失速音
mission.tick(world, dt);  compact()                     ← 三数组去死 + 粒子上限
击杀统计 → mission.lose / mission.win → finish()（命中即 return）
僚机损失台词（flags.allyDown 一次性触发器）
updateCamera(dt)                                        ← 相机放在实体全部就位之后
hits / banner 计时衰减
```

`mission.lose()` / `mission.win()` 命中时**直接 `return`**，所以那一帧不再 `updateCamera` —— 无所谓，`finish()` 已切到 `debrief`，下一帧 `loop` 走另一条分支。

### 电子战与支援单位：每帧的三个环节

| 函数 | 干什么 | 为什么在这个位置 |
|---|---|---|
| `updateEWAuto(dt)` | 电子战协处理器的**自主决策**（设定 7.3）：被主动雷达盯上、吊舱已冷却时自己开机 | 在 `updateLock` 之前，同一帧生效。`player.ewAuto` 可关；EMCON-Δ 期间强制闭嘴 |
| `updateJamming(dt)` | 结算**范围压制场**：先把所有 actor 的 `suppressed` 清零，再按"干扰机 → 半径内的敌人"重算 | 在所有位置更新之后 —— 压制是"此刻被照着"，不是累积状态 |
| `updateAewc(dt)` | 预警机的活跃运用：30 km 搜敌 → 方位通报 → 调度僚机 / 分配目标 → 被压制时沉默 | 在 AI 循环之前 —— 它给下游 AI 设的 `target` 当帧就能用 |

**`suppressed` 是这三套东西的共同输入**：HUD 的雷达雪花、僚机的"数据链中断"降级、预警机的沉默都读它。

开机只有一个入口 `fireEcm(actor, wid)`（手动扣扳机 / 协处理器自主 / 任务脚本的干扰机航线到站），
它内部调 `Ent.openEcm()` 写状态、再扣冷却与播报。`toggleEmcon()` 是 EMCON-Δ 的开关（`N`）。

### `render()` 的职责
`state !== 'playing' || !world || !player` 时只 `Renderer.begin() + end()`（空镜头背景）并返回。否则：

```
Renderer.begin()
pushModel 目标物（MODELS[t.model]；30 km 外的调节单元跳过）→ 飞机（含 sweep）→ pushStores(a) → 导弹 → Renderer.flush()
drawTracers()                     ← game.js 自己的曳光，加色混合，画在模型之上
Renderer.drawParticles(world.particles);  Renderer.end()
HUD.draw(world, player, 0, S)     ← 在 end() 之后，所以不跟着抖；dt 传的是 0（渲染不推进 HUD 的计时）
banner / hitMark / 鼠标引导的 CMD 瞄准环（“被对空雷达截获”已移进 HUD 告警栈）
```

调节单元每关 9–54 个、大多在远处，`render()` 用 `CELL_DRAW_RANGE2`（30 km 的平方）把远的直接跳过 —— 雾里一个点，画了也看不见。HUD 那边另有一道 10 km 的 `farCell()`（见 [hud.md](hud.md)）。

曳光长度按距离自适应（`min(90, max(13, bDist * 0.045))`）—— 固定 13 米在 1500 米外只有 0.5°，看起来像“弹速很慢”。

---
## 世界生命周期
### `newWorld()`
普通对象，没有类（与 [DESIGN.md §4.3](../DESIGN.md#43-世界对象) 一致）：

```js
{ time, actors: [], missiles: [], bullets: [], particles: [], targets: [],
  wings: {}, player: null, flags: {},
  objective: '', objectiveSub: '',
  detected: false,
  killed: 0, hitsLanded: 0, shotsFired: 0,
  timeLimit: 0, timeLeft: 0, groundKilled: 0 }
```

- `timeLimit` / `timeLeft` —— 关卡时限（秒）。`startMission` 从 `mission.timeLimit`
  落进来；主循环倒计时，归零时由**统一的一处**判负
  （`world.timeLimit > 0 && world.timeLeft <= 0 → finish(false)`）。
  任务脚本只要声明 `timeLimit`，不需要自己写倒计时；`0` 表示无时限，
  HUD 也不画读秒。此前 `mission.timeLimit` 声明了却全项目没人读。
- `groundKilled` —— 被摧毁的地面/海面目标数，由 `Ent.killGround` 累加。
  `killed` 只统计 `team === 1` 的**飞机**，设施与舰船从不进那个数，
  所以"摧毁 3 座浮空平台"必须单独记一笔。

两个后挂的成员：`w.radio = Radio`；`w.fireMissile(actor, target)` —— **AI 唯一的发射入口**，内部转 `launch(actor, target, w)`，非玩家发射时按距离播 `SFX.missileAt()`（玩家那一路在 `fireSpecial()` 里已播过 `SFX.missile()`，刻意不重复）。

### `startMission(idx)`
1. `missionIdx = idx`；`mission = MISSIONS[idx]`；`world = newWorld()`；`stats = { startTime: 0, endTime: 0 }`；然后 `Ent.makeAircraft({ type, team: 0, isPlayer: true, y: mission.altStart, fwd: (0,0,1), speed: mission.speedStart })`。
2. 把机库配置落到飞机上：`p.loadoutList = resolveLoadout(ac, lo)`；`p.ammoPool[wid] = ammo`；`p.slotCd[wid]` **一个挂点一个槽**（长度 = `e.salvo`），储备少于挂架数时多出来的槽填 `Ent.SLOT_EMPTY`（`1e9`，语义是“这个挂架本来就空着”，`stepAircraft` 里永不装填）；`p.loadFactor = loadK`；被动吊舱经 `passiveEffects()` 汇成 `p.armor / p.lockResist / p.lockRangeK / p.flares`；`p.loadout = lo` 留一份给 HUD 画挂载俯视图。
3. `p.name = p.label = CALLSIGN.player`；入 `world.actors`；写回闭包 `player`；`mission.spawn(world)` —— 敌机、平台、僚机全由任务脚本自己造。
4. 初始镜头 `camFwd = p.fwd`、`camUp = (0,1,0)`、`camPos = p.pos + (0, 30, -110)`；`Radio.clear()` → `Radio.play(mission.id, 'start')`；横幅 `banner = { t: 3.4, ... }`。
5. `hideAll(); state = 'playing'; paused = false;` 摘掉暂停层，`p.target = null`。

### `finish(win)`
- `if (win) cleared[MISSIONS[missionIdx].id] = true;` —— **`cleared` 是本次会话内的对象，刷新页面就丢**（见 [DESIGN.md §8](../DESIGN.md#8-已知问题与待改进) 第 5 条），但键已经改成 `mission.id` 而不是下标：新战役的关卡是接着 `MISSIONS` 追加的，按下标记会让进度错位；`buildMissionList()` 与 `buildCampaignList()` 都读它显示“已完成”。
- 结算数值当场算：

  ```js
  acc  = shotsFired > 0 ? hitsLanded / shotsFired : 0
  hull = player.alive ? player.hp / player.maxHp : 0
  score = killed*1000 + groundKilled*400 + round(acc*3000) + round(hull*2000)
          + (win ? 4000 : 0) - friendlyLoss*2500
  ```

  评级：`!win → F`；`score >= 16000 && penalty === 0 → S`；`>= 11000 → A`；`>= 7000 → B`；否则 `C`。

  **两个刻意的口径**：
  - `groundKilled` 的权重 **400 低于一架飞机的 1000** —— 设施不会还手也不会跑，
    按飞机同价会让"打平台刷分"比空战划算。
  - 结算表那一栏叫 **「机炮精度」而不是「命中率」**：`hitsLanded` 只由**子弹**
    命中累加（`scanShot`），导弹命中不记。所以一场反舰任务的读数会天然偏低，
    那不是玩家打得差，是这个数只测机炮。
- 逐项填 DOM（`#dRank #dTitle #dSub #dCallsign #dTable #dQuote #btnNext`），最后 `show('debrief')`，关掉 `warning / gun` 声道。`#btnNext` 在“输了”或“**本战役已完结**”时 `disabled` —— 它只在当前战役内推进（`CAMPAIGNS[campaignOf(missionIdx)].missions`），不会把玩家直接送进别的战役；跨战役要回战役选择屏。

### 已知的内存问题
`finish()` **不释放任何东西**：`world`、`player` 仍被闭包引用，`world.actors / particles` 也原样留着（`debrief` 背后还要画战场快照）。只有 `#btnAbort`（放弃任务）那条路径会 `player = null; world = null;`。连续玩多关会累积内存，见 [DESIGN.md §8](../DESIGN.md#8-已知问题与待改进) 第 4 条。

---
## 输入
绑定全在 `bindInput()`：

- `document` 的 `keydown` / `keyup` 维护 `keys[e.code]` 布尔表（用 `e.code` 而非 `key`，与键盘布局无关）。`Space / Arrow* / Tab` 会被 `preventDefault()` —— `Tab` 在游戏里是切目标键，不拦就会把焦点送出画布。
- 鼠标：`mousedown`（左键置 `mouse.left`、右键**立即** `fireSpecial()`）、`mouseup`、`contextmenu` 阻止菜单、`mousemove` 用 `getBoundingClientRect()` 换算成画布内坐标、`wheel` 微调油门（`-deltaY * 0.0007`，夹到 `[0, THR_MAX]`，`{ passive: true }`）。`window` 的 `resize` → `Renderer.resize()`。
- **注意 `keydown` 在 `document` 上、`mousemove` 在画布上**：鼠标位置只在画布内更新，`updateMouseAim()` 直接用这个绝对坐标，不锁指针。
- 在 `state === 'playing'` 时另有一批语义键：`H` 暂停、`M` 切瞄准模式、`F`/`Tab` 切目标、`R` 切挂载、`Enter`/右键发射、`V` 按住连投干扰弹、**`N` 切换 EMCON-Δ 电磁静默**、`1`/`2`/`3` 僚机指令（分别 `setWingCmd('spread' / 'focus' / 'cover')`）。`1/2/3` 与 `N` 额外要求 `player` 存在。`Esc` 在局内同样走 `togglePause()`，在菜单屏则回标题。

具体哪个键干什么见 [hud.md 的输入映射表](hud.md#输入映射)，下面只讲机制。

### 鼠标引导机头 `updateMouseAim(dt)`（战雷式）
1. 瞄准方向存在世界坐标里：`aimYaw / aimPitch`（俯仰限 ±89°）。`mousemove` 用 `movementX/Y × AIM_SENS × FOV/56` 转动它；点击画布时 `requestPointerLock()`，菜单 / 暂停时 `releasePointer()` 交还指针。
2. `aimInit = false`（重生、`M` 切模式）时下一帧 `resetAim()` 从机头重新取。
3. `AI.steerTo(player, aimDirNow(), player.ctrl, player, dt)` —— 传 `dt` 启用瞄准角速度前馈（见 [ai.md](ai.md)）；`player.aimDir` 供 HUD 画准星与机头连线。
4. 追尾镜头（`S.camMode === 0`）在鼠标引导时跟 `aimDir` 而不跟机头，平滑系数 14；键盘直控时仍跟机头。这样准星固定在画面中心、机头标记去追它，机头才能真正收敛到准星上。跟 `aimDir` 时俯仰走 `camPitchFor(瞄准俯仰, S.fov)`：镜头上限是 `90° − FOV/2`，瞄准拉满 89° 时**天顶正好卡在画面上沿**（天底卡在下沿），CMD 贴着它 —— 看起来能一直朝正上方飞，只是光标推不过那条边。上限随 FOV 实时变（56° → 62°，38° → 71°，100° → 40°）。`k = max(0, 2·上限 − 89°)` 以下镜头 = 瞄准（FOV 56° 时 35° 以下准星在正中），之外 `k + (A − k)·r·(1 − (1 − t)^(1/r))` 平滑收到上限：衔接处斜率为 1、到 89° 时斜率为 0，全程单调。（以前是软膝 78° → 87°，拉满时画面几乎全是空天。）

### 键盘直控与油门轴
`controlPlayer(dt)`：

- `aimMode === true`：先 `updateMouseAim()`，然后 **W/S/A/D/Q/E 只在按下时覆盖飞控**（`if (kp) c.pitch = kp;`），所以“指令增稳”模式下键盘随时能打断。
- `aimMode === false`：`c.pitch/roll/yaw` 直接由按键的 −1/0/1 组成。
- 干扰弹：`if (keys.KeyV) Ent.breakLock(player, world);` —— 按住就按 `flareCd` 的节奏连续投，松手即停（“组”才是战术单位）。
- **单一油门轴 0 → `THR_MAX`（1.25）**：

  ```js
  if (thrIn)                       player.throttle += thrIn * dt * 0.62;
  else if (player.throttle > 1.0)  player.throttle = max(1.0,  throttle - dt*1.6);
  else if (player.throttle < 0.04) player.throttle = min(0.04, throttle + dt*1.6);
  if (keys.KeyX) player.throttle = THR_MAX;
  if (keys.KeyZ) player.throttle = 0;
  ```

  加力（`> 1.0`）与减速板（`< 0.04`）都是**按住才有效的瞬时态**：松手后自动回落到军推区间的边界，回落速率 `dt * 1.6` 比推进的 `0.62` 快、又不是瞬间弹回。这正是 [hud.md](hud.md#引擎出力带thrtape) 警告“别拿它们当稳定读数去测”的原因。`player.ab = throttle > 1.0`、`player.brake = throttle < 0.04`。
- 高 G 机动（`G`）：只有 `demand = |pitch| + |roll| > 0.55` 且 `speed > vStall * 1.30` 才生效 —— 否则它就成了一个无脑常开的加速器。生效时 `gLoad` 用 `M3.smooth(..., HIG_MAX, 9, dt)` 拉起；速度代价由 `stepAircraft` 的转弯掉速自然产生（角速度放大约 1.9 倍，掉速随之放大）；松手用 `M3.smooth(..., 1, 6, dt)` 落回。
- 机炮：`wantGun = mouse.left || keys.Space` → `Ent.fireGun`，`SFX.gun(wantGun && player.gunAmmo > 0)`（有按键没弹时不出声）。

---
## 相机
`updateCamera(dt)` 每帧在 `update()` 末尾跑一次。自由视角状态 `camYaw / camPitch` 是模块级的：

```js
← / →  camYaw ∓ dt * 1.3     ↑ / ↓  camPitch ± dt * 0.9（夹 ±1.5）
松开后 M3.smooth(camYaw/camPitch, 0, 2.2, dt)     ← 缓慢回中
```

**方向键只在 `camMode === 0` 被读取**：`camYaw` 只用于追尾镜头的绕机偏移、`camPitch` 只加到追尾镜头的镜头上。座舱与目标机位下按方向键没有任何效果。

### 机位 0：追尾（`S.camMode === 0`）
`camUp` 恒为世界 `(0,1,0)`，所以地平线永远水平、画面不跟滚转乱转。计算分四步：

```js
var CAM_PITCH_LIM = 89 * Math.PI / 180;
var SIN_LIM = Math.sin(CAM_PITCH_LIM);
var hlen = hypot(p.fwd.x, p.fwd.z);

// ① 偏航：最短角差平滑。键盘直控时 tYaw 从机头水平投影反算，投影塌缩时（hlen <= 0.12）沿用上一帧；
//    鼠标引导时 tYaw = aimYaw，任何仰角都跟（CMD 顶在 89° 时投影只有 0.017，反算会一直冻结）
if (lookAim || hlen > 0.12) {
  dYaw = wrap(tYaw - camYawBase);                       // 归一到 ±π
  camYawBase += dYaw * (1 - Math.exp(-1.2 * dt));
  // 再把 camYawBase 归一到 ±π
}
// ② 俯仰：先钳到 ±CAM_PITCH_LIM，再一阶低通
camPitchAng = atan2(p.fwd.y, max(hlen, 1e-4));
camPitchAng = clamp(camPitchAng, -CAM_PITCH_LIM, CAM_PITCH_LIM);
if (camPitchSmooth === null) camPitchSmooth = camPitchAng;   // 首帧惰性初始化
camPitchSmooth += (camPitchAng - camPitchSmooth) * (1 - Math.exp(-9 * dt));
camDir = V(sin(camYawBase)*cos(camPitchSmooth), sin(camPitchSmooth), cos(...));

// ③ 视线最后再钳一次 |y|
fy2 = clamp(camDir.y, -SIN_LIM, SIN_LIM);
// 用 sqrt(1 - fy2²) 重新分配水平分量，保持 camDir 是单位向量
```

位置在**世界坐标**里算（不在机体坐标系）：

```js
back = S.camDist + clamp(vFwd / 7.5, 0, 90);                 // 速度感距离
off0 = M3.rotAxis(camDir * -back, (0,1,0), camYaw);
wantOff = off0 + (0, S.camHeight + camPitch * 70, 0);
wantOff -= camDir * frameDeficit(wantOff, camDir, fr);       // 静态底座
camOff = M3.lerpV(camOff, wantOff, 1 - Math.exp(-7.5 * dt));  // 平滑的是相对偏移
viewOff = 按 S.camFrame 处理 camOff;                          // 只影响本帧，不写回
Renderer.setCamera(p.pos + viewOff, camDir, (0,1,0), S.fov);
```

世界坐标这一点是“稳定”的另一半：**滚转时镜头不会绕着飞机转圈**。

#### 出画处理（`S.camFrame`，设置 → 视角 → 出画处理）
飞机在镜头系里的位置是 `−off`：深度 `f`、竖直 `u`、水平 `r`；`u / (f·tan半视场)` 就是画面归一化纵坐标（±1 = 边缘）。

- **静态底座（三种模式共用）**：`frameDeficit` 用**目标偏移** `wantOff` 算飞机要落进画面 `FRAME_FILL = 0.7` 以内、深度不小于 6 m 还得再退多少，并进 `wantOff`。设定本身放不下（距离 2、高度 10、FOV 38）时自动拉开，设定不变这段距离就不变。
- **0 静态拉远（默认）**：不做动态处理。急转时 `camOff` 跟不上视线，飞机可能短暂贴边或出画一瞬，约 0.3 s 内被平滑带回；镜头不会为了出画被额外推拉（转弯时 `lerpV` 走弦带来的深度变浅是平滑本身的滞后，三种模式都有）。
- **1 侧滑软钳** `softClampFrame`：保持深度，把画面坐标过一道软膝 —— `FRAME_FILL` 以内原样，之外 `tanh` 渐近 `FRAME_SOFT_LIM = 0.9`。飞机大小不变、永不出画。
- **2 拉远带滞回** `stepFrameExtra`：用滞后的 `camOff` 算需要的额外距离 `camExtra`；上升 rate 8，需求消失后保持 0.6 s，再以 rate 0.8 收回。连续机动期间一直保持远距离。

**为什么旧做法会跳**：以前每帧用滞后的 `camOff` 判断，出画就瞬间沿视线后推并写回 `camOff`。大机动时误差在横向，纠正却在深度，平滑又把深度拉回 —— 推远、拉回、再推远，镜头前后“呼吸”。现在静态部分只看 `wantOff`，动态修正不写回平滑状态，两条反馈回路断开了。

#### 为什么必须限位（正交基退化）
镜头的“上”只有与视线不共线时才有定义。机头压到正上/正下时视线本身垂直，世界 `up` 与它共线，`M3.orthonormalize` 的退化保护只能临时换一根参考轴 —— 而 `|fwd.y|` 在极点附近逐帧抖动，参考轴就跟着反复横跳，画面来回侧翻。旧的“混合参考”只能把跳变抹成旋转，抹不掉极点本身；**把俯仰限住，镜头就永远到不了那个位置**，问题从根上消失。

#### 89° 的余量依据
正交化前 `|up| = cos(限位)`，而 `orthonormalize` 的退化阈值是 `|up| < 1e-4`：

| 限位 | `cos(限位)` | 相对 `1e-4` 的余量 |
|---|---|---|
| 89° | `1.75e-2` | **175 倍** |
| 89.9° | `1.75e-3` | 17 倍 |
| 89.999° | ~`1.7e-5` | 约 1 倍 |
| 90° | 0 | 归零 |

89° 是“能看见最高”与“正交基始终远离退化”之间留够余量的位置；实测收敛后镜头帧间差为 0、没有任何抽动。（此前的限位是 78°，提到 89° 是为了让垂直机动时保留更多视野，而余量依然充足。）

#### 限位附近不抖动，三件事缺一不可
1. **偏航按最短角差平滑**（时间常数 1.2，约一秒转完 180°）：翻越顶点时水平投影会瞬间反向 180°，直接跟就是瞬移。
2. **俯仰也平滑**（时间常数 9）：`up` 是世界 `up`，正交化后它的长度就是 `cos(pitch)`，越接近限位越小，同样的视线变化引起的 `up` 变化越大，俯仰直接阶跃时地平线会明显发抖。
3. **视线最后再钳一次**：`camPos` 是插值量、天生滞后，若用滞后的位置反推方向，视线会比基准朝向更陡，把限位绕过去。

### 机位 1：座舱
```js
var cp = p.pos + p.fwd * 3.4 + p.up * 1.1;
Renderer.setCamera(cp, p.fwd, p.up, S.fov + 6);
```

跟随滚转、`up` 用机体的、视场角比设置值宽 6°。代价是 `drawSky/drawGround` 仍按水平线切分屏幕，倾斜的真实地平线与填充不一致 —— 已知偏差，见 [rendering.md](rendering.md#地平线)。

### 机位 2：目标（从侧上方看双方）
- **有锁定目标**：取双方中点 `mid`，`span = max(140, dist)`；相机放在中点沿“水平垂线”方向 `side` 偏出 `span * 0.40 + 40`、抬高 `max(60, span * 0.26)`，`setCamera(cp2, norm(mid - cp2), (0,1,0), 55)`。
- **无目标**：机身后上方 `p.pos + fwd * -120 + right * 55 + (0, 50, 0)`，视场角回落到 `S.fov`。
- 两处都**刻意带侧向分量**：原来的实现是正上方 90 m 垂直俯视，视线与 `up` 完全共线、正交基退化，画面随机翻滚，玩家“找不到自己的飞机”。
- 有目标时 FOV 写死 `55`、**不读 `S.fov`** —— 这是既有实现，不是笔误，改的时候要知道它跟设置滑块脱钩。

### `else if` 挂错分支那次
`camMode === 1` 那一支前面的注释是一份事故记录：它曾经被误改成独立的 `if`，于是 `camMode === 0` 时既进不了 `1`，就掉进最后的 `else`（目标视角），**追尾镜头刚算出来的结果当场被覆盖**；而目标视角写死世界 `up`，画面看起来就完全退回“地平线永远水平”。这个 bug 骗过了所有相机测试，因为那些测试只复现 `camMode === 0` 的计算、不经过这里的 `else` 链。改这块时，`else if` 这三个字是语义的一部分。

---
## 目标、锁定与武器
### `cycleTarget()`（`F` / `Tab`）
候选分成两组：`air`（`alive && team !== player.team` 的 `world.actors`）与 `surf`（`alive && team === 1` 的 `world.targets`）—— 中立的调节单元**不进锁定循环**。当前弹 `WEAPONS[player.special].target === 'air'` 时 air 是主类，否则 surf 是主类：**两类都要能锁到，只是顺序不同**。

排序在 `rankTargets(prim, sec)`：

- **屏幕内**（`M3.project` 落在画面里）按离瞄准点的屏幕距离排。瞄准点由 `aimRef()` 给：鼠标引导 = CMD 瞄准环的投影，键盘直控 = 鼠标光标 `mouse.x/y`。
- **屏幕外**按离本机的距离排。
- 总顺序：屏幕内主类 → 屏幕内另一类 → 屏幕外主类 → 屏幕外另一类。

按 `F` 取第一个；第一个就是当前目标时取第二个（不然按了没反应）。
**连按**：`TARGET_REPEAT_T`（1.5 s）内再按，沿上一次冻结的顺序（`tgtCycle`）往下走 —— 第二近、第三近……排序冻结是为了目标一动不会跳回刚才那个。
切换后 `lockProgress = 0`、`SFX.lockTone(false)`。

### `updateLock(dt)`
对空与对面是**两套判据**：

```js
cone     = w.lockCone * (player.pos.y > 18000 ? 0.78 : 1);      // 高空收窄
lockDist = w.lockDist * (player.lockRangeK || 1) * (spActive > 0 ? 1 - w.lockReduce : 1);
if (w.target === 'air') ok = dist < lockDist && off < cone;              // 距离 + 离轴角
else                    ok = dist < lockDist * 1.35 && -dir.y > -0.10;   // 距离 + 俯角
```

对面弹走的是**火控投放包线**（水平距离够近且目标在机头下方），不是导引头锥角 —— 以前两个分支代码一模一样，玩家得把机头死死指着浮台，稍微偏一点就丢锁。锁定速率按导引方式分档：`nezer → 1.5`、`ir → 0.55`、`eo → 0.60`、`laser → 1.6`、其余 `1.1`（单位 1/s）；丢锁按 `-2.2/s` 衰减。`w.kind === 'ecm' || 'dew'` 直接 `lockProgress = 1`。

### `fireSpecial()`（右键 / `Enter`）
1. `state !== 'playing' || !player.alive` → 返回。
2. `ecm` → 转 `launch()`；`dew` → 播“GUS-2 是自动拦截系统”并返回；`spAmmo <= 0` 或 `spCd > 0` → `SFX.loseLock()` 返回。
3. **只保留一条目标检查**：`targetMismatch(w, t)` —— 武器对空/对面与目标类别矛盾时说清楚（“按 R 换成对地挂载”）。**不再要求“必须先锁定”**：无制导武器本来就不需要目标，俯冲扫射也不该被拦；`lockProgress` 只驱动 HUD 的锁定环，不是开火许可。
4. `launch()` 成功后按武器类型播无线电：无制导 / `bomb/agm/asm` → **投放**；`seeker === 'radar'` → **Fox 3**；`laser` → **照射**；其余 → **Fox 2**。

### `launch(actor, target, w)` —— 玩家与 AI 的双路径
`Ent.makeAircraft()` 给每架飞机都建了 `slotCd: {}` 与 `spCd: 0`；**玩家**在 `startMission()` 里为每件武器填出真正的槽数组，**AI** 的 `slotCd` 始终是空对象。`launch()` 据此走两条冷却路径：

| | 玩家 | AI |
|---|---|---|
| 找槽 | `slotCd[wid]` 里第一个 `<= 0` 的槽；找不到就 `return false` | `slotArr` 为 `undefined` → 落到 `else if (actor.spCd > 0) return false` |
| 记冷却 | `slotArr[si2] = wp.cd`，再 `spCd = min(slotArr)` | `actor.spCd = wp.cd` |

- `slotCd` 里 **`SLOT_EMPTY`（`1e9`）的槽永远不可用**，所以“最快就绪的那个”`Math.min` 也不会被它污染。
- **一次按键只打 1 枚**（占 1 个槽），但 `nShot = min(wp.salvo || 1, spAmmo)` 枚会从**同一个槽**里连续出膛 —— “三联装”是“按一下出三枚”，不是“一个挂点占三个槽”。弹体从同一发射位置出膛，不做偏移。
- 发射位置按槽号排布：`side = (si2 % 2) ? 1 : -1`、`rank = floor(si2 / 2)`，机体坐标上偏出 `2.4 + rank * 1.9` 米。
- `ecm` 单独一条：开机设 `spActive = wp.duration`、`spCd = wp.cd`（也占第 0 槽），播 `SFX.laser()` 与一句无线电；`dew` 直接 `return false`（自动系统）。
- **没有交战规则拦截**：旧的 `roeBlocked` 分支已删，调节单元附近开火只有误伤扣分这一种后果。
- **无目标也允许发射**（无制导弹与“打出去自己找”的弹都不该被拦）。出声：玩家 `SFX.missile()` + `shotsFired++`；AI 距离玩家 < 6000 m 时 `SFX.missileFar()`。

`cycleSpecial()`（`R`）只在 `loadoutList.length >= 2` 时切 `wpIdx`，然后 `syncWeapon()` 把槽数组里**最快就绪的槽**折算成 `spCd`。切枪**不清零 `lockProgress`**：换弹种类后“还锁不锁得住”应由新武器的参数重判，清零会让“对同一个敌人连打几种弹”这个多挂载玩法打不出来。

---
## 看门狗
```js
var WD_LIMIT = 1.5;
```

`watchdog(dt)` 遍历 `world.actors`，把位置变化（三个分量绝对值之和）小于 `0.02` 的帧累加进 `a.wdStill`；超过 1.5 秒就：用 `console.warn` 打一条含 `name / wdStill / speed / fwd / ctrl / pos / hp` 的记录；把姿态重置成 `fwd=(0,0,1) up=(0,1,0) right=(1,0,0)`、速度设为 `max(vStall * 1.4, 180)`、`vel = fwd * speed`、清 `stall`；`wdStill = 0` 让它继续飞。

**兜的是什么**：有飞机在空中“钉住”过（位置完全不动、速度读数却正常），根因至今没定位到，所以这是纯粹的兜底。**为什么值得兜**：玩家分不清“这架飞机卡住了”和“我打不着它”，一架悬停的敌机会让整场战斗都显得坏了。**为什么留 `console.warn`**：万一真被触发，那条记录就是下次定位根因的起点。`mission` 结束后 `update()` 不再运行，所以“结算时的静止”不会被误判成卡死。

---
## 开机自检 `preflight()`
`init()` 的第一行。返回 `problems` 数组，全空时 `console.log` 一条绿色“自检通过”。检查内容：

1. **核心模块**：`M3 MODELS PLANFORM CODEX AIRCRAFT WEAPONS VOICES CALLSIGN SFX Renderer Ent AI HUD MISSIONS Radio` 逐个查 `typeof window[...]`，缺任何一个就**立即 `report()` 并返回**（后面没法查）。
2. **每个机型**：`model` 在 `MODELS` 里、`gun` 在 `WEAPONS` 里、有 `hardpointGroups`、每组 `pts.length >= 2`（必须成对）、`phys.vMax` 存在；可驾驶机型还要 `PLANFORM.planes[model]` 存在，且每个挂载点组“在当前机体能力下至少有一种武器挂得上”。NPC 机型跳过最后一条 —— 下游弹的 `fits` 是空的。
3. **默认配置**（`defaultLoadout`）：组存在、武器存在、`fits` 匹配该组 `kind`、`canCarry(ac, w)` 成立（后者会报出缺哪项机体能力）。
4. **静态清单**：`needModels`（`c11 c14 s6 m27 ucav sower relay cell sam radar depot cmdpost station missile bomb`）与 `needWeapons`（`k3 k7 v11 v9 v17 v22 v25 v30 e4 l2 dl4 dl6 dl9`）逐项存在。
5. **每个任务**：`spawn / tick / win / lose` 是函数，且 `VOICES[m.id]` 存在。

**失败时怎么报**：`report(problems)` 在 `document.body` 末尾插一个 `position:fixed; bottom:0; z-index:9999` 的暗红框（`max-height:36vh`、可滚动），标题是“开机自检发现 N 个问题（请把这一段发给开发者）：”，每条一行 `·`；同时 `console.error`。**不弹窗、不阻断游戏** —— 开发者工具没开的时候，这条红条就是唯一的报告渠道。见 [DESIGN.md §6.1](../DESIGN.md#61-为什么有开机自检)。

---
## UI 装配：唯一数据源
`game.js` 里所有 DOM 界面都是**现造现填**，HTML 只留空容器。

| 界面 | 生成器 | 唯一数据源 |
|---|---|---|
| 设置（独立页 + 暂停页签） | `buildSettingsInto(container)` | `SET_GROUPS` + `DEFAULTS` |
| 操作说明（手册页 + 暂停页签） | `buildHelpHTML(forPause)` | `KEYMAP` + `TIPS` |
| 机库 | `buildHangar()` → `buildHardpointEditor()` | `AIRCRAFT` + `WEAPONS` + `loadouts` |
| 战役选择 | `buildCampaignList()` | `CAMPAIGNS[]` + `cleared`（进度） |
| 简报 | `buildBrief()` + `buildMissionList()` + `drawMap()` | `MISSIONS[missionIdx]` + `CAMPAIGNS[activeCampaign]` |
| 资料库 | `buildCodex()` | `CODEX[]`（条目可给 `html` 或 `build()`，可选 `mount()`） |
| 更新记录 | `buildChangelog()` | `CHANGELOG.releases[]`（`js/changelog.js`，自动生成） |
| 结算 | `finish()` | 当场算出的 `score / rank / rows` |

- `buildSettingsInto(container)` 先 `container.innerHTML = ''`，再按 `SET_GROUPS` 的组标题、`makeSetRow(item)` 逐项生成；`range / select / toggle` 三种控件各一支分支。改设置项**只需动 `SET_GROUPS` + `DEFAULTS`**，独立设置页与暂停菜单自动同步。视角用 `select`（而不是热切换）是刻意的：视角误触的代价是一瞬间失去态势感知，必须“主动选、确认”。
- `buildHelpHTML(forPause)` 返回**两种排版**：`true` 单栏（暂停菜单，`<h4>` + `<table>`）、`false` 双栏（独立手册，两个 `.help-col`）。早期两处是两份独立 HTML，改一个忘一个。
- 机库是**唯一让玩家做长期规划的地方**，所以 `buildHangar()` 每次都重算：`resolveLoadout` / `loadoutMass` / `passiveEffects` → 六维条显示**挂载之后**的实际值（缩水段用暗红标出并写净损失）→ 挂载点编辑器 → 俯视图 `PLANFORM.draw()`。选机体时重置 `activeHpGroup`；`loadouts[ac.id]` 只在第一次访问时按 `defaultLoadout` 初始化，之后留着玩家的改动。
- `buildBrief()` 末尾一定调 `drawMap(m)`；地图**不画陆地** —— 战役全在纯海域上进行，画岛等于承诺一片不存在的地形。`buildCodex()` 的条目支持 `build()` 动态生成，图鉴那几条必须动态出，否则改了 `data.js` 文档就对不上。条目带 `mount()` 的，在 `innerHTML` 写进去之后再调（DOM 要先就位）—— `s4` 用它挂调节单元的 3D 预览。
- `buildChangelog()` 只画不写：版本号与条目全在 `CHANGELOG`（`js/changelog.js`）里，而它是 `tools/release.js` 从根目录 `CHANGELOG.md` 生成的。**发新版本不需要改这个函数**，只改 `CHANGELOG.md` 再跑一次生成脚本。条目文本里的 `**强调**` 与 `` `代码` `` 由 `clInline()` 还原成 `<b>` / `<code>`，而且**先转义再还原** —— 顺序反过来的话，转义会把刚生成出来的标签一起逃掉。`js/changelog.js` 缺失时（开发中直接开 `index.html`）降级成一句提示，与版本戳同一种处理。

---
## Radio：队列与字幕
```js
var queue = [], timer = 0, box = null, live = [];
```

- `play(id, evt)` 把整组台词**展开压栈**；`raw(line)` 压一条。台词对象形如 `{ who, cls, tx, gap }`。
- `update(dt)`：`timer -= dt`；`timer <= 0 && queue.length` 时弹出一条交给 `push()`，然后 `timer = L.gap === undefined ? 1.4 : L.gap` —— **`gap` 是“这条说完之后隔多久出下一条”**，缺省 1.4s。
- `push(L)`：造一个 `.rad-line <cls>` 的 `div`，`who` 包成 `.who`、正文包成 `.tx`；`live` 里记 `{ node, t: 5.6 }`；**超过 4 条就挤掉最旧的**；`cls !== 'fx'` 时播 `SFX.radio()`。`cls === 'fx'` 的字幕额外加 class `radiofx`，用于战场音效的字幕化。
- 淡出：`t < 0.5` 时 `node.style.opacity = max(0, t / 0.5)`，`t <= 0` 摘除。**字幕完全靠 `Radio.update()` 驱动**，而它只在 `update(dt)` 里被调用 → 离开战斗必须 `Radio.clear()`（见 `show()`），否则队列没人推进、最后几条会永久挂在屏幕上。
- `world.radio === Radio`，所以任务脚本里的台词走同一个队列，玩家、僚机、`SEXTANT`、`fx` 共用一套节奏。队列**不分优先级**：谁的 `raw/play` 先调用谁先出队。

---
## 参数速查

| 想改什么 | 在哪 |
|---|---|
| `dt` 上限 / 异常兜底 | `loop()` 里的 `0.05` / `0.016` |
| 油门量程上限 | `THR_MAX = 1.25` |
| 油门推进 / 回落 / 加力与减速板阈值 | `controlPlayer()` 里的 `0.62` / `dt * 1.6` / `1.0` / `0.04` |
| 高 G 倍率 | `HIG_MAX = 1.90`（掉速见 `entities.js` 的 `TURN_BLEED`） |
| 高 G 触发门槛 | `controlPlayer()` 里的 `demand > 0.55`、`vStall * 1.30` |
| 相机俯仰限位 | `updateCamera()` 里的 `CAM_PITCH_LIM = 89°` |
| 追尾镜头的偏航/俯仰平滑与位置跟随 | `1.2` / `9` / `7.5`（`exp` 时间常数） |
| 相机自由视角速度与回中 | 方向键的 `1.3` / `0.9`、`M3.smooth(..., 2.2, dt)` |
| 座舱偏移与视场 | `p.fwd * 3.4` / `p.up * 1.1` / `S.fov + 6` |
| 目标机位距离与张角 | `span * 0.40 + 40`、`max(60, span * 0.26)`、FOV `55` |
| 看门狗阈值 | `WD_LIMIT = 1.5`（静止判定 `< 0.02`） |
| 锁定速率 / 丢锁速率 | `updateLock()` 里的 `1.5 / 0.55 / 0.60 / 1.6 / 1.1` 与 `2.2` |
| 高空锁定锥收窄 | `updateLock()` 里的 `0.78`（> 18000 m） |
| 对面弹投放包线 | `updateLock()` 里的 `1.35` 与 `dir.y` 门槛 `-0.10` |
| 结算分值 / 评级线 | `finish()` 里的 `1000 / 3000 / 2000 / 4000 / 2500` 与 `16000 / 11000 / 7000` |
| 字幕停留 / 队列上限 / 台词间隔 | `Radio.push()` 的 `5.6` / `4`、`Radio.update()` 的 `1.4` |
| 粒子数量上限 | `compact()` 里的 `900` |
| 挂架高度 / 实体缩放 | `STORE_HY` / `pushOneStore()` 里的 `0.85` |
| 曳光长度与宽度 | `drawTracers()` 里的 `0.045 / 13 / 90`、`1600` |
| 设置项清单 | `SET_GROUPS`（同 [hud.md](hud.md#各项)） |

---
## 易踩的坑与设计取舍
1. **`else if` 挂错分支**（相机那一段）：`camMode === 1` 曾是独立 `if`，`camMode === 0` 掉进 `else`（目标视角）被覆盖，画面看起来完全正常。相机测试只复现 `camMode === 0` 的计算，漏掉了这条分支链。
2. **没有兜底 `else` 是有意的**：拼错的 `data-go` 什么都不做，而不是静默跳标题页。副作用是 `show('foo')` 会把 `state` 设成 `'foo'` 却没有任何屏幕被激活 —— 调试时先核对 `data-go` 与 `#scr-*` 的 id。
3. **`cleared` 的键是 `mission.id`**（不是 `missionIdx`），且只活在内存里 —— 调整 `MISSIONS` 顺序或增删关卡都不会让“已完成”标记错位。
4. **离开战斗不 `Radio.clear()` 就会残留字幕**，因为字幕淡出只由战斗循环里的 `Radio.update()` 推进。
5. **暂停时只停 `update`**，所以暂停菜单里改设置能立刻看到效果；反过来，任何“在 `update` 里做的一次性初始化”在暂停期间不会发生。
6. **方向键自由视角只在追尾机位有效**；**目标机位有目标时 FOV 写死 55、不读 `S.fov`**。
7. **加力/减速板是瞬时态**：拿它们当稳态读数去测会得到假失败（`tools/smoke.js` 的引擎出力断言只用稳态档位）。
8. **槽数组与挂载组的下标要自己维护**（`pushStores()` 里的 `used{}`）：槽数组按武器建、遍历按组走，两组挂同一种弹时若不自己累加起始下标，就会“四个挂架共用前两个槽”，打掉一个两组同时消失、后两个永不消失。发射那边是对的（`launch` 遍历整个 `slotCd[wid]`），**只有实体渲染会错位**。
9. **`launch()` 兼容两种冷却形态**：`slotCd[wid]` 存在就走槽数组，不存在才退回 `actor.spCd`。AI 靠的就是后一条 —— 别把那个 `else if (actor.spCd > 0)` 删掉，否则 AI 会变成无冷却连射。
10. **底部 `window.addEventListener('load', ...)` 必须最后加载**：`Game.init()` 第一件事就是 `preflight()` 检查所有全局模块，前面任何一个 `<script>` 没跑完都会报“核心模块 X 未加载”。**已知未释放**：`finish()` 之后 `world / player` 仍被闭包与 `debrief` 的渲染路径引用，只有 `#btnAbort` 会置空。
11. **加关之后忘了写进 `CAMPAIGNS[].missions`**：关卡本身能跑、能通过 `preflight` 的字段检查，只是在选关界面永远列不出来。`preflight()` 现在会报“没有归属任何战役”，但触发它的前提是新关确实被加进了 `MISSIONS`。同一关被两个战役引用也会报。
