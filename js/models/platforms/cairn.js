/** cairn 石堆 · 分水群岛国 · 改装钻井平台：粗桩腿、钻塔、生活舱、直升机坪 —— 民用平台加装了炮 */
Registry.modelGroup({
  id: 'cairn', order: 350,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, house = L.house, done = L.done, jacket = L.jacket, pDeck = L.pDeck;
    function buildCairn(wreck) {
      var b = new MB();
      jacket(b, 18, 18, -6, 23, 2.6, C.yellow, wreck ? 3 : -1);
      pDeck(b, 48, 48, 24, C.grey2, C.deck, wreck);
      if (!wreck) {
        // 钻塔：四根往上收的立柱
        for (var i = 0; i < 4; i++) {
          var dx = i % 2 ? 4 : -4, dz = i < 2 ? 4 : -4;
          b.tube(V(dx, 25, dz), V(dx * 0.25, 52, dz * 0.25), 0.5, 0.35, 4, C.white);
        }
        b.box(0, 52.5, 0, 3, 1.2, 3, C.red);
        house(b, -14, 12, 16, 9, 14, 25, C.white, C.snow2);                 // 生活舱
        b.box(14, 33.2, -16, 14, 0.4, 14, C.yellow);                        // 悬臂直升机坪
        b.tube(V(14, 25, -16), V(14, 33, -16), 1.0, 1.0, 6, C.grey2);
      }
      return done(b, { span: 48, len: 48, ground: true, sea: true, radius: 36 });
    }
    M.cairn = buildCairn(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'cairn_wreck', { enumerable: false, value: buildCairn(true) });
  }
});
