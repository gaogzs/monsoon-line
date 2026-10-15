# 低多边形机体模型

代码：`js/models.js`（959 行）· 全局对象 `MODELS`

约定（文件头注释）：**机头朝 +z，右翼朝 +x，座舱朝 +y**，单位米。
面不做背面剔除，靠画家算法排序绘制（见 [rendering.md](rendering.md#画家算法)）。

## 代码位置与职责边界

**做什么**：一个纯几何构造器 `MB`，加上游戏里全部实体的低多边形外形数据——
可驾驶机型、敌我机体、无人机、海上平台、地面设施、导弹与炸弹。
另外提供 DB-11 可变后掠翼的 **morph** 数据（两套顶点位置 + 索引映射），
供 `render.js` 每帧插值。

**不做什么**：不渲染（那是 `render.js`）、不做动画、不参与逻辑、不加载任何外部资源
（零依赖：颜色是写死的 hex 串，没有贴图、没有材质系统）。
**不含飞行性能参数**——翼载、推重比、极速都在 `data.js` 的 `AIRCRAFT` 里，
本文件只描述"长什么样"。
**不含俯视识别图**——那是 `planform.js` 的另一份独立数据（见 [planform.md](planform.md)）。

## 完整公开接口

### 全局对象 `MODELS`

就是一个字典 `M`，键是模型 id，值是模型对象：

```js
{ v: [[x, y, z], ...],                 // 顶点数组
  f: [{ i: [顶点索引...], c: '#rrggbb' }, ...],  // 面（3 或 4 个索引 + 颜色）
  span, len,                            // 外形尺寸元数据（见下）
  air / ground / sea / radius,          // 目标类型元数据
  morph: { map, spread, swept } }       // 仅 c11 有
```

现有 **22** 个键：

| key | 名称 / 类别 | span | len | 元数据 | 备注 |
|---|---|---|---|---|---|
| `c11` | DB-11「军舰鸟」舰载多用途战斗机 | 15.2 | 20.5 | — | 唯一带 `morph` 的模型 |
| `c14` | D-14「旗鱼」平流层制空战斗机 | 13.8 | 22.9 | — | 菱形翼 + V 尾 |
| `c9` | F-9「海燕」高空高速截击机 | 13.2 | 22.9 | — | 带残留字段 `sweepAlt: null` |
| `c21` | D-21「贼鸥」多用途隐形战斗机 | 13.8 | 21.4 | — | 无垂尾菱形翼 |
| `c33` | D-33「信天翁」高机动格斗机 | 16.4 | 19.6 | — | 前掠翼 |
| `s6` | G-6「鲣鸟」近距空中支援攻击机 | 17.2 | 19.4 | — | 双发翼根布局 |
| `m27` | ROK-27「燧石」重型截击机（下游） | 14.8 | 22.0 | — | 翼身融合 |
| `gal31` | GAL-31「玄武岩」重型截击机（下游） | 15.2 | 25.8 | — | 双三角翼 |
| `vac14` | VAC-14「砂岩」轻型攻击机（下游） | 12.8 | 15.2 | — | 涡桨 |
| `ucav` | 「折翼」级无人僚机 | 8.8 | 7.6 | — | 飞翼 |
| `sower` | 「灰烬」级播撒机（下游） | 38.0 | 42.5 | — | 四发 |
| `spray` | 「浪花」海上巡逻机 | 17.2 | 16.4 | — | 双发涡桨 |
| `rok40` | ROK-40「巨砾」重型轰炸机（下游） | 48 | 44 | — | 四发、不参与空战 |
| `relay` | 「高原」级浮空中继平台 | 27 | 82 | `air` | `radius: 30` |
| `cell` | DIL-4 型调节单元 | 60 | 118 | `air` | `radius: 34`，三个要害 |
| `sam` | 中远程 SAM 发射车（4 联装） | 9 | 9 | `ground` `sea` | `radius: 5` |
| `radar` | 早期预警雷达站 | 18 | 18 | `ground` `sea` | `radius: 8` |
| `depot` | 燃油 / 弹药补给库 | 40 | 24 | `ground` `sea` | `radius: 12` |
| `cmdpost` | 指挥 / 通信中枢 | 22 | 18 | `ground` `sea` | `radius: 9` |
| `station` | 第 7 号控制平台 | 88 | 88 | `ground` `sea` | `radius: 56`，地标级 |
| `missile` | 导弹小模型 | 1.3 | 3.4 | — | 兜底模型（见下） |
| `bomb` | 炸弹小模型 | 1.4 | 2.2 | — | |

> `span` / `len` / `air` / `sea` 这些元数据**目前没有任何消费者**，
> 只有 `radius` 与 `ground` 在 `missions.js` 里被显式重抄一遍。详见"易踩的坑"。

### 构造器 `MB`（文件内部使用，加新模型时要用）

| 签名 | 语义 |
|---|---|
| `new MB()` | 空模型：`this.v = []`、`this.f = []` |
| `pt(x, y, z)` | 压入一个顶点，返回它的**索引** |
| `vt(p)` | `pt(p.x, p.y, p.z)` 的简写 |
| `face(i, c)` | 压入一个面，`i` 是索引数组，`c` 是颜色串 |
| `quad(a, b, c, d, col)` | 四边面 |
| `tri(a, b, c, col)` | 三角面 |
| `fuselage(secs, col, colCap)` | 轴向棱柱机身，`secs = [{z, w, h, y?}]`；返回每节的 4 个顶点索引 |
| `box(cx, cy, cz, w, h, d, col, colTop)` | 长方体，`colTop` 可单独给顶面颜色 |
| `tube(a, b, ra, rb, seg, col, capCol)` | 任意轴圆柱 / 锥台，`seg` 是圆周分段数；`capCol` 非空才封底 |
| `wing(p1, p2, p3, p4, col)` | 零厚度翼面（4 个点，双面渲染） |
| `wingM(p1, p2, p3, p4, col)` | 同上，但 **x 取反**（镜像到左翼） |

私有辅助：`done(mb, extra)` 把 `mb` 收成最终对象并合并 `extra` 元数据；
`seaBase(b, w, d)` 生成海上平台底座。

## 关键算法与数据结构

### 顶点 / 索引模型

顶点和面**分开存**，面只存索引：

```js
MB.prototype.pt = function (x, y, z) { this.v.push([x, y, z]); return this.v.length - 1; };
MB.prototype.face = function (i, c) { this.f.push({ i: i, c: c }); return this; };
MB.prototype.quad = function (a, b, c, d, col) { return this.face([a, b, c, d], col); };
```

用下标而不是直接存点，是为了让 `morph` 能**按索引覆盖顶点位置**（下文）。
代价是共用顶点必须真的共用——改一个顶点等于改所有引用它的面。
`done()` 产出的还是 `{v, f}` 同一批数组（不深拷贝），模型是**加载时构造一次的单例**。

### 机身：轴向棱柱

`fuselage()` 把每个剖面做成**菱形四点**（上 / 右 / 下 / 左），再在相邻剖面之间缝四个四边面：

```js
idx.push([
  this.pt(0, y + h, z),   // 上
  this.pt(w, y, z),       // 右
  this.pt(0, y - h, z),   // 下
  this.pt(-w, y, z)       // 左
]);
```

首尾各封一个四边面（`colCap || col`）。返回的 `idx` 让调用方能把进气道、
座舱盖、喷口挂到具体剖面上。

### 圆柱 / 锥台

```js
var dir = M3.norm(M3.sub(b, a));
var ref = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
var u = M3.norm(M3.cross(ref, dir));
var w = M3.cross(dir, u);
```

用 `Math.abs(dir.y) > 0.9` 选参考向量，避免轴线与参考向量共线导致叉积退化为零。
`capCol` 只封**终点那端**（`rings[1]`），起点端不封——因为多数用法里起点插在机身里。

### 翼面

`wing()` 只是一个四边面，`wingM()` 把 x 取反再画一遍：

```js
MB.prototype.wingM = function (p1, p2, p3, p4, col) {
  var f = function (p) { return V(-p.x, p.y, p.z); };
  return this.wing(f(p1), f(p2), f(p3), f(p4), col);
};
```

零厚度、单面，**不做背面剔除**所以两面都能看见，代价是同一位置的共面片
只能靠画家算法排序，极端角度下可能闪烁。

### 可变后掠翼 `morph`（DB-11 专属）

机翼**绕枢轴旋转**，所以后掠的同时翼展也缩：

```js
var PIVOT = V(1.2, -0.16, 1.0);          // 翼根枢轴
var R_SPAN = 6.6;                        // 翼尖到枢轴的距离
function sweepPt(deg, chordF, chordB) {
  var r = deg * Math.PI / 180;
  var ex = PIVOT.x + R_SPAN * Math.cos(r);
  var ez = PIVOT.z - R_SPAN * Math.sin(r);
  var nx = Math.sin(r), nz = Math.cos(r);   // 弦向单位向量
  return [ /* 4 个顶点：枢轴前后缘 + 翼尖前后缘 */ ];
}
var SP = sweepPt(20, 2.2, 1.6);          // 展开位
var SW = sweepPt(62, 1.7, 1.1);          // 后掠位
```

记录映射：先给每个顶点建一个 `-1`，再把两翼共 8 个顶点的索引映射到
`morphSpread` / `morphSwept` 的对应位置：

```js
var morphMap = [];
for (var mi = 0; mi < b.v.length; mi++) morphMap.push(-1);
for (var side = 0; side < 2; side++) {
  var idx = side ? wLeft : wRight;
  for (var k2 = 0; k2 < 4; k2++) {
    morphMap[idx[k2]] = morphSpread.length;
    morphSpread.push([/* SP[k2] 或镜像 */]);
    morphSwept.push([/* SW[k2] 或镜像 */]);
  }
}
return done(b, { span: 15.2, len: 20.5,
  morph: { map: morphMap, spread: morphSpread, swept: morphSwept } });
```

消费端在 `render.js:321-338`：`sw = clamp(opts.sweep, 0, 1)`，对被映射的顶点做
`A + (B-A)*sw` 线性插值（不改 `model.v`）。`opts.sweep` 来自
`entities.js:267`：

```js
a.sweep = M3.clamp((a.speed - 170) / 250, 0, 1);
```

即 170 m/s 全展开、420 m/s 全后掠。`game.js:2215` 只在遍历飞机
（`world.actors`，含敌机）时传 `sweep`；目标物与导弹传的是空 `{}`。

**为什么重做过**：先前那版只差 18°（2.6° → 20.5°），翼尖后移 2.7 米，
在 15 米翼展上几乎看不出来——注释里却写着"差异足够明显"，是注释骗了自己。
现在按真实机构重做，取 20° → 62°，和 F-14 的 20° → 68° 同一量级：
按公式实际算出的翼尖 x 是 7.402 / 4.298，即翼展 **14.8 m → 8.6 m**
（注释里的 7.4 / 4.3 与 14.8 / 8.6 就是这两个值）。

### 海上平台底座 `seaBase(b, w, d)`

整个战役发生在**纯海域**上，画面里没有任何陆地，所以所有"地面"目标其实都浮在海面上：

- 甲板（`b.box(0, -1.1, 0, w, 1.8, d, ...)`，顶面在 y=0 附近，构件自然坐在上面）
- 甲板边缘 4 组护栏
- 甲板下三排浮筒（半径 `max(0.8, w*0.07)`）
- 四角系泊桩

甲板刻意做得比构件底座略低，让设施看起来"建在平台上"而不是"从水里长出来"。
5 个目标（`sam` / `radar` / `depot` / `cmdpost` / `station`）都调用了它。

## 重要常量 / 参数速查

| 想改什么 | 在哪 |
|---|---|
| 配色 | 文件顶部 `C`（25 个色，如 `C.body` / `C.canopy` / `C.nozzle`） |
| 某机型的外形 | 对应的 `M.xxx = (function () { ... })()` 函数体 |
| 机身剖面（粗细、长度） | 该机型里 `b.fuselage([{z, w, h, y?}, ...])` 的数组 |
| 翼型 / 翼位置 | 该机型里的 `b.wing(...)` / `b.wingM(...)` 四点坐标 |
| 可变后掠的角度 | `sweepPt(20, ...)` / `sweepPt(62, ...)`（`SP` / `SW`） |
| 后掠枢轴与翼展 | `PIVOT` / `R_SPAN` |
| 后掠触发的速度区间 | `entities.js:267` 的 `(a.speed - 170) / 250` |
| 模型尺寸元数据 | `done(b, { span, len })` |
| 目标受击半径 | `done(...)` 里的 `radius`（同时要在 `missions.js` 里再传一次） |
| 圆柱 / 喷口圆周分段 | `tube(a, b, ra, rb, seg, ...)` 的 `seg`（常见 6 / 8 / 10 / 12） |
| 海上平台大小 | `seaBase(b, w, d)` 的调用参数 |
| 新增一个模型 | 仿照现有的 `M.xxx = (function () { var b = new MB(); ...; return done(b, {...}); })()` |

## 易踩的坑与设计取舍

1. **`morph.map` 的长度 = 顶点总数。** 它是在所有几何都建完之后按
   `b.v.length` 填 `-1` 的，所以**在可变后掠翼之后再加几何**没关系（新顶点不在映射里），
   但**增删机翼顶点**必须同步维护 `morphMap` / `morphSpread` / `morphSwept` 三者。
2. **顶点是共享的。** 一个顶点被 4 个面引用是常态；`morph` 覆盖它等于同时动 4 个面。想只动一个面就得补一个独立顶点。
3. **`span` / `len` 是没人读的元数据。** 没有代码消费 `MODELS[x].span`；
   `planform.js` 用的是自己 `PLANFORM.planes` 里的尺寸。而且 `c11` 的 `span: 15.2`
   与公式算出的实际翼展 14.8（展开）/ 8.6（后掠）都不一致，
   `DESIGN.md` 变更记录又写成"15.6 → 10.1 m"——**三处数字互相对不上**，改之前先确认以哪个为准。
4. **`air` / `ground` / `sea` / `radius` 不会自动传到目标对象上。**
   `makeTarget()` 只从传入的 `o` 读 `radius` / `ground`；`missions.js` 是把
   `radius: 30`、`ground: true` 这类值**手抄**进 `spawnTarget(...)` 的。
   `sea: true` 目前**全工程无人读取**，只是文档性标记。
5. **`render.js` 有 2048 顶点上限。** `pushModel()` 里 `if (nv > MAXV) return;`
   （`MAXV = 2048`）——模型顶点超限会**静默消失**，不报错。
6. **`c9` 的 `sweepAlt: null` 是残留字段**，没有任何消费者，别以为它有含义。
7. **零厚度翼面靠画家算法。** 绕序不重要（不剔除、光照取 `|dot|`），
   但共面片没有深度差，某些角度会闪；要消除只能给翼面一点厚度或错开坐标。
8. **颜色是 hex 字符串**，`render.js` 会按亮度 / 雾浓度各 16 档做量化缓存
   （`shade()`）。同一模型里颜色种类越多，缓存命中越差。
9. **构造器在加载时跑一次，结果常驻内存。** `v` / `f` 是共享数组，
   `pushModel()` 的 morph 插值写在 render 自己的 `Float32Array` 里，不回写模型——
   所以想改模型必须改源码，运行时改 `MODELS.x.v` 会影响所有同型实体。

## 与其它模块的依赖关系

**上游**：只依赖 `M3`，且只在**构造期**用到向量运算
（`V` / `add` / `sub` / `mul` / `norm` / `cross`），所以 `math3d.js`
必须排在 `models.js` 之前（见 [DESIGN.md](../DESIGN.md#3-模块划分与加载顺序)）。

**下游**：

| 模块 | 怎么用 |
|---|---|
| `render.js` | `pushModel(model, P, fwd, up, opts)` 读 `model.v` / `model.f`，按 `model.morph` 插值 `opts.sweep` |
| `game.js` | `MODELS[w.model]` 查表；查不到时回退（`MODELS[...] \|\| MODELS.missile`）；`preflight()` 用 `needModels` 清单检查 15 个必需模型 |
| `entities.js` | 用 `ent.radius` 做受击判定与爆炸规模（`radius` 最终来自任务传入） |
| `missions.js` | `spawnTarget({ model, radius, ground, ... })` 决定用哪个模型、多大、是否贴海面 |
| `data.js` | `AIRCRAFT[].model` 里的字符串就是 `MODELS` 的键（如 `'c11'`） |

`MODELS.missile` 是**兜底模型**：`game.js:2129`（挂载物 `pushOneStore`）与
`game.js:2222`（飞行中的导弹）在按 model 名查不到时回退到它，所以挂载 / 弹药
至少能画出一枚弹的形状。**注意目标物与飞机没有这个兜底**——
`game.js:2204` / `2212` 查不到就 `continue`，那一帧什么都不画（自检会先报错）。

`preflight()` 的必需清单是：
`c11 c14 s6 m27 ucav sower relay cell sam radar depot cmdpost station missile bomb`
——新增模型后记得往 `game.js:2518` 的数组里加，否则自检不会覆盖它。
