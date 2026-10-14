/* ============================================================
   planform.js —— 机库里的俯视识别图
   画风取向：老式军事识别图 / 技术插图 —— 深底、单色细线、
   只保留必要结构线，不用渐变色块，不用阴影。
   挂载按当前选中的特殊武器实时改变形状。

   坐标系与三维模型保持一致：机头朝 +y（图上朝上），右翼朝 +x，单位米。
   ============================================================ */
'use strict';

var PLANFORM = (function () {

  /* ============================================================
     轮廓数据
     outline  : 闭合主轮廓
     lines    : 内部线条（结构线、分块线）
     dash     : 虚线（中心线、参考线）
     fills    : 需要轻微填充的面（座舱盖之类）
     hardpoints: 挂点位置
     cannon   : 机炮位置
     ============================================================ */

  var P = {};

  /* ---------------- C-11 军舰鸟 · 变后掠翼多用途 ---------------- */
  P.c11 = {
    span: 15.2,
    len: 20.4,
    outline: [
      [0, 10.2],
      [0.72, 7.4], [1.12, 4.6], [1.50, 2.6],
      [7.6, -1.9], [7.6, -3.7],
      [1.52, -3.35], [1.56, -3.9], [1.24, -7.4],
      [3.3, -8.5], [3.3, -9.7],
      [1.00, -9.9],
      [-1.00, -9.9],
      [-3.3, -9.7], [-3.3, -8.5],
      [-1.24, -7.4], [-1.56, -3.9], [-1.52, -3.35],
      [-7.6, -3.7], [-7.6, -1.9],
      [-1.50, 2.6], [-1.12, 4.6], [-0.72, 7.4]
    ],
    lines: [
      // 主翼前/后梁
      [[1.50, 2.4], [7.4, -2.0]],
      [[1.50, -3.4], [7.4, -3.6]],
      // 机翼后缘折角
      [[1.56, -3.9], [7.6, -3.7]],
      // 平尾
      [[1.24, -7.6], [3.2, -8.6]],
      // 进气道外壁
      [[1.52, 1.4], [1.52, -3.0]],
      // 机身分段
      [[1.56, -1.2], [-1.56, -1.2]],
      // 尾喷口
      [[0.50, -9.9], [0.50, -9.2]],
      [[-0.50, -9.9], [-0.50, -9.2]]
    ],
    dash: [
      [[0, 10.4], [0, -10.1]],           // 机身中心线
      [[0, 4.6], [7.4, 2.4]],            // 后掠铰链参考
      [[0, 4.6], [-7.4, 2.4]]
    ],
    fills: [
      { pts: [[0, 8.7], [0.56, 6.3], [0, 5.0], [-0.56, 6.3]], a: 0.20 }
    ],
    // 可变后掠：主线画后掠位，虚线标出展开位，让"机翼会动"这件事可见
    sweepAlt: [
      [[1.30, 2.4], [7.8, 1.2]],       // 展开位前缘
      [[1.50, -3.4], [7.8, -1.4]]      // 展开位后缘
    ],
    sweepPivot: { x: 1.45, y: 1.9 },
    sweepLabel: '可变后掠 11°–35°',
    cannon: { x: 0.50, y: 7.2 }
  };

  /* ---------------- C-14 旗鱼 · 平流层制空 ---------------- */
  P.c14 = {
    span: 13.8,
    len: 22.9,
    outline: [
      [0, 11.4],
      [0.78, 8.2], [1.34, 4.2], [1.28, 2.2],
      [6.9, -5.6], [6.9, -7.2],
      [1.28, -6.55], [1.44, -7.0],
      [3.7, -8.7], [3.7, -10.0],
      [1.06, -10.6],
      [-1.06, -10.6],
      [-3.7, -10.0], [-3.7, -8.7],
      [-1.44, -7.0], [-1.28, -6.55],
      [-6.9, -7.2], [-6.9, -5.6],
      [-1.28, 2.2], [-1.34, 4.2], [-0.78, 8.2]
    ],
    lines: [
      // 菱形翼前缘与后缘
      [[1.30, 2.0], [6.7, -5.7]],
      [[1.30, -6.4], [6.7, -7.0]],
      // 翼下弹舱门
      [[2.6, -2.4], [5.2, -4.6]],
      // V 尾
      [[1.44, -7.2], [3.6, -8.8]],
      // 机身棱线（菱形截面）
      [[0.78, 8.2], [0.78, -10.0]],
      [[-0.78, 8.2], [-0.78, -10.0]],
      // 尾喷口
      [[0.46, -10.6], [0.46, -9.9]],
      [[-0.46, -10.6], [-0.46, -9.9]]
    ],
    dash: [
      [[0, 11.6], [0, -10.8]],
      [[0, 5.2], [6.6, -0.4]],
      [[0, 5.2], [-6.6, -0.4]]
    ],
    fills: [
      { pts: [[0, 9.6], [0.60, 6.6], [0, 5.2], [-0.60, 6.6]], a: 0.20 }
    ],
    cannon: { x: 0.44, y: 8.0 }
  };

  /* ---------------- S-6 鲣鸟 · 近距支援 ---------------- */
  P.s6 = {
    span: 17.2,
    len: 19.4,
    outline: [
      [0, 9.7],
      [0.64, 8.9], [1.16, 6.4], [1.56, 2.3],
      [8.6, 0.5], [8.6, -2.6],
      [1.56, -3.1], [1.66, -3.3], [1.36, -7.0],
      [4.1, -6.9], [4.1, -8.7],
      [1.12, -9.2],
      [-1.12, -9.2],
      [-4.1, -8.7], [-4.1, -6.9],
      [-1.36, -7.0], [-1.66, -3.3], [-1.56, -3.1],
      [-8.6, -2.6], [-8.6, 0.5],
      [-1.56, 2.3], [-1.16, 6.4], [-0.64, 8.9]
    ],
    lines: [
      // 平直翼前后梁
      [[1.55, 2.1], [8.4, 0.6]],
      [[1.55, -3.0], [8.4, -2.5]],
      // 翼下发动机短舱
      [[2.35, 1.2], [2.35, -5.2]],
      [[-2.35, 1.2], [-2.35, -5.2]],
      [[2.35, -5.2], [2.35, -5.9]],
      [[-2.35, -5.2], [-2.35, -5.9]],
      // 平尾
      [[1.32, -7.2], [4.0, -7.0]],
      // 机头机炮
      [[0.34, 9.4], [0.34, 6.6]],
      [[-0.34, 9.4], [-0.34, 6.6]],
      // 机身分段
      [[1.66, -1.4], [-1.66, -1.4]]
    ],
    dash: [
      [[0, 9.9], [0, -9.4]],
      [[0, 4.0], [8.4, 1.2]],
      [[0, 4.0], [-8.4, 1.2]]
    ],
    fills: [
      { pts: [[0, 7.6], [0.68, 5.2], [0, 3.6], [-0.68, 5.2]], a: 0.20 }
    ],
    cannon: { x: 0.34, y: 8.4 }
  };

  /* ============================================================
     挂载外形
     以 (x, y) 为中心、机头朝上绘制。k 是像素/米，用于把真实尺寸
     折算成图上长度，这样不同导弹在图上确实长短有别。
     ============================================================ */
  var STORE_LEN = {
    aam: 3.4, asm: 4.6, agm: 4.0, bomb: 2.2,
    ecm: 3.2, dew: 3.6      // 吊舱类比导弹短粗
  };

  /* 吊舱类：方形截面，外形要一眼区别于导弹 */
  function isPod(kind) {
    return kind === 'ecm' || kind === 'dew';
  }

  function drawStore(g, x, y, kind, k, style) {
    var L = (STORE_LEN[kind] || 3.0) * k;
    var W;

    switch (kind) {
      case 'aam':   W = Math.max(2, 0.22 * k); break;
      case 'asm':   W = Math.max(2.5, 0.30 * k); break;
      case 'agm':   W = Math.max(2.2, 0.26 * k); break;
      case 'bomb':  W = Math.max(3, 0.48 * k); break;
      case 'ecm':   W = Math.max(4, 0.62 * k); break;
      case 'dew':   W = Math.max(4.5, 0.78 * k); break;
      default:      W = Math.max(2, 0.30 * k);
    }

    g.lineWidth = style.line;

    if (isPod(kind)) {
      // 电子战 / 定向能吊舱：方头方脑，头部略收
      g.beginPath();
      g.moveTo(x - W * 0.34, y - L / 2);
      g.lineTo(x + W * 0.34, y - L / 2);
      g.lineTo(x + W / 2, y - L * 0.30);
      g.lineTo(x + W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L / 2);
      g.lineTo(x - W / 2, y - L * 0.30);
      g.closePath();
      g.stroke();

      // 舱段分隔
      g.beginPath();
      g.moveTo(x - W / 2, y - L * 0.06);
      g.lineTo(x + W / 2, y - L * 0.06);
      g.moveTo(x - W / 2, y + L * 0.26);
      g.lineTo(x + W / 2, y + L * 0.26);
      g.stroke();

      // 定向能吊舱前方加一个发射孔径
      if (kind === 'dew') {
        g.beginPath();
        g.arc(x, y - L * 0.34, Math.max(1.6, W * 0.30), 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }

    // 注意：屏幕坐标 y 向下增大，而弹体要朝上（和机头同向），
    // 所以"头部"取 y - L/2、"尾部"取 y + L/2。写反过一次。

    if (kind === 'bomb') {
      // 制导炸弹：圆头钝尾 + 尾翼
      g.beginPath();
      g.moveTo(x, y - L / 2);
      g.quadraticCurveTo(x + W / 2, y - L * 0.18, x + W / 2, y + L * 0.28);
      g.lineTo(x + W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L / 2);
      g.lineTo(x - W / 2, y + L * 0.28);
      g.quadraticCurveTo(x - W / 2, y - L * 0.18, x, y - L / 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - W * 1.1, y + L / 2);
      g.lineTo(x + W * 1.1, y + L / 2);
      g.stroke();
      return;
    }

    // 导弹类：尖头 + 弹体 + 尾翼
    g.beginPath();
    g.moveTo(x, y - L / 2);                      // 头部朝上
    g.lineTo(x + W / 2, y - L * 0.28);
    g.lineTo(x + W / 2, y + L * 0.30);
    g.lineTo(x + W * 1.35, y + L / 2);           // 尾翼在下方
    g.lineTo(x - W * 1.35, y + L / 2);
    g.lineTo(x - W / 2, y + L * 0.30);
    g.lineTo(x - W / 2, y - L * 0.28);
    g.closePath();
    g.stroke();

    // 中段弹翼（略靠前）
    g.beginPath();
    g.moveTo(x - W * 1.15, y - L * 0.02);
    g.lineTo(x + W * 1.15, y - L * 0.02);
    g.stroke();

    // 反舰弹额外画一圈助推器
    if (kind === 'asm') {
      g.beginPath();
      g.moveTo(x - W * 0.95, y + L * 0.34);
      g.lineTo(x + W * 0.95, y + L * 0.34);
      g.stroke();
    }
  }

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

  function draw(cv, ac, loadout, activeGroup) {
    if (!cv) return;
    var pf = P[ac.model];
    var groups = groupsOf(ac);
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;

    /* ---- 配色：与界面同一套军用航电色 ---- */
    var INK = '#8fa8b8';          // 主轮廓
    var INK2 = 'rgba(143,168,184,0.42)';  // 内部结构线
    var INK3 = 'rgba(143,168,184,0.18)';  // 参考虚线
    var AMBER = '#ffb03a';
    var CY = '#45d6ff';
    var STORE = '#4fe08a';

    g.clearRect(0, 0, W, H);

    // 底
    g.fillStyle = '#070d12';
    g.fillRect(0, 0, W, H);

    /* ---- 网格底纹（技术图纸感） ---- */
    var grid = 22;
    g.strokeStyle = 'rgba(69,214,255,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    for (var gx = 0; gx <= W; gx += grid) { g.moveTo(gx + .5, 0); g.lineTo(gx + .5, H); }
    for (var gy = 0; gy <= H; gy += grid) { g.moveTo(0, gy + .5); g.lineTo(W, gy + .5); }
    g.stroke();

    if (!pf) {
      g.fillStyle = 'rgba(143,168,184,0.5)';
      g.font = '13px Consolas,monospace';
      g.textAlign = 'center';
      g.fillText('NO PLANFORM DATA', W / 2, H / 2);
      return;
    }

    /* ---- 缩放：左右都留出标注栏 ---- */
    var padL = 132, padR = 132, padY = 44;
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
      var isActive = (activeGroup && grp.id === activeGroup);

      for (var pi = 0; pi < grp.pts.length; pi++) {
        var hp = grp.pts[pi];
        var px = TX(hp.x), py = TY(hp.y);

        if (st.w) {
          g.strokeStyle = isActive ? AMBER : STORE;
          g.lineWidth = isActive ? 2 : 1.3;
          drawStore(g, px, py, st.w.kind, k, { line: isActive ? 2 : 1.3 });
        } else {
          // 空置：只留一个方框标记
          g.strokeStyle = isActive ? AMBER : 'rgba(79,224,138,0.40)';
          g.lineWidth = 1.2;
          g.strokeRect(px - 3.5, py - 3.5, 7, 7);
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
    if (groups.length) {
      g.font = '10px Consolas,monospace';
      for (var gi2 = 0; gi2 < groups.length; gi2++) {
        var grp2 = groups[gi2];
        var st2 = groupStore(ac, grp2, loadout);
        var isAct = (activeGroup && grp2.id === activeGroup);

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
        g.fillText(st2.w ? (st2.w.name + ' ×' + st2.count) : '空置', edge, ly + 11);
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

    /* ---- 尺寸标注 ---- */
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
    g.fillText('翼展 ' + pf.span.toFixed(1) + ' m', cx, wy - 7);

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
    g.fillText('机长 ' + pf.len.toFixed(1) + ' m', 0, 0);
    g.restore();

    /* ---- 方向提示 ---- */
    g.fillStyle = 'rgba(143,168,184,0.5)';
    g.font = '10px Consolas,monospace';
    g.textAlign = 'right';
    g.fillText('俯视 / TOP VIEW', W - 12, H - 12);
    g.textAlign = 'left';
    g.fillStyle = AMBER;
    g.fillText('▲ NOSE', 12, H - 12);
  }

  return { planes: P, draw: draw };
})();
