# 渲染管线

代码：`js/render.js`（2D 层 + 画家算法兜底） · `js/render-gl.js`（模型的 WebGL2 渲染，v2.0.0 起） · `js/render-env.js`（WebGL 环境层：天空 / 海面 / 云 / 粒子，v2.1.0 起） · `js/shading.js`（着色规则，唯一一份） · 相机与投影数学在 `js/math3d.js`

> **v2.0.0 起模型改走 WebGL2**（docs/2-0IMPL.md 阶段 2.5）。**v2.1.0 起天空、海面、云、粒子也进了 WebGL**（2.5.9，见下面"WebGL 环境层"），
> 与模型共用一个深度缓冲。曳光、HUD 仍是 Canvas 2D。下文"天空与太阳""云""地面""粒子"几节描述的是 **2D 回退**的画法。
> 下文的画家算法 / 补接缝 / 近平面裁剪描述的是 **2D 兜底路径**，仍然存在、仍然正确。

渲染器是一个 IIFE，只导出一个 `Renderer` 单例。它不认识实体、任务、HUD，
只接受"一个模型 + 一个位姿"，把它变成屏幕上的多边形。所有世界坐标单位是米。

---

## WebGL2 模型层（v2.0.0）

| 项 | 事实 |
|---|---|
| 画布 | `RenderGL` 自己的离屏 canvas；`Renderer.flush()` 把它 `drawImage` 到主 2D 画布，夹在环境层（天空/云/海面）与粒子/曳光/HUD 之间 |
| 遮挡 | 深度缓冲，取代面质心排序 —— 翼下挂弹、机身与尾翼穿插不再排错 |
| 深度 | 对数深度，写 `gl_FragDepth`。近平面 0.6 m、视距几十公里，普通透视深度远处只有米级精度会闪 |
| 着色 | 仍是"每面一色"：每个顶点带所在面的法线与面中心，顶点着色器里按 `Shading` 算亮度/雾并量化 16 档，`flat` 传给片元 |
| 背面 | 只对 `face.cl`（封闭部件）丢弃背面；其余双面，同 2D |
| 半透明 | 单独一趟，远→近排序，不写深度 |
| 抖动 | 仍由 2D 变换施加（`drawImage` 在 `save()/translate` 之内） |
| 多实例 | `RenderGL.create()` 另开实例；单位详情页 / 机库预览各用自己的，雾关闭 |

**模式选择**（`Renderer.setMode` / `usingGL`）：

| 来源 | 值 | 效果 |
|---|---|---|
| 设置 显示→渲染 | `renderMode` 0 = 自动（WebGL） / 1 = 兼容（2D） | `game.js` 的 `applyRenderMode()` → `setMode('auto' \| '2d')` |
| URL `?render=2d` | — | 强制 2D，**覆盖设置**（排查用） |
| 拿不到 WebGL2 | — | `begin()` 里 `RenderGL.begin()` 失败 → 本帧走画家算法（工具脚本、老显卡） |

`usingGL()` 返回本帧实际走的路径。`pushModel()` 在 GL 路径下直接转给 `RenderGL.push()`。

**`shading.js` 是着色唯一来源**：光照方向 `LIGHT`、雾（900–9000 m，封顶 0.82，雾色 `[150,176,196]`）、
`AMBIENT 0.44 / DIFFUSE 0.56 / DEGENERATE 0.62`、自发光封顶 1.5、16 档量化。
`render.js` 与 `render-gl.js` 都读它 —— 改一处两边一起变。两条路径的画面差异由 `tools/probe-render.js` 盯着。

---

## WebGL 环境层（v2.1.0）

只有主画面那个实例（`RenderGL` 默认实例 = `create({ env: true })`）画环境；3D 预览不画。
`render-env.js` 编译失败时 `RenderGL.envReady()` 为 false，环境整层退回 2D，模型照旧走 GL。

| 项 | 做法 |
|---|---|
| 帧缓冲 | 环境实例在离屏 **MSAA 帧缓冲**里画（画布本身 `antialias:false`），最后 blit 到画布 |
| 天空 + 海面 | 一张全屏三角形。逐像素求视线与地球球面（`EARTH_R`）的交点：打中是海，没打中是天。地平线俯角、海面下弯都是几何真实的，没有网格、没有边界 |
| 天空 | 按"高于视地平线的角度 ÷ 竖直视场"取 `SKY.stops`（与 2D 渐变同一组色），太阳光晕按角距离取 2D 同一组色标 |
| 海面 | 底色按低于地平线的角度取 `SEA.stops`；40–320 m 四层程序波浪法线（按像素在海面上的覆盖宽度淡出，防闪）；1.3 / 5 km 两层大块明暗（高空时的速度感）；菲涅耳反射天空 + 太阳闪烁带；低空才看得见的白浪；`hazeDist` 指数雾融到地平线 |
| 深度 | 所有环境着色器都写与模型相同的对数深度（`gl_FragDepth`），天空写 1 |
| 云团（封存） | `render-env.js` 的 `BLOBS = false`：柔边贴片和低多边形实体云的代码都保留，但不画。现在天上只有平面云（远景云层 + 高空云片），远景云层也不再按距离淡入 |
| 云 | 仍用 `render.js` 的 `CLOUD_LAYERS` / `cloudSeeds` 与 6400 m 平铺（5×5 格），10 km 以上不画云团。**实体云**：每朵 1–3 个随机低多边形团块（细分二十面体压扁、顶点随机扰动、底部压平），三遍画：① 背面 +视深 / 正面 −视深加进 R32F 得到穿过的厚度（先与场景深度取 min）② 最近正面的平涂颜色 ③ 合成 α = 1 − e^(−厚度×密度)。边缘不做淡出。拿不到 `EXT_color_buffer_float` + `EXT_float_blend` 时退回柔边贴片 |
| 软粒子 | 不透明模型 + 海面画完后，把深度 blit 到一张深度纹理；云贴片读它，靠近机身 / 海面时淡出，不出现硬切边 |
| 远景云层 | `DECKS`：2.1 km、5.2 km 两层低质量噪声云片，与高空云片同一个着色器。按水平距离 10→16 km 淡入，接上云团的淡出 —— 高空往下看四面都有低层云，不会只有脚下一块 |
| 高空云片 | 12.6 km、17.4 km 两层（`SHEETS`），逐像素求视线与水平面交点，fbm 噪声，x 向拉长成卷云丝；穿过时不糊脸 |
| 粒子 | `drawParticles()` 在 GL 下只收集（须在 `flush()` 之前调），flush 时实例化画：小圆片 / 破片短线，加色混合，**测深度不写深度** —— 飞机背后的爆炸会被机身挡住。规则与 2D 相同（`delay`、`grow`、`streak` 30 ms） |
| 地球曲率 | 主画面的模型 / 粒子 / 云贴片按离镜头的水平距离下沉 d²/(2R)（`uCurve`），和球面海面同一个弧度 —— 否则 10 km 外的船会浮在海上约 8 m。3D 预览不弯 |
| 曳光 | 刻意留在 2D 层，画在一切之上（被机翼挡住反而看不清弹道） |
| 抖动 | 整张图铺满屏幕，抖动改为移动投影中心 `cx/cy`（不能平移图片，边上会露空） |
| 噪声精度 | 相机 xz 先对 `PERIOD = 40960` 取余再进着色器；所有噪声尺度都整除它，取余跳变时无缝 |

GL 内顺序：天空 + 海面 → 不透明模型 →（深度解析）→ 高空云片 → 云贴片 → 半透明模型 → 粒子。

**开关**：

| 接口 | 作用 |
|---|---|
| `Renderer.setQuality(0\|1)` | 设置 显示→画面（`gfxQuality`）。0 = 标准：关软粒子 |
| `Renderer.setGfx({ env, clouds, sheets, particles, soft })` | 单项开关，和旧画面并排对比用（控制台里调）。`env:false` = 天空 / 云 / 海面整层退回 2D |

参数在 `shading.js` 的 `EARTH_R / SKY / SEA / CLOUD / SHEETS`。`tools/probe-render.js` 的 `env-*` 场景截新旧对比图（只报告）。

---

## 为什么当初不用 WebGL（v1.x 的理由，已被 v2.0.0 推翻）

> 以下是 v1.x 的决策记录。v2.0.0 换成 WebGL2 的直接原因是画家算法的遮挡错误（挂弹、穿插），
> 2D 实现保留为兜底。

"低多边形 + 画家算法"在 Canvas 2D 上跑得动，而且白捡了三个好处：

1. **零依赖**。不用 Three.js，不用写着色器，不用处理 GL 上下文丢失
2. **`file://` 直接可跑**。WebGL 在某些浏览器下对本地文件有额外限制
3. **low-poly 的颗粒感正好符合"低质量小游戏"的自我定位**——
   如果上 WebGL 做一个半吊子的 PBR，反而显得寒酸

**什么时候该换掉它**：如果模型面数需要超过约 3000 面/帧，
或者需要后处理（辉光、景深）。目前远没到。

---

## 相机模型

相机**不是矩阵**，是 `M3.makeCamera()` 返回的一个普通对象：

```js
{ pos, fwd, up, right, focal, cx, cy, w, h, near, far }
```

- `pos` 是 `clone` 出来的独立副本；`fwd / up / right` 由 `M3.orthonormalize(fwd, up)` 现场构造，
  三者互相正交且 **`right = up × fwd`**（`math3d.js` 头部注释写成 `right × up = fwd`，同一个右手关系）。
  `up` 会先对 `fwd` 做 Gram–Schmidt 正交化；共线时（`len2(u) < 1e-8`）退化到参考向量兜底。
- `focal = (h * 0.5) / tan(fovYDeg * π/180 / 2)`，`cx = w/2`，`cy = h/2`。
- `near = 0.6`（米），`far = 40000`。**`far` 目前只是数据，管线里没有任何地方读它**——
  剔除全靠屏幕包围盒和深度，不靠远平面。
- `w / h` 存的是 **CSS 像素**尺寸（`window.innerWidth/innerHeight`），不是画布像素。

世界点 → 相机空间（`M3.toCam`）：设 `d = p - cam.pos`

```js
camX = d·cam.right    camY = d·cam.up    camZ = d·cam.fwd
```

相机空间 → 屏幕（`M3.projectCam`）：

```js
sx = cx + focal * camX / camZ
sy = cy - focal * camY / camZ        // 屏幕 y 向下，所以取负
```

`M3.project()` 在 `camZ < near` 时返回 `null`；`M3.projectUnclamped()` 则把 `z`
夹到 `near` 再投影，并在结果上加一个 `behind` 布尔——HUD 的方位指示器需要画
"在身后"的目标，走的就是这个函数。

**为什么不用矩阵**：矩阵写法需要约定行/列主序、乘法顺序、是否含平移；用基向量写没有歧义，调试时可以直接把向量打进控制台看。

---

## 近平面裁剪

`camZ < near`（默认 0.6 m）的点在相机后方，投影会爆炸。

- **线段**（地面网格）：`M3.clipSeg()` 求交点后截断，整段在后方时返回 `null`。
- **多边形**（模型面）：Sutherland–Hodgman 单平面裁剪，在 `pushModel()` 内联实现。
  每条边保留"在前"的端点，跨越平面时补一个交点到 `clipX/clipY/clipZ`
  暂存数组（长度 16）；裁剪后顶点数 `< 3` 直接丢弃整面。
- 一面若**全部**顶点都在近平面之后（`anyFront === false`），在裁剪之前就 `continue`
  丢掉。

**注意**：裁剪必须在**相机空间**做（用 `camZ` 判断），不能在屏幕空间做——屏幕空间已经丢失了深度符号。

---

## 画家算法

不做背面剔除。每帧把所有面塞进一个池，按**面质心的相机空间深度**
降序排序，从远到近绘制。

```js
arr.sort(function (a, b) { return b.d - a.d; });
```

深度是**裁剪前**原始 `np` 个顶点 `camZ` 的算术平均（`sumZ / np`），
所以它是一个"质心深度"，不是最近点深度。

**为什么不做背面剔除**：低多边形模型常常有洞、绕序不一定一致（镜像的翼面尤其容易出错），
剔除会导致随机缺面且很难排查。代价是绘制量翻倍。

**补接缝**：相邻多边形的共享边会露出背景，出现发丝状裂缝。
对策是对**顶点数 ≤ 4 且深度 < 900** 的面额外 `stroke()` 一次同色边
（`lineWidth 0.7`）。这两个阈值都是硬编码的魔法数。

---

## 光照与大气透视

`LIGHT` 是渲染器顶部的一个固定世界方向：

```js
LIGHT = M3.norm(M3.V(-0.42, 0.80, 0.43))
```

每个面用**前三个顶点**的叉积算世界坐标法线，归一化后求亮度：

```js
bright = 0.44 + 0.56 * |dot(worldNormal, LIGHT)|
```

取绝对值是为了双面照明——因为不剔除背面，法线方向可能朝内。
法线退化（`nl <= 1e-9`）时 `bright` 落到默认值 `0.62`。
之后 `opts.tint` 会**加**上去，`opts.emissive` 在 `shade()` 调用处再加，
且总亮度被 `min(1.5, …)` 截顶。

雾：

```js
fog = clamp((depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR), 0, FOG_MAX)
color = mix(baseColor, (150,176,196), fog)
```

三个常量分别是 `FOG_NEAR = 900`、`FOG_FAR = 9000`、`FOG_MAX = 0.82`，
雾色分量是 `FOG_R / FOG_G / FOG_B = 150 / 176 / 196`。

颜色不是每帧拼字符串，而是**量化缓存**（见 `shade()`）：
亮度 `b` 与雾浓度 `fog` 各量化成 16 档（`bi = (b*16)|0`，夹在 0…15），
拼成一个 `hex + bi*32 + fi` 形状的字符串 key 查 `colorCache`；
未命中时才 `parseInt` 解析十六进制、按**档中点** `(bi+0.5)/16` 与
`(fi+0.5)/16` 做乘法与雾混合，生成 `rgb(...)` 字符串存回。

---

## Renderer 公开接口

`Renderer` 的返回值（`render.js` 末尾）逐项如下。除只读 getter 外都是方法。

| 成员 | 签名 | 语义 |
|---|---|---|
| `init` | `init(canvas)` | 取 `getContext('2d', { alpha: false })`，然后调用 `resize()`。幂等性不保证，只在启动时调一次 |
| `resize` | `resize()` | `DPR = min(devicePixelRatio \|\| 1, 2)`；`W/H = innerWidth/innerHeight`；画布像素 = `W/H × DPR`，CSS 尺寸 = `W/H`。`window.resize` 事件里被调用 |
| `setCamera` | `setCamera(pos, fwd, up, fovDeg)` | 用 `M3.makeCamera(pos, fwd, up, W, H, fovDeg \|\| 58)` 重建 `cam`。`fovDeg` 为 0/缺省时退到 58° |
| `getCam` | `getCam()` | 返回当前 `cam`，未设置时是 `null`。HUD 与准星大量使用 |
| `begin` | `begin()` | 每帧开始。见"每帧顺序" |
| `end` | `end()` | `ctx.restore()`，收掉 `begin` 里为了抖动做的 `save()`。GL 环境层开着且本帧没 `flush()` 过（菜单背景）时先补一次 `flush()` |
| `pushModel` | `pushModel(model, P, fwd, up, opts)` | **只收集不绘制**。把一个模型按位姿 `(P, fwd, up)` 变换到世界、逐面投影、着色，塞进面池。`opts` 见下 |
| `flush` | `flush()` | 2D 路径：对面池排序并一次性画出所有面。GL 路径：`RenderGL.render(cam)`，把离屏画布 `drawImage` 上来 |
| `setMode` | `setMode('auto'\|'gl'\|'2d')` | 选渲染路径；URL `?render=2d` 时无效（URL 优先） |
| `usingGL` | `usingGL()` | 本帧是否走 WebGL（`begin()` 时决定） |
| `drawParticles` | `drawParticles(list)` | 2D：用 `globalCompositeOperation = 'lighter'` 画数组里的活粒子。GL 环境层：`flush()` 之前调用时交给 `RenderGL.pushParticles`，随模型一起画 |
| `setQuality` / `setGfx` | 见"WebGL 环境层" | 环境层画质与单项开关 |
| `addShake` | `addShake(v)` | `shake = min(shake + v, 26)`，给后续 `begin()` 消费。**目前 `js/` 里没有任何调用点**，是为受击/爆炸预留的接口 |
| `line` / `rect` / `circle` / `ring` / `text` | 见左列签名 | 屏幕空间绘制辅助，HUD 用：线段 `(x1,y1,x2,y2,col,w=1)`、`fillRect` 简写 `(x,y,w,h,col)`、实心圆 `(x,y,r,col)`、描边圆 `(x,y,r,col,w=1)`、文本 `(t,x,y,col,font='12px Consolas, monospace',align='left')`（画完复位 `textAlign`） |
| `W` / `H` / `ctx` | 只读 getter | CSS 像素宽高；原始 2D 上下文（HUD 直接拿去用） |

### `pushModel` 的模型与 `opts`

`model`（来自 `js/models.js`）形如：

```js
{ v: [[x,y,z], ...],                   // 机体坐标顶点：机头 +z、右翼 +x、上 +y
  f: [{ i: [顶点索引...], c: '#rrggbb' }, ...],
  morph: { map, spread, swept } }      // 仅可变后掠模型（DB-11）有；span/len 渲染器不用
```

`opts`：

| 字段 | 缺省 | 作用 |
|---|---|---|
| `scale` | `1` | 顶点整体缩放 |
| `sweep` | `0` | 夹到 `[0,1]`，在 `morph.spread` 与 `morph.swept` 顶点之间插值（展开位 → 后掠位）。只有 `morph.map[i] >= 0` 的顶点参与 |
| `tint` | `0` | 加在 `bright` 上，用于染色/受击 |
| `alpha` | `1` | 写入面对象的 `a`，`flush()` 里按需切换 `globalAlpha` |
| `emissive` | `0` | 与 `tint` 类似但更晚相加，且一起被 `min(1.5, …)` 截顶 |

机体 → 世界的变换用的是**相机同一套基**：
`world = P + right*x + up*y + fwd*z`，其中 `right = normalize(up × fwd)`
在函数内现算一次。也就是说模型永远跟着传入的 `fwd/up` 立起来，与当前相机无关。

**顶点数上限**：`MAXV = 2048`。`model.v.length > MAXV` 时**整个模型直接跳过**（不是截断），
防止畸形模型把 `Float32Array` 暂存缓冲写穿。

---

## 每帧顺序

```
Renderer.begin()
  ├─ 重置两个池游标（poolN = faceN = 0）
  ├─ cam 为空时兜底：makeCamera((0,3200,0), (0,-0.12,1), (0,1,0), W, H, 58)
  ├─ 镜头抖动衰减：shakeX/shakeY 取 ±shake 随机，shake *= 0.86
  ├─ ctx.setTransform(DPR, 0, 0, DPR, 0, 0) + clearRect
  ├─ drawSky()        → 全屏四段线性渐变 + 太阳光晕，返回 horizonY
  ├─ drawClouds()     → 五层云
  ├─ drawGround(hy)   → 渐变海面 + 两遍网格线
  └─ ctx.save() + translate(shakeX, shakeY)

  （begin() 里同时决定 glOn = mode≠'2d' && RenderGL.begin(W,H,DPR)）

  （GL 环境层开着时跳过 drawSky / drawClouds / drawGround，由 flush 里的 GL 画）

pushModel() × N        ← 只收集，不绘制（GL 路径转给 RenderGL.push）
Renderer.drawParticles(world.particles)   ← 2D：直接画；GL 环境层：只收集
Renderer.flush()       ← 2D：排序 + 绘制全部面；GL：渲染离屏画布并 drawImage

drawTracers()          ← game.js 自己的曳光弹，画在一切之上
Renderer.end()                            ← ctx.restore()

HUD.draw(world, player, 0, S)             ← 在 restore 之后，所以 HUD 不跟着抖
```

注意三点：**① 抖动只作用于 3D 层**——偏移在 `save()` 之后 `translate`，`end()` 的 `restore()`
把它抹掉，之后画的 HUD、横幅、命中提示都不抖（抖的画面 + 稳的 HUD 才有撞击感，一起抖只会晕）。
**② 天空/云/地面在 `save()` 之前画**，所以它们也不抖，抖的是模型和粒子。
**③ 菜单状态下** `state !== 'playing'`，`render()` 只调 `begin()` + `end()`，留下空镜头背景。

---

## 地平线

`horizonY()` 返回地平线在屏幕上的 y 坐标，`drawGround()` 用它做分界。

取相机 `fwd` 的**水平分量**归一化得到海面方向 `d`（若几乎垂直向下，
退回到 `up` 的水平分量；再退化就按 `fwd.y` 的正负返回屏幕外极限值）。
然后**把地球当球、把海平面当曲面**：站高 `h` 处的地平线俯角是

```js
dip = acos(R / (R + h))        // R = 6371000
far = cam.pos + (d*cos(dip), -sin(dip), d*cos(dip)) * 1e6
```

再把 `M3.project(cam, far)` 的 y 返回。三个参考值（`h = 1000 / 6000 / 20000 m`
→ 约 `1.0° / 2.5° / 4.5°`）。旧实现把远点放在与相机等高处，等于假设地球是平的，
无论飞多高海平面都停在同一个位置；现在高空能明显看到"海在往下沉"。

这只在**相机 `up` 接近世界 +Y** 时成立：机位 0（追尾）与 2（目标）都写死世界 `up`，
地平线永远水平，一个远点的 y 就够了。**座舱机位（`S.camMode === 1`）跟随滚转**，
此时真实地平线是倾斜的，但这套填充仍按**水平线**切分屏幕——这是已知偏差，不是修复点；
真要修，天空和地面都得改成画倾斜多边形。参见
[DESIGN.md](../DESIGN.md#53-相机不跟随滚转追尾视角)。

---

## 天空与太阳

`drawSky()` 不按地平线分段，而是**整屏一条纵向线性渐变**，地平线只用来挪动端点：

```js
g = createLinearGradient(0, min(0, hy - H), 0, max(H, hy))
// '#122c47' @0 · '#2f6c95' @0.42 · '#7fb2cc' @0.78 · '#c9d8dd' @1
```

函数里还有 `var top = cam.fwd.y * 0.55;`（注释说抬头看时天空更"高"），
但**这个变量算完就没用过**，是遗留死代码。

太阳/光晕画在固定世界方向 `LIGHT` 上：从 `cam.pos` 沿 `LIGHT` 外推 `sunDist = 9000` m
得到太阳点，投影成功且 `s.z > 0` 时，以 `r = max(24, focal * 0.055)`、半径 `5r`
画一个径向渐变（中心 `rgba(255,246,220,0.95)` → 边缘透明）。所以太阳位置与光照方向
**天然一致**，不用单独维护。

---

## 云

`CLOUD_LAYERS` 定义了**五层**云，共 `22+20+18+16+14 = 90` 个种子：

| 层 | 高度 `y0–y1` (m) | 尺寸 `s0–s1` (m) | 透明度 `a0–a1` | 个数 `n` | 说明 |
|---|---|---|---|---|---|
| 1 | 500 – 2600 | 500 – 1500 | 0.30 – 0.52 | 22 | 低层积云 |
| 2 | 3200 – 6200 | 600 – 1900 | 0.24 – 0.44 | 20 | 中层 |
| 3 | 6800 – 10200 | 700 – 2300 | 0.20 – 0.38 | 18 | 中高层 |
| 4 | 10800 – 15200 | 800 – 2600 | 0.15 – 0.30 | 16 | 高层 |
| 5 | 15800 – 21400 | 900 – 3000 | 0.11 – 0.24 | 14 | 平流层薄云 |

覆盖 500 m 到 21400 m。**为什么必须分这么多层**：早期版本只有一层（700–2600 m），
而玩家在 M1 的 `altStart` 是 7600 m、M3 是 19500 m。云全部在脚下 5–18 km 处，
俯角超过 40°，落在垂直视场（默认 `S.fov = 56°`）之外——**完全看不见**，于是玩家在单色海面上
失去了所有姿态参照。云在这个游戏里不是装饰，是**滚转感知的唯一信息来源**。

**种子**在脚本加载时用 `M3.rnd` 一次性随机生成，此后整会话不变：`ox / oz ∈ ±3400`、
`y ∈ [y0,y1]`、`s ∈ [s0,s1]`、`a ∈ [a0,a1]`、压扁系数 `sq ∈ [0.26, 0.44]`。

渲染用**环绕相机的重复网格**：基础格 `bx/bz = round(pos / CLOUD_CELL) * CLOUD_CELL`，
`CLOUD_CELL = 6400`，每个种子在 `ax, az ∈ {-1,0,1}` 的 3×3 个格里各出现一次，
位置为 `bx + ax*6400 + ox`。剔除：水平距离平方 `> CLOUD_FAR²`（`= 16000`）、
投影半径 `rr = focal * s / z` 落在 `[6, H*8]` 之外、或 `M3.project()` 返回 `null`（在身后）。

透明度：`fade = smoothstep(1 - dist / CLOUD_FAR)`（即 `f*f*(3-2f)`），
最终 `alpha = clamp(s.a * (0.45 + 0.55 * fade), 0, 0.8)`——
所以近处的云也不会完全不透明，最亮被压在 0.8。

椭圆半径是 `rr` 与 `rr * sq`，其中
`sq = s.sq * (0.55 + 0.75 * min(1, |p.y - cy| / (H*0.5)))`：
越靠近屏幕中线（视线掠射角越小），云被压得越扁，避免像贴在屏幕上的白片。
当 `rr > 26` 时再叠两个椭圆（偏上的白色受光面、偏下的 `#8ea3b4` 暗面）做出体积感。

---

## 地面

`drawGround(hy)` 先铺一块渐变海面：

```js
y0 = clamp(hy, -2, H + 2)
'#4d6472' @0   '#2b3a46' @0.06   '#16222b' @0.5   '#0b1319' @1
```

`cam.pos.y < 1` 时**直接返回**，不再画网格——贴地时网格会退化成一堆
几乎平行的线，不如不画。

网格参数：间距 `G = 500` m，`N = 9`，即以相机所在格为中心
向四周铺 `±N*G = ±4500` m。分**两遍**画：pass 0 画南北向线
（`rgba(120,160,190,0.30)`），pass 1 画东西向线（`rgba(70,110,140,0.22)`），
每条线都交给 `M3.clipSeg()` 做近平面裁剪后再 `moveTo/lineTo`，一次 `stroke()` 收尾。

（"海面高光"注释下那组 `globalAlpha = 0.5; strokeStyle = '#6f8fa3'; globalAlpha = 1;`
设完立刻复位，是重构遗留的空操作。）

---

## 粒子

粒子对象由 `js/entities.js` 的 `spawnParticle()` 创建，字段与渲染器约定一致：

```js
{ pos, vel, life, life0, size, color, alive, grow, alpha, drag, grav }
```

`drawParticles(list)` 用 `globalCompositeOperation = 'lighter'` 绘制，
所以爆炸、尾焰、干扰弹都是加色叠加，天然有发光感。逐粒子逻辑：

```js
lifeK = life / life0
r = max(0.7, (focal * size / z) * (grow ? (1.6 - lifeK) : 1))
alpha = clamp(lifeK, 0, 1) * p.alpha
```

`grow` 的粒子随时间**变小**（`1.6 - lifeK`），是"膨胀后消散"的近似。
半径 `< 1.4 px` 时用 `fillRect` 画方点（比 `arc` 便宜），否则画圆，屏幕外按 `±3r` 剔除。

数量上限 **900**，由调用方 `game.js` 的 `compact()` 维护：`out.length > 900` 时
`splice(0, out.length - 900)` 裁掉**最旧**的（数组是追加顺序，队首最老）。渲染器自己不设上限。
粒子的运动（`life` 递减、`vel` 积分、`drag` 指数衰减、`grav` 只作用于 y）在
`Ent.stepParticles()` 里，不在渲染器。

---

## 性能

| 手段 | 位置 |
|---|---|
| 面对象池（复用 `d/n/px/py/c/a`） | `getFace()` / `faceList` |
| 顶点暂存 `Float32Array(2048)` × 3 + 世界/相机/裁剪三组 | `wX…/cX…/clipX…` |
| 颜色量化缓存（16×16 档） | `shade()` / `colorCache` |
| 屏幕外剔除（±8 px 余量） | `pushModel()` |
| 面积剔除（屏幕包围盒 < 1.6 px²） | `pushModel()` |
| 距离剔除（> 16 km） | `drawClouds()` |
| 投影半径剔除（< 6 px 或 > 8×屏高） | `drawClouds()` |
| DPR 上限 2 | `resize()` |

**`getP()` 是死代码**：它与 `getFace()` 成对定义，但全项目没有任何调用点，
顶点复用实际是靠上面的 `Float32Array` 暂存缓冲做的。`getFace()` 则在
`pushModel()` 里每个可见面用一次。

**瓶颈是 `ctx.fill()` 的调用次数**，不是 JS 数学；要提速就先降面数。

---

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 视场角 | 设置页「视场角 FOV」，默认 `S.fov = 56`，范围 38–100° |
| 镜头距离 / 高度 | 设置页，`S.camDist = 52` / `S.camHeight = 13` |
| 机位（追尾 / 座舱 / 目标） | 设置页，`S.camMode = 0` |
| 光照方向（同时决定太阳位置） | `render.js` 顶部 `LIGHT` |
| 雾的距离与颜色 | `FOG_NEAR` / `FOG_FAR` / `FOG_MAX` 与 `FOG_R` / `FOG_G` / `FOG_B` |
| 天空渐变的四段颜色 | `drawSky()` 里的 `addColorStop` |
| 云的高度分层 | `CLOUD_LAYERS[].y0 / y1` |
| 云的数量 / 大小 / 透明度 | `CLOUD_LAYERS[].n / s0,s1 / a0,a1` |
| 云的网格周期与视距 | `CLOUD_CELL`（6400）/ `CLOUD_FAR`（16000） |
| 地面网格间距与范围 | `drawGround()` 里的 `G = 500` / `N = 9` |
| 面剔除阈值 | `pushModel()` 里的 `area < 1.6` |
| 描边补缝条件 | `flush()` 里的 `f.n <= 4 && f.d < 900` |
| 抖动上限 | `addShake()` 里的 `26` |
| 粒子数量上限 | `game.js` 的 `compact()` 里的 `900` |
| 单个模型的顶点上限 | `render.js` 的 `MAXV = 2048` |
