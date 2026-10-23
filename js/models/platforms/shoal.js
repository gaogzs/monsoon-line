/** shoal 浅滩站 · 上游公约 · 导管架防空平台：雷达罩 + 舰空弹垂发 + 两座近防 */
Registry.modelGroup({
  id: 'shoal', order: 310,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done, jacket = L.jacket, pDeck = L.pDeck;
    function buildShoal(wreck) {
      var b = new MB();
      jacket(b, 13, 13, -6, 19, 1.5, C.hull2, wreck ? 2 : -1);
      pDeck(b, 36, 36, 20, C.hull2, C.deck, wreck);
      if (!wreck) {
        house(b, 0, -6, 16, 7, 12, 21, C.hull, C.hull);
        b.box(0, 24.6, 0.1, 12, 4.6, 0.5, C.metal);                       // 前向阵面
        mast(b, 0, -8, 28, 38, 0.8, 0.3, C.hull2);
        b.tube(V(0, 38.6, -8), V(0, 42.6, -8), 2.6, 2.6, 8, C.white, C.white);   // 雷达罩
        b.box(8, 21.5, 9, 8, 1.0, 8, C.hull2, C.metal);                   // 垂发盖板
        b.box(-12, 21.2, -13, 8, 0.2, 8, C.yellow);                       // 直升机吊运区
      }
      return done(b, { span: 36, len: 36, ground: true, sea: true, radius: 30 });
    }
    M.shoal = buildShoal(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'shoal_wreck', { enumerable: false, value: buildShoal(true) });
  }
});
