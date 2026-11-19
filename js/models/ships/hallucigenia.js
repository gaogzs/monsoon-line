/* ============================================================
   怪诞虫级无人机航母 · 下游同盟海军

   怪诞虫是寒武纪一种浑身长满长刺的怪东西，古生物学家画了几十年才把它的上下画对。
   这艘船也是：一整块平甲板，两舷竖着一排细长的天线桅 —— 数据链、导航与干扰天线，
   看上去就是一条长满刺的甲板。三条并排的弹射轨道从舰体中部一直铺到舰首，
   机库与舰桥缩在舰尾，一座低矮的烟囱。
   坐标：x 右舷、y 向上（水线 0）、z 舰首；飞行甲板上表面 y = 9.0。
   弹射轨道的起飞端 (x, y, z) 与 js/data/ships/hallucigenia.js 的 runways 对上（起点往后退 80 m）。
   ============================================================ */
Registry.model({
  id: 'hallucigenia', order: 305, settle: true,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done;
    var b = new MB();
    var TOP = 9.0;
    b.hull([
      { z: 94, w: 1.0, y0: -1.2, y1: 9.2 },
      { z: 90, w: 6.0, y0: -2.0, y1: 9.0 },
      { z: 84, w: 11.6, y0: -2.8, y1: 9.0 },
      { z: 76, w: 12.4, y0: -3.0, y1: 9.0 },
      { z: 50, w: 12.4, y0: -3.0, y1: 9.0 },
      { z: 10, w: 12.4, y0: -3.2, y1: 9.0 },
      { z: -40, w: 12.4, y0: -3.2, y1: 9.0 },
      { z: -76, w: 11.4, y0: -3.0, y1: 9.0 },
      { z: -86, w: 9.0, y0: -2.8, y1: 9.0 }
    ], C.rust, C.deck, C.boot);

    function stripe(x0, z0, x1, z1, w, col, y) {
      var dx = x1 - x0, dz = z1 - z0, l = Math.sqrt(dx * dx + dz * dz) || 1;
      var nx = dz / l * w / 2, nz = -dx / l * w / 2, yy = y || (TOP + 0.06);
      b.wing(V(x0 + nx, yy, z0 + nz), V(x1 + nx, yy, z1 + nz), V(x1 - nx, yy, z1 - nz), V(x0 - nx, yy, z0 - nz), col);
    }

    // 三条弹射轨道：起点 z = -2，起飞端 z = 78（起点往后退 80 m 的约定）
    var rails = [-8, 0, 8];
    for (var ri = 0; ri < rails.length; ri++) {
      b.box(rails[ri], TOP + 0.12, 38, 1.1, 0.16, 82, C.metal);
      stripe(rails[ri] - 3.4, -4, rails[ri] - 3.4, 80, 0.4, C.yellow);
      stripe(rails[ri] + 3.4, -4, rails[ri] + 3.4, 80, 0.4, C.yellow);
    }
    // 偏流板：每条轨道起点后面一块竖起来的板子
    for (ri = 0; ri < rails.length; ri++) b.boxTilt(rails[ri], TOP + 1.4, -8, 6.0, 2.6, 0.5, -0.9, C.rust2, C.rust2);
    // 甲板边缘警示带
    stripe(-11.8, -76, -11.8, 70, 0.7, C.yellow);
    stripe(11.8, -76, 11.8, 70, 0.7, C.yellow);

    // 两舷的"刺"：细长的天线桅，疏密不一，高矮不等
    var spineZ = [64, 52, 40, 28, 16, 4, -10, -24, -38];
    for (var si = 0; si < spineZ.length; si++) {
      var hh = 7 + (si % 3) * 2.6;
      mast(b, -12.0, spineZ[si], TOP, hh, 0.5, 0.18, C.rust2);
      mast(b, 12.0, spineZ[si] - 5, TOP, hh + 1.4, 0.5, 0.18, C.rust2);
    }

    // 舰尾：机库（低矮的长盒子）、右舷小舰桥、烟囱
    b.box(-2, TOP + 3.0, -62, 20, 6.0, 30, C.rust2);
    house(b, 8.5, -56, 7.0, 7.0, 14.0, TOP + 0.2, C.rust, C.rust2);
    b.box(8.5, TOP + 7.5, -52, 6.6, 1.2, 8.0, C.canopy);
    b.box(8.5, TOP + 6.0, -45.2, 5.0, 3.0, 0.5, C.dark);
    mast(b, 8.5, -58, TOP + 8.2, 18, 1.2, 0.35, C.rust2);
    b.tube(V(-8, TOP + 6, -78), V(-8, TOP + 10, -78), 1.8, 1.5, 6, C.rust2, C.boot);

    // 垂发与近防炮是实体 / 炮塔（见 SHIPS[].launchers / mounts）

    return done(b, { span: 30, len: 180, ground: true, sea: true, radius: 52 });
  }
});
