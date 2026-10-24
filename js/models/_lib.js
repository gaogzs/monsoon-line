/* ============================================================
   models.js —— 低多边形机体 / 地面目标几何
   约定：机头朝 +z，右翼朝 +x，座舱朝 +y。单位：米。
   面不做背面剔除，靠画家算法排序绘制。
   ============================================================ */
'use strict';

var ModelLib = (function () {
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

  /* 有厚度的翼面（机翼、尾翼）。wing 是一张纸，侧视是一条线；foil 用同样的四个点
     （p1→p2 前缘翼根→翼尖，p3 翼尖后缘，p4 翼根后缘），平面位置不变，沿法线两侧各加半个厚度，
     截面是菱形：前缘、最厚处（40% 弦长）、后缘。
     厚度 = 弦长 × 相对厚度，翼根、翼尖各一个（opts.t，缺省 FOIL_T），不薄于 FOIL_MIN。 */
  var FOIL_T = [0.075, 0.05];
  var FOIL_MIN = 0.10;

  /** 有厚度翼面的 8 个顶点：翼根的 前缘 / 上 / 后缘 / 下，然后是翼尖的同样四个。
      模型构造器（foil）和可变后掠的 morph 都用它，保证两套位置的拓扑一致。 */
  function foilPts(p1, p2, p3, p4, opts) {
    var t = (opts && opts.t) || FOIL_T;
    var n = M3.norm(M3.cross(M3.sub(p2, p1), M3.sub(p4, p1)));
    var secs = [[p1, p4, t[0]], [p2, p3, t[1]]];
    var out = [];
    for (var s = 0; s < 2; s++) {
      var LE = secs[s][0], TE = secs[s][1];
      var c = M3.sub(TE, LE);
      var cl = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z);
      var th = Math.max(FOIL_MIN, cl * secs[s][2]) / 2;
      var mid = M3.add(LE, M3.mul(c, 0.4));
      out.push(LE, M3.add(mid, M3.mul(n, th)), TE, M3.add(mid, M3.mul(n, -th)));
    }
    return out;
  }

  /** 有厚度的翼面：6 个面（4 个侧面 + 翼根、翼尖两个端盖）。返回 8 个顶点下标。
      面的区间与翼根顶点记在 this.foils 上（done 会挂到模型上），rootFins 据此把翼根插进机身。 */
  MB.prototype.foil = function (p1, p2, p3, p4, col, opts) {
    var P = foilPts(p1, p2, p3, p4, opts), id = [], i, j;
    for (i = 0; i < P.length; i++) id.push(this.vt(P[i]));
    var f0 = this.f.length;
    for (i = 0; i < 4; i++) {
      j = (i + 1) % 4;
      this.quad(id[i], id[j], id[4 + j], id[4 + i], col);
    }
    this.quad(id[0], id[1], id[2], id[3], col);
    this.quad(id[4], id[5], id[6], id[7], col);
    (this.foils = this.foils || []).push({ f0: f0, f1: this.f.length, root: id.slice(0, 4), tip: id.slice(4) });
    return id;
  };

  /** 镜像的有厚度翼面（x 取反） */
  MB.prototype.foilM = function (p1, p2, p3, p4, col, opts) {
    var f = function (p) { return V(-p.x, p.y, p.z); };
    return this.foil(f(p1), f(p2), f(p3), f(p4), col, opts);
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
    // foils 只给收尾遍（rootFins）用，不进 MODELS 的公开形状
    if (mb.foils) Object.defineProperty(m, 'foils', { value: mb.foils, enumerable: false });
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

  return {
    V: V, C: C, MB: MB, mast: mast, house: house, done: done, orientClosed: orientClosed,
    foilPts: foilPts
  };
})();
