# 2.x 后续实施计划（POST 2.0）

对应 [POST2-0PLAN.md](POST2-0PLAN.md)（草稿，保持原样不动）。写法沿用 [2-0IMPL.md](2-0IMPL.md)：分批次、每批独立发布、每步都能玩能验。数值都是**起步值**，以各批次的探针脚本实测为准再调。

**本文已按 v3.0.1 之后的新结构重写**：批次 1（底层重构）已经完成，所以它在这里是一份**完成记录**；其余批次的"现状"都对着重构后的代码重新核对过，引用代码位置一律写"模块 + 函数"（如"`Game` 的 `finish`，`js/engine/game/finish.js`"），**不再写行号**——行号一重构就作废。已定的决策与提案的处理方式汇总在第 13 节。

> 读这份文档之前先读：[DESIGN.md](DESIGN.md) 第 2、3 节（目录与加载顺序）、[systems/modules.md](systems/modules.md)（各命名空间的公开接口）、[systems/tags.md](systems/tags.md)、[systems/text.md](systems/text.md)、[systems/pages.md](systems/pages.md)、[systems/tools.md](systems/tools.md)。下文凡是写"新建文件"的，都是计划要新增的；没写的都是现在就存在的。

---

## 0. 排序原则与版本表

排序规则：文件底层重构最先；然后是不依赖别的部分、也不给别的部分留技术债的小功能，放一起做；其余按依赖关系排，相辅相成的放同一批。

排序依据：

1. **重构必须最先**（已完成）。之后每一批都要新增单位、数据、文本、关卡，文件结构不定下来，新东西就要先写进旧结构、再搬一遍。
2. **小件包第二**。失败原因、去假飞机、电磁干扰乱码、加挂点、重型轰炸机重做，都只碰数据或一两处调用点，互相无依赖，也不会被后面的批次推翻。
3. **光标越极点 + 天色时间**放第三批：两者都只动相机 / 渲染环境，一起验。
4. **地图边界 + 整备点**必须先于 AI 强化：撤离要"离开地图范围后被移除"，还要能"向整备点撤离"。
5. **AI 强化 + 半主动雷达弹**同批：半主动弹的 NPC 使用依赖 AI 的"持续锁定目标"状态，两者相辅相成。
6. **新单位**必须在 AI 强化之后：战略制空支援机的行为"在友机后方游走、定期齐射"直接复用 AI 批次的外围游走战术；敌方无人机、友方有人机的无人僚机要用同一套"长机泛化"。
7. **世界观重编（批次 W）紧跟批次 1**：它不依赖任何功能，但失败台词、Chatter、简报、关卡文案、资料库都会引用世界观，先定下来避免返工。资料库背景与世界地图（批次 7）仍放在后面。
8. **地形放在关卡重构之后、全新战役之前**：它是渲染 + 锁定判定的大改，最重也最独立；新战役要用它。

| 批次 | 版本 | 内容 | 前置 | 状态 |
|---|---|---|---|---|
| 1 | **v3.0.0**（收尾补丁 v3.0.1） | 文件底层重构：目录、注册表、标签、文本分离（i18n 底座）、页面副本、tools 分组 | — | **已完成** |
| W | **v3.1.0** | 世界观重编（调节机制、降雨灾难成因；纯文本，提前做） | 1 | |
| 2 | **v3.1.x** | 小件包，**每项单独发一个补丁版本**：v3.1.1 失败原因、v3.1.2–v3.1.5 模型修复（假机、挂载翼面、无人机座舱、曳光弹）、v3.1.6 干扰乱码、v3.1.7 假目标、v3.1.8 挂点（**所有战斗机** +1 对）、v3.1.9 重型轰炸机、v3.1.10 存档。全部完成后不再额外发版，批次 3 起升到 v3.2 | 1、W | |
| 3 | **v3.2** | 光标越极点 + 相机重构；关卡时间与天色；过失速机动（PSM） | 1 | |
| 4 | **v3.3** | 地图边界；整备点（含暂停整备界面） | 1、2（失败原因） | |
| 5 | **v3.4** | AI 强化：技能值、外围游走 / 回头、友军独立 AI、撤离；Radio 队列与条件触发无线电；半主动雷达弹（**仅锁定时受引导**） | 3、4 | |
| 6 | **v3.5** | 新单位：轻型舰载 VTOL（可玩）、国土防卫重型战机（可玩）、战斗轰炸机（可玩）、航空巡洋舰、战略制空支援机、浮空平台武器、敌方无人机、友方有人机的无人僚机 | 5 | |
| 7 | **v3.6** | 资料库追加背景、世界地图 | W | |
| 8 | **v3.7** | 关卡重构：友军编成、上游空军呼号、无线电填充、剧情文案 | 4、5、6、W | |
| 9 | **v3.8** | 地形、城市与场景类型（海洋 / 海岸 / 岛屿 / 内陆）；遮挡锁定与导弹追踪 | 1、2（死因）、3、4、5（FovWatch） | |
| 10 | **v3.9** | 全新战役 | 全部 | |

> 批次 7（资料库背景与世界地图）依赖批次 W，与 2–6 无依赖，可以在任何时候插进去。
> 版本号手动指定。批次 1 按"换引擎算主版本"的先例发了 **v3.0.0**（之后又发了 v3.0.1 收尾补丁），批次 W 发 v3.1.0，批次 2 全部在 W 之后、只发补丁版本 v3.1.1 起，批次 3 起为 v3.2 … v3.8，新战役发 v3.9（若觉得新战役值得再升一个主版本，发版时改成 v4.0.0 即可）。

---

## 1. 现状摘要（批次 1 之后，后续批次要记住的事实）

### 1.1 已经变成这样的（批次 1 的成果）

| 事实 | 位置 | 对后续批次的含义 |
|---|---|---|
| 加载顺序的唯一权威是 `tools/build/gen-index.js` 的层规则；页面副本里的 `<script>` 块由 `tools/build/gen-pages.js` 生成；所有工具从 `tools/lib/scripts.js` 取顺序 | `tools/build/`、`tools/lib/` | 加文件 = 新建文件 + 跑 `gen-pages`；smoke 断言页面副本与目录、模板、文本一致 |
| 数据一个单位一个文件，用 `Registry.xxx({ id, order, … })` 注册，`zz-seal.js` 封存并生成兼容全局（`AIRCRAFT` `SHIPS` `PLATFORMS` `WEAPONS` `TURRET_GUNS` `TARGETS` `MODELS` `MISSIONS` `CAMPAIGNS` `CODEX`） | `js/data/`、`js/models/`、`js/missions/`、`js/ui/codex/` | 新单位 = 数据文件 + 模型文件 + 文本 JSON；重复 id 注册时抛错；封存后再注册抛错 |
| 一件武器的全部字段写在它自己的文件里（`attr` / `look` / `role` / `needs` / `cd` / `lead` / `flareRD`），旧的 8 张侧表已不存在；舰船的 `mounts` / `launchers` 并进各舰文件；`HARD_MODELS` / `GUN_RESIST_MODELS` 并进 `js/data/targets/`；机炮 id 改名 `cel1 cel2 cel3 cel7 cel11` | `js/data/weapons/`、`ships/`、`targets/` | 加武器只动一个文件；`{{字段}}` 描述模板仍在封存时展开（`js/data/zz-seal.js`） |
| **机制标签已落地**：数据里写 `tags: [...]`，注册时展开成 `{ 名字: true }`，机制代码读 `x.tags.名字`；标签在 `js/core/tags.js` 声明（17 个），smoke 断言"用到的都声明过、声明的都有人用"；单位详情页有"机制标签"一行；`isDrone` 已改成 `unmanned`，`GUN_MUZZLE` 已改成机型字段 `muzzle` | `js/core/tags.js`、`js/core/registry.js` | 新机制（`sarh` `noPSM` `resupply` `vtol` `droneCarrier` `noRetreat` `ewfield` 等）= 先 `Tags.declare` 再给数据打标签 |
| 巨型闭包已拆：`Ent` → `js/engine/entities/*`（12 个文件），`AI` → `js/engine/ai/*`（`util` `steer` `brain` `tactics`），`HUD` → `js/ui/hud/*`，`Game` → `js/engine/game/*` + `js/ui/*` + `js/ui/screens/*` + `js/boot/*`，`PLANFORM` / `RenderEnv` → `js/render/*/`；每个命名空间有私有状态 `NS.$`，公开接口集中在 `zz-api.js`，`$` 只许本命名空间的文件读写（smoke 有静态检查） | 见 `docs/systems/modules.md` | 新文件要属于某个命名空间（放进对应目录、通过 `$` 共享、在 `zz-api.js` 暴露公开函数），或者是新的独立全局模块；`zz-` 开头的文件整层最后加载 |
| 挂载展开 / 称重 / 落到飞机抽成 `Loadout`（`defaults / resolve / mass / passive / apply`）；机库视图 `Game.$.hangarView`（`ac / group / ids / rebuild`），`buildHangar(view)` / `buildHardpointEditor(ac, lo, view)` 不再读写全局，可以传一套自己的元素 id | `js/engine/loadout.js`、`js/ui/screens/hangar.js` / `hardpoints.js` | 批次 4 的整备界面直接复用 |
| 全部玩家可见文字在 `locales/<语言>/text/**.json`，代码里写 `T('键')`（约 2000 条，脚本里只剩 27 条开发者消息 / 对象键，允许清单只许缩小）；`?lang=pseudo` 目视找漏迁 | `locales/`、`js/core/text.js` | 新文本一律先写 JSON；改完跑 `gen-locales` 再 `gen-pages` |
| `index.html` 是生成的**启动器**（按 `?lang=` / `localStorage['ml.lang']` / 浏览器语言重定向），页面副本在 `locales/<语言>/html/index.html`，由 `locales/_html/` 的模板片段 + 文本生成；页面上的静态文字是 `html.*` 键 | `locales/_html/`、`tools/build/gen-pages.js` | 加 DOM（失败提示、整备界面、无线电记录页签）要改模板片段与 `text/html/*.json` |
| 工具分组：`tools/test/`（smoke、snapshot-data、golden、golden-render、probe-perf、text-census、check-locales、`probes/`、`baseline/`）、`tools/build/`、`tools/render/`、`tools/lib/` | `docs/systems/tools.md` | 新探针放 `tools/test/probes/`，新场景放 `tools/test/scenes/`；**完整 smoke 很慢（近二十分钟），日常用 `--only 段名`** |
| 三道秒级回归基线：`snapshot-data`（数据 / 模型 / 关卡 / 资料库哈希）、`golden`（固定种子逐秒哈希实体状态）、`golden-render`（每关 3 帧的全部 2D 绘制调用哈希；基线在 v3.0.1 之后因"罗盘跟镜头"重存过一次） | `tools/test/` | 改行为的批次要有意识地重存对应基线，并在提交说明里写清楚为什么 |
| HUD 顶部罗盘**读镜头方位**（`Renderer.getCam().fwd` 的水平投影），不再读机头；机头航向另存 `p.heading` | `js/ui/hud/instruments.js` | 批次 3 的相机重构要保持这个行为 |

### 1.2 重构后仍然成立的老事实（后续批次要处理的坑）

| 事实 | 位置 | 影响 |
|---|---|---|
| 光标是 `aimYaw`（无界）+ `aimPitch`（夹在 ±89°，`AIM_PITCH_LIM`）；相机 `up` 恒为世界 +Y，`camPitchFor` 把天顶压到画面上缘，相机俯仰另有上限；89° 的原因是 `up=(0,1,0)` 正交化后 `|up|=cos(俯仰)` | `js/engine/game/vars.js`、`js/engine/game/control.js`、`js/ui/camera.js` | 批次 3.1 改成用 (yaw, pitch) 解析构造相机基，该限制消失 |
| `finish(win)` 只有一个布尔；`kill(ent, world, groundImpact, source)` 的 `groundImpact` **参数收了没用**；各关 `lose()` 返回布尔 | `js/engine/game/finish.js`、`js/engine/entities/damage.js`、`js/missions/*.js` | 批次 2.1 要加死因记录和 `w.fail`，同时保持 `lose()` 布尔兼容（probe 与 smoke 都在调） |
| `Radio.push(L)` 是文字上屏的唯一入口，`L.tx` 是 HTML；`Radio` 在 `Game` 之前定义，拿不到 `player.suppressed` | `js/ui/radio.js` | 乱码过滤要做成"HTML 安全"，并通过 setter 注入干扰度 |
| 提交 9e54ed6 只做了"被压制 > 0.35 时无法给僚机下令"，**没有**乱码 | `js/ui/input.js` 的 `setWingCmd` | 草稿里的无线电乱码是全新工作 |
| 没有整备点；`Loadout.apply` 能把配置落到飞机，但没有"补满 / 重装"入口；NPC 的 `buildNpcMounts` 是 `Ent` 内部函数，只由 `makeAircraft` 调用 | `js/engine/loadout.js`、`js/engine/entities/mounts.js` | 整备点要先导出 `Ent.rebuildMounts` |
| 无地图边界；雷达量程写死 12000 m；各关无声明范围；渲染器无界（相机 x/z 按 `PERIOD` 回绕） | `js/ui/hud/radar.js`、`js/render/env/` | 边界要新建数据字段 + 探针先测出各关实际范围 |
| AI 只有 `pursue / evade / extend` 三个模式（`s.mode`），没有"狗斗 / 汇合 / 外围游走"；`skill` 已存在但多数地方是内联魔数 | `js/engine/ai/brain.js`、`tactics.js` | 技能值要先把魔数提成参数表 |
| **先例**：`a.alive=false; a.escaped=true` 就是"被移除、不算击毁"；但 `win()` 里常见 `team===1 && alive` 计数，撤离的敌机会被算作"已清除" | `js/engine/ai/`、`js/missions/*.js`、`js/engine/game/finish.js` | 撤离必须有**关卡级开关**，否则"击毁 N 架"类目标会变成可以被敌人绕过 |
| 非僚机的友军 AI 不存在（team 0 只有预警机 SEXTANT、僚机、舰船）；无人僚机 AI 把长机写死为 `world.player` | `js/missions/_lib.js`、`js/engine/ai/brain.js` | "友军独立 AI"是新建；敌方无人机、友方有人机的无人僚机都要先把长机泛化 |
| 敌方没有任何无人机（下游没有无人机机型） | `js/data/aircraft/` | 需要新机型 + 泛化 |
| 激光导引头是现成的"发射机持续照射"模板：每帧检查 `angleBetween(owner.fwd, owner→target) < LASER_CONE`，失败则 `laserLost`，不销毁目标引用，因此可重新点亮 | `js/engine/entities/missile.js`、`js/ui/hud/targeting.js`（休眠） | 半主动雷达弹照这个写，但**引导判据换成"发射机持有有效锁定"** |
| `seeker === 'radar'` 的判断点分散在 `ui/input`、`ui/screens/hardpoints`、`entities/warhead`、`ai/brain` 等处 | 全仓库 grep | 半主动不新增 `seeker` 值，用标签 `sarh` 区分，避免到处改 |
| 光照常量集中在 `Shading`；`S.LIGHT` 必须原地改（`S.brightness` 闭包持有同一个对象）；GL 的天空 / 海面渐变只在加载时算一次；2D 回退把天空色写死；`ui/unitview.js` 另抄了一份光向 | `js/core/shading.js`、`js/render/env/`、`js/render/render.js`、`js/ui/unitview.js` | 时间设定要一个 `Shading.setEnv()`，一并刷新缓存 |
| 地形钩子已存在（`terrainFn`、`groundY`、`agl`、`setTerrain`）但**从未被调用**，渲染没有陆地，**没有任何视线（LOS）判定** | `js/engine/entities/physics.js` | 地形批次要同时做渲染和 LOS |
| 没有难度系统 | — | 本计划不引入（见第 13 节 P3） |
| `playerHit` 台词（`VOICES.m1`）定义了没人触发（`SFX` 里有同名音效，无线电侧没有调用点）；弹药告急只有 HUD 的 WINCHESTER，没有无线电 | `js/data/voices.js`、`js/engine/audio.js`、`js/ui/hud/panels.js` | 条件触发无线电的基础是空的 |

---

## 批次 1 · v3.0.0 文件底层重构（**已完成**）

**目标**（已达成）：玩家看不出任何变化，但此后每个单位、关卡、文本都是独立文件，机制代码不再认识任何具体单位。**不变的底线**（沿用 DESIGN.md §1）：零依赖、双击 `index.html` 即可运行、经典 `<script>`、不用 ES module（`file://` 下会被 CORS 拦）。

### 做了什么（对照原计划 1.0–1.11）

| 原计划 | 实际结果 |
|---|---|
| **1.0 基线** | `tools/test/snapshot-data.js`（数据 / 模型 / 关卡 / 资料库逐条哈希，键序与不可枚举成员一并比对，函数按空白折叠）、`golden.js`（固定种子每关 20 s 逐秒哈希）、**新增 `golden-render.js`**（每关 3 帧的 2D 绘制调用哈希——逻辑回放看不到 HUD / UI，所以补了它；基线来自重构前的原版）、`probe-perf.js`、`text-census.js`；基线存 `tools/test/baseline/` |
| **1.1 工具链** | `tools/lib/scripts.js` 统一读取加载顺序（原来的各处正则与硬编码名单全部去掉；`render-env` / `render-gl` 被旧正则漏掉是无意的，现已纳入）；`tools/lib/root.js` 提供仓库根路径；`tools/lib/sim.js` 支持绘制调用追踪与 `S.render()` |
| **1.2 目录与加载** | `js/{core,data,models,missions,engine,render,ui,boot}/`；`tools/build/gen-index.js` 只算顺序（层规则、`_` 最先、`zz-` 最后、各命名空间的 `_state.js` 排在 `core` 之后）；页面副本由 `gen-pages.js` 生成 |
| **1.3 注册表** | `js/core/registry.js`：`Registry.aircraft / ship / platform / weapon / turretGun / target / model / modelGroup / mission / campaign / codexEntry`；`seal` 生成兼容全局；新增 `targets/`（设施数据：`tags` 与 `gunResist`） |
| **1.4 数据拆分** | 3541 行的 `data.js` → 115 个文件；武器 8 张表并回各自文件；机炮 id 改名 `cel*`（用户要求，与玩家看到的 CEL-n 对应）；`snapshot-data` 逐条确认拆分前后一字不差 |
| **1.5 模型拆分** | `ModelLib`（共享调色板 / 网格构建器 / 助手）+ 53 个模型文件；`settle` 由船文件自带 `settle: true`（取代硬编码的 16 艘船名单）；炮塔、平台、挂载弹体生成器用 `Registry.modelGroup` |
| **1.6 关卡拆分** | `missions/_lib.js` + 13 关各一个文件 + `campaigns.js`（战役按关卡 **id** 引用，封存时换成全局下标） |
| **1.7 引擎 / UI 拆分** | 用一次性的 acorn 语句级转换工具把 `Ent` `AI` `HUD` `Game` `PLANFORM` `RenderEnv` 拆成按职责命名的小文件（语句原样搬走，只改写跨文件引用；`$` 私有状态）；`Radio` `SysNote` 独立成文件；`codex` 拆成每条一个文件；`Loadout` 抽成共享命名空间；机库 / 挂载点编辑器改成接收视图对象；**没有一个 `js/` 文件超过 800 行**（生成物除外） |
| **1.8 标签** | `js/core/tags.js`（17 个标签）；武器的 11 个布尔标志、`GUN_MUZZLE`（→ 机型 `muzzle`）、`HARD_MODELS` / `GUN_RESIST_MODELS`（→ `targets/`）、`model === 'cell'/'relay'/'sam'` 分支（→ `regulator` `relay` `sam` `cullFar`）、`isDrone`（→ `unmanned`）全部迁成标签；单位详情页新增"机制标签"一行（P7）。**没有迁的**：关卡脚本里的 `model === 'sower'` 等（那是关卡逻辑，不是机制）；实例标志 `aewc / bigTarget / striker`（暂时仍是实例字段，批次 6 做新单位时再并入默认标签）；`caps` 本来就是标签数组 |
| **1.9 文本分离** | `js/core/text.js`（`T` / `T.pick` / `T.has` / `Text.*`、回退链、伪语言）；约 2000 条中文字符串迁进 JSON，脚本里只写 `T('键')`；`tools/build/{gen-locales,fmt-locales,extract-text}.js`、`tools/test/check-locales.js`、`tools/lib/strict-json.js`；允许清单只许缩小（`text-census --check`）。**与原计划的差别**：文本目录从 `js/locales/` 改到**仓库根目录 `locales/`**（"所有相关的文本和页面集中在里面"），每种语言一个目录（`text/` JSON、`text.gen.js`、`html/index.html`）；键由工具按"文件 + 作用域 + 属性"机器生成（如 `ui.hud.panels.drawWeaponPanel.s3`），之后可手工改名 |
| **新增：页面副本（原计划外）** | `index.html` 本身也被模块化：模板片段 `locales/_html/`（`shell.html`、`screens/`、`overlays/`）+ 文本 → `tools/build/gen-pages.js` 生成各语言页面副本 `locales/<语言>/html/index.html`；根目录 `index.html` 变成按语言重定向的**启动器**（仍是双击入口）；页面静态文字（55 条）进入文本层，键以 `html.` 开头。详见 [systems/pages.md](systems/pages.md) |
| **新增：tools 分组（原计划外）** | `tools/test/`（含 `probes/`、`baseline/`）、`tools/build/`、`tools/render/`、`tools/lib/` |
| **1.10 收尾** | `DESIGN.md` 第 2、3 节重写；新增 `systems/{modules,tags,text,pages}.md`；`tools.md` 重写；其余 `systems/*.md` 逐份对着新代码核对更新。`tools/bundle.js`（线上打包）**未做**，等上线 GitHub Pages 前量完冷启动再决定 |
| **1.11 验证** | 数据快照、13 关逻辑回放、13 关画面回放全部与原版一致（仅有计划内改动：5 门机炮多了 `id` 字段并改名）；`probe-missions` 13 关都能取胜；`probe-perf` 无退化；完整 `smoke` 全部通过 |

### 重构中学到的（对后续批次有用）

- **逐条哈希比对是最强的安全网**：拆分工具是机械的，bug 也是机械的——扫描器把"没有分号的 `for` 循环 + 紧跟的语句"合成一条、把 `game.js` 里 `Game` 之前的 `Radio` / `SysNote` 也写进了 `_state.js`；都是靠快照 / 回放以外的人工检查才发现，**拆完要读一遍生成物的头尾**。
- **`.gitignore` 的 `build/` 会匹配 `tools/build/`**，新脚本一度从没进过提交；已改成只忽略根目录的 `/build/`。
- **逻辑回放看不到画面**：改 HUD / UI 必须配 `golden-render`；改了行为要有意识地重存基线。
- **完整 smoke 很慢**：分段跑（`--only`），批次收尾才跑完整的；"近防拦截"段曾是概率性失败，现已改成最多 8 轮重试。

---

## 批次 W · v3.1.0 世界观重编

> **从批次 7 提前到这里**：它不依赖任何功能，但后面几乎所有批次写的内容（失败台词、Chatter、简报、关卡文案、资料库）都会引用世界观，先定下来可以避免到处返工。纯文本改动，放在文本层完成之后（批次 1，已完成）、其余批次之前。

### W.1 重编世界观：调节机制的物理说服力

问题：碘化银播撒能转移全世界的雨水吗？不能。需要一个"每个单元的影响微不足道，叠加起来达成目的"的机制。

**先做盘点**（半天）：用 `grep` 列出所有提到碘化银 / 凝结核 / 播撒的位置。盘点清单是后续改写的验收依据。命令：

```bash
grep -rlE '碘化银|播撒|凝结核' . | grep -v '^./.git/'
```

按当前仓库实测（v3.0.1），会命中下面这些文件（`locales/zh-CN/text.gen.js`、`locales/zh-CN/html/index.html`、`js/core/changelog.js`、`CHANGELOG.md` 是生成物 / 历史记录，不手改；改完源文件跑 `gen-locales` 与 `gen-pages` 它们自然跟上）：

| 类别 | 文件 |
|---|---|
| 标题页 / 开场白 | `locales/zh-CN/text/html/title.json`（`html.title.p_2`「用凝结核播撒微调季风线」） |
| 资料库 | `locales/zh-CN/text/codex/` 下的 `w1`、`f5`、`s4`、`cmp1`、`t5`（t5 是词根表里 `pej` 的"扩散 / 播撒"，属于词源，不是世界观旧说法，按需保留） |
| 关卡文本 | `locales/zh-CN/text/missions/m3.json`（简报、目标、失败条件，"灰烬"级播撒机 / 340 kg 碘化银 / 反凝结核） |
| 台词 / 战斗提示 | `locales/zh-CN/text/data/voices.json`（m3 台词）、`locales/zh-CN/text/engine/game/combat.json`（误伤单元的提示） |
| 机库文本 | `locales/zh-CN/text/ui/screens/hardpoints.json`（`pej` 系词根"扩散 / 播撒"，词源，同 t5） |
| 代码注释 | `js/models/targets/cell.js`、`js/models/targets/sower.js`、`js/data/_schema.js`、`js/missions/m3.js`、`m7.js`、`_lib.js`、`js/engine/game/lock.js`、`js/engine/ai/brain.js`（只是注释 / 内部命名里的"播撒机"，随关卡重构批次顺带改，不影响玩家可见文本） |
| 设定文档 | `docs/world/SETTING.md`（含 §7.1、§8.6 调节单元）、`docs/world/CAMPAIGN.md`、`docs/systems/{ai,models,missions,weapons}.md` |

`locales/_html` 下的模板片段**没有**命中（模板里没有写死文案，标题页文字全在 `html/title.json`）。`docs/README.md`、`docs/POST2-0PLAN.md`、`docs/POST2-0IMPL.md` 是计划文档里的引用，不算旧说法。`SETTING.md` / `CAMPAIGN.md` 的路径不变。

**候选方案**：

- **A. 平流层吸收型气溶胶 + 半球热力差**。调节单元悬在 18–22 km，每个只释放极少量吸光微粒，单个对全球辐射几乎为零；1400 个单元的叠加在平流层形成一层不对称的"薄纱"，造成南北半球的辐射加热差——这正是真实研究里**移动热带辐合带（季风线本身就是它）**的已知杠杆（半球不对称的平流层气溶胶会推动辐合带向较暖一侧移动，即遮暗的一侧会失去雨带）。"偏移量十六年来只朝一个方向拧"就是这层纱越积越厚。介质 = **平流层气溶胶光学厚度**。优点：用的是真实机制，与"季风线"这个名字天然相扣。
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

**落到文本的位置**（文字现在都在 `locales/zh-CN/text/` 的 JSON 里，一条一键；`.gitignore` 之外的生成物不手改）：

| 内容 | 位置 |
|---|---|
| 标题页开场白三段 | `locales/zh-CN/text/html/title.json` 的 `html.title.p` / `p_2` / `p_3`；模板在 `locales/_html/screens/title.html` 的 `.title-lore`（模板只放结构，不改） |
| 资料库 w1 / w2 / t1（及关联的 f5、s4、cmp1） | `locales/zh-CN/text/codex/<id>.json` |
| `cell`（DIL-4）的说明 | `js/data/targets/cell.js` 里现在**没有** `desc` 字段；玩家可见的说明在资料库 `codex/s4.json`，外形与要害注释在 `js/models/targets/cell.js` |
| `SETTING.md` 气候与调节场章节、`CAMPAIGN.md` 开战背景 | 路径不变（`docs/world/`） |
| 关卡简报 / 台词 | `locales/zh-CN/text/missions/<id>.json`、`locales/zh-CN/text/data/voices.json`；留到关卡重构批次一并改 |

改完后做一次全局检索（上面那条 `grep -rlE`），确认没有残留"碘化银 / 播撒"的旧说法（词源类的 `pej` 表项除外）。

**要改的**：`SETTING.md` 相关章节、资料库 w1 / w2 / t1 页、标题页文案（`html/title.json`）、`CAMPAIGN.md` 中引用该机制的部分，以及上表里仍写着"碘化银播撒"的资料库页。关卡里的引用留到关卡重构批次一并改（文本已分离，所以改动集中在 `locales/`）。

### W.4 验证与发版

- `node tools/build/fmt-locales.js` → `node tools/build/gen-locales.js` → `node tools/build/gen-pages.js`，再 `node tools/test/check-locales.js`（键、占位符、允许清单）与 `node tools/test/text-census.js --check`。
- 目视：浏览器开 `?lang=pseudo` 找没走文本层的残留中文；`node tools/build/gen-pages.js --pseudo` 生成 `locales/pseudo/html/index.html` 看标题页等静态文字。
- `node tools/test/smoke.js --only <相关段>`（文本类改动只跑"更新记录"等相关段；**完整 smoke 很慢**，批次收尾才跑一次完整的）。
- 纯文本改动不应让 `snapshot-data` 之外的基线变化：`golden.js` 必须一致；`snapshot-data.js` 会因 `CODEX` 文本变化报差异，确认只有文本差异后再 `--write`。
- `node tools/build/gen-locales.js && node tools/build/gen-pages.js --check`，`node tools/build/release.js v3.1.0`。

---

## 批次 2 · v3.1.x 小件包（**已完成**：v3.1.2 – v3.1.11）

**版本规则**：批次 2 的每一项改动都**单独发一个补丁版本**，只升第三位，不等整批完成：

| 项 | 版本 | 内容 |
|---|---|---|
| 2.1 | v3.1.2 | 失败原因、失败停留画面与失败无线电 |
| 2.2a | v3.1.3 | 航母去掉甲板假飞机 |
| 2.2b | v3.1.4 | 挂载的尾翼 / 弹翼不连接主体 |
| 2.2c | v3.1.5 | 无人机去掉座舱盖 |
| 2.2d | v3.1.6 | 机炮曳光弹不再在最顶层绘制 |
| 2.3 | v3.1.7 | 电磁干扰下的无线电乱码 |
| 2.3b | v3.1.8 | 电磁干扰下的假目标 |
| 2.4 | v3.1.9 | 所有战斗机各 +1 对挂点 |
| 2.5 | v3.1.10 | 重型轰炸机重做 |
| 2.6 | v3.1.11 | 存档 |

> 实际发版号比原表整体后移一位：批次 W 之后又发了 v3.1.1（鼠标引导向下转向手感）。

**实施时与本文的出入**（供后续批次参考）：

- 2.1：`Ent.damage` 的 `info` 参数与 `kind` 如计划；炮弹的武器数据在 `b.gw`（不是 `b.w`）。失败台词的说话人 / 文本放在 `locales/zh-CN/text/fail.json`（叶子只能是字符串或字符串数组，所以每条失败原因是 `reason / sub / who / radio` 四个键，不是对象数组），并给 `Text` 加了 `T.all(key)` 取整个数组。玩家被击落时，除僚机 / 预警机的一句惊呼外，还接着播各关已有的 `VOICES.<关>.lose`（原本是死数据）。`nogarble: true` 标记剧情台词不受 2.3 乱码影响。
- 2.2d：只做了 GL 路径（曳光变拖尾粒子）；2D 回退保持原样。probe-render 新增 `env-tracer` 场景，并把截图窗口加高（原来最后一行被截掉）。
- 2.3b：假目标、乱码都在 `js/ui/hud/ghosts.js`；乱码字池放进文本层（脚本里不许写中文）。
- 2.4：新组字段定名 `playerOnly`；十型新增挂点的坐标按计划表落位，`storeHy` 自己量机体下表面，所以没有一个需要手调 `hy`（贼鸥除外，沿用原有的 `hy: -0.55`）。`defaultLoadout` 都不填新组。
- 2.5：没有改任何武器的 `perPoint`——ROK-40 现有关卡只用 `vsr`（`perPoint: 0`、`ammo: 1`）与 `bombTheBase`，弹药池与重量与之前一致；`probe-balance`（m2 / m8）改前改后 `loseAt` 都是 0/3，m8 我方剩余血量 84% → 87%（更大的命中半径让轰炸机更容易被打下来）。`hitR` 缺省 7.5，只有 boulder 写了 11.5。
- 2.6：存档键 `monsoonline.save.v1`，`js/engine/game/save.js`，读取时 `sanitizeLoadout` 逐组校验。
- smoke 的"拖动追踪"断言对 25°/s 的稳态误差放宽到 4.5°（向下转向改成推杆优先后的预期结果）。

- 每个补丁版本各自写一条 changelog，各自跑完 `smoke`（相关段 `--only`）与该项的验证后才发。
- 不跨项合并发版；某一项未完成时，下一项可以先做，但**按表顺序发版**，版本号不跳号。
- 批次 2 全部发完后不再额外发一个 `v3.1.x` 总版本。下一批次（批次 3）起恢复为次版本升级，发 v3.2。

各项互相独立，各自提交、各自发补丁版本。依赖批次 1 与批次 W，**两者的底层部分（v3.0.0 / v3.0.1 的目录重构）已完成**：新文本都写进 `locales/zh-CN/text/**.json`（代码里 `T('键')`），新单位 / 模型都按新目录放（`js/data/<类>/<id>.js`、`js/models/<类>/<id>.js`，`Registry.xxx({id, order, …})`）。下文引用代码位置一律写"模块 + 函数"，不写行号。

### 2.1 失败原因

**现状**（已对着当前代码核对）：
- `Game` 的 `finish(win)`（`js/engine/game/finish.js`）只有布尔，没有原因；胜负判定在 `Game` 的 `update()`（`js/engine/game/update.js`）末段依次判：时限（`world.timeLimit > 0 && world.timeLeft <= 0`）、`mission.lose(world)`、`mission.win(world)`，一判定就直接 `finish`。`finish` 开头写 `cleared`、把 `state` 改成 `'debrief'`、`show('debrief')`。
- `Ent.kill(ent, world, groundImpact, source)`（`js/engine/entities/damage.js`）的 `groundImpact` **参数收了没用**；全代码只有一个 `groundImpact=true` 的调用点：`Ent` 的 `stepAircraft`（`js/engine/entities/aircraft.js`，`pos.y <= groundY + 2` 一段），而且**没传 source**。`kill` 内只写 `ent.killedBy = source || ent.lastHitBy || null`，`Ent.damage` 在每次受伤时记 `ent.lastHitBy`。
- 撞海 / 撞地的区分：`groundY` 是 `max(SEA_Y, terrainY)`，所以撞击点的判别用 `Ent.isLand(x, z)`（`js/engine/entities/physics.js`，现为 `terrainY(x, z) > SEA_Y`；当前没有注入地形函数时恒为 false，即一律撞海，批次 9 的陆地接入后自动生效）。
- `Ent.damage(ent, amt, world, source)`（`js/engine/entities/damage.js`）只带 `source`（开火的实体），**不带武器 id**。三条入口：机炮 / 舰炮子弹走 `Game` 的 `scanShot`（`js/engine/game/combat.js`，`Ent.damage(a, b.dmg * Ent.gunResistK(a, b), world, b.owner)`，子弹现在已带 `b.w`）；导弹与带战斗部的炮弹走 `js/engine/combat.js` 的范围伤害 → `Ent.hitAny`（`js/engine/entities/warhead.js`）→ `damage`（`shot.w` 可用）；关卡脚本伤害走 `js/missions/_lib.js` 的 `bombTheBase`（`Ent.damage(base, 340, w, bomber)`，目标是基地设施而非玩家）。**没有 `Combat.apply`**，武器 id 需要在这三处补传。
- `VOICES`（`js/data/voices.js`）里只有 **m1** 有 `playerHit` 一组，且全代码没有任何 `Radio.play(id, 'playerHit')` 的调用点——确认是死数据。无线电 `Radio`（`js/ui/radio.js`）只有 `play(missionId, evt)` 与 `raw(line)`。
- 玩家死后仍留在 `world.actors`，`update()` 继续跑 `Ent.stepAircraft`（残骸坠落）、`updateCamera`（`js/ui/camera.js`，在 `update()` 末尾）、HUD，"世界继续模拟"几乎免费；`boot/main.js` 的主循环只在 `state === 'playing' && !paused` 时跑 `update()` + `render()`（`render` 在 `js/ui/frame.js`），而 `finish()` 把 `state` 改成 `'debrief'` 后，主循环只 `render()`，背景是空的 / 菜单背景。
- 各关 `lose()` 内容（`js/missions/<id>.js`）：

| 关 | `lose()` 现有条件 | 要报告的原因 |
|---|---|---|
| m1 m4 m5 m6 m7 m12 sk1 | 玩家死亡 | 死因 |
| m10 | 玩家死亡（登陆点**不再**在 `lose()` 里检查，超时由统一分支判负） | 死因 / `fail.timeUp` |
| m2 | 玩家死亡 / 基地失守（`w.baseTarget` 被毁） | 死因 / `m2.baseLost` |
| m3 | 玩家死亡 / ≥ 2 架播种机逃脱 | 死因 / `m3.sowerEscaped` |
| m8 | 玩家死亡 / 被护卫目标阵亡 / 基地失守 | 死因 / `m8.guardLost` / `m8.baseLost` |
| m9 | 玩家死亡 / 被护卫目标全灭 | 死因 / `m9.guardLost` |
| m11 | 玩家死亡 / 旗舰沉没 | 死因 / `m11.flagshipLost` |
| 通用 | 时限到 | `fail.timeUp` |
| 批次 4 起 | 越界全黑 | `fail.arena` |

**做法**：

1. **死因记录**：
   - `Ent.damage` 增加第五个可选参数 `info = { weapon, kind }`（`kind ∈ gun / missile / blast`），三条入口各自补传：子弹（`js/engine/game/combat.js` 的 `scanShot`，武器取 `b.w`）、导弹直接命中与爆炸（`js/engine/combat.js` 的范围伤害与 `Ent.hitAny`，武器取 `shot.w`）、脚本伤害（`js/missions/_lib.js` 的 `Ent.damage` 调用，`kind:'script'`）。`info` 缺省时 `deathCause` 记 `{ type:'unknown' }`，不报错。`hitAny` 与 `damage` 的签名同步加这一个参数。
   - `Ent.kill(ent, world, groundImpact, source, info)` 对玩家写 `ent.deathCause = { type, by, weapon }`：`type ∈ gun / missile / blast / crash-ground / crash-sea / script`。`groundImpact` 为真时：`Ent.isLand(x, z)` 为真记 `crash-ground`，否则 `crash-sea`；`stepAircraft` 的撞地点要补传 `source = a.lastHitBy`（被打伤后撞地时仍能记到"是谁把你打下来的"）。
   - `by` 取 `source.label`（呼号）或 `source.shipClass`；舰船 / 设施没有呼号时用 `name`。
   - `collision`（空中相撞）游戏里没有，不做。
2. **关卡入口**：保持 `lose(w)` 返回布尔，在 `js/missions/_lib.js` 新增 `Mission.fail(w, 'key', params)`——在返回 true 之前写 `w.fail = { key, params }`。一关里同时满足多条时，先判先得。
3. **通用兜底**：玩家死亡由 `deathCause` 生成；时限由 `Game.update` 的通用分支写 `fail.timeUp`；`w.fail` 缺失而 `lose()` 为真 → smoke 报错（逼着每个新关写原因）。
4. **结算页**：`#scr-debrief` 增加 `#dReason`（标题下一行大字）和 `#dReasonSub`（"被 FLINT-2 的 CLA-4 击毁"之类的详情）。DOM 加在 `locales/_html/screens/debrief.html` 片段里（与 `#dTitle` / `#dSub` 同一块），静态文字写 `text/html/debrief.json`，然后跑 `node tools/build/gen-locales.js && node tools/build/gen-pages.js`；由 `Game` 的 `finish`（`js/engine/game/finish.js`）填充。失败原因键全部放 `locales/zh-CN/text/fail.json`（键 `fail.*`，如 `fail.m2.baseLost`、`fail.timeUp`）。
5. 顺手把 `playerHit` 台词接到玩家受击（限频；`VOICES.m1.playerHit` 现在是死数据，且只有 m1 有这一组），免得它继续是死数据。

**失败后的停留画面**：任何原因的失败（被击毁、坠毁、关卡条件、时限、越界）都**先停留在游戏画面**，弹出失败提示，几秒后或点提示下的"结束"按钮才进结算页。

- **实现方式**：`state` **保持 `'playing'`**，在 `js/engine/game/vars.js` 新增变量 `failing = { t0, fail }`（`docs/DESIGN.md` §4.1 状态机补一行说明它是 `playing` 的子状态）。这样主循环 / `render()` 的 `state === 'playing'` 判定、相机、HUD、世界模拟全部原样继续，不用动渲染。
- `Game.update()`（`js/engine/game/update.js`）检测到失败后不再直接 `finish(false)`，而是新函数 `beginFail(reason)`（放在 `js/engine/game/finish.js`）；之后不再检查 `win`；`updateCamera` 仍要执行（它在 `update()` 末尾，`beginFail` 之后不能 `return` 跳过——注意现有的 `$.finish(false); return;` 就是直接 return，要改掉）。
- **需要补 `if (failing)` 守卫的输入点**（`state==='playing'` 门槛挡不住它们）：`js/ui/input.js` 里 Esc / `H` 暂停（`togglePause`，`js/ui/screens/pause.js`）、`window.blur` 自动暂停、点击画布重新锁定鼠标（`requestAimLock`，`js/ui/screens/nav.js`）、`fireSpecial`（`js/ui/input.js`）、`controlPlayer`（`js/engine/game/control.js`，玩家存活时的输入冻结）。点击"结束"按钮前必须 `releasePointer()`（`js/ui/screens/nav.js`）。
- 世界继续模拟（残骸坠落、爆炸、僚机与敌机照常行动），所以玩家能看到自己是怎么没的。
- **玩家若还活着**（基地失守、旗舰沉没、时限到等）：输入被冻结，飞机交给"平飞自动驾驶"，避免玩家在失败提示下又被打死或又"救回来"。
- **画面**：HUD 压暗用 `HUD.draw`（`js/ui/hud/base.js`）内局部 `globalAlpha`（`HudFx` 在 `hudOpacity` 之外画，不能靠改设置）；相机维持在残骸 / 玩家上方；越界失败时画面已是全黑，提示直接显示在黑屏上。提示面板用 DOM 覆盖层（与 `#pause` 同一套做法，片段在 `locales/_html/overlays/`，新增 `failing.html` 并在 `locales/_html/shell.html` 引入，文字写 `text/html/` 下），或复用 `HUD.banner`（`js/ui/hud/text.js`）。
- **提示面板**：失败原因 + 详情 + `[结束]` 按钮；`FAIL_HOLD_S`（起步 5 s）后自动进入结算，点击按钮可立即进入。需要在进入 `failing` 的瞬间 `releasePointer()`，否则鼠标被锁定点不了按钮。
- 结算页的 `finish(false)` 逻辑不变，只是调用时机推迟；`probe-missions` / `smoke` 里直接调 `m.lose(w)` 的地方不受影响。
- 暂停与 `failing` 的关系：失败提示期间按 `H / Esc` 不弹暂停菜单，直接视为"结束"。
- `Radio` 与 `SysNote` 在屏幕切换（`show(id)`，`js/ui/screens/nav.js`，`Radio.clear(); SysNote.clear()`）与开局（`startMission`，`js/engine/game/mission-start.js`）里被清空，所以进入结算页时队列自然清空，不必另写。
- **要同步改的测试**：`tools/test/smoke.js` 里"关卡时限：声明 `timeLimit` 的关卡到点判负"那一块（`G14.startMission(0)`，把 `w1.timeLimit` 设为 1，推进两秒后断言 `activeScreen() === 'scr-debrief'`，是 smoke 里**唯一**的 `scr-debrief` 断言）必须改成"推进 `FAIL_HOLD_S` 或点结束按钮 / 调 `__finish`"；smoke 里 m2 基地被摧毁的 `MISSIONS[1].lose(w)` 断言与 `tools/test/probes/probe-missions.js` 里直接调 `m.lose(w)` 的地方不受影响。`Game.__update`（`js/boot/zz-api-game.js`）只看 `state === 'playing'`，`failing` 期间继续运行，正合预期。

**失败时的游戏内无线电**：进入 `failing` 的那一刻，由**游戏内人物的视角**播出一条或多条无线电，描述任务失败、原因与后果，而不是只靠结算页的文字。

- **关卡入口**：`Mission.fail(w, key, params)` 的同一个 `key` 同时指向一组台词 `fail.<key>.radio`（数组，每条 `{ who, tx, gap }`，多条按顺序播；文本在 `locales/zh-CN/text/fail.json`）。关卡作者在写失败原因时**同时**写这组台词，缺失时 smoke 报错，保证每个失败原因都有人"说话"。
- **说话人**：由关卡指定（僚机、预警机 SEXTANT、被护卫的舰队、基地指挥……），语气与后果贴合剧情——基地失守是"基地失去联系，……"，旗舰沉没是"旗舰……我们输了"，播种机逃脱是"他们过去了，……"。
- **玩家坠毁 / 被击毁**（没有关卡条件失败时）：只需要短促的惊呼，由僚机或预警机喊，如"VESPER-1 坠毁了！""长机被击落了！"。按 `deathCause.type` 选变体（被击落 / 撞地 / 撞海各 2–3 句），说话人用 `CALLSIGN` 里还活着的僚机优先、否则预警机；都不在则不播，不虚构说话人。
- **走 Radio 2.0**（批次 5）的队列时用 `pri:'story'`；在批次 5 之前用现有的 `Radio.raw`（`js/ui/radio.js`）。**不受干扰乱码影响**（失败台词是剧情，不是电台通话的一部分）：`cls` 取 `fx`-类的非乱码通道。
- **时序**：台词在 `failing` 开始时一次性入队；停留时间 `FAIL_HOLD_S` 要**不短于台词播完所需时间**（取 `max(5 s, 台词总时长 + 1 s)`），否则会在台词说到一半时被切到结算页；点"结束"仍可立即跳过，Radio 队列清空。

**验证**：smoke 断言每一关的 `lose()` 为真时 `w.fail` 已设置且键存在、对应台词组存在且非空；Sim 场景覆盖撞地、撞海、被导弹击毁、被炮击毁、基地失守、时限；`failing` 状态下世界继续推进、`FAIL_HOLD_S` 后自动结算、点按钮立即结算（smoke 点击）、玩家存活时输入被冻结。跑 `check-locales.js`（新键都在 JSON 里、模板引用的键都存在）与 `gen-pages.js --check`（片段改动后页面副本要重新生成）。

### 2.2 模型修复

四个子项互不依赖，各自单独发补丁版本（见批次 2 的版本规则）。

#### 2.2a 航母去掉甲板假飞机（v3.1.2）

- **删除范围**：`js/models/ships/humpback.js`（`Registry.model`）里从注释 `// 甲板上的舰载机（简化剪影，停在两舷与艉部）` 到 `for` 循环的收尾 `}`；`parked`（7 项）与循环变量 `pi / px / pz` 都是该模型构建函数的局部变量，无其他引用。末尾 `return done(b, { span: 40, len: 280, ground: true, sea: true, radius: 84 })` 里的尺寸是写死的，不依赖被删的几何，保留。
- **同步文字**：`ships.humpback.arms` 的第一条"舰载机 ×40（含 DB-11）"与 `ships.humpback.desc`（"四十架舰载机里有相当一部分是 DB-11"）按"机库容纳"重写，键在 `locales/zh-CN/text/ships/humpback.json`（数据文件 `js/data/ships/humpback.js` 只引用键）；`docs/world/SETTING.md` 里"280 米甲板、四十架舰载机"与对比表里"40 架舰载机"两处核对措辞。`js/core/changelog.js`（由 `CHANGELOG.md` 生成）里的旧版本记录不动。
- **不受影响**：smoke 里解析 `arms` 的正则（`tools/test/smoke.js` 的 `ARMS` 表：`近防炮 ×N`、`50 mm 速射炮 ×N` 等，"舰艇对空"与"海上平台"两处各有一份）不匹配"舰载机"，改写这一条是安全的；但**不要动** `近防炮 ×4` 与 `50 mm 速射炮 ×2` 两串。smoke 没有对 humpback 顶点 / 面数的断言；`tools/render/probe-render.js` 用的是 bluewhale。
- **验证**：`tools/render/render-ships.js` 重新出图确认；`node tools/test/snapshot-data.js` 比对快照，只有该模型哈希变化（运行 `smoke` 相关段即可）。

#### 2.2b 挂载的尾翼 / 弹翼不连接主体（v3.1.3）

- **现象**：挂架上的弹体，其尾翼或弹翼的根部与弹体之间有缝隙，远看像"悬浮"的翼片。
- **目标**：**只求视觉上相接，允许翼根穿入弹体内部**。不做物理意义上的贴合，也不改碰撞与挂载几何，所以不影响判定与平衡。
- **原因**：翼片的根部偏移不是写死的旧半径（`lk.dia` 推出，`hy` 只整体移动弹体）。问题出在 `addRound`（`js/models/ordnance/store-lib.js`）里：
  1. **六边形截面**：弹体是 6 段的 `b.tube`，顶点在 `r`（外接圆）而平面中点只有 `0.866r`；内部 `cross()` 把翼根放在 `r`，所以上下两片翼悬在平面之上约 `0.134r`（直径 0.12 的弹约 1.6 cm，直径 0.42 的约 5.7 cm）；左右两片刚好落在顶点上。**所有带 `look` 字段的武器（`js/data/weapons/<id>.js` 里的 `look: { len, dia, fin, … }`，目前 37 件）都有这个缝**。
  2. **`fin === 'cruise'`**（asl、asl2、pgb、lcm）：翼根在高度 `0.6r` 处取 `x = r`，而该高度六边形边只到约 `0.65r`，缝隙约 `0.35r`（5–7 cm）。
  3. **`fin === 'bomb'`**（clb、v30、hbl、hbh）：尾翼从 `r` 起根，但那里是尾锥（半径 `0.35r` 到 `0.7r`），缝隙最大 `0.65r`（`hbh` 约 0.2 m）——这是最明显的一处。
  4. 旧模型：`js/models/ordnance/missile.js` 的翼根 0.14 对 `r` 0.14，缝约 2 cm；`pod.js` 的边缘翼根 0.28 对尾锥约 0.25，勉强；`bomb.js` 已经埋进去了，无需改。
  - 另外：游戏里**没有挂架（pylon）几何**，只有 `STORE_GAP = 0.08`（`store-lib.js`）的空隙和一根横梁盒，所以不需要"把翼根延伸进挂架"。
- **做法（只改 `addRound`，不逐个武器手调）**：
  1. `cross()` 的翼根改为 `r0 = 0.75r`（落在六边形内：边心距 `0.866r`），翼尖仍在 `r + span`；
  2. `fin === 'bomb'` 的尾翼翼根取 `0.25r`（尾锥处边心距约 `0.30r`）；
  3. `fin === 'cruise'` 的翼根 x 取 `0.5r`，翼尖保持 `r + ws`；
  4. `missile.js`、`pod.js` 的翼根同样改为约 0.75 倍体半径。
  - 翼片是薄的二维片，翼根埋进弹体之后在任何角度都看不到缝，这正是"看起来相接"所需要的。
- **验证**：
  - smoke 新增几何断言（放在"挂载系统"段）：每片翼面的**根部顶点到弹轴的径向距离** ≤ `0.87r`（即不比六边形边心距更远）。直接断言"在弹体内部"对六边形不好写，这个形式更简单；
  - `tools/render/render-mounts.js` 目前每个用例只有一个方位角（常量 `AZ = 0.70`，右前 3/4）和每例可设的 `el`：给用例加一个 `az` 字段，为 `clb / hbh / asl / lcm` 与几个常见弹各出正侧、俯视、仰视、斜后四个视角，目检看不到缝；
  - 黄金回放（`tools/test/golden.js`）：挂载与判定不变，只有模型哈希变化。

#### 2.2c 无人机去掉座舱盖（v3.1.4）

- **范围**：**目前只有一个无人机**——`folded_wing`（KA-7，`js/data/aircraft/folded_wing.js`，`npcOnly`，属**上游**）。它的模型（`js/models/aircraft/folded_wing.js`）只被它自己用，所以改模型不会影响别的机型。后续批次 6 的新无人机一律在建模时不建座舱盖。
- **做法**：删掉 `js/models/aircraft/folded_wing.js` 里那一行座舱盖四边形（`b.quad(… C.canopy)`，位于机头 `(0, 0.40, 2.4)` 一带）。**不需要**让 `seatCanopies`（`js/models/_passes.js`）去读标签：它是加载期的后处理，只负责把已有的座舱盖面（`C.canopy` / `C.canopy2` 的四边形）贴到机身上，而且模型在数据之前加载，读不到数据标签；座舱盖面不存在，后处理自然什么也不做。
- **设定文字的一致性**：`aircraft.folded_wing.desc`（`locales/zh-CN/text/aircraft/folded_wing.json`）写着机头那一点凸起是"通信天线罩"而不是风挡。删掉之后机头就没有这个凸起了：要么把它改成非座舱盖颜色（`C.dark`）保留这个特征并让文字继续成立，要么改一句 desc。**默认：保留凸起、换成 `C.dark`**。
- 原先附带的"`isDrone` 统一为 `unmanned`"已在重构中完成（`tags.unmanned` 已落地，`js/core/tags.js` 声明，`folded_wing` 数据里 `tags: { unmanned: true }`），本项不再包含。
- **验证**：`tools/render/render-units.js` 出图确认 `folded_wing` 没有座舱盖；快照中只有该模型哈希变化。

#### 2.2d 机炮曳光弹不再在最顶层绘制（v3.1.5）

- **原因**：`Game` 的帧绘制（`js/ui/frame.js` 的 `render`）先 `Renderer.drawParticles(…)`、`Renderer.flush()`，再调 `drawTracers()`（同文件），最后 `Renderer.end()`。`drawTracers` 用 **2D 画布**（`globalCompositeOperation='lighter'`，`moveTo / lineTo / stroke`，再 `arc` 画弹头）画在 WebGL 画面贴到画布**之后**，完全没有深度，所以山后、机身后、海面下的子弹都被画在最上面。`render` 里与 `drawTracers` 的注释写明这是故意的（"被机翼挡掉反而看不清"）；`docs/systems/rendering.md` 的概述、"曳光"一行与相关小节也记着这一点。**这次是有意改变这个决定**，见下面的风险。
- **WebGL 路径的最小修法（不需要新着色器）**：粒子管线已经支持"拖尾"——`p.streak && p.vel` 的粒子会按 `vel × 0.03` 拉出屏幕空间的条带（`js/render/render.js` 的 `drawParticles` 2D 路径与 `js/render/env/create.js` 的 `pushParticles` / `drawParticles` GL 路径，顶点着色器同在 `js/render/env/`），渲染状态为深度测试开、`depthMask(false)`、加色混合，片元写 `gl_FragDepth = logDepth(vW)`，所以**与模型和海面做深度测试**。
  - 在 `frame.js` 的 `render()` 里，`Renderer.drawParticles(world.particles)` 之前，把每发子弹转成一个合成的拖尾粒子 `{ alive:true, delay:0, life:1, life0:1, alpha:0.9, color:'#ffe496'/'#ff9458', size, pos:b.pos, vel: 方向 × (拖尾长度 / 0.03), streak:true }`，删掉 `drawTracers()` 的调用；
  - `size` 取世界半径，使 `focal × size / z` 等于原来的线宽像素（`lineWidth × wMul / 0.9`），即 `size ≈ lineWidth × wMul × dist / focal / 0.9`；
  - 拖尾长度、枪口钳制、`wMul` 的计算**原样保留**，只是改喂给粒子字段；弹头亮点可再加一个点粒子；
  - 条件与 `Renderer.drawParticles` 的 GL 分支一致：`envGL && gfx.particles && !flushed`，否则走下面的 2D 路径。
  - 注意：云在粒子之前画，且不写深度，所以曳光弹仍会盖在云上，与现有粒子行为一致，不算回退。
- **2D 回退路径**：`Renderer.flush()`（`js/render/render.js`）按 `f.d` 把 `faceList` 从远到近排序后逐面填充；粒子与曳光弹现在都在 `flush` 之后画，所以在 2D 里同样盖在最上面。
  - 最小做法：给 `getFace`（`js/render/render.js`，`{d, n, px, py, c, a}`）增加一种面 `f.line`（`x0,y0,x1,y1,w`），`d` 取弹头深度减一个小偏置，`flush` 里遇到它用 `globalCompositeOperation='lighter'` + `stroke()` 画；新增 `Renderer.pushLine(...)`，`frame.js` 在同一循环里调用；
  - **更省事的备选**：2D 回退保持现状并在文档里写明（2D 路径本来就把粒子画在最上面，`tools/render/probe-render.js` 开头已承认）。**默认：先做 GL，2D 仅作为可选**。
- **风险与对策**：玩家**自己**的机炮子弹起点在机头前方，通常不会被自己的机翼挡住；若实际出现被遮挡，加一个 `TRACER_OWN_BIAS`（对本机发射的子弹把深度往相机方向偏一点）。
- **验证**：
  - `probe-render` 新增 `env-tracer` 场景（模板是已有的 `env-blast`，"粒子在飞机后面应被遮住"，`tools/render/probe-render.js`）：子弹在山后 / 机身后，被遮挡部分必须消失；
  - 黄金回放（`golden.js`；渲染部分有 `golden-render.js`，其基线 `tools/test/baseline/golden-render.json` 会变，需重录并说明）：未开火的场景逐帧不变；
  - 文档：`docs/systems/rendering.md`（概述、"曳光"一行）、`docs/systems/game.md`（曳光一节与调参表里的 `drawTracers()` 条目；其中引用的拖尾公式 `min(90, max(13, bDist×0.045))` 要与现代码的 `drawTracers` 核对）。

### 2.3 电磁干扰下的无线电乱码

**目标**：被压制时给无人僚机下令，仍播出对应无线电，但文字被星号污染且指令**不生效**；干扰中收到的其他无线电同样乱码。

1. **注入干扰度**：`Radio.setDistortion(fn)`，`fn()` 返回当前玩家 `suppressed`（0–1）。`Game` 初始化时注册（`Game` 与 `Radio`（`js/ui/radio.js`）是两个独立模块，`Radio` 不直接读 `player`，所以用 setter）。**乱码施加位置**：`Radio` 内部 `push(L)`（`js/ui/radio.js`）里写 `innerHTML` 的那一行——台词在队列里保留原文，上屏那一刻才用当时的干扰度处理（`L.cls` 在手），这也与 5.5 的队列设计一致。
2. **过滤函数** `garble(html, k)`：先把字符串按 HTML 标签 / 实体切成"文本段"与"标记段"，只在文本段里**插入**星号（是"插入"而不是"替换"）。插入个数 ≈ `round(k × 字数 / 6)`，位置随机、不连续、不插在标签 / 实体内部。`k < 0.05` 完全不处理（与 HUD 的 JAMMED 阈值一致）。
3. **哪些线被乱码**：`cls ∈ ally / enemy / cmd`。`fx`（系统音）与 SysNote（`js/ui/sysnote.js`）不处理。
4. **僚机下令**：`setWingCmd`（`js/ui/input.js`）**已经**在 `suppressed > 0.35` 时弹 SysNote（`ui.input.setWingCmd.s2`："数据链被压制。无法给无人僚机下令。"）并直接 `return`，**阈值 0.35 现成正确**。要新增的只有：在 `return` 之前照常 `Radio.raw` 播出指令台词（走乱码）。不写 `ai.cmd`、不确认；SysNote 保留。注意 `updateAewc`（`js/engine/game/lock.js`）也会调用 `setWingCmd(next)`，但它只在预警机自己没被压制时才运行，不受影响。
5. AWACS 被压制时本来就静默（`updateAewc`），保持。
6. `SFX.radio()`（`js/engine/audio.js`）的噪声脉冲在被压制时加长 / 加重（几行）。

**验证**：smoke 对 `garble` 做性质测试（标签不被破坏、字符数只增不减、`k=0` 恒等）；Sim 场景断言压制下指令不写入、解除后恢复。

### 2.3b 电磁干扰下的假目标

与 2.3 同一个触发源（玩家 `suppressed`），放在一起做。**纯显示层，没有实体**：不进 `world.actors`，不能被锁定、不能被击中、不影响 AI 与胜负。

**现状**：

- "目标框开始闪烁"的那条线**不是武器锁定距离**，而是电子战可见度模型 `Ent.jamRanges(s, surf)`（`js/engine/entities/radiation.js`）：`clear = max(burn, JAM_CLEAR0 × (1 − s))`（`JAM_CLEAR0 = 16000`），`hide = clear + max(JAM_FADE_MIN, JAM_FADE0 × (1 − s))`（`1500` 与 `10000`）。`s` 是玩家 `suppressed`；`burn` 是穿透距离，飞机 1800 m（`JAM_BURN_R`），舰船与地面目标 4500 m（`JAM_BURN_SURF`，且 `s` 先乘 `JAM_SURF_K = 0.5`）。`jamDuty(p, e)` 在 `clear` 内为 1、`hide` 外为 0、之间线性下降，`jamShown(p, e, time)`（同文件）给出逐帧开 / 关，相位是确定性的 `((time × 1.7 + e.jamPhase) % 1) < duty`；`jamState` 把占空比归成 `clear / flicker / hidden`。
- **闪烁是整个目标框一起开 / 关**（`HUD` 的 `drawTargets`，`js/ui/hud/targeting.js`：`if (!Ent.jamShown(...)) continue;`），不是只有文字闪。
- 锁定与 Tab 切换目标用的是同一个状态（`jamState === 'clear'`：`cycleTarget`，`js/ui/input.js`），`updateLock`（`js/engine/game/lock.js`）一进入非 `clear` 就取消目标。所以**闪烁带里不可能存在锁定框，只有未锁定的 `drawPlainMark`**。
- `s` 低于 `JAM_MIN`（0.05）时完全没有闪烁；`s = 0.05` 时 `clear` 仍有约 15200 m。
- **`drawPlainMark`（`js/ui/hud/targeting.js`）的内容**：仅当 `dist ≤ 12000` 才画文字，否则只画框。第 1 行 `t.ac.name + ' ' + t.ac.cn`（型号，**身份**）；第 2 行 `t.label`（呼号，**身份**，调暗）；第 3 行距离。舰船第 1 行是 `shipClass`，地面设施 `label || name || '海面设施'`（键 `ui.hud.targeting.drawPlainMark.s1`）。**没有高度、速度、接近率、动压**——这些只出现在 `drawLockBox`（同文件，仅 `p.target === t` 时画），而它在闪烁带里不会出现。
- 因此"锁定距离外只乱码型号和呼号，距离、动压等客观数据照常"在代码里的含义是：**闪烁带里的 `drawPlainMark`，换掉第 1、2 行，保留第 3 行距离**。动压、速度、高度本来就不会显示在这里，没有什么需要"保持"的。

**设计**：

1. **生成**：新函数 `HUD.drawGhosts`（放在 `js/ui/hud/targeting.js`，并在 `js/ui/hud/zz-api.js` 导出），在 `HUD.draw`（`js/ui/hud/base.js`）里紧跟 `drawTargets` 调用，数据放在 HUD / `HudFx` 内的显示对象表里（`{ pos, vel, life, kind, seed }`；HUD 的私有状态进 `HUD.$`），**不碰 `world.actors` / `world.targets`**。数量 `n = round(k × GHOST_MAX)`，`k` 为干扰度（`p.suppressed` 已经传进 HUD，`HudFx` 里已经算 `max(suppressed, ewPower × 0.8)`（`js/ui/hudfx.js`）；`< 0.05` 不出现），`GHOST_MAX` 起步 8；寿命 2–6 s，随机间隔补充，到期渐隐，缓慢漂移（模拟杂波）。
2. **位置约束**：真目标在 `hide` 之外**根本不画**，所以假目标必须放在**闪烁带 `[clear, hide]` 之内**，否则"只有假目标在、真目标不在"会立刻露馅。距离在 `[clear × 1.02, hide]` 内随机（用同一个 `Ent.jamRanges(s, false)`，**共用函数，不各抄一份**），方位随机但偏向真实敌方所在的半球。注意 `s → 1` 时带很窄（约 1800–3300 m），所以干扰越强假目标越贴脸，这是合理的。
3. **显示**：
   - **主屏幕**：用与真目标**同一条绘制路径**（`drawPlainMark(ctx, s, fakeT, dist, false)`，假对象带 `{ kind:'air', ac:{ name, cn }, label, pos }`）；闪烁用同一个 `jamShown` 式的占空比，**不另造动画**；屏外的假目标进入 `drawOffscreen`（`js/ui/hud/aids.js`，只画箭头加 km 数，不带名字，用 `{ pos, team:1 }` 调用）。
   - **雷达**：`drawBlips`（`js/ui/hud/radar.js`）里敌机红色三角是内联代码，需要抽一个小助手才能复用。**现有雷达噪声**（`jam = max(p.suppressed, ewPower × 0.8)`，对每架敌机以概率 `jam × 0.55` 丢弃、`jam × 9` px 抖动，每帧 `Math.random`，只对飞机、与距离无关，地面目标与舰船没有噪声；友军按 `Ent.jamPress(p, e)` 单算）原样保留；假目标按同一规则加噪声，雷达量程 12000 m。
   - **Tab / 锁定**：`cycleTarget`（`js/ui/input.js`）只从 `world.actors` 与 `world.targets` 建表，假目标不在其中，**"Tab 跳过假目标"自动成立**，不用写代码。
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
   - **不要破坏既有断言**：smoke"压制下的目标与锁定"段里对 `jamState / jamRanges / jamDuty / jamShown / jamLockOK / jamLockK` 与 `__cycleTarget` 的断言，以及"HUD 滤镜"段里 `HudFx` 干扰等级等于 `max(suppressed, ewPower × 0.8)` 的断言。新代码只**调用**这些函数，不改它们；
   - `probe-render` 在 `k = 0.3 / 0.7 / 1.0` 三档出雷达与主屏幕图目检。

> 与批次 5 的关系：AI 的"感知模型"（P5，目前不做）若以后做，可以让**敌方**也被己方干扰机骗出假目标，复用这个模块的生成逻辑。

### 2.4 所有战斗机各 +1 对挂点

**目的**：为以后扮演**下游**的战役做平衡准备——下游战斗机要有与上游同等的挂载规模。因此范围由"所有可玩机型"改为"所有战斗机"（上游可玩 + 下游 NPC 战斗机）。

**战斗机清单与分类依据**（运行时 `AIRCRAFT` 核对；`AIRCRAFT` 没有"是战斗机"的机器字段，依据是 `role` 文字、`npcOnly`、`caps`、`tags`、`faction` 与是否带翼下挂点和机炮；建议把这份清单写进 smoke 的常量，避免漂移）：

| 型号 | 阵营 / 可玩 | `role` | `caps` | 判定 |
|---|---|---|---|---|
| frigatebird DB-11 | 上游，可玩 | 舰载多用途战斗机 | strike, ew | 战斗机 |
| sailfish D-14 | 上游，可玩 | 平流层制空战斗机 | intercept | 战斗机 |
| booby G-6 | 上游，可玩 | 近距空中支援攻击机 | strike | 战斗机类（战斗攻击机，沿用原"可玩 6 型"口径） |
| petrel F-9 | 上游，可玩 | 高空高速截击机 | intercept | 战斗机 |
| skua D-21 | 上游，可玩 | 多用途隐形战斗机 | strike, ew | 战斗机 |
| albatross D-33 | 上游，可玩 | 高机动格斗机 | （空） | 战斗机 |
| schist ROK-27 | 下游同盟，`npcOnly` | 多用途战斗机 | strike | 战斗机 |
| basalt GAL-31 | 下游同盟，`npcOnly` | 重型截击机 | intercept | 战斗机 |
| sandstone VAC-14 | 下游同盟，`npcOnly` | 轻型攻击机 | strike | 战斗机类（轻型攻击机，与 booby 同口径） |
| tideline XAMSI Mk.2 | 分水群岛国（中立），`npcOnly`，模型复用 `sailfish` | 轻型拦截机 | intercept | 战斗机类，**待评审**（只有 1 组；m1 / sk1 里是中立方 `team: 2`） |

**排除**：`boulder` ROK-40（重型轰炸机，2.5 另行重做）、`pelican` J-2 / `quartz` ROK-2（空中预警与指挥，`maxLoad` 0）、`lodestone` ROK-44（随队干扰机，`caps: ew`，`maxLoad` 0）、`folded_wing` KA-7（无人僚机，`tags.unmanned`，已有 2 组）、`spray`（海上巡逻机）、`datum`（高空勤务机，播种机模型）。

**现有组与候选新增一对**（"x, y"是右侧点的机体俯视米数，来自模型射线检测；最终坐标必须落在机体下表面，smoke"挂载系统 / 干扰与机动"里的挂载高度几何断言——`surfaceUnderModel`，容差约 0.25 m——会校验）：

| 机型 | 现有组 | 新增一对（候选） | 备注 |
|---|---|---|---|
| frigatebird DB-11 | A 轻 (0.85, 2.6)、B 重 (1.85, −0.6)、C 腹 (0.45, −1.0) | 机身后侧 (0.95, −3.2)（就是以前去掉的 D 对） | 外翼会摆动，**不要**放 x > 3 |
| sailfish D-14 | A 重 (2.6, −2.3)、B 轻 (4.2, −4.2)、C 腹 (0.95, −4.2) | 翼尖 (6.0, −5.6) | 或内侧 (3.4, −1.0) |
| booby G-6 | A 重 (3.8, −0.4)、B 轻 (6.2, −1.0)、C 轻 (7.8, −1.05) | 腹部 (0.9, 1.0) | 机翼已很密 |
| petrel F-9 | A 重 (3.0, −3.0)、B 轻 (5.0, −5.3) | (4.0, −4.0) 或翼尖 (6.2, −6.8) | 只有两组，补一个重挂更有意义 |
| skua D-21 | A 腹舱 (1.1, −2.2) expose 0、B 轻 (3.6, −3.4) | 外挂 (5.4, −3.6) 或第二内舱 (1.1, −5.0) | 隐身机：外挂会增加 RCS，**是取舍而不是缺陷**；内舱则无代价。建议外挂 |
| albatross D-33 | A 重 (3.0, −1.8)、B 轻 (5.2, −0.3)、C 翼尖 (7.4, 1.0) | 内侧 (1.7, −3.0) 或外侧 (6.4, 0.5) | |
| schist ROK-27（待评审） | A 重 (2.9, −1.0)、B 轻 (5.2, −1.6) | 轻 (4.0, −1.3) | 在 A、B 之间，下表面约 −0.36 m，间距 ≥ 1.1 m；备选翼尖 (6.0, −2.6)（约 −0.50，离 B 仅 0.8 m，偏挤） |
| basalt GAL-31（待评审） | A 重 (3.6, −1.4)、B 轻 (6.0, −2.2) | 轻 (4.2, −3.0) | 下表面约 −0.45 m，与 A、B 间距均 ≥ 1.7 m；注意 B 现位于机翼投影之外，smoke"判不了"而被跳过，新点要落在机体内才被校验 |
| sandstone VAC-14（待评审） | A 重 (2.6, −0.6)、B 轻 (4.6, −1.2) | 轻翼尖 (6.0, −1.0) | 下表面约 −0.33 m；机翼窄，翼根 (3.6, −0.9) 也能落（约 −0.24，但与 A、B 仅 1.0 m，偏挤）；建议翼尖 |
| tideline XAMSI Mk.2（待评审） | A 轻 (2.4, −0.6) | (4.2, −4.2)（即 sailfish 的 B 轻点，在同一模型上已通过校验） | 中立方，是否按"战斗机"加组待评审；加了之后该机有 2 组 |

> 下游 / 中立四型的候选是按各自模型（`js/models/aircraft/<id>.js`）的下表面扫描给出的建议值，**全部待评审**；定稿前以 smoke 的下表面检查与 `render-mounts` / `render-planform` 出图为准。新组的 `kind`（light / heavy / belly / tip）决定能挂什么，评审时一并定。

**每个机型要同步**：

- **数据**：`js/data/aircraft/<id>.js` 的 `hardpointGroups` 加新组（`id` 取下一个字母，`pts` 为左右一对，必要时 `hy`）；新组的 `label` 文本键写进 `locales/zh-CN/text/aircraft/<id>.json` 的 `hardpointGroups` 下（现按 `i0 i1 i2…` 顺序编号，新组是下一个序号），再跑 `node tools/build/gen-locales.js`。
- **`defaultLoadout`**：玩家六型给新组一个默认值或留空；`maxLoad` 核对不超重。下游 / 中立型号的 `defaultLoadout` 现为 `{}`，**保持不填新组**（见下一节）。
- **俯视图**：`js/render/planform/paint.js` 直接按 `ac.hardpointGroups` 的 `pts` 画，数据加了就跟着画；用 `tools/render/render-planform.js` 出图目检，`planform.md` 与 `loadout.md` 里写死的组数 / 点数相应同步。
- **文本里的挂点数**：`locales/zh-CN/text/aircraft/<id>.json` 的 `desc` 里凡提到挂点数 / 组数的地方同步（如信天翁 desc"翼尖多了一组挂点，专门给最轻的格斗弹用"、贼鸥 desc"弹舱只塞得下两个挂点，火力有天花板"，要核对是否仍成立）；`js/ui/codex/entries/<id>.js` 与机库详情里按数据生成的部分自动更新。
- **smoke 的挂点下表面检查**：新点必须过上述挂载高度几何断言（挂点顶部不埋进机体、不悬空 > 0.25 m）；组内点数须为偶数（`pts.length % 2`）。
- **文档**：`docs/systems/loadout.md` 的"可驾驶的六架机"组数表按"所有战斗机"重写（下游 / 中立型号加行，组数 / 点数 / 组号与类型同步）；`weapons.md`、`data.md` 里引用组数的地方核对。**`loadout.md` 里"DB-11 有 4 组"的旧描述已在重构中改为 3 组，本项只需在加了新组后改成 4。**

**对 NPC 的影响（不再是"只用于玩家、不影响 NPC 挂载"）**：下游 / 中立战斗机本来就是关卡里的 NPC（m1、m2、m3、m4、m6、m7、m8、m9、m10、m12、sk1 都在用 schist / basalt / sandstone / tideline），新增一组会直接进入 NPC 的挂载计算。

- **弹药池**：`Ent.buildNpcMounts`（`js/engine/entities/mounts.js`）里 NPC 的弹药池 = 上游弹 `min(w.ammo, 点数 × perPoint)`；下游弹 `perPoint` 为 0，池仍是 `w.ammo`，但**发射槽数与携带重量按挂点数算**（`loadFactor` 随之升高，飞行性能变差）。所以多一对点会：增加槽数、增加 `loadFactor`；上游弹还可能增加池。
- **谁会铺到新组上**：`Ent.mountPlan` 的顺序是 ① 关卡写定的逐组 `loadout` ② 写定的吊舱（从最后一组往前占位）③ 制式弹 `a.special` 铺满剩下的**所有挂得住的组**（只在没有逐组 `loadout` 时）。`makeAircraft`（`js/engine/entities/aircraft.js`）里，NPC 没写 `loadout` 且没写 `special` 时才退回机型的 `defaultLoadout`。因此：
  - 写了逐组 `loadout` 的关卡（如 m3 的 `{ A: 'dl4', B: 'vbn' }`）：新组**自动空着**，不受影响；
  - 用 `special`（关卡里的 `sp:`）的关卡：新组会被 `special` **铺上**，弹数 / 槽数 / 重量都变——这正是要避免的；
  - 只靠 `defaultLoadout` 的路径（`npcOnly` 且没写 `special`，目前只有 `folded_wing`，不在本项范围）：`defaultLoadout` 不填新组即空着。
  - **吊舱**（`pods`）从最后一组往前占位，新增一个靠后的组会改变吊舱落点，可能把吊舱从原来的组挤到新组，也要核对。
- **保证现有关卡难度不变**（需评审后二选一，默认第一种）：
  1. 给新增组加一个**数据字段**（暂名 `playerOnly: true`，待评审定名），`Ent.mountPlan` / `buildNpcMounts` 对 NPC 一律跳过这样的组；`Loadout`（`js/engine/loadout.js`，机库 / 玩家）与资料库照常把它当普通组。将来下游战役里"下游玩家"用这些机体时，由那个战役决定是否开放。这样 NPC 的槽数、池、重量与 `mountPlan` 结果与现在**逐字节一致**。
  2. 不加字段，改为把现有每个 `special` 关卡 / `pods` 关卡逐条改写成逐组 `loadout`（新组留空）——改动面大、容易漏，不推荐。
  - 无论哪种，`defaultLoadout` **都不填新组**。
- **验证**：
  - `node tools/test/probes/probe-balance.js`（`m2 m5 m8`，多种子）改动前后逐项对比 `loseAt / ourLost / ourHp / raids`，必须一致；
  - `node tools/test/probes/probe-missions.js` 全部关卡无 `mountIssues`、无异常；每个用 schist / basalt / sandstone / tideline 的关卡，在脚本里取一架敌机比较改前改后 `a.ammoPool`、`a.slotCd` 长度与 `a.loadFactor`（应相同）；
  - 新增 smoke 断言：对每个 NPC 机型，`mountPlan` 对 `playerOnly` 组一律返回空；`Loadout.defaults(ac)` 对新组按 `defaultLoadout` 取值；
  - smoke 的挂点下表面检查与 `render-mounts` / `render-planform` 出图（新组装弹后的外观与间距）；
  - 玩家侧：新增一对后若总弹药明显变多，用 `probe-balance` 比对各机型"满载弹药数 / 重量惩罚"（`maxLoad` 是真正的上限，同种武器占多组会累加弹药与齐射数）。

### 2.5 重型轰炸机（ROK-40 `boulder`）重做

**调查结果与草稿的出入**：实测模型 46 m（翼展）× 44.2 m（机长），战斗机 13–17 m 翼展 × 19–23 m 机长。翼展比约 3 倍、机长比约 2 倍。真实世界（B-1B 对 F-16）机长约 2.8 倍、翼展约 3–4 倍。**机长偏短，翼展大致合理**，所以草稿的"尺寸不符合现实"主要是机身偏短、不显得"重"。

1. **尺寸**：机长拉到约 58 m、翼展约 54 m（≈ ×1.25，不是整体放大），机身更细长。尺寸已定。
2. **命中半径**：所有飞机统一用 `HIT_R_AIR = 7.5`。机体放大后会显得"打偏也算中"或"贴着机翼不算中"。新增机型字段 `hitR`（缺省 7.5；写进 `js/data/_schema.js` 与 `docs/systems/data.md`），重轰设 11–12，并相应调 `hp`（起步 420 保持，靠更大靶面自然变脆）。
3. **挂点**：**保持两个组、每组四个点**（不是拆成四个各 2 点的组）：`A` 弹舱 4 点（沿机身前后两对，间距 ≥ 3 m）、`B` 翼下 4 点（发动机内外各一对）。组 id 仍是 `A / B`，所以关卡里的 `loadout: { B: 'vsr' }` 不用改名；点按"右、左、右、左"排，槽号按这个顺序对应挂点。`hardpointGroups` 的 `label` 键在 `locales/zh-CN/text/aircraft/boulder.json`。（实施时一度拆成了 `A1 A2 / B1 B2`，v3.1.15 改回。）
4. **弹药上限**：NPC 的弹药池是 `min(w.ammo, 点数 × perPoint)`（`Ent.buildNpcMounts`），点数翻倍会让轰炸机带的炸弹翻倍，直接改变 m2 / m8 的难度。批次内先把 `perPoint` 折半抵消（武器数据在 `js/data/weapons/<id>.js` 的 `attr` 里），再用 `probe-balance`（m2 m8）的"基地被炸到失守要多久"校验（`loseAt`；Sim 场景在批次 W 的 2.5.1 里已有）。
5. **连带单位**：`quartz`（ROK-2 预警机）与 `lodestone`（ROK-44 干扰机）共用 `boulder` 模型，一起变大；它们各有一个腹部组，坐标按新尺寸重算。尾炮 `tail20a`（`js/data/turret-guns/tail20a.js`，`boulder` 的 `mounts` 里 `[0, 0.4, −22.2]`）后移到新机尾。
6. 模型（`js/models/aircraft/boulder.js`）、俯视图（`js/render/planform/planes.js`）、图鉴（`js/ui/codex/entries/`）、详情页同步。
7. ROK-44 理论上和 ROK-40 是同一机体，也做相同改动。

**验证**：`tools/render/render-units.js` 出图；smoke 的挂点下表面检查；`probe-missions` 与 `probe-balance` 的 m2 / m8 场景；碰撞半径改动后用 `probe-balance` 看对机炮命中率的影响。

### 2.6 存档

DESIGN.md §8 已知问题第 4 条：`cleared` 只在内存里，刷新就丢。批次 10 的新战役一定会让这变得难受。

**现状**：**设置已经持久化了**——`SET_KEY = 'monsoonline.settings.v1'`（`js/ui/screens/settings.js`），`loadSettings` 在 `try / catch` 里把保存值合并到 `DEFAULTS` 上（`hasOwnProperty` 过滤，"无痕模式或禁用存储时静默降级"），`saveSettings` 在 `onSettingChanged` 里调用。这是 `js/` 里**唯一**用到 `localStorage` 的地方，smoke 的 `localStorage` 桩已有（`tools/test/smoke.js` 开头沙箱里的 `localStorage` 对象）。所以 2.6 **不是"新增设置存档"**，只新增两样：

- `cleared`（`js/engine/game/vars.js` 里的 `$.cleared`）：`{ [MISSIONS[i].id]: true }`，只在 `finish(win)`（`js/engine/game/finish.js`）写入、简报页（`js/ui/screens/brief.js`，战役进度与关卡列表的"已完成"标记）读取；现在注释写的是"本次会话内已完成的任务"。按任务 id 记，id 稳定，批次 1 重排下标也不受影响。
- `loadouts`（`js/engine/game/vars.js` 里的 `$.loadouts`）：`{ [acId]: { [groupId]: weaponId | null } }`，由 `getLoadout(ac)`（`js/engine/game/loadout.js`，内部 `Loadout.defaults(ac)`）惰性生成。存下来的挂载可能引用已被移除的武器 / 挂点组，**读取时必须用 `canCarry` / `Ent.fitsKind` 校验**（`js/boot/main.js` 的 `preflight` 校验 `defaultLoadout` 用的是同一套：`Ent.fitsKind(WEAPONS[dw], dg.kind, !ac.npcOnly)` 与 `canCarry`），不合法的条目回退到 `defaultLoadout`。批次 2.4 给机型加一对挂点后，旧存档里缺这一组，同样靠回退处理。

**做法**：沿用设置的写法（`try / catch` 静默降级），新键 `monsoonline.save.v1`（内含 `{ v:1, cleared, loadouts }`），与设置键分开；读到不认识的版本号就忽略。读取放在启动流程里 `loadSettings` 同一处（`js/boot/main.js`），写入放在 `finish` 与机库改挂载处。smoke 补两条：存取往返、坏数据 / 缺 `localStorage` 时不抛。半天的活，没有技术债。

### 2.7 验证与发版

- 每项的验证只跑该项相关的探针，加上 `smoke` 的相关段（`node tools/test/smoke.js --only <段名>`；完整 smoke 很慢，批次末统一回归才跑全量）与 `tools/test/probes/probe-missions.js`；不做"批次末统一回归"之外的额外验证。新探针放 `tools/test/probes/`。
- 文档：`docs/systems/weapons.md`（重轰挂点）、`loadout.md`（组数表）、`game.md`（debrief、Radio）、`missions.md`（`Mission.fail` 约定）、`models.md`；涉及页面片段的改动同时核对 `pages.md`，涉及文本的核对 `text.md`。
- 每项在 2.1–2.6 各自的发版步骤里写 changelog（`CHANGELOG.md`，`node tools/build/release.js` 生成 `js/core/changelog.js`；版本号用 `tools/build/stamp-version.js`）；2.7 不单独发版。

---

## 批次 3 · v3.2 光标越极点与关卡天色

两项都只动相机 / 渲染环境，放一起方便目视验。

### 3.1 光标穿过上下极点

**现状（已按重构后的代码核对）**：

- 瞄准状态在 `Game.$`：`aimYaw` / `aimPitch` / `aimInit`，常量 `AIM_PITCH_LIM`（89°）、`AIM_SENS`、`AIM_SPIKE_PX` 都在 `js/engine/game/vars.js`。`aimDirNow`、`resetAim`、`updateMouseAim`（经 `AI.steerTo` 驱动玩家）在 `js/engine/game/control.js`。鼠标输入（`mousemove`，含尖峰丢弃与 FOV 灵敏度折算）在 `js/ui/input.js`，把 `aimPitch` 夹进 ±`AIM_PITCH_LIM`。`Game` 的公开钩子 `AIM_LIM`（`js/boot/zz-api-game.js`）也引用它。
- 相机在 `js/ui/camera.js` 的 `updateCamera`，追尾镜头（`camMode === 0`）里有**局部常量** `CAM_PITCH_LIM`（89°）、偏航最短角差平滑（`camYawBase`）、俯仰平滑（`camPitchSmooth`）、三步"先钳位再平滑再钳视线"；`camPitchFor`（同文件）把天顶压到画面上缘，导致相机最多抬到 62°（FOV 56）。相机 `up` 恒为 `(0,1,0)`，最终 `Renderer.setCamera(pos, fwd, up, fov)`（`js/render/render.js`）内部走 `M3.makeCamera` → `orthonormalize(fwd, up)`。
- 座舱（`camMode === 1`）与目标视角（`camMode === 2`）是同函数里的另外两个分支，不在本项范围，保持不动。
- **HUD 罗盘已读镜头方位（已实现，见 hud.md）**：`drawCompass`（`js/ui/hud/instruments.js`）取 `Renderer.getCam().fwd` 的水平投影；水平分量过小时沿用上一帧（`p.compassHdg`）；机头航向另存 `p.heading`。3.1 的相机重构要**保持这个行为**——新相机基的 `fwd` 仍经 `Renderer.setCamera` 进入 `getCam()`，罗盘不用改；极点处沿用上一帧的逻辑要保留。

**为什么现在有 89° 限位**：相机 `up` 恒为 `(0,1,0)`，`fwd` 接近竖直时正交化后 `|up| = cos(俯仰)`，90° 时退化（DESIGN.md 变更记录 78°→89°）。同时 `camPitchFor` 把天顶压到画面上缘。

**根本解法**：不再靠 `up=(0,1,0)` 做叉乘，而是**用 (yaw Y, pitch P) 直接写出相机基**：

```
fwd   = ( sinY·cosP,  sinP,  cosY·cosP )
right = ( cosY,       0,    −sinY      )     // 恒水平 → 相机永不滚转，地平线永远水平
up    = (−sinY·sinP,  cosP, −cosY·sinP )
```

P = 90° 时 `up = (−sinY, 0, −cosY)`，模长仍为 1、方向由 Y 决定，**没有退化**。`Renderer.setCamera(pos, fwd, up, fov)` 本来就接受显式 `up`，GL 与 2D 两条路径都不用改接口；`M3.makeCamera` 的 `orthonormalize` 在 `up ⟂ fwd` 时是恒等，不会再引入退化。"镜头保持水平"这条基础规则不仅没破坏，反而因为 `right.y ≡ 0` 变成构造上的恒等式。

**光标层**（`vars.js` / `control.js` / `input.js`）：

- `aimPitch` 允许走到 (−π, π]（越过 ±90° 即"过顶"），`aimYaw` 照旧无界。`aimDirNow()` 的公式 `V(sinY·cosP, sinP, cosY·cosP)` **本来就对这个范围成立**（`cosP < 0` 时水平分量反向），所以 `p.aimDir`、`AI.steerTo`（`js/engine/ai/steer.js`）、HUD 光标圈都不用动。
- 鼠标输入（`js/ui/input.js` 的 `mousemove`）：`yaw += s · mx · k`，`s = sign(cosP)`；`pitch −= my · k`，回绕到 (−π, π]。`s` 的作用是让"鼠标右移"在过顶后仍然是"光标在屏幕上右移"。去掉这里的 `AIM_PITCH_LIM` 夹取。
- **折回**：相机转完（见下）后，把光标表示整体折回规范形——`yaw += π; pitch = π − pitch`——此时 `s` 回到 +1。这只是换参数化，方向向量不变，玩家看不到。折回放在 `updateCamera` 末尾（它同时读写 `aimYaw/aimPitch`，这是它与 `control.js` 之间唯一的互写点，经 `Game.$` 即可）。

**相机层**（`js/ui/camera.js` 的 `updateCamera`，追尾分支）：

- 输入是一个观察向量 `d`（鼠标瞄准时是 `aimDir`，否则是 `p.fwd`——两种模式统一；现在这个"取谁"的判断就是 `lookAim ? aimDirNow() : p.fwd`，保留）。`P = asin(d.y)`，范围 [−90°, 90°]，不再夹 89°，删除 `$.AIM_PITCH_LIM`（`vars.js`）、局部 `CAM_PITCH_LIM` 与 `SIN_LIM` 及"视线最后再钳一次"那一步，删除 `camPitchFor` 的天顶重映射（该函数整个删掉）；`input.js`、`resetAim`、`zz-api-game.js` 里对 `AIM_PITCH_LIM` 的引用一并清掉（`AIM_LIM` 钩子若有测试读它，改读 π 或删除，smoke 里同步）。
- `Y` 的目标 = `atan2(d.x, d.z)`；水平分量 `|d_h| < POLE_HOLD`（起步 sin 3°）时**冻结目标不更新**——这就是"穿越极点后的一个极小延迟"。越出冻结区后目标可能差 π，以**定速** `POLE_SWING_RATE`（起步 5 rad/s，约 0.6 s 转半圈）平滑转过去，而不是用现有的指数平滑（它在大角度时开头太猛）。新常量 `POLE_HOLD` / `POLE_SWING_RATE` 放 `vars.js`（与其它相机常量同处）。
- 因为 P 在转的过程中保持在 ≈90°，这一转看起来就是"绕竖直轴自转"，没有任何临界反弹。
- 相机位置偏移（`-camDir*(camDist+speedBack)`）在 P→90° 时相机会跑到机体正下方、画面中心被机腹占满。需要给"抬头取景"单独调：当 P > 70° 时把相机向后 / 向上的偏移混合到水平方向（`updateCamera` 里已有 `frameDeficit` / `softClampFrame` / `stepFrameExtra` 等取景辅助，加一个 P 的权重）。**这是全项最需要在浏览器里反复调的点**，先做原型。
- 纯函数 `Camera.basis(Y,P)`：新建很小的纯函数放在 `js/ui/camera.js` 里，经 `Game.$.camBasis`（改写现有的同名私有 `camBasis`）供 smoke / Sim 测试；不新增全局。

**其它读取点核对**：`resetAim`（`control.js`）现在用 atan2 / asin 并夹 ±`AIM_PITCH_LIM`，需要改为支持 P ∈ (−π, π]；HUD `drawBoresight`（`js/ui/hud/instruments.js`）、圈位置（`js/ui/hud/aids.js`）都读向量，安全；2D 回退 `Renderer`（`js/render/render.js` 的 `horizonY`）的地平线计算在 P=±90° 附近要检查有无 tan 爆炸，必要时回退路径仍把 P 夹到 ±89.5°（GL 是默认实现）。

**验证**：

- smoke / Sim：纯函数 `camBasis(Y,P)` 单测——任意 (Y,P) 下三向量正交单位、`right.y == 0`、无 NaN。
- 脚本化鼠标扫过 ±90°（smoke「干扰与机动」段里已有"mousemove 事件 → aimYaw/aimPitch → steerTo → ctrl → 镜头"的整链路用例，在它旁边加）：断言光标向量连续、`Y` 目标只在冻结区之外才变化、折回前后 `aimDir` 不变、`steerTo` 输出连续、罗盘读到的方位在极点附近连续（沿用上一帧）。
- 视觉：`tools/render/probe-render.js`（2D 路径）在 P = 80°、89°、90°、过顶后的若干 Y 下出图；手动：浏览器里反复拉过极点，看有无跳变，鼠标左右在过顶前后方向是否一致。
- 键盘模式（`p.fwd`）做一次筋斗，确认相机跟随不抖。
- `golden-render`：追尾镜头在平飞下的画面应与现状一致（只改极点附近的行为）。

**文档**：`game.md` 的相机一节重写；DESIGN.md §5.3 的"相机不跟随滚转"补充"构造上恒水平"的新理由，并把 89° 的变更记录标为"已被取代"；`hud.md` 罗盘一节注明读相机 `fwd`（已有，核对即可）。

### 3.2 关卡时间与天色

**目标**：每关设定一天中的时刻，太阳位置、天空、海面、雾、云色随之变化；不做夜战。

**现状（已按重构后的代码核对）**：

- `Shading`（`js/core/shading.js`）里光向是模块内的闭包变量 `L = norm(V(-0.42, 0.80, 0.43))`，`S.LIGHT = L`，`S.brightness` 闭包读同一个 `L`；`FOG_RGB`、`SKY`、`SEA`、`CLOUD` 是模块对象字段。**`Shading.setEnv`、`Shading.envVersion`、`Shading.DEFAULT_LIGHT` 都不存在**（本项新增）。
- GL 环境层在 `js/render/env/`：`create.js` 里 `flatStops(...)` 在**创建时**把 `S.SKY.stops` / `S.SEA.stops` 打平成 `Float32Array`（`sky`、`sea` 两个局部变量），之后每帧只用这两份；`S.LIGHT`、`S.SKY.sun`、`S.SEA.*`、`S.CLOUD`、`S.SKY.stops[0][1]`（云遍的雾色 `uHz`）在 `drawEnv` / 云 / 高空云片 / 粒子各遍每帧从 `Shading` 读。模型的 GL 管线（`js/render/render-gl.js`）每帧读 `S.LIGHT`、`S.FOG_RGB`。
- 2D 回退在 `js/render/render.js`：文件顶部**加载时**捕获 `LIGHT = Shading.LIGHT`（同一对象）与 `FOG_R/G/B`、`FOG_NEAR/FAR/MAX`（数值拷贝）；`drawSky` 里天空渐变色标和太阳光晕色**写死**（`#122c47 / #2f6c95 / #7fb2cc / #c9d8dd`，太阳 `LIGHT × sunDist` 取方向）；`shade()` 的颜色缓存 `colorCache` 按 `hex + 亮度档 + 雾档` 做键，雾色变了不会失效。
- `UnitView`（`js/ui/unitview.js`）里还有**另抄的一份**光向 `LIGHT = M3.norm(M3.V(-0.42, 0.80, 0.43))`，文件头注释声明"光向与亮度公式与 render.js 一致，改 `LIGHT` 时要跟着改"。

**数据**：`mission.time = { hour: 15.5 }`（当地太阳时，缺省 = 现有外观）；`mission.sun` 可选，直接给 `{az, el}` 覆盖。纬度取设定的北纬 12°，赤纬近似春分（日出日落近 6 / 18 点）。字段加进 `js/missions/_schema.js` 的校验，关卡文件里写。

**环境预设**（按太阳高度插值的关键帧，起步 4 个）：正午（el > 50°）、上午 / 午后（25–50°）、金色时段（5–25°）、黄昏（−2°–5°，天空偏暖、海面暗、雾偏紫）。每个关键帧含：`light` 方向与强度、天空渐变 stops、太阳盘、海面 stops 与 glint、雾色、云色、模型的环境光下限（低太阳角时 `0.44 + 0.56|n·L|` 的 0.44 要抬高，否则背光面全黑）。预设表放 `js/core/shading.js`（数据与 `setEnv` 同处，纯数值，不引用 DOM）。

**落点**：

1. 新 `Shading.setEnv(env)`（`js/core/shading.js`）：**原地修改** `S.LIGHT.x/y/z`、`S.SKY`、`S.SEA`、`S.FOG_RGB`、`S.CLOUD`（`S.LIGHT` 不能重新赋值，`brightness` 闭包与 `render.js` 顶部的 `LIGHT` 都持有同一对象），并递增 `S.envVersion`；同时新增 `S.DEFAULT_LIGHT`（只读的缺省光向副本，供 `UnitView` 使用）。`Shading` 的 `AMBIENT` 目前是常量，"环境光下限"抬高要让它也能被 `setEnv` 改（`brightness` 与 `render.js` 的内联亮度公式——`dl` 那一处——都要读 `S.AMBIENT / S.DIFFUSE`，而不是写死）。调用点：`startMission`（`js/engine/game/mission-start.js`）按 `mission.time / sun` 调一次，缺省调缺省预设（使上一关的天色不残留）。
2. GL：`js/render/env/create.js` 的 `flatStops(...)` 两份缓存改为"`envVersion` 变化时重建"；云遍里 `S.SKY.stops[0][1]` 的雾色引用保持。模型管线 `render-gl.js` 本来每帧读 `S.LIGHT / S.FOG_RGB`，不用改。
3. 2D 回退：`render.js` 的 `drawSky` 写死的天空色与太阳色改读 `Shading`；顶部加载时捕获的 `FOG_R/G/B / FOG_NEAR/FAR/MAX` 改成读 `Shading`（或在 `envVersion` 变化时重新取）；`shade()` 的 `colorCache` 与亮度 / 雾量化缓存在 `envVersion` 变化时清空。
4. `unitview.js` 那份光向**故意不跟随**（资料库预览需要稳定的打光），加注释说明，并读 `Shading.DEFAULT_LIGHT` 而不是另抄一份。
5. HUD：低太阳角时检查绿色 HUD 在暖色天空下的对比度（`hudOpacity` 不够就加描边；配色在 `js/ui/hud/base.js`）。
6. 缺省预设与现有常量**逐值相等**，所以没写 `time` 的关卡画面不变（`tools/render/probe-render.js` 逐像素验证；`golden-render` 同理）。

**各关取值**：数据只加字段，先全部沿用缺省；真正给各关定时刻放到批次 8 随剧情一起做。

**验证**：`probe-render` 与 `golden-render` 缺省相等；4 个预设在 GL 与 2D 各出图目检；smoke 断言 `setEnv` 后 `S.LIGHT` 仍是同一对象、`envVersion` 递增、`DEFAULT_LIGHT` 不随 `setEnv` 变化。

### 3.3 过失速机动（PSM，玩家侧）

**现状（已按重构后的代码核对）**：

- `stepAircraft`（`js/engine/entities/aircraft.js`）里**没有攻角、升力系数、阻力系数、质量、推力、燃油这些概念**。姿态靠 `a.ctrl.pitch/roll/yaw × 控制权限 × dt` 直接转；速度靠"目标速度 `vTarget` 加 `accel / decel` 一阶趋近 + 重力沿航迹分量 + 转弯掉速 `TURN_BLEED = 0.20`（常量在 `js/engine/entities/physics.js`）"。现有模型没有升力，PSM 的 `CL(α) / CD(α)` 是**全新**的。
- "`vel = fwd × speed`、无侧滑"**基本成立但有一个例外**：失速时的**下沉项** `a.sink`（`stepAircraft` 内，`speed < vStall` 时累积，上限 `STALL_SINK_MAX = 140` m/s，脱离失速后以 0.9 s 衰减）让 `vel.y -= sink`，这是现有唯一"速度与机头不一致"的机制。PSM 的速度解耦可以参考它的写法。
- 失速时控制权限乘 0.34（`stepAircraft`），另有低头力矩 `1.2 × st × dt`（只在 `pos.y > 60`）。控制权限由 `ctrlFactor`（`physics.js`，`clamp(q / ctrlFull, ctrlFloor, 1)`）给出，写进 `a.ctrlAuth`，`AI.steerTo`（`js/engine/ai/steer.js`）与 HUD 的 P/R/Y 读它。
- **没有过载上限**：`gLoad` 只是玩家 G 键的倍率（上限 `HIG_MAX = 1.90`，`vars.js`；`controlPlayer` 里平滑；`stepAircraft` 内夹到 2.3），没有 `maxG` 或转弯率表。
- 挂载重量惩罚在 `stepAircraft` 开头用"临时 `phys` 副本"替换 `p`（`loadoutPenalty`，`js/data/rules.js`）——这是"对 `p` 整体替换"的先例，也是 PSM 临时缩放舵效的参照。
- **没有** `stepVtol`、VTOL，`noPSM` 标签也没有（`js/core/tags.js` 里尚未声明，数据里也没人用）。`noPSM` 在本批用 `Tags.declare('noPSM', { owner: 'entities', doc: T('core.tags.doc_N') })` 引入（文案进 `locales/zh-CN/text/core/tags.json`，按 `docs/systems/tags.md`「加一个标签」四步走）；缺省所有机型可用，VTOL（批次 6）加上它。
- `docs/systems/flight-model.md` 已按重构后的实现更新，**本项不再需要"校正过时文档"**；本批改飞行代码时只增补 PSM 一节。

**定位**：光标越过极点之后，机体姿态可以指向机头后方，但速度仍沿机头。过失速机动要求**速度矢量与机头解耦**，这是新的物理分支，不能直接在主路径里改。因此做成独立分支 `Ent.stepPSM`——**新建文件 `js/engine/entities/psm.js`**，属于 `Ent` 命名空间：在文件头 `var $ = Ent.$; $.stepPSM = stepPSM;`，在 `js/engine/entities/zz-api.js` 里加 `Ent.stepPSM = $.stepPSM`（及 `Ent.psmGate` 之类要给 `Game` 的门限函数，跨命名空间只走公开函数）。按字母序它在 `physics.js` 之后、`radiation.js` 之前加载，`zz-api.js` 最后——不需要改 `tools/build/gen-index.js`，加载顺序自然成立。PSM 的常量（`PSM_MIN_AGL` 等）放 `engine/entities/_state.js` 或 `psm.js` 头部的 `$.` 上。与批次 6 的 `stepVtol` 同一套隔离做法；`stepAircraft` 主路径不动，不触发 PSM 的场景黄金回放保持逐帧一致。

**触发**：
- **键位**：现有占用——W A S D Q E、Shift、Ctrl、Space、Enter、方向键、F、Tab、R、V、1 2 3、N、G、H、M、Esc（与 `KEYMAP` 条目一致）。**空闲：B C X Z T Y U I O P J K L 与数字 4–9。推荐 `X`**（或 `C`）。落点：`js/ui/input.js` 的 keydown 块（和 `KeyG`/`KeyN` 那一串同处，只在 `$.state === 'playing' && !$.paused` 时）；`KEYMAP`、`TIPS`、`HELP_ICONS` 三张表都在 `js/ui/screens/settings.js`，**要同步**，文案走 `locales/zh-CN/text/ui/screens/settings.json`（`T('ui.screens.settings.KEYMAP.iN.i1.s1')` 等），再跑 `node tools/build/gen-locales.js && node tools/build/gen-pages.js`。
- 门限，全部满足才生效，否则 SysNote（`js/ui/sysnote.js`，文案进 `locales/zh-CN/text/engine/…`）给出原因（"光标在前方，无需过失速" / "高度不足" / "能量不足" / "冷却中"）：
  - 光标方向与机头夹角 > 90°；
  - `agl ≥ PSM_MIN_AGL`（起步 2000 m；`Ent.agl`）；
  - 能量门限 `E = ½v² + g·h ≥ E_min`（代码里**没有现成的能量量**，这是新增的纯函数，放 `psm.js`），`E_min` 由机型 `vStall` 与 `vMax` 推导，保证结束时仍高于失速速度；
  - 不在 `PSM_CD` 冷却内（起步 10 s）；
  - 机型未带 `noPSM` 标签（读 `a.tags.noPSM`；飞机实体创建时带上单位定义的 `tags`）。

**过程（三段，由控制律自动推进，玩家在此期间不能手动转向）**：
1. **拉升段**：机头以 `PSM_MAX_RATE` 上仰，攻角 α 由 0 升到 60–90°。
2. **过顶 / 回转段**：机头沿 `aimDir` 所在平面转向，速度矢量在阻力与升力作用下滞后，逐步被拉向机头方向。
3. **收敛段**：机头进入光标 ±`PSM_ALIGN_DEG`（起步 3°）并保持 `PSM_HOLD_S`（起步 0.3 s），结束，回到常规控制。

- **光标中途移动**：机头目标每帧读取当前 `aimDir`，所以过程中移动光标会改变目标——"直到指向光标所在"按字面执行。
- **接入点**：玩家侧在 `controlPlayer`（`js/engine/game/control.js`）里，`c.pitch/roll/yaw` 写完之后（`if ($.aimMode) … else …` 两个分支之后）、油门处理之前加 PSM 分支并覆盖 `c.*`；`stepAircraft` 只通过 `a.ctrl` 读输入，所以 `ctrl` 是唯一咽喉。**`player.ctrl` 是持久对象，分支不写时会残留旧值，PSM 结束时要清零。** PSM 状态（`a.psm = { phase, t, … }`）存在飞机实体上，`stepAircraft` 开头判 `a.psm` 非空就转调 `$.stepPSM(a, dt, world)` 并返回；这是主路径里唯一的一行入口，`a.psm` 为空时零开销、行为不变。
- **控制律**：`AI.steerTo(a, desired, out, st, dt)`（`js/engine/ai/steer.js`）本来就能驱动玩家（`updateMouseAim` 就是这么用的），能处理"目标在机后"的退化方位。它**没有每轴速率上限参数**——速率来自 `a.phys` 与 `a.ctrlAuth`（`steerTo` 内 `wP / wR / wY` 由 `p.pitch/roll/yaw × auth` 算出），增益 `K_ROLL = 5 / K_PITCH = 3.2 / K_YAW = 3.2`，俯仰偏航夹在 ±1。PSM 想降低高攻角下的舵效，做法是传一份临时缩放的 `ctrlAuth`（`stepAircraft` 里 `loadoutPenalty` 已经用"临时 `phys` 副本"的先例），或对 `out` 做后乘。

**物理（分支内部，全部为新写）**：
- **以 `vStall` 为基准归一化**，不引入现实的质量和推力：
  - 推力加速度 `a_T = p.accel × PSM_THRUST_K × fwd`（`PSM_THRUST_K` 起步 0.6）；
  - 升力加速度 `a_L = G × (v / vStall)² × CLrel(α) × n̂`，`n̂` 为垂直于速度、朝机体上方的单位向量，`CLrel(α_stall) = 1`（即定义为"在 `vStall` 且处于临界攻角时升力等于 1 g"，与现有失速定义一致）；
  - 阻力加速度 `a_D = (p.decel / vRef²) × v² × CDrel(α) × (−v̂)`，`CDrel(0) = 1`，随 α 增大，90° 时约 4–6 倍（平板）；
  - 加上重力。`CLrel` 取值：α ≤ 临界角（起步 20°）线性上升到 1，20°–35° 为峰值 1.0–1.15，35°–90° 缓降到约 0.55，90° 以上按 |α| 对称。
- 与现有失速的关系：常规失速（`speed < vStall`）仍由原逻辑处理；过失速分支只在 PSM 状态内生效。退出后回到原模型，并附加 0.8 s 的低舵效恢复（与现有失速的 0.34 同量级），避免出口突然满舵；退出时把 `a.vel` 重新投影回 `fwd`，保证出口速度连续（`speed = |vel|`），同时清 `a.sink`。

**中止条件**（任一即退出，并把机头拉平）：
- 速度 < `PSM_MIN_SPEED`（起步 `0.8 × vStall`）；
- `agl < PSM_SAFE_AGL`（起步 600 m）且仍在下降：强制进入"拉平"子模式，屏蔽 PSM 直到脱离低空；
- 玩家再次按 `PSM_KEY`（主动中止）；
- 被击毁。

**受伤不中止**：过程中受伤只记录，不改变轨迹。

**能量代价**：结束时报告能量损失百分比 `E_end / E_start`，写入战报的机动统计（"过失速 × 次，平均能量损失 x%"；战报在 `js/engine/game/finish.js`，debrief 页片段 `locales/_html/screens/debrief.html` 与 `text/html/debrief.json`），既是玩家反馈，也是 AI 评估依据（见 5.8）。

**HUD**：
- 状态与冷却文字走**告警栈**：`ALERT_ORDER`（`js/ui/hud/panels.js`，目前为 `missile, lit, damage, terrain, stall, lowq, jammed, winchester, emcon`）与 `drawAlerts` 的 `list.push`，插入一个 `'psm'` 条目（不要另起 y）；smoke 断言 `stall` 排在 `lowq` 之前（报错文案"失速没有排在动压前面"，在「干扰与机动」段），插入时**不要改变这两项的相对顺序**；
- 能量条放在 G 表旁（`js/ui/hud/instruments.js` 的推力 / G 表绘制），攻角仪表是**新绘制**（刻度 30 / 60 / 90°），只在 PSM 状态或冷却中显示；
- RWR 没有任何与机动相关的钩子，AI 做 PSM 时的"高攻角机动"提示（5.8）是新增显示；
- CMD 光标圈保持原样，过程中作为机头目标的可视参照。
- 所有新文案（告警文字、仪表标注、SysNote 原因）一律 `T('键')`，进 `locales/zh-CN/text/ui/hud/` 与 `engine/`。

**相机**：PSM 期间沿用批次 3.1 的 `aimDir` 跟随；光标在后方时相机会经过竖直方向，这正是 3.1 要验证的场景。

**不适用**：VTOL（`noPSM`）。玩家无人僚机不由玩家触发，只按 AI 规则使用（5.8）。

**不能被打破的既有断言（已列出，新分支默认关闭则全部不受影响）**（均在 `tools/test/smoke.js`，按断言内容查，不依赖行号）：「后台模拟 / 世界推进」里包装 `Ent.stepAircraft` 的**逐帧计数**；「干扰与机动」段的 `AI.steerTo` **连续控制分配**（含垂直与倒飞）与"竖直失速会下坠"（抬头失速必须下坠）；`Ent.ctrlFactor` 的慢速 / 高速 / 缺省下限（0.13）用例；升限探测（`ctrlFactor` 判据）；`loadoutPenalty(0)` 恒等；HUD 油门条（`thrPercent` 标度）。

**验证**：
- Sim 新探针 `tools/test/probes/probe-psm.js`：从 500 m/s、3000 m 高度触发，光标在正后方；断言收敛时间有界、α 峰值 ≤ 100°、无 NaN、速度损失落在设计区间；
- 光标中途移动（±60°）：断言仍收敛到新方向；
- 门限：低高度、低能量、冷却中、光标在前方，各自被拒绝并给出对应 SysNote；
- 中止路径：速度低于阈值、低空下降、主动中止，各自回到常规飞行且无突跳；
- 数值稳定：dt = 0.02 / 0.05 两种步长下收敛结果一致（相对误差 ≤ 5%）；
- 黄金回放：不触发 PSM 的全部场景与现状逐帧相等（`node tools/test/golden.js`）；
- smoke：`--only 挂载系统`（`noPSM` 已声明且被用到的标签断言；见 3.3 的标签：它要么先被某机型数据使用，要么在 `Tags.declare` 里标 `reserved: true` 直到批次 6）、`--only 干扰与机动`（门限断言）。

### 3.4 发版

文档：`game.md`（相机）、`rendering.md`（环境预设）、`missions.md`（`time / sun` 字段）、`flight-model.md`（PSM 一节）、`tags.md`（`noPSM`）、`hud.md`（告警栈 `psm` 条目）、`modules.md`（`Ent.stepPSM`、`Shading.setEnv`）。发 v3.2：`node tools/build/release.js`（含 `stamp-version`；changelog 条目写进 `js/core/changelog.js` 与对应 `locales/*/text/core/changelog.json`）。

---

## 批次 4 · v3.3 地图边界与整备点

两者相辅相成：边界要有"可以去的后方"，整备点要有"不能无限跑远"的约束；批次 5 的撤离同时依赖它们。

**新增模块放哪（本批两个新全局，核对 `tools/build/gen-index.js`）**：`Arena`（`js/engine/world/arena.js`）、`Resupply`（`js/engine/world/resupply.js`）是新的独立全局模块，放在 `engine` 层新建的 `js/engine/world/` 子目录里。**不需要改 `LAYERS`**：`LAYERS = [core, data, models, missions, engine, render, ui, boot]` 只管层顺序，层内规则是"`_` 开头最先、`zz` 开头最后、其余按目录再按文件名字母序"，所以 `engine/world/*.js` 自动排在 `engine/game/*.js` 之后、`zz-api` 之前，并且在 `render` / `ui` 层之前。两个模块写成与 `Loadout` 同样的 IIFE 全局（`var Arena = (function () {…})();`），不进别的命名空间的 `$`；公开接口就是各自返回的对象。因为它们读 `Ent`（`Resupply` 要调 `Loadout`、`Ent`），加载顺序上 `engine/entities/zz-api.js` 比 `engine/world/*.js` 晚（`zz` 整层最后），所以它们**只在函数体内**引用 `Ent.xxx`，不要在加载期顶层调用。新增后跑 `node tools/build/gen-index.js` 确认顺序，`node tools/build/gen-pages.js` 重新生成页面。

### 4.1 地图边界

**数据**：`mission.arena = { cx, cz, half, warn }`（世界米；方形，`half` 是真边界到中心的距离，`warn` 是警告区宽度）。字段加进 `js/missions/_schema.js` 的校验，关卡文件（`js/missions/m*.js`）里写。

**先测再定**：各关没有声明范围（玩家 z −2000…−19000、敌 +20…+34 km、x 到 ±10 km、调节单元场 30 km 网格、AEWC −34 km）。先写 `tools/test/probes/probe-extent.js`（Sim，经 `tools/lib/sim.js`）：开每一关，统计所有出生单位与航线点的外包盒，输出建议值 = 外包盒 + 余量（余量 ≥ 一次追击超调，起步 8 km；警告区起步 6 km）。各关的最终值写进关卡文件，随批次评审。

**新模块 `js/engine/world/arena.js`**（全局 `Arena`，见上）：`Arena.state(pos)` → `{ zone: 'in' | 'warn' | 'out', depth, edgeDist }`（`depth` 为进入警告 / 越界的 0–1 进度）。无 `arena` 的关卡返回恒 `'in'`。

**玩家侧表现**：

| 阶段 | 表现 |
|---|---|
| 接近边界（雷达量程内） | 小地图画出边界：警告线为**单斜线**，真边界为**交叉斜线**，裁剪在雷达圆内（`js/ui/hud/radar.js` 的 `drawRadar`，坐标走 `radarXY` 的同一套"镜头水平朝向 → 雷达单位向量"换算） |
| 进入警告区 | 告警栈出现"离开战区"（限频），一条无线电（指挥频道，台词多变体）：告警栈在 `js/ui/hud/panels.js`（`ALERT_ORDER` 插入 `'arena'`；`drawAlerts` 里 `list.push`），无线电走 `Radio`（`js/ui/radio.js`），文案进 `locales/zh-CN/text/…` |
| 越过真边界 | `HudFx`（`js/ui/hudfx.js`，独立全局 IIFE，不属于 `HUD.$`）的全屏层把画面渐黑，`ARENA_FADE_S`（起步 8 s）到全黑；中途回到界内则以同样速度恢复。`HudFx` 目前只有受扰（`drawJam`）与受伤（`drawHurt`）两种效果、叠加层 `layerZ = 300`（在无线电面板之上、暂停菜单之下）；新加 `drawFade(g, W, H, k)` 与 `HudFx.setArenaFade(k)`，并在 `draw` 的"on"判定里把 `fadeK > 0.01` 算进去（否则不会创建叠加层） |
| 全黑 | 进入失败流程（批次 2 的 `failing` 停留画面），失败原因 `fail.arena`；提示直接显示在黑屏上 |

**AI 侧**：不撤离的 AI 在警告区内叠加一个朝中心的软转向（权重随深度增加；落点在 `js/engine/ai/brain.js` 的 `update` 里期望方向算出之后、交给 `AI.steerTo` 之前），避免追击超调飞出去；沿航线飞出去的轰炸机（`escaped`）不受影响；僚机跟随长机，不单独处理。撤离单位的"允许出界并被移除"留给批次 5。

**玩家侧的调用点**：`Game` 的 `update`（`js/engine/game/update.js`）里每帧对玩家调一次 `Arena.state`，结果交给 HUD（经 `world` 上的字段，如 `world.arena = { zone, depth }`，HUD 只读 `world`，不跨命名空间读 `Game.$`）与失败流程。

**验证**：Sim 场景——玩家直线飞出，断言渐黑时序与失败；中途折返断言恢复；AI 8v8 场景断言无单位持续越界；smoke 断言每一关都有 `arena` 且出生单位全在界内；`probe-missions`；`golden`（无 `arena` 字段的老场景不受影响）。

### 4.2 整备点

**数据与标签**：

- 单位标签 `resupply`（先给 `humpback`、各 `PLATFORMS`、批次 6 的航空巡洋舰）。核对现状：`js/core/tags.js` 里**没有** `resupply`，`js/data/ships/humpback.js` 与 `js/data/platforms/*.js`（`beacon / breakwater / cairn / reed / shoal / sluice`）都还没有 `tags` 字段；`Registry.ship / platform` 注册时已支持 `tags`（展开成 `{ …: true }`），所以只需 `Tags.declare('resupply', { owner: 'game', doc: T('core.tags.doc_N') })` + 在这些数据文件里加 `tags: ['resupply']` + 机制代码读 `t.tags.resupply`；smoke 的"声明过的标签必须被数据用到"断言自然满足。
- 关卡声明：`mission.resupply = [{ ref:'carrierA', r:1500, hold:4, uses:2, swap:true }]`，`ref` 指向关卡里的一个我方单位。只有 team 0 的单位生效。字段加进 `js/missions/_schema.js`。

**玩家流程**（新模块 `js/engine/world/resupply.js`，全局 `Resupply`）：

1. 在 `3 × r` 以内告警栏开始显示距离（非警告配色，青色 `HUD.CY`），进入 `r` 后显示"整备中 n/hold s"，驻留计时累加，离开则清零。判定只看**水平距离**，另有可选高度上限 `maxAlt`。
2. 计时满：**暂停游戏时间**（沿用 `paused` 的跳过 `update` 机制——`js/boot/main.js` 的主循环里 `if (!$.paused) { $.update(dt); $.render(); } else { $.render(); }`；`js/ui/screens/pause.js` 的 `togglePause` 只管暂停菜单 DOM（`#pause`）与指针锁，**不要复用它**；另设 `$.rearmOpen` 标志，主循环同样判 `$.paused || $.rearmOpen` 跳过 `update`，`js/ui/input.js` 的 `mousemove`、`H` / `Esc` 暂停键、`requestAimLock` 同样屏蔽它），弹出整备界面。
3. 界面：只含俯视缩略图、属性条、挂载选择（`swap:false` 的关卡跳过界面，直接补满）。**复用机库的构建函数**——机库视图 `Game.$.hangarView`（`js/ui/screens/hangar.js`：`ac / group / ids / rebuild`）与 `buildHardpointEditor(ac, lo, view)`（`js/ui/screens/hardpoints.js`）已经支持传一套自己的元素 id（`viewEl(view, key)`）；整备界面新建一个 `Game.$.rearmView = { ac, group, ids:{…}, rebuild }` 传进去。`PLANFORM.draw(cv, ac, loadout, activeGroup, cd)`（`js/render/planform/paint.js`）接受 canvas 参数，不需要改。**整备界面是新的 DOM**：在 `locales/_html/overlays/` 新增片段 `rearm.html`（与 `pause.html` 同级，`z-index` 在暂停菜单之上），文字进 `locales/zh-CN/text/html/rearm.json`（其余语言同键，`check-locales` 会查缺），新增脚本 `js/ui/screens/rearm.js`（属于 `Game`，经 `Game.$` 开合；`Game` 公开接口不用加，由 `Resupply` 经 `Game.$.openRearm` ——需在 `js/boot/zz-api-game.js` 暴露一个 `Game.openRearm / closeRearm`）；然后 `node tools/build/gen-locales.js && node tools/build/gen-pages.js`。
4. 确认：`Loadout.apply(player, ac, lo)`（现有签名是 `apply(ent, ac, lo[, wl])`，它**本来就从零重建** `ammoPool / slotCd / spAmmo / loadModel / armor / lockRangeK / ecm`，并 `p.flares += pe.flareBonus`——所以"补满"不需要新参数，但 `flares` 是**累加**，调用前要先把 `flares` 复位为基数 80，否则吊舱加成会叠加；`{ refill:true }` 这个选项**不存在**，不要加，直接重复调用即可）+ `hp = maxHp` + 机炮（`gunAmmo` 取 `WEAPONS[ac.gun].ammo`，同 `makeAircraft`）+ 干扰弹（`flares` 含吊舱加成、`flareCd = 0`）+ 清除失速与损伤状态 + `syncWeapon`（`js/engine/game/world.js`，`$.syncWeapon(player)`）。所有弹药一律补满。
5. `uses` 用尽后该整备点只提示"补给耗尽"。
6. 玩家被导弹追踪（来袭导弹 < 6 km；可复用 `HUD.threatState` 的同类判据或 `AI.findIncoming`）时不能开始整备，告警栏提示"规避中无法整备"——防止拿它当暂停键躲导弹。
7. 雷达上用淡青圈标出整备触发范围（`js/ui/hud/radar.js`）。
8. 战报新增"整备次数"一行（`finish.js` 统计 + `debrief.html` / `text/html/debrief.json`）。

**边界情况**：整备时间冻结，`timeLimit` 不走（主循环不进 `update`，天然成立）；整备界面里换了挂载，`loadModel / loadFactor / armor / stealth / lockRangeK / ecm` 都要重算——所以必须走 `Loadout.apply` 而不是再写一份。

**NPC 整备**：批次 5 与撤离一起做（"水平距离入界瞬间补满"，调用 `buildNpcMounts` 重建）。本批只留好 `Resupply.applyNpc` 的接口占位。**核对现状**：`buildNpcMounts(a)` 是 `Ent.$` 上的**私有**函数（`js/engine/entities/mounts.js`，`$.buildNpcMounts`；`zz-api.js` 没有导出），只由 `makeAircraft`（`js/engine/entities/aircraft.js`，`if (!a.isPlayer) $.buildNpcMounts(a)`）调用，**`Ent.rebuildMounts` 仍然不存在**。它对 `a.slotCd[k]` 是整个数组重新赋值（会重置），但对 `a.ammoPool` 是 `if (!a.ammoPool) a.ammoPool = {}` 后逐项 `a.ammoPool[k] = ammo` 赋值（也是重置，不追加）；`a.loadFactor` 重算，`a.special` 兜底段也会重跑。整备前要先把它导出成 `Ent.rebuildMounts(a, { refill:true })`（在 `mounts.js` 加 `$.rebuildMounts`，`zz-api.js` 加 `Ent.rebuildMounts = $.rebuildMounts`，`refill` 时清空 `a.ammoPool = {}` 与 `a.slotCd = {}` 再调 `buildNpcMounts`），并用测试核实重复调用不会累加 `slotCd / ammoPool`、`loadModel`（NPC 的 `curLoadFactor` 读 `ammoPool`）一致。

**验证**：Sim 场景——放入范围、推进、断言弹药与 `startMission` 初始值**逐项相等**；换挂载后的弹药 / 质量与机库一致；`uses` 计数；规避中拒绝；`rearmOpen` 期间 `update` 不推进（时间与 `timeLimit` 不变）。smoke 点击整备界面（在「干扰与机动」之外新开一个较小的段，用 `--only` 单独跑）。`probe-missions`；`check-locales`（新增的 `rearm` 文案键齐全）。

### 4.3 文档与发版

`missions.md`（`arena / resupply` 字段、各关取值表）、`hud.md`（雷达边界、告警、`HudFx` 渐黑）、`game.md`（暂停与整备）、`loadout.md`（`Loadout.apply` 复用）、`tags.md`（`resupply`）、`modules.md`（`Arena` / `Resupply` / `Ent.rebuildMounts`）、`pages.md`（`rearm` 片段）。发 v3.3。

---

## 批次 5 · v3.4 AI 强化与半主动雷达弹

> **本批的代码位置约定**（v3.0.0 之后）：AI 在 `js/engine/ai/`（`AI` 命名空间，私有状态 `AI.$`，公开接口只在 `zz-api.js`）；实体在 `js/engine/entities/`（`Ent`）；Game 的世界侧在 `js/engine/game/`，输入在 `js/ui/input.js`；HUD 在 `js/ui/hud/`；`Radio` 是 `js/ui/radio.js` 里的独立全局。引用位置一律写"模块 + 函数名"。
>
> **新文件的加载顺序**（`tools/build/gen-index.js`：层内 `_` 开头最先、`zz` 开头最后，其余先按**目录路径**再按文件名字母序）：
> - `AI` 新文件放 `js/engine/ai/`，只通过 `$` 互相调用，**文件顶层只许做 `$.xxx = …` 赋值，不许调用别的文件的 `$` 函数**（字母序在后面的文件此刻还没加载）；要对外暴露的函数在 `zz-api.js` 里加一行 `AI.xxx = $.xxx`，同时在 `docs/systems/modules.md` 的接口表里补上。机动库**平铺**在 `ai/` 里，文件名统一用 `man-<名字>.js` 前缀（不建子目录，`modules.md` 的 `AI` 文件清单保持平铺）。
> - `Chatter`、`FovWatch` 是新的独立全局模块（不属于任何已有命名空间，不要放进 `AI` / `Ent` 的目录），放 `js/engine/chatter.js`、`js/engine/fovwatch.js`。引擎层根目录的平铺文件（`loadout.js`、`turret.js` …）排在 `engine/ai/`、`engine/entities/`、`engine/game/` **之前**加载，所以这两个文件**不许在加载时**引用 `AI` / `Ent` / `Game` / `Radio`（`Radio` 在 `ui` 层，更靠后），只在函数体内用。
> - 所有玩家可见文字走 `T('键')`，不写中文字面量（`text-census` 只许缩小）。

### 5.0 前置：把 `AI.update` 拆成三层

现在的 `update`（`js/engine/ai/brain.js`）把感知、决策、机动揉在一起，而且只有三个模式（`pursue / evade / extend`）。拆成：

1. **感知**：来袭导弹、RWR、目标列表、友军位置、弹药状态。
2. **决策**：输出一个 `plan = { mode, target, goal }`。模式扩充为 `pursue / evade / extend / standoff / closeIn / retreat / support / escort`。
3. **机动**：把现有的 `pursue()`、规避等变成可替换的"机动库"（`js/engine/ai/man-*.js`，平铺在 `ai/` 里，属 `AI` 命名空间：高位 / 低位 yo-yo、剪刀、桶滚、分离转弯、凹口机动…），每个机动是一个小文件，按位格与技能挑选。

模式切换点今天散在 `brain.js` 的 `update` 里（编号注释"1. 威胁规避优先级最高 / 2. 血量过低脱离 / 3. 选择目标 / 4. 分派行为"几段），要统一收进决策层，才能让新战术只加一个文件。

**现状**（对照当前代码）：
- **文件分工**：`brain.js` 的 `attach`（建 `a.ai`）与 `update`（含航线单位 `updateRoute` 分支、RWR 记录 `a.rwrT / a.rwrSrc`、`ewResist`、规避 / 脱离 / 选目标 / 分派行为 / 开火）；`tactics.js` 只有 `aiEnvelope`、`leadTo`、`pursue`、`evade`、`strafeTarget` 五个小函数（`strafeTarget` 目前是对地用，实际只有 `leadTo` 的薄包装）；`steer.js` 的 `steerTo`（期望方向 → 三轴杆量，玩家僚机与 AI 共用）；`util.js` 是索敌（`findIncoming`、`nearestEnemy`、`surfaceTargetFor`、`approachSurface`、`leadThreat`…）。公开接口只有 `AI.attach / update / steerTo / findIncoming / nearestEnemy / leadTo / strafeTarget`（`zz-api.js`）。
- 这个"机动库"目前**不存在**。`a.ai.mode` 只有 `'pursue' | 'evade' | 'extend'`；另有按 `role` 分的分支（`'drone'` 编队跟随、`'wingman'`、"目标是对面设施 → `approachSurface`"、无目标巡逻），它们不是 `mode`，都在 `update` 的"4. 分派行为"这条 `if / else if` 链里，输出 `{ desired, throttle, ab }`。
- **写入点**：航线单位在 `updateRoute` 里自己写 `a.ab = false`；战斗 AI 在 `update` 末尾**统一**写 `a.throttle = throttle; a.ab = ab`（这是战斗 AI 对加力的唯一写入点），`a.ctrl` 由 `steerTo` 写。
- **之后还要过三道覆盖**（都在 `update` 里、分派链之后，按这个顺序）：① `clampCeiling(a, desired)`（`brain.js` 内的私有函数，所有分支汇合后一次性钳升限）；② 垂直恢复 `s.vertRecover`（带记忆的开关：`a.fwd.y > 0.5 && desired.y < 0.3` 时进入，`a.fwd.y < 0.2` 才退出，期间直接覆盖 `ctrl.pitch / roll`）；③ 近地保护（`Ent.agl(a) < 420 && a.fwd.y < 0.05` → 机头拉到 `y = 0.5`、油门 1、加力开）。另外 `pursue()`（`tactics.js`）里还有一道"防纯垂直爬升"（`a.fwd.y > 0.82` 且速度低于 `1.5 × vStall` → 压头、加力）。任何会把机头拉得很陡或贴地飞的新机动（PSM、低空突防）**必须跳过**这三道覆盖，否则会被它们抵消。新增一个机动 = 在这条链里加一个 `else if` 分支并显式声明它跳过哪些覆盖。
- **`role: 'wingman'` 的分支是死代码，现在仍在**：`brain.js` 里还有三处读 `s.role === 'wingman'`（选目标时的 `focus / cover`、`nearestEnemy` 半径、编队 / 巡航分支），而全项目没有任何地方以 `role: 'wingman'` 创建 AI（`missions/_lib.js` 只创建 `'enemy'`、`'drone'`、`'support'`）。5.3 引入 `ally` 时一并清理；`util.js` 里 `leadThreat` 的注释还提到 wingman，同步改。
- **`AI.SKILL` 仍不存在**；技能魔数散在 `brain.js` 的 `update`（见 5.1）。

### 5.1 AI 飞行员技能值

- **位格 `rank`（枚举，已定）**：每个 NPC 飞机都标注 `rookie / pawn / elite / ace` 四者之一，表达它的位格。`rank` 是**枚举字段，不是标签**（不进 `Tags`）：值表 `RANKS` 放在 `js/data/rules.js`，实体上是 `a.rank`；来源优先级：`spawnEnemy({ rank })` 的实参 → 机型数据 `data/aircraft/<id>.js` 的默认 `rank`（如战略制空支援机默认 `elite`）→ 缺省 `pawn`。`probe-missions` 与 smoke 断言：每一关里生成的每架 NPC 飞机的 `rank` 都在 `RANKS` 里，缺失即报错（逼着每个新关、新单位写位格）。
- **把魔数提成参数表**（`AI.SKILL`，放 `js/engine/ai/` 下新文件，如 `skill.js`，经 `$.SKILL` 共享）：重选目标间隔（`brain.js` 选目标段的 `retargetT = 0.35 + (1 − skill) × 0.9`）、机炮锥（开火段的 `gunCone = 0.028 + (1 − skill) × 0.02`）、射击意愿 `0.35 + 0.45·skill` 与射击间隔 `shootT × (1.6 − 0.6·skill)`（开火段）、包线选择（`skill ≥ 0.6` 用 `env.nez`，否则 `env.rmax`）、抗电子战（`ewResist` 增长 `0.18 + 0.30·skill`）、**提前量折扣 0.85**（`tactics.js` 的 `leadTo`，现在与技能无关）。`Game` 侧另有一处读 `ai.skill`：`game/launch.js` 的 `vsSkill`（电子战对抗强度）——不改，只在 `AI.SKILL` 的说明里注明。
- 新增依赖技能的项：规避动作选择（低技能只会硬拉，高技能会按来袭导弹类型选凹口 / 桶滚 / 抛干扰弹时机）、汇合方式（低技能直接追尾，高技能利用 yo-yo 转入内侧）、被咬尾时的反应、干扰弹投放时机，以及导弹发射、机炮开火与干扰弹投放的反应延迟、机炮偏移（见「个体模型」里的「反应延迟与机炮偏移」）。
- **位格与技能值**：`rank` 给出缺省 `skill` 与行为门槛（起步）：`rookie` 0.35、`pawn` 0.55、`elite` 0.72、`ace` 0.9。`ai.skill`（0–1，保留为总量）缺省取自 `rank`，关卡 `spawnEnemy({ skill })` 仍可微调。**位格的默认技巧值不写死**：`elite` / `ace` 等只是缺省，任何单位都可以用 `spawnEnemy({ skill })` 或机型数据里的 `skill` 覆盖，覆盖后 `rank` 保持原值（呼号、专属无线电照旧）。新增只读派生项 `aggr`（攻击欲望）与 `flair`（动作花样）。`ace` 同时给呼号与专属无线电。原来各关写的 `skill` 数值（0.25–0.98）在批次 8 逐关映射到位格。
- **约束**：AI 始终通过 `AI.steerTo`（`steer.js`）驱动，受同样的控制权限限制，"更华丽"靠机动选择与时机，不靠开挂。
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
- **目标分配（轻量 Director）**：0.5 s 节拍的 `js/engine/ai/director.js`（**新建**，属 `AI` 命名空间，经 `$.director` 共享；由 `brain.js` 的 `update` 在选目标时调用，不另起主循环钩子），为每架 AI 选目标时对"已被他人盯着的目标"加惩罚，避免所有人扑同一架；并给出"环上扇区"，让外围游走的各机分布在不同方位。

### 5.3 非僚机友军的独立 AI

- 新角色 `ally`（现在 `role:'wingman'` 的分支是死代码——`brain.js` 里还留着三处，见 5.0——一并清理）：不跟随玩家，由 Director 分派**扇区**——选取敌方密集、且离玩家 ≥ 6 km 的区域；每 8–15 s 随机重评估（"随机应变"）。
- **不抢人头**：与玩家距离 < 3 km 时叠加排斥；对"玩家当前锁定且已进入包线"的目标不开火。
- 被攻击时可以呼救、也会被 Director 重分配去支援（这才是"让战场活起来"的基础）。
- 战果归入现有"友军击落"一行（`Game` 的 `killCredit`，`js/engine/game/finish.js`），不进综合评定。

### 5.4 撤离能力

**触发（状态变化触发 + 延迟判定，不按秒计算）**：

- **事件源**：只在状态**发生变化**时登记一次"待评估"，不做周期性概率判断。
  - 生命事件：每次受到伤害后。飞机的 hp 只有一个咽喉，`Ent.damage(ent, amt, world, source)`（`js/engine/entities/damage.js`：装甲减伤、减 hp、写 `lastHitBy`、必要时 `kill`），子弹、导弹爆炸（经 `Combat.blast → Ent.hitAny`）都走它；`js/ui/hudfx.js`（`HudFx`）现在仍是靠逐帧比较玩家 hp 检测受伤（再调 `noteDamage`），没有钩子。**在 `Ent.damage` 里登记事件**，事件走现有的 `world.events.push`（`hit`（`engine/combat.js`）、`intercept`（`entities/missile.js`）、`wingflare`（`ai/brain.js`）已用这个模式），由 `Game` 的 `combatEvents`（`js/engine/game/finish.js`，`engine/game/update.js` 每帧调用）消费并清空。注意 `combatEvents` 只认已知 `type`，新增的 `type`（如 `damaged`、`ammo`）要么在那里加分支，要么由 `Chatter` / 撤离评估器自己在同一帧读取后再清空——**别让它们在队列里无限堆积**。
  - 弹药事件：弹药消耗**分散在两个函数里**——机炮 `Ent.fireGun`（`entities/guns.js`，`a.gunAmmo -= n`）与导弹 / 炸弹 `Game` 的 `launch`（`js/engine/game/launch.js`，`actor.spAmmo -= nShot`，随后 `actor.ammoPool[actor.special] = actor.spAmmo` 回写）；干扰弹 `fireEcm`（同在 `game/launch.js`，`launch` 的 ecm 分支也会转进它）不计入。**这两处各加一行 `Ent.noteAmmoEvent(a)`**（新函数，放 `entities/damage.js` 或新文件 `entities/events.js`，并在 `entities/zz-api.js` 暴露），不做轮询。
  - 弹药状态读取：NPC 的弹药池是 `a.ammoPool = { 武器id: 数量 }` + `a.slotCd = { 武器id: [0 | SLOT_EMPTY…] }`（`buildNpcMounts`，`entities/mounts.js`，由 `makeAircraft`（`entities/aircraft.js`）调用），机炮是 `a.gunAmmo`；"除机炮外全空"需要遍历 `ammoPool` 且跳过 `ecm / dew / 吊舱`（`chooseWeapon`，`entities/mounts.js` 已有同样的过滤；吊舱现在以 `w.tags.passive` 判）。HUD 的 WINCHESTER 告警（`ui/hud/panels.js` 的 `drawAlerts`）只检查当前武器（`gunAmmo <= 0 && spAmmo <= 0`），不能直接拿来当"全空"。
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
| 无人僚机（`a.tags.unmanned`） | **不独立撤离**：继续跟长机；长机进入 `retreat` 时它们也跟着飞 |
| 带 `noRetreat` 标签（自杀式 / 任务绑定） | 不撤离 |
| `rank === 'ace'` | 概率 × 0.5；`elite` × 0.75（起步） |

- 一次判定为"否"之后不会自动重试；只有**新的状态变化事件**才会再次登记评估。所以不存在"每秒都在掷骰、迟早掷中"的累积效应，概率就是这一次的真实概率，调参也直观。
- **与 Chatter 的联动**：评估结果为"撤离"时触发 `rtb`；弹药首次跌到 25% 以下时触发 `bingoAmmo`（同样由弹药事件驱动，各只触发一次）。
- **标签**：`noRetreat` 在 `js/core/tags.js` 里 `Tags.declare('noRetreat', { owner: 'ai', doc: T('core.tags.doc_N') })`（`doc` 文本进 `locales/zh-CN/text/core/tags.json`），并至少被一个数据项用到（`smoke.js`「挂载系统」段会断言"声明了就必须有人用"）；机制代码读 `a.tags.noRetreat`。

**行为** `retreat`：目标航向 = 远离最近敌方质心、朝最近的**出界口**（有友方整备点则优先去整备点，见下）；被追击锁定时照常做规避（现有规避层优先），规避结束后恢复撤离航向（`goal` 输入 + 规避覆盖，而不是把规避并进去）。

**移除**：飞出 `Arena` 的真边界后，**写 `a.alive = false; a.retreated = true`**，沿用 `escaped` 的先例（`engine/route.js` 的航线离场就是写 `a.alive = false; a.escaped = true`；不计击毁、不进友军损失；`engine/game/finish.js` 与 `engine/turret.js` 都按 `escaped` 判）。

> **注意（需要处理的坑）**：现有 `win()`（各关卡 `js/missions/<id>.js`）里普遍用 `team===1 && alive` 计数，撤离的敌机会被当成"已清除"；而 `escaped` 还被用作"轰炸机飞完航线离场"的语义。所以：
> 1. 拆开两个字段：`a.leftBy = 'route' | 'retreat'`；
> 2. **关卡级开关** `mission.retreat = 'off' | 'on'`，**缺省 off**。批次 8 逐关审视后再打开；
> 3. 开着时，需要"击毁 N 架"的目标会被敌机撤离绕过——目标文案（`locales/zh-CN/text/missions/<id>.json`）与 `win()` 要对应（例如改成"击毁或击退"），否则不开；
> 4. Sim 增加"全员撤离"场景，断言每一关要么仍可完成、要么被明确标记为"撤离后算完成"。

**整备点撤离**：存在存活的友方整备点时，友方 AI 改去整备点；水平距离入界 → `Resupply.applyNpc`（`buildNpcMounts` 重建弹药池、`hp = maxHp`；机载的装填走 `Loadout`，`js/engine/loadout.js`）→ 切回 `pursue`。敌方同理（敌方单位的整备点可由关卡给，`resupply.team = 1`）。

### 5.5 Radio 2.0：显示时长与队列

**先于 `Chatter` 做**——台词变多之前，先让 Radio 扛得住。

现状（`js/ui/radio.js`）：FIFO，每条显示 5.6 s（`push` 里 `live.push({ node, t: 5.6 })`）、同时最多 4 条（超出会挤掉最老的）；**出队间隔不是固定 1.4 s，而是每条台词自己的 `gap` 字段，缺省 1.4，很多台词写的是 0.4–1.2**；没有优先级；`L.tx` 与 `L.who` 是 HTML（`innerHTML`，所以文本里带 `<b>` 之类标记）。`Radio` 是私有 `queue / timer / box / live` 的 IIFE（全局 `var Radio`，不是命名空间），导出 `{play, raw, update, clear}`；`update(dt)` 由 `js/engine/game/update.js` 的 `update(dt)` 每帧调用；所有调用点（`ui/input.js` 的 `setWingCmd` / `launchCall`、`game/finish.js` 的 `combatEvents`、`game/launch.js` 的 `fireEcm`、各关卡 `missions/<id>.js` 的 `radio.play`、`ai/brain.js` 的 `jamAuto` 经 `world.radio.raw`）签名不变。因为队列、gap、寿命都在这个 IIFE 内部，**优先级队列可以完全在它里面实现**，不影响调用方。`Radio.clear()` 在每次切换界面（`ui/screens/nav.js` 的 `show(id)`）和开局（`engine/game/mission-start.js`）时调用，清空队列与在显的行。**文本现在都是 `T('键')`**：任务台词在 `js/data/voices.js` 的 `VOICES`（`who / cls / gap` 是数据，`tx: T('data.voices.VOICES.m1.start.i0.tx')`，文本在 `locales/zh-CN/text/data/voices.json`）；引擎里直接 `Radio.raw` 的台词键在 `locales/zh-CN/text/engine/**`、`ui/**` 下（如 `engine.game.launch.fireEcm.tx`）。

1. **显示时间加长**：每条的存活时间随文字长度变化，`life = clamp(6 + 0.12 × 字数, 7, 14)` s（起步，替换固定 5.6 s）。字数按去掉 HTML 标记后的文本算。
2. **成熟的队列**：
   - 每条台词带 `pri`：`story`（剧情脚本，`VOICES` / 关卡 `radio.play` 的默认值）> `player`（玩家指令确认、玩家僚机）> `ally`（友军闲聊）> `chatter`（敌方 / 条件触发的杂项）。
   - **出队节奏**：两条新台词之间至少间隔 `gap = clamp(0.8 + 0.06 × 上一条字数, 1.2, 4)` s，所以**一秒内不会冒出多条**；上一条越长，下一条越晚出现，给玩家读完的时间。
   - **剧情台词不丢**：`story` 永不过期、永不被丢弃。被挤占时，它可以**插到队列里所有低优先级台词之前**，但不打断正在显示的那一条，所以最多延迟"当前这一句"的时间，不会被后面的杂项一直压着（上限由 `STORY_MAX_WAIT` 兜底，起步 4 s，超过则下一个出队的必定是它）。
   - **低优先级可过期**：在队里等待超过 `TTL`（`chatter` 3 s、`ally` 6 s、`player` 10 s）就丢弃，并按"同事件 + 同说话人"去重，避免同一件事被播报两遍。丢弃是**可见的计数**（暂停菜单的记录里仍保留，见下）。
   - 同一说话人的同类事件有冷却，沿用现有的 `CALL_CD` 思路（`ui/input.js` 的 `launchCall`，真实时间 3.0 s）。
3. **"信息不丢失"的兜底**：暂停菜单增加一个"无线电记录"页签，显示最近 30 条（含被丢弃的低优先级，标灰）。改动面：`locales/_html/overlays/pause.html`（现有 `data-ptab="main|settings|help"` 三个页签与 `pane-*` 面板，加一个 `data-ptab="radio"` 与 `pane-radio`）、`locales/zh-CN/text/html/pause.json`（新增 `tab_radio` 等键，用 `{{html.pause.tab_radio}}` 引用）、`js/ui/screens/pause.js`（页签切换与打开时渲染记录）、`Radio` 内部的环形日志（新增 `Radio.log()`）；改完跑 `node tools/build/gen-locales.js && node tools/build/gen-pages.js`。几行 DOM，不影响战斗。
4. **与 2.3 乱码的关系**：乱码在**出队、上屏的那一刻**施加（用当时的干扰度），不是入队时，这样排队等待期间干扰状态变了也正确。
5. **接口**：`Radio.play(missionId, evt)` / `Radio.raw(line)` 签名不变，`line.pri` 缺省为 `story`（`raw`）或 `ally`（`Chatter` 来源），旧代码零改动。
6. **验证**：smoke 里一次性入队 30 条混合优先级台词，断言：全部 `story` 按入队顺序出现且无一丢失；任意两条上屏间隔 ≥ `gap`；低优先级超过 `TTL` 被丢弃并记入记录；`story` 的最大等待 ≤ `STORY_MAX_WAIT + 当前一句剩余时间`。`Radio` 依赖 DOM，smoke 里跑要用现有的 DOM 桩（`tools/lib/sim.js`）或把队列逻辑抽成纯函数后单测（实现时定）。

### 5.5b 条件触发的无线电（`Chatter`）

新增 `js/engine/chatter.js`（独立全局模块 `Chatter`，加载顺序见本批开头）：事件 → 台词变体，带全局与分说话人的限频；产出的台词走 5.5 的队列（`pri:'ally' / 'chatter'`）。

| 事件 | 来源 | 例 |
|---|---|---|
| `bingoAmmo` | 非机炮弹药 < 25% | "弹药不多了" |
| `winchester` | 全空 | "弹药耗尽，脱离" |
| `rtb` | 进入 `retreat` | "我要撤了" / "损伤严重，退出战斗" |
| `rearmed` | NPC 整备完成 | "补给完毕，回去" |
| `splash` | 我方击杀（`combatEvents`） | "击中，目标下去了" |
| `damaged` | hp 跨越阈值 | "我被击中了" |
| `fox` | NPC 发射（含 Fox 1 / 2 / 3） | **概率触发、刻意稀少**：每次 NPC 发射以 `FOX_CALL_P`（起步 0.12）喊 `launchCall`，同说话人 `FOX_CALL_CD`（起步 20 s）内不重复，全场同时间窗内有上限。目的是烘托战场气氛，**不是向玩家报告**——所以它不保证对应真实威胁，也不带方位信息，走 `pri:'chatter'`（可过期、可被丢弃）。**钩子**：NPC 发射的唯一咽喉是 `world.fireMissile`（`js/engine/game/world.js` 的 `newWorld`，里面已有 `if (m && $.player && actor !== $.player) SFX.missileAt(...)`），AI（`ai/brain.js` 开火段）与航线单位 / 关卡投弹（`engine/route.js`、`missions/m8.js` 的 `onArrive`）都经过它；它返回导弹对象 `m`，可由 `m.w` 判出 Fox 1 / 2 / 3（`m.w.tags.sarh` → Fox 1，`m.w.seeker === 'radar'` → Fox 3，其余 Fox 2）。**舰船与炮塔（`engine/turret.js`）不经过它**，所以"NPC 发射"不含水面单位的发射。现有 `launchCall`（`js/ui/input.js`，`Game.$` 私有）只给玩家用，冷却是真实时间 `CALL_CD = 3.0`（`performance.now()`）、与导弹无关，NPC 需要新函数并按说话人各自计冷却 |
| `defensive` | 被锁 / 被打 | "有人咬着我" |

- 每种事件至少 3 个变体，按**阵营声线集**（上游 / 下游，`js/data/callsigns/`）与单位类别选择；说话人用单位的呼号（`label`）。
- **现状**：`Chatter` 模块与 `js/engine/chatter.js` **都还不存在**；代码里只有 `Radio.raw`、`world.radio.play` 与 `w.flags`。`VOICES.m1.playerHit`（`js/data/voices.js`）**无触发**（全项目没有任何地方 `Radio.play('m1', 'playerHit')`；`SFX.playerHit`（`engine/audio.js`）同样无调用点），是死数据。条件触发的无线电里目前只有玩家的 `launchCall`、僚机撒干扰弹（`wingflare`，限频 8 s）与友舰近防（`intercept`，8 s）；`fireEcm` 的一句台词（`game/launch.js`）也算，但那是开机应答，不是事件触发。
- 台词文本放 `locales/zh-CN/text/radio.json`（键 `radio.<事件>.variants`，叶子是字符串数组，用 `T.pick('radio.bingoAmmo.variants')` 随机挑）；失败台词放 `locales/zh-CN/text/fail.json`（`fail.*`）。新增语言只需新增同构目录，`check-locales.js` 校验键同构。

### 5.6 半主动雷达弹（Fox 1）

**设计要点**（照激光导引头现成模板写，`js/engine/entities/missile.js` 里 `w.seeker === 'laser'` 那一段，"弹每一帧都去问投放它的那架飞机"；该段休眠，没有武器用 `seeker:'laser'`）：

- **不新增 `seeker` 值**。保留 `seeker:'radar'`（现有 `seeker === 'radar'` 的判断点——AI 开火段、`brain.js` 的 RWR、`entities/warhead.js`、`ui/input.js` 的 `launchCall`、`ui/screens/hardpoints.js` 的分类等——全部不用改），加标签 `sarh`：`js/core/tags.js` 里 `Tags.declare('sarh', { owner: 'entities', doc: T('core.tags.doc_N') })`（文本进 `core/tags.json`），数据里 `tags: ['sarh']`，机制代码读 `w.tags.sarh`；同时更新 `docs/systems/tags.md` 的清单。
- **引导判定（仅限锁定时）**：半主动弹**只在发射机对该目标持有有效锁定时**才受引导——光把目标套进视场圈不够。每帧检查"发射机存活、`发射机.lockHeldOn === m.target`（见下）、发射机没有静默（`emcon`）"。通过则正常制导；不通过则 `m.illumLost = true`——导弹停止转向、沿当前航向飞，但**保留目标引用**，所以发射机**重新锁定同一目标后恢复引导**（激光导引头已经是这个行为）。
  - **"锁定成立"的判据**（直接复用现有锁定逻辑，不另写一份）：
    - **玩家发射机**：`p.target === m.target` 且 `p.locked` **且当前武器 `p.special` 就是这枚弹的武器 id**（`Game` 的 `updateLock`，`js/engine/game/lock.js`）。**切换武器算作丢锁**（已定）：只有当前武器本身是该半主动弹、并且完成了锁定，才能保持引导——发射后切去 SRM / 机炮，旧弹立刻丢照射；切回同一种半主动弹后需要重走锁定进度（`lockProgress ≥ 1`）才恢复。`updateLock` 里 `locked` 在这些条件**全部**成立时为真：`Ent.jamState(p, t) === 'clear'`（否则直接清 `p.target`）、武器与目标类别匹配（`targetMismatch`）、`dist < lockDist`（已含 `emcon` 减半、`jamLockK`、目标 `lockResist`、干扰机 `ewPower` 的折减）、目标在锁定锥内（`lockInCone`，圈 = `p.lockCone`，高空 × 0.78）、且 `lockProgress ≥ 1`。**任一条件不成立当帧 `locked` 立刻置假**，`lockProgress` 再以 2.2/s 衰减，所以丢锁后重新锁定要重走进度（雷达档约 1.1 s 满，从衰减后的值起算）。因此玩家**不能在发射后切目标 / 按 Tab 走**而保持引导：`p.target` 一变，旧弹的 `lockHeldOn` 立刻不等于其目标。
    - **AI 发射机**：`ai.target === m.target`，且当帧满足该 AI 的开火 / 锁定条件——`Ent.jamState(a, t) === 'clear'` 与 `Ent.jamLockOK(a, t)`、`Ent.lockOff(a, t, spW) < lockCone × 0.85`（`brain.js` 开火段的 `okAng`，AI 开火门限）、`dist < Ent.aiReach(…) × lockK × resist × jamK`（`okDist`）、未 `emcon`。AI 没有锁定进度条，所以条件成立即视为锁定。**照射保持用比开火略宽的迟滞**（进圈 0.85、出圈 1.0 倍锥，由 `FovWatch` 的 `hyst` 提供），避免在边界上抖动。
  - **统一出口**：每个射手有一个字段 `lockHeldOn`（目标引用或 `null`）：玩家由 `updateLock` 在每次判定末尾写（`locked && 当前武器是半主动弹 ? p.target : null`，同时记下是哪种武器）；AI 由 `brain.js` 的 `update` 在开火判定处写。`missile.js` 的半主动分支只读 `m.owner.lockHeldOn === m.target`，**不去重算锥与距离**。
  - **丢锁的原因一览**（全部落到同一个 `illumLost`）：目标出锥、被地形 / 目标自身遮挡（批次 9 的 LOS）、被压制出 `clear`（`jamState` 变 `flicker / hidden`）、发射机 `emcon` 或死亡、**切换目标**、**切换武器**（当前武器不再是该弹的武器）。
- **锁定事件驱动（`FovWatch`）**：见下方"视场与锁定事件化"一节；这里的"每帧检查"替换为订阅 `onLock / onLockLost`。
- **宽限**：丢照射超过 `illumGrace`（起步 2.5 s）后永久失去引导，转 `target = null`，与现有导引头丢失处理对齐。宽限内重新锁定同一目标则清零计时、恢复引导。
- **起爆**：近炸判据已经要求 `t && m.seekerOn`（`entities/missile.js`），保持。
- **箔条**：沿用雷达弹的 `flareRD`（`data/weapons/<id>.js` 的 `flareRD` 字段）。被压制时发射机的锁定距离本来就会按 `jamLockK` 缩小（上面判据已包含），不再另外"缩有效圈"。
- **无线电**：`launchCall`（`js/ui/input.js`）是硬编码 if 链，改成按标签：`w.tags.sarh → "Fox 1"`（放在 `seeker === 'radar'` 判断**之前**），现有 `radar → "Fox 3"`、其余 `"Fox 2"` 保持；"Fox 1"字样走 `T()` 键。
- **HUD**：泛化 `drawLaserStatus`（`js/ui/hud/targeting.js`；它每帧都被 `hud/base.js` 的 `draw` 调用，只是激光分支没有武器触发，所以"休眠"），或抽成 `drawIllumStatus`，显示"照射保持 / ✕ 照射中断（x.x s）"——**"照射保持" = 自己的半主动弹在途且 `lockHeldOn === m.target`，"✕ 照射中断" = `m.illumLost`，括号里是剩余宽限**；`drawConeCue`（同在 `hud/targeting.js`）的圈在有半主动弹在途时：**锁定中（`lockHeldOn` 成立）画实线醒目色，丢锁时退回虚线**（不再按"目标在圈里"判）。文案进 `locales/zh-CN/text/ui/hud/targeting.json`。
- **对手视角**：发射机持续锁定，被打的一方 RWR 持续显示"尖峰"（现有逻辑是 `brain.js` 的 `update` 开头：把 `target === a` 且持有 `seeker:'radar'` 武器的射手当作照射源，写 `a.rwrT / a.rwrSrc`；玩家射手要 `locked` 才算，AI 之间选中即算，`silentLock` / `emcon` 不告警）；加一条"导弹引导中"的更高级告警（`ui/hud/panels.js` 的 `ALERT_ORDER` 在 `'missile'` 之前插一个 id）。**该告警按"锁定中"判**：存在 `m.w.tags.sarh` 的在途弹 `m.target === 受害者 && !m.illumLost`（即其发射机此刻仍持锁）；丢锁（`illumLost`）后告警降级回普通 `missile`。**反制玩法**：打掉 / 迫使对方转向脱离锁定锥、凹口机动、压制对方出 `clear`，或逼它切目标。
- **数值（起步）**：射程比 `mrm`（CLA-4）远约 20%、速度同级、`dmg` +10%、`ammo` +50%、冷却更短——便宜好用，代价是引导依赖。名称沿用 CLA 词根，编号在落地时给出 2–3 个候选评审（占位 `CLA-?`）。数据放 `js/data/weapons/<id>.js`，文本放 `locales/zh-CN/text/weapons/<id>.json`，并在资料库与单位详情页的"机制标签"行里出现。

**视场与锁定事件化（`FovWatch`，`js/engine/fovwatch.js`，独立全局模块）**

问题：现在所有"目标是否在某个锥 / 圈内"的判断都是每帧、每对（观察者, 目标）重新算角度。问：能不能改成"进框 / 出框时广播事件"，别的逻辑订阅？

**诚实的答案**：**能统一，也能事件化，但不是免费的**——要知道"什么时候越过了边界"，仍然得算角度。事件化真正省下的是两样东西：（1）下游逻辑不再每帧读标志、不再自己维护"持续了多久"的计时；（2）通过**保守调度**让远离边界的观察对少算：

```
FovWatch.watch({ observer, target, cone, hyst, onEnter, onExit, owner })   // 订阅（锥 / LOS 的进出）
FovWatch.lock(observer, target) / FovWatch.unlock(observer, target)         // 锁定状态翻转时由锁定逻辑调用，广播 onLock / onLockLost
// 每次检查：margin = |angle − cone|（离边界还有多少弧度）
// 下次检查时间 = now + margin / ω_max           ← ω_max：两者几何允许的最大角速度上界
// 距离近、角速度上界大时 ω_max 大 → margin/ω_max 很小 → 自然退化成每帧检查
```

- **分工（本节的关键）**：`FovWatch` 负责**锥 / 视线（LOS）的进出判定**，它只回答"几何上进没进"；**"锁定"仍由现有锁定逻辑决定**（`Game` 的 `updateLock`、AI 开火段的 `okDist / okAng / jamState / jamLockOK`），它们把 `FovWatch` 的进出事件当作**输入之一**，与距离、压制、`emcon`、目标一致综合后，**只在锁定状态翻转的那一刻**调 `FovWatch.lock / unlock`。下游（半主动弹、HUD、AI）订阅的是 `onLock / onLockLost`，不是 `onEnter / onExit`——光进圈不会产生"锁定"。
- **正确性来源**：`ω_max` 取上界（`(|v_obs| + |v_tgt|) / dist` 的保守估计，加转向角速度上限），所以在下次检查之前**不可能**越过边界，事件不会漏。
- **迟滞**：`hyst`（进框阈值略小于出框阈值）防止在边界上来回抖动连发事件；也替代了现有各处手写的 `lostTime` 累加（"出框后 0.5 s 才算丢"变成"出框 → 锁定丢失事件 → 启动宽限计时 → 重新锁定事件 → 取消计时"）。
- **事件广播**：同一对（观察者, 目标, 圈）可以被多个订阅者复用，不重复计算。

**适合统一进来的判断**（调查已列出）：

| 判断 | 现状 | 改后 |
|---|---|---|
| 半主动弹的照射保持 / 中断（本节） | 每帧 | `onLockLost → 开始宽限`、`onLock → 重新获得引导`（订阅锁定状态，**不是**视场进出） |
| 玩家的锁定圈（`drawConeCue` 的圈、`updateLock` 里的 `lockInCone`） | 每帧 | 锥进出由 `FovWatch` 提供给 `updateLock`；`onLock / onLockLost` 驱动 HUD 色彩（实线 / 虚线）与 IN RNG 状态，圈的绘制本身仍每帧（投影必须每帧算） |
| AI 开火门限 `Ent.lockOff(a, t, spW) < lockCone × 0.85`（`brain.js` 开火段） | 每次开火判断 | 锥进出由 `FovWatch` 提供；开火时读锁定事件维护的 `lockHeldOn` 标志 |
| 激光导引头 `LASER_CONE`（`entities/physics.js`，休眠） | 每帧 | 同上 |
| 导弹导引头的视场 `fov`（`entities/missile.js`） | 每帧，且**同一个角度还要用来制导** | **不改**：导弹每帧本来就要算 `off` 来转向，事件化省不了任何计算，只会多一层间接 |
| 被地形遮挡的 LOS（批次 9） | 新建 | **直接用同一个调度器**：LOS 检查本身贵，保守调度（视线余量 / 最大相对速度）收益更大；LOS 丢失同样会让锁定丢失 |
| 近炸、碰撞、距离类判定 | 每帧 | 不是视场，不在此列 |

**预期收益（量级判断）**：实体不过数十个，单次角度判断只是几次点乘，所以**不指望 CPU 大幅下降**；真正的收益是逻辑集中（一处定义迟滞与宽限，不再每个功能各写一份 `lostTime`）、行为一致（HUD 与 AI 看到同一个锁定事件）、以及给批次 9 的 LOS 提供现成的调度器。**建议先只接入半主动照射、玩家锁定圈、AI 开火门限**这三处，导弹自身的导引头保持原样。

- **验证**：`tools/test/probes/probe-fovwatch.js`（Sim）：随机运动的观察对，比较"每帧暴力检查"与"保守调度"的事件序列——**必须逐事件一致**（时间误差 ≤ 1 帧）；统计调度后的实际检查次数相对每帧检查的比例。smoke 断言迟滞下事件不抖动。
- **新探针** `tools/test/probes/probe-sarh.js`（Sim）：目标分别不机动 / 机动 / 发射机转弯 / 发射机被压制，**加上"发射后切目标"（断言旧弹在切换当帧 `illumLost`，宽限满后永久失去引导）与"发射后丢锁又重锁"（断言宽限内重新锁定同一目标后恢复引导、超出宽限则不恢复）**，统计命中率与"丢照射"比例；与 `mrm` 对比。

**AI 使用**（本批一起做，否则 NPC 的 `npcFits` 要留空）：

- `ai.illum = { missile, until }`（状态机，在 `brain.js` 的 `update` 里维护）：自己有半主动弹在途且目标有效、**当前持有锁定**（`lockHeldOn === ai.target`）时，**持续照射**——**锁定目标**（抑制重选目标 `retargetT`）、保持目标在锥内（纯追击即可）、抑制转身规避——除非来袭导弹 < 2.5 km（自保，按技能有概率提前放弃）。**切目标 / 丢锁 → 丢照射**：`ai.illum` 转入宽限态（保留 `missile`，`until = now + illumGrace`），宽限内重新锁定同一目标则回到持续照射，否则释放；`retargetT` 抑制在宽限内同样有效（给它一次重新对准的机会，而不是立刻换目标）。导弹命中 / 失效后释放。
- 高技能 AI 会在锁定后做"偏置转向"（保持锁定同时拉开）。
- 之后给部分上游战机 / 下游预警配半主动弹；`npcFits`（`data/aircraft/<id>.js` 的 NPC 挂载表，经 `buildNpcMounts` 展开）逐一审视。

### 5.7 其它 AI 强化

**原有提案**（保留）：

| 提案 | 说明 | 建议 |
|---|---|---|
| 僚机协同战术（敌方成对） | 一前一后 / 分左右夹击；一架被咬尾时另一架转来解围 | 做（与目标分配同一套） |
| 按来袭导弹类型选防御 | 雷达弹 → 凹口 + 箔条；红外 → 热焰弹 + 硬拉；半主动 → **打断锁定**（切换目标、迫使其脱锥 / 脱 `clear`） | 做（高技能才会） |
| 能量管理 | 不让速度掉出角速度最佳区间；上升 / 下降 yo-yo 换位置 | 做 |
| 感知限制（P5） | AI 目前全知；加探测锥与丢踪延迟 | 以下"态势记忆"是它的轻量版，先做那个 |
| 地形利用 | 配合批次 9：AI 沿山谷遮蔽接近 | 放批次 9 |
| 对舰 / 对地协同 | 多机分批攻击、俯冲角择优 | 可选 |

**新增项**：

#### 战术行为

- **诱饵与侧击**：敌方成对时，高技能的一架（诱饵）正面吸引玩家的注意与导弹，另一架绕到侧后方切入。决策层加 `bait / flank` 两个子角色，由 Director 在成对单位里分配；只在 `skill ≥ 0.6` 的成对单位上启用。诱饵受到威胁（来袭导弹、被锁）时立即放弃角色转入规避，保证它不是自杀。
- **低空突防**：对舰 / 对地攻击机（`caps:'strike'`）在距目标防空圈（舰船 / SAM 的 `interceptRange`）外保持贴海面（`agl` 起步 60 m），进入发射包线前才爬升投射，投射后立即回到低空脱离。与批次 9 的地形遮挡配合：有地形时优先沿山谷。验证：对舰攻击机在有 SAM 的关卡里被击落的时间点分布，应从"接近途中"后移到"爬升瞬间"。**注意跳过 5.0 的近地保护与升限覆盖。**
- **撤向防空伞**：`retreat` 的目标不再只有"出界口 / 整备点"，增加第三个候选——**己方防空伞**（我方舰船 / SAM 站的 `interceptRange` 内、且比追击者更靠近它）。被追击且存在这样的位置时，优先撤向它，把玩家引进火力网。玩家侧的反制是看"对手是否正朝己方 SAM 飞"。
- **假撤退诱敌**：`ace` / `elite` 位格（或高技能）单位在 hp 尚可时有小概率（`FAKE_RETREAT_P`，起步 0.08，按"状态变化触发"的同一套延迟判定）进入伪装撤离：沿撤离航向飞 8–15 s，拉开与玩家的距离，若玩家追来则急转回头迎击（带一次先机发射）。与真撤离共用 `retreat` 状态，只是多一个 `fake:true` 标志与一个"回头"出口。真 / 假撤离在玩家眼里不可区分，**这是卖点**。因此 `mission.retreat='off'` 的关卡里假撤退同样可用——它不移除单位。

- **高技巧 AI 的加力使用**：
  - **现状**：加力不只在 `pursue()` 里——`a.ab` 的写入点：战斗 AI 统一在 `brain.js` 的 `update` 末尾 `a.ab = ab`，`ab` 的来源有：`tactics.js` 的 `pursue()`（`dist > 2600` 开；`dist < 800` 油门 0.55；另有"`fwd.y > 0.82` 且速度 < `1.5 × vStall` 强制开"）、`tactics.js` 的 `evade()`（油门恒 1，`ab = dist < 2600`）、`brain.js` 的 `extend` 分支（恒开）、无人僚机编队跟随（`role === 'drone'` 分支，`ab = vWant > 0.98 × vMil`）、（死代码）`wingman` 分支（`ab = dist to slot > 900`）、近地保护（`agl < 420`，油门 1 加力）；航线单位在 `updateRoute` 里 `a.ab = false`。**技能值完全不参与油门与加力**；`skill` 现在只在 `brain.js` 的 `update` 里使用：抗电子战（`ewResist`）、重选目标间隔、机炮锥、包线选择（`skill ≥ 0.6`）、射击意愿与间隔，外加 `game/launch.js` 的 `vsSkill`（电子战对抗）。任务里敌机技能从 0.25 到 0.98 都有，所以 `ace ≥ 0.75` 只会命中少数单位。
  - **没有燃油，也没有加力燃油**（`js/engine/entities/` 里搜不到），所以**不引入燃油与 `AB_FUEL`**：用"能量门限 + 冷却"限制加力，不做油耗模型。
  - **改为按战术用途决定**（各用途的触发都走 5.4 的状态变化 + 延迟判定，不逐帧）：
    - **拉开距离 / 摆脱**：被导弹锁定或被咬尾、能量尚可时，`ace` / `elite` 位格开加力拉开，并在导弹 TTI 足够时作为 5.8 的 PSM 之外的第一选择；
    - **切入 / 收敛**：攻击前从远距向目标收敛时，在能量高于角点速度时开加力，到达开火包线前收回；
    - **回头反击**：假撤退回头迎击时短时加力，缩短回转的时间窗；
    - **保能量**：狗斗中能量低于 `AB_MIN_E`（角点能量附近）立即停止加力，避免把自己拖进失速。`AB_MIN_E` 的"能量"是 3.3 里新增的 `E = ½v² + g·h`。
  - **红外代价（现成的机制，可直接用）**：`irSignature(e)`（`entities/missile.js`）= `(ab ? 3.0 : 1.0) × (0.4 + throttle) × (0.6 + hp/300)`，**目前只用于红外导弹的目标选择**（`irAcquire`，同文件，按 `irSig × (1 − off/cone) / (1 + d/1500)` 打分；smoke 里有"远处的热目标压过近处的冷目标"的断言），**并不改变锁定距离**。所以"开加力会被红外弹优先咬上"已经成立：`ace` AI 在**有红外导弹威胁**时应当**避免**开加力，这是一个自然的反向约束，直接写进规则里。
  - 低技能 AI 保持原有行为（只在远距追击开）；半主动照射期间（`ai.illum` 持续照射态）不主动加力，避免把目标甩出锥而丢锁；PSM 期间加力只改推力系数（`PSM_THRUST_K`），不另开。
  - **玩家可读**：AI 开加力时的**尾焰已经存在**（`entities/particles.js` / `entities/aircraft.js` 的尾焰发射，对任何 `a.ab` 的实体生效；加力音走 `SFX.nearby(..., !!nBest.ab)`，`engine/game/update.js`）。**RWR 上没有"加力"标记**（`ui/hud/radar.js` 的 RWR 绘制），"RWR 旁的加力标记"需要**新增 HUD 代码**（加力标记本身是玩家可见文字 / 图标，文案走 `T()`）。
  - **不能破坏的断言**：`smoke.js`「干扰与机动」段里的"轰炸机 AI 不得使用加力 / 不自己选目标"（`bmb.ab` 必须为假）。
  - **验证**：新增 `tools/test/probes/probe-ab.js`（Sim）：ace 与普通 AI 在同一场景下的加力时长占比与能量曲线；断言普通 AI 的"切入"类加力为 0；`ace` 的加力在导弹威胁时段显著高于其它时段，但在红外导弹威胁时段显著低；能量低于门限时加力不触发。

#### 个体模型

- **过载与体能差异**：每个机型有 `gLimit`（持续过载上限）；**有人机**持续高 G 超过 `G_SUSTAIN` 秒（起步 6 s，按技能 / 性格浮动）会进入"视野变窄"状态，机动被迫放缓 1–2 s；**无人机（`a.tags.unmanned`）无此限制**，其 `gLimit` 与结构上限一致，可以做有人机做不到的急转。对玩家的无人僚机与敌方无人机都生效。HUD 对玩家自己同步（可选：灰视 / 红视边缘暗角）。
- **飞行员性格**：新字段 `temperament ∈ { aggressive, cautious, sniper, loyal }`，与 `skill` 正交，在 `AI.SKILL` 参数表里各自给一组偏移：
  - `aggressive`：脱离阈值低、开火意愿高、贴近狗斗；
  - `cautious`：优先外围游走、被锁就规避、撤离概率 ×1.3；
  - `sniper`：偏爱远程弹，开火前宁可多绕一圈拿到更好的包线；
  - `loyal`（僚机 / 护航）：不离开长机 / 被护卫者超过 `R_leash`。
  关卡 `spawnEnemy({ temperament })` 可指定，缺省按 `skill` 与机型随机抽。呼号台词可按性格选变体（Chatter）。
- **人为失误模型**：低技能飞行员有概率性失误——**超调**（转向修正过头）、**丢目标**（被晃出视线后多花 0.5–2 s 才重新找到）、**误判来袭导弹**（晚发现 / 选错规避）。失误率随技能单调递减，王牌几乎为零。失误**一律走"状态变化触发 + 延迟判定"的同一套事件机制**，不逐帧掷骰。

#### 反应延迟与机炮偏移

低技能飞行员不是"一进门限就开火"，而是要花时间反应，机炮也瞄不准。两件事都按技能连续取值，不是开关。

- **反应延迟**：`reactT(skill) = REACT_MIN + (1 − skill) × (REACT_MAX − REACT_MIN)`，起步 `REACT_MIN = 0.2 s`、`REACT_MAX = 1.6 s`。四档位格的大致值：`rookie` 0.35 约 1.1 s，`pawn` 0.55 约 0.8 s，`elite` 0.72 约 0.5 s，`ace` 0.9 约 0.3 s。常数放 `AI.SKILL` 参数表（`js/engine/ai/skill.js`）。作用于三处：
  - **导弹发射**（`brain.js` 开火段）：锁定条件成立（`okDist && okAng && envOK`）后开始计时，到 `reactT` 才允许调 `world.fireMissile`。**持续式**：任一条件不成立即清零重计。原有的 `shootT` 冷却在 `reactT` 之后照常生效。
  - **机炮开火**（`brain.js` 机炮段）：瞄准门限（`off < gunCone × 3.2`，即 `a.firingGun` 的判据）成立后开始计时，到 `reactT` 才真正开火；离开门限即清零。也是**持续式**。
  - **干扰弹投放**（`brain.js` 的 `evade` 分支）：导弹进入威胁状态（`s.msl`）时**登记一次**，到 `reactT` 才起第一组连放；之后按 `warhead.js` 的 `breakLock` 与 `flareCd`（0.45 s）的节奏不变。登记与判定方式同 5.4：威胁未消失前不重复登记。
  - **换目标**（`brain.js` 选目标段）：当前目标消失、死亡或被甩出锁定锥（`FovWatch` 的 `onLockLost`）时**登记一次**，到 `reactT` 才允许重选。原有的 `retargetT = 0.35 + (1 − skill) × 0.9` 由这一条替代，魔数收进 `AI.SKILL`。`retargetT` 本身仍作为两次重选之间的最小间隔保留。
  - **护航拦截**（`escort` 角色，5.7）：护航机发现威胁接近被护卫者时**登记一次**，到 `reactT` 才转去拦截；在此之前仍按原航线护航。低技能护航因此会晚一步出手，给威胁留出突入的机会。
- **瞄准偏移的计算（Ornstein–Uhlenbeck 漂移）**：每架 AI 持有准星偏移 `a.aimOff = { x, y }`（相对目标视线的两个分量，单位弧度），由 `brain.js` 每帧按下式推进，而不是定时重抽：
  - 更新式：`off ← off · e^(−dt/τ) + σ · √(1 − e^(−2dt/τ)) · z`，`z` 为标准正态样本（`x`、`y` 各一个，取自现有的 Box–Muller `gauss()`，`entities/guns.js`）。
  - 稳态标准差恒为 `σ`，所以偏移在 0 附近**连续游走**，既会长时间偏在一边，也会随机经过正中心。这正是"靠运气"的来源：低技能 AI 的准星不是"永远偏"，而是在 0 附近漂来漂去，偶尔经过目标。
  - 参数：`τ = AIM_TAU`，起步 1.5 s（决定漂移快慢：τ 大则一串子弹整体偏向一边，τ 小则每发都像新的骰子）。`σ = AIM_JITTER × (1 − skill)`，起步 `AIM_JITTER = 0.06 rad`。`ace`（0.9）σ ≈ 0.006 rad，`rookie`（0.35）σ ≈ 0.039 rad。
  - **命中概率的量级校核**（写进验证）：目标在距离 `D` 处的半宽 `R_t`，命中需 `|off| < R_t / D`（小角）。以 `R_t = 10 m`、`D = 1000 m` 为例，即 0.01 rad。`rookie` 每轴落入的稳态概率约 `P(|z| < 0.01 / 0.039) ≈ 20%`，两轴同时约 4%；`ace` 约 90%。随机抽样时刻，所以低技能在某些窗口里真能打中。`R_t / D` 随距离变化，近距离更容易中，这也是合理的。
  - 实际开火时刻不另外挑窗口：子弹直接取开火瞬间的 `aimOff`，运气由漂移本身给出。
- **偏移的重置（触发时机）**：偏移不是一直连续，只在以下时刻**重新从稳态分布抽一个新值**（`off = σ · z`，即不走漂移）：
  - 切换目标（`s.target` 变化）：新目标是新的一局。
  - 开始一串新的射击（`a.firingGun` 由假变真）：每一串子弹都是新的一次掷骰，不会因为上一串偏了就一直偏。
  - 复位后仍按 OU 漂移，不额外加"发抖"。
  - 没有目标或目标死亡时，偏移衰减回 0（`off ← off · e^(−dt/τ)`，不再注入噪声）。
  - **与门限的关系**：开火门限 `gunCone` 仍按真实视线角判定（不含偏移），偏移只决定子弹去向。所以低技能 AI 会频繁"进门限却打偏"，偶尔"进门限且打中"，而不是门限本身就失效。
  - **作用于准星（瞄准点）**：AI 机头由 `AI.steerTo` 驱动去对准瞄准点；瞄准点取 `leadTo`（`tactics.js`）算出的提前量点再加上 `a.aimOff`。于是 AI 机头稳定地指向偏掉的位置，子弹跟着打偏。机炮本身的散布（`Ent.fireGun`）不改。
  - **与 `gunCone` 分开**：`gunCone` 只决定何时开火（门限），偏移只决定命中。门限不随偏移变宽，避免"偏得越厉害开火越频繁"。
  - 只作用于 AI 机炮的瞄准，不作用于导弹与玩家。
- **扫射（"气氛组"）模式**：机炮门限之外的第二条开火通路，让低技能 AI 即使没有瞄准好，也会在目标附近持续开火。
  - **定义**：
    - 机头误差 `e`：机头方向与目标视线的夹角（弧度），即准星离目标的角距离。
    - 当前偏移量 `r = |a.aimOff|`：此刻偏移点散布的半径（同样是角距离）。
    - 扫射条件：`e ≤ r`，即准星落在当前偏移点的散布圈之内，弹流能覆盖目标。
  - **效果**：扫射条件成立时，**忽略 `gunCone` 门限**，继续开火。准星因目标机动而离开原瞄准点也没关系，只要仍在散布圈内就继续打。
  - **为什么"几乎总是成立"**：机头由 `AI.steerTo` 驱动去对准"提前量点 + `aimOff`"，稳态下 `e ≈ r`。所以扫射只在机头**跟不上**时才会触发：目标急转、准星漂远（`e` 增大到超过 `r`）时停止。这正是"离开了本来想瞄准的地方"的含义。
  - **滞回**：进入扫射用 `e ≤ r`，退出用 `e > r × 1.3`，避免在边界上来回抖动。
  - **反应延迟**：扫射是在已经交战之后的状态，不重复套用 `reactT`；但扫射中断后再进入，需要重新满足 `reactT`（与普通开火一致）。
  - **与偏移重置的关系**：切换目标或开始新一串射击时，`aimOff` 重抽，`r` 随之变化，扫射条件重新判定。
  - **只作用于 AI 机炮**，导弹与玩家不受影响。
  - **待确认**：本条按"机头误差 `e` 对比散布半径 `r`"实现。如果"准星"指的是别的量（例如锁定圈半径或 HUD 准星本身），需要改定义；请在评审时确认。
- **现状**：`brain.js` 的开火段（`gunCone` 与 `a.firingGun`）**无延迟、无偏移、无扫射**；`Ent.fireGun`（`js/engine/entities/guns.js`）只有炮口散布（`w.spread` 的高斯，属机炮本身，本批不动）；AI 的瞄准点没有偏移，`leadTo`（`tactics.js`）算的是准确提前量。导弹与干扰弹的开火是即时的，见 `brain.js` 的 `evade` 分支与 `s.shootT` 段。

#### 编队与协同

- **护航逻辑**：新角色 `escort`（敌我皆可）：绑定一个被护卫者（`ai.ward`，可以是轰炸机、运输机、预警机或整支编队），在其周围 `R_escort` 内活动；威胁（玩家或其导弹）接近被护卫者时，护航机**优先拦截威胁**而非各自缠斗；被护卫者被击毁后转入普通追击。`loyal` 性格天然适合。拦截前的反应延迟见「反应延迟与机炮偏移」小节。**现状**：`escort` 现在只是一个**布尔标志**（`missions/_lib.js` 的 `spawnEnemy`：`if (o.escort) a.ai.escort = true`，只有 m1 的敌方 VAC-14 用到），**读它的只有 `missions/m1.js` 的 `tick` 与 `win`**（用来把护航机排除出"击毁目标"的计数）；`js/engine/ai/` 里**没有任何行为**读它。所以这不是"合并既有逻辑"，而是**从零设计**角色；同时要保留这个标志对 m1 目标计数的语义。
- **巡航队形与解散**：AI 机群出生时按队形（楔形 / 梯队 / 纵队，由 `formation` 字段指定）飞行，队形由领队 + 槽位生成（**目前只有无人僚机的槽位代码**：`missions/_lib.js` 给无人僚机传 `formation: { dx, dy, dz }`，`attach` 存进 `a.ai.formation`，`brain.js` 的 `role === 'drone'` 分支按它相对长机的 `right / fwd` 轴算槽位；楔形 / 梯队 / 纵队的队形模式和 `R_engage` 解散判据都**不存在**，需要新写）；进入交战判据（目标在 `R_engage` 内或被锁）后整队**解散**成各自的战术角色（5.2 的外围游走等）。视觉上更有军队感，也能帮玩家一眼数出编队规模。
- **电子战协同**：
  - 干扰机 AI（`lodestone` 等带 `ewfield` 的单位）主动靠近己方编队，进入"护航 + 开机"模式；被玩家反制（干扰机被锁定 / 被导弹追踪）时脱离。
  - 被压制的普通 AI（`suppressed` 持续 > 阈值）会**主动脱离干扰区**（朝远离干扰源的方向拉开直到 `suppressed` 下降），而不是在场内"瞎眼"打转；这让玩家的干扰既有压制效果也有驱赶效果。（被压制出 `clear` 同时会让对方的半主动照射丢失，见 5.6。）
  - 双向：敌方干扰机对玩家同理，玩家被压制时 HUD 已有 JAMMED 提示（2.3 / 2.3b）。
- **友军呼救（不做玩家指令）**：**玩家不能向非僚机队友下命令**（玩家只有 `ui/input.js` 的 `setWingCmd` 三档僚机指令）。所以只做反向：友军被缠住（被咬尾、被锁、hp 低于阈值）时，**用 `Chatter` 的 `defensive` 事件呼救**（"有人咬着我，请求支援"，带方位），并向 Director 登记"求援"，Director 把附近**无任务的友军**重分配过去（5.3 的扇区机制）；玩家听到后可以自己决定要不要去，没有任何命令界面。呼救有冷却与优先级（`pri:'ally'`）。

#### 导演与系统

- **态势记忆（最后已知位置）**：AI 目前全知。轻量版：AI 在目标离开其探测锥（用现成的 `lockCone` 与距离）或被箔条 / 干扰 / 机动甩开后，**不再知道目标当前位置**，而是向 `lastKnown`（位置 + 速度外推，随时间衰减）飞去搜索，`T_search`（起步 6 s）内重新进入探测锥则重获；超时则转向其它目标 / 外围游走。有预警机支援（友方 AEWC 存活，`engine/game/lock.js` 的 `updateAewc`）时延长记忆。这样玩家的"甩开"与"静默"才有意义；改动面只在 `AI` 的感知层和目标列表，不需要新建完整探测系统。（由 `FovWatch` 的进出事件驱动"丢失 / 重获"，不加每帧逻辑。）
- **战场环境事件**：关卡级的低频随机事件，由 `mission.ambient = [{ type, p, cooldown }]` 声明：友军遇袭求援信号、增援编队抵达（可以是我方也可以是敌方）、受损残机返航（贴着边界低速离场，不计击毁）、远处舰队交火的闪光 / 烟柱 / 无线电。事件本身用现有的 spawn 与 Chatter 拼出，不新增机制；全部在 `locales/` 里写台词。默认关，批次 8 逐关选用。**现状**：代码里没有任何 `ambient` / 随机事件逻辑，`Chatter` 也还不存在；能用的构件只有 `mission.tick`、`w.flags` 一次性标志、`Radio.raw` 与 `missions/m8.js` 的 `m8Wave2` 式中途生成。
- **AI 调试可视化**（仅开发）：`?debug=ai` 时 HUD 叠加每架 AI 的 `mode`、目标、扇区、撤离 / 评估计时器、技能 / 性格标签、`lockHeldOn` 与 `ai.illum` 状态，世界里画出 Director 分配的扇区环。不进正式界面，不进 smoke，不影响黄金回放（只读状态）。

**没有采纳**：损伤降级（受伤后性能下降）、战场节奏导演（动态增援 / 减压）、玩家指令友军。以后要加都不与上述冲突。

### 5.8 过失速机动（AI 侧）

**复用**：AI 直接调用批次 3.3 的 `Ent.stepPSM`（新文件 `js/engine/entities/psm.js`，属 `Ent`，在 `entities/zz-api.js` 暴露）与同一套控制律（`AI.steerTo`（`steer.js`）本来就是玩家与 AI 共用的），只替换"目标方向"的来源。接入点在 5.0 说明的"4. 分派行为"链（`brain.js` 的 `update`）里新加 `s.mode === 'psm'` 分支，**并显式跳过 `vertRecover`、`clampCeiling` 与近地保护三道覆盖**（见 5.0）；机动库（`js/engine/ai/man-*.js`，平铺）是批次 5 本身要建的东西，不是已有的。AI 与玩家一样走 `AI.update → Ent.stepAircraft` 的统一管线（`engine/game/update.js` 的 `update`），PSM 分支在 `stepAircraft` 之前判定。

**适用**：位格 `rank === 'ace'`（对应 `skill ≥ PSM_AI_SKILL`，起步 0.75）。普通与新手 AI 不使用，避免全场都在失速。

**两个用途**：
- **反击（咬尾时）**：AI 被敌机咬住（攻击者位于 AI 机尾 ±60° 内，距离 < 3 km），且规避不成立（5.7 的规避评估给出"无逃逸角"或"能量不足"），则 PSM 指向攻击者；收敛后按 5.1 的开火门限开火。这是"回头反击"的具体实现，也是 5.7 假撤退回头迎击的执行手段。
- **摆脱锁定（被导弹 / 雷达锁定时）**：规避失败后，PSM 的目标方向取"远离来袭导弹 / 照射源"的方向，让机头被甩出导引头视场。成功与否由批次 5.6 的 `FovWatch` **锥出框 → `onLockLost`** 事件判定，不加每帧检查（对半主动弹，"甩出锥"的效果就是发射机丢锁，见 5.6）。

**触发**（沿用 5.4 的状态变化 + 延迟判定，不逐帧掷骰）：
- 事件源：被锁定、被咬尾、被命中、收到来袭导弹告警。**没有统一的事件总线**，只有 `world.events.push`（`hit / intercept / wingflare`）与 `Ent.damage`（`entities/damage.js`）这一个 hp 咽喉；"被锁定"可由 `AI.findIncoming`（`util.js`）与 RWR 的 `a.rwrT / a.rwrSrc`（`brain.js` 的 `update` 开头）产生，"被咬尾"由 5.2 的感知层计算后登记；
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
- 无人机与 VTOL 不适用（`noPSM`；无人机即 `a.tags.unmanned`），无人机的机体限制留到批次 6 再定。`noPSM` 是新标签，同样要在 `js/core/tags.js` 里 `Tags.declare`（批次 3.3 若已声明则复用）。

**验证**：
- `tools/test/probes/probe-psm.js` 增加 AI 场景（该探针由批次 3.3 建立）：ace 对普通 1v1，统计 ace 的 PSM 触发率、摆脱锁定成功率（导弹失效比例；半主动弹按"发射机丢锁"计）、反击后的开火命中率；普通 AI 的 PSM 触发数断言为 0；
- TTI 门限：来袭导弹过近时断言不触发；
- smoke：`PSM_AI_SKILL` 门限断言，非 `ace` 位格不进入 `psm` 机动。

### 5.9 验证

按"相关段 `--only` + 相关探针 + golden / golden-render"跑（smoke 很慢，少跑；先跑相关段）：

- **反挤团指标**（Sim，固定种子，多次平均）：8v8 纯 AI 场景，每 5 s 采样"周围 1.5 km 内有 ≥ 3 架他机的飞机占比"，要求相比基线下降 ≥ 50%；平均交战时长、击杀分布不坍塌（不能变成"互相躲着不打"）。可作为新探针 `tools/test/probes/probe-spacing.js`。
- 技能：同机型 1v1，王牌对普通的胜率显著高于 50% 但非 100%；规避动作的分布可见。
- 反应延迟与偏移：新增 `tools/test/probes/probe-aim.js`（Sim）：同机型不同技能的导弹 / 机炮开火时间、干扰弹投放时间与机炮命中率；断言三类延迟随技能单调不增，机炮偏移的散布随技能单调不增，`ace` 的命中率显著高于 `rookie`，且 `rookie` 的命中率 > 0 并与 `P(|z| < R_t / D)` 的理论值在统计误差内吻合（确认低技能不是永远打偏）。
- 撤离：各触发条件的触发率；撤离单位不计击毁；无人僚机随长机；出界后移除；"全员撤离"场景下各关状态。
- 整备点撤离：往返闭环，`buildNpcMounts` 重建后弹药池正确。
- 半主动弹：`probe-sarh`（含"发射后切目标""发射后丢锁又重锁"）；AI 的 `ai.illum` 状态机（锁定 = 持续照射，切目标 / 丢锁 → 丢照射 → 宽限 → 重锁恢复 / 超时释放）；RWR "导弹引导中"告警按锁定中出现、丢锁降级；`probe-fovwatch`。
- smoke 相关段（`--only 干扰与机动,锁定与目标选择,压制下的目标与锁定,挂载系统,航线与随队干扰机,僚机掩护撒干扰弹`，视改动面增减）、`tools/test/probes/probe-missions.js` 全绿；`node tools/test/probe-perf.js` 无明显退化（Director 与新机动要计入）；`tools/test/golden.js` 与 `golden-render.js` 对照 `tools/test/baseline/`（AI 行为变化会改变 golden 回放，**有意的变化要在同一提交里更新 baseline 并写明原因**）；`node tools/test/check-locales.js` 与 `text-census.js --check`（新台词、新 HUD 文案都走 `T()`）。

### 5.10 文档与发版

`docs/systems/ai.md` 重写（三层结构、模式表、机动库、技能表）、`weapons.md`（半主动、标签）、`entities.md`、`missions.md`（`mission.retreat`）、`tags.md`（`sarh`、`noRetreat` 等新标签清单）、`data.md` 与 `ai.md`（位格 `rank` 枚举）、`modules.md`（`AI` 新文件与公开接口、`Chatter`、`FovWatch`）、`hud.md`、`tools.md`（新探针）、`text.md`（`radio.*`、`fail.*` 键）。发 v3.4。

---

## 批次 6 · v3.5 新单位

> 本批新增的机制标签（`droneCarrier`、`resupply`、`vtol`、`noPSM`、`ewfield` 等；`elite` / `ace` 是位格 `rank`，不是标签）一律在 `js/core/tags.js` 里 `Tags.declare`（写明 `owner` 与 `doc`，`doc` 走 `T('core.tags.doc_N')`），数据里用了没声明的标签注册时直接抛错；运行时读 `x.tags.名字`。
> 新增单位的通用清单（下文各节只写差异）：**数据文件**（`js/data/{aircraft,ships,platforms,targets,weapons}/<id>.js`，`Registry.xxx({id, order, …})`）+ **模型文件**（`js/models/<类>/<id>.js`，`Registry.model({id, order, settle?, build})`）+ **文本 JSON**（`locales/zh-CN/text/**`，代码里 `T('键')`）+ **跑 `tools/build/gen-pages.js`** + **更新 `js/boot/main.js` preflight 的 `needModels / needWeapons`** + **smoke 的 `arms` 文本检查**；有人机俯视图加 `js/render/planform/planes.js`，资料库条目加 `js/ui/codex/entries/<id>.js`。

### 6.1 前置：长机泛化与无人机

**现状**（模块 + 函数名，不写行号）：

- 无人僚机分支读 `world.player` 的地方不止一处，**全在 `js/engine/ai/` 里**：
  - `js/engine/ai/util.js` 的 `leadThreat`：遍历所有 actor 读 `e.target === lead`，`lead = world.player`。
  - `js/engine/ai/brain.js` 的 `update` 里 `role === 'drone'` 的目标选择段：`dLead = world.player`，`leadOk` 读 `dLead.alive / .target / .target.alive`；`suppressed > 0.35` 置空目标，`spread` 用 `nearestEnemy`，`cover` 用 `leadThreat` 再 `nearestEnemyTo(dLead.pos…)`，`focus` 用 `dLead.target`。
  - 同一函数里的"掩护撒干扰弹"段（`role === 'drone' && cmd === 'cover'`，读 `lead.alive`、`lm.target`、`lm.pos`，写 `s.flareFor = lead`）。
  - 同一函数里的"编队"段（`role === 'drone'`：读 `dLead2.pos / .right / .fwd / .alive / .speed`，槽位 `s.formation = {dx,dy,dz}` 相对长机轴，`cmd` 缩放：cover 0.55、spread 1.6；长机没了走"盘旋"分支）。
  - `role === 'wingman'` 的两处分支（目标选择里的 focus/cover、编队里的 `wingman` 段）**仍是死代码**：`spawnWingman` 只给 `role: 'drone'`，世界里没有 `wingman` 角色。
- **`ai.leader`、`ai.ward`、`spawnDrone` 都不存在**（`AI.attach`，`js/engine/ai/brain.js`，只接 `opt.formation / opt.cmd`；`formation:{lead,dx,dy,dz}` 的注释里写了 `lead`，但 `lead` 从未被读）。世界里**唯一的无人机**是玩家的两架 KA-7，由 `spawnWingman`（`js/missions/_lib.js`）生成，它写死 `team:0`、`w.player.pos`、`CALLSIGN['wing'+idx]`、`w.wings`，**不能复用给敌方**。`setWingCmd` 只改 `world.wings`（`js/engine/game/world.js` 初始化为 `{}`；`js/engine/game/update.js` 的 allyDown 判断读 `world.wings[3]`），所以敌方无人机也收不到玩家的 1/2/3 命令（这正合适）。
- **长机被压制不影响无人机**：`brain.js` 里"数据链中断"一段的注释明说"长机被压制或静默只会让它无法发新命令，已授权的命令继续有效"，**只有无人机自己 `suppressed > 0.35` 才退化**（HUD 的 "LINK LOST" 标签读的也是无人机自己的状态，`js/ui/hud/targeting.js` 里 `t.ai && t.wingIdx` 一段）。**设定：长机被压制不会让编队瓦解，本计划不改这条规则。**
- 其它与"无人机"概念绑定的位置：`world.wings[idx]`、`t.wingIdx`（`targeting.js`、`spawnWingman` 写入）、`killCredit`（`js/engine/game/finish.js`）里的 `kb.tags && kb.tags.unmanned && kb.team === 0`——**批次 2.2c 的 `isDrone → unmanned` 已落地**，机型的 `tags` 由 `makeAircraft`（`js/engine/entities/aircraft.js`）带到 `a.tags`。

**要做的**：
1. `AI.attach` 加 `ai.leader`（缺省 `null`，解析为 `a.ai.leader || world.player`）；把上面所有读 `world.player` 的地方（`util.js` 的 `leadThreat`、`brain.js` 的目标 / 撒弹 / 编队三段）改读解析后的长机；死代码 `wingman` 分支一并清理（并同步 `leadThreat` 注释里提到的 wingman）。
2. 长机对象需要提供的字段：`pos / vel / fwd / alive / suppressed`，以及 `.right`、`.speed`、`.target`。**舰船长机不满足**：`makeTarget`（`js/engine/entities/targets.js`）建的目标 `right` 恒为 (1,0,0) 且 `stepTarget` 从不更新，`speed` 恒为 0（真实速度在 `route.speed`，单位 m/s），也没有 `.target`。所以 AI 侧**不依赖这些字段**：`right` 由 `fwd × up` 现算，速度取 `|leader.vel|`，`leadOk` 与 `focus` 里把 `dLead.target` 改成 `(dLead.target && dLead.target.alive)`，缺失时回退到 `nearestEnemyTo(dLead.pos, …)`——这正是"在长机附近自由战斗"想要的行为。
3. **退化规则保持现状**：只有**无人机自己** `a.suppressed > 0.35` 才退化为"只规避不开火"，**不加**任何"长机被压制 → 无人机退化"的新规则。长机（飞机或舰船）被压制只影响它自己，不连带编队。
4. 新写 `spawnDrone(leader, o)`（`js/missions/_lib.js`），不要改 `spawnWingman`。长机死亡时沿用已有的"长机已死：盘旋"分支（`brain.js` 编队段的 else 分支）。

- **敌方无人机**（让玩家的主动干扰有意义）：
  - 需要新增一个**下游无人机机型**——**目前下游没有任何无人机**：下游机型只有 `schist / basalt / sandstone / boulder / quartz / lodestone`，全是有人机；KA-7 `folded_wing` 属上游。新机型清单（新结构）：`js/data/aircraft/<id>.js` 的 `Registry.aircraft({…})`（必填 `id / model / name / nick / cn / role / stats / phys / gun / maxLoad / hardpointGroups / defaultLoadout / desc / npcOnly:true`，`nick` 缺失时机库 `toUpperCase` 会抛异常；`tags: ['unmanned']`）、`js/models/aircraft/<id>.js`（可借用现有几何，如 `tideline` 借 `sailfish`）、文本 JSON、`js/boot/main.js` preflight 的 `needModels`。`npcOnly` 机型可以没有俯视图（preflight 对 `npcOnly` 跳过 `PLANFORM.planes` 检查），smoke 的"单位详情页"一节对每个 `AIRCRAFT / SHIPS` 自动生成详情页，无需额外注册。**下游武器的 `fits` 是空数组**，NPC 只能靠 `npcFits` 装挂，所以无人机的挂点组种类必须在某些下游武器的 `npcFits` 里出现，且 `Ent.mountIssues` 必须为空（smoke 会拦）。
  - 以敌方长机或预警机为 `leader`。**主动干扰的价值来自干扰场本身**：干扰场按半径覆盖范围内的每一架无人机各自判定 `suppressed`（`js/engine/game/lock.js` 的 `updateJamming`：每帧清零后按 `ewFieldR / ewFieldK / ewPower` 对 `Ent.hostile` 的 actor 取 max），一片无人机挤在一起时会**同时**被压到阈值以上而各自退化，不需要长机被压制这条规则。
  - 关卡里的放置放批次 8。
- **友方有人机的无人僚机**：同一个 `spawnDrone(leader=某友军有人机)`，机制只有"与长机保持一定距离内自由战斗"，不需要更复杂。
- **性能**：`world.actors` **从不压缩**——`compact()`（`js/engine/game/update.js`）只清理导弹、子弹和粒子（上限 900），死亡与逃离的飞机永远留在数组里。每帧的 `AI.update` 里 `nearestEnemy / leadThreat` 是 O(actors)，无人机成群时整体是 O(n²)；`scanShot` 是 O(子弹 × 存活敌机)。实测前 60 s 各关最大 actor 数仅 18（`targets` 52，多数是远处的中立调节单元）。所以：无人机上场前先加**延迟压缩**（死亡 / `escaped` 超过 `ACTOR_GRACE_S`（起步 10 s）后从 `world.actors` 移除，并核对所有按下标引用 actor 的代码），并设**同时存活无人机上限**（起步 24）。

#### 6.1b 下游无人机航母

**定位**：一艘下游水面舰，机库里存放一批下游无人机，按波次放飞，回收受损或耗尽的无人机。它是 6.1 的"无人机以长机为 leader"在水面上的具体载体：**长机是舰船，不是飞机**。

**现状**：
- 舰船是 **target** 不是 actor：`spawnShip`（`js/missions/_lib.js`）按 `SHIPS` 里 `model` 匹配的条目调 `Ent.makeTarget`（`ttype:'ground'`、`big:true`，team 缺省 1），再 `Turret.attach(t, s.mounts, s.launchers)`，推入 `w.targets`。`spawnShip` **忽略 `o.fwd / o.yaw`**（固定锚泊的船朝 +z，航行船的 `fwd` 由位移推出）；航线由 `Ent.stepTarget` 沿 `route = {wp, speed, loop}` 推进，不是 `js/engine/route.js`（后者只管飞机）。
- `updateTargets`（`js/engine/game/combat.js`）只做 `Ent.stepTarget`、`Turret.stepAll`、尾流水花（`Ent.wakeSpray`）与旧式 `t.weapon` 射击，**不调 AI，也没有任务回调**。
- **没有任何"机库 / 容量 / 放飞 / 回收 / 整备"的概念**（`js/data/`、`js/engine/entities/`、`js/missions/`、`js/engine/ai/` 里都只有描述文字）。上游航母 `humpback` 的"舰载机 ×40"只是 `arms` 文本。
- 没有甲板几何数据：`humpback`（`js/models/ships/humpback.js`）是 `b.hull([...])` 加一块 18.4 m 高的 40×276 甲板盒与一块斜角甲板 quad，甲板高度约 19.2 m、z 范围约 −140 到 140，只能由模型常数推出。
- 中途生成飞机的现成范式：`m8Wave2`（`js/missions/m8.js`）在关卡 `tick` 里用 `w.flags.wave2` 一次性标志触发，循环 `spawnEnemy` 再设 `e.route`。`Game` 的 update 里 `$.mission.tick` 在胜负判定之前运行（`js/engine/game/update.js`），所以在 `tick` 里生成是安全的。`spawnEnemy`（`js/missions/_lib.js`）设定：`makeAircraft`（装挂走 `mountPlan / fitsKind / npcFits`，`buildNpcMounts`，`js/engine/entities/mounts.js`）、`a.model / phys / maxHp / hp / radius=8 / name / label`、`AI.attach`、`w.actors.push`。
- 舰船的 `suppressed` 已被计算（`updateJamming` 对 `world.targets` 也写，乘 `Ent.JAM_SURF_K`）但几乎无人读取（只有 `Ent.jamPress`，`js/engine/entities/radiation.js`，与 `js/engine/turret.js` 里炮塔对压制的读取）。

**数据**（`SHIPS` 条目，**现在写在 `js/data/ships/<id>.js` 的 `Registry.ship({…})` 里**；字段全部是新增，`spawnShip` 负责把它复制成 `t.hangar`）：

```js
droneCarrier: {
  capacity: 12,           // 机库容量（无人机数）
  launchCd: 25,           // 两波放飞之间的冷却（s）
  waveSize: 3,            // 每波放飞数量
  recoverR: 1800,         // 回收半径（水平，m）
  recoverAlt: 300,        // 回收高度上限（m）
  droneType: '<新的下游无人机 id>',   // 6.1 里新增的下游无人机机型，npcOnly、unmanned
  deckAnchor: [0, 11, -120],          // 放飞点（舰体模型坐标；由新模型文件导出，不是从 humpback 推）
}
// 同一舰文件里：tags: ['droneCarrier', 'resupply']
```

- `droneType` 必须指向新增的下游无人机机型，不能借用上游有人机（如 `skua`）。
- 标签 `droneCarrier`、`resupply` 在 `js/core/tags.js` 里 `Tags.declare`（`Registry.ship` 已支持 `tags` 字段，与机型、设施一致；舰船数据现在可以写 `tags: [...]`，运行时 `t.ship.tags`，`makeTarget` 对舰船目前不带 `tags`——按 `TARGETS[o.model]` 取，舰船取不到，所以放飞钩子读 `t.ship.tags` 或 `t.hangar`）。`resupply` 复用批次 4 / 5 的整备机制（`Ent.rebuildMounts`，见 4.2）。
- 新增一艘下游舰的清单（新结构）：`js/data/ships/<id>.js`（`Registry.ship`，**`mounts / launchers` 就在该文件里**，用 `js/data/_lib.js` 的 `_m() / _L() / ARC_*`）；`js/models/ships/<id>.js`（`Registry.model({id, order, settle: true, build})`——**船文件自带 `settle: true`，不再有名单要改**）；`js/boot/main.js` 的 `needModels`；**`NAVAL_CS_POOL`**（`js/data/callsigns/naval.js`）——**下游呼号池的计划表仍是写死的 `plan`**：`'下游同盟': [['ammonite',4],['trilobite',6],['seascorpion',3]]`（扣掉 `NAVAL_NAMED` 剧情船后正好剩 13 个），新增一类要在表里加一行并核对 smoke 的计数；文本 JSON + `gen-pages`；`arms` 文本必须与 `mounts` 的炮数一致（`tools/test/smoke.js` 的"炮位数量与 arms 文本一致"一节）。

**放飞**：
- **每帧钩子**：`updateTargets`（`js/engine/game/combat.js`）里加一个 `t.hangar` 分支（或放 `mission.tick`），调用新函数 `launchDrone(carrier)`，内部包装 `spawnDrone`（6.1）。沿用 `m8Wave2` 的"一次性标志"思路，但这里是周期性的，用 `t.hangar.cd` 倒计时。机库状态建议放 `Game.$`（`js/engine/game/_state.js`），对外靠 `zz-api` 暴露。
- 舰船每 `launchCd` 放飞一波 `waveSize` 架；机库剩余不足一波则放飞剩余全部。
- 放飞点 = `舰体位置 + 绕 heading 旋转(deckAnchor)`。舰船的 `right` 不维护（恒 (1,0,0)），所以**用 `heading` 或 `fwd` 现算旋转**，不读 `t.right`。
- 放飞的无人机 `leader` 设为舰船；飞出 `recoverR` 后脱离队形，进入 6.1 的"与长机保持一定距离内自由战斗"。

**回收（不需要新状态）**：
- 无人机在 `recoverR` 内、`Ent.agl ≤ recoverAlt` 且**弹药耗尽 / hp 低于阈值 / 被要求撤回**时（**不引入燃油**，代码里没有燃油模型），转为"回收"子模式飞向舰尾，进入舰尾后被收回。
- 收回 = 写 `a.alive = false; a.escaped = true`（`js/engine/route.js` 的 `egress`、`js/engine/ai/brain.js` 的离场分支已有先例）：`killCredit`（`js/engine/game/finish.js`）对 `escaped` 返回 `'none'`，友军损失统计（同文件，`!a.escaped` 条件）也跳过它们，所以**不计击毁、不计损失，无需新的记账代码**。机库计数由舰船 `t.hangar.count` 自己维护，再次放飞是**全新生成**（带补满的弹药与 hp），不去"复活"旧对象。
- **胜负判定的坑**：多数关卡的 `win()` 要求"所有 team 1 存活 actor 都死了"（共 13 关、31 处 `team===1` 判断，`js/missions/*.js`；数字为重构前统计，批次 8 动手时重数）。已放飞、尚未回收的无人机会卡住胜利，所以每个用到航母的关卡必须**把 `unmanned` 的 team 1 单位排除出击毁目标计数**，或者明确把"击沉航母"作为目标之一；批次 8 逐关处理。
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
- Sim 新探针 `tools/test/probes/probe-carrier.js`：放飞间隔不小于 `launchCd`；波次大小正确；机库存量在放飞、回收、击毁三种操作下守恒；回收后补满；
- 压制航母时回收与放飞照常、在外无人机不受影响；只有无人机自己被压制才退化；航母被击毁后剩余无人机不再回收；
- smoke（`tools/test/smoke.js`）：`droneCarrier` 与 `resupply` 标签组合断言（且两者都在 `tags.js` 声明——smoke 本就查"声明过的标签都有人用"）；无人机机型带 `unmanned` 且 `Ent.mountIssues` 为空；`arms` 文本与 `mounts` 一致；新舰的模型文件带 `settle: true`，且在 `needModels` 里；
- 性能：`tools/test/probe-perf.js` 加"航母 + 24 架无人机"场景，逻辑帧耗时在预算内。

### 6.2 轻型舰载 VTOL 可玩机型

**定位**：轻型单发垂直起降战斗机，从上游航母的甲板或整备点起降，不需要跑道。它是前线的近距护卫与补位，**不是重型机**：挂点少（2–3 组）、载荷小、造价低。

> 草稿曾把它与"国土防卫重型战机"写在同一条里，那是误合并。两者是独立单位：重型战机见 6.2b，本节不写它的挂点。

**行为**（草稿要点）：速度上限不高、下限可到 0 且**不失速而是悬浮**；推力只能向下，机体倾斜时靠更大推力补偿高度，因此产生横向漂移。

**实现**：

- 机型字段 `vtol:{ hoverT, transSpeed, maxLateral… }`。`stepAircraft`（`js/engine/entities/aircraft.js`）整体是运动学模型（`vel = fwd × speed`，无侧滑），所以 VTOL 走**独立的 `stepVtol(a, dt, world)`**，放在新文件 `js/engine/entities/vtol.js`（属 `Ent`：`$` 私有状态 + `js/engine/entities/zz-api.js` 里 `Ent.stepVtol = $.stepVtol`；`index` 的脚本清单 / gen-pages 模板片段里要加这个文件）：
  - 姿态积分、控制输入与现有一致（可复用）。
  - 速度是自由矢量：`推力 = −up × T`（只能沿机体下方），`加速度 = 推力 / m + g + 阻力`。悬停条件 `T·cosθ = m·g`；倾斜 θ 后要保高度需 `T = m·g / cosθ`，水平分量 `g·tanθ` 就是**横向漂移**。
  - 速度高于 `transSpeed`（起步 120 m/s）后逐渐混入现有翼升力模型（过渡区线性混合），高速时与普通战机行为接近；`vMax` 较低；无失速判定与速度下限。
  - 油门轴语义在低速区改成"升力"；HUD 低速时显示悬停指示、垂直速度与漂移矢量。
- 影响面（调查已列出）：`steerTo`（`js/engine/ai/steer.js`）假设前飞（`ctrlAuth`、高度回收分支）、HUD 失速 / 速度显示（`js/ui/hud/instruments.js`）、`Ent.agl`（`js/engine/entities/physics.js`，`pos.y − groundY`）、`Game` 对 `stepAircraft` 的两处调用点（`js/engine/game/update.js`：玩家一处、其它 actor 一处，要按 `a.vtol` 分流到 `Ent.stepVtol`）。**本批 VTOL 只给玩家用**，AI 用 VTOL 暂不做（`npcOnly` 不给）。
- 数据：`js/data/aircraft/<id>.js`（`Registry.aircraft`，带 `vtol` 字段与标签 `vtol`，`noPSM` 若用到也在 `tags.js` 声明）、模型 `js/models/aircraft/<id>.js`、俯视图（`js/render/planform/planes.js`）、`needModels`、资料库条目（`js/ui/codex/entries/<id>.js`）/ 详情页（`js/ui/unitview.js` 自动生成，含"机制标签"一行读 `tags.js` 的 `doc`）、挂载组（2–3 组，轻型，`maxLoad` 偏小；起步值以 `probe-balance` 为准）、文本 JSON、`gen-pages`。
- 验证：Sim 场景（`tools/test/probes/probe-vtol.js`）——悬停推力平衡、倾斜漂移方向与量级、过渡区速度连续、无失速；`probe-envelope`（`tools/test/probes/`）在悬停 / 低速下的发射包线不出怪值。

#### 6.2b 国土防卫重型战机（可玩，独立单位）

**定位**：上游守本土的重型战机，守浮岛与基地上空。不以机动取胜，靠挂载多、续航中等、扛打。它与 6.2 的 VTOL 没有依赖关系。

**现状**（已核实，`js/data/aircraft/*.js` 与 `locales/zh-CN/text/aircraft/*.json`）：可玩机型里挂载最大的是 `booby`（`maxLoad` 7200 kg）和 `frigatebird`（6500 kg），但前者是近距支援攻击机、后者是舰载多用途机，**没有一架上游可玩机型是为守土设计的重型战机**。其余可玩战斗机的 `maxLoad` 是 4200–5200 kg（`petrel` 5200、`albatross` 5000、`sailfish` 4800、`skua` 4200），挂点组数都在 3–4 组。

**要做的**：
- 数据：`js/data/aircraft/<id>.js`（`Registry.aircraft`，不带 `npcOnly`）。挂载组数要**多于 2.4 落地后的上游战斗机**（至少多 2 组，起步 5 组，与草稿一致）。`maxLoad` 高于 5200 kg，代价是 `phys` 里 `accel / vMax` 降低、`roll` 变慢。
- 挂点组的种类要同时覆盖空空弹（中距，翼下）与对地弹（机腹），这样它守土时两种任务都能接。
- 模型 `js/models/aircraft/<id>.js`、俯视图（`js/render/planform/planes.js`）、资料库条目（`js/ui/codex/entries/<id>.js`）、文本 JSON、`needModels`、`gen-pages`。详情页由 `js/ui/unitview.js` 自动生成。
- 验证：`tools/render/render-units.js` 出图；smoke 的挂点检查（`Ent.mountIssues` 为空）；`probe-balance` 比较它与 `petrel` / `sailfish` 的守土表现（基地防空、被击落时间）。

#### 6.2c 战斗轰炸机（可玩，新机型）

**定位**：速度足以自卫的对地攻击机。能挂对地重弹，也保留中距空空弹，遇到敌机能应战。它填补的是"快速、能打空战、又能挂对地重弹"的空缺。

**现状**（已核实）：玩家能挂的对地弹（`kind: 'bomb'`，`fits` 非空）有 `clb / hbh / hbl / v30 / pgb / rkt` 六种。可玩机型里，对地攻击的主力是 `booby`（近距支援，`vMax` 340 m/s，装甲重）。快速战斗机 `petrel`（`vMax` 高空截击）、`sailfish`、`albatross`、`skua` 的最大载荷只有 4200–5200 kg，且挂点设计以空战为主。所以**没有一架可玩的快速战斗机能携带重型对地弹**。

**要做的**：
- 数据：`js/data/aircraft/<id>.js`（上游、可玩）。挂点组：机腹 2 组（接受中型对地弹，`kind: 'belly'`）、翼下 2 组（中距空空弹，`kind: 'light'`）。`maxLoad` 起步约 6000 kg。`vMax` 落在 `skua`（540 m/s）与 `booby`（340 m/s）之间，起步值待定。
- 机炮复用现有 `cel*`，不新增机炮。
- 模型 `js/models/aircraft/<id>.js`（新几何，`albatross` 的前掠翼布局可作参考但不照搬）、俯视图、资料库条目、文本 JSON、`needModels`、`gen-pages`。
- 验证：smoke 的挂点检查（`Ent.mountIssues` 为空，`bomb` 装进机腹组时 `fitsKind` 通过）；`probe-balance` 比较它对地的命中效率与 `booby`，并比较空战表现与 `skua`。

### 6.3 上游航空巡洋舰

草稿：75 mm、旋转 SAM 发射架、CIWS、后部一条斜跑道。

- 舰船文件 `js/data/ships/<id>.js`（`mounts / launchers` 就写在里面）+ 模型 `js/models/ships/<id>.js`（`hull()` + 尾部斜跑道，`settle: true`）：沿用阶段 3/4 的炮塔系统——`_m(..., '75mm', ...)`、`_L('rotSam', ...)`、`_m(..., 'ciws20', ..., 'ciws')`，盲区靠 `arc`（`js/data/_lib.js` 的 `ARC_*` 常量）表达。炮塔网格由 `js/models/ships/turrets.js`（`modelGroup`）里的 `composeTurrets` 统一合进船体，不用在舰模型里手画。
- 标签 `resupply`（它自然成为整备点）。
- 呼号（`js/data/callsigns/naval.js` 的 `NAVAL_CS_POOL`，上游 `plan` 加一行）、`arms` 文本与炮塔数一致（smoke 会核对）、资料库条目 / 详情页、设定集条目、文本 JSON、`needModels`。
- 关卡放置放批次 8。

### 6.4 下游战略制空支援机（精英）

- NPC 专用机型（`js/data/aircraft/<id>.js`，`npcOnly: true`）：流线体、高速、大型；`npcFits` 挂**大量中远程导弹**（含半主动弹，来自批次 5）；`ewPower / ewFieldR` 给**大范围电子战**；`hp` 高、默认位格 `rank: 'elite'`（关卡可按需提到 `ace`）；标签 `ewfield`（`tags.js` 声明）。
- **行为** `support`（AI 角色，写在 `js/engine/ai/tactics.js` 或 `brain.js` 的角色分支里，复用批次 5 的外围游走）：以友方战斗机的质心为锚点，保持在其后方 `D_support`（起步 12–18 km）游走；每 25–40 s 对**不同目标**一次发射多发（N=3–4）对空弹；被威胁接近时脱离。
- 受干扰影响：被压制时发射间隔拉长、锁定距离折半（现有 `jamLockOK` 逻辑），玩家主动干扰对它有意义。
- 模型（`js/models/aircraft/<id>.js`）/ 资料库条目 / 文本 JSON / 呼号（下游：村庄名 + 小队词，`js/data/callsigns/air.js` 的 `CS_DOWNSTREAM`）。

### 6.5 其它合理的空军单位（已选：巡飞攻击无人机、重型运输机、空中整备 / 加油机）

| 候选 | 设定与玩法 | 备注 |
|---|---|---|
| 巡飞攻击无人机（自杀式） | 廉价、低速、成群，扑向舰船 / 设施 / 玩家 | 与 `unmanned` 标签 / 6.1 泛化直接配套 |
| 空中整备 / 加油机（上游） | 移动整备点（`resupply` 标签）；在后方盘旋，玩家驻留 hold 秒补给 | 复用批次 4，机制零新增；很有"季风线"气质 |
| 重型运输机 | 护送目标，不武装 | 便于批次 8 的护航关 |

### 6.6 浮空平台加武器

调查结果：草稿说的"浮空平台"对应 `relay`「高原」（27 × 82 m，`spawnTarget{ttype:'air', model:'relay', drift:9}`）和 `cell`（调节单元，中立资产，**不应武装**）。**`spawnTarget`（`js/missions/_lib.js`）目前不调用 `Turret.attach`**（只是 `Ent.makeTarget` + `w.targets.push`），只有 `spawnShip`、`spawnPlatform` 调用，所以要补上。

- **数据**：`js/data/targets/relay.js`（`Registry.target({id:'relay', model:'relay', tags:['relay'], gunResist:0.7})`）**目前只有 `tags / gunResist`，没有 `mounts / launchers`**；`sealData`（`js/core/registry.js`）建 `TARGETS` 时也只是按 id 收进表，不像 `SHIPS / PLATFORMS` 那样拼 `allMounts`。要做的：给 `Registry.target` 的 schema（`js/data/targets/_schema.js`）加可选 `mounts / launchers`，`sealData` 里对 `TARGETS` 同样拼 `allMounts`，`spawnTarget` 里在 `makeTarget` 之后按 `TARGETS[o.model]` 取 `mounts/launchers` 调 `Turret.attach`（沿 `spawnShip` 的写法，加 `typeof Turret !== 'undefined'` 守卫）。
- 在 `js/data/targets/relay.js` 里写 `mounts / launchers` 字段：顶部一台旋转 SAM（`_L('rotSam', …)`）、机头 / 机尾各一个 20 mm 炮塔（`_m(..., 'ciws20', …, 'dual')`；`_m / _L / ARC_*` 来自 `js/data/_lib.js`）。盲区由 `arc` 与 `yaw0` 决定（"有死角但不多"：每个炮塔的盲区取朝向机身对侧的 ~50° 扇区即可）。
- 模型：走 `composeTurrets`（`js/models/ships/turrets.js` 的 `modelGroup`）的统一遍加炮塔网格；`unitview.js` 的预览目前只对舰船 / 平台调 `composeTurrets`，要补上设施一类。
- 注意：炮塔只在 `t.team !== 2` 时运行（`js/engine/game/combat.js` 的 `updateTargets`：`if (t.turrets && t.team !== 2) Turret.stepAll(...)`），中立单位不会开火，这正是 `cell` 不会被误武装的保障；smoke 里"炮数与 `arms` 文本一致"的检查（舰船一节、平台一节各一处）要扩展到 `targets/`（`relay` 目前没有 `arms` 字段，要么补 `arms` 文本，要么按 `mounts` 直接核对）。
- 关卡影响：用到 `relay` 的关卡（`m2`、`m3` 等）会变难，`mission` 里加 `armed:false` 的选项可以让某关保持旧行为；`probe-missions`（`tools/test/probes/`）+ 手动校。

### 6.7 验证与发版

每个单位：`tools/render/render-units.js` 出图、smoke 的挂点与文本核对、`tools/test/probes/probe-balance.js`；新探针 `probe-drones`（无人机自己被压制时退化，长机被压制时不连带）、`probe-vtol`、`probe-carrier`（均放 `tools/test/probes/`）；`probe-missions`；`tools/test/check-locales.js` / `text-census.js`（新增文本无遗漏）；`golden` / `golden-render` 基线按需刷新。文档：`docs/systems/` 里的 `models.md`、`turret.md`、`ai.md`、`data.md`、`entities.md`、`tags.md`（新标签）、世界设定对应章节。发 v3.5。

---

## 批次 7 · v3.6 资料库背景与世界地图

### 7.1 资料库追加"设计手记"

- 资料库单位详情页（`js/ui/unitview.js`；资料库页面由 `js/ui/screens/codex.js` 与 `js/ui/codex/entries/<id>.js` 组成）目前只有游戏内同源的简短 `desc`。新增键 `<unit>.dev`（放 `locales/zh-CN/text/codex/devnotes/*.json`，**该目录目前不存在**，新建），详情页底部折叠显示"设计手记"：开发背景、取舍、被砍掉的方案。**文本缺失时该折叠区不显示**（`unitview.js` 渲染时按 `T` 键是否存在判断），所以可以逐单位慢慢补，没有技术债。其它语言目录（`locales/<语言>/text/…`）缺键按 `check-locales.js` 的回退规则处理。
- 可选条目（草稿说"算了，不必强求"）：用一两句设定解释"挂点很少却能带几十发"——建议的解释方向：挂点是**标准化挂架接口**，一个"点"挂的是多联装挂架 / 弹链模块（`perPoint`），由此合理化现有数值，只加一条资料库文字，不改代码。

### 7.2 世界地图（矢量绘制风）

- 新 `js/ui/worldmap.js`（**新建文件，属 ui 层**）：`WorldMap.draw(canvas, { markers:[{lat, lon, label}], focus })`，画粗略的矢量海岸线（风格化折线 + 经纬网 + 季风线 / 北纬 12° 标线），用于资料库页面。注册脚本顺序、`$` 私有状态与 `zz-api` 暴露按 `docs/systems/modules.md` 的约定。
- 数据 `js/data/geo/world.js`（**新建，data 层**；这是第一个不属于"一个单位一个文件"的数据，按 `modules.md` 的数据层约定决定走 `Registry` 还是纯常量）：架空大陆的海岸多边形，带高程档位与新旧海岸线（约 300–600 个点，见下方"地理基准"）。
- **关卡小地图**：每关加 `mission.geo = { lat, lon }`（`js/missions/<id>.js`，`js/missions/_schema.js` 同步加字段），简报页（`js/ui/screens/brief.js`）嵌入一张缩略世界图——现有 `drawMap(m)` 画的是关卡内的战术图（`#mapCv`，网格 + 单位标记），**缩略世界图另开一个 canvas，不改 `drawMap`**——用**十字**标出任务发生位置；`mission.loc` 原有文字不变（文本在 `locales/zh-CN/text/missions/<id>.json`，`T('missions.<id>.loc')`）。
- **地理基准（已定）**：**完全架空的海岸线形状**，并且要体现**海面上升**。做法：
  1. 先在设定里定好架空大陆的轮廓、主要海域与季风线（北纬 12°）的位置，出一张手绘级的草图（`docs/world/GEOGRAPHY.md` + 一份 SVG 草稿）供评审，再抽稀成多边形入库。
  2. 海面上升按"淹没线"表现：地图数据里每块陆地带两条轮廓——**旧海岸线**（虚线，上升前）与**现海岸线**（实线）；低地、三角洲、岛链在两条线之间被标成"已淹没区"。数据文件保存的是带高程档位的陆地（若干档等高环），渲染时按当前海面高度裁出实线，这样以后要调整上升幅度只改一个常数。
  3. 因为不再是现实地球，**不能从公有领域数据抽稀**，轮廓由我们自己画；点数 300–600 个已足够粗糙矢量风。
  4. 与 W.3 的呼应：地图上可叠加"干旱带 / 阻塞高压带"（δ）与季风线的历年位置，让灾难可视化。

### 7.3 发版

文档：`docs/systems/codex.md`、`unitview.md`、`modules.md`（新增 `worldmap.js` 与 `data/geo`）、`docs/world/SETTING.md`、`docs/world/CAMPAIGN.md`。页面模板（`locales/_html/`）里若新增 canvas / 折叠区，要重跑 `tools/build/gen-pages.js`。发 v3.6。

---

## 批次 8 · v3.7 关卡重构

这是前面所有批次的总装。**先出修订稿、再改代码**：每关一份设计说明，评审后再落地。

**底层规则**：所有关卡内的敌我增援都由关卡脚本给定，在固定位置刷出，不随战况动态投入；不存在"战斗中从某处起飞"的设计。若以后要加动态增援，作为关卡脚本的功能另行实现。友方被击落的飞行员默认视为成功跳伞，可在其它关卡再次出现（除非关卡特殊设计）。

### 8.1 上游空军呼号体系

- 已有的：`CALLSIGN.player = VESPER-1`、`awacs = SEXTANT`（`CALLSIGN`、`CS_RESERVED`、`squadCallsign` 都在 `js/data/callsigns/air.js`）；下游用"消失的村庄名" + 小队词 + 编号（`squadCallsign`）。
- 新增上游**非玩家编队**的呼号库 `js/data/callsigns/upstream-air.js`（与 `air.js`、`naval.js` 同目录；呼号词条的文字按 `docs/systems/text.md` 放进 `locales/<语言>/text/data/callsigns/`）：
  - **战斗机编队**用天文术语（恒星、星座等），格式同下游（小队词 + 编号，如 `ALTAIR-2`）。
  - **预警机与其它特种机型**用天文仪器名，沿用 `SEXTANT` 的逻辑（看星的仪器）。天文仪器不进战斗机词簇。
  - 预留词表避开 `VESPER` 与 `SEXTANT`；碰撞检测沿用 `air.js` 里 `CS_RESERVED` 的机制（`naval.js` 的 `NAVAL_CS_RESERVED` 是舰名的同类机制，不动）。
- **无人僚机的呼号跟随所属有人长机的编队**，不单独取词；无人僚机不会单独出现。
- 舰载分队与陆基分队用不同词簇（便于玩家在无线电里听出是谁）。小队内共用一个词、编号从 1 起（见设定集 8.7）。

### 8.2 友军编成模板

**航母侧**（除主角外）：3 个"1 长机 + 2 无人僚机"小队，共 3 名有人长机、6 架僚机（`spawnDrones`，批次 5 新建）。

**基地侧**：4 名轮换休整的飞行员。开战时不在场，由关卡脚本在指定时间于基地固定位置刷出；他们的无人僚机配置与小队划分暂未确定。

**主角 VESPER-1**：部署较自由，不写死属于航母侧还是基地侧；剧情开场在航母上。两侧人数随主角归属变化（主角在航母侧时 4 对 4，在基地侧时 3 对 5），由关卡脚本按实际部署给定。

**无人僚机**是有人长机的固定配属，按长机需求分配。非战斗状态的备用僚机不占编制，各处都有存放，不写进中队编制。

**中队规模**暂不明写具体数字，便于后续调整。设定只写比例关系："半个中队跟着浮岛，半个驻在基地"。

**设定依据**：浮岛机库容量远大于关卡出场数，因为开战前未进入战备、未满载，且另存备用机与备用僚机。关卡内数量是脚本给定值，不反映机库容量。

| 模板 | 构成 |
|---|---|
| 航母侧小队 ×3 | 各 1 名有人机长机 + 2 架无人僚机，在脚本给定的固定位置刷出 |
| 基地侧轮换分队 | 4 名有人机飞行员，开战时不在场，由脚本在指定时间于基地固定位置刷出 |
| 友军有人机 | 带 `ally` 角色（批次 5）、技能 0.6–0.8；部分带自己的无人僚机 |

"友军"的广义写法不改，这是机制更新，为日后扮演其他势力做准备。

`spawnAlliedSquad({ template, from, callsignSet })`（新）放进 `js/missions/_lib.js`，与现有的 `spawnEnemy / spawnWingman / spawnShip / spawnTarget / spawnPlatform / spawnCellField / batchCallsigns` 同处。其中 `from` 指固定刷出位置，不暗示起飞。`spawnWingman`（玩家的两架无人僚机，写死 `team: 0`、`CALLSIGN['wing' + idx]`）不改动，也不复用给友军编队。

### 8.3 逐关修订表

模板（每关一行，由修订稿填写）：

| 关 | 边界 `arena` | 时间 | 整备点 | 友军编成 | 撤离 `retreat` | 敌方无人机 | 文案 / 台词重写 |
|---|---|---|---|---|---|---|---|
| m1 m2 m3 m4 m5 m6 m7 m8 m10 m12 sk1 m9 m11 | 批次 4 探针值 | 各关设定 | 有母舰的关 | 视剧情 | **逐关决定**（默认 off） | 有干扰机的关优先（m3 / m5 / m7） | 全部 |

交付物 `docs/world/MISSION-REVISION.md`：每关写清楚"改什么、为什么、对胜负条件的影响"，评审确认后再动代码。落地时每关改的是自己那一个文件 `js/missions/<id>.js` 与它的文本 `locales/zh-CN/text/missions/<id>.json`（战役对关卡的引用在 `js/missions/campaigns.js`，按关卡 id，不用动下标）。

### 8.4 无线电填充

- 友军加入后，台词以三类来源驱动：脚本台词（文本在 `locales/zh-CN/text/missions/<id>.json`，代码里 `T('missions.<id>…')`，结构在 `js/missions/<id>.js`）、`Chatter` 通用事件（批次 5）、编队内对话（长机 ↔ 无人僚机、舰载 ↔ 陆基分队互相报位置）。
- 全部台词改为按**说话人单位**选择呼号（说话人的呼号取自单位本身；通用台词的语气表在 `js/data/voices.js` 的 `VOICES`），不再写死 `VESPER-2` 之类。

### 8.5 验证

- `tools/test/probes/probe-missions.js` 增加变体：全员撤离、友军全灭、整备点被击毁；每关仍可完成或被明确标注。
- `tools/test/probe-perf.js`：友军与无人机增多后的逻辑帧耗时；`scanShot` 是 O(子弹 × 实体)，必要时按 x/z 粗网格加速（2-0IMPL 风险表已预留此方案）。
- 手动：各关通玩一遍，对照修订稿。
- 回归：smoke 相关段 `--only` + `probe-missions` + `golden`（改了关卡数据后需有意识地重录基线）。smoke 很慢，少跑。
- 文档：`docs/systems/missions.md` 全面更新、`SETTING.md` / `CAMPAIGN.md` 与新文案一致。发 v3.7。

---

## 批次 9 · v3.8 地形、城市与场景类型

**目标**：战斗可以发生在四类场景里，飞行单位能靠地形与建筑躲过导弹追踪和锁定；渲染看到什么，物理与视线判定就碰到什么（曲率造成的小偏差见 9.2）。

**前置**：批次 2.1（引入 `crash-sea / crash-ground` 死因与 `Ent.isLand` 的用法，**这些现在代码里都不存在**，只有 `js/engine/entities/physics.js` 里的钩子）、批次 3.2（`Shading.setEnv`，云层抬升要用；`js/core/shading.js` 里目前没有）、批次 4（`Arena`，决定要烘焙多大范围）、批次 5（`FovWatch` 调度器，LOS 复用；**同样还不存在**）。新模块按新约定放：独立全局模块放 `js/engine/world/`（`terrain.js`、`fovwatch.js`），加载顺序由 `tools/build/gen-index.js` 的层规则决定，不手写 `<script>`；AI 子文件属 `AI` 命名空间。

| 场景类型 | 描述 | 与现状的关系 |
|---|---|---|
| `ocean` 纯海洋 | 现有全部关卡 | **零成本路径**：`terrain` 缺省，`terrainFn` 为 null，渲染与物理与现状逐像素 / 逐帧相同 |
| `coast` 海岸 | 一部分海、一部分陆地，海岸线弯曲 | 新 |
| `island` 岛屿 | 海洋中有一片或多片陆地 | 新 |
| `inland` 内陆 | **目力所及全是陆地**，没有海面 | 新；关掉海面、地平线收在陆地与雾色之间 |

### 9.0 现状与前提

（以下逐条对着重构后的代码核对过；不再写行号，位置写"模块 + 函数"。）

| 事项 | 现状 | 影响 |
|---|---|---|
| 地形钩子（`setTerrain` 等） | 钩子在 `js/engine/entities/physics.js`（`terrainFn / SEA_Y / terrainY / groundY / isLand / agl / setTerrain`，经 `zz-api.js` 导出为 `Ent.setTerrain` 等），**除 `tools/test/probes/probe-ccip.js` 外从未被调用**。读者清单属实：飞机撞地（`entities/aircraft.js` 的撞地段）、导弹（`entities/missile.js` 的 `stepMissile` 撞地段）、子弹（`entities/guns.js` 与 `engine/game/combat.js` 的子弹循环）、AI（`ai/brain.js`、`ai/tactics.js` 的拉起判断）、HUD（`ui/hud/panels.js` 的 `drawAlerts`）、炮塔（`engine/turret.js` 的视距判断）、`engine/game/combat.js` 的 `pickTargetFor`、`engine/combat.js` 的落水柱。**但 `groundY` 被夹在 `SEA_Y = 0`，`kill()`（`entities/damage.js`）的 `groundImpact` 参数收了没用**，死因 `crash-sea / crash-ground` 现在不存在 | 批次 2.1 要先做 |
| 地形的渲染管线与 2048 顶点上限 | **没有"地形管线"**。2048 是 2D 回退的暂存数组大小 `MAXV`（`js/render/render.js`，`pushModel` 里 `nv > MAXV` 直接 return），不是 GL 或 16 位索引限制，smoke 里也没有这条断言。GL 的模型路径是**非索引三角形、每面一个颜色**（`js/render/render-gl.js` 的 `buildData` / `entryFor`，`STRIDE = 13`：位置 3 + 法线 3 + 面中心 3 + 颜色 3 + 1），没有顶点色、没有 `drawElements`、没有视锥裁剪（`render` / `drawItem`） | 地形要当成"许多块模型"来推；2D 里每块 ≤ 2048 顶点（32×32 格） |
| 海面的绘制方式 | **没有 `drawSea`**。天空和海是**一个全屏三角形**在一个片元着色器里做完（`js/render/env/shaders.js`；uniform 在 `js/render/env/create.js` 的 `drawEnv`）：每像素把视线与半径 `R` 的球（海面，写死在 y = 0，`uRh / uC`）求交，`t ≤ 0` 画天空，否则画海 | 关海面要新增 uniform；海平面固定为 0，**不支持 `seaLevel ≠ 0`** |
| 远景环形 LOD 的范围 | `FOG_NEAR = 900 m`、`FOG_FAR = 9000 m`、`FOG_MAX = 0.82`（`js/core/shading.js`），雾按**面中心深度**算；9 km 外只剩 18% 的本色，实际可见约 12–15 km | 3 环里的远环基本没有意义，见 9.2 |
| 云层高度 | 云层高度是**绝对值**：`DECKS` y = 2100 / 5200，`SHEETS` y = 12600 / 17400（`js/core/shading.js`，由 `render/env/create.js` 的 `sheetPass` 使用）；高于 2 km 的地形会穿过低云层 | 见 9.2 |
| 高海拔下仍按海拔判断的位置 | 以下仍按**海拔**判断，高地上会出错：`js/missions/` 里的 `detected = player.pos.y > N`（现为 `m2.js`、`m5.js`、`m7.js`、`m10.js` 四处，阈值 1500 / 1800 / 1500 / 2000）、`js/engine/game/update.js`（近地音效 `pos.y < 260`）、`js/engine/ai/brain.js`（`pos.y < 3200` 爬升）；追尾相机（`js/ui/camera.js` 的 `updateCamera`）**没有地形钳制**；所有"地面"目标都是写死 `y: 0` 的海上平台（`m2.js` 3 处、`m4.js` 1 处、`m5.js` 2 处内联，另外 `_lib.js` 的 `spawnPlatform` 内部写死 `y: 0`，`spawnShip` / `spawnTarget` 默认也是 0；`ground: true` 只是类型） | 见 9.1 |
| 导弹 / 子弹的撞地检测 | 都是**末点单点采样**（`entities/missile.js` 的撞地段、`entities/guns.js` 的子弹步进、`engine/game/combat.js` 的子弹循环）；导弹约 1000–1400 m/s，每个 1/60 s 步长 17–23 m，会穿过细山脊或 20 m 的楼 | 见 9.1 |
| `effRange` 对地形的屏蔽 | `effRange`（`js/engine/entities/range.js`）模拟期间把 `terrainFn` 置空，但同文件的 **`naturalPoint` 没有屏蔽** | 一并屏蔽 |
| 可复用的噪声函数 | 只有着色器里的 GLSL `hash / noised`（`render/env/shaders.js`）；`js/` 里**没有 CPU 噪声**（`render/env/build.js` 的 `lcg` 只是 PRNG） | 要写 CPU fBm |
| 烘焙地形的随机数来源 | `tools/lib/sim.js` 用 `mulberry32` **替换了沙箱里的 `Math.random`**；烘焙若调 `Math.random` 会移动随机流，破坏"海洋关逐帧一致" | 必须用私有 PRNG |

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

`terrain` 是关卡文件 `js/missions/<id>.js` 里 `Registry.mission` 的一个新字段，校验加进 `js/missions/_schema.js`。

- **用解析函数加烘焙网格，不用位图**：高度 = 宏观 fBm（带种子的值噪声）+ 海岸 / 岛屿遮罩 + 特征叠加 + 压平区。
- **噪声与 PRNG**：CPU 端写一个自己的 fBm（带种子的值噪声）与自己的 PRNG，**不碰 `Math.random`**。烘焙**惰性**：在"出击"过场里按关卡一次性做（不在脚本加载时），并缓存；`Sim` 对每个种子重新载入时才不会被拖慢。5 个八度、64 万格约 300 万次噪声求值，Node 里预计几十到几百毫秒（估计值，未实测）。
- **烘焙**：把战场区（`Arena` 外包盒 + 余量）烘焙成 `Float32Array`（起步 100 m 网格；80 km 边长 ≈ 64 万格 ≈ 2.5 MB）。`terrainY(x, z)` = 双线性插值，**渲染网格与物理共用这一份数据**（渲染的近环按 100 m 取样，远环按每 4 格取样），所以不会出现"画面上是山、物理上是平地"。
- **物理钩子**：`Ent.setTerrain(fn)` 在关卡载入时调用（接在 `js/engine/game/mission-start.js` 的开场流程里）；撞地 / 导弹 / 子弹 / AI 拉起 / HUD `TERRAIN` 告警都已经读这套钩子。
- **要一并修的"按海拔"判断**（见 9.0）：`detected = player.pos.y > N` 那四处（`m2 / m5 / m7 / m10`）改读 `agl`；`engine/game/update.js` 的近地音效改读 `agl`；`ai/brain.js` 的爬升判断改读 `agl`；追尾相机（`ui/camera.js` 的 `updateCamera`）加地形钳制（相机位置 `y ≥ groundY + CAM_MIN_AGL`，起步 4 m，别让相机钻进山里）。
- **撞击检测**：导弹与子弹的撞地判定改为**线段步进**（本步起点到终点，按 `max(步长, 25 m)` 取样对双线性地形与屋顶栅格判定），避免细脊与楼被穿过；只对"在地形包围盒高度以下"的弹体做，开销可忽略。`effRange` 与 `naturalPoint` 一并屏蔽真实地形。
- **地面目标与出生点**：`js/missions/_lib.js` 的 `spawnTarget` 与 `Ent.makeTarget` 自动取 `groundY`；上面那几处写死的 `y: 0`（`m2 / m4 / m5` 的内联目标，以及 `spawnPlatform` 内部）要逐个核对（它们都是海上平台，海洋关里保持 0）。**海 / 陆互斥校验**（smoke，新增）：`spawnShip / spawnPlatform` 必须落在水里（`terrainY < 0`），`spawnTarget`（陆地设施）必须落在陆地上，舰船航线穿过陆地同样报错。
- **特效**：舰船尾流（`Ent.wakeSpray`，在 `js/engine/entities/particles.js`，由 `js/engine/game/combat.js` 的目标步进调用，目前不看陆地）与落水柱（`js/engine/combat.js` 的对地弹爆炸段，写死 `y = 0.5`；现在已有 `!Ent.isLand` 的判断位，但 `isLand` 恒为 false）要加 `Ent.isLand` 判断，陆地上改出尘土碎石；对地弹撞地的半球壳已有，不用新增。

### 9.2 渲染

**管线**：把地形做成**许多块"模型"** `{ v, f:[{ i, c }] }`，`pushModel`（`js/render/render.js`，GL 时转给 `RenderGL.push`）位置 `(0,0,0)`、单位基底、缩放 1；GL 会按模型对象缓存成静态缓冲（`render-gl.js` 的 `entryFor`，`WeakMap`）。每块有自己的包围盒，**在 JS 里做视锥 + 距离裁剪后再 `pushModel`**（GL 路径不做裁剪）。每块一次 `drawArrays`（`drawItem`）、约 12 次 uniform 调用（未重新点数，见"待核对"），所以块要足够大（起步 2 km × 2 km）。

- **颜色只能按面**（没有顶点色）；低多边形平面着色与现有画风本来就一致，颜色按面平均高度 / 坡度分档（浅滩 → 草地 / 灌木 → 岩石）。
- **雾按面中心深度算**：远处的大三角形会出现雾色分段，低多边形风格下可以接受；近环用小格子避免。
- **半透明按实例**（`it.a`，`RenderGL.push` 设置、`render` 里分成 `trans` 队列按实例原点排序、不写深度）：海岸浅水带要做成**单独的一块带 alpha 的模型**；海岸泡沫也一样，不能按顶点渐变。
- **深度**用对数深度（`gl_FragDepth = log2(1 + vW) * uLogC`，`render-gl.js` 的模型着色器；环境着色器 `render/env/shaders.js` 用同一套 `logDepth`），6 万三角形的量级可以承受。

**环形 LOD**：

| 环 | 半径 | 格距 | 三角形（估） | 内容 |
|---|---|---|---|---|
| 0 近景 | 0–6 km | 100 m | ≈ 2.5 万 | 全部八度噪声、特征、城市建筑 |
| 1 中景 | 6–14 km | 400 m | ≈ 0.6 万 | 降低八度，城市合并成街区块 |
| 远处 | 14 km 以外 | — | 0 | **不生成几何**，直接用雾色收尾 |

- **理由**：`FOG_FAR` 仅 9 km，14 km 以外几乎全被雾盖掉，不设更远的第 3 环（1.6 km 格距）。真边界外玩家最多再飞出 `ARENA_FADE_S × 巡航速度` ≈ 2–3 km 就失败，所以"战场外更粗糙，直到玩家完全飞不到的地方"在这里就是**边界外只保留宏观起伏、不再生成特征 / 建筑 / 压平区**，并且被 14 km 的上限自然截断。
- **雾必须完全不透明**：`FOG_MAX = 0.82` 会让网格边缘露出一道可见的边。模型着色器里雾是**全局** uniform `uFog = (near, far, max, steps)`（`render-gl.js` 的 `render`），要为地形块增加**每实例 `fogMax` uniform**（地形取 1.0，其余模型保持原值），网格边缘处雾色完全覆盖。
- **统一远景颜色**：现在有三个"远处"颜色——模型雾 `FOG_RGB`（150,176,196）、海面薄雾 `SEA.haze`（77,100,114；`hazeDist` 38000、`hazeMax` 0.92）、天空地平线（201,216,221）（`js/core/shading.js`）。地形远处用 `FOG_RGB`（与模型一致），内陆地平线以下的填充色也取 `FOG_RGB`，避免"地形比天边还亮 / 还暗"。
- **内陆（关海面）**：`drawEnv`（`js/render/env/create.js`，着色器在 `shaders.js`）新增 `uSeaOn` uniform，关闭时海面分支改走"雾色 / 天空"；`inland` 同时关闭尾流与海面反射特效。2D 回退同步改 `horizonY()`、`drawSky`、`drawGround`（`js/render/render.js`，目前是 y = 0 的渐变加 500 m 网格）。
- **云层**：`DECKS` 与 `SHEETS` 是绝对高度。地形默认最高 1800 m，低于最低云层（2100 m）；若某关需要更高的山，经 `Shading.setEnv({ deckBase })`（批次 3.2）把云层整体抬高。
- **地球曲率**：GL 模型管线把所有顶点按 `d² / 2R` 下沉（`uCurve = 1 / (2 · Shading.EARTH_R)`，`EARTH_R = 6371000`；`render-gl.js` 的模型着色器与 `render` 里设置；环境着色器 `toCam` 用同一个值）；10 km 约 7.8 m、20 km 约 31 m、40 km 约 125 m，地形与舰船一起下沉，所以画面内部是自洽的；**物理与 LOS 是平的**，在 12 km 以内差别 ≤ 约 11 m。验收里明确这个容差，并让 LOS 采样**减去同样的曲率项**（让山真的能挡住地平线以下的目标）。
- **2D 回退**：每块 ≤ 2048 顶点（32×32 格 = 1089 顶点、1922 个三角形），按**从远到近**推入做画家算法排序（`render.js` 的面排序，`arr.sort((a,b) => b.d - a.d)`），预算 2–4 千个面（与舰船模型共用）；建筑不画，城市只画深色多边形；还不够就只画剪影。
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
- 建筑静态合并成**每 1 km 瓦片一个网格**，在载入时一次性构建，按 9.2 的"许多块模型"推入，**每面一个颜色**（墙面、屋顶不同色）。城市生成不走 `js/models/` 的 `MODELS` 注册表（见 `models.md` 的说明）。
- 窗 / 灯光不做；低太阳角时可选对少量楼体加暖色自发光（可选，不在验收内）。

**物理与判定**：

- **楼顶高度栅格**：城区内另烘焙一份 25 m 格距的"屋顶高度栅格"，`terrainY` 取 `max(地面, 屋顶)`，所以 `agl`、撞楼、AI 拉起、LOS 全部自动把建筑算进去；撞击检测用 9.1 的线段步进，才不会穿楼。
- 爆炸与对地弹落在楼上按落点高度起爆；**本批建筑不可摧毁、不吸收爆炸伤害**（栅格是独立数据层，将来加可摧毁不会留技术债）。
- 地面设施（SAM、雷达、中继、指挥所……）可放在城区内，`spawnTarget` 自动取 `groundY`。

### 9.4 视线（LOS）

新模块 `js/engine/world/terrain.js`（全局 `Terrain`，新建）提供 `Terrain.los(a, b)`（沿线段步进采样，步长 100–200 m，带包围盒快速排除；城区内改用 25 m 步长以不漏楼；采样带曲率修正；单次估计 5–10 µs，城区 10 km 约 400 个采样）。**调度复用批次 5 的 `FovWatch`（`js/engine/world/fovwatch.js`）保守调度器**（余量 ÷ 最大相对速度）。

**实测的规模（`Sim` 跑 13 个关卡前 60 s；重构前测得，数字未重测）**：actor 最多 18、target 最多 52（多数是 18.5–21 km 外的中立调节单元，对地面 LOS 无意义）、导弹最多 8。所以问题不在"总量"，而在**几个按对遍历的位置**。接入点：

| 场景 | 位置 | 行为 | 频率与成本 |
|---|---|---|---|
| 玩家锁定 | `js/engine/game/lock.js` 的 `updateLock`（算 `ok` 的那一段） | 被遮挡则不能锁 / 丢锁（先例：被干扰时丢锁） | 每帧 1 次，便宜 |
| Tab 切换 | `js/ui/input.js` 的 `cycleTarget` | 被遮挡的目标不进候选 | 仅按键时，一次性 |
| AI 发射门限 | `js/engine/ai/brain.js` 的开火段（`okDist / okAng / envOK` 之后调 `world.fireMissile`） | 被遮挡不开火 | 放在 `okDist / okAng` 之后，被廉价门限挡掉多数 |
| **地面发射点选目标** | `js/engine/game/combat.js` 的 `pickTargetFor` | 被遮挡不选 | **每个发射点 × 全部 actor，最多约 40 个点 × 18 架 = 700 对**，必须缓存 |
| **炮塔选目标** | `js/engine/turret.js` 的 `pick` | 弹道被遮挡不选 | **每个炮塔 × 全部 actor 与 target，每步**；4–6 艘舰 × 4–8 个炮塔，必须缓存 |
| IR 捕获 | `js/engine/entities/missile.js` 的 `irAcquire`（`stepMissile` 里每帧调用、未锁定的红外弹） | 被遮挡看不到 | 放在视场锥检测之后 |
| 导弹飞行中 | `missile.js` 的 `stepMissile` 里 `t && m.seekerOn` 分支，现有 `lostTime` 视场丢失处理（`lostTime > 0.5` 则 `seekerOn = false`） | 被遮挡累积 `lostTime`；**半主动弹照射线同样被遮挡** | 每帧，只对"有目标的导弹" |

- **缓存规则**：每对（观察者, 目标）10 Hz 缓存，加 AABB 先排除；`FovWatch` 的"离边界还有多远"调度用来跳过远离遮挡边界的对。
- 这是新增的最大性能项，`probe-perf` 重点盯。

### 9.5 HUD 与简报

- **雷达**：`drawRadar`（`js/ui/hud/radar.js`）是固定 12 km 的裁剪圆，按相机朝向旋转（`radarDir / radarH`）。地形层做一块**小的离屏栅格**（玩家周围 48×48 采样，4–10 Hz 重绘），在 `drawBlips` 之前画进裁剪圈；陆地浅色、城区深色；`inland` 没有海 / 陆分界，改成按高度的等高色带。
- `TERRAIN` 告警沿用（`js/ui/hud/panels.js` 的 `drawAlerts`，id `terrain`，文本 `ui.hud.panels.drawAlerts.txt_2`，目前只看 `Ent.agl(p) < 200` 且机头向下），并改为按**前方地形高度**预警；撞楼视作同一类。
- **简报页** `drawMap`（`js/ui/screens/brief.js`）：函数内"这里不再画陆地…纯海域"的注释要**反转**。它按 `m.map` 标记的外包盒自动缩放并按 `m.axis` 旋转，所以在同一个东 / 北坐标系里烘焙一张 128×128 的粗栅格（海岸线 / 岛 / 城区块）叠在底层，数据取自同一份 `terrain` 声明，不另存。简报页的 DOM 壳是 `locales/_html/screens/brief.html`，地图画在已有的画布上，不新增文字。

### 9.6 AI 与环境配合（可选，与批次 5 衔接）

- 利用山谷 / 街道峡谷遮蔽接近的战术：新文件 `js/engine/ai/man-terrain-mask.js`（属 `AI` 命名空间，经 `ai/zz-api.js` 暴露），按技能启用（批次 5 的"低空突防""撤向防空伞"遇到地形时会用）。
- 舰船的航线、水面单位的出生都受"必须在水里"约束（9.1）。

### 9.7 开发用试验场景

不进正式战役，只给 `Sim` 与 `probe-render` 用（`tools/test/scenes/terrain-*.js`，新建目录）：一个海岸、一个岛屿群、一个纯内陆（含城市）、一个水淹城区。四个场景各配 3–5 个探针断言（探针放 `tools/test/probes/`），便于以后改渲染 / LOS 时回归。`tools/render/probe-render.js` 是在**真实 Chrome 页面**里比较 GL 与 2D 像素差的（不是 Node 无头），地形出图要用它。

### 9.8 验证

- **物理**：沿 `groundY` 贴地飞行不撞山；撞山 / 撞楼死因正确（`crash-ground`）；导弹以 1400 m/s 擦过 25 m 的楼与细脊时被拦住（线段步进）；舰船只出现在水里、设施只出现在陆地。
- **视线**：山后 / 楼后的目标无法被锁；导弹绕山背后丢失跟踪；LOS 开销在预算内（`pickTargetFor` 与炮塔 `pick` 有缓存）。
- **一致性**：随机抽样 1000 点，渲染网格的高度与 `terrainY` 的偏差 ≤ 一个格距的插值误差（"所见即所撞"）；曲率造成的偏差在 12 km 以内 ≤ 约 11 m。
- **LOD / 雾**：块与块之间无缝；网格边缘雾色完全覆盖（无可见边）；战场边界处高度连续；相机在边界外仍能看到粗糙的远景直到 14 km。
- **场景类型**：`ocean` 与现状逐像素 / 逐帧一致（`tools/test/golden.js` 黄金回放与 `golden-render.js`，且烘焙不调 `Math.random`）；`inland` 没有任何海面像素；云层不穿山。
- **性能**：`tools/test/probe-perf.js` 加四个地形场景，逻辑帧耗时与烘焙时间在预算内；2D 回退的面数 ≤ 预算。
- 相机不钻进山里；`TERRAIN` 告警按前方地形触发。
- `tools/render/probe-render.js` 地形出图目检（含低太阳角）；smoke 加 `terrain` 字段校验与海陆互斥断言（相关段 `--only`，smoke 很慢，少跑）。
- 文档：`docs/systems/rendering.md`（新增"地形块"一节与雾 / 海面开关）、`entities.md`、`ai.md`、`missions.md`（`terrain` 字段）、`models.md`（城市生成不走 MODELS，2D 的 2048 上限说明）、`modules.md`（新增 `engine/world/` 模块）。发 v3.8。

---

## 批次 10 · v3.9 全新战役

> "分水岭行动结束很久之后，上游和下游各自在准备充分后开始了一场全面战争……"

本批只给骨架，因为内容取决于设定（批次 W、7）与关卡工具（批次 8）：

1. **设计稿先行**：`docs/world/CAMPAIGN-3.md`——时间线、阵营、关卡清单（建议 8–10 关）、每关用到的新机制（地形、整备、撤离、友军编成、新单位、VTOL）。
2. 新战役写进 `js/missions/campaigns.js`：`Registry.campaign({ order, id, name, …, missions: ['id', …] })`（按关卡 id 引用，registry 封存时换成全局下标），关卡一关一文件 `js/missions/<id>.js`（`Registry.mission(...)`，文本在 `locales/<语言>/text/missions/<id>.json`）。加完跑 `gen-pages`；`preflight()` 会兜底检查每关恰好属于一个战役。
3. **视角（已定）**：仍以上游玩家为主视角。若以后要让**下游也可驾驶**，现状是：下游武器的 `fits` 是空数组（`js/data/weapons/` 里 `dl4`、`dl6`、`dl9` 等，语义是"玩家机库挂不上"；这些武器靠 `npcFits` 给 NPC 的实体挂载，见 `js/data/weapons/_schema.js` 的"两张 fits 表"），所有可玩机型都是上游，需要补"下游可驾驶机型 + 下游武器的挂载适配（`attr.fits`）+ 战役 / 机库的阵营切换"，这是一个额外的整批工作，单独立批次再做，不在 v3.9 里。

发 v3.9。

---

## 12. 横向事项

**每个批次的固定收尾**（沿用 2-0IMPL）：

1. 相关段的 `node tools/test/smoke.js --only 段名`（完整 smoke 约 20 分钟，很慢，**批次收尾才跑一次完整的**），加 `node tools/test/probes/probe-missions.js` 与本批新探针；新探针一律建在 `Sim`（`tools/lib/sim.js`）上、固定种子，放进 `tools/test/probes/`。
2. 三道基线：`node tools/test/snapshot-data.js`、`node tools/test/golden.js`、`node tools/test/golden-render.js`；差异经确认是计划内才 `--write`。文本：`node tools/test/check-locales.js` 与 `node tools/test/text-census.js --check`。
3. 生成物同步：`node tools/build/gen-locales.js && node tools/build/gen-pages.js --check`。
4. 更新 `docs/systems/*.md`，并修正 `docs/README.md` 的索引。
5. 手动指定版本号、写 changelog（`node tools/build/release.js vX.Y.Z`）。
6. 提交。

**新增 / 变更的工具**：

已完成（批次 1，v3.0.0）：

| 工具 | 用途 |
|---|---|
| `tools/lib/scripts.js`、`tools/lib/root.js` | 统一加载顺序解析；仓库根路径 |
| `tools/lib/strict-json.js` | 文本 JSON 的严格解析 / 规范化输出 |
| `tools/build/gen-index.js`、`gen-pages.js` | 脚本块的层规则与各语言页面副本 / 根目录启动器（smoke 校验同步） |
| `tools/build/gen-locales.js`、`fmt-locales.js` | 文本 JSON 的生成与格式化（生成物 `locales/<语言>/text.gen.js`） |
| `tools/build/extract-text.js`、`extract-html.js` | 一次性迁移辅助 |
| `tools/test/snapshot-data.js`、`golden.js`、`golden-render.js` | 重构验证三道基线 |
| `tools/test/probe-perf.js` | 性能基线（P6） |
| `tools/test/text-census.js`、`check-locales.js` | 文本普查与校验 |

可选、未做：`tools/build/bundle.js`（发版时拼单文件，量完冷启动再决定）。

后续批次计划新增（探针一律放 `tools/test/probes/`，场景放 `tools/test/scenes/`）：

| 工具 | 批次 | 用途 |
|---|---|---|
| `tools/test/probes/probe-extent.js` | 4 | 测各关实际范围 |
| `tools/test/probes/probe-psm.js`（过失速，含 AI 场景） | 3 / 5 | 玩家与 AI 的过失速 |
| `probe-sarh.js`、`probe-ab.js`、`probe-fovwatch.js`、`probe-spacing.js`（同目录） | 5 | 半主动弹、AI 加力、视场事件化、反挤团指标 |
| `probe-drones.js`、`probe-vtol.js`、`probe-carrier.js`（同目录） | 6 | 无人机压制退化、VTOL、无人机航母 |
| `tools/test/scenes/terrain-*.js` 与地形探针 | 9 | 海岸 / 岛群 / 内陆 / 水淹城区 |

**文件组织规则**：单文件 ≤ 800 行（生成物除外）；新单位 = 数据文件 + 模型文件 + 文本 JSON + 跑 `gen-locales` 与 `gen-pages` + 更新 `js/boot/main.js` `preflight()` 的 `needModels` / `needWeapons`；新机制 = 在 `js/core/tags.js` 里 `Tags.declare` + 数据里打标签。

**主要风险**

| 风险 | 缓解 |
|---|---|
| ~~批次 1 工作量最大、最容易悄悄改行为~~ **已完成（v3.0.0）** | 实际手段：`snapshot-data`（数据 / 模型哈希）、`golden`（逻辑回放）、`golden-render`（画面）三道基线逐步比对；每一步一次提交；全部完成才发版 |
| ~~巨型闭包拆分引入共享状态 bug~~ **已缓解** | `$` 私有对象 + closure-split 的 `$` 越界静态检查（禁止跨命名空间读 `$`）；先拆边界清晰的块；每步黄金回放 |
| ~~250 个 `<script>` 冷启动慢~~ **已缓解（量完再定）** | 现为散文件（约 300 个脚本）；`bundle.js` 量完冷启动再决定是否做，线上用 |
| ~~文本迁移漏字符串 / 回退~~ **已缓解** | `?lang=pseudo` 目视 + `check-locales` 的 locales 允许清单只许缩小 + `text-census --check` |
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
| Q1 | 脚本加载方案 | 散文件 + 生成脚本块；各语言页面副本在 `locales/<语言>/html/`，根目录 `index.html` 是启动器；`bundle.js` 量完冷启动再决定 |
| Q5 | 世界观机制 | C（气溶胶不对称 + 相位同步） |
| Q8 | 新战役视角 | 仍以上游为主；下游可驾驶另立批次 |
| P1 | 存档 | 批次 2 |
| P2 | 失败后停留画面 + 提示 | 批次 2 |
| P4 | Radio 显示时长 + 优先级队列 | 批次 5 |
| P3 | 全局难度选项 | 不做 |

### 追加已定

| # | 问题 | 结论 |
|---|---|---|
| Q2 | 批次 1 版本号 | v3.0.0（已发，收尾 v3.0.1 已发），其后顺延，新战役 v3.9 |
| Q3 | 重型轰炸机尺寸 | 机长 ≈ 58 m、翼展 ≈ 54 m，新增 `hitR` |
| Q4 | 半主动弹命名 | 沿用 CLA 词根，编号在批次 5 落地时给候选评审 |
| Q5b | 降雨变少的成因 | γ 复合（吸收 δ），见 W.3；行星暂不改；成因保留模糊 |
| Q6 | 世界地图基准 | 完全架空形状，并体现海面上升 |
| Q7 | 其它空军单位 | 巡飞攻击无人机、重型运输机、空中整备 / 加油机（反辐射无人机不做） |
| — | tools 分组 | 按用途分四组：`tools/test`（含 `probes/`、`baseline/`）、`tools/build`、`tools/render`、`tools/lib` |
| — | locales 位置 | `locales/` 在仓库根目录，文本（`text/`）与页面（`html/`、`_html` 模板）集中在里面 |
| — | 机炮 id | 机炮 id 改名 `cel*`（`cel1 / cel2 / cel3 / cel7 / cel11`；cel3 而非 k3，用易懂名字） |
| — | 半主动弹的引导 | 仅限锁定时：Fox 1 只在发射机对目标持有**有效锁定**时受引导，套进视场圈不够 |
| — | 2.4 的范围 | 扩大为所有战斗机各 +1 对挂点（为以后扮演下游的战役做平衡准备） |
| — | HUD 罗盘 | 跟镜头方位，而不是机头（机头航向另存 `p.heading`，见 `docs/systems/hud.md`） |
| — | 发射后切换武器 | 算作丢锁：半主动弹只有在当前武器本身是它、且完成锁定时才保持引导 |
| — | NPC 位格 | 枚举 `rank ∈ rookie / pawn / elite / ace`，每个 NPC 飞机都标注其一；是枚举字段不是标签；缺省 `pawn`，机型可给默认值 |
| — | AI 机动库目录 | 暂时平铺：`js/engine/ai/man-<名字>.js`，不建子目录 |
| Q9 | 批次 6 可玩机型的划分 | 草稿把"VTOL"与"国土防卫重型战机"写在同一条里，属于误合并。拆成三个独立单位：6.2 轻型舰载 VTOL、6.2b 国土防卫重型战机、6.2c 战斗轰炸机，三者互不依赖，各自发一个 `aircraft` 条目 |

### 待定

无。

### 其余提案（默认处理方式）

| # | 提案 | 理由 | 默认 |
|---|---|---|---|
| P5 | **AI 感知模型**（探测锥、丢踪延迟） | 让预警机与干扰的价值更大，但改动面大 | 不做，批次 8 之后再评估 |
| P6 | **性能基线探针** `probe-perf` | 友军、无人机、LOS 都会拉高成本，需要预算 | **已完成（`tools/test/probe-perf.js`）** |
| P7 | 详情页显示"机制标签" | 标签体系做完后零成本让设计意图可见 | **已完成（v3.0.0）** |
| P8 | 菜单键盘导航（DESIGN §8 已知问题第 2 条） | 屏幕模块拆开后单个屏好改；非必须 | 视情况 |
| P9 | 发版用的 `bundle.js` | 见 Q1 | 量完冷启动再决定 |
| P10 | 暂停菜单"无线电记录"页签 | 配合 Radio 队列，保证信息不丢失 | 做（批次 5，已写入 5.5） |

---

## 附录 · 本次重写时没能核实 / 需要拍板的事项

> 本文按 v3.0.1 之后的新结构重写时，各批次逐条对照了当前代码；下面是当时**查不清**或**需要人来决定**的地方，实施对应批次时先解决它们。

### 批次 W

W.4 原文只有标题；以上验证步骤是按新工具补的，是否沿用"`snapshot-data` 因文本差异需重写基线"的说法需到 `snapshot-data.js` 确认其是否覆盖 `CODEX` 的 html 文本。

### 批次 2

- **2.1**：`failing` 子状态、`beginFail`、`Mission.fail`、`#dReason` / `#dReasonSub`、`FAIL_HOLD_S` 目前都**不存在**（这是计划，不是现状）；`locales/zh-CN/text/` 下目前**没有** `fail.json`，是新建文件（`fail.*` 键）。`js/ui/hud/` 的 HUD 压暗用 `HUD.draw` 局部 `globalAlpha` 是否够，以及失败提示面板是新增 overlay 片段还是复用 `HUD.banner`，实现时定。
- **2.1**：`Ent.isLand` 在没有注入地形函数时恒为 false（撞地记录只在批次 9 接入陆地后才会出现 `crash-ground`），smoke 里的撞地场景要手动注入 `Ent.terrainFn`，是否可行待核对。
- **2.2d**：`js/ui/frame.js` 里粒子 / `flush` / `drawTracers` 的先后顺序（曳光是否在 `Renderer.flush()` 之后、`Renderer.end()` 之前）以及 `drawTracers` 里 `lineWidth / wMul / dist / focal` 的具体表达式，应在实施时对着代码再核一次，上面的 `size` 公式沿用原文。
- **2.4**：战斗机清单是按 `role` 文字人工分类的（`AIRCRAFT` 没有机器可读的"战斗机"字段）；`booby` / `sandstone` 的 role 是"攻击机"、`tideline` 是中立方，是否都算"战斗机"待评审。`playerOnly`（暂名）字段是新机制，需评审；下游 / 中立四型的候选点只做了模型下表面扫描，未实际装弹出图。`tideline` 的现有挂点 (2.4, −0.6) 复用了 `sailfish` 模型，与 `sailfish` 的坐标系不一致的原因未查。
- **2.4**：上游可玩六型目前**没有**在任何关卡里作为 NPC 出现（只有 `folded_wing` 通过 `spawnWingman` 出现）；若后续关卡要让它们当 NPC，同样要走 `playerOnly` 路径。
- **2.2c / 残留**：`js/` 与 `docs/` 中已无 `isDrone`，但 `tools/test/smoke.js` 里"TOR-3 与 target:any"与"KA-7 默认挂载与携带量重量"两段仍有 `makeAircraft({ …, isDrone: true })` 的残留传参（无效字段，无害），顺手清掉，不属本项范围。
- **2.3**：`Radio` 目前没有 `setDistortion` / `garble`（计划新增）；`js/ui/input.js` 的 `setWingCmd` 里 `Radio.raw` 播指令台词的位置在 `return` 之后，要移到 `return` 之前才符合 2.3 第 4 条。
- **2.6**：新键读写放在 `boot/main.js` 还是单独放一个 `js/ui/screens/` 或 `js/engine/game/` 文件，待定。

### 批次 3–4

- **批次 2 的 `failing` 未在当前代码里**：`js/` 下没有 `failing` / `FAIL_HOLD_S`，4.1 对它的引用沿用原文约定（`fail.arena`、"提示直接显示在黑屏上"），落点要等批次 2 的实现确定后回头对一次。
- **PSM 的 `psm.js` 与 `Ent.$` 的关系**：`psm.js` 放在 `Ent` 命名空间下、经 `$.stepPSM` 与 `zz-api.js` 暴露是按 `docs/systems/modules.md` 的约定推出的；`tools/test/smoke.js`「挂载系统」段里的静态检查（"只许该命名空间自己的文件读写 `NS.$`"）是否对新文件有白名单要求，没有逐条核对。
- **`noPSM` 在 smoke 里的"声明了必须被用到"断言**：批次 3 时没有机型使用它（VTOL 在批次 6），我写了两种做法（先给某机型数据用 / `reserved: true`）。`docs/systems/tags.md` 说目前没有 `reserved` 的先例，是否直接支持 `reserved: true` 声明参数没核对 `Tags.declare` 的实现。
- **`Shading.AMBIENT` 与 2D `render.js` 内联亮度公式**：核对到 `render.js` 里有一处按 `Shading.AMBIENT + Shading.DIFFUSE * dl` 的内联亮度（`dl` 取 `|n·LIGHT|`），3.2 假定改成可被 `setEnv` 改写；GL 着色器里环境光下限的 uniform 名没有读，要看 `js/render/env/shaders.js` 与 `render-gl.js` 是否真从 `Shading.AMBIENT` 取值。
- **`Camera.basis` 的位置**：原文称"纯函数 `Camera.basis(Y,P)`"，现在没有 `Camera` 全局，我改成 `js/ui/camera.js` 里经 `Game.$.camBasis` 暴露（并沿用现有同名私有函数名）；若更想要独立全局需要进 `modules.md` 与加载顺序，没有决定。
- **整备界面脚本归属**：`js/ui/screens/rearm.js` 属 `Game`、经 `Game.$` 开合，是按现有 `screens/*.js` 惯例推的；`Game.openRearm` 要不要进 `zz-api-game.js` 的公开接口表，未与 `modules.md` 的"公开接口"清单对齐。
- **smoke 引用**：原文里写死行号的断言现在只用断言内容 / 段名指代（`「干扰与机动」`、`「挂载系统」`、包装 `Ent.stepAircraft` 的逐帧计数等）；`ctrlFactor` / 升限 / `loadoutPenalty` 恒等 / HUD 油门条都能在 smoke 中按内容定位，但它们是否仍都在「干扰与机动」这一个段里（该段跨度很大）没有逐个确认，写成了"按断言内容查"。
- **`golden-render` 与 3.1/3.2**：工作区目前有未提交的 `tools/test/baseline/golden-render.json` 与 HUD 文件改动（罗盘相关）；本段"golden-render 基线应不变"的判断以那批改动提交之后为准。

### 批次 5

~~1. 半主动弹发射后切换武器~~ **已定**：切换武器算作丢锁，只有当前武器本身是该半主动弹且完成锁定才保持引导（5.6）。
~~2. `ace` / `elite` 是标签还是实例字段~~ **已定**：`rookie / pawn / elite / ace` 是 NPC 飞机的位格枚举 `rank`，每个 NPC 都标注其中之一，不进 `Tags`（5.1）。`noRetreat` 仍是机型 / 设施标签，等第一个自杀式 / 任务绑定单位出现时再 `Tags.declare`（现在没有数据用它，不能提前声明，否则 smoke 的"声明了必须有人用"会失败）。
~~3. 机动库放不放子目录~~ **已定**：暂时平铺，`ai/man-<名字>.js`。
4. **`Radio` 的 DOM 依赖与 smoke**：5.5 的队列验证在 smoke 里怎么跑（`tools/lib/sim.js` 是否提供 DOM 桩、`Radio` 在无 DOM 时 `push` 直接 `return`）没有逐项核实；可能需要把队列逻辑抽成纯函数。
5. **`Radio.update` 在暂停时是否推进**：原文说"进行中且未暂停时每帧调用"。当前代码里 `Radio.update(dt)` 在 `engine/game/update.js` 的 `update(dt)` 开头，调用方（`ui/frame.js` / `boot/main.js` 的主循环）是否在暂停时跳过 `update` 本段没有再核，原样沿用原文的说法。
6. **`Ent.fireGunFrom`**（`entities/guns.js`）是否也会扣 `gunAmmo`（炮塔 / 机载炮的另一入口）：只确认了 `Ent.fireGun` 里 `a.gunAmmo -= n`；5.4 的"弹药事件"挂点是否要覆盖 `fireGunFrom`，落地时再查。
7. **`combatEvents` 对新 `type` 的处理**：当前只认 `hit / intercept / wingflare`，未知 `type` 是否被直接丢弃（未细读 `finish.js` 全部分支）；5.4 的新事件如何消费需要实现时确认。
8. **`drawLaserStatus` 在非激光场景的开销**：它每帧被 `hud/base.js` 调用并遍历 `world.missiles`；泛化成半主动状态条时要确认不会因此每帧多一次全量扫描（可先判 `p.special` 与"有无在途 `sarh` 弹"的缓存）。
9. **`playerHit` 台词与 `SFX.playerHit` 的"无触发"结论**来自对 `js/` 的全文 grep（仅有定义，无调用）；未检查 `locales/_html` 与 `tools/` 里是否有间接引用。

### 批次 6–7

- `Registry.ship` 的 schema 是否已接受 `tags` 与 `hangar` 类的新字段、`makeTarget` 是否应对舰船带 `tags`（现在 `tags` 只按 `TARGETS[o.model]` 取，舰船取不到）：我只确认了 `makeTarget` 的行为，没读 `js/data/ships/_schema.js`，实施时先读它。
- 6.1 里"`js/engine/ai/tactics.js` 是否适合放 `support` 角色"：没逐个读 `tactics.js`，只知道它是 AI 四个模块之一。
- 6.2 `index` 脚本清单的维护方式（新增 `vtol.js` 需要登记在哪里：`locales/_html/` 片段还是 `tools/build/gen-pages.js` 的清单）未核对。
- **6.2 / 6.2b / 6.2c 的待定项**：（a）6.2b 与 6.2c 默认按草稿的"可玩机型"处理，若想让重型战机只做 NPC，改 `npcOnly` 即可；（b）三者的上游命名前缀（`D-` 战斗 / `F-` 截击）按设定集 8.1 定，6.2b 倾向 `F-`，待评审；（c）6.2 的 VTOL 能否在整备点（`resupply`）补给、还是只能在航母甲板起降，未定；（d）6.2c 的 `vMax` 与 `maxLoad` 数值只是起步值，未用探针实测；（e）`fitsKind` 是否把 `bomb` 接受到 `belly` 挂点组，未读 `js/engine/entities/mounts.js` 核对。
- 6.6 smoke 的 `arms` 检查现在只有舰船、平台两处；`relay` 没有 `arms` 字段，核对方式见正文，未读 `Registry.target` schema 是否允许加 `arms`。
- 6.1b 的 31 处 `team===1` 判断是重构前数字，未重数；`unitview.js` 预览对设施是否已调 `composeTurrets`、`zz-api` 暴露的 `Game` 公开接口名也未逐条核对。
- 7.1 `<unit>.dev` 的缺键判断（`T` 是否有"键存在"的探测接口）以及 `data/geo` 走 `Registry` 还是常量，均未核对（`docs/systems/text.md` / `modules.md` 里应有答案）。
- 6.5/6.7 里的 `probe-missions` 在 `tools/test/probes/` 下确认存在；`probe-drones / probe-vtol / probe-carrier` 尚未创建（计划项）。

### 批次 8–9

- 8.2 的 `spawnDrones`：当前代码里不存在（`grep` 无结果），按原文保留为"批次 5 新建"；若批次 5 改了名，这里跟着改。
- 8.1 呼号词条文本放在 `locales/<语言>/text/` 的哪一级（我写的是 `text/data/callsigns/`），未对照 `docs/systems/text.md` 的目录约定逐项核对；`air.js` 里的 `CS_RESERVED` 已是 `T(...)` 取值，新词表的保留词要照做。
- 9.0"地面目标写死 `y: 0`"：原文是 7 处；现在 `m2`（3）+ `m4`（1）+ `m5`（2）= 6 处内联，加 `_lib.js` 的 `spawnPlatform` 内部 1 处。是否与原来 7 处一一对应未追溯。
- 9.0"高海拔下按海拔判断"：原文 5 处 `detected`，现在 `m2 / m5 / m7 / m10` 四处。另有 `m3.js`（`sower` 的 `pos.y < 16000 / 14000`）、`m6.js`（`pos.y > 17000`）、`hud/panels.js` 与 `hud/targeting.js`（`pos.y > 18000`）、`ai/brain.js` / `ai/tactics.js`（`pos.y > 18000 / 19000` 高空判断）按海拔判断，原文没提，是否需要改读 `agl` 要在批次 9 实施时判断（它们多是"高空"而非"近地"）。
- 9.1"落水柱"：`engine/combat.js` 的落水柱段已带 `!Ent.isLand` 条件、判定 `pos.y <= groundY + 1.5`；原文说"写死 `y = 0.5`"，是否还有别处写死，未逐行核对。
- 9.2 "每块约 12 次 uniform 调用"与"GL 路径不做视锥裁剪"：未重新点数 / 未逐行核对 `render-gl.js` 的 `drawItem` 与 `render`；`render-gl.js` 中 uniform 声明共 29 个，仅供参考。
- 9.2 画家算法"推入顺序"：`render.js` 里 `arr.sort((a, b) => b.d - a.d)` 是对面排序，原文"从远到近推入"的表述保留，细节待实施时再核。
- 9.4"实测规模"（actor 18 / target 52 / 导弹 8）是重构前的数字，未用 `Sim` 重测；`stepMissile` 里 `irAcquire` 的调用点是按"未锁定红外弹每帧"保留的描述，行为未重读。
- 9.0 里"smoke 里也没有 2048 顶点断言"：未重新 grep `tools/test/smoke.js`。
- 9.5 简报地图"画在已有的画布上"：我只确认了 `drawMap` 在 `js/ui/screens/brief.js`、DOM 壳在 `locales/_html/screens/brief.html`，没有逐元素核对画布 id。

### 批次 10

`Registry.mission` 的确切入口名与 `campaigns.js` 里 `order` 字段的取值规则，请对照 `js/missions/_schema.js`。

### §12–13

①「约 300 个脚本」取自 `tools.md` 示例输出的 304，发版前以 `smoke` 实际数字为准；②追加已定里的几条（机炮改名、Fox 1 锁定、2.4 +1 对挂点）措辞来自委托说明，未在代码里逐条验证。
