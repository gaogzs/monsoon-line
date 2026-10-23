# 2.x 后续实施计划（POST 2.0）

> **路径说明**：本文写于 tools 分组之前，文中的 `tools/xxx.js` 现在在子文件夹里（`tools/test/`、`tools/test/probes/`、`tools/build/`、`tools/render/`），对照表见 [systems/tools.md](systems/tools.md)。


对应 [POST2-0PLAN.md](POST2-0PLAN.md)（草稿，保持原样不动）。写法沿用 [2-0IMPL.md](2-0IMPL.md)：分批次、每批独立发布、每步都能玩能验。数值都是**起步值**，以各批次的探针脚本实测为准再调。

文中涉及代码位置的行号取自 v2.5.2 的当前代码，仅作定位用，实施时以代码为准。已定的决策与提案的处理方式汇总在第 13 节。

---

## 0. 排序原则与版本表

排序规则：文件底层重构最先；然后是不依赖别的部分、也不给别的部分留技术债的小功能，放一起做；其余按依赖关系排，相辅相成的放同一批。

排序依据：

1. **重构必须最先**。之后每一批都要新增单位、数据、文本、关卡，文件结构不定下来，新东西就要先写进旧结构、再搬一遍。
2. **小件包第二**。失败原因、去假飞机、电磁干扰乱码、加挂点、重型轰炸机重做，都只碰数据或一两处调用点，互相无依赖，也不会被后面的批次推翻。
3. **光标越极点 + 天色时间**放第三批：两者都只动相机 / 渲染环境，一起验。
4. **地图边界 + 整备点**必须先于 AI 强化：撤离要"离开地图范围后被移除"，还要能"向整备点撤离"。
5. **AI 强化 + 半主动雷达弹**同批：半主动弹的 NPC 使用依赖 AI 的"持续照射"状态，两者相辅相成。
6. **新单位**必须在 AI 强化之后：战略制空支援机的行为"在友机后方游走、定期齐射"直接复用 AI 批次的外围游走战术；敌方无人机、友方有人机的无人僚机要用同一套"长机泛化"。
7. **世界观重编（批次 W）紧跟批次 1**：它不依赖任何功能，但失败台词、Chatter、简报、关卡文案、资料库都会引用世界观，先定下来避免返工。资料库背景与世界地图（批次 7）仍放在后面。
8. **地形放在关卡重构之后、全新战役之前**：它是渲染 + 锁定判定的大改，最重也最独立；新战役要用它。

| 批次 | 版本 | 内容 | 前置 |
|---|---|---|---|
| 1 | **v3.0.0** | 文件底层重构：目录、注册表、标签、文本分离（i18n 底座） | — |
| W | **v3.1.0** | 世界观重编（调节机制、降雨灾难成因；纯文本，提前做） | 1 |
| 2 | **v3.1.x** | 小件包，**每项单独发一个补丁版本**：v3.1.1 失败原因、v3.1.2–v3.1.5 模型修复（假机、挂载翼面、无人机座舱、曳光弹）、v3.1.6 干扰乱码、v3.1.7 假目标、v3.1.8 挂点、v3.1.9 重型轰炸机、v3.1.10 存档。全部完成后不再额外发版，批次 3 起升到 v3.2 | 1、W |
| 3 | **v3.2** | 光标越极点 + 相机重构；关卡时间与天色；过失速机动（PSM） | 1 |
| 4 | **v3.3** | 地图边界；整备点（含暂停整备界面） | 1、2（失败原因） |
| 5 | **v3.4** | AI 强化：技能值、外围游走 / 回头、友军独立 AI、撤离；Radio 队列与条件触发无线电；半主动雷达弹 | 3、4 |
| 6 | **v3.5** | 新单位：VTOL、航空巡洋舰、战略制空支援机、浮空平台武器、敌方无人机、友方有人机的无人僚机 | 5 |
| 7 | **v3.6** | 资料库追加背景、世界地图 | W |
| 8 | **v3.7** | 关卡重构：友军编成、上游空军呼号、无线电填充、剧情文案 | 4、5、6、W |
| 9 | **v3.8** | 地形、城市与场景类型（海洋 / 海岸 / 岛屿 / 内陆）；遮挡锁定与导弹追踪 | 1、2（死因）、3、4、5（FovWatch） |
| 10 | **v3.9** | 全新战役 | 全部 |

> 批次 7（资料库背景与世界地图）依赖批次 W，与 2–6 无依赖，可以在任何时候插进去。
> 版本号手动指定。批次 1 按"换引擎算主版本"的先例发 **v3.0.0**，批次 W 发 v3.1.0，批次 2 全部在 W 之后、只发补丁版本 v3.1.1 起，批次 3 起为 v3.2 … v3.8，新战役发 v3.9（若觉得新战役值得再升一个主版本，发版时改成 v4.0.0 即可）。

---

## 1. 现状摘要（实施前要记住的坑）

| 事实 | 位置 | 影响 |
|---|---|---|
| 加载顺序的唯一权威是 `index.html` 底部的 `<script>` 列表；`tools/smoke.js` 用 `/js\/([a-zA-Z0-9_]+)\.js/` 解析，**不匹配子目录和连字符** | `smoke.js:22-28`；`render-planform/ships/units/mounts.js` 同样 | 拆目录后这些工具会静默漏掉新文件。`render-env.js`、`render-gl.js` 已经因为连字符被漏掉，要先核实是否有意为之 |
| `tools/lib/sim.js` 的解析是宽松的（取整个 `src` 路径） | `sim.js`、`probe-render.js` | 可作为统一加载器的基础 |
| 其他按文件名硬编码的地方：`shot-unitview.js` 的 `SCRIPTS` 名单、`rename-aircraft.js` 的文件列表、`smoke.js:344` 直接 grep `game.js` 源码找 `go === '...'` | 同左 | 拆文件前先改这些 |
| `data.js` 3541 行：17 机型、16 舰船、6 平台、51 武器 | `data.js:67-3541` | 一个武器的信息散在 **8 张表**里（`WEAPONS`、`STORE_ATTR`、`STORE_LOOK`、`STORE_ROLE`、`STORE_NEEDS`、`STORE_COOLDOWN`、`MISSILE_LEAD`、`FLARE_RD`），靠加载时的 6 个原地合并 IIFE 拼起来，**顺序敏感** |
| `desc` 里的 `{{字段}}` 模板在所有合并之后才展开 | `data.js:3092-3122` | 文本分离后改成惰性展开，这个顺序依赖就消失 |
| `models.js` 整个是一个 IIFE，共享调色板 `C`、网格构建器 `MB`、`M` 表；`settle()` 对 16 艘船硬编码列表 | `models.js:8-2510`、`2483` | 拆文件前要先把共享助手抽成全局 `ModelLib` |
| `missions.js` 13 关 + 共享生成器（`spawnEnemy` / `spawnShip` / `spawnCellField`…）；`CAMPAIGNS` 用**全局下标数组**（`[0..7,11,8,12,9]`），下标即 `MISSIONS.push` 的顺序 | `missions.js:45-76`、`81-433` | 拆文件后加载顺序不能再决定下标，要改成按 id 引用 |
| `Game`、`Ent`、`HUD`、`AI` 各是**一个巨型闭包**（Game ≈ 4230 行 / 115 个函数），闭包内共享私有变量 | `game.js:95-4328` 等 | 拆分必须先设计共享状态的承载方式，不能直接剪切粘贴 |
| 没有任何 i18n；引号内含中文的行：data 866、missions 384、game 376、codex 215、entities 132、hud 83、unitview 85、ai 51 | 见调查 | 文本分离是工作量最大的一块，必须分步、带 lint |
| 硬编码的单位分支：`GUN_MUZZLE`、`HARD_MODELS`、`GUN_RESIST_MODELS`、`model === 'cell'/'relay'/'sam'`（game / hud） | `entities.js:2514/2016/2816`、`game.js:2841-2851/3630`、`hud.js:633` | 转标签的对象；武器侧的布尔标志（`twinSeeker`…）已经是数据驱动，只需归拢 |
| 光标是 `aimYaw`（无界）+ `aimPitch`（夹在 ±89°）；相机 `up` 恒为世界 +Y，`camPitchFor` 把天顶压到画面上缘，相机俯仰上限 62°（FOV 56） | `game.js:117-120/2305/3066/3140-3290` | 89° 限位的原因是 `up=(0,1,0)` 正交化后 `|up|=cos(89°)`；改成**用 (yaw, pitch) 解析构造相机基**后该限制消失 |
| `finish(win)` 只有一个布尔；`kill(ent, world, groundImpact)` 的 `groundImpact` **传了没用**；各关 `lose()` 返回布尔 | `game.js:3880`、`entities.js:2683` | 要加死因记录和 `w.fail`，同时保持 `lose()` 布尔兼容（probe 与 smoke 都在调） |
| `Radio.push(L)` 是文字上屏的唯一入口，`L.tx` 是 HTML；Radio 在 `Game` 之前定义，拿不到 `player.suppressed` | `game.js:45-59` | 乱码过滤要做成"HTML 安全"，并通过 setter 注入干扰度 |
| 提交 9e54ed6 只做了"被压制 > 0.35 时无法给僚机下令"，**没有**乱码 | `game.js:1930-1942` | 草稿里的无线电乱码是全新工作 |
| 无整备 / 补给函数；装载逻辑只在 `startMission` 里（约 55 行） | `game.js:1720-1775` | 整备点要先把它抽成 `Loadout.apply` |
| 机库界面的构建函数写死元素 id，读全局 `activeHpGroup` / `selectedAC` | `game.js:627/899/905/936` | 要做"简化挂载界面"就必须先让它们接受根容器 |
| 无地图边界；雷达量程写死 12000 m；各关无声明范围；渲染器无界（相机 x/z 按 `PERIOD` 回绕） | `hud.js:547`、`render-env.js:~590` | 边界要新建数据字段 + 探针先测出各关实际范围 |
| 非僚机的友军 AI 不存在（team 0 只有预警机 SEXTANT、僚机、舰船） | `missions.js:241`、`ai.js:407` | "友军独立 AI"是新建 |
| AI 没有"狗斗 / 汇合"状态，只有 `pursue / evade / extend`；`skill` 已存在但多数地方是内联魔数 | `ai.js:591/705/941/1008/1011` | 技能值要先把魔数提成参数表 |
| **先例**：`a.alive=false; a.escaped=true` 就是"被移除、不算击毁"；但 `win()` 里常见 `team===1 && alive` 计数，撤离的敌机会被算作"已清除" | `ai.js:540-543`、`missions.js:594/636`、`game.js:3868` | 撤离必须有**关卡级开关**，否则"击毁 N 架"类目标会变成可以被敌人绕过 |
| 无人僚机 AI 把长机写死为 `world.player`；被压制 > 0.35 已经会退回"只规避不开火" | `ai.js:673-705` | 敌方无人机、友方有人机的无人僚机都要先把长机泛化 |
| 敌方没有任何无人机 | — | 需要新单位 + 泛化 |
| 激光导引头是现成的"发射机持续照射"模板：每帧检查 `angleBetween(owner.fwd, owner→target) < LASER_CONE`，失败则 `laserLost`，不销毁目标引用，因此可重新点亮 | `entities.js:1273-1303`、`hud.js:1000-1040`（休眠） | 半主动雷达弹照这个写 |
| `seeker === 'radar'` 的判断点有 8 处 | `data.js:3053`、`entities.js:2249`、`ai.js:630/985`、`game.js:1015/2186/2725`、`codex.js:1119` | 半主动不新增 `seeker` 值，用标签区分，避免 8 处全改 |
| 光照常量集中在 `Shading`；`S.LIGHT` 必须原地改（`S.brightness` 闭包持有同一个对象）；GL 的天空 / 海面渐变只在加载时算一次；2D 回退把天空色写死；`unitview.js:35` 另抄了一份光向 | `shading.js:17-57`、`render-env.js:586`、`render.js:195-208`、`unitview.js:35` | 时间设定要一个 `Shading.setEnv()`，一并刷新缓存 |
| 地形钩子已存在（`terrainFn`、`groundY`、`agl`、`setTerrain`）但**从未被调用**，渲染没有陆地，**没有任何视线（LOS）判定** | `entities.js:79-92` | 地形批次要同时做渲染和 LOS |
| 没有难度系统 | — | 本计划不引入（见第 13 节 P3） |
| `playerHit`（VOICES）定义了没人触发；弹药告急只有 HUD 的 WINCHESTER，没有无线电 | `data.js:3167`、`hud.js:1784` | 条件触发无线电的基础是空的 |

---

## 批次 1 · v3.0.0 文件底层重构

**目标**：玩家看不出任何变化，但此后每个单位、关卡、文本都是独立文件，机制代码不再认识任何具体单位。

**不变的底线**（沿用 DESIGN.md §1）：零依赖、双击 `index.html` 即可运行、经典 `<script>`、不用 ES module（`file://` 下会被 CORS 拦）。

### 1.0 改动前先建基线（所有后续验证的参照）

重构最大的风险是"悄悄改了行为"。所以动手前先把现状冻结下来：

| 基线 | 工具 | 做什么 |
|---|---|---|
| 数据快照 | 新 `tools/snapshot-data.js` | 把 `AIRCRAFT / SHIPS / PLATFORMS / WEAPONS / TURRET_GUNS / SHIP_MOUNTS / …` 序列化成规范 JSON（键排序）并存哈希。重构后同一脚本必须得到相同结果（计划内的字段改动除外，单独列清单） |
| 模型快照 | 同上 | 对每个 `MODELS[k]` 的顶点 / 面数据取哈希 |
| 黄金回放 | 新 `tools/golden.js`，建在 `Sim` 上 | 固定种子，每一关用同一串脚本化输入跑 N 帧，每 60 帧对全体实体的 `pos / vel / hp / ammoPool` 取哈希。重构每一步后必须逐帧一致 |
| 画面 | 现有 `tools/probe-render.js` | 存一份重构前图像，之后逐像素比对 |
| 文本普查 | 新 `tools/text-census.js` | 统计非注释 CJK 字面量数量，存基线；后面作为"剩余待迁移"进度条 |
| 性能 | 新 `tools/probe-perf.js`，建在 `Sim` 上 | 每关逻辑帧耗时、粒子 / 子弹峰值。批次 8（友军变多）会再测一次 |

基线存 `tools/baseline/`，随提交入库。

### 1.1 先修工具链（后面所有拆分的前提）

1. 新 `tools/lib/scripts.js`：统一的 `loadOrder()`，解析 `index.html` 里**所有** `<script src>`（含子目录与连字符）。`smoke.js`、`render-*.js`、`shot-unitview.js`、`rename-aircraft.js` 全部改用它，删掉各自的正则 / 硬编码名单。
2. 核实 `render-env.js`、`render-gl.js` 被 `smoke.js` 漏掉是否有意；若无意，纳入。
3. `smoke.js:344` 的 `go === '...'` 检查改成扫描 UI 目录下**所有**文件。
4. 全部改完后跑 smoke + 黄金回放，确认**还没拆任何文件时**结果与基线一致。

### 1.2 目录布局与加载约定

```
js/
  core/        math3d, shading, registry(Registry/Tags/Text), version, changelog(生成物)
  data/
    aircraft/  一机型一文件
    weapons/   一武器一文件（合并原 8 张表）
    ships/     platforms/   targets/(新)   turret-guns/
    callsigns/ 呼号词库
  models/
    _lib.js    共享调色板、网格构建器、助手（全局 ModelLib）
    aircraft/  ships/  platforms/  targets/  ordnance/
  missions/
    _lib.js    共享生成器（spawnEnemy 等）
    m1.js …    一关一文件
    campaigns.js
  locales/     文本，只放 JSON：zh-CN/**/*.json（见 1.9）；机制在 core/text.js，生成物 core/locales.gen.js
  engine/      entities/、ai/、combat、turret、route、ballistics、world/（arena、resupply 等后续新增）
  render/      render、render-gl、render-env
  ui/
    screens/   title、campaign、brief、hangar、codex、settings、help、changelog、debrief、pause
    hud/       compass、bands、radar、markers、panels…
    input.js  camera.js  radio.js  sysnote.js
  boot/        preflight、init
```

**加载约定**：

- **index.html 的 `<script>` 块由 `tools/gen-index.js` 生成**（夹在标记注释之间），规则：按固定的层顺序（上图自上而下），层内 `_` 开头的文件最先、`zz` 开头的最后、其余字母序。
- 加一个单位 = 新建一个文件 + 跑一次 `node tools/gen-index.js`。`smoke.js` 断言 `index.html` 与目录扫描结果一致（和 `changelog.js` 同步检查是同一个套路，忘了跑会在测试里炸，而不是在玩家屏幕上白屏）。
- 每个数据层最后有一个 `zz-seal.js`，调用 `Registry.seal()`：按 `order` 字段排序、生成兼容用的全局数组（`AIRCRAFT`、`WEAPONS`、`SHIPS`、`MODELS`、`MISSIONS`），并跑模型的收尾遍（`composeTurrets`、`settle`、`orientClosed`）。**消费者代码一行不用改**，这是分步迁移的关键。
- 单文件目标 ≤ 800 行（沿用 2-0IMPL 的规则）。

> **加载方案（已定）**：散文件 + 生成 `index.html`。会有 ≈250 个 `<script>`，本地 `file://` 没问题；上线到 GitHub Pages 时先量冷启动，如果慢，再加一个 `tools/bundle.js` 在发版时把同样顺序的文件拼成单个 `monsoon.js` 给线上用（开发时仍用散文件，行号对得上）。"只发拼好的包"会让浏览器调试看不到原文件行号，不采用。

### 1.3 注册表 `Registry`（`js/core/registry.js`）

```js
// 数据文件的写法
Registry.aircraft({ id:'frigatebird', order:10, model:'frigatebird', tags:['varsweep'], ... });
Registry.weapon({ id:'mrm', order:40, seeker:'radar', tags:['reacquire'], ... });
Registry.model('frigatebird', function (L) { /* L = ModelLib */ return mesh; });
Mission.define({ id:'m1', order:10, ... });
```

- 重复 `id` 在注册时直接抛错（以前是数组里悄悄有两条）。
- `seal()` 之后注册表冻结；之后再注册抛错。
- **武器合并**：每个武器文件把原来分散在 8 张表里的字段写在一处（`attr / look / role / needs / cd / lead / flareRD`），删掉那 7 张表和 6 个合并 IIFE。迁移期间 `snapshot-data` 保证合并结果逐字段相等。
- **新增 `targets/`**：地面 / 浮空设施（`cell`、`relay`、`sam`、`radar`、`depot`、`cmdpost`、`station`、`sower`）原来只存在于模型和 `spawnTarget` 的参数里，没有数据表。为"一种单位一个文件"补上，字段 `{id, model, radius, hp, gunResist, hard, tags, …}`；`HARD_MODELS`、`GUN_RESIST_MODELS` 并入这里。

### 1.4 数据拆分（逐类一次提交，每次都过快照与回放）

顺序（风险从低到高）：呼号词库 → 炮塔炮 → 平台 → 目标 → 舰船（含 `SHIP_MOUNTS / SHIP_LAUNCHERS`，按舰 id 并入各自的文件）→ 机型 → 武器。

- 机型 `AIRCRAFT.defaultLoadout / hardpointGroups` 引用武器 id，保持字符串引用，由 `preflight()` 校验。
- `VOICES` 不在这里搬，直接并入 1.9 的文本层。

### 1.5 模型拆分

- `models/_lib.js` 导出全局 `ModelLib`：`C`（调色板）、`MB`、`mast / house / done / orientClosed / seaBase / settle` 等。
- 每个模型一个文件：`Registry.model(id, function(L){…})`。原来依赖闭包变量 `M / C / V / MB` 的地方改成 `L.xxx`。
- `settle()` 的 16 艘船硬编码列表改成**船文件自带 `settle: true` 标志**。
- 验证：每个模型的网格哈希与基线逐一相同；`probe-render` 逐像素相同。
- 2048 顶点上限的检查保持。

### 1.6 关卡拆分

- `missions/_lib.js`：`missions.js:81-433` 的共享生成器。外部使用者（`entities.js`、`game.js`、`hud.js`、`ai.js`、`tools/smoke.js`、`tools/render-mounts.js`）都读全局名，**全局名保持不变**，只是定义位置搬了。
- 每关一个文件，关内私有助手跟着走（`m8Wave2`、`m9Retreat`…）。`batchCallsigns`、`SK_FITS` 是 sk1 / m12 共用 → 进 `_lib.js`；`M11_FLAG_MARKS` 是 m9 / m11 共用 → 进 `_lib.js`。
- **`CAMPAIGNS` 改为按任务 id 引用**（`missions: ['m1','m2',…]`）；`missionIdx`（运行时全局下标）由注册顺序在 `seal()` 时算出。这是 DESIGN.md 6.8"通关记录按 id 记"的同一思路，现在把战役清单也改成 id。
- 现有关卡 id：`m1 m2 m3 m4 m5 m6 m7 m8 m10 m12 sk1 m9 m11`（下标 0–12，顺序不等于编号，这正是要改成 id 的原因）。

### 1.7 引擎 / UI 模块拆分

**共享状态的承载方式**（这是最关键的设计决定）：

- 每个大命名空间保留一个**私有状态对象**：`Ent.$`、`AI.$`、`Game.S`（已有同名概念）、`HUD.$`。原来闭包里的 `var x` 变成 `$.x`。
- 拆出去的文件写成 `(function (Ent) { var $ = Ent.$; … Ent.foo = foo; })(Ent);`，只往命名空间上挂函数。
- **规则**：一个命名空间的 `$` 只允许该命名空间自己的文件读写；跨命名空间只能走公开函数。`smoke.js` 加一条静态检查（grep `.$.` 出现在其它命名空间的文件里就失败）。
- 每个模块在 `docs/systems/modules.md` 里写**公开接口表**（函数名、参数、谁会调它）。

**拆分顺序**（先拆边界清晰的）：

1. `Radio`、`SysNote`（本来就是独立 IIFE，原样搬出）。
2. `game.js` 的屏幕：设置 / 操作说明 / 文本块（`game.js:212-615`，主要是 UI 文本）→ 各屏一文件；`buildHangar` 一族改成**接受根容器参数**，不再写死元素 id，也不再读全局 `activeHpGroup / selectedAC`（批次 4 的整备界面要复用它）。
3. 把 `startMission` 里 `1720-1775` 的装载块抽成 `Loadout.apply(ent, lo, opts)`（批次 4 的整备要复用）。
4. `input`（≈400 行）与 `camera`（≈310 行）各一文件。**这两个文件不动逻辑**，批次 3 才改。
5. `hud.js` 按已有的横幅拆：雷达、威胁 / 目标框、标记与瞄准辅助、面板与告警栈、击毁横幅。
6. `entities.js` 按横幅拆：挂载适配与武器选择、射程包线、伤害、粒子、电子战。
7. `ai.js` 按横幅拆：工具与 `steerTo`、航线单位、追击、规避、对地。
8. `codex.js`：静态条目移入文本层（1.9），动态目录页（`build()`）留作逻辑。

每一步一次提交，`smoke` + 黄金回放 + `probe-render` 全绿才进下一步。

### 1.8 标签（Tags）

**目标**：单位的独有机制 = 数据里一个标签 + 机制代码里认标签，机制代码里不出现具体单位 id。

```js
// js/core/registry.js
Tags.declare('hard',     { owner:'combat',   doc:'受非穿甲伤害 ×0.6（集束 ×0.2）' });
Tags.declare('sarh',     { owner:'entities', doc:'半主动雷达制导，需发射机持续照射' });
Tags.has(def, 'hard');            // 数据层
a.tags.hard                       // 运行时：实体创建时展开成 {tag:true}，O(1)
```

- 数值参数仍是字段（`gunResist`、`lockResist`、`lead`…），标签只表达"有没有这条机制"。
- `smoke.js` 断言：数据里用到的每个标签都已 `declare`；每个 `declare` 的标签至少被一个数据项或机制代码引用（预留的要写 `reserved:true`）。
- 单位详情页新增"机制标签"一行（读 `Tags` 的 `doc` 字符串），顺手让设计意图对玩家可见。

**要迁移的清单**（来自调查）：

| 现状 | 去向 |
|---|---|
| `GUN_MUZZLE = { booby: … }`（`entities.js:2514`） | 机型字段 `muzzle` |
| `HARD_MODELS`、`GUN_RESIST_MODELS` | `targets/*.js` 的 `tags:['hard']` / `gunResist` |
| `game.js:2841-2851/3630`、`hud.js:633` 的 `model === 'cell'/'relay'/'sam'` | 标签 `regulator`、`relay`、`sam`（击毁无线电、远距剔除各读自己的标签或字段） |
| 武器布尔标志：`twinSeeker decoyMemory reAcquire hobs penetrator antiRadar silentLock passive unguided ballistic highAltImmune`（各只在 1–2 处读取） | `tags` 数组 |
| 实例标志 `aewc / bigTarget / striker`（由关卡脚本设置）；`isDrone` 并入标签 `unmanned` | 单位数据给默认标签，`spawn*` 可覆盖 |
| `caps`（`strike/ew/intercept`） | 已经是标签数组形态，并入 `tags` |
| 任务脚本里的 `model === 'sower'/'seascorpion'/…` | **保留**——那是关卡脚本，不是机制；但计数改读单位的 `role` / 任务专用标签，不再比较模型名 |

### 1.9 文本分离与 i18n 底座

**原则**：文本**只**放在 JSON 里（只有键和文本）；所有"怎么读、怎么拼、怎么回退"的机制**只**在 `js/core/text.js` 里；数据与关卡脚本只写键。

#### 1.9.1 目录与文件格式

```
js/locales/              ← 原 text/ 改名
  zh-CN/                 一种语言一个目录；以后加语言 = 新增同构目录
    ui/…  hud.json  aircraft/<id>.json  ships/<id>.json  …   （见 1.9.3）
js/core/text.js          机制（读取、展平、取文本、模板、回退、伪语言）
js/core/locales.gen.js   生成物，不手改（见 1.9.2）
```

- **只存键值与文本**：JSON 里没有脚本、没有注释、没有函数。2 个空格缩进，UTF-8，结尾换行。
- **多级键用嵌套结构存**（便于人读、改）：

```json
{
  "aircraft": {
    "frigatebird": {
      "name": "DB-11",
      "desc": "……最高 {{phys.vMax}} m/s ……"
    }
  }
}
```

- 脚本读取后**展平**成点号键 `aircraft.frigatebird.desc`，一次调用就取到：`T('aircraft.frigatebird.desc', ctx)`。展平在 `core/text.js` 里完成，JSON 文件本身不写点号键。
- **只认键，不认文件名**：加载时把 `zh-CN/` 下**所有** `*.json`（递归）读进来合并成一棵树再展平，文件放哪、叫什么都不影响取值。同一个键出现在两个文件里 = **加载错误**（报出两个文件名）；同一个对象的不同叶子分布在两个文件里（例如 `aircraft.frigatebird.name` 与 `.desc` 分在两个文件）是允许的，按深度合并。
- **叶子类型**：字符串，或"字符串数组"（同一事件的多个说法，用于 Chatter 变体等，展平时数组整体作为叶子，不再往下展）。其它类型（数字、布尔、对象数组）一律报错。**不属于文本的参数**（`gap / cls / pri / 说话人` 等）留在脚本里，见 1.9.4。
- **键名规则**：每一段只允许 `[A-Za-z0-9_-]`（所以 `folded_wing` 这样的 id 可以直接当键），**段内不得含 `.`**，不得以数字开头。
- **文本里的标记**：只允许 `<b>`、`<i>`、`<br>` 三种 HTML 标签（现有文本里确实在用 `<b>` 与 `<i>`）；其余尖括号一律报错。模板占位只有一种写法 `{{路径}}`（见下）。

#### 1.9.2 运行时读取：为什么要多一个生成步骤（约束说明）

**`file://` 下浏览器不允许脚本读取本地 JSON**（`fetch` / `XMLHttpRequest` 被 CORS 拦，和 DESIGN.md 里不用 ES module 是同一个原因），而本项目的底线是"双击 `index.html` 就能玩"。所以：

- **JSON 是唯一的源**（人只改它）；`tools/gen-locales.js` 把 `zh-CN/` 下**全部** JSON 读出来，**原样（仍是嵌套结构）**合并写进一个生成文件 `js/core/locales.gen.js`，内容就是一句 `Text.load('zh-CN', { …嵌套对象… })`；`index.html` 里用普通 `<script>` 加载它（在 `core/text.js` 之后）。
- 这与 `CHANGELOG.md → tools/release.js → js/changelog.js` 是**同一个套路**：生成物提交进仓库，`smoke.js` 断言"现场重新生成的结果与已提交的 `locales.gen.js` 逐字节一致"，所以忘了跑生成脚本会在测试里炸，而不是在玩家屏幕上看到缺字。
- **开发便利（可选）**：若页面是通过 http(s) 打开的（本地起个静态服务器，或 GitHub Pages），`?locales=live` 让 `core/text.js` 直接 `fetch` 目录下的 JSON，免去每次改完重新生成。`file://` 下该开关无效并给出提示。
- **一个顺带的好处**：所有文本最终只有**一个** `<script>`，不会因为"一个键一个文件"让脚本数暴涨，批次 1 前面担心的"250 个 `<script>`"也因此少一笔。

#### 1.9.3 文件划分规范（规范只为方便人读和改，运行时不依赖）

| 位置（`js/locales/zh-CN/` 下） | 内容 | 顶层键 |
|---|---|---|
| `ui/*.json` | 菜单、设置（`SET_GROUPS`）、操作说明（`KEYMAP / TIPS / GUIDE`）、机库、战役、简报壳子；按屏幕一个文件（`title / campaign / brief / hangar / codex / settings / help / changelog / debrief / pause`） | `ui` |
| `hud.json` | HUD 告警、面板、横幅 | `hud` |
| `aircraft/<id>.json` | 一机型一文件：名称、`desc`、`role` 等 | `aircraft` |
| `ships/<id>.json`、`platforms/<id>.json`、`targets/<id>.json` | 同上，一单位一文件（舰船的 `arms` 也在这里） | `ships` / `platforms` / `targets` |
| `weapons/<id>.json` | 一武器一文件：名称与 `desc` | `weapons` |
| `codex/<页>.json` | 资料库每页一个（`world / tech / systems / factions / campaign / language`）；设计手记放 `codex/devnotes/<unit>.json` | `codex` |
| `missions/<id>.json` | 一关一文件：简报、目标、情报、该关全部台词的**文本** | `missions` |
| `radio.json` | 通用无线电（击杀、告急、撤离、Fox 等，批次 5 起用） | `radio` |
| `fail.json` | 失败原因与失败无线电（批次 2 起用） | `fail` |

- **文件内的键形状**：目录决定顶层键与第二层（`aircraft/frigatebird.json` 里只定义 `aircraft.frigatebird.*`）。**这是软规范**：`tools/check-locales.js` 以**警告**报出越界，不阻止加载（运行时不认文件名，这条只是约定）。
- 单文件 ≤ 800 行；超了就按第二层或第三层拆成多个文件。
- **格式化**：`tools/fmt-locales.js` 把任何 JSON 重写成规范的 2 空格缩进（`gen-locales.js` 在生成时若发现文件不是规范格式会报错并提示运行它），避免手改后缩进不一致带来的无意义 diff。
- **重复键检测**：`JSON.parse` 遇到同一对象里的重复键会悄悄取最后一个，所以 `gen-locales.js` 自带一个**严格的小解析器**（`tools/lib/strict-json.js`），能报出同一文件内与跨文件的重复键、非法叶子类型和多余逗号等问题。

#### 1.9.4 `core/text.js` 的机制（脚本里的一切都在这里）

```js
T('aircraft.frigatebird.desc', weaponOrAircraft)   // 取文本，{{路径}} 从第二个参数（任意对象）里按点号路径取值
T('fail.m2.baseLost', { n: 3 })                    // "……丢了 {{n}} ……"
T.pick('radio.fox.variants', rng)                  // 叶子是数组时随机挑一条
T.has(key)   Text.keys(prefix)   Text.lang('zh-CN')
```

- `Text.load(lang, tree)`：深度合并、展平为 `Map<点号键, 字符串 | 字符串数组>`；合并时检查重复叶子。
- **模板**：`{{路径}}` 沿用现有语义（`data.js:3092-3122` 的 `desc` 展开、`codex.js` 的 `_CX_VALS`），但改为**取用时惰性展开**，从根上去掉"必须在所有数据合并之后才展开"的顺序依赖。路径支持点号（`{{phys.vMax}}`）；未知路径抛错（smoke 已有"未知键 FAIL"的先例）。
- **缺键**：返回 `⟦key⟧` 并记入 `Text.missing`；smoke 断言为空。
- **回退链**：当前语言 → `zh-CN`。只交付 `zh-CN`；另提供**伪语言** `?lang=pseudo`（每个文本包成 `⟦…⟧` 并拉长 30%），用来目视找漏迁的字符串与排版溢出。
- **未被引用的键**（开发用）：`Text.unused()` 列出从未被取过的键，`tools/check-locales.js` 在静态扫描里用它找死文本。
- `index.html` 的静态文本改成 `data-i18n="key"`，启动时由 `core/text.js` 填充。
- **台词（`Radio` / `VOICES`）的分工**：**文本在 JSON，结构在脚本**。例如 `missions/m1.json` 里有 `missions.m1.voices.start.a = "……"`；关卡脚本里只写 `{ who:'wing2', cls:'ally', gap:1, pri:'story', tx:'missions.m1.voices.start.a' }`，`Radio.push` 上屏时用 `T()` 解析 `tx`。`gap / cls / pri` 这类非文本参数**不进 JSON**。呼号（`VESPER-2` 等）是专有名词，留在数据里。

#### 1.9.5 迁移顺序与防回退

- **迁移顺序**：`core/text.js` + `gen-locales.js` + `fmt-locales.js` + 严格解析器与 lint → `index.html` + `ui/*` → 数据表（名称、`desc`）→ 资料库 → 关卡与台词 → HUD / 引擎里零散的字面量。每一步 `text-census` 进度条下降。
- **防回退的 lint**：`smoke.js` 加一个小型扫描器，对 `js/` 下除 `locales/` 与生成物（`locales.gen.js`、`changelog.js`、`version.js`）以外的文件，找**字符串字面量**里的 CJK（跳过注释），与"允许清单"比对；清单只许缩小。迁移结束时清单为空。另断言：脚本里静态写出的 `T('字面键')` 都存在于生成物里。
- **半自动提取**：`tools/extract-text.js` 扫描字符串字面量，**直接产出嵌套 JSON 片段**与建议键名（人工确认后落盘），再由 `fmt-locales.js` 规范化；不要手改。
- 工作量说明：非注释的中文字符串字面量大约 2000 条，几乎都在 `data / missions / game / codex`。

### 1.10 收尾

- 文档：重写 `DESIGN.md` §2（目录，含 `locales/`）、§3（模块与加载顺序，改为"层 + 约定"）；新增 `systems/modules.md`（公开接口表）、`systems/tags.md`（标签清单）、`systems/text.md`（JSON 规范、键名规则、生成步骤与伪语言）；更新 `systems/tools.md`、`docs/README.md` 索引。各 `systems/*.md` 里的 `file:line` 引用和"见 game.js xxx"改成模块名。
- 加载方案量冷启动，必要时做 `tools/bundle.js`。
- **只在全部完成后发一次 v3.0.0**；中间的提交只是内部步骤。若文本迁移拖得太久，可拆成两次内部里程碑发版（1.0–1.8 与 1.9），版本号临时用 v3.0.0-a / -b。

### 1.11 验证

- `snapshot-data` 与基线相等（计划内字段改动单列）；模型哈希相等；黄金回放逐帧相等；`probe-render` 逐像素相等。
- `smoke.js` 与 `probe-missions.js` 全绿；`probe-perf` 不退化超过 5%。
- 手动：每个屏幕走一遍；`?lang=pseudo` 下每个屏幕无漏迁字符串。
- `text-census` 为 0，lint 允许清单为空。
- 任一 `js/` 文件 ≤ 800 行（生成物除外）。

---

## 批次 W · v3.1.0 世界观重编

> **从批次 7 提前到这里**：它不依赖任何功能，但后面几乎所有批次写的内容（失败台词、Chatter、简报、关卡文案、资料库）都会引用世界观，先定下来可以避免到处返工。纯文本改动，放在文本层完成之后（批次 1）、其余批次之前。

### W.1 重编世界观：调节机制的物理说服力

问题：碘化银播撒能转移全世界的雨水吗？不能。需要一个"每个单元的影响微不足道，叠加起来达成目的"的机制。

**先做盘点**（半天）：用 `grep` 列出所有提到碘化银 / 凝结核 / 播撒的位置——`index.html` 开机自检与标题页文案、`codex.js` 的 w1 / w2 / tech、`SETTING.md`（含 §7.1、§8.6 调节单元）、`data.js` 里 `cell`（DIL-4）的 `desc`、各关简报与台词。盘点清单是后续改写的验收依据。

**候选方案**：

- **A. 平流层吸收型气溶胶 + 半球热力差**。调节单元悬在 18–22 km，每个只释放极少量吸光微粒，单个对全球辐射几乎为零；1400 个单元的叠加在平流层形成一层不对称的"薄纱"，造成南北半球的辐射加热差——这正是真实研究里**移动热带辐合带（季风线本身就是它）**的已知杠杆（半球不对称的平流层气溶胶会推动辐合带向较冷一侧移动）。"偏移量十六年来只朝一个方向拧"就是这层纱越积越厚。介质 = **平流层气溶胶光学厚度**。优点：用的是真实机制，与"季风线"这个名字天然相扣。
- **B. 相位同步的行星波强迫**。每个单元对大气只施加极微弱的周期性加热扰动，**相位全部锁定**时，它们的叠加能共振激发行星尺度波（类似相控阵），改变急流与辐合带位置。介质 = 微波 / 红外局地加热。优点：解释了为什么需要"1400 个自主单元 + TACNET 数据链"（相位同步需要通信）；缺点：偏科幻。
- **C. A + B 合并**：气溶胶提供缓慢的背景不对称，相位同步提供精细的"调旋钮"。解释了"为什么单个单元被击落影响不大，但被击落足够多就会失控"，也给"调节单元被打爆"的剧情后果一个物理落点。

→ **已选 C**：A 给合理性，B 给"为什么是网络"，两者合起来恰好对应设定里已有的"1400 个单元 + 数据链 + 单向偏移"。

### W.2 降雨总量下降的成因：候选方向

要解决的问题：设定里"全球降雨变少"是大背景，但"调节场只是把雨挪来挪去"本身并不会让总量变少。需要一个让**总量下降**也合理的来源。四个候选方向（以 C 为底）：

| 选项 | 成因 | 与 C 的关系 | 叙事后果 |
|---|---|---|---|
| **α 调节场自己削弱了水循环** | 气溶胶薄纱遮暗地表，地表蒸发减少，全球水循环整体变弱（真实研究里平流层气溶胶对降水的削弱比对温度的削弱更明显）；剩下的雨被调节场集中推向上游一侧 | 直接是 C 的副作用 | 调节场是"救人也是害人"的同一个旋钮，责任清晰，偏黑暗；"单向拧"同时意味着总量越来越少 |
| **β 气候崩溃在先，调节场只是止血** | 开场白已说"人类没能阻止气候变化"：副热带干化、季风环流减弱使总降水本来就在掉；调节场是在此之上的再分配 | 与 C 独立，C 只管分配 | 调节场不再是祸根，而是"救了很多人"的那件事，冲突点转为"该把雨给谁" |
| **γ 复合（推荐）** | β 是大背景（总量因气候变化而下行），α 是调节场额外的代价（薄纱让下行更陡、且只向一个方向） | C + α + β | 保留"它救了很多人"和"它的偏移量只朝一个方向拧"两句开场白的张力；谁也不是纯粹的恶人；调节单元被击落的后果既可能是"雨回来了"也可能是"雨失控了" |
| **δ 行星波阻塞** | 相位同步的强迫诱发持续性阻塞高压，造成大范围长期干旱带 / 热穹顶；降雨不是均匀减少，而是整片地区"关掉" | C 的 B 分支的后果 | 灾难表现为区域性、可见、可上地图的干旱区，对世界地图（7.2）很友好；总量下降较温和 |

→ 推荐 **γ**，并吸收 δ 作为表现形式：背景是气候变化导致降水总量下行（β），调节场的薄纱让它更陡（α），而"最糟的地方"表现为被阻塞高压锁死的干旱带（δ），可以直接画在世界地图上。

### W.3 已选 γ：背景灾难的因果链（β 的深化）

目标：让"降水总量崩塌"既**看着合理**，又**烈度足够**，使"必须造出调节场"成为唯一现实的选择。允许架空，但每一环都对应真实的机制。

1. **外因（架空的部分）：恒星进入长期增亮期**。这颗太阳的辐照度在二十一世纪下半叶以十年尺度缓慢上升（起步设定 +0.4%），叠加人类没能阻止的温室强迫。单独看都不致命，合起来让行星能量收支持续偏正，且**与排放无关**——即使人类全面停排也无法回头。这也回答"为什么不直接减排"：减排只管其中一部分，另一部分是天上的。
2. **环流层：哈德莱环流变弱并向两极扩张**。更暖的大气能容纳更多水汽，但驱动降水的垂直环流反而减弱；副热带干燥带向极地推进，原本的雨带被挤窄。真实机制，设定里换成架空的数字：二十一世纪末干带外推约 8 个纬度。
3. **陆面层：水汽再循环链断裂（把"缓慢"变成"崩塌"）**。大陆内部约一半的雨靠上风向森林与湿地的蒸散"接力"送来（真实的"飞行河流"概念）。干旱先杀死上游的森林，下风向的雨随之断掉，再杀死下一段森林……**一旦越过阈值就是级联，不是线性下降**。这是总量"台阶式"下跌的来源：2050 年代开始连锁崩溃，十余年内陆地降水总量下降约 20–25%，内陆受灾带降水下降 40–60%。
4. **海洋层：经向翻转环流减弱，辐合带（季风线）开始游走**。雨带位置变得不稳定，**季风线本身成了灾害**：它每年落在哪里，哪里就丰收，其余地方颗粒无收。
5. **人道烈度（对应"必须有调节场"）**：依赖雨养农业的粮食带产量腰斩，以数十亿计的人口进入长期水短缺；水坝、海水淡化只能救城市，救不了耕地。**没有人造的雨，就没有人造的粮。**
6. **为什么只能"挪雨"而不是"造雨"**：水汽总量由蒸发决定，人类无法增加总量，只能改变它**落在哪里**。调节场（γ 的气溶胶不对称 + 相位同步）是唯一在时间窗口内做得到的事：推动季风线，把有限的雨送到最需要的一侧。
7. **"只朝一个方向拧"的来由**：背景降水每年都在下降，为了维持上游的雨量，偏移量必须逐年加大——这是一个只进不退的**棘轮**。每年放弃一点下游，才能保住上游。十六年来的单向偏移不是谁的恶意，是一道每年都更难解的题。调节场"救了很多人"与"只朝一个方向拧"于是出自同一件事。
8. **与 α 的叠加**：气溶胶薄纱遮暗地表、削弱蒸发，会让下游本就稀薄的雨更薄，这是调节场自己付出的代价，也是下游最有理由恨它的地方。

**已定的两点**：① 行星本身（轴倾角、自转、海陆分布）**暂不改**，只动恒星亮度这一处架空；② 文本里**保留一点归因的模糊度**：开场白与资料库不下定论，只并列呈现"天（增亮）、人（排放与森林）、调节场（薄纱）"三种说法，不同势力、不同人物各执一词，由玩家自己判断责任。写作时每处引用成因都要遵守这一条，不得在某一页里直接断言单一原因。

**可调旋钮**（烈度不合适时只改这几个数）：增亮幅度、干带外推纬度、级联崩溃的年代与降幅、棘轮每年的偏移增量。

**落到文本的位置**：标题页开场白（`index.html` 的 `.title-lore` 三段）、资料库 w1 / w2 / tech、`SETTING.md` 的气候与调节场章节、`cell` 的 `desc`、`CAMPAIGN.md` 的开战背景。改完后做一次全局检索，确认没有残留"碘化银 / 播撒"的旧说法。

**要改的**：`SETTING.md` 相关章节、资料库 w1 / w2 / tech 页、标题页文案、`cell` 的 `desc`、`CAMPAIGN.md` 中引用该机制的部分。关卡里的引用留到关卡重构批次一并改（文本已分离，所以改动集中在 `locales/`）。


### W.4 验证与发版

全局检索确认没有残留"碘化银 / 播撒"的旧说法；`?lang=pseudo` 下标题页与资料库无溢出；`smoke` 全绿（文本键不缺）。文档：`world/SETTING.md`、`world/CAMPAIGN.md`、`codex.md`。发 v3.1.0。

---

## 批次 2 · v3.1.x 小件包

**版本规则**：批次 2 的每一项改动都**单独发一个补丁版本**，只升第三位，不等整批完成：

| 项 | 版本 | 内容 |
|---|---|---|
| 2.1 | v3.1.1 | 失败原因、失败停留画面与失败无线电 |
| 2.2a | v3.1.2 | 航母去掉甲板假飞机 |
| 2.2b | v3.1.3 | 挂载的尾翼 / 弹翼不连接主体 |
| 2.2c | v3.1.4 | 无人机去掉座舱盖 |
| 2.2d | v3.1.5 | 机炮曳光弹不再在最顶层绘制 |
| 2.3 | v3.1.6 | 电磁干扰下的无线电乱码 |
| 2.3b | v3.1.7 | 电磁干扰下的假目标 |
| 2.4 | v3.1.8 | 所有可玩机型各 +1 对挂点 |
| 2.5 | v3.1.9 | 重型轰炸机重做 |
| 2.6 | v3.1.10 | 存档 |

- 每个补丁版本各自写一条 changelog，各自跑完 `smoke` 与该项的验证后才发。
- 不跨项合并发版；某一项未完成时，下一项可以先做，但**按表顺序发版**，版本号不跳号。
- 批次 2 全部发完后不再额外发一个 `v3.1.x` 总版本。下一批次（批次 3）起恢复为次版本升级，发 v3.2。

各项互相独立，各自提交、各自发补丁版本。依赖批次 1（新文本都写进 `locales/` 的 JSON，新单位 / 模型都按新目录放）与批次 W。

### 2.1 失败原因

**现状**：
- `finish(win)`（`game.js:3880`）只有布尔，没有原因；`update()` 在 `game.js:3532-3534` 依次判时限、`mission.lose(w)`、`mission.win(w)`，一判定就直接 `finish`。
- `kill(ent, world, groundImpact, source)`（`entities.js:2683`）的 `groundImpact` **参数收了没用**，且全代码只有一个 `groundImpact=true` 的调用点：`entities.js:863`（`pos.y <= groundY + 2`），而且**没传 source**；`groundY` 被夹在 `SEA_Y = 0`，所以区分撞海 / 撞地要用 `Ent.isLand(x, z)`（`entities.js:88-90`，批次 9 之前恒为 false，即一律撞海）。
- `Ent.damage(ent, amt, world, source)`（`entities.js:2662`）只带 `source`（开火的实体），**不带武器 id**。子弹走 `game.js:2779`，导弹爆炸走 `combat.js:121 → Ent.hitAny（entities.js:2044）→ damage`。`combat.js` 里没有 `Combat.apply`，武器 id 需要在三条入口补传。
- `playerHit`（`VOICES`，`data.js:3167`）确认无触发。
- 玩家死后仍留在 `world.actors`，`update()` 继续跑 `Ent.stepAircraft`（残骸坠落）、`updateCamera`、HUD，"世界继续模拟"几乎免费；但 `render()` 与 `loop` 只在 `state === 'playing' && !paused` 时跑（`game.js:3609`、`3978`），而 `finish()` 把 `state` 改成 `'debrief'` 后背景是空的。
各关 `lose()` 内容见下表。

| 关 | `lose()` 现有条件 | 要报告的原因 |
|---|---|---|
| m1 m4 m5 m6 m7 m10 m12 sk1 | 玩家死亡 | 死因 |
| m2 | 玩家死亡 / 基地失守 | 死因 / `m2.baseLost` |
| m3 | 玩家死亡 / ≥ 2 架播种机逃脱 | 死因 / `m3.sowerEscaped` |
| m8 | 玩家死亡 / 被护卫目标阵亡 / 基地失守 | 死因 / `m8.guardLost` / `m8.baseLost` |
| m9 | 玩家死亡 / 被护卫目标全灭 | 死因 / `m9.guardLost` |
| m11 | 玩家死亡 / 旗舰沉没 | 死因 / `m11.flagshipLost` |
| 通用 | 时限到 | `fail.timeUp` |
| 批次 4 起 | 越界全黑 | `fail.arena` |

**做法**：

1. **死因记录**：
   - `Ent.damage` 增加第五个可选参数 `info = { weapon, kind }`（`kind ∈ gun / missile / blast`），三条入口各自补传：子弹（`game.js:2779`，武器取 `b.w`，现在子弹已带 `w`）、导弹直接命中与爆炸（`entities.js:2044` 的 `hitAny` 与 `combat.js:121`，武器取 `m.w`）、脚本伤害（`missions.js:182`，`kind:'script'`）。`info` 缺省时 `deathCause` 记 `{ type:'unknown' }`，不报错。
   - `kill(ent, world, groundImpact, source, info)` 对玩家写 `ent.deathCause = { type, by, weapon }`：`type ∈ gun / missile / blast / crash-ground / crash-sea / script`。`groundImpact` 为真时：`Ent.isLand(x, z)` 为真记 `crash-ground`，否则 `crash-sea`；撞地点要给 `entities.js:863` 补传 `source = a.lastHitBy`（被打伤后撞地时仍能记到"是谁把你打下来的"）。
   - `by` 取 `source.label`（呼号）或 `source.shipClass`；舰船 / 设施没有呼号时用 `name`。
   - `collision`（空中相撞）游戏里没有，不做。
2. **关卡入口**：保持 `lose(w)` 返回布尔，新增 `Mission.fail(w, 'key', params)`——在返回 true 之前写 `w.fail = { key, params }`。一关里同时满足多条时，先判先得。
3. **通用兜底**：玩家死亡由 `deathCause` 生成；时限由 `game.js` 的通用分支写 `fail.timeUp`；`w.fail` 缺失而 `lose()` 为真 → smoke 报错（逼着每个新关写原因）。
4. **结算页**：`#scr-debrief` 增加 `#dReason`（标题下一行大字）和 `#dReasonSub`（"被 FLINT-2 的 CLA-4 击毁"之类的详情）。键全部在 `locales/zh-CN/fail.json`。
5. 顺手把 `playerHit` 台词接到玩家受击（限频），免得它继续是死数据。

**失败后的停留画面**：任何原因的失败（被击毁、坠毁、关卡条件、时限、越界）都**先停留在游戏画面**，弹出失败提示，几秒后或点提示下的"结束"按钮才进结算页。

- **实现方式**：`state` **保持 `'playing'`**，新增模块级变量 `failing = { t0, fail }`（`DESIGN.md` §4.1 状态机补一行说明它是 `playing` 的子状态）。这样 `loop` / `render()` 的 `state === 'playing'` 判定、相机、HUD、世界模拟全部原样继续，不用动渲染。
- `update()`（`game.js:3532-3534`）检测到失败后不再直接 `finish(false)`，而是 `beginFail(reason)`；之后不再检查 `win`；`updateCamera` 仍要执行（它在 `update()` 末尾，`beginFail` 之后不能 `return` 跳过）。
- **需要补 `if (failing)` 守卫的输入点**（`state==='playing'` 门槛挡不住它们）：Esc / `H` 暂停（`game.js:1849`）、`window.blur` 自动暂停（`1864`）、点击画布重新锁定鼠标（`requestAimLock`，`1870`）、`fireSpecial`（`2119`）、`controlPlayer`（玩家存活时的输入冻结）。点击"结束"按钮前必须 `releasePointer()`（`game.js:179`）。
- 世界继续模拟（残骸坠落、爆炸、僚机与敌机照常行动），所以玩家能看到自己是怎么没的。
- **玩家若还活着**（基地失守、旗舰沉没、时限到等）：输入被冻结，飞机交给"平飞自动驾驶"，避免玩家在失败提示下又被打死或又"救回来"。
- **画面**：HUD 压暗用 `HUD.draw` 内局部 `globalAlpha`（`HudFx` 在 `hudOpacity` 之外，不能靠改设置）；相机维持在残骸 / 玩家上方；越界失败时画面已是全黑，提示直接显示在黑屏上。提示面板用 DOM 覆盖层（与 `#pause` 同一套做法，`index.html:~230`），或复用 `HUD.banner`（`hud.js:2129`）。
- **提示面板**：失败原因 + 详情 + `[结束]` 按钮；`FAIL_HOLD_S`（起步 5 s）后自动进入结算，点击按钮可立即进入。需要在进入 `failing` 的瞬间 `releasePointer()`，否则鼠标被锁定点不了按钮。
- 结算页的 `finish(false)` 逻辑不变，只是调用时机推迟；`probe-missions` / `smoke` 里直接调 `m.lose(w)` 的地方不受影响。
- 暂停与 `failing` 的关系：失败提示期间按 `H / Esc` 不弹暂停菜单，直接视为"结束"。
- `Radio` 与 `SysNote` 在 `show(id)` 里被清空（`game.js:202` 一带），所以进入结算页时队列自然清空，不必另写。
- **要同步改的测试**：`tools/smoke.js:3921-3940`（时限到后 126 帧内断言 `activeScreen() === 'scr-debrief'`，是 smoke 里**唯一**的 `scr-debrief` 断言）必须改成"推进 `FAIL_HOLD_S` 或点结束按钮 / 调 `__finish`"；`smoke.js:1633,1639` 与 `probe-missions.js:46` 直接调 `m.lose(w)`，不受影响。`Sim` / `Game.__update`（`game.js:4309`）只看 `state === 'playing'`，`failing` 期间继续运行，正合预期。

**失败时的游戏内无线电**：进入 `failing` 的那一刻，由**游戏内人物的视角**播出一条或多条无线电，描述任务失败、原因与后果，而不是只靠结算页的文字。

- **关卡入口**：`Mission.fail(w, key, params)` 的同一个 `key` 同时指向一组台词 `fail.<key>.radio`（数组，每条 `{ who, tx, gap }`，多条按顺序播）。关卡作者在写失败原因时**同时**写这组台词，缺失时 smoke 报错，保证每个失败原因都有人"说话"。
- **说话人**：由关卡指定（僚机、预警机 SEXTANT、被护卫的舰队、基地指挥……），语气与后果贴合剧情——基地失守是"基地失去联系，……"，旗舰沉没是"旗舰……我们输了"，播种机逃脱是"他们过去了，……"。
- **玩家坠毁 / 被击毁**（没有关卡条件失败时）：只需要短促的惊呼，由僚机或预警机喊，如"VESPER-1 坠毁了！""长机被击落了！"。按 `deathCause.type` 选变体（被击落 / 撞地 / 撞海各 2–3 句），说话人用 `CALLSIGN` 里还活着的僚机优先、否则预警机；都不在则不播，不虚构说话人。
- **走 Radio 2.0**（批次 5）的队列时用 `pri:'story'`；在批次 5 之前用现有的 `Radio.raw`。**不受干扰乱码影响**（失败台词是剧情，不是电台通话的一部分）：`cls` 取 `fx`-类的非乱码通道。
- **时序**：台词在 `failing` 开始时一次性入队；停留时间 `FAIL_HOLD_S` 要**不短于台词播完所需时间**（取 `max(5 s, 台词总时长 + 1 s)`），否则会在台词说到一半时被切到结算页；点"结束"仍可立即跳过，Radio 队列清空。

**验证**：smoke 断言每一关的 `lose()` 为真时 `w.fail` 已设置且键存在、对应台词组存在且非空；Sim 场景覆盖撞地、撞海、被导弹击毁、被炮击毁、基地失守、时限；`failing` 状态下世界继续推进、`FAIL_HOLD_S` 后自动结算、点按钮立即结算（smoke 点击）、玩家存活时输入被冻结。

### 2.2 模型修复

四个子项互不依赖，各自单独发补丁版本（见批次 2 的版本规则）。

#### 2.2a 航母去掉甲板假飞机（v3.1.2）

- **删除范围**：`models.js:1365-1384`，从注释 `// 甲板上的舰载机` 到 `for` 循环的收尾 `}`；`parked`（7 项）与循环变量 `pi / px / pz` 都是 `M.humpback` IIFE（`1325-1388`）的局部变量，无其他引用。`return done(b, {span:40, len:280, ground:true, sea:true, radius:84})`（1387）里的尺寸是写死的，不依赖被删的几何，保留。批次 1 之后该文件为 `models/ships/humpback.js`。
- **同步文字**：`data.js:894` 的 `arms` "舰载机 ×40（含 DB-11）" 与 `data.js:898` 的 `desc`（"四十架舰载机里有相当一部分是 DB-11"）按"机库容纳"重写；`docs/world/SETTING.md:620`（"280 米甲板、四十架舰载机"）与 `:671`（"40 架舰载机"）核对措辞。`js/changelog.js:619` 是旧版本记录，不动。
- **不受影响**：smoke 里解析 `arms` 的正则（`smoke.js:5642-5646`：`近防炮 ×N`、`50 mm 速射炮 ×N` 等）不匹配"舰载机"，改写这一条是安全的；但**不要动** `近防炮 ×4` 与 `50 mm 速射炮 ×2` 两串。smoke 没有对 humpback 顶点 / 面数的断言；`probe-render.js:99` 用的是 bluewhale。
- **验证**：`render-ships.js` 重新出图确认；快照中只有该模型哈希变化。

#### 2.2b 挂载的尾翼 / 弹翼不连接主体（v3.1.3）

- **现象**：挂架上的弹体，其尾翼或弹翼的根部与弹体之间有缝隙，远看像"悬浮"的翼片。
- **目标**：**只求视觉上相接，允许翼根穿入弹体内部**。不做物理意义上的贴合，也不改碰撞与挂载几何，所以不影响判定与平衡。
- **原因**：翼片的根部偏移不是写死的旧半径（`lk.dia` 推出，`hy` 只整体移动弹体）。问题出在 `addRound`（`models.js:1727-1771`）里：
  1. **六边形截面**：弹体是 6 段的 `b.tube`，顶点在 `r`（外接圆）而平面中点只有 `0.866r`；`cross()`（`:1749`）把翼根放在 `r`，所以上下两片翼悬在平面之上约 `0.134r`（直径 0.12 的弹约 1.6 cm，直径 0.42 的约 5.7 cm）；左右两片刚好落在顶点上。**所有约 40 个 `STORE_LOOK`（`data.js:2550-2594`）都有这个缝**。
  2. **`fin === 'cruise'`**（asl、asl2、pgb、lcm）：翼根在高度 `0.6r` 处取 `x = r`，而该高度六边形边只到约 `0.65r`，缝隙约 `0.35r`（5–7 cm）。
  3. **`fin === 'bomb'`**（clb、v30、hbl、hbh）：尾翼从 `r` 起根，但那里是尾锥（半径 `0.35r` 到 `0.7r`），缝隙最大 `0.65r`（`hbh` 约 0.2 m）——这是最明显的一处。
  4. 旧模型：`M.missile`（`:1822`）翼根 0.14 对 `r` 0.14，缝约 2 cm；`M.pod`（`:1850`）边缘翼根 0.28 对尾锥约 0.25，勉强；`M.bomb` 已经埋进去了，无需改。
  - 另外：游戏里**没有挂架（pylon）几何**，只有 `STORE_GAP = 0.08` 的空隙和一根横梁盒，所以不需要"把翼根延伸进挂架"。
- **做法（只改 `addRound`，不逐个武器手调）**：
  1. `cross()` 的翼根改为 `r0 = 0.75r`（落在六边形内：边心距 `0.866r`），翼尖仍在 `r + span`；
  2. `fin === 'bomb'` 的尾翼翼根取 `0.25r`（尾锥处边心距约 `0.30r`）；
  3. `fin === 'cruise'` 的翼根 x 取 `0.5r`，翼尖保持 `r + ws`；
  4. `M.missile`、`M.pod` 的翼根同样改为约 0.75 倍体半径。
  - 翼片是薄的二维片，翼根埋进弹体之后在任何角度都看不到缝，这正是"看起来相接"所需要的。
- **验证**：
  - smoke 新增几何断言：每片翼面的**根部顶点到弹轴的径向距离** ≤ `0.87r`（即不比六边形边心距更远）。直接断言"在弹体内部"对六边形不好写，这个形式更简单；
  - `tools/render-mounts.js` 目前每个用例只有一个方位角（`AZ=0.70`，右前 3/4）和每例可设的 `el`：给用例加一个 `az` 字段，为 `clb / hbh / asl / lcm` 与几个常见弹各出正侧、俯视、仰视、斜后四个视角，目检看不到缝；
  - 黄金回放：挂载与判定不变，只有模型哈希变化。

#### 2.2c 无人机去掉座舱盖（v3.1.4）

- **范围**：**目前只有一个无人机**——`folded_wing`（KA-7，`data.js:331-382`，`npcOnly`，属**上游**）。它的模型 `M.folded_wing` 只被它自己用，所以改模型不会影响别的机型。后续批次 6 的新无人机一律在建模时不建座舱盖。
- **做法**：删掉 `models.js:544` 那一行座舱盖四边形（`M.folded_wing`，`537-546`）。**不需要**让 `seatCanopies`（`:2277`）去读标签：它是加载期的后处理，只负责把已有的座舱盖面贴到机身上，而且模型在 `data.js` 之前加载，根本读不到数据标签；座舱盖面不存在，后处理自然什么也不做。
- **设定文字的一致性**：`data.js:345-346` 的 `desc` 写着机头那一点凸起是"通信天线罩"而不是风挡。删掉之后机头就没有这个凸起了：要么把它改成非座舱盖颜色（`C.dark`）保留这个特征并让文字继续成立，要么改一句 desc。**默认：保留凸起、换成 `C.dark`**。
- **`isDrone` 统一为 `unmanned`**。批次 1 的 `Tags` 机制先建好（目前代码里**没有 `tags` 字段**，也没有 `unmanned`），这一项再用它。需要改动的位置：
  - `missions.js:197`（`spawnWingman` 写 `isDrone: true`）
  - `entities.js:548`（`makeAircraft` 复制 `isDrone: !!o.isDrone`）
  - `game.js:3872`（`killCredit` 读 `kb.isDrone && kb.team === 0`）
  - `tools/smoke.js:6029`、`6076`（两处 `makeAircraft` 调用写入）、`6108`（读 `a.isDrone` 统计僚机）
  - 文档：`systems/entities.md:36、92`、`systems/missions.md:224`
  - smoke 断言旧字段 `isDrone` 不再出现在 `js/` 与 `tools/` 里。
- **验证**：`render-units` 出图确认 `folded_wing` 没有座舱盖；快照中只有该模型哈希变化。

#### 2.2d 机炮曳光弹不再在最顶层绘制（v3.1.5）

- **原因**：`game.js:3664-3667` 先 `Renderer.flush()`，再调 `drawTracers()`（`:3729-3800+`），最后 `Renderer.end()`。`drawTracers` 用 **2D 画布**（`globalCompositeOperation='lighter'`，`moveTo / lineTo / stroke`，再 `arc` 画弹头）画在 WebGL 画面贴到画布**之后**，完全没有深度，所以山后、机身后、海面下的子弹都被画在最上面。`game.js:3662` 附近的注释写明这是故意的（"被机翼挡掉反而看不清"）；`docs/systems/rendering.md:6、62、278` 也记着这一点。**这次是有意改变这个决定**，见下面的风险。
- **WebGL 路径的最小修法（不需要新着色器）**：粒子管线已经支持"拖尾"——`p.streak && p.vel` 的粒子会按 `vel × 0.03` 拉出屏幕空间的条带（`render-env.js:838`，顶点着色器 `:258-278`），渲染状态为深度测试开、`depthMask(false)`、加色混合，片元写 `gl_FragDepth = logDepth(vW)`，所以**与模型和海面做深度测试**。
  - 在 `game.js` 的 `render()` 里，`Renderer.drawParticles(world.particles)` 之前，把每发子弹转成一个合成的拖尾粒子 `{ alive:true, delay:0, life:1, life0:1, alpha:0.9, color:'#ffe496'/'#ff9458', size, pos:b.pos, vel: 方向 × (拖尾长度 / 0.03), streak:true }`，删掉 `drawTracers()` 的调用；
  - `size` 取世界半径，使 `focal × size / z` 等于原来的线宽像素（`lineWidth × wMul / 0.9`），即 `size ≈ lineWidth × wMul × dist / focal / 0.9`；
  - 拖尾长度、枪口钳制、`wMul` 的计算**原样保留**，只是改喂给粒子字段；弹头亮点可再加一个点粒子；
  - 条件与 `render.js:539` 一致：`envGL && gfx.particles && !flushed`，否则走下面的 2D 路径。
  - 注意：云在粒子之前画，且不写深度，所以曳光弹仍会盖在云上，与现有粒子行为一致，不算回退。
- **2D 回退路径**：`flush()`（`render.js:482-540`）按 `f.d` 把 `faceList` 从远到近排序后逐面填充；粒子与曳光弹现在都在 `flush` 之后画，所以在 2D 里同样盖在最上面。
  - 最小做法：给 `getFace`（`render.js:80`，`{d, n, px, py, c, a}`）增加一种面 `f.line`（`x0,y0,x1,y1,w`），`d` 取弹头深度减一个小偏置，`flush` 里遇到它用 `globalCompositeOperation='lighter'` + `stroke()` 画；新增 `Renderer.pushLine(...)`，`game.js` 在同一循环里调用；
  - **更省事的备选**：2D 回退保持现状并在文档里写明（2D 路径本来就把粒子画在最上面，`probe-render.js:9-10` 已承认）。**默认：先做 GL，2D 仅作为可选**。
- **风险与对策**：玩家**自己**的机炮子弹起点在机头前方，通常不会被自己的机翼挡住；若实际出现被遮挡，加一个 `TRACER_OWN_BIAS`（对本机发射的子弹把深度往相机方向偏一点）。
- **验证**：
  - `probe-render` 新增 `env-tracer` 场景（模板是已有的 `env-blast`，"粒子在飞机后面应被遮住"）：子弹在山后 / 机身后，被遮挡部分必须消失；
  - 黄金回放：未开火的场景逐帧不变；
  - 文档：`rendering.md:6、62、278`、`game.md:169、177`（后者引用的拖尾公式 `min(90, max(13, bDist×0.045))` 已过时，一并核对）。

### 2.3 电磁干扰下的无线电乱码

**目标**：被压制时给无人僚机下令，仍播出对应无线电，但文字被星号污染且指令**不生效**；干扰中收到的其他无线电同样乱码。

1. **注入干扰度**：`Radio.setDistortion(fn)`，`fn()` 返回当前玩家 `suppressed`（0–1）。`Game` 初始化时注册。（`Radio` 在 `Game` 前定义，所以用 setter，不让它直接读 `player`。）**乱码施加位置**：`Radio` 内部 `push(L)`（`game.js:45-59`）里写 `innerHTML` 的那一行——台词在队列里保留原文，上屏那一刻才用当时的干扰度处理（`L.cls` 在手），这也与 5.5 的队列设计一致。
2. **过滤函数** `garble(html, k)`：先把字符串按 HTML 标签 / 实体切成"文本段"与"标记段"，只在文本段里**插入**星号（是"插入"而不是"替换"）。插入个数 ≈ `round(k × 字数 / 6)`，位置随机、不连续、不插在标签 / 实体内部。`k < 0.05` 完全不处理（与 HUD 的 JAMMED 阈值一致）。
3. **哪些线被乱码**：`cls ∈ ally / enemy / cmd`。`fx`（系统音）与 SysNote 不处理。
4. **僚机下令**：`setWingCmd`（`game.js:1928`）**已经**在 `suppressed > 0.35` 时弹 SysNote（"数据链被压制。无法给无人僚机下令。"，`:1937`）并直接 `return`，**阈值 0.35 现成正确**。要新增的只有：在 `return` 之前照常 `Radio.raw` 播出指令台词（走乱码）。不写 `ai.cmd`、不确认；SysNote 保留。注意 `updateAewc`（`~2577`）也会调用 `setWingCmd(next)`，但它只在预警机自己没被压制时才运行，不受影响。
5. AWACS 被压制时本来就静默（`updateAewc`），保持。
6. `SFX.radio()` 的噪声脉冲在被压制时加长 / 加重（几行）。

**验证**：smoke 对 `garble` 做性质测试（标签不被破坏、字符数只增不减、`k=0` 恒等）；Sim 场景断言压制下指令不写入、解除后恢复。

### 2.3b 电磁干扰下的假目标

与 2.3 同一个触发源（玩家 `suppressed`），放在一起做。**纯显示层，没有实体**：不进 `world.actors`，不能被锁定、不能被击中、不影响 AI 与胜负。

**现状**：

- "目标框开始闪烁"的那条线**不是武器锁定距离**，而是电子战可见度模型 `Ent.jamRanges(s, surf)`（`entities.js:1915-2000`）：`clear = max(burn, 16000 × (1 − s))`，`hide = clear + max(1500, 10000 × (1 − s))`。`s` 是玩家 `suppressed`；`burn` 是穿透距离，飞机 1800 m（`JAM_BURN_R`），舰船与地面目标 4500 m（`JAM_BURN_SURF`，且 `s` 先乘 `JAM_SURF_K = 0.5`）。`jamDuty(p, e)` 在 `clear` 内为 1、`hide` 外为 0、之间线性下降，`jamShown(p, e, time)`（`~1990`）给出逐帧开 / 关，相位是确定性的 `((time × 1.7 + e.jamPhase) % 1) < duty`。
- **闪烁是整个目标框一起开 / 关**（`hud.js:966` 的 `if (!Ent.jamShown(...)) continue;`），不是只有文字闪。
- 锁定与 Tab 切换目标用的是同一个函数（`jamState === 'clear'`，`game.js:1986、1991、2008`），`updateLock` 一进入非 `clear` 就取消目标（`game.js:2626`）。所以**闪烁带里不可能存在锁定框，只有未锁定的 `drawPlainMark`**。
- `s` 低于 `JAM_MIN`（0.05）时完全没有闪烁；`s = 0.05` 时 `clear` 仍有约 15200 m。
- **`drawPlainMark`（`hud.js:1101-1156`）的内容**：仅当 `dist ≤ 12000` 才画文字，否则只画框。第 1 行 `t.ac.name + ' ' + t.ac.cn`（型号，**身份**）；第 2 行 `t.label`（呼号，**身份**，调暗）；第 3 行距离。舰船第 1 行是 `shipClass`，地面设施 `label || name || '海面设施'`。**没有高度、速度、接近率、动压**——这些只出现在 `drawLockBox`（`hud.js:1163-1292`，仅 `p.target === t` 时画），而它在闪烁带里不会出现。
- 因此"锁定距离外只乱码型号和呼号，距离、动压等客观数据照常"在代码里的含义是：**闪烁带里的 `drawPlainMark`，换掉第 1、2 行，保留第 3 行距离**。动压、速度、高度本来就不会显示在这里，没有什么需要"保持"的。

**设计**：

1. **生成**：新函数 `HUD.drawGhosts`，在 `HUD.draw`（`hud.js:75-116`）里紧跟 `drawTargets` 调用，数据放在 HUD / `HudFx` 内的显示对象表里（`{ pos, vel, life, kind, seed }`），**不碰 `world.actors` / `world.targets`**。数量 `n = round(k × GHOST_MAX)`，`k` 为干扰度（`p.suppressed` 已经传进 HUD，`HudFx.level`（`hudfx.js:98`）已经算 `max(suppressed, ewPower × 0.8)`；`< 0.05` 不出现），`GHOST_MAX` 起步 8；寿命 2–6 s，随机间隔补充，到期渐隐，缓慢漂移（模拟杂波）。
2. **位置约束**：真目标在 `hide` 之外**根本不画**，所以假目标必须放在**闪烁带 `[clear, hide]` 之内**，否则"只有假目标在、真目标不在"会立刻露馅。距离在 `[clear × 1.02, hide]` 内随机（用同一个 `Ent.jamRanges(s, false)`，**共用函数，不各抄一份**），方位随机但偏向真实敌方所在的半球。注意 `s → 1` 时带很窄（约 1800–3300 m），所以干扰越强假目标越贴脸，这是合理的。
3. **显示**：
   - **主屏幕**：用与真目标**同一条绘制路径**（`drawPlainMark(ctx, s, fakeT, dist, false)`，假对象带 `{ kind:'air', ac:{ name, cn }, label, pos }`）；闪烁用同一个 `jamShown` 式的占空比，**不另造动画**；屏外的假目标进入 `drawOffscreen`（`hud.js:1579`，只画箭头加 km 数，不带名字，用 `{ pos, team:1 }` 调用）。
   - **雷达**：`drawBlips`（`hud.js:646`）里敌机红色三角是内联代码（`681-687`），需要抽一个小助手才能复用。**现有雷达噪声**（`jam = max(p.suppressed, ewPower × 0.8)`，对每架敌机以概率 `jam × 0.55` 丢弃、`jam × 9` px 抖动，每帧 `Math.random`，只对飞机、与距离无关，地面目标与舰船没有噪声）原样保留；假目标按同一规则加噪声，雷达量程 12000 m。
   - **Tab / 锁定**：`cycleTarget`（`game.js:1971-2027`）只从 `world.actors` 与 `world.targets` 建表，假目标不在其中，**"Tab 跳过假目标"自动成立**，不用写代码。
3b. **闪烁带内的身份乱码**：对**闪烁带内**画出的所有 `drawPlainMark`（真假一视同仁），第 1、2 行（型号 / 舰级与呼号）换成随机乱码，**第 3 行距离保持真实**（假目标则是它自己伪造的距离）。
   - **格式不变**：乱码保持原字段的字符数与类型（型号位仍是"字母 + 数字 + 连字符"的形状，呼号位仍是"词 + 编号"的形状），只是内容随机，排版上看不出差别；
   - 乱码按 `GHOST_GLITCH_HZ`（起步 4 Hz）刷新，每个框各自有相位，避免整屏同步闪；随机数走私有 PRNG，不进入逻辑状态；
   - 进入 `clear` 后真目标的型号与呼号恢复，也就是**玩家要靠近到能锁定才读得到身份**；假目标在到达 `clear` 之前已消散；
   - 实现：在 `drawPlainMark` 的第 1、2 行取值处插入 `Glitch.identity(kind)`，第 3 行不动；**与 2.3 的无线电星号共用同一个 `suppressed` 触发源**，各自独立实现；
   - `k = 0` 时不乱码、不出现假目标，保持现状。
4. **识破与消失**：假目标不会向玩家接近。玩家**向它飞到 `clear` 以内**，它会在进入前一小段距离时消散（渐隐 0.5 s）。解除干扰（`k` 降到阈值以下）后全部渐隐。
5. **不泄露真信息**：假目标的生成不读取真实敌机位置以外的任何数据；不会出现在已被击毁敌机的位置。
6. **确定性**：假目标与乱码全走私有 PRNG（HUD 在 `Sim` 里是空实现，本来就不进黄金回放）；不改动 `Ent.jam*` 的语义。
7. **验证**：
   - smoke 断言——`k=0` 时假目标数为 0；`k` 增大假目标数单调不减；所有假目标距离在 `[clear, hide]` 内；它们不进入 `world.actors`、`cycleTarget`、`updateLock`；
   - **不要破坏既有断言**：`smoke.js:5262-5340`（`jamState / jamRanges / jamDuty / jamShown / jamLockOK / jamLockK` 与 `__cycleTarget`）与 `smoke.js:5385-5387`（`HudFx` 干扰等级等于 `max(suppressed, ewPower × 0.8)`）。新代码只**调用**这些函数，不改它们；
   - `probe-render` 在 `k = 0.3 / 0.7 / 1.0` 三档出雷达与主屏幕图目检。

> 与批次 5 的关系：AI 的"感知模型"（P5，目前不做）若以后做，可以让**敌方**也被己方干扰机骗出假目标，复用这个模块的生成逻辑。

### 2.4 所有可玩机型各 +1 对挂点

现有 6 个可玩机型的组数与候选位置（"x, y"是右侧点的机体俯视米数，来自模型射线检测；最终坐标必须落在机体下表面，`smoke.js:2374` 会校验 ≈0.25 m 内）：

| 机型 | 现有组 | 新增一对（候选） | 备注 |
|---|---|---|---|
| frigatebird DB-11 | A 轻 (0.85, 2.6)、B 重 (1.85, −0.6)、C 腹 (0.45, −1.0) | 机身后侧 (0.95, −3.2)（就是以前去掉的 D 对） | 外翼会摆动，**不要**放 x > 3 |
| sailfish D-14 | A 重 (2.6, −2.3)、B 轻 (4.2, −4.2)、C 腹 (0.95, −4.2) | 翼尖 (6.0, −5.6) | 或内侧 (3.4, −1.0) |
| booby G-6 | A 重 (3.8, −0.4)、B 轻 (6.2, −1.0)、C 轻 (7.8, −1.05) | 腹部 (0.9, 1.0) | 机翼已很密 |
| petrel F-9 | A 重 (3.0, −3.0)、B 轻 (5.0, −5.3) | (4.0, −4.0) 或翼尖 (6.2, −6.8) | 只有两组，补一个重挂更有意义 |
| skua D-21 | A 腹舱 (1.1, −2.2) expose 0、B 轻 (3.6, −3.4) | 外挂 (5.4, −3.6) 或第二内舱 (1.1, −5.0) | 隐身机：外挂会增加 RCS，**是取舍而不是缺陷**；内舱则无代价。建议外挂 |
| albatross D-33 | A 重 (3.0, −1.8)、B 轻 (5.2, −0.3)、C 翼尖 (7.4, 1.0) | 内侧 (1.7, −3.0) 或外侧 (6.4, 0.5) | |

每个机型还要同步：`defaultLoadout`（给新组一个默认值或留空）、`maxLoad`（核对不超重）、`planform.js`（直接画 `pts`）、`desc` / 文本里的挂点数、`loadout.md` 的组数表。顺带修正 `loadout.md` 中"DB-11 有 4 组"的陈旧描述（数据里是 3 组）。

**平衡**：同种武器占多组会累加弹药与齐射数，所以每机型的 `maxLoad` 是真正的上限；新增一对后若总弹药明显变多，用 `probe-balance` 比对各机型"满载弹药数 / 重量惩罚"。这些机型只用于玩家，不影响 NPC 挂载。

### 2.5 重型轰炸机（ROK-40 `boulder`）重做

**调查结果与草稿的出入**：实测模型 46 m（翼展）× 44.2 m（机长），战斗机 13–17 m 翼展 × 19–23 m 机长。翼展比约 3 倍、机长比约 2 倍。真实世界（B-1B 对 F-16）机长约 2.8 倍、翼展约 3–4 倍。**机长偏短，翼展大致合理**，所以草稿的"尺寸不符合现实"主要是机身偏短、不显得"重"。

1. **尺寸**：机长拉到约 58 m、翼展约 54 m（≈ ×1.25，不是整体放大），机身更细长。尺寸已定。
2. **命中半径**：所有飞机统一用 `HIT_R_AIR = 7.5`。机体放大后会显得"打偏也算中"或"贴着机翼不算中"。新增机型字段 `hitR`（缺省 7.5），重轰设 11–12，并相应调 `hp`（起步 420 保持，靠更大靶面自然变脆）。
3. **挂点**：炸弹舱 4 点（沿机身前后两对，间距 ≥ 3 m）、翼下 4 点（两对）。组 id 由 `A / B` 改成 `A1 A2 / B1 B2`；**所有指定了 boulder `loadout` 的关卡要同步改**（m2、m8 等），否则会进 `Ent.mountIssues` 被 smoke 拦下。
4. **弹药上限**：NPC 的弹药池是 `min(w.ammo, 点数 × perPoint)`，点数翻倍会让轰炸机带的炸弹翻倍，直接改变 m2 / m8 的难度。批次内先把 `perPoint` 折半抵消，再用 Sim 的"基地被炸到失守要多久"场景（2-0IMPL 2.5.1 已有）校验。
5. **连带单位**：`quartz`（ROK-2 预警机）与 `lodestone`（ROK-44 干扰机）共用 `boulder` 模型，一起变大；它们各有一个腹部组，坐标按新尺寸重算。尾炮 `tail20a`（`data.js:1506`，`[0,0.4,−22.2]`）后移到新机尾。
6. 模型、俯视图（`planform.js`）、图鉴、详情页同步。
7. ROK-44理论上和ROK-40是同一机体，也做相同改动。


**验证**：`render-units` 出图；smoke 的挂点下表面检查；`probe-missions` 与 Sim 的 m2 / m8 场景；碰撞半径改动后用 `probe-balance` 看对机炮命中率的影响。

### 2.6 存档

DESIGN.md §8 已知问题第 4 条：`cleared` 只在内存里，刷新就丢。批次 10 的新战役一定会让这变得难受。

**现状**：**设置已经持久化了**——`SET_KEY = 'monsoonline.settings.v1'`（`game.js:214`），`loadSettings`（`291-309`）在 `try / catch` 里把保存值合并到 `DEFAULTS` 上（`hasOwnProperty` 过滤，"无痕模式或禁用存储时静默降级"），`saveSettings`（`310-312`）在 `onSettingChanged` 里调用。这是 `js/` 里**唯一**用到 `localStorage` 的地方，smoke 的 `localStorage` 桩已有（`smoke.js:243-249`）。所以 2.6 **不是"新增设置存档"**，只新增两样：

- `cleared`（`game.js:151`）：`{ [MISSIONS[i].id]: true }`，只在 `finish(win)`（`:3881`）写入、`1151` 与 `1231-1232` 读取；现在注释写的是"本次会话内已完成的任务"。按任务 id 记，id 稳定，批次 1 重排下标也不受影响。
- `loadouts`（`game.js:108`）：`{ [acId]: { [groupId]: weaponId | null } }`，由 `getLoadout(ac)`（`790-801`）惰性生成。存下来的挂载可能引用已被移除的武器 / 挂点组，**读取时必须用 `canCarry` / `Ent.fitsKind`（`preflight` 在 `game.js:4096+` 用的同一套）校验**，不合法的条目回退到 `defaultLoadout`。批次 2.4 给机型加一对挂点后，旧存档里缺这一组，同样靠回退处理。

**做法**：沿用设置的写法（`try / catch` 静默降级），新键 `monsoonline.save.v1`（内含 `{ v:1, cleared, loadouts }`），与设置键分开；读到不认识的版本号就忽略。smoke 补两条：存取往返、坏数据 / 缺 `localStorage` 时不抛。半天的活，没有技术债。

### 2.7 验证与发版

- 每项的验证只跑该项相关的探针，加上 `smoke` 与 `probe-missions`；不做"批次末统一回归"之外的额外验证。
- 文档：`weapons.md`（重轰挂点）、`loadout.md`（组数表）、`game.md`（debrief、Radio）、`missions.md`（`Mission.fail` 约定）、`models.md`。
- 每项在 2.1–2.6 各自的发版步骤里写 changelog；2.7 不单独发版。

---

## 批次 3 · v3.2 光标越极点与关卡天色

两项都只动相机 / 渲染环境，放一起方便目视验。

### 3.1 光标穿过上下极点

**为什么现在有 89° 限位**：相机 `up` 恒为 `(0,1,0)`，`fwd` 接近竖直时正交化后 `|up| = cos(俯仰)`，90° 时退化（DESIGN.md 变更记录 78°→89°）。同时 `camPitchFor` 把天顶压到画面上缘，导致相机最多抬到 62°（FOV 56）。

**根本解法**：不再靠 `up=(0,1,0)` 做叉乘，而是**用 (yaw Y, pitch P) 直接写出相机基**：

```
fwd   = ( sinY·cosP,  sinP,  cosY·cosP )
right = ( cosY,       0,    −sinY      )     // 恒水平 → 相机永不滚转，地平线永远水平
up    = (−sinY·sinP,  cosP, −cosY·sinP )
```

P = 90° 时 `up = (−sinY, 0, −cosY)`，模长仍为 1、方向由 Y 决定，**没有退化**。`Renderer.setCamera(pos, fwd, up, fov)` 本来就接受显式 `up`，GL 与 2D 两条路径都不用改接口。"镜头保持水平"这条基础规则不仅没破坏，反而因为 `right.y ≡ 0` 变成构造上的恒等式。

**光标层**（`game.js:117-120/1880-1897`）：

- `aimPitch` 允许走到 (−π, π]（越过 ±90° 即"过顶"），`aimYaw` 照旧无界。`aimDirNow()` 的公式 `V(sinY·cosP, sinP, cosY·cosP)` **本来就对这个范围成立**（`cosP < 0` 时水平分量反向），所以 `p.aimDir`、`AI.steerTo`、HUD 光标圈都不用动。
- 鼠标输入：`yaw += s · mx · k`，`s = sign(cosP)`；`pitch −= my · k`，回绕到 (−π, π]。`s` 的作用是让"鼠标右移"在过顶后仍然是"光标在屏幕上右移"。
- **折回**：相机转完（见下）后，把光标表示整体折回规范形——`yaw += π; pitch = π − pitch`——此时 `s` 回到 +1。这只是换参数化，方向向量不变，玩家看不到。

**相机层**（`game.js:3140-3290`）：

- 输入是一个观察向量 `d`（鼠标瞄准时是 `aimDir`，否则是 `p.fwd`——两种模式统一）。`P = asin(d.y)`，范围 [−90°, 90°]，不再夹 89°，删除 `CAM_PITCH_LIM`、`AIM_PITCH_LIM` 及 `camPitchFor` 的天顶重映射。
- `Y` 的目标 = `atan2(d.x, d.z)`；水平分量 `|d_h| < POLE_HOLD`（起步 sin 3°）时**冻结目标不更新**——这就是"穿越极点后的一个极小延迟"。越出冻结区后目标可能差 π，以**定速** `POLE_SWING_RATE`（起步 5 rad/s，约 0.6 s 转半圈）平滑转过去，而不是用现有的指数平滑（它在大角度时开头太猛）。
- 因为 P 在转的过程中保持在 ≈90°，这一转看起来就是"绕竖直轴自转"，没有任何临界反弹。
- 相机位置偏移（`-camDir*(camDist+speedBack)`）在 P→90° 时相机会跑到机体正下方、画面中心被机腹占满。需要给"抬头取景"单独调：当 P > 70° 时把相机向后 / 向上的偏移混合到水平方向（`framing helpers` 已有，加一个 P 的权重）。**这是全项最需要在浏览器里反复调的点**，先做原型。

**其它读取点核对**：`resetAim`（`game.js:2311`）用 atan2 / asin 重置，需要支持 P ∈ (−π, π]；HUD `drawBoresight`、圈位置都读向量，安全；2D 回退 `Renderer` 的地平线计算在 P=±90° 附近要检查有无 tan 爆炸，必要时回退路径仍把 P 夹到 ±89.5°（GL 是默认实现）。

**验证**：

- smoke / Sim：纯函数 `Camera.basis(Y,P)` 单测——任意 (Y,P) 下三向量正交单位、`right.y == 0`、无 NaN。
- 脚本化鼠标扫过 ±90°：断言光标向量连续、`Y` 目标只在冻结区之外才变化、折回前后 `aimDir` 不变、`steerTo` 输出连续。
- 视觉：`probe-render`（2D 路径）在 P = 80°、89°、90°、过顶后的若干 Y 下出图；手动：浏览器里反复拉过极点，看有无跳变，鼠标左右在过顶前后方向是否一致。
- 键盘模式（`p.fwd`）做一次筋斗，确认相机跟随不抖。

**文档**：`game.md` 的相机一节重写；DESIGN.md §5.3 的"相机不跟随滚转"补充"构造上恒水平"的新理由，并把 89° 的变更记录标为"已被取代"。

### 3.2 关卡时间与天色

**目标**：每关设定一天中的时刻，太阳位置、天空、海面、雾、云色随之变化；不做夜战。

**数据**：`mission.time = { hour: 15.5 }`（当地太阳时，缺省 = 现有外观）；`mission.sun` 可选，直接给 `{az, el}` 覆盖。纬度取设定的北纬 12°，赤纬近似春分（日出日落近 6 / 18 点）。

**环境预设**（按太阳高度插值的关键帧，起步 4 个）：正午（el > 50°）、上午 / 午后（25–50°）、金色时段（5–25°）、黄昏（−2°–5°，天空偏暖、海面暗、雾偏紫）。每个关键帧含：`light` 方向与强度、天空渐变 stops、太阳盘、海面 stops 与 glint、雾色、云色、模型的环境光下限（低太阳角时 `0.44 + 0.56|n·L|` 的 0.44 要抬高，否则背光面全黑）。

**落点**：

1. 新 `Shading.setEnv(env)`：**原地修改** `S.LIGHT.x/y/z`、`S.SKY`、`S.SEA`、`S.FOG_RGB`、`S.CLOUD`（`S.LIGHT` 不能重新赋值，`brightness` 闭包持有同一对象），并递增 `S.envVersion`。
2. GL：`render-env.js:586` 的 `flatStops(...)` 改为"`envVersion` 变化时重建"；云遍里 `S.SKY.stops[0][1]` 的雾色引用保持。
3. 2D 回退：`render.js:195-208` 写死的天空色与 `LIGHT` 引用改读 `Shading`；`render.js:20` 在加载时捕获的雾常量改成读 `Shading`；亮度 / 雾量化缓存在 `envVersion` 变化时清空。
4. `unitview.js:35` 那份光向**故意不跟随**（资料库预览需要稳定的打光），加注释说明，并读 `Shading.DEFAULT_LIGHT` 而不是另抄一份。
5. HUD：低太阳角时检查绿色 HUD 在暖色天空下的对比度（`hudOpacity` 不够就加描边）。
6. 缺省预设与现有常量**逐值相等**，所以没写 `time` 的关卡画面不变（`probe-render` 逐像素验证）。

**各关取值**：数据只加字段，先全部沿用缺省；真正给各关定时刻放到批次 8 随剧情一起做。

**验证**：`probe-render` 缺省相等；4 个预设在 GL 与 2D 各出图目检；smoke 断言 `setEnv` 后 `S.LIGHT` 仍是同一对象。

### 3.3 过失速机动（PSM，玩家侧）

**现状**：

- `stepAircraft`（`entities.js:678-870`）里**没有攻角、升力系数、阻力系数、质量、推力、燃油这些概念**。姿态靠 `a.ctrl.pitch/roll/yaw × 控制权限 × dt` 直接转；速度靠"目标速度 `vTarget` 加 `accel / decel` 一阶趋近 + 重力沿航迹分量 + 转弯掉速 `TURN_BLEED = 0.20`"。现有模型没有升力，PSM 的 `CL(α) / CD(α)` 是**全新**的。
- "`vel = fwd × speed`、无侧滑"**基本成立但有一个例外**：失速时的**下沉项** `a.sink`（`entities.js:826-840`，`speed < vStall` 时累积，最大 140 m/s，脱离失速后以 0.9 s 衰减）让 `vel.y -= sink`，这是现有唯一"速度与机头不一致"的机制。PSM 的速度解耦可以参考它的写法。
- 失速时控制权限乘 0.34（`entities.js:711`），另有低头力矩 `1.2 × st × dt`（只在 `pos.y > 60`，`:750-755`）。控制权限由 `ctrlFactor`（`:70-74`，`clamp(q / ctrlFull, ctrlFloor, 1)`）给出，写进 `a.ctrlAuth`，`AI.steerTo` 与 HUD 的 P/R/Y 读它。
- **没有过载上限**：`gLoad` 只是玩家 G 键的倍率（上限 `HIG_MAX = 1.90`，`game.js:138`，模型内夹到 2.3），没有 `maxG` 或转弯率表。
- **不存在** `stepVtol`、`noPSM` 标签、VTOL，也没有 `engine/entities/` 目录（代码是 `js/entities.js` 一个文件；该目录是批次 1 的产物）。`noPSM` 标签在本批通过批次 1 的 `Tags` 引入，缺省所有机型可用，VTOL（批次 6）加上它。
- **`docs/systems/flight-model.md` 已部分过时**：滚转列与 `data.js` 对不上、失速低头力矩写 0.55 而代码是 1.2、没写 `a.sink`、F-9 `vMax` 写 620 而代码 640。本批改飞行代码时一并校正文档。

**定位**：光标越过极点之后，机体姿态可以指向机头后方，但速度仍沿机头。过失速机动要求**速度矢量与机头解耦**，这是新的物理分支，不能直接在主路径里改。因此做成独立分支 `Ent.stepPSM`（批次 1 之后放 `engine/entities/flight-psm.js`），与批次 6 的 `stepVtol` 同一套隔离做法；`stepAircraft` 主路径不动，不触发 PSM 的场景黄金回放保持逐帧一致。

**触发**：
- **键位**：已列出现有占用——W A S D Q E、Shift、Ctrl、Space、Enter、方向键、F、Tab、R、V、1 2 3、N、G、H、M、Esc。**空闲：B C X Z T Y U I O P J K L 与数字 4–9。推荐 `X`**（或 `C`）。落点：`game.js:1828-1850` 的 keydown 块 + `KEYMAP`（`:434`），`TIPS` / `HELP_ICONS` 另有两张表要同步。
- 门限，全部满足才生效，否则 SysNote 给出原因（"光标在前方，无需过失速" / "高度不足" / "能量不足" / "冷却中"）：
  - 光标方向与机头夹角 > 90°；
  - `agl ≥ PSM_MIN_AGL`（起步 2000 m）；
  - 能量门限 `E = ½v² + g·h ≥ E_min`（代码里**没有现成的能量量**，这是新增的纯函数），`E_min` 由机型 `vStall` 与 `vMax` 推导，保证结束时仍高于失速速度；
  - 不在 `PSM_CD` 冷却内（起步 10 s）；
  - 机型未带 `noPSM` 标签。

**过程（三段，由控制律自动推进，玩家在此期间不能手动转向）**：
1. **拉升段**：机头以 `PSM_MAX_RATE` 上仰，攻角 α 由 0 升到 60–90°。
2. **过顶 / 回转段**：机头沿 `aimDir` 所在平面转向，速度矢量在阻力与升力作用下滞后，逐步被拉向机头方向。
3. **收敛段**：机头进入光标 ±`PSM_ALIGN_DEG`（起步 3°）并保持 `PSM_HOLD_S`（起步 0.3 s），结束，回到常规控制。

- **光标中途移动**：机头目标每帧读取当前 `aimDir`，所以过程中移动光标会改变目标——"直到指向光标所在"按字面执行。
- **接入点**：玩家侧在 `controlPlayer`（`game.js:2346-2431`）里，`c.pitch/roll/yaw` 写完之后（`:2376-2383`）、油门处理之前加 PSM 分支并覆盖 `c.*`；`stepAircraft` 只通过 `a.ctrl` 读输入，所以 `ctrl` 是唯一咽喉。**`player.ctrl` 是持久对象，分支不写时会残留旧值，PSM 结束时要清零。**
- **控制律**：`AI.steerTo(a, desired, out, st, dt)`（`ai.js:~198-380`）本来就能驱动玩家（`updateMouseAim` 就是这么用的），能处理"目标在机后"的退化方位。它**没有每轴速率上限参数**——速率来自 `a.phys` 与 `a.ctrlAuth`，增益 `K_ROLL = 5 / K_PITCH = 3.2 / K_YAW = 3.2`，俯仰偏航夹在 ±1。PSM 想降低高攻角下的舵效，做法是传一份临时缩放的 `ctrlAuth`（`loadoutPenalty` 已经用"临时 `phys` 副本"的先例），或对 `out` 做后乘。

**物理（分支内部，全部为新写）**：
- **以 `vStall` 为基准归一化**，不引入现实的质量和推力：
  - 推力加速度 `a_T = p.accel × PSM_THRUST_K × fwd`（`PSM_THRUST_K` 起步 0.6）；
  - 升力加速度 `a_L = G × (v / vStall)² × CLrel(α) × n̂`，`n̂` 为垂直于速度、朝机体上方的单位向量，`CLrel(α_stall) = 1`（即定义为"在 `vStall` 且处于临界攻角时升力等于 1 g"，与现有失速定义一致）；
  - 阻力加速度 `a_D = (p.decel / vRef²) × v² × CDrel(α) × (−v̂)`，`CDrel(0) = 1`，随 α 增大，90° 时约 4–6 倍（平板）；
  - 加上重力。`CLrel` 取值：α ≤ 临界角（起步 20°）线性上升到 1，20°–35° 为峰值 1.0–1.15，35°–90° 缓降到约 0.55，90° 以上按 |α| 对称。
- 与现有失速的关系：常规失速（`speed < vStall`）仍由原逻辑处理；过失速分支只在 PSM 状态内生效。退出后回到原模型，并附加 0.8 s 的低舵效恢复（与现有失速的 0.34 同量级），避免出口突然满舵；退出时把 `a.vel` 重新投影回 `fwd`，保证出口速度连续（`speed = |vel|`）。

**中止条件**（任一即退出，并把机头拉平）：
- 速度 < `PSM_MIN_SPEED`（起步 `0.8 × vStall`）；
- `agl < PSM_SAFE_AGL`（起步 600 m）且仍在下降：强制进入"拉平"子模式，屏蔽 PSM 直到脱离低空；
- 玩家再次按 `PSM_KEY`（主动中止）；
- 被击毁。

**受伤不中止**：过程中受伤只记录，不改变轨迹。

**能量代价**：结束时报告能量损失百分比 `E_end / E_start`，写入战报的机动统计（"过失速 × 次，平均能量损失 x%"），既是玩家反馈，也是 AI 评估依据（见 5.8）。

**HUD**：
- 状态与冷却文字走**告警栈**：`ALERT_ORDER` 与列表在 `hud.js:1751-1776`，插入一个 `'psm'` 条目；smoke 断言 `stall` 排在 `lowq` 之前（`smoke.js:~4168-4179`），插入时**不要改变这两项的相对顺序**；
- 能量条放在 G 表旁（`hud.js:326-335`），攻角仪表是**新绘制**（刻度 30 / 60 / 90°），只在 PSM 状态或冷却中显示；
- RWR 没有任何与机动相关的钩子，AI 做 PSM 时的"高攻角机动"提示（5.8）是新增显示；
- CMD 光标圈保持原样，过程中作为机头目标的可视参照。

**相机**：PSM 期间沿用批次 3.1 的 `aimDir` 跟随；光标在后方时相机会经过竖直方向，这正是 3.1 要验证的场景。

**不适用**：VTOL（`noPSM`）。玩家无人僚机不由玩家触发，只按 AI 规则使用（5.8）。

**不能被打破的既有断言（已列出，新分支默认关闭则全部不受影响）**：`smoke.js:559-697`（`stepAircraft` 逐帧计数）、`1133-1200` 与 `1878-2000`（`steerTo` 连续分配、垂直与倒飞）、`1939-1960`（抬头失速必须下坠）、`2681-2701`（`ctrlFactor`）、`4342-4393`（升限探测）、`4532-4538`（`loadoutPenalty` 恒等）、`3367-3440`（HUD 油门条）。

**验证**：
- Sim 新探针 `tools/probe-psm.js`：从 500 m/s、3000 m 高度触发，光标在正后方；断言收敛时间有界、α 峰值 ≤ 100°、无 NaN、速度损失落在设计区间；
- 光标中途移动（±60°）：断言仍收敛到新方向；
- 门限：低高度、低能量、冷却中、光标在前方，各自被拒绝并给出对应 SysNote；
- 中止路径：速度低于阈值、低空下降、主动中止，各自回到常规飞行且无突跳；
- 数值稳定：dt = 0.02 / 0.05 两种步长下收敛结果一致（相对误差 ≤ 5%）；
- 黄金回放：不触发 PSM 的全部场景与现状逐帧相等；
- smoke：门限断言、`noPSM` 标签断言。

### 3.4 发版

文档：`game.md`（相机）、`rendering.md`（环境预设）、`missions.md`（`time / sun` 字段）。发 v3.2。

---

## 批次 4 · v3.3 地图边界与整备点

两者相辅相成：边界要有"可以去的后方"，整备点要有"不能无限跑远"的约束；批次 5 的撤离同时依赖它们。

### 4.1 地图边界

**数据**：`mission.arena = { cx, cz, half, warn }`（世界米；方形，`half` 是真边界到中心的距离，`warn` 是警告区宽度）。

**先测再定**：各关没有声明范围（玩家 z −2000…−19000、敌 +20…+34 km、x 到 ±10 km、调节单元场 30 km 网格、AEWC −34 km）。先写 `tools/probe-extent.js`（Sim）：开每一关，统计所有出生单位与航线点的外包盒，输出建议值 = 外包盒 + 余量（余量 ≥ 一次追击超调，起步 8 km；警告区起步 6 km）。各关的最终值写进关卡文件，随批次评审。

**新模块 `engine/world/arena.js`**：`Arena.state(pos)` → `{ zone: 'in' | 'warn' | 'out', depth, edgeDist }`（`depth` 为进入警告 / 越界的 0–1 进度）。

**玩家侧表现**：

| 阶段 | 表现 |
|---|---|
| 接近边界（雷达量程内） | 小地图画出边界：警告线为**单斜线**，真边界为**交叉斜线**，裁剪在雷达圆内 |
| 进入警告区 | 告警栈出现"离开战区"（限频），一条无线电（指挥频道，台词多变体） |
| 越过真边界 | `HudFx` 的全屏层把画面渐黑，`ARENA_FADE_S`（起步 8 s）到全黑；中途回到界内则以同样速度恢复 |
| 全黑 | 进入失败流程（批次 2 的 `failing` 停留画面），失败原因 `fail.arena`；提示直接显示在黑屏上 |

**AI 侧**：不撤离的 AI 在警告区内叠加一个朝中心的软转向（权重随深度增加），避免追击超调飞出去；沿航线飞出去的轰炸机（`escaped`）不受影响；僚机跟随长机，不单独处理。撤离单位的"允许出界并被移除"留给批次 5。

**验证**：Sim 场景——玩家直线飞出，断言渐黑时序与失败；中途折返断言恢复；AI 8v8 场景断言无单位持续越界；smoke 断言每一关都有 `arena` 且出生单位全在界内。

### 4.2 整备点

**数据与标签**：

- 单位标签 `resupply`（先给 `humpback`、各 `PLATFORMS`、批次 6 的航空巡洋舰）。
- 关卡声明：`mission.resupply = [{ ref:'carrierA', r:1500, hold:4, uses:2, swap:true }]`，`ref` 指向关卡里的一个我方单位。只有 team 0 的单位生效。

**玩家流程**（新模块 `engine/world/resupply.js`）：

1. 在 `3 × r` 以内告警栏开始显示距离（非警告配色，青色），进入 `r` 后显示"整备中 n/hold s"，驻留计时累加，离开则清零。判定只看**水平距离**，另有可选高度上限 `maxAlt`。
2. 计时满：**暂停游戏时间**（沿用 `paused` 的跳过 `update` 机制，另设 `rearmOpen` 标志，输入处理同样屏蔽），弹出整备界面。
3. 界面：只含俯视缩略图、属性条、挂载选择（`swap:false` 的关卡跳过界面，直接补满）。**复用机库的构建函数**——这就是批次 1.7 要求它们接受根容器参数的原因；`PLANFORM.draw(cv, ac, lo, group)` 本来就接受 canvas 参数。
4. 确认：`Loadout.apply(player, lo, { refill:true })` + `hp = maxHp` + 机炮 + 干扰弹（`flares` 含吊舱加成、`flareCd = 0`）+ 清除失速与损伤状态 + `syncWeapon`。所有弹药一律补满。
5. `uses` 用尽后该整备点只提示"补给耗尽"。
6. 玩家被导弹追踪（来袭导弹 < 6 km）时不能开始整备，告警栏提示"规避中无法整备"——防止拿它当暂停键躲导弹。
7. 雷达上用淡青圈标出整备触发范围。
8. 战报新增"整备次数"一行。

**边界情况**：整备时间冻结，`timeLimit` 不走；整备界面里换了挂载，`loadModel / loadFactor / armor / stealth / lockRangeK / ecm` 都要重算——所以必须走 `Loadout.apply` 而不是再写一份。

**NPC 整备**：批次 5 与撤离一起做（"水平距离入界瞬间补满"，调用 `buildNpcMounts` 重建）。本批只留好 `Resupply.applyNpc` 的接口占位。**注意**：`buildNpcMounts`（`entities.js:305`）是 `Ent` 闭包里的**私有函数**，只由 `makeAircraft`（`:644`，`!a.isPlayer`）调用，且 `ammoPool` 仅在缺失时才初始化；整备要先把它导出成 `Ent.rebuildMounts(a, { refill:true })`，并核实重复调用会重置而不是追加 `slotCd / ammoPool`。

**验证**：Sim 场景——放入范围、推进、断言弹药与 `startMission` 初始值**逐项相等**；换挂载后的弹药 / 质量与机库一致；`uses` 计数；规避中拒绝。smoke 点击整备界面。`probe-missions`。

### 4.3 文档与发版

`missions.md`（`arena / resupply` 字段、各关取值表）、`hud.md`（雷达边界、告警）、`game.md`（暂停与整备）、`loadout.md`（`Loadout.apply`）。发 v3.3。

---

## 批次 5 · v3.4 AI 强化与半主动雷达弹

### 5.0 前置：把 `ai.js` 的 `update()` 拆成三层

现在的 `update()`（`ai.js:591`）把感知、决策、机动揉在一起，而且只有三个模式（`pursue / evade / extend`）。拆成：

1. **感知**：来袭导弹、RWR、目标列表、友军位置、弹药状态。
2. **决策**：输出一个 `plan = { mode, target, goal }`。模式扩充为 `pursue / evade / extend / standoff / closeIn / retreat / support / escort`。
3. **机动**：把现有的 `pursue()`、规避等变成可替换的"机动库"（`ai/maneuvers/*.js`：高位 / 低位 yo-yo、剪刀、桶滚、分离转弯、凹口机动…），每个机动是一个小文件，按技能挑选。

模式切换点今天散在 `ai.js:656-670`、`768-865`，要统一收进决策层，才能让新战术只加一个文件。

**现状**：这个"机动库"目前**不存在**——AI 只有 `'pursue' | 'evade' | 'extend'` 三个模式加一个基于角色的编队分支，全部在 `ai.js:758-860` 的"4. 分派行为"链里，输出 `{ dir, throttle, ab }` 后统一写进 `a.ctrl`、`a.throttle`、`a.ab`（`ai.js:901-902` 是战斗 AI 唯一的写入点）。**之后还要过三道覆盖**：`clampCeiling`（`~549-567`）、垂直恢复 `vertRecover`（`~870-880`，`fwd.y > 0.82` 且速度低于 `1.5 × vStall`）、近地保护（`agl < 420`，`~893`）。任何会把机头拉得很陡或贴地飞的新机动（PSM、低空突防）**必须跳过**这三道覆盖，否则会被它们抵消。新增一个机动 = 在这条链里加一个 `else if` 分支并显式声明它跳过哪些覆盖。

### 5.1 AI 飞行员技能值

- 现有 `ai.skill`（0–1，缺省 0.55–0.6）保留为总量，新增只读派生项 `aggr`（攻击欲望）与 `flair`（动作花样）。可选标签 `ace` 把三项整体上调。
- **把魔数提成参数表**（`AI.SKILL`）：重选目标间隔（`ai.js:705`）、机炮锥（`941`）、射击意愿 `0.35 + 0.45·skill`（`1011`）、包线选择（`1008`）、抗电子战（`650`）、**提前量折扣 0.85**（`1036`，现在与技能无关）。
- 新增依赖技能的项：规避动作选择（低技能只会硬拉，高技能会按来袭导弹类型选凹口 / 桶滚 / 抛干扰弹时机）、汇合方式（低技能直接追尾，高技能利用 yo-yo 转入内侧）、被咬尾时的反应、干扰弹投放时机。
- 技能档（起步）：新手 0.35、普通 0.55、老手 0.72、王牌 0.9。关卡 `spawnEnemy({ skill })` 照旧；`ace:true` 同时给呼号和专属无线电。
- **约束**：AI 始终通过 `AI.steerTo` 驱动，受同样的控制权限限制，"更华丽"靠机动选择与时机，不靠开挂。
- 全局难度选项（提案 P3）**未采纳**，本批不做。技能值已经集中成 `AI.SKILL` 参数表，以后要加难度只需平移这张表，不会留债。

### 5.2 脱离战场与回头再战（反"挤成一团"）

**武器分类**：每架 AI 在出生 / 整备后统计 `longRange`（最大包线 > 约 8 km 的导弹）、`shortRange`（格斗弹）、`gunOnly`。

| 配置 | 行为 |
|---|---|
| 只有远程弹 | 齐射后**外围游走**（`standoff`）：转向离开，沿以战场为中心、半径 `R_s` 的环盘旋；满足回头条件再进攻；弹药耗尽后转撤离（5.4） |
| 远程 + 格斗 | 齐射后继续接近（`closeIn`），沿途按包线开火，进入狗斗；满足脱离条件后再次 `standoff` |
| 只有格斗 / 机炮 | 现有追击，但加**分散力**与目标分配（见下），不成团 |

- **回头条件**：目标离开 / 友机已吸引目标注意力、自己速度回到角速度最佳区间、冷却完成、有新导弹可发。
- **脱离条件**（`closeIn → standoff`）：能量过低（速度 < 角点速度 × 系数且高度不足）、被咬尾且无友机支援、hp 低于阈值、狗斗持续超过 `T_furball`（起步 25 s，防止永远缠斗）。
- **目标分配（轻量 Director）**：0.5 s 节拍的 `ai/director.js`，为每架 AI 选目标时对"已被他人盯着的目标"加惩罚，避免所有人扑同一架；并给出"环上扇区"，让外围游走的各机分布在不同方位。

### 5.3 非僚机友军的独立 AI

- 新角色 `ally`（现在 `role:'wingman'` 的分支是死代码，一并清理）：不跟随玩家，由 Director 分派**扇区**——选取敌方密集、且离玩家 ≥ 6 km 的区域；每 8–15 s 随机重评估（"随机应变"）。
- **不抢人头**：与玩家距离 < 3 km 时叠加排斥；对"玩家当前锁定且已进入包线"的目标不开火。
- 被攻击时可以呼救、也会被 Director 重分配去支援（这才是"让战场活起来"的基础）。
- 战果归入现有"友军击落"一行（`killCredit`），不进综合评定。

### 5.4 撤离能力

**触发（状态变化触发 + 延迟判定，不按秒计算）**：

- **事件源**：只在状态**发生变化**时登记一次"待评估"，不做周期性概率判断。
  - 生命事件：每次受到伤害后。飞机的 hp 只有一个咽喉，`Ent.damage(ent, amt, world, source)`（`entities.js:2662-2675`，减 hp、写 `lastHitBy`、必要时 `kill`），子弹、导弹爆炸（经 `Combat.blast → Ent.hitAny`）都走它；`hudfx.js:13` 现在是靠逐帧比较 hp 检测玩家受伤，没有钩子。**在 `Ent.damage` 里登记事件**，事件走现有的 `world.events.push`（`hit` / `wingflare` / `intercept` 已用这个模式，`ai.js:~755`，在 `game.js` 的 `combatEvents` 里消费）。
  - 弹药事件：弹药消耗**分散在两个函数里**——机炮 `fireGun`（`entities.js:2415-2424`，`a.gunAmmo -= n`）与导弹 / 炸弹 `launch`（`game.js:1603-1692`，`actor.spAmmo -= nShot`，`:1691` 回写 `ammoPool`）；干扰弹 `fireEcm`（`game.js:1593`）不计入。**这两处各加一行 `Ent.noteAmmoEvent(a)`**，不做轮询。
  - 弹药状态读取：NPC 的弹药池是 `a.ammoPool = { 武器id: 数量 }` + `a.slotCd = { 武器id: [0 | SLOT_EMPTY…] }`（`buildNpcMounts`，`entities.js:305`，由 `makeAircraft` 在 `:644` 调用），机炮是 `a.gunAmmo`；"除机炮外全空"需要遍历 `ammoPool` 且跳过 `ecm / dew / 吊舱`（`chooseWeapon`，`entities.js:~188` 已有同样的过滤）。HUD 的 WINCHESTER 只检查当前武器（`hud.js:1779`，`gunAmmo <= 0 && spAmmo <= 0`），不能直接拿来当"全空"。
- **延迟 + 合并（防抖）**：登记后启动一个 `RETREAT_EVAL_DELAY`（起步 **2.5 s**）的计时器，**期间的新事件只重置 / 延长计时器、不产生新的评估**。计时器到期时才**读取当时的状态**（hp 比例、弹药池）做**一次**判定。因此机炮连发、被机炮连续打中这类"少量多次"的情形，**整串事件只产生一次判定**，且读的是这一串结束之后的状态。
  - 计时器上限 `RETREAT_EVAL_MAX`（起步 6 s）：持续交火时也保证至少每 6 s 评估一次，不会被无限推迟。
  - 每架 AI 同一时刻最多一个待评估计时器；评估后进入 `RETREAT_COOLDOWN`（起步 8 s）内不再登记同类事件（避免来回抖动）。
- **判定本身**（计时器到期时执行一次）：

| 条件（读取到期时的状态） | 结果 |
|---|---|
| hp 比例 < 35% | 以概率 `p = clamp(0.35 + (0.35 − hpRatio) × 1.2, 0, 0.9)` 决定撤离（起步值） |
| 除机炮外的挂载弹药（含导弹 / 炸弹，不含吊舱 / 干扰 / 激光）全空 | 以概率 `p = 0.6` 决定撤离 |
| **所有武器（含机炮）全空** | 必定撤离（这一条在"弹药事件"评估时直接判，不掷骰） |
| 两个条件同时满足 | 取较大者，不叠加 |
| 无人僚机 | **不独立撤离**：继续跟长机；长机进入 `retreat` 时它们也跟着飞 |
| 带 `noRetreat` 标签（自杀式 / 任务绑定） | 不撤离 |
| `ace` | 概率 × 0.5 |

- 一次判定为"否"之后不会自动重试；只有**新的状态变化事件**才会再次登记评估。所以不存在"每秒都在掷骰、迟早掷中"的累积效应，概率就是这一次的真实概率，调参也直观。
- **与 Chatter 的联动**：评估结果为"撤离"时触发 `rtb`；弹药首次跌到 25% 以下时触发 `bingoAmmo`（同样由弹药事件驱动，各只触发一次）。


**行为** `retreat`：目标航向 = 远离最近敌方质心、朝最近的**出界口**（有友方整备点则优先去整备点，见下）；被追击锁定时照常做规避（现有规避层优先），规避结束后恢复撤离航向（`goal` 输入 + 规避覆盖，而不是把规避并进去）。

**移除**：飞出 `Arena` 的真边界后，**写 `a.alive = false; a.retreated = true`**，沿用 `escaped` 的先例（不计击毁、不进友军损失）。

> **注意（需要处理的坑）**：现有 `win()` 里普遍用 `team===1 && alive` 计数，撤离的敌机会被当成"已清除"；而 `escaped` 还被用作"轰炸机飞完航线离场"的语义。所以：
> 1. 拆开两个字段：`a.leftBy = 'route' | 'retreat'`；
> 2. **关卡级开关** `mission.retreat = 'off' | 'on'`，**缺省 off**。批次 8 逐关审视后再打开；
> 3. 开着时，需要"击毁 N 架"的目标会被敌机撤离绕过——目标文案与 `win()` 要对应（例如改成"击毁或击退"），否则不开；
> 4. Sim 增加"全员撤离"场景，断言每一关要么仍可完成、要么被明确标记为"撤离后算完成"。

**整备点撤离**：存在存活的友方整备点时，友方 AI 改去整备点；水平距离入界 → `Resupply.applyNpc`（`buildNpcMounts` 重建弹药池、`hp = maxHp`）→ 切回 `pursue`。敌方同理（敌方单位的整备点可由关卡给，`resupply.team = 1`）。

### 5.5 Radio 2.0：显示时长与队列

**先于 `Chatter` 做**——台词变多之前，先让 Radio 扛得住。

现状：FIFO，每条显示 5.6 s、同时最多 4 条（超出会挤掉最老的）；**出队间隔不是固定 1.4 s，而是每条台词自己的 `gap` 字段，缺省 1.4，很多台词写的是 0.4–1.2**；没有优先级；`L.tx` 与 `L.who` 是 HTML（`game.js:10-62`、`docs/systems/game.md:486-488`）。`Radio` 是私有 `queue / timer / box / live` 的 IIFE，导出 `{play, raw, update, clear}`；`update(dt)` 由 `game.js:3398` 在"进行中且未暂停"时每帧调用；所有 `Radio.raw / play` 调用点（`setWingCmd`、`launchCall`、`combatEvents`、`missions.js`、`ai.js:471` 经 `world.radio.raw`）签名不变。因为队列、gap、寿命都在这个 IIFE 内部，**优先级队列可以完全在它里面实现**，不影响调用方。`Radio` 在每次 `show(id)` 时清空。

1. **显示时间加长**：每条的存活时间随文字长度变化，`life = clamp(6 + 0.12 × 字数, 7, 14)` s（起步，替换固定 5.6 s）。
2. **成熟的队列**：
   - 每条台词带 `pri`：`story`（剧情脚本，`VOICES` / 关卡 `radio.play` 的默认值）> `player`（玩家指令确认、玩家僚机）> `ally`（友军闲聊）> `chatter`（敌方 / 条件触发的杂项）。
   - **出队节奏**：两条新台词之间至少间隔 `gap = clamp(0.8 + 0.06 × 上一条字数, 1.2, 4)` s，所以**一秒内不会冒出多条**；上一条越长，下一条越晚出现，给玩家读完的时间。
   - **剧情台词不丢**：`story` 永不过期、永不被丢弃。被挤占时，它可以**插到队列里所有低优先级台词之前**，但不打断正在显示的那一条，所以最多延迟"当前这一句"的时间，不会被后面的杂项一直压着（上限由 `STORY_MAX_WAIT` 兜底，起步 4 s，超过则下一个出队的必定是它）。
   - **低优先级可过期**：在队里等待超过 `TTL`（`chatter` 3 s、`ally` 6 s、`player` 10 s）就丢弃，并按"同事件 + 同说话人"去重，避免同一件事被播报两遍。丢弃是**可见的计数**（暂停菜单的记录里仍保留，见下）。
   - 同一说话人的同类事件有冷却，沿用现有的 `CALL_CD` 思路。
3. **"信息不丢失"的兜底**：暂停菜单增加一个"无线电记录"页签，显示最近 30 条（含被丢弃的低优先级，标灰）。几行 DOM，不影响战斗。
4. **与 2.3 乱码的关系**：乱码在**出队、上屏的那一刻**施加（用当时的干扰度），不是入队时，这样排队等待期间干扰状态变了也正确。
5. **接口**：`Radio.play(missionId, evt)` / `Radio.raw(line)` 签名不变，`line.pri` 缺省为 `story`（`raw`）或 `ally`（`Chatter` 来源），旧代码零改动。
6. **验证**：smoke 里一次性入队 30 条混合优先级台词，断言：全部 `story` 按入队顺序出现且无一丢失；任意两条上屏间隔 ≥ `gap`；低优先级超过 `TTL` 被丢弃并记入记录；`story` 的最大等待 ≤ `STORY_MAX_WAIT + 当前一句剩余时间`。

### 5.5b 条件触发的无线电（`Chatter`）

新增 `engine/chatter.js`：事件 → 台词变体，带全局与分说话人的限频；产出的台词走 5.5 的队列（`pri:'ally' / 'chatter'`）。

| 事件 | 来源 | 例 |
|---|---|---|
| `bingoAmmo` | 非机炮弹药 < 25% | "弹药不多了" |
| `winchester` | 全空 | "弹药耗尽，脱离" |
| `rtb` | 进入 `retreat` | "我要撤了" / "损伤严重，退出战斗" |
| `rearmed` | NPC 整备完成 | "补给完毕，回去" |
| `splash` | 我方击杀（`combatEvents`） | "击中，目标下去了" |
| `damaged` | hp 跨越阈值 | "我被击中了" |
| `fox` | NPC 发射（含 Fox 1 / 2 / 3） | **概率触发、刻意稀少**：每次 NPC 发射以 `FOX_CALL_P`（起步 0.12）喊 `launchCall`，同说话人 `FOX_CALL_CD`（起步 20 s）内不重复，全场同时间窗内有上限。目的是烘托战场气氛，**不是向玩家报告**——所以它不保证对应真实威胁，也不带方位信息，走 `pri:'chatter'`（可过期、可被丢弃）。**钩子**：NPC 发射的唯一咽喉是 `world.fireMissile`（`game.js:1471`，里面已有 `if (m && player && actor !== player) SFX.missileAt(...)`），AI（`ai.js:1012`）与航线单位 / 关卡投弹（`route.js:103`）都经过它；它返回导弹对象 `m`，可由 `m.w` 判出 Fox 1 / 2 / 3。**舰船与炮塔（`turret.js`）不经过它**，所以"NPC 发射"不含水面单位的发射。现有 `launchCall`（`game.js:2180-2189`）只给玩家用，冷却是真实时间 `CALL_CD = 3.0`（`performance.now()`）、与导弹无关，NPC 需要新函数并按说话人各自计冷却 |
| `defensive` | 被锁 / 被打 | "有人咬着我" |

- 每种事件至少 3 个变体，按**阵营声线集**（上游 / 下游）与单位类别选择；说话人用单位的呼号（`label`）。
- **现状**：`Chatter` 模块与 `engine/chatter.js` **都还不存在**；代码里只有 `Radio.raw`、`world.radio.play` 与 `w.flags`。`playerHit`（`data.js:3167`）确认无触发，是死数据。条件触发的无线电里目前只有玩家的 `launchCall`、僚机撒干扰弹（`wingflare`，限频 8 s）与友舰近防（`intercept`，8 s）。
- 台词文本都在 `locales/zh-CN/radio.json`（嵌套键，变体用字符串数组），文本分离后加语言只需新增同构目录。

### 5.6 半主动雷达弹（Fox 1）

**设计要点**（照激光导引头现成模板写，`entities.js:1273-1303`）：

- **不新增 `seeker` 值**。保留 `seeker:'radar'`（8 处判断点全部不用改），加标签 `sarh`。
- **引导判定**：每帧检查"发射机存活、目标在发射机的**视场圈**内（用 `w.lockCone`，即 HUD `drawConeCue` 画的那个圈）、发射机没有静默（`emcon`）也没有被压制到失效"。通过则正常制导；不通过则 `m.illumLost = true`——导弹停止转向、沿当前航向飞，但**保留目标引用**，所以发射机重新把目标套进圈内时可以**重新获得引导**（激光导引头已经是这个行为）。
- **视场进出改为事件驱动（`FovWatch`）**：见下方"视场事件化"一节；这里的"每帧检查"替换为订阅 `onExit / onEnter`。
- **宽限**：丢照射超过 `illumGrace`（起步 2.5 s）后永久失去引导，转 `target = null`，与现有导引头丢失处理对齐。
- **起爆**：近炸判据已经要求 `t && m.seekerOn`，保持。
- **箔条**：沿用雷达弹的 `flareRD`。被压制时发射机的照射质量下降（按 `suppressed` 缩小有效圈）。
- **无线电**：`launchCall`（`game.js:2180-2189`）是硬编码 if 链，改成按标签：`sarh → "Fox 1"`，现有 `radar → "Fox 3"`、其余 `"Fox 2"` 保持。
- **HUD**：复活并泛化 `drawLaserStatus`（`hud.js:1000-1040`，目前休眠），显示"照射保持 / ✕ 照射中断（x.x s）"；`drawConeCue` 的圈在有半主动弹在途时改成实线醒目色。
- **对手视角**：发射机持续照射，被打的一方 RWR 持续显示"尖峰"（现有逻辑把所有雷达弹持有者当作照射源，`ai.js:612-633`）；加一条"导弹引导中"的更高级告警。**反制玩法**：打掉 / 迫使对方转向脱离照射圈，或凹口机动。
- **数值（起步）**：射程比 `mrm`（CLA-4）远约 20%、速度同级、`dmg` +10%、`ammo` +50%、冷却更短——便宜好用，代价是引导依赖。名称沿用 CLA 词根，编号在落地时给出 2–3 个候选评审（占位 `CLA-?`）。
**视场事件化（`FovWatch`，`engine/world/fovwatch.js`）**

问题：现在所有"目标是否在某个锥 / 圈内"的判断都是每帧、每对（观察者, 目标）重新算角度。问：能不能改成"进框 / 出框时广播事件"，别的逻辑订阅？

**诚实的答案**：**能统一，也能事件化，但不是免费的**——要知道"什么时候越过了边界"，仍然得算角度。事件化真正省下的是两样东西：（1）下游逻辑不再每帧读标志、不再自己维护"持续了多久"的计时；（2）通过**保守调度**让远离边界的观察对少算：

```
FovWatch.watch({ observer, target, cone, hyst, onEnter, onExit, owner })   // 订阅
// 每次检查：margin = |angle − cone|（离边界还有多少弧度）
// 下次检查时间 = now + margin / ω_max           ← ω_max：两者几何允许的最大角速度上界
// 距离近、角速度上界大时 ω_max 大 → margin/ω_max 很小 → 自然退化成每帧检查
```

- **正确性来源**：`ω_max` 取上界（`(|v_obs| + |v_tgt|) / dist` 的保守估计，加转向角速度上限），所以在下次检查之前**不可能**越过边界，事件不会漏。
- **迟滞**：`hyst`（进框阈值略小于出框阈值）防止在边界上来回抖动连发事件；也替代了现有各处手写的 `lostTime` 累加（"出框后 0.5 s 才算丢"变成"出框事件 → 启动宽限计时 → 进框事件 → 取消计时"）。
- **事件广播**：同一对（观察者, 目标, 圈）可以被多个订阅者复用，不重复计算。

**适合统一进来的判断**（调查已列出）：

| 判断 | 现状 | 改后 |
|---|---|---|
| 半主动弹的照射保持 / 中断（本节） | 每帧 | `onExit → 开始宽限`、`onEnter → 重新获得引导` |
| 玩家的锁定圈（`drawConeCue` 的圈、`lockInCone`） | 每帧 | 订阅 `onEnter / onExit` 驱动 HUD 色彩与 IN RNG 状态，圈的绘制本身仍每帧（投影必须每帧算） |
| AI 开火门限 `lockOff < lockCone × 0.85`（`ai.js:1011`） | 每次开火判断 | 订阅，开火时读事件维护的标志 |
| 激光导引头 `LASER_CONE`（休眠） | 每帧 | 同上 |
| 导弹导引头的视场 `fov`（`entities.js:1353-1359`） | 每帧，且**同一个角度还要用来制导** | **不改**：导弹每帧本来就要算 `off` 来转向，事件化省不了任何计算，只会多一层间接 |
| 被地形遮挡的 LOS（批次 9） | 新建 | **直接用同一个调度器**：LOS 检查本身贵，保守调度（视线余量 / 最大相对速度）收益更大 |
| 近炸、碰撞、距离类判定 | 每帧 | 不是视场，不在此列 |

**预期收益（量级判断）**：实体不过数十个，单次角度判断只是几次点乘，所以**不指望 CPU 大幅下降**；真正的收益是逻辑集中（一处定义迟滞与宽限，不再每个功能各写一份 `lostTime`）、行为一致（HUD 与 AI 看到同一个事件）、以及给批次 9 的 LOS 提供现成的调度器。**建议先只接入半主动照射、玩家锁定圈、AI 开火门限**这三处，导弹自身的导引头保持原样。

- **验证**：`probe-fovwatch`（Sim）：随机运动的观察对，比较"每帧暴力检查"与"保守调度"的事件序列——**必须逐事件一致**（时间误差 ≤ 1 帧）；统计调度后的实际检查次数相对每帧检查的比例。smoke 断言迟滞下事件不抖动。
- **新探针** `tools/probe-sarh.js`（Sim）：目标分别不机动 / 机动 / 发射机转弯 / 发射机被压制，统计命中率与"丢照射"比例；与 `mrm` 对比。

**AI 使用**（本批一起做，否则 NPC 的 `npcFits` 要留空）：

- `ai.illum = { missile, until }`：自己有半主动弹在途且目标有效时，**锁定目标**（抑制重选目标 `retargetT`）、保持目标在圈内（纯追击即可）、抑制转身规避——除非来袭导弹 < 2.5 km（自保，按技能有概率提前放弃）。导弹命中 / 失效后释放。
- 高技能 AI 会在锁定后做"偏置转向"（保持照射同时拉开）。
- 之后给部分上游战机 / 下游预警配半主动弹；`npcFits` 逐一审视。

### 5.7 其它 AI 强化

**原有提案**（保留）：

| 提案 | 说明 | 建议 |
|---|---|---|
| 僚机协同战术（敌方成对） | 一前一后 / 分左右夹击；一架被咬尾时另一架转来解围 | 做（与目标分配同一套） |
| 按来袭导弹类型选防御 | 雷达弹 → 凹口 + 箔条；红外 → 热焰弹 + 硬拉；半主动 → 打断照射 | 做（高技能才会） |
| 能量管理 | 不让速度掉出角速度最佳区间；上升 / 下降 yo-yo 换位置 | 做 |
| 感知限制（P5） | AI 目前全知；加探测锥与丢踪延迟 | 以下"态势记忆"是它的轻量版，先做那个 |
| 地形利用 | 配合批次 9：AI 沿山谷遮蔽接近 | 放批次 9 |
| 对舰 / 对地协同 | 多机分批攻击、俯冲角择优 | 可选 |

**新增项**：

#### 战术行为

- **诱饵与侧击**：敌方成对时，高技能的一架（诱饵）正面吸引玩家的注意与导弹，另一架绕到侧后方切入。决策层加 `bait / flank` 两个子角色，由 Director 在成对单位里分配；只在 `skill ≥ 0.6` 的成对单位上启用。诱饵受到威胁（来袭导弹、被锁）时立即放弃角色转入规避，保证它不是自杀。
- **低空突防**：对舰 / 对地攻击机（`caps:'strike'`）在距目标防空圈（舰船 / SAM 的 `interceptRange`）外保持贴海面（`agl` 起步 60 m），进入发射包线前才爬升投射，投射后立即回到低空脱离。与批次 9 的地形遮挡配合：有地形时优先沿山谷。验证：对舰攻击机在有 SAM 的关卡里被击落的时间点分布，应从"接近途中"后移到"爬升瞬间"。
- **撤向防空伞**：`retreat` 的目标不再只有"出界口 / 整备点"，增加第三个候选——**己方防空伞**（我方舰船 / SAM 站的 `interceptRange` 内、且比追击者更靠近它）。被追击且存在这样的位置时，优先撤向它，把玩家引进火力网。玩家侧的反制是看"对手是否正朝己方 SAM 飞"。
- **假撤退诱敌**：`ace` / 高技能单位在 hp 尚可时有小概率（`FAKE_RETREAT_P`，起步 0.08，按"状态变化触发"的同一套延迟判定）进入伪装撤离：沿撤离航向飞 8–15 s，拉开与玩家的距离，若玩家追来则急转回头迎击（带一次先机发射）。与真撤离共用 `retreat` 状态，只是多一个 `fake:true` 标志与一个"回头"出口。真 / 假撤离在玩家眼里不可区分，**这是卖点**。因此 `mission.retreat='off'` 的关卡里假撤退同样可用——它不移除单位。

- **高技巧 AI 的加力使用**：
  - **现状**：加力不只在 `pursue()` 里——`a.ab` 在这些地方被写：`pursue()`（`ai.js:1040-1048`，`dist > 2600` 开；`dist < 800` 油门 0.55；另有"`fwd.y > 0.82` 且速度 < `1.5 × vStall` 强制开"）、`evade()`（`:766-772`，油门恒 1，`ab = dist < 2600`）、`extend`（`~780`，恒开）、无人僚机编队跟随（`~800-810`，`ab = vWant > 0.98 × vMil`）、僚机（`ab = dist to slot > 900`）、近地保护（`agl < 420`，油门 1 加力）。**技能值完全不参与油门与加力**；`skill` 现在只在 `ai.js:650`（抗电子战）、`:705`（重选目标间隔）、`:941`（机炮锥）、`:1008`（包线选择，`skill ≥ 0.6`）、`:1011-1013`（射击意愿与间隔）使用。任务里敌机技能从 0.25 到 0.98 都有，所以 `ace ≥ 0.75` 只会命中少数单位。
  - **没有燃油，也没有加力燃油**（`entities.js` 里搜不到），所以**不引入燃油与 `AB_FUEL`**：用"能量门限 + 冷却"限制加力，不做油耗模型。
  - **改为按战术用途决定**（各用途的触发都走 5.4 的状态变化 + 延迟判定，不逐帧）：
    - **拉开距离 / 摆脱**：被导弹锁定或被咬尾、能量尚可时，`ace` 档开加力拉开，并在导弹 TTI 足够时作为 5.8 的 PSM 之外的第一选择；
    - **切入 / 收敛**：攻击前从远距向目标收敛时，在能量高于角点速度时开加力，到达开火包线前收回；
    - **回头反击**：假撤退回头迎击时短时加力，缩短回转的时间窗；
    - **保能量**：狗斗中能量低于 `AB_MIN_E`（角点能量附近）立即停止加力，避免把自己拖进失速。`AB_MIN_E` 的"能量"是 3.3 里新增的 `E = ½v² + g·h`。
  - **红外代价（现成的机制，可直接用）**：`irSignature(e)`（`entities.js:1080-1084`）= `(ab ? 3.0 : 1.0) × (0.4 + throttle) × (0.6 + hp/300)`，**目前只用于红外导弹的目标选择**（`irAcquire`，`:~1129`，按 `irSig × (1 − off/cone) / (1 + d/1500)` 打分；smoke `~1795-1830` 断言"远处的热目标压过近处的冷目标"），**并不改变锁定距离**。所以"开加力会被红外弹优先咬上"已经成立：`ace` AI 在**有红外导弹威胁**时应当**避免**开加力，这是一个自然的反向约束，直接写进规则里。
  - 低技能 AI 保持原有行为（只在远距追击开）；半主动照射期间（`ai.illum`）不主动加力，避免把目标甩出视场；PSM 期间加力只改推力系数（`PSM_THRUST_K`），不另开。
  - **玩家可读**：AI 开加力时的**尾焰已经存在**（`entities.js:943-960`，对任何 `a.ab` 的实体发射尾焰粒子；加力音走 `SFX.nearby(..., !!nBest.ab)`，`game.js:3462`）。**RWR 上没有"加力"标记**（`hud.js:709+`），"RWR 旁的加力标记"需要**新增 HUD 代码**。
  - **不能破坏的断言**：`smoke.js:1606`（轰炸机 AI 不得使用加力）。
  - **验证**：新增 `probe-ab`（Sim）：ace 与普通 AI 在同一场景下的加力时长占比与能量曲线；断言普通 AI 的"切入"类加力为 0；`ace` 的加力在导弹威胁时段显著高于其它时段，但在红外导弹威胁时段显著低；能量低于门限时加力不触发。

#### 个体模型

- **过载与体能差异**：每个机型有 `gLimit`（持续过载上限）；**有人机**持续高 G 超过 `G_SUSTAIN` 秒（起步 6 s，按技能 / 性格浮动）会进入"视野变窄"状态，机动被迫放缓 1–2 s；**无人机无此限制**，其 `gLimit` 与结构上限一致，可以做有人机做不到的急转。对玩家的无人僚机与敌方无人机都生效。HUD 对玩家自己同步（可选：灰视 / 红视边缘暗角）。
- **飞行员性格**：新字段 `temperament ∈ { aggressive, cautious, sniper, loyal }`，与 `skill` 正交，在 `AI.SKILL` 参数表里各自给一组偏移：
  - `aggressive`：脱离阈值低、开火意愿高、贴近狗斗；
  - `cautious`：优先外围游走、被锁就规避、撤离概率 ×1.3；
  - `sniper`：偏爱远程弹，开火前宁可多绕一圈拿到更好的包线；
  - `loyal`（僚机 / 护航）：不离开长机 / 被护卫者超过 `R_leash`。
  关卡 `spawnEnemy({ temperament })` 可指定，缺省按 `skill` 与机型随机抽。呼号台词可按性格选变体（Chatter）。
- **人为失误模型**：低技能飞行员有概率性失误——**超调**（转向修正过头）、**丢目标**（被晃出视线后多花 0.5–2 s 才重新找到）、**误判来袭导弹**（晚发现 / 选错规避）。失误率随技能单调递减，王牌几乎为零。失误**一律走"状态变化触发 + 延迟判定"的同一套事件机制**，不逐帧掷骰。

#### 编队与协同

- **护航逻辑**：新角色 `escort`（敌我皆可）：绑定一个被护卫者（`ai.ward`，可以是轰炸机、运输机、预警机或整支编队），在其周围 `R_escort` 内活动；威胁（玩家或其导弹）接近被护卫者时，护航机**优先拦截威胁**而非各自缠斗；被护卫者被击毁后转入普通追击。`loyal` 性格天然适合。**现状**：`escort` 现在只是一个**布尔标志**（`missions.js:141` 写 `a.ai.escort = true`，只有 m1 的敌方 VAC-14 用到），**读它的只有 m1 的 `tick` 与 `win`**（`missions.js:594、636`，用来把护航机排除出"击毁目标"的计数）；`ai.js` 里**没有任何行为**读它。所以这不是"合并既有逻辑"，而是**从零设计**角色；同时要保留这个标志对 m1 目标计数的语义。
- **巡航队形与解散**：AI 机群出生时按队形（楔形 / 梯队 / 纵队，由 `formation` 字段指定）飞行，队形由领队 + 槽位生成（**目前只有无人僚机的槽位代码**，`s.formation = {dx, dy, dz}` 相对长机的 `right / fwd` 轴，`ai.js:794-826`；楔形 / 梯队 / 纵队的队形模式和 `R_engage` 解散判据都**不存在**，需要新写）；进入交战判据（目标在 `R_engage` 内或被锁）后整队**解散**成各自的战术角色（5.2 的外围游走等）。视觉上更有军队感，也能帮玩家一眼数出编队规模。
- **电子战协同**：
  - 干扰机 AI（`lodestone` 等带 `ewfield` 的单位）主动靠近己方编队，进入"护航 + 开机"模式；被玩家反制（干扰机被锁定 / 被导弹追踪）时脱离。
  - 被压制的普通 AI（`suppressed` 持续 > 阈值）会**主动脱离干扰区**（朝远离干扰源的方向拉开直到 `suppressed` 下降），而不是在场内"瞎眼"打转；这让玩家的干扰既有压制效果也有驱赶效果。
  - 双向：敌方干扰机对玩家同理，玩家被压制时 HUD 已有 JAMMED 提示（2.3 / 2.3b）。
- **友军呼救（不做玩家指令）**：**玩家不能向非僚机队友下命令**。所以只做反向：友军被缠住（被咬尾、被锁、hp 低于阈值）时，**用 `Chatter` 的 `defensive` 事件呼救**（"有人咬着我，请求支援"，带方位），并向 Director 登记"求援"，Director 把附近**无任务的友军**重分配过去（5.3 的扇区机制）；玩家听到后可以自己决定要不要去，没有任何命令界面。呼救有冷却与优先级（`pri:'ally'`）。

#### 导演与系统

- **态势记忆（最后已知位置）**：AI 目前全知。轻量版：AI 在目标离开其探测锥（用现成的 `lockCone` 与距离）或被箔条 / 干扰 / 机动甩开后，**不再知道目标当前位置**，而是向 `lastKnown`（位置 + 速度外推，随时间衰减）飞去搜索，`T_search`（起步 6 s）内重新进入探测锥则重获；超时则转向其它目标 / 外围游走。有预警机支援（友方 AEWC 存活）时延长记忆。这样玩家的"甩开"与"静默"才有意义；改动面只在 `ai` 的感知层和目标列表，不需要新建完整探测系统。（由 `FovWatch` 的进出事件驱动"丢失 / 重获"，不加每帧逻辑。）
- **战场环境事件**：关卡级的低频随机事件，由 `mission.ambient = [{ type, p, cooldown }]` 声明：友军遇袭求援信号、增援编队抵达（可以是我方也可以是敌方）、受损残机返航（贴着边界低速离场，不计击毁）、远处舰队交火的闪光 / 烟柱 / 无线电。事件本身用现有的 spawn 与 Chatter 拼出，不新增机制；全部在 `locales/` 里写台词。默认关，批次 8 逐关选用。**现状**：代码里没有任何 `ambient` / 随机事件逻辑，`Chatter` 也还不存在；能用的构件只有 `mission.tick`、`w.flags` 一次性标志、`Radio.raw` 与 `m8Wave2`（`missions.js:1964`）式的中途生成。
- **AI 调试可视化**（仅开发）：`?debug=ai` 时 HUD 叠加每架 AI 的 `mode`、目标、扇区、撤离 / 评估计时器、技能 / 性格标签，世界里画出 Director 分配的扇区环。不进正式界面，不进 smoke，不影响黄金回放（只读状态）。

**没有采纳**：损伤降级（受伤后性能下降）、战场节奏导演（动态增援 / 减压）、玩家指令友军。以后要加都不与上述冲突。

### 5.8 过失速机动（AI 侧）

**复用**：AI 直接调用批次 3.3 的 `Ent.stepPSM` 与同一套控制律（`AI.steerTo` 本来就是玩家与 AI 共用的），只替换"目标方向"的来源。接入点在 5.0 说明的"4. 分派行为"链（`ai.js:758-860`）里新加 `s.mode === 'psm'` 分支，**并显式跳过 `vertRecover`、`clampCeiling` 与近地保护三道覆盖**（见 5.0）；机动库（`ai/maneuvers/`）是批次 5 本身要建的东西，不是已有的。AI 与玩家一样走 `AI.update → Ent.stepAircraft` 的统一管线（`game.js:3426-3432`），PSM 分支在 `stepAircraft` 之前判定。

**适用**：`skill ≥ PSM_AI_SKILL`（起步 0.75，即 ace 档）。普通与新手 AI 不使用，避免全场都在失速。

**两个用途**：
- **反击（咬尾时）**：AI 被敌机咬住（攻击者位于 AI 机尾 ±60° 内，距离 < 3 km），且规避不成立（5.7 的规避评估给出"无逃逸角"或"能量不足"），则 PSM 指向攻击者；收敛后按 5.1 的开火门限开火。这是"回头反击"的具体实现，也是 5.7 假撤退回头迎击的执行手段。
- **摆脱锁定（被导弹 / 雷达锁定时）**：规避失败后，PSM 的目标方向取"远离来袭导弹 / 照射源"的方向，让机头被甩出导引头视场。成功与否由批次 5.6 的 `FovWatch` 出框事件判定，不加每帧检查。

**触发**（沿用 5.4 的状态变化 + 延迟判定，不逐帧掷骰）：
- 事件源：被锁定、被咬尾、被命中、收到来袭导弹告警。**没有统一的事件总线**，只有 `world.events.push`（`hit / wingflare / intercept`）与 `Ent.damage`（`entities.js:2662`）这一个 hp 咽喉；"被锁定"可由 `findIncoming`（`ai.js:~560-590`）与 RWR 的 `a.rwrT / rwrSrc`（`ai.js:612-633`）产生，"被咬尾"由 5.2 的感知层计算后登记；
- 延迟 `PSM_AI_EVAL_DELAY`（起步 0.8 s）后一次性判定，结果为"否"则需要新事件才会再评估；
- 概率 `p = clamp(0.25 + 0.6 × (skill − 0.75) / 0.25, 0.25, 0.85)`（起步值，ace 区间内随技能上升）；
- 冷却 `PSM_AI_CD`（起步 15 s）。

**AI 独有前提**：
- 来袭导弹剩余飞行时间 TTI 必须大于 PSM 所需时间（起步 2.5 s），否则不做，来不及就不硬做；
- 同玩家的能量门限与高度门限；
- 编队中长机做 PSM 时，僚机不跟随，避免整队失速。

**玩家可读的信号**：AI 进入 PSM 时，RWR / HUD 显示"高攻角机动"提示（与玩家自己的 PSM 提示同一种样式），让玩家能读懂对手在干什么，留出反制空间。

**与其它机制的关系**：
- 假撤退（5.7）回头迎击时优先用 PSM 完成转向，补上它原本缺的急转手段；
- 撤离（5.4）期间不使用 PSM，撤离与攻击不混用；
- 无人机与 VTOL 不适用（`noPSM`），无人机的机体限制留到批次 6 再定。

**验证**：
- `probe-psm` 增加 AI 场景：ace 对普通 1v1，统计 ace 的 PSM 触发率、摆脱锁定成功率（导弹失效比例）、反击后的开火命中率；普通 AI 的 PSM 触发数断言为 0；
- TTI 门限：来袭导弹过近时断言不触发；
- smoke：`PSM_AI_SKILL` 门限断言，非 ace 不进入 `psm` 机动。

### 5.9 验证

- **反挤团指标**（Sim，固定种子，多次平均）：8v8 纯 AI 场景，每 5 s 采样"周围 1.5 km 内有 ≥ 3 架他机的飞机占比"，要求相比基线下降 ≥ 50%；平均交战时长、击杀分布不坍塌（不能变成"互相躲着不打"）。
- 技能：同机型 1v1，王牌对普通的胜率显著高于 50% 但非 100%；规避动作的分布可见。
- 撤离：各触发条件的触发率；撤离单位不计击毁；无人僚机随长机；出界后移除；"全员撤离"场景下各关状态。
- 整备点撤离：往返闭环，`buildNpcMounts` 重建后弹药池正确。
- 半主动弹：`probe-sarh`；AI 持续照射状态机；RWR 告警。
- smoke、`probe-missions` 全绿；`probe-perf` 无明显退化（Director 与新机动要计入）。

### 5.10 文档与发版

`ai.md` 重写（三层结构、模式表、机动库、技能表）、`weapons.md`（半主动、标签）、`entities.md`、`missions.md`（`mission.retreat`）。发 v3.4。

---

## 批次 6 · v3.5 新单位

### 6.1 前置：长机泛化与无人机

**现状**：

- 无人僚机分支读 `world.player` 的地方不止一处：`leadThreat`（`ai.js:~116`，遍历所有 actor 读 `e.target === lead`）、`:688`（`dLead = world.player`，`leadOk` 读 `dLead.alive / .target / .target.alive`）、`:692-703`（目标选择：`suppressed > 0.35` 置空，`spread` 用 `nearestEnemy`，`cover` 用 `leadThreat` 再 `nearestEnemyTo(dLead.pos…)`，`focus` 用 `dLead.target`）、`:706-707`（死代码 `wingman` 角色）、`:745-747`（掩护撒干扰弹，读 `lead.alive`、`lm.target`、`lm.pos`，写 `s.flareFor = lead`）、`:794-826`（编队，读 `leader.pos / .right / .fwd / .alive / .speed`，槽位 `s.formation = {dx,dy,dz}` 相对长机轴，`cmd` 缩放：cover 0.55、spread 1.6）、`:835-845`（`wingman` 编队分支，同样死代码）。
- **`ai.leader`、`ai.ward`、`spawnDrones` 都不存在**（`AI.attach`，`ai.js:407`，文档里写了 `formation:{lead,dx,dy,dz}` 但 `lead` 从未被读）。世界里**唯一的无人机**是玩家的两架 KA-7，由 `spawnWingman`（`missions.js:185-216`）生成，它写死 `team:0`、`w.player.pos`、`CALLSIGN['wing'+idx]`、`w.wings`，**不能复用给敌方**。`setWingCmd` 只改 `world.wings`，所以敌方无人机也收不到玩家的 1/2/3 命令（这正合适）。
- **长机被压制不影响无人机**：`ai.js:689-691` 的注释明说"长机被压制或静默只会让它无法发新命令，已授权的命令继续有效"，**只有无人机自己 `suppressed > 0.35` 才退化**（`:692`；HUD 的 "LINK LOST" 标签读的也是无人机自己的状态，`hud.js:1086-1087`）。**设定：长机被压制不会让编队瓦解，本计划不改这条规则。**
- 其它与"无人机"概念绑定的位置：`world.wings[idx]`（`game.js:1447、1942、3537`）、`t.wingIdx`（`hud.js:1086`）、`killCredit` 里的 `kb.isDrone && kb.team === 0`（`game.js:3872`，批次 2.2c 起改读 `unmanned`）。

**要做的**：
1. `AI.attach` 加 `ai.leader`（缺省 `null`，解析为 `a.ai.leader || world.player`）；把上面所有读 `world.player` 的地方改读解析后的长机；死代码 `wingman` 分支一并清理。
2. 长机对象需要提供的字段：`pos / vel / fwd / alive / suppressed`，以及 `.right`、`.speed`、`.target`。**舰船长机不满足**：`makeTarget`（`entities.js:2797`）建的目标 `right` 恒为 (1,0,0) 且 `stepTarget`（`:2835-2907`）从不更新，`speed` 恒为 0（真实速度在 `route.speed`，单位 m/s），也没有 `.target`。所以 AI 侧**不依赖这些字段**：`right` 由 `fwd × up` 现算，速度取 `|leader.vel|`，`leadOk` 与 `focus` 里把 `dLead.target` 改成 `(dLead.target && dLead.target.alive)`，缺失时回退到 `nearestEnemyTo(dLead.pos, …)`——这正是"在长机附近自由战斗"想要的行为。
3. **退化规则保持现状**：只有**无人机自己** `a.suppressed > 0.35` 才退化为"只规避不开火"，**不加**任何"长机被压制 → 无人机退化"的新规则。长机（飞机或舰船）被压制只影响它自己，不连带编队。
4. 新写 `spawnDrone(leader, o)`（`missions/_lib.js`），不要改 `spawnWingman`。长机死亡时沿用已有的"长机已死：盘旋"分支（`ai.js:~827-833`）。

- **敌方无人机**（让玩家的主动干扰有意义）：
  - 需要新增一个**下游无人机机型**——**目前下游没有任何无人机**：下游机型只有 `schist / basalt / sandstone / boulder / quartz / lodestone`，全是有人机；KA-7 `folded_wing` 属上游。新机型清单（`docs/systems/data.md:83-110` 与 `preflight`）：`AIRCRAFT` 条目（必填 `id / model / name / nick / cn / role / stats / phys / gun / maxLoad / hardpointGroups / defaultLoadout / desc / npcOnly:true`，`nick` 缺失时机库 `toUpperCase` 会抛异常）、模型（可借用现有几何，如 `tideline` 借 `sailfish`）、`needModels`（`game.js:4072`）、`unmanned` 标签。`npcOnly` 机型可以没有俯视图（`game.js:4067-4069` 跳过），smoke（`~4640-4690`）对每个 `AIRCRAFT / SHIPS` 自动生成详情页，无需额外注册。**下游武器的 `fits` 是空数组**，NPC 只能靠 `npcFits` 装挂，所以无人机的挂点组种类必须在某些下游武器的 `npcFits` 里出现，且 `Ent.mountIssues` 必须为空（smoke 会拦）。
  - 以敌方长机或预警机为 `leader`。**主动干扰的价值来自干扰场本身**：干扰场按半径覆盖范围内的每一架无人机各自判定 `suppressed`（`updateJamming`），一片无人机挤在一起时会**同时**被压到阈值以上而各自退化，不需要长机被压制这条规则。
  - 关卡里的放置放批次 8。
- **友方有人机的无人僚机**：同一个 `spawnDrone(leader=某友军有人机)`，机制只有"与长机保持一定距离内自由战斗"，不需要更复杂。
- **性能**：`world.actors` **从不压缩**——`compact()`（`game.js:3549`）只清理导弹、子弹和粒子（上限 900），死亡与逃离的飞机永远留在数组里。每帧的 `AI.update` 里 `nearestEnemy / leadThreat` 是 O(actors)，无人机成群时整体是 O(n²)；`scanShot` 是 O(子弹 × 存活敌机)。实测前 60 s 各关最大 actor 数仅 18（`targets` 52，多数是远处的中立调节单元）。所以：无人机上场前先加**延迟压缩**（死亡 / `escaped` 超过 `ACTOR_GRACE_S`（起步 10 s）后从 `world.actors` 移除，并核对所有按下标引用 actor 的代码），并设**同时存活无人机上限**（起步 24）。

#### 6.1b 下游无人机航母

**定位**：一艘下游水面舰，机库里存放一批下游无人机，按波次放飞，回收受损或耗尽的无人机。它是 6.1 的"无人机以长机为 leader"在水面上的具体载体：**长机是舰船，不是飞机**。

**现状**：
- 舰船是 **target** 不是 actor：`spawnShip`（`missions.js:347-410`）按 `SHIPS` 条目调 `Ent.makeTarget`（`ttype:'ground'`、`big:true`，team 缺省 1），再 `Turret.attach(t, s.mounts, s.launchers)`，推入 `w.targets`（`:405`）。`spawnShip` **忽略 `o.fwd / o.yaw`**（固定锚泊的船朝 +z，航行船的 `fwd` 由位移推出）；航线由 `Ent.stepTarget` 沿 `route = {wp, speed, loop}` 推进，不是 `route.js`（后者只管飞机）。
- `updateTargets`（`game.js:2906`）只做 `stepTarget`、`Turret.stepAll`、尾流水花与旧式 `t.weapon` 射击，**不调 AI，也没有任务回调**。
- **没有任何"机库 / 容量 / 放飞 / 回收 / 整备"的概念**（`data.js`、`entities.js`、`missions.js`、`ai.js` 里都只有描述文字）。上游航母 `humpback` 的"舰载机 ×40"只是 `arms` 文本。
- 没有甲板几何数据：`humpback`（`models.js:1325-1388`）是 `b.hull([...])` 加一块 18.4 m 高的 40×276 甲板盒与一块斜角甲板 quad，甲板高度约 19.2 m、z 范围约 −140 到 140，只能由模型常数推出。
- 中途生成飞机的现成范式：`m8Wave2`（`missions.js:1964`）在 `tick` 里用 `w.flags.wave2` 一次性标志触发，循环 `spawnEnemy` 再设 `e.route`。`tick` 在胜负判定之前运行（`game.js:3496` 对 `3533`），所以在 `tick` 里生成是安全的。`spawnEnemy`（`missions.js:81-170`）设定：`makeAircraft`（装挂走 `mountPlan / fitsKind / npcFits`，`entities.js:644` 调 `buildNpcMounts`）、`a.model / phys / maxHp / hp / radius=8 / name / label`、`AI.attach`、`w.actors.push`。
- 舰船的 `suppressed` 已被计算但几乎无人读取（只有 `jamPress`，`entities.js:1957`，与 `turret.js:185、437`）。

**数据**（`SHIPS` 条目，批次 1 后在 `data/ships/`；字段全部是新增，`spawnShip` 负责把它复制成 `t.hangar`）：

```js
droneCarrier: {
  capacity: 12,           // 机库容量（无人机数）
  launchCd: 25,           // 两波放飞之间的冷却（s）
  waveSize: 3,            // 每波放飞数量
  recoverR: 1800,         // 回收半径（水平，m）
  recoverAlt: 300,        // 回收高度上限（m）
  droneType: '<新的下游无人机 id>',   // 6.1 里新增的下游无人机机型，npcOnly、unmanned
  deckAnchor: [0, 11, -120],          // 放飞点（舰体模型坐标；由新模型文件导出，不是从 humpback 推）
  tags: ['droneCarrier', 'resupply'],
}
```

- `droneType` 必须指向新增的下游无人机机型，不能借用上游有人机（如 `skua`）。
- 标签 `droneCarrier`、`resupply` 都由批次 1 的 `Tags` 引入（`SHIPS` 目前**没有 `tags` 字段**）。`resupply` 复用批次 4 / 5 的整备机制（`Ent.rebuildMounts`，见 4.2）。
- 新增一艘下游舰的清单：`SHIPS` 条目、`SHIP_MOUNTS / SHIP_LAUNCHERS`、模型（`hull()` 加进 `settle` 列表，`models.js:2507-2508`）、`needModels`（`game.js:4072`）、`NAVAL_CS_POOL`——**下游呼号池的计划表是写死的**（`data.js:765` 一带：ammonite 4、trilobite 6、seascorpion 3，剩余 13 个），新增一类要在表里加一行并核对 smoke 的计数；`arms` 文本必须与 `SHIP_MOUNTS` 的炮数一致（`smoke.js:5637-5706`）。

**放飞**：
- **每帧钩子**：`updateTargets` 里加一个 `t.hangar` 分支（或放 `mission.tick`），调用新函数 `launchDrone(carrier)`，内部包装 `spawnDrone`（6.1）。沿用 `m8Wave2` 的"一次性标志"思路，但这里是周期性的，用 `t.hangar.cd` 倒计时。
- 舰船每 `launchCd` 放飞一波 `waveSize` 架；机库剩余不足一波则放飞剩余全部。
- 放飞点 = `舰体位置 + 绕 heading 旋转(deckAnchor)`。舰船的 `right` 不维护（恒 (1,0,0)），所以**用 `heading` 或 `fwd` 现算旋转**，不读 `t.right`。
- 放飞的无人机 `leader` 设为舰船；飞出 `recoverR` 后脱离队形，进入 6.1 的"与长机保持一定距离内自由战斗"。

**回收（不需要新状态）**：
- 无人机在 `recoverR` 内、`agl ≤ recoverAlt` 且**弹药耗尽 / hp 低于阈值 / 被要求撤回**时（**不引入燃油**，代码里没有燃油模型），转为"回收"子模式飞向舰尾，进入舰尾后被收回。
- 收回 = 写 `a.alive = false; a.escaped = true`（`route.js:114、126`、`ai.js:542` 已有的先例）：`killCredit`（`game.js:3868`）对 `escaped` 返回 `'none'`，击杀统计与友军损失（`game.js:3856`）也跳过它们，所以**不计击毁、不计损失，无需新的记账代码**。机库计数由舰船 `t.hangar.count` 自己维护，再次放飞是**全新生成**（带补满的弹药与 hp），不去"复活"旧对象。
- **胜负判定的坑**：多数关卡的 `win()` 要求"所有 team 1 存活 actor 都死了"（共 13 关、31 处 `team===1` 判断）。已放飞、尚未回收的无人机会卡住胜利，所以每个用到航母的关卡必须**把 `unmanned` 的 team 1 单位排除出击毁目标计数**，或者明确把"击沉航母"作为目标之一；批次 8 逐关处理。
- 无人机被击毁则永久减少机库存量，**不自动补充**，除非关卡声明补给（`mission.resupply` 的 `uses`，批次 4）。

**压制与数据链**：
- **舰船被压制不会影响在外的无人机**，沿用 6.1 的规则：只有无人机自己被压制（> 0.35）才退化为"只规避、不开火"。航母自己的 `suppressed` 不触发任何连带效果，也不阻止回收。
- 玩家要瘫痪它放出去的无人机，需要让干扰场覆盖到那些无人机本身。
- 舰船被击毁时（`alive = false` 经正常伤害路径），机库内的无人机按"长机已死"处理（盘旋 / 不再回收）。

**与其它机制的关系**：
- 由 5.2 的 Director 分配任务：放飞的无人机被分派到敌方集中区域或友军求援点，避免全部扑向同一目标。
- 与 5.7 的"战场环境事件"衔接：放飞可以作为环境事件的提示（甲板起飞光、无线电"第一波放飞"）。
- 玩家反制：击沉航母，或用干扰场覆盖它放出的无人机；外形与上游航母 `humpback` 做明显区分。

**Chatter 事件**（5.5b，`Chatter` 模块届时已存在）：`launch`（放飞一波，限频）、`recover`（回收一架）、`hangarLow`（机库存量低于 `capacity / 3`）。

**验证**：
- Sim 新探针 `tools/probe-carrier.js`：放飞间隔不小于 `launchCd`；波次大小正确；机库存量在放飞、回收、击毁三种操作下守恒；回收后补满；
- 压制航母时回收与放飞照常、在外无人机不受影响；只有无人机自己被压制才退化；航母被击毁后剩余无人机不再回收；
- smoke：`droneCarrier` 与 `resupply` 标签组合断言；无人机机型带 `unmanned` 且 `Ent.mountIssues` 为空；`arms` 文本与 `SHIP_MOUNTS` 一致；新舰进了 `settle` 列表与 `needModels`；
- 性能：`probe-perf` 加"航母 + 24 架无人机"场景，逻辑帧耗时在预算内。

### 6.2 VTOL 可玩机型

**行为**（草稿要点）：速度上限不高、下限可到 0 且**不失速而是悬浮**；推力只能向下，机体倾斜时靠更大推力补偿高度，因此产生横向漂移；挂点比别的机型更多的国土防卫重型战机。

**实现**：

- 机型字段 `vtol:{ hoverT, transSpeed, maxLateral… }`。`stepAircraft`（`entities.js:678`）整体是运动学模型（`vel = fwd × speed`，无侧滑），所以 VTOL 走**独立的 `stepVtol(a, dt)`**（放在 `engine/entities/flight-vtol.js`，这是批次 1 拆模块的直接收益）：
  - 姿态积分、控制输入与现有一致（可复用）。
  - 速度是自由矢量：`推力 = −up × T`（只能沿机体下方），`加速度 = 推力 / m + g + 阻力`。悬停条件 `T·cosθ = m·g`；倾斜 θ 后要保高度需 `T = m·g / cosθ`，水平分量 `g·tanθ` 就是**横向漂移**。
  - 速度高于 `transSpeed`（起步 120 m/s）后逐渐混入现有翼升力模型（过渡区线性混合），高速时与普通战机行为接近；`vMax` 较低；无失速判定与速度下限。
  - 油门轴语义在低速区改成"升力"；HUD 低速时显示悬停指示、垂直速度与漂移矢量。
- 影响面（调查已列出）：`steerTo` 假设前飞（`ctrlAuth`、高度回收分支）、HUD 失速 / 速度显示、`Ent.agl`、`game.js:3415/3430` 对 `stepAircraft` 的调用。**本批 VTOL 只给玩家用**，AI 用 VTOL 暂不做（`npcOnly` 不给）。
- 数据：机型条目、模型（新增 `models/aircraft/`）、俯视图（`planform.js`）、`needModels`、图鉴 / 详情页、挂载组（≥ 5 对，"国土防卫重型"的体现，同时重量惩罚 / `maxLoad` 加大）、文本、标签 `vtol`。
- 验证：Sim 场景——悬停推力平衡、倾斜漂移方向与量级、过渡区速度连续、无失速；`probe-envelope` 在悬停 / 低速下的发射包线不出怪值。

### 6.3 上游航空巡洋舰

草稿：75 mm、旋转 SAM 发射架、CIWS、后部一条斜跑道。

- 舰船条目 + 模型（`hull()` + 尾部斜跑道）+ `SHIP_MOUNTS / SHIP_LAUNCHERS`：沿用阶段 3/4 的炮塔系统——`_m(..., '75mm', ...)`、`_L('rotSam', ...)`、`_m(..., 'ciws20', ..., 'ciws')`，盲区靠 `arc`（`ARC_*` 常量）表达。
- 标签 `resupply`（它自然成为整备点）。
- 呼号（`NAVAL_CS_POOL`）、`arms` 文本与炮塔数一致（smoke 会核对）、图鉴 / 详情页、设定集条目。
- 关卡放置放批次 8。

### 6.4 下游战略制空支援机（精英）

- NPC 专用机型：流线体、高速、大型；`npcFits` 挂**大量中远程导弹**（含半主动弹，来自批次 5）；`ewPower / ewFieldR` 给**大范围电子战**；`hp` 高、`ace` 级技能；标签 `elite`、`ewfield`。
- **行为** `support`（AI 角色，复用批次 5 的外围游走）：以友方战斗机的质心为锚点，保持在其后方 `D_support`（起步 12–18 km）游走；每 25–40 s 对**不同目标**一次发射多发（N=3–4）对空弹；被威胁接近时脱离。
- 受干扰影响：被压制时发射间隔拉长、锁定距离折半（现有 `jamLockOK` 逻辑），玩家主动干扰对它有意义。
- 模型 / 俯视图 / 图鉴 / 文本 / 呼号（下游：村庄名 + 小队词）。

### 6.5 其它合理的空军单位（已选：巡飞攻击无人机、重型运输机、空中整备 / 加油机）

| 候选 | 设定与玩法 | 备注 |
|---|---|---|
| 巡飞攻击无人机（自杀式） | 廉价、低速、成群，扑向舰船 / 设施 / 玩家 | 与 `drone` 泛化直接配套 |
| 空中整备 / 加油机（上游） | 移动整备点（`resupply` 标签）；在后方盘旋，玩家驻留 hold 秒补给 | 复用批次 4，机制零新增；很有"季风线"气质 |
| 重型运输机 | 护送目标，不武装 | 便于批次 8 的护航关 |

### 6.6 浮空平台加武器

调查结果：草稿说的"浮空平台"对应 `relay`「高原」（27 × 82 m，`spawnTarget{ttype:'air', model:'relay', drift:9}`）和 `cell`（调节单元，中立资产，**不应武装**）。**`spawnTarget` 目前不调用 `Turret.attach`**，只有 `spawnShip`、`spawnPlatform` 调用，所以要补上。

- 新增 `TARGET_MOUNTS['relay']`：顶部一台旋转 SAM（`_L('rotSam', …)`）、机头 / 机尾各一个 20 mm 炮塔（`_m(..., 'ciws20', …, 'dual')`）。盲区由 `arc` 与 `yaw0` 决定（"有死角但不多"：每个炮塔的盲区取朝向机身对侧的 ~50° 扇区即可）。
- 模型：走 `composeTurrets` 的统一遍加炮塔网格。
- 注意：炮塔只在 `t.team !== 2` 时运行（`game.js:2911`），中立单位不会开火，这正是 `cell` 不会被误武装的保障；smoke 里"炮数与 `arms` 文本一致"的检查要扩展到 `targets/`。
- 关卡影响：用到 `relay` 的关卡会变难，`mission` 里加 `armed:false` 的选项可以让某关保持旧行为；`probe-missions` + 手动校。

### 6.7 验证与发版

每个单位：`render-units` 出图、smoke 的挂点与文本核对、`probe-balance`；新探针 `probe-drones`（无人机自己被压制时退化，长机被压制时不连带）、`probe-vtol`；`probe-missions`。文档：`models.md`、`turret.md`、`ai.md`、`data.md`、世界设定对应章节。发 v3.5。

---

## 批次 7 · v3.6 资料库背景与世界地图

### 7.1 资料库追加"设计手记"

- 资料库单位详情页目前只有游戏内同源的简短 `desc`。新增键 `<unit>.dev`（`locales/zh-CN/codex/devnotes/*.json`），详情页底部折叠显示"设计手记"：开发背景、取舍、被砍掉的方案。**文本缺失时该折叠区不显示**，所以可以逐单位慢慢补，没有技术债。
- 可选条目（草稿说"算了，不必强求"）：用一两句设定解释"挂点很少却能带几十发"——建议的解释方向：挂点是**标准化挂架接口**，一个"点"挂的是多联装挂架 / 弹链模块（`perPoint`），由此合理化现有数值，只加一条资料库文字，不改代码。

### 7.2 世界地图（矢量绘制风）

- 新 `ui/worldmap.js`：`WorldMap.draw(canvas, { markers:[{lat, lon, label}], focus })`，画粗略的矢量海岸线（风格化折线 + 经纬网 + 季风线 / 北纬 12° 标线），用于资料库页面。
- 数据 `data/geo/world.js`：架空大陆的海岸多边形，带高程档位与新旧海岸线（约 300–600 个点，见下方"地理基准"）。
- **关卡小地图**：每关加 `mission.geo = { lat, lon }`，简报页嵌入一张缩略世界图，用**十字**标出任务发生位置；`mission.loc` 原有文字不变。
- **地理基准（已定）**：**完全架空的海岸线形状**，并且要体现**海面上升**。做法：
  1. 先在设定里定好架空大陆的轮廓、主要海域与季风线（北纬 12°）的位置，出一张手绘级的草图（`docs/world/GEOGRAPHY.md` + 一份 SVG 草稿）供评审，再抽稀成多边形入库。
  2. 海面上升按"淹没线"表现：地图数据里每块陆地带两条轮廓——**旧海岸线**（虚线，上升前）与**现海岸线**（实线）；低地、三角洲、岛链在两条线之间被标成"已淹没区"。数据文件保存的是带高程档位的陆地（若干档等高环），渲染时按当前海面高度裁出实线，这样以后要调整上升幅度只改一个常数。
  3. 因为不再是现实地球，**不能从公有领域数据抽稀**，轮廓由我们自己画；点数 300–600 个已足够粗糙矢量风。
  4. 与 W.3 的呼应：地图上可叠加"干旱带 / 阻塞高压带"（δ）与季风线的历年位置，让灾难可视化。

### 7.3 发版

文档：`codex.md`、`unitview.md`、`world/SETTING.md`、`world/CAMPAIGN.md`。发 v3.6。

---

## 批次 8 · v3.7 关卡重构

这是前面所有批次的总装。**先出修订稿、再改代码**：每关一份设计说明，评审后再落地。

### 8.1 上游空军呼号体系

- 已有的：`CALLSIGN.player = VESPER-1`、`awacs = SEXTANT`（本身已是天文意象）；下游用"消失的村庄名" + 小队词 + 编号（`squadCallsign`）。
- 新增上游**非玩家编队**的呼号库 `data/callsigns/upstream-air.js`：**天文词汇**（星座、恒星、行星、星团、天文仪器）约 80 个词，格式同下游（小队词 + 编号，如 `ALTAIR-2`）；预留词表避开 `VESPER` 与 `SEXTANT`；碰撞检测沿用 `CS_RESERVED` 机制。
- 舰载分队与陆基分队用不同词簇（便于玩家在无线电里听出是谁）。

### 8.2 友军编成模板

| 模板 | 构成 |
|---|---|
| 航母分队 ×2 | 各 1 名有人机飞行员 + 2 架无人僚机（`spawnDrones`），从各自的母舰附近出生 |
| 前进基地陆基分队 | 全人类，4 架（两对），沿基地方向出生 |
| 友军有人机 | 带 `ally` 角色（批次 5）、技能 0.6–0.8；部分带自己的无人僚机 |

`spawnAlliedSquad({ template, from, callsignSet })` 放进 `missions/_lib.js`。

### 8.3 逐关修订表

模板（每关一行，由修订稿填写）：

| 关 | 边界 `arena` | 时间 | 整备点 | 友军编成 | 撤离 `retreat` | 敌方无人机 | 文案 / 台词重写 |
|---|---|---|---|---|---|---|---|
| m1 m2 m3 m4 m5 m6 m7 m8 m10 m12 sk1 m9 m11 | 批次 4 探针值 | 各关设定 | 有母舰的关 | 视剧情 | **逐关决定**（默认 off） | 有干扰机的关优先（m3 / m5 / m7） | 全部 |

交付物 `docs/world/MISSION-REVISION.md`：每关写清楚"改什么、为什么、对胜负条件的影响"，评审确认后再动代码。

### 8.4 无线电填充

- 友军加入后，台词以三类来源驱动：脚本台词（文本在 `locales/zh-CN/missions/<id>.json`，结构在关卡脚本）、`Chatter` 通用事件（批次 5）、编队内对话（长机 ↔ 无人僚机、舰载 ↔ 陆基分队互相报位置）。
- 全部台词改为按**说话人单位**选择呼号，不再写死 `VESPER-2` 之类。

### 8.5 验证

- `probe-missions` 增加变体：全员撤离、友军全灭、整备点被击毁；每关仍可完成或被明确标注。
- `probe-perf`：友军与无人机增多后的逻辑帧耗时；`scanShot` 是 O(子弹 × 实体)，必要时按 x/z 粗网格加速（2-0IMPL 风险表已预留此方案）。
- 手动：各关通玩一遍，对照修订稿。
- 文档：`missions.md` 全面更新、`SETTING.md` / `CAMPAIGN.md` 与新文案一致。发 v3.7。

---

## 批次 9 · v3.8 地形、城市与场景类型

**目标**：战斗可以发生在四类场景里，飞行单位能靠地形与建筑躲过导弹追踪和锁定；渲染看到什么，物理与视线判定就碰到什么（曲率造成的小偏差见 9.2）。

**前置**：批次 2.1（引入 `crash-sea / crash-ground` 死因与 `Ent.isLand` 的用法，**这些现在代码里都不存在**）、批次 3.2（`Shading.setEnv`，云层抬升要用）、批次 4（`Arena`，决定要烘焙多大范围）、批次 5（`FovWatch` 调度器，LOS 复用；**同样还不存在**）。批次 1 之后代码按 `engine/…` 分目录；下文提到的 `engine/world/terrain.js` 是批次 1 之后的路径。

| 场景类型 | 描述 | 与现状的关系 |
|---|---|---|
| `ocean` 纯海洋 | 现有全部关卡 | **零成本路径**：`terrain` 缺省，`terrainFn` 为 null，渲染与物理与现状逐像素 / 逐帧相同 |
| `coast` 海岸 | 一部分海、一部分陆地，海岸线弯曲 | 新 |
| `island` 岛屿 | 海洋中有一片或多片陆地 | 新 |
| `inland` 内陆 | **目力所及全是陆地**，没有海面 | 新；关掉海面、地平线收在陆地与雾色之间 |

### 9.0 现状与前提

| 事项 | 现状 | 影响 |
|---|---|---|
| 地形钩子（`setTerrain` 等） | 钩子在 `entities.js:79-92`（`terrainFn / SEA_Y / terrainY / groundY / isLand / agl / setTerrain`），**从未被调用**（只有 `tools/probe-ccip.js` 用）。读者清单属实：撞地 `entities.js:860-865`、导弹 `:1499-1505`、子弹 `:2532` 与 `game.js:2816`、AI `ai.js:498/895/1050`、HUD `hud.js:1774`、炮塔 `turret.js:150`、`game.js:2885`。**但 `groundY` 被夹在 `SEA_Y = 0`，`kill()` 的 `groundImpact` 参数收了没用**，死因 `crash-sea / crash-ground` 现在不存在 | 批次 2.1 要先做 |
| 地形的渲染管线与 2048 顶点上限 | **没有"地形管线"**。2048 是 2D 回退的暂存数组大小 `MAXV`（`render.js:88`，`pushModel` 里 `nv > MAXV` 直接 return），不是 GL 或 16 位索引限制，smoke 里也没有这条断言。GL 的模型路径是**非索引三角形、每面一个颜色**（`render-gl.js:135-180`，`STRIDE = 13`），没有顶点色、没有 `drawElements`、没有视锥裁剪（`:295-381`） | 地形要当成"许多块模型"来推；2D 里每块 ≤ 2048 顶点（32×32 格） |
| 海面的绘制方式 | **没有 `drawSea`**。天空和海是**一个全屏三角形**在一个片元着色器里做完（`render-env.js:78-154`、`:616`）：每像素把视线与半径 `R` 的球（海面，写死在 y = 0，`uRh / uC`，`:606-607`）求交，`t ≤ 0` 画天空，否则画海 | 关海面要新增 uniform；海平面固定为 0，**不支持 `seaLevel ≠ 0`** |
| 远景环形 LOD 的范围 | `FOG_FAR = 9000 m`、`FOG_MAX = 0.82`（`shading.js:25`），雾按**面中心**深度算；9 km 外只剩 18% 的本色，实际可见约 12–15 km | 3 环里的远环基本没有意义，见 9.2 |
| 云层高度 | 云层高度是**绝对值**：`DECKS` y = 2100 / 5200，`SHEETS` y = 12600 / 17400（`shading.js:48-57`）；高于 2 km 的地形会穿过低云层 | 见 9.2 |
| 高海拔下仍按海拔判断的位置 | 以下仍按**海拔**判断，高地上会出错：`missions.js` 的 `detected = player.pos.y > N`（`883、1395、1637、1930、2372`）、`game.js:3492`（近地音效 `pos.y < 260`）、`ai.js:829`（`pos.y < 3200` 爬升）；追尾相机**没有地形钳制**（`game.js:3285-3334`）；所有"地面"目标都是写死 `y: 0` 的海上平台（`missions.js:419、738、751、768、1306、1496、1506`，`ground:true` 只是类型） | 见 9.1 |
| 导弹 / 子弹的撞地检测 | 都是**末点单点采样**（`entities.js:1499、2532`）；导弹约 1000–1400 m/s，每个 1/60 s 步长 17–23 m，会穿过细山脊或 20 m 的楼 | 见 9.1 |
| `effRange` 对地形的屏蔽 | `effRange`（`entities.js:1548-1553`）模拟期间把 `terrainFn` 置空，但 **`naturalPoint`（`:1796+`）没有屏蔽** | 一并屏蔽 |
| 可复用的噪声函数 | 只有着色器里的 GLSL `hash / noised`；`js/` 里**没有 CPU 噪声**（`render-env.js:410` 的 `lcg` 只是 PRNG） | 要写 CPU fBm |
| 烘焙地形的随机数来源 | `tools/lib/sim.js:94-95` 用 `mulberry32` **替换了全局 `Math.random`**；烘焙若调 `Math.random` 会移动随机流，破坏"海洋关逐帧一致" | 必须用私有 PRNG |

### 9.1 地形数据与高度场

**数据**（`mission.terrain`，缺省 = `ocean`；**海平面恒为 y = 0**，高度为负即水下，所以没有 `seaLevel` 字段）：

```js
terrain: {
  kind: 'coast',            // ocean | coast | island | inland
  seed: 7731,               // 同种子 = 同地形
  maxH: 1800,               // 最高点（缺省 1800，低于最低云层 2100）
  base:    { amp: 900, scale: 14000, octaves: 5, roughness: 0.52 },   // 宏观起伏（fBm）
  coast:   { angle: 35, offset: -3000, wiggle: 2400 },                // coast：半平面 + 分形海岸线
  islands: [{ cx, cz, r, h, irregular }],                              // island：若干片
  features:[{ type:'ridge'|'mesa'|'crater'|'valley', cx, cz, …, h, falloff }],
  flatten: [{ cx, cz, r, h }],                                         // 压平区（城市、机场的底座）
  cities:  [{ id, cx, cz, r, density, style, flooded }],               // 见 9.3
}
```

- **用解析函数加烘焙网格，不用位图**：高度 = 宏观 fBm（带种子的值噪声）+ 海岸 / 岛屿遮罩 + 特征叠加 + 压平区。
- **噪声与 PRNG**：CPU 端写一个自己的 fBm（带种子的值噪声）与自己的 PRNG，**不碰 `Math.random`**。烘焙**惰性**：在"出击"过场里按关卡一次性做（不在脚本加载时），并缓存；`Sim` 对每个种子重新载入时才不会被拖慢。5 个八度、64 万格约 300 万次噪声求值，Node 里预计几十到几百毫秒（估计值，未实测）。
- **烘焙**：把战场区（`Arena` 外包盒 + 余量）烘焙成 `Float32Array`（起步 100 m 网格；80 km 边长 ≈ 64 万格 ≈ 2.5 MB）。`terrainY(x, z)` = 双线性插值，**渲染网格与物理共用这一份数据**（渲染的近环按 100 m 取样，远环按每 4 格取样），所以不会出现"画面上是山、物理上是平地"。
- **物理钩子**：`Ent.setTerrain(fn)` 在关卡载入时调用；撞地 / 导弹 / 子弹 / AI 拉起 / HUD `TERRAIN` 告警都已经读这套钩子。
- **要一并修的"按海拔"判断**（见 9.0）：`missions.js` 里 5 处 `detected = player.pos.y > N` 改读 `agl`；`game.js:3492` 近地音效改读 `agl`；`ai.js:829` 的爬升判断改读 `agl`；追尾相机加地形钳制（相机位置 `y ≥ groundY + CAM_MIN_AGL`，起步 4 m，别让相机钻进山里）。
- **撞击检测**：导弹与子弹的撞地判定改为**线段步进**（本步起点到终点，按 `max(步长, 25 m)` 取样对双线性地形与屋顶栅格判定），避免细脊与楼被穿过；只对"在地形包围盒高度以下"的弹体做，开销可忽略。`effRange` 与 `naturalPoint` 一并屏蔽真实地形。
- **地面目标与出生点**：`spawnTarget`（`missions.js:286`）与 `Ent.makeTarget` 自动取 `groundY`；上面那 7 处写死的 `y: 0` 要逐个核对（它们都是海上平台，海洋关里保持 0）。**海 / 陆互斥校验**（smoke，新增）：`spawnShip / spawnPlatform` 必须落在水里（`terrainY < 0`），`spawnTarget`（陆地设施）必须落在陆地上，舰船航线穿过陆地同样报错。
- **特效**：舰船尾流（`wakeSpray`，`entities.js:2582`，由 `game.js:2912` 调用，目前不看陆地）与落水柱（`combat.js:251-256` 写死 `y = 0.5`）要加 `Ent.isLand` 判断，陆地上改出尘土碎石；对地弹撞地的半球壳已有，不用新增。

### 9.2 渲染

**管线**：把地形做成**许多块"模型"** `{ v, f:[{ i, c }] }`，`pushModel` 位置 `(0,0,0)`、单位基底、缩放 1；GL 会按模型对象缓存成静态缓冲（`render-gl.js:85、182-208`）。每块有自己的包围盒，**在 JS 里做视锥 + 距离裁剪后再 `pushModel`**（GL 路径不做裁剪）。每块一次 `drawArrays`、约 12 次 uniform 调用，所以块要足够大（起步 2 km × 2 km）。

- **颜色只能按面**（没有顶点色）；低多边形平面着色与现有画风本来就一致，颜色按面平均高度 / 坡度分档（浅滩 → 草地 / 灌木 → 岩石）。
- **雾按面中心深度算**：远处的大三角形会出现雾色分段，低多边形风格下可以接受；近环用小格子避免。
- **半透明按实例**（`it.a`，按实例原点排序、不写深度）：海岸浅水带要做成**单独的一块带 alpha 的模型**；海岸泡沫也一样，不能按顶点渐变。
- **深度**用对数深度（`gl_FragDepth`，`render-gl.js:73`），6 万三角形的量级可以承受。

**环形 LOD**：

| 环 | 半径 | 格距 | 三角形（估） | 内容 |
|---|---|---|---|---|
| 0 近景 | 0–6 km | 100 m | ≈ 2.5 万 | 全部八度噪声、特征、城市建筑 |
| 1 中景 | 6–14 km | 400 m | ≈ 0.6 万 | 降低八度，城市合并成街区块 |
| 远处 | 14 km 以外 | — | 0 | **不生成几何**，直接用雾色收尾 |

- **理由**：`FOG_FAR` 仅 9 km，14 km 以外几乎全被雾盖掉，不设更远的第 3 环（1.6 km 格距）。真边界外玩家最多再飞出 `ARENA_FADE_S × 巡航速度` ≈ 2–3 km 就失败，所以"战场外更粗糙，直到玩家完全飞不到的地方"在这里就是**边界外只保留宏观起伏、不再生成特征 / 建筑 / 压平区**，并且被 14 km 的上限自然截断。
- **雾必须完全不透明**：`FOG_MAX = 0.82` 会让网格边缘露出一道可见的边。为地形块增加**每实例 `fogMax` uniform**（地形取 1.0，其余模型保持原值），网格边缘处雾色完全覆盖。
- **统一远景颜色**：现在有三个"远处"颜色——模型雾 `FOG_RGB`（150,176,196）、海面薄雾 `SEA.haze`（77,100,114）、天空地平线（201,216,221）（`shading.js:24-39`）。地形远处用 `FOG_RGB`（与模型一致），内陆地平线以下的填充色也取 `FOG_RGB`，避免"地形比天边还亮 / 还暗"。
- **内陆（关海面）**：`drawEnv`（`render-env.js:594-611`）新增 `uSeaOn` uniform，关闭时海面分支改走"雾色 / 天空"；`inland` 同时关闭尾流与海面反射特效。2D 回退同步改 `horizonY()`、`drawSky`、`drawGround`（`render.js:157、286-330`，目前是 y = 0 的渐变加 500 m 网格）。
- **云层**：`DECKS` 与 `SHEETS` 是绝对高度。地形默认最高 1800 m，低于最低云层（2100 m）；若某关需要更高的山，经 `Shading.setEnv({ deckBase })`（批次 3.2）把云层整体抬高。
- **地球曲率**：GL 模型管线把所有顶点按 `d² / 2R` 下沉（`uCurve`，`render-gl.js:41、327`；10 km 约 7.8 m、20 km 约 31 m、40 km 约 125 m），地形与舰船一起下沉，所以画面内部是自洽的；**物理与 LOS 是平的**，在 12 km 以内差别 ≤ 约 11 m。验收里明确这个容差，并让 LOS 采样**减去同样的曲率项**（让山真的能挡住地平线以下的目标）。
- **2D 回退**：每块 ≤ 2048 顶点（32×32 格 = 1089 顶点、1922 个三角形），按**从远到近**推入做画家算法排序（`render.js:510`），预算 2–4 千个面（与舰船模型共用）；建筑不画，城市只画深色多边形；还不够就只画剪影。
- **预算**：地形块数 / 三角形上限与现有云 / 海面遍同帧预算；`probe-perf` 加地形场景。

### 9.3 城市（简单多边形楼房）

**生成**（关卡载入时，按 `cities[i].seed` 确定性生成，同样使用私有 PRNG）：

- 在城区圆内取带抖动的街区网格，每个街区 1–N 栋楼；楼的平面是**4–8 顶点的拉伸多边形**（矩形、L 形、凹口形），屋顶平顶；高度 `h` 服从偏向城中心的分布（外围 15–30 m，核心 60–140 m，个别塔楼更高）。游戏尺度是压缩的（飞机长约 20 m），所以楼房按"让玩家能钻进街道峡谷、又不会挡死天空"的比例设计，不追求真实数值。
- `style`（预设：`dense` 密集 / `sprawl` 低矮蔓延 / `industrial` 厂区 / `port` 港口）控制街区密度、高度分布与配色。
- **`flooded` 水淹城区**：与世界观里的海面上升呼应——城区一部分低于海面（高度为负），水面漫进街区，楼顶与上半截露出水面。不新增机制。
- **压平区**：城市底座自动套一个 `flatten`，保证地面平整、楼房不悬空。
- **规模上限**：每座城市楼房数 ≤ 3000（每栋约 12–20 个三角形，约 5 万个；GL 可以承受，2D 回退不画）。

**渲染**：

- 近景（< 4 km）：每栋楼的完整多边形；中景（4–12 km）：同一街区合并成一个块；远景：不画楼，只在地形上画一块深色地块。
- 建筑静态合并成**每 1 km 瓦片一个网格**，在载入时一次性构建，按 9.2 的"许多块模型"推入，**每面一个颜色**（墙面、屋顶不同色）。
- 窗 / 灯光不做；低太阳角时可选对少量楼体加暖色自发光（可选，不在验收内）。

**物理与判定**：

- **楼顶高度栅格**：城区内另烘焙一份 25 m 格距的"屋顶高度栅格"，`terrainY` 取 `max(地面, 屋顶)`，所以 `agl`、撞楼、AI 拉起、LOS 全部自动把建筑算进去；撞击检测用 9.1 的线段步进，才不会穿楼。
- 爆炸与对地弹落在楼上按落点高度起爆；**本批建筑不可摧毁、不吸收爆炸伤害**（栅格是独立数据层，将来加可摧毁不会留技术债）。
- 地面设施（SAM、雷达、中继、指挥所……）可放在城区内，`spawnTarget` 自动取 `groundY`。

### 9.4 视线（LOS）

新模块 `engine/world/terrain.js` 提供 `Terrain.los(a, b)`（沿线段步进采样，步长 100–200 m，带包围盒快速排除；城区内改用 25 m 步长以不漏楼；采样带曲率修正；单次估计 5–10 µs，城区 10 km 约 400 个采样）。**调度复用批次 5 的 `FovWatch` 保守调度器**（余量 ÷ 最大相对速度）。

**实测的规模（`Sim` 跑 13 个关卡前 60 s）**：actor 最多 18、target 最多 52（多数是 18.5–21 km 外的中立调节单元，对地面 LOS 无意义）、导弹最多 8。所以问题不在"总量"，而在**几个按对遍历的位置**。接入点：

| 场景 | 位置 | 行为 | 频率与成本 |
|---|---|---|---|
| 玩家锁定 | `updateLock`（`game.js:2611`，`ok` 条件约 `2693-2715`） | 被遮挡则不能锁 / 丢锁（先例：被干扰时丢锁） | 每帧 1 次，便宜 |
| Tab 切换 | `cycleTarget`（`game.js:1971`） | 被遮挡的目标不进候选 | 仅按键时，一次性 |
| AI 发射门限 | `ai.js:996-1011` | 被遮挡不开火 | 放在 `okDist / okAng` 之后，被廉价门限挡掉多数 |
| **地面发射点选目标** | `pickTargetFor`（`game.js:2877`） | 被遮挡不选 | **每个发射点 × 全部 actor，最多约 40 个点 × 18 架 = 700 对**，必须缓存 |
| **炮塔选目标** | `turret.js:345` 的 `pick` | 弹道被遮挡不选 | **每个炮塔 × 全部 actor 与 target，每步**；4–6 艘舰 × 4–8 个炮塔，必须缓存 |
| IR 捕获 | `irAcquire`（`entities.js:1088`，`:1263` 起每帧、未锁定的红外弹） | 被遮挡看不到 | 放在视场锥检测之后 |
| 导弹飞行中 | `stepMissile` 的 `t && seekerOn` 分支（`:1314-1360`），现有 `lostTime` 视场丢失处理 | 被遮挡累积 `lostTime`；**半主动弹照射线同样被遮挡** | 每帧，只对"有目标的导弹" |

- **缓存规则**：每对（观察者, 目标）10 Hz 缓存，加 AABB 先排除；`FovWatch` 的"离边界还有多远"调度用来跳过远离遮挡边界的对。
- 这是新增的最大性能项，`probe-perf` 重点盯。

### 9.5 HUD 与简报

- **雷达**：`drawRadar`（`hud.js:543`）是固定 12 km 的裁剪圆，按相机朝向旋转（`radarDir / radarH`）。地形层做一块**小的离屏栅格**（玩家周围 48×48 采样，4–10 Hz 重绘），在 `drawBlips` 之前画进裁剪圈；陆地浅色、城区深色；`inland` 没有海 / 陆分界，改成按高度的等高色带。
- `TERRAIN` 告警沿用（`hud.js:1774`，目前只看 `agl < 200` 且机头向下），并改为按**前方地形高度**预警；撞楼视作同一类。
- **简报页** `drawMap`（`game.js:1265`）：`game.js:1299-1306` 的注释写着"这里不再画陆地…纯海域"，要**反转**。它按 `m.map` 标记的外包盒自动缩放并按 `m.axis` 旋转，所以在同一个东 / 北坐标系里烘焙一张 128×128 的粗栅格（海岸线 / 岛 / 城区块）叠在底层，数据取自同一份 `terrain` 声明，不另存。

### 9.6 AI 与环境配合（可选，与批次 5 衔接）

- 利用山谷 / 街道峡谷遮蔽接近的战术：`ai/maneuvers/terrain-mask.js`，按技能启用（批次 5 的"低空突防""撤向防空伞"遇到地形时会用）。
- 舰船的航线、水面单位的出生都受"必须在水里"约束（9.1）。

### 9.7 开发用试验场景

不进正式战役，只给 `Sim` 与 `probe-render` 用（`tools/scenes/terrain-*.js`）：一个海岸、一个岛屿群、一个纯内陆（含城市）、一个水淹城区。四个场景各配 3–5 个探针断言，便于以后改渲染 / LOS 时回归。`probe-render.js` 是在**真实 Chrome 页面**里比较 GL 与 2D 像素差的（不是 Node 无头），地形出图要用它。

### 9.8 验证

- **物理**：沿 `groundY` 贴地飞行不撞山；撞山 / 撞楼死因正确（`crash-ground`）；导弹以 1400 m/s 擦过 25 m 的楼与细脊时被拦住（线段步进）；舰船只出现在水里、设施只出现在陆地。
- **视线**：山后 / 楼后的目标无法被锁；导弹绕山背后丢失跟踪；LOS 开销在预算内（`pickTargetFor` 与炮塔 `pick` 有缓存）。
- **一致性**：随机抽样 1000 点，渲染网格的高度与 `terrainY` 的偏差 ≤ 一个格距的插值误差（"所见即所撞"）；曲率造成的偏差在 12 km 以内 ≤ 约 11 m。
- **LOD / 雾**：块与块之间无缝；网格边缘雾色完全覆盖（无可见边）；战场边界处高度连续；相机在边界外仍能看到粗糙的远景直到 14 km。
- **场景类型**：`ocean` 与现状逐像素 / 逐帧一致（黄金回放，且烘焙不调 `Math.random`）；`inland` 没有任何海面像素；云层不穿山。
- **性能**：`probe-perf` 加四个地形场景，逻辑帧耗时与烘焙时间在预算内；2D 回退的面数 ≤ 预算。
- 相机不钻进山里；`TERRAIN` 告警按前方地形触发。
- `probe-render` 地形出图目检（含低太阳角）；smoke 加 `terrain` 字段校验与海陆互斥断言。
- 文档：`rendering.md`（新增"地形块"一节与雾 / 海面开关）、`entities.md`、`ai.md`、`missions.md`（`terrain` 字段）、`models.md`（城市生成不走 MODELS，2D 的 2048 上限说明）。发 v3.8。

---

## 批次 10 · v3.9 全新战役

> "分水岭行动结束很久之后，上游和下游各自在准备充分后开始了一场全面战争……"

本批只给骨架，因为内容取决于设定（批次 W、7）与关卡工具（批次 8）：

1. **设计稿先行**：`docs/world/CAMPAIGN-3.md`——时间线、阵营、关卡清单（建议 8–10 关）、每关用到的新机制（地形、整备、撤离、友军编成、新单位、VTOL）。
2. 新战役写进 `CAMPAIGNS`（按 id），关卡按批次 1 的约定一关一文件。
3. **视角（已定）**：仍以上游玩家为主视角。若以后要让**下游也可驾驶**，现状是：下游武器 `fits:[]`（语义是"上游拿不到实物"），所有可玩机型都是上游，需要补"下游可驾驶机型 + 下游武器的挂载适配 + 战役 / 机库的阵营切换"，这是一个额外的整批工作，单独立批次再做，不在 v3.9 里。

发 v3.9。

---

## 12. 横向事项

**每个批次的固定收尾**（沿用 2-0IMPL）：

1. `node tools/smoke.js` 与 `node tools/probe-missions.js` 全绿 + 本批新探针；新探针一律建在 `Sim` 上、固定种子。
2. 更新 `docs/systems/*.md`，并修正 `docs/README.md` 的索引。
3. 手动指定版本号、写 changelog（`node tools/release.js vX.Y.Z`）。
4. 提交。

**新增 / 变更的工具**：

| 工具 | 批次 | 用途 |
|---|---|---|
| `tools/lib/scripts.js` | 1 | 统一加载顺序解析 |
| `tools/gen-index.js` | 1 | 生成 `index.html` 的脚本块；smoke 校验同步 |
| `tools/snapshot-data.js`、`tools/golden.js`、`tools/text-census.js`、`tools/extract-text.js`、`tools/probe-perf.js` | 1 | 重构验证与迁移辅助 |
| `tools/gen-locales.js`、`tools/fmt-locales.js`、`tools/check-locales.js`、`tools/lib/strict-json.js` | 1 | 文本 JSON 的生成、格式化、校验（生成物 `js/core/locales.gen.js`，smoke 校验同步） |
| `tools/bundle.js` | 1（可选） | 发版时拼单文件 |
| `tools/probe-extent.js` | 4 | 测各关实际范围 |
| `tools/probe-psm.js`（过失速，含 AI 场景） | 3 / 5 | 玩家与 AI 的过失速 |
| `tools/probe-sarh.js`、`probe-ab.js`、`probe-fovwatch.js`、`probe-spacing.js` | 5 | 半主动弹、AI 加力、视场事件化、反挤团指标 |
| `tools/probe-drones.js`、`probe-vtol.js`、`probe-carrier.js` | 6 | 无人机压制退化、VTOL、无人机航母 |
| `tools/scenes/terrain-*.js` 与地形探针 | 9 | 海岸 / 岛群 / 内陆 / 水淹城区 |

**文件组织规则**：单文件 ≤ 800 行；新单位 = 数据文件 + 模型文件 + 文本文件 + `gen-index`；新机制 = 在 `Tags` 里声明 + 数据里打标签。

**主要风险**

| 风险 | 缓解 |
|---|---|
| 批次 1 工作量最大、最容易悄悄改行为 | 1.0 的四类基线（数据快照 / 模型哈希 / 黄金回放 / 画面）逐步比对；每一步一次提交；全部完成才发版 |
| 巨型闭包拆分引入共享状态 bug | `$` 私有对象 + 静态检查禁止跨命名空间读 `$`；先拆边界清晰的块；每步黄金回放 |
| 250 个 `<script>` 冷启动慢 | 测量；必要时 `bundle.js` 给线上用 |
| 文本迁移漏字符串 / 回退 | 伪语言目视 + lint 允许清单只许缩小 |
| 光标越极点的手感（取景、鼠标方向）很难纸面推定 | 先做原型，保留 `POLE_HOLD / POLE_SWING_RATE / 取景权重` 可调常量；回退路径是恢复 89° 限位 |
| 撤离让"击毁 N 架"关卡失效 | `mission.retreat` 缺省 off；Sim 的"全员撤离"场景；批次 8 逐关决定 |
| 整备点被当暂停键 | 来袭导弹时禁止整备；`uses` 次数限制 |
| 友军与 AI 机动增多拖慢逻辑帧 | `probe-perf` 基线；`scanShot` 粗网格预案 |
| LOS 判定拖慢 | 10 Hz 缓存 + 包围盒排除；预算写进批次 9 验收 |
| VTOL 动力学与现有 AI / HUD 假设冲突 | 独立 `stepVtol`；本批只给玩家；影响面清单已列 |
| 半主动弹让 AI 的规避逻辑互相打架 | `ai.illum` 状态机 + 自保阈值；`probe-sarh` |
| 过失速模型打破运动学假设，影响其它飞行逻辑 | PSM 作为独立分支，`stepAircraft` 主路径不动；黄金回放保证不触发时逐帧一致；出口 0.8 s 低舵效过渡 |

---

## 13. 决策记录与待定项

### 已定

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 脚本加载方案 | 散文件 + 生成 `index.html`；慢了再加可选 `bundle.js` |
| Q5 | 世界观机制 | C（气溶胶不对称 + 相位同步） |
| Q8 | 新战役视角 | 仍以上游为主；下游可驾驶另立批次 |
| P1 | 存档 | 批次 2 |
| P2 | 失败后停留画面 + 提示 | 批次 2 |
| P4 | Radio 显示时长 + 优先级队列 | 批次 5 |
| P3 | 全局难度选项 | 不做 |

### 追加已定

| # | 问题 | 结论 |
|---|---|---|
| Q2 | 批次 1 版本号 | v3.0.0，其后顺延，新战役 v3.9 |
| Q3 | 重型轰炸机尺寸 | 机长 ≈ 58 m、翼展 ≈ 54 m，新增 `hitR` |
| Q4 | 半主动弹命名 | 沿用 CLA 词根，编号在批次 5 落地时给候选评审 |
| Q5b | 降雨变少的成因 | γ 复合（吸收 δ），见 W.3；行星暂不改；成因保留模糊 |
| Q6 | 世界地图基准 | 完全架空形状，并体现海面上升 |
| Q7 | 其它空军单位 | 巡飞攻击无人机、重型运输机、空中整备 / 加油机（反辐射无人机不做） |

### 待定

无。

### 其余提案（默认处理方式）

| # | 提案 | 理由 | 默认 |
|---|---|---|---|
| P5 | **AI 感知模型**（探测锥、丢踪延迟） | 让预警机与干扰的价值更大，但改动面大 | 不做，批次 8 之后再评估 |
| P6 | **性能基线探针** `probe-perf` | 友军、无人机、LOS 都会拉高成本，需要预算 | 做（批次 1 起） |
| P7 | 详情页显示"机制标签" | 标签体系做完后零成本让设计意图可见 | 做（批次 1） |
| P8 | 菜单键盘导航（DESIGN §8 已知问题第 2 条） | 屏幕模块拆开后单个屏好改；非必须 | 视情况 |
| P9 | 发版用的 `bundle.js` | 见 Q1 | 量完冷启动再决定 |
| P10 | 暂停菜单"无线电记录"页签 | 配合 Radio 队列，保证信息不丢失 | 做（批次 5，已写入 5.5） |
