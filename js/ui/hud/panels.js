(function (HUD) {
  'use strict';
  var $ = HUD.$;
  $.drawWeaponPanel = drawWeaponPanel; $.drawAlerts = drawAlerts; $.drawStores = drawStores; $.drawFriendlyShots = drawFriendlyShots; $.drawIncomingMissiles = drawIncomingMissiles; $.drawTargetBearing = drawTargetBearing; $.drawObjective = drawObjective;

  /* ============================================================
     武器 / 弹药面板
     ============================================================ */
  function drawWeaponPanel(ctx, W, H, p) {
    // 底部中央，间距从下边界算起并夹上限
    var x = W / 2, y = H - $.gap(74, H, 0.11);

    ctx.textAlign = 'center';

    // 机炮
    var gCol = p.gunAmmo > 0 ? $.GREEN : $.RED;
    $.text(ctx, 'GUN  ' + p.gunAmmo, x - 172, y, gCol, $.FB, 'center');

    // 干扰弹（热焰弹 + 箔丝，单位是"组"）
    $.text(ctx, 'DECOY ' + p.flares, x + 172, y, p.flares > 0 ? $.GREEN : $.RED, $.FB, 'center');

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

      var col = ammo > 0 ? (cur ? $.CY : 'rgba(185,200,212,0.5)') : $.RED;
      if (cur && p.spCd > 0) col = $.AMBER;

      if (cur) $.text(ctx, '>', x - 92, ry, $.AMBER, $.FB, 'left');
      $.text(ctx, e.w.name, x - 76, ry, col, $.FB, 'left');
      $.text(ctx, String(ammo), x + 58, ry, col, $.FB, 'right');

      /* 发射槽指示：● 就绪、○ 装填中。
         一个槽 = 能立刻打出的一发；全部空心的意思就是
         "现在按发射键没反应，得等"。 */
      var sl = p.slotCd ? p.slotCd[e.wid] : null;
      if (sl && sl.length) {
        var dots = '';
        for (var d = 0; d < sl.length; d++) dots += (sl[d] <= 0 ? '●' : '○');
        $.text(ctx, dots, x + 70, ry, $.DIM, $.FS, 'left');
      }
    }

    if (lst.length) {
      var cw = lst[p.wpIdx] ? lst[p.wpIdx].w : lst[0].w;
      $.text(ctx, cw.cn, x, top + lst.length * rowH + 4, $.DIM, $.FS, 'center');
      if (p.spCd > 0) {
        $.text(ctx, 'RLD ' + p.spCd.toFixed(1) + 's', x + 132, y - 12, $.AMBER, $.FS, 'left');
      }
    } else {
      $.text(ctx, T('ui.hud.panels.drawWeaponPanel.s1'), x, y - 10, $.RED, $.FB, 'center');
    }

    // 结构完整度
    var hpK = p.hp / p.maxHp;
    var hw = $.U(190);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - hw / 2, y + 24, hw, 6);
    ctx.fillStyle = hpK > 0.6 ? $.GREEN : (hpK > 0.3 ? $.AMBER : $.RED);
    ctx.fillRect(x - hw / 2, y + 24, hw * M3.clamp(hpK, 0, 1), 6);
    $.text(ctx, 'HULL ' + (hpK * 100).toFixed(0) + '%', x, y + 44, $.DIM, $.FS, 'center');
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
  $.ALERT_ORDER = ['missile', 'lit', 'damage', 'terrain', 'stall', 'lowq', 'jammed', 'winchester', 'emcon'];

  $.alertsBottom = 0;

  // 告警栈最后一行的下沿 —— 任务横幅从它下面开始
  function drawAlerts(ctx, W, H, p, world) {
    var now = performance.now();
    var bl = Math.sin(now * 0.014) > 0;
    var blFast = Math.sin(now * 0.018) > -0.35;
    var BIG = 'bold ' + (30 * $.HUDK).toFixed(0) + 'px Consolas,monospace';
    var F1 = 'bold ' + (24 * $.HUDK).toFixed(0) + 'px Consolas,monospace';
    var F2 = 'bold ' + (21 * $.HUDK).toFixed(0) + 'px Consolas,monospace';
    var list = [];

    var th = world ? $.threatState(p, world) : { inb: 0, lit: false };
    if (th.inb) {
      var dTxt = th.minD < 1000 ? Math.round(th.minD) + ' M' : (th.minD / 1000).toFixed(1) + ' KM';
      list.push({ id: 'missile', txt: T('ui.hud.panels.drawAlerts.txt_'), col: $.RED, font: BIG, on: blFast, h: $.U(34),
        sub: dTxt, subH: $.U(26) });
    } else if (th.lit || (world && world.detected)) {
      /* 导弹已经在路上时不再单独报"被照射" —— 那是同一件事的前半段。
         被对空雷达截获（DETECTED）并进 SPIKE：同一件事，只是照射源不同 */
      list.push({ id: 'lit', txt: th.lit ? T('ui.hud.panels.drawAlerts.txt.s1') : T('ui.hud.panels.drawAlerts.txt.s2'), col: $.AMBER, font: BIG, on: true, h: $.U(34) });
    }
    if (Ent.agl(p) < 200 && p.fwd.y < 0) list.push({ id: 'terrain', txt: T('ui.hud.panels.drawAlerts.txt_2'), col: $.RED, font: F1, on: bl, h: $.U(30) });
    if (p.stall) list.push({ id: 'stall', txt: T('ui.hud.panels.drawAlerts.txt_3'), col: $.RED, font: F1, on: bl, h: $.U(30) });
    if (p.pos.y > 18000 && p.q < 12) list.push({ id: 'lowq', txt: T('ui.hud.panels.drawAlerts.txt_4'), col: $.AMBER, font: F2, on: bl, h: $.U(30) });
    /* 电子战的两个状态：受扰与静默。
       它们都是"你看不见别人 / 别人看不见你"的状态，必须一眼可辨 ——
       否则玩家只会觉得"雷达今天有点难用"。 */
    /* 受扰是常态告警：不闪、颜色压暗 —— 一直挂着提醒你"现在看到的不全"，但不抢眼。 */
    if ((p.suppressed || 0) > 0.05 || (p.ewPower || 0) > 0) list.push({ id: 'jammed', txt: T('ui.hud.panels.drawAlerts.txt_5'), col: 'rgba(255,176,58,0.62)', font: F2, on: true, h: $.U(30) });
    /* 受损：最后一次掉血后挂 HudFx.FX.alertHold 秒，快闪 */
    if (typeof HudFx !== 'undefined' && HudFx.alertOn()) list.push({ id: 'damage', txt: T('ui.hud.panels.drawAlerts.txt_6'), col: $.RED, font: F1, on: blFast, h: $.U(30) });
    if (p.gunAmmo <= 0 && p.spAmmo <= 0) list.push({ id: 'winchester', txt: T('ui.hud.panels.drawAlerts.txt_7'), col: $.AMBER, font: F2, on: bl, h: $.U(30) });
    if (p.emcon) list.push({ id: 'emcon', txt: T('ui.hud.panels.drawAlerts.txt_8'), col: $.CY, font: F2, on: true, h: $.U(30) });

    list.sort(function (a, b) { return $.ALERT_ORDER.indexOf(a.id) - $.ALERT_ORDER.indexOf(b.id); });

    /* 起点让开顶部的任务目标块（目标行 U(92)、副行 U(110)、时限 U(128)）。 */
    var y = Math.max(H * 0.22, $.U(128) + $.U(48));
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      a.y = y;
      if (a.on) $.text(ctx, a.txt, W / 2, y, a.col, a.font, 'center');
      y += a.h;
      if (a.sub) {
        $.text(ctx, a.sub, W / 2, y - $.U(6), a.col, $.FB, 'center');
        y += a.subH;
      }
    }
    $.alertsBottom = list.length ? y : 0;
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

    var L = $.hmiLayout(W, H);
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

    /* 当前选中的武器（R 键切换的那一种）整组画成白色 */
    var cur = lst[p.wpIdx];
    PLANFORM.paint(ctx, bx, by, size, size, p.ac, p.loadout,
      { compact: true, cd: cd, activeWid: cur ? cur.wid : null,
        activeColor: '#ffffff' });

    $.text(ctx, 'STORES', bx + size / 2, by - 5, $.DIM, $.FS, 'center');
  }

  /* ============================================================
     本方射弹
     玩家自己打出去的导弹 / 炸弹套蓝色菱形（和来袭导弹的红菱形同形），
     方便追踪落点 —— 尤其是没有尾迹的无动力炸弹。僚机和其他友军的弹不标。
     火箭（`burn`）一次一大把、
     飞行时间短，不标。离本机 FRIENDLY_SHOT_MIN 米以内不画，免得刚离架就套框。
     只画屏幕内的，不给屏外箭头：边缘已经够挤了。
     ============================================================ */
  var FRIENDLY_SHOT_MIN = 300;

  function drawFriendlyShots(ctx, W, H, cam, p, world) {
    if (!world || !world.missiles || !world.missiles.length) return;
    ctx.strokeStyle = $.BLUE;
    ctx.lineWidth = 1.4;
    for (var i = 0; i < world.missiles.length; i++) {
      var m = world.missiles[i];
      if (!m.alive || m.owner !== p || m.w.burn) continue;
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
    var offRect = $.offscreenRect(W, H, p);

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
        ctx.strokeStyle = $.RED;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - r);
        ctx.lineTo(s.x + r, s.y);
        ctx.lineTo(s.x, s.y + r);
        ctx.lineTo(s.x - r, s.y);
        ctx.closePath();
        ctx.stroke();

        $.text(ctx, dist < 1000 ? Math.round(dist) + 'M' : (dist / 1000).toFixed(1) + 'KM',
          s.x, s.y + r + 13, $.RED, $.FS, 'center');
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
      var pt = $.edgePoint(W / 2, H / 2, dx, dy, offRect);
      var ex = pt.x, ey = pt.y;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = bl ? $.RED : 'rgba(255,77,77,0.42)';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, -9);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      $.text(ctx, (dist / 1000).toFixed(1) + 'KM',
        ex - dx * 24, ey - dy * 24 + 4, $.RED, $.FS, 'center');
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
    var col = (t.kind === 'target') ? '#ffb03a' : $.RED;

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
      $.text(ctx, 'LOCK', mx, my - 18, col, 'bold 11px Consolas,monospace', 'center');
    }

    // 距离 / 方位读数
    $.text(ctx, (dist / 1000).toFixed(1) + ' KM', cx - halfW - 12, cy + 4,
      col, $.FS, 'right');
    $.text(ctx, (az >= 0 ? 'R' : 'L') + Math.abs(Math.round(az * 57.2958)) + '°',
      cx + halfW + 12, cy + 4, col, $.FS, 'left');
  }

  function drawObjective(ctx, W, H, world) {
    if (!world.objective) return;
    // 让开顶部的指南针
    $.text(ctx, world.objective, W / 2, $.U(92), 'rgba(79,224,138,0.85)',
      'bold ' + (14 * $.HUDK).toFixed(1) + 'px Consolas,monospace', 'center');
    if (world.objectiveSub) {
      $.text(ctx, world.objectiveSub, W / 2, $.U(110), $.DIM, $.FS, 'center');
    }

    /* 关卡时限。只有声明了 timeLimit 的关卡才画 —— 没时限的任务
       在目标行下面多出一行 "--:--" 只会让人以为漏看了什么。
       最后 30 秒转琥珀色：那是"该做决定了"的颜色。 */
    if (world.timeLimit > 0) {
      var tl = Math.max(0, world.timeLeft);
      var mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
      var stamp = (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
      $.text(ctx, 'TIME  ' + stamp, W / 2, $.U(128), tl <= 30 ? $.AMBER : $.DIM,
        'bold ' + (13 * $.HUDK).toFixed(1) + 'px Consolas,monospace', 'center');
    }
  }
})(HUD);
