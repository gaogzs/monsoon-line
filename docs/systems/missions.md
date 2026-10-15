# 任务与战场生成

代码：`js/missions.js`（三关脚本）· `js/game.js`（`world` 对象、`startMission`、简报 `drawMap`）· `js/data.js`（`VOICES` 台词、`downstreamCallsign`）

---

## 1. 职责边界

`missions.js` 只有一个数组 `MISSIONS` 和几个生成器函数。它负责**每一关"战场长什么样"和"什么时候算赢/输"**：

| 做 | 不做 |
|---|---|
| `spawn(w)` 里摆飞机、平台、基地、兵力编成 | 主循环与状态机（`game.js`） |
| `tick(w, dt)` 里推目标文本、放台词、触发增援 | 实体物理与伤害（`entities.js`） |
| `win(w)` / `lose(w)` 返回胜负 | AI 行为（`ai.js`），只通过标签与 `behavior` 影响它 |
| 用 `w.flags` 做一次性触发器 | 简报页 DOM（`game.js` `buildBrief` 读字段） |

`world` 由 `game.js` `newWorld()` 建立，任务脚本往里**追加**关卡专属字段（`baseTarget`、`cells`、`ace`…）。字段清单与实体结构见 [entities.md](entities.md#36-世界对象-world)。

---

## 2. 完整公开接口

### 2.1 全局

| 成员 | 签名 | 语义 |
|---|---|---|
| `MISSIONS` | `Array<mission>` | 三关，顺序即关卡编号（`missionIdx`） |
| `getMission` | `getMission(idx) → mission` | 取任务，越界用 `M3.clamp` 夹回合法下标 |
| `CAMPAIGNS` | `Array<campaign>` | **战役分组**，见 §2.4。`game.js` 的战役选择屏读它 |

### 2.2 生成器（**都是全局函数，不在任何命名空间里**）

| 函数 | 签名 | 语义 |
|---|---|---|
| `spawnEnemy` | `spawnEnemy(w, o) → a` | 造一架敌机并推入 `w.actors`。`o` 字段见下表 |
| `spawnWingman` | `spawnWingman(w, idx, slotX, slotY, slotZ) → a` | 造僚机（机型写死 `ucav`，队形相对长机），登记 `w.wings[idx]` |
| `spawnTarget` | `spawnTarget(w, o) → t` | 调 `Ent.makeTarget(o)` 并推入 `w.targets` |
| `spawnAewc` | `spawnAewc(w, o) → a` | **空中预警机**：`spawnEnemy` + `a.aewc = true` + `route: {loiter:true, wp, exit}`。行为在 `game.js` 的 `updateAewc()` 里 |
| `bombTheBase` | `bombTheBase(bomber, w)` | 轰炸机抵达投弹点的动作：48 个爆炸粒子 + 对 `w.baseTarget` 造成 340 伤害 |

> **水面舰船还没有被这三个任务引用。** `data.js` 里的 `SHIPS` 表（11 艘，见
> [SETTING.md 8.0.1](../world/SETTING.md)）已经备好了 `model` / `hp` / `radius` /
> `value` / `label`，接进来只需要照着下面 `spawnTarget` 的写法加几行。
> 但**有一件事要先做**：现有 `makeTarget` 只支持按正弦缓慢漂移（`o.drift`），
> 而 40 节的导弹快艇需要一套真的航路逻辑 —— 那不在 `makeTarget` 的能力范围内。

`spawnEnemy` 的 `o` 字段：`ac`（AIRCRAFT id，缺省 `'m27'`）/ `x y z` / `fwd`（缺省 −z）/ `speed`（缺省 300）/ `special`（缺省 `'dl6'`）/ **`loadout`**（逐组挂载，见下一节）/ `skill`（缺省 0.55）/ `behavior`（缺省 `'pursue'`，同时写进 `a.ai.cmd`）/ `callsign` / `escort`（真值则 `a.ai.escort = true`）/ `wave` / **`team`**（缺省 1 / 敌方；**我方支援单位传 0**）/ **`pods`**（被动吊舱 id 数组，走 `Ent.passiveEffects()`，见 [loadout.md](loadout.md)）。

`special` 与 `pods` 都**同时管机制和外观**：

| 字段 | 机制 | 外观（实体挂载） |
|---|---|---|
| `special` | AI 唯一会发射的那件武器（`a.spAmmo` / `a.spCd`） | 铺满所有挂得住的组（`Ent.mountPlan`） |
| `pods` | `Ent.passiveEffects()` 汇总锁抗 / 装甲 / 干扰弹 | 从最后一组往前占（外侧 / 机腹），把重挂点留给 `special` |

两者是**共存**的：吊舱先占掉它挂得住的组，制式弹再铺满剩下的 ——
"一枚空空弹 + 一个干扰吊舱"就是这么来的（m3 的护航那样）。吊舱占位后
导弹的可视挂架会变少，但它的弹药池不变，AI 该打几发还是几发。

弹种能挂到哪类挂点由 `data.js` 的 `npcFits` 决定（**不是** `fits` —— 那是玩家机库的表）。
所以给敌机指定弹种时，要确认目标机型有对应的挂点类型：
`pelican` / `quartz` / `a2` / `gal44` 只有机腹挂点，写 `special: 'dl6'`（格斗弹）
不会画出来（也不会报错 —— 它照旧能发射）。

### 给 NPC 设计挂载

关卡里指定 NPC 挂什么，**上游与下游的写法不一样**：

| | 挂的是 | 写法 | 为什么不一样 |
|---|---|---|---|
| **上游 NPC** | 玩家那一套武器（`fits` 表） | 逐组 **`loadout: { 组id: 武器id }`** | 一型机能挂的东西很多，"带哪一种、带在哪一组"是任务要做的决定 |
| **下游 NPC** | 下游制式弹（`npcFits` 表） | 只写 `special`（+ 可选 `pods`） | 下游弹是单一弹种，适配表已经保证了它能落在哪几类挂点上 —— 没有"挑一件"这回事 |

**上游 NPC 的每一条都必须符合该挂点的选项限制。** 机库给玩家的选项是
`fits` ∩ `canCarry`，NPC 这边是同样两道：

1. **挂点类型**：这一组的 `kind` 必须在这件武器的适配表里
   （`data.js` 的 `hardpointGroups[].kind` × 武器的 `fits` / `npcFits`）
2. **机体能力**：武器的 `needs` 必须落在机型的 `caps` 里（`canCarry()`）

写错了**不会崩**：那一组空着，同时在 `Ent.mountIssues` 里记一条人话，
并在控制台 `console.warn` 一次。`smoke.js` 跑完所有任务后断言这份清单
是空的 —— 所以"配错了但没人发现"这条路是堵死的。
`node tools/render-mounts.js` 能把结果落成图，肉眼确认挂的是不是你想要的那些。

```js
// 一架用**上游武器**的 NPC 敌机（"上游 NPC"说的是它读哪张武器表，不是阵营）
spawnEnemy(w, {
  ac: 'c11', team: 1, x: 0, y: 8000, z: 6000,
  loadout: { A: 'srm', B: 'vgt' },   // A 翼尖 / B 重挂 —— 都是挂得上的组合
  special: 'srm',                    // 当前触发的那件的默认值
  skill: 0.7
});
```

几条**设计约束**（不是建议，是代码的边界）：

- **`loadout` 里的组就是全部装机。** 没写到的组空着 —— 不要指望
  `special` 去填满它（那层兜底只在完全没有 `loadout` 时才生效）。
- **`special` 可以省。** 没写就从 `loadout` 里取第一件当"当前触发的那件"；
  万一那一件被校验挡掉了，会自动换成第一件真挂上的（`buildNpcMounts`
  末尾的兜底），不会出现"AI 拿着一件不在机翼上的弹去开火"。
- **AI 只发射有导引头的武器。** 无制导弹（`clb` 炸弹 / `rkt` 火箭巢）
  它能挂、能画出来，但**不会投** —— AI 没有投弹瞄准逻辑。想让敌机对地，
  给它 `vgt` / `v25` / `lcm` 这类，而不是 `clb` / `rkt`。
- **混挂是有意义的**：AI 每次开火前按"目标类别（对空 / 对面）+ 射程"
  重挑一件（够得着的里面取射程最短的）。同一架飞机遇到空中目标用格斗弹、
  遇到海面目标用对地弹 —— 前提是两件都真的挂上了。
- **吊舱（`pods`）与逐组 `loadout` 可以共存**：`loadout` 先落位，
  吊舱只去占它没写到的组 —— 两者看中同一组时 `loadout` 赢。
- **带得动对面弹的敌机现在会主动去找面目标**（空中没有目标时）。
  这是新接上的一条 AI 行为：以前 `nearestEnemy` 只扫飞机，
  `world.targets` 对 AI 是不存在的。想让某关"敌机来炸基地"，
  给它一件对地弹就够了 —— 注意这会真的改变关卡的可失败条件。
- **对地攻击要安排在低一些的高度**。实测：从 5 km 平飞打 6 km 外的
  海面目标，`vgt` 会在离目标还有几百米的地方到期（20 秒寿命用完）——
  这型弹的动力段撑不住从高空斜着压下来的距离。3 km 上下进入就能命中。
  （AI 接近面目标时**不会**一头扎下去，见 ai.md 的 `approachSurface()`；
  所以"投得出去"这件事得由任务的高度安排保证。）

### 空中预警机

预警机是**航线型单位**（`a.route` 让 `AI.update` 完全绕开空战逻辑），
但它与轰炸机有一处不同：`route.loiter = true` 让它**在两个航点之间来回飞、
永不退场** —— 轰炸机是"事件"，预警机得一直在那儿。击落它是唯一让它消失的方式。

`spawnAewc(w, {ac, team, label, x, y, z, a, b})` 只负责造出来与设航线；
**它做什么**写在 `game.js` 的 `updateAewc()` 里（那里能用到 `bearing()` /
`setWingCmd()` / `Radio`）：30 km 搜敌 → 方位通报 → 我方调度僚机 /
敌方给下游分配目标 → 被 `suppressed` 压住时沉默。

- **m1** 放了一架上游 `J-2 鹈鹕`（team 0，`label: 'SEXTANT'`）—— 无线电里
  报了三关方位的那个人从此有了实体
- **m3** 放了一架下游 `ROK-2 石英`（team 1），以及一架 `GAL-44 磁石` 干扰机：
  后者用 `route.onArrive` 调 `Ent.openEcm(a, 'vsc')` 开机，然后掉头走

`spawnWingman` 写死的部分：机型 `ucav`、阵营 0、`isDrone: true`、`special: 'v9'`、AI `role: 'drone', skill: 0.62`、`formation: {dx,dy,dz}`（即传入的槽位）、`a.wingIdx = idx`。

### 2.3 台词（`data.js`）

| 成员 | 语义 |
|---|---|
| `Radio.play(missionId, evt)` | 按任务 id + 事件名取 `VOICES[missionId][evt]` 入队 |
| `Radio.raw(line)` | 直接插一条 `{ who, cls, tx, gap }` |
| `downstreamCallsign(i)` | 取第 i 个下游呼号，格式 `"枯河 DRYRIVER"`，越界取模 |

任务脚本用的是 `w.radio`（`newWorld` 里指向 `Radio`）。全局事件 `'start'` 由 `startMission` 播，`'allyDown'` 由 `game.js` 主循环播。

### 2.4 战役（`CAMPAIGNS`）

一场战役 = 一组关卡 + 一份展示文案。它**不参与战场生成**，
只是让 `game.js` 能画出"打的是哪一场仗"这一层。

| 字段 | 谁读 | 说明 |
|---|---|---|
| `id` | `preflight` | 战役标识，如 `cmp1` |
| `no` | 战役卡片 | `'CAMPAIGN 01'` |
| `name` / `en` / `sub` | 战役卡片 | 中文名 / 英文代号 / 完整行动代号 |
| `loc` / `period` | 战役卡片 | 区域与起止时间，都是纯展示 |
| `desc` | 战役卡片 | 一段话，压缩自 `codex.js` 的同名战役条目 |
| `missions` | `game.js` `campaignOf` / `campaignProgress` | **`MISSIONS` 的全局下标数组** |

三条硬约定：

1. **`missions` 里写的是全局下标，不是局部序号。** `missionIdx` 全项目
   只有一套（`MISSIONS` 的下标），战役不另建索引 —— 两套索引互相换算
   是这类分层界面最容易长出来的一类 bug。
2. **每一关恰好属于一个战役。** 漏挂会让关卡存在却永远选不到，
   `preflight()` 会报"没有归属任何战役"；重复挂也会报。
3. **`missions: []` 是合法的**，表示"资料封存"的占位战役：战役屏会把它
   画成不可点的卡片，且只写"该方向的作战档案尚未解封"——
   **不写地名与年份**，免得提前承诺还没定的设定。

`preflight()`（`game.js`）检查：下标越界、一关多挂、漏挂、
`id`/`name` 缺失。它**不检查** `desc` / `loc` / `period` —— 漏了只是卡片上少一行字。

---

## 3. 任务对象字段清单

对照 [DESIGN.md 第 10 节](../DESIGN.md#10-如何加一关)：

| 字段 | 谁读 | 说明 |
|---|---|---|
| `id` | `Radio.play`、`VOICES[id]`、`finish()` 的收尾语、`World` 预检 | **必须与 `VOICES` 的键同名** |
| `no` | 简报、开场 banner、结算副标题 | `'OPERATION 01'` |
| `name` / `en` | 同上 | 中文名 / 英文名 |
| `loc` / `date` | 简报页 | 地点、任务时间 |
| `altStart` / `speedStart` | `startMission` | 初始高度/速度，**会被 `spawn()` 覆盖**（见坑 §8.1） |
| `timeLimit` | 无 | 声明了但全项目没人读 |
| `prose` | 简报正文（`innerHTML`） | 允许 HTML |
| `objectives[]` | 简报目标列表 | 字符串数组 |
| `threats[]` | 简报威胁列表 | 字符串数组，样式类 `th` |
| `intel` | 简报情报栏（`innerHTML`） | 允许 HTML |
| `map[]` | `drawMap(m)` | `{ x, z, type, label }`，坐标含义见 §4 |
| `spawn(w)` | `startMission` 调一次 | 摆放全部初始单位 |
| `tick(w, dt)` | 主循环每帧 | 目标文本、触发器、增援 |
| `win(w)` / `lose(w)` | 主循环每帧，先 lose 后 win | 必须返回布尔值 |

**由任务脚本追加到 `world` 的字段**（非任务对象字段，但属于同一份契约）：

| 字段 | 出现于 | 用途 |
|---|---|---|
| `objective` / `objectiveSub` | 三关 | HUD 目标行 |
| `flags` | 三关 | 自由字典，一次性触发 |
| `baseTarget` / `baseHpFull` | m2 | 必须保护的前进基地；`baseHpFull` 写入后无人读取 |
| `baseWarnT` | m2 | 低血量反复提醒的节流计时 |
| `dangerAltitude` | m2 | 低于此高度可躲地面雷达（`updateTargets` 读） |
| `detected` | m2 | 被雷达照射；防空阵地开火的前置条件 |
| `roeActive` | m3 | 声明了但全项目没人读 |
| `roeBlocked` | m3 | 交战规则生效区；**`launch()` 真正读的是这个** |
| `cells[]` | m3 | 3×3 调节单元，与 `targets[]` 是同一批对象 |
| `ace` / `aceSpawned` | m3 | 王牌干井 |
| `friendlyLoss` | `game.js` `hitTarget` 写、`finish()` 读 | 误伤扣分 |

---

## 4. `map` 坐标的含义

`map` 里是**世界米**，相对进入点（DESIGN §10）：`x` = 东，`z` = 北，与游戏坐标系一致，但**没有 `y`**——它是俯视简报图，画不出高度。

`game.js` `drawMap(m)` 的映射：

```js
R  = 17000;                          // 半幅对应的世界距离
cx = W/2;  cy = H*0.72;              // 进入点钉在偏下位置，前方留白
MX(wx) = cx + wx / R * (W * 0.45);   // 横向
MY(wz) = cy - wz / R * (H * 0.62);   // 纵向（北向上）
```

- x / z 的缩放系数不同，所以地图是**压扁**的，别按它估算真实距离。
- `type` 决定颜色与形状：`base` 绿、`enemy` 红三角、`relay` 橙、`sam` 橙、`site` 青，未识别类型灰 `#8fa3b2`。
- 简报图上**不画陆地**：整个战役都在纯海域，画岛等于承诺一片不存在的地形。
- 玩家进入箭头画在 `(cx, cy)`，比例尺文字写死 `SCALE 1:170000`。

---

## 5. 三关的设计意图

| | m1 第一滴雨 | m2 铁砧之下 | m3 线 |
|---|---|---|---|
| 起点 | 7600 m / 330 m/s | 1400 m / 340 m/s | 19500 m / 520 m/s，加力 |
| 核心机制 | 基础拦截，动压充足 | 低空突防 vs 防空网 | 极高空、能量战 |
| 教学/张力点 | "把机头对准敌机" | "云下看不见敌人，也看不见你" | "这个高度没有加速这回事" |
| 特殊规则 | 测绘机受损后会逃跑且不主动开火 | 必须保护前进基地 | 阵列空域内重武器受限 |
| 唯一失败条件 | 玩家阵亡 | 玩家阵亡，或基地被毁 | 玩家阵亡，或 ≥2 架播撒机降到 14000 m 以下 |

**m1** 是教学关：5 架低速测绘机（skill 0.32）+ 2 架 VAC-14 护航。护航被明确排除在目标计数与胜利条件之外——简报说的是"5 个目标"，把它们算进去玩家会发现"剩余 N"对不上。测绘机血量掉到 75% 以下转为 `extend` 逃跑且停止射击；这既是叙事（"他们在测量，不是在打仗"），也让"打跑"和"打掉"在体感上有区别。

**m2** 是全作唯一有"必须保护的东西"的关卡。设计是一条**因果链**：三个浮空中继平台把地面测控平台的信号中继回南边 → 打掉地面测控平台触发下游截击机伏击 → 两架 ROK-40 轰炸机沿固定航线炸掉玩家的前进基地。`lose()` 在基地被毁时直接判负，**哪怕中继网已经拆干净**——这是轰炸机存在的全部理由。天气是核心约束：云底 900 m，而平台在 4000 m；爬到 1500 m 以上就会被雷达看见（`w.detected`），这时四个防空浮台才会开火。

**m3** 把飞行模型推到边界：20 km、密度只有海平面 7.2%、动压只剩几千帕。交战规则"20 公斤以上战斗部全部锁定"逼玩家用机炮——而高空弹道平直、机炮有效射程反而提升到约 2.6 km，形成一个"抓窗口时间极短但打得远"的独特战斗节奏。3×3 调节单元是**中立目标**（`team: 2`）：不受锁定循环青睐，但双方流弹都能打坏，玩家误伤要扣分。播撒机减到 3 架时王牌"干井"进场，血量过半后主动往下带——把他的高空能量优势换掉，这正是 m3 教玩家的事。

---

## 6. `spawn` / `tick` / `win` / `lose` 的约定

```
startMission(idx)
  world = newWorld();  player = makeAircraft(...);  world.actors.push(player)
  mission.spawn(world)              ← 在这里摆战场；player 已经在 actors 里
  world.time = 0，之后每帧：
      ...
      mission.tick(world, dt)
      compact()
      if (mission.lose(world)) finish(false)
      if (mission.win(world))  finish(true)
```

四条硬约定：

1. **`spawn()` 只调一次。** 它的职责是摆放初始兵力（含改写玩家 `pos` / `fwd` / `speed` / `throttle`），不是"初始化状态"——需要每帧维护的东西一律放 `tick()`。
2. **`tick()` 不返回值。** 它只写 `w`：更新 `objectiveSub`、置 `flags`、播台词、动态 `spawnEnemy`。
3. **`win()` / `lose()` 每帧都调，且 `lose` 先判。** 两边同时满足时以失败收场。必须返回布尔值——`preflight()` 会检查它们是函数，但不会检查返回值。
4. **结算后主循环不再调用 `tick/win/lose`**（`state` 变成 `debrief`），所以看门狗、状态推进都停了，不用怕"结算时的静止"被误判。

`flags` 的用法是"一次性触发"模式，全项目统一：

```js
if (!w.flags.tallyDone && w.time > 6) {
  w.flags.tallyDone = true;
  w.radio.play('m1', 'tally');
}
```

`flags` 不分区、不清理，**加新键时必须用独一无二的名字**（`game.js` 自己也在用 `flags.allyDown`）。

任务里已经用掉的 `flags` 键：m1 `killed / tallyDone / k1 / k2 / k3 / lowQ`；m2 `ambushDone / baseHit / baseLow / baseLost / relayDown / spotted`；m3 `dropped / aceDone / aceSpawned / aceP2 / aceKilled`。

---

## 7. 一次任务的完整触发链（以 m2 为例）

```
spawn()
 ├ 玩家 (0,1400,-4000) + 2 架僚机
 ├ 3 座浮空中继平台（model relay, hp260, y4000, drift9）
 ├ 2 座地面测控平台（model radar, ground）
 ├ 4 座防空浮台（model sam, weapon dl9, fireCd rnd(3,8)）
 ├ 前进基地（team 0, hp900）→ w.baseTarget
 └ 2 架 ROK-40 轰炸机，各带 route（ingress→投弹→egress）

每帧 tick()
 ├ 统计存活 relay / radar / sam，拼 objectiveSub
 ├ 基地血量：baseHit 台词 → <55% 且 baseWarnT≤0 时 baseLow + 14 s 节流 → 被毁 baseLost
 ├ w.detected = player.pos.y > 1500 && player.alive；首次 true 播 spotted
 └ 地面测控平台全灭 → 播 radarDown，从南边生成 4 架截击机（2×GAL-31 高空 + 2×ROK-27），播 ambush

防空浮台开火（game.js updateTargets）
 └ 前置：w.detected（或贴脸 5.2 km 目视）→ 发射 dl9 追踪玩家

轰炸机（AI.updateRoute，不走空战 AI）
 └ 到 ingress 航点 → bombTheBase()：基地 −340 → 转 egress → 到出口自灭

胜负
 ├ lose: 玩家阵亡 || baseTarget 被毁
 └ win:  ambushDone && relay 全灭 && radar 全灭 && team 1 全灭
```

---

## 8. 易踩的坑与设计取舍

1. **`altStart` / `speedStart` 会被 `spawn()` 覆盖。** 三关的 `spawn()` 都重写了 `p.pos` / `p.speed`（m1 甚至把 speed 从 320 改成 330）。改初始状态时**以 `spawn()` 为准**，`altStart` 只是 `makeAircraft` 的入参。

2. **`makeTarget` 的 `team` 默认是 1（敌方）。** 友方设施必须显式写 `team: 0`，否则 `cycleTarget()` 会把自家基地纳入锁定循环——而且因为它距离最近、`value` 最小，按下 F 先锁上的就是自己人。m2 的前进基地就是这么踩过坑才补上 `team: 0` 的。

3. **中立调节单元用 `team: 2`，不是 `team: 1`。** `cycleTarget` 只收集 `team === 1` 的目标物，所以玩家锁不到单元；但 `scanShot` 只跳过同阵营，所以双方子弹都能打坏它。误伤扣分在 `game.js` `hitTarget` 里按 `model === 'cell' && source.isPlayer` 累加 `friendlyLoss`——注意它不看 `team`。

4. **交战规则只拦三类 `kind`。** `launch()` 里硬编码的是 `wp.kind === 'asm' || 'agm' || 'bomb'`，**`aam` 空空弹不在拦截列表里**。m3 的"只有机炮"实际是"重武器与对面弹被拦 + 该高度导弹本身退化"，别以为 ROE 拦住了所有导弹。

5. **`w.detected` 是任务自己写的，且有一帧延迟。** 它只由 `m2.tick` 赋值，而 `updateTargets()` 在主循环里跑在 `mission.tick()` **之前**——所以开火判定用的是上一帧的 `detected`。m1 / m3 没有地面防空，`detected` 保持 `false`。

6. **`escort` 标签的含义因关而异。** m1 的护航 `a.ai.escort = true`，被排除在目标计数与胜利条件外；m3 的两架护航没有这个标签，属于"必须全部击落"的 `team 1` 单位（`win()` 只看 `team === 1 && alive`）。

7. **飞完航线的单位会"自灭"。** `AI.updateRoute` 在最后一段飞完后直接 `a.alive = false`，而 `game.js` 的击落统计是 `team === 1 && !alive` 计数——逃生成功的轰炸机也会被算成"击落"。结算面板的 `world.killed` 因此会偏高。

8. **`sower` 与 `ace` 只换了 `phys`，没换 `ac`。** 两者都由 `spawnEnemy` 以默认机型 `m27` 创建，之后覆写 `model` 与 `phys`；`a.ac` 仍然指向 ROK-27 条目，所以 `ctrlFloor` / `ctrlFull` 来自 ROK-27。改这两架的气动时记得 `ctrlFactor` 读的是 `a.ac`。

9. **`m2` 的中继平台 `t.vital = true` 没有任何人读。** 胜利条件按 `model === 'relay'` 计数，不靠 `vital`。同理 m1 的 `a.firingAllowed`、m3 的 `w.roeActive`、`w.baseHpFull`、`timeLimit` 都是"写了没人读"的字段。

10. **生成器函数是全局的，没有命名空间。** `spawnEnemy` / `spawnWingman` / `spawnTarget` / `bombTheBase` 都挂在 `window` 上，`index.html` 的加载顺序里 `missions.js` 排在 `game.js` 之前。加新生成器时注意别与其它模块重名。

11. **`w.cells` 与 `w.targets` 是同一批对象的两个视图。** `spawnTarget` 只推 `w.targets`，m3 之后手动 `w.cells.push(c)`。遍历"所有可摧毁物"用 `targets`，遍历"调节单元阵列"用 `cells`，`win()` 用的是 `targets`。

12. **`flags.dropped` 复用了 `bossHit` 台词。** 播撒机降到 16000 m 以下时播的是"他在掉高度！动压撑不住了！"——那是给王牌准备的台词，`VOICES.m3` 里没有专门的投放警告事件。改文案时注意这一处复用。

13. **`m1.lose()` 只判玩家阵亡。** 僚机全灭不会失败（只会在 `game.js` 里触发一次 `allyDown` 台词）。

---

## 9. 加一关需要提供什么

1. 在 `js/missions.js` 末尾 `MISSIONS.push({...})`，字段照抄现有三关（见 §3 完整清单）。
2. 必须提供：`id` `no` `name` `en` `loc` `date` `altStart` `speedStart` `prose` `objectives` `threats` `intel` `map` `spawn()` `tick()` `win()` `lose()`。
3. 在 `js/data.js` 的 `VOICES` 里加**同名 `id`** 的台词表，至少要有 `start`、`win`、`lose`（`startMission` 会 `Radio.play(mission.id, 'start')`）。
4. `map` 里的坐标是**世界米，相对进入点**；`type` 只用 `drawMap` 认得的几种（`base` / `enemy` / `relay` / `sam` / `site`）。
5. **把新关的全局下标写进某个战役的 `missions` 数组。** 不写会触发
   `preflight()` 的"没有归属任何战役"——选关界面永远列不到它，
   而这是最容易漏掉、也最难在运行时看出来的一步。
6. 跑 `node tools/smoke.js`：它会自动加载全部脚本、跑三关各 240 帧，检查 NaN、卡死与异常，
   并断言战役覆盖率与"战役内关卡数"。
7. 开机自检（`game.js` `preflight()`）会检查：`spawn/tick/win/lose` 都是函数、
   `VOICES[id]` 存在、每关恰好归属一个战役。它**不检查**
   `prose` / `objectives` / `map` 是否存在——漏了会在简报页静默变空。

---

## 10. 参数速查表

| 想改什么 | 在哪 |
|---|---|
| 敌人机型 / 数量 / 位置 | 各关 `spawn()` 里的 `spawnEnemy(w, {...})` |
| 敌人技术水平 | `spawnEnemy` 的 `skill`（m1 测绘机 0.32，m3 王牌 0.96） |
| 敌机行为标签 | `spawnEnemy` 的 `behavior`（写进 `a.ai.cmd` 与 `a.behavior`） |
| 护航是否计入目标 | `spawnEnemy` 的 `escort`，以及 `tick()` / `win()` 里的 `a.ai.escort` 判断 |
| 敌机挂什么弹 / 吊舱 | `spawnEnemy` 的 `special` / `pods` |
| 那些弹画在哪几类挂点上 | `data.js` 的 `npcFits` + `entities.js` `mountPlan()` |
| 僚机队形与数量 | `spawnWingman(w, idx, slotX, slotY, slotZ)` |
| 目标物血量 / 半径 / 漂移 | `spawnTarget` 的 `hp` / `radius` / `drift` |
| 防空阵地武器与节奏 | `spawnTarget` 的 `weapon` / `fireCd`，开火逻辑在 `game.js` `updateTargets()` |
| 必须保护的东西 | `w.baseTarget`（m2）与 `lose()` |
| 雷达探测高度下限 | m2 `tick()` 里的 `player.pos.y > 1500` 与 `w.dangerAltitude` |
| 伏击触发条件 | m2 `tick()` 里 `sites === 0 && !w.flags.ambushDone` |
| 王牌出场条件 | m3 `tick()` 里 `sowers <= 3` |
| 王牌死战阈值 | m3 `tick()` 里 `w.ace.hp < w.ace.maxHp * 0.5` |
| 播撒机投放警告高度 | m3 `tick()` 里的 `s.pos.y < 16000` |
| 播撒机逃跑判定高度 | m3 `lose()` 里的 `s.pos.y < 14000` |
| 交战规则生效范围 | m3 `tick()` 里"距任一存活单元 5000 m" |
| 误伤扣分金额 | `game.js` `finish()`：`friendlyLoss * 2500` |
| 简报地图比例 / 位置 | `game.js` `drawMap()` 的 `R = 17000` 与 `cy = H*0.72` |
| 下游呼号池 | `data.js` `CS_DOWNSTREAM` + `downstreamCallsign()` |
| 每句台词的停顿 | `VOICES` 里每条 `{ ... gap }` |
| 战役分组 / 展示文案 | `missions.js` 顶部的 `CAMPAIGNS` |
| 战役内关卡序号（简报页 01/02/03） | `game.js` `buildMissionList()`，按战役内位置重编，**不看 `m.no`** |

---

## 11. 与其它模块的依赖

| 依赖 | 用途 |
|---|---|
| `Ent` | `makeAircraft` / `makeTarget` / `spawnParticle` / `damage` / `killGround` |
| `AI` | `AI.attach` 挂控制状态；`a.route` 让单位走航线而非空战 |
| `M3` | 向量运算（`V` / `rnd` / `dist` / `clone`） |
| `CALLSIGN` | 玩家与僚机的固定呼号 |
| `VOICES` / `Radio` | 台词表与播放（`w.radio.play` / `w.radio.raw`） |
| `world`（`game.js`） | 任务脚本唯一的写入目标；字段契约见 §3 |
| `game.js` | 决定 `spawn/tick/win/lose` 的调用时机、简报渲染、结算计分 |
