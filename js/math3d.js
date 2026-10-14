/* ============================================================
   math3d.js —— 三维数学 / 相机 / 投影 / 裁剪
   坐标系：x = 东, y = 上, z = 北（右手系，right × up = fwd）
   单位：米
   ============================================================ */
'use strict';

var M3 = (function () {

  function V(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; }
  function clone(a) { return { x: a.x, y: a.y, z: a.z }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function mad(a, b, s) { return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }
  function len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  function len2(a) { return a.x * a.x + a.y * a.y + a.z * a.z; }
  function dist(a, b) { return len(sub(a, b)); }
  function dist2(a, b) { return len2(sub(a, b)); }
  function norm(a) {
    var l = len(a);
    if (l < 1e-9) return V(0, 0, 1);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  }
  function lerpV(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  }
  function neg(a) { return { x: -a.x, y: -a.y, z: -a.z }; }

  /* ---------- 标量工具 ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapPi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  /** 指数平滑：把 cur 拉向 target，rate 越大越快 */
  function smooth(cur, target, rate, dt) {
    return cur + (target - cur) * (1 - Math.exp(-rate * dt));
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /** 归一化到 [-1,1] 的 sigmoid 型曲线，用于手感 */
  function easeCurve(x, k) {
    k = k || 1;
    x = clamp(x, -1, 1);
    return x / (1 + k * Math.abs(x));
  }

  /* ============================================================
     罗德里格斯旋转：把 v 绕单位轴 axis 旋转 ang 弧度
     v' = v·cosθ + (k×v)·sinθ + k(k·v)(1−cosθ)
     ============================================================ */
  function rotAxis(v, axis, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var d = dot(axis, v);
    var cr = cross(axis, v);
    var t = 1 - c;
    return {
      x: v.x * c + cr.x * s + axis.x * d * t,
      y: v.y * c + cr.y * s + axis.y * d * t,
      z: v.z * c + cr.z * s + axis.z * d * t
    };
  }

  /* ============================================================
     由"机头"和"上方"构造正交基。
     返回 {fwd, up, right}，满足 right × up = fwd
     ============================================================ */
  /* 球面插值：在两个单位方向之间走最短弧。
     直接对 (yaw, pitch) 做线性插值是不行的 —— 翻过顶点的瞬间水平投影
     会反向 180°，角度插值会绕半个球走，看起来就是镜头绕飞机转了一圈。
     对方向向量本身插值则永远走短边。 */
  function slerpDir(a, b, t) {
    var d = dot(a, b);
    if (d > 0.9995) return norm(lerpV(a, b, t));   // 几乎同向，退化成线性
    if (d < -0.9995) return norm(lerpV(a, b, t));  // 几乎反向，线性也够用
    d = d < -1 ? -1 : (d > 1 ? 1 : d);
    var ang = Math.acos(d);
    var s = Math.sin(ang);
    var w1 = Math.sin((1 - t) * ang) / s;
    var w2 = Math.sin(t * ang) / s;
    return norm(add(mul(a, w1), mul(b, w2)));
  }

  function orthonormalize(fwd, up) {
    var f = norm(fwd);
    var u = sub(up, mul(f, dot(up, f)));
    if (len2(u) < 1e-8) {
      // 退化：fwd 与 up 共线，随便挑一个参考
      var ref = (Math.abs(f.y) > 0.9) ? V(1, 0, 0) : V(0, 1, 0);
      u = sub(ref, mul(f, dot(ref, f)));
    }
    u = norm(u);
    var r = cross(u, f);   // up × fwd = right
    return { fwd: f, up: u, right: r };
  }

  /* ============================================================
     相机
     ============================================================ */
  function makeCamera(pos, fwd, up, w, h, fovYDeg) {
    var b = orthonormalize(fwd, up);
    var focal = (h * 0.5) / Math.tan((fovYDeg * Math.PI / 180) * 0.5);
    return {
      pos: clone(pos),
      fwd: b.fwd, up: b.up, right: b.right,
      focal: focal,
      cx: w * 0.5, cy: h * 0.5,
      w: w, h: h,
      near: 0.6,          // 近平面（米）
      far: 40000
    };
  }

  /** 世界点 → 相机空间 */
  function toCam(cam, p) {
    var dx = p.x - cam.pos.x, dy = p.y - cam.pos.y, dz = p.z - cam.pos.z;
    return {
      x: dx * cam.right.x + dy * cam.right.y + dz * cam.right.z,
      y: dx * cam.up.x + dy * cam.up.y + dz * cam.up.z,
      z: dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z
    };
  }

  /** 相机空间 → 屏幕 */
  function projectCam(cam, c) {
    var iz = cam.focal / c.z;
    return { x: cam.cx + c.x * iz, y: cam.cy - c.y * iz, z: c.z };
  }

  /** 世界点 → 屏幕，若在相机后方返回 null */
  function project(cam, p) {
    var c = toCam(cam, p);
    if (c.z < cam.near) return null;
    return projectCam(cam, c);
  }

  /** 屏幕坐标（含后方点）→ 用于 HUD 指示器：返回 {x,y,behind} */
  function projectUnclamped(cam, p) {
    var c = toCam(cam, p);
    var behind = c.z < cam.near;
    var zz = behind ? cam.near : c.z;
    var s = projectCam(cam, { x: c.x, y: c.y, z: zz });
    s.behind = behind;
    return s;
  }

  /* ============================================================
     线段近平面裁剪 —— 返回 [x1,y1,x2,y2] 或 null
     ============================================================ */
  function clipSeg(cam, a, b) {
    var ca = toCam(cam, a), cb = toCam(cam, b);
    var n = cam.near;
    if (ca.z < n && cb.z < n) return null;
    if (ca.z < n || cb.z < n) {
      var t = (n - ca.z) / (cb.z - ca.z);
      var ix = ca.x + (cb.x - ca.x) * t;
      var iy = ca.y + (cb.y - ca.y) * t;
      if (ca.z < n) ca = { x: ix, y: iy, z: n };
      else cb = { x: ix, y: iy, z: n };
    }
    var pa = projectCam(cam, ca), pb = projectCam(cam, cb);
    return [pa.x, pa.y, pb.x, pb.y];
  }

  /* ============================================================
     射线 / 球 相交（机炮与导弹用）
     返回命中点参数 t（沿线距离）或 -1
     ============================================================ */
  function raySphere(origin, dir, center, radius) {
    var oc = sub(origin, center);
    var b = dot(oc, dir);
    var c = len2(oc) - radius * radius;
    var disc = b * b - c;
    if (disc < 0) return -1;
    var sq = Math.sqrt(disc);
    var t1 = -b - sq, t2 = -b + sq;
    if (t1 >= 0) return t1;
    if (t2 >= 0) return t2;
    return -1;
  }

  /* ============================================================
     角度工具
     ============================================================ */
  /** 从 a 转到 b，返回最短轴角（a、b 为单位向量，axis 为旋转轴） */
  function turnAxis(a, b) {
    var ax = cross(a, b);
    var l = len(ax);
    if (l < 1e-7) return null;
    return mul(ax, 1 / l);
  }
  function angleBetween(a, b) {
    return Math.acos(clamp(dot(a, b), -1, 1));
  }

  /** 把 fwd 向 target 方向转最大 maxAng 弧度 */
  function turnToward(fwd, up, target, maxAng) {
    var ax = turnAxis(fwd, target);
    if (!ax) return { fwd: clone(fwd), up: clone(up) };
    var ang = angleBetween(fwd, norm(target));
    var step = Math.min(ang, maxAng);
    var nf = rotAxis(fwd, ax, step);
    var nu = rotAxis(up, ax, step);
    return { fwd: nf, up: nu };
  }

  return {
    V: V, clone: clone, add: add, sub: sub, mul: mul, mad: mad, neg: neg,
    dot: dot, cross: cross, len: len, len2: len2, dist: dist, dist2: dist2,
    norm: norm, lerpV: lerpV, slerpDir: slerpDir,
    clamp: clamp, lerp: lerp, wrapPi: wrapPi, smooth: smooth, rnd: rnd,
    rndInt: rndInt, pick: pick, easeCurve: easeCurve,
    rotAxis: rotAxis, orthonormalize: orthonormalize,
    makeCamera: makeCamera, toCam: toCam, projectCam: projectCam,
    project: project, projectUnclamped: projectUnclamped, clipSeg: clipSeg,
    raySphere: raySphere, turnAxis: turnAxis, angleBetween: angleBetween,
    turnToward: turnToward
  };
})();
