# 静态数据表总览

代码：`js/data.js` · 主要消费方：`entities.js`（装配飞机）、`game.js`（机库 / 自检 / 发射）、`codex.js`（图鉴）、`missions.js`（呼号）、`ai.js`（升限）

一句话职责：**data.js 只放纯数据与纯函数**——不碰 DOM、不碰 Canvas、不产生运行时状态。
机体的运行时对象由 `entities.js` 的 `makeAircraft()` 现场派生；挂载配置的派生（`getLoadout` / `resolveLoadout`）在 `game.js`；
**水面舰船（`SHIPS`）目前是纯数据，没有任何运行时派生**（见 [SHIPS 表](#ships-表)）。

> 武器机制与编号体系见 [weapons.md](weapons.md)，挂载点机制见 [loadout.md](loadout.md)。
> 本文只讲**表结构与字段契约**：每张表有什么字段、缺了会怎样、谁在读它。

---

## 代码位置与职责边界

| 项 | 事实 |
|---|---|
| 文件 | `js/data.js`，2026 行，全中文注释 |
| 加载位置 | `index.html` 里紧随 `codex.js` 之后、`entities.js` 之前（`version.js` 不计入模块表） |
| 模块形式 | 经典 `<script>` + 全局 `var`，没有 `export`、没有构造函数 |
| 依赖 | **零**。只用到 `Math`（`45 * Math.PI / 180` 这类） |
| 谁在这里校验 | **没有**。校验在 `game.js` 的 `preflight()` 与 `tools/smoke.js` |

**加载顺序是契约的一部分**：`codex.js` 在 `data.js` 之前求值，所以 codex.js 里凡是要读 `AIRCRAFT` / `WEAPONS` 的代码，必须包在函数体里等 `build()` 被调用时才求值。这也是图鉴条目写成 `build: function () {...}` 而不是静态字符串的原因。

**IIFE 补丁表在文件里就地执行**：`STORE_ATTR` / `STORE_ROLE` / `STORE_NEEDS` / `STORE_COOLDOWN` / `MISSILE_LEAD` 都在定义后紧跟一个匿名 IIFE，把值合并进 `WEAPONS`。所以**读 `WEAPONS` 读到的已经是合并后的完整表**，不要再去别的表里查一遍。

---

## 导出总览

| 名字 | 类型 | 规模（当前） | 谁在读 |
|---|---|---|---|
| `CALLSIGN` | 对象 | 6 键 | `game.js`、`missions.js` |
| `AIRCRAFT` | 数组 | **14** 条（可驾驶 6） | `entities.js` `makeAircraft`、`game.js`、`codex.js`、`ai.js`、`planform.js`、`hud.js` |
| `SHIPS` | 数组 | **16** 条 | **目前只有 `codex.js` 的 `inv3` 图鉴**在读（见下） |
| `WEAPONS` | 对象 | **39** 键 | `entities.js`、`game.js`、`ai.js`、`hud.js`、`codex.js` |
| `STORE_ATTR` | 对象 | 29 键 → 注入 `fits` `perPoint` `mass` | 间接；挂载系统 |
| `STORE_ROLE` | 对象 | 37 键 → 注入 `role` | 机库卡片、图鉴 |
| `STORE_NEEDS` | 对象 | 9 键 → 注入 `needs` | `canCarry`、`preflight` |
| `STORE_COOLDOWN` | 对象 | 27 键 → 覆盖 `cd` | `launch()` 的槽计时 |
| `MISSILE_LEAD` | 对象 | 27 键 → 注入 `lead` | 导弹提前量 |
| `CS_DOWNSTREAM` | 数组 | 20 条 `{cn,en}` | `missions.js` |
| `downstreamCallsign(i)` | 函数 | — | `missions.js` |
| `missileRange(w)` | 函数 | — | 机库卡片、图鉴 |
| `canCarry(ac,w)` | 函数 | — | `game.js`、`preflight` |
| `loadoutPenalty(lf)` | 函数 | — | `game.js` 面板 + `entities.js` 物理 |
| `VOICES` | 对象 | 3 个任务 | `game.js` 的 `Radio` |

规模数字会随内容增长，以上是核对 `data.js` 时的值——数错不会报错，只当参考。

---

## CALLSIGN

```js
var CALLSIGN = {
  player: 'VESPER-1', wing2: 'VESPER-2', wing3: 'VESPER-3',
  awacs: 'SEXTANT', enemy: 'FLINT', ace: 'DRYWELL'
};
```

| 字段 | 用途 | 读取点 |
|---|---|---|
| `player` | 玩家 HUD 名、结算页呼号、无线电发言者 | `game.js` 出击/结算/无线电 |
| `wing2` / `wing3` | 事件台词里的僚机发言者 | `game.js` 事件分支 |
| `wing<idx>` | **动态拼键**：`missions.js` 用 `CALLSIGN['wing' + idx]`（idx = 2 / 3）取名 | `missions.js` `spawnWingman` |
| `awacs` / `enemy` / `ace` | **三个都无代码读取**：`SEXTANT` 与干井的名字写死在 `VOICES` 的 `who` 里，敌机呼号走 `CS_DOWNSTREAM` | — |

**契约**：键缺失不会崩溃，但会渲染成字符串 `"undefined"`——读法都是直接拼进 innerHTML / textContent。
`wing<idx>` 尤其隐蔽：它用的是**动态键名**，加/改僚机编号时要同时看 `missions.js`。

---

## AIRCRAFT 表

数组，14 条。6 条可驾驶（`c11 c14 s6 c9 c21 c33`），8 条NPC（带 `npcOnly: true`：`ucav m27 gal31 vac14 rok40 k8 spray a2`）。

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
| `ctrlFull` | number | — | `entities.js` `ctrlFactor` 回退成 `22000`（只有 `c9` 写 16500） |
| `ctrlFloor` | number | — | 回退成 `0.13`（只有 `c14` 写 0.34） |
| `variableSweep` | bool | — | 只有 `c11` 有；`entities.js` 据此做变后掠翼插值 |
| `stats` | 对象 | ✅ | 机库六维条；键见下，缺某个维度会算出 `NaN` 宽度 |
| `phys` | 对象 | ✅ | **飞行模型的唯一来源**；`preflight` 只检查 `phys.vMax` |
| `gun` | string | ✅ | 必须是 `WEAPONS` 的键；`makeAircraft` 里 `WEAPONS[ac.gun].ammo` **无保护**，缺了就抛异常 |
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
| `stl` | 低可探测 | ❌ 机型固有 |
| `fire` | 火力 | ❌ |
| `dur` | 生存性 | ❌ |
| `rng` | 航程 | ❌ |

**这是"六维"的唯一实现**：`stats` 的键名写错 = 那一条算成 `NaN`，条形图宽度变 `NaN%`，不会报错。

### `hardpointGroups` / `defaultLoadout`

```js
hardpointGroups: [
  { id: 'A', label: '翼尖', kind: 'tip', pts: [{ x: 7.5, y: -2.8 }, { x: -7.5, y: -2.8 }] }
],
defaultLoadout: { A: 'srm', B: 'v11', C: 'qsr', D: 'oep' }
```

- `pts` 是机体系俯视坐标，**同时是俯视识别图的引线锚点**（单一数据源，别再建一份）
- `pts.length` 必须是**偶数**（成对挂载），`preflight` 会查
- `defaultLoadout` 的值是 `WEAPONS` 的键或 `null`；NPC 机型写 `{}`
- 完整语义（`kind` 适配、`perPoint`、被动吊舱、能力门槛）见 [loadout.md](loadout.md)

---

## SHIPS 表

数组，**11** 条，覆盖四方参战势力与三个未参战国家（见设定集 8.0.1）。
每条的设定散文在 `desc` 里，游戏内由 `codex.js` 的 `inv3` 图鉴展示。

**这张表目前是"预置"状态**：数据、几何、资料库条目全部就位，
但 `missions.js` 里一个 `spawnTarget` 都还没引用它。这是有意的 ——
先把船做出来并进自检，再决定它们在关卡里扮演什么角色。

### 字段清单

| 字段 | 类型 | 含义 | 谁在读 |
|---|---|---|---|
| `id` | string | 内部键，**同时是 `MODELS` 的键与预览图文件名** | `inv3`、`tools/render-ships.js` |
| `model` | string | `MODELS` 的键（当前 11 条与 `id` 一一对应，但保留这个字段以便多艘复用同一模型） | `inv3`、渲染 |
| `hull` | string | 制式编号或船名前缀（`BLO-11` / `MV SOUTHERN CROSS`） | `inv3` |
| `name` / `cn` | string | 英文舰名 / 中文舰名 | `inv3` |
| `cls` | string | 舰种（护航驱逐舰 / 导弹快艇 / 布缆船…） | `inv3` |
| `faction` / `operator` | string | 阵营 / 实际使用方 | `inv3`（按 `faction` 分组） |
| `role` | string | 一句话定位 | `inv3` |
| `disp` / `dim` / `speed` / `crew` | number / number[] | 满载吨位 t / 主尺度 `[长, 宽, 吃水]` m / 航速 kn / 编制人数 | `inv3` |
| `hp` / `radius` / `value` | number | **建议的交战数值**：结构值 / 受击半径 / 任务价值分 | **没人读** |
| `vials` | string[] | 要害列表（打哪里收益最大） | `inv3`；接入关卡时作为判定点建议 |
| `arms` | string[] | 舰载武备用**自然语言**描述（不给新编号，见下） | `inv3` |
| `neutral` | bool | 未参战方（南十字 / 冰芯 / 环礁），`value` 一律为 0 | `inv3`（渲染成"不该打"徽章） |
| `label` | string | HUD 建议标签（舰名，不带"3"这种下标） | **没人读**；接入关卡时传给 `spawnTarget` |
| `desc` | HTML string | 资料库正文 | `inv3` |

**`hp` / `radius` / `value` / `label` 现在没有任何代码读取** —— 这是刻意的：
它们要等 `missions.js` 真的把船放进去才有意义，先写好是为了让接入时
不必再回来设计数值。这与 `MODELS` 里的 `span` / `sea` 是同一个性质（见
[models.md](models.md#易踩的坑与设计取舍)）。

### 为什么 `arms` 是文字而不是武器编号

舰载弹药与机载弹药**共用同一套逻辑语编号**（`WEAPONS` 里的 `BAD-` / `SPO-` 系列
两边都用），所以给舰船编一套平行编号会立刻产生两套真相。
但反过来直接写 `BAD-9` 也不对 —— **舰载型的包装不同**（垂直发射箱里不需要
进气与翼面），射程与战斗部都不一样，同一个编号会误导。

于是 `arms` 用文字："32 单元舰空弹垂发"、"反舰导弹 ×8"。
要真的接进战斗，得先决定舰载弹是复用 `WEAPONS` 条目还是新增 ——
那是接入关卡时的事，不在本表的范围内。

### 与 `AIRCRAFT` 的结构性差异

| | `AIRCRAFT` | `SHIPS` |
|---|---|---|
| 消费方 | 装配飞机、机库、图鉴、AI | 目前只有图鉴 |
| 是否参与飞行模型 | 是（`phys` 直接拷进敌机） | 否（船没有 `phys`，也还没有航路逻辑） |
| 性能字段 | `phys.vMax` 等 9 个数 | ✅ 没有 —— 只有 `speed`（节）一个展示值 |
| 唯一必填的几何字段 | `model` | `model` + `id`（预览器按 `id` 命名文件） |

**船没有 `phys` 是有意的**：`makeTarget()` 生成的目标物本来就不跑飞行模型，
它们只有位置与漂移。要让 40 节的快艇真的跑起来，得给 `entities.js` 补一套
航路逻辑（现有 `drift` 只支持按正弦缓慢漂移），那是独立的一件事。

---

## WEAPONS 表

对象，39 键。**对象键是内部代号**（`v11` `k3` `dl4`…），玩家看到的永远是 `name`。改键名要动多个文件，别改。

`kind` 取值（当前分布）：

| kind | 数量 | 含义 | 例 |
|---|---|---|---|
| `gun` | 5 | 机炮（四方各有一条自己的供应线） | `k3` `k7` `k11` `k1` `k2` |
| `aam` | 18 | 空空 | `srm` `mrm` `v11`… |
| `asm` | 3 | 反大型 / 反舰 | `sat` `v22` `vsr` |
| `agm` | 5 | 对地 | `asl` `v25` `lcm`… |
| `bomb` | 3 | 炸弹 / 火箭 | `rkt` `clb` `v30` |
| `ecm` | 7 | 吊舱（主动 + 被动） | `e4` `ecm2`… |
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
| `stat` | `{dmg,spd,trn,rng,ecm}` 0..1 | ⚠️ **当前没有任何代码读取**，是给未来界面留的 |

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
| `bigTarget` | 大型目标标记 | ✅ `missions.js`（打大目标） |
| `highAltImmune` | 过载不随空气变稀崩塌 | ✅ `entities.js` |
| `passive` | 被动吊舱，不扣扳机 | ✅ `game.js` `passiveEffects()` |
| `duration` / `lockReduce` | ECM 生效时长与压缩比 | ✅ `game.js` |
| `charges` / `recharge` / `interceptRange` / `interceptCone` / `interceptChance` / `highAltChance` | 定向能拦截 | ✅ `entities.js` `game.js` |
| `highAltScale` | 标注"会受高空缩放" | ❌ **无人读取**（缩放由 `turnFactor()` 对所有弹统一做） |
| `hobs` | 标注"大离轴" | ❌ 无人读取（离轴能力实际由 `lockCone` 决定） |
| `cluster` | 标注"集束" | ❌ 无人读取 |
| `selfBlind` | 标注"干扰是双向的" | ❌ 无人读取 |

**这四个未被读取的标记保留是有意义的**——它们是给读表人（和未来机制）的说明，但别指望写上去就生效。

**被动吊舱专属字段**（`passive: true` 才有）：`lockResist` `lockRangeBonus` `flareBonus` `armorBonus`。汇总在 `game.js` 的 `passiveEffects()`：`lockResist` 取最大值，其余按挂载点数累加，`armor` 上限 0.55、`lockRange` 上限 1.9。

### 注入字段

以下字段**不在 `WEAPONS` 里手写**，由文件后面的补丁表合并进来：

| 字段 | 来自 | 谁读 |
|---|---|---|
| `fits` / `perPoint` / `mass` | `STORE_ATTR` | 挂载适配、单点携弹量、挂载重量 |
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

**下游专用弹（`vzu` `vgt` `vsr` `vbn` `otr` `dl4` `dl6` `dl9`）直接把 `fits: []` 写在 `WEAPONS` 里，不放进 `STORE_ATTR`**——空数组 = 玩家挂不上。

### `STORE_ROLE`（37 键）

一句话定位。机甲机炮（`k1` `k2` `k3` `k7` `k11`）没有条目，所以它们没有 `role`；图鉴/卡片用 `(w.role || '—')` 兜底。

### `STORE_NEEDS`（9 键）

```js
asl2: ['strike'], v25: ['strike'], lcm: ['strike'], sat: ['strike'], v22: ['strike'],
hva: ['intercept'], vlar: ['intercept'], e4: ['ew'], l2: ['ew']
```

判定在 `canCarry(ac, w)`：**没有 `needs`（或空数组）一律放行**。这是刻意的——门槛只加在少数重型弹上。

### `STORE_COOLDOWN`（27 键）

"**每个发射槽**的装填时间"，不是每件武器。注意它与 `WEAPONS[].cd` 的关系：**补丁表覆盖原始 `cd`**。

⚠️ **下游专用弹不在表里**（`vzu:6.8` `vgt:11` `vsr:15.6` `vbn:8` `otr:6` 保留的就是 `WEAPONS` 里写的原始值）。这是**有意的**：它们只给 NPC 用，不参与玩家的槽计时。但对**玩家可发射武器**，`smoke.js` 会强制要求写进 `STORE_COOLDOWN`——漏写会用旧语义的 `cd`，可能快得离谱（历史上 CLA-17 就这样漏过一次）。

### `MISSILE_LEAD`（27 键）

导引品质 0..1。合并时**跳过 `unguided`**：

```js
if (WEAPONS[k].unguided) continue;
WEAPONS[k].lead = MISSILE_LEAD[k];
```

理由写在源码里：无制导弹没有导引头，留一个 0 反而让人以为"它能追踪一点点"。

**静默回退**：`entities.js` 里 `var lead = (w.lead === undefined) ? 0.6 : w.lead;`。也就是说漏写 `lead` 不会报错，而是悄悄拿到 **0.6**——一个"中等聪明"的弹。`smoke.js` 会拦（除 `unguided` / `seeker === 'none'` / `passive` / `gun` 之外都必须有 `lead`）。

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
VOICES = { m1: { start: [...], tally: [...] }, m2: {...}, m3: {...} }
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
| 全部 | `allyDown` | `game.js` 统一触发 |

**已定义但当前无人播的事件**：`m1.win` `m1.lose` `m1.playerHit`、`m2.win` `m2.lose`、`m3.win` `m3.lose` —— 数组都写好了，但 `finish()` 里没有 `Radio.play(..., 'win'/'lose')`，`playerHit` 也只在 `SFX` 里有同名音效（`audio.js`），无线电侧没有调用点。**这是一批"写好没接上"的台词**，改动前先确认是不是有意保留。

---

## 关键流程：数据 → 飞机（`entities.js` `makeAircraft`）

```js
for (i = 0; i < AIRCRAFT.length; i++) if (AIRCRAFT[i].id === o.type) ac = AIRCRAFT[i];
if (!ac) ac = AIRCRAFT[0];        // ← 静默回退
```

回退到 `AIRCRAFT[0]`（当前是 `c11` DB-11）意味着：**`type` 写错 = 敌机长得像、飞得像、名字也叫 DB-11**，不报错。ROK-27 曾经没有表条目，HUD 上一直把它标成"军舰鸟"，就是这么来的。加机型时务必确认 `type` 与 `id` 对得上。

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
| **舰船的吨位 / 尺寸 / 舰种 / 要害 / 建议交战数值** | **`SHIPS`（16 条，当前只有图鉴在读）** |
| **舰船外形** | 不在本表 —— 见 `js/models.js` 的 `hull()` 与 [models.md](models.md#船体-hullsecs-colside-coldeck-colbottom) |

---

## 易踩的坑

1. **`WEAPONS` 键拼错进补丁表 = 静默丢弃**。五张补丁表都有 `hasOwnProperty` 检查，拼错的键既不会报错也不会生效。
2. **`flare` 必须显式写 `0`，不能省**（PEJ-30 的教训）。`breakLock` 的判定是 `if (Math.random() >= w.flare) continue;`——不写 `flare` 就是 `undefined`，比较恒为 `false`，弹**每次都被骗走**，和"不受干扰"正好相反。
3. **`lead` 缺省是 0.6，不是 0**。想要"笨弹"必须写负数方向的值（例如 TOR-2 是 0.38），不写只会得到中等水平的弹。
4. **`highAltScale` / `hobs` / `cluster` / `selfBlind`（说明性标记）与 `WEAPONS[].stat`（条形图预留）当前都没有代码读取**；`AIRCRAFT[].stats` 才是机库六维条。别以为写上去机制就生效了。
5. **`CALLSIGN` 的 `awacs` / `enemy` / `ace` 是死字段**；改它们不会有任何效果。改预警机名要动 `VOICES` 的 `who`。
6. **`VOICES` 事件名写错 = 台词静默消失**，没有任何报错。
7. **`makeAircraft` 查不到机型就回退 `AIRCRAFT[0]`**，HUD 上的名字会张冠李戴而不报错。
8. **`AIRCRAFT[].nick` 缺失会抛异常**（机库 `ac.nick.toUpperCase()`）。
9. **下游弹故意不在 `STORE_COOLDOWN`**，保留 `WEAPONS` 里的原始 `cd`；不要把这条"补全"——那会改变 NPC 的开火节奏。
10. **`SHIPS` 里除 `id` / `model` / `faction` / `cn` / `hull` 之外的字段基本都没人读**。
    `inv3` 图鉴读的字段比游戏逻辑多，所以**在 `SHIPS` 里删字段不会立刻报错，
    只会让图鉴少一列或显示 `undefined`**。往里面加字段同理：加完要顺手在
    `inv3` 里决定要不要显示它，否则它只对读源码的人可见。
11. **`SHIPS[].id` 同时被 `tools/render-ships.js` 当作输出文件名**（`ship-<id>.png`）。
    改 `id` 会让旧预览图变成孤儿 —— 重跑一次预览器即可，但别以为文件名是自动的。

## 与其它模块的依赖关系

| 模块 | 关系 |
|---|---|
| `entities.js` | 读 `AIRCRAFT` / `WEAPONS` 装配飞机与导弹；读 `loadoutPenalty()`。**不读 `SHIPS`** |
| `game.js` | 机库、`preflight`、`launch`、`passiveEffects`、`resolveLoadout` 的展示侧 |
| `codex.js` | `build()` 里遍历 `AIRCRAFT` / `WEAPONS` / **`SHIPS`** 生成三份图鉴 |
| `missions.js` | `Ent.makeAircraft` 传 `type`；用 `downstreamCallsign()` 取敌机呼号；**尚未引用 `SHIPS`** |
| `ai.js` | 读 `AIRCRAFT[].ceiling` |
| `planform.js` / `hud.js` | 读 `hardpointGroups` 画俯视图与挂载条 |
| `tools/smoke.js` | 从 `index.html` 解析加载顺序，然后对上述各表做一致性断言 |
| `tools/render-ships.js` | 读 `SHIPS`（取模型列表与舰名）与 `MODELS`（取几何）渲染预览图 |

**改数据后必跑 `node tools/smoke.js`**；它会在浏览器之外把整个游戏加载一遍，专门抓"引用不存在的数据"这类静默错误。
