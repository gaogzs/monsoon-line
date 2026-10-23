/* ============================================================
   南十字号重货船 · 南回契约（未参战）

   它不属于任何一方，而且它同时给两边送货。
   所以在这片海域上，它是唯一一条整夜开着识别信号的船 ——
   它怕的不是被发现，是**被当成别人的船**。
   ============================================================ */
Registry.model({
  id: 'cross', order: 230, settle: true,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done;
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
  }
});
