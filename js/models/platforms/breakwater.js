/** breakwater 防波堤 · 上游公约 · 半潜补给平台：两条浮箱 + 四根立柱 + 油罐与吊车 */
Registry.modelGroup({
  id: 'breakwater', order: 320,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, house = L.house, done = L.done, pDeck = L.pDeck;
    function buildBreakwater(wreck) {
      var b = new MB();
      for (var sx = -1; sx <= 1; sx += 2) {
        b.tube(V(sx * 20, -1.5, -30), V(sx * 20, -1.5, 30), 4.2, 4.2, 8, C.hull2, C.boot);    // 浮箱
        for (var sz = -1; sz <= 1; sz += 2) {
          if (wreck && sx > 0 && sz > 0) continue;
          b.tube(V(sx * 20, 0, sz * 20), V(sx * 20, 14, sz * 20), 3.2, 3.2, 8, C.hull, C.hull2);
        }
      }
      pDeck(b, 56, 48, 15, C.hull2, C.deck, wreck);
      if (!wreck) {
        for (var i = 0; i < 3; i++) b.tube(V(-14 + i * 9, 18.5, -10), V(-14 + i * 9, 18.5, 10), 3.4, 3.4, 8, C.white, C.snow2);  // 油罐
        house(b, 18, -14, 12, 8, 12, 16, C.hull, C.hull);
        b.boxTilt(10, 26, 8, 1.4, 1.4, 22, -0.6, C.yellow);              // 吊车臂
        b.tube(V(10, 16, 0), V(10, 24, 0), 1.0, 0.8, 6, C.yellow);
        b.box(-14, 16.1, 18, 14, 0.2, 10, C.yellow);                      // 直升机甲板
      }
      return done(b, { span: 56, len: 60, ground: true, sea: true, radius: 40 });
    }
    M.breakwater = buildBreakwater(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'breakwater_wreck', { enumerable: false, value: buildBreakwater(true) });
  }
});
