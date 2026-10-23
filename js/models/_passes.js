/* 模型收尾遍：座舱盖落座、垂尾根部补缝、舰船零件落座（原 models.js 末尾，docs/POST2-0IMPL.md 1.5）。
   Registry.sealModels 在所有模型建好之后调用 ModelLib.finish(M, settleIds)。 */
(function (L) {
  var V = L.V, C = L.C, MB = L.MB;
  /* ============================================================
     座舱盖落座

     战斗机的座舱盖都是一块菱形薄片（前尖 / 两侧 / 后顶），
     手填的坐标普遍高出机身上表面一截 —— 侧面看是一张悬着的纸。
     这里统一后处理：竖直射线量出机身上表面，
       · 三个底点（前尖与两侧）压到表面上；
       · 最高点保留原来的"鼓包高度"，但从表面量起；
       · 补两片三角把后面封住，让它成为一个坐在机身上的鼓包。
     只动顶点不与别的面共享的座舱盖（方盒窗带不碰），舰船 / 地面模型跳过。
     ============================================================ */
  function topAbove(m, px, pz, skip) {
    var best = null;
    for (var fi = 0; fi < m.f.length; fi++) {
      if (skip[fi]) continue;
      var idx = m.f[fi].i;
      for (var t = 1; t < idx.length - 1; t++) {
        var A = m.v[idx[0]], B = m.v[idx[t]], Cc = m.v[idx[t + 1]];
        var d = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
        if (Math.abs(d) < 1e-9) continue;
        var w1 = ((B[2] - Cc[2]) * (px - Cc[0]) + (Cc[0] - B[0]) * (pz - Cc[2])) / d;
        var w2 = ((Cc[2] - A[2]) * (px - Cc[0]) + (A[0] - Cc[0]) * (pz - Cc[2])) / d;
        var w3 = 1 - w1 - w2;
        if (w1 < -0.02 || w2 < -0.02 || w3 < -0.02) continue;
        var y = w1 * A[1] + w2 * B[1] + w3 * Cc[1];
        if (best === null || y > best) best = y;
      }
    }
    return best;
  }

  function seatCanopies(m) {
    var use = {}, fi, k, canopy = [];
    for (fi = 0; fi < m.f.length; fi++) {
      for (k = 0; k < m.f[fi].i.length; k++) use[m.f[fi].i[k]] = (use[m.f[fi].i[k]] || 0) + 1;
    }
    for (fi = 0; fi < m.f.length; fi++) {
      var f = m.f[fi];
      if ((f.c !== C.canopy && f.c !== C.canopy2) || f.i.length !== 4) continue;
      var shared = false;
      for (k = 0; k < 4; k++) if (use[f.i[k]] > 1) shared = true;
      if (!shared) canopy.push(fi);
    }
    if (!canopy.length) return;
    var skip = {};
    for (k = 0; k < canopy.length; k++) skip[canopy[k]] = true;
    var extra = [];
    for (var ci = 0; ci < canopy.length; ci++) {
      var ids = m.f[canopy[ci]].i, pk = 0;
      for (k = 1; k < 4; k++) if (m.v[ids[k]][1] > m.v[ids[pk]][1]) pk = k;
      var tops = [], ok = true, baseY = 0;
      for (k = 0; k < 4; k++) {
        var v = m.v[ids[k]];
        var ty = topAbove(m, v[0], v[2], skip);
        if (ty === null) { ok = false; break; }
        tops.push(ty);
        if (k !== pk) baseY += v[1] / 3;
      }
      if (!ok) continue;
      var bulge = M3.clamp(m.v[ids[pk]][1] - baseY, 0.14, 0.32);   // 过高的鼓包会像一片竖起的鳍
      for (k = 0; k < 4; k++) {
        if (k === pk) continue;
        m.v[ids[k]][1] = tops[k] - 0.01;          // 略沉一点，压住接缝
      }
      var apex = m.v[ids[pk]];
      apex[1] = tops[pk] + bulge;
      // 封底：最高点正下方补一个落在机身上的点，与前后两个邻点各围一片三角
      m.v.push([apex[0], tops[pk] - 0.01, apex[2]]);
      var foot = m.v.length - 1;
      var prev = ids[(pk + 3) % 4], next = ids[(pk + 1) % 4];
      var col = m.f[canopy[ci]].c;
      extra.push({ i: [prev, ids[pk], foot], c: col }, { i: [next, foot, ids[pk]], c: col });
    }
    for (k = 0; k < extra.length; k++) m.f.push(extra[k]);
  }

  /* ============================================================
     翼面插进机体

     尾翼、垂尾（以及部分主翼）都是单独一块薄板，翼根点按机身"名义宽度"
     手填 —— 而机身尾段在收窄，于是翼根和机身之间常常露一道缝。
     这里统一把每块翼面的翼根沿"翼尖 → 翼根"方向往里延伸，
     直到翼根中点落进机体内部，再多插 15 cm。穿模无所谓，
     只要 x 不越过中线（不从另一侧穿出来）。
     可变后掠翼的顶点由 morph 驱动，跳过。
     ============================================================ */
  function bodyFaces(m, skip) {
    var r = [];
    for (var fi = 0; fi < m.f.length; fi++) if (!skip[fi]) r.push(fi);
    return r;
  }

  // (x, y, z) 是否在机体内部：竖直方向上下都有机体表面
  function insideBody(m, faces, x, y, z) {
    var lo = null, hi = null;
    for (var n = 0; n < faces.length; n++) {
      var idx = m.f[faces[n]].i;
      for (var t = 1; t < idx.length - 1; t++) {
        var A = m.v[idx[0]], B = m.v[idx[t]], Cc = m.v[idx[t + 1]];
        var d = (B[2] - Cc[2]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[2] - Cc[2]);
        if (Math.abs(d) < 1e-9) continue;
        var w1 = ((B[2] - Cc[2]) * (x - Cc[0]) + (Cc[0] - B[0]) * (z - Cc[2])) / d;
        var w2 = ((Cc[2] - A[2]) * (x - Cc[0]) + (A[0] - Cc[0]) * (z - Cc[2])) / d;
        var w3 = 1 - w1 - w2;
        if (w1 < 0 || w2 < 0 || w3 < 0) continue;
        var yy = w1 * A[1] + w2 * B[1] + w3 * Cc[1];
        if (yy <= y && (lo === null || yy > lo)) lo = yy;
        if (yy >= y && (hi === null || yy < hi)) hi = yy;
      }
    }
    return lo !== null && hi !== null;
  }

  function rootFins(m) {
    var use = {}, fi, k, morph = {};
    if (m.morph && m.morph.map) {
      for (k = 0; k < m.morph.map.length; k++) if (m.morph.map[k] >= 0) morph[k] = true;
    }
    for (fi = 0; fi < m.f.length; fi++) {
      for (k = 0; k < m.f[fi].i.length; k++) use[m.f[fi].i[k]] = (use[m.f[fi].i[k]] || 0) + 1;
    }
    var fins = [], skip = {};
    for (fi = 0; fi < m.f.length; fi++) {
      var f = m.f[fi];
      // 任何孤立的单片四边形都算翼面（G-6 的垂尾是机身绿，不是翼面灰）；座舱盖除外
      if (f.c === C.canopy || f.c === C.canopy2 || f.i.length !== 4) continue;
      var ok = true;
      for (k = 0; k < 4; k++) if (use[f.i[k]] > 1 || morph[f.i[k]]) ok = false;
      if (ok) { fins.push(fi); skip[fi] = true; }
    }
    if (!fins.length) return;
    var body = bodyFaces(m, skip);
    var rad = function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); };
    for (var n = 0; n < fins.length; n++) {
      var ids = m.f[fins[n]].i;
      // 翼根 = 离机身轴线（x=0, y=0）最近的那条边
      var best = 0, bestR = 1e9;
      for (k = 0; k < 4; k++) {
        var rr = rad(m.v[ids[k]]) + rad(m.v[ids[(k + 1) % 4]]);
        if (rr < bestR) { bestR = rr; best = k; }
      }
      var r0 = ids[best], r1 = ids[(best + 1) % 4];
      var t0 = ids[(best + 3) % 4], t1 = ids[(best + 2) % 4];   // 各自对应的翼尖点
      var P0 = m.v[r0], P1 = m.v[r1], T0 = m.v[t0], T1 = m.v[t1];
      var dir = function (P, T) {
        var dx = P[0] - T[0], dy = P[1] - T[1], dz = P[2] - T[2];
        var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        return [dx / l, dy / l, dz / l];
      };
      // 两个翼根点各自往里推，直到落进机体再多插 15 cm —— 只看中点会漏：
      // 中点插进去了，翼根前后两端还悬在收窄的机身外面。
      // 方向两个都试：沿翼面（翼尖 → 翼根）和直接朝机身轴线，取挪动更少的那个；
      // 翼根在收窄段外侧时，顺着翼展往下戳会擦边而过或戳得很深。
      var push = function (P, T) {
        if (insideBody(m, body, P[0], P[1], P[2])) return;
        var a = pushAlong(P, dir(P, T)), c = pushAlong(P, dir([0, 0, P[2]], P));
        var p = a && (!c || a.e <= c.e) ? a : c;
        if (p) { P[0] = p.q[0]; P[1] = p.q[1]; P[2] = p.q[2]; }
      };
      var pushAlong = function (P, dd) {
        // 偏在一侧的翼面不越过中线；本来就在中线上的（单垂尾、腹鳍）不受限
        var side = Math.abs(P[0]) > 0.05 ? (P[0] > 0 ? 1 : -1) : 0;
        var found = -1;
        for (var e = 0.02; e <= 4 + 1e-9; e += 0.02) {
          var x = P[0] + dd[0] * e;
          if (side && x * side < 0.02) break;
          if (insideBody(m, body, x, P[1] + dd[1] * e, P[2] + dd[2] * e)) { found = e; break; }
        }
        if (found < 0) return null;
        var e2 = found + 0.15;
        if (side && dd[0] * side < 0) e2 = Math.min(e2, (Math.abs(P[0]) - 0.02) / Math.abs(dd[0]));
        e2 = Math.max(0, e2);
        return { e: found, q: [P[0] + dd[0] * e2, P[1] + dd[1] * e2, P[2] + dd[2] * e2] };
      };
      push(P0, T0);
      push(P1, T1);
    }
  }

  L.finish = function (M, settleIds) {
    for (var mk in M) {
      if (!Object.prototype.hasOwnProperty.call(M, mk)) continue;
      var mm = M[mk];
      if (!mm || !mm.v || mm.ground || mm.sea) continue;
      rootFins(mm);
      seatCanopies(mm);
    }

    /* ---------- 舰船零件落座 ----------
       舰船是一个个 box / tube 拼出来的，手写坐标时常有零件悬在半空
       （集装箱、烟囱、甲板标线离甲板一截）。这里按"连通分量"（共享顶点的一组面）
       找出**和任何其他零件都不接触**的那些，把它们的底面**往下延长**到正下方最高的表面上
       （只拉最底下那一圈顶点，零件本身的高度、位置不变 —— 集装箱、烟囱长出一截"脚"）。
       接触到别的零件的（贴在舰桥侧面的相控阵、桅杆顶的平台）不动。
       穿进船体一点也没关系 —— 从外面看不出来。 */
    function settle(m) {   // 名字沿用"落座"，做法是向下延长
      var nv = m.v.length, par = new Array(nv), i, k;
      for (i = 0; i < nv; i++) par[i] = i;
      function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
      m.f.forEach(function (f) { for (var j = 1; j < f.i.length; j++) { var a = find(f.i[0]), b = find(f.i[j]); if (a !== b) par[a] = b; } });
      var g = {};
      m.f.forEach(function (f, fi) { var r = find(f.i[0]); (g[r] = g[r] || { fs: [], vs: {} }).fs.push(fi); f.i.forEach(function (j) { g[r].vs[j] = 1; }); });
      var C = Object.keys(g).map(function (r) { var c = g[r]; c.vs = Object.keys(c.vs).map(Number); return c; });
      function box(c) {
        var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        c.vs.forEach(function (j) { for (var q = 0; q < 3; q++) { var x = m.v[j][q]; if (x < mn[q]) mn[q] = x; if (x > mx[q]) mx[q] = x; } });
        c.mn = mn; c.mx = mx;
      }
      C.forEach(box);
      C.sort(function (a, b) { return b.fs.length - a.fs.length; });
      var EPS = 0.15;
      function touches(c, o) {
        for (var q = 0; q < 3; q++) if (c.mn[q] > o.mx[q] + EPS || c.mx[q] < o.mn[q] - EPS) return false;
        return true;
      }
      /* 竖直向下打到别的零件：在 (x, z) 处、高度不超过 ymax 的最高面 */
      function hitBelow(x, z, ymax, self) {
        var best = -1e9;
        for (var ci = 0; ci < C.length; ci++) {
          var o = C[ci];
          if (o === self || x < o.mn[0] || x > o.mx[0] || z < o.mn[2] || z > o.mx[2] || o.mn[1] > ymax) continue;
          for (var fi = 0; fi < o.fs.length; fi++) {
            var idx = m.f[o.fs[fi]].i;
            for (var t = 1; t < idx.length - 1; t++) {
              var A = m.v[idx[0]], B = m.v[idx[t]], D = m.v[idx[t + 1]];
              var d = (B[2] - D[2]) * (A[0] - D[0]) + (D[0] - B[0]) * (A[2] - D[2]);
              if (Math.abs(d) < 1e-9) continue;
              var w1 = ((B[2] - D[2]) * (x - D[0]) + (D[0] - B[0]) * (z - D[2])) / d;
              var w2 = ((D[2] - A[2]) * (x - D[0]) + (A[0] - D[0]) * (z - D[2])) / d;
              var w3 = 1 - w1 - w2;
              if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
              var y = w1 * A[1] + w2 * B[1] + w3 * D[1];
              if (y <= ymax + 0.05 && y > best) best = y;
            }
          }
        }
        return best;
      }
      for (var pass = 0; pass < 3; pass++) {
        var moved = false;
        var order = C.slice(1).sort(function (a, b) { return a.mn[1] - b.mn[1]; });
        for (i = 0; i < order.length; i++) {
          var c = order[i], free = true;
          for (k = 0; k < C.length && free; k++) if (C[k] !== c && touches(c, C[k])) free = false;
          if (!free) continue;
          var cx = (c.mn[0] + c.mx[0]) / 2, cz = (c.mn[2] + c.mx[2]) / 2;
          var hx = (c.mx[0] - c.mn[0]) * 0.3, hz = (c.mx[2] - c.mn[2]) * 0.3;
          var sup = -1e9;
          [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].forEach(function (o) {
            sup = Math.max(sup, hitBelow(cx + o[0], cz + o[1], c.mn[1], c));
          });
          var gap = c.mn[1] - sup;
          if (sup < -1e8 || gap < 0.02 || gap > 40) continue;
          var y0 = c.mn[1] + 0.05;
          c.vs.forEach(function (j) { if (m.v[j][1] <= y0) m.v[j] = [m.v[j][0], m.v[j][1] - gap, m.v[j][2]]; });
          box(c);
          moved = true;
        }
        if (!moved) break;
      }
      return m;
    }
    ['orca', 'bluewhale', 'humpback', 'spermwhale', 'dolphin', 'trilobite', 'ammonite', 'seascorpion',
      'cameroceras', 'dunkleosteus', 'daplu', 'skori', 'diklo', 'cross', 'icecore', 'atoll'].forEach(function (id) { if (M[id]) settle(M[id]); });
    settleIds.forEach(function (id) { if (M[id]) settle(M[id]); });
  };
})(ModelLib);
