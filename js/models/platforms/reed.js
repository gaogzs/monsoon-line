/** reed 芦苇 · 下游同盟 · 轻型哨戒平台：单桩小平台，一门 75 炮 + 一座旋转防空弹架 */
Registry.modelGroup({
  id: 'reed', order: 340,
  build: function (L, M) {
    var C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done, jacket = L.jacket, pDeck = L.pDeck;
    function buildReed(wreck) {
      var b = new MB();
      jacket(b, 5, 5, -5, 11, 1.0, C.rust2, wreck ? 1 : -1);
      pDeck(b, 18, 20, 12, C.rust2, C.deck, wreck);
      if (!wreck) {
        house(b, 5, 0, 6, 4, 6, 13, C.rust, C.rust);
        mast(b, 6, 0, 17, 25, 0.5, 0.2, C.rust2);
        b.box(6, 22, 0, 3.0, 1.6, 0.3, C.metal);
      }
      return done(b, { span: 18, len: 20, ground: true, sea: true, radius: 14 });
    }
    M.reed = buildReed(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'reed_wreck', { enumerable: false, value: buildReed(true) });
  }
});
