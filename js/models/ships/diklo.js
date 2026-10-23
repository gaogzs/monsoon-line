/* ============================================================
   标杆级海洋测量船（DIKLO） · 调节场管理局
   双体船：两倍的水线面，换来一个不晃的甲板 ——
   而它的活恰恰是在晃的海面上量出厘米级的锚位变化。
   九座控制平台里有七座是浮式的，锚必须定期重测。
   ============================================================ */
Registry.model({
  id: 'diklo', order: 220, settle: true,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done;
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
  }
});
