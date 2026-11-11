(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawRadar = drawRadar; $.farCell = farCell; $.radarXY = radarXY; $.drawPitchLadder = drawPitchLadder; $.threatState = threatState; $.drawThreatRing = drawThreatRing;

  /* ============================================================
     雷达（机头朝上）
     ============================================================ */
  function drawRadar(ctx, W, H, p, world) {
    // 雷达从"左下角"定位，半径受屏幕尺寸与缩放双重限制
    var R = Math.min($.U(104), Math.min(W, H) * 0.13);
    var cx = R + $.U(28), cy = H - R - $.U(32);
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

    // 战区边界（在光点之下）
    if (world && world.arenaDef) drawArenaEdges(ctx, cx, cy, R, range, p, world.arenaDef, world.resupply);
    if (world && world.resupply) drawResupplyZones(ctx, cx, cy, R, range, p, world.resupply);

    // 目标
    drawBlips(ctx, cx, cy, R, range, p, world);

    /* 本机：中心一个小箭头，指向机头的水平方位。雷达跟镜头转以后，
       机头不一定朝上 —— 这个箭头告诉你飞机实际往哪飞。 */
    var nd = radarDir(p.fwd.x, p.fwd.z), nl = Math.sqrt(nd.x * nd.x + nd.y * nd.y);
    if (nl > 0.05) {
      var ux = nd.x / nl, uy = nd.y / nl, L0 = $.U(7);
      ctx.fillStyle = $.CY;
      ctx.beginPath();
      ctx.moveTo(cx + ux * L0, cy + uy * L0);
      ctx.lineTo(cx - ux * L0 * 0.6 - uy * L0 * 0.55, cy - uy * L0 * 0.6 + ux * L0 * 0.55);
      ctx.lineTo(cx - ux * L0 * 0.25, cy - uy * L0 * 0.25);
      ctx.lineTo(cx - ux * L0 * 0.6 + uy * L0 * 0.55, cy - uy * L0 * 0.6 - ux * L0 * 0.55);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = $.DIM; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    /* 量程标签挪到更下面：方位字母在圆外转一圈，转到正下方时不能和它叠在一起 */
    $.text(ctx, 'RDR 12KM', cx, cy + R + $.U(26), $.DIM, $.FS, 'center');
    /* 方位字母放在圆外，跟着轴转到各自的位置，但字本身保持正向（只移位置、不旋转） */
    for (ci = 0; ci < 4; ci++) {
      var lr = R + $.U(10);
      $.text(ctx, card[ci][0], cx + pts[ci].x * lr, cy + pts[ci].y * lr + $.U(4),
        ci === 0 ? $.AMBER : $.DIM, $.FS, 'center');
    }
  }

  /* ---- 战区边界（docs/POST2-0IMPL.md 4.1）----
     **整个区域填满斜线**，不是只在分界线上画一排：
       警告区（边界内侧 warn 宽的带）  单斜线 "/"，半透明
       界外区（真边界以外的全部）      交叉斜线 "X"，更实
     每一侧的区域是一个梯形：四条对角线从战区中心穿过方形的四个角，把"警告带 / 界外"分给四侧
     （与 Arena.inEdge 的"主导方向"划分一致）。多边形端点用与 radarXY 同一套
     "镜头朝向 → 雷达坐标"换算，但**不做越界夹取**（夹取会让形状变形）；
     先 clip 到多边形、再铺斜线，超出雷达圆的部分由 drawRadar 的圆形 clip 裁掉。
     分界处各留一条细线。只画离本机 range 以内的那几块。
     rs = world.resupply：还有次数的界外整备区那一侧**换一种填法**：警告带不铺斜线，改成淡青**纯色半透明填充**
     （界外区仍是交叉斜线，只是改青色）—— 和其它侧的斜线一眼区分，看出"这一侧是整备区"。 */
  var ARENA_HATCH_GAP = 6;                // 斜线间距（U 单位）
  var ARENA_FAR = 12;                     // 界外区多边形伸到 half 的多少倍远（足够盖满雷达圆）
  var ARENA_EDGES = [                     // 外法线（世界）
    { nx: 1, nz: 0, side: '+x' }, { nx: -1, nz: 0, side: '-x' }, { nx: 0, nz: 1, side: '+z' }, { nx: 0, nz: -1, side: '-z' }
  ];
  var ARENA_COL = {
    warn: [255, 176, 58], out: [255, 74, 74], res: [79, 224, 255]
  };
  var ARENA_ALPHA = { warn: 0.34, out: 0.62, line: 0.85, resFill: 0.2 };

  function drawArenaEdges(ctx, cx, cy, R, range, p, ar, rs) {
    var k = R / range;
    function pt(wx, wz) {
      var u = radarDir(wx - p.pos.x, wz - p.pos.z);
      return { x: cx + u.x * k, y: cy + u.y * k };
    }
    var resSide = {};
    if (rs) for (var ri = 0; ri < rs.entries.length; ri++) {
      if (rs.entries[ri].def.edge && rs.entries[ri].uses > 0) resSide[rs.entries[ri].def.edge] = true;
    }
    var gap = $.U(ARENA_HATCH_GAP);

    /* 这一侧、离中心 h 处的点：沿外法线 h，沿切向 s×h（s = ±1，落在对角线上） */
    function corner(n, h, s) { return pt(ar.cx + n.nx * h - n.nz * h * s, ar.cz + n.nz * h + n.nx * h * s); }

    function hatch(poly, rgb, alpha, cross) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var t = -2 * R; t <= 2 * R; t += gap) {
        ctx.moveTo(cx - R + t, cy + R); ctx.lineTo(cx + R + t, cy - R);          // "/"
        if (cross) { ctx.moveTo(cx - R + t, cy - R); ctx.lineTo(cx + R + t, cy + R); }   // "\"，叠成 X
      }
      ctx.stroke();
      ctx.restore();
    }

    /* 纯色半透明填充：整备区那一侧的警告带 */
    function fillPoly(poly, rgb, alpha) {
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath();
      ctx.fill();
    }

    function line(a, b, rgb, alpha) {
      ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    var hIn = ar.half - ar.warn;
    for (var e = 0; e < 4; e++) {
      var n = ARENA_EDGES[e];
      var res = !!resSide[n.side];
      var wRgb = res ? ARENA_COL.res : ARENA_COL.warn, oRgb = res ? ARENA_COL.res : ARENA_COL.out;
      // 离本机多远：到警告带内缘 / 到真边界（负数 = 已经越过）
      var dRel = n.nx * (p.pos.x - ar.cx) + n.nz * (p.pos.z - ar.cz);
      var dIn = hIn - dRel, dOut = ar.half - dRel;
      if (dIn > range * 1.1) continue;                      // 警告带内缘都够不着，整侧不画

      // 警告带：内缘 hIn 与真边界 half 之间的梯形（整备区那一侧：纯色填充；其它侧：单斜线）
      var warnPoly = [corner(n, hIn, -1), corner(n, hIn, 1), corner(n, ar.half, 1), corner(n, ar.half, -1)];
      if (res) fillPoly(warnPoly, wRgb, ARENA_ALPHA.resFill);
      else hatch(warnPoly, wRgb, ARENA_ALPHA.warn, false);
      // 界外区：真边界以外一直伸到很远
      hatch([corner(n, ar.half, -1), corner(n, ar.half, 1), corner(n, ar.half * ARENA_FAR, 1), corner(n, ar.half * ARENA_FAR, -1)],
        oRgb, ARENA_ALPHA.out, true);
      // 分界细线
      line(corner(n, hIn, -1), corner(n, hIn, 1), wRgb, ARENA_ALPHA.line * 0.6);
      if (dOut <= range * 1.1) line(corner(n, ar.half, -1), corner(n, ar.half, 1), oRgb, ARENA_ALPHA.line);
    }
  }

  /* 单位整备点的触发范围：以该单位为圆心、半径 r 的淡青圈（还有次数时才画；裁剪由 drawRadar 的圆形 clip 负责） */
  function drawResupplyZones(ctx, cx, cy, R, range, p, rs) {
    ctx.strokeStyle = 'rgba(79,224,255,0.38)'; ctx.lineWidth = 1;
    for (var i = 0; i < rs.entries.length; i++) {
      var e = rs.entries[i];
      if (e.def.edge || e.uses <= 0 || !e.unit || !e.unit.alive) continue;
      var u = radarDir(e.unit.pos.x - p.pos.x, e.unit.pos.z - p.pos.z);
      ctx.beginPath(); ctx.arc(cx + u.x * R / range, cy + u.y * R / range, e.def.r * R / range, 0, Math.PI * 2); ctx.stroke();
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
    return t.tags.cullFar && M3.dist2(t.pos, p.pos) > CELL_HUD_RANGE2;
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

  // 敌机的红色三角光点（真敌机与假目标共用）
  function enemyTri(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4, y + 3.5); ctx.lineTo(x - 4, y + 3.5);
    ctx.closePath(); ctx.fill();
  }
  $.enemyTri = enemyTri;

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
      ctx.fillStyle = m.team === p.team ? $.CY : $.RED;
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
      ctx.fillStyle = friendly ? $.GREEN : (e.team > 1 ? 'rgba(160,170,178,0.8)' : $.RED);
      if (friendly) {
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.8, 0, Math.PI * 2); ctx.fill();
      } else {
        enemyTri(ctx, s.x, s.y);
      }
    }
    // 电磁干扰下的假目标（ghosts.js）：与真敌机同一个三角、同一套噪声
    $.ghostBlips(ctx, cx, cy, R, range, p, jam, world);
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
          : isShip ? (t.team === p.team ? $.GREEN : $.RED)
          : (t.ttype === 'air' ? $.AMBER : '#8fa3b2');
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
        $.text(ctx, lbl, cx - halfW - 7, s.y + 4, 'rgba(79,224,138,0.40)', $.FS, 'right');
        $.text(ctx, lbl, cx + halfW + 7, s.y + 4, 'rgba(79,224,138,0.40)', $.FS, 'left');
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
    var L = $.hmiLayout(W, H);
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
      plot(M3.sub(m.pos, p.pos), d < 2600 ? $.RED : $.AMBER);
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
    $.text(ctx, 'RWR', cx, cy - R - 26, 'rgba(255,176,58,0.5)', $.FS, 'center');
    if (msIn) {
      var bl = Math.sin(performance.now() * 0.016) > 0;
      if (bl) {
        $.text(ctx, T('ui.hud.radar.drawThreatRing.s1'), cx, cy - R - 12, $.RED, 'bold 13px Consolas,monospace', 'center');
      }
    } else if (any) {
      $.text(ctx, T('ui.hud.radar.drawThreatRing.s2'), cx, cy - R - 12, $.AMBER, $.FS, 'center');
    }
  }
})(HUD);
