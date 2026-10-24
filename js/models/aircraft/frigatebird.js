/* ============================================================
   DB-11「军舰鸟」Frigatebird —— 舰载多用途战斗机
   变后掠翼；为了在 280 m 浮岛平台上起降、又要维持超巡而做的取舍
   ============================================================ */
Registry.model({
  id: 'frigatebird', order: 10,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
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
         展开  翼尖 (8.7, -1.7)   翼展 17.4 m
         后掠  翼尖 (5.0, -6.1)   翼展  9.9 m
       （R_SPAN = 8.0、枢轴 x = 1.2；翼尖 x = 1.2 + 8·cos 角，翼展 = 2 × 翼尖 x，
        不含翼尖弦角的外伸；含弦角的最大顶点 |x| 是 9.2 / 5.9 m。）
       翼尖后移 4.3 米、翼展收掉四成以上，一眼就能看出机翼在动。 */
    /* 枢轴在机身中段偏后（z = −1.2）。原来是 +1.0：翼根前缘离机头只有 6.4 m、
       整个机翼挤在座舱旁边，既不像舰载战斗机也不好看；后移 2.2 m 之后翼根
       落在机身最宽处（z −3.6…0.6）附近，翼展、后掠角、翼套挂架都不变。 */
    var PIVOT = V(1.2, -0.16, -1.2);         // 翼根枢轴
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
    b.box(1.85, -0.58, -2.8, 0.16, 0.30, 2.4, C.dark);
    b.box(-1.85, -0.58, -2.8, 0.16, 0.30, 2.4, C.dark);

    return done(b, {
      span: 17.6, len: 20.5,
      morph: { map: morphMap, spread: morphSpread, swept: morphSwept }
    });
  }
});
