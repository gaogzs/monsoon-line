# 工具链与测试

`tools/` 是游戏的**开发期旁路**：全部跑在 Node 里，产物不参与游戏运行
（唯二的例外是 `js/core/version.js` 与 `js/core/changelog.js`——那两个是游戏真的要读的数据文件，由工具生成）。
游戏本身零依赖、无构建——没有 `package.json`、没有 `node_modules`，双击 `locales/zh-CN/html/index.html`（或根目录的启动器 `index.html`）就能玩。
所以这里没有 npm script，一律 `node tools/<组>/xxx.js`。

## 目录与分组

```
tools/
├── test/        测试与回归：smoke  snapshot-data  golden  golden-render  probe-perf  text-census  check-locales
│   ├── probes/    各类探针：probe-balance / blast / ccip / ciws / envelope / footprint / gunlead / missions / range / turret
│   └── baseline/  各基线：data.json  golden.json  golden-render.json  perf.json  text-census.json
├── build/       生成与发版：gen-index  gen-pages  gen-locales  fmt-locales  extract-text  extract-html（一次性）
│                            release  stamp-version  rename-aircraft
├── render/      预览出图：render-units / ships / planform / mounts  shot-unitview  probe-render；输出在 render/out/（gitignore）
└── lib/         sim（后台模拟）  scripts（脚本清单）  strict-json  raster  root（仓库根路径）
```

- 脚本里需要仓库根目录时一律 `require('…/lib/root').ROOT`，不数 `..`。
- 旧路径 → 新路径：`tools/smoke.js` → `tools/test/smoke.js`，`tools/probe-*.js` → `tools/test/probes/`，
  `tools/baseline/` → `tools/test/baseline/`，`tools/release.js` 等 → `tools/build/`，
  `tools/render-*.js` / `shot-unitview.js` → `tools/render/`，`tools/preview/` → `tools/render/out/`。
  历史文档（`2-0IMPL.md` 等）里写的是旧路径。
- `.gitignore` 里有 `tools/render/out/`，也有一条泛泛的 `build/`、`out/`——后者会连带匹配 `tools/build/`；
  现有文件都已入库不受影响，但在 `tools/build/` 下**新建**脚本时要 `git add -f`。

## 日常：改了什么就跑什么

改完代码**必须**做的只有一件事：让测试全绿。但 `smoke.js` 完整跑要近二十分钟，所以日常用下面这些秒级工具打头阵，`smoke.js` 用 `--only 段名` 只跑相关段，大阶段完成后再完整跑一遍。

| 改了什么 | 跑什么 |
|---|---|
| 任何 JS（先看有没有悄悄改行为） | `snapshot-data.js`、`golden.js`、`golden-render.js`（都是秒级到十几秒） |
| 增删 / 改名 `js/` 下的文件，改页面片段或文本 | `gen-locales.js`（文本变了）→ `gen-pages.js` |
| `locales/**/text` 下的 JSON | `fmt-locales.js` → `gen-locales.js` → `check-locales.js` |
| 关卡、胜负条件 | `probe-missions.js`；`smoke.js --only …` |
| 敌方航线 / 轰炸 / 反舰弹 | `probe-balance.js` |
| 近防炮、炮塔 | `probe-ciws.js`、`probe-turret.js` |
| 近炸 / 爆炸半径 / 导引 | `probe-blast.js` |
| 无制导弹、滑翔弹的落点 / 包线 / 射程 | `probe-ccip.js`、`probe-envelope.js`、`probe-footprint.js`、`probe-range.js` |
| 机炮提前量 | `probe-gunlead.js` |
| `render-gl.js` / `render.js` / `shading.js` | `probe-render.js`（要 Chrome） |
| 模型、挂载、俯视图、详情页 | 对应的 `render/` 预览器（肉眼看） |
| 要发一个版本 | `release.js vX.Y.Z`，见[版本戳与发版](#版本戳与发版) |
| 每次 `git commit` 之前 | `stamp-version.js` |

## 共享库 `tools/lib/`

| 文件 | 作用 |
|---|---|
| `root.js` | 导出 `ROOT`（仓库根） |
| `scripts.js` | **脚本加载顺序的唯一读取入口**：`loadOrder([lang])` 全部脚本（含语言包），`pick(names)` 按加载顺序只留这些文件名（不含目录与扩展名），`preview()` 离线预览要的脚本（除了 `Game` 的界面 / 输入 / 相机 / 启动之外的全部），`baseName(p)`。顺序的权威在 `tools/build/gen-index.js` 的层规则（见 [DESIGN.md 第 3 节](../DESIGN.md#3-模块划分与加载顺序层--约定)）；`smoke`、`sim`、`render-*`、`probe-render`、`shot-unitview`、`text-census`、`check-locales`、`rename-aircraft` 都从这里取，不再各写正则 |
| `sim.js` | 后台模拟框架，见下 |
| `strict-json.js` | 比 `JSON.parse` 严的解析与规范化输出：同一对象里重复键直接抛错（带行号），叶子只许字符串或字符串数组；`format()` 给出规范格式（`gen-locales`、`fmt-locales` 用，见 [text.md](text.md)） |
| `raster.js` | 几个预览器共用的光栅器 / Canvas 2D 子集 / PNG 编码 |

### `sim.js`：后台模拟框架

以前每个 probe 各抄一份沙箱，现在统一建在它上面（`smoke.js` 仍用自己的沙箱：它要校验页面里的元素 id，`sim.js` 不带这层 DOM）。

```js
const Sim = require('../../lib/sim');                 // 路径按调用者所在目录
const S = Sim.load({ seed: 42 });                     // 每次 load 一个全新沙箱；选项见下
S.start(2);                                           // 开 MISSIONS[2]
S.step(dt);                                           // 推进一步逻辑（Game.__update），不画
S.run(30, (t, world, player) => {}, dt);              // 推进 30 s，每帧回调；回调返回 true 提前停
S.seed(7); S.godMode();                               // 换种子（随机序列从头）；玩家无敌（每帧回满血）
S.render();                                           // 画一帧（Game.__render），不推进逻辑
S.world / S.player / S.time / S.sandbox               // 观测；sandbox 里能直接读到全部全局
Sim.batch(seeds, scenario, opt); Sim.stats(xs);       // 多种子批跑（每个种子一个全新沙箱）；均值 / 标准差
```

`load` 的选项：`seed`（缺省 1）、`init`（是否触发 `window` 的 `load` 事件即 `Game.init()`，缺省 true）、`quiet`（吞掉游戏自己的 `console.log`，缺省 true）、`trace: true`（`S.trace` 数组按序记下每个 2D 绘制调用与属性赋值，给 `golden-render` 用）。

| 项 | 事实 |
|---|---|
| 随机数 | `Math.random` 换成 mulberry32，同种子 = 同一场战斗 |
| 渲染 | 画布是 Proxy 假 2D 上下文（`trace` 时记账，否则全空操作）；拿不到 WebGL，`Renderer` 自动落到 2D |
| 钩子 | `Game.__update`（仅在 `state==='playing'` 且有世界与玩家时推进）、`Game.__render` |
| 注意 | 没调 `S.start(i)` 时 `S.step` 什么都不推进 |

## 重构安全网（秒级，优先用）

重构最大的风险是"悄悄改了行为"，所以动手前先把现状冻结成基线（`tools/test/baseline/`），之后每一步都比对。

| 命令 | 保证什么 |
|---|---|
| `node tools/test/snapshot-data.js [--write] [--verbose]` | 数据表（`AIRCRAFT` `SHIPS` `WEAPONS` `TARGETS` `CODEX` …）、全部 3D 模型（顶点 / 面哈希、键序、不可枚举成员如炮塔规格与残骸）、关卡，逐条哈希，与 `baseline/data.json` 逐条比对；函数按空白折叠后比较（缩进变化不算差异）；条目顺序也比（机库、图鉴顺序靠它）。有差异列出 `+ / - / ~ 表.条目`，退出码 1 |
| `node tools/test/golden.js [--write] [--secs N] [--only 关]` | 固定种子 7、玩家无敌，每关跑 N 秒（缺省 20），每秒对全体实体的 `pos / vel / hp / ammoPool` 等取哈希，与 `baseline/golden.json` 比，报第一个分歧的关卡与秒数。`--only` 可给 `MISSIONS` 下标或关卡 id。**别带 `--only` 写基线**：`--write` 会把只含那一关的结果整份覆盖进去 |
| `node tools/test/golden-render.js [--write]` | 逻辑回放看不到 HUD / UI 的拆分，所以每关推进到 1.5 / 3 / 5 秒各画一帧，把 2D 画布的全部绘制调用（方法名 + 两位小数的参数）取哈希，与 `baseline/golden-render.json` 比。基线来自重构前的原版代码（`backup/`，只作对照、不进版本库） |
| `node tools/test/probe-perf.js [--secs N] [--write]` | 每关每帧耗时（平均 / p99）与实体峰值；`--write` 存 `baseline/perf.json`，不写时只打印相对基线的总耗时百分比，**不判失败**。数值随机器而异，只在同一台机器上比 |
| `LEGACY_TAGS=1 node tools/test/snapshot-data.js` | 把标签还原成旧的布尔字段再比，用来核对"除迁移外一字不差"；快照里计划内的改动写在 `snapshot-data.js` 顶部注释里 |

三个比对工具退出码都是 `0` = 一致、`1` = 有差异或没有基线（先 `--write`）。基线只在**确认差异是计划内**之后才重写。

## tools/test/smoke.js

唯一的完整自动化测试：在没有浏览器的环境里把整个游戏跑起来并断言。

### 怎么运行

```bash
node tools/test/smoke.js                         # 完整跑（约 20 分钟）
node tools/test/smoke.js --only 挂载系统          # 只跑「挂载系统」这一段
node tools/test/smoke.js --only 挂载系统,干扰与机动   # 逗号分隔
node tools/test/smoke.js --skip 舰船发射器,近防拦截   # 跳过这几段
node tools/test/smoke.js --list                  # 列出段名（见下面的说明）
```

没有环境变量、没有 watch 模式。它读页面副本 `locales/zh-CN/html/index.html`（建元素注册表）和全部游戏脚本，在内存里造一个假浏览器，然后从零跑到任务里。

**分段**：断言分成「前置」+ 21 个可独立跑的段。「前置」（加载脚本 / 初始化 / 导航 / 更新记录 / 完整流程 / 任务与主循环，含卡死检测）是后面所有断言的依赖，**始终执行**，约 18 秒；其余各段按 `--only` / `--skip` 过滤，被跳过的段打印 `[跳过] 段名`。

> **`--list` 的一个缺口**：它在最后一段的结果汇总处退出，而最后五段（`TOR-3 与 target:any`、`碰炸与拟真近炸`、`KA-7 默认挂载与携带量重量`、`僚机掩护撒干扰弹`、`包线缓存与滑翔校验`）在那之后才注册，所以 `--list` 只列出前 16 段。这五段用 `--only` 照常能选到。

**近防拦截段的概率性**：第 2 条（"多枚来袭里至少拦下一枚"）依赖近防的随机掷骰，实测单轮 12 枚里一枚都没拦下的概率约 18%。
测试改成最多重复 8 轮全新的交战，第一次出现拦截就过（8 轮全空约 1e-6，平均只多跑 0.2 s），不再依赖 smoke 全程共用的随机序列。
如果它还失败，那就是近防真的出问题了：`node tools/test/smoke.js --only 近防拦截` 单独复现。

**确定性**：smoke 在加载脚本之前把 `Math.random` 换成固定种子的 LCG，全程一条序列，每次运行完全相同——否则同一份代码跑两次可能一次过、一次挂，分不清是自己改坏了还是抽到了坏签。代价：种子一旦改变，"诊断"行的数值会整体变化，这是预期的。

### 输出格式与退出码

```text
== 加载脚本 ==
  OK    页面副本与启动器（zh-CN）与模板、文本一致
  OK    304 个脚本全部加载，无语法/求值异常
== 初始化 ==
  FAIL  主循环抛出异常 —— xxx is not a function

✓ 冒烟测试全部通过          ← 或 →  ✗ 冒烟测试失败：N 项
```

分组之间用 `== 组名 ==`（前置与前两个大段）或裸标题行（其余段）分隔，每条断言行两格缩进。**`OK`**（绿）只打印，**`FAIL`**（红）既打印又进 `problems` 数组。退出码只有两个：`0` = 全部通过，`1` = 至少一条 FAIL。`OK` 的条数随断言增减，不要拿它当指标。

**`fail()` 不中断**：后面的断言照跑，所以一次失败的输出里可能有几十条 FAIL，**第一条才是根因**，后面多半是"对象是 undefined，后续读取全炸"的次生现象。

**"诊断"也算输出**：有些分组不打断言，只用 `ok()` 把当时数值打出来给人看（`诊断 M2 目标…`、`诊断 玩家钉在 20500m…`、`诊断 有目标 12600 · 进射程 0…`）。它们不带 FAIL 也**不代表通过**——看到 `进射程 0 · 进锥 0 · 实开火 0` 这种数字，得自己判断是不是退化。

### 测试框架是怎么搭的

没有测试框架。整个"框架"就是几个手写桩 + 一个 `vm` sandbox。

#### 最小 DOM（`makeEl()` 及其周边）

`makeEl()` 返回普通对象，有 `children` / `classList` / `addEventListener` / `fire(type)` / `setAttribute` / `getBoundingClientRect`。关键几点：

- **元素注册表来自页面副本的正则扫描**，不是 DOM 解析：`<section id="scr-xxx" class="…">` 建屏幕元素（`class` 拆进 `__cls`），其余 `id="..."` 建 `div`，`data-go` / `data-ptab` 建按钮（合成 id `go_<n>` / `ptab_<n>`）
- **`querySelectorAll` 只认识三个选择器**：`.screen` / `[data-go]` / `[data-ptab]`；查别的选择器一律得到 `[]`——这是桩的边界，不是 bug
- **重复 id 会立刻 FAIL**（`makeEl` 里查 `byId`）：`index.html 出现重复 id：xxx`
- **`innerHTML` 的 setter 必须清空 `children`**。只改字符串属性的话，反复构建（每次进机库）会让子元素越积越多，测出来是"8 行应该是 4 行"这种**假故障**——踩过一次，注释就留在那儿了
- `fire('click')` 同时调 `addEventListener` 注册的回调和 `el.onclick`

#### Canvas 与 WebAudio（`ctx2d()` / `audioParam()` / `audioNode()`）

`ctx2d()` 返回 `Proxy`：未知属性一律返回 `() => {}`，所有绘制调用都是静默空操作（例外：`canvas` 属性、`measureText`、两个 `create*Gradient`）。
`audioNode()` 同理，`frequency` / `gain` / `Q` / `detune` 自动生成带 `value` 与四个空 ramp 方法的 `audioParam()`；`FakeAudioContext` 提供 `createGain/Oscillator/BiquadFilter/BufferSource/Buffer`。

**Canvas 桩不画任何像素，但可以挂勾子观测**——HUD 颜色、锁定框大小、海天分界高度都是这么"看"出来的：把 `ctx.strokeRect` / `ctx.fillRect` 换成记账后再转发给原函数的包装即可。音频桩只保证合成路径不抛异常，**不验证声音好不好听**。

#### 脚本加载顺序：不维护第二份清单（`ORDER`）

```js
const ORDER = require('../lib/scripts').loadOrder();   // 如 'js/core/math3d.js'，含子目录与连字符
```

然后 `for (const name of ORDER)` 逐个 `vm.runInContext`。

**这是这份测试里最重要的一个决定。** 加载顺序的唯一权威是 `tools/build/gen-index.js` 的层规则，测试不维护第二份清单——手工维护过一次，新加模块时漏掉了，结果**测试反而先炸了**（引用一个还没加载的全局）。推论：

- 加模块只需新建文件，顺序自动落在对的层里；再 `node tools/build/gen-pages.js` 让页面副本跟上（smoke 开头就断言页面副本与现场生成的一致）
- 所有离线工具都经 `tools/lib/scripts.js` 取这份清单——两份工具、一个来源

#### sandbox 里暴露了哪些全局（`windowStub` / `const sandbox`）

`const sandbox = windowStub;` 然后 `vm.createContext(sandbox)`。因为 sandbox **就是**那个 window 桩对象：

- 脚本里所有顶层 `var` / `function` 都落在 sandbox 上，测试因此能直接读到 `sandbox.Ent`、`sandbox.Game`、`sandbox.Renderer`、`sandbox.WEAPONS`、`sandbox.AIRCRAFT`、`sandbox.MISSIONS`、`sandbox.CODEX`、`sandbox.Tags`、`sandbox.Text` 等
- 反向也成立：测试**直接改** `WEAPONS.v30.seeker`、**包装** `Ent.stepAircraft` / `Renderer.pushModel` / `Renderer.setCamera`，用完还回去。这是最常用的观测手法

| 桩字段 | 值 / 行为 |
|---|---|
| `innerWidth` / `innerHeight` / `devicePixelRatio` | 1280 / 720 / 1 |
| `AudioContext` / `performance.now` | `FakeAudioContext` / `Date.now` |
| `requestAnimationFrame` | 回调压进 `rafQ`，返回递增序号 |
| `addEventListener` / `localStorage` | 存进 `winListeners`（`load` 事件靠它拿到）/ 内存版存储 |
| `document` | `body` / `getElementById` / `createElement` / `querySelectorAll` / `addEventListener` |
| `setTimeout` / `clearTimeout` / `console` | 直接转发 Node 的 |

`Game.init()` 不是直接调用的——测试触发**假 `load` 事件**：

```js
(winListeners.load || []).forEach(fn => fn());
```

开机自检没有返回值，它往 `body` 里塞一条红条，测试按文案找，找到就 FAIL：

```js
const preflightBox = bodyEl.children.find(c => /开机自检发现/.test(c.innerHTML || ''));
```

**`Game.__player()` / `Game.__world()` 是生产代码里的**（`js/boot/zz-api-game.js` 导出的 `Game.__*` 测试 / 回归钩子，清单见 [modules.md](modules.md)），测试直接用。`Game.__fireSpecial` **不存在**——所以发射一律走真实链路：取 `docListeners['keydown']` 里的回调，发 `{ code: 'Enter' }`。

#### 假时钟与 `pump()`

```js
let fakeClock = Date.now();
function pump(frames) {
  for (let i = 0; i < frames; i++) {
    const q = rafQ; rafQ = [];
    if (!q.length) break;          // 没有排队的帧就停（避免死循环）
    fakeClock += 16;               // 假时钟，每帧 16 ms
    q.forEach(fn => fn(fakeClock));
  }
}
```

`pump` 是"推进世界"的唯一手段，推进 1 秒就是 `pump(60)`。
**为什么必须是假时钟**：原来每次 `pump` 都传 `Date.now()`，连续调 `pump(1)` 时时间戳几乎不变，于是 `dt ≈ 0`、飞机不动——**卡死检测因此误报过**。

### 它覆盖了哪些方面

#### 前置（始终执行）

| 分组 | 在防什么回归 |
|---|---|
| `== 加载脚本 ==` | 页面副本与启动器必须与现场用模板 + 文本生成的结果一致（调 `gen-pages.js` 的 `build()` 逐文件比对，忘了跑会在这里炸，而不是在玩家屏幕上白屏）；全部脚本按层规则求值，任何语法错 / 顶层求值异常 |
| `== 初始化 ==` | `Game.init()` 抛异常；开机自检的红条；初始屏幕必须是 `scr-title` |
| `== 导航 ==` | 八个 `data-go`（`campaign` `brief` `hangar` `codex` `settings` `help` `changelog` `title`）在脚本里都要有 `go === '…'` 分支，且点击后 `.active` 真的换到目标 `scr-*`（导航失效过一次：flex item 缺 `min-height` 把 footer 顶出视口） |
| `== 更新记录 ==` | `js/core/changelog.js` 必须与 `CHANGELOG.md` **逐字段相等**（忘了跑 `release.js` 的拦网）；版本号格式 `vX.Y.Z`、日期格式、`<!-- commit: -->` 锚点、每版至少一条改动、版本号严格递减、`CHANGELOG.current` 与 `js/core/version.js` 的版本号一致；页面上画出的条目数 = 版本数，且每个版本号都出现在 HTML 里 |
| `== 完整流程 ==` | 标题 → 战役选择 → 机库；战役层：战役列表、每一关恰好归属一个战役、简报页只列本战役的关 |
| `== 任务与主循环 ==` | `startMission(0)` 成功 + 推进 240 帧不抛异常；呼号分队（各关敌机呼号不重复）；**卡死检测**：让全部关卡各跑 900 帧，查 NaN、飞机连续静止 > 60 帧、同一帧同一对象出现两次、`world.actors` 重复条目（FAIL 时打出一整串现场） |

#### 21 个可选段

| 段 | 内容 |
|---|---|
| `挂载系统` | 武器数据的静态检查：每件武器有挂载属性（`fits` / `perPoint` / `mass`）、可发射武器有 `speed` / `life`、制导武器有 `lead`、每件可发射武器写了合理的槽冷却 `cd`（≥ 1 秒；漏写或写成旧语义的 0.1 级数值会快得离谱）；机型的挂点组有效且成对；**机制标签**：数据里用到的标签都已声明、声明过的标签至少有一个数据项在用（预留的写 `reserved: true`，见 [tags.md](tags.md)）；**文本层**：各语言 `text.gen.js` 与 JSON 同步、脚本里静态写出的 `T('键')` 都存在、运行中没取过缺失的键（`Text.missing` 为空）、脚本里的中文字符串不超出允许清单（见 [text.md](text.md)）；**`$` 越界**：`Ent` `AI` `HUD` `Game` `PLANFORM` `RenderEnv` 的私有状态 `NS.$` 只许该命名空间自己的文件读写；玩家出击后的武器列表 / 世界状态 |
| `干扰与机动` | 最大的一段（四千多行），其余没有单独成段的断言都在这里，按主题见下一张表 |
| `舰艇对空` | 我方舰艇按阵营挑目标（打敌机、从不朝玩家打、中立不开火）、NPC 弹药池不超过挂载容量 |
| `机炮抗性` | 抗性只对小口径子弹生效；表 → 实体接通；航母 30 mm 击杀时间 |
| `范围伤害与近炸` | 衰减边界、同队豁免、撞地与寿命到期起爆、子母弹不伤飞机、最近点近炸、诱饵起爆、特效尺寸与粒子预算 |
| `压制下的目标与锁定` | 压制下门槛变近、越远亮得越短、烧穿距离保底；不可锁定、不进候选、已有锁定被取消 |
| `HUD 滤镜` | 受伤闪红随单次伤害加重、约半秒退掉；受损告警；干扰强度与不透明度上限 |
| `航线与随队干扰机` | 航线按水平距离到点；随队干扰机按玩家一方任何单位开机、冷却后重开 |
| `后台模拟框架` | `tools/lib/sim.js`：同种子两次逐帧相同、换种子会变 |
| `分段航线与有效射程` | `Route.plan` 各段推进、strike 只在有效射程内发射、`effRange` / `aiReach` / `lockOff` 取值 |
| `锁定与目标选择` | 没锁满的弹不带目标、锁满才带；锁满才触发对方告警；长按 F 取消选择、短按切换 |
| `旋转炮塔` | 炮位数与 `arms` 一致；射界夹紧 / 方位回绕；炮弹从炮口出、定时空爆；机炮无战斗部；预览带炮塔 |
| `舰船发射器` | 垂发竖直出管、斜置架按架向出管且只打扇区内、旋转架转向目标；`cells` 限弹；助推段不导引；舰空弹按 cue 出管 |
| `近防拦截` | 来袭导弹优先；齐射里能拦下（概率性，见上）、拦截报事件；玩家导弹命中报 HIT，别人的不报 |
| `舰尾水花` | 全速有、峰值在上限内、都在舰尾后方，停船 2 s 内消失 |
| `海上平台` | 每种都有模型与残骸、`arms` 与炮位一致；对 1.1 km 的敌机会开火（航标不开火）、能被打掉、残骸留在原地 |
| `TOR-3 与 target:any` | 对空对地都能锁、锁定距离与 TOR-2 一致、玩家挂不上；KA-7 弹药池，挂载重量随弹药折算 |
| `碰炸与拟真近炸` | 侧方擦过敌机在引信内、已解保 → 近炸；未解保 / 友机 / 对地无引信弹 → 不炸；正面撞上 → 碰炸满伤；`hbl` / `hbh` 溅射空中，`clb` / `v30` 不溅射 |
| `KA-7 默认挂载与携带量重量` | 默认挂载按组落位、弹药池、满挂 `loadFactor`、打光后减轻 |
| `僚机掩护撒干扰弹` | 600 m 外不骗；COVER 下 60 s 撒弹，每架消耗合理 |
| `包线缓存与滑翔校验` | `envelopeCached` 0.2 s 内复用、之后刷新；`asl` 滑翔 `rmax` 的 0.9 倍处命中 |

#### `干扰与机动` 段内的主题

下表按源码里的实际分组列出，括号内是源码标记——`/* ---- 首句 … */` 注释的首句，**用它在 `tools/test/smoke.js` 里搜就知道对应哪段代码**（行号会随改动漂移，标记不会）：

| 分组 | 在防什么回归 |
|---|---|
| `干扰与机动` 开头、`雷达弹也吃干扰弹`、`抗欺骗`、`诱饵只买到"一段时间"` | 红外 / 雷达弹对干扰弹的失锁率贴住 `w.flare`（含"雷达弹也吃箔丝"）；反复投放一次比一次难骗；盲飞期之后导弹仍会重新咬住 |
| `无动力制导弹真的会修正弹道`、`红外弹的自主寻的`、`反辐射`、`导弹急转应当掉速` | 无动力的有翼弹仍会修正；红外弹自寻；反辐射对"正在辐射"的目标伤害翻倍；导弹急转必须掉速（0.5 s 至少 15 m/s），否则躲导弹在物理上不可能 |
| `飞控（AI.steerTo）`、`闭环：拖动瞄准点…`、`机头朝上失速`、`俯冲 / 竖直附近不能原地连滚` | 三条基本控制律（前下方推杆、前上方拉杆、正侧方滚转）；坡度随转弯需求连续增加；失速会掉下来；竖直附近不连滚 |
| `机库的选装面板`、`挂载的机体能力门槛`、`挂载性能系数`、`六维条必须随挂载变化` | `#hpPicker` 生成的卡片每张都有定位行与简介、`#hpList` 行数 = 挂点组数；默认配置合法、能力门槛不形同虚设（制空机挂不了重型巡航弹）；满载时加速惩罚最重、滚转最轻、失速速度升高；六维条随挂载变化 |
| `追尾镜头必须真的落到渲染器上`、`追尾镜头：稳定水平 + 俯仰限位`、`…出画处理`、`鼠标引导时镜头俯仰`、`诊断：海面填充高度` | **一帧内只能有一次 `setCamera` 调用**（防分支写错导致追尾镜头被覆盖）；地平线稳定、俯仰钳在 89°、扫限位 / 穿越极点 / 持续垂直都不抽动；海天分界随海拔**单调下沉**（0.5 / 2 / 8 km 三点，防地球曲率项失效） |
| `真实链路：…` 四条 | 鼠标位移尖峰要丢掉、急转时镜头不前后伸缩、CMD 顶在最上面左右拖画面要转、完整链路 mousemove → updateAim → steerTo → ctrl 下柔和朝正下方必须推杆且不带滚转 |
| `轰炸机：沿航线飞、到点投弹、不参与空战`、`无人僚机：授权开火…` | M2 的轰炸机沿航线飞、到点投弹伤基地、投弹后转 `egress`、不自己选目标、基地被摧毁即判负；无人僚机长机不锁定则不许找目标、锁定后继承同一目标、长机阵亡后盘旋 |
| `两组挂架挂同一种武器`、`挂架上的实物`、`储备打光后，挂架不再恢复`、`齐射`、`发射槽`、`NPC 的实体挂载`、`AI 的开火选弹` | 槽下标不撞（数 `pushModel` 调用次数）；冷却中的槽是空的；储备打光后不恢复；一次按键出 `w.salvo` 枚且共用冷却槽；NPC 也有弹药池 / 发射槽并按"吊舱先占、制式弹铺满剩下的组"分配；AI 开火前按目标类别 + 射程挑弹 |
| `SPO-8 追云`、`CLA-9 已并入 CLA-17`、`"有没有发动机"和"有没有导引头"`、`两架高空机的性格` | SPO-8 去掉对地门槛且制空 / 截击机挂得上；CLA-9 并入 CLA-17；动力与制导两个维度正交；D-14 与 F-9 的性格在物理上真的分开 |
| `① 被动吊舱的加成字段`、`② 机炮射程`、`②b 机炮散布`、`③ DEW …按 cd 冷却` | 加成写成 `passiveEffect: {...}` 会静默失效；`fireGun` 不能把子弹寿命写死，否则 `range` / `highRange` 全是假值；DEW 槽拦截后必须冷却满 `cd` 才就绪 |
| `切枪不该丢掉锁定`、`无制导弹必须是"真·无动力"`、`无制导火箭`、`PEJ-30`、`激光制导机制（休眠中）`、`端到端：激光制导炸弹…` | 按 R 切武器不许清掉 `lockProgress`、不许把装填清零；无制导弹不留任何制导字段、真的受重力、无锁定也能投放且航向不变；休眠中的激光制导仍可跑（临时借 `v30` 改成 `laser`，验完还回去）；PEJ-30 光电制导 `flare` 必须**显式写 0** |
| `武器打错目标时必须拒绝发射`、`端到端：打错目标会被拒绝，打对了能命中` | 对空弹 `target` 必须是 `air`、对地弹不能是 `air`；带对空弹锁海面设施 0 枚出膛，无制导炸弹真能炸到设施 |
| `HUD：敌方标记一律红色`、`HUD：引擎出力条`、`HUD：屏幕外标记让开贴边仪表`、`屏幕中上方的告警` | 地面标记不许用灰蓝；锁定大框出现时基础小框仍在；出力条与油门轴一致；告警栈全部打开时顺序等于 `HUD.ALERT_ORDER`、导弹逼近在最上、相邻两行不重叠 |
| `诊断：第二关的地面目标能不能被锁定`、`诊断：AI 追到极高空会不会卡住`、`诊断：AI 到底用不用机炮` | 三条**诊断**：只打数值、不判定，要看数字自己判断 |
| `一轮全面体检…`、`关卡时限`、`地面 / 海面目标计分`、`友军战果分开记` | 固化"代码不报错、单测也不报错"的 bug；声明了 `timeLimit` 的关卡到点判负；计分口径 |
| `① 每个任务各跑 30 秒`、`② 每个机型各飞 10 秒`、`③ 每件能发射的武器各打一发` | 综合压力测试：三个维度都跑一遍，抓抛异常与数值崩坏（NaN） |
| `中立飞机（team 2）`、`F 键选目标`、`调节单元` | 谁都不主动打中立机、玩家也锁不到；F 键屏幕内锁离瞄准环最近的、1.5 s 内连按换第二近、屏幕内为空时锁最近的屏幕外目标；每关头顶 9–60 个调节单元（`team 2` + `friendlyAsset`），不锁任何武器，玩家误击只记一次 |
| `命名体系`、`敌机的呼号与型号不能混为一谈` | 机型必须是「两字母 rafsi - 序号」且前缀在登记表、武器必须是「三字母 rafsi - 序号」且词根在 `RAFSI` 表；敌机 `label` 要「中文 + 英文代号」、`name` 不许漏出内部下标 |
| `资料库：动态生成的图鉴必须能跑`、`单位详情页：生成 · 俯视图分配 · 3D 渲染 · 点击链路` | `CODEX` 里 `build()` 动态条目必须能生成且够长；详情页的生成、俯视图分配、渲染、点击链路 |
| `水面目标的航路` | 水面目标按航路走 |

### 怎么写一条新断言

照抄这个骨架，插到**同主题分组的花括号里**（别插在 `if (Ent && M3 && me && world)` 之外，那个 `else` 会直接 FAIL 一条"拿不到 Ent / world"）；新主题就开一个新的 `section('段名', () => { … })`，这样别人能用 `--only` 单独跑它：

```js
/* ---- 一句话说明这条断言在防什么 ----
    第二段写"为什么是这个判据"，以及当初踩的坑。 */
{
  const G = sandbox.Game, bad = [];
  G.startMission(0);
  const pl = G.__player();
  for (let f = 0; f < 60; f++) pump(1);        // 先让世界稳定

  const before = pl.hp;
  pl.hp -= 25;
  pump(1);

  if (pl.hp !== before - 25) bad.push('掉血没有生效：' + before + ' → ' + pl.hp);

  if (bad.length) bad.forEach(fail);
  else ok('掉血：' + before + ' → ' + pl.hp);
}
```

规矩：

- **用 `bad.push()` + 末尾 `if (bad.length)...else ok(...)`**：一次能报多条，成功时只留一行 OK，且 **OK 行要带实测数值**方便肉眼对比
- **消息里必须带数值**，格式 `期望 vs 实际`。写"锁定框不对"不如写 `锁定后基础小框消失了 —— 目标的身份和距离读不到了`
- **断言要打在最后生效的结果上**。追尾镜头那组就是教训：只复现 `camMode===0` 的计算过程拦不住"算完之后被另一条分支覆盖"，所以改成包装 `Renderer.setCamera` 数调用次数
- **改过的状态要还回去**：`Ent.stepAircraft`、`Renderer.pushModel`、`WEAPONS.v30.seeker`、玩家的 `special` / `spAmmo` / `slotCd` 都属于"借了要还"，不还的话后面的分组会测出互相污染的结果
- **别用 `Date.now()` 造时间**，用 `pump()` 推进；只想看数值不想断言，就 `ok('诊断 ...')` 并把当时的现场带进消息
- **概率事件别赌一轮**：像近防拦截那样，写成"最多 N 轮全新交战，第一次成功就过"，并在注释里算出全空的概率

### 测试的边界：它抓不住什么

| 抓不住 | 为什么 | 改完要另外做什么 |
|---|---|---|
| **纯视觉风格 / 像素级效果** | Canvas 桩是空操作 Proxy，只对显式挂勾子的几个调用（`fillRect` / `strokeRect`）有效；没有真实光栅化，`addColorStop` 是空函数 | 用 `render/` 下的预览器出 PNG，或在浏览器里肉眼确认；`golden-render` 只保证绘制调用没变，不保证画得好看 |
| **真实浏览器行为 / 布局 / 响应式** | 没有 CSS 布局、没有 `flex`、没有真实视口，`getBoundingClientRect` 恒返回 1280×720 左上角 | 手动缩窗口看，或 `shot-unitview.js`。导航那次失效（`min-height`）就是布局问题，测试当时拦不住 |
| **键盘 / 鼠标的浏览器语义** | 事件是 `fire()` 直接调回调，没有冒泡、没有 `preventDefault` 的真实效果 | — |
| **音频好不好听 / 性能与帧率** | 音频只验调用不抛异常；`fill()` 不耗时，`pump(60)` 不代表真实 60 帧 | 用耳朵；在浏览器里看帧率（瓶颈是 `fill()` 调用次数，见 [rendering.md](rendering.md#性能)）；`probe-perf.js` 只量逻辑耗时 |
| **文案是否通顺 / 白名单外的 `querySelectorAll`** | 只检查文本键存在、占位符取得到值、个别格式（呼号、编号），不读语义；桩只认识 `.screen` / `[data-go]` / `[data-ptab]`，别的返回 `[]`（通常静默跳过而不是失败） | 人工读；别指望它 |

**结论**：smoke.js 是"逻辑回归网"，不是"验收"。改了画风、布局、手感，必须另外肉眼过一遍——这正是 `render/` 下那些预览器存在的原因。

## 探针 `tools/test/probes/`

`smoke.js` 证明的是"**不崩**"和一批点状的行为断言；探针各自回答一个 smoke 不方便回答的**量化问题**（命中率、射程表、难度、能不能赢）。它们都建在 `tools/lib/sim.js` 上，用固定种子，同一份代码每次跑出同样的结果。

| 探针 | 回答什么 | 参数 | 退出码 |
|---|---|---|---|
| `probe-missions.js` | 清空敌人之后每一关到底能不能赢；NPC 挂载有没有问题 | `[--seed N]` | 恒为 0，看输出里有没有 `!!` 行与"问题："段 |
| `probe-balance.js` | 玩家不作为时，敌方行动本身给 m2 / m5 / m8 多大压力 | `[--seeds 5] [--t 240] [--only m2]` | 恒为 0 |
| `probe-turret.js` | 近防炮命中率与炮塔限制 | `[种子数，缺省 4]` | 超出期望区间为 1 |
| `probe-ciws.js` | 近防炮拦截反舰弹的拦截率 | `[每组次数，缺省 40]` | 不符为 1 |
| `probe-blast.js` | 近炸 / 爆炸伤害分布，对比基线 | `[--save] [--n 120] [--only 弹id] [--flare]` | 恒为 0（只打印偏差） |
| `probe-ccip.js` | 无制导弹落点标记 = 实际弹道 | 无 | 失败为 1 |
| `probe-envelope.js` | 发射包线（`rmax` / NEZ）方向正确且显示与命中一致 | `[--verbose]` | 失败为 1 |
| `probe-footprint.js` | 精确制导炸弹瞄准圈"圈内必中" | 无 | 失败为 1 |
| `probe-gunlead.js` | 机炮预测点（`Ent.gunLead`）能打中匀速目标 | 无 | 失败为 1 |
| `probe-range.js` | 各弹在不同高度平飞发射的有效射程表 | `[--json 文件] [--cmp 旧文件]` | 恒为 0 |

### `probe-missions.js`：冒烟测试抓不到的那一半

`smoke.js` 证明的是"**不崩**"：每关跑 30 秒、查 NaN、查挂载问题。
它证明不了"**这关能赢**"——胜负条件写错、目标算漏一个模型、新关卡的敌人挂在 `team` 不对的阵营上，这些都能让一关永远赢不了，而它照样安安稳稳跑满 30 秒。

做法：加载后台沙箱 → `startMission(mi)` → 每 30 帧（60 FPS 下 0.5 秒）无条件清空所有 `team === 1` 的飞机与设施（并让玩家无敌，避免被"打下来"干扰；0.5 秒一清足够把新刷出来的增援 / 波次一并清掉）→ 看 `mission.win()` 会不会在合理时间内变成 `true`。

```
node tools/test/probes/probe-missions.js
OK    0 m1   第一滴雨   OK     win@0.0s  lose@—  mount=0
...
OK   10 sk1  第四周    OK     win@34.5s lose@—  mount=0
```

四种判定（非 `OK` 的行以 `!!` 开头，汇总进"问题："）：

- `UNREACHABLE`（清空敌人后仍然赢不了）：胜利条件里多了一个永远清不掉的东西
- `MOUNT`：`Ent.mountIssues` 非空——某个机型挂着一件挂不上它挂点的弹，AI 会拿它开火。**`sk1` 的七种随机机型只有这个探针能覆盖**（smoke 的 240 帧跑在 m1，看不到随机战役的编成）
- `THROW`：跑的过程中抛异常
- `LOSE-FIRST`：清空敌人之前先判负了

`win@34.5s` 这种数字本身就是有用的信息：`sk1` 要等六个批次全部投完，所以"34.5 秒"说明随机战役的波次推进真的在走。

> **踩过一次**：探针第一版没触发 `window` 的 `load` 事件，`Game.init()` 根本没跑，主循环推进了 0 帧——结果把 m2 与 sk1 报成"胜利条件不可达"。
> 假报错比不报更贵：它会让下一个人去改一处本来正确的胜负条件。
> 所以任何"跑一遍游戏"的工具都必须确认**主循环真的在转**（`timeLeft` 在减少、或某一关的 `win` 花了非零帧数）。`Sim.load` 缺省会触发 `load` 事件，别无意中传 `init: false`。

### `probe-balance.js`：难度回归

玩家无敌、不开火、不机动，量敌方行动本身的压力：`loseAt`（`mission.lose` 第一次为真的时刻）、我方单位损失、剩余血量、航线动作次数（`onArrive` + `call` 段 + strike 发射数）。
它存在的理由：v1.13.2 修了"航线永远到不了点"之后，第 2、5、8 关的轰炸机才第一次真的投弹——这个探针用来看那之后难度跳了多少。

| 关 | 3 种子 × 240 s（当前） | 备注 |
|---|---|---|
| m2 | 基地血量 62%，航线动作 2 次 | v1.13.2 修航线前是 100% / 0 次 |
| m5 | 血量 100%，动作 1 次 | |
| m8 | 编队血量 84%，动作 6 次 | 改 strike 段后 BOX-14 能命中；以前 `bomberRelease` 在舰前约 9 km 定点放弹、弹在 1.9 km 外失效，血量 100% |

### `probe-turret.js`：近防炮命中率

Orca 的一门近防炮（`ciws20`）对着一个假目标打。目标在 1.2 km 外横穿，250 m/s，四种运动各 30 s：

| 运动 | 期望命中率 |
|---|---|
| `straight` 匀速直线 | 20–45% |
| `turn` 0.1 rad/s 缓慢转弯 | 4–20% |
| `accel` 200 起、15 m/s² 缓慢加速 | 5–25% |
| `jink` 随机急机动 | ≤ 7% |

区间是 v2.2 近防加了散布、降了射速、提前量更迟钝之后重新标定的：平直依然好打，一机动就掉得很快（原计划 straight ≥ 50% 配的是没削弱的近防炮）。命中靠调 `turret.js` 里的 `aim.lag` 与 `aim.err` 落进区间。
另外检查：射界外的目标绝不开火；炮塔转速受 `slew` 限制；以及**贴近敌舰通场**——真飞机在 300 m 高、舷侧 500 m 外以 250 m/s 掠过 Dunkleosteus（全部炮位），平直通场平均掉血 ≥ 120 hp、轻微机动（2g）≤ 60、大幅机动（6g）≤ 40。

### `probe-ciws.js`：近防拦截

Orca（两门 `ciws20`）挨反舰弹（`ssm`）齐射，统计每枚弹的结局：拦截（`m.intercepted`）/ 命中（船掉血）/ 脱靶。分三组：速度（`ssm` 原速 / 改到 900 m/s）、齐射（1 / 2 / 4 枚同时来，看过载）、压制（宿主 `suppressed` = 0 / 0.25 / 0.5，拦截率应单调下降）。
**已知问题**：在当前近防参数下拦截率只有个位数百分比，"随压制单调下降"这一条被噪声淹没，探针会以退出码 1 失败——它的期望值是旧参数下标定的，需要重新标定；smoke 里的 `近防拦截` 段不受影响。

### `probe-blast.js`：近炸与溅射的分布

对每一种空空弹，按 `straight / gentle / hard / jink / max / flare` 六档目标机动各打 N 发，统计命中率、平均伤害（占武器 `dmg` 的比例，便于跨弹比较）、起爆时弹目距离。靶机按脚本运动（不走 AI），新旧版本跑的是同一组交战。基线 `tools/test/probes/probe-blast.baseline.json` 是 v1.13 改动前存的。

```
node tools/test/probes/probe-blast.js              跑一遍并和基线对比（末尾打印非干扰弹档的最大伤害偏差）
node tools/test/probes/probe-blast.js --save       存为新基线
node tools/test/probes/probe-blast.js --n 80       每档发数（默认 120）
node tools/test/probes/probe-blast.js --only srm   只跑一种弹
node tools/test/probes/probe-blast.js --flare      投弹时机实验：srm 来袭，3000 / 1000 / 300 / 100 m 各投一组干扰弹
```

`--flare` 的期望：早投 ≈ 0 伤害、贴脸投 > 0、随距离单调（诱饵起爆的溅射）。

### 其余探针

- **`probe-ccip.js`**：HUD 预计落点（`Ent.naturalPoint`）和实际出膛后的弹道是同一套计算——在多种高度 / 速度 / 俯冲角下，把目标放在标记上投放（`Ent.flyTo`）必中，挪出爆炸半径外则不中；并核对 PEJ-4 / PEJ-22 的定位数值。
- **`probe-envelope.js`**：`rmax` / NEZ 的变化方向正确（本机高度、速度、目标航向各变一项，包线该大的大、该小的小，用真实弹道 `Ent.envelopeRange`）；显示与命中一致（边界内外用 `Ent.flyTo` 实弹，"显示 IN RNG / NEZ 就打得中，射程外就打不中"）。滑翔弹的 `nez` 在"水平 0 距离"（高空投放、目标逃逸追不上）时标注为"无逃逸包线"，不做命中断言。
- **`probe-footprint.js`**：精确制导炸弹的瞄准圈"圈内必中"——可达区域（`Ent.finFootprint`）圈内实弹命中率接近 100%、圈外明显下降、圈随投放高度与速度变化。圈是用真实命中判定二分出来的，所以它不该骗人。
- **`probe-gunlead.js`**：按 `Ent.gunLead` 的方向用真实弹道开炮应打中匀速目标；旧的直线估算（忽略载机速度与重力）作对照。
- **`probe-range.js`**：各导弹 / 炸弹在 0 / 6 / 12 / 18 / 24 km 平飞发射的有效射程表（`Ent.effRange`）；改物理前后各跑一次，`--json` 存下来再用 `--cmp` 比对。

## 文本与页面的生成工具（`tools/build/`）

这几个工具的原理与规范写在 [text.md](text.md) 与 [pages.md](pages.md)，这里只列"怎么跑、退出码"。

| 命令 | 作用 | 退出码 |
|---|---|---|
| `node tools/build/gen-index.js` | **只打印**脚本加载顺序与总数（调试用）；不写任何文件。顺序的权威规则在这个文件里：固定的层 `core → data → models → missions → engine → render → ui → boot`，层内 `_` 开头最先、`zz` 开头最后；各命名空间的 `_state.js` 排在 `core` 之后；`core/` 里 version、changelog、math3d、text、registry、tags 按人工顺序；语言包紧跟 `text.js`。`js/` 下有不属于任何层的文件会抛错 | 0 |
| `node tools/build/gen-locales.js [--check]` | 把 `locales/<语言>/text/**/*.json` 合并成 `locales/<语言>/text.gen.js`；`--check` 只检查是否过期 | 有错误或（`--check` 时）过期为 1 |
| `node tools/build/fmt-locales.js` | 把 `locales/` 下全部 JSON 规范化（2 空格缩进、UTF-8、结尾换行）；重复键等问题直接报错而不是悄悄丢一个 | 有错为 1 |
| `node tools/test/check-locales.js` | 脚本里静态写出的 `T('键')` / `T.pick('键')` 与页面模板里的 `{{html.键}}` 必须存在；没有被引用的键只给警告（可能被动态拼接，也可能是死文本）；各语言 `text.gen.js` 与 JSON 同步；JSON 本身合规 | 有错误为 1 |
| `node tools/test/text-census.js [--check \| --write]` | 统计脚本里剩余的含中文的字符串字面量（跳过注释）。不带参数：按文件打印；`--check`：对照允许清单 `baseline/text-census.json`，**只许缩小**；`--write`：把当前数字写成新清单（只在清单缩小时用） | `--check` 超出为 1 |
| `node tools/build/gen-pages.js [--check] [--pseudo]` | 从模板片段 + 文本生成各语言页面副本 `locales/<语言>/html/index.html` 与根目录启动器 `index.html`；`--check` 只检查是否过期；`--pseudo` 另生成 `locales/pseudo/html/index.html`（静态文本也包成 `⟦…⟧`，gitignore，仅开发） | 模板 / 文本有错误或（`--check` 时）过期为 1 |
| `node --expose-internals tools/build/extract-text.js [--write] [--only 前缀]` | 半自动提取：把脚本里含中文的字符串字面量写进 `locales/zh-CN/text/**.json`，并把字面量换成 `T('键')`。不带 `--write` 只报告；需要 `--expose-internals`（借 Node 内置的 acorn，不给项目加依赖）。批次 1 迁移时用的，现在跑应当提取 0 条 | 0 |
| `node tools/build/extract-html.js <旧 index.html> [--write]` | **一次性迁移**：把旧的单文件 `index.html` 拆成 `locales/_html/` 片段 + `locales/zh-CN/text/html/*.json`。留着只是为了说明当初怎么拆的；日常改页面直接改片段与 JSON | 缺参数为 1 |

所有"生成物"（`text.gen.js`、各语言页面副本、启动器 `index.html`、`js/core/changelog.js`、`js/core/version.js`）都提交进仓库，`smoke.js` 断言它们与现场重新生成的一致——忘了跑会在测试里炸，而不是在玩家屏幕上白屏或缺字。

## 预览器 `tools/render/`

**"画风"光看代码判断不了，而开发机上没有浏览器。** 所以这里是一组离线出图工具：直接加载游戏自己的脚本，用一个最小 Canvas 2D 子集 + 光栅器 + PNG 编码把画面落成图片，让人肉眼检查。输出都在 `tools/render/out/`（gitignore，随时可以重出）。
这类工具**不写任何断言**，只是把图落盘，看的人负责判断"像不像"——别指望 CI 能替你判断画风。

脚本清单都经 `tools/lib/scripts.js`：`render-planform` / `render-ships` / `render-units` / `shot-unitview` 用 `preview()`（不含 `Game` 的界面 / 输入 / 相机 / 启动）；`render-mounts` 与 `probe-render` 加载全部（`Game.__pushStores` 在 `Game` 里）。

`lib/raster.js` 的由来：`render-planform.js` 最初把光栅器和 PNG 编码内联在自己文件里，舰船预览器需要同一套东西。**没有去动那个已经被验证过、能跑的旧工具**——新代码走 `require('../lib/raster')`，旧文件保持原样。两份实现的差异只有一处：`lib/raster.js` 多了一个 `Raster.clear()`（预览器要铺底色，俯视图不需要）。

### `lib/raster.js` 的 Canvas 能力边界

**支持**：`stroke` / `fill` / `fillRect` / `strokeRect` / `moveTo` / `lineTo` / `closePath` / `rect` / `arc` / `ellipse` / `quadraticCurveTo` / `setLineDash` / `save` / `restore` / `#rrggbb` 与 `rgb[a]()` 颜色。`line()` 用点到线段距离做抗锯齿并支持虚线段；`poly()` 是扫描线 + 奇偶规则 + 4 倍纵向超采样。
**不支持**（空函数，静默）：`translate` / `rotate` / `scale` / `setTransform` / `transform` / `fillText` / `strokeText` / `bezierCurveTo` / 渐变 / `shadow*` / `clearRect`。**如果哪天被预览的绘制代码开始用 `translate` / `rotate` 画图，预览会静默画错（图堆在原点）而不报错**——加变换时要么同时补桩，要么换办法。
`getContext()` 每次调用返回**新的 ctx**，路径状态不共享，绘制函数必须只取一次。

## tools/render/render-planform.js

把 `PLANFORM.draw()` 的输出落成图片。它加载的是**真正的 `js/render/planform/`**，用的是同一份绘制代码——预览和游戏里看到的完全一致（同数据、同绘制函数、同底板色 `#070d12`）。用自己内联的那份光栅器（见上）。

```bash
node tools/render/render-planform.js
```

不用参数，输出 `tools/render/out/<机型id>-<挂载>.png`，640×440，每张图是独立 `Raster`：

- `<id>-default.png` —— `ac.defaultLoadout`；`<id>-clean.png` —— 空挂载
- `<id>-<武器键>.png` —— 把该武器**装满所有挂得下的挂点组**（`fillWith()`），并高亮第一个挂点组；枪不算、挂不上就跳过

## tools/render/render-ships.js

和 `render-planform.js` 同一个理由（"这条船看起来像不像船"是代码看不出来的），但走的是**另一条路**：不是调用某个 2D 绘制函数，而是把 `MODELS` 里的三维几何喂给**游戏自己的渲染管线**：

```
加载预览用脚本（含 js/models/、js/data/、js/render/render.js）
      ↓
Renderer.init(桩 canvas) → setCamera() → pushModel(model) → flush()
```

所以它验证的不只是"模型数据能不能算"，而是**投影、光照、画家算法排序和配色在实机上到底是什么样子**——包括 `render.js` 里那些只在特定条件下才触发的分支（近平面裁剪、面积剔除、`f.d < 900` 时的细描边）。

```bash
node tools/render/render-ships.js
```

不用参数，输出到 `tools/render/out/`：

- `ship-<id>.png` —— 每艘舰船、每个海上平台各一张（平台另出一张残骸 `ship-<id>-wreck.png`），640×380，从右前上方 3/4 视角，相机距离按模型尺寸自适应（`frameCamera()`）；炮塔按零位合进模型（`MODELS.composeTurrets`）
- `ship-lineup.png` —— 全部舰船**同一个 scale** 分三行排列（每行 4 / 4 / 其余），1200×640，按排水量降序。这是"相对尺寸对照图"；平台没有吨位，不进总览

要点：

- **`begin()` 画完之后要再 `ras.clear()` 一次**。`Renderer.begin()` 会调 `drawSky` / `drawClouds` / `drawGround`，那是给"从空中俯瞰"准备的画面；预览里要的是纯色底，所以把背景涂掉再 `pushModel`。不能省——否则预览图里的船会浮在天空渐变上
- **总览图每行单独渲染再上下拼接**。塞进同一个相机时，三行只能靠深度差分开，而在接近侧视的角度下深度差几乎完全投影不掉：实测三行会重叠成一行。拼接时所有行共用同一个 `scale`，这是"对照"成立的前提
- **总览图的 `px` 必须取负**。相机在 +z 看向原点时 `right = up × fwd = (-1,0,0)`，也就是屏幕右 = 世界 -x；不取负的话吨位最大的船会排到最右边
- 透视用**小 FOV + 按比例拉远**（`FOV = 26`、距离再乘 `MARGIN = 1.35`）。一条 210 米的船如果近距广角拍，艏部会被放大到框外
- 共用 `tools/lib/raster.js`；舰船预览只用到 `fill` / `stroke` / `fillRect` / `arc` / `ellipse`，都在支持范围内

## tools/render/render-mounts.js

### 解决什么问题

"挂架上的实物"是**画出来的**东西。冒烟测试能数清"画了几件"（`Game.__pushStores` 推了几个 `scale: 0.85` 的模型），但数不出"看起来是不是挂在翼下、机腹的吊舱有没有穿进机身、打光之后是不是真的干净"。这个工具把有代表性的配置落成 PNG。

它的价值在于**一行挂载逻辑都不重写**：

```
Ent.makeAircraft()   ← 真造一架（含 NPC 的弹药池 / 发射槽 / 挂载分配）
Game.__pushStores()  ← 真的那条渲染路径（与实机同一份代码）
js/render/render.js  ← 真的投影 / 光照 / 画家算法
```

所以图上看到的就是实机上看到的。`Game.init()` 没有被调用（`window.addEventListener` 是空实现），所以 `Game` 只是被加载。

### 怎么用

```bash
node tools/render/render-mounts.js
```

不用参数，输出 `tools/render/out/mount-<机型>-<配置>.png`，620×360，右前上方 3/4（与图鉴详情页同一套角度）。配置在脚本里的 `CASES` 数组，每个针对一条规则，终端会打印每张图数出来的件数：

| 图 | 验证什么 |
|---|---|
| `mount-schist-dl6` | 制式弹按挂点逐点画出 |
| `mount-schist-dl6-dry` | 弹药池清零后机翼真的变干净 |
| `mount-basalt-dl4-vzu` `mount-schist-dl6-vzu` | 任务写定的吊舱与制式弹共存（吊舱占外侧、导弹占重挂点） |
| `mount-spray-vbn-vzu` | 吊舱进机腹、制式弹不被挤掉（正序占位会在这里翻车） |
| `mount-sandstone-vbn` | 储备 2 发 < 挂点 4 个时，多出来的挂点出厂就是空的 |
| `mount-lodestone-vsc` | 只有机腹挂点的干扰机把吊舱挂在机腹 |
| `mount-pelican-dl6` | 适配表拦住"预警机挂格斗弹"（一件都不该有） |
| `mount-folded_wing-default` | 僚机默认挂载（翼下 TOR-3 + 内埋 CLA-4） |
| `mount-frigatebird-drm` | 外观对照：TOR-3 单枚 |
| `mount-skua-default` `mount-skua-default-belly` | 扁平机身的翼下 / 机腹挂载贴合 |
| `mount-frigatebird-srm` `-wasp` `-qsr` `-swm` `-rkt` `-vlar` `-lcm` | 各型弹体 / 挂梁 / 方巢的外观（短小、三联、方巢、七管火箭巢、最大、巡航弹） |
| `…-belly`（`lodestone-vsc` `spray-vbn-vzu` `schist-dl6` `skua-default`） | 同一批配置从**下**往上看（机腹挂载只有这个角度看得见；`el` 为负） |

### 实现要点与限制

- **数出来的件数是给终端看的**，它和图本身是两条独立的证据：件数不对说明规则错了，图画得丑说明坐标或比例错了
- 相机取景是**这个工具唯一自己写的部分**（`frameCamera()`，按模型包围盒自适应距离，参数 `AZ` `EL` `FOV` `MARGIN`）。挂载高度不在这里，它属于 `Ent.storePos()`
- `Renderer.begin()` 之后要再 `ras.clear()` 一次，理由同 `render-ships.js`
- 不支持玩家（`Game.init()` 没跑，`player` 是 null）。玩家的挂载本来就在机库里能看见，更需要肉眼确认的是敌我 NPC 那几型
- **吊舱不再借用导弹的外壳**：吊舱（`vzu` `vsc` `e4` `l2` `ecm2` `dec` `oep` `irp` `hdp`）的 `model` 都是 `'pod'`。在这之前它们全用 `'missile'`，"这架带了干扰吊舱"在画面上读不出来——两张预览图曾经**字节相同**
- **机腹挂载要单独从下往上看**：3/4 俯视角度看不见机腹。这不是额外的配置，是同一个配置换了个仰角

## tools/render/render-units.js 与 tools/render/shot-unitview.js

这两个是**单位详情页**的验证工具。为什么要两个：详情页有两件事要肉眼确认，而它们需要的环境完全不同。

| | `render-units.js` | `shot-unitview.js` |
|---|---|---|
| 验证什么 | **模型**画得对不对（旋转预览的画面） | **布局**对不对（左右分栏、参数表、字号）与 WebGL 预览 |
| 靠什么 | 离屏 canvas + `lib/raster.js`（纯 node） | 真的无头 Chrome |
| 看到的 | 3D 预览那一个矩形 | 整页 |
| 依赖 | 无 | 本机装了 Chrome / Edge（或设 `CHROME_PATH`） |
| 输出 | `tools/render/out/unit-<air\|ship>-<id>.png`（每个机型、每艘舰船各一张，460×300） | `tools/render/out/shot-unit-<id>.png`（默认 4 张） |

### render-units.js

```bash
node tools/render/render-units.js
```

它直接调 `UnitView.renderModel(cvs, model, yaw, pitch)`——就是详情页里那个函数的本体，所以**它验证的是那一份独立渲染代码**（见 [unitview.md](unitview.md#关键决策为什么不复用-renderjs-的-renderer)，它和 `render.js` 是两份实现，不能靠 `render-ships.js` 替代验证）。

### shot-unitview.js

```bash
node tools/render/shot-unitview.js                  # 默认四个：sailfish（有俯视图）、basalt（无俯视图）、orca、bluewhale
node tools/render/shot-unitview.js ship:bluewhale   # 指定单位：id 是飞机，ship:id 是舰船，weapon:id 是武器
```

它生成一个**最小页面**：只加载 `preview()` 那组脚本，刻意**不加载 `Game`**（那个文件在 `load` 时会启动整个游戏），再把 `UnitView.html()` 的结果插进去，用真正的 `css/style.css`。最小页面包含 `shading.js` 与 `render-gl.js`，并给 Chromium 加 swiftshader 软件 GL 参数——截到的 3D 预览就是真机走的 WebGL 路径。

Chromium 的参数里有两个是必须的：

- `--virtual-time-budget=4000` —— 让页面先"跑"几秒。3D 预览靠 `requestAnimationFrame` 出第一帧，不等就截到一张空画布
- `--window-size=1400,1050` —— 详情页是左右分栏 + 下方长参数表，窗口太窄会把右栏挤成一列，看不出真实比例

**它找不到 Chrome 就直接报错退出**，不会生成一堆空壳页面——后者最难查。

## tools/render/probe-render.js

WebGL 与 2D 的画面对比。无头 Chrome（`--use-angle=swiftshader` 软件 GL）把固定场景用两条路径各画一张，左右并排，输出 `tools/render/out/probe-render.png`，并在页面里逐像素算差异。

- **模型场景**：`wing-top` / `wing-low`（挂满弹的机翼，从后上方 / 下方看）、`fleet-fog`、`ship`、`aircraft-*`。两边都关掉 WebGL 环境层，只比模型。
- **环境场景**（`env-low` / `env-high` / `env-cloud` / `env-blast`）：WebGL 一侧开着天空 / 海面 / 云 / 粒子，2D 一侧是旧画面，两边本来就不一样。
- 差异 = 任一通道差 > 24 的像素占比；**非遮挡场景限 3%**，超过则退出码 1。遮挡场景（`wing-top` / `wing-low`，那正是迁移要修的"翼下挂弹应被机翼挡住"）与全部环境场景只报告、不判失败。
- 需要本机 Chrome / Edge（或 `CHROME_PATH`）；WebGL2 不可用时只截到 2D，退出码 1。

## 版本戳与发版

### 为什么 `js/core/version.js` 是自动生成的

它只有十来行，第一行就写着"自动生成——不要手改"。它是 `tools/build/release.js` 从 git 记录写出来的（`stamp-version.js` 调的也是同一个函数）：

```js
var BUILD_STAMP = {
  version: "v3.0.0",                 // CHANGELOG.md 顶部那条的版本号
  time: '2026-10-24 00:12',          // 本地可读时间
  iso: '2026-10-24T00:12:42+09:00',  // git 的 %cI
  hash: '0e73c83',                   // 短哈希
  subject: "test: 近防拦截的概率性检查改成最多 8 轮重试"
};
```

字段全部来自 `git log -1`（`%cI` / `%h` / `%s`），时间转成本地 `YYYY-MM-DD HH:MM`。`version` 是唯一的例外——它来自 `CHANGELOG.md`，不是 git。

**为什么必须生成而不能运行时算**：本项目没有构建步骤，页面是静态托管的，运行时拿不到 git 信息。也**不能用 `document.lastModified`**——那取的是 HTML 的响应头，托管方有时给一个与内容无关的时间，而且在**缓存命中时不更新**，恰恰在最需要它的时候失效。

### 谁来生成、什么时候必须重新生成

```bash
node tools/build/release.js vX.Y.Z   # 发版（版本号手动指定）：追加 CHANGELOG.md + 刷新两个生成物
node tools/build/release.js          # 不发版，只刷新两个生成物（changelog.js 与 version.js）
node tools/build/stamp-version.js    # 只刷时间戳（版本号仍从 CHANGELOG.md 顶部读）
```

**每次 `git commit` 之前跑一遍 `stamp-version.js`。** 输出形如 `js/core/version.js 已更新` + 版本 + 时间 + 短哈希与提交标题。不在 git 仓库里时它打印 `读不到 git 记录（可能不在仓库里），跳过` 并正常退出。

**注意一个细节**：脚本取的是**最后一次提交**的信息。你在提交 A 之后、提交 B 之前跑它，生成的 `version.js` 里记的是 A，而这个文件本身会被写进 B。所以页面上显示的是"这次的代码基于哪个已提交状态"——它有意的口径是**上一版**，而不是工作区里的这一版。

### 标题页右上角那个版本戳的用途

标题屏有个 `<div id="verStamp" class="ver-stamp">`（模板片段 `locales/_html/screens/title.html`）。`Game.init()` 里（开机自检之后）由 `js/boot/main.js` 的 `stampVersion()` 往它填 `BUILD <版本>（取自更新日志里同一版本的标题）· 2026-10-24 00:12`；短哈希与提交标题放进悬停提示（`title`），不占菜单版面（文案走文本层 `boot.main.stampVersion.*`）。（它以前在左上角，和开机自检那几行 `.boot` 叠着印；加上版本号之后第一行变长，重叠更明显，所以搬到了右上角。）

**用途只有一个：确认部署的到底是哪一版。** 浏览器缓存、托管方的重建延迟、推送失败——这三件事从画面上完全看不出来，但时间戳变了就说明新的 commit 确实上线了。文件缺失或 `BUILD_STAMP` 未定义时**静默降级**成 `BUILD 开发版`，不影响游戏本身（开发中直接开页面就是这个样子）。

## tools/build/release.js：发版与更新日志

### 解决什么问题

玩家应该看得到"这游戏更新过什么"，但浏览器里没有 Markdown 解析器，而为了这一屏装一个（哪怕最小的）都违反"零依赖"这条底线。

所以日志写两遍：**`CHANGELOG.md` 给人读，`js/core/changelog.js` 给游戏读**，中间的转换交给 `release.js`。两边都是纯数据，界面（`buildChangelog()`）只负责画。详见 [DESIGN.md 6.9](../DESIGN.md#69-为什么更新日志要生成两次)。

### 版本号怎么定

每个版本条目末尾带一个锚点：

```markdown
## [v1.0.0] 2026-10-15 · 正式发布
<!-- commit: 09c3686 -->
```

**版本号由人在命令里给**：`node tools/build/release.js v1.11.0`（`v` 可省略）。`release.js` 读最上面那条的版本号与锚点，检查新版本号格式正确、比当前版本大、锚点之后确有新提交，再用 `git log <锚点>..HEAD` 取新提交，按前缀分成「新增 / 调整 / 修复 / 文档」草稿，追加到 `CHANGELOG.md` 顶部，然后刷新两个生成物。加 `--dry` 只预览不落盘；不带版本号只刷新两个生成物、不发版。检查不过一律报错退出（退出码 1）。
（以前按提交前缀自动判大 / 中 / 小版本，已取消——前缀衡量不了"对玩家算多大"。）流程全文在 [VERSIONING.md](../VERSIONING.md)。

### 为什么不做成全自动

工具只会把提交信息搬过去，**它写不出人话**：`feat: 新增战役选择层` 是提交，`v0.4.0 · 世界观与命名重整` 才是玩家要读的东西。一次改动往往拆成五六个提交（"加功能" → "修它" → "再修它" → "补文档"），玩家不需要看你的返工过程。

所以分工是：**工具管机械的**（版本号、锚点、格式、生成文件），**人管那一句话**（合并同类项、改成标题）。生成的条目里会插一条 `<!-- TODO: 合并同类项… -->`，看到它就说明还没润色。

### 谁来保证生成物没忘

`smoke.js` 的 `== 更新记录 ==` 里有一条硬断言：把 `CHANGELOG.md` 现场解析一遍，和要求 `js/core/changelog.js` 逐字段相等。忘了跑 `release.js` 会在测试里炸，而不是在玩家屏幕上显示一份过期的日志。

## tools/build/rename-aircraft.js

按一张**旧编号 → 新编号**的对照表，把全库机型编号精确整串替换。只在"改命名规范"时用，一次性的。命名规范写在脚本头部注释里（设定集 8.1）：上游按用途前缀（`D-` 战斗 / `DB-` 舰载战斗 / `F-` 截击 / `G-` 攻击），下游按设计局前缀（`ROK-` / `GAL-` / `VAC-`），分水群岛国用商品名（`XA-8` → `潮线`），管理局用批次名（`ME-2` → `水准`）。

```bash
node tools/build/rename-aircraft.js
```

无参数、**无 dry-run**、**直接原地写文件**。跑完打印每个被改文件的替换次数与合计（形如 `js/data/…  替换 7 处` / `合计 10 处`）。要处理的文件 `FILES` = `tools/lib/scripts.js` 的全部脚本（排除 `changelog` / `version` 生成物）+ 八份文档：`docs/world/SETTING.md`、`docs/systems/` 下的 `flight-model.md` `planform.md` `weapons.md` `loadout.md`、`docs/DESIGN.md`、`docs/README.md`、根 `README.md`。`PLANES` 数组是唯一的对照表。

```js
const re = new RegExp('(?<![A-Za-z0-9])' + a.replace('-', '\\-') + '(?![0-9])', 'g');
```

**只做精确整串替换**，两侧用环视卡住"不能是字母数字 / 不能紧跟数字"——避免 `DA-1` 误伤 `DA-11`、`DA-14` 这类更长的编号。对照表里同时保留了**早先的中间命名**（`BL-11`、`GA-14`、`MI-21`、`SU-33`、`RO-27`），所以它能一次跑完从最初到当前的所有历史命名。

**注意**：`FILES` 里**没有** `tools/` 下的脚本（含 `smoke.js` 里的 `RAFSI` 登记表），也没有 `locales/` 下的文本 JSON 与 `docs/systems/` 下的其它文档。改了编号之后要自己检查这几处。

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 测试推进多少帧 / 假时钟步长 | `pump(N)`（1 秒 = 60 帧）；`pump` 里的 `fakeClock += 16`（毫秒） |
| 卡死判定阈值 / "算静止"的帧间位移 | 卡死检测里的 `t.max > 60` 与 `d < 0.02`（米） |
| 干扰成功率容差 | `±0.05`（1500 次采样）/ `±0.045`（1200 次采样） |
| 追尾镜头俯仰限位 | 追尾镜头那组的 `CAM_PITCH_LIM = 89 * Math.PI / 180`（复现自 `updateCamera`） |
| 压力测试时长 | 每关 1800 帧、每机型 600 帧、每武器 400 帧 |
| 命名体系校验的词根表 | `smoke.js` 的 `RAFSI` / `UP_PREFIX` / `DOWN_PREFIX` |
| 黄金回放的种子 / 秒数 | `golden.js` 的 `SEED`（7）与 `--secs`（缺省 20）；`golden-render.js` 的 `FRAMES`（1.5 / 3 / 5 秒） |
| 预览图尺寸 / 输出目录 / 底板色 | `render-planform.js` 顶部 `W`/`H`、`OUT`（`tools/render/out/`）、`BG` |
| 挂载预览的取景 / 配置 | `render-mounts.js` 的 `AZ` `EL` `FOV` `MARGIN` 与 `CASES` |
| 画面对比的差异阈值 | `probe-render.js` 的 `LIMIT`（0.03）与逐像素阈值 24 |
| 版本戳显示位置 | 模板片段 `locales/_html/screens/title.html` 的 `<div id="verStamp">`，由 `js/boot/main.js` 的 `stampVersion()` 填，样式 `css/style.css` 的 `.ver-stamp` |
| 更新记录页的样式 | `css/style.css` 的 `.cl-*`；数据在 `js/core/changelog.js`，条目文本由 `clInline()` 还原 `**粗**` / `` `代码` `` |
| 版本号检查（格式 / 必须比当前大） | `release.js` 的 `normalizeVersion()` / `compareVersion()`；版本号本身由人在命令里给，见 [VERSIONING.md](../VERSIONING.md) 第 2 节 |
| 改名影响哪些文件 / 旧→新对照表 | `rename-aircraft.js` 的 `FILES` / `PLANES` 数组 |
| 近炸探针的发数 / 基线 | `probe-blast.js` 的 `--n`（默认 120）、`probe-blast.baseline.json` |
| 中文字符串允许清单 | `tools/test/baseline/text-census.json`（只许缩小） |

## 易踩的坑

1. **增删 / 改名了 `js/` 下的文件却没跑 `gen-pages.js`**：页面副本里的 `<script>` 块过期，浏览器里白屏；`smoke.js` 开头那条会拦住。顺序的权威永远是 `gen-index.js` 的层规则，不是页面
2. **改了 `locales/**/text` 的 JSON 却只跑了 `gen-pages.js`**：`text.gen.js` 没更新（页面副本里静态文字是 `gen-pages` 现场取文本填的，动态文本却读 `text.gen.js`）。先 `gen-locales.js` 再 `gen-pages.js`
3. **`fail()` 不中断**：第一条 FAIL 才是根因，从中间开始读会浪费很多时间
4. **写死的 `Date.now()`**：连续 `pump` 之间时间几乎不变，`dt≈0`、飞机不动，于是卡死检测误报。**一律用 `pump()` 推进**
5. **`innerHTML` 的 setter 不真的清 DOM**：桩里显式处理了（`makeEl()` 里的 `innerHTML` setter），否则反复进机库会看到"行数翻倍"的假故障
6. **借了不还**：包装 `Ent.stepAircraft` / `Renderer.pushModel` / `Renderer.setCamera`、临时改 `WEAPONS.*.seeker`、改玩家的 `special` / `spAmmo` / `slotCd`——不还原就会污染后面所有分组
7. **断言打在中间计算上，或用超现实的测试参数**：追尾镜头那组试过"up 的倾斜度"和"up 是否精确等于 (0,1,0)"，两个判据都会误报或漏报，最后用"一帧内 `setCamera` 调用次数"才干净；飞控测量曾用远超真实的扫掠角速度去测一阶低通，量到的是测试参数的问题
8. **预览器里不支持的 Canvas 调用是静默的**：给被预览的绘制代码加 `translate` / `rotate` / 文字 / 渐变，预览会画错而不报错
9. **`rename-aircraft.js` 没有 dry-run 且 `FILES` 不含 `tools/`、`locales/`**：跑之前先 `git status` 干净，跑完 `git diff` 看一眼，并手动检查工具脚本与文本 JSON
10. **`stamp-version.js` 记的是上一次提交，且必须在提交前跑**——忘了跑的话页面上还是旧时间戳，"到底部署没部署"这件事就白问了
11. **`js/core/version.js` 不要手改**：它是生成物，手改等于伪造部署状态
12. **改了 `CHANGELOG.md` 却忘了跑 `release.js`**：游戏里读的是 `js/core/changelog.js`，不会自己跟着变。`smoke.js` 里有硬断言拦这一条
13. **`CHANGELOG.md` 的标题格式是解析契约**：`## [v1.2.3] 日期 · 标题` 和 `<!-- commit: xxx -->` 锚点都是 `release.js` 正则认的。格式漂了会直接报错退出（宁可炸，也不要"差不多"地读出一份半截日志）
14. **`golden.js --only … --write` 会把基线覆盖成只剩那一关**；基线一律不带 `--only` 写，且只在确认差异是计划内之后才写
15. **在 `tools/build/` 下新建文件被 `.gitignore` 的 `build/` 吞掉**：用 `git add -f`
