# 单位详情页与实时 3D 预览

代码：`js/unitview.js` · 入口在 `js/game.js` 的 `buildCodex()` · 样式在 `css/style.css` 的 `/* 单位详情页 */` 一段

一句话职责：**给图鉴里的每个单位一页自己的详情** —— 实时旋转的 3D 预览、
矢量俯视识别图、设定全文、完整参数表。它只生成 HTML 与驱动一个 canvas，
不碰导航、不碰其它屏幕。

> 上游是 [codex.md](codex.md)（图鉴条目）与 [planform.md](planform.md)（俯视识别图）。
> 3D 预览为什么不复用主渲染管线是本文件最需要注意的部分，见下文。

---

## 代码位置与职责边界

| 项 | 事实 |
|---|---|
| 文件 | `js/unitview.js`，全中文注释 |
| 加载位置 | `index.html` 里紧随 `hud.js` 之后（**必须在 `codex.js` / `data.js` / `models.js` / `planform.js` 之后**） |
| 依赖 | `M3`（相机与向量）、`MODELS`、`PLANFORM`、`AIRCRAFT`、`SHIPS`、`WEAPONS`（只为了显示机炮名） |
| 输出 | 全局 `var UnitView`，四个方法 |
| DOM | 只**生成字符串**；插入由 `game.js` 负责。挂载时只找 `#uvCanvas` / `#uvPlan` 两个 id |
| 校验 | `tools/smoke.js` 里"单位详情页"一组断言（4 条） |

**顶层只做一件事**：`var LIGHT = M3.norm(...)`。其余对 `AIRCRAFT` / `SHIPS` / `MODELS`
的引用全部在函数体里 —— 所以它可以安全地先于 `data.js` 之外的东西求值，
但**加载顺序仍然必须在 `math3d.js` 之后**，否则 `M3` 未定义。

---

## 完整公开接口

```js
UnitView.html(kind, id)     // → HTML 字符串（详情页全文）
UnitView.mount(kind, id)    // 把 3D 预览挂到 #uvCanvas 上并开始旋转
UnitView.stop()             // 停止动画、断开 canvas 引用
UnitView.renderModel(cvs, model, yaw, pitch)   // 渲染一帧（工具与测试直接调它）
UnitView.findUnit(kind, id) // → { kind, rec, model, modelKey } 或 null
```

`kind` 只有两个取值：`'aircraft'`（查 `AIRCRAFT`）与 `'ship'`（查 `SHIPS`）。

**`html()` 与 `mount()` 是分开的两步**，因为 `game.js` 是先 `innerHTML =` 再挂载的：
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

1. 改 `game.js` 的主循环，加一个"预览活跃时跳过渲染"的例外，
   再在切屏时反复 `Renderer.init()` / `resize()` 切来切去；
2. 把 `Renderer` 重构成多实例。

而这里需要的东西其实很少：一个模型、一个绕着它转的相机、平面着色。
所以 `renderModel()` 是**约 120 行的独立实现**。

**代价写在明处**：`LIGHT` 与亮度公式 `0.44 + 0.56*|dot|` 是从 `render.js`
抄过来的。改 `render.js` 的 `LIGHT` 或改那个公式时，**这里要跟着改**，
否则预览里的明暗会与实机不一致。这一条是本文件最容易踩的坑。

---

## 渲染算法

### 两趟：先量范围，再画面

相机绕模型中心的球面位置由 `yaw` / `pitch` 决定，永远看向包围盒中心。

**第一趟**：把所有顶点变换到相机空间，量出屏幕包围盒；
据此算一个缩放系数，让整机**始终占画面约 84%**：

```js
var k = Math.min(W * 0.84 / (maxX - minX), H * 0.84 / (maxY - minY));
```

这样一架 8 米的无人机和一条 210 米的补给舰都会正好填满画框，
而且转到任何角度都不会溢出 —— 长条形目标的投影宽度随方位角变化很大
（正侧视最长、正前方最短），固定缩放一定会在某个角度溢出。

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

**一个字都不新写。** `desc` 里那几段设定散文在 `data.js` 里已经写好
（`AIRCRAFT[].desc` 14 条、`SHIPS[].desc` 11 条，全部非空），
详情页直接把它们放进右栏。参数表同理，全部现场读字段。

| 区块 | 机型 | 舰船 |
|---|---|---|
| 标题 | `D-14 旗鱼` + 英文绰号小字 | `BLO-11 鸬鹚` + 英文名小字 |
| 副标题 | 阵营 · 定位 | 阵营 · 舰种 |
| 3D 预览 | 全部 | 全部 |
| 矢量俯视图 | **只有 7 型有数据**（6 架可驾驶 + `k8` 复用 `c14`） | 无 |
| 设定 | `desc` | `desc` |
| 参数表 | `phys` / `maxLoad` / `gun` / `hardpointGroups` / `caps` / `ctrlFloor` … | `disp` / `dim` / `speed` / `crew` / `arms` / `vials` / `hp` / `radius` / `value` |

### 俯视图的分配规则

`PLANFORM.planes` 里只有 6 个键（就是那 6 架可驾驶机型），但 `k8` 的
`model` 是 `'c14'`，所以它也能取到数据 —— 共 7 型有俯视图。

判断用 `u.rec.model`（不是 `id`）：

```js
var hasPlan = (typeof PLANFORM !== 'undefined') && PLANFORM.planes && PLANFORM.planes[r.model];
```

**没有数据时不给空画布。** `PLANFORM.paint()` 在数据缺失时会画一个
`NO DATA`，但那在详情页里更像"坏了"。所以那一栏改成一句说明：
"这一型没有画俯视识别图 —— 资料的来源是敌方制式机的识别卡片，不是每一型都有。"

### 阵营与制造方分两行

第一版把 `faction` 和 `maker` 拼在一行：

```
阵营   上游公约 · 上游公约 · 高空试验局
```

因为 `maker` 自己通常已经把阵营写在里面了（`'上游公约 · 高空试验局'`）。
现在拆成"阵营"与"制造方"（舰船是"阵营"与"使用方"）两行。

---

## 动画与性能

- **限 30 fps**（`FRAME_MIN = 1/30`）。旋转不需要 60，而像「蝠鲼」那种
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
| `game.js` 的 `buildCodex()` 开头 | 每切一次条目/单位就重建一次 DOM，不停的话 rAF 会越积越多 |
| `game.js` 的 `show(id)` 里（`id !== 'codex'` 时） | 离开资料库这一屏 —— 否则它在后台一直烧 CPU，还画在一个已经隐藏的 canvas 上 |

`mount()` 自己也会先调 `stop()`，所以重复挂载是安全的。

---

## 与其它模块的依赖关系

**上游**：

| 模块 | 用它的什么 |
|---|---|
| `math3d.js` | `M3.V` / `M3.norm` / `M3.sub` / `M3.clamp` / `M3.makeCamera` |
| `models.js` | `MODELS[key]` 的 `v` / `f`（顶点与面） |
| `planform.js` | `PLANFORM.planes` 判断有没有俯视图；`PLANFORM.draw()` 画它 |
| `data.js` | `AIRCRAFT` / `SHIPS` / `WEAPONS` |
| `codex.js` | 只借一个 `_capLabel()`（能力门槛的中文名，缺了就退回原始标识） |

**下游**：

| 模块 | 怎么用 |
|---|---|
| `game.js` | `buildCodex()` 生成并挂载；`show()` 负责停；单位链接由 `bindCodexUnits()` 的事件委托接住 |
| `codex.js` | 两个图鉴的表格里输出 `<span class="cx-unit" data-unit="aircraft:c11">` |
| `css/style.css` | `.uv-*` 一族类 |
| `tools/render-units.js` | 直接用 `renderModel()` 把 25 个单位各渲染一张 PNG |
| `tools/shot-unitview.js` | 生成最小页面，交给无头 Chrome 截详情页的**布局** |
| `tools/smoke.js` | 4 条断言：详情页可生成 / 俯视图分配 / 渲染器不抛异常 / 点击链路 |

### 链接是怎么接上的

`codex.js` 只输出标记，不绑定事件：

```html
<span class="cx-unit" data-unit="aircraft:c11"> ... </span>
```

`game.js` 在 `#codexBody` 上挂**一个** `onclick` 做事件委托，从 `ev.target`
往上找 `data-unit`（进入详情）或 `data-unit-back`（返回）。

**为什么不用逐个绑**：正文每次重建都是整块 `innerHTML`，逐个绑会漏、会重复绑。
委托挂在容器上，重建后重新挂一次就够。

**为什么不用 `onclick="..."` 内联**：这个项目的 DOM 全部是 JS 生成的，
内联属性要求函数名挂在全局，风格上也不一致。

---

## 易踩的坑

1. **改 `render.js` 的 `LIGHT` 或亮度公式，这里要跟着改。**
   两份实现是刻意的（理由见上），但一致性靠人守。
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

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 旋转速度 | `YAW_RATE`（rad/s） |
| 预览视场 | `FOV`（度） |
| 画面占比 | `renderModel()` 里的 `0.84` |
| 帧率上限 | `FRAME_MIN` |
| 拖动灵敏度 | `onDragMove()` 里的 `0.010` / `0.008` |
| 俯仰限位 | `PITCH_LIMIT` |
| 预览画布尺寸 | `css/style.css` 的 `.uv-3d{ height }` |
| 左右栏比例 | `css/style.css` 的 `.uv-body{ grid-template-columns }` |
| 参数表有哪些行 | `aircraftParams()` / `shipParams()` |
| 详情页的 HTML 结构 | `html()` |

## 相关工具

```bash
node tools/render-units.js    # 用 renderModel() 把 25 个单位的 3D 预览落成 PNG
node tools/shot-unitview.js   # 无头 Chrome 截详情页的布局（需要本机有 Chrome）
```

前者验证**模型**画得对不对（走离屏 canvas，看不见 CSS），
后者验证**布局**对不对。两个都要跑，因为它们验证的是不同的东西。
