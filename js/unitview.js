/* ============================================================
   unitview.js —— 单位详情页（机型 / 舰船）

   资料库的三个图鉴条目里，每个单位都能点进去看一页自己的详情：
   **实时旋转的 3D 预览 + 矢量俯视图 + 设定散文 + 参数表**。

   本文件只做两件事：
     1. `UnitView.html(kind, id)` —— 生成详情页的 HTML 字符串
     2. `UnitView.mount(kind, id)` —— 把 3D 预览挂到刚插入的 canvas 上并转起来
   DOM 由 game.js 的 buildCodex() 负责插入，本文件不碰导航。

   ============================================================
   为什么这里自带一个 3D 渲染器，而不是复用 render.js 的 Renderer
   ============================================================

   `Renderer` 是**单例**：`init(canvas)` 会把全局的 `cv` / `ctx` / `W` / `H` / `DPR`
   全部换掉，而游戏主循环每帧都会调 `Renderer.begin()` / `end()`。
   把单例指向预览 canvas，主循环下一帧就会把预览清空 ——
   除非去改主循环加例外，再在切屏时反复 `init` / `resize` 切回来。

   而这里需要的东西其实很少：一个模型、一个绕着它转的相机、平面着色。
   所以写一个约 120 行的独立渲染器（`renderModel`）。
   **光向与亮度公式与 render.js 完全一致**（`0.44 + 0.56*|dot|`，同一个 LIGHT），
   所以预览里的配色与明暗就是实机里的那一套。
   代价是两份着色代码 —— 改 render.js 的 `LIGHT` 时，这里要跟着改。

   顺带一个好处：这里的相机是**正交意义上的"绕模型转"**，
   不用管天空、海面、雾、近平面裁剪与对象池，比复用主渲染管线简单得多。
   ============================================================ */
'use strict';

var UnitView = (function () {

  /* 与 render.js 同一个光向 —— 见文件头注释 */
  var LIGHT = M3.norm(M3.V(-0.42, 0.80, 0.43));
  var BG = '#070d12';                 // 与 planform 的底板色一致

  var YAW_RATE = 0.42;                // 自动旋转角速度 rad/s（一圈约 15 秒）
  var PITCH_LIMIT = 1.15;             // 手动拖动时的俯仰限位
  var FOV = 34;

  /* ---------- 缓冲：每帧复用，不重新分配 ---------- */
  var BUFCAP = 4096;
  var cX = new Float32Array(BUFCAP), cY = new Float32Array(BUFCAP), cZ = new Float32Array(BUFCAP);
  var front = new Uint8Array(BUFCAP);
  var order = [];                      // 面的绘制顺序（按深度排序）
  var faceList = [];

  var rgbCache = {};
  function rgbOf(hex) {
    var c = rgbCache[hex];
    if (c) return c;
    c = [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)];
    rgbCache[hex] = c;
    return c;
  }

  /* ---------- 包围球 ---------- */
  function bounds(model) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    var i, k, v;
    for (i = 0; i < model.v.length; i++) {
      v = model.v[i];
      for (k = 0; k < 3; k++) {
        if (v[k] < lo[k]) lo[k] = v[k];
        if (v[k] > hi[k]) hi[k] = v[k];
      }
    }
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    var r = 0;
    for (i = 0; i < model.v.length; i++) {
      v = model.v[i];
      var d = Math.sqrt((v[0] - c[0]) * (v[0] - c[0]) + (v[1] - c[1]) * (v[1] - c[1]) +
        (v[2] - c[2]) * (v[2] - c[2]));
      if (d > r) r = d;
    }
    return { c: c, r: Math.max(1, r) };
  }

  /* ---------- 图纸感网格底纹 ---------- */
  function grid(g, W, H) {
    g.save();
    g.strokeStyle = 'rgba(69,214,255,0.050)';
    g.lineWidth = 1;
    g.beginPath();
    for (var x = 0; x <= W; x += 26) { g.moveTo(x + .5, 0); g.lineTo(x + .5, H); }
    for (var y = 0; y <= H; y += 26) { g.moveTo(0, y + .5); g.lineTo(W, y + .5); }
    g.stroke();
    g.restore();
  }

  /* ============================================================
     渲染一帧

     yaw / pitch 决定相机在球面上的位置，相机始终看向模型中心。
     分两趟：第一趟把顶点投到相机空间并量出屏幕范围（自动适配缩放），
     第二趟才算面、排序、填充。两趟共用同一批相机空间坐标，
     所以只算一次变换。
     ============================================================ */
  function renderModel(cvs, model, yaw, pitch) {
    if (!cvs || !model) return;
    var g = cvs.getContext('2d');
    var W = cvs.width, H = cvs.height;
    if (!W || !H) return;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    grid(g, W, H);

    var bd = bounds(model);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var dx = cp * Math.sin(yaw), dy = sp, dz = cp * Math.cos(yaw);
    var tx = bd.c[0], ty = bd.c[1], tz = bd.c[2];
    var dist = bd.r * 3.4;
    var cam = M3.makeCamera(
      M3.V(tx + dx * dist, ty + dy * dist, tz + dz * dist),
      M3.V(-dx, -dy, -dz),
      M3.V(0, 1, 0), W, H, FOV);

    var verts = model.v, nv = verts.length;
    if (nv > BUFCAP) return;

    /* ---- 第一趟：顶点 → 相机空间，并量出屏幕范围 ---- */
    var i, k, v, px, py, pz;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, any = false;
    for (i = 0; i < nv; i++) {
      v = verts[i];
      px = v[0] - cam.pos.x; py = v[1] - cam.pos.y; pz = v[2] - cam.pos.z;
      var ax = px * cam.right.x + py * cam.right.y + pz * cam.right.z;
      var ay = px * cam.up.x + py * cam.up.y + pz * cam.up.z;
      var az = px * cam.fwd.x + py * cam.fwd.y + pz * cam.fwd.z;
      cX[i] = ax; cY[i] = ay; cZ[i] = az;
      if (az < cam.near) { front[i] = 0; continue; }
      front[i] = 1;
      var sx = cam.cx + ax * cam.focal / az;
      var sy = cam.cy - ay * cam.focal / az;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
      any = true;
    }
    if (!any) return;

    /* 自动适配：整机始终占画面约 84%，不论它是一架 8 米的无人机
       还是一条 210 米的补给舰，也不论当前转到哪个角度 */
    var k = Math.min(
      W * 0.84 / Math.max(1, maxX - minX),
      H * 0.84 / Math.max(1, maxY - minY)
    );
    var bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
    var ox = W / 2 - (bcx - cam.cx) * k;
    var oy = H / 2 - (bcy - cam.cy) * k;

    /* 相机空间 → 屏幕偏移：**每个顶点只做一次**。
       顶点是共享的（一个顶点常被 4 个面引用），放进面循环里做就会
       被反复改写 —— 第二遍拿到的已经是屏幕坐标，模型会扭成一团。 */
    for (i = 0; i < nv; i++) {
      if (!front[i]) continue;
      var iz = cam.focal * k / cZ[i];
      cX[i] = cX[i] * iz;
      cY[i] = -(cY[i] * iz);
    }

    /* ---- 第二趟：逐面算亮度与深度 ---- */
    var faces = model.f, nf = faces.length, m = 0;
    var lx = LIGHT.x, ly = LIGHT.y, lz = LIGHT.z;
    for (var fi = 0; fi < nf; fi++) {
      var f = faces[fi], idx = f.i, np = idx.length;
      var sumZ = 0, allFront = true;
      for (i = 0; i < np; i++) {
        if (!front[idx[i]]) { allFront = false; break; }
      }
      if (!allFront) continue;                   // 有顶点在相机背后 → 整面丢弃（预览可接受）

      // 面法线（模型空间；模型不转、相机转，所以这就是世界法线）
      var a0 = idx[0], a1 = idx[1], a2 = idx[2];
      var e1x = verts[a1][0] - verts[a0][0], e1y = verts[a1][1] - verts[a0][1], e1z = verts[a1][2] - verts[a0][2];
      var e2x = verts[a2][0] - verts[a0][0], e2y = verts[a2][1] - verts[a0][1], e2z = verts[a2][2] - verts[a0][2];
      var nx = e1y * e2z - e1z * e2y;
      var ny = e1z * e2x - e1x * e2z;
      var nz = e1x * e2y - e1y * e2x;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      var bright = 0.62;
      if (nl > 1e-9) {
        var dl = Math.abs((nx * lx + ny * ly + nz * lz) / nl);
        bright = 0.44 + 0.56 * dl;
      }

      for (i = 0; i < np; i++) sumZ += cZ[idx[i]];
      if (!faceList[m]) faceList[m] = { i: [], d: 0, c: 0, hex: '' };
      var rec = faceList[m];
      rec.i.length = 0;
      for (i = 0; i < np; i++) rec.i.push(idx[i]);
      rec.d = sumZ / np;
      rec.c = bright;
      rec.hex = f.c;
      m++;
    }
    if (!m) return;

    /* ---- 排序：远的先画（画家算法，与 render.js 同一套） ---- */
    order.length = 0;
    for (i = 0; i < m; i++) order.push(faceList[i]);
    order.sort(function (a, b) { return b.d - a.d; });

    /* ---- 填充 ---- */
    for (i = 0; i < order.length; i++) {
      var r = order[i];
      var rgb = rgbOf(r.hex), b = r.c;
      var col = 'rgb(' + ((rgb[0] * b + 0.5) | 0) + ',' +
        ((rgb[1] * b + 0.5) | 0) + ',' + ((rgb[2] * b + 0.5) | 0) + ')';
      var pts = r.i;
      g.beginPath();
      g.moveTo(ox + cX[pts[0]], oy + cY[pts[0]]);
      for (k = 1; k < pts.length; k++) g.lineTo(ox + cX[pts[k]], oy + cY[pts[k]]);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      // 细描边压掉多边形之间的接缝（与 flush() 同一个做法）
      g.strokeStyle = col;
      g.lineWidth = 0.8;
      g.stroke();
    }
  }

  /* ============================================================
     单位数据查找
     ============================================================ */
  function findUnit(kind, id) {
    var i, list;
    if (kind === 'aircraft') {
      list = (typeof AIRCRAFT !== 'undefined') ? AIRCRAFT : [];
      for (i = 0; i < list.length; i++) if (list[i].id === id) {
        return { kind: 'aircraft', rec: list[i], model: MODELS[list[i].model], modelKey: list[i].model };
      }
    } else if (kind === 'ship') {
      list = (typeof SHIPS !== 'undefined') ? SHIPS : [];
      for (i = 0; i < list.length; i++) if (list[i].id === id) {
        return { kind: 'ship', rec: list[i], model: MODELS[list[i].model], modelKey: list[i].model };
      }
    }
    return null;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============================================================
     参数表
     ============================================================ */
  function paraTable(rows) {
    var h = '<table class="cx-table uv-para">';
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i]) continue;
      h += '<tr><th>' + esc(rows[i][0]) + '</th><td>' + rows[i][1] + '</td></tr>';
    }
    return h + '</table>';
  }

  function aircraftParams(a) {
    var p = a.phys || {};
    /* faction 与 maker 分开两行 —— maker 自己通常已经把阵营写在里面了
       （如 '上游公约 · 高空试验局'），拼在同一行会读成
       "上游公约 · 上游公约 · 高空试验局"。 */
    var rows = [
      ['定位', esc(a.role || '—')],
      ['阵营', esc(a.faction || '—')],
      a.maker ? ['制造方', esc(a.maker)] : null,
      ['最大速度', p.vMax + ' m/s' + (a.ceiling ? ' · 实用升限 ' + a.ceiling + ' m' : '')],
      ['军推 / 失速', p.vMil + ' / ' + p.vStall + ' m/s'],
      ['加减速', '加速 ' + p.accel + ' · 减速 ' + p.decel + ' m/s²'],
      ['俯仰 / 滚转 / 偏航', p.pitch + ' / ' + p.roll + ' / ' + p.yaw + ' rad/s'],
      ['结构完整度', esc(p.hp)],
      ['最大挂载', a.maxLoad + ' kg'],
      /* 预警机与重型轰炸机在数据里没有机炮（`gun: null`）。
         以前这里会显示 "undefined" —— 那是把内部空值漏给了读者。 */
      ['机炮', (typeof WEAPONS !== 'undefined' && WEAPONS[a.gun]) ?
        esc(WEAPONS[a.gun].name + ' ' + WEAPONS[a.gun].cn) : '（无）']
    ];
    var grps = a.hardpointGroups || [], seg = [];
    for (var g = 0; g < grps.length; g++) {
      seg.push(esc(grps[g].id) + ' ' + esc(grps[g].label) + ' ×' + grps[g].pts.length);
    }
    if (seg.length) rows.push(['挂点组', seg.join('<br>')]);
    if (a.caps && a.caps.length) {
      /* 能力标签的中文名在 codex.js 的 _capLabel 里 —— 那是唯一一份映射，
         这里复用而不是再抄一遍。它缺失时（比如只加载了本模块的预览工具）
         就退回原始标识，不至于显示 undefined。 */
      var caps = a.caps.map(function (c) {
        return (typeof _capLabel === 'function') ? _capLabel(c) : c;
      });
      rows.push(['机体能力', esc(caps.join(' / '))]);
    }
    if (a.ctrlFloor !== undefined) rows.push(['低动压保操控', a.ctrlFloor + '（第三涵道）']);
    if (a.ctrlFull !== undefined) rows.push(['满操控动压', a.ctrlFull]);
    if (a.variableSweep) rows.push(['可变后掠翼', '有（渲染时按速度插值）']);
    return paraTable(rows);
  }

  function shipParams(s) {
    var rows = [
      ['舰种', esc(s.cls || '—')],
      ['阵营', esc(s.faction || '—')],
      s.operator ? ['使用方', esc(s.operator)] : null,
      ['定位', esc(s.role || '—')],
      ['满载排水量', s.disp + ' t'],
      ['主尺度', s.dim[0] + ' × ' + s.dim[1] + ' × ' + s.dim[2] + ' m（长 × 宽 × 吃水）'],
      ['航速', s.speed + ' kn'],
      ['编制', s.crew + ' 人'],
      ['舰载武备', esc(s.arms.join(' · '))],
      ['要害', esc(s.vials.join(' · '))]
    ];
    if (!s.neutral) {
      rows.push(['结构 / 受击半径', s.hp + ' / ' + s.radius + ' m']);
      rows.push(['任务价值分', s.value]);
    } else {
      rows.push(['交战国籍', '<span class="uv-neutral">未参战 · 攻击它没有战术收益</span>']);
    }
    return paraTable(rows);
  }

  /* ============================================================
     详情页 HTML

     `codex` 是返回目标（哪一条图鉴），`UnitView` 不自己决定导航，
     只把按钮的 data 属性写出来，由 game.js 的事件委托接住。
     ============================================================ */
  function html(kind, id) {
    var u = findUnit(kind, id);
    if (!u) return '<div class="cx-note">找不到单位 ' + esc(id) + '。</div>';
    var r = u.rec;
    var isAir = u.kind === 'aircraft';

    /* 标题读法按装备类型分：
         机型 —— 型号在前，中文名在后（D-14 旗鱼），英文绰号跟在后面小字
         军舰 —— 只写级名（蓝鲸级），英文名小字；舰种在副标题里。
                 上下游军舰不挂字母数字编号，hull 字段存的就是级名
         其他船 —— 船名在前，中文名在后（MV SOUTHERN CROSS 南十字） */
    var isClass = !isAir && /级$/.test(r.hull || '');
    var name = isAir ? (r.name + ' ' + r.cn) : (isClass ? r.hull : (r.hull + ' ' + r.cn));
    var nick = isAir ? (r.nick || '') : (r.name || '');
    var sub = isAir
      ? [r.faction, r.role].filter(Boolean).join(' · ')
      : [r.faction, r.cls].filter(Boolean).join(' · ');

    var back = isAir ? '机型图鉴' : '舰艇图鉴';
    var h = '';

    h += '<div class="uv-head">' +
      '<span class="cx-unit uv-back" data-unit-back="' + esc(kind) + '">← 返回' + back + '</span>' +
      '<div class="uv-title">' + esc(name) +
      (nick ? ' <span class="uv-nick">' + esc(nick) + '</span>' : '') + '</div>' +
      '<div class="uv-sub">' + esc(sub) + '</div>' +
      '</div>';

    h += '<div class="uv-body">';

    /* ---- 左栏：3D + 俯视图 ---- */
    h += '<div class="uv-left">';
    h += '<div class="uv-panel">' +
      '<div class="uv-cap">实时预览 · 拖动可改变视角</div>' +
      '<canvas class="uv-3d" id="uvCanvas"></canvas>' +
      '</div>';

    /* 俯视识别图只有 6 架可驾驶机型有数据；没有的时候 paint() 会画 NO DATA，
       所以统一渲染 —— 但那更像"坏了"，所以这里先判断 */
    var hasPlan = (typeof PLANFORM !== 'undefined') && PLANFORM.planes && PLANFORM.planes[r.model];
    h += '<div class="uv-panel">' +
      '<div class="uv-cap">矢量俯视识别图' + (hasPlan ? '' : ' · 本型无数据') + '</div>';
    if (hasPlan) {
      h += '<canvas class="uv-plan" id="uvPlan"></canvas>';
    } else {
      h += '<div class="uv-noplan">这一型没有画俯视识别图 ——' +
        '资料的来源是敌方制式机的识别卡片，不是每一型都有。</div>';
    }
    h += '</div>';

    if (u.modelKey && isAir && u.modelKey !== r.id) {
      h += '<div class="uv-tiny">外形数据复用 <code>' + esc(u.modelKey) + '</code>' +
        ' —— 这一型在游戏里没有独立模型。</div>';
    }
    h += '</div>';

    /* ---- 右栏：设定散文 ---- */
    h += '<div class="uv-right">';
    h += '<div class="uv-desc cx-text">' + (r.desc || '<p>（暂无设定）</p>') + '</div>';
    h += '</div>';

    h += '</div>';   // uv-body

    h += '<h4 class="uv-h4">' + (isAir ? '飞行性能与挂载' : '舰艇参数') + '</h4>';
    h += isAir ? aircraftParams(r) : shipParams(r);

    return h;
  }

  /* ============================================================
     挂载：启动旋转动画
     ============================================================ */
  var raf = 0, canvas = null, cur = null;
  var yaw = 0.7, pitch = 0.30, lastT = 0, drag = null, acc = 0;

  /* 预览限 30 fps。
     旋转本身不需要 60 —— 30 已经足够平滑，而像「蓝鲸」那种
     386 个面的模型（三层集装箱堆出来的）在低端设备上单帧不便宜。
     反正这一屏是静止的资料库，没有跟手的操作要响应。 */
  var FRAME_MIN = 1 / 30;

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    canvas = null;
    cur = null;
    drag = null;
    acc = 0;
  }

  function fit(cvs) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = cvs.clientWidth || 420, ch = cvs.clientHeight || 250;
    cvs.width = Math.max(1, Math.round(cw * dpr));
    cvs.height = Math.max(1, Math.round(ch * dpr));
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!canvas) return;
    if (!lastT) { lastT = t; return; }
    var dt = (t - lastT) / 1000;
    lastT = t;
    if (!isFinite(dt) || dt <= 0) return;
    acc += Math.min(0.1, dt);
    if (acc < FRAME_MIN) return;
    var step = acc;
    acc = 0;
    if (!drag) yaw += YAW_RATE * step;
    renderModel(canvas, cur, yaw, pitch);
  }

  /* 拖动用的两个监听挂在 window 上，**只挂一次** ——
     mount() 每次进详情页都会跑，在那里 addEventListener 会越积越多。 */
  function onDragMove(ev) {
    if (!drag) return;
    yaw = drag.yaw + (ev.clientX - drag.x) * 0.010;
    pitch = M3.clamp(drag.pitch - (ev.clientY - drag.y) * 0.008, -PITCH_LIMIT, PITCH_LIMIT);
    drag.moved = true;
  }

  function onDragEnd() {
    if (!drag) return;
    drag = null;
    if (canvas) canvas.style.cursor = 'grab';
  }

  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);

  function mount(kind, id) {
    stop();
    var u = findUnit(kind, id);
    if (!u || !u.model) return;
    cur = u.model;

    canvas = document.getElementById('uvCanvas');
    if (!canvas) { cur = null; return; }
    fit(canvas);

    /* 拖动改视角；松手后从当前角度继续自动旋转。
       只绑 canvas 自己的 mousedown，移动与抬起走上面那两个全局监听。 */
    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, yaw: yaw, pitch: pitch, moved: false };
      canvas.style.cursor = 'grabbing';
      if (ev.preventDefault) ev.preventDefault();
    });

    /* 矢量俯视图：数据有则画，没有则那一栏已经不在了。
       画布固定 640×440 —— 与机库 index.html 里 #planCv 的属性完全一致，
       所以两边是同一套留白比例。
       这里不能按 clientHeight/clientWidth 现算：paint() 的左右标注栏
       （padL/padR = 132 px）是**像素**量，画布越扁、机身分到的缩放 k 越小；
       而 `.uv-plan` 是 `height:auto`，一改 width 属性，clientHeight 立刻
       按新宽高比变（默认 height 还是 150），读回来的已经是扁画布的比，
       最后算出 640×150 —— 俯视图只剩中间一小条。 */
    var plan = document.getElementById('uvPlan');
    if (plan && typeof PLANFORM !== 'undefined' && PLANFORM.planes[u.rec.model]) {
      plan.width = 640;
      plan.height = 440;
      PLANFORM.draw(plan, u.rec, {}, null);
    }

    lastT = 0;
    acc = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  return { html: html, mount: mount, stop: stop, renderModel: renderModel, findUnit: findUnit };
})();
