# 机制标签（Tags）

单位的独有机制 = **数据里一个标签 + 机制代码里认标签**；机制代码里不出现具体单位 id。

- 标签在 `js/core/tags.js` 里声明一次（`Tags.declare(name, { owner, doc })`），数据里用了没声明的标签，注册时直接抛错。
- 数据里写成数组：`tags: ['hard']`；注册时展开成 `{ hard: true }`，运行时直接读 `def.tags.hard`（O(1)）。
- 实体创建时带上单位定义的 `tags`（飞机 `a.tags`、设施 `t.tags`），所以机制代码读的是实体 `a.tags.unmanned`，不查表。
- 数值参数仍是字段（`gunResist`、`lockResist`、`lead` …），标签只表达"有没有这条机制"。
- `smoke.js` 断言：数据里用到的每个标签都已声明；声明过的每个标签都至少被一个数据项用到（预留的写 `reserved: true`）。
- 单位详情页有一行"机制标签"，直接读这里的 `doc` 字符串，让设计意图对玩家可见。

## 清单

| 标签 | 负责模块 | 含义 | 用在 |
|---|---|---|---|
| `twinSeeker` | entities | 双导引头：一发热焰弹只能骗掉其中一个，要连骗两次才甩得掉 | `vbn` |
| `decoyMemory` | entities | 被诱饵骗过之后会记住，不再被同一批诱饵牵走 | `mrm` |
| `reAcquire` | entities | 丢失目标后会在视场里重新搜索并锁定 | `v11`、`mrm`、`wasp` |
| `hobs` | entities | 大离轴发射：导引头视场比锁定锥更宽，发射瞬间不必对准目标 | `hos`、`v9` |
| `penetrator` | entities | 侵彻战斗部：对加固目标不打折 | `asl2` |
| `silentLock` | entities | 被动测距：锁定时对方的雷达告警收不到 | `oep`、`irp` |
| `unguided` | entities | 无制导：没有导引头，按弹道落下 | `rkt`、`v30`、`hbh`、`hbl`、`clb` |
| `ballistic` | entities | 弹道体：无动力，按投放时的速度走抛物线（有弹翼的可做末端修正） | `pgb`、`v30`、`hbh`、`hbl`、`clb`、`asl` |
| `highAltImmune` | entities | 高空不衰减：过载不随空气变稀而崩塌 | `hva` |
| `hard` | entities | 加固设施：普通战斗部打折（×0.6，集束 ×0.2），侵彻弹全额 | `radar` |

## 加一个标签

1. 在 `js/core/tags.js` 里 `Tags.declare('名字', { owner: '…', doc: T('core.tags.名字.doc') })`，并在 `js/locales/zh-CN/core/tags.json` 里写那句话。
2. 在需要它的数据文件里加 `tags: ['名字']`。
3. 在机制代码里读 `x.tags.名字`。

## 没有迁成标签的

- 关卡脚本里的 `model === 'sower'` 之类：那是关卡脚本，不是机制，保留。
- 实例标志 `aewc` / `bigTarget` / `striker`（由关卡脚本设置）：暂时还是实例字段，批次 6 做新单位时再并入默认标签。
- `caps`（`strike` / `ew` / `intercept`）：本来就是标签数组形态，保持。
