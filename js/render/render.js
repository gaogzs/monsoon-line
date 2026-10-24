/* ============================================================
   render.js —— 3D 渲染管线
     · 天空渐变 / 太阳 / 体积云
     · 地面网格（近平面裁剪）
     · 多边形面收集 → 深度排序 → 平面着色绘制
     · 面法线光照 + 距离大气透视
     · 粒子（加色混合）
   ============================================================ */
'use strict';

var Renderer = (function () {

  var cv = null, ctx = null;
  var W = 0, H = 0, DPR = 1;

  var cam = null;

  /* ---------- 光照 / 雾：数值全部来自 shading.js（与 WebGL 共用一份） ---------- */
  var LIGHT = Shading.LIGHT;
  var FOG_R = Shading.FOG_RGB[0], FOG_G = Shading.FOG_RGB[1], FOG_B = Shading.FOG_RGB[2];
  var FOG_NEAR = Shading.FOG_NEAR, FOG_FAR = Shading.FOG_FAR, FOG_MAX = Shading.FOG_MAX;

  /* ---------- 模型用哪条管线 ----------
     'auto'  有 WebGL2 就用（render-gl.js，深度缓冲，遮挡正确），没有就退回下面的画家算法
     'gl'    同 auto（拿不到 WebGL2 时仍然退回）
     '2d'    强制画家算法（设置里的"兼容"，或 URL 带 ?render=2d）
     用 WebGL 时，天空、海面、云、粒子也由 render-env.js 画（与模型共用深度缓冲）；
     2D 模式下仍是本文件里原来的画法。曳光和 HUD 无论哪种都画在 2D 画布上。 */
  var mode = 'auto', glOn = false, urlForce = false;
  try {
    if (typeof location !== 'undefined' && /[?&]render=2d(&|$)/.test(location.search || '')) { mode = '2d'; urlForce = true; }
  } catch (e) { /* 工具脚本里没有 location */ }
  // URL 里的 ?render=2d 优先于设置（排查问题时用）
  function setMode(m) { if (!urlForce) mode = (m === '2d' || m === 'gl') ? m : 'auto'; }
  function usingGL() { return glOn; }

  /* ---------- WebGL 环境层的开关（2.5.9） ----------
     quality：0 = 标准（关软粒子，给集成显卡），1 = 高。
     高空云片两档都画：10 km 以上的云团已经去掉了，高层只剩它。
     其余几项单独开关，用来和旧画面并排对比（控制台 Renderer.setGfx({ clouds: false })）；
     env 关掉 = 天空 / 云 / 海面整层退回 2D（画面对比测试就这么用）。 */
  var gfx = { env: true, clouds: true, sheets: true, particles: true, soft: true }, quality = 1;
  var envGL = false, flushed = false;
  function setGfx(o) { for (var k in o) if (Object.prototype.hasOwnProperty.call(gfx, k)) gfx[k] = !!o[k]; }
  function setQuality(q) { quality = q ? 1 : 0; }

  /* ---------- 颜色缓存（量化亮度/雾浓度，避免每帧拼字符串） ---------- */
  var colorCache = {};
  function shade(hex, b, fog) {
    var bi = b < 0 ? 0 : (b > 0.999 ? 15 : (b * 16) | 0);
    var fi = fog < 0 ? 0 : (fog > 0.999 ? 15 : (fog * 16) | 0);
    var key = hex + bi * 32 + fi;
    var c = colorCache[key];
    if (c !== undefined) return c;
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var bl = parseInt(hex.substr(5, 2), 16);
    var k = (bi + 0.5) / 16;
    r *= k; g *= k; bl *= k;
    var f = (fi + 0.5) / 16;
    r = r * (1 - f) + FOG_R * f;
    g = g * (1 - f) + FOG_G * f;
    bl = bl * (1 - f) + FOG_B * f;
    c = 'rgb(' + ((r + 0.5) | 0) + ',' + ((g + 0.5) | 0) + ',' + ((bl + 0.5) | 0) + ')';
    colorCache[key] = c;
    return c;
  }

  /* ---------- 对象池 ---------- */
  var pool = [], poolN = 0;
  function getP() {
    if (poolN < pool.length) { var o = pool[poolN++]; o.x = o.y = o.z = 0; return o; }
    var n = { x: 0, y: 0, z: 0 };
    pool.push(n); poolN++;
    return n;
  }

  /* ---------- 面缓冲 ---------- */
  var faceList = [], faceN = 0;
  function getFace() {
    if (faceN < faceList.length) return faceList[faceN++];
    var f = { d: 0, n: 0, px: new Float32Array(10), py: new Float32Array(10), c: '#000', a: 1 };
    faceList.push(f); faceN++;
    return f;
  }

  /* ---------- 暂存顶点缓冲 ---------- */
  var MAXV = 2048;
  var wX = new Float32Array(MAXV), wY = new Float32Array(MAXV), wZ = new Float32Array(MAXV);
  var cX = new Float32Array(MAXV), cY = new Float32Array(MAXV), cZ = new Float32Array(MAXV);
  var clipX = new Float32Array(16), clipY = new Float32Array(16), clipZ = new Float32Array(16);

  /* ---------- 相机抖动 ---------- */
  var shake = 0, shakeX = 0, shakeY = 0;

  /* ============================================================
     初始化
     ============================================================ */
  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d', { alpha: false });
    resize();
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
  }

  function setCamera(pos, fwd, up, fovDeg) {
    cam = M3.makeCamera(pos, fwd, up, W, H, fovDeg || 58);
  }

  function getCam() { return cam; }

  function addShake(v) { shake = Math.min(shake + v, 26); }

  /* ============================================================
     天空 + 地面
     ============================================================ */
  /* 云：按高度分为五层，覆盖 500 – 21000 m。
     单层云在座舱视角里是看不见的 —— 玩家在 7600 m 巡航时，
     1500 m 的积云俯角超过 40°，落在 58° 视场之外。
     所以每一段飞行高度附近都必须有云，它们才是可靠的姿态参照。 */
  var CLOUD_LAYERS = [
    { y0: 1400, y1: 2800, s0: 500, s1: 1500, a0: 0.30, a1: 0.52, n: 13 },   // 低层积云（云底 1400 m，低空飞行不贴着云）
    { y0: 3400, y1: 6200, s0: 600, s1: 1900, a0: 0.24, a1: 0.44, n: 12 },   // 中层
    { y0: 6800, y1: 10200, s0: 700, s1: 2300, a0: 0.20, a1: 0.38, n: 11 },  // 中高层
    { y0: 10800, y1: 15200, s0: 800, s1: 2600, a0: 0.15, a1: 0.30, n: 9 },  // 高层
    { y0: 15800, y1: 21400, s0: 900, s1: 3000, a0: 0.11, a1: 0.24, n: 8 }   // 平流层薄云
  ];
  var cloudSeeds = [];
  (function () {
    for (var L = 0; L < CLOUD_LAYERS.length; L++) {
      var lay = CLOUD_LAYERS[L];
      for (var i = 0; i < lay.n; i++) {
        cloudSeeds.push({
          ox: M3.rnd(-3400, 3400), oz: M3.rnd(-3400, 3400),
          y: M3.rnd(lay.y0, lay.y1),
          s: M3.rnd(lay.s0, lay.s1),
          a: M3.rnd(lay.a0, lay.a1),
          sq: M3.rnd(0.26, 0.44)
        });
      }
    }
  })();
  var CLOUD_CELL = 6400;
  var CLOUD_FAR = 16000;
  // WebGL 的云用同一组种子（每朵拆成几个柔边贴片）
  if (typeof RenderGL !== 'undefined' && RenderGL.setClouds) RenderGL.setClouds(cloudSeeds, CLOUD_CELL, CLOUD_FAR);

  function horizonY() {
    var d = M3.V(cam.fwd.x, 0, cam.fwd.z);
    var l = Math.sqrt(d.x * d.x + d.z * d.z);
    if (l < 1e-4) {
      d = M3.V(cam.up.x, 0, cam.up.z);
      l = Math.sqrt(d.x * d.x + d.z * d.z);
      if (l < 1e-4) return cam.fwd.y > 0 ? -H : H * 2;
    }
    d.x /= l; d.z /= l;

    /* 地球曲率：海平面不是一块无限大的平板，它会随着高度"沉下去"。

       站在高度 h 上，地平线的俯角是 acos(R / (R + h))：

           h = 1 000 m  →  1.0°
           h = 6 000 m  →  2.5°
           h = 20 000 m →  4.5°

       原来的实现把远点放在与相机等高处（far.y = cam.pos.y），
       等于假设地球是平的 —— 所以无论飞多高，海平面都停在同一个位置，
       连爬升都少了参照。任务三在 21 公里上打，那里本来应该能明显
       看出"海在往下沉"。

       FOV 56° 之下，20 公里的 4.5° 约占屏幕高度 8%，是一眼可见的差别。 */
    var R = 6371000;
    var h = Math.max(0, cam.pos.y);
    var dip = Math.acos(R / (R + h));
    var cd = Math.cos(dip), sd = Math.sin(dip);

    var far = M3.V(
      cam.pos.x + d.x * cd * 1e6,
      cam.pos.y - sd * 1e6,
      cam.pos.z + d.z * cd * 1e6
    );
    var s = M3.project(cam, far);
    return s ? s.y : (cam.fwd.y > 0 ? -H * 2 : H * 2);
  }

  function drawSky() {
    var hy = horizonY();
    var top = cam.fwd.y * 0.55;                  // 抬头看时天空更"高"
    var g = ctx.createLinearGradient(0, Math.min(0, hy - H), 0, Math.max(H, hy));
    g.addColorStop(0, '#122c47');
    g.addColorStop(0.42, '#2f6c95');
    g.addColorStop(0.78, '#7fb2cc');
    g.addColorStop(1, '#c9d8dd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 太阳 / 光晕（固定在世界方向 LIGHT）
    var sunDist = 9000;
    var sp = M3.V(cam.pos.x + LIGHT.x * sunDist, cam.pos.y + LIGHT.y * sunDist, cam.pos.z + LIGHT.z * sunDist);
    var ss = M3.project(cam, sp);
    if (ss && ss.z > 0) {
      var r = Math.max(24, cam.focal * 0.055);
      var sg = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, r * 5);
      sg.addColorStop(0, 'rgba(255,246,220,0.95)');
      sg.addColorStop(0.08, 'rgba(255,238,190,0.55)');
      sg.addColorStop(0.30, 'rgba(220,225,205,0.14)');
      sg.addColorStop(1, 'rgba(200,210,210,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(ss.x, ss.y, r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return hy;
  }

  function drawClouds() {
    var bx = Math.round(cam.pos.x / CLOUD_CELL) * CLOUD_CELL;
    var bz = Math.round(cam.pos.z / CLOUD_CELL) * CLOUD_CELL;
    var FAR2 = CLOUD_FAR * CLOUD_FAR;

    ctx.save();
    for (var i = 0; i < cloudSeeds.length; i++) {
      var s = cloudSeeds[i];
      for (var ax = -1; ax <= 1; ax++) {
        for (var az = -1; az <= 1; az++) {
          var px = bx + ax * CLOUD_CELL + s.ox;
          var pz = bz + az * CLOUD_CELL + s.oz;
          var dx = px - cam.pos.x, dz = pz - cam.pos.z;
          var dh = dx * dx + dz * dz;
          if (dh > FAR2) continue;

          var p = M3.project(cam, M3.V(px, s.y, pz));
          if (!p) continue;

          var rr = cam.focal * s.s / p.z;
          if (rr < 6 || rr > H * 8) continue;

          // 近处的云几乎不透明，远处融进天空
          var fade = 1 - Math.sqrt(dh) / CLOUD_FAR;
          fade = fade * fade * (3 - 2 * fade);          // smoothstep
          var al = s.a * (0.45 + 0.55 * fade);

          // 越接近掠过云层的视线，云的投影越扁
          var graze = Math.abs(p.y - cam.cy) / Math.max(1, H * 0.5);
          var sq = s.sq * (0.55 + 0.75 * Math.min(1, graze));

          ctx.globalAlpha = M3.clamp(al, 0, 0.8);

          ctx.fillStyle = '#e8f0f5';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rr, rr * sq, 0, 0, Math.PI * 2);
          ctx.fill();

          // 给稍大的云一点体积：顶部受光、底部压暗
          if (rr > 26) {
            ctx.globalAlpha = M3.clamp(al * 0.55, 0, 0.42);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(p.x - rr * 0.10, p.y - rr * sq * 0.42,
              rr * 0.66, rr * sq * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = M3.clamp(al * 0.30, 0, 0.24);
            ctx.fillStyle = '#8ea3b4';
            ctx.beginPath();
            ctx.ellipse(p.x + rr * 0.06, p.y + rr * sq * 0.52,
              rr * 0.72, rr * sq * 0.40, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawGround(hy) {
    var y0 = Math.max(-2, Math.min(H + 2, hy));
    var g = ctx.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, '#4d6472');
    g.addColorStop(0.06, '#2b3a46');
    g.addColorStop(0.5, '#16222b');
    g.addColorStop(1, '#0b1319');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, H - y0);

    // 海面高光（分水群岛，海比陆多）
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#6f8fa3';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;

    if (cam.pos.y < 1) return;

    var G = 500;
    var N = 9;
    var cx = Math.round(cam.pos.x / G) * G;
    var cz = Math.round(cam.pos.z / G) * G;
    var far = N * G;

    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(120,160,190,0.30)' : 'rgba(70,110,140,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = -N; i <= N; i++) {
        var seg = null;
        if (pass === 0) {
          var x = cx + i * G;
          seg = M3.clipSeg(cam, M3.V(x, 0, cz - far), M3.V(x, 0, cz + far));
        } else {
          var z = cz + i * G;
          seg = M3.clipSeg(cam, M3.V(cx - far, 0, z), M3.V(cx + far, 0, z));
        }
        if (seg) { ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); }
      }
      ctx.stroke();
    }
  }

  /* ============================================================
     模型面收集
     ============================================================ */
  function pushModel(model, P, fwd, up, opts) {
    opts = opts || {};
    if (glOn) { RenderGL.push(model, P, fwd, up, opts); return; }
    var verts = model.v;
    var nv = verts.length;
    if (nv > MAXV) return;

    var scale = opts.scale === undefined ? 1 : opts.scale;
    var rx = up.y * fwd.z - up.z * fwd.y;
    var ry = up.z * fwd.x - up.x * fwd.z;
    var rz = up.x * fwd.y - up.y * fwd.x;
    // 归一化（保证基是正交的）
    var rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl > 1e-6) { rx /= rl; ry /= rl; rz /= rl; }

    // 可变后掠：在展开位与后掠位之间插值（只有标了 morph 的模型有）
    var morph = model.morph;
    var sw = opts.sweep === undefined ? 0 : M3.clamp(opts.sweep, 0, 1);

    var i, v;
    for (i = 0; i < nv; i++) {
      v = verts[i];
      var x = v[0], y = v[1], z = v[2];

      if (morph) {
        var mi = morph.map[i];
        if (mi >= 0) {
          var A = morph.spread[mi], Bv = morph.swept[mi];
          x = A[0] + (Bv[0] - A[0]) * sw;
          y = A[1] + (Bv[1] - A[1]) * sw;
          z = A[2] + (Bv[2] - A[2]) * sw;
        }
      }

      x *= scale; y *= scale; z *= scale;
      wX[i] = P.x + rx * x + up.x * y + fwd.x * z;
      wY[i] = P.y + ry * x + up.y * y + fwd.y * z;
      wZ[i] = P.z + rz * x + up.z * y + fwd.z * z;
    }

    var near = cam.near;
    var faces = model.f;
    var tint = opts.tint || 0;
    var alphaMul = opts.alpha === undefined ? 1 : opts.alpha;
    var emissive = opts.emissive || 0;

    for (var fi = 0; fi < faces.length; fi++) {
      var face = faces[fi];
      var idx = face.i;
      var np = idx.length;

      // ---- 世界坐标法线（前三点，双面取绝对值） ----
      var a0 = idx[0], a1 = idx[1], a2 = idx[2];
      var e1x = wX[a1] - wX[a0], e1y = wY[a1] - wY[a0], e1z = wZ[a1] - wZ[a0];
      var e2x = wX[a2] - wX[a0], e2y = wY[a2] - wY[a0], e2z = wZ[a2] - wZ[a0];
      var nx = e1y * e2z - e1z * e2y;
      var ny = e1z * e2x - e1x * e2z;
      var nz = e1x * e2y - e1y * e2x;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);

      /* 背面剔除：只对闭合部件（models.js 的 orientClosed 标了 cl）。
         画家算法本身处理不了穿插，但朝后的那一面参与排序时最容易把正面盖住 ——
         先把它们扔掉，能去掉一大半错误遮挡。翼面等单片仍然双面。 */
      if (face.cl && nl > 1e-9 &&
          nx * (wX[a0] - cam.pos.x) + ny * (wY[a0] - cam.pos.y) + nz * (wZ[a0] - cam.pos.z) > 0) continue;

      var bright = Shading.DEGENERATE;
      if (nl > 1e-9) {
        nx /= nl; ny /= nl; nz /= nl;
        var dl = Math.abs(nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
        bright = Shading.AMBIENT + Shading.DIFFUSE * dl;
      }
      bright += tint;

      // ---- 顶点 → 相机空间 ----
      var allFront = true, anyFront = false;
      var minZ = 1e9, sumZ = 0;
      for (i = 0; i < np; i++) {
        var k = idx[i];
        var dx = wX[k] - cam.pos.x, dy = wY[k] - cam.pos.y, dz = wZ[k] - cam.pos.z;
        var px = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
        var py = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
        var pz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
        cX[i] = px; cY[i] = py; cZ[i] = pz;
        sumZ += pz;
        if (pz < minZ) minZ = pz;
        if (pz < near) allFront = false; else anyFront = true;
      }
      if (!anyFront) continue;

      // ---- 近平面裁剪 ----
      var m = np;
      if (!allFront) {
        m = 0;
        for (i = 0; i < np; i++) {
          var j = (i + 1) % np;
          var az1 = cZ[i], az2 = cZ[j];
          var ain = az1 >= near, bin = az2 >= near;
          if (ain) { clipX[m] = cX[i]; clipY[m] = cY[i]; clipZ[m] = cZ[i]; m++; }
          if (ain !== bin) {
            var t = (near - az1) / (az2 - az1);
            clipX[m] = cX[i] + (cX[j] - cX[i]) * t;
            clipY[m] = cY[i] + (cY[j] - cY[i]) * t;
            clipZ[m] = near;
            m++;
          }
          if (m >= 15) break;
        }
        if (m < 3) continue;
        for (i = 0; i < m; i++) { cX[i] = clipX[i]; cY[i] = clipY[i]; cZ[i] = clipZ[i]; }
      }

      // ---- 投影 ----
      var fo = cam.focal;
      var sxMin = 1e9, sxMax = -1e9, syMin = 1e9, syMax = -1e9;
      var ok = true;
      for (i = 0; i < m; i++) {
        var iz = fo / cZ[i];
        var sx = cam.cx + cX[i] * iz;
        var sy = cam.cy - cY[i] * iz;
        if (!(sx > -1e7 && sx < 1e7 && sy > -1e7 && sy < 1e7)) { ok = false; break; }
        clipX[i] = sx; clipY[i] = sy;
        if (sx < sxMin) sxMin = sx;
        if (sx > sxMax) sxMax = sx;
        if (sy < syMin) syMin = sy;
        if (sy > syMax) syMax = sy;
      }
      if (!ok) continue;

      // ---- 屏幕外剔除 / 太小剔除 ----
      if (sxMax < -8 || sxMin > W + 8 || syMax < -8 || syMin > H + 8) continue;
      var area = (sxMax - sxMin) * (syMax - syMin);
      if (area < 1.6) continue;

      var depth = sumZ / np;

      // ---- 雾 ----
      var fog = (depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
      fog = fog < 0 ? 0 : (fog > FOG_MAX ? FOG_MAX : fog);

      var f = getFace();
      f.d = depth;
      f.n = m;
      f.c = shade(face.c, Math.min(1.5, bright + emissive), fog);
      f.a = alphaMul;
      for (i = 0; i < m; i++) { f.px[i] = clipX[i]; f.py[i] = clipY[i]; }
    }
  }

  /* ---------- 排序 + 绘制全部面 ---------- */
  function flush() {
    if (glOn) {
      flushed = true;
      if (!envGL) {
        var glc = RenderGL.render(cam);
        if (glc) ctx.drawImage(glc, 0, 0, W, H);   // 当前变换已含 DPR 与镜头抖动
        return;
      }
      /* 环境也在 GL 里：整张图铺满屏幕，镜头抖动改成移动投影中心（不然边上会露出空白） */
      var c2 = cam;
      if (shakeX || shakeY) {
        c2 = {}; for (var k in cam) c2[k] = cam[k];
        c2.cx = cam.cx + shakeX; c2.cy = cam.cy + shakeY;
      }
      var glc2 = RenderGL.render(c2, { env: {
        sky: true, clouds: gfx.clouds, particles: gfx.particles,
        sheets: gfx.sheets, soft: gfx.soft && quality > 0
      } });
      if (glc2) {
        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.drawImage(glc2, 0, 0, W, H);
        ctx.restore();
      }
      return;
    }
    var arr = [];
    for (var i = 0; i < faceN; i++) arr.push(faceList[i]);
    arr.sort(function (a, b) { return b.d - a.d; });

    var prevA = 1;
    ctx.globalAlpha = 1;
    for (i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (f.a !== prevA) { ctx.globalAlpha = f.a; prevA = f.a; }
      ctx.fillStyle = f.c;
      ctx.beginPath();
      ctx.moveTo(f.px[0], f.py[0]);
      for (var k = 1; k < f.n; k++) ctx.lineTo(f.px[k], f.py[k]);
      ctx.closePath();
      ctx.fill();
      // 细微描边，压掉多边形之间的接缝
      if (f.n <= 4 && f.d < 900) {
        ctx.strokeStyle = f.c;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     粒子
     ============================================================ */
  function drawParticles(list) {
    if (!list.length) return;
    // WebGL 画粒子时要在 flush 之前交过去（参与深度测试：飞机背后的爆炸会被机身挡住）
    if (envGL && gfx.particles && !flushed) { RenderGL.pushParticles(list); return; }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.alive || p.delay > 0) continue;
      var s = M3.project(cam, p.pos);
      if (!s) continue;
      var lifeK = p.life / p.life0;
      var r = Math.max(0.7, (cam.focal * p.size / s.z) * (p.grow ? (1.6 - lifeK) : 1));
      if (r < 0.4 || s.x < -r * 3 || s.x > W + r * 3 || s.y < -r * 3 || s.y > H + r * 3) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, lifeK)) * (p.alpha === undefined ? 1 : p.alpha);
      ctx.fillStyle = p.color;
      if (p.streak) {
        /* 破片：从当前位置往回拉一段（≈ 30 ms 的航迹），看起来是飞散的碎片而不是光点 */
        var s0 = M3.project(cam, M3.sub(p.pos, M3.mul(p.vel, 0.03)));
        if (s0) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, r * 0.9);
          ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s.x, s.y); ctx.stroke();
          continue;
        }
      }
      if (r < 1.4) {
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     每帧开始
     ============================================================ */
  function begin() {
    poolN = 0;
    faceN = 0;
    // 全屏滤镜层（hudfx.js）每帧先清空：离开战斗（菜单、结算）时自动消失
    if (typeof HudFx !== 'undefined' && HudFx.beginFrame) HudFx.beginFrame();

    // 相机未设置时给一个安全默认值（标题界面会走到这里）
    if (!cam) {
      cam = M3.makeCamera(M3.V(0, 3200, 0), M3.V(0, -0.12, 1), M3.V(0, 1, 0), W, H, 58);
    }

    if (shake > 0.01) {
      shakeX = M3.rnd(-shake, shake);
      shakeY = M3.rnd(-shake, shake);
      shake *= 0.86;
    } else { shakeX = shakeY = 0; shake = 0; }

    glOn = mode !== '2d' && typeof RenderGL !== 'undefined' && RenderGL.begin(W, H, DPR);
    envGL = glOn && gfx.env && RenderGL.envReady();
    flushed = false;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!envGL) {
      var hy = drawSky();
      drawClouds();
      drawGround(hy);
    }

    ctx.save();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);
  }

  function end() {
    if (envGL && !flushed) flush();      // 菜单背景这类不推模型、也不调 flush 的帧
    ctx.restore();
  }

  /** 屏幕空间绘制辅助 */
  function line(x1, y1, x2, y2, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function rect(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
  function circle(x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function ring(x, y, r, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w || 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  function text(t, x, y, col, font, align) {
    ctx.fillStyle = col;
    ctx.font = font || '12px Consolas, monospace';
    ctx.textAlign = align || 'left';
    ctx.fillText(t, x, y);
    ctx.textAlign = 'left';
  }

  return {
    init: init, resize: resize, setCamera: setCamera, getCam: getCam,
    setMode: setMode, usingGL: usingGL, setGfx: setGfx, setQuality: setQuality,
    begin: begin, end: end, pushModel: pushModel, flush: flush,
    drawParticles: drawParticles, addShake: addShake,
    /* 粒子此刻走 WebGL（参与深度测试）吗？曳光弹据此选路径：是 → 拖尾粒子，否 → 2D 画布 */
    glParticles: function () { return !!(envGL && gfx.particles && !flushed); },
    line: line, rect: rect, circle: circle, ring: ring, text: text,
    get W() { return W; }, get H() { return H; },
    get ctx() { return ctx; }
  };
})();
