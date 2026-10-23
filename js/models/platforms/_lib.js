(function (L) {
  var V = L.V, C = L.C, MB = L.MB;
  /* ============================================================
     固定式海上平台（2-0IMPL 4.9）

     和舰船同一套坐标：水线 y = 0，"船头"朝 +z（平台的 yaw 只决定炮位零位朝哪边）。
     每种平台一个构造函数，wreck = true 时出残骸版本：
       甲板歪斜、上层建筑与炮座没了、一根桩腿断掉，甲板上散几块碎件 ——
     game.js 在平台被击毁后改画 <model>_wreck，并让它往下沉一截。
     炮塔 / 发射架不烘焙在这里，位置见 data.js 的 PLATFORM_MOUNTS / PLATFORM_LAUNCHERS。
     ============================================================ */
  /** 导管架：四根桩腿 + 每面两道 X 形撑杆。broken = 断掉的那根腿的序号（-1 不断） */
  function jacket(b, hw, hd, y0, y1, r, col, broken) {
    var L = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], i;
    for (i = 0; i < 4; i++) {
      var top = i === broken ? y0 + (y1 - y0) * 0.45 : y1;
      b.tube(V(L[i][0], y0, L[i][1]), V(L[i][0], top, L[i][1]), r, r * 0.85, 6, col, C.boot);
    }
    var ya = y0 + (y1 - y0) * 0.25, yb = y0 + (y1 - y0) * 0.7;
    for (i = 0; i < 4; i++) {
      if (i === broken || (i + 1) % 4 === broken) continue;        // 断腿那两面的撑杆跟着没了
      var A = L[i], B2 = L[(i + 1) % 4];
      b.tube(V(A[0], ya, A[1]), V(B2[0], yb, B2[1]), r * 0.3, r * 0.3, 4, col);
      b.tube(V(A[0], yb, A[1]), V(B2[0], ya, B2[1]), r * 0.3, r * 0.3, 4, col);
    }
  }

  /** 平台甲板：完好是一块平板；残骸是一块往断腿那边歪下去的板，外加几块碎件 */
  function pDeck(b, w, d, y, col, colTop, wreck) {
    if (!wreck) { b.box(0, y, 0, w, 2.0, d, col, colTop); return; }
    // 甲板烧黑、往一边歪；碎块按甲板大小缩放，摆在甲板面上（歪的那一面跟着降）
    b.boxTilt(0, y - 2.5, 0, w, 2.0, d, 0.16, C.darker, C.dark);
    var k = Math.min(w, d) / 36;
    for (var i = 0; i < 5; i++) {
      var dz = (i % 3 - 1) * d * 0.25;
      b.box((i - 2) * w * 0.17, y - 1.0 + 0.16 * dz + 0.8 * k, dz, (2.5 + i % 2) * k, 1.6 * k, (3 + i % 3) * k, C.dark, C.black);
    }
  }
  L.jacket = jacket;
  L.pDeck = pDeck;
})(ModelLib);
