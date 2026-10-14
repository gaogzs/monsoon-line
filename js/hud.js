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
  var F = 'bold 12px Consolas,monospace';
  var FB = 'bold 15px Consolas,monospace';
  var FS = 'bold 11px Consolas,monospace';

  /* ============================================================
     主入口
     ============================================================ */
  var CARD = ['N', 'E', 'S', 'W'];

  function draw(world, p, dt, S) {
    var ctx = Renderer.ctx;
    var W = Renderer.W, H = Renderer.H;
    var cam = Renderer.getCam();
    if (!cam || !p) return;

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
    drawWeaponPanel(ctx, W, H, p);
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
    var top = 8;
    var bandH = 26;
    var halfW = Math.min(300, W * 0.24);
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
    var cy = H / 2, hgt = 260;
    var top = cy - hgt / 2;

    /* ---------- 左：空速 ----------
       带子向屏幕中心收拢了一些：贴在最边上时，视线要来回甩很远，
       而中间那块才是真正需要盯的区域。 */
    var x = 132;
    tape(ctx, x, top, hgt, p.speed, 50, 200, 1, 'M/S', CY, 0.85);
    text(ctx, (p.speed * 3.6).toFixed(0), x - 46, cy + 5, '#eaf4fb', FB, 'right');
    text(ctx, (p.speed * 1.9438).toFixed(0) + ' KT', x - 46, cy + 21, DIM, FS, 'right');

    /* ---------- 右：高度 ---------- */
    var x2 = W - 132;
    tape(ctx, x2, top, hgt, p.pos.y, 1000, 5000, -1, 'M', GREEN, 0.021);
    text(ctx, p.pos.y.toFixed(0), x2 + 46, cy + 5, '#eaf4fb', FB, 'left');
    text(ctx, (p.pos.y * 3.28084).toFixed(0) + ' FT', x2 + 46, cy + 21, DIM, FS, 'left');

    /* ---------- 右下：动压 Q（本作核心仪表） ---------- */
    var qx = W - 132, qy = top + hgt + 58;
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
    var tx = 60, ty = H - 150;
    text(ctx, 'THR', tx, ty - 8, DIM, FS, 'center');
    ctx.strokeStyle = DIM; ctx.lineWidth = 1;
    ctx.strokeRect(tx - 7, ty, 14, 108);
    var th = M3.clamp(p.throttle, 0, 1);
    ctx.fillStyle = p.ab ? AMBER : GREEN;
    ctx.fillRect(tx - 5, ty + 106 - 104 * th, 10, 104 * th);
    if (p.ab) text(ctx, 'A/B', tx, ty + 124, AMBER, FS, 'center');
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
    var R = 104, cx = 128, cy = H - 138;
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
    var R = 70, cx = W - 128, cy = H - 108;
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
        // 未锁定：小方框
        var sz = t.kind === 'target' ? 8 : 11;
        ctx.strokeStyle = t.kind === 'target' ? 'rgba(143,163,178,0.75)' : 'rgba(255,77,77,0.6)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2);
      }
    }
  }

  function drawLockBox(ctx, s, t, p, dist, world) {
    var w = 30, h = 30;
    if (t.kind === 'target') { w = 46; h = 34; }

    // NEZ 实环：目标处于不可逃逸区内时收成实心小圈
    var nez = computeNEZ(p, t);
    var inNez = dist < nez;

    ctx.strokeStyle = inNez ? RED : GREEN;
    ctx.lineWidth = 2;
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

    // 数据块
    var tx = s.x + w + 8, ty = s.y - h;
    ctx.font = FS;
    var label = t.label || (t.name || '目标');
    var col = inNez ? RED : GREEN;
    text(ctx, label, tx, ty + 10, col, 'bold 12px Consolas,monospace', 'left');
    text(ctx, (dist / 1000).toFixed(2) + ' KM', tx, ty + 24, DIM, FS, 'left');
    if (t.kind === 'air') {
      var dh = t.pos.y - p.pos.y;
      text(ctx, (dh >= 0 ? '+' : '') + dh.toFixed(0) + ' M',
        tx, ty + 38, DIM, FS, 'left');
      // 目标动压
      if (t.q !== undefined) {
        text(ctx, 'Q ' + t.q.toFixed(0), tx, ty + 52,
          t.q < 12 ? AMBER : DIM, FS, 'left');
      }
    } else {
      text(ctx, t.ttype === 'air' ? '浮空平台' : '地面设施', tx, ty + 38, DIM, FS, 'left');
    }

    if (inNez) {
      text(ctx, 'NEZ', tx, ty + (t.kind === 'air' ? 66 : 52), RED,
        'bold 12px Consolas,monospace', 'left');
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

    var col = t.kind === 'target' ? 'rgba(143,163,178,0.7)'
      : (isLock ? GREEN : 'rgba(255,77,77,0.65)');
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-5, 6); ctx.lineTo(-5, -6);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    text(ctx, (dist / 1000).toFixed(1), px, py + 20, col, FS, 'center');
  }

  /* ============================================================
     武器 / 弹药面板
     ============================================================ */
  function drawWeaponPanel(ctx, W, H, p) {
    var x = W / 2, y = H - 74;
    var spW = WEAPONS[p.special];

    ctx.textAlign = 'center';

    // 机炮
    var gCol = p.gunAmmo > 0 ? GREEN : RED;
    text(ctx, 'GUN  ' + p.gunAmmo, x - 150, y, gCol, FB, 'center');

    // 特殊武器
    var sCol = (p.spAmmo > 0 && p.spCd <= 0) ? CY : DIM;
    var spTxt;
    if (spW.kind === 'ecm') {
      spTxt = 'ECM  ' + (p.spActive > 0 ? 'ON ' + p.spActive.toFixed(1) : (p.spCd > 0 ? p.spCd.toFixed(0) + 's' : 'RDY'));
      sCol = p.spActive > 0 ? AMBER : sCol;
    } else if (spW.kind === 'dew') {
      spTxt = 'DEW  ' + '◆'.repeat(p.spCharges) + '◇'.repeat(Math.max(0, spW.charges - p.spCharges));
    } else {
      spTxt = spW.name + '  ' + p.spAmmo;
      if (p.spCd > 0) spTxt += '  (' + p.spCd.toFixed(0) + ')';
    }
    text(ctx, spTxt, x, y, sCol, FB, 'center');
    text(ctx, spW.cn, x, y + 15, DIM, FS, 'center');

    // 干扰弹
    text(ctx, 'FLARE ' + p.flares, x + 160, y, p.flares > 0 ? GREEN : RED, FB, 'center');

    // 结构完整度
    var hpK = p.hp / p.maxHp;
    var hw = 190;
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
    var y = 110;
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
  function drawObjective(ctx, W, H, world) {
    if (!world.objective) return;
    // 让开顶部的指南针
    text(ctx, world.objective, W / 2, 92, 'rgba(79,224,138,0.85)',
      'bold 14px Consolas,monospace', 'center');
    if (world.objectiveSub) {
      text(ctx, world.objectiveSub, W / 2, 110, DIM, FS, 'center');
    }
  }

  /* ---------- 小工具 ---------- */
  function text(ctx, t, x, y, col, font, align) {
    ctx.fillStyle = col;
    ctx.font = font || F;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
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
