# 单位详情页与实时 3D 预览

代码：`js/ui/unitview.js` · 入口在 `Game` 的 `buildCodex()`（`js/ui/screens/codex.js`）· 样式在 `css/style.css` 的 `/* 单位详情页 */` 一段

一句话职责：**给图鉴里的每个单位一页自己的详情** —— 实时旋转的 3D 预览、
矢量俯视识别图、设定全文、完整参数表。它只生成 HTML 与驱动一个 canvas，
不碰导航、不碰其它屏幕。

> 上游是 [codex.md](codex.md)（图鉴条目）与 [planform.md](planform.md)（俯视识别图）。
> 3D 预览为什么不复用主渲染管线是本文件最需要注意的部分，见下文。
> **v2.0.0 起**预览优先走 WebGL2：`renderGL()` 用自己的 `RenderGL.create()` 实例（`glView`，雾关闭），
> 着色与游戏同一套量化规则（`shading.js`）；拿不到 WebGL2 时退回下文的 CPU 实现。

---

## 代码位置与职责边界

| 项 | 事实 |
|---|---|
| 文件 | `js/ui/unitview.js`，全中文注释 |
| 加载位置 | 属于 `ui` 层，顺序由 `tools/build/gen-index.js` 决定：层顺序 `core → data → models → missions → engine → render → ui → boot`，所以它**天然在 `js/data/` / `js/models/` / `js/render/planform/` 之后**；层内按字母序排在 `ui/hud/`、`ui/codex/` 之后（`js/core/math3d.js` 在最前面的 core 层） |
| 依赖 | `M3`（相机与向量）、`MODELS`、`PLANFORM`、`AIRCRAFT`、`SHIPS`、`PLATFORMS`、`WEAPONS`、`Tags`（“机制标签”一行读 `Tags.declared()`）、`RenderGL` / `js/core/shading.js` |
| 输出 | 全局 `var UnitView`，七个方法 |
| DOM | 只**生成字符串**；插入由 `Game`（`js/ui/screens/codex.js`）负责。挂载时只找 `#uvCanvas` / `#uvPlan` 两个 id |
| 校验 | `tools/test/smoke.js` 里"单位详情页"一组断言（4 条） |

**顶层只做一件事**：`var LIGHT = M3.norm(...)`。其余对 `AIRCRAFT` / `SHIPS` / `MODELS`
的引用全部在函数体里（并带 `typeof` 守卫），**加载顺序必须在 `js/core/math3d.js` 之后**，否则 `M3` 未定义——`core` 层最先加载，这点自动满足。

---

## 完整公开接口

```js
UnitView.html(kind, id)     // → HTML 字符串（详情页全文）
UnitView.mount(kind, id)    // 把 3D 预览挂到 #uvCanvas 上并开始旋转
UnitView.mountModel(cvs, model, keepAngle)   // 把任意模型挂到任意 canvas 上转（机库预览、图鉴 s4 都用它）
UnitView.composeLoadout(ac, loadout)        // → 机体 + 挂载物合成的一个模型（机库预览用）
UnitView.stop()             // 停止动画、断开 canvas 引用
UnitView.renderModel(cvs, model, yaw, pitch)   // 渲染一帧（工具与测试直接调它）
UnitView.findUnit(kind, id) // → { kind, rec, model, modelKey } 或 null
```

`kind` 有三个取值：`'aircraft'`（查 `AIRCRAFT`）、`'ship'`（查 `SHIPS`，海上平台 `PLATFORMS` 也走这一类，参数表按 `fixed` 分支）与 `'weapon'`
（查 `WEAPONS[id]`，模型是 `MODELS.store(w)`，俯视栏改由 `PLANFORM.paintStore` 画 640×300）。
详情页的总数就是三张表里被图鉴列出的条目之和，加一条记录就多一页，不需要登记。

**图鉴之外的调用方**：`mountModel()` 不依赖 `#uvCanvas`，谁给 canvas 就挂谁 ——
机库的 `#hangar3d`（`Game`，`js/ui/screens/hangar.js`，`keepAngle = true`）与图鉴 `s4` 的 `#cxCell3d`
（`js/ui/codex/entries/s4.js` 的 `mount()`，挂 `MODELS.cell`）。同一时刻只有一个预览在转，`stop()` 照旧收尾。

**`html()` 与 `mount()` 是分开的两步**，因为 `Game`（`buildCodex()`）是先 `innerHTML =` 再挂载的：
字符串里只有占位 `<canvas id="uvCanvas">`，真正的初始化必须等它进了 DOM。

---

## 关键决策：为什么不复用 render.js 的 `Renderer`

`Renderer` 是**单例**：

```js
function init(canvas) { cv = canvas; ctx = cv.getContext('2d', {alpha:false}); resize(); }
```

`init()` 会把全局的 `cv` / `ctx` / `W` / `H` / `DPR` 全部换掉，而游戏主循环
**每帧**都会调 `Renderer.begin()` / `end()`：

```js
if (state === 'playing') { ... render(); }
else { if (player && world) render(); else { Renderer.begin(); Renderer.end(); } }
```

也就是说，资料库页面并不是"游戏循环停下来了" —— 它照样在跑，每帧都会往
`Renderer` 当前指向的 canvas 上刷一遍天空和海面。把单例指向预览 canvas，
**主循环下一帧就会把预览清空**。

要复用只有两条路，都不划算：

1. 改 `Game` 的主循环，加一个"预览活跃时跳过渲染"的例外，
   再在切屏时反复 `Renderer.init()` / `resize()` 切来切去；
2. 把 `Renderer` 重构成多实例。

而这里需要的东西其实很少：一个模型、一个绕着它转的相机、平面着色。
所以 `renderModel()` 是**约 120 行的独立实现**。

~~**代价写在明处**：`LIGHT` 与亮度公式是从 `render.js` 抄过来的，改那边这里要跟着改。~~
**v2.0.0 起已不成立**：着色统一由 `js/core/shading.js` 提供，预览与游戏读同一份。

### v2.0.0：WebGL 预览（`renderGL`）

`Renderer` 仍是单例、仍不复用；但 `RenderGL` 支持多实例，所以预览另开一个：

| 项 | 事实 |
|---|---|
| 实例 | 模块级 `glView = RenderGL.create()`，首次用时创建；机库 `mountModel()` 同路径 |
| 调用 | `glView.begin(W,H,1)` → `push(model, 原点, +z, +y, {})` → `render(cam, { fog: false })` → `drawImage` 到预览 canvas |
| 缩放 | 预览的缩放 `k` 折进焦距（`focal·k`） |
| 着色 | 与游戏相同的量化亮度（以前预览是不量化的平滑明暗） |
| 兜底 | `RenderGL` 不存在、`drawImage` 不可用或 `begin()` 失败时返回 `false`，走下文的 CPU z-raster / 画家实现 |

---

## 渲染算法

### 缩放：按包围球，不按投影外框

相机绕模型中心的球面位置由 `yaw` / `pitch` 决定，永远看向包围盒中心。

**缩放只由包围球决定，不随转角变化**：相机距离是 `bd.r × 3.4`，
包围球在屏幕上的投影半径是 `r·focal/dist`，让它占画面**短边的 52%**：

```js
var k = (Math.min(W, H) * 0.52) / Math.max(1e-6, bd.r * cam.focal / dist);
```

这样一架 8 米的无人机和一条 210 米的补给舰都会填满画框，任何角度都装得下。
以前按每一帧投影出来的屏幕外框自动适配（占 84%）：长条形的模型转到侧面时外框长、
转到正面时外框短，镜头看起来一会儿拉远一会儿推近 —— 改成包围球就不晃了。

**第一趟**：把所有顶点变换到相机空间（记下是否在相机前方）。

**第二趟**：逐面算法线与深度，按深度降序（远的先画）填充。

### 顶点只变换一次 —— 一个已经踩过的坑

顶点是**共享的**（一个顶点常被 4 个面引用）。第一版把"相机空间 → 屏幕偏移"
写在了面循环里：

```js
for (每个面) for (每个顶点) proj(idx[i]);   // ✗ 错
```

于是同一个顶点被反复改写，第二遍拿到的已经是屏幕坐标，模型会扭成一团。
正确写法是**在面循环之前统一做一次**：

```js
for (i = 0; i < nv; i++) {
  if (!front[i]) continue;
  var iz = cam.focal * k / cZ[i];
  cX[i] = cX[i] * iz;      // 就地：相机空间 x → 屏幕偏移 x
  cY[i] = -(cY[i] * iz);
}
```

`cZ` 保留原始深度给排序用，`cX` / `cY` 被复用成屏幕偏移 —— 省一次分配，
但也就意味着**这两个数组在第二趟开始前不能再被当作相机空间坐标读**。

### 背面剔除：不做

与 `render.js` 一致，`|dot|` 取绝对值、不剔除背面。这些低多边形模型有零厚度
翼面（`wing()` 只画一个四边面），剔除会让它们随机消失。

### 面在相机背后就整面丢弃

不做近平面裁剪：只要有顶点落在相机背后，这个面整块不画。
预览里相机始终在模型外足够远的位置，正常不会触发；留着是防御性的。

---

## 详情页的内容从哪来

**一个字都不新写。** `desc` 里那几段设定散文在 `js/data/` 里已经写好
（`AIRCRAFT[].desc` 全部非空、`SHIPS[].desc` 16 条全部非空），
详情页直接把它们放进右栏。参数表同理，全部现场读字段。

| 区块 | 机型 | 舰船 |
|---|---|---|
| 标题 | `D-14 旗鱼` + 英文绰号小字 | 军舰 `虎鲸级`、其他船 `MV SOUTHERN CROSS 南十字`，+ 英文名小字 |
| 副标题 | 阵营 · 定位 | 阵营 · 舰种 |
| 3D 预览 | 全部 | 全部 |
| 矢量俯视图 | **只有 7 型有数据**（6 架可驾驶 + `tideline` 复用 `sailfish`） | 无 |
| 设定 | `desc` | `desc` |
| 参数表 | `phys` / `maxLoad` / `gun`（`gun: null` 的预警机、轰炸机显示「（无）」）/ `hardpointGroups` / `caps` / `ctrlFloor` … | `disp` / `dim` / `speed` / `crew` / `arms` / `vials` / `hp` / `radius` / `value` |

### 俯视图的分配规则

`PLANFORM.planes` 里只有 6 个键（就是那 6 架可驾驶机型），但 `tideline` 的
`model` 是 `'sailfish'`，所以它也能取到数据 —— 共 7 型有俯视图。

判断用 `u.rec.model`（不是 `id`）：

```js
var hasPlan = (typeof PLANFORM !== 'undefined') && PLANFORM.planes && PLANFORM.planes[r.model];
```

**没有数据时不给空画布。** `PLANFORM.paint()` 在数据缺失时会画一个
`NO DATA`，但那在详情页里更像"坏了"。所以那一栏改成一句说明：
"无数据"

### 俯视图画布固定 640×440

`mount()` 里把 `#uvPlan` 的 `width` / `height` 属性直接写成 `640` / `440` ——
**与机库页面模板（`locales/_html/screens/hangar.html`）里 `<canvas id="planCv" width="640" height="440">` 完全一致**。

理由是 `PLANFORM.paint()` 的左右标注栏（`padL` / `padR = 132`）是**像素**量：
画布越扁，机身能分到的缩放 `k` 就越小，俯视图看着就越小。

这里曾经按 `plan.clientHeight / plan.clientWidth` 现算高度，结果算出 `640×150`
的扁画布、飞机只剩中间一小条。原因是 `.uv-plan` 是 `height:auto`：
**一改 `width` 属性，`clientHeight` 立刻按新宽高比变**（`height` 属性还是默认的
150），读回来的已经是扁画布的比。要按容器现算，必须用 `getBoundingClientRect()`
或者先写 `style.height`；但既然机库已经有一个定死的尺寸，直接对齐它更省事，
也让两边是同一套留白比例。

### 机制标签一行（`tagsRow`）

参数表末尾有一行“机制标签”：读该单位 `def.tags` 里的键，逐个用 `Tags.declared()`（`js/core/tags.js`，每个标签登记时写的那一句 `doc`）翻成一句话，没登记的键不显示。标签的概念与登记方式见 [tags.md](tags.md)；它让玩家能在资料库里看到“这型有什么特殊机制”，而不用去翻数据文件。

### 阵营与制造方分两行

第一版把 `faction` 和 `maker` 拼在一行：

```
阵营   上游公约 · 上游公约 · 高空试验局
```

因为 `maker` 自己通常已经把阵营写在里面了（`'上游公约 · 高空试验局'`）。
现在拆成"阵营"与"制造方"（舰船是"阵营"与"使用方"）两行。

---

## 动画与性能

- **限 30 fps**（`FRAME_MIN = 1/30`）。旋转不需要 60，而像「蓝鲸」那种
  386 个面的模型（三层集装箱堆出来的）在低端设备上单帧不便宜。
  这一屏是静止的资料库，没有跟手的操作要响应
- **canvas 按 DPR 放大**（上限 2），CSS 尺寸固定 250px 高 —— 高分屏下清晰，
  低分屏下不浪费
- **缓冲是模块级复用的**（`cX/cY/cZ/front`，容量 4096），每帧不重新分配

实测（node + 纯 JS 光栅化，比浏览器慢得多，只作上限参考）：
57 面 9.6 ms · 132 面 12 ms · 386 面 18.6 ms。浏览器里 `fill()` 是原生实现，
实际远低于这个数。

## 交互

- 自动绕 Y 轴匀速旋转（`YAW_RATE = 0.42 rad/s`，一圈约 15 秒）
- **拖动**：改 `yaw` / `pitch`，松手后从当前角度继续自动旋转
- 拖动用的 `mousemove` / `mouseup` 挂在 `window` 上，**只挂一次**
  （在模块加载时）。第一版写在 `mount()` 里，于是每进一次详情页就多一对监听器

---

## 生命周期：谁负责停

预览是一个常驻的 `requestAnimationFrame`，必须有人停它。两个停的地方：

| 位置 | 为什么 |
|---|---|
| `Game` 的 `buildCodex()` 开头（`js/ui/screens/codex.js`） | 每切一次条目/单位就重建一次 DOM，不停的话 rAF 会越积越多 |
| `Game` 的 `show(id)` 里（`js/ui/screens/nav.js`；`id` 既不是 `codex` 也不是 `hangar` 时，因为机库也在用 `mountModel()`） | 离开资料库这一屏 —— 否则它在后台一直烧 CPU，还画在一个已经隐藏的 canvas 上 |

`mount()` 与 `mountModel()` 自己也会先调 `stop()`，所以重复挂载是安全的。

---

## 与其它模块的依赖关系

**上游**：

| 模块 | 用它的什么 |
|---|---|
| `js/core/math3d.js` | `M3.V` / `M3.norm` / `M3.sub` / `M3.clamp` / `M3.makeCamera` |
| `js/models/` | `MODELS[key]` 的 `v` / `f`（顶点与面） |
| `js/render/planform/` | `PLANFORM.planes` 判断有没有俯视图；`PLANFORM.draw()` 画它 |
| `js/data/` | `AIRCRAFT` / `SHIPS` / `PLATFORMS` / `WEAPONS` |
| `js/core/tags.js` | `Tags.declared()`（机制标签一行） |
| `js/core/shading.js`、`js/render/render-gl.js` | WebGL 预览与游戏同一套着色 |
| `js/ui/codex/zz-seal.js` | 借 `_capLabel()`（能力门槛的中文名，缺了就退回原始标识）、`_seekerLabel()` / `_rngTxt()`（武器页的导引与射程行） |

**下游**：

| 模块 | 怎么用 |
|---|---|
| `Game`（`js/ui/screens/{codex,nav,hangar}.js`） | `buildCodex()` 生成并挂载（单位页调 `mount()`，带 `mount()` 的条目由条目自己挂）；`show()` 负责停；单位链接由 `bindCodexUnits()` 的事件委托接住；机库调 `mountModel()` + `composeLoadout()` |
| `js/ui/codex/entries/`（`inv1` `inv2` `inv3`） | 三个图鉴的表格里输出 `<span class="cx-unit" data-unit="aircraft:frigatebird">`（`ship:` / `weapon:` 同理）；`s4` 条目的 `mount()` 直接调 `mountModel()` |
| `css/style.css` | `.uv-*` 一族类 |
| `tools/render/render-units.js` | 直接用 `renderModel()` 把 33 个单位各渲染一张 PNG |
| `tools/render/shot-unitview.js` | 生成最小页面（含 `shading.js` / `render-gl.js`，swiftshader），交给无头 Chrome 截详情页的**布局**与 WebGL 预览 |
| `tools/test/smoke.js` | 4 条断言：详情页可生成 / 俯视图分配 / 渲染器不抛异常 / 点击链路 |

### 链接是怎么接上的

`js/ui/codex/` 只输出标记，不绑定事件：

```html
<span class="cx-unit" data-unit="aircraft:frigatebird"> ... </span>
```

`Game` 的 `bindCodexUnits()`（`js/ui/screens/codex.js`）在 `#codexBody` 上挂**一个** `onclick` 做事件委托，从 `ev.target`
往上找 `data-unit`（进入详情）或 `data-unit-back`（返回）。

**为什么不用逐个绑**：正文每次重建都是整块 `innerHTML`，逐个绑会漏、会重复绑。
委托挂在容器上，重建后重新挂一次就够。

**为什么不用 `onclick="..."` 内联**：这个项目的 DOM 全部是 JS 生成的，
内联属性要求函数名挂在全局，风格上也不一致。

---

## 易踩的坑

1. ~~改 `render.js` 的 `LIGHT` 或亮度公式，这里要跟着改。~~ v2.0.0 起改 `js/core/shading.js`，游戏与预览一起变。
   但注意 **`render-units.js` 走的是 CPU 兜底路径**（node 里没有 WebGL），它的 PNG 不代表浏览器里的 GL 画面。
2. **顶点缓冲被就地复用。** `cX` / `cY` 在第一趟后就不再是相机空间坐标。
   想在第二趟里重新用原始值，得另开一组数组。
3. **`proj` 必须在面循环之外统一做一次**（共享顶点）。
4. **`window` 上的拖动监听只挂一次。** 放在 `mount()` 里会累积。
5. **`mount()` 依赖 `#uvCanvas` 存在。** 冒烟测试的 `innerHTML` 桩不解析 HTML，
   所以那里取不到元素 —— `mount()` 会提前返回（不报错），这是设计好的健壮性，
   但也意味着**桩环境测不到 canvas 尺寸与首帧**。
6. **`FRAME_MIN` 与 `YAW_RATE` 是"手感"参数。** 改之前想一想：转太快会看不清
   细节，转太慢会让人以为卡住了。
7. **详情页不占左侧导航的一项。** 它是挂在当前条目之下的一个视图，
   `codexSel` 不变，所以返回时仍停在"机型图鉴 / 舰艇图鉴"上。
   想改成独立条目的话，`codexUnit` 这套状态就要整体重构。
8. **俯视图画布尺寸写死成与机库 `#planCv` 相同的 640×440。**
   别改成按 `clientHeight` 现算 —— `height:auto` 下改了 `width` 属性，
   `clientHeight` 会立刻跟着变，算出来是一个扁画布（详见上文那节）。

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 旋转速度 | `YAW_RATE`（rad/s） |
| 预览视场 | `FOV`（度） |
| 画面占比 | `renderModel()` 里的 `0.52`（包围球投影半径 / 短边） |
| 帧率上限 | `FRAME_MIN` |
| 拖动灵敏度 | `onDragMove()` 里的 `0.010` / `0.008` |
| 俯仰限位 | `PITCH_LIMIT` |
| 预览画布尺寸 | `css/style.css` 的 `.uv-3d{ height }` |
| 俯视图画布尺寸 | `unitview.js` `mount()` 里的 `640` / `440`（须与 `locales/_html/screens/hangar.html` 的 `#planCv` 一致） |
| 左右栏比例 | `css/style.css` 的 `.uv-body{ grid-template-columns }` |
| 参数表有哪些行 | `aircraftParams()` / `shipParams()` / `platformParams()` / `weaponParams()`；“机制标签”行是 `tagsRow()`；行标题与文字走 `T('ui.unitview.*')`，在 `locales/<语言>/text/ui/unitview.json` |
| 详情页的 HTML 结构 | `html()` |

## 相关工具

```bash
node tools/render/render-units.js    # 用 renderModel() 把 33 个单位的 3D 预览落成 PNG
node tools/render/shot-unitview.js   # 无头 Chrome 截详情页的布局（需要本机有 Chrome）
```

前者验证**模型**画得对不对（走离屏 canvas，看不见 CSS），
后者验证**布局**对不对。两个都要跑，因为它们验证的是不同的东西。
