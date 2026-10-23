Registry.modelGroup({
  id: 'store-lib', order: 370,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
  /* ---------- 按武器外观（WEAPONS[id].look）生成的弹体 / 挂架 ----------
       以前所有导弹共用一个 3.4 m 的壳子：短矢和极远挂在翼下长得一模一样，
       火箭巢、三联巢也只是"一枚导弹"。现在：
         round(w) —— 单发弹体，飞出去的那一枚
         store(w) —— 挂架上的样子：单发 / 多联挂梁 / 发射巢
       data.js 在 models.js 之后加载，所以按需生成、按武器缓存。 */
  function addRound(b, lk, ox, oy, oz) {
      var L = lk.len, r = lk.dia / 2, z0 = oz - L / 2, z1 = oz + L / 2;
      var bomb = lk.fin === 'bomb';
      var noseZ = z1 - L * (bomb ? 0.28 : 0.16);
      var tailZ = z0 + L * (bomb ? 0.12 : 0);
      var bodyCol = bomb ? C.green2 : C.white;
      // 头部改装（TOR-3 的 nose:'dual'）：战斗部段比弹体粗一圈、醒目的红色，前面接钝圆的导引头罩
      if (lk.nose === 'dual') {
        var wbL = L * 0.22;
        b.tube(V(ox, oy, tailZ), V(ox, oy, noseZ - wbL), r, r, 6, bodyCol, null);
        b.tube(V(ox, oy, noseZ - wbL), V(ox, oy, noseZ), r * 1.18, r * 1.18, 6, C.red, C.darker);
        b.tube(V(ox, oy, noseZ), V(ox, oy, z1), r * 1.18, r * 0.55, 6, bodyCol, C.metal);
        b.tube(V(ox, oy, z1 - L * 0.04), V(ox, oy, z1), r * 0.55, r * 0.42, 6, C.black, null);   // 导引头窗口
      } else {
        // 弹体 + 头锥（炸弹是圆钝头、导弹是尖头）
        b.tube(V(ox, oy, tailZ), V(ox, oy, noseZ), bomb ? r * 0.7 : r, r, 6, bodyCol, null);
        b.tube(V(ox, oy, noseZ), V(ox, oy, z1), r, bomb ? r * 0.35 : r * 0.12, 6, bodyCol, C.metal);
      }
      if (bomb) b.tube(V(ox, oy, z0), V(ox, oy, tailZ), r * 0.35, r * 0.7, 6, C.darker, null);
      // 助推段：尾部一圈深色加粗
      if (lk.boost) b.tube(V(ox, oy, z0), V(ox, oy, z0 + L * 0.22), r * 1.12, r * 1.12, 6, C.grey2, C.darker);

      var f = lk.fin, fs = Math.max(r * 2.6, 0.22);
      function cross(za, zb, span, lead) {
        // 四片十字翼：za 前缘根部，zb 后缘根部，span 翼展，lead 翼尖后退量
        var s = r + span;
        b.wing(V(ox + r, oy, za), V(ox + s, oy, za - lead), V(ox + s, oy, zb), V(ox + r, oy, zb), C.grey);
        b.wing(V(ox - r, oy, za), V(ox - s, oy, za - lead), V(ox - s, oy, zb), V(ox - r, oy, zb), C.grey);
        b.wing(V(ox, oy + r, za), V(ox, oy + s, za - lead), V(ox, oy + s, zb), V(ox, oy + r, zb), C.grey);
        b.wing(V(ox, oy - r, za), V(ox, oy - s, za - lead), V(ox, oy - s, zb), V(ox, oy - r, zb), C.grey);
      }
      if (f === 'strake') {
        cross(oz + L * 0.10, oz - L * 0.22, fs * 0.55, L * 0.12);   // 长边条
        cross(z0 + L * 0.16, z0, fs * 0.95, L * 0.10);              // 大尾舵
      } else if (f === 'cruise') {
        // 平直大弹翼（左右一对）+ 小尾翼
        var ws = L * 0.34;
        b.wing(V(ox + r, oy + r * 0.6, oz + L * 0.06), V(ox + r + ws, oy + r * 0.6, oz - L * 0.02),
          V(ox + r + ws, oy + r * 0.6, oz - L * 0.10), V(ox + r, oy + r * 0.6, oz - L * 0.10), C.grey);
        b.wing(V(ox - r, oy + r * 0.6, oz + L * 0.06), V(ox - r - ws, oy + r * 0.6, oz - L * 0.02),
          V(ox - r - ws, oy + r * 0.6, oz - L * 0.10), V(ox - r, oy + r * 0.6, oz - L * 0.10), C.grey);
        cross(z0 + L * 0.12, z0, r * 1.4, L * 0.06);
      } else if (f === 'bomb') {
        cross(z0 + L * 0.14, z0, r * 0.9, L * 0.06);
      } else {
        cross(oz + L * 0.02, oz - L * 0.08, r * 1.1, L * 0.03);     // 小中翼
        cross(z0 + L * 0.12, z0, r * 1.7, L * 0.06);                // 尾舵
      }
    }

  var ROUND_CACHE = {}, STORE_CACHE = {};

  var DEFAULT_LOOK = { len: 3.4, dia: 0.28, fin: 'small' };

  function round(w) {
      if (!w) return M.missile;
      if (ROUND_CACHE[w.id]) return ROUND_CACHE[w.id];
      var lk = w.look || DEFAULT_LOOK, b = new MB();
      // 巢式武器：dia 是整个巢，离架后的单发按 rdia（没写就退回 dia）
      if (lk.rdia) { var lk2 = {}; for (var kk in lk) lk2[kk] = lk[kk]; lk2.dia = lk.rdia; lk = lk2; }
      addRound(b, lk, 0, 0, 0);
      return (ROUND_CACHE[w.id] = done(b, { span: lk.dia * 6, len: lk.len }));
    }

  function store(w) {
      if (!w) return M.missile;
      if (w.kind === 'ecm' || w.kind === 'dew' || !w.look) return M[w.model] || M.missile;
      if (STORE_CACHE[w.id]) return STORE_CACHE[w.id];
      var lk = w.look, b = new MB(), r = lk.dia / 2, L = lk.len, i;
      if (lk.nest) {
        // 发射巢：一个外壳 + 前端深色管口
        var n = lk.cells || 3;
        if (lk.nest === 'tube') {
          b.tube(V(0, -r, -L / 2), V(0, -r, L / 2), r, r, 10, C.green, C.darker);
          b.tube(V(0, -r, -L / 2 - 0.2), V(0, -r, -L / 2), r * 0.55, r, 10, C.green2, null);
          // 平头前端：中心一根 + 外圈一圈管口，伸出端面一点
          var cr = r * 0.24;
          b.tube(V(0, -r, L / 2), V(0, -r, L / 2 + 0.06), cr, cr, 6, C.black, C.black);
          for (i = 0; i < n - 1; i++) {
            var th = i / (n - 1) * Math.PI * 2;
            var cx = Math.cos(th) * r * 0.62, cy = -r + Math.sin(th) * r * 0.62;
            b.tube(V(cx, cy, L / 2), V(cx, cy, L / 2 + 0.06), cr, cr, 6, C.black, C.black);
          }
        } else {
          // 方巢：n 个小格排成一行（n=4 时 2×2）
          var cols = n === 4 ? 2 : n, rows = n === 4 ? 2 : 1;
          var cw = lk.dia * 1.5, bw = cols * cw, bh = rows * cw;
          b.box(0, -bh / 2, 0, bw, bh, L, C.navy2, C.navy);
          for (var cx2 = 0; cx2 < cols; cx2++) for (var cy2 = 0; cy2 < rows; cy2++) {
            var hx = -bw / 2 + cw * (cx2 + 0.5), hy = -bh + cw * (cy2 + 0.5);
            // 管口：伸出一点的弹头
            b.tube(V(hx, hy, L / 2), V(hx, hy, L / 2 + 0.22), r, r * 0.15, 6, C.white, C.metal);
          }
        }
        return (STORE_CACHE[w.id] = done(b, { span: lk.dia * 4, len: L }));
      }
      var n2 = lk.rack || 1;
      if (n2 === 1) {
        addRound(b, lk, 0, -r, 0);
      } else {
        // 多联挂梁：一根横梁，弹并排挂在下面；三联是"左右两枚 + 下方一枚"
        var gap = lk.dia * 1.25;
        b.box(0, 0.02, 0, gap * (n2 === 3 ? 2 : 1) + lk.dia * 1.2, 0.08, L * 0.45, C.dark, C.grey2);
        if (n2 === 2) {
          addRound(b, lk, gap / 2, -r - 0.05, 0);
          addRound(b, lk, -gap / 2, -r - 0.05, 0);
        } else {
          addRound(b, lk, gap, -r - 0.05, 0);
          addRound(b, lk, -gap, -r - 0.05, 0);
          addRound(b, lk, 0, -r * 3 - 0.08, 0);
        }
      }
      return (STORE_CACHE[w.id] = done(b, { span: lk.dia * 6, len: L }));
    }

  // 不可枚举：MODELS 的键要全是模型（图鉴 / 冒烟测试会逐个遍历渲染）
  Object.defineProperty(M, 'round', { value: round, enumerable: false });

  Object.defineProperty(M, 'store', { value: store, enumerable: false });

  /* 挂载离挂点往下放多少：模型最高点（含竖直尾翼）× 缩放 + 一点间隙。
       贴死了尾翼会戳进机翼，所以统一"略微浮空"。实机（game.js pushOneStore）
       与机库预览（unitview.js composeLoadout）共用这一份。 */
  var STORE_GAP = 0.08;

  function storeDrop(mdl, scale) {
      if (mdl.top === undefined) {
        var t = -1e9;
        for (var i = 0; i < mdl.v.length; i++) if (mdl.v[i][1] > t) t = mdl.v[i][1];
        mdl.top = t;
      }
      return mdl.top * scale + STORE_GAP;
    }

  // 按 look 生成的模型是真实米数；吊舱等老模型沿用 0.85 的缩放
  function storeScale(w) { return (w && w.look) ? 1 : 0.85; }

  Object.defineProperty(M, 'storeDrop', { value: storeDrop, enumerable: false });

  Object.defineProperty(M, 'storeScale', { value: storeScale, enumerable: false });
  }
});
