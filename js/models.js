/* ============================================================
   models.js —— 低多边形机体 / 地面目标几何
   约定：机头朝 +z，右翼朝 +x，座舱朝 +y。单位：米。
   面不做背面剔除，靠画家算法排序绘制。
   ============================================================ */
'use strict';

var MODELS = (function () {
  var V = M3.V;

  /* ---------- 配色板 ---------- */
  var C = {
    body:   '#78838e',
    body2:  '#67727d',
    body3:  '#5a646e',
    wing:   '#828d98',
    wing2:  '#727d88',
    dark:   '#3d474f',
    darker: '#2b333a',
    metal:  '#959fa9',
    canopy: '#1e4d5e',
    canopy2:'#2a6d84',
    nozzle: '#333a42',
    red:    '#9c3634',
    red2:   '#c04a44',
    navy:   '#3f5470',
    navy2:  '#4c6588',
    sand:   '#8c8471',
    sand2:  '#7a7261',
    green:  '#4e5f4a',
    green2: '#5d7057',
    grey:   '#6a737c',
    grey2:  '#57606a',
    white:  '#c3ccd4',
    yellow: '#a89440',
    black:  '#1d2226',
    rod:    '#1e2429',

    /* 水面舰船专用色。
       舰船和飞机共用的灰色会让"这是船还是飞机"在远处分不出来，
       所以舰体单独取一档略偏蓝的灰；下游的沙锈色对应他们
       地理经验里的干土与裸岩（与机型命名同一个来源）。 */
    hull:   '#5c6a75',   // 舰体灰（上游 / 通用）
    hull2:  '#49565f',   // 舰体暗面
    deck:   '#4b565e',   // 甲板
    boot:   '#232a30',   // 水线漆
    rust:   '#7d5a44',   // 下游舰体的锈沙色
    rust2:  '#5d4534',
    snow:   '#dbe3e8',   // 白色舰体（管理局 / 高纬联合）
    snow2:  '#b6c1c9',
    cargo:  '#7f6845',   // 集装箱三色
    cargo2: '#3d6673',
    cargo3: '#7a4240'
  };

  /* ============================================================
     模型构造器
     ============================================================ */
  function MB() { this.v = []; this.f = []; }
  MB.prototype.pt = function (x, y, z) { this.v.push([x, y, z]); return this.v.length - 1; };
  MB.prototype.vt = function (p) { return this.pt(p.x, p.y, p.z); };
  MB.prototype.face = function (i, c) { this.f.push({ i: i, c: c }); return this; };
  MB.prototype.quad = function (a, b, c, d, col) { return this.face([a, b, c, d], col); };
  MB.prototype.tri = function (a, b, c, col) { return this.face([a, b, c], col); };

  /** 轴向棱柱机身：secs = [{z, w, h, y?}] */
  MB.prototype.fuselage = function (secs, col, colCap) {
    var idx = [], i, s, z, w, h, y;
    for (i = 0; i < secs.length; i++) {
      s = secs[i]; z = s.z; w = s.w; h = s.h; y = s.y || 0;
      idx.push([
        this.pt(0, y + h, z),
        this.pt(w, y, z),
        this.pt(0, y - h, z),
        this.pt(-w, y, z)
      ]);
    }
    for (i = 0; i < idx.length - 1; i++) {
      var A = idx[i], B = idx[i + 1];
      this.quad(A[0], A[1], B[1], B[0], col);
      this.quad(A[1], A[2], B[2], B[1], col);
      this.quad(A[2], A[3], B[3], B[2], col);
      this.quad(A[3], A[0], B[0], B[3], col);
    }
    var F = idx[0], L = idx[idx.length - 1];
    this.quad(F[0], F[3], F[2], F[1], colCap || col);
    this.quad(L[0], L[1], L[2], L[3], colCap || col);
    return idx;
  };

  /** 长方体 */
  MB.prototype.box = function (cx, cy, cz, w, h, d, col, colTop) {
    var x0 = cx - w / 2, x1 = cx + w / 2,
        y0 = cy - h / 2, y1 = cy + h / 2,
        z0 = cz - d / 2, z1 = cz + d / 2;
    var p = [
      this.pt(x0, y1, z0), this.pt(x1, y1, z0), this.pt(x1, y1, z1), this.pt(x0, y1, z1),
      this.pt(x0, y0, z0), this.pt(x1, y0, z0), this.pt(x1, y0, z1), this.pt(x0, y0, z1)
    ];
    this.quad(p[0], p[1], p[2], p[3], colTop || col);
    this.quad(p[7], p[6], p[5], p[4], col);
    this.quad(p[3], p[2], p[6], p[7], col);
    this.quad(p[1], p[0], p[4], p[5], col);
    this.quad(p[2], p[1], p[5], p[6], col);
    this.quad(p[0], p[3], p[7], p[4], col);
    return p;
  };

  /** 通用圆柱 / 锥台（a→b 轴） */
  MB.prototype.tube = function (a, b, ra, rb, seg, col, capCol) {
    var dir = M3.norm(M3.sub(b, a));
    var ref = Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
    var u = M3.norm(M3.cross(ref, dir));
    var w = M3.cross(dir, u);
    var rings = [], k, i, th, p, base, r, ring;
    for (k = 0; k < 2; k++) {
      base = k === 0 ? a : b;
      r = k === 0 ? ra : rb;
      ring = [];
      for (i = 0; i < seg; i++) {
        th = i / seg * Math.PI * 2;
        p = M3.add(base, M3.add(M3.mul(u, Math.cos(th) * r), M3.mul(w, Math.sin(th) * r)));
        ring.push(this.pt(p.x, p.y, p.z));
      }
      rings.push(ring);
    }
    for (i = 0; i < seg; i++) {
      var j = (i + 1) % seg;
      this.quad(rings[0][i], rings[0][j], rings[1][j], rings[1][i], col);
    }
    if (capCol) {
      for (i = 1; i < seg - 1; i++) {
        this.tri(rings[1][0], rings[1][i], rings[1][i + 1], capCol);
      }
    }
    return rings;
  };

  /** 翼面（薄板）：4 个点，双面渲染 */
  MB.prototype.wing = function (p1, p2, p3, p4, col) {
    var a = this.vt(p1), b = this.vt(p2), c = this.vt(p3), d = this.vt(p4);
    this.quad(a, b, c, d, col);
    return this;
  };

  /** 镜像一个翼面（x 取反） */
  MB.prototype.wingM = function (p1, p2, p3, p4, col) {
    var f = function (p) { return V(-p.x, p.y, p.z); };
    return this.wing(f(p1), f(p2), f(p3), f(p4), col);
  };

  /* ============================================================
     水面舰船的两件专用工具

     舰船和飞机的构造差别只在船体本身：飞机是菱形的轴向棱柱，
     而船是**平甲板、直立舷侧、平底**的箱形截面，还要有舷弧
     （艏部比艉部高）和尖艏。所以这里补两个构造器，
     其余（上层建筑、桅杆、发射装置）全部由 box / tube 拼。
     ============================================================ */

  /** 船体：一系列截面，从甲板到龙骨收成 V 形。
      secs = [{z, w, y0, y1, x?, flat?}]，w 是甲板处半宽，y0 龙骨、y1 甲板面，
      x 是可选的整体横向偏移（双体船的片体用它）。
      水线取 y = 0：y0 通常为负（水下部分），y1 为正（干舷）。

      截面（右半边，左边对称）：
        甲板边 (w, y1) → 舷侧直落到舭部上缘 (w, yb) → 舭部收进 (0.72w, yt) → 龙骨 (0, y0)
      yb 在水线下一点、yt 再往下，水下是一个圆钝的 V —— 以前是平底的箱子，
      出图和 2D 模式下（海面不挡水下部分）一眼就能看出是平底。
      flat: true 保留平底（驳船、浮台）。 */
  MB.prototype.hull = function (secs, colSide, colDeck, colBottom) {
    var idx = [], i, s, x;
    for (i = 0; i < secs.length; i++) {
      s = secs[i]; x = s.x || 0;
      var dep = s.y1 - s.y0;
      var yb = Math.min(-0.2, s.y0 + dep * 0.55 - 0.0001);
      if (yb <= s.y0) yb = s.y0 + dep * 0.5;
      var yt = s.y0 + (yb - s.y0) * 0.38;
      var wt = s.flat ? s.w : s.w * 0.72;
      var wk = s.flat ? s.w : 0.0;
      idx.push([
        this.pt(x + s.w, s.y1, s.z),      // 0 右舷甲板
        this.pt(x + s.w, yb, s.z),        // 1 右舷舭部上缘
        this.pt(x + wt, yt, s.z),         // 2 右舷舭部
        this.pt(x + wk, s.y0, s.z),       // 3 龙骨（右）
        this.pt(x - wk, s.y0, s.z),       // 4 龙骨（左）—— 非平底时与 3 重合
        this.pt(x - wt, yt, s.z),         // 5 左舷舭部
        this.pt(x - s.w, yb, s.z),        // 6 左舷舭部上缘
        this.pt(x - s.w, s.y1, s.z)       // 7 左舷甲板
      ]);
    }
    for (i = 0; i < idx.length - 1; i++) {
      var A = idx[i], B = idx[i + 1];
      this.quad(A[0], A[1], B[1], B[0], colSide);     // 右舷
      this.quad(A[1], A[2], B[2], B[1], colBottom);   // 右舷舭部
      this.quad(A[2], A[3], B[3], B[2], colBottom);   // 右侧船底
      this.quad(A[3], A[4], B[4], B[3], colBottom);   // 龙骨（平底时是平板）
      this.quad(A[4], A[5], B[5], B[4], colBottom);   // 左侧船底
      this.quad(A[5], A[6], B[6], B[5], colBottom);   // 左舷舭部
      this.quad(A[6], A[7], B[7], B[6], colSide);     // 左舷
      this.quad(A[7], A[0], B[0], B[7], colDeck);     // 甲板
    }
    var F = idx[0], L = idx[idx.length - 1];
    this.face([F[0], F[7], F[6], F[5], F[4], F[3], F[2], F[1]], colSide || colDeck);   // 艏封口
    this.face([L[0], L[1], L[2], L[3], L[4], L[5], L[6], L[7]], colSide || colDeck);   // 艉封口
    return idx;
  };

  /** 可上仰的长方体 —— 导弹发射箱、A 型吊架、艏门的斜面都用它。
      tilt 是绕 x 轴的转角（弧度）：负值让 +z 端（朝船头的箱口）抬起，正值让它压低。
      yaw（可选）再绕 y 轴转：正值让箱口偏向右舷 —— 舷外斜置的反舰弹箱用它，
      箱口朝正前的话导弹一出筒就撞舰桥。 */
  MB.prototype.boxTilt = function (cx, cy, cz, w, h, d, tilt, col, colTop, yaw) {
    var c = Math.cos(tilt), s = Math.sin(tilt);
    var cyw = Math.cos(yaw || 0), syw = Math.sin(yaw || 0);
    var hw = w / 2, hh = h / 2, hd = d / 2;
    var corners = [
      [-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd],
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]
    ];
    var p = [], i, v, y, z;
    for (i = 0; i < 8; i++) {
      v = corners[i];
      y = v[1] * c - v[2] * s;
      z = v[1] * s + v[2] * c;
      // 可选的偏航：绕 y 轴转，正值让 +z 端偏向 +x（右舷）
      p.push(this.pt(cx + v[0] * cyw + z * syw, cy + y, cz - v[0] * syw + z * cyw));
    }
    this.quad(p[0], p[1], p[2], p[3], colTop || col);
    this.quad(p[7], p[6], p[5], p[4], col);
    this.quad(p[3], p[2], p[6], p[7], col);
    this.quad(p[1], p[0], p[4], p[5], col);
    this.quad(p[2], p[1], p[5], p[6], col);
    this.quad(p[0], p[3], p[7], p[4], col);
    return p;
  };

  /** 桅杆：桁架锥台 + 顶部一层小平台。舰船的"高个子"全靠它。 */
  function mast(b, x, z, y0, y1, r0, r1, col) {
    b.tube(V(x, y0, z), V(x, y1, z), r0, r1, 4, col, col);
    b.box(x, y1 + 0.5, z, r1 * 5, 1.0, r1 * 5, col);
  }

  /** 甲板上的箱形舱段（舰桥 / 机库 / 货舱） */
  function house(b, x, z, w, h, d, y0, col, colTop) {
    return b.box(x, y0 + h / 2, z, w, h, d, col, colTop || col);
  }

  function done(mb, extra) {
    var m = { v: mb.v, f: mb.f };
    if (extra) for (var k in extra) m[k] = extra[k];
    if (!m.ground && !m.sea) orientClosed(m);
    return m;
  }

  /* 闭合部件定向（给 render.js 的背面剔除用）。

     构造器里 tube / box / fuselage 的绕序并不统一：有的部件整体朝外、
     有的整体朝内。这里按"共用顶点"把面分成部件，面数 ≥ 5 且每条边都被
     两个面共用的视为闭合体（机身、盒子、带端盖的管子），逐面检查法线是否背离部件中心，
     朝内就翻转顶点顺序，并标 cl = 1 —— 只有标了的面才会被剔除。
     单片的翼面、座舱盖不标，保持双面。
     舰船 / 地面设施的船体有凹面，中心判据不可靠，不处理。 */
  function orientClosed(m) {
    var nv = m.v.length, par = new Array(nv), i, j, fi;
    for (i = 0; i < nv; i++) par[i] = i;
    var root = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (fi = 0; fi < m.f.length; fi++) {
      var id = m.f[fi].i;
      for (j = 1; j < id.length; j++) par[root(id[j])] = root(id[0]);
    }
    var comps = {};
    for (fi = 0; fi < m.f.length; fi++) {
      var r = root(m.f[fi].i[0]);
      (comps[r] = comps[r] || []).push(fi);
    }
    for (var key in comps) {
      var fs = comps[key];
      if (fs.length < 5) continue;
      // 必须真封闭：每条边恰好被两个面共用。开口的管子（发动机吊舱、喷口）
      // 剔掉背面就能从端口看穿，保持双面
      var edges = {}, closed = true;
      for (i = 0; i < fs.length; i++) {
        var ee = m.f[fs[i]].i;
        for (j = 0; j < ee.length; j++) {
          var u = ee[j], w = ee[(j + 1) % ee.length];
          var ek = u < w ? u + ',' + w : w + ',' + u;
          edges[ek] = (edges[ek] || 0) + 1;
        }
      }
      for (var ek2 in edges) if (edges[ek2] !== 2) { closed = false; break; }
      if (!closed) continue;
      var cx = 0, cy = 0, cz = 0, cn = 0;
      for (i = 0; i < fs.length; i++) {
        var ii = m.f[fs[i]].i;
        for (j = 0; j < ii.length; j++) { var v = m.v[ii[j]]; cx += v[0]; cy += v[1]; cz += v[2]; cn++; }
      }
      cx /= cn; cy /= cn; cz /= cn;
      for (i = 0; i < fs.length; i++) {
        var f = m.f[fs[i]], q = f.i;
        var A = m.v[q[0]], B = m.v[q[1]], Cc = m.v[q[2]];
        var e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
        var e2x = Cc[0] - A[0], e2y = Cc[1] - A[1], e2z = Cc[2] - A[2];
        var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
        var fx = 0, fy = 0, fz = 0;
        for (j = 0; j < q.length; j++) { fx += m.v[q[j]][0]; fy += m.v[q[j]][1]; fz += m.v[q[j]][2]; }
        fx = fx / q.length - cx; fy = fy / q.length - cy; fz = fz / q.length - cz;
        var d = nx * fx + ny * fy + nz * fz;
        if (Math.abs(d) < 1e-9) continue;       // 判不了的不剔
        if (d < 0) f.i = q.slice().reverse();
        f.cl = 1;
      }
    }
  }

  var M = {};

  /* ============================================================
     DB-11「军舰鸟」Frigatebird —— 舰载多用途战斗机
     变后掠翼；为了在 280 m 浮岛平台上起降、又要维持超巡而做的取舍
     ============================================================ */
  M.frigatebird = (function () {
    var b = new MB();
    b.fuselage([
      { z: 10.2, w: 0.10, h: 0.10 },
      { z: 7.4, w: 0.58, h: 0.54 },
      { z: 4.2, w: 0.98, h: 0.90 },
      { z: 0.6, w: 1.32, h: 1.06 },
      { z: -3.6, w: 1.36, h: 1.06 },
      { z: -7.4, w: 1.08, h: 0.94 },
      { z: -9.9, w: 0.88, h: 0.82 }
    ], C.body, C.body3);

    /* 主翼 —— 可变后掠。

       机翼顶点单独记录索引，渲染时按 opts.sweep 在两组位置之间插值。

       两组点必须差得够大才看得出来。先前那版只差 18°（2.6° → 20.5°），
       翼尖后移 2.7 米，在 15 米翼展上几乎看不出来 ——
       注释里却写着"差异足够明显"，是注释骗了自己。

       现在按真实机构重做：机翼**绕枢轴旋转**，所以后掠的同时翼展也会缩。
       取 20° → 62°，和 F-14 的 20° → 68° 同一量级：
         展开  翼尖 (7.4, -1.3)   翼展 14.8 m
         后掠  翼尖 (4.3, -4.8)   翼展  8.6 m
       翼尖后移 3.5 米、翼展收掉近一半，一眼就能看出机翼在动。 */
    var PIVOT = V(1.2, -0.16, 1.0);          // 翼根枢轴
    var R_SPAN = 8.0;                        // 翼尖到枢轴的距离（加大：舰载机要低速升力）
    function sweepPt(deg, chordF, chordB) {
      var r = deg * Math.PI / 180;
      var ex = PIVOT.x + R_SPAN * Math.cos(r);
      var ez = PIVOT.z - R_SPAN * Math.sin(r);
      // 弦线与翼展方向垂直，弦长由参数给定
      var nx = Math.sin(r), nz = Math.cos(r);   // 弦向单位向量
      return [
        V(PIVOT.x, PIVOT.y, PIVOT.z + chordF),
        V(ex + nx * chordF * 0.5, -0.46, ez + nz * chordF * 0.5),
        V(ex - nx * chordB * 0.5, -0.46, ez - nz * chordB * 0.5),
        V(PIVOT.x, PIVOT.y, PIVOT.z - chordB)
      ];
    }
    var SP = sweepPt(20, 2.8, 2.0);          // 展开位
    var SW = sweepPt(62, 2.2, 1.4);          // 后掠位

    var addWingPts = function (pts) {
      var a = b.vt(pts[0]), c = b.vt(pts[1]), d = b.vt(pts[2]), e = b.vt(pts[3]);
      b.quad(a, c, d, e, C.wing);
      return [a, c, d, e];
    };
    var mirrorP = function (p) { return V(-p.x, p.y, p.z); };

    var wRight = addWingPts(SW);
    var wLeft = addWingPts([mirrorP(SW[0]), mirrorP(SW[1]), mirrorP(SW[2]), mirrorP(SW[3])]);

    var morphMap = [];
    for (var mi = 0; mi < b.v.length; mi++) morphMap.push(-1);
    var morphSpread = [], morphSwept = [];
    for (var side = 0; side < 2; side++) {
      var idx = side ? wLeft : wRight;
      for (var k2 = 0; k2 < 4; k2++) {
        morphMap[idx[k2]] = morphSpread.length;
        var s1 = side ? mirrorP(SP[k2]) : SP[k2];
        morphSpread.push([s1.x, s1.y, s1.z]);
        var s2 = side ? mirrorP(SW[k2]) : SW[k2];
        morphSwept.push([s2.x, s2.y, s2.z]);
      }
    }

    // 平尾
    b.wing(V(0.95, 0.05, -6.7), V(3.3, 0.16, -8.5), V(3.3, 0.16, -9.7), V(0.95, 0.05, -9.1), C.wing2);
    b.wingM(V(0.95, 0.05, -6.7), V(3.3, 0.16, -8.5), V(3.3, 0.16, -9.7), V(0.95, 0.05, -9.1), C.wing2);

    // 双垂尾（外倾 18°）
    b.wing(V(0.72, 0.85, -5.6), V(1.62, 3.45, -7.80), V(1.62, 3.45, -9.45), V(0.72, 0.85, -9.10), C.wing2);
    b.wingM(V(0.72, 0.85, -5.6), V(1.62, 3.45, -7.80), V(1.62, 3.45, -9.45), V(0.72, 0.85, -9.10), C.wing2);

    // 进气道
    b.box(1.28, -0.15, 0.3, 0.42, 1.25, 3.6, C.dark);
    b.box(-1.28, -0.15, 0.3, 0.42, 1.25, 3.6, C.dark);

    // 座舱盖
    b.quad(b.pt(0, 0.84, 5.5), b.pt(0.52, 0.96, 4.0), b.pt(0, 1.58, 2.7), b.pt(-0.52, 0.96, 4.0), C.canopy);
    b.quad(b.pt(0, 0.72, 5.9), b.pt(0.35, 0.82, 5.2), b.pt(0, 1.35, 4.2), b.pt(-0.35, 0.82, 5.2), C.canopy2);

    // 尾喷口
    b.tube(V(0.45, 0, -9.9), V(0.45, 0, -10.6), 0.42, 0.40, 8, C.nozzle, C.darker);
    b.tube(V(-0.45, 0, -9.9), V(-0.45, 0, -10.6), 0.42, 0.40, 8, C.nozzle, C.darker);

    // 翼套挂架（固定翼段上；活动翼段不挂东西）
    b.box(1.85, -0.58, -0.6, 0.16, 0.30, 2.4, C.dark);
    b.box(-1.85, -0.58, -0.6, 0.16, 0.30, 2.4, C.dark);

    return done(b, {
      span: 17.6, len: 20.5,
      morph: { map: morphMap, spread: morphSpread, swept: morphSwept }
    });
  })();

  /* ============================================================
     D-14「旗鱼」Sailfish —— 平流层制空战斗机
     菱形翼 + V 尾；翼载 240 kg/m²，为 20 km 高度权衡出来的形状
     ============================================================ */
  M.sailfish = (function () {
    var b = new MB();
    b.fuselage([
      { z: 11.6, w: 0.10, h: 0.08 },
      { z: 8.2, w: 0.62, h: 0.40 },
      { z: 4.0, w: 1.18, h: 0.56 },
      { z: -2.0, w: 1.48, h: 0.70 },
      { z: -7.0, w: 1.22, h: 0.64 },
      { z: -10.6, w: 0.96, h: 0.56 }
    ], C.body2, C.body3);

    // 菱形主翼（前缘 48°，后缘前掠）
    b.wing(V(1.05, -0.05, 2.2), V(6.9, -0.10, -5.6), V(6.9, -0.10, -7.2), V(1.05, -0.05, -6.6), C.wing);
    b.wingM(V(1.05, -0.05, 2.2), V(6.9, -0.10, -5.6), V(6.9, -0.10, -7.2), V(1.05, -0.05, -6.6), C.wing);

    // V 尾（兼当平尾）
    b.wing(V(0.98, 0.42, -6.0), V(3.7, 2.45, -8.7), V(3.7, 2.45, -10.0), V(0.98, 0.42, -9.0), C.wing2);
    b.wingM(V(0.98, 0.42, -6.0), V(3.7, 2.45, -8.7), V(3.7, 2.45, -10.0), V(0.98, 0.42, -9.0), C.wing2);

    // 主翼下大边条
    b.wing(V(0.4, -0.5, 3.4), V(2.2, -0.55, 1.2), V(2.2, -0.55, -2.0), V(0.4, -0.5, -1.0), C.body3);
    b.wingM(V(0.4, -0.5, 3.4), V(2.2, -0.55, 1.2), V(2.2, -0.55, -2.0), V(0.4, -0.5, -1.0), C.body3);

    b.quad(b.pt(0, 0.58, 6.4), b.pt(0.50, 0.68, 4.6), b.pt(0, 1.22, 3.2), b.pt(-0.50, 0.68, 4.6), C.canopy);

    b.tube(V(0.42, 0, -10.6), V(0.42, 0, -11.3), 0.34, 0.32, 8, C.nozzle, C.darker);
    b.tube(V(-0.42, 0, -10.6), V(-0.42, 0, -11.3), 0.34, 0.32, 8, C.nozzle, C.darker);

    return done(b, { span: 13.8, len: 22.9 });
  })();

  /* ============================================================
     G-6「鲣鸟」Booby —— 近距空中支援攻击机
     大展弦比平直翼 + 双发翼根布局 + 38 mm 钛合金装甲浴缸
     ============================================================ */
  M.booby = (function () {
    var b = new MB();
    b.fuselage([
      { z: 8.8, w: 0.34, h: 0.50 },
      { z: 6.2, w: 0.98, h: 0.98 },
      { z: 2.2, w: 1.34, h: 1.22 },
      { z: -3.0, w: 1.44, h: 1.28 },
      { z: -7.0, w: 1.22, h: 1.12 },
      { z: -9.2, w: 1.02, h: 0.96 }
    ], C.green, C.green2);

    // 大展弦比平直翼
    b.wing(V(1.30, 0.15, 2.0), V(8.6, 0.55, 0.5), V(8.6, 0.55, -2.6), V(1.30, 0.15, -3.2), C.wing2);
    b.wingM(V(1.30, 0.15, 2.0), V(8.6, 0.55, 0.5), V(8.6, 0.55, -2.6), V(1.30, 0.15, -3.2), C.wing2);

    // 双垂尾 + 平尾
    b.wing(V(1.05, 1.15, -6.1), V(1.38, 3.30, -7.2), V(1.38, 3.30, -9.2), V(1.05, 1.15, -9.0), C.green2);
    b.wingM(V(1.05, 1.15, -6.1), V(1.38, 3.30, -7.2), V(1.38, 3.30, -9.2), V(1.05, 1.15, -9.0), C.green2);
    b.wing(V(1.15, 0.35, -6.2), V(4.1, 0.35, -6.9), V(4.1, 0.35, -8.7), V(1.15, 0.35, -8.3), C.wing2);
    b.wingM(V(1.15, 0.35, -6.2), V(4.1, 0.35, -6.9), V(4.1, 0.35, -8.7), V(1.15, 0.35, -8.3), C.wing2);

    // 翼下发动机吊舱
    b.fuselage([{ z: 1.0, w: 0.52, h: 0.52, y: -0.2 }, { z: -2.0, w: 0.66, h: 0.66, y: -0.2 }, { z: -5.0, w: 0.60, h: 0.60, y: -0.2 }], C.body3);
    // 上面那段的 x 需要偏移：这里用 tube 更直接
    b.tube(V(2.35, -0.30, 1.2), V(2.35, -0.30, -5.2), 0.62, 0.58, 8, C.body3, C.darker);
    b.tube(V(-2.35, -0.30, 1.2), V(-2.35, -0.30, -5.2), 0.62, 0.58, 8, C.body3, C.darker);
    b.tube(V(2.35, -0.30, -5.2), V(2.35, -0.30, -5.9), 0.42, 0.40, 8, C.nozzle, C.darker);
    b.tube(V(-2.35, -0.30, -5.2), V(-2.35, -0.30, -5.9), 0.42, 0.40, 8, C.nozzle, C.darker);

    // 机头 CEL-7 4 管 30mm 转膛炮
    b.tube(V(0.28, -0.78, 7.0), V(0.28, -0.78, 10.2), 0.17, 0.17, 6, C.rod);
    b.tube(V(-0.28, -0.78, 7.0), V(-0.28, -0.78, 10.2), 0.17, 0.17, 6, C.rod);

    b.quad(b.pt(0, 0.90, 5.2), b.pt(0.62, 1.00, 3.9), b.pt(0, 1.55, 3.0), b.pt(-0.62, 1.00, 3.9), C.canopy);

    return done(b, { span: 17.2, len: 19.4 });
  })();

  /* ============================================================
     ROK-27「燧石」Flint —— 下游第 4 战术联队制式重型截击机
     翼身融合 + 双垂尾；下游机型普遍更重、更粗、更能忍受粗暴维护
     ============================================================ */
  M.schist = (function () {
    var b = new MB();
    b.fuselage([
      { z: 11.0, w: 0.12, h: 0.12 },
      { z: 8.0, w: 0.66, h: 0.62 },
      { z: 4.6, w: 1.24, h: 0.98 },
      { z: 0.8, w: 1.72, h: 1.14 },
      { z: -3.4, w: 1.64, h: 1.10 },
      { z: -7.6, w: 1.20, h: 0.96 },
      { z: -10.2, w: 0.96, h: 0.84 }
    ], C.body3, C.dark);

    // 后掠翼
    b.wing(V(1.55, -0.20, 1.8), V(7.4, -0.60, -2.6), V(7.4, -0.60, -4.6), V(1.55, -0.20, -4.2), C.body2);
    b.wingM(V(1.55, -0.20, 1.8), V(7.4, -0.60, -2.6), V(7.4, -0.60, -4.6), V(1.55, -0.20, -4.2), C.body2);

    // 平尾
    b.wing(V(1.15, -0.10, -7.0), V(3.9, 0.05, -8.9), V(3.9, 0.05, -10.1), V(1.15, -0.10, -9.4), C.body2);
    b.wingM(V(1.15, -0.10, -7.0), V(3.9, 0.05, -8.9), V(3.9, 0.05, -10.1), V(1.15, -0.10, -9.4), C.body2);

    // 双垂尾
    b.wing(V(1.10, 0.92, -6.0), V(1.30, 3.70, -7.8), V(1.30, 3.70, -9.6), V(1.10, 0.92, -9.4), C.body2);
    b.wingM(V(1.10, 0.92, -6.0), V(1.30, 3.70, -7.8), V(1.30, 3.70, -9.6), V(1.10, 0.92, -9.4), C.body2);

    // 尾锥 + 双发布局
    b.tube(V(0.70, 0, -10.2), V(0.70, 0, -11.0), 0.46, 0.44, 8, C.nozzle, C.darker);
    b.tube(V(-0.70, 0, -10.2), V(-0.70, 0, -11.0), 0.46, 0.44, 8, C.nozzle, C.darker);

    b.quad(b.pt(0, 0.90, 5.8), b.pt(0.58, 1.02, 4.2), b.pt(0, 1.66, 2.9), b.pt(-0.58, 1.02, 4.2), C.canopy);

    return done(b, { span: 14.8, len: 22.0 });
  })();

  /* ============================================================
     「折翼」级无人僚机 —— 只能由有人机授权开火的飞翼无人机
     VESPER-2 / VESPER-3 使用；下游有同代但更廉价的对应产品
     ============================================================ */
  M.folded_wing = (function () {
    var b = new MB();
    b.wing(V(0, 0.25, 3.6), V(4.4, 0.05, -1.8), V(2.6, 0.20, -2.9), V(0, 0.35, -2.4), C.grey);
    b.wingM(V(0, 0.25, 3.6), V(4.4, 0.05, -1.8), V(2.6, 0.20, -2.9), V(0, 0.35, -2.4), C.grey);
    b.wing(V(0, 0.35, -2.4), V(2.6, 0.20, -2.9), V(1.8, 0.22, -3.9), V(0, 0.38, -3.6), C.grey2);
    b.wingM(V(0, 0.35, -2.4), V(2.6, 0.20, -2.9), V(1.8, 0.22, -3.9), V(0, 0.38, -3.6), C.grey2);
    b.box(0, 0.42, -1.6, 0.9, 0.5, 3.0, C.dark);
    b.quad(b.pt(0, 0.40, 2.4), b.pt(0.34, 0.46, 1.4), b.pt(0, 0.80, 0.8), b.pt(-0.34, 0.46, 1.4), C.canopy);
    b.tube(V(0, 0.30, -3.4), V(0, 0.30, -4.0), 0.34, 0.30, 8, C.nozzle, C.darker);
    return done(b, { span: 8.8, len: 7.6 });
  })();

  /* ============================================================
     「灰烬」级播撒机 —— 下游的反凝结核投送平台
     体型大、速度低、自卫火力弱；载荷一旦投下就无法回收
     ============================================================ */
  M.sower = (function () {
    var b = new MB();
    b.fuselage([
      { z: 16.0, w: 0.6, h: 0.6 },
      { z: 12.0, w: 1.6, h: 1.5 },
      { z: 4.0, w: 2.6, h: 2.2 },
      { z: -8.0, w: 2.7, h: 2.3 },
      { z: -18.0, w: 2.0, h: 1.9 },
      { z: -24.0, w: 1.4, h: 1.5 }
    ], C.navy, C.dark);

    b.wing(V(2.2, 0.20, 4.0), V(19.0, 1.20, -6.0), V(19.0, 1.20, -11.0), V(2.2, 0.20, -9.0), C.navy2);
    b.wingM(V(2.2, 0.20, 4.0), V(19.0, 1.20, -6.0), V(19.0, 1.20, -11.0), V(2.2, 0.20, -9.0), C.navy2);

    b.wing(V(1.8, 2.0, -12.0), V(2.1, 7.0, -17.0), V(2.1, 7.0, -21.5), V(1.8, 2.0, -20.0), C.navy2);
    b.wingM(V(1.8, 2.0, -12.0), V(2.1, 7.0, -17.0), V(2.1, 7.0, -21.5), V(1.8, 2.0, -20.0), C.navy2);

    b.tube(V(1.6, 0, -24.0), V(1.6, 0, -26.5), 1.35, 1.25, 10, C.nozzle, C.darker);
    b.tube(V(-1.6, 0, -24.0), V(-1.6, 0, -26.5), 1.35, 1.25, 10, C.nozzle, C.darker);
    b.tube(V(2.4, 0, -24.0), V(2.4, 0, -26.0), 1.05, 1.00, 10, C.nozzle, C.darker);
    b.tube(V(-2.4, 0, -24.0), V(-2.4, 0, -26.0), 1.05, 1.00, 10, C.nozzle, C.darker);

    b.quad(b.pt(0, 2.15, 13.5), b.pt(1.1, 2.30, 10.0), b.pt(0, 3.10, 8.0), b.pt(-1.1, 2.30, 10.0), C.canopy);

    return done(b, { span: 38.0, len: 42.5 });
  })();

  /* ============================================================
     「高原」级浮空中继平台 —— 下游空情图的节点（M2 目标）
     长 82 m，把分水海域各平台的中继信号传回南边。本身几乎无武装，
     但前上方那块中继阵面是整条链路上最容易被机炮咬掉的一环
     ============================================================ */
  M.relay = (function () {
    var b = new MB();
    // 浮空体
    b.box(0, 0, 0, 26, 15, 82, C.grey2, C.grey);
    // 上部设备舱
    b.box(0, 9, -8, 18, 4, 44, C.grey, C.metal);
    // 中继天线阵面（前上方 —— 要害）
    b.box(0, 15, 24, 13, 5, 9, C.dark, C.metal);
    b.box(0, 15, 28.6, 12, 4, 0.8, C.black);
    // 尾部推进
    b.tube(V(0, 0, -41), V(0, 0, -53), 6.5, 5.5, 10, C.nozzle, C.darker);
    // 侧向电推进吊舱
    b.tube(V(13.5, -2, 12), V(13.5, -2, -6), 2.4, 2.2, 8, C.metal);
    b.tube(V(-13.5, -2, 12), V(-13.5, -2, -6), 2.4, 2.2, 8, C.metal);
    // 垂尾
    b.wing(V(0, 7, -22), V(0, 20, -34), V(0, 20, -44), V(0, 7, -40), C.grey2);
    // 下方悬挂吊舱
    b.tube(V(0, -8, 14), V(0, -15, 14), 1.6, 1.3, 6, C.rod);
    b.tube(V(0, -8, -18), V(0, -15, -18), 1.6, 1.3, 6, C.rod);
    return done(b, { span: 27, len: 82, air: true, radius: 30 });
  })();

  /* ============================================================
     DIL-4 型调节单元 —— 调节场的节点，也是本作最主要的目标物
     长 118 m 的球-翼混合体。它不会爆炸，只会漏气 ——
     三个要害：下方播撒器吊舱 / 尾部功率调节组件 / 前上相控阵阵面。
     打错地方会在那一层高度造出一团高浓度冰核云。
     ============================================================ */
  M.cell = (function () {
    var b = new MB();
    // 主浮空体（纺锤形）
    b.tube(V(0, 0, -59), V(0, 0, -30), 3.0, 11.0, 8, C.white);
    b.tube(V(0, 0, -30), V(0, 0, 20), 11.0, 17.0, 8, C.white);
    b.tube(V(0, 0, 20), V(0, 0, 45), 17.0, 8.0, 8, C.white);
    b.tube(V(0, 0, 45), V(0, 0, 59), 8.0, 1.5, 8, C.white);
    // 下方播撒器吊舱（要害 1）
    b.tube(V(0, -17, 8), V(0, -22, 6), 0.9, 0.9, 4, C.rod);
    b.box(0, -27, 6, 7, 10, 17, C.green, C.green2);
    b.tube(V(0, -32, 6), V(0, -37, 6), 2.4, 1.8, 8, C.rod, C.darker);
    // 尾部功率调节组件（要害 2）
    b.box(0, 0, -64, 9, 9, 11, C.dark, C.metal);
    b.tube(V(0, 0, -69), V(0, 0, -77), 5.0, 4.2, 8, C.nozzle, C.darker);
    // 前上相控阵雷达阵面（要害 3）
    b.box(0, 12, 36, 11, 3.5, 9, C.dark, C.metal);
    b.box(0, 12, 41, 10, 3, 0.7, C.black);
    // 太阳能板
    b.wing(V(4, 6, -22), V(30, 8, -28), V(30, 8, -44), V(4, 6, -38), C.navy2);
    b.wingM(V(4, 6, -22), V(30, 8, -28), V(30, 8, -44), V(4, 6, -38), C.navy2);
    // 稳定翼
    b.wing(V(6, -2, 12), V(23, -4, 4), V(23, -4, -8), V(6, -2, -4), C.metal);
    b.wingM(V(6, -2, 12), V(23, -4, 4), V(23, -4, -8), V(6, -2, -4), C.metal);
    return done(b, { span: 60, len: 118, air: true, radius: 34 });
  })();

  /* ============================================================
     地面目标
     ============================================================ */

  /** 中远程 SAM 发射车（4 联装） */
  M.sam = (function () {
    var b = new MB();
    b.box(0, 1.4, 0, 3.0, 1.6, 8.5, C.sand2, C.sand);   // 车体
    b.box(0, 2.6, 3.0, 2.6, 1.4, 2.6, C.sand);          // 驾驶室
    b.box(0, 3.2, -1.4, 3.2, 2.2, 4.4, C.dark);         // 发射箱基座
    // 4 根发射筒
    var i, x;
    for (i = 0; i < 4; i++) {
      x = (i % 2) ? 0.8 : -0.8;
      b.tube(V(x, 4.2 + (i < 2 ? 0.75 : -0.75), -2.6), V(x, 4.9 + (i < 2 ? 0.75 : -0.75), 1.6), 0.34, 0.34, 6, C.green, C.darker);
    }
    // 轮
    b.tube(V(1.6, 0.7, 2.6), V(-1.6, 0.7, 2.6), 0.7, 0.7, 8, C.black);
    b.tube(V(1.6, 0.7, -2.6), V(-1.6, 0.7, -2.6), 0.7, 0.7, 8, C.black);
    // 搜索雷达
    b.tube(V(0, 3.0, -4.0), V(0, 5.4, -4.0), 0.16, 0.14, 6, C.rod);
    b.wing(V(0, 5.4, -4.0), V(1.4, 6.4, -4.9), V(-1.4, 6.4, -4.9), V(0, 5.4, -5.6), C.metal);
    seaBase(b, 14, 14);                     // 防空浮台
    return done(b, { span: 9, len: 9, ground: true, radius: 5, sea: true });
  })();

  /* ============================================================
     海上平台底座

     整个战役发生在**纯海域**上 —— 战斗画面里没有任何陆地。
     所以所有"地面"目标其实都浮在海面上：一片略高于水面的甲板，
     下面一排浮筒，四角配系泊桩。

     甲板特意做得比构件底座略低，这样各个设施看起来是"建在平台上"
     而不是"从水里长出来"。
     ============================================================ */
  function seaBase(b, w, d) {
    // 甲板（顶面在 y=0 附近，构件自然坐在上面）
    b.box(0, -1.1, 0, w, 1.8, d, C.metal, C.dark);
    // 甲板边缘的护栏
    var i, n = 4;
    for (i = 0; i < n; i++) {
      var t = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
      b.box(t * w * 0.30, 0.2, d * 0.50, 1.2, 0.9, 0.5, C.grey2);
      b.box(t * w * 0.30, 0.2, -d * 0.50, 1.2, 0.9, 0.5, C.grey2);
    }
    // 浮筒：两排，压在甲板下面
    for (i = 0; i < 3; i++) {
      var u = (i - 1) * w * 0.30;
      b.tube(V(u, -2.6, d * 0.32), V(u, -2.6, -d * 0.32),
        Math.max(0.8, w * 0.07), Math.max(0.8, w * 0.07), 6, C.grey2, C.grey);
    }
    // 四角系泊桩
    b.tube(V(w * 0.44, -2.0, d * 0.44), V(w * 0.44, 4.4, d * 0.44), 0.4, 0.32, 6, C.rod);
    b.tube(V(-w * 0.44, -2.0, d * 0.44), V(-w * 0.44, 4.4, d * 0.44), 0.4, 0.32, 6, C.rod);
    b.tube(V(w * 0.44, -2.0, -d * 0.44), V(w * 0.44, 4.4, -d * 0.44), 0.4, 0.32, 6, C.rod);
    b.tube(V(-w * 0.44, -2.0, -d * 0.44), V(-w * 0.44, 4.4, -d * 0.44), 0.4, 0.32, 6, C.rod);
  }

  /** 早期预警雷达站（大型固定目标） */
  M.radar = (function () {
    var b = new MB();
    b.box(0, 3.0, 0, 12, 6, 12, C.grey2, C.grey);
    b.box(0, 8.0, 0, 8, 4, 8, C.grey);
    b.tube(V(0, 10, 0), V(0, 22, 0), 1.0, 0.8, 8, C.rod);
    // 天线阵面（倾斜）
    b.wing(V(0, 21, 0), V(9, 27, 0), V(9, 33, -7), V(0, 27, -7), C.metal);
    b.wing(V(0, 27, -7), V(9, 33, -7), V(9, 27, -7), V(0, 21, 0), C.metal);
    b.wingM(V(0, 21, 0), V(9, 27, 0), V(9, 33, -7), V(0, 27, -7), C.metal);
    b.box(0, 1.5, 9, 4, 3, 4, C.sand2);
    seaBase(b, 22, 22);                     // 浮在海面上的测控平台
    return done(b, { span: 18, len: 18, ground: true, radius: 8, sea: true });
  })();

  /** 燃油 / 弹药补给库 */
  M.depot = (function () {
    var b = new MB();
    var i, x;
    for (i = 0; i < 3; i++) {
      x = (i - 1) * 9;
      b.tube(V(x, 0, -8), V(x, 0, 8), 3.2, 3.2, 10, C.white, C.metal);
      b.box(x, 3.6, 0, 6.6, 0.5, 16.2, C.metal);
    }
    b.box(-16, 2.0, 0, 6, 4, 10, C.sand2, C.sand);
    seaBase(b, 46, 30);                     // 储油驳船
    return done(b, { span: 40, len: 24, ground: true, radius: 12, sea: true });
  })();

  /** 指挥 / 通信中枢 */
  M.cmdpost = (function () {
    var b = new MB();
    b.box(0, 2.4, 0, 16, 4.8, 12, C.grey2, C.grey);
    b.box(0, 6.0, 0, 8, 2.4, 8, C.grey);
    b.tube(V(5, 7, 4), V(5, 20, 4), 0.35, 0.28, 6, C.rod);
    b.tube(V(-5, 7, 4), V(-5, 16, 4), 0.35, 0.28, 6, C.rod);
    b.tube(V(0, 7, -4), V(0, 24, -4), 0.40, 0.30, 6, C.rod);
    b.wing(V(-5, 16, 4), V(-11, 16, 4), V(-11, 12, 4), V(-5, 12, 4), C.metal);
    // 卫星天线罩
    b.tube(V(0, 24, -4), V(0, 27, -4), 2.4, 0.4, 10, C.white);
    seaBase(b, 26, 22);                     // 通信指挥平台
    return done(b, { span: 22, len: 18, ground: true, radius: 9, sea: true });
  })();

  /** 第 7 号控制平台（地标级浮式设施，任务背景中不可摧毁） */
  M.station = (function () {
    var b = new MB();
    b.box(0, 2, 0, 88, 8, 88, C.dark, C.grey2);          // 基座
    b.box(0, 16, 0, 60, 28, 60, C.grey2, C.grey);        // 主控楼
    b.box(0, 36, 0, 42, 12, 42, C.grey, C.metal);
    // 主抛物面天线（与 1400 个单元构成闭环）
    b.tube(V(0, 42, 0), V(0, 60, 0), 3.0, 2.4, 8, C.rod);
    b.tube(V(0, 60, 0), V(0, 76, 0), 22.0, 4.0, 12, C.white, C.metal);
    // 四角塔
    var i, sx, sz;
    for (i = 0; i < 4; i++) {
      sx = (i % 2) ? 26 : -26;
      sz = (i < 2) ? 26 : -26;
      b.box(sx, 26, sz, 8, 52, 8, C.metal, C.grey);
    }
    // 地标级设施：一座 96 米的巨型浮式平台，四角下锚
    seaBase(b, 96, 96);
    var k, ang;
    for (k = 0; k < 4; k++) {
      ang = k * Math.PI / 2 + Math.PI / 4;
      b.tube(V(Math.cos(ang) * 40, -6, Math.sin(ang) * 40),
        V(Math.cos(ang) * 40, -22, Math.sin(ang) * 40),
        1.6, 1.6, 6, C.dark, C.black);
    }
    return done(b, { span: 88, len: 88, ground: true, radius: 56, sea: true });
  })();

  /* ============================================================
     水面舰船

     这一片海面上没有发生过舰队决战 —— 战利品在 18 公里的天上，
     所以舰艇在这里的活是**让别人能继续待在天上**：运油、运弹、
     修电缆、测锚位。战斗舰艇少，支援船多。

     所有舰船的水线都取 y = 0，艏朝 +z（与模型约定一致），
     元数据一律 ground + sea。详见设定集 8.0 节。
     ============================================================ */

  /* ============================================================
     虎鲸级护航驱逐舰 · 上游公约海军
     上游在分水方向唯一的水面战舰。它不找对手的主力打 ——
     它只做一件事：替上面那些漂着的东西挡导弹。
     ============================================================ */
  /* ---------- 舰炮炮塔（2-0IMPL 3.6）----------
     每门拆成两件：_base 随方位角转（原点在甲板上），_gun 随方位 + 俯仰转（原点在耳轴，炮管沿 +z）。
     TURRET_SPEC：耳轴离甲板多高、炮口离耳轴多远 —— turret.js 用它算炮口，game.js 画的时候也用它。 */
  // 不可枚举：MODELS 的其余键都是模型，遍历它的工具（smoke、出图）不该把它当模型
  Object.defineProperty(M, 'TURRET_SPEC', { enumerable: false, value: {
    tur50: { pivot: 1.35, barrel: 4.25 },
    tur75: { pivot: 1.7, barrel: 6.0 },
    tur120: { pivot: 2.05, barrel: 8.45 },
    lnch: { pivot: 1.5, barrel: 1.7 }
  } });
  /* 把有实体的炮塔按零位朝向（yaw0、俯仰 0）合进船体网格 —— 图鉴、单位详情页、离线出图
     凡是只画 MODELS[ship.model] 的地方都用它，否则炮塔拆出去以后预览里少一截炮。 */
  Object.defineProperty(M, 'composeTurrets', { enumerable: false, value: function (base, mounts) {
    if (!base || !mounts || !mounts.length) return base;
    // 记住结果：预览每帧都会来要，换新对象会让 WebGL 的顶点缓冲每帧重建
    if (mounts.__composed && mounts.__composed.base === base) return mounts.__composed.out;
    var out = { v: base.v.slice(), f: base.f.slice() };
    Object.defineProperty(mounts, '__composed', { enumerable: false, writable: true, configurable: true, value: { base: base, out: out } });
    for (var k in base) if (k !== 'v' && k !== 'f') out[k] = base[k];
    function add(part, ox, oy, oz, yaw) {
      if (!part) return;
      var c = Math.cos(yaw), s = Math.sin(yaw), o = out.v.length, i;
      for (i = 0; i < part.v.length; i++) {
        var v = part.v[i];
        out.v.push([ox + v[0] * c + v[2] * s, oy + v[1], oz - v[0] * s + v[2] * c]);
      }
      for (i = 0; i < part.f.length; i++) {
        var f = part.f[i], nf = {};
        for (var key in f) nf[key] = f[key];
        nf.i = f.i.map(function (j) { return j + o; });
        out.f.push(nf);
      }
    }
    for (var i = 0; i < mounts.length; i++) {
      var m = mounts[i];
      if (!m.model || !M[m.model + '_base']) continue;
      var sp = M.TURRET_SPEC[m.model], p = m.pos, y = m.yaw0 || 0;
      add(M[m.model + '_base'], p[0], p[1], p[2], y);
      add(M[m.model + '_gun'], p[0], p[1] + sp.pivot, p[2], y);
    }
    return out;
  } });

  function turret(w, h, d, bl, br, twin, c1, c2) {
    var b = new MB();
    // 底座：一圈矮座圈 + 炮罩，前部收一截
    b.box(0, 0.25, 0, w * 1.05, 0.5, d * 0.9, c2, c2);
    b.box(0, 0.5 + h * 0.5, -d * 0.08, w, h, d * 0.8, c1, c2);
    b.box(0, 0.5 + h * 0.85, d * 0.25, w * 0.82, h * 0.35, d * 0.35, c1, c2);
    var base = done(b);
    var g = new MB();
    g.box(0, 0, 0.2, w * 0.42, h * 0.5, d * 0.4, c1, c2);          // 炮盾
    var xs = twin ? [-w * 0.18, w * 0.18] : [0];
    for (var i = 0; i < xs.length; i++) g.tube(V(xs[i], 0, d * 0.35), V(xs[i], 0, d * 0.35 + bl), br, br * 0.8, 6, C.rod, C.rod);
    return { base: base, gun: done(g) };
  }
  /* 旋转发射架（rotSam / lnchSsm）：底座是一根矮立柱 + 回转盘，
     "炮身"是一只多联发射箱，耳轴在箱子中部，箱口朝 +z（barrel = 箱口离耳轴的距离） */
  function launcherTurret(c1, c2) {
    var b = new MB();
    b.box(0, 0.3, 0, 2.4, 0.6, 2.4, c2, c2);            // 回转盘
    b.box(0, 0.9, -0.2, 1.0, 1.2, 1.2, c1, c2);         // 立柱
    var base = done(b);
    var g = new MB();
    g.box(-0.75, 0, 0, 1.3, 1.4, 3.4, c1, c2);           // 左右两只四联箱
    g.box(0.75, 0, 0, 1.3, 1.4, 3.4, c1, c2);
    g.box(-0.75, 0, 1.71, 1.1, 1.2, 0.02, C.boot);       // 箱口盖（深色）
    g.box(0.75, 0, 1.71, 1.1, 1.2, 0.02, C.boot);
    g.box(0, -0.2, -0.4, 0.4, 0.6, 1.6, c2, c2);         // 耳轴支架
    return { base: base, gun: done(g) };
  }
  [['', C.hull2, C.hull], ['r', C.rust2, C.rust]].forEach(function (pal) {
    var t = launcherTurret(pal[1], pal[2]);
    M['lnch' + pal[0] + '_base'] = t.base; M['lnch' + pal[0] + '_gun'] = t.gun;
  });
  M.TURRET_SPEC.lnchr = M.TURRET_SPEC.lnch;

  (function () {
    /* 两套涂装：上游舰的灰（hull），下游舰的锈红（rust）—— 名字带 r 的是后者 */
    var SZ = { tur50: [2.6, 1.4, 3.0, 3.2, 0.12, true], tur75: [3.8, 2.0, 4.6, 4.4, 0.20, false],
      tur120: [5.0, 2.6, 6.4, 6.2, 0.30, false] };
    for (var k in SZ) {
      var z = SZ[k];
      [['', C.hull2, C.hull], ['r', C.rust2, C.rust]].forEach(function (pal) {
        var t = turret(z[0], z[1], z[2], z[3], z[4], z[5], pal[1], pal[2]);
        M[k + pal[0] + '_base'] = t.base; M[k + pal[0] + '_gun'] = t.gun;
      });
      M.TURRET_SPEC[k + 'r'] = M.TURRET_SPEC[k];
    }
  })();

  M.orca = (function () {
    var b = new MB();
    b.hull([
      { z: 74, w: 0.9, y0: -1.2, y1: 6.6 },
      { z: 62, w: 3.4, y0: -2.8, y1: 6.4 },
      { z: 46, w: 6.2, y0: -3.6, y1: 6.0 },
      { z: 18, w: 8.4, y0: -3.8, y1: 5.6 },
      { z: -16, w: 9.2, y0: -3.8, y1: 5.4 },
      { z: -48, w: 8.8, y0: -3.6, y1: 5.4 },
      { z: -68, w: 7.6, y0: -3.2, y1: 5.4 },
      { z: -74, w: 6.2, y0: -3.0, y1: 5.4 }
    ], C.hull, C.deck, C.boot);

    // 舰艏炮：实体炮塔（tur75），见 SHIPS[].mounts

    // 前甲板垂发：一块盖板，格栅用金属色带表示
    b.box(0, 6.1, 47, 5.8, 1.2, 9.0, C.hull2, C.metal);
    b.box(0, 6.8, 47, 5.0, 0.25, 8.0, C.boot);

    // 舰桥（三层收分）
    house(b, 0, 24, 12.2, 4.6, 17.0, 5.4, C.hull2, C.hull);
    /* 第二层一直做到相控阵顶：阵面要贴在实心舱壁上，
       以前阵面挂在一层窄舱室外面，中间空一米、背后没封，看着是个空心支架 */
    house(b, 0, 21.4, 9.8, 8.9, 12.4, 10.0, C.hull, C.hull);
    house(b, 0, 21, 8.0, 2.4, 8.0, 18.9, C.hull2, C.hull);
    b.box(0, 20.1, 21, 8.4, 0.7, 8.4, C.canopy);       // 驾驶室窗带
    // 四面相控阵
    b.box(5.15, 16.2, 20, 0.5, 5.4, 9.4, C.metal);
    b.box(-5.15, 16.2, 20, 0.5, 5.4, 9.4, C.metal);
    b.box(0, 16.2, 27.4, 8.4, 5.4, 0.5, C.metal);

    mast(b, 0, 18, 10.0, 30.0, 1.5, 0.5, C.hull2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.box(0, 12.6, -4, 6.2, 8.6, 8.0, C.hull2, C.boot); // 烟囱

    // 后部机库 + 近防炮 + 直升机甲板
    house(b, 0, -34, 11.0, 6.0, 20.0, 5.4, C.hull2, C.hull);
    b.box(0, 6.6, -14, 3.2, 2.2, 3.2, C.hull2, C.metal);
    b.box(0, 5.5, -58, 10.4, 0.18, 14.0, C.deck, C.hull2);

    return done(b, { span: 18.4, len: 148, ground: true, sea: true, radius: 44 });
  })();

  /* ============================================================
     蓝鲸级快速战斗支援舰 · 上游公约海军
     两万吨的"油弹一条龙"。艉部上层建筑、中部三座补给门架 ——
     它靠的是把整支中队的油、弹、备件一次性带过来。
     ============================================================ */
  M.bluewhale = (function () {
    var b = new MB();
    b.hull([
      { z: 104, w: 1.6, y0: -1.6, y1: 12.4 },
      { z: 88, w: 6.0, y0: -4.0, y1: 11.8 },
      { z: 62, w: 11.0, y0: -5.0, y1: 11.2 },
      { z: 20, w: 13.2, y0: -5.4, y1: 11.0 },
      { z: -30, w: 13.3, y0: -5.4, y1: 11.0 },
      { z: -76, w: 12.6, y0: -5.0, y1: 11.0 },
      { z: -100, w: 11.4, y0: -4.0, y1: 11.0 },
      { z: -106, w: 8.0, y0: -3.4, y1: 11.0 }
    ], C.hull, C.deck, C.boot);

    // 艏楼
    house(b, 0, 88, 15.0, 5.4, 22.0, 12.0, C.hull, C.hull);
    b.box(0, 18.4, 88, 9.0, 1.6, 10.0, C.metal);       // 舰桥顶

    // 三座横向补给门架：立柱 + 横梁，货从中间吊过去
    var gz = [50, 2, -46], gi, s;
    for (gi = 0; gi < 3; gi++) {
      for (s = -1; s <= 1; s += 2) {
        b.tube(V(s * 13.0, 11.0, gz[gi]), V(s * 13.0, 29.0, gz[gi]),
          0.9, 0.65, 4, C.metal);
      }
      b.box(0, 29.0, gz[gi], 27.6, 1.5, 2.2, C.metal);
    }

    // 甲板货箱：三层堆叠，颜色按排轮换（补给品不分类，只编号）
    var cols = [C.cargo, C.cargo2, C.cargo3];
    var ci, ri, li, cx, cz;
    for (ci = 0; ci < 3; ci++) {
      cx = (ci - 1) * 7.4;
      for (ri = 0; ri < 7; ri++) {
        cz = 76 - ri * 15.0;
        for (li = 0; li < 2; li++) {
          b.box(cx, 11.8 + li * 2.6, cz, 6.4, 2.4, 12.0,
            cols[(ci + ri + li) % 3]);
        }
      }
    }

    // 艉部上层建筑 + 双烟囱
    house(b, 0, -74, 22.0, 7.0, 26.0, 11.0, C.hull2, C.hull);
    house(b, 0, -72, 16.0, 4.0, 16.0, 18.0, C.hull, C.hull);
    b.box(0, 25.8, -72, 8.6, 0.7, 8.6, C.canopy);
    b.tube(V(4.2, 22.0, -86), V(4.2, 31.0, -86), 2.2, 1.9, 6, C.hull2, C.boot);
    b.tube(V(-4.2, 22.0, -86), V(-4.2, 31.0, -86), 2.2, 1.9, 6, C.hull2, C.boot);
    mast(b, 0, -65, 22.0, 38.0, 1.4, 0.5, C.hull2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    return done(b, { span: 26.6, len: 210, ground: true, sea: true, radius: 62 });
  })();

  /* ============================================================
     三叶虫级导弹快艇 · 下游同盟海军
     42 米、八枚反舰弹、贴海跑 40 节。它是本作里唯一的"饱和攻击"
     平台，也是造价最低的一条船 —— 两者本来就是同一件事。
     ============================================================ */
  M.trilobite = (function () {
    var b = new MB();
    b.hull([
      { z: 21, w: 0.4, y0: -0.6, y1: 3.2 },
      { z: 16, w: 1.8, y0: -1.2, y1: 2.9 },
      { z: 8, w: 3.4, y0: -1.7, y1: 2.6 },
      { z: -6, w: 4.2, y0: -1.8, y1: 2.6 },
      { z: -16, w: 4.0, y0: -1.6, y1: 2.6 },
      { z: -21, w: 3.2, y0: -1.4, y1: 2.6 }
    ], C.rust, C.deck, C.boot);

    // 舰桥（低矮、后倾）
    house(b, 0, -1, 4.8, 2.4, 7.0, 2.6, C.rust2, C.rust);
    b.box(0, 5.2, -1, 3.0, 0.5, 4.4, C.canopy);
    mast(b, 0, -1, 5.5, 11.0, 0.6, 0.22, C.rust2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    // 两座四联装反舰弹发射箱（后甲板，上仰 13°）
    b.boxTilt(1.9, 4.2, -11, 1.9, 1.9, 11.0, -0.23, C.rust2, C.rust);
    b.boxTilt(-1.9, 4.2, -11, 1.9, 1.9, 11.0, -0.23, C.rust2, C.rust);

    // 舰艏小口径炮 + 缆桩
    b.box(0, 3.3, 14, 2.2, 1.4, 2.6, C.rust2, C.metal);
    b.tube(V(0, 3.6, 15.3), V(0, 3.8, 17.4), 0.16, 0.14, 6, C.rod);

    return done(b, { span: 8.4, len: 42, ground: true, sea: true, radius: 13 });
  })();

  /* ============================================================
     菊石级巡逻护卫舰 · 下游同盟海军
     下游在分水海域最常出现的一条船。菊石是干河床上最容易捡到的
     那种石头 —— 螺旋形，一层一层，到处都是。
     ============================================================ */
  M.ammonite = (function () {
    var b = new MB();
    b.hull([
      { z: 59, w: 0.7, y0: -1.2, y1: 5.8 },
      { z: 49, w: 2.8, y0: -2.4, y1: 5.6 },
      { z: 36, w: 5.2, y0: -3.2, y1: 5.3 },
      { z: 14, w: 7.0, y0: -3.4, y1: 5.0 },
      { z: -14, w: 7.5, y0: -3.4, y1: 5.0 },
      { z: -40, w: 7.0, y0: -3.2, y1: 5.0 },
      { z: -55, w: 6.0, y0: -2.8, y1: 5.0 },
      { z: -59, w: 5.0, y0: -2.6, y1: 5.0 }
    ], C.rust, C.deck, C.boot);

    // 舰艏炮：实体炮塔，见 SHIPS[].mounts

    house(b, 0, 18, 10.0, 4.2, 14.0, 5.0, C.rust2, C.rust);
    house(b, 0, 16, 8.0, 3.0, 9.6, 9.2, C.rust, C.rust);
    b.box(0, 12.8, 16, 8.3, 0.6, 9.9, C.canopy);
    b.box(0, 15.4, 20.6, 6.6, 3.4, 0.5, C.metal);         // 前向搜索阵面
    mast(b, 0, 13, 12.2, 25.0, 1.2, 0.4, C.rust2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    // 中部两座四联装反舰弹：靠两舷放（舰桥半宽 5，箱子内侧在它外面）。
    // 两对仰角一样（约 29°），后面那一对的弹道从前面那一对头顶越过去
    b.boxTilt(6.0, 6.9, -2, 1.5, 1.5, 8.0, -0.50, C.rust2, C.rust);
    b.boxTilt(-6.0, 6.9, -2, 1.5, 1.5, 8.0, -0.50, C.rust2, C.rust);
    b.boxTilt(6.0, 6.9, -14, 1.5, 1.5, 8.0, -0.50, C.rust2, C.rust);
    b.boxTilt(-6.0, 6.9, -14, 1.5, 1.5, 8.0, -0.50, C.rust2, C.rust);

    // 后部舰空弹箱 + 烟囱
    b.box(0, 6.8, -30, 4.4, 3.0, 7.0, C.rust2, C.metal);
    b.tube(V(2.4, 8.8, -40), V(2.4, 14.6, -40), 1.5, 1.2, 6, C.rust2, C.boot);
    b.tube(V(-2.4, 8.8, -40), V(-2.4, 14.6, -40), 1.5, 1.2, 6, C.rust2, C.boot);

    return done(b, { span: 15.2, len: 118, ground: true, sea: true, radius: 36 });
  })();

  /* ============================================================
     海蝎级登陆舰 · 下游同盟海军
     板足鲎，俗称海蝎 —— 古生代海里最早爬上陆地的动物之一。
     它是下游命名法里少数几个不带哀悼的名字：它至少到过岸上。
     艏门一开，整条船就是一块放下来的跳板。
     ============================================================ */
  M.seascorpion = (function () {
    var b = new MB();
    b.hull([
      { z: 66, w: 6.2, y0: -3.0, y1: 5.0 },
      { z: 60, w: 8.4, y0: -3.8, y1: 5.2 },
      { z: 36, w: 9.8, y0: -4.2, y1: 5.4 },
      { z: 0, w: 10.2, y0: -4.4, y1: 5.4 },
      { z: -40, w: 10.0, y0: -4.2, y1: 5.6 },
      { z: -60, w: 9.2, y0: -3.6, y1: 6.2 },
      { z: -66, w: 8.0, y0: -3.2, y1: 6.4 }
    ], C.rust, C.deck, C.boot);

    // 艏门（抬起状态）+ 已经放下去的跳板
    b.boxTilt(0, 3.6, 65, 10.6, 7.0, 1.8, -0.30, C.rust2, C.rust);
    b.boxTilt(0, 1.9, 71.5, 8.2, 0.5, 9.5, -0.11, C.metal);

    // 贯穿车辆甲板上的货：装甲车与托盘
    var vi, vz;
    for (vi = 0; vi < 4; vi++) {
      vz = 46 - vi * 11;
      b.box(vi % 2 ? 3.0 : -3.0, 6.9, vz, 4.2, 2.6, 8.0, C.rust2, C.rust);
      b.box(vi % 2 ? -3.6 : 3.6, 6.5, vz + 3.0, 4.0, 1.8, 4.6, C.cargo);
    }

    // 艉部上层建筑：它是唯一高起来的东西，艏部必须空着
    house(b, 0, -46, 17.0, 8.0, 24.0, 5.4, C.rust2, C.rust);
    house(b, 0, -44, 12.0, 4.0, 12.0, 13.4, C.rust, C.rust);
    b.box(0, 17.8, -44, 9.0, 0.6, 9.0, C.canopy);
    mast(b, 0, -40, 17.5, 27.0, 1.0, 0.35, C.rust2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    return done(b, { span: 20.4, len: 132, ground: true, sea: true, radius: 40 });
  })();

  /* ============================================================
     屿级巡逻艇（DAPLU Mk.1） · 分水群岛国
     丹湾船厂的民用艇改的。政变之后，同型四条船上挂着四种旗 ——
     其中一条的旗被撕掉了，一直没人换。
     ============================================================ */
  M.daplu = (function () {
    var b = new MB();
    b.hull([
      { z: 15.5, w: 0.3, y0: -0.5, y1: 2.6 },
      { z: 12.0, w: 1.4, y0: -1.0, y1: 2.4 },
      { z: 6.0, w: 2.6, y0: -1.3, y1: 2.2 },
      { z: -5.0, w: 3.3, y0: -1.4, y1: 2.2 },
      { z: -12.0, w: 3.1, y0: -1.2, y1: 2.2 },
      { z: -15.5, w: 2.4, y0: -1.0, y1: 2.2 }
    ], C.snow, C.deck, C.boot);

    house(b, 0, -0.5, 3.9, 2.0, 6.2, 2.2, C.snow2, C.snow);
    b.box(0, 4.5, -0.5, 2.7, 0.5, 4.2, C.canopy);
    mast(b, 0, -0.5, 4.8, 9.8, 0.5, 0.18, C.snow2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.box(0, 2.9, 10.5, 1.9, 1.2, 2.2, C.snow2, C.metal);   // 前甲板小炮
    b.box(0, 2.5, -12.5, 2.6, 0.9, 3.2, C.deck, C.hull);    // 艉部小艇座

    return done(b, { span: 6.6, len: 31, ground: true, sea: true, radius: 10 });
  })();

  /* ============================================================
     准绳级布缆船（SKORI） · 调节场管理局
     控制平台的四角锚系、海底水听器阵列、平台之间的光纤 ——
     切一条电缆比炸一座平台便宜得多，所以修电缆的船一直很忙。
     管理局不挂军标，船名就是它的全部身份。
     ============================================================ */
  M.skori = (function () {
    var b = new MB();
    b.hull([
      { z: 51, w: 1.0, y0: -1.6, y1: 12.0 },
      { z: 44, w: 4.2, y0: -3.2, y1: 11.6 },
      { z: 34, w: 6.8, y0: -4.0, y1: 8.6 },
      { z: 10, w: 8.4, y0: -4.4, y1: 8.2 },
      { z: -20, w: 8.6, y0: -4.4, y1: 7.4 },
      { z: -44, w: 8.0, y0: -4.0, y1: 6.4 },
      { z: -51, w: 6.6, y0: -3.4, y1: 6.2 }
    ], C.snow, C.deck, C.boot);

    // 艏楼作业甲板 + 主布缆绞盘（横置滚筒）
    house(b, 0, 44, 14.0, 3.0, 18.0, 11.0, C.snow, C.snow2);
    b.tube(V(6.6, 16.2, 44), V(-6.6, 16.2, 44), 3.0, 3.0, 10, C.metal);

    // 舰桥（艏楼之后）
    house(b, 0, 16, 12.0, 4.4, 16.0, 8.4, C.snow2, C.snow);
    house(b, 0, 15, 9.4, 3.0, 10.0, 12.8, C.snow, C.snow);
    b.box(0, 16.3, 15, 9.8, 0.7, 10.4, C.canopy);
    mast(b, 0, 11, 16.0, 28.0, 1.2, 0.4, C.snow2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    // 艉部布缆机 + 滑轮门架
    b.tube(V(5.6, 9.8, -42), V(-5.6, 9.8, -42), 3.4, 3.4, 10, C.metal);
    b.tube(V(3.2, 6.6, -26), V(1.2, 15.0, -32), 0.5, 0.4, 4, C.metal);
    b.tube(V(-3.2, 6.6, -26), V(-1.2, 15.0, -32), 0.5, 0.4, 4, C.metal);
    b.box(0, 15.0, -32, 3.0, 0.8, 1.6, C.metal);

    return done(b, { span: 18.4, len: 102, ground: true, sea: true, radius: 32 });
  })();

  /* ============================================================
     标杆级海洋测量船（DIKLO） · 调节场管理局
     双体船：两倍的水线面，换来一个不晃的甲板 ——
     而它的活恰恰是在晃的海面上量出厘米级的锚位变化。
     九座控制平台里有七座是浮式的，锚必须定期重测。
     ============================================================ */
  M.diklo = (function () {
    var b = new MB();
    var side, hullSecs = [
      { z: 31, w: 0.4, y0: -0.6, y1: 4.2 },
      { z: 26, w: 1.6, y0: -1.6, y1: 4.2 },
      { z: 14, w: 2.4, y0: -2.2, y1: 4.2 },
      { z: -14, w: 2.5, y0: -2.2, y1: 4.2 },
      { z: -26, w: 2.2, y0: -1.8, y1: 4.2 },
      { z: -31, w: 1.6, y0: -1.4, y1: 4.2 }
    ];
    for (side = -1; side <= 1; side += 2) {
      var secs = [], i;
      for (i = 0; i < hullSecs.length; i++) {
        secs.push({
          z: hullSecs[i].z, w: hullSecs[i].w, y0: hullSecs[i].y0,
          y1: hullSecs[i].y1, x: side * 6.2
        });
      }
      b.hull(secs, C.snow, C.deck, C.boot);
    }
    // 连接甲板（把两个片体连成一个作业面）
    b.box(0, 6.0, 0, 17.2, 2.6, 46.0, C.snow2, C.deck);

    // 艏部上层建筑
    house(b, 0, 14, 12.6, 4.6, 16.0, 7.3, C.snow, C.snow2);
    b.box(0, 12.4, 14, 10.0, 0.7, 10.0, C.canopy);
    mast(b, 0, 8, 12.0, 24.0, 1.1, 0.4, C.snow2);
    b.tube(V(0, 24.0, 8), V(0, 27.0, 8), 1.6, 1.2, 8, C.white);   // 天线罩

    // 艉部 A 型吊架（投放测深仪与海底取样器）
    b.tube(V(4.2, 7.3, -14), V(1.4, 17.0, -22), 0.5, 0.4, 4, C.metal);
    b.tube(V(-4.2, 7.3, -14), V(-1.4, 17.0, -22), 0.5, 0.4, 4, C.metal);
    b.box(0, 17.0, -22, 3.2, 0.9, 1.8, C.metal);
    b.tube(V(3.0, 8.4, -6), V(-3.0, 8.4, -6), 1.8, 1.8, 8, C.metal);

    return done(b, { span: 17.2, len: 62, ground: true, sea: true, radius: 20 });
  })();

  /* ============================================================
     南十字号重货船 · 南回契约（未参战）

     它不属于任何一方，而且它同时给两边送货。
     所以在这片海域上，它是唯一一条整夜开着识别信号的船 ——
     它怕的不是被发现，是**被当成别人的船**。
     ============================================================ */
  M.cross = (function () {
    var b = new MB();
    b.hull([
      { z: 89, w: 2.0, y0: -2.2, y1: 9.6 },
      { z: 74, w: 7.0, y0: -5.2, y1: 9.2 },
      { z: 46, w: 11.4, y0: -6.6, y1: 9.0 },
      { z: 0, w: 13.4, y0: -7.0, y1: 9.0 },
      { z: -48, w: 13.6, y0: -7.0, y1: 9.0 },
      { z: -78, w: 13.0, y0: -6.2, y1: 9.0 },
      { z: -89, w: 12.0, y0: -5.2, y1: 9.0 }
    ], C.navy, C.deck, C.boot);

    // 艉部上层建筑 + 烟囱
    house(b, 0, -74, 21.0, 6.0, 22.0, 9.0, C.white, C.grey);
    house(b, 0, -72, 14.0, 3.4, 14.0, 15.0, C.grey, C.white);
    b.box(0, 18.8, -72, 10.4, 0.6, 10.4, C.canopy);
    b.tube(V(0, 15.0, -86), V(0, 26.0, -86), 3.0, 2.6, 8, C.grey2, C.black);

    // 甲板集装箱：3 列 × 7 排 × 2 层
    var cols = [C.cargo, C.cargo2, C.cargo3];
    var ci, ri, li;
    for (ci = 0; ci < 3; ci++) {
      for (ri = 0; ri < 7; ri++) {
        for (li = 0; li < 2; li++) {
          b.box((ci - 1) * 7.8, 9.8 + li * 2.6, 66 - ri * 16.0,
            6.6, 2.4, 13.0, cols[(ci * 3 + ri + li) % 3]);
        }
      }
    }

    // 艏楼 + 桅杆
    house(b, 0, 80, 12.0, 4.0, 16.0, 9.0, C.white, C.grey);
    mast(b, 0, 78, 13.0, 24.0, 0.9, 0.3, C.grey);

    return done(b, { span: 27.4, len: 178, ground: true, sea: true, radius: 54 });
  })();

  /* ============================================================
     冰芯号水文调查船 · 高纬联合（未参战）

     极北四国靠一层十几万年攒下来的冰活着，而他们要判断
     "季风线的位移有没有动到高纬的降雪补给"。这需要同位素数据，
     需要一条船，需要在这片海里待够一个雨季。
     船上没有武器 —— 它也的确不需要，因为没有人想打它。
     ============================================================ */
  M.icecore = (function () {
    var b = new MB();
    b.hull([
      { z: 46, w: 1.2, y0: -3.4, y1: 6.4 },   // 破冰艏：水线下前倾
      { z: 40, w: 4.0, y0: -4.6, y1: 6.2 },
      { z: 28, w: 6.6, y0: -5.2, y1: 6.0 },
      { z: 6, w: 8.0, y0: -5.4, y1: 5.8 },
      { z: -22, w: 8.2, y0: -5.4, y1: 5.6 },
      { z: -40, w: 7.4, y0: -4.8, y1: 5.6 },
      { z: -46, w: 6.2, y0: -4.2, y1: 5.6 }
    ], C.snow, C.deck, C.boot);

    // 舰桥 + 雷达罩
    house(b, 0, 12, 13.0, 4.8, 18.0, 5.6, C.snow2, C.snow);
    house(b, 0, 10, 9.6, 3.0, 11.0, 10.4, C.snow, C.snow);
    b.box(0, 13.8, 10, 10.0, 0.7, 11.2, C.canopy);
    mast(b, 0, 7, 13.5, 26.0, 1.1, 0.4, C.snow2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.tube(V(0, 26.0, 4), V(0, 29.4, 4), 2.2, 1.4, 10, C.white);  // 球形罩

    // 艉部 A 型吊架 + 绞车（采水、采沉积柱）
    b.tube(V(4.6, 5.6, -32), V(1.5, 16.5, -42), 0.55, 0.45, 4, C.metal);
    b.tube(V(-4.6, 5.6, -32), V(-1.5, 16.5, -42), 0.55, 0.45, 4, C.metal);
    b.box(0, 16.5, -42, 3.4, 1.0, 1.8, C.metal);
    b.tube(V(3.2, 7.0, -24), V(-3.2, 7.0, -24), 2.0, 2.0, 8, C.metal);

    // 中层甲板上的采样设备
    b.box(-5.0, 8.4, -6, 4.6, 2.4, 9.0, C.snow2, C.metal);
    b.box(5.0, 7.8, -8, 3.8, 1.6, 6.0, C.snow2, C.metal);

    return done(b, { span: 17.4, len: 92, ground: true, sea: true, radius: 30 });
  })();

  /* ============================================================
     环礁号观察船 · 环外共同体（未参战）

     它们谴责了十六年，而实际行动始终是零。这条船就是那个"零"：
     全共同体凑出来的一条旧调查船，没有武器，油还停在
     上游的驳船上。它唯一的优势是天线上那面旗 ——
     打沉它，等于替对方把一份谴责声明变成了开战理由。
     ============================================================ */
  M.atoll = (function () {
    var b = new MB();
    b.hull([
      { z: 28, w: 0.5, y0: -0.8, y1: 4.0 },
      { z: 23, w: 2.2, y0: -1.8, y1: 3.9 },
      { z: 16, w: 4.0, y0: -2.4, y1: 3.7 },
      { z: 0, w: 5.4, y0: -2.6, y1: 3.6 },
      { z: -18, w: 5.0, y0: -2.4, y1: 3.6 },
      { z: -26, w: 4.0, y0: -2.0, y1: 3.8 }
    ], C.white, C.deck, C.boot);

    house(b, 0, 4, 8.2, 3.4, 12.0, 3.6, C.white, C.grey);
    b.box(0, 7.7, 4, 6.6, 0.6, 9.0, C.canopy);
    // 它最显眼的部分是桅杆 —— 而桅杆上能挂的东西只有天线和旗
    mast(b, 0, -1.5, 7.0, 22.0, 0.9, 0.3, C.grey);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.box(0, 12.5, -6, 6.0, 0.25, 0.25, C.grey2);
    b.box(0, 17.0, -6, 4.4, 0.25, 0.25, C.grey2);
    b.box(0, 4.4, -20, 3.0, 0.9, 4.0, C.deck, C.hull);      // 艉部工作平台

    return done(b, { span: 11.4, len: 56, ground: true, sea: true, radius: 18 });
  })();

  /* ============================================================
     上游公约 · 主力舰队

     上面那两艘（虎鲸 / 蓝鲸）是"在这片海面上干活"的船；
     下面这三艘是**一支完整的编队**该有的样子 ——
     上游是群岛与海洋国家，海军是他们的传统军种，
     所以他们的重舰不是临时改的，是几十年攒下来的。

     三艘都用鲸命名，与飞机（海鸟 / 海鱼）分开 —— 见设定集 8.0.1。
     ============================================================ */

  /* ============================================================
     座头鲸级航空母舰 · 上游公约海军

     它就是 DB-11 的 desc 里那句"280 米长的浮岛平台"。
     上游不叫它航母，叫**浮岛** —— 因为它不跟着舰队跑，
     它开到哪片海，那片海就成了它的机场。
     ============================================================ */
  M.humpback = (function () {
    var b = new MB();
    // 船体：机库舷侧是高而方正的，飞行甲板要架在它上面
    b.hull([
      { z: 140, w: 2.4, y0: -3.0, y1: 17.0 },
      { z: 124, w: 8.2, y0: -6.2, y1: 17.0 },
      { z: 100, w: 13.2, y0: -7.8, y1: 17.0 },
      { z: 56, w: 16.4, y0: -8.6, y1: 17.0 },
      { z: -40, w: 16.8, y0: -8.8, y1: 17.0 },
      { z: -102, w: 16.2, y0: -8.2, y1: 17.0 },
      { z: -128, w: 14.4, y0: -7.0, y1: 17.0 },
      { z: -140, w: 11.6, y0: -5.8, y1: 17.0 }
    ], C.hull, C.deck, C.boot);

    // 飞行甲板：比船体宽出一圈（外飘），这是航母最好认的一条轮廓线
    b.box(0, 18.4, 0, 40.0, 1.6, 276, C.hull2, C.deck);
    // 斜角甲板：左舷往后伸出去的那一段
    b.wing(V(-13, 19.2, -34), V(-31, 19.2, -92),
      V(-31, 19.2, -148), V(-13, 19.2, -126), C.deck);
    // 甲板边缘的警示带
    b.box(19.2, 19.25, 0, 1.2, 0.12, 274, C.yellow);
    b.box(-19.2, 19.25, 0, 1.2, 0.12, 274, C.yellow);
    // 甲板中线 + 两条弹射器轨道：航母最容易被认出来的几笔线
    b.box(0, 19.28, -10, 0.7, 0.1, 240, C.hull2);
    b.box(-9.5, 19.32, 62, 1.1, 0.16, 130, C.metal);
    b.box(6.5, 19.32, 54, 1.1, 0.16, 120, C.metal);

    // 两部舷侧升降机（甲板上两块颜色不同的方板）
    b.box(12.0, 19.3, 26, 12, 0.25, 15, C.metal);
    b.box(12.0, 19.3, -74, 12, 0.25, 15, C.metal);

    // 舰岛：右舷靠后，是整条船上唯一高起来的东西（刻意做高，
    // 否则 280 米的甲板会把它压成一颗不起眼的铆钉）
    house(b, 12.5, -52, 12.0, 15.0, 32.0, 19.4, C.hull2, C.hull);
    house(b, 12.5, -50, 9.4, 5.0, 18.0, 34.4, C.hull, C.hull);
    b.box(12.5, 39.7, -50, 9.8, 0.8, 18.4, C.canopy);
    mast(b, 12.5, -44, 39.4, 58.0, 1.5, 0.5, C.hull2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.tube(V(12.5, 24.0, -68), V(12.5, 33.0, -68), 2.2, 1.9, 6, C.hull2, C.boot);

    // 甲板上的舰载机（简化剪影，停在两舷与艉部）
    var parked = [[-9, 96], [-9, 66], [-9, 30], [-9, -6], [-9, -40], [7, 92], [7, 58]];
    for (var pi = 0; pi < parked.length; pi++) {
      var px = parked[pi][0], pz = parked[pi][1];
      /* 机身中心在 (px, pz)。两侧机翼都按 px 写 —— 以前右翼用 wingM 镜像，
         而 wingM 是绕船的中线（x = 0）镜像，右翼于是跑到了甲板另一侧 */
      b.box(px, 20.0, pz, 2.0, 1.2, 10.4, C.grey, C.white);          // 机身
      b.wing(V(px - 1.0, 20.2, pz + 1.6), V(px - 6.0, 20.2, pz - 2.0),
        V(px - 6.0, 20.2, pz - 3.4), V(px - 1.0, 20.2, pz - 2.4), C.metal);   // 左翼
      b.wing(V(px + 1.0, 20.2, pz + 1.6), V(px + 6.0, 20.2, pz - 2.0),
        V(px + 6.0, 20.2, pz - 3.4), V(px + 1.0, 20.2, pz - 2.4), C.metal);   // 右翼
      b.wing(V(px - 1.0, 20.3, pz - 4.0), V(px - 3.0, 20.3, pz - 4.9),
        V(px - 3.0, 20.3, pz - 5.4), V(px - 1.0, 20.3, pz - 5.2), C.metal);   // 平尾
      b.wing(V(px + 1.0, 20.3, pz - 4.0), V(px + 3.0, 20.3, pz - 4.9),
        V(px + 3.0, 20.3, pz - 5.4), V(px + 1.0, 20.3, pz - 5.2), C.metal);
      b.wing(V(px, 20.6, pz - 2.8), V(px, 23.0, pz - 4.4),
        V(px, 23.0, pz - 5.2), V(px, 20.6, pz - 5.2), C.metal);      // 垂尾
    }

    return done(b, { span: 40, len: 280, ground: true, sea: true, radius: 84 });
  })();

  /* ============================================================
     抹香鲸级巡洋舰 · 上游公约海军

     编队的防空指挥舰。它是这片海域上唯一"能同时盯住几百个目标"
     的东西 —— 抹香鲸是最大的齿鲸，而它靠的是脑袋里那套声学系统。
     ============================================================ */
  M.spermwhale = (function () {
    var b = new MB();
    b.hull([
      { z: 84, w: 1.0, y0: -1.6, y1: 7.6 },
      { z: 70, w: 4.0, y0: -3.4, y1: 7.4 },
      { z: 52, w: 7.0, y0: -4.4, y1: 7.0 },
      { z: 20, w: 9.4, y0: -4.8, y1: 6.6 },
      { z: -20, w: 10.2, y0: -4.8, y1: 6.4 },
      { z: -54, w: 9.6, y0: -4.4, y1: 6.4 },
      { z: -78, w: 8.4, y0: -3.8, y1: 6.4 },
      { z: -84, w: 7.0, y0: -3.4, y1: 6.4 }
    ], C.hull, C.deck, C.boot);

    // 舰艏主炮 + 前后垂发阵位
    // 舰艏炮：实体炮塔，见 SHIPS[].mounts
    b.box(0, 7.0, 52, 7.4, 1.4, 12.0, C.hull2, C.metal);
    b.box(0, 7.8, 52, 6.4, 0.28, 10.6, C.boot);
    b.box(0, 7.0, -42, 8.8, 1.5, 16.0, C.hull2, C.metal);
    b.box(0, 7.9, -42, 7.6, 0.28, 14.2, C.boot);

    // 舰桥：比驱逐舰高一整层，因为里面是编队的防空指挥席
    house(b, 0, 22, 15.0, 6.0, 22.0, 6.4, C.hull2, C.hull);
    house(b, 0, 20.5, 12.4, 6.1, 15.0, 12.4, C.hull, C.hull);    // 做到阵面顶，阵面贴实
    house(b, 0, 19, 9.6, 2.6, 9.6, 18.5, C.hull2, C.hull);
    b.box(0, 19.8, 19, 10.0, 0.7, 10.0, C.canopy);
    // 四面大相控阵（比驱逐舰那四面整整大一圈）
    b.box(6.45, 15.0, 20, 0.6, 7.0, 12.0, C.metal);
    b.box(-6.45, 15.0, 20, 0.6, 7.0, 12.0, C.metal);
    b.box(0, 15.0, 27.8, 9.6, 7.0, 0.6, C.metal);

    // 塔式综合桅杆 + 双烟囱
    mast(b, 0, 15, 19.5, 40.0, 2.4, 0.7, C.hull2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）
    b.box(0, 15.4, -6, 7.0, 10.0, 9.0, C.hull2, C.boot);
    b.box(0, 15.4, -22, 7.0, 10.0, 9.0, C.hull2, C.boot);

    // 后部机库 + 近防炮
    house(b, 0, -60, 12.0, 6.4, 22.0, 6.4, C.hull2, C.hull);
    b.box(0, 8.0, -30, 3.6, 2.4, 3.6, C.hull2, C.metal);
    b.box(0, 6.5, -76, 11.0, 0.18, 12.0, C.deck, C.hull2);

    return done(b, { span: 20.4, len: 168, ground: true, sea: true, radius: 50 });
  })();

  /* ============================================================
     海豚级护卫舰 · 上游公约海军

     编队里跑腿的那一条：反潜、护渔、给补给舰看门。
     海豚成群、声呐好、专管水下的东西 —— 护卫舰干的就是这些活。
     ============================================================ */
  M.dolphin = (function () {
    var b = new MB();
    b.hull([
      { z: 54, w: 0.7, y0: -1.0, y1: 5.4 },
      { z: 45, w: 2.6, y0: -2.2, y1: 5.2 },
      { z: 33, w: 4.6, y0: -2.8, y1: 5.0 },
      { z: 12, w: 6.2, y0: -3.0, y1: 4.8 },
      { z: -12, w: 6.6, y0: -3.0, y1: 4.8 },
      { z: -38, w: 6.2, y0: -2.8, y1: 5.0 },
      { z: -51, w: 5.2, y0: -2.4, y1: 5.0 },
      { z: -54, w: 4.2, y0: -2.2, y1: 5.0 }
    ], C.hull, C.deck, C.boot);

    // 舰艏炮：实体炮塔（tur75），见 SHIPS[].mounts

    house(b, 0, 16, 9.0, 4.2, 13.0, 4.8, C.hull2, C.hull);
    house(b, 0, 14, 7.0, 3.0, 9.0, 9.0, C.hull, C.hull);
    b.box(0, 12.3, 14, 7.4, 0.6, 9.4, C.canopy);
    b.box(0, 14.6, 18.4, 5.8, 3.0, 0.5, C.metal);               // 前向阵面
    mast(b, 0, 11, 12.0, 22.0, 1.0, 0.35, C.hull2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    // 中部反舰弹（两座双联）+ 后部旋转舰空弹架。
    // 放在舰桥与烟囱之间那段空甲板上，离舰桥远一点、仰角 20°：弹道从舰桥顶上越过
    b.boxTilt(1.4, 6.0, -11, 1.4, 1.4, 6.6, -0.36, C.hull2, C.hull);
    b.boxTilt(-1.4, 6.0, -11, 1.4, 1.4, 6.6, -0.36, C.hull2, C.hull);
    // 后部旋转舰空弹架：实体炮塔（lnch），见 SHIP_LAUNCHERS
    b.tube(V(0, 11.0, -32), V(0, 15.4, -32), 1.2, 1.0, 6, C.hull2, C.boot);

    return done(b, { span: 14.4, len: 108, ground: true, sea: true, radius: 33 });
  })();

  /* ============================================================
     下游同盟 · 远程火力

     下游是大陆国家，海军的底子薄，所以他们的"重舰"只有两个方向可走：
     **把导弹堆到极致**，或者**把导弹堆到极致再堆一遍**。
     下面两艘就是这两条路 —— 一条武库舰，一条重型反舰巡洋舰。

     命名沿用化石（飞机用矿物与岩石），见设定集 8.0.1。
     ============================================================ */

  /* ============================================================
     房角石级武库舰 · 下游同盟海军

     房角石是古生代的巨型直角石：一整条九米长的壳分成几十个房室，
     而动物只住在最外面那一间。这条船是同一个结构 ——
     船体里绝大多数体积是发射单元，人占的地方只有前部那一小块。
     ============================================================ */
  M.cameroceras = (function () {
    var b = new MB();
    b.hull([
      { z: 97, w: 1.2, y0: -1.6, y1: 6.8 },
      { z: 84, w: 4.6, y0: -3.6, y1: 6.6 },
      { z: 62, w: 8.6, y0: -4.8, y1: 6.4 },
      { z: 24, w: 11.6, y0: -5.2, y1: 6.2 },
      { z: -30, w: 12.0, y0: -5.2, y1: 6.2 },
      { z: -70, w: 11.4, y0: -4.8, y1: 6.2 },
      { z: -92, w: 9.6, y0: -4.0, y1: 6.4 },
      { z: -97, w: 8.0, y0: -3.4, y1: 6.4 }
    ], C.rust, C.deck, C.boot);

    /* 三段发射模块。格线用横条表示 —— 一条船几百个单元，
       真做一个格子一个顶点会直接顶到 render.js 的 2048 上限。 */
    var mods = [[68, 32, 7], [10, 44, 9], [-58, 40, 8]];
    for (var mi = 0; mi < mods.length; mi++) {
      var mz = mods[mi][0], ml = mods[mi][1], mline = mods[mi][2];
      b.box(0, 7.6, mz, 20.4, 2.6, ml, C.rust2, C.metal);
      b.box(0, 9.0, mz, 18.6, 0.22, ml - 2.2, C.boot);
      for (var k = 0; k < mline; k++) {
        var lz = mz - (ml - 4) / 2 + k * (ml - 4) / (mline - 1);
        b.box(0, 9.14, lz, 18.6, 0.14, 0.6, C.metal);
      }
    }

    // 低矮的舰桥 —— 它不需要高大，它需要的是一整片甲板
    house(b, 0, 42, 14.0, 4.4, 16.0, 6.4, C.rust2, C.rust);
    b.box(0, 11.2, 42, 10.4, 0.7, 10.4, C.canopy);
    mast(b, 0, 34, 10.8, 27.0, 1.7, 0.55, C.rust2);   // 挪到舰桥顶上（原来底座悬在舰桥后面）

    // 艉部动力：两台烟囱挤在一起
    b.box(0, 10.4, -80, 9.0, 8.4, 12.0, C.rust2, C.boot);

    return done(b, { span: 24.0, len: 195, ground: true, sea: true, radius: 58 });
  })();

  /* ============================================================
     邓氏鱼级巡洋舰 · 下游同盟海军

     泥盆纪的盾皮鱼，最早的海中巨兽之一 —— 咬合力是它唯一的本事。
     这条船也一样：它把全部吨位花在了反舰弹上，防空只够自保。
     ============================================================ */
  M.dunkleosteus = (function () {
    var b = new MB();
    b.hull([
      { z: 76, w: 0.9, y0: -1.4, y1: 6.6 },
      { z: 63, w: 3.6, y0: -3.2, y1: 6.4 },
      { z: 46, w: 6.4, y0: -4.2, y1: 6.2 },
      { z: 18, w: 8.8, y0: -4.6, y1: 6.0 },
      { z: -18, w: 9.4, y0: -4.6, y1: 5.8 },
      { z: -48, w: 8.8, y0: -4.2, y1: 5.8 },
      { z: -70, w: 7.8, y0: -3.6, y1: 6.0 },
      { z: -76, w: 6.4, y0: -3.2, y1: 6.0 }
    ], C.rust, C.deck, C.boot);

    // 舰艏主炮：下游口径最大的一门
    // 舰艏炮：实体炮塔，见 SHIPS[].mounts

    // 两组八联装反舰弹都在舰桥前面，同在中线两侧、仰角统一约 11°。
    // 后组的弹道和前组平行，飞到前组箱子上方时已经高出箱顶约 4 m，不会被挡
    b.boxTilt(2.6, 8.6, 30, 4.0, 2.4, 20.0, -0.2, C.rust2, C.rust);
    b.boxTilt(-2.6, 8.6, 30, 4.0, 2.4, 20.0, -0.2, C.rust2, C.rust);
    b.boxTilt(2.6, 8.2, 3, 4.0, 2.2, 16.0, -0.2, C.rust2, C.rust);
    b.boxTilt(-2.6, 8.2, 3, 4.0, 2.2, 16.0, -0.2, C.rust2, C.rust);

    // 舰桥挪到反舰弹后面（原来夹在两组发射架中间，后组只能靠大仰角越顶）
    house(b, 0, -22, 13.0, 5.0, 20.0, 5.8, C.rust2, C.rust);
    house(b, 0, -23, 9.6, 3.4, 12.0, 10.8, C.rust, C.rust);
    b.box(0, 14.2, -23, 10.0, 0.7, 12.4, C.canopy);
    b.box(0, 16.2, -16.4, 7.0, 3.6, 0.6, C.metal);         // 前向搜索阵面
    mast(b, 0, -27.5, 14.2, 27.0, 1.5, 0.5, C.rust2);

    // 双烟囱
    b.tube(V(3.0, 10.0, -48), V(3.0, 16.0, -48), 1.6, 1.3, 6, C.rust2, C.boot);
    b.tube(V(-3.0, 10.0, -48), V(-3.0, 16.0, -48), 1.6, 1.3, 6, C.rust2, C.boot);

    // 近防炮座：烟囱和艉部发射架之间的一截矮甲板室
    b.box(0, 6.8, -56, 3.0, 1.4, 3.0, C.rust2, C.metal);

    // 尾部：旋转舰空弹架（实体炮塔 lnchr，见 SHIP_LAUNCHERS）坐在一截矮甲板室上 + 直升机甲板
    b.box(0, 6.8, -64, 4.0, 1.4, 4.0, C.rust2, C.metal);
    b.box(0, 6.1, -72, 9.0, 0.18, 9.0, C.deck, C.hull2);

    return done(b, { span: 18.8, len: 152, ground: true, sea: true, radius: 46 });
  })();

  /* ============================================================
     固定式海上平台（2-0IMPL 4.9）

     和舰船同一套坐标：水线 y = 0，"船头"朝 +z（平台的 yaw 只决定炮位零位朝哪边）。
     每种平台一个构造函数，wreck = true 时出残骸版本：
       甲板歪斜、上层建筑与炮座没了、一根桩腿断掉，甲板上散几块碎件 ——
     game.js 在平台被击毁后改画 <model>_wreck，并让它往下沉一截。
     炮塔 / 发射架不烘焙在这里，位置见 data.js 的 PLATFORM_MOUNTS / PLATFORM_LAUNCHERS。
     ============================================================ */
  /** 导管架：四根桩腿 + 每面两道 X 形撑杆。broken = 断掉的那根腿的序号（-1 不断） */
  function jacket(b, hw, hd, y0, y1, r, col, broken) {
    var L = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], i;
    for (i = 0; i < 4; i++) {
      var top = i === broken ? y0 + (y1 - y0) * 0.45 : y1;
      b.tube(V(L[i][0], y0, L[i][1]), V(L[i][0], top, L[i][1]), r, r * 0.85, 6, col, C.boot);
    }
    var ya = y0 + (y1 - y0) * 0.25, yb = y0 + (y1 - y0) * 0.7;
    for (i = 0; i < 4; i++) {
      if (i === broken || (i + 1) % 4 === broken) continue;        // 断腿那两面的撑杆跟着没了
      var A = L[i], B2 = L[(i + 1) % 4];
      b.tube(V(A[0], ya, A[1]), V(B2[0], yb, B2[1]), r * 0.3, r * 0.3, 4, col);
      b.tube(V(A[0], yb, A[1]), V(B2[0], ya, B2[1]), r * 0.3, r * 0.3, 4, col);
    }
  }
  /** 平台甲板：完好是一块平板；残骸是一块往断腿那边歪下去的板，外加几块碎件 */
  function pDeck(b, w, d, y, col, colTop, wreck) {
    if (!wreck) { b.box(0, y, 0, w, 2.0, d, col, colTop); return; }
    // 甲板烧黑、往一边歪；碎块按甲板大小缩放，摆在甲板面上（歪的那一面跟着降）
    b.boxTilt(0, y - 2.5, 0, w, 2.0, d, 0.16, C.darker, C.dark);
    var k = Math.min(w, d) / 36;
    for (var i = 0; i < 5; i++) {
      var dz = (i % 3 - 1) * d * 0.25;
      b.box((i - 2) * w * 0.17, y - 1.0 + 0.16 * dz + 0.8 * k, dz, (2.5 + i % 2) * k, 1.6 * k, (3 + i % 3) * k, C.dark, C.black);
    }
  }

  /** shoal 浅滩站 · 上游公约 · 导管架防空平台：雷达罩 + 舰空弹垂发 + 两座近防 */
  function buildShoal(wreck) {
    var b = new MB();
    jacket(b, 13, 13, -6, 19, 1.5, C.hull2, wreck ? 2 : -1);
    pDeck(b, 36, 36, 20, C.hull2, C.deck, wreck);
    if (!wreck) {
      house(b, 0, -6, 16, 7, 12, 21, C.hull, C.hull);
      b.box(0, 24.6, 0.1, 12, 4.6, 0.5, C.metal);                       // 前向阵面
      mast(b, 0, -8, 28, 38, 0.8, 0.3, C.hull2);
      b.tube(V(0, 38.6, -8), V(0, 42.6, -8), 2.6, 2.6, 8, C.white, C.white);   // 雷达罩
      b.box(8, 21.5, 9, 8, 1.0, 8, C.hull2, C.metal);                   // 垂发盖板
      b.box(-12, 21.2, -13, 8, 0.2, 8, C.yellow);                       // 直升机吊运区
    }
    return done(b, { span: 36, len: 36, ground: true, sea: true, radius: 30 });
  }
  /** breakwater 防波堤 · 上游公约 · 半潜补给平台：两条浮箱 + 四根立柱 + 油罐与吊车 */
  function buildBreakwater(wreck) {
    var b = new MB();
    for (var sx = -1; sx <= 1; sx += 2) {
      b.tube(V(sx * 20, -1.5, -30), V(sx * 20, -1.5, 30), 4.2, 4.2, 8, C.hull2, C.boot);    // 浮箱
      for (var sz = -1; sz <= 1; sz += 2) {
        if (wreck && sx > 0 && sz > 0) continue;
        b.tube(V(sx * 20, 0, sz * 20), V(sx * 20, 14, sz * 20), 3.2, 3.2, 8, C.hull, C.hull2);
      }
    }
    pDeck(b, 56, 48, 15, C.hull2, C.deck, wreck);
    if (!wreck) {
      for (var i = 0; i < 3; i++) b.tube(V(-14 + i * 9, 18.5, -10), V(-14 + i * 9, 18.5, 10), 3.4, 3.4, 8, C.white, C.snow2);  // 油罐
      house(b, 18, -14, 12, 8, 12, 16, C.hull, C.hull);
      b.boxTilt(10, 26, 8, 1.4, 1.4, 22, -0.6, C.yellow);              // 吊车臂
      b.tube(V(10, 16, 0), V(10, 24, 0), 1.0, 0.8, 6, C.yellow);
      b.box(-14, 16.1, 18, 14, 0.2, 10, C.yellow);                      // 直升机甲板
    }
    return done(b, { span: 56, len: 60, ground: true, sea: true, radius: 40 });
  }
  /** sluice 闸口 · 下游同盟 · 重型炮台平台：前后两座 120 炮、两舷反舰弹架、中央塔楼 */
  function buildSluice(wreck) {
    var b = new MB();
    jacket(b, 18, 15, -6, 17, 1.8, C.rust2, wreck ? 0 : -1);
    pDeck(b, 50, 40, 18, C.rust2, C.deck, wreck);
    if (!wreck) {
      house(b, 0, 0, 14, 7, 10, 19, C.rust, C.rust);                    // 中央塔楼，顶上是 30 mm
      b.box(0, 23.5, 5.1, 10, 3.4, 0.5, C.metal);
      mast(b, 0, -3, 26, 36, 0.8, 0.3, C.rust2);
      // 两舷四座斜置反舰弹箱，箱口朝外（yaw ±90°）
      b.boxTilt(17, 20.6, 7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, Math.PI / 2);
      b.boxTilt(17, 20.6, -7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, Math.PI / 2);
      b.boxTilt(-17, 20.6, 7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, -Math.PI / 2);
      b.boxTilt(-17, 20.6, -7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, -Math.PI / 2);
    }
    return done(b, { span: 50, len: 50, ground: true, sea: true, radius: 36 });
  }
  /** reed 芦苇 · 下游同盟 · 轻型哨戒平台：单桩小平台，一门 75 炮 + 一座旋转防空弹架 */
  function buildReed(wreck) {
    var b = new MB();
    jacket(b, 5, 5, -5, 11, 1.0, C.rust2, wreck ? 1 : -1);
    pDeck(b, 18, 20, 12, C.rust2, C.deck, wreck);
    if (!wreck) {
      house(b, 5, 0, 6, 4, 6, 13, C.rust, C.rust);
      mast(b, 6, 0, 17, 25, 0.5, 0.2, C.rust2);
      b.box(6, 22, 0, 3.0, 1.6, 0.3, C.metal);
    }
    return done(b, { span: 18, len: 20, ground: true, sea: true, radius: 14 });
  }
  /** cairn 石堆 · 分水群岛国 · 改装钻井平台：粗桩腿、钻塔、生活舱、直升机坪 —— 民用平台加装了炮 */
  function buildCairn(wreck) {
    var b = new MB();
    jacket(b, 18, 18, -6, 23, 2.6, C.yellow, wreck ? 3 : -1);
    pDeck(b, 48, 48, 24, C.grey2, C.deck, wreck);
    if (!wreck) {
      // 钻塔：四根往上收的立柱
      for (var i = 0; i < 4; i++) {
        var dx = i % 2 ? 4 : -4, dz = i < 2 ? 4 : -4;
        b.tube(V(dx, 25, dz), V(dx * 0.25, 52, dz * 0.25), 0.5, 0.35, 4, C.white);
      }
      b.box(0, 52.5, 0, 3, 1.2, 3, C.red);
      house(b, -14, 12, 16, 9, 14, 25, C.white, C.snow2);                 // 生活舱
      b.box(14, 33.2, -16, 14, 0.4, 14, C.yellow);                        // 悬臂直升机坪
      b.tube(V(14, 25, -16), V(14, 33, -16), 1.0, 1.0, 6, C.grey2);
    }
    return done(b, { span: 48, len: 48, ground: true, sea: true, radius: 36 });
  }
  /** beacon 航标 · 调节场管理局 · 无人测量 / 中继平台：单立柱 + 小甲板 + 天线桅 */
  function buildBeacon(wreck) {
    var b = new MB();
    b.tube(V(0, -5, 0), V(0, wreck ? 4 : 8, 0), 2.2, 2.0, 8, C.snow, C.snow2);
    pDeck(b, 12, 12, 9, C.snow2, C.snow, wreck);
    if (!wreck) {
      mast(b, 0, 0, 10, 22, 0.4, 0.15, C.snow2);
      b.wing(V(-5.5, 10.8, -3), V(-1.5, 10.8, -3), V(-1.5, 12, 1), V(-5.5, 12, 1), C.canopy);   // 太阳能板
      b.box(3.5, 11, 3, 3, 2, 3, C.snow, C.snow2);
      b.box(0, 22.6, 0, 2.4, 0.3, 0.3, C.red);
    }
    return done(b, { span: 12, len: 12, ground: true, sea: true, radius: 10 });
  }
  [['shoal', buildShoal], ['breakwater', buildBreakwater], ['sluice', buildSluice],
   ['reed', buildReed], ['cairn', buildCairn], ['beacon', buildBeacon]].forEach(function (e) {
    M[e[0]] = e[1](false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, e[0] + '_wreck', { enumerable: false, value: e[1](true) });
  });

  /* ---------- 按武器外观（WEAPONS[id].look）生成的弹体 / 挂架 ----------
     以前所有导弹共用一个 3.4 m 的壳子：短矢和极远挂在翼下长得一模一样，
     火箭巢、三联巢也只是"一枚导弹"。现在：
       round(w) —— 单发弹体，飞出去的那一枚
       store(w) —— 挂架上的样子：单发 / 多联挂梁 / 发射巢
     data.js 在 models.js 之后加载，所以按需生成、按武器缓存。 */
  function addRound(b, lk, ox, oy, oz) {
    var L = lk.len, r = lk.dia / 2, z0 = oz - L / 2, z1 = oz + L / 2;
    var bomb = lk.fin === 'bomb';
    var noseZ = z1 - L * (bomb ? 0.28 : 0.16);
    var tailZ = z0 + L * (bomb ? 0.12 : 0);
    var bodyCol = bomb ? C.green2 : C.white;
    // 弹体 + 头锥（炸弹是圆钝头、导弹是尖头）
    b.tube(V(ox, oy, tailZ), V(ox, oy, noseZ), bomb ? r * 0.7 : r, r, 6, bodyCol, null);
    b.tube(V(ox, oy, noseZ), V(ox, oy, z1), r, bomb ? r * 0.35 : r * 0.12, 6, bodyCol, C.metal);
    if (bomb) b.tube(V(ox, oy, z0), V(ox, oy, tailZ), r * 0.35, r * 0.7, 6, C.darker, null);
    // 助推段：尾部一圈深色加粗
    if (lk.boost) b.tube(V(ox, oy, z0), V(ox, oy, z0 + L * 0.22), r * 1.12, r * 1.12, 6, C.grey2, C.darker);

    var f = lk.fin, fs = Math.max(r * 2.6, 0.22);
    function cross(za, zb, span, lead) {
      // 四片十字翼：za 前缘根部，zb 后缘根部，span 翼展，lead 翼尖后退量
      var s = r + span;
      b.wing(V(ox + r, oy, za), V(ox + s, oy, za - lead), V(ox + s, oy, zb), V(ox + r, oy, zb), C.grey);
      b.wing(V(ox - r, oy, za), V(ox - s, oy, za - lead), V(ox - s, oy, zb), V(ox - r, oy, zb), C.grey);
      b.wing(V(ox, oy + r, za), V(ox, oy + s, za - lead), V(ox, oy + s, zb), V(ox, oy + r, zb), C.grey);
      b.wing(V(ox, oy - r, za), V(ox, oy - s, za - lead), V(ox, oy - s, zb), V(ox, oy - r, zb), C.grey);
    }
    if (f === 'strake') {
      cross(oz + L * 0.10, oz - L * 0.22, fs * 0.55, L * 0.12);   // 长边条
      cross(z0 + L * 0.16, z0, fs * 0.95, L * 0.10);              // 大尾舵
    } else if (f === 'cruise') {
      // 平直大弹翼（左右一对）+ 小尾翼
      var ws = L * 0.34;
      b.wing(V(ox + r, oy + r * 0.6, oz + L * 0.06), V(ox + r + ws, oy + r * 0.6, oz - L * 0.02),
        V(ox + r + ws, oy + r * 0.6, oz - L * 0.10), V(ox + r, oy + r * 0.6, oz - L * 0.10), C.grey);
      b.wing(V(ox - r, oy + r * 0.6, oz + L * 0.06), V(ox - r - ws, oy + r * 0.6, oz - L * 0.02),
        V(ox - r - ws, oy + r * 0.6, oz - L * 0.10), V(ox - r, oy + r * 0.6, oz - L * 0.10), C.grey);
      cross(z0 + L * 0.12, z0, r * 1.4, L * 0.06);
    } else if (f === 'bomb') {
      cross(z0 + L * 0.14, z0, r * 0.9, L * 0.06);
    } else {
      cross(oz + L * 0.02, oz - L * 0.08, r * 1.1, L * 0.03);     // 小中翼
      cross(z0 + L * 0.12, z0, r * 1.7, L * 0.06);                // 尾舵
    }
  }

  var ROUND_CACHE = {}, STORE_CACHE = {};
  var DEFAULT_LOOK = { len: 3.4, dia: 0.28, fin: 'small' };

  function round(w) {
    if (!w) return M.missile;
    if (ROUND_CACHE[w.id]) return ROUND_CACHE[w.id];
    var lk = w.look || DEFAULT_LOOK, b = new MB();
    // 巢式武器：dia 是整个巢，离架后的单发按 rdia（没写就退回 dia）
    if (lk.rdia) { var lk2 = {}; for (var kk in lk) lk2[kk] = lk[kk]; lk2.dia = lk.rdia; lk = lk2; }
    addRound(b, lk, 0, 0, 0);
    return (ROUND_CACHE[w.id] = done(b, { span: lk.dia * 6, len: lk.len }));
  }

  function store(w) {
    if (!w) return M.missile;
    if (w.kind === 'ecm' || w.kind === 'dew' || !w.look) return M[w.model] || M.missile;
    if (STORE_CACHE[w.id]) return STORE_CACHE[w.id];
    var lk = w.look, b = new MB(), r = lk.dia / 2, L = lk.len, i;
    if (lk.nest) {
      // 发射巢：一个外壳 + 前端深色管口
      var n = lk.cells || 3;
      if (lk.nest === 'tube') {
        b.tube(V(0, -r, -L / 2), V(0, -r, L / 2), r, r, 10, C.green, C.darker);
        b.tube(V(0, -r, -L / 2 - 0.2), V(0, -r, -L / 2), r * 0.55, r, 10, C.green2, null);
        // 平头前端：中心一根 + 外圈一圈管口，伸出端面一点
        var cr = r * 0.24;
        b.tube(V(0, -r, L / 2), V(0, -r, L / 2 + 0.06), cr, cr, 6, C.black, C.black);
        for (i = 0; i < n - 1; i++) {
          var th = i / (n - 1) * Math.PI * 2;
          var cx = Math.cos(th) * r * 0.62, cy = -r + Math.sin(th) * r * 0.62;
          b.tube(V(cx, cy, L / 2), V(cx, cy, L / 2 + 0.06), cr, cr, 6, C.black, C.black);
        }
      } else {
        // 方巢：n 个小格排成一行（n=4 时 2×2）
        var cols = n === 4 ? 2 : n, rows = n === 4 ? 2 : 1;
        var cw = lk.dia * 1.5, bw = cols * cw, bh = rows * cw;
        b.box(0, -bh / 2, 0, bw, bh, L, C.navy2, C.navy);
        for (var cx2 = 0; cx2 < cols; cx2++) for (var cy2 = 0; cy2 < rows; cy2++) {
          var hx = -bw / 2 + cw * (cx2 + 0.5), hy = -bh + cw * (cy2 + 0.5);
          // 管口：伸出一点的弹头
          b.tube(V(hx, hy, L / 2), V(hx, hy, L / 2 + 0.22), r, r * 0.15, 6, C.white, C.metal);
        }
      }
      return (STORE_CACHE[w.id] = done(b, { span: lk.dia * 4, len: L }));
    }
    var n2 = lk.rack || 1;
    if (n2 === 1) {
      addRound(b, lk, 0, -r, 0);
    } else {
      // 多联挂梁：一根横梁，弹并排挂在下面；三联是"左右两枚 + 下方一枚"
      var gap = lk.dia * 1.25;
      b.box(0, 0.02, 0, gap * (n2 === 3 ? 2 : 1) + lk.dia * 1.2, 0.08, L * 0.45, C.dark, C.grey2);
      if (n2 === 2) {
        addRound(b, lk, gap / 2, -r - 0.05, 0);
        addRound(b, lk, -gap / 2, -r - 0.05, 0);
      } else {
        addRound(b, lk, gap, -r - 0.05, 0);
        addRound(b, lk, -gap, -r - 0.05, 0);
        addRound(b, lk, 0, -r * 3 - 0.08, 0);
      }
    }
    return (STORE_CACHE[w.id] = done(b, { span: lk.dia * 6, len: L }));
  }
  // 不可枚举：MODELS 的键要全是模型（图鉴 / 冒烟测试会逐个遍历渲染）
  Object.defineProperty(M, 'round', { value: round, enumerable: false });
  Object.defineProperty(M, 'store', { value: store, enumerable: false });

  /* 挂载离挂点往下放多少：模型最高点（含竖直尾翼）× 缩放 + 一点间隙。
     贴死了尾翼会戳进机翼，所以统一"略微浮空"。实机（game.js pushOneStore）
     与机库预览（unitview.js composeLoadout）共用这一份。 */
  var STORE_GAP = 0.08;
  function storeDrop(mdl, scale) {
    if (mdl.top === undefined) {
      var t = -1e9;
      for (var i = 0; i < mdl.v.length; i++) if (mdl.v[i][1] > t) t = mdl.v[i][1];
      mdl.top = t;
    }
    return mdl.top * scale + STORE_GAP;
  }
  // 按 look 生成的模型是真实米数；吊舱等老模型沿用 0.85 的缩放
  function storeScale(w) { return (w && w.look) ? 1 : 0.85; }
  Object.defineProperty(M, 'storeDrop', { value: storeDrop, enumerable: false });
  Object.defineProperty(M, 'storeScale', { value: storeScale, enumerable: false });

  /* ---------- 导弹 / 炸弹小模型 ---------- */
  M.missile = (function () {
    var b = new MB();
    b.tube(V(0, 0, -1.4), V(0, 0, 1.4), 0.14, 0.14, 6, C.white, C.metal);
    b.quad(b.pt(-0.05, 0, 1.4), b.pt(0.05, 0, 1.4), b.pt(0, 0, 2.0), b.pt(0, 0, 2.0), C.metal);
    b.wing(V(0.14, 0, -0.6), V(0.62, 0, -1.0), V(0.62, 0, -1.5), V(0.14, 0, -1.1), C.grey);
    b.wingM(V(0.14, 0, -0.6), V(0.62, 0, -1.0), V(0.62, 0, -1.5), V(0.14, 0, -1.1), C.grey);
    b.wing(V(0, 0.14, -0.6), V(0, 0.55, -1.0), V(0, 0.55, -1.5), V(0, 0.14, -1.1), C.grey);
    b.wing(V(0, -0.14, -0.6), V(0, -0.55, -1.0), V(0, -0.55, -1.5), V(0, -0.14, -1.1), C.grey);
    return done(b, { span: 1.3, len: 3.4 });
  })();

  M.bomb = (function () {
    var b = new MB();
    b.tube(V(0, 0, -1.0), V(0, 0, 1.0), 0.24, 0.20, 6, C.green2, C.darker);
    b.wing(V(0.2, 0, -0.7), V(0.7, 0, -0.9), V(0.7, 0, -1.3), V(0.2, 0, -1.1), C.grey);
    b.wingM(V(0.2, 0, -0.7), V(0.7, 0, -0.9), V(0.7, 0, -1.3), V(0.2, 0, -1.1), C.grey);
    return done(b, { span: 1.4, len: 2.2 });
  })();

  /* 吊舱（干扰 / 光电 / 对抗）。

     挂载物里**唯一不是弹药**的东西，所以剪影必须一眼能和导弹分开：
     短、粗、钝头，尾端一圈散热格栅，尾鳍又小又窄。

     以前所有吊舱都借用 M.missile 的外壳（e4 / l2 连 model 都没写），
     于是"这架带了干扰吊舱"在画面上根本读不出来 —— 一张"导弹 + 吊舱"
     的预览图和一张"纯导弹"的预览图是**字节相同**的两张图。 */
  M.pod = (function () {
    var b = new MB();
    // 主弹体：比导弹粗一倍多、短一截
    b.tube(V(0, 0, -1.15), V(0, 0, 1.15), 0.30, 0.30, 8, C.navy2, C.navy);
    // 钝头（前端封口：吊舱没有导引头，本来就是个盖）
    b.tube(V(0, 0, 1.15), V(0, 0, 1.48), 0.30, 0.17, 8, C.navy2, C.dark);
    // 尾锥 + 散热格栅
    b.tube(V(0, 0, -1.15), V(0, 0, -1.42), 0.30, 0.20, 8, C.navy2, C.darker);
    b.tube(V(0, 0, -0.98), V(0, 0, -1.18), 0.335, 0.335, 8, C.darker, C.black);
    // 四片窄尾鳍
    b.wing(V(0.28, 0, -1.00), V(0.54, 0, -1.16), V(0.54, 0, -1.42), V(0.28, 0, -1.28), C.navy);
    b.wingM(V(0.28, 0, -1.00), V(0.54, 0, -1.16), V(0.54, 0, -1.42), V(0.28, 0, -1.28), C.navy);
    b.wing(V(0, 0.28, -1.00), V(0, 0.54, -1.16), V(0, 0.54, -1.42), V(0, 0.28, -1.28), C.navy);
    b.wing(V(0, -0.28, -1.00), V(0, -0.54, -1.16), V(0, -0.54, -1.42), V(0, -0.28, -1.28), C.navy);
    return done(b, { span: 1.1, len: 2.9 });
  })();

  /* ============================================================
     F-9「海燕」Petrel —— 高空高速截击机
     大三角翼 + 双发 + 外倾双垂尾。为了在两万米以上截击而生的气动：
     翼载高、后掠大、结构简单，低空盘旋一塌糊涂。
     ============================================================ */
  M.petrel = (function () {
    var b = new MB();
    b.fuselage([
      { z: 11.4, w: 0.08, h: 0.08 },
      { z: 9.0, w: 0.44, h: 0.42 },
      { z: 6.0, w: 0.84, h: 0.78 },
      { z: 3.0, w: 1.30, h: 1.14 },
      { z: -1.0, w: 1.56, h: 1.28 },
      { z: -5.5, w: 1.68, h: 1.32 },
      { z: -9.6, w: 1.44, h: 1.14 }
    ], C.body, C.body3);

    // 大三角翼
    b.wing(V(1.42, -0.30, 2.6), V(6.6, -0.62, -6.4),
      V(6.6, -0.62, -7.7), V(1.52, -0.30, -6.1), C.wing);
    b.wingM(V(1.42, -0.30, 2.6), V(6.6, -0.62, -6.4),
      V(6.6, -0.62, -7.7), V(1.52, -0.30, -6.1), C.wing);

    // 外倾双垂尾
    b.wing(V(0.70, 1.00, -6.2), V(2.30, 3.40, -9.4),
      V(2.30, 3.40, -10.3), V(0.70, 1.00, -7.3), C.wing2);
    b.wingM(V(0.70, 1.00, -6.2), V(2.30, 3.40, -9.4),
      V(2.30, 3.40, -10.3), V(0.70, 1.00, -7.3), C.wing2);

    // 平尾（小）
    b.wing(V(1.5, 0.10, -6.6), V(3.4, -0.10, -9.4),
      V(3.4, -0.10, -10.2), V(1.5, 0.10, -8.2), C.wing2);
    b.wingM(V(1.5, 0.10, -6.6), V(3.4, -0.10, -9.4),
      V(3.4, -0.10, -10.2), V(1.5, 0.10, -8.2), C.wing2);

    // 双尾喷口
    b.tube(V(0.76, -0.12, -9.4), V(0.76, -0.12, -10.5), 0.44, 0.42, 8, C.nozzle, C.darker);
    b.tube(V(-0.76, -0.12, -9.4), V(-0.76, -0.12, -10.5), 0.44, 0.42, 8, C.nozzle, C.darker);

    // 进气道
    b.box(0.92, -0.36, 1.4, 0.46, 0.86, 3.6, C.dark);
    b.box(-0.92, -0.36, 1.4, 0.46, 0.86, 3.6, C.dark);

    // 座舱盖
    b.quad(b.vt(V(0, 1.00, 8.6)), b.vt(V(0.44, 0.72, 5.2)),
      b.vt(V(0, 0.58, 3.8)), b.vt(V(-0.44, 0.72, 5.2)), C.canopy);

    return done(b, {
      span: 13.2, len: 22.9,
      sweepAlt: null
    });
  })();

  /* ============================================================
     D-21「贼鸥」Skua —— 多用途隐形战斗机
     无尾菱形翼，机身与机翼融合成一个扁平的升力体。
     没有垂尾 —— 航向稳定靠翼尖的阻力舵和推力矢量。
     ============================================================ */
  M.skua = (function () {
    var b = new MB();
    b.fuselage([
      { z: 10.6, w: 0.10, h: 0.08 },
      { z: 8.2, w: 0.52, h: 0.34 },
      { z: 5.0, w: 1.10, h: 0.56 },
      { z: 1.0, w: 1.72, h: 0.74 },
      { z: -3.5, w: 1.86, h: 0.76 },
      { z: -8.0, w: 1.58, h: 0.64 },
      { z: -11.0, w: 1.10, h: 0.50 }
    ], C.body, C.body2);

    // 菱形翼：前缘大后掠、后缘前掠，前后对称收成菱形
    b.wing(V(1.5, -0.10, 3.0), V(6.9, -0.24, -2.6),
      V(6.9, -0.24, -4.4), V(1.6, -0.10, -8.6), C.wing);
    b.wingM(V(1.5, -0.10, 3.0), V(6.9, -0.24, -2.6),
      V(6.9, -0.24, -4.4), V(1.6, -0.10, -8.6), C.wing);

    // 扁平尾缘（代替垂尾的航向稳定面）
    b.wing(V(1.2, 0.20, -8.4), V(4.2, 0.06, -9.6),
      V(4.2, 0.06, -10.4), V(1.2, 0.20, -10.8), C.wing2);
    b.wingM(V(1.2, 0.20, -8.4), V(4.2, 0.06, -9.6),
      V(4.2, 0.06, -10.4), V(1.2, 0.20, -10.8), C.wing2);

    // 埋入式喷口（扁平）
    b.box(0.62, -0.06, -10.6, 0.86, 0.36, 0.9, C.nozzle);
    b.box(-0.62, -0.06, -10.6, 0.86, 0.36, 0.9, C.nozzle);

    // 内埋弹舱门（一条缝）
    b.box(0, -0.46, -2.4, 1.5, 0.06, 4.2, C.darker);

    // 座舱盖（很低，融入机身）
    b.quad(b.vt(V(0, 0.62, 7.8)), b.vt(V(0.46, 0.44, 4.6)),
      b.vt(V(0, 0.36, 3.2)), b.vt(V(-0.46, 0.44, 4.6)), C.canopy2);

    return done(b, { span: 13.8, len: 21.4 });
  })();

  /* ============================================================
     D-33「信天翁」Albatross —— 高机动格斗机
     前掠翼。翼尖向前而不是向后，靠复合材料机翼的弯扭耦合
     压住"翼尖先失速"的老毛病。
     ============================================================ */
  M.albatross = (function () {
    var b = new MB();
    b.fuselage([
      { z: 8.8, w: 0.24, h: 0.22 },
      { z: 7.0, w: 0.72, h: 0.68 },
      { z: 4.4, w: 1.16, h: 1.02 },
      { z: 1.0, w: 1.44, h: 1.16 },
      { z: -3.0, w: 1.48, h: 1.14 },
      { z: -7.0, w: 1.22, h: 0.96 },
      { z: -9.4, w: 0.90, h: 0.78 }
    ], C.body, C.body3);

    /* 前掠翼：翼根靠后、翼尖向前。
       顶点顺序必须是 翼根前缘 → 翼尖前缘 → 翼尖后缘 → 翼根后缘。
       以前写成"翼根后缘 → 翼尖前缘 → …"，四边形自交成蝴蝶结，
       看上去翼尖和翼根是断开的。顺带整体后移约 2 米，让升力中心落在重心附近。 */
    b.wing(V(1.40, -0.24, -1.4), V(7.4, -0.52, 1.8),
      V(7.4, -0.52, 0.2), V(1.34, -0.24, -5.0), C.wing);
    b.wingM(V(1.40, -0.24, -1.4), V(7.4, -0.52, 1.8),
      V(7.4, -0.52, 0.2), V(1.34, -0.24, -5.0), C.wing);

    /* 双垂尾（内倾）。翼尖只往里收到 x = 0.20 —— 以前写成 -0.90，
       越过中线伸到另一侧，两片垂尾交叉成一个 X。 */
    b.wing(V(0.62, 1.00, -5.6), V(0.20, 3.30, -8.0),
      V(0.20, 3.30, -8.9), V(0.62, 1.00, -6.6), C.wing2);
    b.wingM(V(0.62, 1.00, -5.6), V(0.20, 3.30, -8.0),
      V(0.20, 3.30, -8.9), V(0.62, 1.00, -6.6), C.wing2);

    // 平尾
    b.wing(V(1.2, 0.06, -6.6), V(3.9, -0.16, -7.4),
      V(3.9, -0.16, -8.4), V(1.2, 0.06, -8.8), C.wing2);
    b.wingM(V(1.2, 0.06, -6.6), V(3.9, -0.16, -7.4),
      V(3.9, -0.16, -8.4), V(1.2, 0.06, -8.8), C.wing2);

    // 双尾喷口
    b.tube(V(0.66, -0.16, -9.0), V(0.66, -0.16, -10.0), 0.44, 0.42, 8, C.nozzle, C.darker);
    b.tube(V(-0.66, -0.16, -9.0), V(-0.66, -0.16, -10.0), 0.44, 0.42, 8, C.nozzle, C.darker);

    // 机背的无人机控制舱
    b.box(0, 0.96, 0.4, 0.82, 0.34, 2.6, C.dark);

    // 座舱盖（双座）
    b.quad(b.vt(V(0, 1.02, 7.0)), b.vt(V(0.56, 0.76, 3.4)),
      b.vt(V(0, 0.60, 1.6)), b.vt(V(-0.56, 0.76, 3.4)), C.canopy);

    return done(b, { span: 16.4, len: 19.6 });
  })();

  /* ============================================================
     GAL-31「玄武岩」—— 下游高峰军工制造局的重型截击机
     双三角翼、双发、巨大的机头雷达罩。低空笨重，高空才是它的地盘。
     ============================================================ */
  M.basalt = (function () {
    var b = new MB();
    b.fuselage([
      { z: 12.6, w: 0.34, h: 0.34 },
      { z: 10.2, w: 0.80, h: 0.72 },
      { z: 6.5, w: 1.14, h: 1.02 },
      { z: 2.0, w: 1.58, h: 1.26 },
      { z: -3.0, w: 1.82, h: 1.36 },
      { z: -8.0, w: 1.86, h: 1.30 },
      { z: -12.2, w: 1.56, h: 1.10 }
    ], C.body, C.body3);

    // 双三角：内段大后掠，外段折一次
    b.wing(V(1.62, -0.30, 3.4), V(4.60, -0.50, -2.0),
      V(4.60, -0.50, -4.3), V(1.72, -0.30, -4.7), C.wing);
    b.wingM(V(1.62, -0.30, 3.4), V(4.60, -0.50, -2.0),
      V(4.60, -0.50, -4.3), V(1.72, -0.30, -4.7), C.wing);
    b.wing(V(4.60, -0.50, -2.0), V(7.60, -0.70, -6.4),
      V(7.60, -0.70, -7.6), V(4.60, -0.50, -4.3), C.wing);
    b.wingM(V(4.60, -0.50, -2.0), V(7.60, -0.70, -6.4),
      V(7.60, -0.70, -7.6), V(4.60, -0.50, -4.3), C.wing);

    // 双垂尾
    b.wing(V(0.80, 1.10, -7.4), V(2.50, 3.60, -10.6),
      V(2.50, 3.60, -11.5), V(0.80, 1.10, -8.5), C.wing2);
    b.wingM(V(0.80, 1.10, -7.4), V(2.50, 3.60, -10.6),
      V(2.50, 3.60, -11.5), V(0.80, 1.10, -8.5), C.wing2);

    // 平尾
    b.wing(V(1.6, 0.10, -8.0), V(3.9, -0.10, -11.0),
      V(3.9, -0.10, -11.9), V(1.6, 0.10, -9.8), C.wing2);
    b.wingM(V(1.6, 0.10, -8.0), V(3.9, -0.10, -11.0),
      V(3.9, -0.10, -11.9), V(1.6, 0.10, -9.8), C.wing2);

    // 双尾喷口
    b.tube(V(0.86, -0.14, -12.0), V(0.86, -0.14, -13.2), 0.52, 0.50, 8, C.nozzle, C.darker);
    b.tube(V(-0.86, -0.14, -12.0), V(-0.86, -0.14, -13.2), 0.52, 0.50, 8, C.nozzle, C.darker);

    // 大机头雷达罩
    b.tube(V(0, 0.06, 12.4), V(0, 0.06, 13.4), 0.34, 0.20, 8, C.dark, C.darker);

    // 进气道
    b.box(1.02, -0.40, 2.2, 0.50, 0.92, 3.8, C.dark);
    b.box(-1.02, -0.40, 2.2, 0.50, 0.92, 3.8, C.dark);

    b.quad(b.vt(V(0, 1.06, 9.2)), b.vt(V(0.48, 0.78, 5.6)),
      b.vt(V(0, 0.62, 4.2)), b.vt(V(-0.48, 0.78, 5.6)), C.canopy);

    return done(b, { span: 15.2, len: 25.8 });
  })();

  /* ============================================================
     VAC-14「砂岩」—— 下游气动设计实验室的轻型攻击机
     平直翼、单发、粗短的机身。便宜到可以损失。
     ============================================================ */
  M.sandstone = (function () {
    var b = new MB();
    b.fuselage([
      { z: 8.2, w: 0.24, h: 0.26 },
      { z: 6.4, w: 0.72, h: 0.70 },
      { z: 3.6, w: 1.06, h: 0.98 },
      { z: 0.4, w: 1.24, h: 1.10 },
      { z: -3.0, w: 1.22, h: 1.06 },
      { z: -6.2, w: 1.00, h: 0.88 }
    ], C.body2, C.body3);

    // 平直大展弦比翼
    b.wing(V(1.24, -0.20, 2.2), V(6.4, -0.34, 1.6),
      V(6.4, -0.34, -0.9), V(1.24, -0.20, -2.4), C.wing);
    b.wingM(V(1.24, -0.20, 2.2), V(6.4, -0.34, 1.6),
      V(6.4, -0.34, -0.9), V(1.24, -0.20, -2.4), C.wing);

    // 垂尾
    b.wing(V(0.28, 0.70, -4.6), V(0.28, 2.90, -6.8),
      V(0.28, 2.90, -7.6), V(0.28, 0.70, -7.0), C.wing2);
    // 平尾
    b.wing(V(0.70, 0.16, -5.4), V(3.1, 0.02, -6.4),
      V(3.1, 0.02, -7.2), V(0.70, 0.16, -7.0), C.wing2);
    b.wingM(V(0.70, 0.16, -5.4), V(3.1, 0.02, -6.4),
      V(3.1, 0.02, -7.2), V(0.70, 0.16, -7.0), C.wing2);

    // 单发喷口 + 螺旋桨盘（它是涡桨）
    b.tube(V(0, -0.10, -6.0), V(0, -0.10, -7.0), 0.44, 0.42, 8, C.nozzle, C.darker);
    b.tube(V(0, 0.04, 8.2), V(0, 0.04, 8.5), 0.22, 0.22, 8, C.dark, C.darker);

    b.quad(b.vt(V(0, 0.98, 6.6)), b.vt(V(0.52, 0.72, 3.6)),
      b.vt(V(0, 0.58, 2.4)), b.vt(V(-0.52, 0.72, 3.6)), C.canopy);

    return done(b, { span: 12.8, len: 15.2 });
  })();

  /* ============================================================
     「浪花」Spray —— 分水群岛国的海上巡逻机
     高展弦比直翼、双发、玻璃机头。飞得慢，但能在海上待六小时。
     ============================================================ */
  M.spray = (function () {
    var b = new MB();
    b.fuselage([
      { z: 9.0, w: 0.40, h: 0.44 },
      { z: 7.0, w: 0.86, h: 0.92 },
      { z: 3.6, w: 1.06, h: 1.10 },
      { z: 0.0, w: 1.08, h: 1.12 },
      { z: -4.0, w: 0.92, h: 0.96 },
      { z: -7.0, w: 0.62, h: 0.66 }
    ], C.body, C.body3);

    // 高展弦比直翼（长而窄）
    b.wing(V(1.06, 0.30, 1.6), V(8.4, 0.10, 1.0),
      V(8.4, 0.10, -0.6), V(1.06, 0.30, -1.8), C.wing);
    b.wingM(V(1.06, 0.30, 1.6), V(8.4, 0.10, 1.0),
      V(8.4, 0.10, -0.6), V(1.06, 0.30, -1.8), C.wing);

    // 翼上双发（螺旋桨）
    b.tube(V(3.0, 0.60, 0.9), V(3.0, 0.60, -0.4), 0.34, 0.30, 8, C.dark, C.darker);
    b.tube(V(-3.0, 0.60, 0.9), V(-3.0, 0.60, -0.4), 0.34, 0.30, 8, C.dark, C.darker);
    b.tube(V(3.0, 0.60, 1.0), V(3.0, 0.60, 1.3), 0.16, 0.16, 6, C.darker, C.darker);
    b.tube(V(-3.0, 0.60, 1.0), V(-3.0, 0.60, 1.3), 0.16, 0.16, 6, C.darker, C.darker);

    // 单垂尾
    b.wing(V(0.20, 0.90, -4.0), V(0.20, 2.90, -6.2),
      V(0.20, 2.90, -7.0), V(0.20, 0.90, -6.4), C.wing2);
    b.wing(V(0.60, 0.26, -4.6), V(2.8, 0.14, -5.6),
      V(2.8, 0.14, -6.4), V(0.60, 0.26, -6.2), C.wing2);
    b.wingM(V(0.60, 0.26, -4.6), V(2.8, 0.14, -5.6),
      V(2.8, 0.14, -6.4), V(0.60, 0.26, -6.2), C.wing2);

    // 玻璃机头（巡逻机用来搜索海面）
    b.quad(b.vt(V(0, 0.52, 9.2)), b.vt(V(0.42, 0.30, 6.2)),
      b.vt(V(0, 0.10, 4.6)), b.vt(V(-0.42, 0.30, 6.2)), C.canopy2);

    return done(b, { span: 17.2, len: 16.4 });
  })();

  /* ============================================================
     ROK-40「巨砾」—— 石林的重型轰炸机

     又大又慢：四台发动机、平直翼、载弹量比一架战斗机重十倍。
     它不参与空战 —— 从进场到投弹到脱离，全程沿剧本给的航线飞，
     不选目标、不追人、不规避。

     命名沿用石林的岩石系列：「巨砾」。
     ============================================================ */
  M.boulder = (function () {
    var b = new MB();
    b.fuselage([
      { z: 20.0, w: 1.2, h: 1.4 },      // 机头
      { z: 17.0, w: 2.6, h: 2.6 },
      { z: 12.0, w: 3.4, h: 3.2 },
      { z: 5.0, w: 3.8, h: 3.4 },
      { z: -3.0, w: 3.8, h: 3.4 },
      { z: -11.0, w: 3.2, h: 3.0 },
      { z: -18.0, w: 2.4, h: 2.4 },
      { z: -21.5, w: 1.6, h: 1.7 }      // 尾锥
    ], C.body, C.body3);

    // 平直大展弦比翼 —— 轰炸机不需要机动，只需要升力和航程
    b.wing(V(3.6, 0.4, 6.0), V(23.0, 0.0, 3.0),
      V(23.0, 0.0, -2.0), V(3.8, 0.4, -5.0), C.wing);
    b.wingM(V(3.6, 0.4, 6.0), V(23.0, 0.0, 3.0),
      V(23.0, 0.0, -2.0), V(3.8, 0.4, -5.0), C.wing);

    // 四台翼下吊挂发动机
    var eng = [[8.0, 5.0], [15.0, 4.6]];
    var k, e, side;
    for (k = 0; k < 2; k++) {
      e = eng[k];
      for (side = -1; side <= 1; side += 2) {
        b.tube(V(side * e[0], -1.2, e[1] + 2.6), V(side * e[0], -1.2, e[1] - 2.4),
          1.5, 1.4, 8, C.grey2, C.dark);
        b.tube(V(side * e[0], -1.2, e[1] - 2.4), V(side * e[0], -1.2, e[1] - 3.4),
          1.1, 1.0, 8, C.nozzle, C.darker);
      }
    }

    // 高大方正的垂尾
    b.wing(V(0, 1.6, -18.0), V(0, 8.5, -22.5),
      V(0, 8.5, -23.8), V(0, 1.6, -21.0), C.wing2);
    // 平尾
    b.wing(V(1.4, 0.8, -19.0), V(8.0, 0.4, -22.0),
      V(8.0, 0.4, -23.2), V(1.4, 0.8, -21.4), C.wing2);
    b.wingM(V(1.4, 0.8, -19.0), V(8.0, 0.4, -22.0),
      V(8.0, 0.4, -23.2), V(1.4, 0.8, -21.4), C.wing2);

    // 领航员的玻璃机头
    b.quad(b.vt(V(0, 1.5, 20.4)), b.vt(V(1.1, 0.9, 16.0)),
      b.vt(V(0, 0.3, 14.4)), b.vt(V(-1.1, 0.9, 16.0)), C.canopy);

    // 腹部弹舱
    b.box(0, -2.0, 1.0, 3.0, 1.2, 11.0, C.dark, C.darker);

    return done(b, { span: 48, len: 44 });
  })();

  /* ============================================================
     座舱盖落座

     战斗机的座舱盖都是一块菱形薄片（前尖 / 两侧 / 后顶），
     手填的坐标普遍高出机身上表面一截 —— 侧面看是一张悬着的纸。
     这里统一后处理：竖直射线量出机身上表面，
       · 三个底点（前尖与两侧）压到表面上；
       · 最高点保留原来的"鼓包高度"，但从表面量起；
       · 补两片三角把后面封住，让它成为一个坐在机身上的鼓包。
     只动顶点不与别的面共享的座舱盖（方盒窗带不碰），舰船 / 地面模型跳过。
     ============================================================ */
  function topAbove(m, px, pz, skip) {
    var best = null;
    for (var fi = 0; fi < m.f.length; fi++) {
      if (skip[fi]) continue;
      var idx = m.f[fi].i;
      for (var t = 1; t < idx.length - 1; t++) {
        var A = m.v[idx[0]], B = m.v[idx[t]], Cc = m.v[idx[t + 1]];
        var d = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
        if (Math.abs(d) < 1e-9) continue;
        var w1 = ((B[2] - Cc[2]) * (px - Cc[0]) + (Cc[0] - B[0]) * (pz - Cc[2])) / d;
        var w2 = ((Cc[2] - A[2]) * (px - Cc[0]) + (A[0] - Cc[0]) * (pz - Cc[2])) / d;
        var w3 = 1 - w1 - w2;
        if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
        var y = w1 * A[1] + w2 * B[1] + w3 * Cc[1];
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  function seatCanopies(m) {
    var use = {}, fi, k, canopy = [];
    for (fi = 0; fi < m.f.length; fi++) {
      for (k = 0; k < m.f[fi].i.length; k++) use[m.f[fi].i[k]] = (use[m.f[fi].i[k]] || 0) + 1;
    }
    for (fi = 0; fi < m.f.length; fi++) {
      var f = m.f[fi];
      if ((f.c !== C.canopy && f.c !== C.canopy2) || f.i.length !== 4) continue;
      var shared = false;
      for (k = 0; k < 4; k++) if (use[f.i[k]] > 1) shared = true;
      if (!shared) canopy.push(fi);
    }
    if (!canopy.length) return;
    var skip = {};
    for (k = 0; k < canopy.length; k++) skip[canopy[k]] = true;
    var extra = [];
    for (var ci = 0; ci < canopy.length; ci++) {
      var ids = m.f[canopy[ci]].i, pk = 0;
      for (k = 1; k < 4; k++) if (m.v[ids[k]][1] > m.v[ids[pk]][1]) pk = k;
      var tops = [], ok = true, baseY = 0;
      for (k = 0; k < 4; k++) {
        var v = m.v[ids[k]];
        var ty = topAbove(m, v[0], v[2], skip);
        if (ty === null) { ok = false; break; }
        tops.push(ty);
        if (k !== pk) baseY += v[1] / 3;
      }
      if (!ok) continue;
      var bulge = M3.clamp(m.v[ids[pk]][1] - baseY, 0.14, 0.32);   // 过高的鼓包会像一片竖起的鳍
      for (k = 0; k < 4; k++) {
        if (k === pk) continue;
        m.v[ids[k]][1] = tops[k] - 0.01;          // 略沉一点，压住接缝
      }
      var apex = m.v[ids[pk]];
      apex[1] = tops[pk] + bulge;
      // 封底：最高点正下方补一个落在机身上的点，与前后两个邻点各围一片三角
      m.v.push([apex[0], tops[pk] - 0.01, apex[2]]);
      var foot = m.v.length - 1;
      var prev = ids[(pk + 3) % 4], next = ids[(pk + 1) % 4];
      var col = m.f[canopy[ci]].c;
      extra.push({ i: [prev, ids[pk], foot], c: col }, { i: [next, foot, ids[pk]], c: col });
    }
    for (k = 0; k < extra.length; k++) m.f.push(extra[k]);
  }

  /* ============================================================
     翼面插进机体

     尾翼、垂尾（以及部分主翼）都是单独一块薄板，翼根点按机身"名义宽度"
     手填 —— 而机身尾段在收窄，于是翼根和机身之间常常露一道缝。
     这里统一把每块翼面的翼根沿"翼尖 → 翼根"方向往里延伸，
     直到翼根中点落进机体内部，再多插 15 cm。穿模无所谓，
     只要 x 不越过中线（不从另一侧穿出来）。
     可变后掠翼的顶点由 morph 驱动，跳过。
     ============================================================ */
  function bodyFaces(m, skip) {
    var r = [];
    for (var fi = 0; fi < m.f.length; fi++) if (!skip[fi]) r.push(fi);
    return r;
  }

  // (x, y, z) 是否在机体内部：竖直方向上下都有机体表面
  function insideBody(m, faces, x, y, z) {
    var lo = null, hi = null;
    for (var n = 0; n < faces.length; n++) {
      var idx = m.f[faces[n]].i;
      for (var t = 1; t < idx.length - 1; t++) {
        var A = m.v[idx[0]], B = m.v[idx[t]], Cc = m.v[idx[t + 1]];
        var d = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
        if (Math.abs(d) < 1e-9) continue;
        var w1 = ((B[2] - Cc[2]) * (x - Cc[0]) + (Cc[0] - B[0]) * (z - Cc[2])) / d;
        var w2 = ((Cc[2] - A[2]) * (x - Cc[0]) + (A[0] - Cc[0]) * (z - Cc[2])) / d;
        var w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        var yy = w1 * A[1] + w2 * B[1] + w3 * Cc[1];
        if (yy <= y && (lo === null || yy > lo)) lo = yy;
        if (yy >= y && (hi === null || yy < hi)) hi = yy;
      }
    }
    return lo !== null && hi !== null;
  }

  function rootFins(m) {
    var use = {}, fi, k, morph = {};
    if (m.morph && m.morph.map) {
      for (k = 0; k < m.morph.map.length; k++) if (m.morph.map[k] >= 0) morph[k] = true;
    }
    for (fi = 0; fi < m.f.length; fi++) {
      for (k = 0; k < m.f[fi].i.length; k++) use[m.f[fi].i[k]] = (use[m.f[fi].i[k]] || 0) + 1;
    }
    var fins = [], skip = {};
    for (fi = 0; fi < m.f.length; fi++) {
      var f = m.f[fi];
      // 任何孤立的单片四边形都算翼面（G-6 的垂尾是机身绿，不是翼面灰）；座舱盖除外
      if (f.c === C.canopy || f.c === C.canopy2 || f.i.length !== 4) continue;
      var ok = true;
      for (k = 0; k < 4; k++) if (use[f.i[k]] > 1 || morph[f.i[k]]) ok = false;
      if (ok) { fins.push(fi); skip[fi] = true; }
    }
    if (!fins.length) return;
    var body = bodyFaces(m, skip);
    var rad = function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); };
    for (var n = 0; n < fins.length; n++) {
      var ids = m.f[fins[n]].i;
      // 翼根 = 离机身轴线（x=0, y=0）最近的那条边
      var best = 0, bestR = 1e9;
      for (k = 0; k < 4; k++) {
        var rr = rad(m.v[ids[k]]) + rad(m.v[ids[(k + 1) % 4]]);
        if (rr < bestR) { bestR = rr; best = k; }
      }
      var r0 = ids[best], r1 = ids[(best + 1) % 4];
      var t0 = ids[(best + 3) % 4], t1 = ids[(best + 2) % 4];   // 各自对应的翼尖点
      var P0 = m.v[r0], P1 = m.v[r1], T0 = m.v[t0], T1 = m.v[t1];
      var dir = function (P, T) {
        var dx = P[0] - T[0], dy = P[1] - T[1], dz = P[2] - T[2];
        var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        return [dx / l, dy / l, dz / l];
      };
      // 两个翼根点各自往里推，直到落进机体再多插 15 cm —— 只看中点会漏：
      // 中点插进去了，翼根前后两端还悬在收窄的机身外面。
      // 方向两个都试：沿翼面（翼尖 → 翼根）和直接朝机身轴线，取挪动更少的那个；
      // 翼根在收窄段外侧时，顺着翼展往下戳会擦边而过或戳得很深。
      var push = function (P, T) {
        if (insideBody(m, body, P[0], P[1], P[2])) return;
        var a = pushAlong(P, dir(P, T)), c = pushAlong(P, dir([0, 0, P[2]], P));
        var p = a && (!c || a.e <= c.e) ? a : c;
        if (p) { P[0] = p.q[0]; P[1] = p.q[1]; P[2] = p.q[2]; }
      };
      var pushAlong = function (P, dd) {
        // 偏在一侧的翼面不越过中线；本来就在中线上的（单垂尾、腹鳍）不受限
        var side = Math.abs(P[0]) > 0.05 ? (P[0] > 0 ? 1 : -1) : 0;
        var found = -1;
        for (var e = 0.02; e <= 4 + 1e-9; e += 0.02) {
          var x = P[0] + dd[0] * e;
          if (side && x * side < 0.02) break;
          if (insideBody(m, body, x, P[1] + dd[1] * e, P[2] + dd[2] * e)) { found = e; break; }
        }
        if (found < 0) return null;
        var e2 = found + 0.15;
        if (side && dd[0] * side < 0) e2 = Math.min(e2, (Math.abs(P[0]) - 0.02) / Math.abs(dd[0]));
        e2 = Math.max(0, e2);
        return { e: found, q: [P[0] + dd[0] * e2, P[1] + dd[1] * e2, P[2] + dd[2] * e2] };
      };
      push(P0, T0);
      push(P1, T1);
    }
  }

  for (var mk in M) {
    if (!Object.prototype.hasOwnProperty.call(M, mk)) continue;
    var mm = M[mk];
    if (!mm || !mm.v || mm.ground || mm.sea) continue;
    rootFins(mm);
    seatCanopies(mm);
  }

  /* ---------- 舰船零件落座 ----------
     舰船是一个个 box / tube 拼出来的，手写坐标时常有零件悬在半空
     （集装箱、烟囱、甲板标线离甲板一截）。这里按"连通分量"（共享顶点的一组面）
     找出**和任何其他零件都不接触**的那些，把它们的底面**往下延长**到正下方最高的表面上
     （只拉最底下那一圈顶点，零件本身的高度、位置不变 —— 集装箱、烟囱长出一截"脚"）。
     接触到别的零件的（贴在舰桥侧面的相控阵、桅杆顶的平台）不动。
     穿进船体一点也没关系 —— 从外面看不出来。 */
  function settle(m) {   // 名字沿用"落座"，做法是向下延长
    var nv = m.v.length, par = new Array(nv), i, k;
    for (i = 0; i < nv; i++) par[i] = i;
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    m.f.forEach(function (f) { for (var j = 1; j < f.i.length; j++) { var a = find(f.i[0]), b = find(f.i[j]); if (a !== b) par[a] = b; } });
    var g = {};
    m.f.forEach(function (f, fi) { var r = find(f.i[0]); (g[r] = g[r] || { fs: [], vs: {} }).fs.push(fi); f.i.forEach(function (j) { g[r].vs[j] = 1; }); });
    var C = Object.keys(g).map(function (r) { var c = g[r]; c.vs = Object.keys(c.vs).map(Number); return c; });
    function box(c) {
      var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      c.vs.forEach(function (j) { for (var q = 0; q < 3; q++) { var x = m.v[j][q]; if (x < mn[q]) mn[q] = x; if (x > mx[q]) mx[q] = x; } });
      c.mn = mn; c.mx = mx;
    }
    C.forEach(box);
    C.sort(function (a, b) { return b.fs.length - a.fs.length; });
    var EPS = 0.15;
    function touches(c, o) {
      for (var q = 0; q < 3; q++) if (c.mn[q] > o.mx[q] + EPS || c.mx[q] < o.mn[q] - EPS) return false;
      return true;
    }
    /* 竖直向下打到别的零件：在 (x, z) 处、高度不超过 ymax 的最高面 */
    function hitBelow(x, z, ymax, self) {
      var best = -1e9;
      for (var ci = 0; ci < C.length; ci++) {
        var o = C[ci];
        if (o === self || x < o.mn[0] || x > o.mx[0] || z < o.mn[2] || z > o.mx[2] || o.mn[1] > ymax) continue;
        for (var fi = 0; fi < o.fs.length; fi++) {
          var idx = m.f[o.fs[fi]].i;
          for (var t = 1; t < idx.length - 1; t++) {
            var A = m.v[idx[0]], B = m.v[idx[t]], D = m.v[idx[t + 1]];
            var d = (B[2] - D[2]) * (A[0] - D[0]) + (D[0] - B[0]) * (A[2] - D[2]);
            if (Math.abs(d) < 1e-9) continue;
            var w1 = ((B[2] - D[2]) * (x - D[0]) + (D[0] - B[0]) * (z - D[2])) / d;
            var w2 = ((D[2] - A[2]) * (x - D[0]) + (A[0] - D[0]) * (z - D[2])) / d;
            var w3 = 1 - w1 - w2;
            if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
            var y = w1 * A[1] + w2 * B[1] + w3 * D[1];
            if (y <= ymax + 0.05 && y > best) best = y;
          }
        }
      }
      return best;
    }
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      var order = C.slice(1).sort(function (a, b) { return a.mn[1] - b.mn[1]; });
      for (i = 0; i < order.length; i++) {
        var c = order[i], free = true;
        for (k = 0; k < C.length && free; k++) if (C[k] !== c && touches(c, C[k])) free = false;
        if (!free) continue;
        var cx = (c.mn[0] + c.mx[0]) / 2, cz = (c.mn[2] + c.mx[2]) / 2;
        var hx = (c.mx[0] - c.mn[0]) * 0.3, hz = (c.mx[2] - c.mn[2]) * 0.3;
        var sup = -1e9;
        [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].forEach(function (o) {
          sup = Math.max(sup, hitBelow(cx + o[0], cz + o[1], c.mn[1], c));
        });
        var gap = c.mn[1] - sup;
        if (sup < -1e8 || gap < 0.02 || gap > 40) continue;
        var y0 = c.mn[1] + 0.05;
        c.vs.forEach(function (j) { if (m.v[j][1] <= y0) m.v[j] = [m.v[j][0], m.v[j][1] - gap, m.v[j][2]]; });
        box(c);
        moved = true;
      }
      if (!moved) break;
    }
    return m;
  }
  ['orca', 'bluewhale', 'humpback', 'spermwhale', 'dolphin', 'trilobite', 'ammonite', 'seascorpion',
    'cameroceras', 'dunkleosteus', 'daplu', 'skori', 'diklo', 'cross', 'icecore', 'atoll'].forEach(function (id) { if (M[id]) settle(M[id]); });

  return M;
})();
