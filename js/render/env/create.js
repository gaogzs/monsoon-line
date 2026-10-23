(function (RenderEnv) {
  'use strict';
  var $ = RenderEnv.$;
  $.create = create;

  function create(gl, compile) {
    var P = {}, vaoEmpty = gl.createVertexArray();

    function program(vs, fs, names) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var U = {};
      ['uCamP', 'uCamR', 'uCamU', 'uCamF', 'uFocal', 'uCx', 'uCy', 'uW', 'uH', 'uNear', 'uFar', 'uLogC', 'uDpr', 'uCurve']
        .concat(names).forEach(function (n) { U[n] = gl.getUniformLocation(p, n); });
      return { p: p, U: U };
    }

    P.env = program($.VS_FULL, $.FS_ENV, ['uLight', 'uSun', 'uHaze', 'uFoamCol', 'uSkyC', 'uSkyT', 'uSeaC', 'uSeaT',
      'uDip', 'uSpan', 'uRh', 'uC', 'uSunR', 'uTime', 'uSeaP', 'uXZ', 'uPeriod']);
    P.sheet = program($.VS_FULL, $.FS_SHEET, ['uL0', 'uL1', 'uFd', 'uTh', 'uDeck', 'uXZ', 'uPeriod', 'uCamY', 'uTime', 'uHz']);
    P.puff = program($.VS_PUFF, $.FS_PUFF, ['uTex', 'uDepth', 'uSoft', 'uTop', 'uBody', 'uBase', 'uHz']);
    P.part = program($.VS_PART, $.FS_PART, []);

    /* 实体云需要可混合的浮点渲染目标；拿不到就退回柔边贴片 */
    var meshOK = !!(gl.getExtension('EXT_color_buffer_float') && gl.getExtension('EXT_float_blend'));
    var meshVao = null, meshBuf = null, mfb = null;
    if (meshOK) {
      P.thick = program($.VS_MESH, $.FS_THICK, ['uOff', 'uDepth', 'uK']);
      P.ccol = program($.VS_MESH, $.FS_CCOL, ['uOff', 'uDepth', 'uLight', 'uTop', 'uBody', 'uBase', 'uHz', 'uFog']);
      P.comp = program($.VS_FULL, $.FS_COMP, ['uThick', 'uCol']);
    }
    function meshTargets(w, h) {
      if (mfb && mfb.w === w && mfb.h === h) return mfb;
      if (mfb) {
        gl.deleteFramebuffer(mfb.tf); gl.deleteFramebuffer(mfb.cf);
        gl.deleteTexture(mfb.tt); gl.deleteTexture(mfb.ct); gl.deleteRenderbuffer(mfb.cd);
      }
      function tex2(ifmt, fmt, type) {
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return t;
      }
      var f = { w: w, h: h, tf: gl.createFramebuffer(), cf: gl.createFramebuffer() };
      f.tt = tex2(gl.R32F, gl.RED, gl.FLOAT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.tf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tt, 0);
      f.ct = tex2(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
      f.cd = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, f.cd);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.cf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.ct, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.cd);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      mfb = f;
      return f;
    }

    /* 云贴片纹理 */
    var pt = $.puffTexture();
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, pt.w, pt.h, 0, gl.RED, gl.UNSIGNED_BYTE, pt.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    /* 实例缓冲 */
    function instVao(prog, attrs, stride) {
      var vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      for (var i = 0; i < attrs.length; i++) {
        var loc = gl.getAttribLocation(prog.p, attrs[i][0]);
        if (loc < 0) continue;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, attrs[i][1], gl.FLOAT, false, stride * 4, attrs[i][2] * 4);
        gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      return { vao: vao, vbo: vbo, data: new Float32Array(stride * 256), stride: stride, n: 0 };
    }
    var puffI = instVao(P.puff, [['aC', 4, 0], ['aP', 4, 4]], 8);
    var partI = instVao(P.part, [['aPos', 4, 0], ['aCol', 4, 4], ['aTail', 3, 8]], 11);
    function grow(I, n) {
      if (I.data.length >= n * I.stride) return;
      var m = I.data.length;
      while (m < n * I.stride) m *= 2;
      var d = new Float32Array(m); d.set(I.data); I.data = d;
    }
    function upload(I) {
      gl.bindBuffer(gl.ARRAY_BUFFER, I.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, I.data.subarray(0, I.n * I.stride), gl.STREAM_DRAW);
    }

    function setCam(prog, C) {
      var U = prog.U, cam = C.cam;
      gl.useProgram(prog.p);
      gl.uniform3f(U.uCamP, cam.pos.x, cam.pos.y, cam.pos.z);
      gl.uniform3f(U.uCamR, cam.right.x, cam.right.y, cam.right.z);
      gl.uniform3f(U.uCamU, cam.up.x, cam.up.y, cam.up.z);
      gl.uniform3f(U.uCamF, cam.fwd.x, cam.fwd.y, cam.fwd.z);
      gl.uniform1f(U.uFocal, cam.focal);
      gl.uniform1f(U.uCx, cam.cx); gl.uniform1f(U.uCy, cam.cy);
      gl.uniform1f(U.uW, C.W); gl.uniform1f(U.uH, C.H);
      gl.uniform1f(U.uNear, cam.near); gl.uniform1f(U.uFar, C.far);
      gl.uniform1f(U.uLogC, C.logC); gl.uniform1f(U.uDpr, C.dpr);
      gl.uniform1f(U.uCurve, C.curve || 0);
      return U;
    }
    function flatStops(stops) {
      var C = [], T = [];
      for (var i = 0; i < 4; i++) { C.push(stops[i][1][0], stops[i][1][1], stops[i][1][2]); T.push(stops[i][0]); }
      return { C: new Float32Array(C), T: new Float32Array(T) };
    }
    var S = Shading, sky = flatStops(S.SKY.stops), sea = flatStops(S.SEA.stops);
    function camXZ(cam) {
      var mx = cam.pos.x % $.PERIOD, mz = cam.pos.z % $.PERIOD;
      return [mx < 0 ? mx + $.PERIOD : mx, mz < 0 ? mz + $.PERIOD : mz];
    }
    function time() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 % 3600; }

    /* 天空 + 海面：深度测试开着（LEQUAL，清屏深度 1，全部通过），写深度 */
    function drawEnv(C) {
      var cam = C.cam, U = setCam(P.env, C);
      var R = S.EARTH_R, h = Math.max(0.5, cam.pos.y);
      var xz = camXZ(cam);
      gl.uniform3f(U.uLight, S.LIGHT.x, S.LIGHT.y, S.LIGHT.z);
      gl.uniform3fv(U.uSun, S.SKY.sun);
      gl.uniform3fv(U.uHaze, S.SEA.haze);
      gl.uniform3f(U.uFoamCol, 222, 232, 238);
      gl.uniform3fv(U.uSkyC, sky.C); gl.uniform1fv(U.uSkyT, sky.T);
      gl.uniform3fv(U.uSeaC, sea.C); gl.uniform1fv(U.uSeaT, sea.T);
      gl.uniform1f(U.uDip, Math.acos(R / (R + h)));
      gl.uniform1f(U.uSpan, 2 * Math.atan(cam.cy / cam.focal));
      gl.uniform1f(U.uRh, R + h);
      gl.uniform1f(U.uC, h * (2 * R + h));
      gl.uniform1f(U.uSunR, S.SKY.sunR);
      gl.uniform1f(U.uTime, time());
      gl.uniform4f(U.uSeaP, S.SEA.hazeDist, S.SEA.hazeMax, S.SEA.glint, S.SEA.foam);
      gl.uniform2f(U.uXZ, xz[0], xz[1]);
      gl.uniform1f(U.uPeriod, $.PERIOD);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function sheetPass(U, L, deck) {
      gl.uniform4f(U.uL0, L[0].y, L[0].scale, L[0].stretch, L[0].alpha);
      gl.uniform4f(U.uL1, L[1].y, L[1].scale, L[1].stretch, L[1].alpha);
      var f0 = $.BLOBS && L[0].fadeIn, f1 = $.BLOBS && L[1].fadeIn;
      gl.uniform4f(U.uFd, f0 ? f0[0] : 0, f0 ? f0[1] : 0, f1 ? f1[0] : 0, f1 ? f1[1] : 0);
      gl.uniform2f(U.uTh, deck ? 0.42 : 0.60, deck ? 0.72 : 0.85);
      gl.uniform1f(U.uDeck, deck ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    /* deck：远处的低层云（云团开着时才画）；high：高空卷云 */
    function drawSheets(C, deck, high) {
      var cam = C.cam, U = setCam(P.sheet, C), xz = camXZ(cam);
      gl.uniform2f(U.uXZ, xz[0], xz[1]);
      gl.uniform1f(U.uPeriod, $.PERIOD);
      gl.uniform1f(U.uCamY, cam.pos.y);
      gl.uniform1f(U.uTime, time());
      gl.uniform3fv(U.uHz, S.SKY.stops[0][1]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(vaoEmpty);
      if (deck) sheetPass(U, S.DECKS, true);
      if (high) sheetPass(U, S.SHEETS, false);
    }

    /* ---------- 云 ---------- */
    var clouds = null;   // { seeds, puffs, cell, far }
    function setClouds(seeds, cell, far) {
      clouds = { seeds: seeds, puffs: $.buildPuffs(seeds), cell: cell, far: far, mesh: null };
      if (meshOK) {
        var M = $.buildMeshes(seeds);
        clouds.mesh = M.ranges;
        meshVao = gl.createVertexArray(); meshBuf = gl.createBuffer();
        gl.bindVertexArray(meshVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
        gl.bufferData(gl.ARRAY_BUFFER, M.data, gl.STATIC_DRAW);
        [['aPos', 0], ['aNrm', 3]].forEach(function (a) {
          var loc = gl.getAttribLocation(P.thick.p, a[0]);
          if (loc < 0) return;
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 24, a[1] * 4);
        });
        gl.bindVertexArray(null);
      }
    }

    /* 实体云：三遍（见 FS_THICK 上面的说明）。mainFB = 画完要切回去的主帧缓冲 */
    var meshList = [];
    function drawMeshClouds(C, depthTex, mainFB) {
      var cam = C.cam, cp = cam.pos, f = cam.fwd;
      var cell = clouds.cell, FAR = clouds.far, FAR2 = FAR * FAR;
      var bx = Math.round(cp.x / cell) * cell, bz = Math.round(cp.z / cell) * cell;
      var n = 0;
      for (var i = 0; i < clouds.seeds.length; i++) {
        var s = clouds.seeds[i];
        if (s.y >= $.HIGH_Y) continue;
        for (var ax = -2; ax <= 2; ax++) {
          for (var az = -2; az <= 2; az++) {
            var px = bx + ax * cell + s.ox, pz = bz + az * cell + s.oz;
            var dx = px - cp.x, dz = pz - cp.z, dh = dx * dx + dz * dz;
            if (dh > FAR2) continue;
            var dy = s.y - cp.y;
            if (dx * f.x + dy * f.y + dz * f.z < -s.s * 1.5) continue;
            var dist = Math.sqrt(dh);
            var fade = 1 - dist / FAR;
            fade = fade * fade * (3 - 2 * fade);
            /* 密度：中间穿过一整朵云大约 α ≈ 0.6–0.85；远处随距离变稀，接上远景云层 */
            var k = (1.6 * s.a / (s.s * s.sq)) * Math.min(1, (FAR - dist) / 4000) * (0.5 + 0.5 * fade);
            var it = meshList[n] || (meshList[n] = {});
            it.x = px; it.y = s.y; it.z = pz; it.k = k; it.r = clouds.mesh[i]; it.fog = 0.55 * (1 - fade);
            n++;
          }
        }
      }
      if (!n) return;
      var T = meshTargets(C.pw, C.ph);
      gl.bindVertexArray(meshVao);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex);
      // ① 厚度
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.tf);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      var U = setCam(P.thick, C);
      gl.uniform1i(U.uDepth, 1);
      for (i = 0; i < n; i++) {
        var m = meshList[i];
        gl.uniform3f(U.uOff, m.x, m.y, m.z); gl.uniform1f(U.uK, m.k);
        gl.drawArrays(gl.TRIANGLES, m.r[0], m.r[1]);
      }
      // ② 最近正面的颜色（清屏色 = 云体颜色：镜头在云里、看不到正面时用它）
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.cf);
      var CL = S.CLOUD;
      gl.clearColor(CL.body[0] / 255, CL.body[1] / 255, CL.body[2] / 255, 1);
      gl.clearDepth(1); gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
      gl.disable(gl.BLEND);
      U = setCam(P.ccol, C);
      gl.uniform1i(U.uDepth, 1);
      gl.uniform3f(U.uLight, S.LIGHT.x, S.LIGHT.y, S.LIGHT.z);
      gl.uniform3fv(U.uTop, CL.top); gl.uniform3fv(U.uBody, CL.body); gl.uniform3fv(U.uBase, CL.base);
      gl.uniform3fv(U.uHz, S.SKY.stops[0][1]);
      for (i = 0; i < n; i++) {
        m = meshList[i];
        gl.uniform3f(U.uOff, m.x, m.y, m.z); gl.uniform1f(U.uFog, m.fog);
        gl.drawArrays(gl.TRIANGLES, m.r[0], m.r[1]);
      }
      gl.clearColor(0, 0, 0, 0);
      // ③ 合成回主帧缓冲
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainFB);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      U = setCam(P.comp, C);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.tt); gl.uniform1i(U.uThick, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.ct); gl.uniform1i(U.uCol, 2);
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    }
    var order = [], dists = new Float32Array(1024), sorted = new Float32Array(8 * 256);
    function drawClouds(C, depthTex, soft, mainFB) {
      if (!clouds || !$.BLOBS) return;
      if (clouds.mesh && depthTex) { drawMeshClouds(C, depthTex, mainFB); return; }
      var cam = C.cam, cp = cam.pos, f = cam.fwd;
      var cell = clouds.cell, FAR = clouds.far, FAR2 = FAR * FAR;
      var bx = Math.round(cp.x / cell) * cell, bz = Math.round(cp.z / cell) * cell;
      var I = puffI, n = 0, i;
      for (i = 0; i < clouds.seeds.length; i++) {
        var s = clouds.seeds[i], list = clouds.puffs[i];
        /* 5×5 格：3×3 只铺到 ±13 km，比 16 km 的淡出距离近，远处（抬头看到的高层云）会突然冒出来 */
        for (var ax = -2; ax <= 2; ax++) {
          for (var az = -2; az <= 2; az++) {
            var px = bx + ax * cell + s.ox, pz = bz + az * cell + s.oz;
            var dx = px - cp.x, dz = pz - cp.z, dh = dx * dx + dz * dz;
            if (dh > FAR2) continue;
            // 高层（10 km 以上）只要条状的高空云片，不要一团团的云
            if (s.y >= $.HIGH_Y) continue;
            var dy = s.y - cp.y;
            // 整朵云在镜头背后就跳过
            if (dx * f.x + dy * f.y + dz * f.z < -s.s * 1.2) continue;
            /* 与 2D 同一套淡出：近处几乎不透明，远处融进天空；最外 2.5 km 再淡到 0，免得跳出来 */
            var dist = Math.sqrt(dh);
            var fade = 1 - dist / FAR;
            fade = fade * fade * (3 - 2 * fade);
            var al = s.a * (0.45 + 0.55 * fade) * Math.min(1, (FAR - dist) / 2500);
            var fog = 0.55 * (1 - fade);
            grow(I, n + list.length);
            var D = I.data;
            for (var k = 0; k < list.length; k++) {
              var q = list[k], o = n * 8;
              D[o] = px + q.dx; D[o + 1] = s.y + q.dy; D[o + 2] = pz + q.dz; D[o + 3] = q.r;
              D[o + 4] = Math.min(0.85, al * 0.95); D[o + 5] = q.l; D[o + 6] = q.tex; D[o + 7] = fog;
              n++;
            }
          }
        }
      }
      if (!n) return;
      /* 远 → 近 */
      if (dists.length < n) dists = new Float32Array(n * 2);
      if (sorted.length < n * 8) sorted = new Float32Array(n * 16);
      order.length = n;
      for (i = 0; i < n; i++) {
        var o2 = i * 8, ex = I.data[o2] - cp.x, ey = I.data[o2 + 1] - cp.y, ez = I.data[o2 + 2] - cp.z;
        dists[i] = ex * ex + ey * ey + ez * ez;
        order[i] = i;
      }
      order.sort(function (a, b) { return dists[b] - dists[a]; });
      for (i = 0; i < n; i++) sorted.set(I.data.subarray(order[i] * 8, order[i] * 8 + 8), i * 8);
      var keep = I.data;
      I.data = sorted; sorted = keep;
      I.n = n;

      var U = setCam(P.puff, C), CL = S.CLOUD;
      gl.uniform3fv(U.uTop, CL.top); gl.uniform3fv(U.uBody, CL.body); gl.uniform3fv(U.uBase, CL.base);
      gl.uniform3fv(U.uHz, S.SKY.stops[0][1]);
      gl.uniform1f(U.uSoft, soft && depthTex ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U.uTex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex || null); gl.uniform1i(U.uDepth, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(I.vao);
      upload(I);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
    }

    /* ---------- 粒子：每帧收集，flush 时一起画 ---------- */
    var colCache = {};
    function rgb(hex) {
      var c = colCache[hex];
      if (!c) {
        c = colCache[hex] = [parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255,
          parseInt(hex.substr(5, 2), 16) / 255];
      }
      return c;
    }
    function beginParticles() { partI.n = 0; }
    /* 与 render.js 的 drawParticles 同一套规则：delay 未到不画，grow 随寿命膨胀，streak 往回拉 30 ms */
    function pushParticles(list) {
      var I = partI;
      grow(I, I.n + list.length);
      var D = I.data;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p.alive || p.delay > 0) continue;
        var lifeK = p.life / p.life0;
        var al = Math.max(0, Math.min(1, lifeK)) * (p.alpha === undefined ? 1 : p.alpha);
        if (al <= 0.004) continue;
        var c = rgb(p.color), o = I.n * 11;
        D[o] = p.pos.x; D[o + 1] = p.pos.y; D[o + 2] = p.pos.z;
        D[o + 3] = p.size * (p.grow ? (1.6 - lifeK) : 1);
        D[o + 4] = c[0]; D[o + 5] = c[1]; D[o + 6] = c[2]; D[o + 7] = al;
        if (p.streak && p.vel) { D[o + 8] = p.vel.x * 0.03; D[o + 9] = p.vel.y * 0.03; D[o + 10] = p.vel.z * 0.03; }
        else { D[o + 8] = 0; D[o + 9] = 0; D[o + 10] = 0; }
        I.n++;
      }
    }
    function drawParticles(C) {
      var I = partI;
      if (!I.n) return;
      setCam(P.part, C);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);   // 'lighter'，alpha 不动
      gl.depthMask(false);
      gl.bindVertexArray(I.vao);
      upload(I);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, I.n);
    }

    return {
      drawEnv: drawEnv, drawSheets: drawSheets,
      setClouds: setClouds, drawClouds: drawClouds,
      beginParticles: beginParticles, pushParticles: pushParticles, drawParticles: drawParticles,
      get hasClouds() { return !!clouds; },
      get meshClouds() { return meshOK; }
    };
  }
})(RenderEnv);
