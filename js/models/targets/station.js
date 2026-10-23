/** 第 7 号控制平台（地标级浮式设施，任务背景中不可摧毁） */
Registry.model({
  id: 'station', order: 130,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done, seaBase = L.seaBase;
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
  }
});
