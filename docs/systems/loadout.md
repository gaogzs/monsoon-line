# 挂载系统

数据 `js/data.js` · 逻辑 `js/game.js` · 显示 `js/planform.js` / `js/hud.js`

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
- 每组点数**必须是偶数**（成对挂载）；`smoke.js` 检查 `pts.length % 2`

可驾驶的六架机（`npcOnly` 的机型也有组，但只用于资料库展示）：

| 机型 | 组数 | 点数 | 组号与类型 |
|---|---|---|---|
| DB-11 军舰鸟 | 4 | 8 | A tip · B heavy · C light · D light |
| D-14 旗鱼 | 3 | 6 | A heavy · B light · C belly |
| G-6 鲣鸟 | 3 | 6 | A heavy · B light · C light |
| F-9 海燕 | 2 | 4 | A heavy · B light |
| D-21 贼鸥 | 2 | 4 | A belly · B light |
| D-33 信天翁 | 3 | 6 | A heavy · B light · C tip |

`maxLoad`（最大挂载重量 kg）：军舰鸟 6500、旗鱼 4800、鲣鸟 7200、
海燕 5200、贼鸥 4200、信天翁 5000、折翼 1200。

### 挂载点类型

| kind | 位置 | 能挂什么 |
|---|---|---|
| `tip` | 翼尖 | 只受得起轻型空空弹与小型吊舱 |
| `light` | 通用挂架 | 中型弹、吊舱 |
| `heavy` | 重挂点 | 大型弹只有这里挂得下 |
| `belly` | 机腹 | 吊舱与对地弹 |

显示时用 `hpKindLabel()` 翻成中文：翼尖 / 通用 / 重挂 / 机腹。

### 武器挂载属性 `STORE_ATTR`

```js
srm: { fits: ['tip', 'light', 'heavy'], perPoint: 8, mass: 95 }
```

| 字段 | 含义 |
|---|---|
| `fits` | 能挂的挂点类型 |
| `perPoint` | **单个挂载点**提供几发 |
| `mass` | **单件**重量（kg） |

全表（键 = 武器内部代号）：

| 武器 | fits | perPoint | mass |
|---|---|---|---|
| `srm` TOR-2 | tip, light, heavy | 8 | 95 |
| `trm` TOR-4 | tip, light, heavy | 6 | 105 |
| `hos` TOR-6 | tip, light, heavy | 4 | 100 |
| `qsr` GIR-5 | tip, light, heavy | 12 | 92 |
| `wasp` SUT-7 | tip, light, heavy | 3 | 145 |
| `swm` GIR-12 | tip, light, heavy | 16 | 62 |
| `v9` GIR-9 | tip, light, heavy | 2 | 110 |
| `v11` SUT-11 | light, heavy | 2 | 135 |
| `mrm` BIN-4 | light, heavy, belly | 4 | 195 |
| `v17` CLA-17 | heavy | 1 | 285 |
| `arm` BIN-8 | heavy | 2 | 310 |
| `vlar` DAR-12 | heavy | 1 | 720 |
| `hva` SPO-9 | heavy | 1 | 560 |
| `v25` GUT-25 | heavy, belly | 2 | 330 |
| `asl` GUT-9 | light, heavy | 4 | 240 |
| `asl2` GUT-12 | heavy, belly | 2 | 520 |
| `sat` SPO-6 | heavy | 2 | 410 |
| `v22` SPO-22 | heavy | 1 | 640 |
| `v30` PEJ-30 | heavy, belly | 1 | 295 |
| `clb` PEJ-9 | heavy, belly | 2 | 350 |
| `rkt` PEJ-6 | light, heavy | 28 | 280 |
| `lcm` GUT-30 | heavy, belly | 1 | 780 |
| `e4` ZUN-4 | light, belly | 1 | 215 |
| `l2` GUS-2 | light, belly | 1 | 190 |
| `ecm2` ZUN-8 | tip, light, belly | 1 | 240 |
| `dec` ZUN-12 | light, belly | 1 | 210 |
| `oep` GUS-6 | light, belly | 1 | 175 |
| `irp` GUS-9 | tip, light, belly | 1 | 160 |
| `hdp` BAD-3 | light, belly | 1 | 320 |

下游专用弹（`dl4` / `dl6` / `dl9` / `vgt` / `vsr` / `vbn` / `otr` / `vzu`）
的 `fits` 是**空数组**，表示玩家挂不上它们。

**为什么单独放一张 `STORE_ATTR` 表而不是塞进 `WEAPONS`**：
这样能横着比较"谁挂得下、谁带得多、谁更重"，不用在几百行表里翻。
`data.js` 在 `WEAPONS` 定义之后用一个 IIFE 把 `fits` / `perPoint` / `mass`
**合并进**对应的 `WEAPONS[k]`，所以运行时 `WEAPONS[k].fits` 是存在的。

---

## 两层筛选（缺一不可）

| 层 | 字段 | 判据 | 回答的问题 |
|---|---|---|---|
| 挂点类型 | `WEAPONS[].fits` | 是否包含该组的 `kind` | **物理上挂不挂得住** |
| 机体能力 | `WEAPONS[].needs` ∩ `AIRCRAFT[].caps` | 机型是否具备所需能力 | **这架飞机撑不撑得住** |

只有 `fits` 的时候，"位置一样就能挂" —— 于是制空战斗机也能挂上
重型巡航导弹，机体差异等于白设计。所以补了第二层。

判定函数：

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

`STORE_NEEDS` 只给**少数有门槛的**武器加要求，大部分弹谁都能挂：

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
| KA-7 折翼 | （无，且 `npcOnly`） |

> `BIN-8` 追云**不在** `STORE_NEEDS` 里。它原来被标成"反辐射弹"、要求
> `strike`（对地火控），于是只有攻击机和多用途机能挂 —— 而它其实是一枚
> **对空的重型拦截弹**，最该带它的恰恰是制空 / 截击机（D-14、F-9），
> 那些机型没有 `strike`，反而挂不上。反辐射设定既没有机制支撑，
> 又造成这个荒谬的分配，所以整个删掉，现在只受 `fits: ['heavy']` 约束。
> `smoke.js` 专门断言"制空/截击机必须挂得上 BIN-8"。

**默认配置也受这条约束**，`preflight()` 会检查，`smoke.js` 也会。

---

## 配置与派生

### 机库里的配置

`getLoadout(ac)` 按需初始化，结构就是"组号 → 武器键"：

```js
loadouts['c11'] = { A: 'srm', B: 'v11', C: 'qsr', D: 'oep' }
```

默认值取自机型的 `defaultLoadout`，未指定的组是 `null`（空置）。

### `resolveLoadout(ac, lo)`

把"组 → 武器"展开成一条一条可用武器：

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

- **被动吊舱被 `continue` 掉**，不进武器纵列表（它们没有扳机可扣）
- 排序：**空空弹（`kind === 'aam'`）排前面**，同组内按 `name` 字典序

### 落到玩家身上（`startMission()`）

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

### `syncWeapon(a)`

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

`cycleSpecial()`（游戏里按 `R`）只做 `wpIdx = (wpIdx + 1) % len`，
只有一种武器时不切换（播一声 `loseLock` 提示音后返回）。
**切枪不清零锁定进度**：`lockProgress` 由 `updateLock()` 按新武器的
参数重新判，清零会让"对同一个敌人连打几种弹"这种多挂载玩法打不出来。

---

## 发射与装填

发射入口是 `game.js` 的 `launch(actor, target, w)`（玩家的
`fireSpecial()` 也会走到这里）。核心流程：

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
| `WEAPONS[].salvo` | `data.js` | **一次按键打出几发** |
| `loadoutList[].salvo` / `points` | `resolveLoadout` | **有几个发射槽**（= 能在装填前连按几次） |

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

**注意 `STORE_COOLDOWN` 必须覆盖所有可发射武器**（`smoke.js` 会检查
`fits` 非空的非被动武器）。漏掉的话那件武器会保留 `data.js` 里的原始 `cd` ——
那个值可能是按旧语义定的，会快得离谱（CLA-17 就这样漏过一次）。

---

## 被动吊舱

带 `passive: true` 的吊舱共 6 件（其中 5 件写在 `STORE_ATTR` 里、玩家可挂；
`vzu` 是下游专用、`fits: []`）。它们**不占扳机**——
装上就一直在起作用，也不会出现在 HUD 的武器纵列表里。

| 键 | 名 | 字段 | 值 | 效果 |
|---|---|---|---|---|
| `ecm2` | ZUN-8 静默 | `lockResist` | 0.40 | 敌方对你的锁定距离 ×(1−0.40) |
| `vzu` | ZUN-6 迷雾 | `lockResist` | 0.30 | 同上（下游，玩家挂不上） |
| `hdp` | BAD-3 护盾 | `armorBonus` | 0.22 | 全向减伤，可叠加 |
| `oep` | GUS-6 明瞳 | `lockRangeBonus` | 0.45 | 你的锁定距离 ×(1+0.45) |
| `irp` | GUS-9 夜枭 | `lockRangeBonus` / `lockResist` | 0.25 / 0.15 | 同时给两项 |
| `dec` | ZUN-12 雾障 | `flareBonus` | 40 | 额外干扰弹组数（×挂载点数） |

汇总由 `passiveEffects(ac, lo)` 完成：

```js
var e = { lockResist: 0, armor: 0, lockRange: 1, flareBonus: 0 };
...
if (w.lockResist)     e.lockResist = Math.max(e.lockResist, w.lockResist);  // 取最大，不叠加
if (w.armorBonus)     e.armor     += w.armorBonus * n;                      // 叠加 × 点数
if (w.lockRangeBonus) e.lockRange += w.lockRangeBonus * n;                  // 叠加 × 点数
if (w.flareBonus)     e.flareBonus += w.flareBonus * n;
e.armor     = Math.min(e.armor, 0.55);
e.lockRange = Math.min(e.lockRange, 1.9);
```

两条容易忽略的规则：

- `lockResist` **取最大值而不是相加** —— 两件抗锁定吊舱不会叠成因找不到
- `armor` / `lockRange` / `flareBonus` **乘该组的点数**（左右各一 = ×2）

在 `startMission()` 里落到玩家实体上：

```js
p.armor      = pe.armor;         // 全向减伤
p.lockResist = pe.lockResist;    // 缩短敌方对我的锁定距离
p.lockRangeK = pe.lockRange;     // 放大我的锁定距离（updateLock 里乘）
p.flares    += pe.flareBonus;    // 基础 80 组 + 加成
```

`Ent.damage()` 里对 `armor` 再钳一次上限 **0.6**，所以被动汇总的
0.55 永远先到。`lockRangeK` 在 `updateLock()` 里乘到 `lockDist` 上。

**为什么要有被动挂载**：它们让"少带一枚弹"变成真实的取舍，
而不是纯损失。带满弹的飞机更重更笨，而一件吊舱换来的可能是
整场交战的锁定优势，或者一次活下来的机会。

**两条路径不要混**：`resolveLoadout()` 会 `continue` 掉 `passive` 武器
（它们没有扳机可扣），被动效果必须走 `passiveEffects()` 单独汇总。
又：`vzu` 的 `lockResist` 当初被多包了一层 `passiveEffect: {...}`，
而汇总读的是顶层字段，于是那条加成**完全没有生效**；现在六件
被动吊舱都写顶层。

---

## 重量惩罚

### 总重与 `loadFactor`

```js
// loadoutMass(ac, lo)
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

在 `stepAircraft()` 里对机型物理数据做临时缩放（**整体替换 `p`**，
所以每个字段都得列上，漏一个就会取到 `undefined`；`accel` / `decel`
就曾经这样漏过）。

**AI 不带挂载，`loadFactor` 是 `undefined`**，所以这些惩罚只作用于玩家。

这是"空置挂架换机动性"的实现方式，也是半拟真感的来源之一 ——
满载出击真的会飞得笨。

### 系数只有一份

`loadoutPenalty()` 放在 `data.js`，**机库面板和物理共用它**。

原因是一次真实的漂移：面板曾经自己写了一个 `loadK × 18`，
只取了俯仰那一项，把最狠的加速 −26% 和失速速度升高全漏掉了，
玩家看到的损失比真实手感小得多。两处各写一套数字迟早会对不上，
而且对不上的时候很难发现。

显示端的两个阈值也要和物理对上：

- 面板逐项显示的开关是 `loadK > 0.015`（不是 1%）
- 单个百分比小于 1% 时，`pctTxt()` 显示 `<1` 而不是 `0`

---

## 界面怎么表达

### 机库的六维条

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
| 低可探测 / 火力 / 生存性 / 航程 | ❌ | 机型固有值 |

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
- 否则 → `n 个发射槽`、`射程 x.x km`（`missileRange()`）、
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

`PLANFORM.draw(cv, ac, lo, activeGroup)` → `planform.paint()`：

- 挂载点位置直接来自 `hardpointGroups[].pts`（同一份数据）
- 每个挂载点画一个 `drawStore()` 图形，类型不同颜色不同（`isPod()` 区分吊舱）
- **每组从挂载点引一条折线到左右两侧的标注栏**：偶数索引标右、奇数标左
  （全堆一侧会四线交叉穿过机身），线上方写 `GROUP A`，
  下方写 `型号 ×总数`（空置就写"空置"）
- 当前编辑的组用**琥珀色**，其余用淡青灰
- 可变后掠翼（DB-11）额外用**青色虚线**画出展开位的翼缘，并标注
  `可变后掠 11°–35°`（这是识别图的示意角，与 3D 模型的 20°→62° 不是同一套数）

页面下方的说明文字也来自 `game.js`：
「绿色为挂载，琥珀为当前编辑的挂载点组，青色虚线为可变后掠翼的展开位」。

### 战斗中的挂载状态图

`hud.js` 的 `drawStores()` 在右下角画一个 `compact` 版俯视图，
和机库大图**共用同一份 `PLANFORM.paint()`**（分成两份写迟早会长得不一样）。
它额外把每个槽的**就绪度**传进去：

```js
cd[wid] = slots.map(剩余 => 1 - clamp(剩余 / w.cd, 0, 1));
```

0 = 刚打完（空壳），1 = 装填完毕。冷却条朝"能打"的方向生长
（从下往上填满）；反过来画会读成"越打越有"，与实际相反。

---

## 加一种新武器

1. 在 `WEAPONS` 里加数据
2. 在 `STORE_ATTR` 里加 `fits` / `perPoint` / `mass`
3. 在 `STORE_COOLDOWN` 里加 `cd`（`smoke.js` 会检查）
4. 需要的话加进某个机型的 `defaultLoadout`
5. 跑 `node tools/smoke.js`

**别忘第 3 步。** 漏了不会崩，但那个武器永远不会出现在任何下拉框里。

## 加一架新飞机

1. 在 `AIRCRAFT` 里定义 `hardpointGroups`（**点数必须成对**）和 `defaultLoadout`
2. 在 `planform.js` 的 `P` 里加同名的俯视轮廓
3. 跑冒烟测试

`preflight()` 会检查：组是否成对（`pts.length >= 2`）、每组是否有武器挂得上
（`fits` ∩ `canCarry`，`npcOnly` 机型跳过这条）、默认配置里引用的组与武器是否存在
且真的能挂到那一组、是否缺 `phys`、可驾驶机型是否有俯视轮廓。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 挂载点布局与类型 | `data.js` 各机型的 `hardpointGroups` |
| 单点弹数 / 重量 / 适配类型 | `data.js` 的 `STORE_ATTR` |
| 每槽冷却 | `data.js` 的 `STORE_COOLDOWN` |
| 能力门槛与机型能力 | `data.js` 的 `STORE_NEEDS` / `AIRCRAFT[].caps` |
| 最大挂载重量 | `data.js` 各机型的 `maxLoad` |
| 挂载惩罚系数 | `data.js` 的 `loadoutPenalty()` |
| 总重公式（是否含 perPoint） | `game.js` 的 `loadoutMass()` |
| 被动效果汇总与上限 | `game.js` 的 `passiveEffects()` |
| 空挂架标记 | `entities.js` 的 `SLOT_EMPTY`（1e9） |
| 一次按键打几发 | `WEAPONS[].salvo` |
| 六维条算法 | `game.js` `buildHangar()` |
| 选装卡片 | `game.js` `buildHpPicker()` / `makeStoreCard()` / `storeStatLine()` |
| 俯视缩略图 | `planform.js` `paint()` / `drawStore()` / `groupStore()` |
| 战斗挂载状态图 | `hud.js` `drawStores()` |
