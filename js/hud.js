/* ============================================================
   hud.js —— 平视显示 / 雷达 / 告警
   本作特有的两件东西：
     · Q 表（动压 kPa）—— 高空的第一生命线
     · 锁定框的发射包线三档色（射程外 / 射程内 / NEZ）—— 每帧按双方态势估算
   ============================================================ */
'use strict';

var HUD = (function () {

  var GREEN = '#4fe08a', AMBER = '#ffb03a', CY = '#45d6ff', RED = '#ff4d4d';
  var BLUE = '#5aa8ff';                    // 友军：屏幕上的友军框、本方射弹的菱形框
  var DIM = 'rgba(79,224,138,0.42)';

  /* ---------- HUD 缩放 ----------
     两条规则，缺一不可：

     ① 位置一律从"元素所在的那条屏幕边"往内算（而不是从屏幕中心算），
        否则缩放一变，贴边的元素就会朝反方向跑。
     ② 那个间距本身再夹一个屏幕比例上限，
        这样把缩放拉到最大时，元素只会在靠边的地方变粗，不会涨出可视区。

     字号也一起缩放 —— 否则调大之后框变大了字没变，反而更难读。 */
  var HUDK = 1;
  var F = '', FB = '', FS = '';

  function applyScale(k) {
    HUDK = M3.clamp(k, 0.6, 1.8);
    F = 'bold ' + (12 * HUDK).toFixed(1) + 'px Consolas,monospace';
    FB = 'bold ' + (15 * HUDK).toFixed(1) + 'px Consolas,monospace';
    FS = 'bold ' + (11 * HUDK).toFixed(1) + 'px Consolas,monospace';
  }
  applyScale(1);

  /** 长度按缩放折算 */
  function U(v) { return v * HUDK; }

  /** 距边的间距：随缩放增大，但不超过屏幕的 limit 比例 */
  function gap(base, size, limit) {
    return Math.min(base * HUDK, size * limit);
  }

  /* ============================================================
     右下角布局

     俯视图与 RWR 环是挨着放的两个元素，位置必须由同一处算出来 ——
     否则任何一边改了尺寸，另一边就会错位或者叠上去。

     排列是：
         [ RWR 环 ]  [ 挂载俯视图 ]
     两者底边对齐，俯视图贴右下角，RWR 在它左边。
     ============================================================ */
  function hmiLayout(W, H) {
    var m = gap(16, W, 0.025);
    var size = Math.min(U(168), Math.min(W, H) * 0.20);
    var storeX = W - size - m;
    var storeY = H - size - m;

    var rwrR = Math.min(U(70), Math.min(W, H) * 0.09);
    var rwrX = storeX - U(26) - rwrR;      // 俯视图左侧
    var rwrY = H - m - rwrR;               // 与俯视图底边对齐

    return {
      margin: m,
      size: size, storeX: storeX, storeY: storeY,
      rwrR: rwrR, rwrX: rwrX, rwrY: rwrY
    };
  }

  /* ============================================================
     主入口
     ============================================================ */
  var CARD = ['N', 'E', 'S', 'W'];

  function draw(world, p, dt, S) {
    var ctx = Renderer.ctx;
    var W = Renderer.W, H = Renderer.H;
    var cam = Renderer.getCam();
    if (!cam || !p) return;

    applyScale(S && S.hudScale !== undefined ? S.hudScale / 100 : 1);

    ctx.save();
    ctx.lineCap = 'butt';
    if (S && S.hudOpacity !== undefined) {
      ctx.globalAlpha = M3.clamp(S.hudOpacity / 100, 0.15, 1);
    }

    drawCompass(ctx, W, H, p, world, S);
    drawPitchLadder(ctx, W, H, cam, p, S);
    drawBoresight(ctx, W, H, p);
    drawTapes(ctx, W, H, p, S);
    drawRadar(ctx, W, H, p, world);
    drawEnginePanel(ctx, W, H, p);
    drawThreatRing(ctx, W, H, p, world);
    drawTargets(ctx, W, H, cam, p, world);
    drawLaserStatus(ctx, W, H, p, world);
    drawLeadReticle(ctx, W, H, cam, p);   // 画在目标框之上，免得被挡住
    drawConeCue(ctx, W, H, cam, p);
    drawFootprint(ctx, W, H, cam, p);     // 精确制导炸弹的动态瞄准圈（泪滴形）
    drawFriendlyShots(ctx, W, H, cam, p, world);
    drawIncomingMissiles(ctx, W, H, cam, p, world);
    drawStores(ctx, W, H, p);
    drawWeaponPanel(ctx, W, H, p);
    drawTargetBearing(ctx, W, H, p, p.target);
    drawAlerts(ctx, W, H, p, world);
    drawObjective(ctx, W, H, world);

    ctx.restore();
    /* 全屏滤镜（干扰 / 受伤闪红）在 hudOpacity 之外画 —— 见 hudfx.js */
    if (typeof HudFx !== 'undefined') HudFx.draw(ctx, W, H, p);
  }

  /* ============================================================
     顶部指南针
     没有它，单色海面上根本判断不出自己在往哪转。
     顺带把任务目标的方位也标上去 —— 否则在开阔空域找浮空平台
     只能靠雷达盲猜。
     ============================================================ */
  function drawCompass(ctx, W, H, p, world, S) {
    if (S && S.compass === false) return;

    var cx = W / 2;
    var top = U(8);
    var bandH = U(26);
    var halfW = Math.min(U(300), W * 0.24);
    var spanDeg = 100;                       // 指南针显示的总方位范围
    var degPerPx = spanDeg / (halfW * 2);

    // 水平分量过小时（接近垂直姿态）航向没有意义，直接用上一帧的近似值
    var hl = Math.sqrt(p.fwd.x * p.fwd.x + p.fwd.z * p.fwd.z);
    var hdg = p.heading === undefined ? 0 : p.heading;
    if (hl > 0.03) {
      hdg = Math.atan2(p.fwd.x / hl, p.fwd.z / hl) * 180 / Math.PI;
    }
    hdg = ((hdg % 360) + 360) % 360;
    p.heading = hdg;
    /* 罗盘读的是**真方位**：世界 +z 不一定指北，每一关在 mission.axis 里
       声明 +z 的真方位（见 missions.js 开头的说明）。p.heading 仍保留世界航向。 */
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

      ctx.strokeStyle = isCard ? GREEN : (isMaj ? 'rgba(79,224,138,0.65)' : 'rgba(79,224,138,0.30)');
      ctx.lineWidth = isCard ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top + bandH);
      ctx.lineTo(x, top + bandH - (isMaj ? 11 : 6));
      ctx.stroke();

      if (isMaj) {
        text(ctx, isCard ? CARD[dd / 90] : String(dd), x, top + 13,
          isCard ? GREEN : DIM, isCard ? 'bold 13px Consolas,monospace' : FS, 'center');
      }
    }

    // 任务目标方位标记
    var marks = [];
    if (world && (!S || S.targetMarkers !== false)) {
      if (world.targets) {
        for (var i = 0; i < world.targets.length; i++) {
          if (world.targets[i].alive && !farCell(world.targets[i], p)) marks.push(world.targets[i]);
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
      var col = (t.team === 2) ? '#8fa3b2' : (t.ttype === 'air' ? AMBER : '#a8bccb');
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(mx, top + bandH + 7);
      ctx.lineTo(mx - 5, top + bandH + 15);
      ctx.lineTo(mx + 5, top + bandH + 15);
      ctx.closePath();
      ctx.fill();
    }

    // 中心指针 + 航向读数
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(cx, top + bandH + 1);
    ctx.lineTo(cx - 6, top - 7);
    ctx.lineTo(cx + 6, top - 7);
    ctx.closePath();
    ctx.fill();

    text(ctx, ('00' + Math.round(hdg % 360)).slice(-3), cx, top + bandH + 30,
      AMBER, 'bold 13px Consolas,monospace', 'center');
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
      ctx.strokeStyle = GREEN; ctx.lineWidth = 1.6;
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
      ctx.strokeStyle = CY; ctx.lineWidth = 1.4;
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
    ctx.strokeStyle = DIM; ctx.lineWidth = 1.2;
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
    var hgt = Math.min(U(260), H * 0.32);
    var top = cy - hgt / 2;

    /* ---------- 左：空速 ----------
       距左边界的间距随缩放增大，但不超过屏宽的 15% ——
       这样把 HUD 调到最大时带子只会变粗，不会跑出左边界。
       位置从左边算起，而不是从屏幕中心算，也是同一个道理。 */
    var m = gap(132, W, 0.15);
    var x = m;
    tape(ctx, x, top, hgt, p.speed, 50, 200, 1, 'M/S', CY, 0.85);
    /* 大数字和刻度同一单位（m/s）。以前大数字是没标单位的 km/h，和刻度对不上，
       看着像速度读数和指针不一致 */
    text(ctx, p.speed.toFixed(0), x - 46, cy + 5, '#eaf4fb', FB, 'right');
    text(ctx, (p.speed * 3.6).toFixed(0) + ' KM/H · ' + (p.speed * 1.9438).toFixed(0) + ' KT', x - 46, cy + 21, DIM, FS, 'right');

    /* 引擎出力带与 FCS 舵量表不在这里 —— 它们挪到了雷达右侧，
       见 drawEnginePanel()。 */

    /* ---------- 右：高度 ---------- */
    var x2 = W - m;
    tape(ctx, x2, top, hgt, p.pos.y, 1000, 5000, -1, 'M', GREEN, 0.021);
    text(ctx, p.pos.y.toFixed(0), x2 + 46, cy + 5, '#eaf4fb', FB, 'left');
    text(ctx, (p.pos.y * 3.28084).toFixed(0) + ' FT', x2 + 46, cy + 21, DIM, FS, 'left');

    /* ---------- 右下：动压 Q（本作核心仪表）与过载 G ----------
       两个框并排坐在挂载俯视图正上方（Q 左、G 右）。以前 Q 框
       按高度带往下排，会压住 STORES 面板的上沿；再往下叠一个 G 框
       就整个盖在俯视图上了。所以改为从 hmiLayout 的 storeY 往上排。 */
    var L = hmiLayout(W, H);
    var qy = L.storeY - U(64);
    var gx = W - L.margin - 58;
    var qx = gx - 122;
    var q = p.q;
    var qCol = q < 12 ? RED : (q < 20 ? AMBER : GREEN);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(qx - 58, qy - 26, 116, 48);
    // 动压不足时标题闪成"舵面失效"—— 不另占一行
    var bl = (q < 12) && (Math.sin(performance.now() * 0.012) > 0);
    text(ctx, bl ? '▲ 舵面失效' : 'Q 动压', qx - 50, qy - 9, bl ? RED : DIM, FS, 'left');
    text(ctx, q.toFixed(1) + ' kPa', qx + 50, qy + 11, qCol, FB, 'right');

    // Q 条
    var k = M3.clamp(q / 60, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(qx - 50, qy + 16, 100, 5);
    ctx.fillStyle = qCol;
    ctx.fillRect(qx - 50, qy + 16, 100 * k, 5);
    // 12 kPa 警戒线
    ctx.fillStyle = RED;
    ctx.fillRect(qx - 50 + 100 * 0.2, qy + 14, 1.5, 9);

    /* 实时过载 G：由 stepAircraft 按实际加速度算（a.gNow），不是由杆量推出来的 ——
       所以低动压下拉满杆、表上也只有一两个 G，这正是"舵面失效"的手感。
       不设上限，只在超过 9G（人能扛的量级）时变色。 */
    var gy = qy;
    var gN = (p.gNow === undefined) ? 1 : p.gNow;
    var gCol = (gN > 9 || gN < -2) ? AMBER : GREEN;
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(gx - 58, gy - 26, 116, 48);
    text(ctx, 'G 过载', gx - 50, gy - 9, DIM, FS, 'left');
    text(ctx, gN.toFixed(1) + ' G', gx + 50, gy + 11, gCol, FB, 'right');

    // G 条：-3 … +12，从 0G 往两边长；1G 处一道基准线
    var G_LO = -3, G_HI = 12;
    var g0 = 100 * (0 - G_LO) / (G_HI - G_LO);
    var gk = 100 * (M3.clamp(gN, G_LO, G_HI) - G_LO) / (G_HI - G_LO);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(gx - 50, gy + 16, 100, 5);
    ctx.fillStyle = gCol;
    ctx.fillRect(gx - 50 + Math.min(g0, gk), gy + 16, Math.abs(gk - g0), 5);
    ctx.fillStyle = DIM;
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
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
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
        text(ctx, (v / (major >= 1000 ? 1000 : 1)).toFixed(major >= 1000 ? 1 : 0) + (major >= 1000 ? 'k' : ''),
          x + (side > 0 ? 18 : -18), y + 4, DIM, FS, side > 0 ? 'left' : 'right');
      }
    }

    // 当前值指针
    ctx.fillStyle = col;
    ctx.beginPath();
    if (side > 0) { ctx.moveTo(x, cy); ctx.lineTo(x - 13, cy - 7); ctx.lineTo(x - 13, cy + 7); }
    else { ctx.moveTo(x, cy); ctx.lineTo(x + 13, cy - 7); ctx.lineTo(x + 13, cy + 7); }
    ctx.closePath(); ctx.fill();

    text(ctx, label, x, top - 10, DIM, FS, 'center');
  }

  /* 油门轴 → THR 读数（%）。三段各自线性：
       减速板  油门 0 → THR_IDLE   读数 −25 → 0（青）
       军推    THR_IDLE → 1        读数 0 → 100
       加力    1 → THR_MAX         读数 100 → 125（琥珀）
     以前读数直接是"油门杆 × 100"，慢车停在 4%，看起来像还剩 4% 推力 ——
     其实飞行模型里没有推力，油门只决定一个目标速度，4% 就是慢车。
     减速板在物理上是开 / 关两态（油门低于 THR_IDLE 就全开），负数段只表示
     杆位，−5% 和 −25% 的减速效果一样。
     两个分界点必须与 game.js 的 THR_IDLE / THR_MAX 一致（smoke 有断言）。 */
  var THR_IDLE = 0.04, THR_MAX = 1.25;
  var THR_PCT_LO = -25, THR_PCT_HI = 125;
  function thrPercent(thr) {
    thr = M3.clamp(thr, 0, THR_MAX);
    if (thr < THR_IDLE) return THR_PCT_LO * (THR_IDLE - thr) / THR_IDLE;
    if (thr <= 1) return (thr - THR_IDLE) / (1 - THR_IDLE) * 100;
    return 100 + (thr - 1) / (THR_MAX - 1) * (THR_PCT_HI - 100);
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
    var col = brake ? CY : (ab ? AMBER : GREEN);
    var yMil = yOf(100), yIdle = yOf(0);

    // 加力区（100%–125%）、减速板区（−25%–0%）底色
    ctx.fillStyle = 'rgba(255,176,58,0.10)';
    ctx.fillRect(x - 5, top, 10, yMil - top);
    ctx.fillStyle = 'rgba(69,214,255,0.10)';                 // = CY
    ctx.fillRect(x - 5, yIdle, 10, y0 - yIdle);

    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
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
      if (isMaj) text(ctx, String(v), x - 18, y + 4, v > 100 ? AMBER : (v < 0 ? CY : DIM), FS, 'right');
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

    text(ctx, 'THR', x, top - 10, DIM, FS, 'center');
    // 读数固定在带子的垂直中心
    text(ctx, Math.round(pct) + '%', x + 24, top + hgt / 2 + 5, col, FB, 'left');
    if (brake) text(ctx, 'BRK', x, y0 + 16, CY, FS, 'center');
    else if (ab) text(ctx, 'A/B', x, y0 + 16, AMBER, FS, 'center');
  }


  /* ---------- 雷达右侧：引擎出力 + FCS 舵量表 ----------
     以前贴在空速带右边，正好压在屏幕左侧中段；现在和雷达并排坐在左下。
     竖向范围：底边停在武器面板那一行（GUN）之上，所以不论屏幕多窄都
     不会碰到它 —— GUN 是武器面板里唯一伸进左半屏的元素。
     雷达几何必须与 drawRadar 一致。 */
  function drawEnginePanel(ctx, W, H, p) {
    var R = Math.min(U(104), Math.min(W, H) * 0.13);
    var rcx = R + U(28), rcy = H - R - U(32);
    var ex = rcx + R + U(52);                         // 左侧要留给 0–100 刻度数字
    var y1 = Math.min(rcy + R, H - gap(74, H, 0.11) - U(48));
    var hgt = Math.min(R * 1.9, U(190));
    var top = y1 - hgt;
    thrTape(ctx, ex, top, hgt, p.throttle, p.ab, p.brake);
    ctrlGauges(ctx, ex + U(62), top, hgt, p);
    // 高 G：正在拉过载时给个明确的提示，掉速才不至于莫名其妙
    if (p.hiG) {
      var gcol = Math.sin(performance.now() * 0.02) > 0 ? RED : AMBER;
      text(ctx, 'HI-G', ex, top - U(30), gcol, FB, 'center');
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
    var gw = U(22);                           // 两根之间的间距
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
      ctx.strokeStyle = DIM; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yc - gh / 2); ctx.lineTo(x, yc + gh / 2);
      ctx.moveTo(x - 7, yc); ctx.lineTo(x + 7, yc);
      ctx.moveTo(x - 4, yc - gh / 2); ctx.lineTo(x + 4, yc - gh / 2);
      ctx.moveTo(x - 4, yc + gh / 2); ctx.lineTo(x + 4, yc + gh / 2);
      ctx.stroke();
      // 杆量条：从 0 往上下长；超过可用权限的部分（杆打满也给不出来）变琥珀
      var lim = v >= 0 ? A.up : A.dn;
      var sat = Math.abs(v) > 0.98 || Math.abs(v) > lim + 1e-3;
      ctx.fillStyle = sat ? AMBER : GREEN;
      var hh = gh / 2 * Math.abs(v);
      ctx.fillRect(x - 2, v >= 0 ? yc - hh : yc, 4, Math.max(1, hh));
      text(ctx, A.k, x, y1 + 16, DIM, FS, 'center');
    }
    text(ctx, 'FCS', x0 + gw, yc - gh / 2 - 10, DIM, FS, 'center');
  }

  /* ============================================================
     雷达（机头朝上）
     ============================================================ */
  function drawRadar(ctx, W, H, p, world) {
    // 雷达从"左下角"定位，半径受屏幕尺寸与缩放双重限制
    var R = Math.min(U(104), Math.min(W, H) * 0.13);
    var cx = R + U(28), cy = H - R - U(32);
    var range = 12000;

    /* 雷达"上方"跟着**镜头**的水平朝向走，不跟机头 —— 不真实，但玩家看的是镜头画面，
       雷达和画面对得上才好用（拉杆转弯时机头和镜头并不一致）。镜头近乎垂直时退回机头。 */
    var cam = Renderer.getCam();
    var hx = cam ? cam.fwd.x : p.fwd.x, hz = cam ? cam.fwd.z : p.fwd.z;
    var hl = Math.sqrt(hx * hx + hz * hz);
    if (hl < 0.05) { hx = p.fwd.x; hz = p.fwd.z; hl = Math.sqrt(hx * hx + hz * hz); }
    radarH.x = hl > 0.05 ? hx / hl : 0;
    radarH.z = hl > 0.05 ? hz / hl : 1;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(6,18,24,0.72)';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 距离环 + 方位线
    ctx.strokeStyle = 'rgba(79,224,138,0.20)'; ctx.lineWidth = 1;
    for (var k = 1; k <= 3; k++) {
      ctx.beginPath(); ctx.arc(cx, cy, R * k / 3, 0, Math.PI * 2); ctx.stroke();
    }
    /* 方位十字：南北、东西两根轴按**真方位**画，随雷达一起转。
       世界 +z 的真方位是 world.axis（与顶部罗盘同一个口径）。 */
    var axis = ((world && world.axis) || 0) * Math.PI / 180;
    var card = [['N', 0], ['E', 90], ['S', 180], ['W', 270]], pts = [];
    for (var ci = 0; ci < 4; ci++) {
      var b = card[ci][1] * Math.PI / 180 - axis;
      var u = radarDir(Math.sin(b), Math.cos(b));
      pts.push(u);
    }
    ctx.beginPath();
    ctx.moveTo(cx + pts[0].x * R, cy + pts[0].y * R); ctx.lineTo(cx + pts[2].x * R, cy + pts[2].y * R);
    ctx.moveTo(cx + pts[1].x * R, cy + pts[1].y * R); ctx.lineTo(cx + pts[3].x * R, cy + pts[3].y * R);
    ctx.stroke();

    // 扫描线
    var sweep = (performance.now() * 0.0014) % (Math.PI * 2);
    var grd = ctx.createLinearGradient(cx, cy, cx + Math.sin(sweep) * R, cy - Math.cos(sweep) * R);
    grd.addColorStop(0, 'rgba(79,224,138,0.30)');
    grd.addColorStop(1, 'rgba(79,224,138,0)');
    ctx.strokeStyle = grd; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(sweep) * R, cy - Math.cos(sweep) * R); ctx.stroke();

    // 目标
    drawBlips(ctx, cx, cy, R, range, p, world);

    /* 本机：中心一个小箭头，指向机头的水平方位。雷达跟镜头转以后，
       机头不一定朝上 —— 这个箭头告诉你飞机实际往哪飞。 */
    var nd = radarDir(p.fwd.x, p.fwd.z), nl = Math.sqrt(nd.x * nd.x + nd.y * nd.y);
    if (nl > 0.05) {
      var ux = nd.x / nl, uy = nd.y / nl, L0 = U(7);
      ctx.fillStyle = CY;
      ctx.beginPath();
      ctx.moveTo(cx + ux * L0, cy + uy * L0);
      ctx.lineTo(cx - ux * L0 * 0.6 - uy * L0 * 0.55, cy - uy * L0 * 0.6 + ux * L0 * 0.55);
      ctx.lineTo(cx - ux * L0 * 0.25, cy - uy * L0 * 0.25);
      ctx.lineTo(cx - ux * L0 * 0.6 + uy * L0 * 0.55, cy - uy * L0 * 0.6 - ux * L0 * 0.55);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = DIM; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    /* 量程标签挪到更下面：方位字母在圆外转一圈，转到正下方时不能和它叠在一起 */
    text(ctx, 'RDR 12KM', cx, cy + R + U(26), DIM, FS, 'center');
    /* 方位字母放在圆外，跟着轴转到各自的位置，但字本身保持正向（只移位置、不旋转） */
    for (ci = 0; ci < 4; ci++) {
      var lr = R + U(10);
      text(ctx, card[ci][0], cx + pts[ci].x * lr, cy + pts[ci].y * lr + U(4),
        ci === 0 ? AMBER : DIM, FS, 'center');
    }
  }

  /* 雷达的"上方"（镜头水平朝向，drawRadar 每帧更新）与世界方向 → 雷达单位向量（y 向下） */
  var radarH = { x: 0, z: 1 };
  function radarDir(dx, dz) {
    var rx = dx * radarH.z - dz * radarH.x;
    var ry = dz * radarH.z + dx * radarH.x;
    return { x: rx, y: -ry };
  }

  /* 调节单元每关头顶几十个：远处的不上 HUD（罗盘、雷达、目标框都一样），
     不然雷达边缘会排一圈灰点、屏幕上满是灰箭头。近了才需要看清它在哪。 */
  var CELL_HUD_RANGE2 = 10000 * 10000;
  function farCell(t, p) {
    return t.model === 'cell' && M3.dist2(t.pos, p.pos) > CELL_HUD_RANGE2;
  }

  function radarXY(p, wp, cx, cy, R, range) {
    var dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
    var fx = radarH.x, fz = radarH.z;              // 镜头朝向（见 drawRadar）
    var rx = dx * fz - dz * fx;
    var ry = dz * fz + dx * fx;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > range) { rx *= range / d; ry *= range / d; }
    return { x: cx + rx / range * R, y: cy - ry / range * R, out: d > range };
  }

  function drawBlips(ctx, cx, cy, R, range, p, world) {
    var i, s;

    /* 电子战压制：雷达屏幕上出雪花（设定 7.3）。

       丢的是**信息**，不是飞机。雷达光点在这里出雪花；
       目标框另有一套（drawTargets 读 Ent.jamState：只看 suppressed，
       压得重时远处的框闪烁 / 消失）。这里两个来源合并成一个"脏度"：

         suppressed  被敌方干扰机压制（下游的烧穿吊舱）
         ewPower     自己正在开机干扰别人 —— 干扰是双向的 */
    var jam = Math.max(p.suppressed || 0, (p.ewPower || 0) * 0.8);

    // 导弹
    for (i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive) continue;
      s = radarXY(p, m.pos, cx, cy, R, range);
      ctx.fillStyle = m.team === p.team ? CY : RED;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // 飞机
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e === p) continue;
      var friendly = (e.team === p.team);
      /* 友军也会丢：它自己在压制场里时，数据链报来的位置一样不可靠（Ent.jamPress）。 */
      var jamE = friendly ? Ent.jamPress(p, e) : jam;
      if (jamE > 0.02 && Math.random() < jamE * 0.55) continue;
      s = radarXY(p, e.pos, cx, cy, R, range);
      if (jamE > 0.02) {
        var jr = jamE * 9;
        s.x += (Math.random() - 0.5) * jr;
        s.y += (Math.random() - 0.5) * jr;
      }
      ctx.fillStyle = friendly ? GREEN : (e.team > 1 ? 'rgba(160,170,178,0.8)' : RED);
      if (friendly) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 4.5); ctx.lineTo(s.x + 4, s.y + 3.5); ctx.lineTo(s.x - 4, s.y + 3.5);
        ctx.closePath(); ctx.fill();
      }
    }
    // 任务目标
    if (world.targets) {
      for (i = 0; i < world.targets.length; i++) {
        var t = world.targets[i];
        if (!t.alive || farCell(t, p)) continue;
        s = radarXY(p, t.pos, cx, cy, R, range);
        /* 舰船和海上平台按阵营上色（与飞机同一套：友军绿、敌方红、中立灰）。
           以前一律灰色，打舰队战时分不清哪条是自己的 */
        var isShip = !!(t.ship || t.platform);
        ctx.strokeStyle = (t.team === 2) ? '#8fa3b2'
          : isShip ? (t.team === p.team ? GREEN : RED)
          : (t.ttype === 'air' ? AMBER : '#8fa3b2');
        ctx.lineWidth = 1.4;
        ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      }
    }
  }

  /* ============================================================
     威胁环（RWR）
     ============================================================ */
  /* ============================================================
     俯仰刻度（Pitch Ladder）

     一组很淡的水平刻线，标出机头相对地平线的夹角。
     追尾视角下相机不跟随滚转，所以这些线永远是水平的 ——
     它们只随俯仰上下移动，正好补上"我现在到底是在抬头还是低头"。

     刻度线的位置不是硬算的，而是把一个"相对机头仰角为 d 的远方点"
     投影到屏幕上 —— 这样它自动跟随视场角与镜头设置，
     不用另写一套投影公式。
     ============================================================ */
  function drawPitchLadder(ctx, W, H, cam, p, S) {
    if (S && S.pitchLadder === false) return;

    var cx = W / 2;
    /* 水平参考取**镜头**的朝向而不是机头：机头翻过竖直时它的水平投影会塌缩，
       刻度整套消失；镜头俯仰有限位（键盘直控 89°，鼠标引导 90° − 半视场），永远有方向。 */
    var horiz = M3.V(cam.fwd.x, 0, cam.fwd.z);
    var hl = M3.len(horiz);
    // 镜头接近竖直（≈ 87.7° 以上），水平参考没有意义
    if (hl < 0.04) return;
    horiz = M3.mul(horiz, 1 / hl);

    var R = 24000;                         // 投影用的远距离（在 far 之内）

    /* 只标 ±40°。

       以前是 ±75°，结果刻线从屏幕顶端一直铺到底端 —— 这个刻度是用来
       判断"现在是抬头还是低头"的，超出 ±40° 的部分既读不出来、
       又把画面切得七零八落。范围收到这里之后，垂直方向只占中间约
       三分之二，四周留出干净的视野给目标与警告。 */
    var LIM = 40;
    /* 镜头大仰角 / 大俯角时，往视线那一侧把刻度延伸到 ±85° ——
       否则镜头一越过 40° + 半个视场，整套刻度会一下子全部出画，
       画面上什么参照都没有。 */
    var camP = Math.asin(M3.clamp(cam.fwd.y, -1, 1)) * 180 / Math.PI;
    var LO = camP < -25 ? -85 : -LIM, HI = camP > 25 ? 85 : LIM;

    for (var d = LO; d <= HI; d += 5) {
      var ang = d * Math.PI / 180;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var dir = M3.V(horiz.x * ca, sa, horiz.z * ca);

      var s = M3.project(cam, M3.add(p.pos, M3.mul(dir, R)));
      if (!s) continue;
      // 上下各留 8% 的边距，别顶到屏幕边缘
      if (s.y < H * 0.08 || s.y > H * 0.92) continue;

      var zero = (d === 0);
      var ad = Math.abs(d);
      var halfW = zero
        ? W * 0.135
        : Math.max(W * 0.022, W * 0.082 - ad * W * 0.0013);

      ctx.strokeStyle = zero
        ? 'rgba(79,224,138,0.40)'
        : 'rgba(79,224,138,' + Math.max(0.06, 0.20 - ad * 0.0016).toFixed(3) + ')';
      ctx.lineWidth = zero ? 1.6 : 1;

      // 中央留缺口，免得压住机头参考与速度矢量
      var gapw = zero ? 0 : W * 0.022;
      ctx.beginPath();
      if (gapw > 0) {
        ctx.moveTo(cx - halfW, s.y); ctx.lineTo(cx - gapw, s.y);
        ctx.moveTo(cx + gapw, s.y); ctx.lineTo(cx + halfW, s.y);
      } else {
        ctx.moveTo(cx - halfW, s.y); ctx.lineTo(cx + halfW, s.y);
      }
      ctx.stroke();

      // 每 10° 标一次数字
      if (d % 10 === 0 && !zero) {
        var lbl = String(ad);
        text(ctx, lbl, cx - halfW - 7, s.y + 4, 'rgba(79,224,138,0.40)', FS, 'right');
        text(ctx, lbl, cx + halfW + 7, s.y + 4, 'rgba(79,224,138,0.40)', FS, 'left');
      }
    }
  }

  /* ============================================================
     威胁告警的数据（导弹逼近 / 雷达照射）

     RWR 环上那两个小字，在真正忙起来的时候根本看不见 ——
     而"有东西正朝你来"是这个游戏里最不能错过的一条信息。
     所以单独放大一份进屏幕中上方的告警栈（drawAlerts）；环上仍然保留方位点，
     两者是互补的：一个告诉你"有威胁"，一个告诉你"威胁在哪个方向"。
     ============================================================ */
  function threatState(p, world) {
    var inb = 0, minD = 1e9, lit = false;
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive) continue;
      var inc = (m.target === p) ||
        (M3.dist(m.pos, p.pos) < 3000 && m.team !== p.team);
      if (!inc) continue;
      inb++;
      var d = M3.dist(m.pos, p.pos);
      if (d < minD) minD = d;
    }
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (e.alive && e.team !== p.team && e.target === p) { lit = true; break; }
    }
    return { inb: inb, minD: minD, lit: lit };
  }

  function drawThreatRing(ctx, W, H, p, world) {
    // RWR 环现在挂在挂载俯视图的左边（见 hmiLayout）
    var L = hmiLayout(W, H);
    var R = L.rwrR;
    var cx = L.rwrX, cy = L.rwrY;
    ctx.strokeStyle = 'rgba(255,176,58,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.stroke();

    var any = false, msIn = false;
    var hl = Math.sqrt(p.fwd.x * p.fwd.x + p.fwd.z * p.fwd.z);
    var fx = hl > 0.05 ? p.fwd.x / hl : 0, fz = hl > 0.05 ? p.fwd.z / hl : 1;

    function plot(rel, col) {
      var dx = rel.x, dz = rel.z;
      var rx = dx * fz - dz * fx;
      var ry = dz * fz + dx * fx;
      var l = Math.sqrt(rx * rx + ry * ry) || 1;
      var px = cx + rx / l * R, py = cy - ry / l * R;
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    }

    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive) continue;
      var incoming = false;
      if (m.target === p) incoming = true;
      else if (M3.dist(m.pos, p.pos) < 3000 && m.team !== p.team) incoming = true;
      if (!incoming) continue;
      any = true;
      var d = M3.dist(m.pos, p.pos);
      if (d < 2600) msIn = true;
      plot(M3.sub(m.pos, p.pos), d < 2600 ? RED : AMBER);
    }

    // 雷达照射告警：谁在锁定我
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (!e.alive || e.team === p.team) continue;
      if (e.target === p) { any = true; plot(M3.sub(e.pos, p.pos), 'rgba(255,77,77,0.85)'); }
    }
    /* 被对空雷达截获（world.detected，关卡按高度等条件判）也算 SPIKE：
       和"有人锁我"合并成一个状态。截获没有具体的雷达位置，
       就把带舰空 / 地空弹的敌方舰船、阵地当作照射源画上去 */
    if (world.detected) {
      any = true;
      for (i = 0; i < world.targets.length; i++) {
        var st = world.targets[i];
        if (st.alive && st.weapon && st.team !== p.team && st.team !== 2) plot(M3.sub(st.pos, p.pos), 'rgba(255,176,58,0.85)');
      }
    }

    // 标签放环**上方** —— 环的底边已经贴到页边距了，写下面会出屏
    text(ctx, 'RWR', cx, cy - R - 26, 'rgba(255,176,58,0.5)', FS, 'center');
    if (msIn) {
      var bl = Math.sin(performance.now() * 0.016) > 0;
      if (bl) {
        text(ctx, '▲ MISSILE 导弹逼近', cx, cy - R - 12, RED, 'bold 13px Consolas,monospace', 'center');
      }
    } else if (any) {
      text(ctx, '▲ SPIKE 被照射', cx, cy - R - 12, AMBER, FS, 'center');
    }
  }

  /* ============================================================
     机炮提前量准星

     弹丸有飞行时间，打移动目标必须往前带 —— 这一点是真实的，
     但不该让玩家在座舱里心算三角函数。所以把"该瞄哪里"直接画出来。

     算法和 AI 用的 leadTo() 完全一致：目标位置 + 目标速度 × 弹丸飞行时间。
     只是这里不自动瞄准，而是把它标出来，玩家自己把机头摆上去 ——
     保留了手动瞄准的手感，去掉了心算提前量的负担。

     一选中目标就画，不等导弹锁定 —— 锁定时间取决于手上那枚弹，
     和机炮无关。超出机炮有效射程时画成淡虚线（"往这儿带，但还够不着"），
     进入射程才变实线。
     ============================================================ */
  function drawLeadReticle(ctx, W, H, cam, p) {
    var t = p.target;
    if (!t || !t.alive) return;
    if (!p.ac) return;

    var gunW = WEAPONS[p.gun];
    if (!gunW || gunW.kind !== 'gun') return;

    var dist = M3.dist(t.pos, p.pos);
    var gunRange = (p.pos.y > 18000 ? gunW.highRange : gunW.range) * 0.95;
    var inRange = dist <= gunRange;

    var tv = t.vel || M3.V(0, 0, 0);
    var tGo = dist / gunW.speed;
    var aim = M3.add(t.pos, M3.mul(tv, tGo));

    var s = M3.project(cam, aim);
    if (!s) return;

    // 距离越近圈越小，暗示"该更精确了"
    var r = 8 + M3.clamp(dist / 1800, 0, 1) * 5;

    ctx.strokeStyle = inRange ? 'rgba(255,228,150,0.70)' : 'rgba(255,228,150,0.50)';
    ctx.lineWidth = 1.4;
    if (!inRange) ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 圆心小点：真正的瞄准点
    ctx.fillStyle = inRange ? 'rgba(255,244,200,0.92)' : 'rgba(255,244,200,0.55)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ============================================================
     目标框 / 屏幕外指示 / NEZ
     ============================================================ */
  function drawTargets(ctx, W, H, cam, p, world) {
    var list = [];
    var i;
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      // 友军也要进列表 —— 以前这里过滤掉了同队，于是僚机在视野里
      // 完全没有标记，编队飞行时根本找不到自己的二号三号机。
      if (e.alive && e !== p) list.push(e);
    }
    if (world.targets) {
      for (i = 0; i < world.targets.length; i++) {
        if (world.targets[i].alive && !farCell(world.targets[i], p)) list.push(world.targets[i]);
      }
    }

    // 屏外标记的落点每帧只算一次 —— 与目标数量无关
    var offRect = offscreenRect(W, H, p);

    for (i = 0; i < list.length; i++) {
      var t = list[i];
      /* 被压制：远处的敌方目标框闪烁（flicker）或消失（hidden），屏外标记同样处理。
         判据在 Ent.jamState —— 与锁定、F 键候选同一个口径。 */
      if (!Ent.jamShown(p, t, world.time || 0)) continue;
      var s = M3.projectUnclamped(cam, t.pos);
      var dist = M3.dist(p.pos, t.pos);
      var isAlly = (t.team === p.team);
      var isLock = (p.target === t);

      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        drawOffscreen(ctx, W, H, cam, t, isLock, dist, isAlly, offRect, isLock && p.locked);
        continue;
      }

      if (isAlly) {
        drawAllyMark(ctx, s, t, dist);
      } else {
        /* 锁定时只画大框：大框自己带呼号 / 机型 / 距离 / 高度差，
           两份标签叠在一起反而谁都读不清。未锁定画基础框。
           中立（team 2）用灰色 —— 它不是敌人，红色会让人想去打它。 */
        if (isLock) drawLockBox(ctx, s, t, p, dist, world);
        else drawPlainMark(ctx, s, t, dist, t.team > 1);
      }
    }
  }

  /* ============================================================
     激光照射状态（**当前休眠**：没有任何武器用 seeker: 'laser'）

     PEJ-30 已改成无制导，所以下面两个分支都不会触发。
     留着是为了将来给某件弹填上 'laser' 时，HUD 反馈能立刻跟上 ——
     没有这段提示，玩家不会知道有"保持照射"这回事。

     激光制导的核心操作是"投放之后继续保持照射"：弹每一帧都在问
     载机"你还在照着目标吗"，机头一偏出 25° 它就不再修正，
     之后只是一块自由落体的铁。

     这件事如果不显示出来，玩家根本不知道有这回事，
     只会觉得"这炸弹有时候准有时候不准"。所以两段都要给：

       投放前 —— 目标框下方写照射进度（它和锁定环是同一个量）
       投放后 —— 屏幕下缘一条常驻状态条，直接告诉他照射还在不在
     ============================================================ */
  function drawLaserStatus(ctx, W, H, p, world) {
    var w = WEAPONS[p.special];

    // ---- 投放前：手里拿着激光弹，而且已经锁上了 ----
    if (w && w.seeker === 'laser' && p.target && p.target.alive) {
      var s = M3.projectUnclamped(Renderer.getCam(), p.target.pos);
      if (!s.behind && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        var ready = p.lockProgress >= 1;
        text(ctx, ready ? '照射中' : '照射 ' + Math.round(p.lockProgress * 100) + '%',
          s.x, s.y + 32, ready ? AMBER : 'rgba(255,176,58,0.55)', FS, 'center');
      }
    }

    // ---- 投放后：自己的激光弹还在飞 ----
    var flying = null;
    if (world && world.missiles) {
      for (var i = 0; i < world.missiles.length; i++) {
        var m = world.missiles[i];
        if (m.alive && m.owner === p && m.w && m.w.seeker === 'laser') {
          flying = m;
          break;
        }
      }
    }
    if (!flying) return;

    var y = H * 0.87;
    if (flying.laserLost) {
      text(ctx, '✕ 照射中断 — 弹已停止修正', W / 2, y, RED, FB, 'center');
      text(ctx, '把机头转回目标可重新照射', W / 2, y + 16,
        'rgba(185,200,212,0.72)', FS, 'center');
    } else {
      text(ctx, '◎ 照射保持中', W / 2, y, AMBER, FB, 'center');
    }
  }

  /* ============================================================
     友军标记

     绿色在 HUD 里的语义本来就是"友军"，正好用上。
     画法和敌方刻意区分：敌方是**实线整框**，友军是**四角短线**，
     而且更细、更暗 —— 远处一眼扫过不会混淆。

     呼号优先，没有呼号就退到机型。
     ============================================================ */
  function drawAllyMark(ctx, s, t, dist) {
    var col = 'rgba(90,168,255,0.70)';
    var c = 9, g = c * 0.45;

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(s.x - c, s.y - c + g); ctx.lineTo(s.x - c, s.y - c); ctx.lineTo(s.x - c + g, s.y - c);
    ctx.moveTo(s.x + c - g, s.y - c); ctx.lineTo(s.x + c, s.y - c); ctx.lineTo(s.x + c, s.y - c + g);
    ctx.moveTo(s.x + c, s.y + c - g); ctx.lineTo(s.x + c, s.y + c); ctx.lineTo(s.x + c - g, s.y + c);
    ctx.moveTo(s.x - c + g, s.y + c); ctx.lineTo(s.x - c, s.y + c); ctx.lineTo(s.x - c, s.y + c - g);
    ctx.stroke();

    if (dist > 14000) return;

    var distTxt = dist < 1000
      ? Math.round(dist) + ' M'
      : (dist / 1000).toFixed(1) + ' KM';
    var nm = t.label || (t.ac ? (t.ac.name + ' ' + t.ac.cn) : (t.name || '僚机'));
    text(ctx, nm, s.x + c + 6, s.y - c + 8, col, FS, 'left');
    text(ctx, distTxt, s.x + c + 6, s.y - c + 21, 'rgba(130,170,215,0.60)', FS, 'left');

    /* 僚机的当前指令。

       1/2/3 这三条指令长期对无人僚机无效（见 docs/systems/ai.md），
       所以玩家按下去之后看不到任何变化。现在指令真的生效了，
       就得有地方看得见它 —— 顺带把"数据链中断"这个降级状态
       也画出来：那是强对抗环境下无人机转入自主防御的标志。 */
    if (t.ai && t.wingIdx) {
      var jammed = t.suppressed > 0.35;
      var cmdTxt = t.ai.cmd === 'spread' ? 'SPREAD 散开'
        : (t.ai.cmd === 'cover' ? 'COVER 掩护' : 'FOCUS 集火');
      text(ctx, jammed ? 'LINK LOST 数据链中断' : cmdTxt,
        s.x + c + 6, s.y - c + 34,
        jammed ? '#ff8b2a' : 'rgba(130,170,215,0.60)', FS, 'left');
    }
  }

  /* ============================================================
     未锁定的目标标记
     红框旁边照样写清"谁在开、开的是什么" —— 一眼扫过去也要能
     判断该先打谁。标签只在较近时才画，否则满屏都是字。
     ============================================================ */
  function drawPlainMark(ctx, s, t, dist, neutral) {
    var isGnd = t.kind === 'target';
    var sz = isGnd ? 8 : 11;

    /* 敌方一律红色，不分空地。

       地面目标原来用灰蓝 rgba(143,163,178) —— 那是 HUD 里"一般说明文字、
       距离数字"用的同一个色系，读起来像中立物体，玩家会以为浮台不能打。
       它们确实是敌方设施，就该和敌机同色。

       尺寸仍然保留差别（地面设施画小一点）：那是**识别**用的，
       告诉你"这是个固定设施"，不是用来区分敌我的。 */
    var col = neutral ? 'rgba(160,170,178,0.62)' : 'rgba(255,77,77,0.68)';

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2);

    if (dist > 12000) return;      // 太远的只留框

    // 相对本机的距离 —— 未锁定也要看得到，否则没法判断该不该追
    var distTxt = dist < 1000
      ? Math.round(dist) + ' M'
      : (dist / 1000).toFixed(1) + ' KM';
    var dim = 'rgba(185,200,212,0.62)';

    // 地面设施只有名字，没有呼号也没有机型
    if (isGnd && !t.shipClass) {
      text(ctx, t.label || t.name || '海面设施',
        s.x + sz + 7, s.y - sz + 8, col, FS, 'left');
      text(ctx, distTxt, s.x + sz + 7, s.y - sz + 21, dim, FS, 'left');
      return;
    }

    /* 空中目标：第一行机型（认机 —— 对火控来说这才是要紧的），
       第二行呼号（风味信息，压暗），最后一行距离。以前呼号在前。 */
    /* 两支海军的船同一格式：第一行舰级，第二行呼号 */
    var acTxt = t.ac ? (t.ac.name + ' ' + t.ac.cn) : (t.shipClass || null);
    var line1 = acTxt || t.label || t.name || '';
    var line2 = acTxt && t.label ? t.label : null;

    var tx = s.x + sz + 7, ty = s.y - sz + 8;
    text(ctx, line1, tx, ty, col, FS, 'left');
    var ly = ty + 13;
    if (line2) {
      text(ctx, line2, tx, ly, dim, FS, 'left');
      ly += 13;
    }
    text(ctx, distTxt, tx, ly, dim, FS, 'left');
  }

  /* 舰种：spawnShip 写在 t.shipCls 上；不是走 spawnShip 生成的舰船按模型回查 SHIPS */
  var SHIP_CLS = null;
  function shipClsOf(t) {
    if (t.shipCls) return t.shipCls;
    if (!SHIP_CLS) {
      SHIP_CLS = {};
      for (var i = 0; i < SHIPS.length; i++) SHIP_CLS[SHIPS[i].model] = SHIPS[i].cls;
    }
    return SHIP_CLS[t.model] || null;
  }

  function drawLockBox(ctx, s, t, p, dist, world) {
    var w = 30, h = 30;
    if (t.kind === 'target') { w = 46; h = 34; }

    /* 发射包线分三档，框的颜色跟着走：

         淡橙  最大射程之外 —— 打出去够不着
         橙色  最大射程之内 —— 能追上，但目标掉头还能跑掉
         红色  不可逃逸区（NEZ）—— 发射就有意义

       对面制导弹（对地 / 对海）也有包线：射程外 / 射程内 / 最佳射程（见 computeEnvelope）。
       炸弹、火箭等无制导的没有，一律按橙色。
       **不要用绿色**。绿色在 HUD 里的语义是"友军 / 正常状态"，
       拿它标一个敌人，玩家会下意识以为那是友机 —— 这比颜色突变更糟。 */
    var env = computeEnvelope(p, t);
    var inNez = !!env && dist < env.nez;
    var outMax = !!env && dist > env.rmax;
    var FAR = 'rgba(255,176,58,0.45)';
    ctx.strokeStyle = inNez ? RED : (outMax ? FAR : AMBER);
    ctx.lineWidth = inNez ? 2.4 : 2;

    // 四角括号
    var c = 9;
    var x0 = s.x - w, y0 = s.y - h, x1 = s.x + w, y1 = s.y + h;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0);
    ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + c);
    ctx.moveTo(x1, y1 - c); ctx.lineTo(x1, y1); ctx.lineTo(x1 - c, y1);
    ctx.moveTo(x0 + c, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - c);
    ctx.stroke();

    /* 已锁定：四角括号变成双层（内侧再加一圈短角），锁定环消失。
       不换颜色 —— 框的颜色已经在表达发射包线了。 */
    if (p.locked) {
      var g2 = 5, c2 = 6;
      var u0 = x0 + g2, v0 = y0 + g2, u1 = x1 - g2, v1 = y1 - g2;
      ctx.beginPath();
      ctx.moveTo(u0, v0 + c2); ctx.lineTo(u0, v0); ctx.lineTo(u0 + c2, v0);
      ctx.moveTo(u1 - c2, v0); ctx.lineTo(u1, v0); ctx.lineTo(u1, v0 + c2);
      ctx.moveTo(u1, v1 - c2); ctx.lineTo(u1, v1); ctx.lineTo(u1 - c2, v1);
      ctx.moveTo(u0 + c2, v1); ctx.lineTo(u0, v1); ctx.lineTo(u0, v1 - c2);
      ctx.stroke();
      // 框正上方写 LOCK，与框下方的 IN RNG / NEZ 上下对应
      text(ctx, 'LOCK', s.x, y0 - 6, ctx.strokeStyle, 'bold 12px Consolas,monospace', 'center');
    }

    // 目标速度矢量线
    if (t.kind === 'air' && t.fwd) {
      ctx.strokeStyle = 'rgba(79,224,138,0.7)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + t.fwd.x * 34, s.y - t.fwd.y * 34);
      ctx.stroke();
    }

    /* 数据块。行高统一由 ly 递推 —— 之前每一行都写死 y 偏移，
       中间插一行就得手工挪后面所有的数字。 */
    var tx = s.x + w + 8, ty = s.y - h;
    var label = t.label || (t.name || '目标');
    // 数据块的颜色跟着框走，保持一致
    var col = inNez ? RED : (outMax ? FAR : AMBER);

    /* 第一行机型代号（粗体，框色）—— 效仿皇牌空战，红框旁边直接写清那是什么飞机，
       用 cn（中文名）而不是 nick（英文绰号）。对火控来说认机型才是要紧的；
       呼号是风味信息，放第二行、用普通字重。以前呼号在前。 */
    var ly = ty + 10;
    if (t.ac || t.shipClass) {
      text(ctx, t.ac ? (t.ac.name + ' ' + t.ac.cn) : t.shipClass, tx, ly, col, 'bold 12px Consolas,monospace', 'left');
      ly += 14;
      if (t.label) { text(ctx, t.label, tx, ly, col, FS, 'left'); ly += 14; }
    } else {
      text(ctx, label, tx, ly, col, 'bold 12px Consolas,monospace', 'left');
      ly += 14;
    }

    text(ctx, (dist / 1000).toFixed(2) + ' KM', tx, ly, DIM, FS, 'left');
    ly += 14;

    if (t.kind === 'air') {
      var dh = t.pos.y - p.pos.y;
      text(ctx, (dh >= 0 ? '+' : '') + dh.toFixed(0) + ' M', tx, ly, DIM, FS, 'left');
      ly += 14;
      // 目标动压
      if (t.q !== undefined) {
        text(ctx, 'Q ' + t.q.toFixed(0), tx, ly, t.q < 12 ? AMBER : DIM, FS, 'left');
        ly += 14;
      }
    } else {
      // 舰船写舰种（SHIPS[].cls）；其余按浮空 / 海面设施
      var scls = shipClsOf(t);
      text(ctx, scls ? (t.platform ? '海上平台 · ' : '水面舰船 · ') + scls : (t.ttype === 'air' ? '浮空平台' : '海面设施'), tx, ly, DIM, FS, 'left');
      ly += 14;
    }

    /* 包线状态写在框的**正下方**居中：它是"现在能不能打"的判断，
       该和框本身挨在一起，而不是混在右侧的数据列里。
       让开锁定进度环（半径 max(w,h)+10）。 */
    var envY = s.y + Math.max(w, h) + 24;
    if (inNez) {
      text(ctx, 'NEZ', s.x, envY, RED, 'bold 12px Consolas,monospace', 'center');
    } else if (env && !outMax) {
      text(ctx, 'IN RNG', s.x, envY, AMBER, 'bold 12px Consolas,monospace', 'center');
    }

    /* 锁定进度环：
         锁定中（在锥内、射程内）   琥珀实线，往前走
         锁不了（锥外或射程外）     暗色虚线，进度往回掉 —— 一眼看出"现在不在锁"
         已锁定                     不画（改由上面的双层角框表示） */
    if (!p.locked) {
      var rr = Math.max(w, h) + 10;
      ctx.save();
      if (p.lockOk) { ctx.strokeStyle = AMBER; ctx.lineWidth = 3; }
      else { ctx.strokeStyle = 'rgba(255,176,58,0.38)'; ctx.lineWidth = 2; if (ctx.setLineDash) ctx.setLineDash([4, 4]); }
      ctx.beginPath();
      if (p.lockOk || p.lockProgress > 0.01) {
        ctx.arc(s.x, s.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(p.lockOk ? 0 : 1, p.lockProgress));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ============================================================
     导弹视场提示（常驻）

     拿着制导武器就一直画，没有出现 / 消失的条件 —— 只换样式：
       没有目标                       暗色虚线
       有目标，但在锥外或锁定距离外   淡橙虚线
       目标在锥内且在锁定距离内       红色实线（能锁）
     对空弹：机头周围的圆，半径 = 锁定锥；圆比屏幕还大就不画（大离轴弹）。
     对面弹：锥只量水平方位，在地平线附近画两道短竖线标出左右边界。
     锥宽的弹，圆多数时候整个在画面外，不会增加画面负担。
     ============================================================ */
  function drawConeCue(ctx, W, H, cam, p) {
    var w = WEAPONS[p.special];
    if (!w || !w.seeker || w.seeker === 'none' || w.unguided || !w.lockCone) return;
    var cone = p.lockCone || w.lockCone;
    var t = p.target && p.target.alive ? p.target : null;
    var hot = !!(t && p.lockInCone && p.lockInRange);
    ctx.save();
    ctx.strokeStyle = hot ? RED : (t ? 'rgba(255,176,58,0.42)' : 'rgba(150,170,180,0.22)');
    ctx.lineWidth = hot ? 1.6 : 1.4;
    if (!hot && ctx.setLineDash) ctx.setLineDash([6, 6]);
    if (w.target === 'air') {
      var bs = M3.project(cam, M3.add(p.pos, M3.mul(p.fwd, 2000)));
      var r = cam.focal * Math.tan(Math.min(1.45, cone));
      if (bs && r < Math.max(W, H)) {
        ctx.beginPath(); ctx.arc(bs.x, bs.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      var hx = p.fwd.x, hz = p.fwd.z, hl = Math.sqrt(hx * hx + hz * hz);
      if (hl > 0.05) {
        hx /= hl; hz /= hl;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var a = sgn * cone, ca = Math.cos(a), sa = Math.sin(a);
          // 绕世界竖轴转 a：方位边界的方向，取远处海平面附近的一点
          var dx = hx * ca + hz * sa, dz = -hx * sa + hz * ca;
          var q = M3.project(cam, M3.V(p.pos.x + dx * 20000, Math.max(0, p.pos.y - 3000), p.pos.z + dz * 20000));
          if (!q) continue;
          ctx.beginPath(); ctx.moveTo(q.x, q.y - U(22)); ctx.lineTo(q.x, q.y + U(22)); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** 点在多边形内（射线法）。poly 是 [[x,z], ...] 数组，pt 是 [x,z]。 */
  function pointInPolygon(pt, poly) {
    var x = pt[0], z = pt[1], inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ============================================================
     精确制导炸弹的动态瞄准圈（泪滴形，5.3 第 3 条）

     拿着带弹翼的精确制导炸弹（ballistic + fin、无 glide，PEJ-14 之类）时，
     把弹翼能修正到的落点可达区域投影到屏幕上画成泪滴圈：
       后端（最远）= 自然抛物线落点（画一个 pipper）
       往前张开 = 弹翼能下压 / 横修到的范围
     目标（地面）套进圈内且已锁定 = 物理上必中。圈随本机高度、速度、俯仰
     实时变化：高、快时圈大，低、慢时圈小。

     和空空弹视场圈一样，落点按**机头朝向**投影（M3.project 同一套），
     不是按屏幕朝向 —— 圈在画面上跟着机头走，而不是跟着镜头走。
     ============================================================ */
  function drawFootprint(ctx, W, H, cam, p) {
    var w = WEAPONS[p.special];
    if (!w || !w.fin || !w.ballistic) return;

    /* 可达区域每 0.3 s 重算一次（一次要跑十几份弹道），按速度 / 高度变化节流。 */
    var now = performance.now();
    var c = p.__fp;
    if (!c || c.w !== w.id || now - c.at > 300 ||
        Math.abs((p.speed || 0) - c.spd) > 50 || Math.abs(p.pos.y - c.y) > 300) {
      c = p.__fp = { w: w.id, at: now, spd: p.speed || 0, y: p.pos.y,
        fp: Ent.finFootprint(w, { pos: p.pos, fwd: p.fwd, speed: (p.speed || 0) + 70 }) };
    }
    var fp = c.fp;
    if (!fp) return;

    /* 投影：natural + 边界点（地面 y=0 → 屏幕）。 */
    var nat = M3.project(cam, M3.V(fp.natural.x, 0, fp.natural.z));
    var scr = [];
    for (var i = 0; i < fp.points.length; i++) {
      var q = M3.project(cam, M3.V(fp.points[i].x, 0, fp.points[i].z));
      if (q) scr.push(q);
    }
    if (!nat || scr.length < 3) return;

    /* 圈内必中：目标（地面）在世界坐标里落进可达区域多边形，且已锁定。 */
    var t = p.target && p.target.alive ? p.target : null;
    var poly = [[fp.natural.x, fp.natural.z]];
    for (i = 0; i < fp.points.length; i++) poly.push([fp.points[i].x, fp.points[i].z]);
    var hot = !!(t && t.kind === 'target' && p.locked &&
      pointInPolygon([t.pos.x, t.pos.z], poly));

    ctx.save();
    ctx.strokeStyle = hot ? RED : 'rgba(255,176,58,0.55)';
    ctx.lineWidth = hot ? 2 : 1.4;
    if (!hot && ctx.setLineDash) ctx.setLineDash([6, 5]);
    /* 泪滴轮廓：natural → 左 / 前（下压）/ 右边界 → 回到 natural */
    ctx.beginPath();
    ctx.moveTo(nat.x, nat.y);
    for (i = 0; i < scr.length; i++) ctx.lineTo(scr[i].x, scr[i].y);
    ctx.closePath();
    if (hot) { ctx.fillStyle = 'rgba(255,80,60,0.10)'; ctx.fill(); }
    ctx.stroke();
    ctx.setLineDash([]);

    /* 自然落点 pipper：一个小圆 + 十字，标"不修正也能落到这里"。 */
    ctx.beginPath();
    ctx.arc(nat.x, nat.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nat.x - 6, nat.y); ctx.lineTo(nat.x + 6, nat.y);
    ctx.moveTo(nat.x, nat.y - 6); ctx.lineTo(nat.x, nat.y + 6);
    ctx.stroke();
    ctx.restore();
  }

  /** 发射包线：{ rmax, nez }，非对空弹给 null。

     rmax  导弹动力段能追上**按当前航向飞**的目标的距离
     nez   目标立刻掉头逃逸也甩不掉的距离（不可逃逸区）

     两者都不超过锁定距离 —— 锁不上的东西谈不上射程。 */
  function computeEnvelope(p, t) {
    var w = WEAPONS[p.special];
    if (!w) return null;
    /* 制导弹才有发射包线：空空弹（对空中目标），以及有导引头的对地 / 对海弹
       （对海面 / 地面目标）。无制导弹（炸弹、火箭）没有 —— 它们靠 5.5 的落点标记。 */
    var isAam = w.kind === 'aam' && t.kind === 'air';
    var isSurf = (w.target === 'ground' || w.target === 'ship') && t.kind === 'target' &&
      w.seeker && w.seeker !== 'none' && !w.unguided;
    if (!isAam && !isSurf) return null;

    /* rmax / nez 用真实弹道动态算（Ent.envelopeRange）：把目标高度、相对速度、
       航向都吃进 stepMissile 的模拟里，nez 按"目标掉头逃逸"（空空）或
       "目标最大航速"（对面）二分出来。一次要跑十几份弹道，按状态变化 + 0.3 s 节流缓存。 */
    var now = performance.now();
    var c = p.__env;
    var d = M3.dist(p.pos, t.pos);
    if (!c || c.w !== w.id || now - c.at > 300 ||
        Math.abs(d - c.d) > 150 || Math.abs((p.speed || 0) - c.spd) > 50 ||
        Math.abs(p.pos.y - c.y) > 500) {
      var e = Ent.envelopeRange(w, { pos: p.pos, fwd: p.fwd, speed: (p.speed || 0) + 70 }, t);
      var lock = w.lockDist || Infinity;
      var rmax = Math.min(lock, e.rmax);
      var nez = Math.min(lock, Math.min(e.nez, e.rmax));
      c = p.__env = { w: w.id, at: now, d: d, spd: p.speed || 0, y: p.pos.y, rmax: rmax, nez: nez };
    }
    return { rmax: c.rmax, nez: c.nez };
  }

  function computeNEZ(p, t) {
    var e = computeEnvelope(p, t);
    return e ? e.nez : 0;
  }

  /* ============================================================
     屏幕外标记的落点

     屏外箭头原来贴在一个 54 px 的固定页边距上，而屏幕四边全被仪表占着：
     上边是指南针与任务目标，左右是速度 / 高度 / 出力带，下边从左到右是
     雷达、武器面板、RWR + 挂载图。箭头横穿这些仪表时，本来只说
     "目标在那边"的提示，反而盖住了要读的数。

     所以先把可落点收进一个矩形：四条边各自让开那一侧最宽的元件，
     再让方向决定落在矩形的哪条边上。方向不变、位置统一 ——
     "指向"是箭头的全部含义，它离中心多远只是画法。

     间距全部由各元件自己的布局算出（gap / U / hmiLayout），不写死像素：
     哪边挪了，箭头跟着挪。锁定目标那只大箭头（sz = 11）与来袭导弹的
     箭头（尖端 14）都比 CLR 小，所以箭头本体不会越过安全线。
     ============================================================ */

  /** 屏外标记的安全矩形 —— 四条边都让开贴边的仪表 */
  function offscreenRect(W, H, p) {
    var CLR = U(18);                          // 让开的余量：箭头本体 + 一点呼吸
    var m = gap(132, W, 0.15);                // 速度带 / 高度带距边的间距（与 drawTapes 同源）

    // 左：空速带 + 引擎出力带（后者在空速带右边 U(104)，读数再往外）
    var left = m + U(168) + CLR;
    // 右：高度带 + 动压表（动压表以 x = W - m 为中心、半宽 62）
    var right = m + U(62) + CLR;
    // 上：指南针（含航向读数） + 两行任务目标
    var top = U(124) + CLR;
    // 下：武器面板（行数决定高度）与方位尺，取更靠上的那一个
    var rows = (p && p.loadoutList) ? p.loadoutList.length : 0;
    var panelTop = H - gap(74, H, 0.11) - U(31) - rows * U(15);
    var bearingTop = H * 0.82 - U(24);
    var bottom = H - Math.min(panelTop, bearingTop) + CLR;

    /* 极小窗口的兜底：仪表本身就占满屏幕时，上面那套间距会把矩形算反
       （x0 > x1）。这时退回按比例内缩，至少保证落点还落在屏内。 */
    if (W - left - right < W * 0.40) { left = right = W * 0.30; }
    if (H - top - bottom < H * 0.36) { top = bottom = H * 0.32; }

    return { x0: left, y0: top, x1: W - right, y1: H - bottom };
  }

  /** 从屏幕中心朝 (dx, dy) 走，取与安全矩形边界的交点（dx/dy 已是单位向量） */
  function edgePoint(cx, cy, dx, dy, r) {
    var kx = dx > 1e-6 ? (r.x1 - cx) / dx
      : (dx < -1e-6 ? (r.x0 - cx) / dx : Infinity);
    var ky = dy > 1e-6 ? (r.y1 - cy) / dy
      : (dy < -1e-6 ? (r.y0 - cy) / dy : Infinity);
    var k = Math.min(kx, ky);
    return { x: cx + dx * k, y: cy + dy * k };
  }

  /* isLock = 当前选中的目标；locked = 而且锁定环已经走满 */
  function drawOffscreen(ctx, W, H, cam, t, isLock, dist, isAlly, rect, locked) {
    var cx = W / 2, cy = H / 2;

    /* 方向取相机空间的横向分量 (x, -y)。它和投影点在屏幕上的偏移方向
       完全一致（投影只是把两者同乘一个正数），但对"只差一点就出屏"的点
       也稳定 —— 先把投影点夹进屏幕再求角度，会把右上角外面的目标
       拉成"正右方"。 */
    var c = M3.toCam(cam, t.pos);
    var dx = c.x, dy = -c.y;
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) { dx = 0; dy = 1; }      // 正后方：方向无意义，落到正下方
    else { dx /= l; dy /= l; }

    var pt = edgePoint(cx, cy, dx, dy, rect);
    var ang = Math.atan2(dy, dx);

    /* 屏幕外的箭头沿用同一套敌我语义：**友军蓝、敌人红**。

       以前这里地面目标用灰蓝、锁定状态用琥珀 —— 屏外本来就看不到
       NEZ 状态，用琥珀表示"够不着"没有意义，反而让同一种色系
       承担了三种含义（说明文字、中立物、锁定）。现在只剩两种：
       蓝色是我的，红色是别人的。

       ---- 已锁定：额外的小修饰 ----

       "当前锁定的那一架"是玩家唯一会追着看的目标，而它一旦飞出屏幕，
       就退化成和旁边十几只箭头长得一样的东西 —— 连"我锁的是哪一架"
       都要靠回忆。所以锁定态在屏外要能一眼认出来：

         · 颜色从半透明提到**实心**（其余箭头都是压暗的陪衬）
         · 加一圈随正弦脉动的外环 + 环内的核心点
         · 尺寸放大（11 → 13）
         · 读数带 `LOCK` 前缀，而不是一个裸距离

       脉动用 performance.now()：这个文件里所有闪烁都是这么写的。
       箭头画在安全矩形边界上，外环半径 +3.5 仍在 CLR 让出的余量里。 */
    var lockPulse = 0;
    var neutral = !isAlly && t.team > 1;
    var col = isAlly ? 'rgba(90,168,255,0.60)' : (neutral ? 'rgba(160,170,178,0.50)' : 'rgba(255,77,77,0.55)');
    var sz = isLock ? 11 : (isAlly ? 8 : 9);
    if (isLock) {
      lockPulse = (Math.sin(performance.now() * 0.006) + 1) * 0.5;   // 0..1
      col = isAlly ? 'rgba(90,168,255,0.98)' : 'rgba(255,96,96,0.98)';
      sz = 13;
    }
    var sz0 = isLock ? 11 : (isAlly ? 8 : 9);

    ctx.save();
    ctx.translate(pt.x, pt.y);

    if (isLock) {
      // 外环（脉动）+ 环心亮点：先画在箭头下面，避免盖住箭头本体
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, sz0 + 3.0 + lockPulse * 2.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      /* 锁满：在外环外切处加一个红色四角框（边长 = 外环脉动的最大直径，不跟着脉动） */
      if (locked) {
        var q = sz0 + 3.0 + 2.4 + 1.5, qc = 5;
        ctx.strokeStyle = RED; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-q, -q + qc); ctx.lineTo(-q, -q); ctx.lineTo(-q + qc, -q);
        ctx.moveTo(q - qc, -q); ctx.lineTo(q, -q); ctx.lineTo(q, -q + qc);
        ctx.moveTo(q, q - qc); ctx.lineTo(q, q); ctx.lineTo(q - qc, q);
        ctx.moveTo(-q + qc, q); ctx.lineTo(-q, q); ctx.lineTo(-q, q - qc);
        ctx.stroke();
      }
    }

    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.55, sz * 0.66); ctx.lineTo(-sz * 0.55, -sz * 0.66);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    /* 读数写在**朝屏幕中心**的一侧：贴边的标记若把读数写在更外一侧，
       就又压回刚让开的仪表上了。 */
    /* 只写距离。锁定状态由箭头外的红色四角框表示（见上），不再写 LOCK / TGT 前缀 */
    text(ctx, (dist / 1000).toFixed(1),
      pt.x - dx * (isLock ? 32 : 20), pt.y - dy * (isLock ? 32 : 20) + 4, col,   // 选中目标让开外环和四角框
      isLock ? 'bold ' + FS : FS, 'center');
  }

  /* ============================================================
     武器 / 弹药面板
     ============================================================ */
  function drawWeaponPanel(ctx, W, H, p) {
    // 底部中央，间距从下边界算起并夹上限
    var x = W / 2, y = H - gap(74, H, 0.11);

    ctx.textAlign = 'center';

    // 机炮
    var gCol = p.gunAmmo > 0 ? GREEN : RED;
    text(ctx, 'GUN  ' + p.gunAmmo, x - 172, y, gCol, FB, 'center');

    // 干扰弹（热焰弹 + 箔丝，单位是"组"）
    text(ctx, 'DECOY ' + p.flares, x + 172, y, p.flares > 0 ? GREEN : RED, FB, 'center');

    /* ---- 挂载武器纵列表 ----
       一行一种武器，当前选中的用 ">" 指出来。
       从"一个固定特殊武器"改成"多组挂载"之后这是必需的 ——
       没有它玩家不知道按 R 会切到什么，也不知道还剩多少。 */
    var lst = p.loadoutList || [];
    var rowH = 15;
    var top = y - 10 - (lst.length - 1) * rowH;

    for (var i = 0; i < lst.length; i++) {
      var e = lst[i];
      var cur = (i === p.wpIdx);
      var ammo = p.ammoPool ? (p.ammoPool[e.wid] || 0) : (e.ammo || 0);
      var ry = top + i * rowH;

      var col = ammo > 0 ? (cur ? CY : 'rgba(185,200,212,0.5)') : RED;
      if (cur && p.spCd > 0) col = AMBER;

      if (cur) text(ctx, '>', x - 92, ry, AMBER, FB, 'left');
      text(ctx, e.w.name, x - 76, ry, col, FB, 'left');
      text(ctx, String(ammo), x + 58, ry, col, FB, 'right');

      /* 发射槽指示：● 就绪、○ 装填中。
         一个槽 = 能立刻打出的一发；全部空心的意思就是
         "现在按发射键没反应，得等"。 */
      var sl = p.slotCd ? p.slotCd[e.wid] : null;
      if (sl && sl.length) {
        var dots = '';
        for (var d = 0; d < sl.length; d++) dots += (sl[d] <= 0 ? '●' : '○');
        text(ctx, dots, x + 70, ry, DIM, FS, 'left');
      }
    }

    if (lst.length) {
      var cw = lst[p.wpIdx] ? lst[p.wpIdx].w : lst[0].w;
      text(ctx, cw.cn, x, top + lst.length * rowH + 4, DIM, FS, 'center');
      if (p.spCd > 0) {
        text(ctx, 'RLD ' + p.spCd.toFixed(1) + 's', x + 132, y - 12, AMBER, FS, 'left');
      }
    } else {
      text(ctx, '无挂载 / CLEAN', x, y - 10, RED, FB, 'center');
    }

    // 结构完整度
    var hpK = p.hp / p.maxHp;
    var hw = U(190);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - hw / 2, y + 24, hw, 6);
    ctx.fillStyle = hpK > 0.6 ? GREEN : (hpK > 0.3 ? AMBER : RED);
    ctx.fillRect(x - hw / 2, y + 24, hw * M3.clamp(hpK, 0, 1), 6);
    text(ctx, 'HULL ' + (hpK * 100).toFixed(0) + '%', x, y + 44, DIM, FS, 'center');
  }

  /* ============================================================
     告警栈（屏幕中上方）

     所有出现在屏幕正中上方的告警都在这里排队：先收集、再按优先级
     从上往下排。以前导弹 / 雷达照射一套 y、失速等另一套 y、"被对空雷达
     截获"又在 game.js 里写死一个 y —— 同时出现就叠在一起。
     现在只有这一个起点，一行占一格，**永远不会重叠**。

     闪烁的告警在暗下去的半拍里**照样占着位置**：不然下面几行会跟着
     一上一下地跳。

     新增告警：往 ALERT_ORDER 里插一个 id、在下面 push 一条，别另起 y。
     ============================================================ */
  /* 优先级（上 → 下）：雷达 / 导弹 > 低高度 > 失速 > 动压 > 其它状态。
     低高度排在失速前面：它意味着下一秒就是海面。 */
  var ALERT_ORDER = ['missile', 'lit', 'damage', 'terrain', 'stall', 'lowq', 'jammed', 'winchester', 'emcon'];

  var alertsBottom = 0;      // 告警栈最后一行的下沿 —— 任务横幅从它下面开始

  function drawAlerts(ctx, W, H, p, world) {
    var now = performance.now();
    var bl = Math.sin(now * 0.014) > 0;
    var blFast = Math.sin(now * 0.018) > -0.35;
    var BIG = 'bold ' + (30 * HUDK).toFixed(0) + 'px Consolas,monospace';
    var F1 = 'bold ' + (24 * HUDK).toFixed(0) + 'px Consolas,monospace';
    var F2 = 'bold ' + (21 * HUDK).toFixed(0) + 'px Consolas,monospace';
    var list = [];

    var th = world ? threatState(p, world) : { inb: 0, lit: false };
    if (th.inb) {
      var dTxt = th.minD < 1000 ? Math.round(th.minD) + ' M' : (th.minD / 1000).toFixed(1) + ' KM';
      list.push({ id: 'missile', txt: '▲ MISSILE  导弹逼近', col: RED, font: BIG, on: blFast, h: U(34),
        sub: dTxt, subH: U(26) });
    } else if (th.lit || (world && world.detected)) {
      /* 导弹已经在路上时不再单独报"被照射" —— 那是同一件事的前半段。
         被对空雷达截获（DETECTED）并进 SPIKE：同一件事，只是照射源不同 */
      list.push({ id: 'lit', txt: th.lit ? '▲ SPIKE  雷达照射' : '▲ SPIKE  对空雷达截获', col: AMBER, font: BIG, on: true, h: U(34) });
    }
    if (p.pos.y < 200 && p.fwd.y < 0) list.push({ id: 'terrain', txt: 'TERRAIN  低高度告警', col: RED, font: F1, on: bl, h: U(30) });
    if (p.stall) list.push({ id: 'stall', txt: 'STALL  失速', col: RED, font: F1, on: bl, h: U(30) });
    if (p.pos.y > 18000 && p.q < 12) list.push({ id: 'lowq', txt: 'LOW Q  动压不足', col: AMBER, font: F2, on: bl, h: U(30) });
    /* 电子战的两个状态：受扰与静默。
       它们都是"你看不见别人 / 别人看不见你"的状态，必须一眼可辨 ——
       否则玩家只会觉得"雷达今天有点难用"。 */
    /* 受扰是常态告警：不闪、颜色压暗 —— 一直挂着提醒你"现在看到的不全"，但不抢眼。 */
    if ((p.suppressed || 0) > 0.05 || (p.ewPower || 0) > 0) list.push({ id: 'jammed', txt: 'JAMMED  电磁干扰', col: 'rgba(255,176,58,0.62)', font: F2, on: true, h: U(30) });
    /* 受损：最后一次掉血后挂 HudFx.FX.alertHold 秒，快闪 */
    if (typeof HudFx !== 'undefined' && HudFx.alertOn()) list.push({ id: 'damage', txt: 'DAMAGE  受损警告', col: RED, font: F1, on: blFast, h: U(30) });
    if (p.gunAmmo <= 0 && p.spAmmo <= 0) list.push({ id: 'winchester', txt: 'WINCHESTER  弹药耗尽', col: AMBER, font: F2, on: bl, h: U(30) });
    if (p.emcon) list.push({ id: 'emcon', txt: 'EMCON-Δ  电磁静默', col: CY, font: F2, on: true, h: U(30) });

    list.sort(function (a, b) { return ALERT_ORDER.indexOf(a.id) - ALERT_ORDER.indexOf(b.id); });

    /* 起点让开顶部的任务目标块（目标行 U(92)、副行 U(110)、时限 U(128)）。 */
    var y = Math.max(H * 0.22, U(128) + U(48));
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      a.y = y;
      if (a.on) text(ctx, a.txt, W / 2, y, a.col, a.font, 'center');
      y += a.h;
      if (a.sub) {
        text(ctx, a.sub, W / 2, y - U(6), a.col, FB, 'center');
        y += a.subH;
      }
    }
    alertsBottom = list.length ? y : 0;
    return list;
  }

  /* ============================================================
     任务目标
     ============================================================ */
  /* ============================================================
     挂载状态图（右下角）
     和机库右上角那张用的是同一份绘制代码（PLANFORM.paint 的紧凑模式）——
     所以挂载点位置、武器外形在两边永远是一致的。

     装填进度直接画在弹体上：打完之后弹体先暗下去，
     再让亮绿从下往上把它填回来。这样不用另找地方放进度条，
     而且一眼就能看出是哪一组的弹在装填。
     ============================================================ */
  function drawStores(ctx, W, H, p) {
    if (!p.ac || !p.ac.hardpointGroups || !p.ac.hardpointGroups.length) return;
    if (!p.loadout) return;

    var L = hmiLayout(W, H);
    var size = L.size;
    var bx = L.storeX;
    var by = L.storeY;          // 俯视图自己占右下角，RWR 让到了左边

    ctx.fillStyle = 'rgba(6,14,20,0.38)';
    ctx.fillRect(bx, by, size, size);
    ctx.strokeStyle = 'rgba(79,224,138,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, size, size);

    /* 每个挂载点一个发射槽，所以进度也要一个一个算。
       这里给的是**就绪度**：0 = 刚打完（空壳），1 = 装填完毕（满）。

       注意方向：冷却条要朝着"能打"的方向生长 ——
       一上来是空的，然后从下往上填满。反过来（先满后慢慢空）
       读起来像是"越打越有"，和实际状态正好相反。 */
    var cd = {};
    var slots = p.slotCd || {};
    var lst = p.loadoutList || [];
    for (var i = 0; i < lst.length; i++) {
      var e = lst[i];
      var arr = slots[e.wid] || [];
      var total = e.w.cd > 0 ? e.w.cd : 1;
      var out = [];
      for (var j = 0; j < e.salvo; j++) {
        out.push(1 - M3.clamp((arr[j] || 0) / total, 0, 1));
      }
      cd[e.wid] = out;
    }

    PLANFORM.paint(ctx, bx, by, size, size, p.ac, p.loadout,
      { compact: true, cd: cd });

    text(ctx, 'STORES', bx + size / 2, by - 5, DIM, FS, 'center');
  }

  /* ============================================================
     本方射弹
     玩家和友军打出去的导弹 / 炸弹套蓝色菱形（和来袭导弹的红菱形同形），
     方便追踪落点 —— 尤其是没有尾迹的无动力炸弹。火箭（`burn`）一次一大把、
     飞行时间短，不标。离本机 FRIENDLY_SHOT_MIN 米以内不画，免得刚离架就套框。
     只画屏幕内的，不给屏外箭头：边缘已经够挤了。
     ============================================================ */
  var FRIENDLY_SHOT_MIN = 300;
  function drawFriendlyShots(ctx, W, H, cam, p, world) {
    if (!world || !world.missiles || !world.missiles.length) return;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1.4;
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team !== p.team || m.w.burn) continue;
      if (M3.dist(m.pos, p.pos) < FRIENDLY_SHOT_MIN) continue;
      var s = M3.project(cam, m.pos);
      if (!s || s.x < 16 || s.x > W - 16 || s.y < 16 || s.y > H - 16) continue;
      var r = 8;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y);
      ctx.lineTo(s.x, s.y + r);
      ctx.lineTo(s.x - r, s.y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  /* ============================================================
     来袭导弹
     导弹是唯一能真正杀死玩家的东西，而它在屏幕上只是一个很小的亮点，
     钻进云里就彻底看不见了。所以每一枚盯着本机的导弹都要标出来：
     屏幕内画红色菱形 + 距离，屏幕外画边缘箭头。
     ============================================================ */
  function drawIncomingMissiles(ctx, W, H, cam, p, world) {
    if (!world || !world.missiles || !world.missiles.length) return;
    var bl = Math.sin(performance.now() * 0.02) > -0.3;
    var offRect = offscreenRect(W, H, p);

    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.team === p.team) continue;
      /* 和告警音同一个判据：锁定本机的**以及**刚被诱饵骗掉、
         还在本机附近的弹，都算来袭。

         原来只认 `m.target === p` —— 撒一发诱饵成功之后，红色菱形
         与距离读数一起消失，而那枚弹仍然在同一片空域里飞。
         玩家会把"标记没了"读成"威胁没了"。 */
      var md = M3.dist(m.pos, p.pos);
      if (!(m.target === p || (m.spoofed === p && m.reLockT > 0))) continue;

      var dist = md;
      var s = M3.project(cam, m.pos);

      if (s && s.x > 16 && s.x < W - 16 && s.y > 16 && s.y < H - 16) {
        var r = 11;
        ctx.strokeStyle = RED;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r);
        ctx.lineTo(s.x - r, s.y);
        ctx.closePath();
        ctx.stroke();

        text(ctx, dist < 1000 ? Math.round(dist) + 'M' : (dist / 1000).toFixed(1) + 'KM',
          s.x, s.y + r + 13, RED, FS, 'center');
        continue;
      }

      /* 屏幕外：落点和目标的屏外箭头用同一套安全矩形，
         免得"来袭导弹"这条最要紧的提示反而压在仪表上。 */
      var c = M3.toCam(cam, m.pos);
      var ang = Math.atan2(-c.y, c.x);
      var dx = Math.cos(ang), dy = Math.sin(ang);
      if (Math.abs(c.x) < 1e-6 && Math.abs(c.y) < 1e-6) {
        dx = 0; dy = 1; ang = Math.PI / 2;    // 正后方：方向无意义，落到正下方
      }
      var pt = edgePoint(W / 2, H / 2, dx, dy, offRect);
      var ex = pt.x, ey = pt.y;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = bl ? RED : 'rgba(255,77,77,0.42)';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      text(ctx, (dist / 1000).toFixed(1) + 'KM',
        ex - dx * 24, ey - dy * 24 + 4, RED, FS, 'center');
    }
  }

  /* ============================================================
     目标方位尺
     锁定目标跑出视野时，屏幕边缘那个小箭头太容易错过 ——
     尤其是被云和地面网格淹没的时候。所以在屏幕中下方再给一条方位尺：
     中间是机头方向，标记的左右偏移表示方位角、上下偏移表示俯仰角。
     ============================================================ */
  function drawTargetBearing(ctx, W, H, p, t) {
    if (!t || !t.alive) return;

    var toT = M3.sub(t.pos, p.pos);
    var dist = M3.len(toT);
    if (dist < 2) return;
    var d = M3.mul(toT, 1 / dist);

    var rx = M3.dot(d, p.right);
    var fx = M3.dot(d, p.fwd);
    var ux = M3.dot(d, p.up);

    // 方位角（+ 为右）与俯仰角（+ 为上）
    var az, el = Math.asin(M3.clamp(ux, -1, 1));
    if (fx > 0.02) {
      az = Math.atan2(rx, fx);
    } else {
      // 目标在侧后方或正后方：方位角没有意义，直接顶到左右边缘
      az = (rx >= 0) ? 1.5708 : -1.5708;
      el = 0;
    }

    var cx = W / 2;
    var cy = H * 0.82;
    var halfW = Math.min(200, W * 0.16);

    // 尺身
    ctx.strokeStyle = 'rgba(79,224,138,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, cy);
    ctx.lineTo(cx + halfW, cy);
    ctx.stroke();

    // 左右各 30° / 60° 刻度
    for (var k = -2; k <= 2; k++) {
      var tx = cx + (k * halfW) / 2;
      ctx.beginPath();
      ctx.moveTo(tx, cy - 4);
      ctx.lineTo(tx, cy + 4);
      ctx.stroke();
    }

    // 机头参考（中间朝上的小三角）
    ctx.fillStyle = 'rgba(79,224,138,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 13);
    ctx.lineTo(cx - 4, cy - 21);
    ctx.lineTo(cx + 4, cy - 21);
    ctx.closePath();
    ctx.fill();

    // 目标标记
    var mx = cx + M3.clamp(az / 1.5708, -1, 1) * halfW;
    var my = cy - M3.clamp(el / 1.5708, -1, 1) * 30;
    var col = (t.kind === 'target') ? '#ffb03a' : RED;

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(mx, my - 9);
    ctx.lineTo(mx - 6, my + 2);
    ctx.lineTo(mx + 6, my + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx - 7, my + 6);
    ctx.lineTo(mx + 7, my + 6);
    ctx.stroke();

    /* 已锁定：标记外面套一圈双层四角框（与目标框锁定时同一个画法），上方写 LOCK。
       目标在画面外时，这里是唯一能看出"我已经锁住它了"的地方。
       用四角框而不是告警色块：四角框在这套 HUD 里只代表"我选中的目标"，
       不会和 SPIKE / MISSILE 那类"别人锁我"的告警混淆。 */
    if (p.locked && p.target === t) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      [[12, 5], [8, 4]].forEach(function (b) {
        var a0 = mx - b[0], a1 = mx + b[0], b0 = my - b[0] - 2, b1 = my + b[0] + 2, c = b[1];
        ctx.beginPath();
        ctx.moveTo(a0, b0 + c); ctx.lineTo(a0, b0); ctx.lineTo(a0 + c, b0);
        ctx.moveTo(a1 - c, b0); ctx.lineTo(a1, b0); ctx.lineTo(a1, b0 + c);
        ctx.moveTo(a1, b1 - c); ctx.lineTo(a1, b1); ctx.lineTo(a1 - c, b1);
        ctx.moveTo(a0 + c, b1); ctx.lineTo(a0, b1); ctx.lineTo(a0, b1 - c);
        ctx.stroke();
      });
      text(ctx, 'LOCK', mx, my - 18, col, 'bold 11px Consolas,monospace', 'center');
    }

    // 距离 / 方位读数
    text(ctx, (dist / 1000).toFixed(1) + ' KM', cx - halfW - 12, cy + 4,
      col, FS, 'right');
    text(ctx, (az >= 0 ? 'R' : 'L') + Math.abs(Math.round(az * 57.2958)) + '°',
      cx + halfW + 12, cy + 4, col, FS, 'left');
  }

  function drawObjective(ctx, W, H, world) {
    if (!world.objective) return;
    // 让开顶部的指南针
    text(ctx, world.objective, W / 2, U(92), 'rgba(79,224,138,0.85)',
      'bold ' + (14 * HUDK).toFixed(1) + 'px Consolas,monospace', 'center');
    if (world.objectiveSub) {
      text(ctx, world.objectiveSub, W / 2, U(110), DIM, FS, 'center');
    }

    /* 关卡时限。只有声明了 timeLimit 的关卡才画 —— 没时限的任务
       在目标行下面多出一行 "--:--" 只会让人以为漏看了什么。
       最后 30 秒转琥珀色：那是"该做决定了"的颜色。 */
    if (world.timeLimit > 0) {
      var tl = Math.max(0, world.timeLeft);
      var mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
      var stamp = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
      text(ctx, 'TIME  ' + stamp, W / 2, U(128), tl <= 30 ? AMBER : DIM,
        'bold ' + (13 * HUDK).toFixed(1) + 'px Consolas,monospace', 'center');
    }
  }

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
    ctx.font = font || F;
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
    var top = Math.max(H * 0.36, alertsBottom ? alertsBottom + U(4) : 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(4,10,14,0.55)';
    ctx.fillRect(0, top, W, 88);
    ctx.fillStyle = col || AMBER;
    ctx.fillRect(0, top, W, 2);
    ctx.fillRect(0, top + 86, W, 2);
    text(ctx, title, W / 2, top + 44, col || AMBER,
      'bold 34px Consolas,monospace', 'center');
    if (sub) text(ctx, sub, W / 2, top + 70, '#b9c8d4',
      '14px Consolas,monospace', 'center');
    ctx.restore();
  }

  function hitMark(ctx, W, H, txt, alpha, col) {
    ctx.save();
    ctx.globalAlpha = alpha;
    text(ctx, txt, W / 2 + 120, H / 2 - 60, col || AMBER,
      'bold 17px Consolas,monospace', 'center');
    ctx.restore();
  }

  return {
    draw: draw, banner: banner, hitMark: hitMark,
    computeNEZ: computeNEZ, computeEnvelope: computeEnvelope, radarXY: radarXY,
    offscreenRect: offscreenRect, drawAlerts: drawAlerts, ALERT_ORDER: ALERT_ORDER,
    thrPercent: thrPercent, THR_IDLE: THR_IDLE, THR_MAX: THR_MAX,
    GREEN: GREEN, AMBER: AMBER, CY: CY, RED: RED
  };
})();
