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

  /* ---------------- DB-11 军舰鸟 · 变后掠翼多用途 ---------------- */
  P.frigatebird = {
    span: 17.6,
    len: 20.4,
    outline: [
      [0, 10.2],
      [0.72, 7.4], [1.12, 4.6], [1.50, 2.9],
      // 主轮廓画后掠位（与 3D 模型的静态几何一致：枢轴 (1.2, 1.0)、半径 8 m、62°）
      [5.9, -5.5], [4.3, -6.4],
      [1.52, -0.9], [1.56, -3.9], [1.24, -7.4],
      [3.3, -8.5], [3.3, -9.7],
      [1.00, -9.9],
      [-1.00, -9.9],
      [-3.3, -9.7], [-3.3, -8.5],
      [-1.24, -7.4], [-1.56, -3.9], [-1.52, -0.9],
      [-4.3, -6.4], [-5.9, -5.5],
      [-1.50, 2.9], [-1.12, 4.6], [-0.72, 7.4]
    ],
    lines: [
      // 主翼前/后梁
      [[1.50, 2.7], [5.8, -5.4]],
      [[1.52, -1.0], [4.3, -6.3]],
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
      [[1.30, 3.6], [9.2, -0.4]],      // 展开位前缘（20°）
      [[1.50, -1.0], [8.4, -2.7]],     // 展开位后缘
      [[9.2, -0.4], [8.4, -2.7]]       // 展开位翼尖
    ],
    sweepPivot: { x: 1.45, y: 1.9 },
    sweepLabel: '可变后掠 20°–62°',
    cannon: { x: 0.50, y: 7.2 }
  };

  /* ---------------- D-14 旗鱼 · 平流层制空 ---------------- */
  P.sailfish = {
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

  /* ---------------- G-6 鲣鸟 · 近距支援 ---------------- */
  P.booby = {
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

  /* ---------------- F-9 海燕 · 高空高速截击机 ---------------- */
  P.petrel = {
    span: 13.2,
    len: 22.9,
    outline: [
      [0, 11.4],
      [0.44, 9.0], [0.84, 6.0], [1.30, 3.0],
      [6.6, -6.4], [6.6, -7.7],
      [1.52, -6.1], [1.60, -6.0], [1.68, -5.5], [1.44, -9.6],
      [3.4, -9.4], [3.4, -10.3],
      [1.20, -10.7],
      [-1.20, -10.7],
      [-3.4, -10.3], [-3.4, -9.4],
      [-1.44, -9.6], [-1.68, -5.5], [-1.60, -6.0], [-1.52, -6.1],
      [-6.6, -7.7], [-6.6, -6.4],
      [-1.30, 3.0], [-0.84, 6.0], [-0.44, 9.0]
    ],
    lines: [
      // 三角翼前缘与后缘
      [[1.42, 2.6], [6.4, -6.5]],
      [[1.5, -6.1], [6.4, -7.6]],
      // 平尾
      [[1.44, -9.7], [3.3, -9.5]],
      // 进气道
      [[1.30, 3.4], [1.44, -5.4]],
      // 机身分段
      [[1.56, -1.0], [-1.56, -1.0]],
      // 双尾喷口
      [[0.76, -10.7], [0.76, -10.0]],
      [[-0.76, -10.7], [-0.76, -10.0]]
    ],
    dash: [
      [[0, 11.6], [0, -10.9]],
      [[0, 4.0], [6.4, -1.0]],
      [[0, 4.0], [-6.4, -1.0]]
    ],
    fills: [
      { pts: [[0, 8.2], [0.46, 5.4], [0, 4.0], [-0.46, 5.4]], a: 0.20 }
    ],
    cannon: { x: 0.44, y: 7.6 }
  };

  /* ---------------- D-21 贼鸥 · 无尾菱形翼隐形机 ---------------- */
  P.skua = {
    span: 13.8,
    len: 21.4,
    outline: [
      [0, 10.6],
      [0.52, 8.2], [1.10, 5.0], [1.50, 3.0],
      [6.9, -2.6], [6.9, -4.4],
      [1.60, -8.6],
      // 扁平尾缘（与 3D 模型同一组点）
      [4.2, -9.6], [4.2, -10.4], [1.20, -10.8], [1.10, -11.0],
      [-1.10, -11.0],
      [-1.20, -10.8], [-4.2, -10.4], [-4.2, -9.6],
      [-1.60, -8.6],
      [-6.9, -4.4], [-6.9, -2.6],
      [-1.50, 3.0], [-1.10, 5.0], [-0.52, 8.2]
    ],
    lines: [
      // 菱形翼前缘（大后掠）与后缘（前掠）
      [[1.5, 3.0], [6.7, -2.8]],
      [[1.6, -8.5], [6.7, -4.3]],
      // 扁平尾缘
      [[1.6, -8.6], [1.2, -10.8]],
      // 内埋弹舱门缝
      [[0.75, -4.4], [0.75, -0.4]],
      [[-0.75, -4.4], [-0.75, -0.4]],
      // 机身棱线（升力体）
      [[1.10, 5.0], [1.58, -8.0]],
      [[-1.10, 5.0], [-1.58, -8.0]],
      // 埋入式喷口
      [[0.62, -11.0], [0.62, -10.2]],
      [[-0.62, -11.0], [-0.62, -10.2]]
    ],
    dash: [
      [[0, 10.8], [0, -11.2]],
      [[0, 4.4], [6.7, -1.2]],
      [[0, 4.4], [-6.7, -1.2]]
    ],
    fills: [
      { pts: [[0, 6.6], [0.44, 4.2], [0, 3.0], [-0.44, 4.2]], a: 0.18 }
    ],
    cannon: { x: 0.40, y: 6.8 }
  };

  /* ---------------- D-33 信天翁 · 前掠翼高机动格斗机 ---------------- */
  P.albatross = {
    span: 16.4,
    len: 19.6,
    outline: [
      [0, 8.8],
      [0.72, 7.0], [1.16, 4.4], [1.44, 1.0], [1.46, -1.4],
      // 前掠翼：翼尖在翼根之前（z 更大）；整体比旧版后移约 2 米
      [7.4, 1.8], [7.4, 0.2],
      [1.34, -5.0], [1.32, -5.6], [1.22, -7.0],
      [3.9, -7.4], [3.9, -8.5],
      [0.86, -9.4],
      [-0.86, -9.4],
      [-3.9, -8.5], [-3.9, -7.4],
      [-1.22, -7.0], [-1.32, -5.6], [-1.34, -5.0],
      [-7.4, 0.2], [-7.4, 1.8],
      [-1.46, -1.4], [-1.44, 1.0], [-1.16, 4.4], [-0.72, 7.0]
    ],
    lines: [
      // 前掠翼前缘与后缘
      [[1.46, -1.4], [7.2, 1.7]],
      [[1.36, -5.0], [7.2, 0.3]],
      // 平尾
      [[1.22, -7.3], [3.8, -7.6]],
      // 机背无人机控制舱
      [[0.41, 1.8], [0.41, -1.2]],
      [[-0.41, 1.8], [-0.41, -1.2]],
      // 机身分段
      [[1.46, -2.8], [-1.46, -2.8]],
      // 双尾喷口
      [[0.66, -9.4], [0.66, -8.8]],
      [[-0.66, -9.4], [-0.66, -8.8]]
    ],
    dash: [
      [[0, 9.0], [0, -9.6]],
      [[0, -1.0], [7.2, 2.2]],
      [[0, -1.0], [-7.2, 2.2]]
    ],
    fills: [
      { pts: [[0, 6.4], [0.56, 4.0], [0, 2.4], [-0.56, 4.0]], a: 0.20 }
    ],
    cannon: { x: 0.42, y: 6.6 }
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

  /* 挂载物在图上的半宽（像素）—— 装填进度的裁剪框要包住整组多联 / 发射巢 */
  function storeHalfW(w, k) {
    var lk = w && w.look;
    if (!lk) return k * 1.8;
    if (lk.nest) return Math.max(4, lk.dia * (lk.nest === 'tube' ? 1.2 : 2.0) * k) + 2;
    var n = lk.rack || 1;
    return Math.max(2, lk.dia * 1.7 * k) * (n === 1 ? 1.6 : n === 2 ? 2.4 : 3.0) + 2;
  }

  function storeLen(w, k) {
    var lk = w && w.look;
    return (lk ? lk.len + (lk.nest ? 0.3 : 0) : (STORE_LEN[w.kind] || 3.0)) * k;
  }

  /* 按 WEAPONS[id].look 画：单发 / 多联挂梁 / 发射巢。
     没有 look 的（吊舱）走老的按 kind 画法。 */
  function drawStore(g, x, y, w, k, style) {
    var lk = w.look;
    if (!lk) return drawStoreKind(g, x, y, w.kind, k, style);
    g.lineWidth = style.line;
    var L = lk.len * k, D = Math.max(2, lk.dia * 1.7 * k), i;

    if (lk.nest === 'tube') {
      // 圆筒火箭巢：平头圆筒 + 前端一排管口
      var R = Math.max(4, lk.dia * 1.2 * k);
      g.beginPath();
      g.moveTo(x - R * 0.6, y - L / 2);
      g.lineTo(x + R * 0.6, y - L / 2);
      g.lineTo(x + R, y - L * 0.36);
      g.lineTo(x + R, y + L * 0.38);
      g.lineTo(x + R * 0.6, y + L / 2);
      g.lineTo(x - R * 0.6, y + L / 2);
      g.lineTo(x - R, y + L * 0.38);
      g.lineTo(x - R, y - L * 0.36);
      g.closePath();
      g.stroke();
      var tubes = Math.min(4, Math.max(2, Math.round((lk.cells || 7) / 2)));
      var dr = Math.max(0.9, R * 0.16);
      for (i = 0; i < tubes; i++) {
        var tx = x - R * 0.6 + (R * 1.2) * (i + 0.5) / tubes;
        g.beginPath();
        g.arc(tx, y - L * 0.40, dr, 0, Math.PI * 2);
        g.stroke();
      }
      return;
    }
    if (lk.nest === 'box') {
      // 方形发射巢：方框 + 每格一个伸出的弹头
      var cols = lk.cells === 4 ? 2 : (lk.cells || 3);
      var HW = Math.max(4, lk.dia * 2.0 * k) * (cols / 2.4 + 0.4);
      g.strokeRect(x - HW, y - L / 2 + L * 0.12, HW * 2, L * 0.88);
      for (i = 0; i < cols; i++) {
        var cx = x - HW + HW * 2 * (i + 0.5) / cols;
        g.beginPath();
        g.moveTo(cx - HW / cols * 0.55, y - L / 2 + L * 0.12);
        g.lineTo(cx, y - L / 2);
        g.lineTo(cx + HW / cols * 0.55, y - L / 2 + L * 0.12);
        g.stroke();
        if (i > 0) {
          g.beginPath();
          g.moveTo(cx - HW / cols, y - L / 2 + L * 0.12);
          g.lineTo(cx - HW / cols, y + L / 2);
          g.stroke();
        }
      }
      return;
    }

    var n = lk.rack || 1;
    if (n === 1) { drawRound(g, x, y, lk, L, D); return; }
    // 多联挂梁：中间一道横梁 + 并排的弹（三联：中间那枚靠后半个身位，读作"下挂"）
    var gap = D * (n === 3 ? 1.5 : 3.0);
    var offs = n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
    g.beginPath();
    g.moveTo(x + offs[0], y + L * 0.05);
    g.lineTo(x + offs[offs.length - 1], y + L * 0.05);
    g.stroke();
    for (i = 0; i < offs.length; i++) {
      drawRound(g, x + offs[i], y + (n === 3 && i === 1 ? L * 0.12 : 0), lk, L, D);
    }
  }

  function drawRound(g, x, y, lk, L, D) {
    if (lk.fin === 'bomb') {
      g.beginPath();
      g.moveTo(x, y - L / 2);
      g.quadraticCurveTo(x + D / 2, y - L * 0.18, x + D / 2, y + L * 0.22);
      g.lineTo(x + D * 0.25, y + L / 2);
      g.lineTo(x - D * 0.25, y + L / 2);
      g.lineTo(x - D / 2, y + L * 0.22);
      g.quadraticCurveTo(x - D / 2, y - L * 0.18, x, y - L / 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - D * 0.9, y + L / 2);
      g.lineTo(x + D * 0.9, y + L / 2);
      g.stroke();
      return;
    }
    var tail = lk.fin === 'strake' ? 1.6 : 1.3;
    if (lk.nose === 'dual') {
      // 头部改装：钝头 + 战斗部段外凸一圈 + 一道接缝（与 models.js 的 addRound 同一个轮廓）
      g.beginPath();
      g.moveTo(x - D * 0.3, y - L / 2);
      g.lineTo(x + D * 0.3, y - L / 2);
      g.lineTo(x + D * 0.5, y - L * 0.40);
      g.lineTo(x + D * 0.6, y - L * 0.30);
      g.lineTo(x + D * 0.6, y - L * 0.14);
      g.lineTo(x + D / 2, y - L * 0.10);
      g.lineTo(x + D / 2, y + L * 0.36);
      g.lineTo(x + D * tail, y + L / 2);
      g.lineTo(x - D * tail, y + L / 2);
      g.lineTo(x - D / 2, y + L * 0.36);
      g.lineTo(x - D / 2, y - L * 0.10);
      g.lineTo(x - D * 0.6, y - L * 0.14);
      g.lineTo(x - D * 0.6, y - L * 0.30);
      g.lineTo(x - D * 0.5, y - L * 0.40);
      g.closePath();
      g.stroke();
      g.beginPath(); g.moveTo(x - D * 0.6, y - L * 0.14); g.lineTo(x + D * 0.6, y - L * 0.14); g.stroke();   // 战斗部接缝
      if (lk.fin === 'strake') {
        g.beginPath(); g.moveTo(x - D / 2, y + L * 0.02); g.lineTo(x - D * 1.05, y + L * 0.14); g.stroke();
        g.beginPath(); g.moveTo(x + D / 2, y + L * 0.02); g.lineTo(x + D * 1.05, y + L * 0.14); g.stroke();
      }
      if (lk.boost) { g.beginPath(); g.moveTo(x - D * 0.8, y + L * 0.28); g.lineTo(x + D * 0.8, y + L * 0.28); g.stroke(); }
      return;
    }
    g.beginPath();
    g.moveTo(x, y - L / 2);
    g.lineTo(x + D / 2, y - L * 0.32);
    g.lineTo(x + D / 2, y + L * 0.36);
    g.lineTo(x + D * tail, y + L / 2);
    g.lineTo(x - D * tail, y + L / 2);
    g.lineTo(x - D / 2, y + L * 0.36);
    g.lineTo(x - D / 2, y - L * 0.32);
    g.closePath();
    g.stroke();
    // 每条线单独 beginPath：多段 moveTo 在离线预览器的光栅里会被连起来
    function seg(x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    if (lk.fin === 'strake') {
      // 长边条：从弹体中前部斜向后
      seg(x - D / 2, y - L * 0.12, x - D * 1.05, y + L * 0.14);
      seg(x + D / 2, y - L * 0.12, x + D * 1.05, y + L * 0.14);
    } else if (lk.fin === 'cruise') {
      seg(x - D * 3.2, y + L * 0.02, x + D * 3.2, y + L * 0.02);   // 平直大弹翼
    } else {
      seg(x - D * 1.1, y - L * 0.02, x + D * 1.1, y - L * 0.02);
    }
    if (lk.boost) seg(x - D * 0.8, y + L * 0.28, x + D * 0.8, y + L * 0.28);
  }

  function drawStoreKind(g, x, y, kind, k, style) {
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
    var pf = P[ac.model];
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
          drawStore(g, px, py, st.w, k, { line: 1.3 });

          if (ready > 0.002) {
            var Lc = storeLen(st.w, k), Hc = storeHalfW(st.w, k);
            g.save();
            g.beginPath();
            g.rect(px - Hc, py + Lc / 2 - Lc * ready, Hc * 2, Lc * ready);
            g.clip();
            g.strokeStyle = STORE;
            g.lineWidth = 1.4;
            drawStore(g, px, py, st.w, k, { line: 1.4 });
            g.restore();
          }
        } else {
          g.strokeStyle = isActive ? AMBER : STORE;
          g.lineWidth = isActive ? 2 : 1.3;
          drawStore(g, px, py, st.w, k, { line: isActive ? 2 : 1.3 });
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

    }   // end if (!compact) —— 尺寸标注

    /* ---- 方向提示 ---- */
    if (!compact) {
      g.fillStyle = 'rgba(143,168,184,0.5)';
      g.font = '10px Consolas,monospace';
      g.textAlign = 'right';
      g.fillText('俯视 / TOP VIEW', W - 12, H - 12);
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
    var lenM = lk ? lk.len + (lk.nest ? 0.3 : 0) : (STORE_LEN[w.kind] || 3.0);
    var k = (H * 0.70) / lenM;
    var hw = storeHalfW(w, k);
    if (hw * 2 > W * 0.6) k *= (W * 0.6) / (hw * 2);
    var L = storeLen(w, k);
    var cx = W / 2, cy = H / 2;
    g.save();
    g.strokeStyle = '#4fe08a';
    drawStore(g, cx, cy, w, k, { line: 1.8 });
    // 长度标尺
    var rx = cx + storeHalfW(w, k) + 28;
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
      g.fillText(lk.nest ? (lk.cells + ' 管发射巢') : (lk.rack + ' 联挂架'), cx, cy + L / 2 + 26);
    }
    g.restore();
  }

  return { planes: P, draw: draw, paint: paint, paintStore: paintStore };
})();
