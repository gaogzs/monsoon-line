(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawHover = drawHover;

  /* ============================================================
     垂直起降机型的悬停分支 HUD（批次 6.2，物理见 js/engine/entities/vtol.js）

     只在 p.vtolOn 时画，其他机型一帧不画：
       速度矢量  菱形（画面中央，和机头标记同属"标记"，不算面板）：投影在"速度方向"上，
                 和 drawBoresight 画的机头标记（小圆）之间的偏离就是航迹偏移（竖直辅助速度 + 倾斜平移）
       悬停面板  贴在左侧速度带的右边，作为速度带的扩展信息（不占画面中央）：
                 左边一条竖直速度尺（±30 m/s，白三角 = 当前、青色短横 = 油门指令的目标），
                 右边一组文字：模式字（HOVER / VTOL / TRANS）、HS 水平速度、NOZ 喷口角、JET 喷口负荷
     排版：面板左缘 = 速度带 x + 60（避开速度带刻度数字，它们最多伸出 x + 46；失速刻度 x + 23 在悬停时不画）；
           右缘不过中央准星环（环外径 61 px + 余量）：窗口窄时面板整体往左收，最紧只留到速度带右侧 40。
           竖直方向以屏幕正中为中心，高度 ≈ 140，落在速度带的竖直范围内，左下角的雷达 / 引擎面板够不到这里。
     ============================================================ */
  var VS_RANGE = 30;                       // 垂直速度尺的单边量程（m/s）
  /* 面板相对速度带的排版常量（U 单位）：aids.js 的 offscreenRect 在悬停时按它给屏外标记的安全矩形让出左边 */
  $.HOVER_PANEL = { off: 60, w: 196 };

  function drawHover(ctx, W, H, cam, p) {
    if (!p.vtolOn || !p.alive) return;
    var cx = W / 2, cy = H / 2;
    var vel = p.vel || M3.V(0, 0, 0);
    var hs = Math.hypot(vel.x, vel.z);

    // 速度矢量：菱形（速度太小时方向没有意义，不画）
    if (cam && p.speed > 1.5) {
      var s = M3.project(cam, M3.add(p.pos, M3.mul(M3.norm(vel), 1400)));
      if (s) {
        ctx.strokeStyle = $.GREEN; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x + 8, s.y); ctx.lineTo(s.x, s.y + 8); ctx.lineTo(s.x - 8, s.y);
        ctx.closePath(); ctx.stroke();
      }
    }

    // ---- 面板位置：速度带右侧；与中央准星环（外径 61 px）之间留余量 ----
    var tapeX = $.gap(132, W, 0.15);                         // 与 drawTapes 的左侧速度带同一个 x
    var panelW = $.U($.HOVER_PANEL.w);
    var x0 = tapeX + $.U($.HOVER_PANEL.off);
    var maxR = cx - 61 - $.U(16);
    if (x0 + panelW > maxR) x0 = Math.max(tapeX + $.U(40), maxR - panelW);
    /* 竖直位置：以屏幕正中为中心；窗口矮、左下角的推力带（drawEnginePanel，几何照抄它）够到这里时，
       整个面板上移到推力带的 THR 标签 / HI-G 提示之上，不压住它 */
    var cyP = cy, g = $.U(120);
    var eR = Math.min($.U(104), Math.min(W, H) * 0.13), eX = eR + $.U(28) + eR + $.U(52);
    var eY1 = Math.min(H - $.U(32), H - $.gap(74, H, 0.11) - $.U(48));
    var eTop = eY1 - Math.min(eR * 1.9, $.U(190)) - $.U(36);
    var eLeft = eX - $.U(44), eRight = eX + $.U(150);
    if (x0 - $.U(14) < eRight && x0 + panelW > eLeft) cyP = Math.min(cy, eTop - (g / 2 + $.U(20)));

    // ---- 垂直速度尺（面板左半）----
    var rx = x0 + $.U(14), k = (g / 2) / VS_RANGE;
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx, cyP - g / 2); ctx.lineTo(rx, cyP + g / 2); ctx.stroke();
    for (var t = -VS_RANGE; t <= VS_RANGE; t += 10) {
      var ty = cyP - t * k, tl = t === 0 ? 10 : 5;
      ctx.beginPath(); ctx.moveTo(rx - tl, ty); ctx.lineTo(rx, ty); ctx.stroke();
    }
    var vy = M3.clamp(vel.y, -VS_RANGE, VS_RANGE);
    var cmd = M3.clamp(p.vtolVz || 0, -VS_RANGE, VS_RANGE);
    ctx.strokeStyle = $.CY; ctx.lineWidth = 2;                   // 油门指令的目标竖直速度
    ctx.beginPath(); ctx.moveTo(rx + 2, cyP - cmd * k); ctx.lineTo(rx + 12, cyP - cmd * k); ctx.stroke();
    ctx.fillStyle = '#eaf4fb';                                   // 当前竖直速度：指向尺子的三角
    ctx.beginPath();
    ctx.moveTo(rx + 2, cyP - vy * k); ctx.lineTo(rx + 10, cyP - vy * k - 4); ctx.lineTo(rx + 10, cyP - vy * k + 4);
    ctx.closePath(); ctx.fill();
    $.text(ctx, T('ui.hud.hover.vs'), rx, cyP - g / 2 - 8, $.DIM, $.FS, 'center');
    $.text(ctx, (vel.y >= 0 ? '+' : '') + vel.y.toFixed(1), rx, cyP + g / 2 + 14, '#eaf4fb', $.FS, 'center');

    // ---- 文字块（面板右半，左对齐）：模式字 / 水平速度 / 喷口角 / 喷口负荷 ----
    var tx = x0 + $.U(40);
    var wk = p.vtolWk || 0;
    var mode = (p.speed < 6 && Math.abs(vel.y) < 1.5) ? 'hover' : (wk > 0.35 ? 'trans' : 'vtol');
    var col = mode === 'trans' ? $.AMBER : $.GREEN;
    $.text(ctx, T('ui.hud.hover.mode_' + mode), tx, cyP - $.U(40), col, $.FB, 'left');
    $.text(ctx, T('ui.hud.hover.hs', { v: hs.toFixed(1) }), tx, cyP - $.U(16), $.DIM, $.FS, 'left');
    // 喷口角：0° 朝后（翼托着）… 90° 朝下（纯喷流托举），由实际速度决定，与推力挡位无关
    $.text(ctx, T('ui.hud.hover.noz', { a: ((p.vtolNoz || 0) * 180 / Math.PI).toFixed(0) }), tx, cyP + $.U(2), $.DIM, $.FS, 'left');
    /* 喷口负荷：托住重量需要的推力 / 当前高度的满指令推力（空气越稀越高）；≥ 100% 就托不住：被迫下降，
       同时 p.stall 为真，警告栈报 STALL（见 vtol.js） */
    var jet = p.vtolJet || 0, jcol = jet >= 1 ? $.RED : (jet >= 0.85 ? $.AMBER : $.DIM);
    $.text(ctx, T('ui.hud.hover.jet', { a: Math.round(jet * 100) }), tx, cyP + $.U(20), jcol, $.FS, 'left');
  }
})(HUD);
