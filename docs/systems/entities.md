# 运行时实体系统

代码：`Ent`（实体本体，`js/engine/entities/*.js`）· `Game`（世界对象、发射链路、锁定、清理，`js/engine/game/*.js`）· `js/data/`（`WEAPONS` / `AIRCRAFT` 等数据表，由 `Registry` 封存）

> 大气、动压、姿态积分、导弹动力学的**数值模型**见 [flight-model.md](flight-model.md)。
> 本文只讲运行时实体系统：对象长什么样、谁创建谁销毁、一次发射与一次命中是怎么走完的。

---

## 1. 职责边界

`Ent` 提供全局 `Ent`，做四件事。v3.0.0 起它不再是一个巨型闭包，而是 `js/engine/entities/` 下按职责命名的小文件（私有状态走 `Ent.$`，公开接口集中在 `zz-api.js`；规则见 [modules.md](modules.md)）：

| 文件 | 管什么 |
|---|---|
| `physics.js` | 大气密度 / 动压 / 控制因子 / 转弯因子 / 阻力系数、地形钩子（`terrainY` `groundY` `agl` `setTerrain`） |
| `aircraft.js` | `makeAircraft` / `stepAircraft` / `curLoadFactor` / `nozzlesOf`；`stepAircraft` 开头按 `a.deck` → `a.psm` → `a.vtolOn` 的顺序把整帧交给独立分支 |
| `deck.js` | 甲板起飞（批次 6.1b）：`stepDeck` / `deckSlot` / `deckPose` / `putOnDeck`，见 §9 |
| `vtol.js` | 垂直起降低速区飞行分支（批次 6.2）：`stepVtol` / `vtolWatch` / `vtolWingK` / `vtolSpeedTarget`，见 §9 |
| `mounts.js` | 挂点适配（`fitsKind`）、NPC 挂载分配（`buildNpcMounts`）、选弹（`chooseWeapon` / `setWeapon` / `weaponMatchesTarget`）、挂载物位置（`storePos` 等） |
| `missile.js` | `makeMissile` / `stepMissile`、红外重捕获、诱饵二次欺骗 |
| `range.js` | 有效射程、发射包线、`aiReach` / `lockOff` |
| `radiation.js` | 反辐射判定与烧穿干扰（`jam*`、`isRadiating`） |
| `warhead.js` | 加固与战斗部系数、近炸 / 碰炸、`detonate`、`breakLock` / `breakLockFor`、设施伤害分流（`hitSurface` / `hitAny`） |
| `guns.js` | 机炮与炮弹（`fireGun` / `fireGunFrom` / `stepBullet`） |
| `damage.js` | `damage` / `kill` / `killGround` |
| `ecm.js` | 被动吊舱与匿踪（`passiveEffects` / `setStealth` / `openEcm`） |
| `particles.js` | 粒子、爆炸、舰尾浪花 |
| `targets.js` | `makeTarget` / `stepTarget` |


| 做 | 不做 |
|---|---|
| 构造与推进飞机 / 导弹 / 子弹 / 粒子 / 目标物 | 大气模型与操控权限曲线的**取舍理由**（见 flight-model.md） |
| 伤害与击杀结算（`damage` / `kill` / `killGround`） | 发射槽分配、装填计时、齐射枚数（在 `Game` `launch()`，`engine/game/launch.js`） |
| 机炮射速节流与子弹生成（`fireGun`） | 谁能打谁、锁定进度（`Game` `updateLock`，`engine/game/lock.js`；`cycleTarget` / `targetMismatch` 在 `ui/input.js`） |
| 干扰弹投放与欺骗（`breakLock`） | AI 控制律、编队、航线（`AI`） |
| 每帧积分位置 / 姿态 / 速度 | 绘制（`js/render/` / `HUD`） |

一句概括：**`Ent` 是纯逻辑，不碰 DOM、Canvas、WebAudio**（音效只通过全局 `SFX` 调用）。所有实体都是普通对象字面量，没有类、没有原型方法——想加字段就直接加，`compact()` 也不会替你清理。

---

## 2. 完整公开接口

`Ent` 的全部导出（`js/engine/entities/zz-api.js`，`Ent.xxx = $.xxx`），逐个列出（表里没列的 `airDragK` `storeHy` `nozzlesOf` `surfaceBelow` `forEachStoreSlot` `storeForSlot` `targetClass` `curLoadFactor` `contactScan` `setEcm` `gunMuzzle` `flashRings` `wakeSpray` `glideReach` `maxReach` `flyTo` `envelopeRange` `envelopeCached` `displayRange` `naturalPoint` `gunLead` `groundY` `terrainY` `isLand` `agl` `SEA_Y` `setTerrain` `finFootprint` `jam*` `gunResistK` `SMALL_CAL` 等见文末与 [modules.md](modules.md)）：

| 成员 | 签名 | 语义 |
|---|---|---|
| `airDensity` | `airDensity(y) → kg/m³` | ISA 标准大气密度。见 flight-model.md |
| `qOf` | `qOf(y, speed) → Pa` | 动压 `½ρv²` |
| `ctrlFactor` | `ctrlFactor(y, speed, ac) → 0..1` | 气动权限系数，端点可被机型覆盖 |
| `turnFactor` | `turnFactor(y) → 0.34..1` | 导弹转弯率的气动缩放 |
| `makeAircraft` | `makeAircraft(o) → a` | 造飞机。`o = {type, team, x/y/z, fwd, speed, throttle, special, loadout, pods, isPlayer, flares, radio, group}`（无人机不再靠 `o.isDrone`，而是机型 `tags.unmanned`，造机时 `a.tags = ac.tags`）。非玩家会顺手建 `ammoPool` / `slotCd`（§ 3.1） |
| `stepAircraft` | `stepAircraft(a, dt, world)` | 飞机每帧：挂载惩罚→动压→失速→姿态→速度→位置→冷却→拖烟。`a.deck` 非空整帧交给 `stepDeck`、`a.psm` 交给 `stepPSM`、`a.vtolOn` 交给 `stepVtol`（后两者在尾部回到共用的 `stepAircraftTail`） |
| `stepDeck` / `deckSlot` / `deckPose` / `putOnDeck` / `DECK` | `stepDeck(a, dt, world)` / `deckSlot(host, want, now) → 跑道下标\|-1` / `deckPose(host, ri) → {pos, fwd}` / `putOnDeck(a, host, ri) → a` / 常量表 | 通用甲板起飞，见 §9。`stepDeck` 一般由 `stepAircraft` 派发，导出是给探针用 |
| `stepVtol` | `stepVtol(a, dt, world)` | 垂直起降悬停分支，由 `stepAircraft` 在 `a.vtolOn` 时派发，见 §9。`vtolWatch` / `vtolWingK` / `vtolSpeedTarget` 只在 `Ent.$` 内部，不导出 |
| `fitsKind` | `fitsKind(w, kind, playerStyle) → bool` | 这件武器挂得住这种挂点吗。玩家读 `fits`，NPC 读 `npcFits`（缺省退回 `fits`） |
| `mountPlan` | `mountPlan(a) → [弹种或 null]` | 逐组挂载分配（逐组配置 → 吊舱 → 制式弹），下标对齐 `ac.hardpointGroups` |
| `storePos` | `storePos(a, g, pt) → 世界坐标` | 一个挂点的挂载物该画在哪。`pt` 只有 (横向, 前后)，高度取 `g.hy` 或按类型给的默认值（`STORE_HY`） |
| `STORE_HY` | `{ tip, light, heavy, belly }` | 默认吊挂高度表（米，机体系）。机型可用挂点组的 `hy` 覆盖 |
| `chooseWeapon` | `chooseWeapon(a, t, dist) → 武器id\|null` | AI 开火前挑一件：按目标类别（对空 / 对面）+ 射程（`aiReach`，够得着的取最短）。判据见 §7 坑 14 |
| `effRange` | `effRange(w, alt) → m` | 有效动力射程：用 `stepMissile` 朝远处假目标直飞一次量出，按 2 km 高度档缓存在 `w.__eff`；带 loft 的对面弹再用 `loftReach/hitsAt` 对真目标二分修正。模拟世界带 `silent`，`Combat.detonate` 不出声。例：BOX-14 `lockDist` 9000 → 4 km 高约 8.4 km；SPO-6 8200 → 约 7.6 km |
| `aiReach` | `aiReach(w, alt, k=0.9) → m` | `min(lockDist, effRange × k)`。`AI` 的 `surfaceTargetFor`（`ai/util.js`）与开火分支（`ai/brain.js` / `ai/tactics.js`）、`chooseWeapon`、`Game` `pickTargetFor`（舰载防空，`engine/game/combat.js`）、`engine/route.js` strike 都用它 |
| `lockOff` | `lockOff(a, t, w) → rad` | 发射离轴角：对面弹（target 是 ground/ship）只量水平方位、忽略垂直；对空弹量三维夹角。玩家对面锁定、AI `okAng`、route strike 共用 |
| `setWeapon` | `setWeapon(a, wid)` | 把它设成"当前触发的那件"（`special` / `spAmmo` / `spCd`）。玩家换弹与 AI 选弹共用 |
| `weaponMatchesTarget` | `weaponMatchesTarget(w, t) → bool` | 武器能不能打这个目标（与 `Game` 的 `targetMismatch` 同源） |
| `mountIssues` | `[string]` | 关卡里写错的 NPC 挂载（挂不上 / 能力不足）。`tools/test/smoke.js` 断言它是空的 |
| `clearMountIssues` | `clearMountIssues()` | 清空上表（测试用） |
| `makeMissile` | `makeMissile(o) → m` | 造导弹/炸弹。`o = {weapon, team, pos, fwd, speed, target, owner}` |
| `stepMissile` | `stepMissile(m, dt, world)` | 导弹每帧：动力段→导引→位置→近炸→尾迹 |
| `effectiveLife` | `effectiveLife(w, y) → s` | 动力段时长，冲压弹在 18 km 以上缩短（`stepMissile` 与尾迹颜色都用它） |
| `breakLock` | `breakLock(a, world) → bool` | 投放一组干扰弹（热焰弹 + 箔丝）并尝试欺骗来袭弹 |
| `openEcm` | `openEcm(actor, wid, threatSkill)` | 电子战吊舱开机（认知电子战闭环的入口） |
| `setStealth` | `setStealth(a, pe, wids?)` | 匿踪：`stealthValue(机体 stl, 外露挂点数)` 与吊舱 `lockResist` 经 `lockCutOf` 合并，写入 `a.stealth` / `a.lockResist`。`wids` 按挂点组下标对齐；NPC 造机时（`buildNpcMounts`）存入 `a.mountWids`，`spawnEnemy` 的 `pods` 与玩家 `startMission` 再次调用 |
| `passiveEffects` | `passiveEffects([{wid, n}]) → {lockResist, armor, lockRange, flareBonus, silentLock}` | 汇总被动吊舱效果（`armor` 封顶 0.55）。玩家（`Game` 同名包装按挂点组展开）与敌机 `pods`（`js/missions/`）共用 |
| `fireGun` | `fireGun(a, world)` | 按射速节流开火，生成子弹 + 炮口火光 |
| `fireGunFrom` | `fireGunFrom(shooter, w, muzzle, dir, world, opt)` | 生成一发炮弹（机炮和炮塔共用）：带 `gw` / `grav` / `fuze` / `blast`；`w` 写了 fuze / blast 才有近炸与起爆，航空机炮没写 |
| `shellFuze` / `detonateShell` | `(b, world)` / `(b, world, pos, direct, opt)` | 炮弹近炸检查 / 起爆（临时挂 `b.w = b.gw` 走 `Combat.detonate`）。带战斗部的炮弹寿命到点空爆、落水就地起爆（`stepBullet`） |
| `stepBullet` | `stepBullet(b, dt)` | 子弹每帧：重力 + 位移 + 寿命 |
| `SLOT_EMPTY` | 常量 `1e9` | 空挂架标记：永远不会装填完成 |
| `spawnParticle` | `spawnParticle(list, pos, vel, life, size, color, opt)` | 生成一个粒子。`opt = {grow, alpha, drag, grav}` |
| `stepParticles` | `stepParticles(list, dt)` | 粒子每帧：寿命 → 位移 → 阻力 → 重力 |
| `explode` | `explode(list, pos, scale, count)` | 爆炸：多色火球 + 黑烟 |
| `detonate` | `detonate(m, t, world)` | 兼容包装，转 `Combat.detonate`（范围伤害见 [weapons.md](weapons.md#命中与近炸)）。`clusterBurst` 已删除 |
| `isHard` | `isHard(t) → bool` | 加固目标：`t.hard` 或 `t.tags.hard`（`makeTarget` 从 `TARGETS[model].tags` 带上；旧的 `HARD_MODELS` 已并进 `js/data/targets/`） |
| `warheadK` | `warheadK(w, t) → 系数` | 战斗部对目标的系数：非加固 1；加固时 `w.tags.penetrator` 1、`cluster` 0.2、其余 0.6 |
| `hitSurface` | `hitSurface(tg, dmg, world, source)` | 对设施 / 舰船结算一次伤害：有回调走 `hitTarget`，没有就 `hp -= dmg` + `killGround`。`hitAny` 的设施分支就是它；`tools/test/smoke.js` 也直接调它测误伤计数 |
| `setTargetHitHandler` | `setTargetHitHandler(fn)` | `Game` 注册 `hitTarget(tg, dmg, source)`，制导弹 / 子母弹打设施都走它（击毁计数、误击处罚）；未注册时退回 `hp -= dmg` + `killGround` |
| `damage` | `damage(ent, amt, world, source) → bool` | 对**飞机**结算伤害（含装甲减伤），返回是否击杀 |
| `kill` | `kill(ent, world, groundImpact, source)` | 击落飞机：爆炸 + 音效 + `source.kills++` |
| `killGround` | `killGround(ent, world)` | 摧毁目标物：按半径缩放爆炸 + `SFX.bigHit()` + `world.groundKilled++` |
| `explode2` | 同上 `explode` | 纯别名，历史遗留 |
| `makeTarget` | `makeTarget(o) → t` | 造目标物（平台 / 设施 / 舰船） |
| `stepTarget` | `stepTarget(t, dt, world)` | 目标物每帧：航路或漂移 + 受损下沉 |
| `randUnit` | `randUnit() → 单位向量` | 球面均匀随机方向（爆炸、干扰弹用） |

**不导出的内部函数**：`killMissile(m, world, hit)`（撞地 / 寿命到期也起爆）；`fuzeCheck(m, t, world)`（近炸：相对运动线段最近点）；`decoyTarget(m)`（盲飞期的诱饵虚拟目标，`DECOY_R = 4`）；`irAcquire(m, world)`（红外重捕获 —— `w.target !== 'air'` 的弹只扫 `world.targets`）；`decoyRecheck(m)`（盲飞期结束时判诱饵云二次欺骗，`DECOY_LIFE = 2.6`）；`hitSurface` / `hitAny`（伤害分流）；`isRadiating`；`buildNpcMounts`。（`detonate` 虽然也导出了，但正常只在 `stepMissile` 内部调用。）外部模块要击落导弹请直接置 `m.alive = false`（`updateDEW` 就是这么做的）。

---

## 3. 关键数据结构

### 3.1 飞机 `a`（`kind: 'air'`）

`makeAircraft()` 建立字段，`Game` / `js/missions/` 再补一批。**后续开发者靠这张表上手**（`Game` 的字段写入者现在分散在 `engine/game/*.js`、`ui/*.js`）：

```js
{
  kind:'air', team, type, ac,          // ac 指向 AIRCRAFT 条目（ctrlFull/ctrlFloor 从这读）
  phys, model, name, nick,
  alive, isPlayer, tags,                // tags 来自 ac.tags（unmanned …），旧 isDrone 已删
  pos, fwd, up, right,                 // 三个正交基，right = up × fwd
  speed, vel, throttle, ab,
  hp, maxHp, gunResist,                // gunResist：机炮抗性（AIRCRAFT[].gunResist，缺省 0）
  ctrl:{pitch,roll,yaw},               // -1..1 输入
  gun, gunAmmo, gunHeat, firingGun, gunTimer,
  special, spAmmo, spCd,
  slotCd:{},                           // { 武器id: [槽1剩余, 槽2剩余, ...] }
  /* 挂载：玩家那套由 startMission 按机库配置另建；NPC 由 makeAircraft
     末尾的 buildNpcMounts() 建 —— 与玩家**同一套**（Loadout.resolve / Loadout.arm）：
     弹药池 = 挂点数 × 武器的 perPoint，槽数 = 挂点数，重量 = 挂点数 × perPoint × 单件重量。
     pods 是任务写定的被动吊舱，机制与外观（mountPlan）都用它。 */
  ammoPool, pods,
  spActive,                            // ECM 生效
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
| `label` | `Game` / `js/missions/` | 呼号，与 `name`（机型）分开 |
| `radius` | `js/missions/` | 敌机命中半径（8），轰炸机 22 |
| `loadoutList` / `ammoPool` / `loadout` | `Game` `startMission`（玩家）/ `js/missions/` `spawnEnemy` 的 `o.loadout`（NPC） | 挂载列表 / 各武器储备 / **逐组**配置（组 id → 弹种）。NPC 的 `ammoPool` / `slotCd` 在 `makeAircraft()` 里就建好了（见 [loadout.md](loadout.md#npc-的挂载)） |
| `wpIdx` / `spSalvo` | `Game` | 当前挂载下标；`spSalvo` **写入后无人读取** |
| `loadFactor` | 玩家：`Game` `startMission`；NPC：`buildNpcMounts`（都会设） | 挂载重量惩罚，`stepAircraft()` 开头经 `curLoadFactor` 读。有 `loadModel` 时随弹药池折算：打光弹药即变轻 |
| `armor` / `lockRangeK` / `silentLock` | `Game` `startMission`（`engine/game/mission-start.js`，玩家）/ `js/missions/` `spawnEnemy`（敌机 `pods`，不设 `lockRangeK`） | 被动吊舱加成（`lockResist` 不再单独写，改由 `Ent.setStealth` 与机体匿踪合并）。**两边同源** —— 都走 `Ent.passiveEffects()`；`silentLock` 是被动测距，决定对方 RWR 收不收得到告警 |
| `gLoad` / `brake` / `hiG` | `Game` `controlPlayer`（`engine/game/control.js`） | 高 G 倍率 / 减速板 / HUD 指示 |
| `sweep` | `stepAircraft` | 可变后掠翼位置（仅 `ac.variableSweep`） |
| `ai` | `AI.attach`（`ai/brain.js`） | 见 [ai.md](ai.md) |
| `route` | `js/missions/`（轰炸机） | 走 `ai/brain.js` 的 `updateRoute`，不参与空战 |
| `recon` / `flee` / `bigTarget` / `weaponPod` / `isAce` / `wave` / `behavior` / `wingIdx` | `js/missions/` | 任务脚本自用标签 |
| `wdPrev` / `wdStill` | `Game` `watchdog`（`engine/game/update.js`） | 看门狗状态（见 §5.6） |
| `aimDir` | `Game` `updateMouseAim`（`engine/game/control.js`） | 鼠标引导的世界瞄准方向，HUD 画准星用 |
| `planAlpha` / `rollLock` / `prevDesired` / `aimRate` | `AI.steerTo`（`ai/steer.js`） | 飞控跨帧状态 |
| `ctrlAuth` | `stepAircraft` | 当前舵效（动压 × 失速），steerTo 与 FCS 表读取；悬停分支恒写 1 |
| `deck` | `putOnDeck`（`stepDeck` 每帧更新，离舰 / 宿主被打掉时置 null） | 甲板起飞状态 `{ host, ri, len, s, v, acc, x0, z0, dx, dz, y }`；非空期间位置由 `stepDeck` 写、`AI.update` 不跑（`engine/game/update.js`）。宿主侧另有 `host.deckUse[ri]`（占用的飞机）/ `host.deckFreeAt[ri]`（这条跑道下次可用的世界时刻） |
| `vtolOn` / `vtolWk` / `vtolVz` / `vtolVy` / `vtolNoz` | `vtolWatch` / `stepVtol` | 悬停分支开关（仅带 `ac.vtol` 的机型）/ 机翼升力系数 0..1 / 低速悬停能力的指令竖直速度（m/s，减速板下降、仰头上升）/ 竖直辅助速度（m/s，趋近指令）/ 喷口转角（rad，0 朝后 … π/2 朝下，HUD 的 NOZ）。`vtolOn` 被控制层、看门狗、HUD 读，见 [game.md](game.md)、[hud.md](hud.md) |

### 3.2 导弹 / 炸弹 `m`（`kind: 'missile'`）

```js
{ kind:'missile', team, weapon, w, model, alive,
  pos, fwd, up, right, speed, vel,
  target, age, life, dmg, turn, fuze, fuzeRel, fuzeRef,
  owner, trailTimer, seekers, dewRolled, seekerOn, lostTime,
  decoyTries, reLockT }
```

- `fuze` = `Combat.spec(w).fuze`；`fuzeRel` / `fuzeRef`：上一帧弹相对目标的位置及量的是谁（换目标即作废），供 `fuzeCheck` 求线段最近点。
- `w` 是 `WEAPONS[weapon]` 的引用，所有弹道参数都从这读，弹体本身**不复制**它们。
- `vel` 只在**无动力弹**（`w.tags.ballistic`）里独立累积；有发动机的弹每帧 `vel = fwd × speed`。
- `decoyTries` / `reLockT` 是诱饵的两个计数器：前者控制"越投越难骗"，
  后者是骗中之后的盲飞期（见 §4.5）。两者**都不因成功而清零**。
- `seekers`：导引头数，`w.tags.twinSeeker`（BIN-9）为 2，`breakLock` 每骗中一次先扣一个，扣到 1 才真正脱锁。
- `dewRolled`：定向能拦截已对哪架飞机掷过骰（`Game` `updateDEW`，`engine/game/combat.js`，每枚弹只判一次）。
- 运行期追加：`decoy`（`{p, v, t0, p2, done}`，骗走它的那团诱饵云，供 `decoyRecheck`）、`spoofed`（骗到它的飞机，只在 `reLockT > 0` 期间被避开）、
  `laserLost`（激光照射丢失，当前无武器使用）、`sarhLost` / `illumT`（半主动照射丢失与已丢时长，`w.tags.sarh`；`illumT > Ent.SARH_GRACE` 时 `m.target = null`）。

### 3.3 子弹 `b`

```js
{ kind:'bullet', team, alive, pos, prev, vel, dmg, life, owner }
```

`prev` **只给渲染画曳光线段用**——命中检测不用它，`Game` `scanShot()`（`engine/game/combat.js`）会自己按 `pos - vel*dt` 反推上一帧位置。

### 3.4 粒子 `p`

```js
{ pos, vel, life, life0, size, color, alive, grow, alpha, drag, grav }
```

渲染侧上限 900（`Game` `compact()` 裁掉最旧的），加色叠加绘制。见 [rendering.md](rendering.md#粒子)。

### 3.5 目标物 `t`（`kind: 'target'`）

调节单元、浮空中继平台、地面测控平台、防空浮台、前进基地、水面舰船都是它：

```js
{ kind:'target', team, ttype:'air'|'ground', label, model, alive, dead,
  pos, fwd, up, right, speed, vel,
  hp, maxHp, radius, gunResist, ground, big, drift, drifting,   // gunResist：o.gunResist → TARGETS[model].gunResist → 0
  route, wpIdx, arrive, heading,
  tags,                                                         // hard / regulator / relay / sam / cullFar（来自 TARGETS[model].tags）
  fireCd, weapon, value }
```

- `ttype:'air'` 且血量低于一半时会缓慢下沉（`stepTarget`）。
- `drift` 是横向漂移速度；`drifting` 是相位累积器，靠 `cos/sin` 产生往复而非直线漂移。
- **`route` 是让水面舰船真的航行的那一支**（`{ wp: [{x,z}…], speed, loop, arrive, onArrive, despawn }`）。
  有 `route` 时**优先于 `drift`** —— 一条船要么沿航路走，要么原地漂，不必两套叠在一起。
  位置直线推进，`vel` 与 `fwd` 由**实际位移**反推（渲染与 HUD 读 `fwd`，
  走位移而不是线段方向，是为了在拐弯处也给出连续朝向）。
  走完最后一段：`loop` 回绕，否则调 `onArrive(t, world)` 停住；`despawn` 则退场。
  `speed` 是**米/秒** —— `SHIPS[].speed` 是节，接入时自己 ×0.514。
- `weapon` 非空时由 `Game` `updateTargets()`（`engine/game/combat.js`）当成防空阵地开火（`pickTargetFor` 按阵营选目标：team 1 玩家优先、team 0 只打敌机、team 2 不开火，见 [ai.md](ai.md)）；`team` 默认 1。
- 任务脚本追加：`friendlyAsset`（打坏扣分）、`vital`（**写入后无人读取**）。

### 3.6 世界对象 `world`

`world` 在 `Game` `newWorld()`（`engine/game/world.js`）里建立（普通对象，没有类），任务 `spawn()` 再往里塞关卡专属字段：

```js
// newWorld() —— 所有关卡都有
{ time, actors[], missiles[], bullets[], particles[], targets[], wings{},
  player, flags{}, objective, objectiveSub,
  detected,
  killed, hitsLanded, shotsFired,
  fireMissile(actor, target), radio }

// 任务脚本追加（见 missions.md §3）
{ baseTarget, baseHpFull, dangerAltitude, baseWarnT,
  cells[], ace, aceSpawned, friendlyLoss }
// cells[] 每一关都有（js/missions/ spawnCellField），与 targets[] 是同一批对象
```

`flags` 是**自由字典**：任务脚本用它做一次性触发（`flags.tallyDone`、`flags.ambushDone`…），不分区、不清理，加新键时务必用独一无二的名字。

`world.fireMissile` 是 AI 唯一的发射入口（`AI` 里调它），内部就是 `launch()` 加一声距离衰减的导弹音。

---

## 4. 关键流程

### 4.1 一帧内实体更新顺序（`Game` `update()`，`engine/game/update.js`）

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
  → fireSpecial()            Game（`ui/input.js`）：查 kind / 弹药 / spCd / 目标类型匹配
  → launch(player, t, world) Game（`engine/game/launch.js`）
      ├ 找槽：slotCd[special] 里第一个 ≤0 的槽（找不到就按不出去）
      ├ 由槽下标算挂点位置：side = si%2 ? +1 : −1，rank = floor(si/2)
      ├ for q in 0..(salvo−1): Ent.makeMissile(...) → world.missiles.push
      ├ spAmmo −= nShot；slotArr[si] = w.cd；spCd = min(slotArr)
      └ 音效 / ammoPool 回写 / shotsFired++
  → 之后每帧 stepMissile()
```

**AI 走的是另一条路**：`AI` 先 `Ent.chooseWeapon()` + `Ent.setWeapon()` 选定 `a.special`，再 `world.fireMissile(actor, target)` → `launch()`。有实体挂载的 NPC 由 `buildNpcMounts()` 建了 `slotCd`，走同样的找槽逻辑；只有 `slotCd[special]` 不存在时，`launch()` 才退回 `spCd` 单冷却分支（`else if (actor.spCd > 0) return false`）。写新武器时别假设每架 AI 都有槽数组。

### 4.3 装填与冷却：`slotCd` 的真实语义

- 槽数 = 该武器占用的**挂载点数**（玩家的 `Game` `startMission` 按 `wl[wi].salvo` 建数组；
  NPC 的 `Ent` `buildNpcMounts()`（`entities/mounts.js`）在造飞机时建，槽数 = 它挂得住的挂点数）。
- 按一次发射键只打**一个**槽（外加该武器的 `salvo` 枚共用这一槽，如 GIR-5 三联装）。
- 每个槽独立倒计时（`stepAircraft` 里的 `for (var ck in a.slotCd)`），切挂载不会跳过装填。
- 储备弹少于挂架数时，多出来的槽一开始就是 `SLOT_EMPTY`（`1e9`），永远不会装填完成——HUD 显示的是"没得装了"，而不是骗人的"装填中"。
- 装填还会检查 `pool`（储备弹数）：就绪槽已等于剩余弹数时，这个槽不再恢复。

### 4.4 一次命中的结算链路

```
导引弹：stepMissile → fuzeCheck（只看自己的目标 / 诱饵）
    ├ gap < CONTACT(1.5) → 直接命中，Combat.detonate(direct = 目标)
    └ gap < fuze 且最近点在本帧 → 在最近点 Combat.detonate
撞地 / 寿命到期 → killMissile → Combat.detonate（不再是哑弹）
Combat.blast：半径内 actors + targets（同队、发射者除外）× falloffK × warheadK → 飞机 damage / 设施 hitTarget
无制导弹/子弹：resolveBullets → scanShot
    ├ 对飞机：raySphere(prev, dir, a.pos, Combat.HIT_R_AIR = 7.5)
    └ 对目标：|Δy| > radius + 本帧弹道长 → 跳过；否则 raySphere(prev, dir, tg.pos, tg.radius || 8)
       ├ 飞机 → Ent.damage(a, dmg × gunResistK, world, owner) → hp≤0 → Ent.kill()
       └ 目标 → 无制导弹：Combat.detonate(direct)（撞飞机同理）；子弹：hitTarget(dmg × warheadK × gunResistK)（Game）→ hp≤0 → Ent.killGround()
```

- `Ent.kill()` 按结构完整度决定爆炸规模（`hp>150` 用 3.2 / 26 个粒子，否则 2.2 / 20），并给 `source.kills++`。
- `Ent.damage()` **会**扣装甲减伤（`ent.armor`；`damage()` 钳在 60%，但 `passiveEffects()` 汇总时已封顶 55%）；`hitTarget()` **不会**——目标物不吃装甲，这是刻意的（装甲是飞机的挂载件）。
- 无制导弹也走 `scanShot`：它们没有导引头，唯一能命中的方式就是撞上去。
- `scanShot` 对目标物先比高度差：每关头顶几十个调节单元，低空的弹不必逐个求交。

### 4.5 干扰弹链路

```
按住 V（玩家）或 AI 的 evade 分支
  → breakLock(a, world)
      ├ flares≤0 或 flareCd>0 → 直接返回 false
      ├ flares−−；flareCd = 0.45（一次投放一次判定）
      ├ 6 个热焰弹粒子（#ffd070，向机体下方抛）+ 14 个箔丝粒子（#e6eef4）
      └ 遍历 world.missiles：target===a 的每一枚
            ├ m.decoyTries++（抗欺骗计数，重捕获后不清零）
            ├ chance = 按导引头取 flare / flareRD / 0
            ├ chance = max(0.03, chance × 0.62^(decoyTries−1))
            └ random() < chance 时
                 → m.target=null；seekerOn=false；lostTime=1；
                   reLockT=1.4（盲飞期：这之前谁都不能重新捕获）
                   （seekers>1 时只扣一个导引头，不脱锁）
                   spoofed=a（盲飞期内优先避开这架，之后可以重咬）
                   decoy={p,v,t0,p2}（盲飞期满时 decoyRecheck 判诱饵云二次欺骗；
                   CLA-4 decoyMemory 免疫）
      ← 返回值只表示"投放动作发生了"；
        a.decoysBroke / a.decoysIneffective 才是命中数与无效数
```

`flare` 字段本身就是"被干扰概率"：**越大越容易被骗**。雷达弹走 `FLARE_RD`（`flareRD`），空空雷达弹整体比红外弹难骗（见 [data.md](data.md)）。

**抗欺骗递减**（`m.decoyTries`）是防止"诱饵无限强"的那一环：
同一枚弹每被投放一次，成功率乘 0.62（地板 0.03），并且**不因一次成功而清零**。
配套的节奏是 0.45 s 的 `flareCd` —— 早先的 0.12 s 配上 80 组诱饵，
等于按住 V 就必然脱锁。见 [weapons.md](weapons.md#干扰弹玩家按-v)。

**盲飞期**（`m.reLockT`）是另一半：诱饵只买到 **1.4 s**，不是永久免疫。
它取代了旧实现里用 `m.reDone` 兼职的做法 —— 那一位置同时是 `reAcquire`
的重捕获闸门，于是**一次诱饵就让带 reAcquire 的弹永久失去重捕获能力**；
IR 弹那边则靠 `m.spoofed` 无条件 `continue`，同样是永久免疫。
现在 `spoofed` 只在盲飞期内生效，归零后导弹可以重新咬住本机。

**告警口径**：导弹告警音（`Game`）与来袭标记（`HUD`，`ui/hud/`）
判据是"当前锁定本机"**或**"刚被本机诱饵骗掉、`reLockT > 0`、且仍在本机 3600 m 内"。
只认 `m.target` 会让撒出诱饵的那一瞬间告警与标记一起消失，
而那枚弹还在同一片空域飞。

---

## 5. 参数速查表（想改 X → 在哪）

| 想改什么 | 在哪 |
|---|---|
| 每槽装填时间 | `js/data/weapons/<id>.js` 的 `cd`（**每槽**；原 `STORE_COOLDOWN` 侧表已并入武器文件） |
| 一次按键打几枚 | `js/data/weapons/` 的 `salvo` + `Game` `launch()`（`engine/game/launch.js`） |
| 空挂架标记值 | `Ent` `SLOT_EMPTY`（`entities/aircraft.js`，`1e9`） |
| 机炮射速 / 单发伤害 / 初速 | `js/data/` `WEAPONS[cel3/cel7]`（五门机炮 id 为 `cel1 cel3v cel3 cel7 tca11`，原 `k1 k2 k3 k7 k11`） 的 `rpm` / `dmg` / `speed` |
| 机炮有效射程（含高空翻倍） | `js/data/` 的 `range` / `highRange`，由 `fireGun()` 换算成子弹寿命 |
| 机炮散布 | `js/data/` `spread`，`fireGun()` 里做成随机方向偏移 |
| 飞机命中半径（7.5 m） | `Combat.HIT_R_AIR`（`engine/combat.js`），`scanShot()` 引用它 |
| 目标物命中半径 | `makeTarget()`（`entities/targets.js`）的 `radius`，默认 10 |
| 爆炸规模 / 颜色 | `Ent` `explode()`（`entities/particles.js`）的 `cols` 与 `count` |
| 受损拖烟阈值 | `stepAircraft()`（`entities/aircraft.js`） 里 `a.hp < a.maxHp * 0.45` |
| 加力尾焰间隔 | `stepAircraft()` 里 `trailTimer = 0.028` |
| 粒子数量上限 | `Game` `compact()`（`engine/game/update.js`）里的 `> 900` |
| 干扰弹投放间隔 / 组数 | `Ent` `breakLock()`（`entities/warhead.js`）的 `flareCd = 0.45`、`makeAircraft()` 里 `flares` 初值 80 |
| 被干扰概率 | `js/data/weapons/` 的 `flare`（雷达导引头用 `flareRD`） |
| 锁定速率 / 锥角 / 距离 | `Game` `updateLock()`（`engine/game/lock.js`）+ `js/data/weapons/` 的 `lockCone` / `lockDist` / `nezer` / `seeker` |
| 地面火力开火节奏 | `Game` `updateTargets()`（`engine/game/combat.js`）：`t.fireCd = w.cd + rnd(0,2)` |
| 看门狗静止判定 | `engine/game/update.js` 的 `WD_LIMIT = 1.5`、`moved < 0.02` |
| 飞行天花板 / 撞地高度 | `stepAircraft()` 里的 `23000` 与 `pos.y <= 2` |
| 大气 / 动压曲线 | `entities/physics.js` 的 `airDensity()` / `qOf()` / `ctrlFactor()`，理由见 flight-model.md |

---

## 6. 与其它模块的依赖

| 依赖 | 方向 | 说明 |
|---|---|---|
| `M3` | 被依赖 | 所有向量与旋转。`rotAxis` / `orthonormalize` / `raySphere` / `turnToward` / `angleBetween` |
| `WEAPONS` `AIRCRAFT` `TARGETS` | 被依赖 | 弹道参数与机型性能；`makeAircraft` 找不到机型会**静默回退到 `AIRCRAFT[0]`** |
| `Combat` | 被依赖 | `spec` / `radiusOf` / `detonate`（`engine/combat.js` 加载在 `Ent` 之后，只在运行期调用） |
| `SFX` | 被依赖 | `boom` / `flare` / `hit` / `laser` / `bigHit` |
| `world` | 参数 | 由 `Game` 建立，实体只读它做归属与音效（`world.particles`） |
| `AI` | 依赖 `Ent` | `AI.update`（`ai/brain.js`）写 `a.ctrl`，调 `Ent.fireGun` / `Ent.breakLock` |
| `js/missions/` | 依赖 `Ent` | `makeAircraft` / `makeTarget` / `spawnParticle` / `damage` / `killGround` |
| `Game` | 依赖 `Ent` | `launch()` / `updateLock()` / `updateDEW()` / `watchdog()`（`engine/game/*.js`）/ `pushStores()`（`ui/frame.js`） |

---

## 7. 易踩的坑与设计取舍

1. **`a.rwr` 曾经是死字段，现在仍不完整。** 它声明为"正在锁定本机的导弹/敌机"，但至今**没有任何一处写入它** —— 导弹告警实际是 `Game` `update()` 每帧扫描 `world.missiles` 算出来的。
   真正在用的"被照射感知"是 `rwrT` / `rwrSrc`（`AI` 每帧扫描 `world.actors` 写）：它决定 AI 会不会回头咬正在照它的人，也是被动吊舱（`silentLock`）与 EMCON-Δ 的价值所在。看到 `rwr` 别以为有现成的雷达告警系统 —— 它还是空的。

2. **`damage()` 扣装甲，`hitTarget()` 不扣。** 给目标物加"减伤"要自己写，`ent.armor` 对它无效。唯一对飞机和目标物都生效的减伤是机炮抗性 `gunResist`，它在 `scanShot` 里乘，只对小口径子弹生效（见 [weapons.md](weapons.md#命中与近炸)）。

3. **导引弹只对自己的目标近炸。** `fuzeCheck` 只量 `m.target`（盲飞期量诱饵虚拟目标），路过别的飞机不触发。但撞地 / 寿命到期会起爆，半径内任何非同队单位都吃溅射 —— 所以现在**有**流弹误伤。

4. **无制导弹必须给初速。** `makeMissile` 里 `vel` 对 `ballistic` 弹显式赋值；给 0 的话它就"从空中静止开始往下掉"，抛出的动能全丢。这是踩过的坑，注释里留着。

5. **尾迹判据是 `tags.ballistic` 不是 `tags.unguided`。** 两者正交：有发动机 / 无制导的火箭巢应当拉烟，无发动机 / 有制导的滑翔弹不应当。按 `unguided` 标签判断会把两类全弄反。

6. **槽数组是**按武器**建的，渲染是**按挂点组**遍历的。** `Game` `pushStores()`（`ui/frame.js`）必须自己维护 `used[wid]` 起始下标，否则两组挂同一种弹时会共用前两个槽，出现"打掉一个、两组同时消失"。**推进 `used[wid]` 必须发生在适配检查之后**——否则一个挂不上的组也会占掉下标，把它后面的挂架整体顶偏。

7. **挂载重量是整体替换 `p`，不是就地缩放。** `effectivePhys()`（`entities/aircraft.js`，现在原位写每个实体的 `a._pe`，另含 `vStall0` / `hp`，且 `vStall` 乘了 `stallK(高度)`）里 `p.vMax / vMil / vStall0 / accel / decel / pitch / roll / yaw / hp`——少写一个字段（历史上漏过 `accel`/`decel`）就会让那个字段变成 `undefined`，加速变成瞬时。加字段时记得同步这里。**这一段还必须在函数开头**：以前它在姿态旋转之后，pitch / roll 惩罚从未生效、失速判定用的是未打折的 `vStall`。

8. **AI 每次开火前都会重新选弹，而且它现在也有 `slotCd` 了。** `AI` 调 `Ent.chooseWeapon()` 挑一件（对空 / 对面 + 够得着的里面射程最短），`Ent.setWeapon()` 把它设成 `a.special`——这就是"AI 换武器"的全部，没有独立的选弹状态。以前 NPC 的 `slotCd` 是空对象，`launch()` 对它退回单冷却 `spCd`；现在 `buildNpcMounts()` 会按挂点数建槽（实体挂载要靠它判断"这一发还在不在"）。这不改变 AI 的射速 —— `AI` 的 `s.shootT = rnd(2.6, 5.2) × (1.6 − 0.6·skill)` 通常比槽冷却长。

9. **误伤只在 `hitTarget()` 的 `penal` 那一处记。** `penal = friendlyAsset && source.isPlayer`，为真就 `friendlyLoss++`；`cell` 分支以前又加了一次（打掉一个单元算两次），已删，那里只剩 SEXTANT 那句"你打爆了一个调节单元"，也只在玩家打的时候说。加新的处罚分支别再自己累加。

10. **写死 `7.5 m` 的飞机命中半径与 `radius` 字段并存。** 飞机的大小编码在 `scanShot()`，目标物的大小编码在 `t.radius`，两者不同源，改大飞机不会改变它被弹体命中的判定。

11. **看门狗的根因没定位。** 任何飞机静止超过 1.5 秒会被强制重置姿态与速度并 `console.warn`。这是兜底，不是修好了——警告里带有当时的速度、姿态、操控输入，下次真触发时它就是定位起点。

12. **`spSalvo` / `t.vital` / `a.firingAllowed` / `world.baseHpFull` / `a.gunHeat` 都是"写了没人读"的字段。** 看到它们别以为对应机制存在（`gunHeat` 还在每帧递减，但没有任何地方读它——机炮过热是个没做完的机制）。

13. **`fits` 是"玩家能不能挂"，不是"挂不挂得上"。** 下游弹的 `fits` 是空数组（玩家拿不到实物），而空数组是 truthy —— 拿它当"挂点适配"判据会把敌机的挂载全部过滤掉。所以 `Ent.fitsKind()` 分两张表：玩家 `fits`、NPC `npcFits`。加新武器时别只填一张。

14. **AI 选弹与玩家选弹必须同源。** `Ent.weaponMatchesTarget()` 是"这弹能不能打那个目标"的**唯一**判据（`Game` 的 `targetMismatch`，`ui/input.js`，与它一致）：目标是 `kind === 'target'` 的东西就算对面。两边各写一套的话，玩家会被提示"换对地弹"，而 AI 会拿格斗弹去打海面平台 —— 这类不一致不会报错，只会让行为看起来"有点笨"。同理，"设成当前武器"只有 `Ent.setWeapon()` 一个入口（玩家的 `syncWeapon`，`engine/game/world.js`，也走它）。

---

## 8. 一句话导航

改数值先看 `js/data/`（一个单位一个文件：武器、机型、目标），改**行为**再看 `js/engine/entities/` 里对应职责的文件；改**发射许可与锁定**看 `engine/game/launch.js` / `lock.js`。飞行模型的理由全部在 [flight-model.md](flight-model.md)，别在本文里重复第二遍。

## 9. 甲板起飞与垂直起降（批次 6.1b / 6.2）

两者都是 `stepAircraft` 开头的**独立分支**：判一个字段就整帧交出去，不碰主路径的姿态 / 速度段，所以不用它们的场景逐帧不变（golden 不变）。数值模型见 [flight-model.md](flight-model.md) 的「垂直起降悬停分支」。

### 9.1 甲板起飞（`deck.js`）

引擎里的飞机一出生就在空中（运动学飞行，没有地面状态）。这里补一个弹射式的放飞：任何机型都能从带跑道的宿主（舰船 / 平台）上起飞，没有滑行阶段。

- **跑道数据**：`SHIPS` / `PLATFORMS` 的 `runways = [{ x, y, z, yaw, len? }]`，宿主局部坐标，`(x, y, z)` 是**起飞端（末端）**，`yaw` 是跑道方向，`len` 缺省 `DECK.LEN`（80 m）。与 `resupply.js` 的 `reset: 'runway'` 共用同一份数据。起点 = 起飞端沿 `yaw` 往后退 `len`（`deckPose` 算）。
- **放飞入口**：`spawnEnemy` / `spawnDrone`（`js/missions/_lib.js`）的 `o.deck`（宿主）/ `o.runway`（指定第几条，缺省取空闲的）：先 `deckSlot` 找跑道（没有返回 null，调用者下一帧再试），再用 `deckPose` 当出生点，造好飞机后 `putOnDeck`。
- **状态机**（`a.deck` 非空期间，`stepDeck` 每帧）：
  1. `putOnDeck`：飞机完整出现在起点、速度 0、机头沿跑道、油门 1 加力；加速度 `acc = vRel² / (2 len)`，其中 `vRel = max(MIN_REL, LIFT_K × vStallAt(a) − 宿主速度在跑道方向的分量)`——**匀加速到起飞端时对空速度 = 1.4 × 失速速度**，所以大飞机加速度小、小飞机大，任何机型都起得来；`MIN_REL`（25 m/s）保证宿主很快时仍有一段看得见的加速。
  2. 每帧 `s += v·dt + ½·acc·dt²`；位置按**宿主当前位姿**重算（宿主在开、在转，甲板上的飞机跟着走），速度 = 宿主速度 + 沿跑道的 v。
  3. 跑道走完 `ROT_FROM`（85%）之后逐渐抬头，到末端抬头角 `PITCH`（0.07 rad）。
  4. `s ≥ len`：`leave` 把 `a.deck` 清掉，按当前速度矢量加抬头角交还主路径，`AI.update` 从下一帧起接手；同时写 `host.deckFreeAt[ri] = now + SPACING`（1.5 s）。
- **占用与间隔**：同一条跑道同一时刻只放一架（`host.deckUse[ri]` 存活且仍在甲板上就算占用），离舰后还要等 `SPACING` 才放下一架。`deckSlot` 在宿主没了 / 没跑道 / 都占着时返回 -1。
- **宿主被打掉**：`stepDeck` 每帧检查 `host.alive`，一失效当场 `leave`（不抬头），按当前速度飞出去。
- 常量表 `Ent.DECK`：`LEN 80`、`GEAR_H 1.5`（机体原点离甲板）、`LIFT_K 1.4`、`MIN_REL 25`、`PITCH 0.07`、`ROT_FROM 0.85`、`SPACING 1.5`。
- 使用方：无人机航母的机库（`missions/_lib.js` 的 `tickHangar`，见 [ai.md](ai.md)）。探针 `probe-deck`、`probe-carrier`。

### 9.2 垂直起降（`vtol.js`，机型数据带 `ac.vtol`）
### 9.2 垂直起降（`vtol.js`，机型数据带 `ac.vtol`；v3.7.1 重设计）

主路径是运动学模型（`vel = fwd × speed`，速度钳在 `[0.42 vStall, 1.12 vMax]`，没有侧滑与竖直速度），装不下悬停。带 `ac.vtol` 的机型（目前只有 D-27 海马，标签 `vtol` `noPSM`）在低速区走独立分支。核心语义：**推力只代表玩家期望的前进速度**（沿机体自己的前向，不是世界水平），不直接产生升力；**不下坠只由实际速度决定**，喷口转向补上机翼托不住的那部分。

- **推力 → 期望速度**（`vtolSpeedTarget(a, p, th)`，主路径对带 `ac.vtol` 的机型也用它，所以两条路径的推力含义连续）：HUD 推力 0%（慢车 `$.VTOL_THR_IDLE`）→ 0；0 → 50% 从 0 升到有效 `vStall`；50% → 100% 从 `vStall` 升到 `vMil`（乘 `thrustK`）；加力 = `vMax`；减速板（推力在慢车以下）→ 0。`$.VTOL_THR_IDLE` 与 `Game.THR_IDLE` 同值（`Ent` 读不到 `Game` 的变量），`probe-vtol` 比较两者是否相等。
- **进入**：`stepAircraft` 末尾对带 `ac.vtol` 的机型调 `vtolWatch(a, p)`，`speed < 有效 vStall × transK`（`effectivePhys` 的 `vStall`，随高度 / 挂载）就置 `a.vtolOn`，下一帧起整帧交给 `stepVtol`。进入时 `vel = fwd × speed`，天然连续；**不再动玩家的推力**。
- **退出**：`speed > 有效 vStall × transK × 1.04`（`EXIT_K`，与进入点之间留一点滞回）**且**竖直辅助速度 `|a.vtolVy| < 1.5` **且**水平漂移 `|a.vtolVh| < 1.5` **且**速度矢量与机头夹角 ≤ 12°（`EXIT_ANGLE`）时清 `a.vtolOn`，主路径接着飞（`vel = fwd × speed`，连续）。
- **标量速度沿机头**（与主路径同形，不再是自由矢量）：`a.vel = fwd × speed`，再加竖直辅助速度 `a.vtolVy`。推力 / 阻力 / 重力沿航迹 / 转弯掉速都和主路径同一套，只多三件事：
  1. **期望速度曲线**（上面）。
  2. **升力缺口由喷口垂直分量补上**：翼升力系数 `wk = min(1, (v / vStall)²)`（与主路径失速下沉同一个比值，`vtolWingK`）；缺口 `Ld = G × (1 − wk)`；喷口总推力预算 `A = jetT·G × 挂载折扣 × η(高度)`（`jetT` 是海平面空载推重比，挂载折扣 = `effectivePhys.accel / phys.accel`，`η = (ρ/ρ₀)^jetExp`，`ρ` 取 `airDensity`）；剩给前向的 `Af = √(A² − Ld²)`，用它做加速（取代主路径的 `accel`）。速度越低缺口越大、能用于加速的越少。喷口角 `a.vtolNoz = atan2(Ld, 实际使用的前向推力)`：0° 朝后 … 90° 朝下，HUD 显示为 `NOZ`。喷口角只由实际速度与加速状态决定，与推力挡位、机头俯仰无关。
  3. **只在低速生效的悬停能力**（`gate = 1 − wk`）：减速板（`a.brake` 或推力 < 慢车）按 `vzDown` 悬浮下降；仰头按仰角给爬升率 `vzUp × sin(pitch)`；低头**不**下降。目标竖直速度 `a.vtolVz`（给 HUD）= `((brake ? −vzDown : 0) + vzUp × max(0, fwd.y)) × gate`，`a.vtolVy` 以 `vAccel` 趋近它。
- **重力与转弯掉速**乘 `wk`（低速时由喷口托着，不掉速；`vStall` 以上 `wk = 1`）。`vStall` 以上 `Ld = 0`、`gate = 0`，两条路径公式完全一致，所以交接连续。
- **喷口出力上限与悬停升限**：托住竖直分量需要的实际推力 `need = Ld / max(0.35, up.y)`，实际给出 `Tl = min(need, A)`；`a.vtolJet = need / A` 是喷口负荷（HUD 显示，高处空气稀 `η` 小所以更高）。`need > A`（满指令仍不够）时差额 `Ld − Tl·up.y` 累积成下沉速度 `a.vtolSink`（上限 140 m/s，差额消失后 0.9 s 内散掉），飞机被迫下降，降到 `η` 回升到托得住才停；所以悬停有一个随挂载变化的升限（海马默认挂载约 6.3 km、空载约 9–10 km）。另外喷口出力在**有效升限**（`Ent.ceilingEff`，海马 11000 m）以上还会在 800 m（`CEIL_FADE`）内衰减到 0：否则空载的海马能飞到明显高于自己升限的地方（13.5 km、速度远低于 vStall 也有升力），绕过全机型统一的升限设定；升限以下系数为 1，不受影响（`probe-stall-alt` 守着）。
- **直升机式平移**：升力喷口沿机体 `up` 推，倾斜时多推一点保住竖直分量（`Tl = min(Ld / max(0.35, up.y), A)`），多出来的 `up` 水平投影 × `Tl` 就是水平加速度：低头向前、仰头向后、右滚向右、左滚向左；水平漂移速度 `a.vtolVh` 单独积分，阻力 `drag + 3·wk`（松开姿态后慢慢收住，速度上来后随 `wk` 加大，在交接点前并入前飞），`a.vel` 再加上它。放平的悬停纹丝不动；倾斜 θ 时稳态漂移 ≈ `g·tanθ / drag`。`Ld` 随 `wk` 消失，高速时没有这项。
- **姿态**：RCS 式固定角速率 `ac.vtol.rcs`，不吃动压与 `ctrlFactor`，按挂载打折（与主路径同一份 `effectivePhys` 比值）；推杆比拉杆弱（`PITCH_DOWN_K` 0.6）。每帧 `a.sink = 0`、`a.ctrlAuth = 1`；**`a.stall` 按喷口托不托得住重写**：托得住恒为 false，满指令仍托不住、正在下沉（`def > 0` 或 `a.vtolSink > 1`）时为真——HUD 照常报「失速」并响提示音，虽然它不是常规失速（没有舵效损失和失速下沉），降到托得住的高度、下沉散掉后自动解除。主路径对带 `ac.vtol` 的机型不置 `a.stall`（交接帧也不误报）。
- **其他**：载荷因数 `gNow` 按速度实际变化算；触地（离地 ≤ 2 m）与主路径一样直接坠毁（`kill`，不做着舰）；尾部回到 `stepAircraftTail`（冷却 / 拖烟 / 电子战结算照常）。控制层不再对悬停分支做推力特例，高 G 在悬停时仍关闭（见 [game.md](game.md)）。
- **只为玩家设计**：`vtolWatch` 本身不分玩家 / AI（带 `ac.vtol` 的机体速度低了都会进分支），但 AI 没有任何悬停逻辑（`ai/` 里不读 `vtolOn`），海马目前只作为可玩机型。`noPSM` 标签让 PSM 对它不可用。
- **`ac.vtol` 参数表**（海马取值，注释在 `js/data/aircraft/seahorse.js`）：

| 字段 | 海马 | 含义 |
|---|---|---|
| `transK` | 1.2 | 速度低于「有效 `vStall` × `transK`」进悬停分支；回到 ×1.04 且对齐后交还主路径 |
| `vzUp` | 24 | 低速时仰头上升的最大爬升率（m/s，按仰角 `sin` 折算）；低头不下降 |
| `vzDown` | 18 | 减速板悬浮下降的速度（m/s） |
| `vAccel` | 9 | 竖直辅助速度 `a.vtolVy` 的变化率（m/s²） |
| `fwdMin` | 0.7 | 前向推力下限 = 主发动机 `accel` × `fwdMin`：升力由升力喷口承担，前向加速不会被「托住重量」吃光（否则越接近悬停升限越加速不动） |
| `transBoost` | 0.6 | 过渡加力：前向加速度再乘 `1 + transBoost·(1 − wk)`，`wk → 1` 时回到 1，所以 `vStall` 以上与主路径公式一致、交接连续；悬停推 100% 到交接约 7.5 s（3000 m）/ 11 s（6000 m） |
| `jetT` | 2.3 | 喷口总推重比（海平面、空载）；实际满指令推力 = `jetT·G × 挂载折扣 × η` |
| `jetExp` | 0.8 | 喷口出力随空气密度衰减的指数 `η = (ρ/ρ₀)^jetExp` |
| `drag` | 0.35 | 悬停漂移的阻力系数（1/s）：倾斜 θ 时漂移速度收敛到 `g·tanθ / drag`（10° ≈ 5 m/s、20° ≈ 10 m/s），松开姿态后按它指数收住 |
| `rcs` | `{ pitch 0.9, roll 1.6, yaw 0.9 }` | 姿态角速率（rad/s） |

翼升力尺度取 `phys.vStall`（海马 70）；喷口推力是 `ac.vtol` 里独立的 `jetT`，与主路径的 `phys.accel` 无关。探针 `probe-vtol`（含倾斜平移、HUD 文案占位符检查）。

---

## 碰炸、近炸与干扰弹（`contactScan` / `breakLockFor`）

- **`contactScan(m, dt, world)`**（`stepMissile` 在 `fuzeCheck` 之后、撞地之前调用，有制导与无制导弹共用）：
  - 对象只有 `world.actors` 与 `world.targets`。干扰弹粒子与 `m.decoy` 不在这两张表里，天然不触发。
  - **碰炸**：最近点距表面 `< Combat.CONTACT`，任何对象（中立也算），直接命中满伤。
  - **近炸**：只对敌方飞机（中立、友机不触发）。需要已解保（`m.age ≥ FUZE_ARM_T = 0.6 s`）、最近点距离 `< w.fuze`、最近点落在本帧内、目标在 `FUZE_CONE = 110°` 引信锥内。起爆点在最近点，不设 `direct`，伤害按距离衰减。
  - `m.target` 跳过（由 `fuzeCheck` 管自己的目标）。
- **`breakLockFor(carrier, protectee, world)`**：`breakLock(a, world)` 等价于 `breakLockFor(a, a, world)`。
  - 对象是锁定 `protectee` 的来袭弹。欺骗概率乘 `distK = clamp(1 − 载机到 protectee 的距离 / 600, 0, 1)`，600 m 外为 0。
  - 诱饵云从载机位置放出。自保时 `distK = 1`，行为与原来一致。
  - 自保的声音仍是满音量 `SFX.flare()`；掩护投放改用 `SFX.flareAt(距玩家的距离)` 衰减。
- **`envelopeCached(holder, clock, la, w, wid, t, interval)`**：发射包线的缓存版，结果挂在 `holder.env` 上，`interval` 秒内复用，换弹或换目标时作废。AI、打击航线、发射架共用。
- **`envelopeRange` 的校验**：二分结果在非单调区间（滑翔、高抛）可能落在打不中的点上。返回前按**斜距**的 0.9 倍（对应水平距离 0.9 倍的校验点）逐步回收，最多 12 次；收不回来的 nez 退到"目标正下方"（斜距 = 高度差）。
- **`estDt`**：默认 1/10 s；滑翔 / 高抛弹（`w.glide`、`w.loft`）用 1/60，否则落点会偏到打不中。

## 挂载重量（`buildNpcMounts`）

- 弹的重量按**携带量**算：`min(ammo, 点数 × perPoint) × mass`（下游弹 `perPoint 0`，仍是占位 100 kg）。打空的弹药池不再计重量。
- 吊舱与定向能按挂点算、不随打空而变轻（`fixedM`）。
- `curLoadFactor` 以 `k0 = 初始 loadFactor`、`total = 满挂总重` 折算，与玩家同一口径。
