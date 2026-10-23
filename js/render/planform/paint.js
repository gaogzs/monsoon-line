(function (PLANFORM) {
  'use strict';
  var $ = PLANFORM.$;
  $.paint = paint; $.draw = draw; $.paintStore = paintStore;

  /* ============================================================
     主绘制
     ============================================================ */
  /** 该机型有哪几组挂载点 */
  function groupsOf(ac) {
    return (ac && ac.hardpointGroups) ? ac.hardpointGroups : [];
  }

  /** 某组挂了什么，返回 { wid, w, n, count } */
  function groupStore(ac, g, loadout) {
    var wid = loadout ? loadout[g.id] : null;
    var w = (wid && WEAPONS[wid]) ? WEAPONS[wid] : null;
    var n = g.pts.length;
    return {
      wid: w ? wid : null,
      w: w,
      n: n,
      count: w ? n * (w.perPoint || 1) : 0
    };
  }

  /**
   * 把识别图画进任意 2D 上下文里的一个矩形区域。
   *
   * 机库的大图和战斗 HUD 右下角的小图走的是同一份代码 ——
   * 分成两份写的话，两边一定会慢慢长得不一样。
   *
   * opts.active   当前高亮的挂载点组
   * opts.cd       { 武器 id: 0..1 }，1 = 刚打完，0 = 已就绪
   * opts.compact  紧凑模式：省掉标注与尺寸线（HUD 用）
   */
  function paint(g, bx, by, bw, bh, ac, loadout, opts) {
    opts = opts || {};
    var pf = $.P[ac.model];
    var groups = groupsOf(ac);
    var compact = !!opts.compact;
    var cd = opts.cd || null;
    var W = bw, H = bh;

    g.save();
    g.translate(bx, by);

    /* ---- 配色：与界面同一套军用航电色 ---- */
    var INK = '#8fa8b8';          // 主轮廓
    var INK2 = 'rgba(143,168,184,0.42)';  // 内部结构线
    var INK3 = 'rgba(143,168,184,0.18)';  // 参考虚线
    var AMBER = '#ffb03a';
    var CY = '#45d6ff';
    var STORE = '#4fe08a';

    if (!pf) {
      g.fillStyle = 'rgba(143,168,184,0.5)';
      g.font = '13px Consolas,monospace';
      g.textAlign = 'center';
      g.fillText('NO DATA', W / 2, H / 2);
      g.restore();
      return;
    }

    /* ---- 缩放：大图左右留标注栏，小图只留一点边距 ---- */
    var padL = compact ? 10 : 132;
    var padR = compact ? 10 : 132;
    var padY = compact ? 10 : 44;
    var k = Math.min((W - padL - padR) / pf.span, (H - padY * 2) / pf.len);
    var cx = padL + (W - padL - padR) / 2, cy = H / 2;

    function TX(x) { return cx + x * k; }
    function TY(y) { return cy - y * k; }

    /* ---- 内部填充面 ---- */
    for (var f = 0; f < pf.fills.length; f++) {
      var fl = pf.fills[f];
      g.beginPath();
      g.moveTo(TX(fl.pts[0][0]), TY(fl.pts[0][1]));
      for (var q = 1; q < fl.pts.length; q++) g.lineTo(TX(fl.pts[q][0]), TY(fl.pts[q][1]));
      g.closePath();
      g.fillStyle = 'rgba(69,214,255,' + fl.a + ')';
      g.fill();
      g.strokeStyle = CY;
      g.lineWidth = 1.2;
      g.stroke();
    }

    /* ---- 参考虚线（先画，被轮廓压住） ---- */
    g.setLineDash([5, 5]);
    g.strokeStyle = INK3;
    g.lineWidth = 1;
    for (var d = 0; d < pf.dash.length; d++) {
      var seg = pf.dash[d];
      g.beginPath();
      g.moveTo(TX(seg[0][0]), TY(seg[0][1]));
      g.lineTo(TX(seg[1][0]), TY(seg[1][1]));
      g.stroke();
    }
    g.setLineDash([]);

    /* ---- 挂载 ----
       先画挂载、后画轮廓：让机翼与机身的线条压在导弹之上，
       视觉上就读作"挂在翼下"。识别图就是这个画法 ——
       如果反过来先画轮廓再叠挂载，导弹会像浮在机翼上面。 */
    for (var gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi];
      var st = groupStore(ac, grp, loadout);
      var isActive = (opts.active && grp.id === opts.active);
      // 这种武器每个挂载点一个槽，所以进度是一个数组
      var cdArr = (cd && st.wid) ? cd[st.wid] : null;

      for (var pi = 0; pi < grp.pts.length; pi++) {
        var hp = grp.pts[pi];
        var px = TX(hp.x), py = TY(hp.y);

        if (!st.w) {
          // 空置：只留一个方框标记
          g.strokeStyle = isActive ? AMBER : 'rgba(79,224,138,0.40)';
          g.lineWidth = 1.2;
          g.strokeRect(px - 3.5, py - 3.5, 7, 7);
          continue;
        }

        /* ready = 就绪度：0 刚打完（空壳），1 装填完毕（满）。
           没有进度信息时当作满的。 */
        var ready = cdArr ? M3.clamp(
          cdArr[pi] === undefined ? 1 : cdArr[pi], 0, 1) : 1;

        if (ready < 0.998) {
          /* 装填中：先铺一层暗绿轮廓表示"这个挂架空了"，
             再用裁剪把亮绿**从下往上**填回来。
             进度条就是这个弹体本身 —— 不用另找地方放一条，
             而且一眼就能看出是哪一组的哪一发在装填。 */
          g.strokeStyle = 'rgba(79,224,138,0.20)';
          g.lineWidth = 1.3;
          $.drawStore(g, px, py, st.w, k, { line: 1.3 });

          if (ready > 0.002) {
            var Lc = $.storeLen(st.w, k), Hc = $.storeHalfW(st.w, k);
            g.save();
            g.beginPath();
            g.rect(px - Hc, py + Lc / 2 - Lc * ready, Hc * 2, Lc * ready);
            g.clip();
            g.strokeStyle = STORE;
            g.lineWidth = 1.4;
            $.drawStore(g, px, py, st.w, k, { line: 1.4 });
            g.restore();
          }
        } else {
          g.strokeStyle = isActive ? AMBER : STORE;
          g.lineWidth = isActive ? 2 : 1.3;
          $.drawStore(g, px, py, st.w, k, { line: isActive ? 2 : 1.3 });
        }
      }
    }

    /* ---- 可变后掠：展开位参考线（左右镜像各画一条） ---- */
    if (pf.sweepAlt) {
      g.setLineDash([3, 4]);
      g.strokeStyle = 'rgba(69,214,255,0.42)';
      g.lineWidth = 1;
      for (var sa = 0; sa < pf.sweepAlt.length; sa++) {
        var sl = pf.sweepAlt[sa];
        g.beginPath();
        g.moveTo(TX(sl[0][0]), TY(sl[0][1]));
        g.lineTo(TX(sl[1][0]), TY(sl[1][1]));
        g.moveTo(TX(-sl[0][0]), TY(sl[0][1]));
        g.lineTo(TX(-sl[1][0]), TY(sl[1][1]));
        g.stroke();
      }
      g.setLineDash([]);

      // 铰链点
      if (pf.sweepPivot) {
        g.fillStyle = 'rgba(69,214,255,0.75)';
        g.beginPath();
        g.arc(TX(pf.sweepPivot.x), TY(pf.sweepPivot.y), 2.4, 0, Math.PI * 2);
        g.arc(TX(-pf.sweepPivot.x), TY(pf.sweepPivot.y), 2.4, 0, Math.PI * 2);
        g.fill();
      }

      if (pf.sweepLabel) {
        g.fillStyle = 'rgba(69,214,255,0.62)';
        g.font = '10px Consolas,monospace';
        g.textAlign = 'left';
        g.fillText(pf.sweepLabel, 12, 18);
      }
    }

    /* ---- 内部结构线 ---- */
    g.strokeStyle = INK2;
    g.lineWidth = 1;
    for (var i = 0; i < pf.lines.length; i++) {
      var ln = pf.lines[i];
      g.beginPath();
      g.moveTo(TX(ln[0][0]), TY(ln[0][1]));
      g.lineTo(TX(ln[1][0]), TY(ln[1][1]));
      g.stroke();
    }

    /* ---- 主轮廓 ---- */
    g.beginPath();
    g.moveTo(TX(pf.outline[0][0]), TY(pf.outline[0][1]));
    for (i = 1; i < pf.outline.length; i++) {
      g.lineTo(TX(pf.outline[i][0]), TY(pf.outline[i][1]));
    }
    g.closePath();
    g.strokeStyle = INK;
    g.lineWidth = 1.8;
    g.joinStyle = 'round';
    g.stroke();

    /* ---- 挂载点标注 ----
       从每组挂载点引一条折线到右侧标注栏，上写组号、下写型号。
       识别图的惯例画法，也让"哪根挂架对应哪一行"一目了然。
       只标右翼那一侧，左边镜像只画挂载本身，免得糊成一团。 */
    if (groups.length && !compact) {
      g.font = '10px Consolas,monospace';
      for (var gi2 = 0; gi2 < groups.length; gi2++) {
        var grp2 = groups[gi2];
        var st2 = groupStore(ac, grp2, loadout);
        var isAct = (opts.active && grp2.id === opts.active);

        /* 左右分栏：偶数索引标右侧、奇数索引标左侧。
           全堆在一侧会四线交叉穿过机身，糊成一团。 */
        var sgn = (gi2 % 2 === 0) ? 1 : -1;
        var anchor = sgn > 0 ? grp2.pts[0] : grp2.pts[grp2.pts.length - 1];
        var ax = TX(anchor.x), ay = TY(anchor.y);

        var rank = Math.floor(gi2 / 2);
        var ly = 44 + rank * 34;
        var edge = sgn > 0 ? W - 14 : 14;
        var bendX = sgn > 0 ? W - 122 : 122;
        var col = isAct ? AMBER : 'rgba(143,168,184,0.45)';

        g.strokeStyle = col;
        g.lineWidth = isAct ? 1.5 : 1;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(ax + sgn * 10, ly);
        g.lineTo(bendX, ly);
        g.lineTo(edge, ly);
        g.stroke();

        // 锚点
        g.fillStyle = col;
        g.beginPath();
        g.arc(ax, ay, 2.2, 0, Math.PI * 2);
        g.fill();

        // 文字靠边对齐，免得跑出画布
        g.textAlign = sgn > 0 ? 'right' : 'left';
        g.fillStyle = isAct ? AMBER : INK;
        g.fillText('GROUP ' + grp2.id, edge, ly - 5);
        g.fillStyle = st2.w ? (isAct ? AMBER : STORE) : 'rgba(143,168,184,0.42)';
        g.fillText(st2.w ? (st2.w.name + ' ×' + st2.count) : T('render.planform.paint.paint.s1'), edge, ly + 11);
        g.textAlign = 'center';
      }
    }

    /* ---- 机炮 ---- */
    if (pf.cannon) {
      var kx = TX(pf.cannon.x), ky = TY(pf.cannon.y);
      g.fillStyle = AMBER;
      g.beginPath();
      g.arc(kx, ky, 2.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,176,58,0.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(kx, ky);
      g.lineTo(kx, ky - 0.9 * k * 0.5);
      g.stroke();
    }

    /* ---- 尺寸标注（只有大图才画，小图放不下也没必要） ---- */
    if (!compact) {
    g.strokeStyle = 'rgba(143,168,184,0.45)';
    g.lineWidth = 1;
    g.font = '11px Consolas,monospace';
    g.fillStyle = 'rgba(143,168,184,0.72)';

    // 翼展（上方）
    var wy = 20;
    g.beginPath();
    g.moveTo(TX(-pf.span / 2), wy); g.lineTo(TX(pf.span / 2), wy);
    g.moveTo(TX(-pf.span / 2), wy - 5); g.lineTo(TX(-pf.span / 2), wy + 5);
    g.moveTo(TX(pf.span / 2), wy - 5); g.lineTo(TX(pf.span / 2), wy + 5);
    g.stroke();
    g.textAlign = 'center';
    g.fillText(T('render.planform.paint.paint.s2') + pf.span.toFixed(1) + ' m', cx, wy - 7);

    // 机长（左侧）
    var lx = 22;
    g.beginPath();
    g.moveTo(lx, TY(-pf.len / 2)); g.lineTo(lx, TY(pf.len / 2));
    g.moveTo(lx - 5, TY(-pf.len / 2)); g.lineTo(lx + 5, TY(-pf.len / 2));
    g.moveTo(lx - 5, TY(pf.len / 2)); g.lineTo(lx + 5, TY(pf.len / 2));
    g.stroke();
    g.save();
    g.translate(lx - 9, cy);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.fillText(T('render.planform.paint.paint.s3') + pf.len.toFixed(1) + ' m', 0, 0);
    g.restore();

    }   // end if (!compact) —— 尺寸标注

    /* ---- 方向提示 ---- */
    if (!compact) {
      g.fillStyle = 'rgba(143,168,184,0.5)';
      g.font = '10px Consolas,monospace';
      g.textAlign = 'right';
      g.fillText(T('render.planform.paint.paint.s4'), W - 12, H - 12);
      g.textAlign = 'left';
      g.fillStyle = AMBER;
      g.fillText('▲ NOSE', 12, H - 12);
    }

    g.restore();
  }

  /** 机库里的完整识别图：铺满整个 canvas */
  function draw(cv, ac, loadout, activeGroup, cd) {
    if (!cv) return;
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#070d12';
    g.fillRect(0, 0, W, H);

    // 网格底纹（技术图纸感）
    g.save();
    g.strokeStyle = 'rgba(69,214,255,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    for (var gx = 0; gx <= W; gx += 22) { g.moveTo(gx + .5, 0); g.lineTo(gx + .5, H); }
    for (var gy = 0; gy <= H; gy += 22) { g.moveTo(0, gy + .5); g.lineTo(W, gy + .5); }
    g.stroke();
    g.restore();

    paint(g, 0, 0, W, H, ac, loadout, { active: activeGroup, cd: cd });
  }

  /* 单件挂载的放大图（武器单页用）：机头朝上居中，带长度标尺。 */
  function paintStore(g, W, H, w) {
    var lk = w.look;
    var lenM = lk ? lk.len + (lk.nest ? 0.3 : 0) : ($.STORE_LEN[w.kind] || 3.0);
    var k = (H * 0.70) / lenM;
    var hw = $.storeHalfW(w, k);
    if (hw * 2 > W * 0.6) k *= (W * 0.6) / (hw * 2);
    var L = $.storeLen(w, k);
    var cx = W / 2, cy = H / 2;
    g.save();
    g.strokeStyle = '#4fe08a';
    $.drawStore(g, cx, cy, w, k, { line: 1.8 });
    // 长度标尺
    var rx = cx + $.storeHalfW(w, k) + 28;
    g.strokeStyle = 'rgba(143,168,184,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(rx, cy - L / 2); g.lineTo(rx, cy + L / 2);
    g.moveTo(rx - 5, cy - L / 2); g.lineTo(rx + 5, cy - L / 2);
    g.moveTo(rx - 5, cy + L / 2); g.lineTo(rx + 5, cy + L / 2);
    g.stroke();
    g.fillStyle = 'rgba(143,168,184,0.85)';
    g.font = '13px Consolas,monospace';
    g.textAlign = 'left';
    g.fillText(lenM.toFixed(1) + ' m', rx + 9, cy + 4);
    if (lk && (lk.rack > 1 || lk.nest)) {
      g.textAlign = 'center';
      g.fillText(lk.nest ? (lk.cells + T('render.planform.paint.paintStore.s1')) : (lk.rack + T('render.planform.paint.paintStore.s2')), cx, cy + L / 2 + 26);
    }
    g.restore();
  }
})(PLANFORM);
