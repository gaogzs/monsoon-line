# 三维数学与相机

代码：`js/math3d.js`（228 行）· 全局对象 `M3`

加载顺序里的第 1 个模块，**不依赖任何东西**。除纯文本 / 数据表的 `codex.js` 与 `data.js` 外，其余模块都直接或间接用到它。相机的*用法*在 [rendering.md](rendering.md) 里讲，这里讲 M3 自己。

## 代码位置与职责边界

**做什么**：三维向量运算（点 / 叉 / 模 / 距离 / 插值，全部不可变，每次返回新对象）；罗德里格斯轴角旋转、正交基构造、方向球面插值；标量工具（`clamp` / `lerp` / `wrapPi` / `smooth` / 随机 / 手感曲线）；相机对象构造与世界 → 相机 → 屏幕的两级投影；近平面**线段**裁剪；射线-球求交；两个单位方向之间的"转向"工具。

**不做什么**：没有矩阵类型（没有 `Mat4` / `Mat3`，相机是一组基向量）；没有四元数；**不做多边形裁剪**——Sutherland–Hodgman 单平面裁剪内联在 `render.js` 的 `pushModel()` 里；求交只支持射线-球，没有射线-三角形 / 平面 / AABB；不持有任何全局状态或缓存，是纯函数集合（唯一的不纯是 `Math.random`）。

## 完整公开接口

返回对象在 `math3d.js:216-227`，共 **36** 个成员。

### 向量

| 签名 | 语义 |
|---|---|
| `V(x, y, z)` | `{x,y,z}`；缺参按 0（`x \|\| 0`） |
| `clone(a)` | 浅拷贝为新对象 |
| `add(a,b)` / `sub(a,b)` | 逐分量加减 |
| `mul(a,s)` / `mad(a,b,s)` | 标量乘 / 乘加 `a + b*s`（省一个临时对象） |
| `neg(a)` / `dot(a,b)` / `cross(a,b)` | 取反 / 点积 / 叉积 |
| `len(a)` / `len2(a)` | 模 / 模的平方（比大小用 `len2` 省一次开方） |
| `dist(a,b)` / `dist2(a,b)` | 两点距离 / 距离平方 |
| `norm(a)` | 单位化；**模 < 1e-9 时返回 `V(0,0,1)`** |
| `lerpV(a,b,t)` / `slerpDir(a,b,t)` | 向量线性插值 / 单位方向球面插值（走最短弧） |

### 标量、旋转、基

| 签名 | 语义 |
|---|---|
| `clamp(v,a,b)` / `lerp(a,b,t)` | 夹取 / 线性插值 |
| `wrapPi(a)` | 折到 `(-π, π]` |
| `smooth(cur,target,rate,dt)` | 指数平滑 `cur + (target-cur)*(1-e^{-rate*dt})`，`rate` 越大越快 |
| `rnd(a,b)` / `rndInt(a,b)` / `pick(arr)` | 浮点随机 / 闭区间整数随机 / 随机取元素 |
| `easeCurve(x,k)` | `x/(1+k*|x|)`，`x` 先夹到 `[-1,1]`，`k` 默认 1 |
| `rotAxis(v,axis,ang)` | 罗德里格斯旋转；**`axis` 必须是单位向量** |
| `orthonormalize(fwd,up)` | 构造 `{fwd,up,right}`，满足 `right × up = fwd` |

### 相机、裁剪、射线、角度

| 签名 | 语义 |
|---|---|
| `makeCamera(pos,fwd,up,w,h,fovYDeg)` | 构造相机对象（见下） |
| `toCam(cam,p)` | 世界点 → 相机空间 `{x,y,z}` |
| `projectCam(cam,c)` | 相机空间 → 屏幕；直接除 `z`，**不查 near** |
| `project(cam,p)` | 世界点 → 屏幕；在相机后方返回 `null` |
| `projectUnclamped(cam,p)` | 含后方点：后方点落在 near 平面上，额外带 `behind` 布尔 |
| `clipSeg(cam,a,b)` | 线段近平面裁剪，返回 `[x1,y1,x2,y2]` 或 `null` |
| `raySphere(origin,dir,center,radius)` | 命中返回沿 `dir` 的距离 `t`，否则 `-1`；`dir` 必须是单位向量 |
| `turnAxis(a,b)` | `a` 转向 `b` 的最短旋转轴（单位向量）；共线返回 `null` |
| `angleBetween(a,b)` | `acos(clamp(dot,-1,1))` |
| `turnToward(fwd,up,target,maxAng)` | 朝向 `target` 最多转 `maxAng`，返回新 `{fwd,up}` |

## 关键算法与数据结构

### 罗德里格斯旋转

```js
function rotAxis(v, axis, ang) {
  var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  var d = dot(axis, v), cr = cross(axis, v);
  return {
    x: v.x * c + cr.x * s + axis.x * d * t,
    y: v.y * c + cr.y * s + axis.y * d * t,
    z: v.z * c + cr.z * s + axis.z * d * t
  };
}
```

`v' = v·cosθ + (k×v)·sinθ + k(k·v)(1−cosθ)`。**不归一化 `axis`**：传非单位轴不报错，只会静默算出被拉伸的错误姿态；调用方（`entities.js` 的姿态更新）一律传正交基向量，所以成立。不用欧拉角的原因见 [DESIGN.md](../DESIGN.md#52-姿态用正交基不用欧拉角)：垂直姿态有万向节锁，而这个游戏有大量垂直机动。

### 正交基与退化

```js
function orthonormalize(fwd, up) {
  var f = norm(fwd);
  var u = sub(up, mul(f, dot(up, f)));   // 减掉 up 里平行于 fwd 的分量
  if (len2(u) < 1e-8) {                  // 退化：fwd 与 up 共线
    var ref = (Math.abs(f.y) > 0.9) ? V(1, 0, 0) : V(0, 1, 0);
    u = sub(ref, mul(f, dot(ref, f)));
  }
  return { fwd: f, up: norm(u), right: cross(norm(u), f) };   // up × fwd = right
}
```

顺序是 **`up × fwd = right`**，与文件头 `right × up = fwd` 一致。退化参考轴按 `|f.y| > 0.9` 挑一个**不平行**的坐标轴：垂直爬升时 `fwd ≈ (0,1,0)`，必须改挑 `V(1,0,0)`。`entities.js:305` 有一处刻意调用：机头立起来时直接用 `orthonormalize(a.fwd, M3.V(0,1,0))` 重建基。

### 方向插值 `slerpDir`

球面插值走最短弧。点积 `> 0.9995` 或 `< -0.9995` 时退化成 `norm(lerpV(...))` 避免 `sin(ang)` 除零；否则用 `w1 = sin((1-t)ang)/s`、`w2 = sin(t·ang)/s` 加权后单位化。**为什么不对 `(yaw, pitch)` 插值**：翻过顶点的瞬间水平投影会反向 180°，角度插值会绕半个球走，看起来像镜头绕飞机转了一圈；对向量插值永远走短边。

### 相机与投影

`makeCamera()` 产出普通对象（**不是矩阵**）：`{ pos, fwd, up, right, focal, cx, cy, w, h, near, far }`，
其中 `focal = (h*0.5)/tan(fovY/2)`，`near` 固定 `0.6`，`far` 固定 `40000`。世界点的两级映射：

```js
function toCam(cam, p) {
  var dx = p.x - cam.pos.x, dy = p.y - cam.pos.y, dz = p.z - cam.pos.z;
  return {
    x: dx * cam.right.x + dy * cam.right.y + dz * cam.right.z,
    y: dx * cam.up.x    + dy * cam.up.y    + dz * cam.up.z,
    z: dx * cam.fwd.x   + dy * cam.fwd.y   + dz * cam.fwd.z
  };
}
function projectCam(cam, c) {
  var iz = cam.focal / c.z;
  return { x: cam.cx + c.x * iz, y: cam.cy - c.y * iz, z: c.z };
}
```

就是三次点积加一次除法。`project()` 是 `toCam` 后判 `c.z < cam.near`，后方返回 `null`。

### 线段近平面裁剪

```js
function clipSeg(cam, a, b) {
  var ca = toCam(cam, a), cb = toCam(cam, b), n = cam.near;
  if (ca.z < n && cb.z < n) return null;
  if (ca.z < n || cb.z < n) {
    var t = (n - ca.z) / (cb.z - ca.z);
    var ix = ca.x + (cb.x - ca.x) * t, iy = ca.y + (cb.y - ca.y) * t;
    if (ca.z < n) ca = { x: ix, y: iy, z: n };
    else cb = { x: ix, y: iy, z: n };
  }
  var pa = projectCam(cam, ca), pb = projectCam(cam, cb);
  return [pa.x, pa.y, pb.x, pb.y];
}
```

在**相机空间**求与 `z = near` 的交点（`t` 只用 z 分量），再投影两个端点。返回扁平数组而非对象：地面网格每帧要裁 38 条线（`N = 9`，两遍），调用方直接 `ctx.moveTo(seg[0], seg[1])`。

### 射线 / 球求交

```js
function raySphere(origin, dir, center, radius) {
  var oc = sub(origin, center), b = dot(oc, dir), c = len2(oc) - radius * radius;
  var disc = b * b - c;
  if (disc < 0) return -1;
  var sq = Math.sqrt(disc), t1 = -b - sq, t2 = -b + sq;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return -1;
}
```

取**第一个非负根**：射线从球内出发时 `t1 < 0 < t2`，返回 `t2`。

### 转向工具

`turnAxis(a,b)` 取 `cross(a,b)` 单位化，长度 `< 1e-7`（共线）返回 `null`。
`turnToward(fwd,up,target,maxAng)` 取 `step = min(angleBetween(fwd,target), maxAng)`，
把 `fwd` 和 `up` **绕同一根轴**转同样角度，再返回新基。`up` 跟着转是关键：
两者夹角不变，基不会拧；调用方随后再跑一次 `orthonormalize` 消除漂移。

## 参数速查

| 想改什么 | 在哪 |
|---|---|
| 视场角 | **不在这里**。`makeCamera` 的 `fovYDeg` 由 `render.js` 传入（默认 58），可调值在设置页 `S.fov` |
| 焦距 / 画面中心 | `makeCamera` 里的 `focal` 与 `cx` / `cy` |
| 近平面 | `makeCamera` 里的 `near: 0.6` |
| 远平面 | `makeCamera` 里的 `far: 40000`（**目前无人读取**） |
| `norm` 退化阈值 | `norm()` 里的 `l < 1e-9` |
| 正交化退化阈值 / 参考轴 | `orthonormalize()` 里的 `len2(u) < 1e-8` 与 `Math.abs(f.y) > 0.9` |
| slerp 退化阈值 | `slerpDir()` 里的 `0.9995` |
| 转向共线判定 | `turnAxis()` 里的 `l < 1e-7` |
| 平滑跟随速度 / 手感曲线 | `smooth()` 的 `rate`（各调用点自己传）/ `easeCurve()` 的 `k`，默认 1 |

## 易踩的坑与设计取舍

1. **`cam.far = 40000` 是死字段**：没人读它，距离剔除都由各绘制函数自己写死（云 16 km、雾 9000 m）。
2. **`rotAxis` 不归一化轴，`raySphere` 假定 `dir` 是单位向量**：判别式 `b*b - c` 只在 `|dir|=1` 时才是标准二次方程，`game.js` 调用前一律先 `M3.norm`；传非单位 `dir` 会静默给出错误的命中距离。
3. **`project()` 在相机后方返回 `null`，调用方必须先判空**：要给后方目标画指示器时用 `projectUnclamped()`，它把后方点的 `z` 夹到 `near` 再投影并返回 `behind`（见 [hud.md](hud.md)）。
4. **`projectCam` 不做 near 检查，除以任意 `c.z`**：对 `c.z ≈ 0` 的点调用会得到 Infinity / NaN，唯一防线是调用方先过 `project()` 或 `clipSeg()`。
5. **`V` 里 `x || 0` 会把 `NaN` / `null` 默默当成 0**，没有校验。
6. **`wrapPi` 是 `while` 循环**：正常只处理 ±π 附近，传入累加了很多圈的巨大角度会循环很多次。
7. **所有向量运算都新建对象**（刻意取舍：可读性优先，每帧量级远小于 `ctx.fill()` 的开销）；真要压 GC，先给 `render.js` 的顶点数组池化。
8. **`easeCurve` 会把输入夹到 `[-1,1]`**，想拿它做超过 ±1 的映射会被截断。

## 与其它模块的依赖关系

M3 依赖**无**。反向依赖（谁用了什么）：

| 模块 | 用到 M3 的什么 |
|---|---|
| `render.js` | `makeCamera` / `toCam` / `projectCam` / `clipSeg` / `project` / `V` 几何 |
| `models.js` | 仅构造期用 `V` / `add` / `sub` / `mul` / `norm` / `cross`（见 [models.md](models.md)） |
| `entities.js` | `rotAxis` / `orthonormalize` / `angleBetween` / `turnToward` / `raySphere` / 全部向量运算 |
| `ai.js` | `angleBetween` / `len` / `cross` / `norm` 等 |
| `hud.js` | `wrapPi`（罗盘）/ `projectUnclamped`（目标指示器）/ `len` |
| `game.js` | `raySphere`（子弹命中）/ `smooth`（g 载荷、相机回中）/ `rotAxis`（相机绕轴）/ `angleBetween` |
| `audio.js` | 仅 `clamp` |
| `planform.js` | 仅 `clamp`（挂载就绪度显示） |
| `missions.js` | `rnd` 等标量工具 |

> `models.js` 在构造期就调用 `M3`，所以 `math3d.js` 必须排在它之前
> （见 [DESIGN.md](../DESIGN.md#3-模块划分与加载顺序)）。
