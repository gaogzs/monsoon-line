(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawTacMap = drawTacMap;

  /* ============================================================
     战场地图（按住 M 显示，松开关闭）

     游戏不暂停，地图盖在画面中央一块方形区域上：整个战区（mission.arena）、边界与警告区、
     整备点 / 整备区、友军、以及**已掌握**的敌方。
     状态由 Game 写在 world.mapOpen（input.js 的 mapKeyDown / updateMapKey），HUD 只读 world。

     · 地图**北朝上**：世界坐标按 world.axis（世界 +z 的真方位）旋成"东 / 北"再画，
       与简报地图（ui/screens/brief.js 的 drawMap）同一个约定：
         E = x·cosθ + z·sinθ，N = −x·sinθ + z·cosθ
     · 取景 = 战区方形的外接范围（没有 arena 的关卡退回所有单位的外包盒），x / N 同一个比例。
     · 警告区 / 界外区的画法与雷达一致（radar.js 的 drawArenaEdges）：警告带半透明单斜线、
       界外区交叉斜线；还有次数的界外整备区那一侧，警告带改淡青纯色填充。
     · 敌方只画"已掌握"的：离玩家或任一架在场友机 12 km 以内（与雷达量程同一个数，等于友机之间共享数据链）。
       不掌握的敌人不会因为你打开了地图就自动暴露。
     ============================================================ */
  var CONTACT_R = 12000;
  var HATCH_GAP = 7;           // 斜线间距（U 单位）
  var FAR = 12;                // 界外区多边形伸到 half 的多少倍远
  var SIDES = [
    { nx: 1, nz: 0, side: '+x' }, { nx: -1, nz: 0, side: '-x' }, { nx: 0, nz: 1, side: '+z' }, { nx: 0, nz: -1, side: '-z' }
  ];

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  var AMBER = [255, 176, 58], RED = [255, 74, 74], CYAN = [79, 224, 255], GREEN = [79, 224, 138], GREY = [143, 163, 178];

  function drawTacMap(ctx, W, H, p, world) {
    if (!world || !world.mapOpen) return;
    var ar = world.arenaDef;
    var th = (world.axis || 0) * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
    function EN(x, z) { return { e: x * ct + z * st, n: -x * st + z * ct }; }

    /* ---- 取景 ---- */
    var e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity, q, i;
    function grow(x, z) { q = EN(x, z); e0 = Math.min(e0, q.e); e1 = Math.max(e1, q.e); n0 = Math.min(n0, q.n); n1 = Math.max(n1, q.n); }
    if (ar) {
      grow(ar.cx - ar.half, ar.cz - ar.half); grow(ar.cx + ar.half, ar.cz - ar.half);
      grow(ar.cx - ar.half, ar.cz + ar.half); grow(ar.cx + ar.half, ar.cz + ar.half);
    } else {
      for (i = 0; i < world.actors.length; i++) grow(world.actors[i].pos.x, world.actors[i].pos.z);
      for (i = 0; i < world.targets.length; i++) grow(world.targets[i].pos.x, world.targets[i].pos.z);
      if (!isFinite(e0)) { e0 = -20000; e1 = 20000; n0 = -20000; n1 = 20000; }
    }
    var extent = Math.max(e1 - e0, n1 - n0) * 1.04;
    var S = Math.min(W, H) * 0.82;                 // 地图方块边长（屏幕）
    var cx = W / 2, cy = H / 2 + $.U(6);
    var k = S / extent;
    var ecx = (e0 + e1) / 2, ncy = (n0 + n1) / 2;
    function P(x, z) { var a = EN(x, z); return { x: cx + (a.e - ecx) * k, y: cy - (a.n - ncy) * k }; }
    var left = cx - S / 2, top = cy - S / 2;

    /* ---- 底板 + 网格（10 km，北朝上对齐）---- */
    ctx.save();
    ctx.fillStyle = 'rgba(3,9,14,0.90)';
    ctx.fillRect(left - $.U(10), top - $.U(34), S + $.U(20), S + $.U(34) + $.U(30));
    ctx.strokeStyle = 'rgba(79,224,138,0.5)'; ctx.lineWidth = 1.2;
    ctx.strokeRect(left - $.U(10), top - $.U(34), S + $.U(20), S + $.U(34) + $.U(30));
    ctx.beginPath(); ctx.rect(left, top, S, S); ctx.clip();
    ctx.fillStyle = '#060d13'; ctx.fillRect(left, top, S, S);
    ctx.strokeStyle = 'rgba(30,48,60,0.95)'; ctx.lineWidth = 1;
    var step = 10000, g0 = Math.ceil((ecx - extent / 2) / step) * step;
    ctx.beginPath();
    for (var ge = g0; ge < ecx + extent / 2; ge += step) { var gx = cx + (ge - ecx) * k; ctx.moveTo(gx, top); ctx.lineTo(gx, top + S); }
    var gn0 = Math.ceil((ncy - extent / 2) / step) * step;
    for (var gn = gn0; gn < ncy + extent / 2; gn += step) { var gy = cy - (gn - ncy) * k; ctx.moveTo(left, gy); ctx.lineTo(left + S, gy); }
    ctx.stroke();

    /* ---- 战区：警告区单斜线（半透明）、界外区交叉斜线；整备区那一侧的警告带纯色填充 ---- */
    if (ar) {
      var resSide = {}, rs = world.resupply;
      if (rs) for (i = 0; i < rs.entries.length; i++) if (rs.entries[i].def.edge && rs.entries[i].uses > 0) resSide[rs.entries[i].def.edge] = true;
      var gap = $.U(HATCH_GAP), hIn = ar.half - ar.warn;
      var corner = function (n, h, s) { return P(ar.cx + n.nx * h - n.nz * h * s, ar.cz + n.nz * h + n.nx * h * s); };
      var poly = function (pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y); ctx.closePath(); };
      var hatch = function (pts, rgb, a, cross) {
        ctx.save(); poly(pts); ctx.clip();
        ctx.strokeStyle = rgba(rgb, a); ctx.lineWidth = 1; ctx.beginPath();
        for (var t = -S; t <= S; t += gap) {
          ctx.moveTo(left + t, top + S); ctx.lineTo(left + S + t, top);
          if (cross) { ctx.moveTo(left + t, top); ctx.lineTo(left + S + t, top + S); }
        }
        ctx.stroke(); ctx.restore();
      };
      var line = function (a, b, rgb, al) { ctx.strokeStyle = rgba(rgb, al); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
      for (i = 0; i < 4; i++) {
        var n = SIDES[i], res = !!resSide[n.side];
        var wRgb = res ? CYAN : AMBER, oRgb = res ? CYAN : RED;
        var warnPoly = [corner(n, hIn, -1), corner(n, hIn, 1), corner(n, ar.half, 1), corner(n, ar.half, -1)];
        if (res) { poly(warnPoly); ctx.fillStyle = rgba(CYAN, 0.2); ctx.fill(); }
        else hatch(warnPoly, wRgb, 0.34, false);
        hatch([corner(n, ar.half, -1), corner(n, ar.half, 1), corner(n, ar.half * FAR, 1), corner(n, ar.half * FAR, -1)], oRgb, 0.62, true);
        line(corner(n, hIn, -1), corner(n, hIn, 1), wRgb, 0.55);
        line(corner(n, ar.half, -1), corner(n, ar.half, 1), oRgb, 0.9);
      }
    }

    /* ---- 整备点：单位的服务圈 / 界外整备区的标签 ---- */
    var rsv = world.resupply;
    if (rsv) {
      for (i = 0; i < rsv.entries.length; i++) {
        var en = rsv.entries[i];
        if (en.uses <= 0) continue;
        if (en.def.edge) {
          if (!ar) continue;
          var side = en.def.edge, sg = side.charAt(0) === '-' ? -1 : 1, ax = side.charAt(1);
          var mid = P(ar.cx + (ax === 'x' ? sg * (ar.half - ar.warn / 2) : 0), ar.cz + (ax === 'z' ? sg * (ar.half - ar.warn / 2) : 0));
          $.text(ctx, T('ui.hud.tacmap.rearmZone'), mid.x, mid.y + $.U(4), 'rgba(79,224,255,0.95)', $.FS, 'center');
        } else if (en.unit && en.unit.alive) {
          var cc = P(en.unit.pos.x, en.unit.pos.z);
          ctx.strokeStyle = rgba(CYAN, 0.55); ctx.lineWidth = 1; if (ctx.setLineDash) ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(cc.x, cc.y, Math.max(3, en.def.r * k), 0, Math.PI * 2); ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        }
      }
    }

    /* ---- 谁算"已掌握"：玩家与在场友机 12 km 以内 ---- */
    var observers = [];
    for (i = 0; i < world.actors.length; i++) if (world.actors[i].alive && world.actors[i].team === 0) observers.push(world.actors[i]);
    function known(e) {
      for (var j = 0; j < observers.length; j++) {
        var dx = e.pos.x - observers[j].pos.x, dz = e.pos.z - observers[j].pos.z;
        if (dx * dx + dz * dz <= CONTACT_R * CONTACT_R) return true;
      }
      return false;
    }
    function dirOf(f) { var a = EN(f.x, f.z); var l = Math.sqrt(a.e * a.e + a.n * a.n) || 1; return { x: a.e / l, y: -a.n / l }; }
    function tri(x, y, d, size, rgb, fill) {
      var px = -d.y, py = d.x;
      ctx.beginPath();
      ctx.moveTo(x + d.x * size, y + d.y * size);
      ctx.lineTo(x - d.x * size * 0.7 + px * size * 0.7, y - d.y * size * 0.7 + py * size * 0.7);
      ctx.lineTo(x - d.x * size * 0.7 - px * size * 0.7, y - d.y * size * 0.7 - py * size * 0.7);
      ctx.closePath();
      if (fill) { ctx.fillStyle = rgba(rgb, 0.9); ctx.fill(); }
      ctx.strokeStyle = rgba(rgb, 1); ctx.lineWidth = 1.3; ctx.stroke();
    }

    /* ---- 水面舰船 / 平台 / 设施 ---- */
    for (i = 0; i < world.targets.length; i++) {
      var t = world.targets[i];
      if (!t.alive || (t.tags && t.tags.cullFar)) continue;
      var hostile = t.team === 1;
      if (hostile && !known(t)) continue;
      var rgb = hostile ? RED : t.team === 0 ? CYAN : GREY;
      var tp = P(t.pos.x, t.pos.z);
      var big = t.ship || t.platform;
      var half = big ? Math.max($.U(3.5), ((t.ship ? t.ship.dim[0] : t.platform.dim[0]) * k) / 2) : $.U(3);
      ctx.strokeStyle = rgba(rgb, 1); ctx.fillStyle = rgba(rgb, 0.25); ctx.lineWidth = 1.3;
      if (t.ship && t.fwd) {
        var d = dirOf(t.fwd), px = -d.y, py = d.x, w = Math.max($.U(2), (t.ship.dim[1] * k) / 2);
        ctx.beginPath();
        ctx.moveTo(tp.x + d.x * half, tp.y + d.y * half);
        ctx.lineTo(tp.x - d.x * half * 0.85 + px * w, tp.y - d.y * half * 0.85 + py * w);
        ctx.lineTo(tp.x - d.x * half * 0.85 - px * w, tp.y - d.y * half * 0.85 - py * w);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.rect(tp.x - half, tp.y - half, half * 2, half * 2); ctx.fill(); ctx.stroke();
      }
      if (big && t.label && !hostile) $.text(ctx, t.label, tp.x + half + $.U(4), tp.y + $.U(4), rgba(rgb, 0.95), $.FS, 'left');
    }

    /* ---- 飞机：友军 / 中立 / 已掌握的敌机 ---- */
    for (i = 0; i < world.actors.length; i++) {
      var a = world.actors[i];
      if (!a.alive || a === p) continue;
      if (a.team === 1 && !known(a)) continue;
      var ap = P(a.pos.x, a.pos.z);
      var ac = a.team === 1 ? RED : a.team === 0 ? CYAN : GREY;
      tri(ap.x, ap.y, dirOf(a.fwd), $.U(5.5), ac, true);      // 友军 / 敌方都实心，与雷达一致
    }
    var pp = P(p.pos.x, p.pos.z);
    tri(pp.x, pp.y, dirOf(p.fwd), $.U(8), GREEN, true);
    $.text(ctx, (typeof CALLSIGN !== 'undefined' && CALLSIGN.player) || 'VESPER-1', pp.x + $.U(11), pp.y - $.U(7), rgba(GREEN, 1), $.FS, 'left');
    ctx.restore();

    /* ---- 标题 / 提示 / 比例尺 / 指北 / 图例（底板上，不被裁剪）---- */
    $.text(ctx, T('ui.hud.tacmap.title'), left, top - $.U(14), $.GREEN, $.FB, 'left');
    $.text(ctx, T('ui.hud.tacmap.hint'), left + S, top - $.U(14), $.DIM, $.FS, 'right');
    var sl = 10000 * k, by = top + S + $.U(18);
    ctx.strokeStyle = 'rgba(143,163,178,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, by - $.U(4)); ctx.lineTo(left, by); ctx.lineTo(left + sl, by); ctx.lineTo(left + sl, by - $.U(4)); ctx.stroke();
    $.text(ctx, '10 KM', left + sl + $.U(6), by + $.U(3), $.DIM, $.FS, 'left');
    $.text(ctx, 'N ↑', left + S - $.U(34), by + $.U(3), $.AMBER, $.FS, 'left');
    $.text(ctx, T('ui.hud.tacmap.legend'), left + S / 2, by + $.U(3), $.DIM, $.FS, 'center');
  }
})(HUD);
