# AI 行为

代码：`AI`（`js/engine/ai/*.js`）· 调用方：`js/missions/` 的 `spawnEnemy()` / `spawnWingman()`、`Game` 的 `updateMouseAim()`（`engine/game/control.js`）

> **批次 5a（未发版）**：`AI.update` 拆成 感知 → 决策 → 机动 → 开火 四层（`brain.js` 的 `perceive / decide / maneuver / fire`）；新增 `skill.js`（`AI.SKILL` 参数表、私有随机流）、`director.js`（目标分配、武器分类）、`retreat.js`（撤离）。见本文末「批次 5a」。
>
> v3.0.0 起 `AI` 不再是一个闭包，而是四个按职责命名的文件（私有状态走 `AI.$`，公开接口集中在 `ai/zz-api.js`，规则见 [modules.md](modules.md)）：
> `util.js`（索敌与工具：`findIncoming` / `nearestEnemy` / `nearestEnemyTo` / `surfaceTargetFor` / `approachSurface` / `leadThreat`）、
> `steer.js`（控制律 `steerTo` 与 `STEER_*` / `K_*` 常数）、
> `brain.js`（`attach` / `update` 主决策、`updateRoute`、`clampCeiling`、开火与干扰逻辑）、
> `tactics.js`（`pursue` / `evade` / `leadTo` / `strafeTarget` / `aiEnvelope`）。
> 下文提到的函数按此归位，不再逐个标文件。

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
| `AI.update` | `(a, dt, world)` | 每帧决策 + 操纵 + 开火；带 `a.route` 的单位转 `updateRoute()`（`brain.js` 内部函数，不对外导出） |
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
12°/s → −79°，16°/s → −137°；机头误差 < 1°。断言见 `tools/test/smoke.js`。

### 玩家侧：战雷式瞄准（Game，`engine/game/control.js`）
鼠标**位移**（指针锁定）转动世界坐标里的 `aimYaw / aimPitch`（±89°），
追尾镜头跟瞄准方向而不跟机头，`updateMouseAim(dt)` 把它交给 `steerTo`。
HUD 中心是准星（CMD），青色标记是机头，二者之间有虚线；THR 带右侧的 FCS 三根表
显示飞控输出的 P / R / Y 杆量，底色是该轴此刻的可用权限。

---

## AI 状态：`attach(a, opt)`

> `ai.leader`（v3.5.0，可选）：僚机—长机关系，指向长机飞机。目前只被整备点读（`Resupply.leaderOf`：有长机的飞机不自主整备，长机整备时僚机一同补给）；僚机的跟随行为仍读 `world.player`，批次 5 做长机泛化时再统一。没写 `leader` 的 `role: 'drone'` 默认跟玩家。

| 字段 | 初值 | 含义 |
|---|---|---|
| `role` | `'enemy'` | `enemy` / `ally`（友军自主战斗机，批次 5a）/ `drone`（`drone` 是 AI 角色，与机型标签 `tags.unmanned` 是两回事；战果归属等处读的是后者）；预警机由 `spawnAewc()` 改成 `support`（它带 `route`，不走状态机）；`support` 且**没有** `route` 的是战略制空支援机（批次 6.4，见下文「战略制空支援机」），走 `ai/support.js` |
| `skill` | 0.6 | 0..1，见「技能等级」 |
| `rank` | `null` | 位格 `rookie / pawn / elite / ace`（`RANKS`），决定缺省 skill 与撤离概率系数 |
| `mode` | `'pursue'` | `pursue` / `evade` / `extend` / `standoff` / `closeIn` / `retreat` |
| `modeT` | 0 | `extend` 剩余时间 |
| `evadeT` | 0 | 规避状态最短维持时间 |
| `msl` | null | 正在规避的导弹引用 |
| `flareT` | 0 | 干扰弹投放间隔 |
| `shootT` | 0 | 导弹发射冷却 |
| `burstT` | 0 | 机炮点射计时（当前未使用） |
| `ewResist` | 0 | 对敌方电子战的适应度（设定 7.3"对手也在学"），压低目标干扰对锁定距离的折扣 |
| `target` | null | 当前目标 |
| `retargetT` | `rnd(0, 1.2)` | 下一次重选目标的倒计时 |
| `formation` | null | 实际由 `js/missions/` 传 `{dx, dy, dz}`（`attach` 的 `opt` 也接受它，只是文档化签名里没列） |
| `wander` | `rnd(0, 6.28)` | 巡逻用的相位 |
| `cmd` | `'focus'` | 僚机指令 `focus` / `cover` / `spread`。缺省为最保守的 `focus`；无人机母舰的回收用第四个值 `recall`（只有机库写，玩家按键不产生） |
| `leash` | 0 | 批次 6：**AI 长机**的无人机自选目标的范围（m）；0 = 缺省 `$.LEASH_R`（8 km）。见「无人僚机」的「长机是 AI 时」 |

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

**规避策略**（`evade.js`，skill ≥ 0.4；`SKILL.evade = clamp((skill−0.35)/0.55)`；低于 0.4 回退到 `tactics.js evade()` 里的"3/9 线 + 俯冲"基线）：每枚来袭弹按「导引头类型 × 距离 / TTI × 自身态势 × 技能 × 性格 `evW`」加权抽一个策略（私有 LCG，只在选 / 换时抽），执行 1.1–2.2 s 后重选；换弹、或进出末段（1.5 km）时立即重选。`?debug=ai` 机头标 `EVADE:<策略>`。
- `beam`：3/9 线（雷达弹基线）；`beamOwner`：对半主动弹，相对**发射机**放 3/9 线，让它的锥追不上（权重 ×3）；
- `climb`：拉起爬升，红外弹首选，不开加力（稀薄空气里导弹转弯率下降，且热信号小）；
- `dive`：俯冲换速度（离地 > 2.5 km）；
- `jink`：横向蛇行，每 0.5–0.9 s 换侧并上下起伏，打乱一阶提前量；> 2.5 km 的远距权重更高；
- `run`：背向来袭弹全速跑，只在弹在身后、且已掉速到 < 1.4 倍我速时入选（刚出膛还在加速的弹跑不掉）；
- `corkscrew`：绕视线轴螺旋滚转（k ≥ 0.6，0.9–3.3 km；光电弹权重最高，因为诱饵对它无效）；
- `breakIn`：末段（< 1.5 km，k ≥ 0.45）朝来袭弹方向 + 侧向硬转，LOS 角速度骤增，弹转不过来；
- `splitS`：半滚倒转俯冲（k ≥ 0.7、离地 > 3.5 km、< 2 km）。
- **光电 / 激光弹**（`flare` 概率 0）：技能够（`SKILL.evade > 0`）的 AI 不再白放诱饵（`$.flareUseless`），只靠机动；低技能照放。
- **性格 `evW`**：激进多 `breakIn / corkscrew`、少 `run`；谨慎多 `run / climb / dive`、少 `breakIn`；狙击多 `run / climb`、少 `jink`。
- **实测**（`probe-evade` E 段）：高技能 AI 被红外弹打的存活率明显高于低技能；纯机动（不放诱饵）在近距几乎躲不掉，**诱饵仍是主要防线**，策略的价值在于远距把弹甩丢 + 配合诱饵。

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
| `drone` + `cmd === 'recall'` | `s.target = null`：只飞回舰尾槽位，不接战（排在数据链中断之后、长机类型判断之前） |
| `drone` 且长机是 AI（`$.aiLed`） | 不分命令：`$.leashTarget`，在长机周围 leash 范围内自选目标，见「无人僚机」 |
| `drone` + `focus`（默认） | 继承长机的目标；长机没锁定时打离自己 `WING_FREE_R`（6 km）内最近的敌机，仍守在编队槽位上；长机阵亡则不接战 |
| `drone` + `cover` | 优先打正在锁定长机的敌机（`leadThreat`）；没有时打离**长机** 6 km 内最近的敌机（`nearestEnemyTo`）；再没有退回长机目标 |
| `drone` + `spread` | 自主接战：`nearestEnemy(a, world, 9000)` |
| 其余（含 `enemy`） | 被主动雷达照射时优先咬照射者（12 km 内）；否则 `director.pick(a, world, 15000)`（批次 5a；无同队盯着的、非 ally 时等价于最近敌机）；**空中一个都没有时**，带得动对面弹的飞机转去挑面目标（`surfaceTargetFor`） |

**照射判定（RWR，`a.rwrT / a.rwrSrc`）**：敌对、`target === a`、挂主动雷达弹（`seeker === 'radar'`）才算照射；`silentLock`（标签 `w.tags.silentLock`，被动吊舱汇总进 `a.silentLock`）/ `emcon` 不告警。无人僚机的目标选择里，只有**它自己**被压制（`suppressed > 0.35`）才会放弃目标、只规避不开火；长机电磁静默或被压制只是下不了令，僚机照旧按现有指令攻击。
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
| drone 且长机在（玩家长机，或 AI 长机但没有目标） | 长机编队槽位（`recall` 时站位改为长机正后 240 m、上 25 m） | 落后 > 700 m 加力，否则 0.75 |
| drone 且长机是 AI、`cmd !== 'recall'`、手上有活目标 | 不进上一行：放行到下面通用的 `pursue` / 面目标分支去追 | 见 `pursue()` |
| `support` 且无 `route` | `supportDir`（`ai/support.js`），见「战略制空支援机」 | 由 `supportDir` 给（脱离 1 + 加力 / 到位后 0.7 等） |
| drone 且长机没了 | 切向盘旋，`y = pos.y < 3200 ? 0.12 : -0.05` | 0.6 |
| 有目标（`target`） | `approachSurface(a, s.target)`：**保持高度**，只把机头转过去 | 0.9 |
| 有目标（飞机） | `pursue(a, s.target, world)` | 见 `pursue()` |
| 都没有 | 巡逻：`wander += dt*0.25`，`V(cos(wander), 0.02, sin(wander))` | 0.62 |

编队槽位用长机机体坐标（所以编队会跟着长机滚转和转向）：
`wp = lead.pos + lead.right*dx + lead.fwd*dz + (0, dy, 0)`。
`{dx, dy, dz}` 由 `js/missions/` 的 `spawnWingman(w, idx, slotX, slotY, slotZ)` 传入：

| 任务 | 左僚机 | 右僚机 |
|---|---|---|
| M1 | (-220, 30, -320) | (220, 30, -320) |
| M2 | (-180, 14, -300) | (180, 14, -300) |
| M3 | (-190, 30, -300) | (190, 30, -300) |

（其余各关在同一量级，逐关见 `js/missions/` 的 `spawnWingman` 调用；
M8 的 `dz` 是 **+320**，僚机排在长机前方。）

`AI` 里的兜底默认值是 drone `{140, 25, -190}`。

**5. 升限钳制（所有分支共用）**

```js
ceil = Ent.ceilingEff(a);          // min(数据升限, 失速升限)，见 flight-model.md「失速速度随动压变化」
if (pos.y > ceil && dir.y > -0.08) {
  // 超了，压回来 —— **超得越多压得越狠**（最多 -0.45）
  over = min(1, (pos.y - ceil) / 1500);
  dir  = norm(V(dir.x, -0.22 - 0.23 * over, dir.z));
}
if (pos.y > ceil - 1200 && dir.y > 0.08) dir = norm(V(dir.x,  0.08, dir.z));  // 接近，不许抬头
```

> 固定 -0.22 在十七公里上是不够的：那里舵效只剩三成，"想压平"这个愿望
> 执行不出来，于是一架为了追高目标而爬上来的敌机会**一路爬上去**。
> 按超出量线性加强之后，超得越多压得越狠，配合 `tools/test/smoke.js` 里那条
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
（`SFX.gunShotAt`，`engine/audio.js`，内部采样节流）。别人开火的声音是刻意加的：
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

### 战区边界软转向（`arenaSteer`，v3.5.0）

`update` 里期望方向算完、`clampCeiling` 之后、交给 `AI.steerTo` 之前调一次 `arenaSteer(a, desired, world)`（`engine/ai/brain.js`）。
只改期望方向的**水平**分量（俯仰照旧），朝战区中心拉：

- **缓冲带（v3.6.3）**：警告区外再宽一圈（`ARENA_BUFFER_K = 2.2` × warn），朝外飞的 NPC 提前被拉回（权重 `ARENA_BUFFER_W = 0.5 × (深入度)²`，朝里飞的不管；真撤离不受影响），警告区内权重不低于 `ARENA_BUFFER_W`（与缓冲带衔接）。原因：NPC 没有特别理由就不该把缠斗中的玩家一路带出界。
- 权重 `w = min(1, depth × ARENA_PULL_K)`（`ARENA_PULL_K = 1.8`，深度到约 55% 就取满），越界取满。起拉要早：高空低动压时转弯半径大，等权重涨起来再掉头就来不及。
- 规避中（`mode === 'evade'`）在**警告区内**权重减半 —— 躲导弹优先；越过真边界就不再让步。
- 无人机（`'drone'`）跟着长机，不单独处理；航线型单位走 `updateRoute`，根本不经过这里（沿航线飞出去的轰炸机不受影响）。
- **机头背着中心冲出去时**期望方向正对机尾，`steerTo` 没有明确的转弯侧，只会沿竖直面拉杆爬升而不转弯（操纵量在 ±1 之间抖动）。所以往靠中心的一侧连续偏转：偏量随"机头与回中心方向的夹角"从 0（≤ 90°）加到 1.5（正相反），转弯侧记在 `s.arenaSide`，**整个出界期间固定**，回到界内才清零——两侧来回切会让操纵抖动。

`probe-arena.js` 有对照：脱离模式（朝远离玩家的方向一路向外飞）的敌机，无软转向越界 33 s、最远 15 km，开了之后 0 s。

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
- `fwd.y > 0.82 && speed < Ent.vStallAt(a) * 1.5`（当前高度、含挂载折算的失速速度） → 强制 `V(fwd.x, -0.3, fwd.z)`，
  `ab = true, throttle = 1`（防止纯垂直爬升失速）

`leadTo()` 的提前量折扣是**固定 0.85**（与武器数据里的 `lead` 无关）：
`tGo = dist / max(60, a.speed); aim = t.pos + t.vel * tGo * 0.85`。

---

## 航线型单位（轰炸机）

带 `a.route` 的单位**完全不走**上面那套状态机 —— 没有目标选择、
没有追击、没有规避机动（`js/missions/` M2 的 ROK-40）：

```js
a.route = {
  phase: 'ingress',
  wp: 投弹点, alt: 4300, arrive: 3000,
  exit: 脱离点, exitAlt: 6500,
  onArrive: bombTheBase        // 到点要做的事
};
```

**分段型**（`route.legs`，`js/engine/route.js` 的 `Route.plan(legs, {jam})`，在 `engine/combat.js` 之后加载）：
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

**盘旋型**（`route.loiter: true`，预警机，`js/missions/` 的 `spawnAewc()`）：
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
> （`js/engine/turret.js`，管后半球），由 `Game`（`engine/game/update.js`）每帧 `Turret.stepAll` 驱动，不影响航向。`route.tailGun` 已删除。见 [turret.md](turret.md)。

> 为什么不做成通用 AI：它们在战场上不是战斗单位，而是**事件**。
> 玩家要处理的不是"一个会缠斗的对手"，而是"一个正在飞向某处的进程"。

---

## 水面 / 地面目标的对空射击（`Game`）

带 `t.weapon` 的设施与舰船不走 `AI`，由 `Game` 的 `updateTargets(dt)`（`engine/game/combat.js`）每帧处理：
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
  击杀者来自 `Ent.kill` 写的 `killedBy`（被打残后坠海的取 `lastHitBy`），归属判定在 `Game` 的 `killCredit()`（`engine/game/finish.js`；玩家方 `tags.unmanned` 的无人僚机击杀记入玩家战果）。
- 断言入口：`Game.__updateTargets`（`tools/test/smoke.js` 用它单推一帧，确认我方舰艇不朝玩家打）。

---

## 无人僚机（`role: 'drone'`）

与 `role: 'ally'`（自主友军战斗机）的差别不是参数，而是**有没有判断力**。
**长机泛化**（批次 6.1）：无人机跟谁由 `ai.leader` 决定，没写就是玩家（`$.leaderOf(s, world)`）。长机可以是飞机，也可以是舰船（`world.targets` 里的 target）——舰船的 `right` 不维护、`speed` 恒为 0、没有 `.target`，所以编队 / 取目标一律走 `util.js` 的访问器 `$.leadRight`（舰船现算 `fwd × up`）、`$.leadSpeed`（舰船取 `|vel|`）、`$.leadTarget`（缺失当 null，回退到 `nearestEnemy`）。**退化规则不变**：只有无人机自己 `suppressed > 0.35` 才退化为只规避不开火，长机被压制不连带；长机死了走"盘旋"分支。无人机由 `spawnDrone(w, leader, o)`（`js/missions/_lib.js`）生成：team 跟长机、不写 `world.wings` / `wingIdx`（玩家 1/2/3 命令只对 `spawnWingman` 的僚机有效）、同队同时存活上限 `MAX_DRONES = 24`（满了返回 null）。探针 `probe-drones`。
当前玩家的僚机由 `spawnWingman()` 生成为 drone（敌方 / 友方有人机的无人僚机用 `spawnDrone`）。它有三条铁律，
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

**长机是 AI 时**（批次 6，母舰放出的无人机、AI 长机的僚机）：三条铁律里的"目标只来自授权"与"不追出去"在这里放宽，三档指令（focus / cover / spread）也不存在——那是玩家给僚机下的令。判定是 `util.js` 的 `$.aiLed(s, world)`（长机在、活着、不是玩家）。行为只有两种：

- **巡航**：没有目标时守长机的编队槽位（与玩家长机的槽位机动同一段代码）。
- **战斗**：`$.leashTarget(a, s, lead, world)` 在长机周围 `s.leash`（缺省 `$.LEASH_R` = 8 km）范围内自己选目标，选到就走通用的 `pursue`（面目标走面目标分支）自由追击。已在追的目标放宽到 **1.4 × R** 才放弃（滞回，免得在圈边来回切换）；没有空中目标时，带得动对面弹的才找面目标（`surfaceTargetFor`），同样要在长机 R 以内。目标丢了 / 跑出圈就回到槽位。
- 同一型无人机从母舰放出，防御与出击的区别只是 `leash` 大小：机库数据 `hangar.leash` 或关卡的 `hangarLeash` 覆盖（小 = 防御母舰，大 = 出击）；`spawnDrone` 的 `o.leash` 写进 `ai.leash`。
- 回退不变：自己被压制（`suppressed > 0.35`）只规避不开火；`cmd === 'recall'` 只飞回舰尾不接战；长机阵亡走"盘旋"。优先级是 压制 → 回收 → AI 长机 leash → 玩家三档指令。
- **玩家长机的僚机**（`spawnWingman`）完全不变：仍是 focus / cover / spread 三档与"不追出去"。
- 机库（`missions/_lib.js` 的 `tickHangar`）放飞时从甲板弹射（见 [entities.md](entities.md) 的 `deck.js`）；弹药池打空或血量 < 35% 的无人机被设为 `recall`，飞回舰尾槽位（舰后 240 m）收回。

> `tools/test/smoke.js` 里有七项断言：未授权时无目标、授权后继承同一目标、
> 长机阵亡后不向敌人逼近、长机健在时不脱队，以及三档指令
> （`spread` 要自主接战、`cover` 要去咬威胁长机的那一架）与
> **数据链中断时的自主防御降级**（此时即便指令是 `spread` 也不开火）。
>
> 数据链中断来自 `suppressed` —— 被敌方干扰机的辐射场罩住时置位，
> 见 [game.md](game.md) 的 `updateJamming()`（`engine/game/lock.js`）。这是设定 7.5
> "强对抗环境下数据链会被切断，无人机自动降级为完全自主防御模式"
> 那句在玩法上的落点。

---

## 战略制空支援机（`role: 'support'`，`ai/support.js`，批次 6.4）

`role === 'support'` 且没有 `a.route` 的飞机（预警机也是 `support`，但带 `route`，走 `updateRoute`，不进这里）。它不是战斗机：不追人、不咬尾、不开机炮，价值在远处。`brain.js` 里 `maneuver` 的该分支调 `$.supportDir`，开火处（`fire`）直接转到 `$.supportFire`，不走通用开火门限。参数集中在 `AI.$.SUPPORT`（`SUP_K`）。

- **机动 `supportDir`**：锚点 = 友方战斗机质心**后方**（远离离质心最近的敌机）`D0…D1` = 12–18 km 的某个距离（每机生成时随机一次）；友机质心只取离自己 `FRIEND_R` 60 km 内的同队 `enemy / ally / 玩家`（不含自己、无人机、其他支援机，附近一架都没有就取最近的一架）。离锚点 > `ARRIVE` 3.5 km 就飞过去（> 20 km 满油门，> 30 km 开加力），到位后绕锚点盘旋；友机全没了就原地盘旋。巡航高度 `ALT` 8 km，低了缓慢爬升。
- **脱离**：任一敌机逼近到 `THREAT_R` 12 km，就掉头全速（加力）拉开，至少持续 `THREAT_T` 8 s；脱离期间照样齐射。来袭导弹走通用的 `evade`，优先于这里。
- **齐射 `supportFire`**：首次等待 6–10 s（`FIRST`），之后每 `T0…T1` = 25–40 s 一次；一次 `N0…N1` = 3–4 发，对**不同**的敌机各放一发（候选 = 锁得住 `jamLockOK`、且手上有够得着的空空弹的敌机，按距离从近到远；目标不够就轮着打）。选弹 `pickWeapon`：空空弹、对得上目标、射程（`aiReach × jamLockK`）够、发射槽不在装填，射程最远的优先；半主动弹（`sarh`）只给第一个目标（照射机同一时刻只能照一个）。没有可打目标时 `RETRY` 3 s 后再看。`s.mode === 'evade'` 时不放。
- **被压制**：齐射间隔按 `1 + JAM_SLOW(1.5) × suppressed` 拉长；锁定距离折半由 `jamLockK / jamLockOK` 管。
- **干扰场**：不在这里。机型数据的 `ewField`（如黑曜岩 `{ wid: 'vsc', R: 18000 }`）由 `spawnEnemy` 转成 `ai.jam`（带 `R`），走 `brain.js` 的 `jamAuto`，`J.R` 覆盖武器的 `jamRadius`；开机时记 `a.ewFieldR`。机型的接战构型不变。
- **与技能系统**：`SKILL.standoff` 排除 `support`（和 `drone` 一样不进外围游走，它有自己的机动）；随机性格不给 support 抽。探针 `probe-support`。

---

## 技能等级

`AI.attach(a, { skill })`，0..1。`js/missions/` 里敌机的默认值是 0.55。

| 影响 | 低技能 | 高技能 |
|---|---|---|
| 重选目标间隔 | 1.25 s | 0.35 s |
| 机炮散布锥 | 0.048 | 0.028 |
| 导弹发射意愿 | 35% | 80% |
| 发射冷却系数 | ×1.6（4.16–8.32 s） | ×1.0（2.6–5.2 s） |

现有数值（举例，全部见 `js/missions/`）：M1 测绘机 0.32、护航 0.40、
第二波 0.62、播撒机 0.30；M2 伏击（头机 / 僚机）0.72 / 0.50、ROK-40 0.30；
M3 播撒机 0.25、护航 0.58–0.72、
**冬港（WINTERPORT）0.96**（血量过半后提到 **1.0**）、无人僚机 0.62。

---

## 与玩家共用控制律的后果

好处是**手感一致**：敌人做机动的方式和玩家一样。代价是**改它要同时验证两边**：

- 滚转锁存依赖调用方传入的 `state`，AI 传机自己，玩家在 `Game`（`engine/game/control.js`）里传 `player`
- 瞄准角速度前馈只在传 `dt` 时启用 —— 只有玩家传，AI 不传
- 代价参数（`STEER_*`）与执行增益（`K_*`）同时影响玩家手感和 AI 转向

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 转向力度（执行增益） | `ai/steer.js` 的 `K_ROLL` / `K_PITCH` / `K_YAW`（旧的 `rollErr * 2.8` 等写法已被代价函数取代） |
| 滚转锁存阈值 | `steerTo()` 里 `rollLock` 判据（`|span| > 2.6`） |
| 代价函数参数（姿态代价 / 推杆权限 / 偏航权重 / 平滑） | `ai/steer.js` 的 `STEER_LAMBDA0` / `STEER_THETA0` / `STEER_PUSH_K` / `STEER_YAW_W` / `STEER_ALPHA_RATE` / `STEER_NEG_G` |
| 瞄准前馈（前瞻 / 低通 / 上限） | `ai/steer.js` 的 `STEER_LEAD_PLAN` / `STEER_LEAD_EXEC` / `STEER_RATE_TAU` / `STEER_RATE_MAX` |
| 规避触发距离（4.2 km） | `ai/util.js` `findIncoming()` 里的 `4200` |
| 脱离血量阈值 | `ai/brain.js` `update()` 里 `a.hp < a.maxHp * 0.25` |
| 威胁警戒半径 | `ai/brain.js` 里 `nearestEnemy()` 调用处的 `15000` / `11000` / `9000` |
| 面目标搜索半径 | `ai/util.js` `surfaceTargetFor()` 里取"自己最远那件对面弹的 `aiReach × 1.15`"（旧：`lockDist`） |
| 分段航线 | `js/engine/route.js`（`ARRIVE`、段缺省值） |
| 挑弹规则（类别 + 射程） | `Ent` `chooseWeapon()`（`entities/mounts.js`） |
| 对地目标的接近角 | `ai/util.js` `approachSurface()` 里的 `-0.06`（远）/ `-0.02`（近） |
| 升限钳制 | `ai/brain.js` `clampCeiling()` 里的 `1200` / `-0.22` / `0.08` |
| 编队槽位 | `js/missions/` `spawnWingman()` 的调用参数 |
| 各机技能 | `js/missions/` 各关 `spawn()` 里的 `skill` |
| 导弹最小发射距离 | `ai/brain.js` `update()` 里 `spW.nezer ? 1400 : (对面目标 ? 1200 : 700)` |

## 发射包线闸门（动态射程）

- 静态 `aiReach`（`entities/range.js`）只是上界。通过上界后，再用真实弹道的 `rmax` / `nez`（`Ent.envelopeCached`，0.1 s 刷新；AI 侧封装是 `ai/tactics.js` 的 `aiEnvelope`）卡一次。
- 制导弹才卡；炸弹和火箭（`tags.unguided`）靠它们自己的落点标记。
- 高 skill（≥ 0.6）要求进 `nez`（目标掉头逃逸也能打中），低 skill 进 `rmax`。
- **保守余量按目标类别分开**：空中目标 `AI_RANGE_MARGIN_AIR = 1.0`（v3.6.2 由 0.9 放宽：M1 迎头段 4 架敌机 100 s 内平均只发 1–7 枚，窗口太短；仍受 `aiReach` 自带的 0.9 约束，所以不会越过有效射程），地面 / 海面 `AI_RANGE_MARGIN_SURF = 0.8`（移动慢的地面目标打偏更丢人，对地多留余量）。

## 僚机掩护撒干扰弹（COVER）

- 仅 `s.cmd === 'cover'` 时生效。有导弹锁定长机（`world.player`）、且距长机 `< 3600 m` 时，僚机对**每枚弹**掷一次骰（概率 0.6，记在 `m.coverRolled[僚机名]` 上）。
- 中了就固定连放 3 轮（`s.flareBurst = 3`，`s.flareFor = 长机`），不管骗没骗中；之后由 `breakLockFor(僚机, 长机)` 逐组投放。
- 投放时推入 `world.events` 的 `{type:'wingflare'}`，`Game`（`engine/game/finish.js` 的 `combatEvents`）据此发电台（8 s 限频）。
- 自保的 evade 连放优先；两者共用同一个库存，所以一次 60 s 的统计里消耗可能不是 3 的倍数。
- `s.envClock` 在 `update` 开头按 `dt` 累计，是包线缓存的时钟。
- 僚机速度包线：`vMil` / `vStall` 乘 `loadoutPenalty(Ent.curLoadFactor(a))`（`loadoutPenalty` 在 `js/data/rules.js`）（挂载越重、AI 估的可用速度越保守）。


---

## 批次 5a：三层、位格与技能、Director、撤离（未发版）

### 三层

`update` 先递减计时器，再依次调用：

| 层 | 函数 | 做什么 |
|---|---|---|
| 感知 | `perceive` | RWR（`a.rwrT / rwrSrc`）、对敌方电子战的适应（`ewResist`） |
| 决策 | `decide` + `decideRange` + `retreatWatch` | 威胁规避 → 低血脱离 → 撤离 → 选目标 → 外围游走 / 回头 → 诱饵连放；只改 `s.mode / s.target / s.*T`，不碰操纵量 |
| 机动 | `maneuver` | 按模式出期望方向与油门，过覆盖链（升限、战区边界软转向——撤离中跳过、垂直改出、近地保护），写 `a.throttle / a.ab / a.target` |
| 开火 | `fire` | 机炮（含扫射、反应延迟）与导弹；`evade / extend / retreat` 时不开火 |

### 位格与技能表

`RANKS`（`js/data/rules.js`，枚举非标签）：rookie 0.35 / pawn 0.55 / elite 0.72 / ace 0.90；`rankFromSkill`：< 0.45 rookie、< 0.65 pawn、< 0.85 elite、其余 ace。`spawnEnemy({rank, skill})`：显式 `rank` > 机型 `ac.rank` > 按 `skill` 就近映射；`skill` 缺省取位格缺省值，已写 `skill` 的关卡数值不变。

`AI.SKILL`（`skill.js`，私有 `AI.$.SKILL`）：`retarget / gunCone / fireWill / shootGap / useNez / ewRate / leadK / standoff`，以及 `reactT`、`aimSigma`、`AIM_TAU / AIM_JITTER / AIM_RANGE / STRAFE_EXIT`。数值逐位等于原来散在 `brain.js` / `tactics.js` 里的线性式。

### 反应延迟与机炮偏移

- `reactT = 0.2 + (1 − skill) × 1.4`（rookie ≈ 1.1 s … ace ≈ 0.3 s）。**持续式**：机炮 / 导弹的开火条件成立才计时，任何一帧不成立就清零（`gunT / missT`）；**登记式**：干扰弹首发（`flareReact`）、目标丢失后重选（`lostT`）。
- 机炮偏移 `a.ai.aim = {x, y}`：OU 漂移 `off ← off·e^(−dt/τ) + σ√(1 − e^(−2dt/τ))·z`，τ = 1.5 s，σ = 0.06 × (1 − skill) rad；换目标与每一串新射击重抽；没有空中目标时衰减回 0。偏移叠到 `pursue` 给出的期望方向上（2500 m 内、有炮才加）；开火门限仍按真实视线角。
- 扫射：机头误差 `e ≤ r`（`r` = 当前偏移量级）进入，`e > 1.3 r` 退出，只用机炮。
- 随机数走私有 LCG（`$.seedRng / rnd01 / gauss`），不碰 `Math.random`，不改变原有决策抽签的顺序。

### Director 与距离层

`director.js`：`$.director.pick(a, world, maxR)` 与 `$.weaponClass(a)`；快照每 0.5 s 刷新（`world.aiDir`）。参数在 `$.DIR`：`PILE 1.0`、`STICKY 0.7`、`R_LONG 7000`、`T_FURBALL 25`、`T_STANDOFF 45`、`RING_K 0.6`。敌机看玩家本人：评分 ×0.55（`PLAYER_BIAS`）且不吃「已被盯」惩罚，所以更倾向打玩家而不是僚机；敌机看**玩家一方预警机**：评分 ×8（`AEW_PENALTY`），身边还有别的目标就几乎不选。无人僚机（`role: 'drone'`）永远不进 `extend`（被压制脱离 / 低血量脱离都不适用），只留在编队槽位。规则与门槛见 [POST2-0IMPL.md 的 5a 实施记录](../POST2-0IMPL.md)。`probe-spacing`：8v8 扎堆指数降 ≥ 50%、交战不坍塌、环半径与分类。

### `ally`

自主友军战斗机，team 0，走与敌机同一套空战 AI（含 Director 扇区、不抢人头、外围游走、战区边界软转向）；`spawnAlly(w, o)`（`missions/_lib.js`）仅提供接口，目前没有关卡使用。可写 `leader`（整备时跟着长机）。

### 撤离

`mission.retreat = 'on'` 才有（缺省 off）。事件（掉血 / 弹药池减少，轮询）→ 等 2.5 s → 评估一次（概率：血 < 35% +0.5、< 55% +0.2；无对空导弹 +0.15，且机炮 < 30% +0.4；位格系数 ace ×0.5 / elite ×0.75 / pawn ×1 / rookie ×1.3；上限 0.9）→ 没中冷却 8 s。撤离中 `mode = 'retreat'`：`evade` 优先；去向 `Resupply.pointFor`（本队整备点，否则最近出界口）；到整备点走批次 4 的 NPC 整备周期，出界口出界即移除（`retreated / leftBy = 'retreat' / escaped`）。`noRetreat` 标签（reserved）永不撤；`ai.leader` 指向的僚机随长机撤。`probe-retreat` 覆盖开关、触发率、位格单调、标签、出界移除、整备往返、僚机随长机。


### 半主动照射（批次 5c，未发版）

`ai/illum.js`：`$.updateIllum(a, s, world, dt)`（`decide` 开头调）与 `$.illumHolds(s)`。自己有 `sarh` 弹在途、目标活着时写 `a.lockHeldOn`（目标 = 当前 `s.target`、未被压制出 `clear`、未 `emcon`、在这件弹的有效射程内、且目标在锁定锥内——`FovWatch` 提供进 0.85 / 出 1.0 倍锥的迟滞）。**照射期间**（`illumHolds`）：不重选目标（`decide` 的重选条件）、来袭弹 > 2.5 km 不转身规避、不主动加力（`maneuver` 末尾 `ab = false`）；来袭弹进 2.5 km 时一次性判断放不放弃（概率 `0.4 + 0.5 × skill`，放弃则恢复规避）。丢锁 → 弹自己有 `SARH_GRACE` 宽限；弹失效 / 目标被弹置空 → 释放（`s.illum = null`，`lockHeldOn = null`）。**未做**：高技能锁定后的"偏置转向"；给上游战机配 `tether` 的 `npcLoadouts` 预设（顺延，免得 `probe-npc-loadouts` 基线再动）。


### 战术行为（批次 5d，未发版）

只给 skill ≥ 0.6（防御 / 诱饵侧击 / 低空突防）或 elite 以上（skill ≥ 0.72：能量与加力、假撤退）；低技能保持原行为。

- **按来袭弹类型选防御**（`tactics.js evade`）：半主动（`sarh`）→ 相对**发射机**把自己放在 3/9 线（打断锁定）；红外 / 光电 → 硬拉爬升（`dir.y` 0.45）且不开加力；其余雷达弹照旧（3/9 线 + 俯冲 + 箔条）。
- **能量与加力**（`energy.js`）：`$.energy(a) = ½v² + g·h`、`$.cornerSpeed(a)`（失速速度与军推速度的中点）、`$.irThreat`、`$.abPolicy`、`$.yoyo`。elite 以上：收敛（> 2600 m）速度 < 角点 × 1.15 才开加力、狗斗 < 角点 × 0.9 才开、有红外弹以我为目标（< 6 km）不开；缠斗中速度 < 角点 × 0.8 压机头 yo-yo。没有燃油模型，不做 `AB_FUEL`；`AB_MIN_E`（"能量低于门限停止加力"）不做——与上面按角点速度开的规则方向相反。**上升 yo-yo**：speed > 角点 × 1.25、距离 300–1800 m、高度 > 1200 m、目标在机头 32° 之外时，把期望方向抬高（y ≥ 0.5）爬升掉速，防飞过头。**拉开距离开加力**：`extend` / `retreat` 本来就满油门加力，被咬尾时 `shakeTail` 各策略自带加力，不再单做。半主动照射期间仍不开加力（5c）。
- **诱饵与侧击**（`director.js`）：同一个空中目标被同队 ≥ 2 架 skill ≥ 0.6 的敌机盯着（不在规避中）→ 第一架 `bait`（正面）、其余 `flank`（绕到目标侧后 2.5 km / 1.5 km 处切入，左右交替）；`s.subrole` / `flankSide`。
- **假撤退**（`retreat.js`）：elite / ace、hp > 60%、有空中目标、非僚机；掉血 / 弹药减少 → 2.5 s 评估 → `FAKE.P`（0.08，ace ×1、elite ×0.7）→ 背着对手飞 8–15 s（`s.fake`，mode `retreat`，**不设 `retreating`**，所以不触发整备、不移除单位，`mission.retreat='off'` 的关卡里也有）；到时间 / 对手追近 3.5 km 内（≥ 3 s 后）→ 回头：`fakeBoostT` 3 s 加力、`missT` 预置（先机发射）、`standCool` 15 s。台词与真撤退同样走 `rtb`（玩家分不出，是卖点）。
- **撤向防空伞**（`retreat.js umbrellaPoint`）：被追击（有敌机目标在 7 km 内或被照射）、己方带对空火力的 `world.targets`（`sam` 标签 / 近防 / 对空武器）**比追击者更靠近我**时，真撤离优先朝它飞（半径取对空弹有效射程，无武器时 5 km）；进到 0.7 半径内待满 6 s 就结束撤离。
- **低空突防**（`strike.js skimDir`）：机型 `caps` 含 `strike`、skill ≥ 0.6、目标是面目标：远处贴海面 / 地面（`SKIM.AGL` 120 m，下限 70 m），到武器有效射程 × 1.3 才拉起到 1800 m，发射后回低空；`s.lowStrike` 为真时跳过 `agl < 420` 的近地保护。这类机在 `surfaceTargetFor` 里从 25 km 就盯上面目标（其余仍是射程 × 1.15）。
- 5.7 里本批只做了"战术行为"组，其余（个体模型、态势记忆、编队协同、导演与系统）在批次 5f 补齐。


### AI 过失速机动（批次 5e，未发版）

`ai/psm.js`：复用玩家那套 `Ent.stepPSM / psmGate / psmStart / psmAbort` 与同一个控制律（`steerTo`），AI 只是替换瞄准方向的来源；没有"松开按键"，由 `$.psmWatch` 在机头对准（< 12°）/ 超时（4.5 s）/ 目标没了时自己 `psmAbort`。`mode: 'psm'`：`maneuver` 里**显式跳过**升限钳制、战区软转向、`vertRecover`、近地保护；`fire` 不早返回，咬尾反击收敛后照常按开火门限开火。

- **适用**：`rank === 'ace'` 且 `skill ≥ PSM_AI.SKILL`（0.75）、非无人机（`tags.unmanned`）、无 `noPSM` 标签、不在撤离 / 假撤退中、没失速。长机做 PSM 时僚机不跟（僚机各自评估）。
- **用途**：`counter` 咬尾反击（攻击者在机尾 ±60° 内、< 3 km，机头甩向攻击者）；`break` 摆脱锁定（有来袭弹 / 被雷达照射，机头甩向远离来袭弹 / 照射源的方向，把机头甩出导引头视场）。
- **触发**：事件（新出现的威胁）→ `EVAL_DELAY` 0.8 s 后评估一次（掷骰 `p = clamp(0.25 + 0.6×(skill−0.75)/0.25, 0.25, 0.85)`，`break` 还要 TTI > 2.5 s，再过 `psmGate` 的能量 / 高度 / 动压门限）→ 结果为否则要等威胁消失再出现才再评估；起手后冷却 `CD` 15 s。随机数用私有 LCG（`s.rs`）。
- **HUD**：AI 进入 PSM 时在它身上标"高攻角机动"（`hud/targeting.js drawPsmHints`，与玩家自己的 PSM 提示同一类信息）。
- **后续已补**（见批次 5f）：假撤退回头优先用 PSM（`psmTurnBack`）；`break` 的成败按来袭半主动弹丢照射 / 不再被雷达照射判定。仍然没有接 `FovWatch.onLockLost`（用 `m.sarhLost` / `rwrT` 代替）。


### 批次 5f：个体模型、态势记忆、编队协同、环境事件与调试（未发版）

补齐 5.7 里 5d 没做的组，以及 5.6 / 5.8 顺延的几项。

- **照射偏置转向**（`brain.js`）：skill ≥ 0.85 的 AI 在半主动照射中，把期望方向水平偏出 0.28 rad（按 `flankSide` 左右），保持目标在锥内的同时拉开。
- **假撤退回头用 PSM**（`psm.js psmTurnBack`）：ace、对手在机尾（`dot(fwd, 视线) < −0.3`）、PSM 冷却已过、过得了 `psmGate` 时，回头那一刻起一次 counter PSM；**摆脱成功判定**：`break` 型 PSM 在来袭的半主动弹丢照射（`m.sarhLost`）或不再被雷达照射（`a.rwrT = 0`）时提前结束，`s.psmShaken` 计数。
- **性格 `temperament`**（`skill.js TEMPER`，`spawnEnemy({ temperament })`，缺省 null = 中性，不偏移）：`aggressive`（开火意愿 +0.10、脱离阈值 ×0.7、撤离概率 ×0.7、不玩外围游走）/ `cautious`（skill ≥ 0.55 就玩外围游走、撤离概率 ×1.3、开火 −0.05）/ `sniper`（skill ≥ 0.5 就玩外围游走、环半径 ×1.2、开火 +0.05）/ `loyal`（不离开 `ai.leader` / `ai.ward` 超过 6 km）。**随机保底**（v3.6.3）：关卡没写 `temperament` 时，`spawnEnemy`（`spawnAlly` 经它）在生成时调 `AI.rollTemperament` 随机抽一个——池 aggressive 0.30 / cautious 0.25 / sniper 0.20（仅机上有 longRange 对空弹）/ loyal 0.25（仅有 `leader` 或 `ward`）；取值用 `ai.rs` 的一次**不推进状态**的哈希，不扰动该机后续私有抽签；`AI.attach` 本身不抽（直接 attach 的探针不变）；无人僚机 / support / 航线型不抽；`behavior: 'recon'`（侦察 / 干扰机）视为 `steady`。显式 `temperament: 'steady'`（空表，与旧中性逐位一致）可关掉随机。
  **性格接入的机制**（v3.6.3，字段见 `TEMPER` 的注释；全部缺省中性）：反咬尾策略权重 `tailW` 与被咬反应延迟 `react`（激进多剪刀少俯冲 / 拖友机，谨慎相反且反应 ×0.8，狙击多 zoom / brake）；保持咬尾的 lag 触发距离 `lagDist`（激进 350、谨慎 650）；射程外远射 `longK / longCap`（激进 ×1.6 且技能上限 0.75、谨慎 ×0.5、狙击 ×0.3）；超调 `overK`；假撤退 `fakeK`（谨慎 ×1.6、激进 ×0.3）；选目标 `playerK`（激进对玩家评分 ×0.8）/ `closeK`（狙击不爱贴脸：< 2 km 的目标评分加 closeK×1500 m 等效）/ `isoK`（谨慎对 4 km 内有友机的目标加罚）；求援响应 `helpK`（忠诚 0.4、激进 0.5、默认 0.6、谨慎 0.8）；加力门限 `abK`（激进 ×1.15、谨慎 ×0.85，仅 skill ≥ ELITE_SKILL）；受伤后 `rage`（激进越伤越凶、谨慎越伤越保守：fireWill += rage×(1−血量比)，shootGap 同比缩放；`s.hpFrac` 由 `update` 每帧写）。**战区边界缓冲不随性格变化**（它是为玩家体验设计的）。探针 `probe-temper.js`。**性格台词**（v3.6.2）：`chatter.js emit` 先试 `radio.<事件>.<ally|foe>.<性格>.variants`（`T.has` 守卫），没有就回退通用；`aggressive / cautious / sniper` × `fox / splash / defensive / rtb` 有台词，`loyal` 与其余事件回退；查键不消耗 Chatter 抽签。目前没有关卡设置 temperament，游戏里要等关卡用上才听得到。
- **咬尾攻防**（v3.6.3，`tactics.js $.shakeTail / $.holdTail`；技能值 `SKILL.shakeTail = clamp((skill−0.3)/0.6)`、`SKILL.holdTail = clamp((skill−0.35)/0.55)`，随 skill 单调增；多策略，`?debug=ai` 在机头标 `SHAKE:<策略>` / `HOLD:<策略>`）：
  - **反咬尾**：有敌机以我为目标、落在机尾锥（cos < −0.5）内且 < 2.6 km 持续超过反应延迟后，按「距离段 × 技能 × 态势」加权抽一个策略（私有 LCG，只在选 / 换时抽），执行 2.5–4 s 后重选，攻击者离开后清空。`break` 硬横向急转 + 略俯冲（基线）；`jink` 横向小幅蛇行、满油门，攻击者还远（> 1.8 km）时用，最多占 70% 控制；`dive` 俯冲加速（离地 > 2.5 km，k ≥ 0.45）；`drag` 拖向最近的友机（3–15 km、非无人机，k ≥ 0.6，把攻击者引进友机火力）；`zoom` 高速（≥ 0.7 vMil）时拉起近垂直爬升（k ≥ 0.6）；`scissors` 剪刀：压油门到 0.6、每 1.6 s 换侧（< 1.2 km，k ≥ 0.75）；`brake` 收油门到 0.15 + 横向急转让攻击者飞过去（< 0.8 km，k ≥ 0.8）。低技能只会 break / jink / dive。
  - **转守为攻**（v3.6.3 之后，`tactics.js $.REVERSAL / $.counterStep`）：`brake` 加三个新的反转型策略——`barrel` 进攻桶滚（k ≥ 0.7、< 1.1 km、速度 ≥ 0.6 vMil：先朝侧上方让出 + 怠速 2.2 s，再机头翻向攻击者往下压）、`rolling` 滚动剪刀（k ≥ 0.85、< 700 m：垂直面里上 / 下交替 + 怠速，每 1.0 s 换向）、`feint` 假动作反转（k ≥ 0.75、0.5–1.4 km：先满油门朝一侧硬转 0.5–0.7 s，再突然反向 + 怠速）。共同点是**减速 + 横向让出**让更快的攻击者冲过头；攻击者跑出机尾锥且 < 1.8 km 时 `counterStep`：`counterT = 4 s` 内强制盯住它（`decide` 的重选分支前插入，Director / STICKY 抢不走）、`SKILL.fireWill` +0.25、`missT` 预置到反应延迟（首发免等待），之后由 `pursue` + `holdTail` 咬尾；又被咬到身后则窗口作废。`?debug=ai` 标 `COUNTER`。性格 `tailW`：激进多 `barrel / rolling / feint`、谨慎少。实测（`probe-tail` F 段：攻击者更快、500 m 紧咬）：`break` 0/6 把攻击者甩到前方，三种新策略都是 6/6。**`hammer`（锤头）试过但在本作的追击 AI 下甩不掉（攻击者跟着爬升），已删除**。
  - **保持咬尾**：目标在机头前方锥（cos ≥ 0.8）内、同向、< 2.6 km 时按态势选：`lead` 提前量追击（基线）；`lag` 太近且仍在接近（< 500 m，k ≥ 0.4）瞄目标身后并多收 60 m/s 油门，不冲过头；`cut` 目标压坡度转弯（|right.y| > 0.45，k ≥ 0.55）瞄转弯圈内侧抄近路；`high` 近距略高于目标飞（+6% 距离，≤ 120 m，k ≥ 0.7；**只在机炮有效射程之外用**：开火窗口〔有弹且 < 机炮射程 × 0.9〕里不抬瞄准点——它改的是机头指向，机炮沿机头打，抬高会让高技能 AI 一直打空，v3.7.1 修，probe-aim 守着），冲过头时有垂直余量。油门一律按「目标速度 + (距离−700)×0.25」调。
  - 两者只在追击分支生效（规避 / PSM / 撤离 / 脱离优先），无人僚机不走这里。
- **脱离干扰区**（`coord.js`）：只为出干扰区，压制降到阈值一半以下就立刻结束 extend，之后 `JAM.CD = 8 s` 内不再触发，不会一路飞远。
- **人为失误**（`skill.js SKILL.misjudgeT / lostExtra`，仅 skill < 0.7）：新来的来袭弹登记一次"晚发现"延迟 `(0.7−skill)×2×rnd`；丢目标后重选多等 `(0.7−skill)×3×rnd`。**超调**（v3.6.2，`tactics.js $.overshoot`，仅 skill < 0.7，`SKILL.overshoot = (0.7−skill)/0.35`）：进近（500–1800 m 且在接近）时登记一次，随后 `(0.6 + 1.2·rnd) × overshoot` 秒内期望方向向"继续直飞"混入 60%，转弯收不干净、飞过头再回头；登记后 10 s 内不再登记；目标本来就在机头正前时混入无差别。**射程外远射**（v3.6.2，`SKILL.longShot = (0.65−skill)×0.9`，skill ≥ 0.65 为 0）：包线 / 有效射程外、锁定带 1.4 倍以内、目标是飞机、有弹且弹药 > 1、非半主动 / 无制导时，每 1.5 s 掷一次私有 LCG，中了就放（之后 6 s 不再掷），弹走正常 `fireMissile`——多半飞不到，是气氛与"低技术"，不显著提高难度；现有开火判定的 `Math.random` 抽签顺序不动。
- **过载与体能**（`brain.js gTrack`，有人机，无人机 `tags.unmanned` 无此限制）：由速度方向的转动速率估算持续 G，> 0.85 × `gLimit`（机型 `ac.gLimit`，缺省 9）累计满 `G_SUSTAIN` 6 s → 视野变窄 `G_BLACKOUT` 1.5 s（机动放缓，不转向）。机型数据里没有 `gLimit` 字段，用缺省 9；玩家自己的灰视 / 红视在 `HudFx`（v3.6.2，纯显示、无惩罚，见 [hud.md](hud.md)）。
- **态势记忆**（`memory.js`，skill ≥ 0.6）：能感知目标 = 近距目视（< 6 km）、雷达前半球（< 16 km、离机头 ≤ 120°）、己方预警机在线（`aewc`、未被压制）或同队别的 AI 离目标 < 8 km（数据链）；目标 `emcon` 或带 `lockResist` 时雷达 / 数据链距离缩小。感知不到 → `s.searching`：向 `lastKnown`（位置 + 速度外推，随时间衰减）飞，搜索中不开火，`T_SEARCH` 6 s 后放弃目标。低技能保持全知；面目标不适用。
- **编队协同**（`coord.js`）：**护航**（`ai.ward`；`spawnEnemy({ ward })`）——无威胁时绕被护卫者转（R 4 km，leash 8 km），敌机进入被护卫者 8 km 内且反应延迟（`reactT`）过后转去拦截，被护卫者没了回到普通追击；**巡航队形**（`ai.fm = { mode: wedge|echelon|column, lead, idx }`；`spawnEnemy({ fm })`）——未交战跟队长槽位，目标进入 12 km / 被锁 / 来袭弹 / 掉血后整队解散；**脱离干扰区**——被压制 > 0.45 持续 2 s → `extend` 5 s、朝远离干扰源；**友军呼救**——我方 AI 被咬尾 / 血量 < 40% 喊一次 `help`（Chatter，冷却 20 s），Director 把"正在打求援者的敌机"评分 ×0.6。**自由飞行的干扰机**（v3.6.2，`spawnEnemy({ jam: {…}, ward })`）：`ai.jam = { wid, skill, trigK, dur, fadeTo, rekey, msg }`，`maneuver` 里 `s.jam && s.ward` 走 `escortDir`（离远了飞回去、近了绕着转，`ESCORT.R 4 km < jamRadius 12 km`），`update` 里调同一个 `jamAuto`（敌人进 `jamRadius × trigK` 才开吊舱），`behavior` 缺省 `recon`（受损前不接战），不追击。目前没有关卡使用；`probe-coord` E 段。
- **环境事件**（`engine/ambient.js`，`mission.ambient = [{ type, p, cooldown, max, … }]`，缺省没有）：`distress`（Chatter help）、`reinforce`（边缘生成 n 架，我方 `spawnAlly` / 敌方 `spawnEnemy`，播一句无线电，`max` 缺省 1 次）、`straggler`（hp 25% 的飞机直接撤离）、`distant`（一句 fx 无线电）；每 5 s 掷一次骰，私有 LCG。13 关都没声明，批次 8 逐关选用。
- **调试可视化**（`hud/debug.js`）：地址栏 `?debug=ai` 时（`HUD.debugAI`）在每架屏幕内的 AI 头上叠 mode / 目标 / 位格·技能·性格 / 角色·撤离·PSM·搜索·GLOC·锁定·照射标记。Director 扇区环（v3.6.2）：≥ 2 架友机时，以友机队质心为圆心、半径 8 km、玩家高度，每个扇区画两条半径线 + 一段弧（`M3.clipSeg` 裁近平面），弧中点标 `S<序号>/<总数>`；`AI.sectorOf` 公开（`director.js` 导出，`zz-api.js` 挂出）。
