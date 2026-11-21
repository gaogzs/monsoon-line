(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawHover = drawHover;

  /* ============================================================
     垂直起降机型的悬停分支 HUD（批次 6.2，物理见 js/engine/entities/vtol.js）

     只在 p.vtolOn 时画，其他机型一帧不画：
       速度矢量  菱形，投影在"速度方向"上；和 drawBoresight 画的机头标记（小圆）之间的偏离就是横向漂移
       垂直速度  准星右侧一条竖尺（±30 m/s），白三角 = 当前、青色短横 = 油门指令的目标
       模式字    HOVER 悬停（几乎不动）/ VTOL 喷流托举 / TRANS 过渡（翼升力已经起来）+ 水平速度
     ============================================================ */
  var VS_RANGE = 30;                       // 垂直速度尺的单边量程（m/s）

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

    // 模式字 + 水平速度，放在准星上方
    var wk = p.vtolWk || 0;
    var mode = (p.speed < 6 && Math.abs(vel.y) < 1.5) ? 'hover' : (wk > 0.35 ? 'trans' : 'vtol');
    var col = mode === 'trans' ? $.AMBER : $.GREEN;
    $.text(ctx, T('ui.hud.hover.mode_' + mode), cx, cy - $.U(86), col, $.FB, 'center');
    $.text(ctx, T('ui.hud.hover.hs', { v: hs.toFixed(1) }), cx, cy - $.U(68), $.DIM, $.FS, 'center');
    // 喷口角：0° 朝后（翼托着）… 90° 朝下（纯喷流托举），由实际速度决定，与推力挡位无关
    $.text(ctx, T('ui.hud.hover.noz', { a: ((p.vtolNoz || 0) * 180 / Math.PI).toFixed(0) }), cx, cy - $.U(52), $.DIM, $.FS, 'center');

    // 垂直速度尺
    var g = $.U(120), x = cx + $.U(150), k = (g / 2) / VS_RANGE;
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, cy - g / 2); ctx.lineTo(x, cy + g / 2); ctx.stroke();
    for (var t = -VS_RANGE; t <= VS_RANGE; t += 10) {
      var ty = cy - t * k, tl = t === 0 ? 10 : 5;
      ctx.beginPath(); ctx.moveTo(x - tl, ty); ctx.lineTo(x, ty); ctx.stroke();
    }
    var vy = M3.clamp(vel.y, -VS_RANGE, VS_RANGE);
    var cmd = M3.clamp(p.vtolVz || 0, -VS_RANGE, VS_RANGE);
    ctx.strokeStyle = $.CY; ctx.lineWidth = 2;                   // 油门指令的目标竖直速度
    ctx.beginPath(); ctx.moveTo(x + 2, cy - cmd * k); ctx.lineTo(x + 12, cy - cmd * k); ctx.stroke();
    ctx.fillStyle = '#eaf4fb';                                   // 当前竖直速度：指向尺子的三角
    ctx.beginPath();
    ctx.moveTo(x + 2, cy - vy * k); ctx.lineTo(x + 10, cy - vy * k - 4); ctx.lineTo(x + 10, cy - vy * k + 4);
    ctx.closePath(); ctx.fill();
    $.text(ctx, T('ui.hud.hover.vs'), x, cy - g / 2 - 8, $.DIM, $.FS, 'center');
    $.text(ctx, (vel.y >= 0 ? '+' : '') + vel.y.toFixed(1), x, cy + g / 2 + 14, '#eaf4fb', $.FS, 'center');
  }
})(HUD);
