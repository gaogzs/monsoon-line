# AI 行为

代码：`js/ai.js`（752 行）· 调用方：`js/missions.js` 的 `spawnEnemy()` / `spawnWingman()`、`js/game.js` 的 `updateMouseAim()`

---

## 一句话

**整个 AI 只有一个控制律**：`AI.steerTo(aircraft, desiredDir, out, state)`。
玩家的鼠标飞控走的也是同一个函数。其余代码全是决策层 ——
"下一步该往哪飞、该不该开火"，最后都收敛成一个"想去"的世界方向，
交给 `steerTo` 翻译成舵面输入。

### 导出接口

| 函数 | 签名 | 用途 |
|---|---|---|
| `AI.attach` | `(a, opt) → a.ai` | 挂上 AI 状态；`opt = {role, skill, formation, cmd}` |
| `AI.update` | `(a, dt, world)` | 每帧决策 + 操纵 + 开火；带 `a.route` 的单位转 `updateRoute()` |
| `AI.steerTo` | `(a, desired, out, st) → out` | 控制律；`out` 是 `{pitch, roll, yaw}`，就地写入后返回 |
| `AI.findIncoming` | `(a, world) → missile \| null` | 4.2 km 内、以本机为目标的敌弹 |
| `AI.nearestEnemy` | `(a, world, maxR) → actor \| null` | 最近敌机；`maxR` 默认 16 000 m |
| `AI.leadTo` | `(a, t) → 单位方向` | 对目标的提前量指向（折扣固定 0.85） |
| `AI.strafeTarget` | `(a, t, world) → {dir, throttle, ab}` | 对地指向（当前只是 `leadTo` + 0.9 油门） |

`out` 的符号：`pitch > 0` 抬头、`roll > 0` 右滚、`yaw > 0` 右偏航。
`st` 可选，是提供 `rollLock` / `aimMag` / `aimUpright` 的容器；
AI 传飞机自己（`a`），玩家传 `player`。

---

## 控制律：最少时间转向

逻辑来自真实空战：**先滚转对齐，再全力拉杆**。反过来做（边滚边死拉杆）
会让升力矢量指向斜下方，飞机一边转一边掉高度，还转不快。

### 0. 输入分解

```js
fx = dot(desired, a.fwd);  rx = dot(desired, a.right);  ux = dot(desired, a.up);
off = acos(clamp(fx, -1, 1));      // 机头与目标的夹角
```

### 1. 靠近中心时整体缩杆（没有死区）

```js
aimMag = st.aimMag;                              // 屏幕归一化幅度，1 = 屏幕边缘
gain   = (clamp(aimMag / AIM_FULL_MAG, 0, 1))^2  // AIM_FULL_MAG = 0.35
```

| 屏幕半径 | 0.35（满杆点） | 0.175 | 0.05 |
|---|---|---|---|
| gain | 1.00 | 0.25 | 0.02 |

刻意不做成死区：死区里"完全不动"会让飞机带着歪斜姿态一直飞，
而硬边界的另一侧又突然满杆。平方衰减两头都平滑。

`aimMag` 只有玩家提供（`player.aimMag = sqrt(aimX² + aimDown²)`）。
**AI 不传它**，此时 `gain = 1`、`blend = 1`、`pushW = 0`，即"满杆、纯滚转对齐"。

### 2. 滚转 / 偏航按幅度渐变分配

**为什么不用"纯物理最优"**：按各轴角速度算耗时确实能得出最快解，
但那个解在鼠标刚离开中心时给的是几乎**纯偏航**——机头转过去而机身还是平的。
玩家想"稍微往左转"，期待的是飞机稍微往左倾、转完接着平飞，
而不是机身纹丝不动地横着飘；鼠标再挪远那个解又会突然切到满滚转，
中间没有过渡。所以按幅度渐变：

```js
blend = smoothstep(clamp(aimMag / AIM_BLEND_MAG, 0, 1));   // tb²(3-2tb)，轴 = 0.225
```

- 刚离开中心 → 少量滚转 + 偏航补足，轻微侧倾、转向柔和
- 推到满杆 → 完全滚转对齐，偏航归零，动作干脆

两个轴分工不同：`AIM_FULL_MAG`（0.35，平方）管"力气多大"，
`AIM_BLEND_MAG`（0.225，smoothstep）管"力气怎么分"。
smoothstep 两端导数为 0，两头都不会有"忽然开始变"的拐点。

### 3. 滚转对齐角与方向锁存

```js
lateral = sqrt(rx*rx + ux*ux);
up      = lateral > 1e-4 ? clamp(ux / lateral, -1, 1) : 1;   // +1 正上，0 正侧，-1 正下
rollErr = atan2(-rx, ux);                                    // ∈ [-π, π]
rollCmd = clamp(-rollErr * 2.8, -1, 1) * blend * (1 - pushW);
```

目标接近正下方时 `rx` 会在 0 附近抖，导致满左滚 / 满右滚来回横跳。
所以当 `|rollErr| > 2.55` 时锁住转向，转过半圈再解锁：

```js
if (st) {
  if (Math.abs(rollErr) > 2.55) {
    if (!st.rollLock) st.rollLock = (rollErr >= 0) ? 1 : -1;
    rollErr = st.rollLock * 3.14;
  } else st.rollLock = 0;
}
```

玩家对象自带 `rollLock`（初始 `undefined`，视为 falsy）。

### 4. 偏航：只补滚转剩下的侧向分量

```js
yawErr = atan2(rx, fx);
if (fx < -0.45)        yawCmd = clamp(rx * 1.8, -1, 1);          // 目标在尾后锥内
else if (blend < 0.99) yawCmd = clamp(yawErr * 1.6, -1, 1) * (1 - blend);
```

`fx < -0.45` 时**不参与混合**：滚转对齐在正后方没有意义，
只能靠偏航把机头掰过去。

### 5. 目标在下方：推杆锥与 `pushW`

来源里**没有**"前下方目标直接推杆并 `return`"的独立分支。下方目标走同一套
滚转对齐，只是多一条**推杆通道**，并靠同一个 `blend` 轴与滚转互相转化。

```js
downCone = (up < -0.5);                        // up = -1 正下，-0.5 即正下方 ±60°
if (downCone && upright > 0.7) {
  tp    = clamp(aimMag === null ? 1 : aimMag / AIM_PUSH_AXIS, 0, 1);   // 轴 = 0.85
  pushW = 1 - tp*tp*tp;                        // 立方衰减（"后降"）
}
```

`upright = st.aimUpright !== undefined ? st.aimUpright : a.up.y`。
**推杆权重用立方而不是 smoothstep**：推杆强度要到离轴角 25°
（屏幕纵向约 46%）才封顶，而 smoothstep 中段掉得太快，
两者刚好错开，结果永远在还没推满时就被滚转接走：

| aimMag | 0.25 | 0.47 | 0.70 | 0.85+ |
|---|---|---|---|---|
| pushW | 0.98 | 0.84 | 0.44 | 0 |

**走推杆时不能同时滚转**：目标在正下方时 `rollErr` 会给出 ±π
（要滚 180° 才能把它转到机体上方），一边推杆一边缓慢滚转的手感
就是"鼠标往下推，飞机却先侧着慢慢转"。所以 `rollCmd` 乘了 `(1 - pushW)`。

### 6. 俯仰

```js
mag = clamp(off * 2.3, 0, 1);
if (up >= 0) pitchCmd = mag * (0.55 + 0.45 * sqrt(up));   // 拉杆
else         pitchCmd = mag * 0.18 * (1 + up);            // 几乎不拉，交给滚转

if (pushW > 0.01) pitchCmd = pitchCmd * (1 - pushW);      // 削掉俯仰那一份

var pushAmt = 0.4 + 0.6 * clamp(-up, 0, 1);   // 正下方 1.00，锥边缘（up = -0.5）0.70
out.pitch = pitchCmd * gain;
if (pushW > 0.01) out.pitch -= pushAmt * pushW;           // 推杆那一份不乘 gain
out.roll  = rollCmd * gain;
out.yaw   = yawCmd * gain;
```

**推杆那一份为什么不乘 `gain`**：`gain` 是"靠近中心整体缩杆"，
而推杆本身已经是柔和动作，再压一遍就彻底看不见了
（实测乘完只剩 -0.009，角速度 0.4°/s）。所以滚转 / 偏航 / 常规俯仰照旧缩杆，
推杆单独给足。

**推杆强度为什么用方位 `up` 而不是离轴角**：原来乘的是
`mag0 = clamp(off0 × 2.3, 0, 1)`，但 `off0` 要到 25° 才封顶，
而 25° 离轴角对应的 `aimMag` 已经是 0.875 —— 那时 `pushW` 早就归零，
推杆**永远到不了满幅度**（实测峰值只有 -0.28）。改用 `up` 之后，
鼠标幅度只管"推杆 vs 滚转的比例"，方位只管"推得多狠"。

> 顺带记一笔：函数开头算的 `off0` / `mag0` 在当前代码里**没有任何读者**，
> 是上一版留下的死变量。

### 这条控制律修过什么

早期版本用 `align = 1 - min(1, |rollErr| / 2.0)`，再拿它削弱俯仰：
`pitchCmd = mag * (0.30 + 0.70 * align)`。问题在于**用滚转角大小去削弱俯仰**：
目标在正侧方时 `align ≈ 0.22`，拉杆只剩 45%——飞机是"滚过去再慢慢蹭"，
而不是"滚筒到位后一把拉满做最大过载转向"。

| 想"向左下方急转"时 | 旧 | 新 |
|---|---|---|
| 滚转指令 | 满左滚 | 满左滚 |
| 同时的俯仰 | 45% | 接近 0（由 `1 - pushW` 削掉） |
| 对齐后俯仰 | 回到 100% 需要时间 | 立即接近满杆 |

### 三个"方向"必须分清楚

否则很容易写出看着对、飞起来不对的判据：

- **世界方向**：哪边是上。飞机和镜头共用同一个世界。
- **镜头方向**：追尾机位的相机上方向**恒为世界上方**（随俯仰倾斜但永不倒过来）。
  所以"鼠标在屏幕下方"对应**世界下方**，与机体姿态无关。
- **机体方向**：`a.fwd / a.up / a.right`，会随滚转翻过来。

同一个鼠标位置落到机体坐标里是不同的方向：

| 姿态 | 屏幕下方 → `ux` | 屏幕右 → `ux` |
|---|---|---|
| 正飞 | -0.169 | 0.000 |
| 左滚 90° | -0.000 | -0.169 |
| 倒飞 | +0.169 | -0.000 |
| 右滚 90° | -0.000 | +0.169 |

"推杆"是绕机体 `right` 轴转，让机头朝**机体下方**。所以方位判据只有
一条：`ux < 0`。倒飞时 `ux` 自动变正，不需要特殊处理 ——
但也**绝不能用 `|ux|` 或 `|up.y|`** 去判，那会把倒飞误当成正飞。

**推杆的几何前提**：`upright > 0.7`，即机体相对**镜头**正着飞。
"推杆"是绕机体 `right` 轴转，只有机体正着时它才真的是"把机头压下去"；
侧飞时 `up` 指向水平，绕 `right` 转其实是**水平转向**。
判据必须相对镜头而不是相对世界：追尾机位有俯仰角（低头看飞机），
`camUp` 并不等于世界正上方。玩家对象在 `game.js` 里算好
`player.aimUpright = dot(player.up, cam.up)` 传进来；用 `a.up.y` 的话，
镜头俯得深一点就会把一架"相对镜头正着飞"的飞机误判成不正。

---

## AI 状态：`attach(a, opt)`

| 字段 | 初值 | 含义 |
|---|---|---|
| `role` | `'enemy'` | `enemy` / `drone` / `wingman` |
| `skill` | 0.6 | 0..1，见「技能等级」 |
| `mode` | `'pursue'` | `pursue` / `evade` / `extend` |
| `modeT` | 0 | `extend` 剩余时间 |
| `evadeT` | 0 | 规避状态最短维持时间 |
| `msl` | null | 正在规避的导弹引用 |
| `flareT` | 0 | 干扰弹投放间隔 |
| `shootT` | 0 | 导弹发射冷却 |
| `burstT` | 0 | 机炮点射计时（当前未使用） |
| `target` | null | 当前目标 |
| `retargetT` | `rnd(0, 1.2)` | 下一次重选目标的倒计时 |
| `formation` | null | 实际由 `missions.js` 传 `{dx, dy, dz}` |
| `wander` | `rnd(0, 6.28)` | 巡逻用的相位 |
| `cmd` | `'focus'` | 僚机指令 `focus` / `cover` / `spread`。缺省为最保守的 `focus` |

---

## 每帧：`update(a, dt, world)`

入口保护：`!a.alive || !a.ai` 直接返回；`a.route` 存在则整帧交给
`updateRoute()`。先递减计时器：`retargetT`、`modeT`、`evadeT`、`shootT`、
`burstT`、`flareT`。

**1. 威胁规避优先级最高**

```js
inc = findIncoming(a, world);          // 4.2 km 内、以本机为目标的敌弹
if (inc) { s.mode = 'evade'; s.evadeT = max(s.evadeT, 0.55); s.msl = inc; }
else if (s.mode === 'evade' && s.evadeT <= 0)
  s.mode = a.hp < a.maxHp * 0.28 ? 'extend' : 'pursue';
```

规避是**抢占式**的：发现来袭弹立刻切模式；`evadeT = 0.55 s`
确保不会一帧就切回来。

**2. 血量过低脱离**

```js
if (s.mode !== 'evade' && a.hp < a.maxHp * 0.25 && Math.random() < 0.004) {
  s.mode = 'extend'; s.modeT = rnd(4, 9);
}
if (s.mode === 'extend' && s.modeT <= 0) s.mode = 'pursue';
```

即每帧 0.4% 概率触发，脱离持续 4–9 秒。

**3. 目标选择**（`retargetT = 0.35 + (1 - skill) * 0.9`，
即技能 0 → 1.25 s、技能 1 → 0.35 s；`retargetT <= 0`、无目标、
目标已死也立即重选）

| 角色 / 指令 | 规则 |
|---|---|
| `drone` + 数据链中断 | **降级为完全自主防御**：`s.target = null`，只规避、不开火 |
| `drone` + `focus`（默认） | 继承长机的目标；长机没锁定就是 `null` |
| `drone` + `cover` | 优先打正在威胁长机的敌机（`leadThreat`），找不到退回长机目标 |
| `drone` + `spread` | 自主接战：`nearestEnemy(a, world, 9000)` |
| `wingman` + `focus` | 继承长机的目标 |
| `wingman` + `cover` | 同 `drone + cover`（共用 `leadThreat()`） |
| 其余（含 `enemy`） | 被主动雷达照射时优先咬照射者（12 km 内）；否则 `nearestEnemy(a, world, role === 'wingman' ? 11000 : 15000)` |

> **僚机指令（1/2/3）真的会改变行为。** 这三条写在题头、操作说明和
> 游戏内资料库里，但实现曾经只认 `role === 'wingman'`，而 `spawnWingman()`
> 一律用 `role: 'drone'` —— 于是按下去只有一句台词。
> 现在 drone 也走同一套授权规则，区别只在于它**始终不脱离编队**。
>
> 默认指令是 **`focus`**（最保守的那一档），不是 `spread`：
> "没有判断力"的设定要求"什么都不说"时落在最保守处。
>
> `leadThreat()` 依赖 `e.target === world.player` —— 所以它要求 AI
> 每帧把 `s.target` 写回 `a.target`（见 `update()` 末尾）。

**4. 行为分派**（默认 `throttle = 0.85, ab = false`）

| 分支 | `desired` | 油门 |
|---|---|---|
| `evade` 且有 `msl` | `evade(a, s.msl, world)` | 1，`ab = dist < 2600` |
| `extend` | `norm(a.pos - nearestEnemy(a, world, 20000).pos)`，再强制 `y = 0.06` 拉平 | 1，加力 |
| drone 且长机在 | 长机编队槽位 | 落后 > 700 m 加力，否则 0.75 |
| drone 且长机没了 | 切向盘旋，`y = pos.y < 3200 ? 0.12 : -0.05` | 0.6 |
| wingman 且（无目标或 `spread`） | 编队槽位；有目标时改走 `leadTo` | 落后 > 900 m 加力，否则 0.7；接战 0.95 加力 |
| 有目标 | `pursue(a, s.target, world)` | 见 `pursue()` |
| 都没有 | 巡逻：`wander += dt*0.25`，`V(cos(wander), 0.02, sin(wander))` | 0.62 |

编队槽位用长机机体坐标（所以编队会跟着长机滚转和转向）：
`wp = lead.pos + lead.right*dx + lead.fwd*dz + (0, dy, 0)`。
`{dx, dy, dz}` 由 `missions.js` 的 `spawnWingman(w, idx, slotX, slotY, slotZ)` 传入：

| 任务 | 左僚机 | 右僚机 |
|---|---|---|
| M1 | (-170, 25, -260) | (170, 25, -260) |
| M2 | (-150, 12, -240) | (150, 12, -240) |
| M3 | (-190, 30, -300) | (190, 30, -300) |

`ai.js` 里的兜底默认值是 drone `{140, 25, -190}`、wingman `{120, 30, -180}`。

**5. 升限钳制（所有分支共用）**

```js
ceil = (a.ac && a.ac.ceiling) || 16000;
if (pos.y > ceil && dir.y > -0.08) {
  // 超了，压回来 —— **超得越多压得越狠**（最多 -0.45）
  over = min(1, (pos.y - ceil) / 1500);
  dir  = norm(V(dir.x, -0.22 - 0.23 * over, dir.z));
}
if (pos.y > ceil - 1200 && dir.y > 0.08) dir = norm(V(dir.x,  0.08, dir.z));  // 接近，不许抬头
```

> 固定 -0.22 在十七公里上是不够的：那里舵效只剩三成，"想压平"这个愿望
> 执行不出来，于是一架为了追高目标而爬上来的敌机会**一路爬上去**。
> 按超出量线性加强之后，超得越多压得越狠，配合 `smoke.js` 里那条
> 以 `ctrlFactor` 为判据的断言，敌机才会真的留在自己那一层。

**为什么要有它**：极高空 `q = ½ρv²` 掉到几千时操控权限只剩百分之十几。
实测把玩家钉在 20 500 m 40 秒后，追击的敌机会停在这样的状态：

```
ROK-27   17785 m   188 m/s   q=5793   ctrlFactor 0.26
VAC-14   17162 m   157 m/s   q=4061   ctrlFactor 0.18
```

它们没失速，但也没能上去 —— 悬在半空慢慢挪，咬不住人也甩不掉。
原来的 AI 只知道"y > 19000 就别抬太高（压到 0.35）"，
并不知道"再上去就没有机动能力了"，所以会一路硬顶。按机型给一条
实用升限之后，敌人会留在自己还有机动能力的高度层周旋。

**6. 撞地保护**

```js
if (pos.y < 420 && fwd.y < 0.05) {
  steerTo(a, norm(V(fwd.x, 0.5, fwd.z)), ctrl, a); throttle = 1; ab = true;
}
```

**7. 开火**

`evade` / `extend` 期间一律 `firingGun = false` 并返回；无目标同样返回。
**侦察 / 播撒构型**（`a.behavior === 'recon'`）在血量 ≥ 88% 前完全不还手 ——
它们是任务目标，不该像战斗机一样缠斗。

```js
// 机炮
gunRange = (a.pos.y > 18000 ? gunW.highRange : gunW.range);
gunCone  = 0.028 + (1 - skill) * 0.02;
a.firingGun = (dist < gunRange * 0.9 && off < gunCone * 3.2 && a.gunAmmo > 0);
```

开火时调 `Ent.fireGun(a, world)`，并按距离播敌方机炮声
（`SFX.gunShotAt`，内部采样节流）。别人开火的声音是刻意加的：
以前只有玩家自己的机炮有音效，AI 打出去的子弹**无声**，
而它们通常在视线的侧后方，于是玩家会以为"敌人从来不开炮"。

导弹的外层门槛是 `s.shootT <= 0 && dist < 7200`、`a.spAmmo > 0`、
`a.spCd <= 0`、武器 `kind === 'aam'`。四个条件都满足才发射：

1. **锁定锥**：`off < cone * 0.85`，`y > 18000` 时 `cone *= 0.8`（收窄 20%）
2. **锁定距离**：`dist < lockDist * lockK * resist`，其中
   `lockK = 1 - min(0.25, max(0, (y - 15000) / 40000))`（越高越难锁），
   `resist = t.lockResist ? 1 - t.lockResist : 1`（目标的干扰舱打折）
3. **最小距离**：`dist > (spW.nezer ? 1400 : 700)`
4. **意愿**：`Math.random() < 0.35 + skill * 0.45`

发射后冷却 `s.shootT = rnd(2.6, 5.2) * (1.6 - skill * 0.6)`，
即技能 0 → 4.16–8.32 s，技能 1 → 2.6–5.2 s。

---

## 规避与追击

**`evade(a, m, world)`**：把来袭弹放在 **3/9 线**，同时保能量。

```js
toM  = norm(m.pos - a.pos);
perp = norm(cross(toM, (0,1,0)));        // 退化时依次退到 (0,0,1) / (1,0,0)
side = sin(a.pos.x * 0.01 + a.pos.z * 0.013) > 0 ? 1 : -1;   // 位置定边，避免左右横跳
dive = dist < 900 ? -0.55 : -0.12;       // 太近就俯冲，把弹拖进稠密大气
dir  = norm(V(fwd.x*0.35 + perp.x*side*1.5, dive, fwd.z*0.35 + perp.z*side*1.5));
```

返回 `{dir, throttle: 1, ab: dist < 2600}` —— 俯冲时反而加油门保能量。
发现来袭弹时还会顺手放干扰弹（`s.flareT = 1.8` + `Ent.breakLock`）。

**`pursue(a, t, world)`**：`desired = leadTo(a, t)`，油门按距离
（> 2600 → 1 加力；< 800 → 0.55；否则 0.82），再做高度管理：

- `pos.y < 900 && fwd.y < 0` → 把 `desired.y` 顶到至少 0.25
- `pos.y > 19000 && desired.y > 0.35` → 压到 0.35（避免过度爬升损失动压）
- `fwd.y > 0.82 && speed < vStall * 1.5` → 强制 `V(fwd.x, -0.3, fwd.z)`，
  `ab = true, throttle = 1`（防止纯垂直爬升失速）

`leadTo()` 的提前量折扣是**固定 0.85**（与武器数据里的 `lead` 无关）：
`tGo = dist / max(60, a.speed); aim = t.pos + t.vel * tGo * 0.85`。

---

## 航线型单位（轰炸机）

带 `a.route` 的单位**完全不走**上面那套状态机 —— 没有目标选择、
没有追击、没有规避机动（`missions.js` M2 的 ROK-40）：

```js
a.route = {
  phase: 'ingress',
  wp: 投弹点, alt: 4300, arrive: 3000,
  exit: 脱离点, exitAlt: 6500,
  tailGun: 1700,
  onArrive: bombTheBase        // 到点要做的事
};
```

**三段**：`ingress`（进场）→ 到点触发 `onArrive`，把 `wp` 换成 `exit`、
`alt` 换成 `exitAlt` → `egress`（脱离）。飞完最后一段就 `alive = false`
自行消失，不会掉头回来再打一遍。

```js
desired = norm(r.wp - a.pos);
if (pos.y < alt - 150 && desired.y < 0.10)        desired = norm(V(desired.x,  0.34, desired.z));
else if (pos.y > alt + 150 && desired.y > -0.10)  desired = norm(V(desired.x, -0.28, desired.z));
steerTo(a, desired, a.ctrl, a);  a.throttle = 0.95; a.ab = false;
if (pos.y < 500 && fwd.y < 0) steerTo(a, norm(V(fwd.x, 0.4, fwd.z)), a.ctrl, a);   // 撞地拉起
```

**唯一的自卫是尾炮**：1700 米内挑最近的敌机，要求落入尾后锥
`dot(back, fwd) < -0.72` 且 `off < 0.30 rad`，才 `firingGun = true`
并调 `Ent.fireGun()`。**绝不为了开火改变航向**。

> 为什么不做成通用 AI：它们在战场上不是战斗单位，而是**事件**。
> 玩家要处理的不是"一个会缠斗的对手"，而是"一个正在飞向某处的进程"。

---

## 无人僚机（`role: 'drone'`）

与 `role: 'wingman'` 的差别不是参数，而是**有没有判断力**。
当前所有僚机都由 `spawnWingman()` 生成为 drone。它有三条铁律，
外加一套由长机指令（`cmd`）决定的授权规则 —— 见上文"目标选择"：

**1. 目标只能来自长机授权**

```js
var dLead = world.player;
s.target = (dLead && dLead.alive && dLead.target && dLead.target.alive)
  ? dLead.target : null;
```

长机没锁定，它就一弹不发。设定里它是"自己看不见任何东西，
全靠长机把目标参数喂过来"。

**2. 机动只跟编队位置有关** —— 即使拿到目标也**不追出去**，
永远待在编队槽位上，目标只用来决定"能不能打"。
它的价值在于替长机挡导弹、探路、把挂架打空，追出去就全没了。

**3. 长机阵亡后就地盘旋**

```js
var tan = a.right;
var climb = a.pos.y < 3200 ? 0.12 : -0.05;
desired = norm(V(tan.x, climb, tan.z));      // 取切向 → 持续转圈
```

不接管战局、不自主选目标。这不是能力不足，是它压根没有那套东西。

> `tools/smoke.js` 里有七项断言：未授权时无目标、授权后继承同一目标、
> 长机阵亡后不向敌人逼近、长机健在时不脱队，以及三档指令
> （`spread` 要自主接战、`cover` 要去咬威胁长机的那一架）与
> **数据链中断时的自主防御降级**（此时即便指令是 `spread` 也不开火）。
>
> 数据链中断来自 `suppressed` —— 被敌方干扰机的辐射场罩住时置位，
> 见 [game.md](game.md) 的 `updateJamming()`。这是设定 7.5
> "强对抗环境下数据链会被切断，无人机自动降级为完全自主防御模式"
> 那句在玩法上的落点。

---

## 技能等级

`AI.attach(a, { skill })`，0..1。`missions.js` 里敌机的默认值是 0.55。

| 影响 | 低技能 | 高技能 |
|---|---|---|
| 重选目标间隔 | 1.25 s | 0.35 s |
| 机炮散布锥 | 0.048 | 0.028 |
| 导弹发射意愿 | 35% | 80% |
| 发射冷却系数 | ×1.6（4.16–8.32 s） | ×1.0（2.6–5.2 s） |

现有数值：M1 测绘机 0.32、M1 VAC-14 护航 0.40、M2 伏击（头机 / 僚机）
0.72 / 0.50、M3 播撒机 0.25、M3 护航 0.6、
**干井（DRYWELL）0.96**（血量过半后提到 **1.0**）、无人僚机 0.62。

---

## 与玩家共用控制律的后果

好处是**手感一致**：敌人做机动的方式和玩家一样。代价是**改它要同时验证两边**：

- 滚转锁存依赖调用方传入的 `state`，AI 传机自己，玩家在 `game.js` 里传 `player`
- `st.aimMag` / `st.aimUpright` 只有玩家提供，AI 缺失时分别退化为
  `gain = 1, blend = 1, pushW = 0` 和 `a.up.y`
- `off * 2.3` 的饱和点同时影响玩家灵敏度和 AI 转向速率

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 转向力度 | `steerTo()` 里 `rollErr * 2.8`、`off * 2.3`、`yawErr * 1.6` |
| 滚转锁存阈值 | `steerTo()` 里 `2.55` |
| 鼠标满杆点 / 混合轴 / 推杆轴 | `AIM_FULL_MAG` / `AIM_BLEND_MAG` / `AIM_PUSH_AXIS` |
| 推杆锥边界与直立门槛 | `steerTo()` 里 `up < -0.5`、`upright > 0.7` |
| 规避触发距离（4.2 km） | `findIncoming()` 里的 `4200` |
| 脱离血量阈值 | `update()` 里 `a.hp < a.maxHp * 0.25` |
| 威胁警戒半径 | `nearestEnemy()` 调用处的 `15000` / `11000` / `9000` |
| 升限钳制 | `clampCeiling()` 里的 `1200` / `-0.22` / `0.08` |
| 编队槽位 | `missions.js` `spawnWingman()` 的调用参数 |
| 各机技能 | `missions.js` 各关 `spawn()` 里的 `skill` |
| 导弹最小发射距离 | `update()` 里 `spW.nezer ? 1400 : 700` |
