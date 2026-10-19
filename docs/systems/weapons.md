# 武器系统

数据 `js/data.js` 的 `WEAPONS` · 行为 `js/entities.js` · 发射与锁定 `js/game.js`
的 `launch()` / `updateLock()` / `updateDEW()` / `breakLock()`

---

## 编号体系

装备前缀取自**真实的逻辑语（Lojban）词根**（rafsi）。这不是随手拼的字母，
每个前缀都能在主词表里查到出处 —— 权威版本在 `js/codex.js` 的
「逻辑语」条目（`data.js` 文件头另有一份速查）。

| 编号 | 词根 | 源词 | 含义（本作用法） |
|---|---|---|---|
| `CEL-` | cel | *cecla* | 发射器 / 炮 —— 机炮 |
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

同一个词根在不同势力各排各的号（机炮 `CEL-` 就是这样：上游 3/7、下游 11、分水 1、管理局 2）。

**重要**：`WEAPONS` 的**对象键**（`v11` `k3` `dl4` …）是早期技术代号，
与显示名不一致，这是有意的——改键名要动多个文件，风险不值得。
玩家看到的永远是 `name` 字段。

`ROOTS`（在 `game.js`）只把**有编号前缀的键**映射到中文含义，
机库界面用它显示"编号含义 · 发射器 / 炮"：

```js
var ROOTS = {
  k1/k2/k3/k7/k11: '发射器 / 炮', v9: '组 / 群', v11: '快',
  v17: '长', v22: '摧毁', v25: '攻击', v30: '扩散 / 播撒',
  e4: '干扰', l2: '光', dl4: '远', dl6: '之间 / 近', dl9: '防卫'
};
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
  dmg, ammo, cd, salvo,      // 伤害 / 备弹 / 冷却 / 一次按键打出的发数
  flare,                     // 被干扰弹骗到的概率 0..1，越高越好骗
  fuze,                      // 近炸触发半径（米，量到目标表面）；0 / 缺省 = 只有触发引信
  blast, blastCore,          // 爆炸半径 / 满伤半径（米，量到受害者表面）；blast 0 = 无溅射
  blastAir,                  // 缺省 true；false = 只伤地面（子母弹）
  target,                    // air | ground | ship | none
  desc,                      // 卡片与图鉴的简介（HTML）
  stat: {dmg, spd, trn, rng, ecm}   // 0..1，仅用于界面条形图
}
```

**这些字段不是全部写在字面量里的**。`data.js` 在 `WEAPONS` 之后按顺序
把几张独立表合并进去，后面的会覆盖前面的同名字段：

| 顺序 | 表 | 注入字段 | 备注 |
|---|---|---|---|
| 1 | `STORE_ATTR` | `fits` `perPoint` `mass` | 挂载属性，见 [loadout.md](loadout.md) |
| 2 | `STORE_ROLE` | `role` | 卡片与图鉴里的一句话定位 |
| 3 | `STORE_NEEDS` | `needs` | 机体能力门槛 |
| 4 | `STORE_COOLDOWN` | `cd` | **覆盖字面量里的 cd** |
| 5 | `MISSILE_LEAD` | `lead` | 导引品质；无制导弹跳过 |

所以**查一枚弹的真实冷却要去 `STORE_COOLDOWN`**，不是 `WEAPONS` 字面量。
一个反面教材：`CLA-17` 曾经没写进 `STORE_COOLDOWN`，于是保留了
字面量里按旧语义定的 `0.88 s`，快得离谱；`smoke.js` 会检查这件事
（对 `fits` 非空的非被动武器逐一核对）。

`missileRange(w)` 估算动力段能送多远（公里）：被动吊舱返回 `null`，
无助推的返回 `speed × life / 1000`，否则按"载机初速 350 m/s 先加速到
`speed` 再匀速"积分：

```js
tAcc = min(life, max(0, (speed - 350) / boost));
rAcc = 350*tAcc + 0.5*boost*tAcc²;   rCruise = speed * max(0, life - tAcc);
```

---

## 特殊标记

**只有被代码读到的标记才真的有效**。下表区分两者：

| 标记 | 被谁读 | 含义 |
|---|---|---|
| `reAcquire` | `entities.js` `stepMissile` | **雷达弹**丢失后在 2.6 km 且锁定锥内重新捕获最近的敌机（盲飞期 `reLockT` 之后）。红外弹不靠它，走 `irAcquire()` 自主寻的 —— `target !== 'air'` 的红外弹（GUT-9、TUM-7）只在 `world.targets` 里找地面热源，不会转去追飞机 |
| `antiRadar` | `combat.js` `blast` | 对**正在辐射**的目标（预警机、开机的干扰机）伤害 ×2 |
| `npcFits` | `entities.js` `fitsKind` / `mountPlan` | NPC 的挂点适配表（写在字面量里，不经 `STORE_ATTR`）；缺省退回 `fits` |
| `nezer` | `ai.js`（最小发射距离 1400）、`game.js`（锁定 1.5 s） | 冲压弹：NEZ 大但近距无力 |
| `scramjet` | `entities.js` `effectiveLife`、`hud.js` | 18 km 以上动力段骤减 |
| `highAltImmune` | `entities.js` | 转弯下限抬到 0.78（仅 SPO-9）；代价是低空推力最多 −45%、滑翔掉速最多 ×1.6（按相对密度插值） |
| `ballistic` | `entities.js` | 无动力，走自由落体弹道；有导引头的（GUT-9、PEJ-30）由导引转动**速度矢量**（保持速率） |
| `hobs` | `entities.js` `stepMissile` | 出膛后的导引头视场取 max(77°, `lockCone`)，大离轴锁定的目标不会出膛即丢 |
| `cluster` | `entities.js` `warheadK`、图鉴 `{{cluster}}` | 数值 = 覆盖半径（米）；面杀伤本身改由 `blast = cluster`、`blastCore = blast`、`blastAir: false` 表达（PEJ-9 60、PEJ-30 80） |
| `penetrator` | `entities.js` `warheadK` | 对加固目标（`HARD_MODELS`）全额伤害；普通战斗部 ×0.6、集束 ×0.2 |
| `loft` | `entities.js` `stepMissile` | `{alt, dive}`：水平距离 > dive 时瞄准点抬高 alt，末段俯冲（GUT-25、BOX-14） |
| `decoyMemory` | `entities.js` `decoyRecheck` | 盲飞结束时不会被骗走它的那团诱饵云再骗一次（CLA-4） |
| `twinSeeker` | `entities.js` `breakLock` | 双导引头：要连中两次诱饵才脱锁（BIN-9） |
| `unguided` | `entities.js`、`game.js` | 无制导，不找目标、走线段命中检测 |
| `passive` | `game.js`、`ui` | 被动吊舱：不占扳机、不进入武器纵列 |
| `duration` / `lockReduce` | `entities.js` `openEcm`（→ `spActive` / `ewLockReduce`，再由 `ai.js` 的锁定距离读） | ECM 生效时间与锁定压缩 |
| `charges` / `recharge` / `interceptRange` / `interceptCone` / `interceptChance` / `highAltChance` | `game.js` `updateDEW`、`entities.js` `stepAircraft` | 定向能吊舱 |

desc 里可以写 `{{字段}}`（以及 `coneDeg`、`lockKm`、`hardPct` 等派生量），
`data.js` 末尾在所有挂载表合并之后替换成当前数值。desc 不再自动追加任何交战规则句子
（武器锁定机制已整个删掉，见[调节单元附近开火](#调节单元附近开火)）。
派生量全表（`DERIVED`）：`coneDeg` `lockKm` `flarePct` `flareRDPct` `lockResistPct` `lockReducePct`
`interceptConeDeg` `interceptPct` `highAltPct` `volleys` `hardPct` `loftAlt` `loftDiveKm`；
其余 `{{x}}` 取 `w[x]` 的数值，取不到就原样保留。`hardPct` 的 0.2 / 0.6 是在
`data.js` 里**另写一份**的（`HARD_K_TEXT`），改 `entities.js` 的 `HARD_K` 时要同步。
`highAltScale` / `bigTarget`（武器上）/ `selfBlind` / `emitter` / `reDone`
没有任何代码读，已删除。


---

## 武器全表

数字来自 `data.js`（`cd` 与 `lead` 已含后注入的覆盖）。`—` 表示无此字段。
`单点` = `perPoint`，即**一个挂载点**的携弹量。

### 机炮

机炮按势力分族。编号同一个逻辑语词根（`cecla` 发射器），各家排自己的号 ——
**参数刻意完全相同**：这是纯文本的差异化，改的是归属与来历，不是手感。

| 键 | 名 | 归属 | rpm | speed | dmg | `spread`（1σ） | ammo | range / highRange |
|---|---|---|---|---|---|---|---|---|
| `k3` | CEL-3 20mm | 上游 · 制式 | 3900 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |
| `k7` | CEL-7 30mm | 上游 · G-6 专用重炮 | 3900 | 1020 | 17 | 0.0036 rad | 14000 | 2000 / 3100 |
| `k11` | CEL-11 30mm | 下游 · 制式（全军一门） | 3900 | 1020 | 17 | 0.0036 rad | 14000 | 2000 / 3100 |
| `k1` | CEL-1 20mm | 分水群岛国 · 上游外销型 | 3900 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |
| `k2` | CEL-2 20mm | 管理局 · 上游退役库存 | 3900 | 1100 | 7 | 0.0032 rad | 6000 | 1600 / 2600 |

`spread` 是**角度散布的标准差**，量纲是弧度 —— 展开见
[机炮散布](#机炮散布)。

### 空空导弹

| 键 | 名 | seeker | speed | boost | life/vsLife | turn | lockDist | dmg | flare | fuze | blast/core | lead | cd | 单点 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `srm` | TOR-2 短矢 | ir | 760 | 180 | 4.5 / 12 | 1.75 | 4200 | 30 | 0.38 | 12 | 18 / 2 | 0.38 | 4.8 | 8 |
| `trm` | TOR-4 短哨 | ir | 820 | 210 | 5.0 / 13 | 1.95 | 4800 | 32 | 0.24 | 12 | 18 / 2 | 0.48 | 5.6 | 6 |
| `hos` | TOR-6 环刃 | ir | 700 | 240 | 4.0 / 11 | 2.60 | 3200 | 28 | 0.42 | 11 | 17 / 2 | 0.30 | 5.2 | 4 |
| `kkv` | TOR-8 透针 ⁿ | ir | 760 | 220 | 4.5 / 12 | 2.73 | 3800 | 48 | 0.40 | 0 | 0 / 0（仅直接命中） | 0.45 | 3.4 | 10 |
| `qsr` | GIR-5 群刺 | ir | 740 | 190 | 4.2 / 11 | 1.70 | 4000 | 24 | 0.40 | 10 | 16 / 2 | 0.42 | 7.6 | 12 |
| `wasp` | SUT-7 蜂刺 | ir | 860 | 260 | 4.8 / 12 | 2.15 | 5200 | 38 | 0.36 | 13 | 19 / 2 | 0.55 | 8.4 | 3 |
| `swm` | GIR-12 鸦群 | ir | 720 | 300 | 3.5 / 9 | 2.55 | 3400 | 16 | 0.44 | 8 | 14 / 2 | 0.44 | 4.4 | 16 |
| `v9` | GIR-9 蜂群 | ir | 830 | 200 | 4.0 / 9 | 1.90 | 3800 | 44 | 0.50 | 13 | 19 / 2 | 0.52 | 6 | 2 |
| `v11` | SUT-11 锥刺 | ir | 790 | 280 | 5.0 / 11 | 2.45 | 4600 | 56 | 0.35 | 16 | 22 / 2 | 0.62 | 9.2 | 2 |
| `mrm` | CLA-4 中继 | radar | 900 | 200 | 8.0 / 20 | 1.45 | 8600 | 40 | 0.30 | 18 | 30 / 4 | 0.78 | 15 | 4 |
| `hwm` | CLA-8 雷鼓 ⁿ | radar | 810 | 180 | 8.0 / 20 | 1.16 | 8000 | 46 | 0.34 | 22 | 60 / 10 | 0.74 | 19.5 | 2 |
| `arm` | SPO-8 追云 | radar | 880 | 190 | 7.5 / 18 | 1.35 | 9500 | 52 | 0.35 | 22 | 44 / 7 | 0.72 | 18 | 2 |
| `v17` | CLA-17 长杆 | radar | 1150 | 160 | 10.0 / 30 | 1.00 | 12500 | 62 | 0.72 | 21 | 33 / 4 | 0.86 | 22 | 1 |
| `vlar` | CLA-12 极远 | radar | 980 | 150 | 12.0 / 30 | 0.78 | 16000 | 66 | 0.66 | 27 | 49 / 7 | 0.90 | 32 | 1 |
| `hva` | SPO-9 落雷 | radar | 980 | 240 | 8.0 / 18 | 1.30 | 11000 | 62 | 0.70 | 26 | 48 / 7 | 0.80 | 26 | 1 |
| `dl4` | DAR-4 砾石 | radar | 880 | 210 | 6.5 / 16 | 1.25 | 7200 | 30 | 0.45 | 20 | 32 / 4 | 0.74 | 6.8 | 0① |
| `dl6` | BIN-6 燧火 | ir | 780 | 190 | 4.5 / 10 | 2.05 | 3600 | 26 | 0.35 | 14 | 20 / 2 | 0.48 | 4.4 | 0① |
| `dl9` | BAD-9 高墙 | radar | 940 | 320 | 9.0 / 22 | 1.50 | 9000 | 48 | 0.60 | 24 | 36 / 4 | 0.80 | 14 | 0① |
| `vbn` | BIN-9 双生 | ir | 780 | 300 | 4.0 / 10 | 2.10 | 4200 | 42 | 0.58 | 12 | 18 / 2 | 0.66 | 8 | 0① |
| `otr` | TOR-1 旧锭 | ir | 620 | 200 | 3.0 / 7 | 1.35 | 3000 | 30 | 0.86 | 18 | 28 / 8 | 0.32 | 6 | 0① |
| `ss6` | FAN-6 海墙 | radar | 960 | 330 | 9.5 / 22 | 1.45 | 9500 | 46 | 0.42② | 24 | 36 / 4 | 0.80 | 15 | 0① |

① `fits: []` —— 下游专用弹（以及上游舰载的 FAN-6），玩家挂不上（见 [loadout.md](loadout.md)）。
`fuze` / `blast/core` 的定数规则见 [命中与近炸](#命中与近炸)。
ⁿ v1.13 新增（2.0 计划 2.5）：`kkv` 动能杀伤，`fuze 0 / blast 0`，最近点距表面不到 `Combat.CONTACT` 才命中；`hwm` 以 `mrm` 为母型的重战斗部，打编队。
② 雷达弹的 `flare` 由 `FLARE_RD` 覆盖。FAN-6 只装在**我方舰艇**上（`target.weapon = 'ss6'`），
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
| `asl` | GUT-9 滑翔锤 | agm | ir | 320 | — | 14 / 26 | 0.55 | 6000 | 150 | 30 / 8 | 11 | 4 |
| `asl2` | GUT-12 重锤-B | agm | radar | 480 | 140 | 10 / 22 | 0.90 | 9000 | 340 | 45 / 10 | 16 | 2 |
| `v25` | GUT-25 重锤 | agm | radar | 730 | 120 | 14 / 50 | 0.62 | 8000 | 175 | 30 / 8 | 18 | 2 |
| `lcm` | GUT-30 远帆 | agm | radar | 480 | 110 | 30 / 42 | 0.48 | 14000 | 300 | 45 / 10 | 36 | 1 |
| `sat` | SPO-6 云裂 | asm | radar | 540 | 130 | 9 / 20 | 1.05 | 8200 | 260 | 20 / 6 | 19 | 2 |
| `v22` | SPO-22 锚 | asm | radar | 920 | 130 | 12 / 45 | 0.55 | 8600 | 260 | 20 / 6 | 22 | 1 |
| `rkt` | PEJ-6 撒星 | bomb | 无制导 | 620 | 520 | 3 / 3 | — | — | 22 | 14 / 4 | 4 | 28 |
| `clb` | PEJ-9 碎玉 | bomb | 无制导 | 300 | — | 12 / 24 | — | — | 118 | 60 / 60③ | 14 | 2 |
| `v30` | PEJ-30 铁蒺藜 | bomb | eo | 280 | — | 12 / 24 | 0.20 | 2400 | 210 | 80 / 80③ | 16 | 1 |
| `vgt` | TUM-7 碎石 | agm | ir | 430 | 120 | 9 / 20 | 0.62 | 7000 | 190 | 30 / 8 | 11 | 0① |
| `vsr` | BOX-14 坍方 | asm | radar | 560 | 150 | 11 / 24 | 0.55 | 9000 | 260 | 20 / 6 | 15.6 | 0① |

③ `blastAir: false`：只伤地面，满半径满伤（子母弹）。对地弹都**没有 `fuze`**，只靠触发 / 撞地 / 寿命到期起爆。

`asl` 与 `v30` 是**无动力但有制导**（`ballistic: true`）：扔出去之后
只剩动能与弹翼 / 末端修正；`rkt` 与 `clb` 是无制导（`unguided`），
出膛那一刻的指向就是它的一生。四者的字段差异见 `data.js` 里
「无制导弹药」与 `PEJ-30` 两处注释。

### 吊舱

| 键 | 名 | kind | 效果 | cd | 单点 |
|---|---|---|---|---|---|
| `e4` | ZUN-4 回声 | ecm | 主动：`duration 6s`、`lockReduce 0.40` | 50 | 1 |
| `l2` | GUS-2 日光 | dew | 定向能拦截（见下） | 36 | 1 |
| `ecm2` | ZUN-8 静默 | ecm 被动 | `lockResist 0.40` | 0 | 1 |
| `dec` | ZUN-12 雾障 | ecm 被动 | `flareBonus 40` | 0 | 1 |
| `oep` | GUS-6 明瞳 | ecm 被动 | `lockRangeBonus 0.45` | 0 | 1 |
| `irp` | GUS-9 夜枭 | ecm 被动 | `lockRangeBonus 0.25`、`lockResist 0.15` | 0 | 1 |
| `hdp` | JDA-3 护盾 | ecm 被动 | `armorBonus 0.22` | 0 | 1 |
| `vzu` | SAV-6 迷雾 | ecm 被动 | `lockResist 0.30`（下游，`fits: []`；玩家锁它时也生效） | 6.8 | 0 |
| `vsc` | SAV-14 焦炬 | ecm | 下游烧穿吊舱：`jamRadius 9000`、`jamK 0.85` 范围压制（见 [game.md](game.md) `updateJamming()`） | 40 | 0 |

---

### 炮塔用炮

舰炮、近防炮、遥控炮、尾炮不在 `WEAPONS` 里，在 `TURRET_GUNS`（NPC 专用，不进挂载图鉴）。
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
`P = 1 - exp(-r² / 2σ²)`（飞机受击半径 7.5 m，见 `game.js scanShot`）。
CEL 系机炮每门都是 3900 发/分，每次扣扳机出 2 发（`n = round(rps × 0.033)`）、
节流 `1/65 s`，
即约 **130 发/秒**（帧率低于 65 fps 时按帧率封顶，60 fps 下约 120 发/秒）：

| 距离 | `spread×R` = 1σ | 2σ 半径（86% 落点） | 落进 7.5 m 靶 | 命中数/秒 | 期望击杀（130 hp，frigatebird） |
|---|---|---|---|---|---|
| 300 m | 0.96 m | 1.9 m | ~100% | ~130 | 0.14 s |
| 800 m | 2.6 m | 5.1 m | 99% | ~128 | 0.15 s |
| 1600 m | 5.1 m | 10.2 m | 66% | ~86 | 0.22 s |
| 2600 m（最大） | 8.3 m | 16.6 m | 33% | ~43 | 0.43 s |

所以最大射程上的画面是"一梭子过去是一团"，而不是一条线 ——
但每秒仍有四十多发落在目标身上，**极限距离依旧是可以点杀的**，
只是不再是一束激光。

这就是这条平衡的边界：`spread` 再往上调约 20%（σ ≈ 3.8 mrad），
2600 m 上的落靶率就跌破 25%，`tools/smoke.js` 的那两条断言会先失败 ——
"远距离的大范围散布靠射速弥补"这句话，在那里开始不成立。

**④（附注）AI 不受这条影响。** `ai.js` 的开火条件是瞄准误差
`off < gunCone × 3.2`，量级是 5–9°，比几千分之一弧度的散布大两个
数量级 —— 敌机的命中率由它自己的瞄准精度决定，不是由散布决定。

散点验证在 `tools/smoke.js`：300 m 与最大射程各抽 800 发量落点，
四条断言 —— 近距 1σ ≤ 1.5 m、远距 1σ ≥ 4 m、远距落靶率 ≥ 25%、
以及把落靶率折成 `dmg/s` 后要能在 1.25 秒内打掉最硬的一架
（250 hp 的 G-6）。

---

## 导引

`seeker` 共四种**在用**取值（外加休眠的 `laser`）：

| `seeker` | 抗干扰 | 说明 |
|---|---|---|
| `ir`（红外） | 看 `flare` | 点源导引头，热焰弹能骗 |
| `radar`（雷达） | 看 `flareRD`（缺省回退 `flare`） | 被箔丝骗；空空雷达弹的 `flareRD` 整体低于红外弹的 `flare` |
| `eo`（光电，仅 PEJ-30） | `flare: 0`，永远不被骗 | 成像导引头，热焰弹与箔丝都无意义 |
| `laser`（激光照射） | — | **当前无武器使用**；机制代码在 `entities.js` 里休眠 |
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

**对空与对面是两套完全不同的判据**：

```js
if (w.target === 'air') ok = dist < lockDist && off < cone;     // 导引头：距离 + 离轴角
else { dep = -dir.y;  ok = dist < lockDist * 1.35 && dep > -0.10; }  // 火控投放包线：距离 + 俯角
```

对面弹**没有锥角这回事**：飞机不必把机头对准浮台，火控要算的是
"这一下能不能扔到"。以前两个分支的代码一模一样，等于拿导引头的
逻辑去锁海面。

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

> **`lockProgress` 现在不拦发射**。`fireSpecial()` 里唯一保留的拦截是
> **目标类型对不上**（拿对空弹锁海面浮台，见 `targetMismatch()`）；
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

玩家发射时 `fireSpecial()` 还会按类型播无线电呼号：

| 条件 | 台词 |
|---|---|
| `unguided` 或 `kind` 为 `bomb` / `agm` / `asm` | **投放** |
| `seeker === 'radar'` | **Fox 3** |
| `seeker === 'laser'` | **照射** |
| 其余 | **Fox 2** |

（炸弹报"投放"而不是 Fox 2 —— 原来的判断只看了 `unguided`，
于是 PEJ-30 这类制导炸弹会喊出战斗机发射格斗弹的呼号。）

---

## 命中与近炸

v1.13 起起爆与范围伤害集中在 `js/combat.js`（`Combat`，`index.html` 里排在 `entities.js` 之后）。
旧字段 `prox` 已全部删除；`Combat.spec(w)` 在新字段缺省时从 `prox` / `cluster` 推出兼容值。

| 入口 | 何时 | 结果 |
|---|---|---|
| `fuzeCheck`（`entities.js` `stepMissile`） | 制导弹每帧，**只看自己的目标**（或诱饵虚拟目标） | 相对运动线段求最近点：`gap < Combat.CONTACT`（1.5）= 直接命中满伤；`gap < fuze` 且最近点落在本帧内 → 在最近点起爆 |
| `scanShot`（`game.js`） | 无制导弹撞飞机 / 设施（不走 `fuzeCheck`） | `Combat.detonate`，被撞单位作 `direct`；子弹不变 |
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
| 格斗弹 | srm trm hos qsr swm wasp v11 v9 dl6 vbn | round(旧 prox × 0.6) | fuze + 6 | 2 |
| 中程 | mrm dl4 v17 dl9 ss6 | × 0.7 | + 12 | 4 |
| 重型 | arm vlar hva | × 0.8 | + 22 | 7 |
| 例外 | otr | 18 | 28 | 8（dmg 30→32：老弹跟踪差，补偿） |
| 对地 | rkt 14/4；clb 60/60、v30 80/80（只伤地面）；asl v25 vgt 30/8；asl2 lcm 45/10；sat v22 vsr 20/6 | — | 见左 | 见左 |

- **特效 `Combat.blastFx`**：火球半径 clamp(0.35×blast, core, 0.5×blast) 且 ≥ 4；Fibonacci 球面破片壳（drag 3.5，飞到 ≈ blast）+
  拖尾粒子，继承 30% 弹速；落地 = 半球 + 0.6×blast 水柱；子母弹 = 6–10 团错时小爆（粒子 `delay`）；blast 0 只在直接命中时白闪。
  按粒子数（650 / 800）与距离（6 / 12 km）降级。`Ent.spawnParticle` 新增 `streak` / `delay`，`render.js` 画拖尾。
- 图鉴 `inv2` 有「引信 / 爆炸半径」列（`codex.js` `_fuzeTxt` / `_blastTxt`），详情页 `weaponParams` 有同名两行。
- 调参后看分布：`node tools/probe-blast.js`（见 [tools.md](tools.md)）。
- **设施 / 舰船走 `hitTarget`**：`game.js` 启动时 `Ent.setTargetHitHandler()` 注册自己的
  `hitTarget`，范围伤害打地面目标都经它结算（击毁进 `groundKilled`、误击调节单元记处罚）。
  没注册时（工具脚本）退回 `hp -= dmg` + `killGround`。
- **加固目标（`Ent.isHard`）**：`t.hard` 或 `HARD_MODELS[t.model]`（目前只有 `radar`）。
  `warheadK`：`penetrator`（GUT-12）×1、`cluster` ×0.2、其余战斗部 ×0.6；机炮子弹无 `b.w`，不打折。

- **机炮抗性（`gunResist`）**：小口径航炮子弹（`b.kind === 'bullet'` 且 `b.cal ≤ Ent.SMALL_CAL` = 40 mm）
  打中带 `gunResist` 的单位，伤害 ×(1 − gunResist)（`Ent.gunResistK`，封顶 0.999）。导弹、炸弹、
  大口径炮弹不受影响。飞机、设施、舰船都吃（`scanShot` 两个分支各乘一次）；与 JDA-3 的 `armor` 相乘叠加。
  数值来源：`AIRCRAFT[].gunResist`（ROK-40 0.15、预警 / 干扰机 0.05，其余 0）、`SHIPS[].gunResist`
  （小艇 0 → 航母 0.995）、`GUN_RESIST_MODELS`（调节单元 0.75、SAM 0.5、雷达 0.6、中继 0.7、站点 0.9）。
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
  - 断言见 `tools/smoke.js`「诱饵只买到一段时间」。
- **告警与来袭标记不只看 `m.target`。** 判据是
  "当前锁定本机"**或**"刚被本机诱饵骗掉、`reLockT > 0`、且仍在本机 3600 m 内"
  （`game.js` 的导弹告警音、`hud.js` 的 `drawIncomingMissiles`）。
  只认 `m.target` 的话，撒出一发诱饵的那一瞬间告警音与红色菱形会一起消失，
  而那枚弹还在同一片空域里飞、还可能重新咬回来 —— 这是最危险的一类假信号。
- 成功与否由 `breakLock` 返回值表示：**只要本帧真的投了一组诱饵就返回 `true`**
  （哪怕一枚都没骗到）—— 返回值表示"投放动作"是否发生，不是命中数。
  命中数与"无效投放数"写在 `a.decoysBroke` / `a.decoysIneffective` 上。
- 举例：`v11` 锥刺（红外）`flare = 0.35` → 第一次投放 35% 被骗走；
  `v17` 长杆（雷达）`flareRD = 0.44` → 第一次 44% 被骗走。

> 雷达弹曾经平均**更容易**被骗（`flare` 是逐个手调的）。现在雷达弹走
> `data.js` 的 `FLARE_RD` 表，空空雷达弹整体低于红外弹均值，
> 由 `tools/smoke.js`「箔丝有效」断言守着。

### 定向能拦截（GUS-2）

在 `game.js` 的 `updateDEW(dt, actor)`，条件是：

- 武器 `kind === 'dew'` 且 `spCharges > 0`
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

成功后消耗一次充能、烧毁导弹、播 `laser()` 音效与一句电台。

**充能不是打完立刻补满**：`spCharges` 从 `charges`（3）开始，
每打掉一发就由独立的 `spChargeT` 计时，`recharge`（18 s）到点才 `+1`，
且只在没满时走动。原来条件写的是 `spCd <= 0`，而 GUS-2 从不被手动发射、
`spCd` 恒为 0，于是"充能 3 次、每 18 秒恢复一次"形同虚设。

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

**一种武器能不能出场、能挂到哪、一个挂点带几发，由 `STORE_ATTR` 决定**，
不在本表里。完整机制见 [loadout.md](loadout.md)。

简言之：`fits` 决定它能上哪些挂载点类型，`perPoint` 决定单点携弹量，
`mass` 决定它对机动性的拖累。

---

## 如何加一种武器

1. 在 `data.js` 的 `WEAPONS` 里加一条，**对象键用短的内部代号**
   （别用逻辑语前缀当键名，太长且没必要）
2. 填 `name` 用逻辑语前缀 + 序号，`cn` 用中文代号
3. 在 `game.js` 的 `ROOTS` 里加中文含义（若有编号前缀）
4. 把键名加进某个机型的 `defaultLoadout`（旧文档里的 `specials` 字段已不存在）
5. 在 `STORE_ATTR` 里给 `fits` / `perPoint` / `mass`，并在
   `STORE_COOLDOWN` 里给 `cd`（后者 `smoke.js` 会检查）
6. 制导弹要进 `MISSILE_LEAD`（`smoke.js` 会检查）
7. 把键名加进 `game.js` 的 `preflight()` 检查列表
8. 跑 `node tools/smoke.js`

**别忘第 7 步**——自检列表是手工维护的，漏了不会报错，
但那个武器永远不会出现在自检里。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 武器基础数据 | `data.js` 的 `WEAPONS` |
| 每槽装填时间 | `data.js` 的 `STORE_COOLDOWN` |
| 导引品质 `lead` | `data.js` 的 `MISSILE_LEAD` |
| 挂载适配 / 单点弹数 / 重量 | `data.js` 的 `STORE_ATTR` |
| 机体能力门槛 | `data.js` 的 `STORE_NEEDS` 与 `AIRCRAFT[].caps` |
| 高空锁定锥收窄（×0.78） | `game.js` `updateLock()` |
| 锁定速率分档 | 同上，`rate` 那一行 |
| 一次按键打出的发数 | 武器自己的 `salvo` |
| 近炸 / 爆炸半径 | `data.js` 的 `fuze` `blast` `blastCore` `blastAir` |
| 衰减曲线 / 飞机受害半径 / 直接命中距离 | `combat.js` `falloffK` / `HIT_R_AIR` / `CONTACT` |
| 爆炸特效与预算 | `combat.js` `blastFx` / `BLAST_FX` |
| 干扰弹冷却与粒子数 | `entities.js` `breakLock()` |
| 定向能拦截窗口折算（1.2 s） | `game.js` `updateDEW()` |
