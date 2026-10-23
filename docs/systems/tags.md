# 机制标签（Tags）

单位的独有机制 = **数据里一个标签 + 机制代码里认标签**；机制代码里不出现具体单位 id。

- 标签在 `js/core/tags.js` 里声明一次（`Tags.declare(name, { owner, doc })`），数据里用了没声明的标签，注册时直接抛错（`Tags.expand`）。`owner` 只是文档性质的"哪个模块负责这条机制"，运行时不读。
- 数据里写成数组：`tags: ['hard']`；注册时（`Registry` 的 `aircraft` / `ship` / `platform` / `weapon` / `turretGun` / `target` 六种）展开成 `{ hard: true }`，运行时直接读 `def.tags.hard`（O(1)）；没写 `tags` 的单位得到空对象，所以 `x.tags.名字` 总是安全的。
- 飞机与设施实体创建时带上单位定义的 `tags`（飞机 `a.tags`、设施 `t.tags`），所以机制代码读的是实体 `a.tags.unmanned`，不查表；武器机制读 `w.tags.名字`（`w` 是武器定义）。
- 数值参数仍是字段（`gunResist`、`lockResist`、`lead` …），标签只表达"有没有这条机制"。
- `smoke.js`（「挂载系统」段）断言：数据里用到的每个标签都已声明；声明过的每个标签都至少被一个数据项用到（预留的写 `reserved: true`，目前没有）。
- 单位详情页（飞机 / 舰船 / 平台 / 武器）有一行"机制标签"，直接读这里的 `doc` 字符串，让设计意图对玩家可见。
- `Tags` 的接口：`declare` `expand` `has(def, 名字)` `declared()`（见 [modules.md](modules.md)）。

## 清单

`含义` 一列就是 `doc` 字符串（正文在 `locales/zh-CN/text/core/tags.json`，键 `core.tags.doc`、`doc_2` … 按声明顺序）。

### 武器

| 标签 | 负责模块 | 含义 | 用在 | 机制代码在 |
|---|---|---|---|---|
| `twinSeeker` | entities | 双导引头：一发热焰弹只能骗掉其中一个，要连骗两次才甩得掉 | `vbn` | `entities/missile.js` |
| `decoyMemory` | entities | 被诱饵骗过之后会记住，不再被同一批诱饵牵走 | `mrm` | `entities/missile.js` |
| `reAcquire` | entities | 丢失目标后会在视场里重新搜索并锁定 | `v11`、`mrm`、`wasp` | `entities/missile.js` |
| `hobs` | entities | 大离轴发射：导引头视场比锁定锥更宽，发射瞬间不必对准目标 | `hos`、`v9` | `entities/missile.js` |
| `penetrator` | entities | 侵彻战斗部：对加固目标不打折 | `asl2` | `entities/warhead.js` |
| `antiRadar` | combat | 反辐射：对正在开机辐射的目标伤害加倍 | `arm` | `engine/combat.js`、`entities/radiation.js` |
| `silentLock` | entities | 被动测距：锁定时对方的雷达告警收不到 | `oep`、`irp` | `entities/ecm.js` |
| `passive` | loadout | 被动吊舱：不占扳机，装上就一直起作用 | `ecm2`、`dec`、`oep`、`irp`、`hdp`、`vzu` | `engine/loadout.js`、`entities/ecm.js`、`game/launch.js`、`game/lock.js`、`ai/brain.js` 等 |
| `unguided` | entities | 无制导：没有导引头，按弹道落下 | `rkt`、`v30`、`hbh`、`hbl`、`clb` | `entities/missile.js`、`warhead.js`、`range.js`、`ai/brain.js`、HUD 等 |
| `ballistic` | entities | 弹道体：无动力，按投放时的速度走抛物线（有弹翼的可做末端修正） | `pgb`、`v30`、`hbh`、`hbl`、`clb`、`asl` | `entities/missile.js`、`ui/hud/aids.js` |
| `highAltImmune` | entities | 高空不衰减：过载不随空气变稀而崩塌 | `hva` | `entities/missile.js` |

### 机型 / 设施

| 标签 | 负责模块 | 含义 | 用在 | 机制代码在 |
|---|---|---|---|---|
| `unmanned` | game | 无人机：没有飞行员，目标与开火权来自长机；击毁记入长机一方的战果 | 机型 `folded_wing` | `engine/game/finish.js` |
| `hard` | entities | 加固设施：普通战斗部打折（×0.6，集束 ×0.2），侵彻弹全额 | 设施 `radar` | `entities/warhead.js` |
| `regulator` | game | 调节单元：被击毁时触发"误击友方设施"的结算与无线电 | 设施 `cell` | `engine/game/combat.js` |
| `relay` | game | 高空中继平台：被击毁时触发中继链断裂的结算与无线电 | 设施 `relay` | `engine/game/combat.js` |
| `sam` | game | 地对空发射车：被击毁时触发防空网被打开缺口的结算与无线电 | 设施 `sam` | `engine/game/combat.js` |
| `cullFar` | render | 数量极多的目标：超出绘制 / 雷达显示距离就不画 | 设施 `cell` | `ui/frame.js`、`ui/hud/radar.js` |

## 加一个标签

1. 在 `js/core/tags.js` 里 `Tags.declare('名字', { owner: '…', doc: T('core.tags.doc_N') })`，并在 `locales/zh-CN/text/core/tags.json` 里写那句话。
2. 在需要它的数据文件里加 `tags: ['名字']`。
3. 在机制代码里读 `x.tags.名字`。
4. `node tools/build/gen-locales.js && node tools/build/gen-pages.js`，再跑 `node tools/test/smoke.js --only 挂载系统`。

## 没有迁成标签的

- 关卡脚本里的 `model === '…'` 之类（如 m8 里按舰型数浮岛）：那是关卡脚本，不是机制，保留。
- 实例标志 `aewc` / `bigTarget` / `striker`（由关卡脚本设置到实例上；`aewc` 由 `engine/game/lock.js` 读）：暂时还是实例字段，批次 6 做新单位时再并入默认标签。
- `caps`（`strike` / `ew` / `intercept`）：机型上本来就是字符串数组形态，保持，不经过 `Tags`。
