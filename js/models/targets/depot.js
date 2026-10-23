/** 燃油 / 弹药补给库 */
Registry.model({
  id: 'depot', order: 110,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done, seaBase = L.seaBase;
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
  }
});
