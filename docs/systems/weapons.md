# 武器系统

数据 `js/data.js` 的 `WEAPONS` · 行为 `js/entities.js` · 发射 `js/game.js` 的 `launch()`

---

## 编号体系

装备前缀取自**真实的逻辑语（Lojban）词根**（rafsi）。这不是随手拼的字母，
每个前缀都能在主词表里查到出处。

| 编号 | 词根 | 源词 | 含义 |
|---|---|---|---|
| `CEL-` | cel | *cecla* | 发射器 / 炮 —— 机炮 |
| `SUT-` | sut | *sutra* | 快 —— 高机动缠斗弹 |
| `GIR-` | gir | *girzu* | 组 / 群 —— 双联装格斗弹 |
| `CLA-` | cla | *clani* | 长 —— 冲压远距弹 |
| `SPO-` | spo | *daspo* | 摧毁 —— 反大型目标弹 |
| `GUT-` | gut | *gunta* | 攻击 —— 空地导弹 |
| `PEJ-` | pej | *preja* | 扩散 / 播撒 —— 集束炸弹 |
| `GUS-` | gus | *gusni* | 光 —— 定向能吊舱 |
| `ZUN-` | zun | *zunti* | 干扰 —— 认知电子战吊舱 |
| `DAR-` | dar | *darno* | 远 —— 下游中距弹 |
| `BIN-` | bin | *jbini* | 之间 / 近 —— 下游格斗弹 |
| `BAD-` | bad | *bandu* | 防卫 —— 下游防空导弹 |
| `CAV-` | cav | *carvi* | 雨 —— 调节场体系（`CAV-7` = 第 7 号控制站） |
| `DIL-` | dil | *dilnu* | 云 —— 调节单元型号（`DIL-4`） |

**重要**：`WEAPONS` 的**对象键**（`v11` `k3` `dl4` …）是早期技术代号，
与显示名不一致，这是有意的——改键名要动 5 个文件，风险不值得。
玩家看到的永远是 `name` 字段。

`ROOTS`（在 `game.js`）把对象键映射到中文含义，机库界面用它显示
"编号含义 · 发射器 / 炮"。**那里只写中文，不写逻辑语原文**——
玩家需要看懂，不是需要被炫技。

---

## 数据字段

```js
{
  id, name, cn,              // 制式名、中文代号
  kind,                      // gun | aam | asm | agm | bomb | ecm | dew
  model,                     // 视觉模型键（null = 不生成实体）
  speed, boost, life, vsLife,// 最大速度 / 助推加速度 / 动力段 / 总寿命（秒）
  turn,                      // 最大转向率 rad/s（海平面）
  seeker,                    // ir | radar | none
  lockCone, lockDist,        // 锁定锥角（弧度）与最大锁定距离（米）
  dmg, ammo, cd, salvo,      // 伤害 / 备弹 / 冷却 / 一次齐射数
  flare,                     // 抗干扰 0..1，越高越不容易被骗
  prox,                      // 近炸半径（米）
  target,                    // air | ground | ship | none
  stat: {dmg, spd, trn, rng, ecm}   // 0..1，仅用于界面条形图
}
```

特殊能力用布尔标记：

| 标记 | 含义 |
|---|---|
| `reAcquire` | 丢失目标后自动重新捕获一次（锥刺） |
| `hobs` | 大离轴发射，锥角特别大（蜂群） |
| `nezer` | 冲压弹，NEZ 特别大但近距无力（长杆） |
| `scramjet` | 高空缺氧降级（配合 `nezer`） |
| `bigTarget` | 只对大型目标有效 |
| `cluster` | 集束炸弹 |
| `unguided` | 无制导 |
| `highAltScale` | 转弯率按动压缩放（几乎所有导弹都有） |
| `duration` / `lockReduce` / `selfBlind` | ECM 吊舱 |
| `charges` / `interceptRange` / `interceptCone` / `interceptChance` / `highAltChance` | 定向能吊舱 |

---

## 导引

只有两种 `seeker`：

- **`ir`（红外）**：能被干扰弹骗走。抗干扰看 `flare`
- **`radar`（雷达）**：不能被干扰弹骗，但需要更长锁定时间

锁定由 `game.js` 的 `updateLock()` 处理，锁定进度 `lockProgress`
从 0 涨到 1 才允许发射（红外 0.55 秒，雷达 1.1 秒，冲压弹 1.5 秒）。

**18 km 以上锁定锥收窄到 78%**——高空导引头视场变差。

---

## 命中与近炸

```js
if (dist < prox + 6) detonate();
```

近炸不会直接秒杀，而是造成 `dmg` 伤害；只有目标仍在 `prox + 14` 内
才真正扣血。这避免了"擦过就算命中"。

子弹用 `raySphere()` 做**线段**求交（见 [flight-model.md](flight-model.md#子弹)）。

---

## 干扰与拦截

### 干扰弹（玩家按 `V`）

`Ent.breakLock(actor, world)`：

1. 消耗一发干扰弹，冷却 1.6 s
2. 生成 6 个发光粒子（纯视觉）
3. 对每一枚**以本机为目标**的**红外**导弹掷骰：
   `if (random() > weapon.flare)` → 导弹丢失目标

所以 `flare = 0.35` 的锥刺有 65% 概率被骗走，
`flare = 0.78` 的长杆只有 22%。

### 定向能拦截（GUS-2）

在 `game.js` 的 `updateDEW()`，条件是：

- 导弹以本机为目标
- 距离 < `interceptRange`（1200 m）
- 与本机机头夹角 < `interceptCone`（35°）
- 还有充能（`spCharges > 0`）

成功后消耗一次充能、烧毁导弹、播 `laser()` 音效。

---

## 交战规则

第三关的核心约束：**阵列空域内禁止 20 kg 以上战斗部**。

实现：`world.roeBlocked` 为真时，`launch()` 拒绝 `asm/agm/bomb` 类武器，
并在无线电里播一句提示。

`roeBlocked` 由 `missions.js` 的 M3 `tick()` 每帧计算——
玩家距离任一存活调节单元 5 km 以内就置真。

**这个规则是玩法支点**：M3 里玩家被迫用机炮去啃 118 米的氦气球。

---

## 挂载与出装

**一种武器能不能出场、能挂到哪、一个挂点带几发，由 `STORE_ATTR` 决定**，
不在本表里。完整机制见 [loadout.md](loadout.md)。

简言之：`fits` 决定它能上哪些挂载点类型，`perPoint` 决定单点携弹量，
`mass` 决定它对机动性的拖累。

## 如何加一种武器

1. 在 `data.js` 的 `WEAPONS` 里加一条，**对象键用短的内部代号**
   （别用逻辑语前缀当键名，太长且没必要）
2. 填 `name` 用逻辑语前缀 + 序号，`cn` 用中文代号
3. 在 `game.js` 的 `ROOTS` 里加一条中文含义
4. 把键名加进某个机型的 `specials` 数组
5. 把键名加进 `game.js` 的 `preflight()` 检查列表
6. 跑 `node tools/smoke.js`

**别忘第 5 步**——自检列表是手工维护的，漏了不会报错，
但那个武器永远不会出现在自检里。
