# 低多边形机体与舰船模型

代码：`js/models.js`（1781 行）· 全局对象 `MODELS`

约定（文件头注释）：**机头（舰艏）朝 +z，右翼（右舷）朝 +x，座舱（桅顶）朝 +y**，单位米。
面不做背面剔除，靠画家算法排序绘制（见 [rendering.md](rendering.md#画家算法)）。

## 代码位置与职责边界

**做什么**：一个纯几何构造器 `MB`，加上游戏里全部实体的低多边形外形数据——
可驾驶机型、敌我机体、无人机、**水面舰船**、海上平台、地面设施、导弹与炸弹。
另外提供 DB-11 可变后掠翼的 **morph** 数据（两套顶点位置 + 索引映射），
供 `render.js` 每帧插值。

**不做什么**：不渲染（那是 `render.js`）、不做动画、不参与逻辑、不加载任何外部资源
（零依赖：颜色是写死的 hex 串，没有贴图、没有材质系统）。
**不含飞行性能参数**——翼载、推重比、极速都在 `data.js` 的 `AIRCRAFT` 里，
本文件只描述"长什么样"。舰船的参数同理在 `data.js` 的 `SHIPS` 里。
**不含俯视识别图**——那是 `planform.js` 的另一份独立数据（见 [planform.md](planform.md)）。

## 完整公开接口

### 全局对象 `MODELS`

就是一个字典 `M`，键是模型 id，值是模型对象：

```js
{ v: [[x, y, z], ...],                 // 顶点数组
  f: [{ i: [顶点索引...], c: '#rrggbb' }, ...],  // 面（3 或 4 个索引 + 颜色）
  span, len,                            // 外形尺寸元数据（见下）
  air / ground / sea / radius,          // 目标类型元数据
  morph: { map, spread, swept } }       // 仅 frigatebird 有
```

现有 **38** 个键：飞机 13 · 浮空目标 2 · 海上/地面设施 5 · **水面舰船 16** · 弹药 2：

| key | 名称 / 类别 | span | len | 元数据 | 备注 |
|---|---|---|---|---|---|
| `frigatebird` | DB-11「军舰鸟」舰载多用途战斗机 | 15.2 | 20.5 | — | 唯一带 `morph` 的模型 |
| `sailfish` | D-14「旗鱼」平流层制空战斗机 | 13.8 | 22.9 | — | 菱形翼 + V 尾 |
| `petrel` | F-9「海燕」高空高速截击机 | 13.2 | 22.9 | — | 带残留字段 `sweepAlt: null` |
| `skua` | D-21「贼鸥」多用途隐形战斗机 | 13.8 | 21.4 | — | 无垂尾菱形翼 |
| `albatross` | D-33「信天翁」高机动格斗机 | 16.4 | 19.6 | — | 前掠翼 |
| `booby` | G-6「鲣鸟」近距空中支援攻击机 | 17.2 | 19.4 | — | 双发翼根布局 |
| `schist` | ROK-27「燧石」重型截击机（下游） | 14.8 | 22.0 | — | 翼身融合 |
| `basalt` | GAL-31「玄武岩」重型截击机（下游） | 15.2 | 25.8 | — | 双三角翼 |
| `sandstone` | VAC-14「砂岩」轻型攻击机（下游） | 12.8 | 15.2 | — | 涡桨 |
| `folded_wing` | 「折翼」级无人僚机 | 8.8 | 7.6 | — | 飞翼 |
| `sower` | 「灰烬」级播撒机（下游） | 38.0 | 42.5 | — | 四发 |
| `spray` | 「浪花」海上巡逻机 | 17.2 | 16.4 | — | 双发涡桨 |
| `boulder` | ROK-40「巨砾」重型轰炸机（下游） | 48 | 44 | — | 四发、不参与空战 |
| `relay` | 「高原」级浮空中继平台 | 27 | 82 | `air` | `radius: 30` |
| `cell` | DIL-4 型调节单元 | 60 | 118 | `air` | `radius: 34`，三个要害 |
| `sam` | 中远程 SAM 发射车（4 联装） | 9 | 9 | `ground` `sea` | `radius: 5` |
| `radar` | 早期预警雷达站 | 18 | 18 | `ground` `sea` | `radius: 8` |
| `depot` | 燃油 / 弹药补给库 | 40 | 24 | `ground` `sea` | `radius: 12` |
| `cmdpost` | 指挥 / 通信中枢 | 22 | 18 | `ground` `sea` | `radius: 9` |
| `station` | 第 7 号控制平台 | 88 | 88 | `ground` `sea` | `radius: 56`，地标级 |
| `humpback` | 座头鲸级航空母舰 / 浮岛（上游） | 40.0 | 280 | `ground` `sea` | `radius: 84`，飞行甲板 + 舰岛 |
| `bluewhale` | 蓝鲸级快速战斗支援舰（上游） | 26.6 | 210 | `ground` `sea` | `radius: 62`，三座补给门架 |
| `spermwhale` | 抹香鲸级巡洋舰（上游） | 20.4 | 168 | `ground` `sea` | `radius: 50`，四面大相控阵 |
| `orca` | 虎鲸级护航驱逐舰（上游） | 18.4 | 148 | `ground` `sea` | `radius: 44` |
| `dolphin` | 海豚级护卫舰（上游） | 14.4 | 108 | `ground` `sea` | `radius: 33` |
| `cameroceras` | 房角石级武库舰（下游） | 24.0 | 195 | `ground` `sea` | `radius: 58`，312 个垂发井 |
| `dunkleosteus` | 邓氏鱼级巡洋舰（下游） | 18.8 | 152 | `ground` `sea` | `radius: 46` |
| `seascorpion` | 海蝎级登陆舰（下游） | 20.4 | 132 | `ground` `sea` | `radius: 40`，艏门 + 跳板 |
| `ammonite` | 菊石级巡逻护卫舰（下游） | 15.2 | 118 | `ground` `sea` | `radius: 36` |
| `trilobite` | 三叶虫级导弹快艇（下游） | 8.4 | 42 | `ground` `sea` | `radius: 13`，两座四联装 |
| `daplu` | DAPLU Mk.1「屿」巡逻艇（群岛国） | 6.6 | 31 | `ground` `sea` | `radius: 10` |
| `skori` | SKORI「准绳」布缆船（管理局） | 18.4 | 102 | `ground` `sea` | `radius: 32`，艏楼绞盘 |
| `diklo` | DIKLO「标杆」海洋测量船（管理局） | 17.2 | 62 | `ground` `sea` | `radius: 20`，**双体** |
| `cross` | MV「南十字」重货船（南回契约） | 27.4 | 178 | `ground` `sea` | `radius: 54`，集装箱 |
| `icecore` | R/V「冰芯」水文调查船（高纬联合） | 17.4 | 92 | `ground` `sea` | `radius: 30`，A 型吊架 |
| `atoll` | OSV「环礁」观察船（环外共同体） | 11.4 | 56 | `ground` `sea` | `radius: 18` |
| `missile` | 导弹小模型 | 1.3 | 3.4 | — | 兜底模型（见下） |
| `bomb` | 炸弹小模型 | 1.4 | 2.2 | — | |
| `pod` | 吊舱小模型（干扰 / 光电 / 对抗） | 1.1 | 2.9 | — | 挂载物里**唯一不是弹药**的东西：短、粗、钝头，尾端散热格栅 |

> `span` / `len` / `air` / `sea` 这些元数据**目前没有任何消费者**；
> `radius` 与 `ground` 也不会自动传到目标上——设施由 `spawnTarget` 手抄，舰船由 `spawnShip` 从 `SHIPS` 表取。详见"易踩的坑"。
>
> **机型与模型不是一一对应**：`AIRCRAFT` 17 条只用到 13 个飞机模型，
> 5 个 NPC 机型借用现成几何——`tideline` → `sailfish`，`datum` / `pelican` → `sower`，
> `quartz` / `lodestone` → `boulder`。所以本表没有 `tideline` / `datum` / `pelican` / `quartz` / `lodestone` 这几个键；
> 要给它们独立外形，得新增 `M.xxx` 并改 `AIRCRAFT[].model`。
>
> 舰船的 `span` 是**船宽**、`len` 是**舰长**（沿用同一对字段，没有为船另起名字），
> `radius` 是受击半径。16 艘船的存在理由见 `data.js` 的 `SHIPS` 表与设定集 8.0.1 节。

### 构造器 `MB`（文件内部使用，加新模型时要用）

| 签名 | 语义 |
|---|---|
| `new MB()` | 空模型：`this.v = []`、`this.f = []` |
| `pt(x, y, z)` | 压入一个顶点，返回它的**索引** |
| `vt(p)` | `pt(p.x, p.y, p.z)` 的简写 |
| `face(i, c)` | 压入一个面，`i` 是索引数组，`c` 是颜色串 |
| `quad(a, b, c, d, col)` | 四边面 |
| `tri(a, b, c, col)` | 三角面 |
| `fuselage(secs, col, colCap)` | 轴向棱柱机身（菱形剖面），`secs = [{z, w, h, y?}]`；返回每节的 4 个顶点索引 |
| `hull(secs, colSide, colDeck, colBottom)` | **船体**（平甲板 / 直立舷侧 / 舭部收进 / V 形龙骨；`flat: true` 保留平底），`secs = [{z, w, y0, y1, x?, flat?}]` |
| `box(cx, cy, cz, w, h, d, col, colTop)` | 长方体，`colTop` 可单独给顶面颜色 |
| `boxTilt(cx, cy, cz, w, h, d, tilt, col, colTop)` | 绕 x 轴仰起 `tilt` 弧度的长方体（发射箱 / 吊架 / 艏门） |
| `tube(a, b, ra, rb, seg, col, capCol)` | 任意轴圆柱 / 锥台，`seg` 是圆周分段数；`capCol` 非空才封底 |
| `wing(p1, p2, p3, p4, col)` | 零厚度翼面（4 个点，双面渲染） |
| `wingM(p1, p2, p3, p4, col)` | 同上，但 **x 取反**（镜像到左翼） |

私有辅助：`done(mb, extra)` 把 `mb` 收成最终对象并合并 `extra` 元数据；
`seaBase(b, w, d)` 生成海上平台底座；`mast(b, x, z, y0, y1, r0, r1, col)`
与 `house(b, x, z, w, h, d, y0, col, colTop)` 是舰船用的桅杆与舱段。

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
`entities.js:582`：

```js
a.sweep = M3.clamp((a.speed - 170) / 250, 0, 1);
```

即 170 m/s 全展开、420 m/s 全后掠。`game.js:2809` 只在遍历飞机
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
5 个设施目标（`sam` / `radar` / `depot` / `cmdpost` / `station`）都调用了它。

### 船体 `hull(secs, colSide, colDeck, colBottom)`

**舰船不是浮台，所以没有复用 `seaBase`，而是另起了一个船体构造器。**
浮台是"一片甲板 + 一排浮筒"，而船需要**艏部收尖、舷侧连续、平底**，
以及沿船长变化的舷弧（艏部比艉部高）。`fuselage()` 的菱形剖面做不到这件事 ——
那是机身用的，四条棱会落到船体上。

```js
// secs = [{z, w, y0, y1, x?}]   w = 半宽, y0 = 龙骨, y1 = 甲板面, x = 可选横向偏移
b.hull([
  { z: 74, w: 0.9, y0: -1.2, y1: 6.6 },   // 艏：窄、高
  { z: 46, w: 6.2, y0: -3.6, y1: 6.0 },
  { z: -16, w: 9.2, y0: -3.8, y1: 5.4 },  // 舯：最宽
  { z: -74, w: 6.2, y0: -3.0, y1: 5.4 }   // 艉
], C.hull, C.deck, C.boot);
```

每个截面是**矩形四点**（右舷甲板 / 右舷底 / 左舷底 / 左舷甲板），
相邻截面之间缝四个面：右舷、船底、左舷、甲板。艏艉各封一个面。

**水线取 `y = 0`**，所以 `y0` 为负（水下）、`y1` 为正（干舷）。
水下部分照样会被画出来，但俯视时甲板与舷侧在画家算法里排在前面，
会把它盖住 —— 现有浮台的浮筒（`y = -2.6`）就是这么处理的。

`x` 是为**双体船**（`diklo`）加的：两个片体各用一次 `hull()`
（`x = ±6.2`），再在上面盖一层连接甲板。

### 构件辅助

舰船的上层建筑全部由 `box` / `tube` 拼，其中三类重复得最多，抽成了函数：

| 函数 | 用途 |
|---|---|
| `mast(b, x, z, y0, y1, r0, r1, col)` | 桅杆：桁架锥台 + 顶部小平台 |
| `house(b, x, z, w, h, d, y0, col, colTop)` | 甲板上的箱形舱段（舰桥 / 机库 / 货舱） |
| `boxTilt(...)`（`MB` 方法） | 绕 x 轴上仰的长方体（导弹发射箱 / A 型吊架 / 登陆舰艏门） |

### 舰船后处理（v2.2）

- **零件落座 `settle(m)`**：按"连通分量"（共享顶点的面）找出和任何其他零件都不接触的悬空零件，
  把它最底下那一圈顶点**往下延长**到正下方最高的表面（零件本身不动）。对 `SHIPS` 用到的模型都跑一遍。
  桅杆杆身和顶部平台互相接触、检测不到，所以桅杆是手动挪到舰桥顶上的。
- **`boxTilt(..., tilt, col, colTop, yaw?)`**：负的 `tilt` 让 +z 端（箱口）抬起；可选 `yaw` 绕 y 轴转。
  斜置反舰弹箱要保证弹道不撞舰桥：靠两舷放到舰桥宽度外，或抬高仰角从舰桥顶上越过（同一艘船各组仰角一致）。
- **炮塔**：`tur50 / tur75 / tur120`（`_base` + `_gun`，带 `r` 的是下游涂装），
  `MODELS.TURRET_SPEC`（耳轴高、炮管长）和 `MODELS.composeTurrets(base, mounts)` 都不可枚举。见 [turret.md](turret.md)。

## 重要常量 / 参数速查

| 想改什么 | 在哪 |
|---|---|
| 配色 | 文件顶部 `C`（**36** 个色：25 个飞机/设施色 + 11 个舰船色 `C.hull` / `C.deck` / `C.boot` / `C.rust` / `C.snow` / `C.cargo*` 等） |
| 某机型的外形 | 对应的 `M.xxx = (function () { ... })()` 函数体 |
| 机身剖面（粗细、长度） | 该机型里 `b.fuselage([{z, w, h, y?}, ...])` 的数组 |
| **船体线型（艏宽、舷弧、吃水）** | 该舰的 `b.hull([{z, w, y0, y1, x?}, ...])` 的数组 |
| 翼型 / 翼位置 | 该机型里的 `b.wing(...)` / `b.wingM(...)` 四点坐标 |
| 可变后掠的角度 | `sweepPt(20, ...)` / `sweepPt(62, ...)`（`SP` / `SW`） |
| 后掠枢轴与翼展 | `PIVOT` / `R_SPAN` |
| 后掠触发的速度区间 | `entities.js:582` 的 `(a.speed - 170) / 250` |
| 模型尺寸元数据 | `done(b, { span, len })`（舰船的 `span` 是船宽） |
| 目标受击半径 | `done(...)` 里的 `radius` **不生效**；设施看 `spawnTarget` 传的值，舰船看 `SHIPS[].radius` |
| 圆柱 / 喷口圆周分段 | `tube(a, b, ra, rb, seg, ...)` 的 `seg`（常见 6 / 8 / 10 / 12） |
| 海上平台大小 | `seaBase(b, w, d)` 的调用参数 |
| 舰船外形肉眼检查 | `node tools/render-ships.js` → `tools/preview/ship-*.png`（走真正的 `render.js`） |
| 新增一个模型 | 仿照现有的 `M.xxx = (function () { var b = new MB(); ...; return done(b, {...}); })()` |

## 易踩的坑与设计取舍

1. **`morph.map` 的长度 = 顶点总数。** 它是在所有几何都建完之后按
   `b.v.length` 填 `-1` 的，所以**在可变后掠翼之后再加几何**没关系（新顶点不在映射里），
   但**增删机翼顶点**必须同步维护 `morphMap` / `morphSpread` / `morphSwept` 三者。
2. **顶点是共享的。** 一个顶点被 4 个面引用是常态；`morph` 覆盖它等于同时动 4 个面。想只动一个面就得补一个独立顶点。
3. **`span` / `len` 是没人读的元数据。** 没有代码消费 `MODELS[x].span`；
   `planform.js` 用的是自己 `PLANFORM.planes` 里的尺寸。而且 `frigatebird` 的 `span: 15.2`
   与公式算出的实际翼展 14.8（展开）/ 8.6（后掠）都不一致，
   `DESIGN.md` 变更记录又写成"15.6 → 10.1 m"——**三处数字互相对不上**，改之前先确认以哪个为准。
4. **`air` / `ground` / `sea` / `radius` 不会自动传到目标对象上。**
   `makeTarget()` 只从传入的 `o` 读 `radius` / `ground`；`missions.js` 对设施是把
   `radius: 30`、`ground: true` 这类值**手抄**进 `spawnTarget(...)` 的，
   对舰船则由 `spawnShip()` 从 `SHIPS[].radius` 取、`ground: true` 写死——
   所以船的 `MODELS[x].radius` 与 `SHIPS[x].radius` 是两份数，**生效的是后者**。
   `sea: true` 目前**全工程无人读取**，只是文档性标记。
5. **`render.js` 有 2048 顶点上限。** `pushModel()` 里 `if (nv > MAXV) return;`
   （`MAXV = 2048`）——模型顶点超限会**静默消失**，不报错。
   当前最大的是 `bluewhale`（520 顶点 / 386 面）与 `cross`（428 / 328），
   新增的重舰都在 300 顶点以内（`cameroceras` 312 / 240 面是最大的一条），
   都是集装箱和门架堆出来的；**往舰船上继续堆货箱之前先看一眼这个数**。
6. **`petrel` 的 `sweepAlt: null` 是残留字段**，没有任何消费者，别以为它有含义。
7. **零厚度翼面靠画家算法。** 绕序不重要（不剔除、光照取 `|dot|`），
   但共面片没有深度差，某些角度会闪；要消除只能给翼面一点厚度或错开坐标。
8. **颜色是 hex 字符串**，`render.js` 会按亮度 / 雾浓度各 16 档做量化缓存
   （`shade()`）。同一模型里颜色种类越多，缓存命中越差。
9. **构造器在加载时跑一次，结果常驻内存。** `v` / `f` 是共享数组，
   `pushModel()` 的 morph 插值写在 render 自己的 `Float32Array` 里，不回写模型——
   所以想改模型必须改源码，运行时改 `MODELS.x.v` 会影响所有同型实体。
10. **船的水下部分会被画出来。** 海面在 `render.js` 里只是一层"天空 + 网格线"
    的 2D 背景，**不参与深度排序**，所以没有任何东西真正"遮住"水线以下的面。
    俯视时靠甲板与舷侧在画家算法里排在前面盖住它（现有浮台的浮筒同理），
    但**贴着海面平视时会看到船底**——如果哪天有低空掠海视角，这里要处理。
11. **`hull()` 的第一/最后一个截面就是艏艉封口。** 想让艏部更尖，
    是加一个更小 `w` 的截面（`w` 不能为 0，那会让四个顶点重合成退化面），
    而不是去改封口逻辑。

## 与其它模块的依赖关系

**上游**：只依赖 `M3`，且只在**构造期**用到向量运算
（`V` / `add` / `sub` / `mul` / `norm` / `cross`），所以 `math3d.js`
必须排在 `models.js` 之前（见 [DESIGN.md](../DESIGN.md#3-模块划分与加载顺序)）。

**下游**：

| 模块 | 怎么用 |
|---|---|
| `render.js` | `pushModel(model, P, fwd, up, opts)` 读 `model.v` / `model.f`，按 `model.morph` 插值 `opts.sweep` |
| `game.js` | `MODELS[w.model]` 查表；查不到时回退（`MODELS[...] \|\| MODELS.missile`）；`preflight()` 用 `needModels` 清单检查 **32** 个必需模型（另有 `AIRCRAFT[].model` 逐条单独检查） |
| `entities.js` | 用 `ent.radius` 做受击判定与爆炸规模（`radius` 最终来自任务传入） |
| `missions.js` | `spawnTarget({ model, radius, ground, ... })` 决定设施用哪个模型、多大；`spawnShip({ model, ... })` 按 `model` 查 `SHIPS` 放船 |
| `data.js` | `AIRCRAFT[].model` 与 `SHIPS[].model` 里的字符串就是 `MODELS` 的键（如 `'frigatebird'` / `'ammonite'`） |

`MODELS.missile` 是**兜底模型**：`game.js` 的 `pushOneStore()`（挂载物，
`game.js:2712`）与 `render()` 里的导弹段（`game.js:2816`）在按 model 名
查不到时回退到它，所以挂载 / 弹药至少能画出一枚弹的形状。
**注意目标物与飞机没有这个兜底** —— `game.js:2798` / `2806` 查不到就
`continue`，那一帧什么都不画（自检会先报错）。

挂载物这一路对**敌我 NPC 都生效**：`pushStores()` 对 `world.actors` 里
每一架飞机都调用（玩家的弹种来自机库配置，NPC 来自 `Ent.mountPlan()`）。
哪几种弹能画在哪种挂点上由 `Ent.fitsKind()` 决定 —— 玩家读 `fits`，
NPC 读 `npcFits`。见 [loadout.md](loadout.md#npc-的挂载)。

`preflight()` 的必需清单是：
`frigatebird sailfish booby schist folded_wing sower relay cell sam radar depot cmdpost station missile bomb pod`
**+ 16 艘舰船** `orca bluewhale humpback spermwhale dolphin trilobite ammonite
seascorpion cameroceras dunkleosteus daplu skori diklo cross icecore atoll`
——新增模型后记得往 `game.js` 的 `needModels` 数组里加，否则自检不会覆盖它。
舰船是先进清单、后进关卡的（v1.4.0 起已由 `spawnShip` 用在各关里）：
模型名写错要在自检里暴露，而不是等某个任务第一次引用它的时候才炸。
机型借用的模型（`petrel` `skua` `albatross` `basalt` `sandstone` `spray` `boulder` 等）不在这份清单里，
由 `preflight` 对每条 `AIRCRAFT[].model` 的单独检查覆盖。
