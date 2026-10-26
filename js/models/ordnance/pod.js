/* 吊舱（干扰 / 光电 / 对抗）。

   挂载物里**唯一不是弹药**的东西，所以剪影必须一眼能和导弹分开：
   短、粗、钝头，尾端一圈散热格栅，尾鳍又小又窄。

   以前所有吊舱都借用 M.missile 的外壳（e4 / l2 连 model 都没写），
   于是"这架带了干扰吊舱"在画面上根本读不出来 —— 一张"导弹 + 吊舱"
   的预览图和一张"纯导弹"的预览图是**字节相同**的两张图。 */
Registry.model({
  id: 'pod', order: 400,   // 被动干扰吊舱（ZUN-8 / SAV-6 / ZUN-12），也是其余几类吊舱的基准外形
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    // 主弹体：比导弹粗一倍多、短一截
    b.tube(V(0, 0, -1.15), V(0, 0, 1.15), 0.30, 0.30, 8, C.navy2, C.navy);
    // 钝头（前端封口：吊舱没有导引头，本来就是个盖）
    b.tube(V(0, 0, 1.15), V(0, 0, 1.48), 0.30, 0.17, 8, C.navy2, C.dark);
    // 尾锥 + 散热格栅
    b.tube(V(0, 0, -1.15), V(0, 0, -1.42), 0.30, 0.20, 8, C.navy2, C.darker);
    b.tube(V(0, 0, -0.98), V(0, 0, -1.18), 0.335, 0.335, 8, C.darker, C.black);
    // 四片窄尾鳍
    b.wing(V(0.21, 0, -1.00), V(0.54, 0, -1.16), V(0.54, 0, -1.42), V(0.21, 0, -1.28), C.navy);
    b.wingM(V(0.21, 0, -1.00), V(0.54, 0, -1.16), V(0.54, 0, -1.42), V(0.21, 0, -1.28), C.navy);
    b.wing(V(0, 0.21, -1.00), V(0, 0.54, -1.16), V(0, 0.54, -1.42), V(0, 0.21, -1.28), C.navy);
    b.wing(V(0, -0.21, -1.00), V(0, -0.54, -1.16), V(0, -0.54, -1.42), V(0, -0.21, -1.28), C.navy);
    return done(b, { span: 1.1, len: 2.9 });
  }
});

/* ---------- 按功能分的几类吊舱 ----------
   同一个"短粗圆筒"让六七件吊舱在翼下读起来一模一样。现在按职能给各自的剪影，
   与识别图（js/render/planform/stores.js drawPod）同一套分法：
     pod_jam    主动干扰机    细长，两侧各一块平板天线，红色环带
     pod_eo     光电测距      圆筒前端下挂一颗球形转塔
     pod_armor  装甲 / 箔条   方块外壳，加强肋
     pod_dew    定向能        最粗，前端大孔径 + 黄环，尾部散热片 */
Registry.model({
  id: 'pod_jam', order: 401,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.tube(V(0, 0, -1.30), V(0, 0, 1.10), 0.21, 0.21, 8, C.navy2, C.navy);
    b.tube(V(0, 0, 1.10), V(0, 0, 1.62), 0.21, 0.05, 8, C.navy2, C.dark);          // 尖头罩
    b.tube(V(0, 0, -1.30), V(0, 0, -1.55), 0.21, 0.14, 8, C.navy2, C.darker);
    b.tube(V(0, 0, 0.20), V(0, 0, 0.34), 0.235, 0.235, 8, C.red2, C.red);          // 红色环带
    b.box(0.25, 0, 0.05, 0.05, 0.34, 1.10, C.grey, C.metal);                       // 两侧平板天线
    b.box(-0.25, 0, 0.05, 0.05, 0.34, 1.10, C.grey, C.metal);
    b.wing(V(0, -0.20, -1.05), V(0, -0.46, -1.20), V(0, -0.46, -1.55), V(0, -0.20, -1.35), C.navy);
    return done(b, { span: 0.8, len: 3.2 });
  }
});

Registry.model({
  id: 'pod_eo', order: 402,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.tube(V(0, 0, -1.40), V(0, 0, 1.00), 0.24, 0.24, 8, C.grey, C.grey2);
    b.tube(V(0, 0, -1.40), V(0, 0, -1.62), 0.24, 0.15, 8, C.grey, C.darker);
    // 前端的转塔：与机身同轴、后端埋进机身（0.70–1.00 重叠），不留缝；比机身略粗 + 深色玻璃
    b.tube(V(0, 0, 0.70), V(0, 0, 1.45), 0.30, 0.30, 10, C.white, C.metal);
    b.tube(V(0, 0, 1.45), V(0, 0, 1.58), 0.30, 0.20, 10, C.canopy2, C.canopy);
    b.tube(V(0, 0, 1.56), V(0, 0, 1.60), 0.14, 0.14, 8, C.black, C.black);
    b.wing(V(0, -0.22, -1.15), V(0, -0.44, -1.28), V(0, -0.44, -1.62), V(0, -0.22, -1.42), C.grey2);
    return done(b, { span: 0.8, len: 3.2 });
  }
});

Registry.model({
  id: 'pod_armor', order: 403,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.box(0, 0, 0, 0.62, 0.52, 2.50, C.green, C.green2);
    b.box(0, 0, 1.35, 0.50, 0.42, 0.30, C.green2, C.green);                       // 前端收窄
    b.box(0, 0, -1.35, 0.50, 0.42, 0.30, C.grey2, C.darker);
    for (var i = 0; i < 3; i++) b.box(0, 0, -0.75 + i * 0.75, 0.68, 0.58, 0.07, C.dark, C.grey2);   // 加强肋
    return done(b, { span: 0.9, len: 3.0 });
  }
});

Registry.model({
  id: 'pod_dew', order: 404,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.tube(V(0, 0, -1.20), V(0, 0, 1.20), 0.36, 0.36, 10, C.white, C.metal);
    b.tube(V(0, 0, 1.20), V(0, 0, 1.55), 0.36, 0.40, 10, C.dark, C.darker);        // 孔径筒口
    b.tube(V(0, 0, 1.55), V(0, 0, 1.60), 0.30, 0.30, 10, C.yellow, C.black);       // 黄色发射窗
    b.tube(V(0, 0, 0.55), V(0, 0, 0.70), 0.39, 0.39, 10, C.yellow, C.yellow);      // 黄环
    b.tube(V(0, 0, -1.20), V(0, 0, -1.42), 0.36, 0.28, 10, C.grey2, C.darker);
    for (var i = 0; i < 3; i++) b.box(0, 0, -0.95 + i * 0.12, 0.84, 0.05, 0.06, C.darker, C.grey2);   // 尾部散热片
    return done(b, { span: 1.0, len: 3.1 });
  }
});

/* pod_dec  诱饵投放舱（ZUN-12）
   职能是"撒东西"，所以剪影是方截面舱体 + 两侧各一列投放口，口里露出红色诱饵筒端面；
   前端斜切收窄，尾部没有格栅（那是被动干扰舱的特征）。 */
Registry.model({
  id: 'pod_dec', order: 405,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.box(0, 0, -0.10, 0.50, 0.44, 2.20, C.navy2, C.navy);
    b.box(0, -0.02, 1.15, 0.40, 0.36, 0.30, C.navy, C.dark);                        // 前端收窄
    b.box(0, -0.04, 1.36, 0.28, 0.26, 0.12, C.dark, C.darker);
    b.box(0, 0, -1.28, 0.42, 0.36, 0.16, C.darker, C.black);                        // 尾盖
    for (var i = 0; i < 4; i++) {
      var z = -0.70 + i * 0.50;
      b.box(0.26, 0, z, 0.04, 0.26, 0.32, C.black, C.black);                        // 投放口
      b.box(-0.26, 0, z, 0.04, 0.26, 0.32, C.black, C.black);
      b.box(0.275, 0, z, 0.02, 0.14, 0.18, C.red2, C.red);                          // 诱饵筒端面
      b.box(-0.275, 0, z, 0.02, 0.14, 0.18, C.red2, C.red);
    }
    b.wing(V(0, -0.22, -0.95), V(0, -0.44, -1.10), V(0, -0.44, -1.30), V(0, -0.22, -1.20), C.navy);
    return done(b, { span: 0.8, len: 3.0 });
  }
});
