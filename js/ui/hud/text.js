(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.text = text; $.banner = banner; $.hitMark = hitMark;

  /* ---------- 小工具 ---------- */

  /** 这个颜色是不是亮到会在天空或云上糊掉 */
  var _lightCol = {};

  function isLightCol(col) {
    if (typeof col !== 'string') return false;
    if (_lightCol[col] !== undefined) return _lightCol[col];
    var r = 0, g = 0, b = 0, m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(col))) {
      r = parseInt(m[1].slice(0, 2), 16);
      g = parseInt(m[1].slice(2, 4), 16);
      b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = /^rgba?\(([^)]+)\)/i.exec(col))) {
      var p = m[1].split(',');
      r = parseFloat(p[0]); g = parseFloat(p[1]); b = parseFloat(p[2]);
    } else {
      _lightCol[col] = false;
      return false;
    }
    _lightCol[col] = (r * 0.299 + g * 0.587 + b * 0.114) > 165;
    return _lightCol[col];
  }

  function text(ctx, t, x, y, col, font, align) {
    ctx.font = font || $.F;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';

    /* 亮色的"浮空"读数（速度、高度、方位）在云上或亮天空里会糊掉。
       描一圈黑边就能压住任何背景，比给每处都加底板省事得多。 */
    if (isLightCol(col)) {
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.62)';
      ctx.strokeText(t, x, y);
    }

    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
    ctx.textAlign = 'left';
  }

  /* ============================================================
     击杀提示 / 任务横幅
     ============================================================ */
  function banner(ctx, W, H, title, sub, alpha, col) {
    // 告警栈排得长时，横幅往下让，不压在告警上
    var top = Math.max(H * 0.36, $.alertsBottom ? $.alertsBottom + $.U(4) : 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(4,10,14,0.55)';
    ctx.fillRect(0, top, W, 88);
    ctx.fillStyle = col || $.AMBER;
    ctx.fillRect(0, top, W, 2);
    ctx.fillRect(0, top + 86, W, 2);
    text(ctx, title, W / 2, top + 44, col || $.AMBER,
      'bold 34px Consolas,monospace', 'center');
    if (sub) text(ctx, sub, W / 2, top + 70, '#b9c8d4',
      '14px Consolas,monospace', 'center');
    ctx.restore();
  }

  function hitMark(ctx, W, H, txt, alpha, col) {
    ctx.save();
    ctx.globalAlpha = alpha;
    text(ctx, txt, W / 2 + 120, H / 2 - 60, col || $.AMBER,
      'bold 17px Consolas,monospace', 'center');
    ctx.restore();
  }
})(HUD);
