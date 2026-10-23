/** 指挥 / 通信中枢 */
Registry.model({
  id: 'cmdpost', order: 120,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done, seaBase = L.seaBase;
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
  }
});
