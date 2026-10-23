/** beacon 航标 · 调节场管理局 · 无人测量 / 中继平台：单立柱 + 小甲板 + 天线桅 */
Registry.modelGroup({
  id: 'beacon', order: 360,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, done = L.done, pDeck = L.pDeck;
    function buildBeacon(wreck) {
      var b = new MB();
      b.tube(V(0, -5, 0), V(0, wreck ? 4 : 8, 0), 2.2, 2.0, 8, C.snow, C.snow2);
      pDeck(b, 12, 12, 9, C.snow2, C.snow, wreck);
      if (!wreck) {
        mast(b, 0, 0, 10, 22, 0.4, 0.15, C.snow2);
        b.wing(V(-5.5, 10.8, -3), V(-1.5, 10.8, -3), V(-1.5, 12, 1), V(-5.5, 12, 1), C.canopy);   // 太阳能板
        b.box(3.5, 11, 3, 3, 2, 3, C.snow, C.snow2);
        b.box(0, 22.6, 0, 2.4, 0.3, 0.3, C.red);
      }
      return done(b, { span: 12, len: 12, ground: true, sea: true, radius: 10 });
    }
    M.beacon = buildBeacon(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'beacon_wreck', { enumerable: false, value: buildBeacon(true) });
  }
});
