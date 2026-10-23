(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawCompass = drawCompass; $.drawBoresight = drawBoresight; $.drawTapes = drawTapes; $.thrPercent = thrPercent; $.drawEnginePanel = drawEnginePanel;

  /* ============================================================
     顶部指南针
     没有它，单色海面上根本判断不出自己在往哪转。
     顺带把任务目标的方位也标上去 —— 否则在开阔空域找浮空平台
     只能靠雷达盲猜。
     ============================================================ */
  function drawCompass(ctx, W, H, p, world, S, cam) {
    if (S && S.compass === false) return;

    var cx = W / 2;
    var top = $.U(8);
    var bandH = $.U(26);
    var halfW = Math.min($.U(300), W * 0.24);
    var spanDeg = 100;                       // 指南针显示的总方位范围
    var degPerPx = spanDeg / (halfW * 2);

    /* 罗盘跟着**镜头**转，不是跟机头：自由视角 / 鼠标引导时，镜头朝哪边、罗盘中央就是哪个方位。
       水平分量过小时（镜头接近垂直）方位没有意义，沿用上一帧的值。机头航向另算一份留在 p.heading
       （别的地方读它），不再用来画罗盘。 */
    var fw = (cam && cam.fwd) || p.fwd;
    var hl = Math.sqrt(fw.x * fw.x + fw.z * fw.z);
    var hdg = p.compassHdg === undefined ? 0 : p.compassHdg;
    if (hl > 0.03) {
      hdg = Math.atan2(fw.x / hl, fw.z / hl) * 180 / Math.PI;
    }
    hdg = ((hdg % 360) + 360) % 360;
    p.compassHdg = hdg;
    var nl = Math.sqrt(p.fwd.x * p.fwd.x + p.fwd.z * p.fwd.z);
    if (nl > 0.03) p.heading = ((Math.atan2(p.fwd.x / nl, p.fwd.z / nl) * 180 / Math.PI) % 360 + 360) % 360;
    /* 罗盘读的是**真方位**：世界 +z 不一定指北，每一关在 mission.axis 里
       声明 +z 的真方位（见 js/missions/_schema.js 开头的说明）。p.heading 仍保留世界航向。 */
    var axis = (world && world.axis) || 0;
    hdg = (hdg + axis) % 360;

    // 背板
    ctx.fillStyle = 'rgba(6,14,20,0.5)';
    ctx.fillRect(cx - halfW - 10, top, (halfW + 10) * 2, bandH + 16);
    ctx.strokeStyle = 'rgba(79,224,138,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - halfW - 10, top, (halfW + 10) * 2, bandH + 16);

    // 刻度：每 5° 一个短刻，每 10° 标注
    var a0 = hdg - spanDeg / 2, a1 = hdg + spanDeg / 2;
    for (var d = Math.ceil(a0 / 5) * 5; d <= a1; d += 5) {
      var x = cx + (d - hdg) / degPerPx;
      var dd = ((d % 360) + 360) % 360;
      var isCard = (dd % 90 === 0);
      var isMaj = (dd % 10 === 0);
      if (!isMaj && Math.abs(x - cx) > halfW) continue;

      ctx.strokeStyle = isCard ? $.GREEN : (isMaj ? 'rgba(79,224,138,0.65)' : 'rgba(79,224,138,0.30)');
      ctx.lineWidth = isCard ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top + bandH);
      ctx.lineTo(x, top + bandH - (isMaj ? 11 : 6));
      ctx.stroke();

      if (isMaj) {
        $.text(ctx, isCard ? $.CARD[dd / 90] : String(dd), x, top + 13,
          isCard ? $.GREEN : $.DIM, isCard ? 'bold 13px Consolas,monospace' : $.FS, 'center');
      }
    }

    // 任务目标方位标记
    var marks = [];
    if (world && (!S || S.targetMarkers !== false)) {
      if (world.targets) {
        for (var i = 0; i < world.targets.length; i++) {
          if (world.targets[i].alive && !$.farCell(world.targets[i], p)) marks.push(world.targets[i]);
        }
      }
    }
    for (i = 0; i < marks.length; i++) {
      var t = marks[i];
      var dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      var th = Math.atan2(dx, dz) * 180 / Math.PI + axis;
      var diff = M3.wrapPi((th - hdg) * Math.PI / 180) * 180 / Math.PI;
      if (Math.abs(diff) > spanDeg / 2) continue;
      var mx = cx + diff / degPerPx;
      var col = (t.team === 2) ? '#8fa3b2' : (t.ttype === 'air' ? $.AMBER : '#a8bccb');
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(mx, top + bandH + 7);
      ctx.lineTo(mx - 5, top + bandH + 15);
      ctx.lineTo(mx + 5, top + bandH + 15);
      ctx.closePath();
      ctx.fill();
    }

    // 中心指针 + 航向读数
    ctx.fillStyle = $.AMBER;
    ctx.beginPath();
    ctx.moveTo(cx, top + bandH + 1);
    ctx.lineTo(cx - 6, top - 7);
    ctx.lineTo(cx + 6, top - 7);
    ctx.closePath();
    ctx.fill();

    $.text(ctx, ('00' + Math.round(hdg % 360)).slice(-3), cx, top + bandH + 30,
      $.AMBER, 'bold 13px Consolas,monospace', 'center');
  }

  /* ============================================================
     中心：机头参考 + 速度矢量
     ============================================================ */
  function drawBoresight(ctx, W, H, p) {
    var cx = W / 2, cy = H / 2;

    /* 机头参考（十字）。鼠标引导时镜头跟的是瞄准方向，画面中心是准星，
       不是机头 —— 那时不画这个固定十字，机头位置看下面的机头标记。 */
    var aimFollow = !!p.aimDir;
    if (!aimFollow) {
      ctx.strokeStyle = $.GREEN; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 9, cy);
      ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 26, cy);
      ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 7);
      ctx.stroke();
    }

    // 速度矢量（小圆 + 三根短须）
    var s = null;
    if (Renderer.getCam()) {
      var ahead = M3.add(p.pos, M3.mul(p.fwd, 1400));
      s = M3.project(Renderer.getCam(), ahead);
    }
    /* 机头 → 准星的细线：机炮沿机头打，标记压进准星环里才是真的对准了。
       离得很近时不画，免得准星中间常驻一截短线。 */
    if (s && aimFollow && Renderer.getCam()) {
      var as = M3.project(Renderer.getCam(), M3.add(p.pos, M3.mul(p.aimDir, 1400)));
      if (as && Math.hypot(as.x - s.x, as.y - s.y) > 24) {
        ctx.strokeStyle = 'rgba(102,217,255,0.35)'; ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(as.x, as.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (s) {
      ctx.strokeStyle = $.CY; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x - 14, s.y);
      ctx.moveTo(s.x + 7, s.y); ctx.lineTo(s.x + 14, s.y);
      ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y - 12);
      ctx.stroke();
    }

    /* 屏幕中央的双圈：固定的装饰准星环，不随目标或武器变化。
       真正的机炮提前量圈画在目标附近，发射包线看锁定框的颜色。 */
    var gunR = 46;
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, gunR, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([5, 9]);
    ctx.beginPath(); ctx.arc(cx, cy, gunR + 15, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ============================================================
     速度带 / 高度带 / Q 表
     ============================================================ */
  function drawTapes(ctx, W, H, p, S) {
    var cy = H / 2;
    // 带子长度跟着缩放走，但最多占屏幕高的 32%
    var hgt = Math.min($.U(260), H * 0.32);
    var top = cy - hgt / 2;

    /* ---------- 左：空速 ----------
       距左边界的间距随缩放增大，但不超过屏宽的 15% ——
       这样把 HUD 调到最大时带子只会变粗，不会跑出左边界。
       位置从左边算起，而不是从屏幕中心算，也是同一个道理。 */
    var m = $.gap(132, W, 0.15);
    var x = m;
    tape(ctx, x, top, hgt, p.speed, 50, 200, 1, 'M/S', $.CY, 0.85);
    /* 大数字和刻度同一单位（m/s）。以前大数字是没标单位的 km/h，和刻度对不上，
       看着像速度读数和指针不一致 */
    $.text(ctx, p.speed.toFixed(0), x - 46, cy + 5, '#eaf4fb', $.FB, 'right');
    $.text(ctx, (p.speed * 3.6).toFixed(0) + ' KM/H', x - 46, cy + 21, $.DIM, $.FS, 'right');
    $.text(ctx, (p.speed * 1.9438).toFixed(0) + ' KT', x - 46, cy + 35, $.DIM, $.FS, 'right');
    $.text(ctx, 'M ' + (p.speed / 340.3).toFixed(2), x - 46, cy + 49, $.DIM, $.FS, 'right');

    /* 引擎出力带与 FCS 舵量表不在这里 —— 它们挪到了雷达右侧，
       见 drawEnginePanel()。 */

    /* ---------- 右：高度 ---------- */
    var x2 = W - m;
    tape(ctx, x2, top, hgt, p.pos.y, 1000, 5000, -1, 'M', $.GREEN, 0.021);
    $.text(ctx, p.pos.y.toFixed(0), x2 + 46, cy + 5, '#eaf4fb', $.FB, 'left');
    $.text(ctx, (p.pos.y * 3.28084).toFixed(0) + ' FT', x2 + 46, cy + 21, $.DIM, $.FS, 'left');

    /* ---------- 右下：动压 Q（本作核心仪表）与过载 G ----------
       两个框并排坐在挂载俯视图正上方（Q 左、G 右）。以前 Q 框
       按高度带往下排，会压住 STORES 面板的上沿；再往下叠一个 G 框
       就整个盖在俯视图上了。所以改为从 hmiLayout 的 storeY 往上排。 */
    var L = $.hmiLayout(W, H);
    var qy = L.storeY - $.U(64);
    var gx = W - L.margin - 58;
    var qx = gx - 122;
    var q = p.q;
    var qCol = q < 12 ? $.RED : (q < 20 ? $.AMBER : $.GREEN);
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.strokeRect(qx - 58, qy - 26, 116, 48);
    // 动压不足时标题闪成"舵面失效"—— 不另占一行
    var bl = (q < 12) && (Math.sin(performance.now() * 0.012) > 0);
    $.text(ctx, bl ? T('ui.hud.instruments.drawTapes.s1') : T('ui.hud.instruments.drawTapes.s2'), qx - 50, qy - 9, bl ? $.RED : $.DIM, $.FS, 'left');
    $.text(ctx, q.toFixed(1) + ' kPa', qx + 50, qy + 11, qCol, $.FB, 'right');

    // Q 条
    var k = M3.clamp(q / 60, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(qx - 50, qy + 16, 100, 5);
    ctx.fillStyle = qCol;
    ctx.fillRect(qx - 50, qy + 16, 100 * k, 5);
    // 12 kPa 警戒线
    ctx.fillStyle = $.RED;
    ctx.fillRect(qx - 50 + 100 * 0.2, qy + 14, 1.5, 9);

    /* 实时过载 G：由 stepAircraft 按实际加速度算（a.gNow），不是由杆量推出来的 ——
       所以低动压下拉满杆、表上也只有一两个 G，这正是"舵面失效"的手感。
       不设上限，只在超过 9G（人能扛的量级）时变色。 */
    var gy = qy;
    var gN = (p.gNow === undefined) ? 1 : p.gNow;
    var gCol = (gN > 9 || gN < -2) ? $.AMBER : $.GREEN;
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.strokeRect(gx - 58, gy - 26, 116, 48);
    $.text(ctx, T('ui.hud.instruments.drawTapes.s3'), gx - 50, gy - 9, $.DIM, $.FS, 'left');
    $.text(ctx, gN.toFixed(1) + ' G', gx + 50, gy + 11, gCol, $.FB, 'right');

    // G 条：-3 … +12，从 0G 往两边长；1G 处一道基准线
    var G_LO = -3, G_HI = 12;
    var g0 = 100 * (0 - G_LO) / (G_HI - G_LO);
    var gk = 100 * (M3.clamp(gN, G_LO, G_HI) - G_LO) / (G_HI - G_LO);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(gx - 50, gy + 16, 100, 5);
    ctx.fillStyle = gCol;
    ctx.fillRect(gx - 50 + Math.min(g0, gk), gy + 16, Math.abs(gk - g0), 5);
    ctx.fillStyle = $.DIM;
    ctx.fillRect(gx - 50 + 100 * (1 - G_LO) / (G_HI - G_LO), gy + 14, 1.5, 9);

    /* ---------- 油门条不在这里 ----------
       它原来贴在屏幕左下角，而那正好是雷达圆心 —— 雷达在 drawTapes
       之后绘制，所以它一直被盖住看不见。现在搬到了空速带右边，
       见上面的 thrTape()。 */
  }

  function tape(ctx, x, top, hgt, val, minor, major, side, label, col, scale) {
    scale = scale || 1;
    var cy = top + hgt / 2;
    var half = (hgt / 2) / scale;
    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + hgt); ctx.stroke();

    var lo = Math.floor((val - half) / minor) * minor;
    var hi = val + half;
    for (var v = lo; v <= hi; v += minor) {
      if (v < 0) continue;
      var y = cy + (val - v) * scale;
      if (y < top || y > top + hgt) continue;
      var isMajor = (Math.abs(v % major) < 0.001);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (side > 0 ? (isMajor ? 14 : 7) : -(isMajor ? 14 : 7)), y);
      ctx.stroke();
      if (isMajor) {
        $.text(ctx, (v / (major >= 1000 ? 1000 : 1)).toFixed(major >= 1000 ? 1 : 0) + (major >= 1000 ? 'k' : ''),
          x + (side > 0 ? 18 : -18), y + 4, $.DIM, $.FS, side > 0 ? 'left' : 'right');
      }
    }

    // 当前值指针
    ctx.fillStyle = col;
    ctx.beginPath();
    if (side > 0) { ctx.moveTo(x, cy); ctx.lineTo(x - 13, cy - 7); ctx.lineTo(x - 13, cy + 7); }
    else { ctx.moveTo(x, cy); ctx.lineTo(x + 13, cy - 7); ctx.lineTo(x + 13, cy + 7); }
    ctx.closePath(); ctx.fill();

    $.text(ctx, label, x, top - 10, $.DIM, $.FS, 'center');
  }

  /* 油门轴 → THR 读数（%）。三段各自线性：
       减速板  油门 0 → THR_IDLE   读数 −25 → 0（青）
       军推    THR_IDLE → 1        读数 0 → 100
       加力    1 → THR_MAX         读数 100 → 125（琥珀）
     以前读数直接是"油门杆 × 100"，慢车停在 4%，看起来像还剩 4% 推力 ——
     其实飞行模型里没有推力，油门只决定一个目标速度，4% 就是慢车。
     减速板在物理上是开 / 关两态（油门低于 THR_IDLE 就全开），负数段只表示
     杆位，−5% 和 −25% 的减速效果一样。
     两个分界点必须与 Game 的 THR_IDLE / THR_MAX（js/engine/game/vars.js）一致（smoke 有断言）。 */
  $.THR_IDLE = 0.04;
  $.THR_MAX = 1.25;

  var THR_PCT_LO = -25, THR_PCT_HI = 125;

  function thrPercent(thr) {
    thr = M3.clamp(thr, 0, $.THR_MAX);
    if (thr < $.THR_IDLE) return THR_PCT_LO * ($.THR_IDLE - thr) / $.THR_IDLE;
    if (thr <= 1) return (thr - $.THR_IDLE) / (1 - $.THR_IDLE) * 100;
    return 100 + (thr - 1) / ($.THR_MAX - 1) * (THR_PCT_HI - 100);
  }

  /* 引擎出力带 —— 慢车 = 0%，军推 = 100%，加力超出到 125%，减速板往下到 −25%。

     为什么加力到 125%：本作各机加力把最高速度抬高约 25%（vMax / vMil ≈ 1.24–1.29），
     油门轴的加力段也正好是 1.0 → 1.25。军推在 100% 这一点上，
     "有没有开加力"一眼就能看出；慢车在 0%，"有没有张减速板"也一样。

     为什么不用上面那个 tape()：tape 是**滚动带**，指针永远钉在中心，
     它读得出"数值是多少"，读不出"现在在不在加力区、还剩多少余量"。
     出力是一个**有界的绝对量**（0 到 1.25 个油门单位），
     只有"量程固定 + 指针移动"才能让人一眼看出高低。

     刻度线长度、标签字号、指针形状、顶部标签全部照抄 tape()，
     所以它和空速带/高度带看起来仍然是同一套仪表。
     颜色约定：加力琥珀、减速板青色。

     为什么搬到这里：它原来贴在屏幕左下角，而那正是雷达圆心，
     雷达在 drawTapes 之后绘制，于是它一直被盖住、玩家根本看不到。
     注意它显示的是**油门杆位置**，不是速度，也不是推力 —— 三者都不同。 */
  function thrTape(ctx, x, top, hgt, thr, ab, brake) {
    var y0 = top + hgt;
    var pct = thrPercent(thr);
    var span = THR_PCT_HI - THR_PCT_LO;
    var yOf = function (v) { return y0 - (v - THR_PCT_LO) / span * hgt; };
    var col = brake ? $.CY : (ab ? $.AMBER : $.GREEN);
    var yMil = yOf(100), yIdle = yOf(0);

    // 加力区（100%–125%）、减速板区（−25%–0%）底色
    ctx.fillStyle = 'rgba(255,176,58,0.10)';
    ctx.fillRect(x - 5, top, 10, yMil - top);
    ctx.fillStyle = 'rgba(69,214,255,0.10)';                 // = CY
    ctx.fillRect(x - 5, yIdle, 10, y0 - yIdle);

    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, y0); ctx.stroke();

    // 刻度：每 10% 短刻，每 25% 长刻并标数字（−25 / 0 / 25 / 50 / 75 / 100 / 125）
    for (var v = THR_PCT_LO; v <= THR_PCT_HI; v += 5) {
      var isMaj = (v % 25 === 0);
      if (!isMaj && v % 10 !== 0) continue;
      var y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (isMaj ? 14 : 7), y);
      ctx.stroke();
      if (isMaj) $.text(ctx, String(v), x - 18, y + 4, v > 100 ? $.AMBER : (v < 0 ? $.CY : $.DIM), $.FS, 'right');
    }

    // 军推上限（100%）与慢车（0%）
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x - 8, yMil, 16, 1.5);
    ctx.fillRect(x - 8, yIdle, 16, 1.5);

    // 指针：当前油门
    var py = yOf(pct);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, py); ctx.lineTo(x + 13, py - 7); ctx.lineTo(x + 13, py + 7);
    ctx.closePath(); ctx.fill();

    $.text(ctx, 'THR', x, top - 10, $.DIM, $.FS, 'center');
    // 读数固定在带子的垂直中心
    $.text(ctx, Math.round(pct) + '%', x + 24, top + hgt / 2 + 5, col, $.FB, 'left');
    if (brake) $.text(ctx, 'BRK', x, y0 + 16, $.CY, $.FS, 'center');
    else if (ab) $.text(ctx, 'A/B', x, y0 + 16, $.AMBER, $.FS, 'center');
  }

  /* ---------- 雷达右侧：引擎出力 + FCS 舵量表 ----------
     以前贴在空速带右边，正好压在屏幕左侧中段；现在和雷达并排坐在左下。
     竖向范围：底边停在武器面板那一行（GUN）之上，所以不论屏幕多窄都
     不会碰到它 —— GUN 是武器面板里唯一伸进左半屏的元素。
     雷达几何必须与 drawRadar 一致。 */
  function drawEnginePanel(ctx, W, H, p) {
    var R = Math.min($.U(104), Math.min(W, H) * 0.13);
    var rcx = R + $.U(28), rcy = H - R - $.U(32);
    var ex = rcx + R + $.U(52);                         // 左侧要留给 0–100 刻度数字
    var y1 = Math.min(rcy + R, H - $.gap(74, H, 0.11) - $.U(48));
    var hgt = Math.min(R * 1.9, $.U(190));
    var top = y1 - hgt;
    thrTape(ctx, ex, top, hgt, p.throttle, p.ab, p.brake);
    ctrlGauges(ctx, ex + $.U(62), top, hgt, p);
    // 高 G：正在拉过载时给个明确的提示，掉速才不至于莫名其妙
    if (p.hiG) {
      var gcol = Math.sin(performance.now() * 0.02) > 0 ? $.RED : $.AMBER;
      $.text(ctx, 'HI-G', ex, top - $.U(30), gcol, $.FB, 'center');
    }
  }

  /* 飞控舵量表 P / R / Y —— 飞控**此刻给出的**杆量，不是玩家的输入。

     贴在出力带右侧、与它底边对齐（出力读数在带子中线，下半段是空的）。
     每根都是双极的：中线 = 0，向上 = 抬头 / 右滚 / 右偏。
     底色是这根轴此刻的**可用权限**（动压舵效 × 失速），所以低速时
     底色会缩短，一眼看得出"杆打满了也转不动"；俯仰向下那半边
     再乘 0.5，和 stepAircraft 里推杆只有一半权限一致。
     滚转有保底舵效（ctrlFactor × 1.8，最低 0.28），这里也照算。 */
  function ctrlGauges(ctx, x0, top, hgt, p) {
    var c = p.ctrl || { pitch: 0, roll: 0, yaw: 0 };
    var auth = (p.ctrlAuth === undefined) ? 1 : p.ctrlAuth;
    var gh = hgt * 0.62;                      // 单根高度
    var y1 = top + hgt;                       // 与出力带底边对齐
    var yc = y1 - gh / 2;
    var gw = $.U(22);                           // 两根之间的间距
    var axes = [
      { k: 'P', v: c.pitch, up: auth, dn: auth * 0.5 },
      { k: 'R', v: c.roll, up: M3.clamp(auth * 1.8, 0.28, 1), dn: M3.clamp(auth * 1.8, 0.28, 1) },
      { k: 'Y', v: c.yaw, up: auth, dn: auth }
    ];
    for (var i = 0; i < 3; i++) {
      var A = axes[i];
      var x = x0 + i * gw;
      var v = M3.clamp(A.v || 0, -1, 1);
      // 可用权限底色
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 3, yc - gh / 2 * A.up, 6, gh / 2 * A.up + gh / 2 * A.dn);
      // 轴线与 0 / ±1 刻度
      ctx.strokeStyle = $.DIM; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yc - gh / 2); ctx.lineTo(x, yc + gh / 2);
      ctx.moveTo(x - 7, yc); ctx.lineTo(x + 7, yc);
      ctx.moveTo(x - 4, yc - gh / 2); ctx.lineTo(x + 4, yc - gh / 2);
      ctx.moveTo(x - 4, yc + gh / 2); ctx.lineTo(x + 4, yc + gh / 2);
      ctx.stroke();
      // 杆量条：从 0 往上下长；超过可用权限的部分（杆打满也给不出来）变琥珀
      var lim = v >= 0 ? A.up : A.dn;
      var sat = Math.abs(v) > 0.98 || Math.abs(v) > lim + 1e-3;
      ctx.fillStyle = sat ? $.AMBER : $.GREEN;
      var hh = gh / 2 * Math.abs(v);
      ctx.fillRect(x - 2, v >= 0 ? yc - hh : yc, 4, Math.max(1, hh));
      $.text(ctx, A.k, x, y1 + 16, $.DIM, $.FS, 'center');
    }
    $.text(ctx, 'FCS', x0 + gw, yc - gh / 2 - 10, $.DIM, $.FS, 'center');
  }
})(HUD);
