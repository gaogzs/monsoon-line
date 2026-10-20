# AI 行为

代码：`js/ai.js`（965 行）· 调用方：`js/missions.js` 的 `spawnEnemy()` / `spawnWingman()`、`js/game.js` 的 `updateMouseAim()`

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
| `AI.steerTo` | `(a, desired, out, st, dt?) → out` | 控制律；`out` 是 `{pitch, roll, yaw}`，就地写入后返回 |
| `AI.findIncoming` | `(a, world) → missile \| null` | 4.2 km 内、以本机为目标的敌弹 |
| `AI.nearestEnemy` | `(a, world, maxR) → actor \| null` | 最近敌机（按 `Ent.hostile`：0 与 1 互为敌，2 是中立、不算）；`maxR` 默认 16 000 m |
| `AI.leadTo` | `(a, t) → 单位方向` | 对目标的提前量指向（折扣固定 0.85） |
| `AI.strafeTarget` | `(a, t, world) → {dir, throttle, ab}` | 对地指向（当前只是 `leadTo` + 0.9 油门） |

`out` 的符号：`pitch > 0` 抬头、`roll > 0` 右滚、`yaw > 0` 右偏航。
`st` 可选，是存 `planAlpha` / `rollLock` / 瞄准角速度的容器；
AI 传飞机自己（`a`），玩家传 `player`。

---

## 控制律：沿一条弧的连续分配

### 0. 输入分解
`desired` 投到机体系：`fx / rx / ux`。离轴角 `θ = acos(fx)`，
目标在机体横截面上的方位 `φ = atan2(rx, ux)`（0 = 座舱正上方，±π = 机腹正下方）。
当前坡度 `bank = atan2(-right.y, up.y)`，以**镜头水平**为基准（追尾镜头不滚转，up 恒为世界 up）。

### 1. 每根轴此刻能转多快
与 `stepAircraft` 同一套公式，`auth = a.ctrlAuth`（上一帧的动压舵效 × 失速系数）：

    wP = phys.pitch × auth            推杆再 × 0.5
    wR = phys.roll  × clamp(auth × 1.8, 0.28, 1)
    wY = phys.yaw   × auth

没有 `phys` 的调用方按 `STEER_DEF_PHYS` 算。

### 2. 候选弧与代价
候选滚转 `δ(α) = δL + α·span`，`δL = −bank`（改回水平），`span = wrap(φ − δL)`，α ∈ [0, 1]：
α = 0 是"保持水平，推/拉杆 + 偏航"，α = 1 是"把目标滚到头顶，纯拉杆"。
只在这条弧上取，而不是整圈 —— 整圈里还有"往反方向滚、把目标放机腹下纯推杆"
那个解，它会让左下方的鼠标先右滚、再突然跳成左滚。

    cost(α, θ) = √(tr² + tp² + ty²) + λ(θ)·bankAfter² + 负 G 惩罚
      tr = |δ|/wR，tp = θ·cos(φ−δ)/wP（推杆用 0.5wP），ty = θ·|sin(φ−δ)|/wY × STEER_YAW_W
      λ(θ) = STEER_LAMBDA0 · exp(−θ/STEER_THETA0) · 机头水平分量

### 3. 不取 argmin，取交叉角
偏航比滚转慢一个量级，"滚一半靠偏航"永远最贵，代价面是两个盆地，argmin 会跳。
所以二分求 `θc`：`cost(0, θc) = cost(1, θc)`，然后

    α = smoothstep(clamp(θ/θc − 0.5, 0, 1))

α 对离轴角连续，交叉点由物理（各轴角速率、舵效）决定。目标接近机腹正下方
（|span| > 2.6）时用 `st.rollLock` 锁住滚转方向；α 每帧再按 `STEER_ALPHA_RATE` 平滑。

### 4. 执行
    roll  = clamp(δ · K_ROLL / wR, ±cap)       纯改平时 cap = 0.35（θ < 5° 渐变放开）
    pitch = θE·cos(φE − δ)·max(0, cos δ) · K_PITCH / wP
    yaw   = θE·sin(φE − δ)·max(0, cos δ) · K_YAW / wY
飞机没有转动惯量（杆量 = 角速率），所以"误差 × K ÷ 最大角速率"就是无过冲的一阶收敛。
`max(0, cos δ)`：还要滚 90° 以上时不拉不推。

### 5. 瞄准角速度前馈（只有玩家，传 `dt` 时启用）
`st.prevDesired` 求瞄准方向的角速度，低通 `STEER_RATE_TAU = 0.25 s`
（鼠标增量成块到达，一次轻推不能被当成急转），上限 1.6 rad/s。
规划用前瞻 1.2 s 的方向（决定要不要滚过去），执行用前瞻 `1/K_PITCH` 的方向（抵消稳态滞后，
持续转弯中机头也压在准星上）。AI 的 desired 会在分支间跳，不传 dt。

闭环实测（左下方拖动，稳态坡度）：4°/s → 0°，8°/s → −5°，10°/s → −29°，
12°/s → −79°，16°/s → −137°；机头误差 < 1°。断言见 `tools/smoke.js`。

### 玩家侧：战雷式瞄准（game.js）
鼠标**位移**（指针锁定）转动世界坐标里的 `aimYaw / aimPitch`（±89°），
追尾镜头跟瞄准方向而不跟机头，`updateMouseAim(dt)` 把它交给 `steerTo`。
HUD 中心是准星（CMD），青色标记是机头，二者之间有虚线；THR 带右侧的 FCS 三根表
显示飞控输出的 P / R / Y 杆量，底色是该轴此刻的可用权限。

---

## AI 状态：`attach(a, opt)`

| 字段 | 初值 | 含义 |
|---|---|---|
| `role` | `'enemy'` | `enemy` / `drone` / `wingman`；预警机由 `spawnAewc()` 改成 `support`（它带 `route`，不走状态机） |
| `skill` | 0.6 | 0..1，见「技能等级」 |
| `mode` | `'pursue'` | `pursue` / `evade` / `extend` |
| `modeT` | 0 | `extend` 剩余时间 |
| `evadeT` | 0 | 规避状态最短维持时间 |
| `msl` | null | 正在规避的导弹引用 |
| `flareT` | 0 | 干扰弹投放间隔 |
| `shootT` | 0 | 导弹发射冷却 |
| `burstT` | 0 | 机炮点射计时（当前未使用） |
| `ewResist` | 0 | 对敌方电子战的适应度（设定 7.3"对手也在学"），压低目标干扰对锁定距离的折扣 |
| `target` | null | 当前目标 |
| `retargetT` | `rnd(0, 1.2)` | 下一次重选目标的倒计时 |
| `formation` | null | 实际由 `missions.js` 传 `{dx, dy, dz}`（`attach` 的 `opt` 也接受它，只是文档化签名里没列） |
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
| `drone` + `focus`（默认） | 继承长机的目标；长机没锁定时打离自己 `WING_FREE_R`（6 km）内最近的敌机，仍守在编队槽位上；长机阵亡则不接战 |
| `drone` + `cover` | 优先打正在锁定长机的敌机（`leadThreat`）；没有时打离**长机** 6 km 内最近的敌机（`nearestEnemyTo`）；再没有退回长机目标 |
| `drone` + `spread` | 自主接战：`nearestEnemy(a, world, 9000)` |
| `wingman` + `focus` | 继承长机的目标 |
| `wingman` + `cover` | 同 `drone + cover`（共用 `leadThreat()`） |
| 其余（含 `enemy`） | 被主动雷达照射时优先咬照射者（12 km 内）；否则 `nearestEnemy(a, world, role === 'wingman' ? 11000 : 15000)`；**空中一个都没有时**，带得动对面弹的飞机转去挑面目标（`surfaceTargetFor`） |

**照射判定（RWR，`a.rwrT / a.rwrSrc`）**：敌对、`target === a`、挂主动雷达弹（`seeker === 'radar'`）才算照射；`silentLock` / `emcon` 不告警。
**玩家要锁满（`player.locked`）才算** —— 只是选中、锁定环还在走，对方收不到告警，可以贴近了再锁。以前选中即照射。AI 之间仍是"选中即照射"。

> **面目标（海上平台 / 地面设施）是后加的。** 在这之前 `nearestEnemy` 只扫
> `world.actors`，`world.targets` 对 AI 完全不存在 —— 所以"敌机来炸你的
> 前进基地"这件事在代码里根本没有落点，下游的随队攻击机只能是摆设。
> 判据与玩家锁定循环一致：0 与 1 互为敌，2 是中立（没人主动打它）。
>
> **空中也是同一条规矩**（`Ent.hostile(a, b)`）。v1.4.2 第一次把几架飞机改成中立之后，
> 空中选敌仍按"不同队即敌"，下游敌机会去追中立的潮线、潮线被打伤后还手 ——
> 看起来像敌人互相攻击。现在 `nearestEnemy`、`leadThreat`、尾炮、RWR、电子战
> 判定、玩家锁定循环、预警机报告全都走 `Ent.hostile`；弹丸碰撞**不**走它，
> 流弹仍会误伤中立。
>
> **机头过高的改出**：`fwd.y > 0.5` 且不想爬升时进入改出 —— 不滚转，正飞推杆、
> 倒飞拉杆，直到 `fwd.y < 0.2`（`s.vertRecover`）。没有这一段，冲过升限的敌机
> 会在一成多的舵效下边滚转边拉杆，挂在 15 公里上压不下机头。
> 只有真带着能用的对面弹（有导引头、还有弹）的飞机才会去挑，射程取
> 它自己那几件里最远的一件。

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
| 有目标（`target`） | `approachSurface(a, s.target)`：**保持高度**，只把机头转过去 | 0.9 |
| 有目标（飞机） | `pursue(a, s.target, world)` | 见 `pursue()` |
| 都没有 | 巡逻：`wander += dt*0.25`，`V(cos(wander), 0.02, sin(wander))` | 0.62 |

编队槽位用长机机体坐标（所以编队会跟着长机滚转和转向）：
`wp = lead.pos + lead.right*dx + lead.fwd*dz + (0, dy, 0)`。
`{dx, dy, dz}` 由 `missions.js` 的 `spawnWingman(w, idx, slotX, slotY, slotZ)` 传入：

| 任务 | 左僚机 | 右僚机 |
|---|---|---|
| M1 | (-220, 30, -320) | (220, 30, -320) |
| M2 | (-180, 14, -300) | (180, 14, -300) |
| M3 | (-190, 30, -300) | (190, 30, -300) |

（其余各关在同一量级，逐关见 `missions.js` 的 `spawnWingman` 调用；
M8 的 `dz` 是 **+320**，僚机排在长机前方。）

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

**没有机炮的机型**（数据里 `gun: null`：ROK-40 / 鹈鹕 / 石英）只跳过
机炮这一段，`firingGun` 保持 `false`，然后**照常进入导弹段**。

这里走过两次弯路：最早直接读 `WEAPONS[a.gun].range`，无炮飞机一到开火段
就抛异常；后来改成 `if (!gunW) return`，异常没了，却把下面的导弹段一起截掉
—— M5 的巡航弹载机（`lcm`）、M8 的轰炸机（`dl4` / `vbn`）挂着弹，
一发都没打出去过。**不要再在机炮段里 `return`。**

注意：沿 `route` 飞的飞机（M2 的轰炸机、各关的干扰机）在 `updateRoute()`
就返回了，根本不进开火段，不受这条影响。

开火时调 `Ent.fireGun(a, world)`，并按距离播敌方机炮声
（`SFX.gunShotAt`，内部采样节流）。别人开火的声音是刻意加的：
以前只有玩家自己的机炮有音效，AI 打出去的子弹**无声**，
而它们通常在视线的侧后方，于是玩家会以为"敌人从来不开炮"。

先挑弹，再看外层门槛 `s.shootT <= 0`、`a.spAmmo > 0`、`a.spCd <= 0`，
然后以下条件都满足才发射：

1. **挑一件武器**：`Ent.chooseWeapon(a, t, dist)` —— 先看**目标类别**
   （目标物 `kind === 'target'` 算"对面"，其余算"空中"，判据与玩家的
   `targetMismatch` 同源），再看**射程**：够得着的里面取射程最短的那件
   （用远距弹打格斗距离是浪费），都够不着就取最接近的。装填中的垫底，
   无制导弹（炸弹 / 火箭巢）不参与 —— AI 没有投弹瞄准逻辑。
   挑中谁就 `Ent.setWeapon(a, pick)`，也就是"AI 换武器"的全部：
   **没有独立的选弹状态**，只有每次开火前的一次挑选
2. **锁定锥**：`off < cone * 0.85`，`off = Ent.lockOff(a, t, w)`（对面弹只量水平方位），`y > 18000` 时 `cone *= 0.8`（收窄 20%）
3. **锁定距离**：`dist < Ent.aiReach(w, y) * lockK * resist`（`aiReach = min(lockDist, effRange × 0.9)`，见 [entities.md](entities.md)；以前直接用 `lockDist`，BOX-14 这类标称比飞得远的弹会在射程外放），其中
   `lockK = 1 - min(0.25, max(0, (y - 15000) / 40000))`（越高越难锁），
   `resist = t.lockResist ? 1 - t.lockResist : 1`（目标的匿踪与被动吊舱抗锁定合并后的缩短比例，由 `Ent.setStealth` 写入）；
   目标正在主动干扰（`t.ewPower > 0`）**且本弹是雷达制导**时再乘
   `1 - ewPower × ewLockReduce × (1 - s.ewResist)` —— 红外弹不吃雷达干扰
4. **最小距离**：`dist > (spW.nezer ? 1400 : (对面目标 ? 1200 : 700))`
5. **意愿**：`Math.random() < 0.35 + skill * 0.45`

> 这里以前写的是 `dist < 7200 && kind === 'aam'` —— 一刀切是对空弹时代
> 的写法（那时所有 AI 弹的 `lockDist` 都 ≤ 7200）。改成逐件判之后，
> 远距弹（CLA-17 的 12.5 km）与对地弹的投放包线才各按各的来。

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
  onArrive: bombTheBase        // 到点要做的事
};
```

**分段型**（`route.legs`，`js/route.js` 的 `Route.plan(legs, {jam})`，在 `combat.js` 之后加载）：
`updateRoute` 先调 `Route.step`，它只决定"往哪飞、多高、要不要开火"，结果写回 `route.wp / route.alt`；转向与高度保持仍走下面那套。
无 `legs` 的旧单段写法不变。

| 段 | 字段 | 行为 |
|---|---|---|
| `goto` | `wp, alt, arrive`（缺省 2000） | 水平距离 < arrive 即下一段 |
| `strike` | `weapon, pick, rangeK`（缺省 0.8）`, alt, shots, timeout` | 挑一个该武器能打的敌方目标（`pick`：`nearest` 缺省 / `biggest` / `function(t,a)→分数`），保持 alt 飞去；`dist < Ent.aiReach(w, alt, rangeK)` + `Ent.lockOff` 在锁定锥内 + 武器就绪才发射，**只发 `weapon` 这一件**；发满 shots 下一段；目标死了换一个，一个都没有就跳过；超 timeout 放弃 |
| `call` | `fn(a, world)` | 执行一次，立刻下一段 |
| `loiter` | `a, b, alt, time, until, jam` | a↔b 来回飞，time 到或 until 为真下一段，都不给就永远盘旋 |
| `egress` | `wp, alt` | 到点离场消失（escaped） |

`plan` 级 `jam` 整条航线生效（飞往站位途中也开机），`loiter` 段的 `jam` 可覆盖。已改用分段的：m2 轰炸机（goto → call bombTheBase → egress；尾炮是炮塔，见 turret.md）、m5 巡航（goto → call 播无线电 → egress）、m8 轰炸机（strike vsr，rangeK 0.8、alt 4500、timeout 150 → egress）、`jammerRoute`（goto → loiter，plan 级 jam）。

**盘旋型**（`route.loiter: true`，预警机，`missions.js` 的 `spawnAewc()`）：
到点后 `wp` 与 `exit` 互换，在两点之间来回飞、永不退场 —— 击落是唯一让它
消失的方式。轰炸机是**事件**，预警机得一直在那儿看着。

**巡视型**（`route.wps`，m5 的管理局勤务机 MERLI「水准」）：一串航点
`{ wps: [V…], wpIdx, wp, alt, arrive }`。到点就 `wpIdx = (wpIdx + 1) % wps.length`、
`wp = wps[wpIdx]`、`alt = wp.y`（每个航点自带高度），有 `onArrive` 就调一次；
飞完一圈从头再来，永不退场。到点判定里它**先于** `loiter` 检查。
m5 的航点是单元编组中心、比编组基准高度低 1500 m，见 [missions.md](missions.md#调节单元阵列-spawncellfield)。

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

> **已知问题：尾炮实际上打不出去，而且它不是炮塔。**
>
> 三重原因，任何一条单独发生都足以让它失效：
>
> 1. **角度判据自相矛盾**：尾后锥要敌机在正后方（夹角 >136°），
>    紧接着的开火条件 `angleBetween(a.fwd, 指向敌机) < 0.30` 却要求
>    敌机在正前方 17° 内 —— 两个条件不可能同时成立。
> 2. **`fireGun` 没有方向参数**：弹丸方向写死 `a.fwd`、炮口在
>    `a.pos + fwd*6`（机头）。就算放开角度，它也是朝前打。
> **已解决（v2.2 阶段 3）**：尾炮整段删掉，改成 ROK-40 的 `mounts` 里一门没有实体的 `tail20` 炮塔
> （`js/turret.js`，管后半球），由 `game.js` 每帧 `Turret.stepAll` 驱动，不影响航向。`route.tailGun` 已删除。见 [turret.md](turret.md)。

> 为什么不做成通用 AI：它们在战场上不是战斗单位，而是**事件**。
> 玩家要处理的不是"一个会缠斗的对手"，而是"一个正在飞向某处的进程"。

---

## 水面 / 地面目标的对空射击（`game.js`）

带 `t.weapon` 的设施与舰船不走 `ai.js`，由 `game.js` 的 `updateTargets(dt)` 每帧处理：
`fireCd` 走完后调 `pickTargetFor(t, w)` 选目标，再 `Ent.makeMissile`（朝目标方向偏上 260 m 出筒，
初速 140，弹的 `team` = 发射者阵营），`fireCd = w.cd + rnd(0, 2)`。

| 发射者 | 选谁 |
|---|---|
| team 1（敌方） | **玩家优先**：在 `lockDist × (1 − player.lockResist)` 内，且 `world.detected` 或"低空突防被目视发现"（地面目标、玩家低于 `dangerAltitude`、5.2 km 内）。玩家不合格时，**已被发现**才转打 `lockDist` 内最近的我方飞机（僚机 / 无人机）；未被发现前不打僚机 —— 一开火就等于自己暴露 |
| team 0（我方，如带 `ss6` FAN-6 的驱逐舰） | `lockDist` 内最近的非本方、非中立飞机；**永远不选玩家** |
| team 2（中立，如 SKORI） | 从不开火（`updateTargets` 直接跳过） |

- 命中与近炸按 `m.team` 过滤，所以我方舰艇的弹伤不到玩家与僚机。
- **"发射！"无线电与 `SFX.missileFar()` 只在 `tgt === player` 时触发**；
  告警音 / RWR 由主循环按 `m.target` 判，打僚机的弹不会让玩家听到告警。
- 舰艇打下的敌机记在 `world.shipKilled`，僚机 / 无人机打下的记在 `world.wingKilled`；
  两者在战报里合并成「友军击落」一行，**不进** `world.killed`（综合评定只算玩家自己的），也不弹 `KILL` 提示。
  击杀者来自 `Ent.kill` 写的 `killedBy`（被打残后坠海的取 `lastHitBy`），归属判定在 `game.js` 的 `killCredit()`。
- 断言入口：`Game.__updateTargets`（`smoke.js` 用它单推一帧，确认我方舰艇不朝玩家打）。

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

现有数值（举例，全部见 `missions.js`）：M1 测绘机 0.32、护航 0.40、
第二波 0.62、播撒机 0.30；M2 伏击（头机 / 僚机）0.72 / 0.50、ROK-40 0.30；
M3 播撒机 0.25、护航 0.58–0.72、
**冬港（WINTERPORT）0.96**（血量过半后提到 **1.0**）、无人僚机 0.62。

---

## 与玩家共用控制律的后果

好处是**手感一致**：敌人做机动的方式和玩家一样。代价是**改它要同时验证两边**：

- 滚转锁存依赖调用方传入的 `state`，AI 传机自己，玩家在 `game.js` 里传 `player`
- 瞄准角速度前馈只在传 `dt` 时启用 —— 只有玩家传，AI 不传
- 代价参数（`STEER_*`）与执行增益（`K_*`）同时影响玩家手感和 AI 转向

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
| 面目标搜索半径 | `surfaceTargetFor()` 里取"自己最远那件对面弹的 `aiReach × 1.15`"（旧：`lockDist`） |
| 分段航线 | `js/route.js`（`ARRIVE`、段缺省值） |
| 挑弹规则（类别 + 射程） | `entities.js` `chooseWeapon()` |
| 对地目标的接近角 | `approachSurface()` 里的 `-0.06`（远）/ `-0.02`（近） |
| 升限钳制 | `clampCeiling()` 里的 `1200` / `-0.22` / `0.08` |
| 编队槽位 | `missions.js` `spawnWingman()` 的调用参数 |
| 各机技能 | `missions.js` 各关 `spawn()` 里的 `skill` |
| 导弹最小发射距离 | `update()` 里 `spW.nezer ? 1400 : (对面目标 ? 1200 : 700)` |
