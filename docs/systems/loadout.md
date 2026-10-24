# 挂载系统

数据 `js/data/`（机型的 `hardpointGroups`、武器的 `attr`、`rules.js`） · 逻辑 `Loadout`（`js/engine/loadout.js`）+ `Ent`（`js/engine/entities/mounts.js`）+ `Game` · 显示 `js/ui/screens/hangar.js` / `hardpoints.js`、`js/render/planform/`、`HUD`

---

## 一句话

每架飞机有若干**成对的挂载点组**，每组独立选择装什么；
同一种武器占多个组时，**弹药池累加、发射槽数累加**。
每个挂载点是一个独立的发射槽，一次按键从**一个**就绪槽里打出
`wp.salvo` 发弹，各槽的冷却**各自计算**。

---

## 为什么这么设计

"固定机炮 + 一个特殊武器槽"的问题是：玩家在机库里做的唯一决定
是"从三选一里挑一个"，机体本身几乎没有选择空间。

改成挂载点制之后：

- 同一架飞机能带出完全不同的任务配置（纯制空 / 混合 / 对地）
- 挂载点的适配限制（翼尖挂不了反舰弹）逼玩家做取舍
- 空挂架能换回一点机动性，于是"带多少"本身也是一个决定
- 基础短程弹也是可选项 —— 不带就没有，只能靠机炮

这是《僚机计划》那一脉的思路，比"选一个特殊武器"厚得多。

---

## 数据结构

### 挂载点组（在 `AIRCRAFT` 里）

```js
hardpointGroups: [
  { id: 'A', label: '翼尖', kind: 'tip',
    pts: [{ x: 7.5, y: -2.8 }, { x: -7.5, y: -2.8 }] },
  ...
]
```

- `pts` 是**机体系俯视坐标**（机头 +y，右翼 +x，单位米）
- **`pts` 同时就是俯视识别图的标注锚点** —— 单一数据源，不要再另建一份
- 每组点数**必须是偶数**（成对挂载）；`tools/test/smoke.js` 检查 `pts.length % 2`
- 组上可以带一个 `hy`：**吊挂高度**（机体系 y，米）。不写就用
  `Ent.STORE_HY`（`js/engine/entities/mounts.js`）按 `kind` 给的默认值。默认值是按战斗机定的，
  大型机体要自己给 —— 否则挂载物会埋进机身（`smoke.js` 有几何断言盯着，
  见 [data.md](data.md#hardpointgroups--defaultloadout)）

所有战斗机（上游可玩 6 型 + 下游 / 中立 NPC 战斗机 4 型；`npcOnly` 的机型也有组，但只用于资料库展示）。
**2.4 起每架各多一对挂点**（为以后扮演下游的战役做平衡准备），新组带 `playerOnly: true`：
`Ent.mountPlan` 对 NPC 一律跳过它（槽数、弹药池、重量与加这一对之前一致，关卡难度不变），
`Loadout`（机库 / 玩家）照常当普通组，`defaultLoadout` 不填新组（默认空着）。

| 机型 | 组数 | 点数 | 组号与类型（★ = 2.4 新增，`playerOnly`） |
|---|---|---|---|
| DB-11 军舰鸟 | 4 | 8 | A light · B heavy · C belly · ★D light（机身后侧） |
| D-14 旗鱼 | 4 | 8 | A heavy · B light · C belly · ★D tip（翼尖） |
| G-6 鲣鸟 | 4 | 8 | A heavy · B light · C light · ★D belly（机腹） |
| F-9 海燕 | 3 | 6 | A heavy · B light · ★C heavy（翼下内侧） |
| D-21 贼鸥 | 3 | 6 | A belly · B light · ★C light（翼下外挂，外露、匿踪会掉） |
| D-33 信天翁 | 4 | 8 | A heavy · B light · C tip · ★D light（内侧） |
| ROK-27 schist | 3 | 6 | A heavy · B light · ★C light（翼下中段） |
| GAL-31 basalt | 3 | 6 | A heavy · B light · ★C light（翼下中段） |
| VAC-14 sandstone | 3 | 6 | A heavy · B light · ★C light（翼尖外侧） |
| XAMSI Mk.2 tideline | 2 | 4 | A light · ★B light（外侧） |

smoke 里有这十型的清单常量（组数、恰一组 `playerOnly`、NPC 跳过、玩家默认空）。

**ROK-40 巨砾**（重型轰炸机，2.5 重做，`npcOnly`）：4 组 8 点 —— `A1` / `A2` 弹舱前后两对（`belly`，`expose: 0`）、`B1` 翼下内侧 / `B2` 翼下外侧（`heavy`，发动机的内外各一对）。2.5 之前是 `A` 弹舱 / `B` 翼下各一对；m5 / m8 的 `loadout: { B1: 'vsr' }` 同步改了（BOX-14 `perPoint` 为 0、`ammo` 1，弹药池与重量与之前一致）。

`maxLoad`（最大挂载重量 kg）：军舰鸟 6500、旗鱼 4800、鲣鸟 7200、
海燕 5200、贼鸥 4200、信天翁 5000、折翼 4200。

### 挂载点类型

| kind | 位置 | 能挂什么 |
|---|---|---|
| `tip` | 翼尖 | 只受得起轻型空空弹与小型吊舱 |
| `light` | 通用挂架 | 中型弹、吊舱 |
| `heavy` | 重挂点 | 大型弹只有这里挂得下 |
| `belly` | 机腹 | 吊舱与对地弹 |

显示时用 `hpKindLabel()` 翻成中文：翼尖 / 通用 / 重挂 / 机腹。

### 武器挂载属性 `attr`

写在每件武器自己的文件里（`js/data/weapons/<id>.js`），封存时平铺到武器上，所以运行时读的是 `WEAPONS[k].fits` / `.perPoint` / `.mass`：

```js
Registry.weapon({ id: 'srm', …, attr: { fits: ['tip', 'light', 'heavy'], perPoint: 10, mass: 95 }, … })
```

| 字段 | 含义 |
|---|---|
| `fits` | 能挂的挂点类型 |
| `perPoint` | **单个挂载点**提供几发 |
| `mass` | **单件**重量（kg） |

全表（键 = 武器 id；原来是 `STORE_ATTR` 一张表，方便一眼横着比较，现在看这里）：

| 武器 | fits | perPoint | mass |
|---|---|---|---|
| `srm` TOR-2 | tip, light, heavy | 10 | 95 |
| `trm` TOR-4 | tip, light, heavy | 8 | 105 |
| `hos` TOR-6 | tip, light, heavy | 6 | 100 |
| `kkv` TOR-8 | tip, light, heavy | 12 | 90 |
| `hwm` CLA-8 | light, heavy | 3 | 240 |
| `mrm` CLA-4 | light, heavy, belly | 6 | 195 |
| `arm` SPO-8 | heavy | 3 | 310 |
| `vlar` CLA-12 | heavy | 2 | 720 |
| `qsr` GIR-5 | tip, light, heavy | 16 | 92 |
| `wasp` SUT-7 | tip, light, heavy | 4 | 145 |
| `asl` GUT-9 | light, heavy | 6 | 240 |
| `asl2` GUT-12 | heavy, belly | 3 | 520 |
| `sat` SPO-6 | heavy | 3 | 410 |
| `rkt` PEJ-6 | light, heavy | 36 | 280 |
| `clb` PEJ-9 | heavy, belly | 3 | 350 |
| `ecm2` ZUN-8 | tip, light, belly | 1 | 240 |
| `dec` ZUN-12 | light, belly | 1 | 210 |
| `oep` GUS-6 | light, belly | 1 | 175 |
| `irp` GUS-9 | tip, light, belly | 1 | 160 |
| `hdp` JDA-3 | light, belly | 1 | 320 |
| `swm` GIR-12 | tip, light, heavy | 20 | 62 |
| `hva` SPO-9 | heavy | 2 | 560 |
| `lcm` GUT-30 | heavy, belly | 2 | 780 |
| `v11` SUT-11 | light, heavy | 3 | 135 |
| `v9` GIR-9 | tip, light, heavy | 4 | 110 |
| `v17` CLA-17 | heavy | 2 | 285 |
| `v22` SPO-22 | heavy | 2 | 640 |
| `v25` GUT-25 | heavy, belly | 3 | 330 |
| `v30` PEJ-30 | heavy, belly | 2 | 295 |
| `pgb` PEJ-14 | heavy, belly | 6 | 280 |
| `hbl` PEJ-4 | light, heavy, belly | 12 | 120 |
| `hbh` PEJ-22 | heavy | 3 | 900 |
| `e4` ZUN-4 | light, belly | 1 | 215 |
| `l2` GUS-2 | light, belly | 1 | 190 |

下游专用弹（`dl4` / `dl6` / `dl9` / `vgt` / `vsr` / `vbn` / `otr` / `vzu` / `vsc`）、僚机专用的 `drm`、
舰载的 `ss6` / `ssm` 的 `fits` 是**空数组**（直接写在武器文件顶层，不用 `attr`），表示玩家挂不上它们。

但"玩家挂不上"不等于"挂不上"。空数组在 `w.fits && …` 里是 truthy，
所以渲染实体挂载时如果拿 `fits` 当判据，这批弹会被全部过滤掉 ——
敌机机翼永远是干净的。NPC 走的就是另一张表：

| 武器 | `npcFits`（写在武器文件顶层，不在 `attr`） |
|---|---|
| `dl4` DAR-4 | light, heavy |
| `dl6` BIN-6 | tip, light, heavy |
| `vbn` BIN-9 | tip, light, heavy |
| `otr` TOR-1 | tip, light, heavy |
| `drm` TOR-3 | light, heavy |
| `vsc` SAV-14 | light, belly |
| `vgt` TUM-7 | heavy, belly |
| `vsr` BOX-14 | heavy |
| `vzu` SAV-6 | light, belly |
| `dl9` BAD-9 | 不写 —— 地面发射，不上机 |

适配表**不能不要**：`datum` / `pelican` / `quartz` / `lodestone` 这些
`npcOnly` 机型只有机腹挂点，而 `spawnEnemy` 的默认弹是空空弹，
不查就会把格斗弹画到预警机的机腹上。两张表的取舍见
[§ NPC 的挂载](#npc-的挂载)。

**为什么 `fits` / `perPoint` / `mass` 要成组放进 `attr`，而不是散在武器字段里**：
它们是同一件事的三个侧面（挂得下 / 带多少 / 多重），挂载系统一起读；
封存时由 `Registry.sealData()` 把 `attr` 里的字段平铺到武器上并删掉 `attr`，
所以运行时 `WEAPONS[k].fits` 是存在的。（原来是 `js/data/` 里的一串补丁表加 IIFE 合并，
拼错键名会被静默丢弃；现在各字段就在武器文件里。）

---

## 两层筛选（缺一不可）

| 层 | 字段 | 判据 | 回答的问题 |
|---|---|---|---|
| 挂点类型 | `WEAPONS[].fits` | 是否包含该组的 `kind` | **物理上挂不挂得住** |
| 机体能力 | `WEAPONS[].needs`（武器文件里的 `needs`）∩ `AIRCRAFT[].caps` | 机型是否具备所需能力 | **这架飞机撑不撑得住** |

只有 `fits` 的时候，"位置一样就能挂" —— 于是制空战斗机也能挂上
重型巡航导弹，机体差异等于白设计。所以补了第二层。

判定函数（`js/data/rules.js`）：

```js
function canCarry(ac, w) {
  if (!w || !w.needs || !w.needs.length) return true;
  var caps = (ac && ac.caps) || [];
  for (var i = 0; i < w.needs.length; i++)
    if (caps.indexOf(w.needs[i]) < 0) return false;
  return true;
}
```

`canCarry` **只看能力门槛**；`fits` 由调用方另行判断。

### 能力标签

`needs` 只给**少数有门槛的**武器加要求（写在各武器文件里），大部分弹谁都能挂：

| 能力 | 含义 | 需要的武器（键） |
|---|---|---|
| `strike` | 对地 / 对海打击（完整对地火控与重型挂架） | `asl2` 加固侵彻、`v25` 防区外对地、`lcm` 远程巡航、`sat` 反浮空平台、`v22` 反大型 |
| `intercept` | 高空高速拦截（高空点火与冷却） | `hva` 极高空拦截弹、`vlar` 超远距空空弹 |
| `ew` | 电子战（供电与散热） | `e4` 主动电子战吊舱、`l2` 定向能 |

机型的 `caps`：

| 机型 | caps |
|---|---|
| DB-11 军舰鸟 | `strike` `ew` |
| D-14 旗鱼 | `intercept` |
| G-6 鲣鸟 | `strike` |
| F-9 海燕 | `intercept` |
| D-21 贼鸥 | `strike` `ew` |
| D-33 信天翁 | （无）—— 纯格斗机 |
| KA-7 折翼 | （无，且 `npcOnly`；默认挂载见下文 KA-7 一节） |

> `SPO-8` 追云**没有** `needs`。它原来被标成"反辐射弹"、要求
> `strike`（对地火控），于是只有攻击机和多用途机能挂 —— 而它其实是一枚
> **对空的重型拦截弹**，最该带它的恰恰是制空 / 截击机（D-14、F-9），
> 那些机型没有 `strike`，反而挂不上。那个门槛造成的是荒谬的分配，
> 所以整个删掉，现在只受 `fits: ['heavy']` 约束。
> `smoke.js` 专门断言"制空/截击机必须挂得上 SPO-8"。
>
> **但"反辐射"这个标签本身没有删。** 它当时的另一个问题是"没有机制支撑"
> —— 世界里既没有雷达开机状态、也没有预警机。这两样现在都有了
> （预警机 + `ewPower` + EMCON-Δ），所以 `antiRadar` 重新写回武器（现在是 `tags: ['antiRadar']`），
> 由 `Ent` 的 `isRadiating()` + `Combat` 的 `blast` 实现"对正在辐射的
> 目标伤害翻倍"。**挂载门槛不复原** —— 它是对空弹，这一点没变。

**默认配置也受这条约束**，`preflight()`（`js/boot/main.js`）会检查，`smoke.js` 也会。

---

## 配置与派生

### 机库里的配置

`Game` 的 `getLoadout(ac)`（`js/engine/game/loadout.js`）按需初始化（调 `Loadout.defaults(ac)`，存在 `$.loadouts[ac.id]`），结构就是"组号 → 武器键"：

```js
loadouts['frigatebird'] = { A: 'srm', B: 'v11', C: 'oep' }
```

默认值取自机型的 `defaultLoadout`，未指定的组是 `null`（空置）。

### `Loadout.resolve(ac, lo)`

展开 / 称重 / 被动汇总 / 落到飞机这四件事，现在都在 `js/engine/loadout.js` 的 `Loadout`
（`defaults` / `resolve` / `mass` / `passive` / `apply`），机库、开局共用同一份（原来写在 `Game` 里，叫 `resolveLoadout` / `loadoutMass`）。
`resolve` 把"组 → 武器"展开成一条一条可用武器：

```js
{ wid, w, points, ammo, salvo }
```

遍历所有组，同一种武器**合并成一条**：

```js
e.points += g.pts.length;                       // 发射槽数
e.salvo  += g.pts.length;                       // 与 points 同值
e.ammo   += g.pts.length * (w.perPoint || 1);   // 弹药池
```

> **命名坑**：`loadoutList[].salvo` 是"**发射槽数**"（= `points`），
> 而 `WEAPONS[].salvo` 是"**一次按键打出几发**"。两者同名但含义不同，
> 别搞混。`points` 与 `salvo` 在这个结构里恒等。

两条规则：

- **被动吊舱（`w.tags.passive`）被 `continue` 掉**，不进武器纵列表（它们没有扳机可扣）
- 排序：**空空弹（`kind === 'aam'`）排前面**，同组内按 `name` 字典序

### 落到玩家身上（`Loadout.apply`，`startMission()` 调用）

`js/engine/game/mission-start.js` 里先 `Loadout.resolve(ac, lo)`，造机之后 `Loadout.apply(p, ac, lo, wl)` 一次性写好：

```js
p.loadoutList = wl;                         // 上面那个数组
p.ammoPool = { srm: 8, v11: 4, ... };       // wid → 余弹
p.slotCd  = { srm: [0, 0, 0, 0], ... };     // wid → 每槽剩余冷却
p.wpIdx   = 0;
p.spAmmo  = wl[0].ammo;
p.spSalvo = wl[0].salvo;
p.loadFactor = min(1, 挂载总重 / maxLoad);
p.loadout = lo;                             // 原始配置，HUD 缩略图用
```

### `syncWeapon(a)`（`js/engine/game/world.js`）

把 `wpIdx` 指向的那一条同步到既有代码路径用的三个字段：

```js
a.special = e.wid;
a.spAmmo  = a.ammoPool[e.wid] || 0;
a.spSalvo = e.salvo;
a.spCd    = min(a.slotCd[e.wid]);      // 最快就绪的那个槽的剩余时间
```

`spCd` **不是**一个全局冷却：它是"最快就绪槽"的剩余时间，只是给
HUD 与 AI 一个"现在能不能打"的判据。切换武器**不重置** `spCd`，
`syncWeapon` 会从 `slotCd` 里重新取。

`cycleSpecial()`（`js/ui/input.js`，游戏里按 `R`）只做 `wpIdx = (wpIdx + 1) % len`，
只有一种武器时不切换（播一声 `loseLock` 提示音后返回）。
**切枪不清零锁定进度**：`lockProgress` 由 `updateLock()` 按新武器的
参数重新判，清零会让"对同一个敌人连打几种弹"这种多挂载玩法打不出来。

---

## 发射与装填

发射入口是 `Game` 的 `launch(actor, target, w)`（`js/engine/game/launch.js`；玩家的
`fireSpecial()`，在 `js/ui/input.js`，也会走到这里）。核心流程：

```js
var slotArr = actor.slotCd ? actor.slotCd[actor.special] : null;
var slotIdx = -1;
for (var si = 0; si < slotArr.length; si++) {
  if (slotArr[si] <= 0) { slotIdx = si; break; }     // 找一个空闲槽
}
if (slotIdx < 0) return false;                       // 全在装填，按不出去

var nShot = Math.max(1, Math.min(wp.salvo || 1, actor.spAmmo));   // 一次按键几发
... 生成 nShot 枚导弹，共用这个槽 ...
slotArr[slotIdx] = wp.cd;                            // 只有这个槽开始计时
actor.spAmmo -= nShot;
actor.spCd = Math.min.apply(null, slotArr);
```

**一个挂载点 = 一个发射槽。** 一次按键从**一个**就绪槽打出
`WEAPONS.salvo` 发（GIR-5 三联装 3 发、蜂群 2 发、鸦群 4 发、撒星 7 发），
**共用同一个冷却槽**。所以每槽的冷却各自计算：连打两发之后，
第一个槽先装填好，第二个稍后。

这几发的出膛指向与出膛点各自偏开一点（`salvoShots()`）——
同一点、同一指向出去的弹会完全重叠成一发，看不出是按了一下还是
一下打了多发。细节见 [weapons.md](weapons.md#发射launchactor-target-w)。

两个数不要混：

| 名字 | 在哪 | 含义 |
|---|---|---|
| `WEAPONS[].salvo` | 武器文件 | **一次按键打出几发** |
| `loadoutList[].salvo` / `points` | `Loadout.resolve` | **有几个发射槽**（= 能在装填前连按几次） |

所以 HUD / 机库上显示的那个"齐射 N"其实是**槽数**；
真正的"一次几发"写在武器数据里，卡片底部不直接显示。

**为什么这样更好**：它让"挂多个挂载点"的收益变成
「更大的瞬时爆发 + 更快的持续输出」，而不是"一次多打几枚"。
前者更接近真实挂载的战术价值，也让发射节奏成为玩家能经营的东西。

### 装填：`stepAircraft()` 里的槽冷却

```js
for (var ck in a.slotCd) {
  var slots = a.slotCd[ck];
  var pool  = a.ammoPool ? a.ammoPool[ck] : undefined;
  var ready = 0;
  for (si = 0; si < slots.length; si++) if (slots[si] === 0) ready++;

  for (si = 0; si < slots.length; si++) {
    if (slots[si] <= 0) continue;
    if (slots[si] >= SLOT_EMPTY) continue;      // 空挂架，永不装填
    if (pool !== undefined && ready >= pool) continue;   // 没弹能装进这个槽
    slots[si] = Math.max(0, slots[si] - dt);
    if (slots[si] === 0) ready++;               // 装完占用一枚储备
  }
}
```

**空挂架的表示**：`SLOT_EMPTY = 1e9`。储备弹数少于挂架数时，
多出来的挂点从出厂就是空的：

```js
for (sj = 0; sj < wl[wi].salvo; sj++)
  sArr.push(sj < ammoW ? 0 : Ent.SLOT_EMPTY);
```

用一个永远减不到 0 的值，语义是"这个挂架本来就空着" ——
比让 HUD 一直显示"装填中"更诚实。

**每件玩家可发射武器都必须写 `cd`**（武器文件里的字段；`smoke.js` 会检查
`fits` 非空的非被动武器 `cd ≥ 1`）。`cd` 就是每个槽的装填时间；漏写或按旧语义写成 0.1 级的数，
会快得离谱（CLA-17 当年在独立的 `STORE_COOLDOWN` 表里漏过一次，保留了字面量里的旧值）。

---

## NPC 的挂载

同一套"槽 = 挂点数 + 弹药池"的机制也用在 NPC 身上，但**入口不同**：

| 谁 | 弹种从哪来 | 适配表 |
|---|---|---|
| 玩家 | 机库配置 `a.loadout`（组 id → 弹种） | `fits` |
| NPC | 任务脚本写定的 `a.loadout`（逐组）、或 `a.special`（一件制式弹）+ `a.pods`（吊舱） | `npcFits`，没写就退回 `fits` |

走哪条路看 `a.isPlayer`。NPC 的 `Ent.mountPlan(a)` 按三条规矩铺：

1. **逐组 `loadout` 先落位**（上游 NPC 的写法，`js/missions/` 的 `o.loadout`）
   —— 作者说了算，但**必须真的挂得上**：组的 kind 要在适配表里，
   机体能力（`canCarry`）也要够。不满足就记一条 `Ent.mountIssues`
   并把那一组空着（任务文档里有专门一节讲这条规矩）
2. **任务写定的吊舱占剩下的组** —— 数量少，而且"编队里那一架带干扰吊舱"
   是设定里写明的事（`js/missions/` 的 `o.pods`）
3. **制式弹 `a.special` 铺满再剩下的** —— 只在**完全没有**逐组配置时生效

第 2 条的顺序不是随便定的：吊舱占位是**从最后一组往前**。挂点组在
`js/data/aircraft/` 里按"内侧 → 外侧"排，倒着走等于让吊舱优先落在外侧/机腹，
把靠里的重挂点留给制式弹。按正序（从第一组往后）会踩到：`spray`
（通用 + 机腹）挂一枚空空弹加一个吊舱时，吊舱先吃掉通用挂点，
而那枚弹挂不上机腹 —— **机翼上一枚弹都画不出来**，可 AI 照样在发射
（`smoke.js` 有断言盯着）。

所以"一种导弹 + 一些吊舱"、以及"两种导弹各占一组"都是支持的。
吊舱吃掉挂点后，导弹的**可视挂架会变少，弹药池也跟着变少**：
上游弹的储备按 `min(w.ammo, 挂点数 × perPoint)` 封顶 —— 机翼上挂不下的弹打不出来。

`Ent` 内部的 `buildNpcMounts(a)`（`js/engine/entities/mounts.js`，不导出；`makeAircraft()` 末尾对非玩家调用）据此建两样东西：

- `a.ammoPool[wid] = min(w.ammo, 挂点数 × perPoint)` —— `w.ammo` 是"打一仗的预算"，
  但不能超过机翼上实际挂得下的量（以前直接取 `w.ammo`，KA-7 两个轻挂点能打出 44 发 GIR-9）。
  下游弹的 `perPoint` 是 0（没有挂载表），**仍只按 `w.ammo`** —— 按玩家口径会建出 0 发弹
- `a.slotCd[wid] = [...]` —— 长度 = 该武器占用的挂点数，超出储备的槽标
  `SLOT_EMPTY`（与玩家同一条规矩）

没有这两样，实体挂载就只是装饰：`pushStores()` 判断"这枚还在不在"
靠的正是它们（打光即不画 / 装填中则挂架空），而它们以前只有玩家有 ——
于是僚机的弹永远挂在翼下，打光也不消失。

**多件挂载时，AI 每次开火前挑一件**（`Ent.chooseWeapon`）：按目标类别
（对空 / 对面）与射程，够得着的里面取射程最短的那件；挑中谁就
`Ent.setWeapon(a, wid)` 把它设成"当前触发的那件"。玩家按 R 换弹
（`Game` 的 `syncWeapon`）也走同一个 `setWeapon` —— 两边不会再各写一份。
判据与任务侧的写法见 [missions.md](missions.md#给-npc-设计挂载)、
[ai.md](ai.md)。

发射侧的弹药池回写也在 `launch()` 里对两边统一做了
（`actor.ammoPool[actor.special] = actor.spAmmo`）。**AI 的发射节奏不变**：
它自己的 `s.shootT = rnd(2.6, 5.2) × (1.6 − 0.6·skill)`（2.6–8.3 秒）通常比槽冷却长，
所以槽数变多不会把敌机变成连发火箭炮。

**吊舱与定向能不占发射槽，也一直挂在挂架上**（`kind === 'ecm' || 'dew'`）。
这条以前只对 `passive` 吊舱成立，于是 ZUN-4 开一次机就会在翼下消失一个
冷却周期，看起来像被扔掉了。

肉眼验证走 `node tools/render/render-mounts.js`（把十二个代表性配置落成 PNG，
走的是真正的 `makeAircraft` + `pushStores` + `render.js`），见
[tools.md](tools.md#toolsrender-mountsjs)。

---

## 被动吊舱

带 `passive` 标签（`tags: ['passive']`）的吊舱共 6 件（其中 5 件写了 `attr`、玩家可挂；
`vzu` 是下游专用、`fits: []`）。它们**不占扳机**——
装上就一直在起作用，也不会出现在 HUD 的武器纵列表里。

| 键 | 名 | 字段 | 值 | 效果 |
|---|---|---|---|---|
| `ecm2` | ZUN-8 静默 | `lockResist` | 0.30 | 敌方对你的锁定距离 ×(1−0.30) |
| `vzu` | SAV-6 迷雾 | `lockResist` | 0.22 | 同上（下游，玩家挂不上） |
| `hdp` | JDA-3 护盾 | `armorBonus` | 0.22 | 全向减伤，可叠加 |
| `oep` | GUS-6 明瞳 | `lockRangeBonus` / `silentLock`（标签） | 0.45 | 锁定距离 ×(1+0.45)；**被动测距，不触发对方 RWR** |
| `irp` | GUS-9 夜枭 | `lockRangeBonus` / `lockResist` / `silentLock`（标签） | 0.25 / 0.15 | 同时给三项 |
| `dec` | ZUN-12 雾障 | `flareBonus` | 40 | 额外干扰弹组数（×挂载点数） |

`silentLock` 是唯一的标签项（其余是数值字段；汇总结果是布尔）：装了就为真，决定**你用主动雷达锁别人时对方收不收得到告警**
（见 [ai.md](ai.md) 的 RWR 扫描）。它是"你不开雷达，我也不开"那句设定的落点。

汇总由 `Ent.passiveEffects(list)`（`js/engine/entities/ecm.js`）完成 —— `Loadout.passive(ac, lo)` 只负责把
挂载点分组翻译成 `[{wid, n}]` 再转给它，因为**敌机也要用同一份实现**
（`js/missions/` 的 `spawnEnemy` 收 `o.pods`）：

```js
var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0, silentLock: false };
...
if (w.lockResist)     e.lockResist = Math.max(e.lockResist, w.lockResist);  // 取最大，不叠加
if (w.armorBonus)     e.armor     += w.armorBonus * n;                      // 叠加 × 点数
if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;                  // 叠加 × 点数
if (w.flareBonus)     e.flareBonus += w.flareBonus * n;
if (w.silentLock)     e.silentLock = true;                                  // 任一即可
e.armor     = Math.min(e.armor, 0.55);
e.lockRange = Math.min(e.lockRange, 1.9);
```

两条容易忽略的规则：

- 吊舱内部的 `lockResist` **取最大值而不是相加** —— 两件抗锁定吊舱不会叠成因找不到
- `armor` / `lockRange` / `flareBonus` **乘该组的点数**（左右各一 = ×2）

在 `Loadout.apply()` 里落到玩家实体上（最后两行 `ewAuto` / `emcon` 由 `js/engine/game/mission-start.js` 在 `apply` 之后另写）：

```js
p.armor      = pe.armor;         // 全向减伤
Ent.setStealth(p, pe, wids);     // 匿踪 + 吊舱 lockResist 合并 → p.lockResist，缩短敌方对我的锁定距离
p.lockRangeK = pe.lockRange;     // 放大我的锁定距离（updateLock 里乘）
p.flares    += pe.flareBonus;    // 基础 80 组 + 加成
p.silentLock = pe.silentLock;    // 被动测距：不触发敌方 RWR
p.ewAuto     = true;             // 协处理器可否自主开机（EMCON 期间强制关）
p.emcon      = false;            // EMCON-Δ 电磁静默（N 键切换）
```

`Ent.damage()` 里对 `armor` 再钳一次上限 **0.6**，所以被动汇总的
0.55 永远先到。`lockRangeK` 在 `updateLock()` 里乘到 `lockDist` 上。

**为什么要有被动挂载**：它们让"少带一枚弹"变成真实的取舍，
而不是纯损失。带满弹的飞机更重更笨，而一件吊舱换来的可能是
整场交战的锁定优势，或者一次活下来的机会。

**两条路径不要混**：`Loadout.resolve()` 会 `continue` 掉 `passive` 武器
（它们没有扳机可扣），被动效果必须走 `Loadout.passive()` → `Ent.passiveEffects()` 单独汇总。
又：`vzu` 的 `lockResist` 当初被多包了一层 `passiveEffect: {...}`，
而汇总读的是顶层字段，于是那条加成**完全没有生效**；现在六件
被动吊舱都写顶层。

**敌机也走同一条路。** 任务脚本可以用 `spawnEnemy(w, {ac, pods: ['vzu']})`
给 NPC 挂被动吊舱，`js/missions/` 把 `pods` 翻成 `[{wid,n:1}]` 交给
`Ent.passiveEffects()`，再把结果写到 `a.armor / a.flares /
a.silentLock` 上，`a.lockResist` 走 `Ent.setStealth`（与机体匿踪合并）。在这条路接通之前，**敌机不存在任何抗锁定能力** ——
他们挂什么吊舱都只是数据表里的一行字（m3 的下游护航机现在挂了迷雾）。

---

## 重量惩罚

### 总重与 `loadFactor`

```js
// Loadout.mass(ac, lo)
m += g.pts.length * (w.perPoint || 1) * (w.mass || 100);   // 逐组累加
// 出击时
loadK = min(1, m / (ac.maxLoad || 5000));                  // loadFactor
```

注意**重量乘了 `perPoint`**：一个挂点带 28 发火箭弹就是 28 件的重量，
不是一件。`mass` 是"单件"。

### 系数：`loadoutPenalty(lf)`

```js
lp = loadoutPenalty(loadK)
vMax   × (1 − 0.08·lf)
vMil   × (1 − 0.06·lf)
vStall × (1 + 0.05·lf)      // 挂载让它更高
accel  × (1 − 0.26·lf)      // ← 最重的一项
decel  × (1 + 0.10·lf)      // 阻力变大，收油门时掉速更快
pitch  × (1 − 0.18·lf)
roll   × (1 − 0.12·lf)
```

在 `stepAircraft()` **开头**对机型物理数据做临时缩放（**整体替换 `p`**，
所以每个字段都得列上，漏一个就会取到 `undefined`；`accel` / `decel`
就曾经这样漏过。`yaw` 不受挂载影响，但也得原样带上）。

**位置也踩过坑**：这一段以前在姿态旋转之后，于是 `pitch` / `roll`
两项惩罚**从未生效**，失速判定也用的是未打折的 `vStall` ——
面板上写着"俯仰 −18%"，手感上却只有速度那几项。现在放在函数最前面，
失速判定、姿态旋转、目标速度读的都是打过折的 `p`。

**玩家和 NPC 都吃挂载重量惩罚。** 玩家的 `loadFactor` 由 `Loadout.apply` 按机库配置设定；
NPC 的由 `buildNpcMounts` 按实体挂载算（`Ent`），口径相同：`loadFactor = min(1, 挂载总重 / maxLoad)`。
两边随弹药消耗都会减轻：`curLoadFactor` 按弹药池的剩余比例折算（吊舱不随打空而变轻）。
NPC 的满挂重量取 `挂点数 × perPoint × mass`；没有重量表的下游弹按占位值 `perPoint 1 × mass 100` 算。

这是"空置挂架换机动性"的实现方式，也是半拟真感的来源之一 ——
满载出击真的会飞得笨。

### 系数只有一份

`loadoutPenalty()` 放在 `js/data/rules.js`，**机库面板和物理共用它**。

原因是一次真实的漂移：面板曾经自己写了一个 `loadK × 18`，
只取了俯仰那一项，把最狠的加速 −26% 和失速速度升高全漏掉了，
玩家看到的损失比真实手感小得多。两处各写一套数字迟早会对不上，
而且对不上的时候很难发现。

显示端的两个阈值也要和物理对上：

- 面板逐项显示的开关是 `loadK > 0.015`（不是 1%）
- 单个百分比小于 1% 时，`pctTxt()` 显示 `<1` 而不是 `0`

---

## 界面怎么表达

### 机库的六维条（`buildHangar(view)`，`js/ui/screens/hangar.js`）

显示的**不是机型固有值，而是挂载之后**的实际值：

```
机动性   ████████████░░░░  68  −16
         └─实际值──┘└损失┘
```

- 实心条 = 挂载后的实际值
- 紧跟其后的暗红段（宽度来自 `lostK`）= 被挂载吃掉的部分
- 右侧 `−N` 是净损失（`lostK > 0.004` 才画）

**只有受挂载影响的维度会缩水**：

| 维度 | 受挂载影响 | 算法 |
|---|---|---|
| 最大速度 | ✅ | `× lp.vMax` |
| 机动性 | ✅ | `× (lp.pitch + lp.roll + lp.accel) / 3` |
| 匿踪 | ✅（外挂） | 每个外露挂点 −5%（相对机体值）；`expose` 为 0 的挂点组（内埋弹舱）不折损；条上还会显示吊舱抗锁定折算的加成 |
| 火力 / 生存性 / 航程 | ❌ | 机型固有值 |

### 出击配置明细

下方「出击配置」逐项列出机炮、每种挂载的余弹与齐射数（= 槽数），
以及一行**逐项损失**（加速 / 俯仰 / 滚转 / 最大速度 / 失速）——
合成成一个"机动性"数字会掩盖"加速掉了 26%"这种关键信息，
而那恰恰是手感上最先感觉到的。

### 选装面板：两栏，不是下拉框

| 栏 | 内容 | 函数 |
|---|---|---|
| **左** | 挂载点组列表：组号、位置、点数与类型、当前挂了什么。点击切换右栏 | `buildHpGroups()` |
| **右** | 当前组能挂的东西，**每个一张卡片**：型号 + 中文名 + 携弹量、**定位**（`role`）、**简介**（`desc`）、关键参数（射程 / 导引 / 重量 / 冷却） | `buildHpPicker()` / `makeStoreCard()` / `storeStatLine()` |

以上函数都在 `js/ui/screens/hardpoints.js`，由 `buildHardpointEditor(ac, lo, view)` 串起来。
`view` 是编辑器的视图对象（机库用的是 `Game.$.hangarView`）：`ac`（机型下标）、`group`（选中的挂载点组）、
`ids`（元素 id 表，键缺省时用键名本身）、`rebuild`（改动之后怎么重画）。**编辑器不再读写全局的 `selectedAC` / `activeHpGroup`**，
批次 4 的整备界面传一套自己的 id 就能复用同一份。

右栏的筛选就是前面那两层：

```js
if (w.kind === 'gun') continue;
if (!w.fits || w.fits.indexOf(g.kind) < 0) continue;   // 挂点类型
if (!canCarry(ac, w)) { blocked++; continue; }         // 机体能力
```

被能力门槛挡掉的项数会附在栏头上：
`· N 项因机体能力不足不可挂` —— 免得玩家以为是 bug。

「空置」排在最前面，因为它是一个正经选项而不是"什么都不选"。

**为什么不用下拉框**：早期版本是 `<select>`，里面只有型号
（`TOR-2 ×16`）。玩家根本不知道 TOR-2 是什么——打什么的、能打多远、
为什么该选它而不是旁边那个，全都得靠背。卡片把**定位**和**简介**
直接摆出来，和机库里选机体时的信息密度对齐。

卡片底部 `storeStatLine(w, n)` 拼的参数行：

- 被动吊舱 → `被动 · 不占扳机`
- 否则 → `n 个发射槽`、`射程 x.x km`（`Ent.displayRange()`）、
  定向能另有 `拦截 1.2 km`、`导引 …`
- 末尾总是 `w.mass` kg，以及 `冷却 x.xs`（若有）

### 游戏内：武器纵列表

HUD 底部中央，一行一种武器：

```
      > TOR-2    16  ●○
        GIR-9     4  ●
```

- 当前项左边有 `>`，用琥珀色
- 数字是 `ammoPool` 里的余弹；归零转红
- **`●` = 该槽就绪，`○` = 装填中** —— 全部空心就是按不出去
- 当前武器在装填时整行转琥珀色，右下另显示 `RLD x.xs`
- 无挂载时显示 `无挂载 / CLEAN`

`R` 键循环切换（`cycleSpecial()`）。**只有一种武器时它静默返回**。

### 俯视缩略图（机库大图）

`PLANFORM.draw(cv, ac, lo, activeGroup)` → `paint()`（`js/render/planform/paint.js`）：

- 挂载点位置直接来自 `hardpointGroups[].pts`（同一份数据）
- 每个挂载点画一个 `drawStore()` 图形，类型不同颜色不同（`isPod()` 区分吊舱）
- **每组从挂载点引一条折线到左右两侧的标注栏**：偶数索引标右、奇数标左
  （全堆一侧会四线交叉穿过机身），线上方写 `GROUP A`，
  下方写 `型号 ×总数`（空置就写"空置"）
- 当前编辑的组用**琥珀色**，其余用淡青灰
- 可变后掠翼（DB-11）额外用**青色虚线**画出展开位的翼缘，并标注
  `可变后掠 11°–35°`（这是识别图的示意角，与 3D 模型的 20°→62° 不是同一套数）

页面下方的说明文字（`locales/zh-CN/text/` 里）：
「绿色为挂载，琥珀为当前编辑的挂载点组，青色虚线为可变后掠翼的展开位」。

### 战斗中的挂载状态图

`HUD` 的 `drawStores()`（`js/ui/hud/panels.js`）在右下角画一个 `compact` 版俯视图，
和机库大图**共用同一份 `PLANFORM.paint()`**（分成两份写迟早会长得不一样）。
它额外把每个槽的**就绪度**传进去：

```js
cd[wid] = slots.map(剩余 => 1 - clamp(剩余 / w.cd, 0, 1));
```

0 = 刚打完（空壳），1 = 装填完毕。冷却条朝"能打"的方向生长
（从下往上填满）；反过来画会读成"越打越有"，与实际相反。

---

## 加一种新武器

1. 新建 `js/data/weapons/<id>.js`，写 `Registry.weapon({ … })`，玩家能挂的写 `attr: { fits, perPoint, mass }`
2. 写 `cd`（每槽装填时间，`smoke.js` 会检查 ≥ 1）；制导弹写 `lead`，雷达弹写 `flareRD`；机体门槛写 `needs`
3. 需要的话加进某个机型的 `defaultLoadout`
4. 文本（`cn` / `desc` / `role`）写进 `locales/zh-CN/text/weapons/<id>.json`；`node tools/build/gen-pages.js` 把新文件加进页面副本
5. 跑 `node tools/test/smoke.js`

**别忘第 2 步的 `cd`。** 漏了不会崩，但 `smoke.js` 会拦；绕过它的话那个武器的槽冷却是 `undefined`。完整的字段清单见 [weapons.md](weapons.md#数据字段) 与 [data.md](data.md#一件武器的字段是怎么来的)。

只给 NPC 用的弹（下游那批）走另一条路：`fits` 写空数组（顶层，不用 `attr`）、`perPoint` / `mass` 填 0，再写一条 `npcFits`（§ NPC 的挂载）；
玩家那边根本不列它，所以不需要 `attr`。（它们的 `cd` 仍然要写，是给 NPC 的开火节奏用的。）

## 加一架新飞机

1. 新建 `js/data/aircraft/<id>.js`，定义 `hardpointGroups`（**点数必须成对**）和 `defaultLoadout`
2. 在 `js/render/planform/planes.js` 里加同名的俯视轮廓
3. `node tools/build/gen-pages.js`，再跑冒烟测试

`preflight()`（`js/boot/main.js`）会检查：组是否成对（`pts.length >= 2`）、每组是否有武器挂得上
（`fits` ∩ `canCarry`，`npcOnly` 机型跳过这条）、默认配置里引用的组与武器是否存在
且真的能挂到那一组、是否缺 `phys`、可驾驶机型是否有俯视轮廓。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 挂载点布局与类型 | `js/data/aircraft/<id>.js` 的 `hardpointGroups` |
| 单点弹数 / 重量 / 适配类型 | 武器文件的 `attr`（`js/data/weapons/<id>.js`） |
| NPC 的挂点适配 | 武器文件的 `npcFits` |
| NPC 的挂载分配（吊舱先占） | `Ent` 的 `mountPlan()` / `buildNpcMounts()`（`js/engine/entities/mounts.js`） |
| 实体挂载渲染（3D） | `pushStores()` / `pushOneStore()`（`js/ui/frame.js`） |
| 每槽冷却 | 武器文件的 `cd` |
| 能力门槛与机型能力 | 武器文件的 `needs` / `AIRCRAFT[].caps` |
| 最大挂载重量 | 机型文件的 `maxLoad` |
| 挂载惩罚系数 | `loadoutPenalty()`（`js/data/rules.js`） |
| 总重公式（是否含 perPoint） | `Loadout.mass()`（`js/engine/loadout.js`） |
| 被动效果汇总与上限 | `Ent.passiveEffects()`（`js/engine/entities/ecm.js`）；分组翻译在 `Loadout.passive()` |
| 展开 / 落到飞机 | `Loadout.resolve()` / `Loadout.apply()` |
| 空挂架标记 | `Ent` 的 `SLOT_EMPTY`（1e9） |
| 一次按键打几发 | `WEAPONS[].salvo` |
| 六维条算法 | `buildHangar()`（`js/ui/screens/hangar.js`） |
| 选装卡片 | `buildHpPicker()` / `makeStoreCard()` / `storeStatLine()`（`js/ui/screens/hardpoints.js`） |
| 俯视缩略图 | `js/render/planform/` `paint()` / `drawStore()` / `groupStore()` |
| 战斗挂载状态图 | `HUD` `drawStores()`（`js/ui/hud/panels.js`） |

## KA-7 默认挂载（本批）

- 翼下 A 组（`light`，2 点）：TOR-3「雏矢」×2（`drm`，僚机专用，只有 `npcFits`）。
- 机腹 B 组（`belly`，2 点，`expose: 0`）：CLA-4「中继」×2（`mrm`，中距雷达弹）。名义内埋，实际紧贴机腹（`hy: -0.12`）。
- 远近切换不需要下令：近处由 TOR-3 负责，远处的空中目标由 CLA-4 负责（`chooseWeapon` 取够得着的里面射程最短的）。
- `maxLoad` 4200；满挂 `loadFactor` ≈ 0.614；打光 CLA-4 后降到约 0.43。
- 挂载重量按携带量算：`mrm` 的 `ammo` 是 4，只算 4 × 195 kg，不是 2 × 6 × 195 kg。
