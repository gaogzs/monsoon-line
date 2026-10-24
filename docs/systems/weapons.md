# 武器系统

数据 `js/data/weapons/<id>.js`（汇成全局 `WEAPONS`）· 行为 `Ent`（`js/engine/entities/`）· 发射与锁定
`Game` 的 `launch()`（`js/engine/game/launch.js`）/ `updateLock()`（`lock.js`）/ `updateDEW()`（`combat.js`），
干扰弹 `Ent.breakLock()`（`js/engine/entities/warhead.js`）

---

## 编号体系

装备前缀取自**真实的逻辑语（Lojban）词根**（rafsi）。这不是随手拼的字母，
每个前缀都能在主词表里查到出处 —— 权威版本在 `js/ui/codex/` 的
「逻辑语」条目（`js/data/_schema.js` 文件头另有一份速查）。

| 编号 | 词根 | 源词 | 含义（本作用法） |
|---|---|---|---|
| `CEL-` | cel | *cecla* | 发射器 / 炮 —— 上游机炮 |
| `TCA-` | tca | *tcati* | 火 / 炮 —— 下游机炮（`tca` 词根，与上游的 `cel` 分开） |
| `TOR-` | — | — | **不在词根表里**，是基础短程弹系列（TOR-1/2/4/6） |
| `SUT-` | sut | *sutra* | 快 —— 高机动缠斗弹 |
| `GIR-` | gir | *girzu* | 组 / 群 —— 多联装格斗弹 |
| `CLA-` | cla | *clani* | 长 —— 冲压远距弹 |
| `SPO-` | spo | *daspo* | 摧毁 —— 反大型目标弹 |
| `GUT-` | gut | *gunta* | 攻击 —— 空地导弹 |
| `PEJ-` | pej | *preja* | 扩散 / 播撒 —— 集束炸弹、火箭巢 |
| `GUS-` | gus | *gusni* | 光 —— 定向能 / 光电吊舱 |
| `ZUN-` | zun | *zunti* | 干扰 —— 认知电子战吊舱 |
| `JDA-` | jda | *jdari* | 坚硬 —— 装甲吊舱（JDA-3） |
| `FAN-` | fan | *fanta* | 阻止 —— 上游舰载防空导弹（FAN-6） |
| `DAR-` | dar | *darno* | 远 —— 下游中距弹 |
| `BIN-` | bin | *jbini* | 之间 / 近 —— 下游格斗弹 |
| `BAD-` | bad | *bandu* | 防卫 —— 下游防空导弹 |
| `SAV-` | sav | *savru* | 噪声 —— 下游干扰吊舱（SAV-6 / SAV-14） |
| `TUM-` | tum | *tumla* | 大地 —— 下游对地弹（TUM-7） |
| `BOX-` | box | *boxna* | 浪 —— 下游反舰弹（BOX-14） |
| `CAV-` | cav | *carvi* | 雨 —— 调节场体系（`CAV-7` = 第 7 号控制平台） |
| `DIL-` | dil | *dilnu* | 云 —— 调节单元型号（`DIL-4`） |

**前缀分属阵营**：TOR / SUT / GIR / CLA / SPO / GUT / PEJ / GUS / ZUN / JDA / FAN
只出现在上游，DAR / BIN / BAD / SAV / TUM / BOX 只出现在下游 —— 看前缀就知道是谁的弹
（权威表在 [SETTING.md](../world/SETTING.md)）。

同一个词根在不同势力各排各的号（机炮 `CEL-` 就是这样：上游 3/7、分水 1、外贸型 3V）；下游的机炮另取 `TCA-` 词根，不与上游共用。

**重要**：`WEAPONS` 的 **id**（= `js/data/weapons/` 下的文件名：`v11` `cel3` `dl4` …）是早期技术代号，
与显示名不一致，这是有意的——改 id 要动多个文件，风险不值得。
玩家看到的永远是 `name` 字段。（唯一一次改名是五门机炮：原来的 `k1 k2 k3 k7 k11` 现在叫
`cel1 cel3v cel3 cel7 tca11`，与玩家看到的 CEL-n 对应。）

`ROOTS`（在 `js/ui/screens/hardpoints.js`）只把**有编号前缀的 id**映射到中文含义，
机库界面用它显示"编号含义 · 发射器 / 炮"。值是 `T('ui.screens.hardpoints.ROOTS.cel3')` 这样的文本调用，
文本在 `locales/zh-CN/text/ui/screens/hardpoints.json`；覆盖的 id：

```js
cel1 cel3v cel3 cel7  → 发射器 / 炮      tca11 → 火 / 炮      v9 → 组 / 群    v11 → 快      v17 → 长
v22 → 摧毁   v25 → 攻击   v30 → 扩散 / 播撒   pgb hbl hbh（各有一条）
e4 → 干扰    l2 → 光      dl4 → 远   dl6 → 之间 / 近   dl9 → 防卫
```

**那里只写中文，不写逻辑语原文**——玩家需要看懂，不是需要被炫技。

---

## 数据字段

```js
{
  id, name, cn,              // 内部键、制式名、中文代号
  kind,                      // gun | aam | asm | agm | bomb | ecm | dew
  model,                     // 视觉模型键（null = 不生成实体）
  speed, boost, life, vsLife,// 最大速度 / 助推加速度 / 动力段 / 总寿命（秒）
  turn,                      // 最大转向率 rad/s（海平面）
  seeker,                    // ir | radar | eo | laser | none（无制导弹无此字段）
  lockCone, lockDist,        // 锁定锥角（弧度）与最大锁定距离（米）
  dmg, cd, salvo,            // 伤害 / 冷却 / 一次按键打出的发数（弹数不在这里：= 挂点数 × attr.perPoint；只有机炮才写 ammo）
  flare,                     // 被干扰弹骗到的概率 0..1，越高越好骗
  fuze,                      // 近炸触发半径（米，量到目标表面）；0 / 缺省 = 只有触发引信
  blast, blastCore,          // 爆炸半径 / 满伤半径（米，量到受害者表面）；blast 0 = 无溅射
  blastAir,                  // 缺省 true；false = 只伤地面（子母弹）
  target,                    // air | ground | ship | none | any
  desc,                      // 卡片与图鉴的简介（T('weapons.xxx.desc')，文本里可含 HTML）
  stat: {dmg, spd, trn, rng, ecm},  // 0..1，仅用于界面条形图
  tags: [...],               // 机制标签（见下「特殊标记」），注册时展开成 { 名: true }
  attr: { fits, perPoint, mass },   // 挂载属性，封存时平铺到武器上
  look, role, needs, cd, lead, flareRD   // 外观 / 定位 / 能力门槛 / 每槽装填时间 / 导引品质 / 箔丝概率
}
```

**一件武器的全部字段都写在它自己的文件里**（`js/data/weapons/<id>.js`，`Registry.weapon({ id, order, … })`）。
原来这些字段散在 `STORE_ATTR` / `STORE_LOOK` / `STORE_ROLE` / `STORE_NEEDS` / `STORE_COOLDOWN` / `MISSILE_LEAD` / `FLARE_RD`
七张表里，由 IIFE 合并进 `WEAPONS`；这七张表已不存在，封存时（`Registry.sealData()`）唯一做的合并是把 `attr` 平铺到武器上
（`w.fits` `w.perPoint` `w.mass`）。字段含义与各自的设计理由见 [data.md](data.md#一件武器的字段是怎么来的)。

所以**查一枚弹的真实冷却就是看它文件里的 `cd`**。一个反面教材：`CLA-17` 曾经没写进当时的 `STORE_COOLDOWN`，于是保留了
字面量里按旧语义定的 `0.88 s`，快得离谱；现在 `smoke.js` 对 `fits` 非空的非被动武器逐一要求 `cd ≥ 1`。

射程显示（机库挂载卡片、图鉴「射程」列）统一走 `Ent.displayRange(w)`（`Ent`）：
它读 `effRange`（真实弹道，与 AI、HUD 同一套），按弹种取一个代表性的平飞发射高度
（对地 / 对海弹 8 km、空空弹 6 km），返回公里；无制导弹、吊舱、定向能返回 `null`（不显示"射程"）。

旧入口 `missileRange(w)`（`js/data/rules.js`）是"动力段能送多远"的解析式（载机初速 350 m/s 先加速到
`speed` 再匀速），已不再被机库 / 图鉴使用 —— 它算不出滑翔弹、高抛弹、冲压弹随高度变化的射程，
滑翔弹会被严重低估（GUT-9 按它只有 4.5 km，按真实弹道是 17 km）。

---

## 特殊标记

**只有被代码读到的标记才真的有效**。标记分两类：

- **机制标签**：写在武器文件的 `tags: ['…']` 数组里，声明在 `js/core/tags.js`（没声明就用会在注册时抛错），运行时读 `w.tags.xxx`。
  完整清单与"用在哪些武器"见 [tags.md](tags.md)。
- **普通字段**：下表里没标"标签"的，仍是武器上的字段。

| 标记 | 被谁读 | 含义 |
|---|---|---|
| `reAcquire`（标签） | `Ent` `stepMissile` | **雷达弹**丢失后在 2.6 km 且锁定锥内重新捕获最近的敌机（盲飞期 `reLockT` 之后）。红外弹不靠它，走 `irAcquire()` 自主寻的 —— `target !== 'air'` 的红外弹（GUT-9、TUM-7）只在 `world.targets` 里找地面热源，不会转去追飞机 |
| `antiRadar`（标签） | `engine/combat.js` `blast` | 对**正在辐射**的目标（预警机、开机的干扰机）伤害 ×2 |
| `npcFits` | `Ent` `fitsKind` / `mountPlan` | NPC 的挂点适配表（直接写在武器文件顶层，不在 `attr` 里）；缺省退回 `fits` |
| `nezer` | `AI`（最小发射距离 1400）、`Game`（锁定 1.5 s） | 冲压弹：NEZ 大但近距无力 |
| `scramjet` | `Ent` `effectiveLife`、`HUD` | 18 km 以上动力段骤减 |
| `highAltImmune`（标签） | `Ent` | 转弯下限抬到 0.78（仅 SPO-9）；代价是低空推力最多 −45%、滑翔掉速最多 ×1.6（按相对密度插值） |
| `ballistic`（标签） | `Ent` | 无动力，走自由落体弹道；有导引头的（GUT-9、PEJ-14）由导引转动**速度矢量**（保持速率） |
| `glide` | `Ent` `stepMissile` | 升阻比（仅 GUT-9 = 2.5）：垂直于速度、在铅垂面内向上的升力，大小封顶在 g·cosγ（刚好托住重力，不把弹往上拉）。有它弹才滑翔，没有就是纯抛物线 |
| `fin` | `Ent` `stepMissile`、`HUD` `drawFootprint` | 弹翼修正的侧向加速度上限（m/s²，海平面 250 m/s 时，随 ρ·v² 变）。有 `glide` 的弹（GUT-9）往上修只留横向、往下修卸升力；无 `glide` 的（PEJ-14）弹翼全向修（上下左右、只改方向不加能量）。HUD 据此画泪滴形瞄准圈（`Ent.finFootprint`） |
| `hobs`（标签） | `Ent` `stepMissile` | 出膛后的导引头视场取 max(77°, `lockCone`)，大离轴锁定的目标不会出膛即丢 |
| `cluster` | `Ent` `warheadK`、图鉴 `{{cluster}}` | 数值 = 覆盖半径（米）；面杀伤本身改由 `blast = cluster`、`blastCore = blast`、`blastAir: false` 表达（PEJ-9 60、PEJ-30 80） |
| `penetrator`（标签） | `Ent` `warheadK` | 对加固目标（`hard` 标签的设施，见 `js/data/targets/`）全额伤害；普通战斗部 ×0.6、集束 ×0.2 |
| `loft` | `Ent` `stepMissile` | `{alt, dive}`：水平距离 > dive 时瞄准点抬高 alt，末段俯冲（GUT-25、BOX-14） |
| `decoyMemory`（标签） | `Ent` `decoyRecheck` | 盲飞结束时不会被骗走它的那团诱饵云再骗一次（CLA-4） |
| `twinSeeker`（标签） | `Ent` `breakLock` | 双导引头：要连中两次诱饵才脱锁（BIN-9） |
| `unguided`（标签） | `Ent`、`Game`、`Turret` | 无制导，不找目标、走线段命中检测 |
| `passive`（标签） | `Loadout`、`Game`、`Ent` | 被动吊舱：不占扳机、不进入武器纵列 |
| `silentLock`（标签） | `Ent` `passiveEffects` | 被动测距：用它锁人时对方 RWR 收不到告警（GUS-6 / GUS-9） |
| `duration` / `lockReduce` | `Ent` `openEcm`（→ `spActive` / `ewLockReduce`，再由 `AI` 的锁定距离读） | ECM 生效时间与锁定压缩 |
| `interceptRange` / `interceptCone` / `interceptChance` / `highAltChance` | `Game` `updateDEW`、`Ent` `stepAircraft` | 定向能吊舱（没有充能储备，只有 `cd`，见下「定向能拦截」） |

desc 里可以写 `{{字段}}`（以及 `coneDeg`、`lockKm`、`hardPct` 等派生量），
`js/data/zz-seal.js` 在 `attr` 平铺之后替换成当前数值（文本本身在 `locales/zh-CN/text/weapons/<id>.json`）。desc 不再自动追加任何交战规则句子
（武器锁定机制已整个删掉，见[调节单元附近开火](#调节单元附近开火)）。
派生量全表（`DERIVED`）：`coneDeg` `lockKm` `flarePct` `flareRDPct` `lockResistPct` `lockReducePct`
`interceptConeDeg` `interceptPct` `highAltPct` `volleys` `hardPct` `loftAlt` `loftDiveKm`；
其余 `{{x}}` 取 `w[x]` 的数值，取不到就原样保留。`hardPct` 的 0.2 / 0.6 是在
`js/data/zz-seal.js` 里**另写一份**的（`HARD_K_TEXT`），改 `Ent` 的 `HARD_K`（`warhead.js`）时要同步。
`highAltScale` / `bigTarget`（武器上）/ `selfBlind` / `emitter` / `reDone`
没有任何代码读，已删除。


---

## 武器全表

数字来自 `js/data/weapons/<id>.js`（`attr` 已平铺；`cd`、`lead`、`flareRD` 就是文件里写的值）。`—` 表示无此字段。
`单点` = `perPoint`，即**一个挂载点**的携弹量。

### 机炮

机炮按势力分族。编号同一个逻辑语词根（`cecla` 发射器），各家排自己的号 ——
**参数刻意完全相同**：这是纯文本的差异化，改的是归属与来历，不是手感。

| 键 | 名 | 归属 | rpm | speed | dmg | `spread`（1σ） | ammo | range / highRange |
|---|---|---|---|---|---|---|---|---|
| `cel3` | CEL-3 20mm | 上游 · 制式 | 1950 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |
| `cel7` | CEL-7 30mm | 上游 · G-6 专用重炮 | 1950 | 1020 | 17 | 0.0036 rad | 14000 | 2000 / 3100 |
| `tca11` | TCA-11 30mm | 下游 · 制式（全军一门） | 1950 | 1020 | 17 | 0.0036 rad | 14000 | 2000 / 3100 |
| `cel1` | CEL-1 20mm | 分水群岛国 · 上游外销型 | 1950 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |
| `cel3v` | CEL-3V 20mm | 上游 · 外贸型（管理局采购） | 1950 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |

`spread` 是**角度散布的标准差**，量纲是弧度 —— 展开见
[机炮散布](#机炮散布)。

### 空空导弹

| 键 | 名 | seeker | speed | boost | life/vsLife | turn | lockDist | dmg | flare（雷达弹另有 flareRD） | fuze | blast/core | lead | cd | 单点 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `srm` | TOR-2 短矢 | ir | 760 | 180 | 4.5 / 12 | 1.75 | 4200 | 30 | 0.38 | 12 | 18 / 2 | 0.38 | 4.8 | 10 |
| `trm` | TOR-4 短哨 | ir | 820 | 210 | 5.0 / 13 | 1.95 | 4800 | 32 | 0.24 | 12 | 18 / 2 | 0.48 | 5.6 | 8 |
| `hos` | TOR-6 环刃 | ir | 700 | 240 | 4.0 / 11 | 2.60 | 3200 | 28 | 0.42 | 11 | 17 / 2 | 0.30 | 5.2 | 6 |
| `kkv` | TOR-8 透针 ⁿ | ir | 760 | 220 | 4.5 / 12 | 2.73 | 3800 | 48 | 0.40 | 0 | 0 / 0（仅直接命中） | 0.45 | 3.4 | 12 |
| `qsr` | GIR-5 群刺 | ir | 740 | 190 | 4.2 / 11 | 1.70 | 4000 | 24 | 0.40 | 10 | 16 / 2 | 0.42 | 7.6 | 16 |
| `wasp` | SUT-7 蜂刺 | ir | 860 | 260 | 4.8 / 12 | 2.15 | 5200 | 38 | 0.36 | 13 | 19 / 2 | 0.55 | 8.4 | 4 |
| `swm` | GIR-12 鸦群 | ir | 720 | 300 | 3.5 / 9 | 2.55 | 3400 | 16 | 0.44 | 8 | 14 / 2 | 0.44 | 4.4 | 20 |
| `v9` | GIR-9 蜂群 | ir | 830 | 200 | 4.0 / 9 | 1.90 | 3800 | 44 | 0.50 | 13 | 19 / 2 | 0.52 | 6 | 4 |
| `v11` | SUT-11 锥刺 | ir | 790 | 280 | 5.0 / 11 | 2.45 | 4600 | 56 | 0.35 | 16 | 22 / 2 | 0.62 | 9.2 | 3 |
| `mrm` | CLA-4 中继 | radar | 900 | 200 | 8.0 / 20 | 1.45 | 8600 | 40 | 0.30 / 0.30 | 18 | 30 / 4 | 0.78 | 15 | 6 |
| `hwm` | CLA-8 雷鼓 ⁿ | radar | 810 | 180 | 8.0 / 20 | 1.16 | 8000 | 46 | 0.34 / 0.34 | 22 | 60 / 10 | 0.74 | 19.5 | 3 |
| `arm` | SPO-8 追云 | radar | 880 | 190 | 7.5 / 18 | 1.35 | 9500 | 52 | 0.35 / 0.32 | 22 | 44 / 7 | 0.72 | 18 | 3 |
| `v17` | CLA-17 长杆 | radar | 1150 | 160 | 10.0 / 30 | 1.00 | 12500 | 62 | 0.72 / 0.44 | 21 | 33 / 4 | 0.86 | 22 | 2 |
| `vlar` | CLA-12 极远 | radar | 980 | 150 | 12.0 / 30 | 0.78 | 16000 | 66 | 0.66 / 0.42 | 27 | 49 / 7 | 0.90 | 32 | 2 |
| `hva` | SPO-9 落雷 | radar | 980 | 240 | 8.0 / 18 | 1.30 | 11000 | 62 | 0.70 / 0.40 | 26 | 48 / 7 | 0.80 | 26 | 2 |
| `dl4` | DAR-4 砾石 | radar | 880 | 210 | 6.5 / 16 | 1.25 | 7200 | 30 | 0.45 / 0.34 | 20 | 32 / 4 | 0.74 | 6.8 | 0① |
| `dl6` | BIN-6 燧火 | ir | 780 | 190 | 4.5 / 10 | 2.05 | 3600 | 26 | 0.35 | 14 | 20 / 2 | 0.48 | 4.4 | 0① |
| `dl9` | BAD-9 高墙 | radar | 940 | 320 | 9.0 / 22 | 1.50 | 9000 | 48 | 0.60 / 0.42 | 24 | 36 / 4 | 0.80 | 14 | 0① |
| `vbn` | BIN-9 双生 | ir | 780 | 300 | 4.0 / 10 | 2.10 | 4200 | 42 | 0.58 | 12 | 18 / 2 | 0.66 | 8 | 0① |
| `otr` | TOR-1 旧锭 | ir | 620 | 200 | 3.0 / 7 | 1.35 | 3000 | 32 | 0.86 | 18 | 28 / 8 | 0.32 | 6 | 0① |
| `ss6` | FAN-6 海墙 | radar | 960 | 330 | 9.5 / 22 | 1.45 | 9500 | 46 | 0.58 / 0.42② | 24 | 36 / 4 | 0.80 | 15 | 0① |
| `drm` | TOR-3 雏矢 | ir | 760 | 180 | 4.5 / 12 | 1.75 | 4200 | 30 | 0.38 | 12 | 18 / 2 | 0.38 | 4.8 | 0①（僚机专用，`target: 'any'`） |

① `fits: []` —— 下游专用弹（以及上游舰载的 FAN-6），玩家挂不上（见 [loadout.md](loadout.md)）。
`fuze` / `blast/core` 的定数规则见 [命中与近炸](#命中与近炸)。
ⁿ v1.13 新增（2.0 计划 2.5）：`kkv` 动能杀伤，`fuze 0 / blast 0`，最近点距表面不到 `Combat.CONTACT` 才命中；`hwm` 以 `mrm` 为母型的重战斗部，打编队。
② 雷达弹另有 `flareRD`（箔丝概率，写在武器文件里；表里写成 `flare / flareRD`）。FAN-6 只装在**我方舰艇**上（`target.weapon = 'ss6'`），
对空射击的选目标规则见 [ai.md](ai.md)「水面目标的对空射击」。

**锁定锥**（`lockCone`，发射时的离轴角上限；v2.0.1 起普通红外格斗弹收窄）：

| 类别 | 武器 → 锥角 | 说明 |
|---|---|---|
| 普通红外格斗弹 | TOR-1 24° · TOR-2 28° · TOR-4 30° · GIR-5 30° · GIR-12 32° · TOR-8 34° · SUT-11 35° · SUT-7 36° · BIN-6 36° · BIN-9 40° | 以前 38°–62°，比追尾视角左右 ±43° 的画面还宽，"把机头对过去"没有意义，大离轴弹也失去卖点 |
| 大离轴 | TOR-6 88° · GIR-9 75° | 不动 |
| 雷达弹 | CLA-4 40°（原 32°）· CLA-8 36°（原 32°）· DAR-4 36°（原 30°）· 其余不动（SPO-8 26°、CLA-17 24°、CLA-12 18°、SPO-9 34°、BAD-9 / FAN-6 40°） | 雷达弹的发射锥现实里是载机雷达的扫描范围，不该比普通红外弹窄 |

导弹飞出去以后导引头的视场（`stepMissile` 里 max(±77°, 锁定锥)）不变。AI 开火用锁定锥 × 0.85。

### 对地 / 反大型 / 炸弹

| 键 | 名 | kind | seeker | speed | boost | life/vsLife | turn | lockDist | dmg | blast/core | cd | 单点 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `asl` | GUT-9 滑翔锤 | agm | ir | 320 | — | 14 / 26 | 0.55 | 35000④ | 150 | 30 / 8 | 11 | 6 |
| `asl2` | GUT-12 凿岩 | agm | radar | 480 | 140 | 10 / 22 | 0.90 | 9000 | 340 | 45 / 10 | 16 | 3 |
| `v25` | GUT-25 重锤 | agm | radar | 730 | 120 | 14 / 50 | 0.62 | 8000 | 175 | 30 / 8 | 18 | 3 |
| `lcm` | GUT-30 远帆 | agm | radar | 480 | 110 | 30 / 42 | 0.48 | 14000 | 300 | 45 / 10 | 36 | 2 |
| `sat` | SPO-6 云裂 | asm | radar | 540 | 130 | 9 / 20 | 1.05 | 8200 | 260 | 20 / 6 | 19 | 3 |
| `v22` | SPO-22 锚 | asm | radar | 920 | 130 | 12 / 45 | 0.55 | 8600 | 260 | 20 / 6 | 22 | 2 |
| `rkt` | PEJ-6 撒星 | bomb | 无制导 | 620 | 520 | 3 / 3 | — | — | 22 | 14 / 4 | 4 | 36 |
| `clb` | PEJ-9 碎玉 | bomb | 无制导 | 300 | — | 12 / 24 | — | — | 118 | 60 / 60③ | 14 | 3 |
| `v30` | PEJ-30 铁蒺藜 | bomb | 无制导 | 280 | — | 12 / 24 | — | — | 210 | 80 / 80③ | 16 | 2 |
| `pgb` | PEJ-14 点穴 | bomb | eo | 300 | — | 12 / 24 | 0.30 | 12000 | 165 | 40 / 10 | 16 | 6 |
| `hbl` | PEJ-4 飞蝗 | bomb | — | 300 | — | 12 / 24 | — | — | 70 | 24 / 6 | 5 | 12（轻 / 重 / 腹） |
| `hbh` | PEJ-22 镇岳 | bomb | — | 280 | — | 12 / 24 | — | — | 420 | 110 / 45 | 24 | 3（仅重挂点） |
| `vgt` | TUM-7 碎石 | agm | ir | 430 | 120 | 9 / 20 | 0.62 | 7000 | 190 | 30 / 8 | 11 | 0① |
| `vsr` | BOX-14 坍方 | asm | radar | 560 | 150 | 11 / 24 | 0.55 | 9000 | 260 | 20 / 6 | 15.6 | 0① |
| `ssm` | SPO-30 破浪 | asm | radar | 620 | 160 | 40 / 50 | 0.60 | 16000 | 260 | 20 / 6 | 6 | 0①（舰对舰，`npcOnly`，`loft`） |

③ `blastAir: false`：只伤地面，满半径满伤（子母弹）。
④ GUT-9 的 `lockDist` 按高空（8–12 km、300 m/s 左右）投放的滑翔距离定，低空投放够不着这么远。对地弹都**没有 `fuze`**，只靠触发 / 撞地 / 寿命到期起爆。

`asl` 与 `pgb` 是**无动力但有制导**（`ballistic` 标签）：`asl` 有升阻比（`glide`）能滑翔、
有弹翼（`fin`）能末端修正；`pgb` 不加升阻比，弹道就是投放速度决定的抛物线 + 弹翼全向修正
（`fin`，上下左右都能修、只改方向不加能量），修正范围按投放高度 / 速度约几百米到一两公里，
HUD 画**泪滴形动态瞄准圈**（目标套进圈内 = 必中）。`rkt` 与 `clb` / `v30` 是无制导（`unguided` 标签），
出膛那一刻的指向就是它的一生。字段差异见 `js/data/weapons/` 里 `rkt.js` / `v30.js` / `pgb.js` 的注释。

### 吊舱

| 键 | 名 | kind | 效果 | cd | 单点 |
|---|---|---|---|---|---|
| `e4` | ZUN-4 回声 | ecm | 主动：`duration 6s`、`lockReduce 0.40` | 50 | 1 |
| `l2` | GUS-2 日光 | dew | 定向能拦截（见下） | 36 | 1 |
| `ecm2` | ZUN-8 静默 | ecm 被动 | `lockResist 0.30` | 0 | 1 |
| `dec` | ZUN-12 雾障 | ecm 被动 | `flareBonus 40` | 0 | 1 |
| `oep` | GUS-6 明瞳 | ecm 被动 | `lockRangeBonus 0.45` | 0 | 1 |
| `irp` | GUS-9 夜枭 | ecm 被动 | `lockRangeBonus 0.25`、`lockResist 0.15` | 0 | 1 |
| `hdp` | JDA-3 护盾 | ecm 被动 | `armorBonus 0.22` | 0 | 1 |
| `vzu` | SAV-6 迷雾 | ecm 被动 | `lockResist 0.22`（下游，`fits: []`；玩家锁它时也生效） | 6.8 | 0 |
| `vsc` | SAV-14 焦炬 | ecm | 下游烧穿吊舱：`jamRadius 12000`、`jamK 0.85`、`duration 8` 范围压制（见 [game.md](game.md) `updateJamming()`） | 40 | 0 |

---

### 炮塔用炮

舰炮、近防炮、遥控炮、尾炮不在 `WEAPONS` 里，在 `TURRET_GUNS`（`js/data/turret-guns/<id>.js`，NPC 专用，不进挂载图鉴）。
字段与机炮相同，另有 `gravity` / `fuze` / `blast` / `blastCore`（大口径近炸、定时空爆）、`airRange`、`surface`，
以及 `kind: 'launcher'` 的导弹发射架。全表与瞄准逻辑见 [turret.md](turret.md)。

## 机炮散布

每发子弹在**垂直于炮口轴的两个方向上各取一个独立的高斯样本**，
标准差 = `WEAPONS[].spread`（弧度），合成一个圆形的角散布锥：

```js
dir = norm(fwd + right * gauss() * spread + up * gauss() * spread)
1σ 半径(R) = spread × R          // 垂直平面内的瑞利分布
```

三个决定（外加一条附注）：

**① 为什么是高斯，不是"每轴一个均匀随机数"。** 原来是
`rnd(-1,1) * spread` 三个轴各一次 —— 那是个**方块**，最外圈和正中心
一样密，靶纸上像一圈轮廓线。换成两个高斯分量之后，半径是瑞利分布：
**圆心密、边缘稀**，和实弹靶纸一致，也让"大部分弹落在中心附近、
少数飞得远"这件事在视觉上成立。

**② 为什么是锥形（散布随距离线性放大），而不是"到哪都散开同样多米"。**
真枪的散布本来就是角度量。更重要的是这个形状自带想要的平衡：
近距离 σ 小到可以忽略（机炮仍是精确武器），远距离它长成一片。
现在没有任何机制能让散布在近距离很大 —— **面杀伤只发生在远距离**，
而远距离打中目标靠的是射速（见③）。

**③ 远距离靠射速兜住。** 落进半径 `r` 的靶的概率是
`P = 1 - exp(-r² / 2σ²)`（飞机受击半径 7.5 m，见 `Game scanShot`）。
CEL 系机炮每门都是 1950 发/分（原 3900，已减半；相对原来的 3900 是 1/2 的射速，即约 1/4 的实际发数），
每次扣扳机出 1 发（`n = round(rps × 0.033)`，rps ≈ 32.5 时取 1），
即约 **32 发/秒**（帧率远高于 32 fps，不受帧率封顶）：

| 距离 | `spread×R` = 1σ | 2σ 半径（86% 落点） | 落进 7.5 m 靶 | 命中数/秒 | 期望击杀（130 hp，frigatebird，7 dmg/发） |
|---|---|---|---|---|---|
| 300 m | 0.96 m | 1.9 m | ~100% | ~32 | 0.6 s |
| 800 m | 2.6 m | 5.1 m | 99% | ~32 | 0.6 s |
| 1600 m | 5.1 m | 10.2 m | 66% | ~21 | 0.9 s |
| 2600 m（最大） | 8.3 m | 16.6 m | 33% | ~11 | 1.7 s |

所以最大射程上的画面是"一梭子过去是一团"，而不是一条线 ——
每秒仍有十来发落在目标身上，**极限距离依旧是可以点杀的**，只是不再是一束激光。

这就是这条平衡的边界：`spread` 再往上调约 20%（σ ≈ 3.8 mrad），
2600 m 上的落靶率就跌破 25%，`tools/test/smoke.js` 的那两条断言会先失败 ——
"远距离的大范围散布靠射速弥补"这句话，在那里开始不成立。

**④（附注）AI 不受这条影响。** `AI` 的开火条件是瞄准误差
`off < gunCone × 3.2`，量级是 5–9°，比几千分之一弧度的散布大两个
数量级 —— 敌机的命中率由它自己的瞄准精度决定，不是由散布决定。

散点验证在 `tools/test/smoke.js`：300 m 与最大射程各抽 800 发量落点，
四条断言 —— 近距 1σ ≤ 1.5 m、远距 1σ ≥ 4 m、远距落靶率 ≥ 25%、
以及把落靶率折成 `dmg/s` 后要能在 5 秒内打掉最硬的一架
（250 hp 的 G-6；原为 1.25 秒，射速降为原来的 1/4 后量尺放宽 ×4）。

---

## 导引

`seeker` 共四种**在用**取值（外加休眠的 `laser`）：

| `seeker` | 抗干扰 | 说明 |
|---|---|---|
| `ir`（红外） | 看 `flare` | 点源导引头，热焰弹能骗 |
| `radar`（雷达） | 看 `flareRD`（缺省回退 `flare`） | 被箔丝骗；空空雷达弹的 `flareRD` 整体低于红外弹的 `flare` |
| `eo`（光电，仅 PEJ-14） | `flare: 0`，永远不被骗 | 成像导引头，热焰弹与箔丝都无意义 |
| `laser`（激光照射） | — | **当前无武器使用**；机制代码在 `Ent` 里休眠 |
| `none` | — | 无制导 |

### 锁定：`updateLock(dt)`

```js
cone = w.lockCone;
if (player.pos.y > 18000) cone *= 0.78;          // 高空导引头视场收窄到 78%
lockDist = w.lockDist;
if (player.lockRangeK) lockDist *= player.lockRangeK;          // 光电吊舱加成

/* 双向压制（设定 8.3"干扰是双向的"）：自己的干扰机也在压自己的接收机。
   强度取 ewPower —— 那条"爬升 → 压制 → 被对手对抗掉"的曲线，不是一个开关；
   用 ewPower 而不是 spActive，切走吊舱才不会让辐射凭空消失。 */
if (player.ewPower > 0) {
  lockDist *= (1 - (player.ewLockReduce || 0.40) * player.ewPower);
  cone = Math.min(cone, 20 * Math.PI / 180);     // 红外弹视场收窄到 ±20°
}
if (player.emcon) lockDist *= 0.5;               // EMCON-Δ：雷达关机，只剩被动手段
```

**对空与对面是两套不同的判据**：

```js
if (Ent.targetClass(w, t) === 'air') ok = dist < lockDist && off < cone;   // 导引头：距离 + 离轴角
else if (w.target === 'any') ok = dist < lockDist && lockOff < cone;       // TOR-3 对地一侧：不乘 1.35、不看俯角
else { dep = -dir.y;  ok = dist < lockDist * 1.35 && dep > -0.10 && lockOff < cone; }  // 火控投放包线：距离 + 俯角 + 水平方位
```

对面弹的方位只量**水平方位**（`Ent.lockOff`，世界垂直方向不算，与 AI、航线 `strike` 同一规则），
不再单看俯角（以前正后方的目标也锁得上）；距离放宽到 `lockDist × 1.35`，
目标不能高过机头（`dep > -0.10`）。火控要算的是"这一下能不能扔到"，
不是导引头视场。以前两个分支的代码一模一样，等于拿导引头的逻辑去锁海面。

锁定速率按导引方式分档（单位是"每秒完成几成"的倒数）：

```js
rate = 1 / (w.nezer ? 1.5
  : (w.seeker === 'ir' ? 0.55
    : (w.seeker === 'eo' ? 0.60
      : (w.seeker === 'laser' ? 1.6 : 1.1))));
```

| 导引方式 | 满锁定耗时 |
|---|---|
| 红外 `ir` | 0.55 s |
| 光电 `eo` | 0.60 s |
| 雷达 `radar`（含其他） | 1.1 s |
| 冲压弹 `nezer` | 1.5 s |
| 激光 `laser`（休眠） | 1.6 s |

脱锁时进度以 `2.2 / s` 衰减。`player.locked = lockProgress >= 1`。

> **`lockProgress` 现在不拦发射**，目标类型对不上也不拦。
> 类型对不上（拿对空弹选着海面浮台，见 `targetMismatch()`）时
> `updateLock()` **根本不开始锁定**；此时仍可强制开火，但按无锁定处理（弹不带目标出膛）。
> `lockProgress` 只驱动 HUD 上的锁定环，是"火控解算进度"，
> 不是开火许可。以前"必须先锁定才能开火"会拦掉两种正当用法：
> 无制导武器、以及俯冲扫射式的对地攻击。

### 发射：`launch(actor, target, w)`

按武器类型分路：

1. **`kind === 'ecm'`**：不发射弹药 —— 转 `fireEcm()`，那是**唯一**的
   开机入口（协处理器的自主开机 `updateEWAuto()` 也走它）。
   `Ent.openEcm()` 写 `spActive` / `ewT` / `ewBurnT`（按**对手**技能定的
   3–8 秒对抗窗口）/ `ewLockReduce` / 范围压制参数；`fireEcm()` 再扣
   `spCd` 与第 0 个槽、播语音提示。冷却期间返回 `false`。
2. **`kind === 'dew'`**：自动系统，手动发射一律返回 `false`
   （玩家按发射键会得到一句"GUS-2 是自动拦截系统"）。
3. **弹药类**：依次检查备弹、找**一个就绪的发射槽**。没有按空域锁武器的分支。

```js
var nShot = Math.max(1, Math.min(wp.salvo || 1, actor.spAmmo));
```

**一次按键打出 `wp.salvo` 枚，共用同一个冷却槽**（GIR-5 三联装打 3 枚、
蜂群 2 枚、鸦群 4 枚、撒星 7 枚）。出膛位置由槽序号决定左右：

```js
hp = actor.pos + actor.fwd*4 + actor.right * side * (2.4 + rank*1.9)
     side = (slotIdx % 2) ? 1 : -1;   rank = floor(slotIdx / 2);
```

**同一个冷却槽里的那几枚，各自偏开出膛** —— 由 `salvoShots(actor, wp, n)`
在 `launch()` 之前算好：

| 量 | 值 | 作用 |
|---|---|---|
| `SALVO_FAN` | 1.8°（**无制导弹只用 0.2°**） | 相邻两发的方位夹角，以机头为中线左右对称展开 |
| `SALVO_VER` | 0.4 × `SALVO_FAN` | 奇偶发上下交错，扇面不是平的 |
| `SALVO_NEST` | 0.8 m | 出膛点在巢内横向错开 |

以前几枚是"同一个点、同一个指向、同一个初速"复制出来的，完全重合：
画面上只有一条烟迹，按一下打三发和打一发看不出区别。

**位置那一半不是装饰。** 带导引头的弹出膛后一两帧内就把机头掰回视线，
只给角度的话几枚弹立刻又并回同一条线；出膛点错开才会让它们在中段
航路上保持住间距。

**无制导弹的角度要单独收窄。** 它们的出膛指向就是整条弹道，
1.8° 的扇面等于把"七发打在一个点"改成"七发撒在半径 60 米的一圈里" ——
那是数值改动而不是视觉改动，火箭巢的命中率会凭空掉一大截。火箭巢的
管子本来就是平行的，错开的是管子本身（位置），不是指向。

偏移左右对称，平均指向仍是机头方向，命中逻辑不变；那点随机抖动
（±25% 的 `SALVO_FAN`）是为了不出现"每次齐射都是同一张对称图"。
单发（`n ≤ 1`）不做任何偏移。

打出的弹初速是 `actor.speed + 70`。发射后该槽进入 `wp.cd` 冷却，
`spCd` 更新为"最快就绪的那个槽"的剩余时间。

玩家发射时 `fireSpecial()`（`js/ui/input.js`，经 `launchCall(w)`）还会按类型播无线电呼号：

| 条件 | 台词 |
|---|---|
| `kind !== 'aam'`（炸弹 / 对地 / 反舰）或带 `unguided` 标签 | **投放** |
| `seeker === 'radar'` | **Fox 3** |
| 其余 | **Fox 2** |

（炸弹报"投放"而不是 Fox 2 —— 原来的判断只看了 `unguided`，
于是 PEJ-14 这类制导炸弹会喊出战斗机发射格斗弹的呼号。）

---

## 命中与近炸

v1.13 起起爆与范围伤害集中在 `js/engine/combat.js`（`Combat`）。
旧字段 `prox` 已全部删除；`Combat.spec(w)` 在新字段缺省时从 `prox` / `cluster` 推出兼容值。

| 入口 | 何时 | 结果 |
|---|---|---|
| `fuzeCheck`（`Ent` `stepMissile`） | 制导弹每帧，**只看自己的目标**（或诱饵虚拟目标） | 相对运动线段求最近点：`gap < Combat.CONTACT`（1.5）= 直接命中满伤；`gap < fuze` 且最近点落在本帧内 → 在最近点起爆 |
| `scanShot`（`Game`，`js/engine/game/combat.js`） | 无制导弹撞飞机 / 设施（不走 `fuzeCheck`） | `Combat.detonate`，被撞单位作 `direct`；子弹不变 |
| 撞地 / 撞海（`pos.y <= 0`） | 所有弹 | 起爆（`{ground: true}`），以前是哑弹 |
| 寿命到期 | 所有弹 | 起爆，以前是哑弹 |

```js
Combat.detonate(shot, world, pos, direct, {ground})   // = blast + blastFx + SFX.boom
// blast：半径内所有 actors + targets（同队与发射者除外，中立 team 2 照打）
d = max(0, dist - 受害者半径);       // 飞机 Combat.HIT_R_AIR = 7.5，设施 / 舰船 tg.radius
k = d <= core ? 1 : d < R ? (1 - x)² : 0;   // x = (d - core) / (R - core)
dmg × k × warheadK × (antiRadar && 正在辐射 ? 2 : 1);   // direct 单位 k = 1
```

- `Ent.detonate(m, t, world)` 保留为兼容包装；`Ent.clusterBurst` 已删除。
- 玩家在爆炸半径内 → `Renderer.addShake`；在 R..2.5R 的擦边 → 小幅震动。
- **诱饵起爆**：`breakLock` 骗中后的盲飞期（`reLockT > 0`）里，弹追 `decoyTarget(m)` ——
  `decoy.p + decoy.v × (age − t0)` 处半径 `DECOY_R = 4` 的虚拟目标，直到 `DECOY_LIFE`（2.6 s）
  或盲飞期结束；在它身上起爆，溅射能伤到刚投弹的飞机（贴脸投弹仍会受伤）。ECM（`openEcm`）不变：盲飞、寿命末自毁。

| 档 | 弹 | fuze | blast | core |
|---|---|---|---|---|
| 格斗弹 | srm drm trm hos qsr swm wasp v11 v9 dl6 vbn | round(旧 prox × 0.6) | fuze + 6 | 2 |
| 中程 | mrm dl4 v17 dl9 ss6 | × 0.7 | + 12 | 4 |
| 重型 | arm vlar hva | × 0.8 | + 22 | 7 |
| 例外 | otr | 18 | 28 | 8（dmg 30→32：老弹跟踪差，补偿） |
| 例外 | hwm | 22 | 60 | 10（以 mrm 为母型的重战斗部，打编队） |
| 例外 | kkv | 0 | 0 | 0（动能杀伤，仅直接命中） |
| 对地 | rkt 14/4；clb 60/60、v30 80/80（只伤地面）；asl v25 vgt 30/8；asl2 lcm 45/10；sat v22 vsr ssm 20/6；pgb 40/10；hbl 24/6；hbh 110/45 | — | 见左 | 见左 |

- **特效 `Combat.blastFx`**：火球半径 clamp(0.35×blast, core, 0.5×blast) 且 ≥ 4；Fibonacci 球面破片壳（drag 3.5，飞到 ≈ blast）+
  拖尾粒子，继承 30% 弹速；落地 = 半球 + 0.6×blast 水柱；子母弹 = 6–10 团错时小爆（粒子 `delay`）；blast 0 只在直接命中时白闪。
  按粒子数（650 / 800）与距离（6 / 12 km）降级。`Ent.spawnParticle` 新增 `streak` / `delay`，`render.js` 画拖尾。
- 图鉴 `inv2` 有「引信 / 爆炸半径」列（`js/ui/codex/entries/inv2.js` 的 `_fuzeTxt` / `_blastTxt`），详情页 `weaponParams` 有同名两行。
- 调参后看分布：`node tools/test/probes/probe-blast.js`（见 [tools.md](tools.md)）。
- **设施 / 舰船走 `hitTarget`**：`Game` 启动时 `Ent.setTargetHitHandler()` 注册自己的
  `hitTarget`，范围伤害打地面目标都经它结算（击毁进 `groundKilled`、误击调节单元记处罚）。
  没注册时（工具脚本）退回 `hp -= dmg` + `killGround`。
- **加固目标（`Ent.isHard`）**：`t.hard` 或设施带 `hard` 标签（`js/data/targets/*.js` 里写了 `tags: ['hard']` 的，目前只有 `radar`；实体创建时标签带到 `t.tags`）。
  `warheadK`：`penetrator` 标签（GUT-12）×1、`cluster` ×0.2、其余战斗部 ×0.6；机炮子弹无 `b.w`，不打折。

- **机炮抗性（`gunResist`）**：小口径航炮子弹（`b.kind === 'bullet'` 且 `b.cal ≤ Ent.SMALL_CAL` = 40 mm）
  打中带 `gunResist` 的单位，伤害 ×(1 − gunResist)（`Ent.gunResistK`，封顶 0.999）。导弹、炸弹、
  大口径炮弹不受影响。飞机、设施、舰船都吃（`scanShot` 两个分支各乘一次）；与 JDA-3 的 `armor` 相乘叠加。
  数值来源：`AIRCRAFT[].gunResist`（ROK-40 0.15、预警 / 干扰机 0.05，其余 0）、`SHIPS[].gunResist` / `PLATFORMS[].gunResist`
  （小艇 0 → 航母 0.995）、`TARGETS[model].gunResist`（`js/data/targets/*.js`：调节单元 0.75、SAM 0.5、雷达 0.6、中继 0.7、站点 0.9；原来的 `GUN_RESIST_MODELS` 表）。
  机炮武器的 `cal` 字段（mm）由 `fireGun` 写到子弹上。

子弹与**无制导弹**都用 `M3.raySphere()` 做**线段**求交
（`prev → pos`），见 [flight-model.md](flight-model.md#子弹)。

---

## 干扰与拦截

### 干扰弹（玩家按 `V`）

`Ent.breakLock(a, world)`：

1. 检查 `a.flares > 0 && a.flareCd <= 0`，否则返回 `false`
2. 消耗一组（`flares` 的单位是**组**），冷却 **0.45 s** ——
   按住 `V` 会按这个间隔连投，由玩家自己决定丢几组
   （最早是 1.6 s，一次交战只能放一发；中间一度压到 0.12 s，
   那又变成了"每秒八组"，配合下面的抗欺骗机制才回到 0.45 s）
3. 生成 **6 个热焰弹粒子**（橙黄，继承机速 ×0.22，再沿机体下方抛出）
   与 **14 个箔丝粒子**（淡白，更散、更慢、更久）—— 纯视觉
4. 遍历所有以本机为目标的导弹掷骰：

```js
if (!m.alive || m.target !== a) continue;
// chance 先按导引头分流（见下），再乘上**抗欺骗衰减**
m.decoyTries = (m.decoyTries || 0) + 1;
chance = Math.max(0.03, chance * Math.pow(0.62, m.decoyTries - 1));
if (Math.random() >= chance) continue;     // 没被骗到
if (m.seekers > 1) { m.seekers--; continue; }   // BIN-9 双导引头：先骗掉一个
m.target = null; m.seekerOn = false; m.lostTime = 1;
m.reLockT = 1.4;      // 盲飞 1.4 s：这之前谁都不能重新捕获
m.spoofed = a;        // 投诱饵的那一架：只在盲飞期内被 irAcquire 跳过
m.decoy = { p, v, t0, p2: chance * 0.5 };   // 骗走它的那团诱饵云
```

**关键点**：

- **按导引头分流概率**：热焰弹与箔丝一起投放，同一次掷骰里
  `ir` 用 `flare`、`radar` 用 `flareRD`（缺省回退 `flare`）、`eo` / `laser` 恒为 0。
- **诱饵云的二次欺骗（`decoyRecheck`）**：盲飞期结束那一帧，若骗走它的诱饵云
  还亮着（2.6 s 内）且在锁定锥里，没有 `decoyMemory` 的弹以 `chance × 0.5`
  再咬回那团云，盲飞延长到云熄灭。**CLA-4（`decoyMemory`）认得那团云**，
  直接跳过这一步 —— 它不会被同一组诱饵骗两次，但仍可重新咬住投诱饵的那架飞机。
- **雷达弹的重捕获（`reAcquire`）限制在 2.6 km 且锁定锥内**。
- **双导引头（`twinSeeker`，BIN-9）**：第一次骗中只扣掉一个导引头，
  第二次骗中才真正脱锁。
- **`flare` 字段本身就是"被干扰的概率"，越小越难骗**。
  公式里写成 `1 - flare·k` 是错的（曾经这么错过，等于把抗干扰改型
  TOR-4 变成了最容易被骗的一枚）。
- **抗欺骗递减（`m.decoyTries`）**：同一枚弹每被投放一次诱饵，
  成功率就乘 0.62，地板 0.03。
  - 一枚 65% 的弹依次是 65% → 40% → 25% → 15% → 9%……（实测
    `srm` 四次采样 43% → 24% → 14% → 10%）。
  - 计数器**不会因为一次成功而清零**：导引头一旦学会这架飞机丢诱饵
    的方式，重捕获之后不会再被骗第二次。
  - 为什么需要它：`flares` 有 **80 组**，0.12 s 间隔下连投等于
    "必脱锁" —— 而诱饵应该只是**争取一次脱离机会**的东西。
  - 玩家侧的唯一反馈：投放后一枚都没骗到、而那枚弹已经被骗过一次，
    无线电会给一句"诱饵没用了"（每 10 秒最多一次）。
- **诱饵只买到一段时间，不是永久免疫（`m.reLockT`）**：
  骗中的那一刻设 `reLockT = 1.4`，之后每帧递减；归零之前谁都不能重新捕获
  （IR 的 `irAcquire` 与雷达弹的 `reAcquire` 共用这个闸门）。
  - 旧实现是用 `m.reDone = true` 兼职的，而那一位置同时是 `reAcquire`
    的重捕获闸门 —— 于是**一次诱饵就让带 reAcquire 的弹永久失去重捕获能力**；
    IR 弹那边靠 `m.spoofed` 无条件 `continue`，同样是永久免疫。
  - 现在 `spoofed` 只在 `reLockT > 0` 期间生效：`irAcquire` 跳过它，
    告警 / 来袭标记据它继续报警。盲飞期一过就没有任何作用。
  - 断言见 `tools/test/smoke.js`「诱饵只买到一段时间」。
- **告警与来袭标记不只看 `m.target`。** 判据是
  "当前锁定本机"**或**"刚被本机诱饵骗掉、`reLockT > 0`、且仍在本机 3600 m 内"
  （`Game` 的导弹告警音、`HUD` 的 `drawIncomingMissiles`）。
  只认 `m.target` 的话，撒出一发诱饵的那一瞬间告警音与红色菱形会一起消失，
  而那枚弹还在同一片空域里飞、还可能重新咬回来 —— 这是最危险的一类假信号。
- 成功与否由 `breakLock` 返回值表示：**只要本帧真的投了一组诱饵就返回 `true`**
  （哪怕一枚都没骗到）—— 返回值表示"投放动作"是否发生，不是命中数。
  命中数与"无效投放数"写在 `a.decoysBroke` / `a.decoysIneffective` 上。
- 举例：`v11` 锥刺（红外）`flare = 0.35` → 第一次投放 35% 被骗走；
  `v17` 长杆（雷达）`flareRD = 0.44` → 第一次 44% 被骗走。

> 雷达弹曾经平均**更容易**被骗（`flare` 是逐个手调的）。现在雷达弹各自写了
> `flareRD`（原来的 `FLARE_RD` 表，并进了武器文件），空空雷达弹整体低于红外弹均值，
> 由 `tools/test/smoke.js`「箔丝有效」断言守着。

### 定向能拦截（GUS-2）

在 `Game` 的 `updateDEW(dt, actor)`（`js/engine/game/combat.js`），条件是：

- 武器 `kind === 'dew'` 且有就绪的 `slotCd` 槽（值为 0）
- 导弹以本机为目标、敌我不同队
- 距离 < `interceptRange`（1200 m）
- 与本机机头夹角 < `interceptCone`（35°）

```js
chance = (actor.pos.y > 18000 && w.highAltChance) ? w.highAltChance : w.interceptChance;
if (m.dewRolled === actor.id) continue;   // 每枚来袭弹只掷一次骰
m.dewRolled = actor.id;
if (!(Math.random() < chance)) continue;
```

**每枚来袭弹只判一次**：第一次进入包线时按 `chance` 掷骰，结果记在 `m.dewRolled`
（`makeMissile` 初始化为 `null`）。以前是把总概率按"约 1.2 s 飞行时间"折成每帧概率连续掷，
实际累积取决于接近速度 —— 迎头快弹的 55% 实际只有 37% 左右。现在 desc 写的 55%
就是每枚弹被烧掉的概率（18 km 以上用 `highAltChance`）。

成功后烧毁导弹、播 `laser()` 音效与一句电台；玩家还会在"挂载切换"同一处（`SysNote`）弹一条拦截提示。

**没有充能储备，只有单次冷却**：拦截不消耗弹药。每个 GUS-2 挂点占一个 `slotCd` 发射槽，
拦截成功后该槽设为 `cd`（36 s），由 `stepAircraft` 与导弹同一套逻辑倒计时，
冷却条画在右下角 STORES 缩略图里。多个吊舱各自独立。
吊舱是自动系统，不要求被选为当前武器。

---

## 调节单元附近开火

**没有交战规则锁定。** 旧版 m3 的"阵列空域 5 km 内禁用 `asm / agm / bomb`"
（`roeRestricted()`、`world.roeBlocked`、`launch()` 拦截、HUD"交战规则生效"、desc 末尾那句提示）已整个删掉。

现在每一关头顶都有调节单元（见 [missions.md](missions.md#调节单元阵列-spawncellfield)），
`launch()` 不看它们。约束只剩后果：单元是 `team: 2` + `friendlyAsset`，
玩家的弹打掉一个记一次 `friendlyLoss`（结算扣分）。
文字上只剩一句"谨慎使用重型武器"——m3 简报 / 目标、m3 的 SEXTANT 电台、一条帮助提示、图鉴 `s2` / `s4`。

---

## 挂载与出装

**一种武器能不能出场、能挂到哪、一个挂点带几发，由武器文件里的 `attr` 决定**，
不在本节的参数里。完整机制见 [loadout.md](loadout.md)。

简言之：`fits` 决定它能上哪些挂载点类型，`perPoint` 决定单点携弹量，
`mass` 决定它对机动性的拖累。

---

## 如何加一种武器

1. 新建 `js/data/weapons/<id>.js`，写一个 `Registry.weapon({ order, id, … })`，**id 用短的内部代号**
   （别用逻辑语前缀当 id，太长且没必要）；`order` 决定在机库 / 图鉴里的先后
2. 填 `name` 用逻辑语前缀 + 序号，`cn` / `desc` / `role` 用 `T('weapons.<id>.cn')` 等，
   并在 `locales/zh-CN/text/weapons/<id>.json` 里写文本
3. 玩家能挂的写 `attr: { fits, perPoint, mass }`，并写 `cd`（每槽装填时间，`smoke.js` 要求 ≥ 1）；
   制导弹写 `lead`，雷达弹再写 `flareRD`；需要机体门槛写 `needs`，外观写 `look`
4. 要用机制标签就写 `tags: ['…']`（没声明的先在 `js/core/tags.js` 声明，见 [tags.md](tags.md)）
5. 在 `js/ui/screens/hardpoints.js` 的 `ROOTS` 里加中文含义（若有编号前缀）
6. 把 id 加进某个机型的 `defaultLoadout`（旧文档里的 `specials` 字段已不存在）
7. 需要自检就把 id 加进 `js/boot/main.js` `preflight()` 里的 `needWeapons` 列表
8. `node tools/build/gen-pages.js`（把新文件加进各语言页面副本的脚本清单），再跑 `node tools/test/smoke.js`

**别忘第 7 步**——自检列表是手工维护的，漏了不会报错，
但那个武器永远不会出现在自检里。只给 NPC 用的弹见 [loadout.md](loadout.md#加一种新武器)。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 武器基础数据 | `js/data/weapons/<id>.js` |
| 每槽装填时间 | 同文件的 `cd` |
| 导引品质 `lead` | 同文件的 `lead` |
| 挂载适配 / 单点弹数 / 重量 | 同文件的 `attr` |
| 机体能力门槛 | 同文件的 `needs` 与 `AIRCRAFT[].caps` |
| 高空锁定锥收窄（×0.78） | `Game` `updateLock()`（`js/engine/game/lock.js`） |
| 锁定速率分档 | 同上，`rate` 那一行 |
| 一次按键打出的发数 | 武器自己的 `salvo` |
| 近炸 / 爆炸半径 | 武器文件的 `fuze` `blast` `blastCore` `blastAir` |
| 衰减曲线 / 飞机受害半径 / 直接命中距离 | `js/engine/combat.js` `falloffK` / `HIT_R_AIR` / `CONTACT` |
| 爆炸特效与预算 | `js/engine/combat.js` `blastFx` / `BLAST_FX` |
| 干扰弹冷却与粒子数 | `Ent` `breakLock()`（`js/engine/entities/warhead.js`） |
| 定向能拦截（每枚来袭弹只掷一次骰，`dewRolled`） | `Game` `updateDEW()`（`js/engine/game/combat.js`） |

## 地形高度钩子（为陆地做准备）

`Ent.groundY(x, z)` 返回该处地面高度（现为 0 = 海面），`Ent.setTerrain(fn)` 注入地形函数。导弹 / 炸弹 / 炮弹的落地判定、`naturalPoint`（HUD 预计落点，可传目标所在高度截弹道）、`finFootprint`（瞄准圈，可传目标高度）、AI 对面弹射程（按“本机高出目标多少”查 `aiReach`）都读它，不再写死 y = 0。`probe-ccip` 用 600 m 平台验证。注意 `effRange` 按高度分档缓存，地形变化后要清 `w.__eff`。

两种“地面”分开：海平面 `Ent.SEA_Y`（恒为 0，舰船 / 水柱 / 落水）与地形高度 `Ent.terrainY`；`Ent.groundY` = 两者取高，`Ent.isLand` 判陆地，`Ent.agl(e)` 是离地高度。AI 的撞地保护 / 航线高度、近地告警、目视低空判定（`dangerAltitude`）、坠毁判定、水柱特效都读它们；炮塔对面解算本来就按目标高度差算仰角（`probe-ccip` 有高地用例）。巢式武器的 `look.rdia` 是离架后单发直径（`MODELS.round` 用）。

## 本批更新：引信、碰炸与包线余量

- **碰炸（所有弹）**：`Ent.contactScan`，见 [entities.md](entities.md#碰炸近炸与干扰弹contactscan--breaklockfor)。
- **拟真近炸**：只对敌方飞机，需要已解保（0.6 s）、在 110° 引信锥内、最近点在本帧内。友机、中立、干扰弹粒子不触发。无引信的对地弹只碰炸。
- **溅射空中**：非子母弹默认 `blastAir: true`，落点附近的低空飞机会受伤（伤害按距离衰减）；子母弹（`clb`、`v30`）保留 `blastAir: false`。
- **发射包线余量**：AI、打击航线、发射架统一按目标类别分开：空中 0.9、地面 / 海面 0.8。
- **机炮**：`rpm` 1950（CEL 系），约 32.5 发/秒。机载尾炮 `tail20a` rpm 150。
