# 静态数据表总览

代码：`js/data.js` · 主要消费方：`entities.js`（装配飞机）、`game.js`（机库 / 自检 / 发射）、`codex.js`（图鉴）、`missions.js`（呼号 / 舰船数值）、`unitview.js`（单位详情页）、`ai.js`（升限）

一句话职责：**data.js 只放纯数据与纯函数**——不碰 DOM、不碰 Canvas、不产生运行时状态。
机体的运行时对象由 `entities.js` 的 `makeAircraft()` 现场派生；挂载配置的派生（`getLoadout` / `resolveLoadout`）在 `game.js`；
水面舰船（`SHIPS`）由 `missions.js` 的 `spawnShip()` 按 `model` 查表、交给 `Ent.makeTarget()` 生成目标（见 [SHIPS 表](#ships-表)）。

> 武器机制与编号体系见 [weapons.md](weapons.md)，挂载点机制见 [loadout.md](loadout.md)。
> 本文只讲**表结构与字段契约**：每张表有什么字段、缺了会怎样、谁在读它。

---

## 代码位置与职责边界

| 项 | 事实 |
|---|---|
| 文件 | `js/data.js`，2726 行，全中文注释 |
| 加载位置 | `index.html` 里紧随 `codex.js` 之后、`entities.js` 之前（`version.js` 不计入模块表） |
| 模块形式 | 经典 `<script>` + 全局 `var`，没有 `export`、没有构造函数 |
| 依赖 | **零**。只用到 `Math`（`45 * Math.PI / 180` 这类） |
| 谁在这里校验 | **没有**。校验在 `game.js` 的 `preflight()` 与 `tools/smoke.js` |

**加载顺序是契约的一部分**：`codex.js` 在 `data.js` 之前求值，所以 codex.js 里凡是要读 `AIRCRAFT` / `WEAPONS` 的代码，必须包在函数体里等 `build()` 被调用时才求值。这也是图鉴条目写成 `build: function () {...}` 而不是静态字符串的原因。

**IIFE 补丁表在文件里就地执行**：`STORE_ATTR` / `STORE_ROLE` / `STORE_NEEDS` / `STORE_COOLDOWN` / `MISSILE_LEAD` / `FLARE_RD` 都在定义后紧跟一个匿名 IIFE，把值合并进 `WEAPONS`。所以**读 `WEAPONS` 读到的已经是合并后的完整表**，不要再去别的表里查一遍。

---

## 导出总览

| 名字 | 类型 | 规模（当前） | 谁在读 |
|---|---|---|---|
| `CALLSIGN` | 对象 | 6 键 | `game.js`、`missions.js` |
| `AIRCRAFT` | 数组 | **17** 条（可驾驶 6） | `entities.js` `makeAircraft`、`game.js`、`codex.js`、`ai.js`、`planform.js`、`hud.js`、`unitview.js` |
| `SHIPS` | 数组 | **16** 条 | `missions.js` `spawnShip`、`codex.js` `inv3`、`unitview.js`、`game.js` `preflight` |
| `WEAPONS` | 对象 | **44** 键 | `entities.js`、`game.js`、`ai.js`、`hud.js`、`codex.js` |
| `STORE_ATTR` | 对象 | 29 键 → 注入 `fits` `perPoint` `mass` | 间接；挂载系统 |
| `STORE_ROLE` | 对象 | 38 键 → 注入 `role` | 机库卡片、图鉴 |
| `STORE_NEEDS` | 对象 | 9 键 → 注入 `needs` | `canCarry`、`preflight` |
| `STORE_COOLDOWN` | 对象 | 28 键 → 覆盖 `cd` | `launch()` 的槽计时 |
| `MISSILE_LEAD` | 对象 | 28 键 → 注入 `lead` | 导弹提前量 |
| `CS_DOWNSTREAM` | 数组 | 20 条 `{cn,en}` | `missions.js` |
| `downstreamCallsign(i)` | 函数 | — | `missions.js` |
| `missileRange(w)` | 函数 | — | 机库卡片、图鉴 |
| `canCarry(ac,w)` | 函数 | — | `game.js`、`preflight` |
| `loadoutPenalty(lf)` | 函数 | — | `game.js` 面板 + `entities.js` 物理 |
| `FLARE_RD` | 对象 | 14 键 → 注入 `flareRD`（只给雷达弹） | `breakLock()` |
| `HARD_MODELS` | 对象 | 1 键（`radar`） | `entities.js` `isHard` / `warheadK`（加固目标的战斗部系数） |
| `VOICES` | 对象 | 13 个任务（`m1`–`m12` + `sk1`） | `game.js` 的 `Radio` |

规模数字会随内容增长，以上是核对 `data.js` 时的值——数错不会报错，只当参考。

---

## CALLSIGN

```js
var CALLSIGN = {
  player: 'VESPER-1', wing2: 'VESPER-2', wing3: 'VESPER-3',
  awacs: 'SEXTANT', enemy: 'FLINT', ace: 'WINTERPORT'
};
```

| 字段 | 用途 | 读取点 |
|---|---|---|
| `player` | 玩家 HUD 名、结算页呼号、无线电发言者 | `game.js` 出击/结算/无线电 |
| `wing2` / `wing3` | 事件台词里的僚机发言者 | `game.js` 事件分支 |
| `wing<idx>` | **动态拼键**：`missions.js` 用 `CALLSIGN['wing' + idx]`（idx = 2 / 3）取名 | `missions.js` `spawnWingman` |
| `awacs` / `enemy` / `ace` | **三个都无代码读取**（全仓 grep `CALLSIGN.awacs` 等为零）：`SEXTANT` 与冬港的名字写死在 `VOICES` 的 `who` 和 `game.js` 的 `Radio.raw` 里，敌机呼号走 `CS_DOWNSTREAM` | — |

**契约**：键缺失不会崩溃，但会渲染成字符串 `"undefined"`——读法都是直接拼进 innerHTML / textContent。
`wing<idx>` 尤其隐蔽：它用的是**动态键名**，加/改僚机编号时要同时看 `missions.js`。

---

## AIRCRAFT 表

数组，17 条。6 条可驾驶（`frigatebird sailfish booby petrel skua albatross`），11 条 NPC（带 `npcOnly: true`：`folded_wing schist basalt sandstone boulder tideline spray datum pelican quartz lodestone`）。

**`model` 不必等于 `id`**：NPC 机型借用现成几何——`tideline` 用 `sailfish`，`datum` / `pelican` 用 `sower`，`quartz` / `lodestone` 用 `boulder`。

### 字段清单

| 字段 | 类型 | 必填 | 缺了会怎样 |
|---|---|---|---|
| `id` | string | ✅ | `makeAircraft()` 用 `AIRCRAFT[i].id === o.type` 匹配，匹配不到 **静默回退到 `AIRCRAFT[0]`**（见下） |
| `model` | string | ✅ | `preflight` 会报「引用了不存在的模型」；`npcOnly` 机型不查 `PLANFORM`，但仍查 `MODELS` |
| `name` / `cn` / `nick` | string | ✅ | 三处都直接拼字符串；`nick` 缺了机库 `ac.nick.toUpperCase()` **直接抛异常** |
| `role` | string | ✅ | 机库/图鉴显示定位 |
| `faction` / `planformType` / `maker` | string | — | 展示用（图鉴、机库）。前两个各自回退成 `'—'`，`maker` 缺了显示 `undefined` |
| `npcOnly` | bool | — | 缺省 = **可驾驶**，会出现在机库；`true` 则机库跳过、`preflight` 跳过其挂点检查 |
| `caps` | string[] | — | `canCarry` 里回退成 `[]`，即"什么门槛都过不了" |
| `ceiling` | number | — | `ai.js` 里回退成 `16000` 米 |
| `ctrlFull` | number | — | `entities.js` `ctrlFactor` 回退成 `22000`（只有 `petrel` 写 16500） |
| `ctrlFloor` | number | — | 回退成 `0.13`（只有 `sailfish` 写 0.34） |
| `variableSweep` | bool | — | 只有 `frigatebird` 有；`entities.js` 据此做变后掠翼插值 |
| `stats` | 对象 | ✅ | 机库六维条；键见下，缺某个维度会算出 `NaN` 宽度 |
| `phys` | 对象 | ✅ | **飞行模型的唯一来源**；`preflight` 只检查 `phys.vMax` |
| `gun` | string \| `null` | ✅ | `WEAPONS` 的键，或 `null` 表示没有机炮（`boulder` `pelican` `quartz`）。`makeAircraft` 与 `ai.js` 开火段都已判空（v1.4.1 修过 `ai.js` 里 `WEAPONS[a.gun].range` 对 `null` 抛异常）；`preflight` 只在非空时检查键存在 |
| `maxLoad` | number | ✅ | 挂载重量分母；`game.js` 里回退成 `5000` |
| `hardpointGroups` | 数组 | ✅ | 缺了机库选装面板为空、`preflight` 报「没有定义挂载点组」 |
| `defaultLoadout` | 对象 | ✅ | 缺了 `preflight` 不报，但 AI 取不到默认武器（见下） |
| `desc` | HTML string | ✅ | 机库简介，直接 `innerHTML` |

### `phys`（飞行模型字段）

```js
phys: { vMax: 480, vMil: 372, vStall: 105, accel: 26, decel: 40,
        pitch: 0.76, roll: 3.0, yaw: 0.30, hp: 130 }
```

单位：`vMax/vMil/vStall` m/s，`accel/decel` m/s²，`pitch/roll/yaw` rad/s，`hp` 结构完整度。
`missions.js` 的 `spawnEnemy` 会把这 9 个数**逐个拷贝**成敌机的 `a.phys`（不是引用），所以改 `AIRCRAFT` 能直接改敌机性能。

### `stats`（机库六维条，0..1）

键固定六种，由 `game.js` 的 `buildHangar()` 按顺序读：

| 键 | 显示名 | 是否受挂载影响 |
|---|---|---|
| `spd` | 最大速度 | ✅ `× lp.vMax` |
| `mob` | 机动性 | ✅ `× (lp.pitch + lp.roll + lp.accel) / 3` |
| `stl` | 匿踪 | 机型固有值，每个外露挂点折损 5%（`STEALTH_LOSS_PER_POINT`；`exposedPoints` / `stealthValue`，挂点组上 `expose: 0` = 内埋不折损，0.5 = 只算一半）；缩短敌方锁定距离，与吊舱 `lockResist` 合并成 `lockResist`（`Ent.setStealth`） |
| `fire` | 火力 | ❌ |
| `dur` | 生存性 | ❌ |
| `rng` | 航程 | ❌ |

**这是"六维"的唯一实现**：`stats` 的键名写错 = 那一条算成 `NaN`，条形图宽度变 `NaN%`，不会报错。

### `hardpointGroups` / `defaultLoadout`

```js
hardpointGroups: [
  { id: 'A', label: '翼尖', kind: 'tip', pts: [{ x: 7.5, y: -2.8 }, { x: -7.5, y: -2.8 }] },
  // 需要时再加 hy（吊挂高度），见下
  { id: 'B', label: '机腹', kind: 'belly', hy: -3.0, pts: [{ x: 1.2, y: -2.0 }, { x: -1.2, y: -2.0 }] }
],
defaultLoadout: { A: 'srm', B: 'v11', C: 'qsr', D: 'oep' }
```

- `pts` 是机体系俯视坐标，**同时是俯视识别图的引线锚点**（单一数据源，别再建一份）
- `pts.length` 必须是**偶数**（成对挂载），`preflight` 会查
- `defaultLoadout` 的值是 `WEAPONS` 的键或 `null`；NPC 机型写 `{}`
- `hy`（可选）是**吊挂高度**（机体系 y，单位米）。不写就用
  `Ent.STORE_HY` 按 `kind` 给的默认值（tip −0.35 / light −1.15 /
  heavy −1.35 / belly −1.95）。默认值是按**战斗机**（机身深一米上下）定的，
  大型机体会把挂载物埋进机身：ROK-44 干扰机与石英预警机的机腹在 −2.60 m，
  用默认的 −1.95 等于整件看不见。**改了模型就要重新量一遍** ——
  `smoke.js` 有一条几何断言盯着它（挂载物顶部必须比挂点正下方的机体
  表面低至少 0.30 m）
- 完整语义（`kind` 适配、`perPoint`、被动吊舱、能力门槛）见 [loadout.md](loadout.md)

---

## SHIPS 表

数组，**16** 条，覆盖四方参战势力与三个未参战国家（见设定集 8.0.1）。
每条的设定散文在 `desc` 里，游戏内由 `codex.js` 的 `inv3` 图鉴与 `unitview.js` 的单位详情页展示。

**这张表已经接进关卡**：`missions.js` 的 `spawnShip(w, o)` 按 `o.model` 在 `SHIPS` 里查表
（查不到静默回退 `SHIPS[0]`），把 `hp` / `radius` / `value` / `label` 交给 `Ent.makeTarget()`；
任务里只写"哪条船、在哪、由谁指挥"，以及可选的 `route` / `team` / `weapon`，`o.*` 给了就覆盖表值。
全文件约 25 处调用。这样做的理由写在源码注释里：**数值不从任务里另抄一份**，
资料库、详情页、关卡读的是同一张表。

`team: 2` 用于未参战方（南十字 / 冰芯 / 环礁、DAPLU、DIKLO 等背景单位）：
`cycleTarget` 只收 team 1，所以玩家锁不到它们，它们只是"在场"。

### 字段清单

| 字段 | 类型 | 含义 | 谁在读 |
|---|---|---|---|
| `id` | string | 内部键，**同时是 `MODELS` 的键与预览图文件名** | `inv3`、`tools/render-ships.js` |
| `model` | string | `MODELS` 的键（当前 16 条与 `id` 一一对应，但保留这个字段以便多艘复用同一模型）；**`spawnShip` 按它查表** | `spawnShip`、`inv3`、渲染 |
| `hull` | string | 军舰的级名或船名（`虎鲸级` / `蓝鲸级` / `MV SOUTHERN CROSS`）；任务简报与台词里的舰船称呼必须取自这里。上下游军舰不挂字母数字编号 | `inv3` |
| `name` / `cn` | string | 英文舰名 / 中文舰名 | `inv3` |
| `cls` | string | 舰种（护航驱逐舰 / 导弹快艇 / 布缆船…） | `inv3` |
| `faction` / `operator` | string | 阵营 / 实际使用方 | `inv3`（按 `faction` 分组） |
| `role` | string | 一句话定位 | `inv3` |
| `disp` / `dim` / `speed` / `crew` | number / number[] | 满载吨位 t / 主尺度 `[长, 宽, 吃水]` m / 航速 **kn** / 编制人数 | `inv3`、`unitview` |
| `hp` / `radius` / `value` | number | 交战数值：结构值 / 受击半径 / 任务价值分 | `spawnShip`（任务可用 `o.hp` 等覆盖） |
| `vials` | string[] | 要害列表（打哪里收益最大） | `inv3`（目前只展示，没有分区判定） |
| `arms` | string[] | 舰载武备用**自然语言**描述（不给新编号，见下） | `inv3` |
| `neutral` | bool | 未参战方（南十字 / 冰芯 / 环礁），`value` 一律为 0 | `inv3`（渲染成"不该打"徽章） |
| `label` | string | HUD 标签（舰名，不带"3"这种下标） | `spawnShip`（`o.label \|\| s.label \|\| s.cn`） |
| `desc` | HTML string | 资料库正文 | `inv3` |

### 航速：表里是节，`route` 里是米/秒

`SHIPS[].speed` 是**节**（展示值），而 `makeTarget` 的 `route.speed` 要**米/秒**。
`spawnShip` **故意不替调用方换算**：航速是任务要做的决定（停在原地的支援舰和
40 节冲过来的快艇是两回事），所以任务里直接写米/秒，需要按表换算时自己乘 0.514。

`route` 有两种用法（都由 `entities.js` 的 `stepTarget` 航路分支执行，优先于 `drift`）：

- `{ wp: [a, b], speed, loop: true }` —— 在两点间往返巡航，大部分舰船都是这种；
- `{ wp: [...], speed, loop: false }` —— 真的航路，走到终点为止（m10 的登陆舰就是这样往北开）。

不给 `route` 就是锚泊目标（只剩 `drift`）。

### 为什么 `arms` 是文字而不是武器编号

舰载弹药与机载弹药**共用同一套逻辑语编号**（`WEAPONS` 里的 `BAD-` / `SPO-` 系列
两边都用），所以给舰船编一套平行编号会立刻产生两套真相。
但反过来直接写 `BAD-9` 也不对 —— **舰载型的包装不同**（垂直发射箱里不需要
进气与翼面），射程与战斗部都不一样，同一个编号会误导。

于是 `arms` 用文字："32 单元舰空弹垂发"、"反舰导弹 ×8"。
`arms` 不参与战斗：舰船在关卡里开不开火、打什么，由任务调用 `spawnShip` 时传的
`o.weapon`（`WEAPONS` 的键）决定，与 `arms` 的文字无关。
`weapon` 对**我方舰艇（team 0）**同样有效：上游驱逐舰带的是专门的舰载弹 `ss6`（FAN-6 海墙，`fits: []`），
只打敌机、从不朝玩家开火（选目标规则见 [ai.md](ai.md)）。team 2（中立）带了也不开火。

### 与 `AIRCRAFT` 的结构性差异

| | `AIRCRAFT` | `SHIPS` |
|---|---|---|
| 消费方 | 装配飞机、机库、图鉴、AI | `spawnShip`、图鉴、单位详情页、自检 |
| 是否参与飞行模型 | 是（`phys` 直接拷进敌机） | 否（船没有 `phys`；移动走 `makeTarget` 的 `route` / `drift`） |
| 性能字段 | `phys.vMax` 等 9 个数 | 没有 —— 只有 `speed`（节）一个展示值，实际航速由任务的 `route.speed`（m/s）给 |
| 唯一必填的几何字段 | `model` | `model` + `id`（预览器按 `id` 命名文件） |

**船没有 `phys` 是有意的**：`makeTarget()` 生成的目标物本来就不跑飞行模型，
只有位置、`drift` 漂移和 `route` 航路。航路是直线推进，`vel` 与 `fwd` 由实际位移反推，
不需要转弯率、加速度这类参数。

---

## WEAPONS 表

对象，44 键。**对象键是内部代号**（`v11` `k3` `dl4`…），玩家看到的永远是 `name`。改键名要动多个文件，别改。

`kind` 取值（当前分布）：

| kind | 数量 | 含义 | 例 |
|---|---|---|---|
| `gun` | 5 | 机炮（四方各有一条自己的供应线） | `k3` `k7` `k11` `k1` `k2` |
| `aam` | 18 | 空空 | `srm` `mrm` `v11`… |
| `asm` | 3 | 反大型 / 反舰 | `sat` `v22` `vsr` |
| `agm` | 5 | 对地 | `asl` `v25` `lcm`… |
| `bomb` | 3 | 炸弹 / 火箭 | `rkt` `clb` `v30` |
| `ecm` | 8 | 吊舱（主动 `e4` `vsc` + 被动 6 件） | `e4` `ecm2` `vzu`… |
| `dew` | 1 | 定向能 | `l2` |

### 字段清单（按"谁有"分层）

**所有武器都有：**

| 字段 | 含义 | 缺省行为 |
|---|---|---|
| `id` | 内部键的副本 | 目前没被代码读，只是照应 |
| `name` / `cn` | 制式编号 / 中文代号 | 直接显示，缺了 `undefined` |
| `kind` | 见上表 | 决定几乎所有分支 |
| `ammo` / `cd` / `salvo` | 单点库存基准 / 原始冷却（会被补丁表覆盖）/ 一次扳机打出几发 | — |
| `prox` | 近炸半径（米） | 命中判定用 |
| `target` | `air` / `ground` / `ship` / `none` | `updateLock` 分"对空导引头"与"对面投放包线"两套判据 |
| `desc` | 简介（可含 HTML） | 机库卡片、图鉴 |
| `model` | `MODELS` 的键，**只有挂载物与飞出去的弹读它** | 缺省回退 `MODELS.missile`。吊舱一律写 `'pod'` —— 跟着导弹用 `'missile'` 的话两类挂载在画面上分不出来 |
| `stat` | `{dmg,spd,trn,rng,ecm}` 0..1 | ⚠️ **当前没有任何代码读取**（grep `.stat` 在 data.js 之外为零），是给未来界面留的 |

**飞行参数（可发射武器才有）：** `speed`（最大速度 m/s）、`boost`（助推加速度 m/s²）、`life`（动力段秒）、`vsLife`（总寿命秒）、`turn`（最大转向率 rad/s）。`smoke.js` 要求非 `passive` 且非 `ecm`/`dew` 的武器必须有 `speed` 与 `life`。

**导引参数（制导弹才有）：** `seeker`（`ir` / `radar` / `eo` / `laser` / `none`）、`lockCone`（弧度）、`lockDist`（米）、`flare`（0..1，被干扰弹骗到的概率）。

**特殊能力布尔标记：**

| 标记 | 语义 | 代码是否真的读它 |
|---|---|---|
| `unguided` | 无制导，走弹道 | ✅ `entities.js` `game.js` |
| `ballistic` | 无动力（滑翔/自由落体） | ✅ `entities.js` |
| `reAcquire` | 丢目标后重捕一次 | ✅ `entities.js` |
| `nezer` | 冲压弹，锁定时长 1.5 s | ✅ `game.js` |
| `scramjet` | 18 km 以上动力段 ×0.24 | ✅ `entities.js`、`hud.js` |
| `highAltImmune` | 过载不随空气变稀崩塌；低空推力 / 滑翔掉速有代价 | ✅ `entities.js` |
| `hobs` | 大离轴：出膛后导引头视场 = max(77°, `lockCone`) | ✅ `entities.js` `stepMissile` |
| `cluster` | 子母弹覆盖半径（米） | ✅ `entities.js` `clusterBurst`、`game.js` |
| `penetrator` | 侵彻：对 `HARD_MODELS` 全额伤害 | ✅ `entities.js` `warheadK` |
| `loft` | `{alt, dive}` 攻顶弹道 | ✅ `entities.js` `stepMissile` |
| `decoyMemory` | 不被同一团诱饵云骗第二次（CLA-4） | ✅ `entities.js` `decoyRecheck` |
| `twinSeeker` | 双导引头，连中两次诱饵才脱锁（BIN-9） | ✅ `entities.js` `breakLock` |
| `antiRadar` | 对辐射中的目标伤害 ×2 | ✅ `entities.js` `detonate` |
| `passive` | 被动吊舱，不扣扳机 | ✅ `game.js` `passiveEffects()` |
| `duration` / `lockReduce` | ECM 生效时长与压缩比 | ✅ `game.js` |
| `charges` / `recharge` / `interceptRange` / `interceptCone` / `interceptChance` / `highAltChance` | 定向能拦截 | ✅ `entities.js` `game.js` |

`highAltScale` / `selfBlind` / `emitter` / 武器上的 `bigTarget` 曾是"写了没人读"的说明性标记，**已全部删除**
（`bigTarget` 现在只是 `missions.js` 写在**实体**上的标签）。

**desc 模板**：`desc` 里可以写 `{{字段}}` 与派生量（`coneDeg` `lockKm` `hardPct` `loftAlt` …），
`data.js` 末尾的 IIFE 在所有补丁表合并之后替换成当前数值。
以前还会给重武器自动追加一句交战规则提示（`roeRestricted()`），随武器锁定一起删了。完整列表见 [weapons.md](weapons.md#特殊标记)。

**被动吊舱专属字段**（`passive: true` 才有）：`lockResist` `lockRangeBonus` `flareBonus` `armorBonus` `silentLock`。汇总在 `entities.js` 的 `Ent.passiveEffects(list)`（`game.js` 只负责把挂载点分组翻译成 `{wid,n}` 列表；**敌机的 `o.pods` 走同一个函数**）：`lockResist` 取最大值，其余按挂载点数累加，`armor` 上限 0.55、`lockRange` 上限 1.9；`silentLock` 是布尔，任一被动测距吊舱即可点亮。

### 注入字段

以下字段**不在 `WEAPONS` 里手写**，由文件后面的补丁表合并进来：

| 字段 | 来自 | 谁读 |
|---|---|---|
| `fits` / `perPoint` / `mass` | `STORE_ATTR` | 挂载适配（玩家）、单点携弹量、挂载重量 |
| `npcFits` | **手写在 `WEAPONS` 条目里**，不经过补丁表 | NPC 的挂载适配（`Ent.fitsKind`）——只给下游专用弹写 |
| `role` | `STORE_ROLE` | 机库卡片、图鉴"定位"列 |
| `needs` | `STORE_NEEDS` | `canCarry()` |
| `lead` | `MISSILE_LEAD` | 导弹提前量预测 |

**合并函数只认已存在的键**，写法是：

```js
for (var k in STORE_ATTR) {
  if (!Object.prototype.hasOwnProperty.call(WEAPONS, k)) continue;
  for (var f in STORE_ATTR[k]) WEAPONS[k][f] = STORE_ATTR[k][f];
}
```

所以**拼错键名 = 静默丢弃**：不报错、不警告，只是那件武器永远没有挂载属性。最典型的后果是它从机库里消失，而且在图鉴里**掉进「下游装备」表**（见 [codex.md](codex.md)）。

---

## 补丁表：为什么单独放

### `STORE_ATTR`（29 键）

```js
srm: { fits: ['tip', 'light', 'heavy'], perPoint: 8, mass: 95 }
```

单独放的理由是"一眼横着比较谁挂得下、谁带得多、谁更重"。`fits` 的取值只有四种：`tip` / `light` / `heavy` / `belly`。

**下游专用弹（`vzu` `vgt` `vsr` `vbn` `otr` `dl4` `dl6` `dl9` `vsc`，以及上游舰载的 `ss6` FAN-6）直接把 `fits: []` 写在 `WEAPONS` 里，不放进 `STORE_ATTR`**——空数组 = 玩家挂不上。`vsc`（SAV-14 焦炬）是下游的**烧穿吊舱**：主动 ECM，靠 `jamRadius` / `jamK` 在 `world` 里建范围压制场（见 [game.md](game.md) 的 `updateJamming()`）。

这些弹另有一个手写字段 `npcFits`（**只有它们有**）：

| 武器 | `npcFits` |
|---|---|
| `dl4` | light, heavy |
| `dl6` / `vbn` / `otr` | tip, light, heavy |
| `vsc` / `vzu` | light, belly |
| `vgt` | heavy, belly |
| `vsr` | heavy |
| `dl9` | 不写（地面发射，不上机） |

原因见 [loadout.md](loadout.md#npc-的挂载)：`fits: []` 的语义是"上游拿不到实物"，
而渲染实体挂载时把它当"挂不上"就会把敌机机翼清空。
`Ent.fitsKind()` 按 `a.isPlayer` 在两张表之间选。

### `STORE_ROLE`（38 键）

一句话定位。机炮（`k1` `k2` `k3` `k7` `k11`）与下游烧穿吊舱 `vsc` 没有条目，所以它们没有 `role`；图鉴/卡片用 `(w.role || '—')` 兜底。

### `STORE_NEEDS`（9 键）

```js
asl2: ['strike'], v25: ['strike'], lcm: ['strike'], sat: ['strike'], v22: ['strike'],
hva: ['intercept'], vlar: ['intercept'], e4: ['ew'], l2: ['ew']
```

判定在 `canCarry(ac, w)`：**没有 `needs`（或空数组）一律放行**。这是刻意的——门槛只加在少数重型弹上。

### `STORE_COOLDOWN`（28 键）

"**每个发射槽**的装填时间"，不是每件武器。注意它与 `WEAPONS[].cd` 的关系：**补丁表覆盖原始 `cd`**。

⚠️ **下游专用弹不在表里**（`vzu:6.8` `vgt:11` `vsr:15.6` `vbn:8` `otr:6` 保留的就是 `WEAPONS` 里写的原始值）；例外是上游舰载 `ss6`，在表里（`ss6: 15`）。这是**有意的**：它们只给 NPC 用，不参与玩家的槽计时。但对**玩家可发射武器**，`smoke.js` 会强制要求写进 `STORE_COOLDOWN`——漏写会用旧语义的 `cd`，可能快得离谱（历史上 CLA-17 就这样漏过一次）。

### `MISSILE_LEAD`（28 键）

导引品质 0..1。合并时**跳过 `unguided`**：

```js
if (WEAPONS[k].unguided) continue;
WEAPONS[k].lead = MISSILE_LEAD[k];
```

理由写在源码里：无制导弹没有导引头，留一个 0 反而让人以为"它能追踪一点点"。

**静默回退**：`entities.js` 里 `var lead = (w.lead === undefined) ? 0.6 : w.lead;`。也就是说漏写 `lead` 不会报错，而是悄悄拿到 **0.6**——一个"中等聪明"的弹。`smoke.js` 会拦（除 `unguided` / `seeker === 'none'` / `passive` / `gun` 之外都必须有 `lead`）。

### `FLARE_RD`（14 键，只发给雷达弹）

干扰弹是**热焰弹 + 箔丝**一起投的，所以同一枚弹对两种导引头其实有**两个**概率：

| 字段 | 谁吃 | 场景 |
|---|---|---|
| `flare` | 红外导引头 | 热焰弹 |
| `flareRD` | 雷达导引头 | 箔丝 |

合并时**只往 `seeker === 'radar'` 的弹上写**（往红外弹上写箔丝概率没有意义）：

```js
if (WEAPONS[k].seeker !== 'radar') continue;
WEAPONS[k].flareRD = FLARE_RD[k];
```

它修的是设定 8.3 里明确记着的那个"待修的数值问题"：`flare` 当初逐个手调、
没按导引头排序，于是雷达弹平均（0.66）反而**比红外弹（0.44）更好骗**，
与"多普勒滤波该让雷达弹更难骗"相反。现在空空的雷达弹整体压到红外弹均值
以下（CLA-4 的 0.30 是全场最难骗的一枚），对地/反大型弹保持高值。

**静默回退**：`breakLock()` 里 `w.flareRD !== undefined ? w.flareRD : w.flare`。
`smoke.js` 会拦：所有雷达弹都必须显式给出 `flareRD`，且"空空雷达弹均值
必须低于红外弹均值"（这条断言就是设定 8.3 从"待修"变"已修"的证据）。

---

## 纯函数

### `missileRange(w)` → 公里数 或 `null`

```js
if (w.passive) return null;                     // 吊舱不"飞到某处"
if (!w.speed || !w.life) return null;
var v0 = 350;                                   // 载机初速
if (!w.boost) return w.speed * w.life / 1000;   // 无动力
var tAcc = Math.min(w.life, Math.max(0, (w.speed - v0) / w.boost));
// 之后 = v0·tAcc + ½·boost·tAcc²（加速段）+ speed·(life−tAcc)（匀速段）
```

不用 `speed × life` 的原因：忽略了加速阶段。返回 `null` 表示"它不是能打到某处的东西"（吊舱）。

### `canCarry(ac, w)`

只看**能力门槛**，`fits` 由调用方另行判断。两层筛选相互独立，见 [loadout.md](loadout.md)。

### `loadoutPenalty(lf)`

返回 `{ vMax: 1-0.08*lf, vMil: 1-0.06*lf, vStall: 1+0.05*lf, accel: 1-0.26*lf, decel: 1+0.10*lf, pitch: 1-0.18*lf, roll: 1-0.12*lf }`。

**机库面板与物理共用这一份**，这是硬性约定：以前两处各写一套，面板只算了俯仰那一项，把最狠的加速 −26% 漏掉了。不要在别处再抄一遍系数。

### `downstreamCallsign(i)`

`var c = CS_DOWNSTREAM[i % CS_DOWNSTREAM.length]; return c.cn + ' ' + c.en;`

**20 条循环取用，越界不报错而是回绕**。`missions.js` 里用的是固定下标（0、5、9、15、17…），给某个编队加编号时要留意别撞到别人的号段。

---

## VOICES（无线电台词）

```js
VOICES = { m1: { start: [...], tally: [...] }, m2: {...}, ..., m12: {...}, sk1: {...} }   // 13 个任务
```

每个事件是**数组**，元素 `{ who, cls, tx, gap }`：

| 字段 | 含义 | 缺省 |
|---|---|---|
| `who` | 发言人（拼在 `who` span 里） | 缺了只显示正文 |
| `cls` | `ally` / `enemy` / `cmd` / `fx` | 回退成 `'ally'`；`fx` 不播无线电音 |
| `tx` | 正文，可含 HTML | 缺了显示 `undefined` |
| `gap` | 念完后等几秒 | 回退成 `1.4` |

`Radio.play(missionId, evt)` 的写法是：

```js
var v = VOICES[missionId];
if (!v || !v[evt]) return;      // 找不到就静默返回
```

**静默返回是最大的坑**：拼错事件名不会报错，只会"这段台词从来不出现"。`preflight` 只检查 `VOICES[m.id]` 存在，**不检查事件名**。

### 事件名与触发点

| 任务 | 事件键 | 触发处 |
|---|---|---|
| m1 | `start` / `tally` `kill1` `kill2` `kill3` `lowQ` | `game.js` 开局、`missions.js` M1 `tick` |
| m2 | `start` / `spotted` `relayDown` `radarDown` `ambush` `baseHit` `baseLow` `baseLost` | M2 `tick` |
| m3 | `start` / `aceAppears` `bossHit` `bossPhase2` `aceKill` | M3 `tick` |
| m4 | `start` / `spotted` `hubHit` | M4 `tick` |
| m5 | `start` / `spotted` `radarDown` | M5 `tick` |
| m6 | `start` / `contact` `lowQ` `half` | M6 `tick` |
| m7 | `start` / `spotted` `landersDown` | M7 `tick` |
| m8 | `start` / `fleetHit` `shipLost` | M8 `tick` |
| m10 | `start` / `windowClosing` `lastOne` | M10 `tick`（时间到的那句是 `game.js` 用 `Radio.raw` 直接发的） |
| m12 | `start` / `contact` `aewDown` `cpDown` `bossPhase2` `aceKill` | M12 `tick` |
| sk1 | `start` | `game.js` 开局 |
| 全部 | `allyDown` | `game.js` 统一触发 —— **但只有 `m1` 定义了这个事件**，其余任务里僚机阵亡这句会静默跳过 |

**已定义但当前无人播的事件**：每个任务（含 `sk1`）的 `win` / `lose`，以及 `m1.playerHit` —— 数组都写好了，但 `finish()` 里没有 `Radio.play(..., 'win'/'lose')`，`playerHit` 也只在 `SFX` 里有同名音效（`audio.js`），无线电侧没有调用点。**这是一批"写好没接上"的台词**，改动前先确认是不是有意保留。

---

## 关键流程：数据 → 飞机（`entities.js` `makeAircraft`）

```js
for (i = 0; i < AIRCRAFT.length; i++) if (AIRCRAFT[i].id === o.type) ac = AIRCRAFT[i];
if (!ac) ac = AIRCRAFT[0];        // ← 静默回退
```

回退到 `AIRCRAFT[0]`（当前是 `frigatebird` DB-11）意味着：**`type` 写错 = 敌机长得像、飞得像、名字也叫 DB-11**，不报错。ROK-27 曾经没有表条目，HUD 上一直把它标成"军舰鸟"，就是这么来的。加机型时务必确认 `type` 与 `id` 对得上。

其余默认值（都在 `makeAircraft` 里）：`o.x` / `o.z` = `0`，`o.y` = `3000`，`o.speed` = `300`，`o.throttle` = `0.72`，`o.team` = `0`，`o.flares` = `80`；`o.special` 未指定时取 `ac.defaultLoadout` 里**第一个真值**（对象键插入序，通常就是 `A`），该武器不存在则置 `null`。

`game.js` 的 `preflight()` 会检查：`model` 存在、`gun` 存在、每组点数 ≥ 2、非 `npcOnly` 机型每组都至少有一件武器挂得上、`defaultLoadout` 的组与武器都真实且能挂、`phys.vMax` 存在、非 `npcOnly` 机型有俯视图。**能进自检的东西，不要靠读代码去记。**
`codex.js` 的 `inv1` / `inv2` 则直接遍历 `AIRCRAFT` / `WEAPONS` 生成图鉴，是防脱节的唯一手段（见 [codex.md](codex.md)）。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 某机型的飞行性能 | `AIRCRAFT[].phys` |
| AI 的实用升限 | `AIRCRAFT[].ceiling`（缺省 16000） |
| 满操控动压 / 低动压保底 | `AIRCRAFT[].ctrlFull`（默认 22000）/ `ctrlFloor`（默认 0.13） |
| 机库六维条 | `AIRCRAFT[].stats`（spd/mob/stl/fire/dur/rng） |
| 最大挂载重量 | `AIRCRAFT[].maxLoad` |
| 挂载惩罚系数 | `loadoutPenalty()`，**只此一份** |
| 单点携弹量 / 能不能挂某类挂点 / 单件重量 | `STORE_ATTR` |
| 每槽装填时间 | `STORE_COOLDOWN` |
| 提前量预测品质 | `MISSILE_LEAD`（缺省 0.6） |
| 能力门槛 | `STORE_NEEDS` + `AIRCRAFT[].caps` |
| 装备定位一句话 | `STORE_ROLE` |
| 下游呼号池 | `CS_DOWNSTREAM`（20 条，越界回绕） |
| 无线电台词 | `VOICES[任务id][事件名]` |
| **舰船的吨位 / 尺寸 / 舰种 / 要害 / 交战数值** | **`SHIPS`（16 条，`spawnShip` 按 `model` 查表）** |
| 某关里某条船的位置 / 航路 / 阵营 / 武器 | `missions.js` 里那次 `spawnShip` 调用（`route.speed` 是 m/s） |
| **舰船外形** | 不在本表 —— 见 `js/models.js` 的 `hull()` 与 [models.md](models.md#船体-hullsecs-colside-coldeck-colbottom) |

---

## 易踩的坑

1. **`WEAPONS` 键拼错进补丁表 = 静默丢弃**。五张补丁表都有 `hasOwnProperty` 检查，拼错的键既不会报错也不会生效。
2. **`flare` 必须显式写 `0`，不能省**（PEJ-30 的教训）。`breakLock` 的判定是 `if (Math.random() >= w.flare) continue;`——不写 `flare` 就是 `undefined`，比较恒为 `false`，弹**每次都被骗走**，和"不受干扰"正好相反。
3. **`lead` 缺省是 0.6，不是 0**。想要"笨弹"必须写负数方向的值（例如 TOR-2 是 0.38），不写只会得到中等水平的弹。
4. **`WEAPONS[].stat`（条形图预留）当前没有代码读取**；`AIRCRAFT[].stats` 才是机库六维条。别以为写上去机制就生效了。
5. **`CALLSIGN` 的 `awacs` / `enemy` / `ace` 是死字段**；改它们不会有任何效果。改预警机名要动 `VOICES` 的 `who`。
6. **`VOICES` 事件名写错 = 台词静默消失**，没有任何报错。
7. **`makeAircraft` 查不到机型就回退 `AIRCRAFT[0]`**，HUD 上的名字会张冠李戴而不报错。
8. **`AIRCRAFT[].nick` 缺失会抛异常**（机库 `ac.nick.toUpperCase()`）。
9. **下游弹故意不在 `STORE_COOLDOWN`**，保留 `WEAPONS` 里的原始 `cd`；不要把这条"补全"——那会改变 NPC 的开火节奏。
10. **`SHIPS` 的展示字段（`cls` / `disp` / `dim` / `crew` / `arms` / `vials` / `desc`）只有图鉴与详情页读**，
    删了不会立刻报错，只会显示 `undefined`；`hp` / `radius` / `value` / `label` 则被 `spawnShip`
    读进关卡，改了会直接改变战斗。`spawnShip` 查不到 `model` 会**静默回退 `SHIPS[0]`**（逆戟鲸），
    与 `makeAircraft` 回退 `AIRCRAFT[0]` 是同一类坑。
11. **`SHIPS[].id` 同时被 `tools/render-ships.js` 当作输出文件名**（`ship-<id>.png`）。
    改 `id` 会让旧预览图变成孤儿 —— 重跑一次预览器即可，但别以为文件名是自动的。
12. **`SHIPS[].speed` 是节、`route.speed` 是米/秒**，`spawnShip` 不换算。把表值直接抄进 `route` 会让船快将近一倍。

## 与其它模块的依赖关系

| 模块 | 关系 |
|---|---|
| `entities.js` | 读 `AIRCRAFT` / `WEAPONS` 装配飞机与导弹；读 `loadoutPenalty()`。**不读 `SHIPS`** |
| `game.js` | 机库、`preflight`、`launch`、`passiveEffects`、`resolveLoadout` 的展示侧 |
| `codex.js` | `build()` 里遍历 `AIRCRAFT` / `WEAPONS` / **`SHIPS`** 生成三份图鉴 |
| `unitview.js` | 遍历 `AIRCRAFT` + `SHIPS` 生成单位详情页 |
| `missions.js` | `Ent.makeAircraft` 传 `type`；用 `downstreamCallsign()` 取敌机呼号；`spawnShip()` 按 `model` 读 `SHIPS` |
| `ai.js` | 读 `AIRCRAFT[].ceiling` |
| `planform.js` / `hud.js` | 读 `hardpointGroups` 画俯视图与挂载条 |
| `tools/smoke.js` | 从 `index.html` 解析加载顺序，然后对上述各表做一致性断言 |
| `tools/render-ships.js` | 读 `SHIPS`（取模型列表与舰名）与 `MODELS`（取几何）渲染预览图 |

**改数据后必跑 `node tools/smoke.js`**；它会在浏览器之外把整个游戏加载一遍，专门抓"引用不存在的数据"这类静默错误。
