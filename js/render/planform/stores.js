(function (PLANFORM) {
  'use strict';
  var $ = PLANFORM.$;
  $.storeHalfW = storeHalfW; $.storeLen = storeLen; $.drawStore = drawStore;

  /* ============================================================
     挂载外形
     以 (x, y) 为中心、机头朝上绘制。k 是像素/米，用于把真实尺寸
     折算成图上长度，这样不同导弹在图上确实长短有别。
     ============================================================ */
  $.STORE_LEN = {
    aam: 3.4, asm: 4.6, agm: 4.0, bomb: 2.2,
    ecm: 3.2, dew: 3.6      // 吊舱类比导弹短粗
  };

  /* 吊舱类：方形截面，外形要一眼区别于导弹 */
  function isPod(kind) {
    return kind === 'ecm' || kind === 'dew';
  }

  /* 挂载物在图上的半宽（像素）—— 装填进度的裁剪框要包住整组多联 / 发射巢 */
  function storeHalfW(w, k) {
    var lk = w && w.look;
    if (!lk) return k * 1.8;
    if (lk.nest) return Math.max(4, lk.dia * (lk.nest === 'tube' ? 1.2 : 2.0) * k) + 2;
    var n = lk.rack || 1;
    return Math.max(2, lk.dia * 1.7 * k) * (n === 1 ? 1.6 : n === 2 ? 2.4 : 3.0) + 2;
  }

  function storeLen(w, k) {
    var lk = w && w.look;
    return (lk ? lk.len + (lk.nest ? 0.3 : 0) : ($.STORE_LEN[w.kind] || 3.0)) * k;
  }

  /* 按 WEAPONS[id].look 画：单发 / 多联挂梁 / 发射巢。
     没有 look 的（吊舱）走老的按 kind 画法。 */
  function drawStore(g, x, y, w, k, style) {
    var lk = w.look;
    if (!lk) return drawStoreKind(g, x, y, w.kind, k, style);
    g.lineWidth = style.line;
    var L = lk.len * k, D = Math.max(2, lk.dia * 1.7 * k), i;

    if (lk.nest === 'tube') {
      // 圆筒火箭巢：平头圆筒 + 前端一排管口
      var R = Math.max(4, lk.dia * 1.2 * k);
      g.beginPath();
      g.moveTo(x - R * 0.6, y - L / 2);
      g.lineTo(x + R * 0.6, y - L / 2);
      g.lineTo(x + R, y - L * 0.36);
      g.lineTo(x + R, y + L * 0.38);
      g.lineTo(x + R * 0.6, y + L / 2);
      g.lineTo(x - R * 0.6, y + L / 2);
      g.lineTo(x - R, y + L * 0.38);
      g.lineTo(x - R, y - L * 0.36);
      g.closePath();
      g.stroke();
      var tubes = Math.min(4, Math.max(2, Math.round((lk.cells || 7) / 2)));
      var dr = Math.max(0.9, R * 0.16);
      for (i = 0; i < tubes; i++) {
        var tx = x - R * 0.6 + (R * 1.2) * (i + 0.5) / tubes;
        g.beginPath();
        g.arc(tx, y - L * 0.40, dr, 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }
    if (lk.nest === 'box') {
      // 方形发射巢：方框 + 每格一个伸出的弹头
      var cols = lk.cells === 4 ? 2 : (lk.cells || 3);
      var HW = Math.max(4, lk.dia * 2.0 * k) * (cols / 2.4 + 0.4);
      g.strokeRect(x - HW, y - L / 2 + L * 0.12, HW * 2, L * 0.88);
      for (i = 0; i < cols; i++) {
        var cx = x - HW + HW * 2 * (i + 0.5) / cols;
        g.beginPath();
        g.moveTo(cx - HW / cols * 0.55, y - L / 2 + L * 0.12);
        g.lineTo(cx, y - L / 2);
        g.lineTo(cx + HW / cols * 0.55, y - L / 2 + L * 0.12);
        g.stroke();
        if (i > 0) {
          g.beginPath();
          g.moveTo(cx - HW / cols, y - L / 2 + L * 0.12);
          g.lineTo(cx - HW / cols, y + L / 2);
          g.stroke();
        }
      }
      return;
    }

    var n = lk.rack || 1;
    if (n === 1) { drawRound(g, x, y, lk, L, D); return; }
    // 多联挂梁：中间一道横梁 + 并排的弹（三联：中间那枚靠后半个身位，读作"下挂"）
    var gap = D * (n === 3 ? 1.5 : 3.0);
    var offs = n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    g.beginPath();
    g.moveTo(x + offs[0], y + L * 0.05);
    g.lineTo(x + offs[offs.length - 1], y + L * 0.05);
    g.stroke();
    for (i = 0; i < offs.length; i++) {
      drawRound(g, x + offs[i], y + (n === 3 && i === 1 ? L * 0.12 : 0), lk, L, D);
    }
  }

  function drawRound(g, x, y, lk, L, D) {
    if (lk.fin === 'bomb') {
      g.beginPath();
      g.moveTo(x, y - L / 2);
      g.quadraticCurveTo(x + D / 2, y - L * 0.18, x + D / 2, y + L * 0.22);
      g.lineTo(x + D * 0.25, y + L / 2);
      g.lineTo(x - D * 0.25, y + L / 2);
      g.lineTo(x - D / 2, y + L * 0.22);
      g.quadraticCurveTo(x - D / 2, y - L * 0.18, x, y - L / 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - D * 0.9, y + L / 2);
      g.lineTo(x + D * 0.9, y + L / 2);
      g.stroke();
      return;
    }
    var tail = lk.fin === 'strake' ? 1.6 : 1.3;
    if (lk.nose === 'dual') {
      // 头部改装：钝头 + 战斗部段外凸一圈 + 一道接缝（与 models.js 的 addRound 同一个轮廓）
      g.beginPath();
      g.moveTo(x - D * 0.3, y - L / 2);
      g.lineTo(x + D * 0.3, y - L / 2);
      g.lineTo(x + D * 0.5, y - L * 0.40);
      g.lineTo(x + D * 0.6, y - L * 0.30);
      g.lineTo(x + D * 0.6, y - L * 0.14);
      g.lineTo(x + D / 2, y - L * 0.10);
      g.lineTo(x + D / 2, y + L * 0.36);
      g.lineTo(x + D * tail, y + L / 2);
      g.lineTo(x - D * tail, y + L / 2);
      g.lineTo(x - D / 2, y + L * 0.36);
      g.lineTo(x - D / 2, y - L * 0.10);
      g.lineTo(x - D * 0.6, y - L * 0.14);
      g.lineTo(x - D * 0.6, y - L * 0.30);
      g.lineTo(x - D * 0.5, y - L * 0.40);
      g.closePath();
      g.stroke();
      g.beginPath(); g.moveTo(x - D * 0.6, y - L * 0.14); g.lineTo(x + D * 0.6, y - L * 0.14); g.stroke();   // 战斗部接缝
      if (lk.fin === 'strake') {
        g.beginPath(); g.moveTo(x - D / 2, y + L * 0.02); g.lineTo(x - D * 1.05, y + L * 0.14); g.stroke();
        g.beginPath(); g.moveTo(x + D / 2, y + L * 0.02); g.lineTo(x + D * 1.05, y + L * 0.14); g.stroke();
      }
      if (lk.boost) { g.beginPath(); g.moveTo(x - D * 0.8, y + L * 0.28); g.lineTo(x + D * 0.8, y + L * 0.28); g.stroke(); }
      return;
    }
    g.beginPath();
    g.moveTo(x, y - L / 2);
    g.lineTo(x + D / 2, y - L * 0.32);
    g.lineTo(x + D / 2, y + L * 0.36);
    g.lineTo(x + D * tail, y + L / 2);
    g.lineTo(x - D * tail, y + L / 2);
    g.lineTo(x - D / 2, y + L * 0.36);
    g.lineTo(x - D / 2, y - L * 0.32);
    g.closePath();
    g.stroke();
    // 每条线单独 beginPath：多段 moveTo 在离线预览器的光栅里会被连起来
    function seg(x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    if (lk.fin === 'strake') {
      // 长边条：从弹体中前部斜向后
      seg(x - D / 2, y - L * 0.12, x - D * 1.05, y + L * 0.14);
      seg(x + D / 2, y - L * 0.12, x + D * 1.05, y + L * 0.14);
    } else if (lk.fin === 'cruise') {
      seg(x - D * 3.2, y + L * 0.02, x + D * 3.2, y + L * 0.02);   // 平直大弹翼
    } else {
      seg(x - D * 1.1, y - L * 0.02, x + D * 1.1, y - L * 0.02);
    }
    if (lk.boost) seg(x - D * 0.8, y + L * 0.28, x + D * 0.8, y + L * 0.28);
  }

  function drawStoreKind(g, x, y, kind, k, style) {
    var L = ($.STORE_LEN[kind] || 3.0) * k;
    var W;

    switch (kind) {
      case 'aam':   W = Math.max(2, 0.22 * k); break;
      case 'asm':   W = Math.max(2.5, 0.30 * k); break;
      case 'agm':   W = Math.max(2.2, 0.26 * k); break;
      case 'bomb':  W = Math.max(3, 0.48 * k); break;
      case 'ecm':   W = Math.max(4, 0.62 * k); break;
      case 'dew':   W = Math.max(4.5, 0.78 * k); break;
      default:      W = Math.max(2, 0.30 * k);
    }

    g.lineWidth = style.line;

    if (isPod(kind)) {
      // 电子战 / 定向能吊舱：方头方脑，头部略收
      g.beginPath();
      g.moveTo(x - W * 0.34, y - L / 2);
      g.lineTo(x + W * 0.34, y - L / 2);
      g.lineTo(x + W / 2, y - L * 0.30);
      g.lineTo(x + W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L / 2);
      g.lineTo(x - W / 2, y - L * 0.30);
      g.closePath();
      g.stroke();

      // 舱段分隔
      g.beginPath();
      g.moveTo(x - W / 2, y - L * 0.06);
      g.lineTo(x + W / 2, y - L * 0.06);
      g.moveTo(x - W / 2, y + L * 0.26);
      g.lineTo(x + W / 2, y + L * 0.26);
      g.stroke();

      // 定向能吊舱前方加一个发射孔径
      if (kind === 'dew') {
        g.beginPath();
        g.arc(x, y - L * 0.34, Math.max(1.6, W * 0.30), 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }

    // 注意：屏幕坐标 y 向下增大，而弹体要朝上（和机头同向），
    // 所以"头部"取 y - L/2、"尾部"取 y + L/2。写反过一次。

    if (kind === 'bomb') {
      // 制导炸弹：圆头钝尾 + 尾翼
      g.beginPath();
      g.moveTo(x, y - L / 2);
      g.quadraticCurveTo(x + W / 2, y - L * 0.18, x + W / 2, y + L * 0.28);
      g.lineTo(x + W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L * 0.28);
      g.quadraticCurveTo(x - W / 2, y - L * 0.18, x, y - L / 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - W * 1.1, y + L / 2);
      g.lineTo(x + W * 1.1, y + L / 2);
      g.stroke();
      return;
    }

    // 导弹类：尖头 + 弹体 + 尾翼
    g.beginPath();
    g.moveTo(x, y - L / 2);                      // 头部朝上
    g.lineTo(x + W / 2, y - L * 0.28);
    g.lineTo(x + W / 2, y + L * 0.30);
    g.lineTo(x + W * 1.35, y + L / 2);           // 尾翼在下方
    g.lineTo(x - W * 1.35, y + L / 2);
    g.lineTo(x - W / 2, y + L * 0.30);
    g.lineTo(x - W / 2, y - L * 0.28);
    g.closePath();
    g.stroke();

    // 中段弹翼（略靠前）
    g.beginPath();
    g.moveTo(x - W * 1.15, y - L * 0.02);
    g.lineTo(x + W * 1.15, y - L * 0.02);
    g.stroke();

    // 反舰弹额外画一圈助推器
    if (kind === 'asm') {
      g.beginPath();
      g.moveTo(x - W * 0.95, y + L * 0.34);
      g.lineTo(x + W * 0.95, y + L * 0.34);
      g.stroke();
    }
  }
})(PLANFORM);
