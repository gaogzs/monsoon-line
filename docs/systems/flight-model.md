# 飞行模型与大气

代码：`js/entities.js` · 数据：`js/data.js` 的 `phys` 字段

---

## 一句话概括

**动压 `q = ½ρv²` 是这个游戏唯一的物理主角。**
它同时决定三件事：操纵面有多灵、导弹能拐多急、机炮能打多远。

这不是为了拟真而拟真——见 [world/SETTING.md](../world/SETTING.md)。
平流层作战的设定需要一个能算出来的支点，动压就是那个支点。

---

## 标准大气

`airDensity(y)` 实现 ISA 分层模型，四段：

```js
if (y < 0) y = 0;                                        // 海平面以下按海平面
if (y < 11000) { T = 288.15 - 0.0065*y;                  // 对流层
                 return 1.225 * pow(T/288.15, 4.2561); }
if (y < 20000) return 0.3639 * exp(-(y - 11000) / 62188.6);   // 等温层
if (y < 32000) { T3 = 216.65 + 0.001*(y - 20000);        // 升温层
                 return 0.08803 * pow(T3/216.65, -35.16); }
return 0.0132;                                           // 32 km 以上取常数
```

常量 `G = 9.80665`、`RHO0 = 1.225` 在文件顶部。

实测（`node` 跑同一段代码）：

| 高度 | 密度 kg/m³ | 相对海平面 | q @ 300 m/s |
|---|---|---|---|
| 0 m | 1.22500 | 100.0% | 55.13 kPa |
| 5 000 m | 0.73610 | 60.1% | 33.12 kPa |
| 11 000 m | 0.36390 | 29.7% | 16.38 kPa |
| 15 000 m | 0.34123 | 27.9% | 15.36 kPa |
| 18 000 m | 0.32516 | 26.5% | 14.63 kPa |
| **20 000 m** | **0.08803** | **7.2%** | **3.96 kPa** |
| 22 000 m | 0.06373 | 5.2% | 2.87 kPa |
| 23 000 m | 0.05428 | 4.4% | 2.44 kPa |
| 32 000 m | 0.01320 | 1.1% | 0.59 kPa |

`20 000 m → 0.088` 是设定集反复引用的锚点，也是 `entities.js` 文件头的注释。

> **实现注记（必须知道）**：等温层的尺度常数写的是 `62188.6`。
> ISA 的等温层尺度高度在 6 200–6 400 量级，取 `6218.86` 时
> 11–20 km 段会平滑接到 0.08803（18 km ≈ 0.118、20 km ≈ 0.0856）；
> 而现在的 `62188.6` 大了十倍，使这一段几乎是常数：
> 18 km 仍是 0.325、19 km 仍是 0.320，然后在 `y = 20000`
> 处被第三段**硬切**到 0.08803 —— 3.7 倍的密度断崖。
> 本文件的数值表按**源码实际行为**列，不按 ISA 理想值。
> 修不修这个常数是设计决定，但它现在是"11 km 以上密度基本不变"，
> 而不是"随高度衰减"。

**这三段的常数是怎么来的**：全部来自标准大气定义，不是调出来的。
改之前先算一遍 20 km 处应该是 0.08803。

---

## 动压与控制权限

```js
q = qOf(y, speed) = 0.5 * airDensity(y) * speed * speed;     // Pa
a.q = q / 1000;                                              // kPa，供 HUD 显示
```

操纵面权限（`ctrlFactor(y, speed, ac)`）：

```js
k  = q / (ac.ctrlFull || 22000);
lo = ac.ctrlFloor || 0.13;
ctrl = clamp(k, lo, 1.0);
```

即"到满权限动压时给 1.0，低于此线性衰减，最低保底 `ctrlFloor`"。
**两个端点都能被机型覆盖**（见 `data.js`），这是高空机之间唯一的差别所在。

### 为什么需要可覆盖的两个端点

`ctrl` 只看动压，而同一高度下动压只跟空速有关 —— 于是"哪架飞机在高空更好使"
实际上被"谁飞得快"单方面决定了。D-14 旗鱼号称平流层之王，极速却比
F-9 海燕慢 54 m/s，在 20 公里上操控反而不如它。设定和数值脱节。

把曲线的两端交给机型之后，两架就能各占一头：

| | `ctrlFull` | `ctrlFloor` | 性格 |
|---|---|---|---|
| 常规机型 | 22000 | 0.13 | 动压掉了就变钝 |
| **D-14 旗鱼** | 22000 | **0.34** | 谁都没能量了它还能动 —— 持久缠斗 |
| **F-9 海燕** | **16500** | 0.13 | 有速度时比谁都灵活，被拖慢就什么都不是 —— 一击脱离 |

同样在 20 公里：

| 空速 | 动压 | 旗鱼 ctrl | 海燕 ctrl |
|---|---|---|---|
| 620 m/s | 16 919 Pa（16.92 kPa） | 0.77 | **1.00** |
| 400 m/s | 7 042 Pa（7.04 kPa） | **0.34** | 0.43 |
| 200 m/s | 1 761 Pa（1.76 kPa） | **0.34** | 0.13 |

**旗鱼的 0.34 是有设定依据的**：它的第三涵道在稀薄空气里仍给得出控制力矩
（原文只提了推力，这里才落到物理上）。代价是结构 92、失速速度 122。

HUD 上的 `Q` 表显示 kPa，`q < 12 kPa` 时告警（`hud.js` 的
`LOW Q 动压不足`，条件是 `pos.y > 18000 && p.q < 12`）；
12 kPa 对应常规机型的 `ctrl ≈ 12/22 ≈ 0.55`。

**这个系数乘在角速度上**（见「姿态积分」），所以同一架飞机在海平面
300 m/s 和 20 km 高度 300 m/s 的操纵性差了一个数量级。

### 四架可选机的数值差

| | vMax | vMil | vStall | accel | decel | pitch | roll | yaw | hp | ctrlFull | ctrlFloor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DB-11 军舰鸟 | 480 | 372 | 105 | 26 | 40 | 0.76 | 3.0 | 0.30 | 130 | 22000 | 0.13 |
| D-14 旗鱼 | 566 | 448 | 122 | 33 | 36 | 0.80 | 3.4 | 0.28 | 92 | 22000 | **0.34** |
| G-6 鲣鸟 | 380 | 320 | 88 | 18 | 44 | 0.62 | 2.2 | 0.34 | 250 | 22000 | 0.13 |
| F-9 海燕 | 620 | 500 | 138 | 34 | 32 | 0.48 | 2.2 | 0.24 | 110 | **16500** | 0.13 |

单位：m/s、m/s²、rad/s。`ctrlFull` 缺省 22 000，`ctrlFloor` 缺省 0.13。
注意 `yaw` 这一列只被 `ctrlFactor` 之外的通用 `ctrl` 缩放，
不像 pitch / roll 那样还有额外倍率（见「姿态积分」）。

**D-14 的设计逻辑**：失速速度最高（122 m/s）、结构最脆（92），
但在 20 km 高度因为推力衰减的补偿算得最好，是唯一能在那里
维持 M2.0 机动的机型。**它的强项和弱点都是"高空"**。

---

## 姿态积分

飞机姿态是三个正交基，每帧做局部旋转（`M3.rotAxis`，罗德里格斯）。

先算三个角增量：

```js
pIn = clamp(ctrl.pitch, -1, 1);   rIn = clamp(ctrl.roll, -1, 1);   yIn = clamp(ctrl.yaw, -1, 1);
gl  = a.gLoad === undefined ? 1 : clamp(a.gLoad, 1, 2.3);        // 高 G 倍率，玩家专用

pitchAuth = (pIn >= 0) ? 1 : PITCH_DOWN_K;                       // PITCH_DOWN_K = 0.5
dPitch = p.pitch * pitchAuth * ctrl * dt * gl;
dRoll  = p.roll  * clamp(ctrl * 1.8, 0.28, 1) * dt * (1 + (gl - 1) * 0.45);
dYaw   = p.yaw   * ctrl * dt;
```

三个要点：

- **俯仰权限不对称**：推杆效率只有拉杆的一半（`PITCH_DOWN_K = 0.5`）。
  现实里飞行员能承受约 +9G 拉起、只能承受约 −3G 推杆，机翼负迎角
  方向的失速边界也来得更早。取 0.5 而不是现实的约 1/3，是因为
  1/3 会让俯冲攻击这个基本战术变得过于笨重。
- **滚转有下限**：`ctrl` 衰减时滚转只能掉到 `0.28` 倍、
  且满权限下还有 1.8 倍增益 —— 高空滚得动是游戏性要求。
- **高 G 只放大玩家**：`gLoad` 由 `game.js` 的 `controlPlayer()` 设置
  （按 G 键，`HIG_MAX`），AI 不设，所以 `gl = 1`。俯仰放大得比滚转多。

应用到基向量（`rotAxis` 用右手定则，所以符号是负的）：

```js
if (pIn) { ang = -dPitch * pIn; a.fwd = rotAxis(a.fwd, a.right, ang); a.up = rotAxis(a.up, a.right, ang); }
if (rIn) { ang = -dRoll  * rIn; a.right = rotAxis(a.right, a.fwd, ang); a.up = rotAxis(a.up, a.fwd, ang); }
if (yIn) { ang =  dYaw   * yIn; a.fwd = rotAxis(a.fwd, a.up, ang); a.right = rotAxis(a.right, a.up, ang); }
```

**符号为什么是负的**：绕 `right` 正向旋转会让机头向下
（`forward` 从 `(0,0,1)` 变成 `(0,-sinθ,cosθ)`），所以"抬头"要取负；
滚转同理。右偏航绕 `up` 正向，所以取正。

每帧末尾用 `M3.orthonormalize(a.fwd, a.up)` 修正累积漂移，
重建 `a.right`。

**不要改成欧拉角**：垂直姿态有万向节锁，而这个游戏有大量垂直机动。

---

## 速度模型

```js
th = clamp(a.throttle, 0, 1);                       // 加力区在 1 以上，插值前夹回
vTarget = lerp(vStall * 0.74, a.ab ? vMax : vMil, th);
vTarget -= a.fwd.y * 52;                            // 爬升掉速 / 俯冲增速
vTarget = max(vTarget, vStall * 0.52);

if (y > 11000) {                                    // 高空推力衰减
  k = clamp(1 - (y - 11000) / 15000, 0.20, 1);
  vTarget = lerp(vStall * 0.55, vTarget, k);
}

if (a.brake) vTarget = min(vTarget, vStall * 0.92);
acc = (vTarget > a.speed) ? p.accel : p.decel;
if (a.brake) acc = p.decel * 1.8;

dv = clamp(vTarget - a.speed, -acc*dt, acc*dt);
a.speed = clamp(a.speed + dv, vStall * 0.42, vMax * 1.12);
a.vel = a.fwd * a.speed;
a.pos += a.vel * dt;
```

- 高空衰减到海平面的 **20%**——这是自适应循环发动机的物理依据
  （见 [world/SETTING.md](../world/SETTING.md) 的发动机一节）。
- 减速板（`brake`）把目标速度压到 `vStall * 0.92`，减速率乘 1.8。
- 最终速度被钳在 `[0.42·vStall, 1.12·vMax]`，所以俯冲不会无限加速、
  失速也不会掉成零。
- 加力（`a.ab`）与减速板（`a.brake`）由 `game.js` 按油门轴
  `player.throttle > 1.0` / `< 0.04` 单独设定，飞行模型不自己判断。

---

## 可变后掠翼

只有 DB-11 军舰鸟有（数据里的 `variableSweep: true`）：

```js
a.sweep = clamp((a.speed - 170) / 250, 0, 1);   // 0 = 展开，1 = 后掠
```

渲染时 `pushModel()` 按 `opts.sweep` 在**展开位**与**后掠位**两套顶点之间
插值（模型数据里的 `morph.map / spread / swept`）。

机翼角度与翼尖位置在 `js/models.js`：

```js
sweepPt(20, 2.2, 1.6)   // 展开位，翼尖 (7.4, -1.3)
sweepPt(62, 1.7, 1.1)   // 后掠位，翼尖 (4.3, -4.8)
```

即 **20° → 62°**，和 F-14 的 20° → 68° 同一量级。因为机翼是
**绕翼根枢轴旋转**的，后掠的同时翼展也会缩：

| 状态 | sweep | 翼尖 x | 翼展（2×翼尖 x） | 后掠角 |
|---|---|---|---|---|
| 展开 | 0.00（≤170 m/s） | 7.4 | 14.8 m | 20° |
| 中间 | 0.60（320 m/s） | 5.5 | 11.1 m | 顶点插值，无单一角度 |
| 后掠 | 1.00（≥420 m/s） | 4.3 | 8.6 m | 62° |

翼尖位移 `|(7.4,-1.3) − (4.3,-4.8)| ≈ 4.7 m`（模型元数据 `span: 15.2`）。

> 上一版本这里写的是"翼展 15.6 m → 10.1 m、翼尖位移 5.0 m、
> 中间位 45°"，在 `models.js` 里找不到出处；现按 `sweepPt`
> 的实际参数改。中间位的翼展是**顶点线性插值**的结果，
> 把它读成某个固定后掠角是不对的。

两组点必须差得够大才看得见。早先那版实际只差 18°（2.6° → 20.5°），
翼尖后移 2.7 米，在 15 米翼展上几乎看不出来 ——
而注释里写着"差异足够明显"，是注释把自己骗过去了。

**为什么做成真变形而不是删掉这个设定**：变后掠是 DB-11 唯一的辨识特征，
而顶点插值成本很低 —— 只在 `pushModel` 的顶点循环里加一次线性插值。
俯视识别图（`planform.js`）另用 `sweepAlt` 虚线标出展开位。

**加新机型时**：只有带 `morph` 数据的模型才响应 `opts.sweep`，
其他机型传什么都不影响。

---

## 挂载重量

见 [loadout.md](loadout.md#重量惩罚)。在 `stepAircraft()` 里对机型物理数据
做临时缩放：

```js
if (a.loadFactor) {
  var lp = loadoutPenalty(a.loadFactor);      // data.js 里唯一一份系数
  p = {
    vMax:   p.vMax   * lp.vMax,
    vMil:   p.vMil   * lp.vMil,
    vStall: p.vStall * lp.vStall,
    accel:  p.accel  * lp.accel,
    decel:  p.decel  * lp.decel,
    pitch:  p.pitch  * lp.pitch,
    roll:   p.roll   * lp.roll
  };
}
```

**注意这里是整体替换 `p`**，所以每个用到的字段都得列上。
**AI 没有 `loadFactor`**（`undefined`），所以完全不受影响。

---

## 失速

`speed < p.vStall` 时置 `a.stall = true`，然后：

1. **舵效雪上加霜**：`ctrl *= 0.34`
2. **低头力矩**：`y > 60` 时按失速深度施加自动低头

```js
var st = (vStall - speed) / vStall;      // 0..1
var angS = 0.55 * st * dt;
a.fwd = rotAxis(a.fwd, a.right, +angS);  // 正角 = 绕 right 正转 = 机头向下
a.up  = rotAxis(a.up,  a.right, +angS);
```

不做"完全失控"——这是街机游戏，玩家应该被惩罚但不该被缴械。

---

## 高度上限与地形

```js
if (a.pos.y > 23000) {                              // 硬天花板
  a.pos.y = 23000 + (a.pos.y - 23000) * 0.2;        // 超出部分只保留 20%
  a.fwd = norm(V(a.fwd.x, min(a.fwd.y, -0.02), a.fwd.z));   // 强制机头朝下
  orthonormalize 重建基
}
if (a.pos.y <= 2) { a.pos.y = 2; kill(a, world, true); }    // 撞海
```

---

## 导弹动力学

### 弹体初始化（`makeMissile`）

```js
speed: o.speed || 120,          // launch() 传的是载机速度 + 70
vel:   w.ballistic ? norm(fwd) * speed : (0,0,0),
life:  w.vsLife, age: 0, dmg: w.dmg, turn: w.turn, prox: w.prox,
seekerOn: true, lostTime: 0, reDone: false
```

`age > life` 就消失（总寿命，不是动力段）。**无动力弹的初速必须在这里给**：
无动力弹的速度完全靠 `vel` 自己累积，初值给 0 的话它是"从空中静止开始往下掉"，
扔出去的动能全丢了。

### 动力段

```js
powered = age < effectiveLife(w, m.pos.y)
if (powered) m.speed = min(m.speed + w.boost*dt,
                           w.speed * (1 + max(0, (12000 - y)/60000)));
else         m.speed = max(m.speed - 140*dt, 170);
```

注意速度上限带一项**低空加成**：12 km 以下每低 1 km 上限提高约 1/60，
海平面时是 `1.2 × w.speed`。

`effectiveLife(w, y)` 对**冲压弹**（`scramjet: true`）特殊处理：
`y > 18000` 时返回 `max(1.2, w.life * 0.24)` ——
CLA-17 的 10 秒动力段缩到 2.4 秒，这就是"高空缺氧降级"。

**无动力弹（`ballistic`）**走另一条路：只受重力与阻力，

```js
m.vel.y -= G * dt;
dragK = 0.00006 * airDensity(y) * |vel|;     // 与动压同量级
m.vel *= max(0.2, 1 - dragK*dt);
m.speed = |m.vel|;
```

弹体姿态跟着速度矢量走（自由落体是"跟着速度矢量"的，不是昂着头的）。

### 导引品质：`lead` 字段

```js
tGo  = dist / max(60, m.speed);
lead = (w.lead === undefined) ? 0.6 : w.lead;      // 0 .. 1
aim  = target.pos + target.vel * tGo * lead;
desired = normalize(aim - m.pos);
```

`lead` 是**这枚弹聪不聪明**的唯一参数，数据在 `data.js` 的 `MISSILE_LEAD`：

| 武器 | lead | 行为 |
|---|---|---|
| `srm` TOR-2 | **0.38** | 基础红外弹，刻意做得很笨 |
| `vlar` DAR-12 | **0.90** | 全表最高，飞向解算出来的最优拦截点 |
| `v17` CLA-17 | 0.86 | 冲压远距弹 |
| `mrm` BIN-4 | 0.78 | 主动雷达中距弹 |
| `otr` TOR-1 | 0.32 | 全表最低，群岛国的旧货 |

**这个数字比转弯率更能体现导引能力**。一枚转弯率一般但预测准的弹，
打机动目标反而比一枚只会死咬尾巴的灵活弹更管用：
灵活性买的是"最后一刻的修正"，预测能力买的是"从头就没错"。

早期的实现是所有人共用 `0.82` 的固定折扣，于是"导引好"和"导引差"
只能靠转弯率区分——那只影响最后一秒，不影响整条弹道。
（注：AI 的 `leadTo()` 用的仍是固定 `0.85` 的提前量，二者是两套东西。）

**加新导弹时别忘了给 `lead`**，`smoke.js` 会检查制导武器是否都有这个字段。

### 转弯能力受动压限制

```js
turnFactor(y) = max(0.34, sqrt(airDensity(y) / 1.225));
tf = turnFactor(m.pos.y);
if (w.highAltImmune) tf = max(tf, 0.78);          // SPO-9 落雷专用
maxTurn = m.turn * tf * dt;
B = M3.turnToward(m.fwd, m.up, desired, maxTurn);
```

**海平面时 `turnFactor = 1`；密度降到海平面 7.2%（20 km）时
原始比值是 `sqrt(0.072) ≈ 0.27`，被 0.34 的下限兜住**，
所以 20 km 处函数实际返回 **0.34**。
一枚海平面 3.4 rad/s 的格斗弹（SUT-11），在 20 km 只剩约 1.16 rad/s
（3.4 × 0.34）——**这就是"高空导弹退化成一门有制导的炮"的实现**。

`highAltImmune`（只有 `hva` SPO-9）把下限抬到 0.78：舵面比同级大一倍，
"过载不随空气变稀而崩塌"。这是"高空拦截弹"在这个游戏里唯一说得通的定义。

**注意**：数据里几乎每枚弹都写着 `highAltScale: true`，但**没有任何代码读它**——
`turnFactor` 是无条件应用的。那个字段目前只是数据侧的标注。

### 转弯消耗动能

```js
var want  = M3.angleBetween(m.fwd, desired);           // 本帧需要转过的角
var used  = min(want, maxTurn) / max(1e-5, dt);        // 实际转弯率 rad/s
var load  = clamp(used / 3.0, 0, 1);
m.speed   = max(170, m.speed - load * 62 * dt);
```

**没有这一条，"躲导弹"在物理上就不可能**：导弹在动力段之外照样能满过载
无限机动，玩家的桶滚和 3/9 线规避全都没有意义——因为对手不累。

现在满过载转弯 0.5 秒掉约 31 m/s（`62 × 0.5`）。这是"拖垮导弹"能成立的前提。

### 视场与丢失

```js
off = angleBetween(m.fwd, los);
if (off > 1.35) { m.lostTime += dt; if (m.lostTime > 0.5) m.seekerOn = false; }
else            { m.lostTime = 0; ...绕轴转向... }
```

即目标偏出 **±75°** 持续 **0.5 秒** → 丢失。

`reAcquire`（SUT-11 锥刺、SUT-7 蜂刺、BIN-4 中继）：丢失后
搜索 **2.6 km** 内的敌机重新锁定**一次**（`m.reDone` 把关），
并且跳过 `m.spoofed`——刚刚用干扰弹骗过它的那架不再重锁。

### 激光制导（休眠分支）

`seeker === 'laser'` 时，弹每帧问载机"你还在照着目标吗"：
载机机头与目标夹角必须小于 `LASER_CONE = 25°`。照射断了弹**不消失**，
带着已有速度和弹道继续自由落体。

**当前没有任何武器使用 `seeker: 'laser'`**（PEJ-30 已改成 `eo` 光电制导），
所以整条路径是休眠的；机制本身完整，将来给某件弹填上 `'laser'` 即可。

### 命中与近炸

```js
if (dist < m.prox + 6) detonate(m, t, world);
detonate: explode(...); SFX.boom(0.75);
          if (t.alive && dist(t.pos, m.pos) < m.prox + 14) damage(t, m.dmg, ...);
```

近炸不会直接秒杀，而是造成 `dmg` 伤害；只有目标仍在 `prox + 14` 内
才真正扣血。这避免了"擦过就算命中"。

### 尾迹

只有**带发动机的弹**拉烟（按 `ballistic` 判断，不按 `unguided`）：
每隔 `0.012 s` 生成一个粒子，动力段内是白色（`#e8e2d0`），
滑翔段转灰（`#b9b4a6`）。

**这两个字段是正交的**，判断搞混会正好反了：

| 武器 | 发动机 | 制导 | 尾迹 |
|---|---|---|---|
| PEJ-6 撒星 | 有 | 无 | 有 |
| GUT-9 滑翔锤 | 无 | 有 | 无 |
| PEJ-30 铁蒺藜 | 无 | 有 | 无 |
| PEJ-9 碎玉 | 无 | 无 | 无 |

---

## 子弹

```js
b.prev = b.pos;                    // 供渲染画曳光线段
b.vel.y -= G * dt;                 // 只有重力，忽略空气阻力
b.pos += b.vel * dt;
b.life -= dt;                      // life = gunRange / w.speed
```

`fireGun()` 按射速节流：`rps = w.rpm / 60`，`gunTimer = 1 / rps`；
一轮打 `max(1, round(rps * 0.033))` 发（约 1/30 秒的量），
从左右炮口交替出膛，初速是 `dir * w.speed + a.vel`（继承载机速度）。
子弹寿命由**射程**算出，18 km 以上改用 `highRange`。

命中检测用 `M3.raySphere(prev, dir, target, r)` 对**上一帧到当前帧的线段**
求交——子弹速度 1100 m/s，60 fps 下每帧走 18 m，点检测会漏掉目标。
飞机命中半径 7.5 m，目标物用 `t.radius`。

**注意**：`fireGun()` 用 `gunTimer` 按射速节流，不要每帧无条件调用。

---

## 定向能拦截

在 `game.js` 的 `updateDEW(dt, actor)`。每帧判定：

```js
chance = (actor.pos.y > 18000 && w.highAltChance) ? w.highAltChance : w.interceptChance;
if (Math.random() > chance * dt / 1.2) continue;
```

`dt / 1.2` 是把"整个拦截窗口内 55% 成功率"折算成每帧概率，
窗口长度按导弹在这段距离的飞行时间（约 1.2 秒）估算。

**改这个公式要同时想清楚**：现在 `chance = 0.55` 对应的实际成功率
大约就是 55%，因为 1.2 秒的窗口里累积接近一次完整判定。

成功一次消耗一枚充能（`spCharges`），烧毁导弹并播 `laser()` 音效；
充能由 `spChargeT` 按 `w.recharge`（18 s）逐发恢复，
见 [weapons.md](weapons.md#定向能拦截)。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 大气模型 | `entities.js` `airDensity()` |
| 操纵面权限阈值（22 kPa / 0.13） | `ctrlFactor()`；机型覆盖看 `data.js` 的 `ctrlFull` / `ctrlFloor` |
| 满权限滚转倍率与下限（1.8 / 0.28） | `stepAircraft()` 的 `dRoll` |
| 推杆权限（0.5） | `stepAircraft()` 的 `PITCH_DOWN_K` |
| 高 G 倍率上限（2.3） | `stepAircraft()` 的 `gl` 钳制 |
| 导弹过载衰减下限（0.34 / 0.78） | `turnFactor()`、`highAltImmune` 分支 |
| 转弯掉速（62 / 170 下限） | `stepMissile()` 的能量消耗段 |
| 高空推力衰减曲线 | `stepAircraft()` 里 `y > 11000` 那段 |
| 爬升掉速系数（52） | 同上，`vTarget -= fwd.y * 52` |
| 速度钳位（0.42·vStall – 1.12·vMax） | `stepAircraft()` 的最后一行 |
| 硬天花板（23 000 m） | `stepAircraft()` 的 `pos.y > 23000` |
| 机型性能 | `data.js` 的 `phys` 字段 |
| 失速惩罚（×0.34、低头 0.55） | `stepAircraft()` 的失速段 |
| 导弹提前量折扣 | `data.js` 的 `MISSILE_LEAD`（缺省 0.6） |
| 可变后掠翼曲线与角度 | `stepAircraft()` 的 `sweep`、`models.js` 的 `sweepPt()` |
