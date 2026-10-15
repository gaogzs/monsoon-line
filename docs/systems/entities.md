# 运行时实体系统

代码：`js/entities.js`（实体本体）· `js/game.js`（世界对象、发射链路、锁定、清理）· `js/data.js`（`WEAPONS` / `AIRCRAFT` 数据表）

> 大气、动压、姿态积分、导弹动力学的**数值模型**见 [flight-model.md](flight-model.md)。
> 本文只讲运行时实体系统：对象长什么样、谁创建谁销毁、一次发射与一次命中是怎么走完的。

---

## 1. 职责边界

`entities.js` 提供全局 `Ent`，做四件事：

| 做 | 不做 |
|---|---|
| 构造与推进飞机 / 导弹 / 子弹 / 粒子 / 目标物 | 大气模型与操控权限曲线的**取舍理由**（见 flight-model.md） |
| 伤害与击杀结算（`damage` / `kill` / `killGround`） | 发射槽分配、装填计时、齐射枚数（在 `game.js` `launch()`） |
| 机炮射速节流与子弹生成（`fireGun`） | 谁能打谁、锁定进度（`game.js` `updateLock` / `cycleTarget` / `targetMismatch`） |
| 干扰弹投放与欺骗（`breakLock`） | AI 控制律、编队、航线（`ai.js`） |
| 每帧积分位置 / 姿态 / 速度 | 绘制（`render.js` / `hud.js`） |

一句概括：**`entities.js` 是纯逻辑，不碰 DOM、Canvas、WebAudio**（音效只通过全局 `SFX` 调用）。所有实体都是普通对象字面量，没有类、没有原型方法——想加字段就直接加，`compact()` 也不会替你清理。

---

## 2. 完整公开接口

`Ent` 的全部导出（`entities.js` 末尾），逐个列出：

| 成员 | 签名 | 语义 |
|---|---|---|
| `airDensity` | `airDensity(y) → kg/m³` | ISA 标准大气密度。见 flight-model.md |
| `qOf` | `qOf(y, speed) → Pa` | 动压 `½ρv²` |
| `ctrlFactor` | `ctrlFactor(y, speed, ac) → 0..1` | 气动权限系数，端点可被机型覆盖 |
| `turnFactor` | `turnFactor(y) → 0.34..1` | 导弹转弯率的气动缩放 |
| `makeAircraft` | `makeAircraft(o) → a` | 造飞机。`o = {type, team, x/y/z, fwd, speed, throttle, special, isPlayer, isDrone, flares, radio, group}` |
| `stepAircraft` | `stepAircraft(a, dt, world)` | 飞机每帧：动压→姿态→速度→位置→冷却→拖烟 |
| `makeMissile` | `makeMissile(o) → m` | 造导弹/炸弹。`o = {weapon, team, pos, fwd, speed, target, owner}` |
| `stepMissile` | `stepMissile(m, dt, world)` | 导弹每帧：动力段→导引→位置→近炸→尾迹 |
| `effectiveLife` | `effectiveLife(w, y) → s` | 动力段时长，冲压弹在 18 km 以上缩短 |
| `breakLock` | `breakLock(a, world) → bool` | 投放一组干扰弹（热焰弹 + 箔丝）并尝试欺骗来袭弹 |
| `fireGun` | `fireGun(a, world)` | 按射速节流开火，生成子弹 + 炮口火光 |
| `stepBullet` | `stepBullet(b, dt)` | 子弹每帧：重力 + 位移 + 寿命 |
| `SLOT_EMPTY` | 常量 `1e9` | 空挂架标记：永远不会装填完成 |
| `spawnParticle` | `spawnParticle(list, pos, vel, life, size, color, opt)` | 生成一个粒子。`opt = {grow, alpha, drag, grav}` |
| `stepParticles` | `stepParticles(list, dt)` | 粒子每帧：寿命 → 位移 → 阻力 → 重力 |
| `explode` | `explode(list, pos, scale, count)` | 爆炸：多色火球 + 黑烟 |
| `damage` | `damage(ent, amt, world, source) → bool` | 对**飞机**结算伤害（含装甲减伤），返回是否击杀 |
| `kill` | `kill(ent, world, groundImpact, source)` | 击落飞机：爆炸 + 音效 + `source.kills++` |
| `killGround` | `killGround(ent, world)` | 摧毁目标物：按半径缩放爆炸 + `SFX.bigHit()` |
| `explode2` | 同上 `explode` | 纯别名，历史遗留 |
| `makeTarget` | `makeTarget(o) → t` | 造目标物（平台 / 设施） |
| `stepTarget` | `stepTarget(t, dt, world)` | 目标物每帧：漂移 + 受损下沉 |
| `randUnit` | `randUnit() → 单位向量` | 球面均匀随机方向（爆炸、干扰弹用） |

**不导出的内部函数**：`detonate(m, t, world)`（近炸命中判定）、`killMissile(m, world, hit)`。它们只在 `stepMissile` 内部调用，外部模块要击落导弹请直接置 `m.alive = false`（`updateDEW` 就是这么做的）。

---

## 3. 关键数据结构

### 3.1 飞机 `a`（`kind: 'air'`）

`makeAircraft()` 建立字段，`game.js` / `missions.js` 再补一批。**后续开发者靠这张表上手**：

```js
{
  kind:'air', team, type, ac,          // ac 指向 AIRCRAFT 条目（ctrlFull/ctrlFloor 从这读）
  phys, model, name, nick,
  alive, isPlayer, isDrone,
  pos, fwd, up, right,                 // 三个正交基，right = up × fwd
  speed, vel, throttle, ab,
  hp, maxHp,
  ctrl:{pitch,roll,yaw},               // -1..1 输入
  gun, gunAmmo, gunHeat, firingGun, gunTimer,
  special, spAmmo, spCd,
  slotCd:{},                           // { 武器id: [槽1剩余, 槽2剩余, ...] }
  spActive, spCharges, spChargeT,      // ECM 生效 / DEW 充能
  /* 认知电子战的闭环（设定 7.3）：ewT 开机时长、ewBurnT 对手完成对抗的
     时刻、ewPower 当前压制强度（唯一出口）、ewWid 用的哪件吊舱、
     suppressed 自己被压制的程度、rwrT/rwrSrc 被主动雷达照射的感知 */
  ewT, ewBurnT, ewPower, ewWid, ewLockReduce, ewFieldR, ewFieldK,
  suppressed, rwrT, rwrSrc,
  flares, flareCd,                     // 单位是"组"
  target, lockProgress, locked, rwr,   // rwr 见坑 §7
  q, stall, dead, smokeTimer, trailTimer,
  ai, radio, kills, group
}
```

运行期由别处补上的字段（同样是实体的组成部分）：

| 字段 | 写入者 | 用途 |
|---|---|---|
| `label` | `game.js` / `missions.js` | 呼号，与 `name`（机型）分开 |
| `radius` | `missions.js` | 敌机命中半径（8），轰炸机 22 |
| `loadoutList` / `ammoPool` / `loadout` | `game.js` `startMission` | 挂载列表 / 各武器储备 / 原始配置 |
| `wpIdx` / `spSalvo` | `game.js` | 当前挂载下标；`spSalvo` **写入后无人读取** |
| `loadFactor` / `armor` / `lockResist` / `lockRangeK` / `silentLock` | `game.js` `startMission`（玩家）/ `missions.js` `spawnEnemy`（敌机 `pods`） | 重量惩罚与被动吊舱加成。**两边同源** —— 都走 `Ent.passiveEffects()`；`silentLock` 是被动测距，决定对方 RWR 收不收得到告警 |
| `gLoad` / `brake` / `hiG` | `game.js` `controlPlayer` | 高 G 倍率 / 减速板 / HUD 指示 |
| `sweep` | `stepAircraft` | 可变后掠翼位置（仅 `ac.variableSweep`） |
| `ai` | `AI.attach` | 见 [ai.md](ai.md) |
| `route` | `missions.js`（轰炸机） | 走 `AI.updateRoute`，不参与空战 |
| `recon` / `flee` / `bigTarget` / `weaponPod` / `isAce` / `wave` / `behavior` / `wingIdx` | `missions.js` | 任务脚本自用标签 |
| `wdPrev` / `wdStill` | `game.js` `watchdog` | 看门狗状态（见 §5.6） |
| `aimX` / `aimDown` / `aimMag` / `aimUpright` | `game.js` `updateMouseAim` | 鼠标引导输入，被 `AI.steerTo` 读取 |

### 3.2 导弹 / 炸弹 `m`（`kind: 'missile'`）

```js
{ kind:'missile', team, weapon, w, model, alive,
  pos, fwd, up, right, speed, vel,
  target, age, life, dmg, turn, prox,
  owner, reDone, trailTimer, seekerOn, lostTime }
```

- `w` 是 `WEAPONS[weapon]` 的引用，所有弹道参数都从这读，弹体本身**不复制**它们。
- `vel` 只在**无动力弹**（`w.ballistic`）里独立累积；有发动机的弹每帧 `vel = fwd × speed`。
- 运行期追加：`spoofed`（骗到它的飞机，见 `breakLock`）、`laserLost`（激光照射丢失，当前无武器使用）。

### 3.3 子弹 `b`

```js
{ kind:'bullet', team, alive, pos, prev, vel, dmg, life, owner }
```

`prev` **只给渲染画曳光线段用**——命中检测不用它，`game.js` `scanShot()` 会自己按 `pos - vel*dt` 反推上一帧位置。

### 3.4 粒子 `p`

```js
{ pos, vel, life, life0, size, color, alive, grow, alpha, drag, grav }
```

渲染侧上限 900（`game.js` `compact()` 裁掉最旧的），加色叠加绘制。见 [rendering.md](rendering.md#粒子)。

### 3.5 目标物 `t`（`kind: 'target'`）

调节单元、浮空中继平台、地面测控平台、防空浮台、前进基地都是它：

```js
{ kind:'target', team, ttype:'air'|'ground', label, model, alive, dead,
  pos, fwd, up, right, speed, vel,
  hp, maxHp, radius, ground, big, drift, drifting,
  fireCd, weapon, value }
```

- `ttype:'air'` 且血量低于一半时会缓慢下沉（`stepTarget`）。
- `drift` 是横向漂移速度；`drifting` 是相位累积器，靠 `cos/sin` 产生往复而非直线漂移。
- `weapon` 非空时由 `game.js` `updateTargets()` 当成防空阵地开火；`team` 默认 1。
- 任务脚本追加：`friendlyAsset`（打坏扣分）、`vital`（**写入后无人读取**）。

### 3.6 世界对象 `world`

`world` 在 `game.js` `newWorld()` 里建立（普通对象，没有类），任务 `spawn()` 再往里塞关卡专属字段：

```js
// newWorld() —— 所有关卡都有
{ time, actors[], missiles[], bullets[], particles[], targets[], wings{},
  player, flags{}, objective, objectiveSub,
  roeBlocked, detected,
  killed, hitsLanded, shotsFired,
  fireMissile(actor, target), radio }

// 任务脚本追加（见 missions.md §3）
{ baseTarget, baseHpFull, dangerAltitude, roeActive, baseWarnT,
  cells[], ace, aceSpawned, friendlyLoss }
```

`flags` 是**自由字典**：任务脚本用它做一次性触发（`flags.tallyDone`、`flags.ambushDone`…），不分区、不清理，加新键时务必用独一无二的名字。

`world.fireMissile` 是 AI 唯一的发射入口（`ai.js` 里调它），内部就是 `launch()` 加一声距离衰减的导弹音。

---

## 4. 关键流程

### 4.1 一帧内实体更新顺序（`game.js` `update()`）

```
world.time += dt；Radio.update(dt)
controlPlayer(dt)                      ← 输入 → player.ctrl / throttle / gLoad
Ent.stepAircraft(player, dt, world)
updateLock(dt)                         ← 锁定进度（玩家）
updateDEW(dt, player)                  ← 定向能自动拦截
for each actor:  AI.update() → Ent.stepAircraft() → updateDEW()   ← 顺序不能反
watchdog(dt)                           ← 静止兜底
for each missile: Ent.stepMissile()    ← 导引、近炸、尾迹
for each bullet:  Ent.stepBullet()
resolveBullets(dt)                     ← 线段-球命中检测（子弹 + 无制导弹）
updateTargets(dt)                      ← 目标物漂移 + 地面火力
Ent.stepParticles(world.particles, dt)
mission.tick(world, dt)                ← 任务触发器
compact()                              ← 清死对象、粒子截断到 900
mission.lose(world) → finish(false)
mission.win(world)  → finish(true)
updateCamera(dt)
```

两个容易忽略的次序：

- **先 `lose` 后 `win`**。玩家和基地同时没了的时候判失败。
- **AI 必须在 `stepAircraft` 之前**：AI 写的是 `a.ctrl`，飞机要读它。

### 4.2 一次发射的完整链路（玩家）

```
keydown Enter / 鼠标右键
  → fireSpecial()            game.js：查 kind / 弹药 / spCd / 目标类型匹配
  → launch(player, t, world) game.js
      ├ 找槽：slotCd[special] 里第一个 ≤0 的槽（找不到就按不出去）
      ├ 交战规则：roeBlocked 且 kind 是 asm/agm/bomb → 拒绝
      ├ 由槽下标算挂点位置：side = si%2 ? +1 : −1，rank = floor(si/2)
      ├ for q in 0..(salvo−1): Ent.makeMissile(...) → world.missiles.push
      ├ spAmmo −= nShot；slotArr[si] = w.cd；spCd = min(slotArr)
      └ 音效 / ammoPool 回写 / shotsFired++
  → 之后每帧 stepMissile()
```

**AI 走的是另一条路**：`world.fireMissile(actor, target)` → `launch()`。AI 没有填充 `slotCd`，所以 `launch()` 退回到 `spCd` 单冷却分支（`else if (actor.spCd > 0) return false`）。写新武器时别假设 AI 也有槽数组。

### 4.3 装填与冷却：`slotCd` 的真实语义

- 槽数 = 该武器占用的**挂载点数**（`game.js` `startMission` 按 `wl[wi].salvo` 建数组）。
- 按一次发射键只打**一个**槽（外加该武器的 `salvo` 枚共用这一槽，如 GIR-5 三联装）。
- 每个槽独立倒计时（`stepAircraft` 里的 `for (var ck in a.slotCd)`），切挂载不会跳过装填。
- 储备弹少于挂架数时，多出来的槽一开始就是 `SLOT_EMPTY`（`1e9`），永远不会装填完成——HUD 显示的是"没得装了"，而不是骗人的"装填中"。
- 装填还会检查 `pool`（储备弹数）：就绪槽已等于剩余弹数时，这个槽不再恢复。

### 4.4 一次命中的结算链路

```
导引弹：stepMissile → dist < prox+6   → detonate → 若 dist < prox+14 → damage(target)
无制导弹/子弹：resolveBullets → scanShot
    ├ 对飞机：raySphere(prev, dir, a.pos, 7.5)，命中半径**写死 7.5**
    └ 对目标：raySphere(prev, dir, tg.pos, tg.radius || 8)
       ├ 飞机 → Ent.damage(a, dmg, world, owner) → hp≤0 → Ent.kill()
       └ 目标 → hitTarget()（game.js）→ hp≤0 → Ent.killGround()
```

- `Ent.kill()` 按结构完整度决定爆炸规模（`hp>150` 用 3.2 / 26 个粒子，否则 2.2 / 20），并给 `source.kills++`。
- `Ent.damage()` **会**扣装甲减伤（`ent.armor`，上限 60%）；`hitTarget()` **不会**——目标物不吃装甲，这是刻意的（装甲是飞机的挂载件）。
- 无制导弹也走 `scanShot`：它们没有导引头，唯一能命中的方式就是撞上去。

### 4.5 干扰弹链路

```
按住 V（玩家）或 AI 的 evade 分支
  → breakLock(a, world)
      ├ flares≤0 或 flareCd>0 → 直接返回 false
      ├ flares−−；flareCd = 0.12（很短，按住就连投）
      ├ 6 个热焰弹粒子（#ffd070，向机体下方抛）+ 14 个箔丝粒子（#e6eef4）
      └ 遍历 world.missiles：target===a 且 random() < m.w.flare
            → m.target=null；seekerOn=false；lostTime=1；
              reDone=true（关键：否则带 reAcquire 的弹下一帧就锁回来）
              spoofed=a（重捕获时避开这架）
```

`flare` 字段本身就是"被干扰概率"：**越大越容易被骗**。当前数值里雷达弹平均比红外弹更容易被骗，与直觉相反，属于已知待修问题（见 `entities.js` 里那段注释）。

---

## 5. 参数速查表（想改 X → 在哪）

| 想改什么 | 在哪 |
|---|---|
| 每槽装填时间 | `data.js` `STORE_COOLDOWN`（**每槽**，覆盖 `WEAPONS[].cd`） |
| 一次按键打几枚 | `data.js` `WEAPONS[].salvo` + `game.js` `launch()` |
| 空挂架标记值 | `entities.js` `SLOT_EMPTY`（`1e9`） |
| 机炮射速 / 单发伤害 / 初速 | `data.js` `WEAPONS[k3/k7]` 的 `rpm` / `dmg` / `speed` |
| 机炮有效射程（含高空翻倍） | `data.js` 的 `range` / `highRange`，由 `fireGun()` 换算成子弹寿命 |
| 机炮散布 | `data.js` `spread`，`fireGun()` 里做成随机方向偏移 |
| 飞机命中半径（7.5 m） | `game.js` `scanShot()` |
| 目标物命中半径 | `makeTarget()` 的 `radius`，默认 10 |
| 爆炸规模 / 颜色 | `entities.js` `explode()` 的 `cols` 与 `count` |
| 受损拖烟阈值 | `stepAircraft()` 里 `a.hp < a.maxHp * 0.45` |
| 加力尾焰间隔 | `stepAircraft()` 里 `trailTimer = 0.028` |
| 粒子数量上限 | `game.js` `compact()` 里的 `> 900` |
| 干扰弹投放间隔 / 组数 | `entities.js` `breakLock()` 的 `flareCd = 0.12`、`flares` 初值 80 |
| 被干扰概率 | `data.js` `WEAPONS[].flare` |
| 锁定速率 / 锥角 / 距离 | `game.js` `updateLock()` + `data.js` 的 `lockCone` / `lockDist` / `nezer` / `seeker` |
| 地面火力开火节奏 | `game.js` `updateTargets()`：`t.fireCd = w.cd + rnd(0,2)` |
| 看门狗静止判定 | `game.js` `WD_LIMIT = 1.5`、`moved < 0.02` |
| 飞行天花板 / 撞地高度 | `stepAircraft()` 里的 `23000` 与 `pos.y <= 2` |
| 大气 / 动压曲线 | `airDensity()` / `qOf()` / `ctrlFactor()`，理由见 flight-model.md |

---

## 6. 与其它模块的依赖

| 依赖 | 方向 | 说明 |
|---|---|---|
| `M3` | 被依赖 | 所有向量与旋转。`rotAxis` / `orthonormalize` / `raySphere` / `turnToward` / `angleBetween` |
| `WEAPONS` `AIRCRAFT` | 被依赖 | 弹道参数与机型性能；`makeAircraft` 找不到机型会**静默回退到 `AIRCRAFT[0]`** |
| `SFX` | 被依赖 | `boom` / `flare` / `hit` / `laser` / `bigHit` |
| `world` | 参数 | 由 `game.js` 建立，实体只读它做归属与音效（`world.particles`） |
| `AI` | 依赖 `Ent` | `AI.update` 写 `a.ctrl`，调 `Ent.fireGun` / `Ent.breakLock` |
| `missions.js` | 依赖 `Ent` | `makeAircraft` / `makeTarget` / `spawnParticle` / `damage` / `killGround` |
| `game.js` | 依赖 `Ent` | `launch()` / `updateLock()` / `updateDEW()` / `watchdog()` / `pushStores()` |

---

## 7. 易踩的坑与设计取舍

1. **`a.rwr` 曾经是死字段，现在仍不完整。** 它声明为"正在锁定本机的导弹/敌机"，但至今**没有任何一处写入它** —— 导弹告警实际是 `game.js` `update()` 每帧扫描 `world.missiles` 算出来的。
   真正在用的"被照射感知"是 `rwrT` / `rwrSrc`（`ai.js` 每帧扫描 `world.actors` 写）：它决定 AI 会不会回头咬正在照它的人，也是被动吊舱（`silentLock`）与 EMCON-Δ 的价值所在。看到 `rwr` 别以为有现成的雷达告警系统 —— 它还是空的。

2. **`damage()` 扣装甲，`hitTarget()` 不扣。** 给目标物加"减伤"要自己写，`ent.armor` 对它无效。

3. **导引弹丢失目标后不会撞上任何东西。** 近炸判定在 `if (t && m.seekerOn)` 分支里；`t` 为 null 时弹只会直飞到期或坠海。这是"干扰弹真的有用"的实现方式，但也意味着导引弹没有"流弹误伤"。

4. **无制导弹必须给初速。** `makeMissile` 里 `vel` 对 `ballistic` 弹显式赋值；给 0 的话它就"从空中静止开始往下掉"，抛出的动能全丢。这是踩过的坑，注释里留着。

5. **尾迹判据是 `ballistic` 不是 `unguided`。** 两者正交：有发动机 / 无制导的火箭巢应当拉烟，无发动机 / 有制导的滑翔弹不应当。按 `unguided` 判断会把两类全弄反。

6. **槽数组是**按武器**建的，渲染是**按挂点组**遍历的。** `game.js` `pushStores()` 必须自己维护 `used[wid]` 起始下标，否则两组挂同一种弹时会共用前两个槽，出现"打掉一个、两组同时消失"。

7. **挂载重量是整体替换 `p`，不是就地缩放。** `stepAircraft()` 里 `p = { vMax, vMil, vStall, accel, decel, pitch, roll }`——少列一个字段（历史上漏过 `accel`/`decel`）就会让那个字段变成 `undefined`，加速变成瞬时。加字段时记得同步这里。

8. **AI 不走 `slotCd`。** AI 的 `slotCd` 永远是空对象，`launch()` 对它退回单冷却 `spCd`。给 AI 加多挂载逻辑要同时改 `launch()` 与 `makeAircraft` 的初始化。

9. **`hitTarget()` 里 `var penal = ...` 算了没用。** 真正的误伤扣分是紧接着那段 `source.isPlayer` 判断累加 `world.friendlyLoss`。别把这个变量当成扣分依据。

10. **写死 `7.5 m` 的飞机命中半径与 `radius` 字段并存。** 飞机的大小编码在 `scanShot()`，目标物的大小编码在 `t.radius`，两者不同源，改大飞机不会改变它被弹体命中的判定。

11. **看门狗的根因没定位。** 任何飞机静止超过 1.5 秒会被强制重置姿态与速度并 `console.warn`。这是兜底，不是修好了——警告里带有当时的速度、姿态、操控输入，下次真触发时它就是定位起点。

12. **`spSalvo` / `t.vital` / `a.firingAllowed` / `world.roeActive` / `world.baseHpFull` / `a.gunHeat` 都是"写了没人读"的字段。** 看到它们别以为对应机制存在（`gunHeat` 还在每帧递减，但没有任何地方读它——机炮过热是个没做完的机制）。

---

## 8. 一句话导航

改数值先看 `data.js`（武器、机型），改**行为**再看 `entities.js`；改**发射许可与锁定**看 `game.js`。飞行模型的理由全部在 [flight-model.md](flight-model.md)，别在本文里重复第二遍。
