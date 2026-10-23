Registry.modelGroup({
  id: 'turrets', order: 140,
  build: function (L, M) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
  /* ---------- 舰炮炮塔（2-0IMPL 3.6）----------
       每门拆成两件：_base 随方位角转（原点在甲板上），_gun 随方位 + 俯仰转（原点在耳轴，炮管沿 +z）。
       TURRET_SPEC：耳轴离甲板多高、炮口离耳轴多远 —— turret.js 用它算炮口，game.js 画的时候也用它。 */
  // 不可枚举：MODELS 的其余键都是模型，遍历它的工具（smoke、出图）不该把它当模型
  Object.defineProperty(M, 'TURRET_SPEC', { enumerable: false, value: {
      tur50: { pivot: 1.35, barrel: 4.25 },
      tur75: { pivot: 1.7, barrel: 6.0 },
      tur120: { pivot: 2.05, barrel: 8.45 },
      lnch: { pivot: 1.5, barrel: 1.7 }
    } });

  /* 把有实体的炮塔按零位朝向（yaw0、俯仰 0）合进船体网格 —— 图鉴、单位详情页、离线出图
       凡是只画 MODELS[ship.model] 的地方都用它，否则炮塔拆出去以后预览里少一截炮。 */
  Object.defineProperty(M, 'composeTurrets', { enumerable: false, value: function (base, mounts) {
      if (!base || !mounts || !mounts.length) return base;
      // 记住结果：预览每帧都会来要，换新对象会让 WebGL 的顶点缓冲每帧重建
      if (mounts.__composed && mounts.__composed.base === base) return mounts.__composed.out;
      var out = { v: base.v.slice(), f: base.f.slice() };
      Object.defineProperty(mounts, '__composed', { enumerable: false, writable: true, configurable: true, value: { base: base, out: out } });
      for (var k in base) if (k !== 'v' && k !== 'f') out[k] = base[k];
      function add(part, ox, oy, oz, yaw) {
        if (!part) return;
        var c = Math.cos(yaw), s = Math.sin(yaw), o = out.v.length, i;
        for (i = 0; i < part.v.length; i++) {
          var v = part.v[i];
          out.v.push([ox + v[0] * c + v[2] * s, oy + v[1], oz - v[0] * s + v[2] * c]);
        }
        for (i = 0; i < part.f.length; i++) {
          var f = part.f[i], nf = {};
          for (var key in f) nf[key] = f[key];
          nf.i = f.i.map(function (j) { return j + o; });
          out.f.push(nf);
        }
      }
      for (var i = 0; i < mounts.length; i++) {
        var m = mounts[i];
        if (!m.model || !M[m.model + '_base']) continue;
        var sp = M.TURRET_SPEC[m.model], p = m.pos, y = m.yaw0 || 0;
        add(M[m.model + '_base'], p[0], p[1], p[2], y);
        add(M[m.model + '_gun'], p[0], p[1] + sp.pivot, p[2], y);
      }
      return out;
    } });

  function turret(w, h, d, bl, br, twin, c1, c2) {
      var b = new MB();
      // 底座：一圈矮座圈 + 炮罩，前部收一截
      b.box(0, 0.25, 0, w * 1.05, 0.5, d * 0.9, c2, c2);
      b.box(0, 0.5 + h * 0.5, -d * 0.08, w, h, d * 0.8, c1, c2);
      b.box(0, 0.5 + h * 0.85, d * 0.25, w * 0.82, h * 0.35, d * 0.35, c1, c2);
      var base = done(b);
      var g = new MB();
      g.box(0, 0, 0.2, w * 0.42, h * 0.5, d * 0.4, c1, c2);          // 炮盾
      var xs = twin ? [-w * 0.18, w * 0.18] : [0];
      for (var i = 0; i < xs.length; i++) g.tube(V(xs[i], 0, d * 0.35), V(xs[i], 0, d * 0.35 + bl), br, br * 0.8, 6, C.rod, C.rod);
      return { base: base, gun: done(g) };
    }

  /* 旋转发射架（rotSam / lnchSsm）：底座是一根矮立柱 + 回转盘，
       "炮身"是一只多联发射箱，耳轴在箱子中部，箱口朝 +z（barrel = 箱口离耳轴的距离） */
  function launcherTurret(c1, c2) {
      var b = new MB();
      b.box(0, 0.3, 0, 2.4, 0.6, 2.4, c2, c2);            // 回转盘
      b.box(0, 0.9, -0.2, 1.0, 1.2, 1.2, c1, c2);         // 立柱
      var base = done(b);
      var g = new MB();
      g.box(-0.75, 0, 0, 1.3, 1.4, 3.4, c1, c2);           // 左右两只四联箱
      g.box(0.75, 0, 0, 1.3, 1.4, 3.4, c1, c2);
      g.box(-0.75, 0, 1.71, 1.1, 1.2, 0.02, C.boot);       // 箱口盖（深色）
      g.box(0.75, 0, 1.71, 1.1, 1.2, 0.02, C.boot);
      g.box(0, -0.2, -0.4, 0.4, 0.6, 1.6, c2, c2);         // 耳轴支架
      return { base: base, gun: done(g) };
    }

  [['', C.hull2, C.hull], ['r', C.rust2, C.rust]].forEach(function (pal) {
      var t = launcherTurret(pal[1], pal[2]);
      M['lnch' + pal[0] + '_base'] = t.base; M['lnch' + pal[0] + '_gun'] = t.gun;
    });

  M.TURRET_SPEC.lnchr = M.TURRET_SPEC.lnch;

  (function () {
      /* 两套涂装：上游舰的灰（hull），下游舰的锈红（rust）—— 名字带 r 的是后者 */
      var SZ = { tur50: [2.6, 1.4, 3.0, 3.2, 0.12, true], tur75: [3.8, 2.0, 4.6, 4.4, 0.20, false],
        tur120: [5.0, 2.6, 6.4, 6.2, 0.30, false] };
      for (var k in SZ) {
        var z = SZ[k];
        [['', C.hull2, C.hull], ['r', C.rust2, C.rust]].forEach(function (pal) {
          var t = turret(z[0], z[1], z[2], z[3], z[4], z[5], pal[1], pal[2]);
          M[k + pal[0] + '_base'] = t.base; M[k + pal[0] + '_gun'] = t.gun;
        });
        M.TURRET_SPEC[k + 'r'] = M.TURRET_SPEC[k];
      }
    })();
  }
});
