# HUD、输入与设置

绘制 `HUD`（`js/ui/hud/`）· 输入与设置 `Game`（`js/ui/input.js`、`js/ui/screens/settings.js`）

> **HUD 现在是 `js/ui/hud/` 下的一族文件**（v3.0.0 之前是单个 `js/hud.js` 巨型闭包）。命名空间 `HUD` 有私有状态对象 `HUD.$`，每个文件写成 `(function (HUD) { var $ = HUD.$; … })(HUD)`；`$` 只许本命名空间的文件读写，公开接口集中在 `zz-api.js`。文中函数名没变，只是分处不同文件：
>
> | 文件 | 内容 |
> |---|---|
> | `_state.js` | `var HUD = { $: {} }` |
> | `base.js` | 调色板（`GREEN / AMBER / CY / RED / DIM / BLUE`）、`HUDK` 缩放、`U()` / `gap()` / `applyScale()`、`hmiLayout()`、`draw()`（唯一入口与每帧顺序） |
> | `instruments.js` | `drawCompass`、`drawBoresight`、`drawTapes` / `tape`、`thrPercent` / `thrTape`、`drawEnginePanel`、`ctrlGauges`；`THR_IDLE / THR_MAX` 的 HUD 副本 |
> | `radar.js` | `drawRadar`、`farCell`、`radarXY`、`drawBlips`、`drawPitchLadder`、`threatState` / `drawThreatRing`（RWR） |
> | `targeting.js` | `drawTargets`、`drawLockBox`、`drawConeCue`、`drawLeadReticle`、`drawAllyMark` / `drawPlainMark`、`drawLaserStatus` |
> | `aids.js` | `drawCcip`、`drawFootprint`、`computeEnvelope` / `computeNEZ`、`offscreenRect` / `edgePoint` / `drawOffscreen` |
> | `panels.js` | `drawWeaponPanel`、`drawAlerts`（`ALERT_ORDER`）、`drawStores`、`drawFriendlyShots`、`drawIncomingMissiles`、`drawTargetBearing`、`drawObjective` |
> | `text.js` | `text()`、`isLightCol`、`banner()`、`hitMark()` |
> | `zz-api.js` | 公开接口：`HUD.draw / banner / hitMark / computeNEZ / computeEnvelope / radarXY / offscreenRect / drawAlerts / ALERT_ORDER / thrPercent / THR_IDLE / THR_MAX / GREEN / AMBER / CY / RED` |
>
> 全屏滤镜 `HudFx` 是独立文件 `js/ui/hudfx.js`（见文末）。玩家可见文字走 `T('键')`，字符串在 `locales/<语言>/text/ui/hud/` 一类的 json 里，见 [text.md](text.md)。

> HUD 是这个游戏里**唯一画在 Canvas 上**的 UI（菜单、机库、简报都是 DOM）。
> 原因见 [DESIGN.md](../DESIGN.md#56-屏幕用-dom不用-canvas-画-ui)。

---

## 布局

```
┌─────────────────── 指南针 (y 8–66) ───────────────────┐
│                     任务目标 (y 92/110)                │
│                                                        │
│ ┌速度带┬THR┐                                 ┌高度带┐  │
│ │ x=132│   │          ○ 机头参考              │W-132 │  │
│ │      │   │        ⊙ 速度矢量                │      │  │
│ │      │   │    ◎ 机炮准星环                  │      │  │
│ └──────┴───┘                                  └──────┘  │
│                                                  ┌动压┐│
│                                                  └──┘  │
│  ┌──雷达 12KM──┐                       ┌──RWR──┐        │
│  │             │                       │       │        │
│  └─────────────┘                       └───────┘        │
│              GUN 6000   SUT-11 4     DECOY 80          │
│                    HULL 100%                            │
└────────────────────────────────────────────────────────┘
```

速度带与高度带**离屏幕边缘 132 px**。早期是 78 px，
贴边太近，视线要在中心与边缘之间来回甩很远。

**引擎出力带（`THR`）紧贴空速带右侧**，同高、同一套刻度语言，
左侧因此读起来是一条竖线：速度 → 出力。

---

## 缩放与间距

`applyScale(k)` 把 `S.hudScale / 100` 夹进 **0.6 – 1.8** 存进 `HUDK`，
并重算三档字号：

| 变量 | 用途 | 字号 |
|---|---|---|
| `F` | HUD 正文 | `12 * HUDK` |
| `FB` | 读数（速度、高度、出力） | `15 * HUDK` |
| `FS` | 小字（单位、标签） | `11 * HUDK` |

两条位置规则，缺一不可（见 `HUD` 顶部注释）：

1. **位置一律从"元素所在的那条屏幕边"往内算**，而不是从屏幕中心算 ——
   否则缩放一变，贴边的元素就会朝反方向跑。
2. **那个间距本身再夹一个屏幕比例上限**，于是把缩放拉到最大时，
   元素只会在靠边的地方变粗，不会涨出可视区。

```js
U(v)                 = v * HUDK                       // 长度按缩放折算
gap(base, size, lim) = min(base * HUDK, size * lim)   // 距边间距，带上限
```

**注意**：设置项里目前**没有** `hudScale`（[DESIGN.md](../DESIGN.md#7-性能策略)
记着它最后换成了 `hudOpacity`），所以 `draw()` 里那句

```js
applyScale(S && S.hudScale !== undefined ? S.hudScale / 100 : 1);
```

实际永远走 `applyScale(1)`，`HUDK` 恒为 1。这套缩放机制是**为将来预留的**。

另外不是所有偏移都乘了 `HUDK`：`tape()` 的刻度线长度与标签偏移
（7 / 14 / ±18）是硬编码像素。改动时要留意这个不一致。

---

## 各元素说明

### 指南针（顶部）

水平带，显示当前航向 ±50°（`spanDeg = 100`）。

- 每 5° 短刻，每 10° 标注，`N/E/S/W` 高亮
- 中心琥珀三角 = 当前航向，下面有三位数字读数
- **任务目标方位标记**（琥珀小三角）：这是 M2 里找到浮空平台的
  主要手段，受设置项 `S.targetMarkers` 控制

航向由 `p.fwd` 的水平投影算出。**水平分量过小时（接近垂直姿态）
航向没有意义**，直接用上一帧的近似值（`hl > 0.03` 才更新），
并把结果缓存回 `p.heading`。

**为什么必须有它**：早期版本没有指南针，海面是单一颜色，
玩家滚转后完全分不清自己在往哪转。指南针 + 云的视差
共同解决方向感问题。

设置里可以关掉（`S.compass`）。

### 俯仰刻度（Pitch Ladder）

一组很淡的水平刻线（每 5° 一条，每 10° 标数字），标出机头
相对地平线的夹角。**只标 ±40°**。

早期是 ±75°，刻线从屏幕顶端铺到底端 —— 这个刻度是用来判断
"现在是抬头还是低头"的，超出 ±40° 的部分既读不出来、
又把画面切得七零八落。

**为什么它在这里特别有用**：追尾视角下相机不跟随滚转，
所以这些线永远是水平的，只随俯仰上下移动 —— 一眼就能看出
现在到底是在抬头还是低头，而不是靠地平线在画面里的位置猜。

**位置不是硬算的**，而是把一个"相对机头仰角为 d 的远方点"
（`R = 24000`，在相机 `far` 之内）投影到屏幕上：

```js
var dir = V(horiz.x * cos(a), sin(a), horiz.z * cos(a));
var s = M3.project(cam, p.pos + dir * 24000);
```

这样它自动跟随视场角、镜头距离等设置，不用另写一套投影公式。
自洽性可以验证：**抬头 10° 时的 10° 线，恰好落在平飞时 0° 线的位置**。

- 机头接近垂直时直接返回（`hl < 0.10`，水平参考没有意义）
- 上下各留 8% 边距，不顶到屏幕边缘
- 0° 线用亮一档的绿色并且不留中央缺口（它就是人工地平线），
  其余线在中央断开，免得压住机头参考和速度矢量

设置里可以关掉（`pitchLadder`）。

### 中心

- **机头参考**（绿色十字）：机身实际指向
- **速度矢量**（青色小圆 + 三根须）：`p.pos + p.fwd * 1400` 的投影点，
  即"飞机在往哪飞"
- **机炮准星环**（虚线圆）：提示机炮大致落点

机头参考与速度矢量**分开**是有意的：两者的夹角就是迎角，
在机动中能直观看出"机头指向"和"实际航迹"的差异。

### 速度带 / 高度带 / 引擎出力带

| 带 | 量程与刻度 | `scale` | 指针 |
|---|---|---|---|
| 空速（左，`side=1`） | 每 50 m/s 小刻、200 大刻 | 0.85 | 固定在中线，刻度滚动 |
| 高度（右，`side=-1`） | 每 1000 m 小刻、5000 大刻 | 0.021 | 固定在中线，刻度滚动 |
| 引擎出力（左，空速带右侧） | 固定 0–100%，每 10% 小刻、20% 大刻 | — | **随出力移动** |

`tape()` 是**滚动带**：指针恒在带子中线，刻度相对它滚动。
`scale` 决定"多少单位算一格像素" —— `half = (hgt / 2) / scale`
就是窗口的半量程。改它之前先想清楚一米对应多少像素。

空速带带两行读数：`km/h`（`speed * 3.6`）与 `kt`（`speed * 1.9438`）；
高度带带 `m` 与 `ft`（`* 3.28084`）。

#### 引擎出力带（`thrTape()`）

**它不用 `tape()`**，因为 `tape()` 是滚动带、指针永远钉在中心：
读得出"数值是多少"，读不出"现在在不在加力区、还剩多少余量"。
出力是一个**有界的绝对量**，只有"量程固定 + 指针移动"才一眼看得出高低。

约定：

- 读数 `thrPercent(throttle)`，三段各自线性：

  | 油门轴 | 读数 | 区段 |
  |---|---|---|
  | `0 → THR_IDLE (0.04)` | `−25 → 0%` | 减速板，淡青底色 |
  | `THR_IDLE → 1` | `0 → 100%` | 军推区 |
  | `1 → THR_MAX (1.25)` | `100 → 125%` | 加力，淡琥珀底色 |

  `THR_IDLE / THR_MAX` 定义在 `Game`（`js/engine/game/vars.js`），`HUD`（`js/ui/hud/instruments.js`）有同名副本，smoke 断言两边一致。
- **为什么慢车是 0% 而不是 4%**：飞行模型里没有推力，油门只决定一个目标速度
  （`lerp(0.74·vStall, vMil, throttle)`，见 [flight-model.md](flight-model.md)）。
  以前读数直接是"油门杆 × 100"，松手后停在 4%，看起来像还剩 4% 推力 —— 其实那就是慢车。
- 减速板在物理上是开 / 关两态（油门低于 `THR_IDLE` 就全开），负数段只表示杆位。
- 刻度 `−25 / 0 / 25 / 50 / 75 / 100 / 125`；`0%` 与 `100%` 各有一道白线
- 颜色：减速板 `CY`、加力 `AMBER`、其余 `GREEN`；负数标签青色、超过 100 的琥珀色
- 读数固定在带子垂直中心（`y = H/2 + 5`），和空速的 km/h 读数同高，两列读起来齐

**为什么它显示的是油门杆位置，而不是速度或推力**：三者都不同。
速度是**结果**，出力是**输入** —— 收油门之后速度是慢慢掉的，
俯冲时速度很高也不代表在加油门。

**为什么搬到这里**：它原来贴在屏幕左下角，而那正好是**雷达圆心**，
雷达在 `drawTapes` 之后绘制，于是它一直被盖住、玩家根本看不到。
现在挂在空速带右边，与速度带共用 `top` 与 `hgt`，左边距取
`x + U(104)`（正好让开空速带的 200 刻度标签）。

它还要负责 `HI-G` 提示（正在拉过载时闪红 / 琥珀），位置在 `top - U(30)`。

加力与减速板都是**瞬时态**：`Game`（`controlPlayer`，`js/engine/game/control.js`）里不给输入时，
`throttle > 1.0` 会每帧向军推回落（`dt * 1.6`）、
`throttle < THR_IDLE` 会向慢车回升。所以**拿它们当"稳定读数"去测会测出假失败**
（见 `tools/test/smoke.js` 里那条引擎出力断言，它只敢用稳态档位）。

### 动压表（本作特有，右下）

一个方框，显示当前 `Q` 值（kPa）与一条量程 60 kPa 的条，
20% 处有一道红色警戒线（对应 12 kPa）。

- `Q < 20` 转琥珀
- `Q < 12` 转红并闪烁"舵面失效"

**这是玩家在 18 km 以上唯一的生命线**，不要挪走或缩小。

### 雷达（左下，镜头朝上）

**朝向**（`drawRadar` / `radarXY` / `radarDir`）：按**镜头水平朝向**旋转（以前是机头朝上）；镜头接近竖直时退回机头。
N/E/S/W 十字轴按真方位画（`world.axis`，与罗盘同源），随地图转、字母保持直立，N 用琥珀色；字母画在**圆外** `R + U(10)`（以前在圆内，压着光点），范围标签 `RDR` 下移到 `cy + R + U(26)` 避开 S；圆心青色箭头指机头方位。

圆形，半径 `min(U(104), min(W,H) * 0.13)`，圆心
`(R + U(28), H - R - U(32))`。范围 **12 km**。

坐标转换（`radarXY()`）：

```js
rx = dx * fz - dz * fx;     // 右（f = 镜头水平朝向，旧：机头）
ry = dz * fz + dx * fx;     // 前
```

符号容易搞错，验证方法：机头朝北时，北方的目标应该出现在正上方。

绘制内容：距离环（3 圈）、十字、旋转扫描线（`performance.now()` 驱动）、
目标点（导弹 = 小圆；友机 = 绿圆；敌机 = 红三角；任务目标 = 小方框）。
超出范围的目标贴到环上（`out: true`）。

**远处的调节单元不上 HUD。** 每关头顶几十个单元，全标出来雷达边缘会排一圈灰点、
屏幕上满是灰箭头。`farCell(t, p)`：`model === 'cell'` 且离本机超过 10 km
（`CELL_HUD_RANGE2`）就为真，罗盘标记、雷达光点、目标框 / 屏外箭头三处都先过它。
近了才需要看清它在哪。

**电子战会在这块屏幕上留下痕迹。** `suppressed`（被敌方压制）或
`ewPower`（自己正在开机干扰，**干扰是双向的**）不为零时，敌方光点会
按强度随机丢失、剩下的也会偏一点 —— 这就是设定 7.3 里那句
"雷达屏幕上一片雪花，但目视却能看见敌机"。
友军光点和目标框**同样受影响**，压制取 max(本机, 友机)（`Ent.jamPress`）：友机自己在压制场里，数据链报来的位置一样不可靠。
目标框另有一套，只看 `suppressed`（自己开吊舱不影响；友军取 `Ent.jamPress` = max(本机, 友机)），判据是 `Ent.jamState(p, e)`。
压制强度决定两条门槛距离，距离决定闪成什么样：

| 距离 d | 状态 | 目标框 |
|---|---|---|
| ≤ `clearR = max(1800, 16000 × (1 − s))` | `clear` | 正常 |
| `clearR` – `hideR` | `flicker` | 闪烁；亮的时间占比从 1 线性掉到 0（`Ent.jamDuty`），越远越短 |
| ≥ `hideR = clearR + max(1500, 10000 × (1 − s))` | `hidden` | 不画 |

1800 m 是烧穿距离（`JAM_BURN_R`），`suppressed < 0.05` 当作没被压制。

**舰船 / 地面设施**（`kind === 'target'`）两头都打折：雷达功率大、回波强、传感器多，比战斗机难压。
- 玩家看它们、锁它们：压制 × `JAM_SURF_K`（0.5），烧穿距离换成 `JAM_BURN_SURF`（4500 m）。
- 它们自己受的压制：`Game` 的 `updateJamming`（`engine/game/lock.js`）同样乘 0.5。被压时，舰空弹的锁定距离 × `jamLockK`，
  只能打 `clearR` 以内的飞机（`pickTargetFor` 读 `Ent.jamLockOK`）。
烧穿距离内的目标始终 `clear`。非 `clear` 的目标**不能锁定、不进 F 键候选**，
已有的锁定会被强制取消（`Game` 的 `updateLock`（`lock.js`）/ `cycleTarget`（`ui/input.js`））。
另外 `suppressed` 本身会让锁定距离和锁定速度最多减半（`Ent.jamLockK`）。
玩家锁对面目标时 `updateLock` 还要求 `Ent.lockOff < 锥角`（水平方位）——以前只查俯角，身后的目标也锁得上。
AI（友军、敌军一样）用同一套门槛：被压制时只能对 `clearR` 以内的目标开火（`Ent.jamLockOK`），
锁定距离 × `jamLockK`，开火概率也 × `jamLockK`（`AI` 的 `fireAtTarget`）。

**注意**：油门条原来就压在这个圆心上，是本次搬走的（见上）。
改左下角任何元素前，先确认它不会与雷达圆心重叠。

### 威胁环（RWR）

位置由 `hmiLayout()` 统一给出 —— 它挂在**挂载俯视图的左边**，
底边与俯视图对齐：

```
[ RWR 环 ]  [ 挂载俯视图 ]
```

把威胁方向投影到环上：

- 圆圈 + 实心点：有雷达在照射，或导弹在接近
- 红圈：距离 < 2600 m
- 顶部文字：`▲ MISSILE 导弹逼近`（红，闪烁）/ `▲ SPIKE 被照射`（琥珀）
- 标签 `RWR` 画在环**上方** —— 环的底边已经贴到页边距了，写下面会出屏

### 目标框与 NEZ

**用颜色区分锁定状态**，但**绝不用绿色** —— 绿色在 HUD 里是
"友军 / 正常状态"的语义，拿它标一个敌人，玩家会下意识当成友机。
（这一点比"颜色突变更糟"。）

| 状态 | 颜色 | 外观 |
|---|---|---|
| 未锁定敌机 | 半透明红 | 小方框（空中 11、地面 8） |
| 已锁定，NEZ 之外 | **橙色** | 四角括号 + 数据块 |
| 已锁定，进入 NEZ | **红色** | 四角括号，线宽略粗 |

**基础小框与锁定大框是叠加、不是二选一**：早期锁定后小框和标签整个消失，
只剩一个空心大框，玩家会突然"看不见"这个目标的身份和距离 ——
而那恰恰是他最需要这些信息的时刻。

机头指向会画一条目标速度矢量线（仅空中目标）。

`inNez` 由 `computeNEZ()` 每帧解算，它包一层 `computeEnvelope(p, t)`（阶段 5.4 起）：

```js
// computeEnvelope：rmax / nez 用真实弹道动态算（Ent.envelopeRange）
var e = Ent.envelopeRange(w, { pos, fwd, speed: p.speed + 70 }, t);
rmax = min(w.lockDist, e.rmax);
nez  = min(w.lockDist, min(e.nez, e.rmax));
```

- 只对空空弹（对空中目标）和有导引头的对地 / 对海弹（对海面 / 地面目标）返回非 0
- `Ent.envelopeRange` 用 `stepMissile` 那份真实弹道，从本机当前高度 / 速度 / 俯仰
  出发，把**目标高度、相对速度、航向**都吃进模拟：`rmax` = 目标保持航向能命中的最远距离，
  `nez` = 目标立刻**掉头逃逸**（空空，按 `phys.vMax`）或**以最大航速逃逸**（对面，按舰船航速）
  仍能命中的最远距离。冲压弹的高空推力衰减、滑翔弹的升阻比、高抛弹的攻顶弹道都由弹道代码自然体现。
- 一次要跑十几份弹道，所以按状态变化（距离 / 高度 / 速度）+ 0.3 s 节流缓存在 `p.__env` 上。
- 结果单位是**斜距**，与目标框下方的距离读数（`M3.dist`）同口径。

以前这是三套各算各的：空空弹按"动力段距离 + 目标背离速度"的经验公式，
对地弹按"当前高度平飞发射的有效射程 × 0.7"，机库又用 `missileRange`（速度 × 寿命的解析式）。
现在 HUD、机库（`Ent.displayRange`）、AI（`Ent.aiReach` → `effRange`）都读同一套真实弹道。

锁定环三态：

| 状态 | 画法 |
|---|---|
| 正在锁（锥内且距离内，`lockOk`） | 琥珀实线，按 `lockProgress` 走弧 |
| 锁不上（锥外或超距） | 暗色虚线整圈，进度同时衰减 |
| 已锁定（`p.locked`） | 环隐藏；四角框内再画一套角（内缩 5 px、长 6），与框同色，不用绿；框正上方写 `LOCK`（与框下方的 `IN RNG` / `NEZ` 上下对应） |

> 以前：只有 `lockProgress < 1` 时画一个琥珀环，锁不上与正在锁看不出区别。

**锥角提示 `drawConeCue`**（`draw` 里在目标框之后调用）——**常驻**：拿着制导武器就一直画，只换样式：

| 状态 | 样式 |
|---|---|
| 没有目标 | 暗色虚线 |
| 有目标，但在锥外或锁定距离外 | 淡橙虚线 |
| 目标在锥内且在锁定距离内（能锁） | 红色实线 |

- 对空弹：以机头指向为心、半径 `focal · tan(锁定锥)` 的圆；大于屏幕就不画（大离轴弹）。锥宽的弹多数时候整个在画面外。
- 对面弹：锥只限水平方位，在地平线附近左右方位极限处各画一条短竖线。
- 锁定锥取 `p.lockCone`（`updateLock` 算的、含高空收窄与自身干扰收窄），没有时退回武器的 `lockCone`。

> 以前（v2.0.1 开发中途）有过一套"目标在屏内且锥外才出现、之后留着"的条件，太绕，改成常驻。

**精确制导炸弹的瞄准圈 `drawFootprint`**（5.3 第 3 条，`draw` 里在 `drawConeCue` 之后调用）——拿着带弹翼的精确制导炸弹（`ballistic + fin`、无 `glide`，PEJ-14）时**常驻**：

- 把 `Ent.finFootprint` 算出的落点可达区域投影到屏幕，画成**泪滴形**：后端是自然抛物线落点（画一个小 pipper），往前张开的是弹翼能下压 / 横修修到的范围。
- 落点按**机头朝向**投影（`M3.project` 同一套，和空空弹视场圈一致），不是按屏幕朝向 —— 圈在画面上跟着机头走。
- 目标（地面）落进圈内且已锁定（`p.locked`）= 物理上必中，圈转红实线并淡淡填色；否则淡橙虚线。
- 可达区域用 `Ent.finFootprint`（沿各水平角 `flyTo` 二分"能命中"的最远地面目标），和真实弹道是同一套 —— 圈不骗人。每 1 s 解算一次（`p.__fp`），两次之间圈钉在世界坐标；换武器 / 目标高度才立刻重算。

**目标在画面外时的锁定提示**（锁定环和双层角框都看不到时）：
- 目标方位条（`drawTargetBearing`）：锁满时目标标记外套一大一小两套四角框，上方写 `LOCK`。
- 屏外箭头（`drawOffscreen`）：选中目标照旧有脉动外环；**锁满**时在外环外切处加一个红色四角框（边长取外环脉动的最大直径，不跟着脉动）。读数只写距离，让到外环外（32 px）。以前读数前缀一律写 `LOCK`——那时选中就等于锁定。
- 用四角框而不是告警色：四角框在这套 HUD 里只代表"我选中的目标"，不会和 `SPIKE` / `MISSILE`（别人锁我）混淆。


数据块行高由 `ly` 递推，不再逐行写死 y 偏移（以前想在中间插一行，
得手工挪后面所有的数字）。

### 目标标签

**所有目标标记都带文字**（12 km 以内才画，否则满屏都是字）：

| 目标 | 第一行 | 第二行 | 第三行 |
|---|---|---|---|
| 空中目标 | **机型**（认机，对火控最要紧） | 呼号（风味信息，压暗） | 距离 |
| 地面 / 浮空设施 | 设施名 | 距离 | — |

**友军也进列表**：早期这里过滤掉了同队，于是僚机在视野里完全没有标记，
编队飞行时根本找不到自己的二号三号机。友军用四角短线（比敌方更细更暗）。

**僚机的标记下面还多一行：当前指令。** `FOCUS 集火` / `COVER 掩护` /
`SPREAD 散开`，读 `t.ai.cmd`。在它真的能改变行为之前，玩家按了 1/2/3
除了台词什么也看不到；现在指令生效了，就必须有地方看得见它。
被压制（`suppressed > 0.35`）时这一行换成橙色的 `LINK LOST 数据链中断` ——
那是无人机转入自主防御的标志（见 [ai.md](ai.md#无人僚机role-drone)）。

呼号体系见 [世界设定集 8.7 节](../world/SETTING.md)。
**无人机和浮空平台没有呼号，就只显示型号** —— 不要写"测绘机 3"这种东西，
那既不是呼号也不是型号，只是把内部列表的下标漏了出来。

### 屏幕外指示

目标跑出屏幕时，在边缘画一个指向它的箭头 + 距离。

- 箭头的敌我语义与屏内一致：**友军绿、敌人红**
- 早期这里地面目标用灰蓝、锁定状态用琥珀，结果同一色系承担了三种含义
  （说明文字、中立物、锁定），现在只剩两种：绿色是我的，红色是别人的

**落点在 `offscreenRect(W, H, p)` 里**，而不是固定的页边距。屏幕四边全被
仪表占着（上：指南针与任务目标；左：速度 / 出力带；右：高度带与动压表；
下：雷达、武器面板、方位尺、RWR + 挂载图），贴边的箭头会横穿它们 ——
本来只说"目标在那边"的提示，反而盖住了要读的数。所以四条边各自让开那一侧
最宽的元件，再让**方向**决定落在矩形的哪条边上：

```js
// 方向取相机空间的横向分量；投影点的屏幕偏移就是它乘一个正数
var c = M3.toCam(cam, t.pos);
var pt = edgePoint(cx, cy, c.x, -c.y, offscreenRect(W, H, p));
```

方向不变、位置统一。距离读数写在**朝屏幕中心**的一侧 —— 贴边的标记若把读数
写在外侧，就又压回刚让开的仪表上了。

**已锁定目标在屏外有专属修饰。** 它是玩家唯一会追着看的那一架，
一旦飞出屏幕就退化成和旁边十几只箭头长得一样的东西 —— 连"我锁的是哪一架"
都要靠回忆。所以 `isLock` 时：

- 颜色从半透明提到**实心**（其余箭头都是压暗的陪衬）
- 尺寸 11 → 13
- 加一圈随 `Math.sin(performance.now() * 0.006)` 脉动的外环 + 环心亮点
- 读数带 `LOCK` 前缀并加粗，而不是一个裸距离

外环半径最大 `11 + 5.4`，仍在 `offscreenRect` 让出的 `U(18)` 余量之内，
不会越界压到仪表。

### 来袭导弹

导弹是唯一能真正杀死玩家的东西，而它在屏幕上只是一个小亮点，
钻进云里就彻底看不见了。所以每一枚**以本机为目标**的导弹都会被标出：

- 在屏幕内：红色菱形 + 距离（1 km 内显示米，否则显示公里）
- 在屏幕外：落在 `offscreenRect()` 的边界上，画一个指向它的箭头 + 距离，闪烁

判断条件是 `m.target === p`（严格指向本机）。

### 目标方位尺（屏幕中下 `H * 0.82`）

锁定目标跑出视野时，屏幕边缘那个小箭头太容易被云和地面网格淹没。
所以在中下方额外给一条方位尺：

- 中间朝上的小三角 = 机头方向
- 目标标记的**左右偏移** = 方位角（±90° 归一化），
  **上下偏移** = 俯仰角（±30 px）
- 左右两端显示距离与 `L/R` 读数（`az * 57.2958`）

目标在侧后方（`fx <= 0.02`）时方位角没有意义，标记直接顶到左右边缘。

### 武器面板（底部中央）

左右两侧是固定的 `GUN 备弹` 与 `DECOY 组数`，中间是**挂载武器纵列表**：

> `DECOY` 就是干扰弹 —— **热焰弹与箔丝**的合称。前者骗红外、后者骗雷达，
> 实际投放时两者一起撒，所以座舱里只给一个词。单位是**组**，按住 V 连续投放。

```
      > TOR-2    8  ●●
        GIR-9    4  ○●
```

- 当前选中的那一行左边有 `>`，用琥珀色
- 数字是余弹，归零转红
- `●` / `○` 是**发射槽指示**（就绪 / 装填中）
- 装填中当前行转琥珀，右侧显示 `RLD n.ns`
- 没有挂载时显示 `无挂载 / CLEAN`
- 最下面是 `HULL` 结构完整度条（>60% 绿、>30% 琥珀、否则红）

**为什么是纵列表**：挂载系统让玩家可能同时带 3–4 种武器
（见 [loadout.md](loadout.md)），只显示"当前那个"会让玩家
完全不知道按 R 能切到什么、还剩多少。列表必须一次全看见。

### 挂载状态图（右下 `STORES`）

和机库右上角那张用的是**同一份绘制代码**（`PLANFORM.paint` 的紧凑模式）——
所以挂载点位置、武器外形在两边永远是一致的。

装填进度直接画在弹体上：打完之后弹体先暗下去，
再让亮绿从下往上把它填回来。

```js
cd[wid] = [0..1]   // 就绪度：0 = 刚打完，1 = 装填完毕
```

**方向不能反**：冷却条要朝着"能打"的方向生长。反过来（先满后慢慢空）
读起来像是"越打越有"，和实际状态正好相反。

位置同样来自 `hmiLayout()`，与 RWR 环共用一套坐标。

### 告警栈（屏幕中上方，`drawAlerts()`）

屏幕正中上方的告警**只有这一个栈**：先收集、按 `ALERT_ORDER` 排序、从上往下逐行画。
起点 `max(H * 0.22, U(176))`（让开任务目标块），每行占固定高度，
**闪烁的告警暗下去时照样占位**，下面的行不会一上一下地跳。
以前导弹 / 雷达照射、失速等、"被对空雷达截获"（那时写在 `Game` 里）各算各的 y，同时出现就叠在一起。

优先级（上 → 下）：

| 顺序 | id | 条件 | 文字 |
|---|---|---|---|
| 1 | `missile` | 有导弹以本机为目标（或 3 km 内的敌弹） | `▲ MISSILE  导弹逼近`（红，快闪，30 px），下一行是最近那枚的距离 |
| 2 | `lit` | 没有来袭导弹、但有敌机锁着本机 | `▲ SPIKE  雷达照射`（琥珀，30 px） |
| 3 | `detected` | `world.detected`（被对空雷达截获） | `▲ DETECTED  被对空雷达截获`（红） |
| 4 | `terrain` | `p.pos.y < 200 && p.fwd.y < 0` | `TERRAIN 低高度告警`（红） |
| 5 | `stall` | `p.stall` | `STALL 失速`（红） |
| 6 | `lowq` | `p.pos.y > 18000 && p.q < 12` | `LOW Q 动压不足`（琥珀） |
| 7 | `jammed` | `suppressed > 0.05 \|\| ewPower > 0` | `JAMMED 电磁干扰`（琥珀） |
| 8 | `winchester` | `gunAmmo <= 0 && spAmmo <= 0` | `WINCHESTER 弹药耗尽`（琥珀） |
| 9 | `emcon` | `p.emcon` | `EMCON-Δ 电磁静默`（青，**不闪** —— 它是状态不是告警） |

雷达 / 导弹 > 失速 > 动压是定下来的顺序；低高度排在失速前面，因为它意味着下一秒就是海面。
`threatState()` 只算导弹与照射的数据；RWR 环上仍然保留方位点，两者互补：
**一个告诉你"有威胁"，一个告诉你"威胁在哪个方向"。**

`ewPower` 是自己正在开机干扰别人（**干扰是双向的**，自己的接收机也被压），
`suppressed` 是被敌方干扰机的辐射场罩住。

任务横幅（`banner()`，默认 `H * 0.36`）读告警栈的下沿 `alertsBottom`：栈排得长时横幅往下让。

**新增告警**：往 `ALERT_ORDER` 插一个 id、在 `drawAlerts()` 里 push 一条，别另起 y。
`smoke.js` 会把全部告警同时打开，检查顺序与逐行不重叠。

### 任务目标（`U(92)` / `U(110)`）

世界对象上的 `objective` / `objectiveSub` 直接居中显示，让开顶部指南针。

### 击杀提示 / 横幅

- `banner(ctx, W, H, title, sub, alpha, col)`：`H * 0.36` 处一条横带
- `hitMark(ctx, W, H, txt, alpha, col)`：`(W/2 + 120, H/2 - 60)` 处的小提示

两者都由 `Game` 驱动（`ui/frame.js` 的 `render()` 在 `HUD.draw` 之后画），HUD 只负责画。

---

## 公开接口

```js
HUD.draw(world, p, dt, S)      // 唯一入口，画一帧
HUD.banner(ctx, W, H, title, sub, alpha, col)
HUD.hitMark(ctx, W, H, txt, alpha, col)
HUD.computeNEZ(p, t)           // 返回不可逃逸区距离（米），非空空返回 0
HUD.radarXY(p, wp, cx, cy, R, range)   // 世界点 → 雷达局部坐标
HUD.offscreenRect(W, H, p)     // 屏外标记的安全矩形 {x0,y0,x1,y1}
HUD.GREEN / AMBER / CY / RED   // 调色板，供 Game 复用
// 以上都在 js/ui/hud/zz-api.js 里挂出；另有 computeEnvelope / drawAlerts / ALERT_ORDER / thrPercent / THR_IDLE / THR_MAX
```

`draw()` 的每帧顺序（顺序有语义，不要随意重排）：

```
drawCompass → drawPitchLadder → drawBoresight → drawTapes
→ drawRadar → drawThreatRing → drawTargets → drawLaserStatus
→ drawLeadReticle（在目标框之上，免得被挡住）
→ drawIncomingMissiles → drawStores → drawWeaponPanel
→ drawTargetBearing → drawAlerts → drawObjective
```

`draw()` 开头会 `ctx.save()`、设 `globalAlpha = hudOpacity / 100`（夹 0.15–1），
结尾 `ctx.restore()`。

**HUD 在 `Renderer.end()` 之后绘制**，所以镜头抖动不影响 HUD ——
见 [rendering.md](rendering.md)。

### 激光照射状态（当前休眠）

`drawLaserStatus()` 的两条分支现在都不会触发 ——
`PEJ-30` 已从激光改成光电，没有任何武器用 `seeker: 'laser'`。
保留它是为了让将来给某件弹填上 `'laser'` 时，HUD 反馈能立刻跟上：

- 投放前：目标框下方写照射进度
- 投放后：`H * 0.87` 常驻状态条（`◎ 照射保持中` / `✕ 照射中断`）

---

## 小工具

```js
function text(ctx, t, x, y, col, font, align)
```

所有文字都走它。除了统一字体 / 对齐，它还做一件事：
**亮色读数自动描一圈黑边**（`isLightCol(col)` 判断亮度 > 165）：

```js
ctx.strokeStyle = 'rgba(0,0,0,0.62)'; ctx.lineWidth = 2.5;
ctx.strokeText(t, x, y);
```

速度、高度、方位这些"浮空"读数在云上或亮天空里会糊掉，
描边比给每处都加底板省事得多。`isLightCol` 有缓存（`_lightCol`）。

---

## 输入映射

事件绑定在 `js/ui/input.js` 的 `bindInput()`；下表“代码位置”里的函数分别在 `engine/game/control.js`（`controlPlayer` / `toggleAimMode`）、`ui/input.js`（`cycleTarget` / `cycleSpecial` / `fireSpecial` / `setWingCmd` / `toggleEmcon`）、`ui/camera.js`（`updateCamera`）、`ui/screens/nav.js`（`requestAimLock`）、`ui/screens/pause.js`（`togglePause`）。

| 输入 | 作用 | 代码位置 |
|---|---|---|
| 鼠标移动 | 转动世界瞄准方向（默认，指针锁定） | `mousemove` → `aimYaw / aimPitch` |
| 点击画布 | 锁定指针 | `requestAimLock()` |
| `M` | 切换鼠标引导 / 键盘直控 | `toggleAimMode()` |
| `W`/`S` | 抬头 / 低头（鼠标引导时按住临时覆盖飞控） | `controlPlayer()` |
| `A`/`D` | 左滚 / 右滚（同上） | 同上 |
| `Q`/`E` | 方向舵（同上） | 同上 |
| `Shift`/`Ctrl` | 油门杆（推满自动进加力，收到底自动张减速板） | 同上 |
| 滚轮 | 微调油门 | `wheel` 监听 |
| `↑↓←→` | 自由视角（回中） | `updateCamera()` |
| 左键 / `Space` | 机炮 | `controlPlayer()` |
| 右键 / `Enter` | 特殊武器 | `fireSpecial()` |
| `F`/`Tab` | 切目标 | `cycleTarget()` |
| `R` | 切挂载 | `cycleSpecial()` |
| `V` | 干扰弹（按住连投） | `Ent.breakLock()` |
| `G` | 高 G 机动（按住） | `controlPlayer()` |
| `1`/`2`/`3` | 僚机指令 | `setWingCmd()` |
| `N` | EMCON-Δ 电磁静默 | `toggleEmcon()` |
| `H` / `Esc` | 暂停（菜单里 Esc 返回标题） | `togglePause()` |

**鼠标引导**：战雷式 —— 鼠标位移转动世界坐标里的瞄准方向，追尾镜头跟它走，
`updateMouseAim(dt)` 把它交给 `AI.steerTo()`（和 AI 同一个控制律，见 [ai.md](ai.md)）。
详见 [game.md](game.md)。

---

## 设置系统

### 数据驱动

`SET_GROUPS` 描述所有设置项（都在 `js/ui/screens/settings.js`，标题 / 提示文字走 `T()`），`buildSettingsInto(container)` 把
任意容器填满控件。**独立设置页和暂停菜单里的设置页共用全部代码。**

加一个设置项 = 往 `SET_GROUPS` 加一行 + 在 `DEFAULTS` 加默认值。

### 各项

| 键 | 默认 | 说明 |
|---|---|---|
| `volMaster` | 45 | 主音量 |
| `volEngine` | 45 | 引擎音量（相对）。**默认压低**，因为引擎是持续音 |
| `volSfx` | 85 | 音效音量 |
| `muted` | false | 全部静音 |
| `fov` | 56 | 视场角 |
| `camDist` | 74 | 镜头距离（原值 96，太远） |
| `camHeight` | 22 | 镜头高度 |
| `hudOpacity` | 100 | HUD 透明度 |
| `compass` | true | 顶部指南针开关 |
| `targetMarkers` | true | 目标方位标记开关 |

`pitchLadder` 也在 `SET_GROUPS` 里（俯仰刻度开关）。

### 持久化

`localStorage` 键 `monsoonline.settings.v1`。读写都包在 try/catch 里，
无痕模式或禁用存储时静默降级到默认值。

**改设置项名称时记得升版本号**，否则老存档里的值会被静默丢弃
（`loadSettings()` 只接受 `DEFAULTS` 里存在的键）。

### 热调整

暂停时 `update()` 不跑但 `render()` 照跑，所以拖动视角滑块能立刻
看到画面变化。**这是把设置嵌进暂停菜单的全部理由。**

---

## 暂停菜单

三个页签：

- **暂停**：继续 / 放弃任务
- **设置**：与独立设置页完全相同的控件
- **操作说明**：`buildHelpHTML(true)` 生成的单栏版本

页签切换由 `switchPauseTab(name)`（`js/ui/screens/pause.js`）处理。

**操作说明是单一数据源**：`KEYMAP` 和 `TIPS` 两个数组（`js/ui/screens/settings.js`）同时喂给
独立手册页和暂停菜单。早期这里是两份独立的 HTML，改一个忘一个。

实战指南（`GUIDE`）同样两处共用。它里面的图标（`HELP_ICONS`）是手画的 SVG，
颜色、虚实要和上面的 HUD 元素保持一致：改了锁定框、机炮圈或告警的样式，记得同步改这里。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| HUD 整体缩放范围 | `base.js` `applyScale()` 里的 `clamp(k, 0.6, 1.8)` |
| 三档字号 | `applyScale()` 里的 12 / 15 / 11 |
| 速度带位置 | `drawTapes()` 里的 `gap(132, W, 0.15)` |
| 引擎出力带位置 | `drawTapes()` 里的 `x + U(104)` |
| 出力带军推线 / 加力区 | `thrTape()` 里的 `0.8` 与 `hgt * 0.2` |
| 带子长度 | `drawTapes()` 里的 `min(U(260), H * 0.32)` |
| 速度带刻度密度 | `tape(ctx, x, ..., 50, 200, 1, 'M/S', CY, 0.85)` |
| 高度带刻度密度 | `tape(ctx, x2, ..., 1000, 5000, -1, 'M', GREEN, 0.021)` |
| 动压量程 / 警戒线 | `drawTapes()` 里的 `q / 60` 与 `0.2` |
| 雷达半径与范围 | `drawRadar()` 里的 `U(104)` / `12000` |
| 右下角布局（RWR + STORES） | `hmiLayout()` |
| 屏外标记的安全矩形 | `offscreenRect()`（让开区）与 `edgePoint()`（落点） |
| 调节单元上 HUD 的距离（10 km） | `CELL_HUD_RANGE2` / `farCell()` |
| 俯仰刻度范围 | `drawPitchLadder()` 里的 `LIM = 40` |
| 告警阈值与优先级 | `drawAlerts()` / `ALERT_ORDER` |
| 颜色 | `js/ui/hud/base.js` 顶部 `GREEN / AMBER / CY / RED / DIM` |

各行所在文件见开头的文件表（`drawTapes` / `thrTape` 在 `instruments.js`，`drawRadar` / `drawPitchLadder` / `farCell`（`CELL_HUD_RANGE2`）在 `radar.js`，`offscreenRect` / `edgePoint` 在 `aids.js`，`drawAlerts` 在 `panels.js`，`hmiLayout` 在 `base.js`）。

## 全屏滤镜（`js/ui/hudfx.js`，v1.13.2）

`HUD.draw` 最后调 `HudFx.draw(ctx, W, H, p)`，画在 `hudOpacity` 的 save/restore 之外，滤镜不跟着 HUD 变淡。

**独立图层（v2.0 后）**：HudFx 画在自己的全屏 canvas 上，`z-index 300` —— 压在 `#radio`（200）与 `#sysnote`（210）之上、`.overlay` 暂停层（800）之下（旧：画进 HUD 的 ctx，盖不住无线电）。受扰时再加 CSS `backdrop-filter: blur`，最大 `FX.jamBlur` 1.2 px × 受扰强度。`Renderer.begin` 每帧调 `HudFx.beginFrame` 清屏，所以离开战斗就消失。没有图层（tools）时退回画到传入的 ctx。
参数全在 `HudFx.FX`。

| 效果 | 触发 | 强度 | 上限（保证 UI 可读） |
|---|---|---|---|
| 干扰滤镜：下行扫描线带 + 细扫描线 + 静电噪点（预渲染 128² 图随机平移铺满）+ 偶发撕裂线 | `max(suppressed, ewPower × 0.8)` > 0.04 | 线性跟随强度 | 扫描线带 0.10、噪点 0.13、撕裂线 0.22（只有一两条 1–3 px 的线） |
| 受伤闪红：径向渐变，边缘重、中央轻 | 每帧比较玩家 hp，掉血即触发（不改 `Ent.damage`） | `0.18 + 单次伤害 / maxHp × 3.2`，夹到 1；多次命中取较大值，不累加 | 边缘 0.42、中央 0.06；每秒退 2.2，满强度约 0.45 s 退完 |

告警栏：
- `DAMAGE 受损警告`：红色快闪，最后一次掉血后挂 1.4 s（`FX.alertHold`），优先级排在雷达照射之后。
- `JAMMED 电磁干扰`：受扰期间常驻，不闪，颜色压暗（`rgba(255,176,58,0.62)`）。

`HUD.draw` 收到的 dt 恒为 0，所以 `HudFx` 自己用 `performance.now()` 算帧间隔。换了玩家对象（新一局）会自动清零。


## 无制导落点标记（CCIP，5.5）

`drawCcip`：当前武器是无制导对地弹（炸弹 / 火箭）时，每 0.1 s 用 `Ent.naturalPoint`（与 `stepMissile` 同一套积分）前推到落地，画 pipper + 落点线；有 `cluster` / `blast` 的画爆炸半径地面椭圆；落点在屏外时在安全矩形边缘画方向箭头；锁定 / 选中的地面目标落进半径内变红。不与精确制导炸弹的泪滴圈同时出现。探针 `tools/test/probes/probe-ccip.js`。

## 机炮提前量准星（真实弹道）

`drawLeadReticle` 读 `Ent.gunLead`：用 `Ballistics.step`（与 `fireGunFrom` 同一套：载机速度叠加、重力、阻力）迭代反解机头方向，按线段取最近接近点避免量化误差。预测点 = 机头沿解算方向在目标距离处的点。以前是“目标位置 + 速度 × 距离/初速”，漏掉载机速度与重力下坠。探针 `tools/test/probes/probe-gunlead.js`（新解算 36/36 命中，旧估算 9/36）。AI 的 `leadTo` 还是旧的直线估算（带 0.85 的保守系数），未改。

## 本批更新

- **视场圈（`drawConeCue`）画在最底层**：在指南针、俯仰梯、目标框等之前绘制，其它 UI 都叠在它上面。
- `computeEnvelope` 的 `isSurf` 认 `target: 'any'`（TOR-3 打地面目标时也有包线，之前 `aam` 打地面返回 null）。
- 锁定框的颜色与判据按**当前目标的类别**（`Ent.targetClass`），不是按武器的 `target` 字段。
