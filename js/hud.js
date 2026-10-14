/* ============================================================
   hud.js —— 平视显示 / 雷达 / 告警
   本作特有的两件东西：
     · Q 表（动压 kPa）—— 高空的第一生命线
     · 锁定框上的 NEZ 实环 —— 不可逃逸区是每帧解出来的
   ============================================================ */
'use strict';

var HUD = (function () {

  var GREEN = '#4fe08a', AMBER = '#ffb03a', CY = '#45d6ff', RED = '#ff4d4d';
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
    drawBoresight(ctx, W, H, p);
    drawTapes(ctx, W, H, p, S);
    drawRadar(ctx, W, H, p, world);
    drawThreatRing(ctx, W, H, p, world);
    drawTargets(ctx, W, H, cam, p, world);
    drawIncomingMissiles(ctx, W, H, cam, p, world);
    drawStores(ctx, W, H, p);
    drawWeaponPanel(ctx, W, H, p);
    drawTargetBearing(ctx, W, H, p, p.target);
    drawWarnings(ctx, W, H, p, world);
    drawObjective(ctx, W, H, world);

    ctx.restore();
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
          if (world.targets[i].alive) marks.push(world.targets[i]);
        }
      }
    }
    for (i = 0; i < marks.length; i++) {
      var t = marks[i];
      var dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      var th = Math.atan2(dx, dz) * 180 / Math.PI;
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

    // 机头参考（十字）
    ctx.strokeStyle = GREEN; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 9, cy);
    ctx.moveTo(cx + 9, cy); ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 7);
    ctx.stroke();

    // 速度矢量（小圆 + 三根短须）
    var s = null;
    if (Renderer.getCam()) {
      var ahead = M3.add(p.pos, M3.mul(p.fwd, 1400));
      s = M3.project(Renderer.getCam(), ahead);
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

    // 机炮准星（带重力与提前量的示意环）
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
    text(ctx, (p.speed * 3.6).toFixed(0), x - 46, cy + 5, '#eaf4fb', FB, 'right');
    text(ctx, (p.speed * 1.9438).toFixed(0) + ' KT', x - 46, cy + 21, DIM, FS, 'right');

    /* ---------- 右：高度 ---------- */
    var x2 = W - m;
    tape(ctx, x2, top, hgt, p.pos.y, 1000, 5000, -1, 'M', GREEN, 0.021);
    text(ctx, p.pos.y.toFixed(0), x2 + 46, cy + 5, '#eaf4fb', FB, 'left');
    text(ctx, (p.pos.y * 3.28084).toFixed(0) + ' FT', x2 + 46, cy + 21, DIM, FS, 'left');

    /* ---------- 右下：动压 Q（本作核心仪表） ---------- */
    var qx = W - m, qy = top + hgt + U(58);
    var q = p.q;
    var qCol = q < 12 ? RED : (q < 20 ? AMBER : GREEN);
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(qx - 62, qy - 26, 124, 48);
    text(ctx, 'Q 动压', qx - 54, qy - 9, DIM, FS, 'left');
    text(ctx, q.toFixed(1) + ' kPa', qx + 54, qy + 11, qCol, FB, 'right');

    // Q 条
    var k = M3.clamp(q / 60, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(qx - 54, qy + 16, 108, 5);
    ctx.fillStyle = qCol;
    ctx.fillRect(qx - 54, qy + 16, 108 * k, 5);
    // 12 kPa 警戒线
    ctx.fillStyle = RED;
    ctx.fillRect(qx - 54 + 108 * 0.2, qy + 14, 1.5, 9);

    if (q < 12) {
      var bl = (Math.sin(performance.now() * 0.012) > 0);
      if (bl) text(ctx, '▲ 舵面失效', qx, qy + 38, RED, FS, 'center');
    }

    /* ---------- 左下：油门 ---------- */
    var tx = U(60), ty = H - U(150);
    text(ctx, 'THR', tx, ty - 8, DIM, FS, 'center');
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(tx - 7, ty, 14, 108);
    // 油门轴量程 0..1.25，1.0 以上是加力区
    var th = M3.clamp(p.throttle / 1.25, 0, 1);
    ctx.fillStyle = p.ab ? AMBER : GREEN;
    ctx.fillRect(tx - 5, ty + 106 - 104 * th, 10, 104 * th);
    // 常规推力上限刻度
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(tx - 8, ty + 106 - 104 * 0.8, 16, 1.5);
    if (p.brake) text(ctx, 'BRK', tx, ty + 124, CY, FS, 'center');
    else if (p.ab) text(ctx, 'A/B', tx, ty + 124, AMBER, FS, 'center');
    // 高 G：正在拉过载时给个明确的提示，掉速才不至于莫名其妙
    if (p.hiG) {
      var gcol = Math.sin(performance.now() * 0.02) > 0 ? RED : AMBER;
      text(ctx, 'HI-G', tx, ty - 12, gcol, FB, 'center');
    }
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

  /* ============================================================
     雷达（机头朝上）
     ============================================================ */
  function drawRadar(ctx, W, H, p, world) {
    // 雷达从"左下角"定位，半径受屏幕尺寸与缩放双重限制
    var R = Math.min(U(104), Math.min(W, H) * 0.13);
    var cx = R + U(28), cy = H - R - U(32);
    var range = 12000;

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(6,18,24,0.72)';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 距离环 + 方位线
    ctx.strokeStyle = 'rgba(79,224,138,0.20)'; ctx.lineWidth = 1;
    for (var k = 1; k <= 3; k++) {
      ctx.beginPath(); ctx.arc(cx, cy, R * k / 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
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
    ctx.restore();

    ctx.strokeStyle = DIM; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    text(ctx, 'RDR 12KM', cx, cy + R + 14, DIM, FS, 'center');
    text(ctx, 'N', cx, cy - R - 6, DIM, FS, 'center');
  }

  function radarXY(p, wp, cx, cy, R, range) {
    var dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
    var hl = Math.sqrt(p.fwd.x * p.fwd.x + p.fwd.z * p.fwd.z);
    var fx = hl > 0.05 ? p.fwd.x / hl : 0, fz = hl > 0.05 ? p.fwd.z / hl : 1;
    var rx = dx * fz - dz * fx;
    var ry = dz * fz + dx * fx;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > range) { rx *= range / d; ry *= range / d; }
    return { x: cx + rx / range * R, y: cy - ry / range * R, out: d > range };
  }

  function drawBlips(ctx, cx, cy, R, range, p, world) {
    var i, s;
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
      s = radarXY(p, e.pos, cx, cy, R, range);
      var friendly = (e.team === p.team);
      ctx.fillStyle = friendly ? GREEN : RED;
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
        if (!t.alive) continue;
        s = radarXY(p, t.pos, cx, cy, R, range);
        ctx.strokeStyle = (t.team === 2) ? '#8fa3b2'
          : (t.ttype === 'air' ? AMBER : '#8fa3b2');
        ctx.lineWidth = 1.4;
        ctx.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      }
    }
  }

  /* ============================================================
     威胁环（RWR）
     ============================================================ */
  function drawThreatRing(ctx, W, H, p, world) {
    // RWR 从"右下角"定位
    var R = Math.min(U(70), Math.min(W, H) * 0.09);
    var cx = W - R - U(28), cy = H - R - U(28);
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

    text(ctx, 'RWR', cx, cy + R + 16, 'rgba(255,176,58,0.5)', FS, 'center');
    if (msIn) {
      var bl = Math.sin(performance.now() * 0.016) > 0;
      if (bl) {
        text(ctx, '▲ 导弹逼近', cx, cy - R - 12, RED, 'bold 13px Consolas,monospace', 'center');
      }
    } else if (any) {
      text(ctx, '▲ 被照射', cx, cy - R - 12, AMBER, FS, 'center');
    }
  }

  /* ============================================================
     目标框 / 屏幕外指示 / NEZ
     ============================================================ */
  function drawTargets(ctx, W, H, cam, p, world) {
    var list = [];
    var i;
    for (i = 0; i < world.actors.length; i++) {
      var e = world.actors[i];
      if (e.alive && e !== p && e.team !== p.team) list.push(e);
    }
    if (world.targets) {
      for (i = 0; i < world.targets.length; i++) {
        if (world.targets[i].alive) list.push(world.targets[i]);
      }
    }

    for (i = 0; i < list.length; i++) {
      var t = list[i];
      var s = M3.projectUnclamped(cam, t.pos);
      var dist = M3.dist(p.pos, t.pos);
      var isLock = (p.target === t);

      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        drawOffscreen(ctx, W, H, s, t, isLock, dist);
        continue;
      }

      if (isLock) {
        drawLockBox(ctx, s, t, p, dist, world);
      } else {
        drawPlainMark(ctx, s, t, dist);
      }
    }
  }

  /* ============================================================
     未锁定的目标标记
     红框旁边照样写清"谁在开、开的是什么" —— 一眼扫过去也要能
     判断该先打谁。标签只在较近时才画，否则满屏都是字。
     ============================================================ */
  function drawPlainMark(ctx, s, t, dist) {
    var isGnd = t.kind === 'target';
    var sz = isGnd ? 8 : 11;
    var col = isGnd ? 'rgba(143,163,178,0.75)' : 'rgba(255,77,77,0.68)';

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2);

    if (dist > 12000) return;      // 太远的只留框

    // 地面设施只有名字，没有呼号也没有机型
    if (isGnd) {
      text(ctx, t.label || t.name || '地面设施',
        s.x + sz + 7, s.y - sz + 8, col, FS, 'left');
      return;
    }

    // 空中目标：第一行呼号（认人），第二行机型（认机）
    var line1 = t.label || (t.ac ? (t.ac.name + ' ' + t.ac.nick) : (t.name || ''));
    var line2 = t.label && t.ac ? (t.ac.name + ' ' + t.ac.nick) : null;

    var tx = s.x + sz + 7, ty = s.y - sz + 8;
    text(ctx, line1, tx, ty, col, FS, 'left');
    if (line2) text(ctx, line2, tx, ty + 13, 'rgba(185,200,212,0.62)', FS, 'left');
  }

  function drawLockBox(ctx, s, t, p, dist, world) {
    var w = 30, h = 30;
    if (t.kind === 'target') { w = 46; h = 34; }

    // NEZ 实环：目标处于不可逃逸区内时收成实心小圈
    var nez = computeNEZ(p, t);
    var inNez = dist < nez;

    /* 用颜色区分"锁上了但还打不着"和"已经进了不可逃逸区"：

         橙色 = 锁定了，但还在 NEZ 之外
         红色 = 进了 NEZ，发射就有意义

       **不要用绿色**。绿色在 HUD 里的语义是"友军 / 正常状态"，
       拿它标一个敌人，玩家会下意识以为那是友机 —— 这比颜色突变更糟。 */
    ctx.strokeStyle = inNez ? RED : AMBER;
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
    var col = inNez ? RED : AMBER;

    text(ctx, label, tx, ty + 10, col, 'bold 12px Consolas,monospace', 'left');
    var ly = ty + 24;

    // 机型代号 —— 效仿皇牌空战，红框旁边直接写清那是什么飞机
    if (t.ac) {
      text(ctx, t.ac.name + ' ' + t.ac.nick, tx, ly, col, FS, 'left');
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
      text(ctx, t.ttype === 'air' ? '浮空平台' : '地面设施', tx, ly, DIM, FS, 'left');
      ly += 14;
    }

    if (inNez) {
      text(ctx, 'NEZ', tx, ly, RED, 'bold 12px Consolas,monospace', 'left');
    }

    // 锁定进度环
    if (p.lockProgress < 1) {
      ctx.strokeStyle = AMBER; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(w, h) + 10, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * p.lockProgress);
      ctx.stroke();
    }
  }

  /** NEZ 估算：导弹总冲换算出的"目标最优逃逸也甩不掉"的距离 */
  function computeNEZ(p, t) {
    var w = WEAPONS[p.special];
    if (!w || w.kind !== 'aam') return 0;
    if (t.kind !== 'air') return 0;

    // 目标逃逸能力（真空速差 + 可用过载）
    var tSpd = t.speed || 200;
    var closing = Math.max(60, p.speed - t.fwd.y * 0 + tSpd * 0.4);
    // 导弹有效动力距离
    var powerK = (p.pos.y > 18000 && w.scramjet) ? 0.26 : 1;
    var effRange = w.speed * w.life * powerK;
    // 目标能在导弹到达前跑掉的距离
    var escape = tSpd * (w.life * powerK) * 0.42;
    var nez = Math.max(400, effRange - escape - closing * 1.1);
    return Math.min(nez, w.lockDist);
  }

  function drawOffscreen(ctx, W, H, s, t, isLock, dist) {
    var cx = W / 2, cy = H / 2;
    var m = 54;
    var px = M3.clamp(s.x, m, W - m);
    var py = M3.clamp(s.y, m, H - m);
    var ang = Math.atan2(py - cy, px - cx);

    /* 屏幕外的箭头沿用同一套语义：
       未锁定的敌人是半透明红，锁定的是琥珀色（够不着），
       进了 NEZ 才会变红 —— 但屏外不显示 NEZ 状态，统一用琥珀。 */
    var col = t.kind === 'target'
      ? 'rgba(143,163,178,0.7)'
      : (isLock ? AMBER : 'rgba(255,77,77,0.5)');
    var sz = isLock ? 11 : 9;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.55, sz * 0.66); ctx.lineTo(-sz * 0.55, -sz * 0.66);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    text(ctx, (dist / 1000).toFixed(1), px, py + 20, col, FS, 'center');
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
      text(ctx, String(ammo), x + 62, ry, col, FB, 'right');
      if (e.salvo > 1) text(ctx, 'R' + e.salvo, x + 72, ry, DIM, FS, 'left');
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
     告警
     ============================================================ */
  function drawWarnings(ctx, W, H, p, world) {
    var y = U(110);
    var bl = Math.sin(performance.now() * 0.014) > 0;

    if (p.stall && bl) {
      text(ctx, 'STALL  失速', W / 2, y, RED, 'bold 20px Consolas,monospace', 'center');
      y += 26;
    }
    if (p.pos.y < 200 && p.fwd.y < 0 && bl) {
      text(ctx, 'TERRAIN  地形告警', W / 2, y, RED, 'bold 20px Consolas,monospace', 'center');
      y += 26;
    }
    if (p.pos.y > 18000 && p.q < 12 && bl) {
      text(ctx, 'LOW Q  动压不足', W / 2, y, AMBER, 'bold 18px Consolas,monospace', 'center');
      y += 26;
    }
    if (p.gunAmmo <= 0 && p.spAmmo <= 0 && bl) {
      text(ctx, 'WINCHESTER  弹药耗尽', W / 2, y, AMBER, 'bold 18px Consolas,monospace', 'center');
    }
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

    var size = Math.min(U(168), Math.min(W, H) * 0.20);
    var m = gap(16, W, 0.025);
    var bx = W - size - m;
    // 让开右下角的 RWR 环
    var by = H - size - m - Math.min(U(180), H * 0.26);

    ctx.fillStyle = 'rgba(6,14,20,0.38)';
    ctx.fillRect(bx, by, size, size);
    ctx.strokeStyle = 'rgba(79,224,138,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, size, size);

    // 每件武器各自的装填进度（按它自己的冷却时长归一化）
    var cd = {};
    var pool = p.cdPool || {};
    var lst = p.loadoutList || [];
    for (var i = 0; i < lst.length; i++) {
      var e = lst[i];
      var total = e.w.cd > 0 ? e.w.cd : 1;
      cd[e.wid] = M3.clamp((pool[e.wid] || 0) / total, 0, 1);
    }

    PLANFORM.paint(ctx, bx, by, size, size, p.ac, p.loadout,
      { compact: true, cd: cd });

    text(ctx, 'STORES', bx + size / 2, by - 5, DIM, FS, 'center');
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

    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.target !== p) continue;

      var dist = M3.dist(m.pos, p.pos);
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

      // 屏幕外：贴到边缘画一个指向它的箭头
      var c = M3.toCam(cam, m.pos);
      var ang = Math.atan2(-c.y, c.x);
      var dx = Math.cos(ang), dy = Math.sin(ang);
      var pad = 58;
      var kx = Math.abs(dx) < 1e-6 ? 1e9 : (W / 2 - pad) / Math.abs(dx);
      var ky = Math.abs(dy) < 1e-6 ? 1e9 : (H / 2 - pad) / Math.abs(dy);
      var kk = Math.min(kx, ky);
      var ex = W / 2 + dx * kk;
      var ey = H / 2 + dy * kk;

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
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(4,10,14,0.55)';
    ctx.fillRect(0, H * 0.36, W, 88);
    ctx.fillStyle = col || AMBER;
    ctx.fillRect(0, H * 0.36, W, 2);
    ctx.fillRect(0, H * 0.36 + 86, W, 2);
    text(ctx, title, W / 2, H * 0.36 + 44, col || AMBER,
      'bold 34px Consolas,monospace', 'center');
    if (sub) text(ctx, sub, W / 2, H * 0.36 + 70, '#b9c8d4',
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
    computeNEZ: computeNEZ, radarXY: radarXY,
    GREEN: GREEN, AMBER: AMBER, CY: CY, RED: RED
  };
})();
