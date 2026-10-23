/** 早期预警雷达站（大型固定目标） */
Registry.model({
  id: 'radar', order: 100,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done, seaBase = L.seaBase;
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
  }
});
