# 工具链与测试

代码：`tools/smoke.js`（唯一的自动化测试）· `tools/release.js` + `CHANGELOG.md` + `js/changelog.js`（发版与更新日志）
· `tools/stamp-version.js` + `js/version.js`（版本戳）
· `tools/render-planform.js`（离线机库俯视图预览）· `tools/render-ships.js`（离线舰船外形预览）
· `tools/render-units.js`（离线单位 3D 预览）· `tools/shot-unitview.js`（无头 Chrome 截详情页布局）
· `tools/lib/raster.js`（几个预览器共用的光栅器 / Canvas 桩 / PNG 编码）
· `tools/probe-missions.js`（逐关验证胜利条件可达）· `tools/render-mounts.js`（离线 NPC 挂载预览）
· `tools/rename-aircraft.js`（一次性批量改名）

---

## 为什么这个项目会有 tools/

游戏本身**零依赖、无构建**——没有 `package.json`，没有 `node_modules`，
双击 `index.html` 就能玩。`tools/` 全是**开发期的旁路**，跑在 Node 里，
产物不参与游戏运行（唯二的例外是 `js/version.js` 与 `js/changelog.js`——
那两个是游戏真的要读的数据文件）。所以这里没有 npm script，
一律 `node tools/xxx.js`。改完代码唯一必须做的事是 `node tools/smoke.js`。

| 工具 | 一句话职责 | 什么时候跑 |
|---|---|---|
| `smoke.js` | 在无浏览器环境把整个游戏跑起来并断言 | **每次改完代码** |
| `probe-missions.js` | **逐关验证"清空敌人之后到底能不能赢"**，并检查 NPC 挂载问题 | 加了新关卡、改了胜负条件之后 |
| `probe-blast.js` | 每种空空弹按 straight / gentle / hard / jink / max / flare 六档机动各打 N 发，统计命中率、平均伤害（占 `dmg` 比例）、起爆距离，与 `probe-blast.baseline.json` 对比 | 改了近炸 / 爆炸半径 / 导引之后 |
| `release.js` | 按命令里给的版本号追加 `CHANGELOG.md` 草稿，生成 `js/changelog.js` 与 `js/version.js` | **每次发一个版本**（`node tools/release.js vX.Y.Z`） |
| `stamp-version.js` | 只把上一次提交写进 `js/version.js`（版本号从 `CHANGELOG.md` 顶部读） | **每次 `git commit` 之前** |
| `render-planform.js` | 把 `PLANFORM.draw()` 的输出落成 PNG | 改了机库俯视图数据/画法之后 |
| `render-ships.js` | 用真正的 `models.js` + `render.js` 把每艘舰船渲染成 PNG | 改了舰船模型之后 |
| `render-mounts.js` | 用真正的 `Ent.makeAircraft()` + `Game.__pushStores()` 把 NPC 的实体挂载渲染成 PNG | 改了挂载分配 / 挂点坐标之后 |
| `render-units.js` | 用单位详情页自己的 `renderModel()` 把 25 个单位渲染成 PNG | 改了 `unitview.js` 的渲染代码之后 |
| `shot-unitview.js` | 无头 Chrome 截详情页的**布局**（需要本机有 Chrome） | 改了详情页的 HTML 结构或 CSS 之后 |
| `lib/raster.js` | 供上面几个预览器共用的光栅器与 PNG 编码 | —（被 require） |
| `rename-aircraft.js` | 按表把旧机型编号全库替换成新编号 | 只在改命名规范时，一次性的 |

`lib/` 这一层的由来：`render-planform.js` 最初把光栅器和 PNG 编码内联在自己文件里，
舰船预览器需要同一套东西。**没有去动那个已经被验证过、能跑的旧工具** ——
新代码走 `require('./lib/raster')`，旧文件保持原样。两份实现的差异只有一处：
`lib/raster.js` 多了一个 `Raster.clear()`（预览器要铺底色，俯视图不需要）。

### `probe-missions.js` —— 冒烟测试抓不到的那一半

`smoke.js` 证明的是"**不崩**"：每关跑 30 秒、查 NaN、查挂载问题。
它证明不了"**这关能赢**" —— 胜负条件写错、目标算漏一个模型、
新关卡的敌人挂在 `team` 不对的阵营上，这些都能让一关永远赢不了，
而它照样安安稳稳跑满 30 秒。

探针的做法很直接：加载真沙箱 → `startMission(mi)` → 每 0.5 秒无条件清空
所有 `team === 1` 的飞机与设施（连带把玩家设成无敌，避免被"打下来"干扰）
→ 看 `mission.win()` 会不会在合理时间内变成 `true`。
（文件头注释写的是"每帧"，实际代码是 `f % 30 === 0`，即 60 FPS 下每 30 帧 = 0.5 秒清一次，
足够把新刷出来的增援 / 波次一并清掉；以代码为准。）

```
node tools/probe-missions.js
OK   0 m1   第一滴雨   OK     win@0.0s  lose@—  mount=0
...
OK  10 sk1  第四周    OK     win@34.5s lose@—  mount=0
```

三种判定：

- `UNREACHABLE`（清空敌人后仍然赢不了）：胜利条件里多了一个永远清不掉的东西
- `MOUNT`：`Ent.mountIssues` 非空 —— 某个机型挂着一件挂在它挂点上的弹，
  AI 会拿它开火。**`sk1` 的七种随机机型只有这个探针能覆盖**
  （`smoke.js` 的 240 帧跑在 m1，看不到随机战役的编成）
- `THROW`：跑的过程中抛异常

`win@34.5s` 这种数字本身就是有用的信息：`sk1` 要等六个批次全部投完，
所以"34.5 秒"说明随机战役的波次推进真的在走。

> **踩过一次**：探针第一版没触发 `window` 的 `load` 事件，`Game.init()`
> 根本没跑，主循环推进了 0 帧 —— 结果把 m2 与 sk1 报成"胜利条件不可达"。
> 假报错比不报更贵：它会让下一个人去改一处本来正确的胜负条件。
> 所以任何"跑一遍游戏"的工具都必须确认**主循环真的在转**
> （`timeLeft` 在减少、或某一关的 `win` 花了非零帧数）。

### `probe-blast.js` —— 近炸与溅射的分布

靶机按脚本运动（不走 AI），新旧版本跑的是同一组交战。基线 `tools/probe-blast.baseline.json`
是 v1.13 改动前存的，`dmg` 记为武器 `dmg` 的比例，便于跨弹比较。

```
node tools/probe-blast.js              跑一遍并和基线对比
node tools/probe-blast.js --save       存为新基线
node tools/probe-blast.js --n 80       每档发数（默认 120）
node tools/probe-blast.js --only srm   只跑一种弹
node tools/probe-blast.js --flare      投弹时机实验：srm 来袭，3000 / 1000 / 300 / 100 m 各投一组干扰弹
```

`--flare` 的期望：早投 ≈ 0 伤害、贴脸投 > 0、随距离单调（诱饵起爆的溅射）。

---

## tools/smoke.js

### 怎么运行

```bash
node tools/smoke.js
```

没有参数、没有环境变量、没有 watch 模式。它读 `index.html`、读 `js/*.js`，
在内存里造一个假浏览器，然后从零跑到任务里。

### 输出格式与退出码

```text
== 加载脚本 ==
  OK    16 个脚本全部加载，无语法/求值异常
== 初始化 ==
[季风线] 自检通过：模块与数据引用全部一致。
  OK    开机自检通过：模块与数据引用一致
  FAIL  主循环抛出异常 —— xxx is not a function

✓ 冒烟测试全部通过          ← 或 →  ✗ 冒烟测试失败：N 项
```

分组之间用 `== 组名 ==` 分隔，每条断言行两格缩进。**`OK`**（绿）只打印，
**`FAIL`**（红）既打印又进 `problems` 数组。**退出码只有两个**：
`0` = 全部通过，`1` = 至少一条 FAIL。当前版本全绿时共打印 107 行 `OK`（数字随断言增减而变，只作参考）。

```js
const problems = [];
function fail(msg) { problems.push(msg); console.log('  \x1b[31mFAIL\x1b[0m  ' + msg); }
function ok(msg) { console.log('  \x1b[32mOK\x1b[0m    ' + msg); }
```

**`fail()` 不中断**：后面的断言照跑，所以一次失败的输出里可能有几十条 FAIL，
**第一条才是根因**，后面多半是"对象是 undefined，后续读取全炸"的次生现象。

**"诊断"也算输出**：有些分组不打断言，只用 `ok()` 把当时数值打出来给人看
（`诊断 M2 目标…`、`诊断 玩家钉在 20500m…`、`诊断 有目标 12600 · 进射程 0…`）。
它们不带 FAIL 也**不代表通过**——看到 `进射程 0 · 进锥 0 · 实开火 0` 这种数字，
得自己判断是不是退化。

### 测试框架是怎么搭的

没有测试框架。整个"框架"就是四个手写桩 + 一个 `vm` sandbox。

#### 最小 DOM（`smoke.js` 的 `makeEl()` 及其周边）

`makeEl()` 返回普通对象，有 `children` / `classList` / `addEventListener` /
`fire(type)` / `setAttribute` / `getBoundingClientRect`。关键几点：

- **元素注册表来自 `index.html` 的正则扫描**，不是 DOM 解析：`<section id="scr-xxx">`
  建屏幕元素（`class` 拆进 `__cls`），其余 `id="..."` 建 `div`，`data-go` /
  `data-ptab` 建按钮（合成 id `go_<n>` / `ptab_<n>`）
- **`querySelectorAll` 只认识三个选择器**：`.screen` / `[data-go]` / `[data-ptab]`；
  查别的选择器一律得到 `[]`——这是桩的边界，不是 bug
- **重复 id 会立刻 FAIL**（`makeEl` 里查 `byId`）：`index.html 出现重复 id：xxx`
- **`innerHTML` 的 setter 必须清空 `children`**（`makeEl()` 里的 `innerHTML` setter）。只改字符串属性
  的话，反复构建（每次进机库）会让子元素越积越多，测出来是"8 行应该是 4 行"
  这种**假故障**——踩过一次，注释就留在那儿了
- `fire('click')` 同时调 `addEventListener` 注册的回调和 `el.onclick`

#### Canvas 与 WebAudio（`smoke.js` 的 `ctx2d()` / `audioParam()` / `audioNode()`）

`ctx2d()` 返回 `Proxy`：未知属性一律返回 `() => {}`，所有绘制调用都是静默空操作
（例外：`canvas` 属性、`measureText`、两个 `create*Gradient`）。
`audioNode()` 同理，`frequency` / `gain` / `Q` / `detune` 自动生成带 `value`
与四个空 ramp 方法的 `audioParam()`；`FakeAudioContext` 提供
`createGain/Oscillator/BiquadFilter/BufferSource/Buffer`。

**Canvas 桩不画任何像素，但可以挂勾子观测**——HUD 颜色、锁定框大小、
海天分界高度都是这么"看"出来的：把 `ctx.strokeRect` / `ctx.fillRect` 换成
记账后再转发给原函数的包装即可。音频桩只保证合成路径不抛异常，
**不验证声音好不好听**。

#### 脚本加载顺序只有一个权威来源（`smoke.js` 的 `ORDER`）

```js
const ORDER = [...htmlSrc.matchAll(/<script\s+src="js\/([a-zA-Z0-9_]+)\.js"><\/script>/g)]
  .map(m => m[1]);
```

然后 `for (const name of ORDER)` 逐个 `vm.runInContext`。

**这是这份测试里最重要的一个决定。** `index.html` 是加载顺序的**唯一权威来源**，
测试不维护第二份清单——手工维护过一次，新加模块时漏掉了，结果**测试反而先炸了**
（引用一个还没加载的全局）。推论：

- 加模块只需在 `index.html` 底部加一行 `<script src="js/新模块.js"></script>`，
  smoke.js 自动跟上
- 脚本名必须匹配 `[a-zA-Z0-9_]+`，路径必须是 `js/<名字>.js`
- `render-planform.js:293-294` 用**同一个正则**解析同一份 `index.html`——
  两份工具、一个来源

#### sandbox 里暴露了哪些全局（`smoke.js` 的 `windowStub` / `const sandbox`）

`const sandbox = windowStub;` 然后 `vm.createContext(sandbox)`。
因为 sandbox **就是**那个 window 桩对象：

- 脚本里所有顶层 `var` / `function` 都落在 sandbox 上，测试因此能直接读到
  `sandbox.M3`、`sandbox.Ent`、`sandbox.Game`、`sandbox.Renderer`、`sandbox.WEAPONS`、
  `sandbox.AIRCRAFT`、`sandbox.MISSIONS`、`sandbox.CODEX`、`sandbox.canCarry`、
  `sandbox.loadoutPenalty`、`sandbox.STORE_COOLDOWN` 等
- 反向也成立：测试**直接改** `WEAPONS.v30.seeker`、**包装** `Ent.stepAircraft` /
  `Renderer.pushModel` / `Renderer.setCamera`，用完还回去。这是最常用的观测手法

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

**`Game.__player()` / `Game.__world()` 是生产代码里的**（`js/game.js:2671-2672`），
测试直接用。`Game.__fireSpecial` **不存在**——所以发射一律走真实链路：
取 `docListeners['keydown']` 里的回调，发 `{ code: 'Enter' }`。

#### 假时钟与 pump()（`smoke.js` 的 `function pump`）

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
**为什么必须是假时钟**：原来每次 `pump` 都传 `Date.now()`，连续调 `pump(1)` 时
时间戳几乎不变，于是 `dt ≈ 0`、飞机不动——**卡死检测因此误报过**。

### 它覆盖了哪些方面

下表按源码里的实际分组列出。括号内是该分组的**源码标记**——带 `==` 的是
`console.log('\n== 组名 ==')` 打的章节标题，其余是分组注释
`/* ---- 首句 … */`。**用它在 `tools/smoke.js` 里搜就知道对应哪段代码**
（行号会随改动漂移，标记不会）：

| 分组 | 在防什么回归 |
|---|---|
| `== 加载脚本 ==` | 16 个脚本按 `index.html` 顺序求值，任何语法错/顶层求值异常 |
| `== 初始化 ==` | `Game.init()` 抛异常；`preflight()` 的红条；初始屏幕必须是 `scr-title` |
| `== 导航 ==` + `== 完整流程 ==` | 八个 `data-go` 在 `game.js` 里都要有 `go === '...'` 分支，且点击后 `.active` 真的换到目标 `scr-*`；再从 title 走一遍 brief → hangar（导航失效过一次：flex item 缺 `min-height` 把 footer 顶出视口） |
| `== 更新记录 ==` | `js/changelog.js` 必须与 `CHANGELOG.md` **逐字段相等**（忘了跑 `release.js` 的拦网）；版本号格式 `vX.Y.Z`、日期格式、`<!-- commit: -->` 锚点、每版至少一条改动、版本号严格递减、`CHANGELOG.current` 与 `js/version.js` 的版本号一致；页面上画出的条目数 = 版本数，且每个版本号都出现在 HTML 里 |
| `== 任务与主循环 ==` + 卡死检测：不能有飞机长时间停在原地 | `startMission(0)` 成功 + 推进 240 帧不抛异常；再让全部关卡各跑 900 帧，查 NaN、飞机连续静止 > 60 帧、同一帧同一对象出现两次、`world.actors` 重复条目（FAIL 时打出一整串现场） |
| `== 挂载系统 ==` | 每件武器有 `fits`/`perPoint`/`mass`；可发射武器有 `speed`/`life`；`STORE_COOLDOWN` 全覆盖；制导武器有 `lead`；挂点组是偶数点且有弹可挂；玩家出击后有 `loadoutList`/`ammoPool` 且"齐射数 = 挂点数" |
| `== 干扰与机动 ==` | 红外/雷达弹对干扰弹的失锁率贴住 `w.flare`（含"雷达弹也吃箔丝"）；`AI.steerTo` 三条基本控制律（前下方推杆、前上方拉杆、正侧方滚转） |
| 机库的选装面板 + 挂载的机体能力门槛 + 挂载性能系数 + 六维条必须随挂载变化 | `#hpPicker` 生成的 `pk-card` 每张都有定位行与简介、`#hpList` 行数 = 挂点组数；默认配置合法、能力门槛不形同虚设（制空机挂不了重型巡航弹）；满载时加速惩罚最重、滚转最轻、失速速度升高；六维条必须随挂载变化（点卡片要真的变） |
| 追尾镜头必须真的落到渲染器上 + 追尾镜头：稳定水平 + 俯仰限位 + 诊断：海面填充高度随海拔的变化 | **一帧内只能有一次 `setCamera` 调用**（防分支写错导致追尾镜头被覆盖）；地平线稳定、俯仰钳在 89°、扫限位/穿越极点/持续垂直都不抽动、正交基余量够；海天分界随海拔**单调下沉**（0.5 / 2 / 8 km 三点，防地球曲率项失效） |
| 轰炸机：沿航线飞、到点投弹、不参与空战 + 无人僚机：授权开火 + 长机阵亡后盘旋 | M2 的 2 架轰炸机沿航线飞、到点投弹伤基地、投弹后转 `egress`、不自己选目标、不开加力，基地被摧毁即判负；无人僚机长机不锁定则不许找目标、锁定后继承同一目标、长机阵亡后盘旋且不逼近敌人、编队不脱队 |
| 鼠标幅度 → 转向方式：全程插值，没有切换点 + 真实游戏里：鼠标略微朝正下方必须是推杆 | 滚转占比随鼠标幅度单调上升、俯仰不跳变，"中心推杆"只在机体相对镜头正着飞时成立；完整链路 mousemove → updateAim → steerTo → ctrl 下，柔和朝正下方必须推杆且不带滚转、峰值要够深、推到底要退场 |
| 两组挂架挂同一种武器 + 挂架上的实物 + 储备打光后，挂架不再恢复 + 齐射 + 发射槽 | 两组挂同一种武器时槽下标不撞（数 `pushModel` 调用次数）；打空全部槽后模型数必须变少；储备打光后槽不再恢复；按一次出 `w.salvo` 枚且共用冷却槽；槽数 = 挂点数，连按只能出"槽数"枚 |
| SPO-8 追云 + CLA-9 已并入 CLA-17 + "有没有发动机"和"有没有导引头"是两个正交的维度 + 两架高空机的性格必须真的分开 | SPO-8 去掉对地门槛且制空/截击机挂得上；CLA-9 并入 CLA-17 且继承射程速度；动力与制导两个维度正交（7 件对地弹 4 种组合）；D-14 与 F-9 的性格必须在物理上真的分开 |
| ① 被动吊舱的加成字段必须在顶层 + ② 机炮射程必须真的驱动子弹寿命 + ③ DEW 充能必须按 recharge 计时 | 加成写成 `passiveEffect: {...}` 会静默失效；`fireGun` 不能把子弹寿命写死，否则 `range`/`highRange` 全是假值；DEW 不能拦掉一发就立刻补满 |
| 切枪不该丢掉锁定 + 切换挂载（切枪不跳装填） | 按 R 切武器不许清掉 `lockProgress`；按一圈 R 回到起点，且不许把装填时间清零（那等于无冷却连射） |
| 无制导弹必须是"真·无动力" + 无制导火箭：无目标也能打 | 不许留任何制导字段、必须真的受重力（水平投放 1 秒要下坠）；无锁定也能投放，且飞出去后航向绝不能变 |
| 武器打错目标时必须拒绝发射 + 端到端：打错目标会被拒绝，打对了能命中 | 对空弹 `target` 必须是 `air`、对地弹不能是 `air`；带对空弹锁海面设施必须 0 枚出膛，无制导炸弹必须真能炸到设施 |
| HUD：敌方标记一律红色 + HUD：引擎出力条与油门轴一致 | 地面标记不许用灰蓝（会和说明文字混）；锁定大框出现时基础小框仍在；引擎出力条必须跟油门轴一致 |
| 激光制导机制（休眠中）+ PEJ-30 现在是光电制导 + 端到端：激光制导炸弹的完整使用流程 | 休眠中的激光制导仍可跑（临时借 `v30` 改成 `laser`，验完还回去）；PEJ-30 光电制导：有 `turn`、有 `ballistic`、无 `boost`、`flare` 必须**显式写 0**；端到端验锁定→投放→保持照射 |
| 诊断：第二关的地面目标能不能被锁定 + 诊断：AI 追到极高空会不会卡住 + 诊断：AI 到底用不用机炮 | 这三条是**诊断**：连按 F 看锁定落到谁身上、玩家钉在 20500 m 时敌机是否停到 q < 8000 或失速的高度、AI 到底用不用机炮。只打数值、不判定，要看数字自己判断 |
| ① 每个任务各跑 30 秒 + ② 每个机型各飞 10 秒 + ③ 每件能发射的武器各打一发 | 综合压力测试：三个维度都跑一遍，抓抛异常与数值崩坏（NaN） |
| 命名体系（设定集 8.1）+ 敌机的呼号与型号不能混为一谈 | 机型必须是「两字母 rafsi - 序号」且前缀在登记表、武器必须是「三字母 rafsi - 序号」且词根在 `RAFSI` 表；敌机 `label` 要「中文 + 英文代号」、`name` 不许漏出 ` xxx 3` 这种内部下标 |
| 资料库：动态生成的图鉴必须能跑 + 导弹急转应当掉速 | `CODEX` 里 `build()` 动态条目必须能生成且够长；导弹急转必须掉速（0.5 s 至少 15 m/s），否则躲导弹在物理上不可能 |
| 调节单元：每一关头顶都有，不锁任何武器，误击只记一次 | 每关 `w.cells` 9–60 个（10 km 间距）、17.5–21.5 km、`team 2` + `friendlyAsset`、都在 `targets` 里；ROE 残余（判据函数、`world.roeBlocked`）不许回来；玩家打掉一个单元 `friendlyLoss` 只 +1；m5 的 MERLI 有 `route.wps`、守得住巡视高度、150 s 内到第一个编组；资料库 `s4` 有 `mount()` 且不抛异常 |
| 告警栈：按优先级排、永不重叠 | 全部告警同时打开：顺序等于 `HUD.ALERT_ORDER`、导弹逼近在最上、失速在动压前、相邻两行的 y 差不小于上一行的行高 |
| `范围伤害与近炸`（v1.13） | 衰减边界、同队豁免、撞地与寿命到期起爆、子母弹不伤飞机、最近点近炸、诱饵起爆、特效尺寸与粒子预算 |
| F 键选目标 | 屏幕内锁离瞄准环最近的、1.5 s 内连按换第二近、屏幕内为空时锁最近的屏幕外目标 |

### 怎么写一条新断言

照抄这个骨架，插到**同主题分组的花括号里**（别插在
`if (Ent && M3 && me && world)` 之外，那个 `else` 会直接 FAIL 一条"拿不到 Ent / world"）：

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

- **用 `bad.push()` + 末尾 `if (bad.length)...else ok(...)`**：一次能报多条，
  成功时只留一行 OK，且 **OK 行要带实测数值**方便肉眼对比
- **消息里必须带数值**，格式 `期望 vs 实际`。写"锁定框不对"不如写
  `锁定后基础小框消失了 —— 目标的身份和距离读不到了`
- **断言要打在最后生效的结果上**。追尾镜头那组就是教训：只复现 `camMode===0`
  的计算过程拦不住"算完之后被另一条分支覆盖"，所以改成包装 `Renderer.setCamera`
  数调用次数
- **改过的状态要还回去**：`Ent.stepAircraft`、`Renderer.pushModel`、
  `WEAPONS.v30.seeker`、玩家的 `special`/`spAmmo`/`slotCd` 都属于"借了要还"，
  不还的话后面的分组会测出互相污染的结果
- **别用 `Date.now()` 造时间**，用 `pump()` 推进；只想看数值不想断言，
  就 `ok('诊断 ...')` 并把当时的现场带进消息

### 测试的边界：它抓不住什么

| 抓不住 | 为什么 | 改完要另外做什么 |
|---|---|---|
| **纯视觉风格 / 像素级效果** | Canvas 桩是空操作 Proxy，只对显式挂勾子的几个调用（`fillRect` / `strokeRect`）有效；没有真实光栅化，`addColorStop` 是空函数 | 用 `render-planform.js` 出 PNG，或在浏览器里肉眼确认 |
| **真实浏览器行为 / 布局 / 响应式** | 没有 CSS 布局、没有 `flex`、没有真实视口，`getBoundingClientRect` 恒返回 1280×720 左上角 | 手动缩窗口看。导航那次失效（`min-height`）就是布局问题，测试当时拦不住 |
| **键盘/鼠标的浏览器语义** | 事件是 `fire()` 直接调回调，没有冒泡、没有 `preventDefault` 的真实效果 | — |
| **音频好不好听 / 性能与帧率** | 音频只验调用不抛异常；`fill()` 不耗时，`pump(60)` 不代表真实 60 帧 | 用耳朵；在浏览器里看帧率（瓶颈是 `fill()` 调用次数，见 [rendering.md](rendering.md#性能)） |
| **纯文案正确性 / 白名单外的 `querySelectorAll`** | 只检查个别格式（呼号、编号），不读语义；桩只认识 `.screen` / `[data-go]` / `[data-ptab]`，别的返回 `[]`（通常静默跳过而不是失败） | 人工读；别指望它 |

**结论**：smoke.js 是"逻辑回归网"，不是"验收"。改了画风、布局、手感，
必须另外肉眼过一遍——这正是 `render-planform.js` 存在的原因。

---

## 版本戳机制

### 为什么 `js/version.js` 是自动生成的

它**只有 10 行**，第一行就写着"自动生成——不要手改"。它是 `tools/release.js`
从 git 记录里写出来的（`tools/stamp-version.js` 调的也是同一个函数）：

```js
var BUILD_STAMP = {
  version: "v1.0.0",                 // CHANGELOG.md 顶部那条的版本号
  time: '2026-10-15 20:24',          // 本地可读时间
  iso:  '2026-10-15T20:24:10+09:00', // git 的 %cI
  hash: '09c3686',                   // 短哈希
  subject: "舰船与飞机不再共用命名：上游改用鲸，下游改用化石"
};
```

字段全部来自 `git log -1`（`%cI` / `%h` / `%s`），时间转成本地 `YYYY-MM-DD HH:MM`。
`version` 是唯一的例外 —— 它来自 `CHANGELOG.md`，不是 git。

**为什么必须生成而不能运行时算**：本项目没有构建步骤，页面是静态托管的，
运行时拿不到 git 信息。也**不能用 `document.lastModified`**——那取的是 HTML 的
响应头，托管方有时给一个与内容无关的时间，而且在**缓存命中时不更新**，
恰恰在最需要它的时候失效。

### 谁来生成、什么时候必须重新生成

两种跑法，产物是同一个文件：

```bash
node tools/release.js vX.Y.Z  # 发版（版本号手动指定）：追加 CHANGELOG.md + 刷新两个生成物
node tools/release.js         # 不发版，只刷新两个生成物
node tools/stamp-version.js   # 只刷时间戳（版本号仍从 CHANGELOG.md 顶部读）
```

**每次 `git commit` 之前跑一遍 `stamp-version.js`。** 输出形如
`js/version.js 已更新` + 版本 + 时间 + 短哈希与提交标题。
不在 git 仓库里时它打印 `读不到 git 记录（可能不在仓库里），跳过` 并退出。

**注意一个细节**：脚本取的是**最后一次提交**的信息。你在提交 A 之后、提交 B 之前
跑它，生成的 `version.js` 里记的是 A，而这个文件本身会被写进 B。所以页面上显示的
是"这次的代码基于哪个已提交状态"——它有意的口径是**上一版**，而不是工作区里的这一版。

### 标题页右上角那个版本戳的用途

`index.html` 里标题屏有个 `<div id="verStamp" class="ver-stamp">`。
`Game.init()` 里 `stampVersion()`（`js/game.js` 内，`init()` 之前）往它填
`BUILD v1.0.0 · 2026-10-15 20:24` 加一行 `09c3686　舰船与飞机不再共用命名…`。

（它以前在左上角，和开机自检那几行 `.boot` 叠着印；加上版本号之后第一行变长，
重叠更明显，所以搬到了右上角。）

**用途只有一个：确认部署的到底是哪一版。** 浏览器缓存、托管方的重建延迟、
推送失败——这三件事从画面上完全看不出来，但时间戳变了就说明新的 commit
确实上线了。文件缺失或 `BUILD_STAMP` 未定义时**静默降级**成 `BUILD 开发版`，
不影响游戏本身（开发中直接开 `index.html` 就是这个样子）。

---

## tools/release.js：发版与更新日志

### 解决什么问题

玩家应该看得到"这游戏更新过什么"，但浏览器里没有 Markdown 解析器，
而为了这一屏装一个（哪怕最小的）都违反"零依赖"这条底线。

所以日志写两遍：**`CHANGELOG.md` 给人读，`js/changelog.js` 给游戏读**，
中间的转换交给 `release.js`。两边都是纯数据，界面（`buildChangelog()`）
只负责画。详见 [DESIGN.md 6.9](../DESIGN.md#69-为什么更新日志要生成两次)。

### 版本号怎么定

每个版本条目末尾带一个锚点：

```markdown
## [v1.0.0] 2026-10-15 · 正式发布
<!-- commit: 09c3686 -->
```

**版本号由人在命令里给**：`node tools/release.js v1.11.0`（`v` 可省略）。
`release.js` 读最上面那条的版本号与锚点，检查新版本号格式正确、比当前版本大，
再用 `git log <锚点>..HEAD` 取新提交，按前缀分成「新增 / 调整 / 修复 / 文档」草稿。
加 `--dry` 只预览不落盘；不带版本号只刷新两个生成物、不发版。
（以前按提交前缀自动判大 / 中 / 小版本，已取消 —— 前缀衡量不了"对玩家算多大"。）
流程全文在 [VERSIONING.md](../VERSIONING.md)。

### 为什么不做成全自动

工具只会把提交信息搬过去，**它写不出人话**：`feat: 新增战役选择层` 是提交，
`v0.4.0 · 世界观与命名重整` 才是玩家要读的东西。一次改动往往拆成五六个提交
（"加功能" → "修它" → "再修它" → "补文档"），玩家不需要看你的返工过程。

所以分工是：**工具管机械的**（版本号、锚点、格式、生成文件），
**人管那一句话**（合并同类项、改成标题）。生成的条目里会插一条
`<!-- TODO: 合并同类项… -->`，看到它就说明还没润色。

### 谁来保证生成物没忘

`tools/smoke.js` 里加了一条硬断言：把 `CHANGELOG.md` 现场解析一遍，
和要求 `js/changelog.js` 逐字段相等。忘了跑 `release.js` 会在测试里炸，
而不是在玩家屏幕上显示一份过期的日志。

---

## tools/render-planform.js

### 解决什么问题

**"画风"光看代码判断不了，而开发机上没有浏览器。** 所以它实现了一个最小
Canvas 2D 子集 + 光栅器 + PNG 编码器，直接把 `PLANFORM.draw()` 的输出落成图片。
它加载的是**真正的 `js/planform.js`**，用的是同一份绘制代码——预览和游戏里
看到的完全一致（同数据、同绘制函数、同底板色 `#070d12`）。

### 怎么用

```bash
node tools/render-planform.js
```

不用参数，输出到 `tools/preview/`，命名 `机型ID-挂载.png`：

- `<id>-default.png` —— `ac.defaultLoadout`；`<id>-clean.png` —— 空挂载
- `<id>-<武器键>.png` —— 把该武器**装满所有挂得下的挂点组**（`fillWith()`），
  并高亮第一个挂点组；枪不算、挂不上就跳过

尺寸固定 640×440，每张图是独立 `Raster`。

### 实现要点与限制

- **它同样从 `index.html` 解析脚本名**（同一个正则），但只按顺序加载
  `math3d` → `data` → `planform` → `models`。顺序不能乱：`planform.js`
  依赖 `data.js` 里的 `WEAPONS`
- 光栅器：`line()` 用点到线段距离做抗锯齿并支持虚线段；`poly()` 是扫描线 +
  奇偶规则 + 4 倍纵向超采样。**支持** `stroke` / `fill` / `fillRect` / `strokeRect` /
  `moveTo` / `lineTo` / `closePath` / `rect` / `arc` / `ellipse` / `quadraticCurveTo` /
  `setLineDash` / `save` / `restore` / `#rrggbb` 与 `rgb[a]()` 颜色
- **不支持**（空函数，静默）：`translate` / `rotate` / `scale` / `setTransform` /
  `transform` / `fillText` / `strokeText` / `bezierCurveTo` / 渐变 / `shadow*` /
  `clearRect`。**如果哪天 `planform.js` 开始用 `translate`/`rotate` 画图，
  预览会静默画错（图堆在原点）而不报错**——加变换时要么同时补桩，要么换办法
- `getContext()` 每次调用返回**新的 ctx**，路径状态不共享，绘制函数必须只取一次

---

## tools/render-ships.js

### 解决什么问题

和 `render-planform.js` 同一个理由（没有浏览器、"这条船看起来像不像船"
是代码看不出来的），但走的是**另一条路**：它不是调用某个 2D 绘制函数，
而是直接把 `MODELS` 里的三维几何喂给**游戏自己的渲染管线**。

```
加载 js/math3d.js → js/models.js → js/data.js → js/render.js
      ↓
Renderer.init(桩 canvas) → setCamera() → pushModel(model) → flush()
```

所以它验证的不只是"模型数据能不能算"，而是**投影、光照、画家算法排序
和配色在实机上到底是什么样子** —— 包括 `render.js` 里那些只在特定条件下
才触发的分支（近平面裁剪、面积剔除、`f.d < 900` 时的细描边）。

### 怎么用

```bash
node tools/render-ships.js
```

不用参数，输出到 `tools/preview/`：

- `ship-<id>.png` —— 每艘一条，640×380，从右前上方 3/4 视角，
  相机距离按模型尺寸自适应（`frameCamera()`）
- `ship-lineup.png` —— 全部 11 艘**同一个 scale** 分三行排列，1200×640，
  按满载吨位降序。这是"相对尺寸对照图"

### 实现要点与限制

- **`begin()` 画完之后要再 `ras.clear()` 一次**。`Renderer.begin()` 会调
  `drawSky` / `drawClouds` / `drawGround`，那是给"从空中俯瞰"准备的画面；
  预览里要的是纯色底，所以把背景涂掉再 `pushModel`。这一步不能省 ——
  否则预览图里的船会浮在天空渐变上
- **总览图每行单独渲染再上下拼接**。塞进同一个相机时，三行只能靠深度差
  分开，而在接近侧视的角度下深度差几乎完全投影不掉：实测三行会重叠
  成一行。拼接时所有行共用同一个 `scale`，这是"对照"成立的前提
- **总览图的 `px` 必须取负**。相机在 +z 看向原点时
  `right = up × fwd = (-1,0,0)`，也就是屏幕右 = 世界 -x；不取负的话
  吨位最大的船会排到最右边
- 透视用**小 FOV + 按比例拉远**（`FOV = 26`、距离再乘 `MARGIN = 1.35`）。
  一条 210 米的船如果近距广角拍，艏部会被放大到框外
- **共用 `tools/lib/raster.js`**（光栅器 / Canvas 桩 / PNG 编码）。
  Canvas 桩的能力边界与 `render-planform.js` 完全相同 ——
  `translate` / `rotate` / `setTransform` / 文字 / 真实渐变都是空实现。
  舰船预览只用到 `fill` / `stroke` / `fillRect` / `arc` / `ellipse`，
  都在支持范围内
- **它不写任何断言**，只是把图落盘。看的人负责判断"像不像"——
  这是这类工具的共同性质，别指望 CI 能替你判断画风

---

## tools/render-mounts.js

### 解决什么问题

"挂架上的实物"是**画出来的**东西。冒烟测试能数清"画了几件"
（`Game.__pushStores` 推了几个 `scale: 0.85` 的模型），但数不出
"看起来是不是挂在翼下、机腹的吊舱有没有穿进机身、打光之后是不是真的干净"。
这个工具把那几个有代表性的配置落成 PNG。

它的价值在于**一行挂载逻辑都不重写**：

```
Ent.makeAircraft()   ← 真造一架（含 NPC 的弹药池 / 发射槽 / 挂载分配）
Game.__pushStores()  ← 真的那条渲染路径（与实机同一份代码）
js/render.js         ← 真的投影 / 光照 / 画家算法
```

所以图上看到的就是实机上看到的。它加载**全部**脚本（清单与顺序读
`index.html`），因为 `Game.__pushStores` 在 `game.js` 里；`Game.init()`
没有被调用（`window.addEventListener` 是空实现），所以那个 IIFE 只是被加载。

### 怎么用

```bash
node tools/render-mounts.js
```

不用参数，输出 `tools/preview/mount-<机型>-<配置>.png`，620×360，
右前上方 3/4（与图鉴详情页同一套角度）。十二个配置各自针对一条规则：

| 图 | 验证什么 |
|---|---|
| `mount-schist-dl6` | 制式弹按挂点逐点画出（4 件） |
| `mount-schist-dl6-dry` | 弹药池清零后机翼真的变干净 |
| `mount-basalt-dl4-vzu` | 任务写定的吊舱与制式弹共存（吊舱占外侧、导弹占重挂点） |
| `mount-schist-dl6-vzu` | 同上，另一型 |
| `mount-spray-vbn-vzu` | 吊舱进机腹、制式弹不被挤掉（正序占位会在这里翻车） |
| `mount-sandstone-vbn` | 储备 2 发 < 挂点 4 个时，多出来的挂点出厂就是空的 |
| `mount-lodestone-vsc` | 只有机腹挂点的干扰机把吊舱挂在机腹 |
| `mount-pelican-dl6` | 适配表拦住"预警机挂格斗弹"（一件都不该有） |
| `mount-folded_wing-v9` | 僚机 |
| `mount-lodestone-vsc-belly` · `mount-spray-vbn-vzu-belly` · `mount-schist-dl6-belly` | 同一批配置从**下**往上看（机腹挂载只有这个角度看得见） |

### 实现要点与限制

- **数出来的件数是给终端看的**，它和图本身是两条独立的证据：
  件数不对说明规则错了，图画得丑说明坐标或比例错了
- 相机取景是**这个工具唯一自己写的部分**（`frameCamera()`，按模型包围盒
  自适应距离）。挂载高度不在这里，它属于 `Ent.storePos()`
- `Renderer.begin()` 之后要再 `ras.clear()` 一次，理由同 `render-ships.js`
- 不支持玩家（`Game.init()` 没跑，`player` 是 null）。玩家的挂载本来就
  在机库里能看见，更需要肉眼确认的是敌我 NPC 那几型
- **吊舱不再借用导弹的外壳**：`data.js` 里 9 件吊舱（`vzu` `vsc` `e4` `l2`
  `ecm2` `dec` `oep` `irp` `hdp`）的 `model` 都是 `'pod'`。在这之前它们
  全用 `'missile'`（`e4` / `l2` 甚至没写 model，靠 `|| MODELS.missile` 兜底），
  "这架带了干扰吊舱"在画面上读不出来 —— 两张预览图曾经**字节相同**
- **机腹挂载要单独从下往上看**：3/4 俯视角度看不见机腹，所以那几型
  （GAL-44 干扰机、浪花）额外出一张 `el` 为负的图。这不是额外的配置，
  是同一个配置换了个仰角

---

## tools/render-units.js 与 tools/shot-unitview.js

这两个是**单位详情页**的验证工具。为什么要两个：详情页有两件事要肉眼确认，
而它们需要的环境完全不同。

| | `render-units.js` | `shot-unitview.js` |
|---|---|---|
| 验证什么 | **模型**画得对不对（旋转预览的画面） | **布局**对不对（左右分栏、参数表、字号） |
| 靠什么 | 离屏 canvas + `lib/raster.js`（纯 node） | 真的无头 Chrome |
| 看到的 | 3D 预览那一个矩形 | 整页 |
| 依赖 | 无 | 本机装了 Chrome / Edge（或设 `CHROME_PATH`） |
| 输出 | `tools/preview/unit-<air\|ship>-<id>.png`（25 张） | `tools/preview/shot-unit-<id>.png`（默认 4 张） |

### render-units.js

```bash
node tools/render-units.js
```

它直接调 `UnitView.renderModel(cvs, model, yaw, pitch)` —— 就是详情页里那个
函数的本体，所以**它验证的是那一份独立渲染代码**（见
[unitview.md](unitview.md#关键决策为什么不复用-renderjs-的-renderer)，
它和 `render.js` 是两份实现，不能靠 `render-ships.js` 替代验证）。

### shot-unitview.js

```bash
node tools/shot-unitview.js              # 默认四个：有/无俯视图的飞机各一 + 两种舰船
node tools/shot-unitview.js ship:bluewhale   # 指定单位（ship: 前缀表示舰船）
```

它生成一个**最小页面**：只加载详情页需要的 7 个模块，刻意**不加载 `game.js`**
（那个文件在 `load` 时会启动整个游戏），再把 `UnitView.html()` 的结果插进去。

Chromium 的参数里有两个是必须的：

- `--virtual-time-budget=4000` —— 让页面先"跑"几秒。3D 预览靠
  `requestAnimationFrame` 出第一帧，不等就截到一张空画布
- `--window-size=1400,1050` —— 详情页是左右分栏 + 下方长参数表，
  窗口太窄会把右栏挤成一列，看不出真实比例

**它找不到 Chrome 就直接报错退出**，不会生成一堆空壳页面 —— 后者最难查。

---

## tools/rename-aircraft.js

### 用途

按一张**旧编号 → 新编号**的对照表，把全库机型编号精确整串替换。
只在"改命名规范"时用，一次性的。命名规范写在脚本头部注释里（设定集 8.1）：
上游按用途前缀（`D-` 战斗 / `DB-` 舰载战斗 / `F-` 截击 / `G-` 攻击 / `KA-`），
下游按设计局前缀（`ROK-` / `GAL-` / `VAC-`），分水群岛国用商品名
（`XA-8` → `潮线`），管理局用批次名（`ME-2` → `水准`）。

### 怎么用

```bash
node tools/rename-aircraft.js
```

无参数、**无 dry-run**、**直接原地写文件**。跑完打印每个被改文件的替换次数与合计
（形如 `js/data.js  替换 7 处` / `合计 10 处`）。`FILES` 清单是硬编码的 14 个路径：
六个 `js/*.js`（`data` / `models` / `planform` / `codex` / `missions` / `game`）、
`docs/` 下的七份（`world/SETTING.md`、四份 `systems/*.md`、`DESIGN.md`、`README.md`）、
以及根 `README.md`。`PLANES` 数组是唯一的对照表。

### 为什么这么做

```js
const re = new RegExp('(?<![A-Za-z0-9])' + a.replace('-', '\\-') + '(?![0-9])', 'g');
```

**只做精确整串替换**，两侧用环视卡住"不能是字母数字 / 不能紧跟数字"——
避免 `DA-1` 误伤 `DA-11`、`DA-14` 这类更长的编号。对照表里同时保留了
**早先的中间命名**（`BL-11`、`GA-14`、`MI-21`、`SU-33`、`RO-27`），
所以它能一次跑完从最初到当前的所有历史命名。

**注意**：`FILES` 里**没有** `tools/*.js`，也没有 `docs/systems/` 下的新文件。
改了编号之后要自己检查这两处。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 测试推进多少帧 / 假时钟步长 | `pump(N)`（1 秒 = 60 帧）；`pump` 里的 `fakeClock += 16`（毫秒） |
| 卡死判定阈值 / "算静止"的帧间位移 | 卡死检测里的 `t.max > 60` 与 `d < 0.02`（米） |
| 干扰成功率容差 | `±0.05`（1500 次采样）/ `±0.045`（1200 次采样） |
| 追尾镜头俯仰限位 | 追尾镜头那组的 `CAM_PITCH_LIM = 89 * Math.PI / 180`（复现自 `updateCamera`） |
| 压力测试时长 | 每关 1800 帧、每机型 600 帧、每武器 400 帧 |
| 预览图尺寸 / 输出目录 / 底板色 | `render-planform.js` 顶部 `W`/`H`、`OUT`（`tools/preview/`）、`BG` |
| 挂载预览的取景 / 那七个配置 | `render-mounts.js` 的 `AZ` `EL` `FOV` `MARGIN` 与 `CASES` |
| 版本戳显示位置 | `index.html` 的 `<div id="verStamp">`，由 `js/game.js` 的 `stampVersion()` 填 |
| 更新记录页的样式 | `style.css` 的 `.cl-*`；数据在 `js/changelog.js`，条目文本由 `clInline()` 还原 `**粗**` / `` `代码` `` |
| 版本号检查（格式 / 必须比当前大） | `release.js` 的 `normalizeVersion()` / `compareVersion()`；版本号本身由人在命令里给，见 [VERSIONING.md](../VERSIONING.md) 第 2 节 |
| 改名影响哪些文件 / 旧→新对照表 | `rename-aircraft.js` 的 `FILES` / `PLANES` 数组 |
| 近炸探针的发数 / 基线 | `probe-blast.js` 的 `--n`（默认 120）、`probe-blast.baseline.json` |
| 命名体系校验的词根表 | `smoke.js` 的 `RAFSI` / `UP_PREFIX` / `DOWN_PREFIX` |

---

## 易踩的坑

1. **加了新模块却忘了动 `index.html`**：脚本不会被加载，全局是 `undefined`，
   测试会在之后的第一个引用点炸。顺序的权威来源永远是 `index.html`
2. **`fail()` 不中断**：第一条 FAIL 才是根因，从中间开始读会浪费很多时间
3. **写死的 `Date.now()`**：连续 `pump` 之间时间几乎不变，`dt≈0`、飞机不动，
   于是卡死检测误报。**一律用 `pump()` 推进**
4. **`innerHTML` 的 setter 不真的清 DOM**：桩里显式处理了（`makeEl()` 里的 `innerHTML` setter），
   否则反复进机库会看到"行数翻倍"的假故障
5. **借了不还**：包装 `Ent.stepAircraft` / `Renderer.pushModel` / `Renderer.setCamera`、
   临时改 `WEAPONS.*.seeker`、改玩家的 `special`/`spAmmo`/`slotCd`——
   不还原就会污染后面所有分组
6. **断言打在中间计算上，或用超现实的测试参数**：追尾镜头那组试过"up 的倾斜度"
   和"up 是否精确等于 (0,1,0)"，两个判据都会误报或漏报，最后用"一帧内
   `setCamera` 调用次数"才干净；飞控测量曾用远超真实的扫掠角速度去测一阶低通，
   量到的是测试参数的问题
7. **`render-planform.js` 不支持的 Canvas 调用是静默的**：给 `planform.js` 加
   `translate` / `rotate` / 文字 / 渐变，预览会画错而不报错
8. **`rename-aircraft.js` 没有 dry-run 且 `FILES` 不含 `tools/`**：
   跑之前先 `git status` 干净，跑完 `git diff` 看一眼，并手动检查工具脚本
9. **`stamp-version.js` 记的是上一次提交，且必须在提交前跑**——
   忘了跑的话页面上还是旧时间戳，"到底部署没部署"这件事就白问了
10. **`js/version.js` 不要手改**：它是生成物，手改等于伪造部署状态
11. **改了 `CHANGELOG.md` 却忘了跑 `release.js`**：游戏里读的是
    `js/changelog.js`，不会自己跟着变。`smoke.js` 里有硬断言拦这一条
12. **`CHANGELOG.md` 的标题格式是解析契约**：`## [v1.2.3] 日期 · 标题`
    和 `<!-- commit: xxx -->` 锚点都是 `release.js` 正则认的。
    格式漂了会直接报错退出（宁可炸，也不要"差不多"地读出一份半截日志）
