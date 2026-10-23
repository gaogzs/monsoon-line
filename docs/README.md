# 文档索引

《季风线》的文档分三层：

- **总设计** —— 架构、模块划分、数据流、跨模块的关键约定
- **模块设计** —— `js/` 下每个模块一份，讲清职责边界、接口、算法与"为什么"
- **世界设定** —— 可以脱离代码单独阅读的设定集

---

## 新同学从这里开始（按顺序读）

1. 根目录的 `README.md` —— 这是什么、怎么跑（双击 `index.html`）
2. [DESIGN.md](DESIGN.md) —— 整体架构、坐标系、加载顺序、**必读的关键约定**
3. [systems/game.md](systems/game.md) —— 主循环、屏幕状态机、输入、相机
4. [systems/math3d.md](systems/math3d.md) → [systems/rendering.md](systems/rendering.md)
   —— 数学与渲染管线（这个项目所有几何都建立在这两处）
5. [systems/flight-model.md](systems/flight-model.md) → [systems/entities.md](systems/entities.md)
   —— 飞行模型与运行时实体系统
6. 之后按要改的东西查对应的 `systems/` 文档

**读法建议**：这些文档记的是"为什么这么做"，而不是"做了什么"
（后者读代码更快）。凡是"看起来可以随手改、其实有具体原因"的地方，
原因都写在里面 —— 不写下来，半年后就会被某个人（很可能是自己）改回去。

---

## 常用命令

```bash
node tools/test/smoke.js --only 段名      # 冒烟测试很慢（完整跑近二十分钟），日常分段跑；--list 看段名
node tools/test/snapshot-data.js         # 数据 / 模型快照比对（秒级，重构安全网）
node tools/test/golden.js                # 黄金回放：逻辑逐秒比对
node tools/test/golden-render.js         # 画面回归：绘制调用逐帧比对
node tools/build/gen-pages.js             # 加 / 删 js 文件、改页面片段或文本之后：重新生成页面副本与启动器（先跑 gen-locales）
node tools/build/gen-locales.js           # 改了 locales/<语言>/text 下的 JSON 之后重新生成 text.gen.js
node tools/test/probes/probe-missions.js        # 可完成性探针：清空敌人后逐关验证能否取胜（改关卡后跑）
node tools/build/release.js vX.Y.Z        # 发版：版本号手动指定 + 追加更新日志
node tools/build/stamp-version.js         # 只刷新标题页的版本戳时间（提交前跑）
node tools/render/render-planform.js       # 导出机库俯视图 PNG（本机没浏览器时看画风）
node tools/render/render-ships.js          # 导出舰船外形 PNG（走游戏自己的渲染管线）
node tools/render/render-units.js          # 导出单位详情页的 3D 预览 PNG
node tools/render/shot-unitview.js         # 无头 Chrome 截详情页布局（需要本机有 Chrome）
```

---

## 文档索引

### 总设计与世界

| 文档 | 内容 |
|---|---|
| [DESIGN.md](DESIGN.md) | **总设计文档** —— 架构、模块划分、数据流、关键约定、已知问题 |
| [world/SETTING.md](world/SETTING.md) | **世界设定集** —— 可以脱离代码单独阅读 |
| [world/CAMPAIGN.md](world/CAMPAIGN.md) | **战役设定** —— 分水岭行动的开战、各阶段、人物线、编年（从 SETTING.md 拆出） |
| [VERSIONING.md](VERSIONING.md) | **版本号规则** —— 版本号手动指定、发版流程 |
| [../CHANGELOG.md](../CHANGELOG.md) | **更新日志** —— 玩家在游戏内「更新记录」页看到的那份，数据源在这里 |

### 核心架构

| 文档 | 内容 |
|---|---|
| [systems/modules.md](systems/modules.md) | **模块公开接口表**与旧文件 → 新位置对照（批次 1 重构后从这里找代码） |
| [systems/tags.md](systems/tags.md) | 机制标签清单与规则 |
| [systems/text.md](systems/text.md) | 文本层：JSON 规范、键名规则、生成步骤、伪语言 |
| [systems/pages.md](systems/pages.md) | 页面副本与启动器：模板片段、占位语法、加一种语言 |


| 文档 | 对应源码 | 内容 |
|---|---|---|
| [systems/game.md](systems/game.md) | `js/game.js` | 状态机、主循环、输入、相机、UI 绑定、设置 |
| [systems/math3d.md](systems/math3d.md) | `js/core/math3d.js` | 向量、旋转、正交基、相机、投影、裁剪、射线求交 |
| [systems/rendering.md](systems/rendering.md) | `js/render/render.js` | 渲染管线：画家算法、光照、天空与云、地面、粒子 |
| [systems/audio.md](systems/audio.md) | `js/engine/audio.js` | 程序化音效合成（WebAudio，无采样文件） |
| [systems/tools.md](systems/tools.md) | `tools/`、`js/core/version.js`、`js/core/changelog.js` | 冒烟测试框架、发版与版本戳、预览器、改名工具 |

### 玩法系统

| 文档 | 对应源码 | 内容 |
|---|---|---|
| [systems/flight-model.md](systems/flight-model.md) | `js/entities.js` | 大气、动压、姿态积分、导弹动力学 |
| [systems/entities.md](systems/entities.md) | `js/entities.js` | 运行时实体、世界对象、发射/命中/装填链路、粒子 |
| [systems/ai.md](systems/ai.md) | `js/ai.js` | 控制律、状态机、编队指令、难度 |
| [systems/weapons.md](systems/weapons.md) | `js/data.js` + `js/entities.js` | 武器编号体系、导引、拦截、调节单元附近开火 |
| [systems/loadout.md](systems/loadout.md) | `js/data.js` + `js/game.js` | **挂载系统** —— 分组挂载点、齐射数、重量惩罚 |
| [systems/missions.md](systems/missions.md) | `js/missions.js` | 十一关的战场生成、触发器、加新关的清单 |

### 表现与内容

| 文档 | 对应源码 | 内容 |
|---|---|---|
| [systems/hud.md](systems/hud.md) | `js/hud.js` | 平显：布局、各仪表、输入映射与设置系统 |
| [systems/models.md](systems/models.md) | `js/models.js` | 低多边形几何与机型模型（含可变后掠翼） |
| [systems/planform.md](systems/planform.md) | `js/planform.js` | 机库俯视识别图与挂载可视化 |
| [systems/unitview.md](systems/unitview.md) | `js/ui/unitview.js` | **单位详情页** —— 实时 3D 预览、俯视图、参数表 |
| [systems/data.md](systems/data.md) | `js/data.js` | **静态数据表总览** —— 各表字段契约与静默回退 |
| [systems/codex.md](systems/codex.md) | `js/codex.js` | 游戏内资料库与动态条目 |

---

## 一条约定

**改动代码之后，请同步更新对应文档。**

这些文档不是事后补写的说明，而是下一次改动时的依据。特别是那些
"看起来可以随手改、其实有具体原因"的地方——原因都写在这里，
不写下来就会在半年后被某个人（很可能是自己）改回去。

## 另一条约定

`tools/test/smoke.js` 是这个项目唯一的自动化测试。改完代码之后跑一下：

```bash
node tools/test/smoke.js
```

它用最小 DOM / Canvas / WebAudio 桩把所有脚本加载起来，跑一遍开机自检，
逐个点击导航按钮，然后启动任务推进 240 帧。它能抓住大部分
"改一行结果整个游戏白屏"的问题。

框架细节与"怎么写一条新断言"见 [systems/tools.md](systems/tools.md)。
