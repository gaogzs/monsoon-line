/** sluice 闸口 · 下游同盟 · 重型炮台平台：前后两座 120 炮、两舷反舰弹架、中央塔楼 */
Registry.modelGroup({
  id: 'sluice', order: 330,
  build: function (L, M) {
    var C = L.C, MB = L.MB, mast = L.mast, house = L.house, done = L.done, jacket = L.jacket, pDeck = L.pDeck;
    function buildSluice(wreck) {
      var b = new MB();
      jacket(b, 18, 15, -6, 17, 1.8, C.rust2, wreck ? 0 : -1);
      pDeck(b, 50, 40, 18, C.rust2, C.deck, wreck);
      if (!wreck) {
        house(b, 0, 0, 14, 7, 10, 19, C.rust, C.rust);                    // 中央塔楼，顶上是 30 mm
        b.box(0, 23.5, 5.1, 10, 3.4, 0.5, C.metal);
        mast(b, 0, -3, 26, 36, 0.8, 0.3, C.rust2);
        // 两舷四座斜置反舰弹箱，箱口朝外（yaw ±90°）
        b.boxTilt(17, 20.6, 7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, Math.PI / 2);
        b.boxTilt(17, 20.6, -7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, Math.PI / 2);
        b.boxTilt(-17, 20.6, 7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, -Math.PI / 2);
        b.boxTilt(-17, 20.6, -7, 1.8, 1.8, 8, -0.3, C.rust2, C.rust, -Math.PI / 2);
      }
      return done(b, { span: 50, len: 50, ground: true, sea: true, radius: 36 });
    }
    M.sluice = buildSluice(false);
    // 残骸不可枚举：MODELS 的遍历（预览、smoke）只看正式模型
    Object.defineProperty(M, 'sluice_wreck', { enumerable: false, value: buildSluice(true) });
  }
});
