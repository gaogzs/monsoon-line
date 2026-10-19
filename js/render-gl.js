/* ============================================================
   render-gl.js —— 模型的 WebGL2 渲染（docs/2-0IMPL.md 阶段 2.5.4）

   模型面：深度缓冲让遮挡永远正确（翼下挂弹、机身与尾翼穿插）。
   主画面实例（create({ env: true })）还画环境层 —— 天空、海面、云、高空云片、粒子
   （render-env.js，2.5.9），全部与模型共用一个深度缓冲。曳光和 HUD 仍在 2D 画布上。
   Renderer.flush() 把这张离屏 GL 画布 drawImage 到主画布上。

   环境实例走离屏 MSAA 帧缓冲：画完天空 + 海面 + 不透明模型后，把深度解析到一张
   深度纹理，云贴片读它做软粒子；最后把颜色 blit 到画布。

   着色规则全部来自 shading.js，并在着色器里逐面算（flat）：
   每个顶点带着它所在面的法线与面中心，三个顶点算出同一个颜色 ——
   与 2D 渲染"每个面一个颜色"的画风一致。

   深度用对数深度（gl_FragDepth）：近平面 0.6 m、视距几十公里，
   普通的透视深度在远处精度只有米级，远处飞机的部件会互相穿插闪烁。

   拿不到 WebGL2（工具脚本、老显卡）时 available() 为 false，
   Renderer 退回 render.js 自己的画家算法。
   ============================================================ */
var RenderGL = (function () {
  'use strict';

  var VS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aPos; in vec3 aNrm; in vec3 aCen; in vec3 aCol; in float aCl;',
    'uniform vec3 uP, uRt, uUp, uFw; uniform float uScale, uTint, uEmis;',
    'uniform vec3 uCamP, uCamR, uCamU, uCamF; uniform float uFocal, uCx, uCy, uW, uH, uNear, uFar;',
    'uniform vec3 uLight, uFogRGB; uniform vec4 uFog;',          // near, far, max, steps
    'uniform vec3 uLum;',                                          // ambient, diffuse, degenerate
    'flat out vec4 vCol; out float vW; out float vCull;',
    'float q(float v, float n) { float i = v < 0.0 ? 0.0 : (v > 0.999 ? n - 1.0 : floor(v * n)); return (i + 0.5) / n; }',
    'vec3 toWorld(vec3 p) { p *= uScale; return uP + uRt * p.x + uUp * p.y + uFw * p.z; }',
    'void main() {',
    '  vec3 wp = toWorld(aPos);',
    '  vec3 d = wp - uCamP;',
    '  float cx = dot(d, uCamR), cy = dot(d, uCamU), cz = dot(d, uCamF);',
    '  vec3 nW = uRt * aNrm.x + uUp * aNrm.y + uFw * aNrm.z;',
    '  float nl = length(nW) * uScale * uScale;',
    '  float b = uLum.z;',
    '  if (nl > 1e-9) b = uLum.x + uLum.y * abs(dot(normalize(nW), uLight));',
    '  b = min(1.5, b + uTint + uEmis);',
    '  float k = q(b, uFog.w);',
    '  float cz0 = dot(toWorld(aCen) - uCamP, uCamF);',
    '  float f = clamp((cz0 - uFog.x) / (uFog.y - uFog.x), 0.0, uFog.z);',
    '  float fk = q(f, uFog.w);',
    '  vec3 c = aCol * k * (1.0 - fk) + uFogRGB * fk;',
    '  vCol = vec4(floor(c + 0.5) / 255.0, 1.0);',
    '  vCull = aCl > 0.5 ? dot(nW, d) : -1.0;',
    '  vW = cz;',
    /* 与 M3.project 同一套投影：sx = cx + x·f/z，sy = cy − y·f/z（CSS 像素，y 向下） */
    '  float xc = (2.0 * uCx / uW - 1.0) * cz + 2.0 * uFocal * cx / uW;',
    '  float yc = (1.0 - 2.0 * uCy / uH) * cz + 2.0 * uFocal * cy / uH;',
    '  float zc = cz * (uFar + uNear) / (uFar - uNear) - 2.0 * uFar * uNear / (uFar - uNear);',
    '  gl_Position = vec4(xc, yc, zc, cz);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision highp float;',
    'flat in vec4 vCol; in float vW; in float vCull;',
    'uniform float uAlpha, uLogC;',
    'out vec4 o;',
    'void main() {',
    '  if (vCull > 0.0) discard;',             // 闭合部件的背面（face.cl）
    '  gl_FragDepth = log2(max(1e-6, 1.0 + vW)) * uLogC;',
    '  o = vec4(vCol.rgb * uAlpha, uAlpha);',  // 预乘 alpha
    '}'
  ].join('\n');

  /* 每个实例一个离屏画布 + 一个 GL 上下文。主画面用默认实例；
     单位详情页 / 机库的 3D 预览各建一个（RenderGL.create()），尺寸互不打架。 */
  function create(cfg) {
  var withEnv = !!(cfg && cfg.env);
  var gl = null, canvas = null, prog = null, U = {};
  var env = null, fb = null, pendingClouds = null;
  var ok = false, failed = false;
  var cache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  var queue = [], queueN = 0;
  var W = 0, H = 0;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function init() {
    if (ok || failed) return ok;
    try {
      if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') throw new Error('no webgl2');
      canvas = document.createElement('canvas');
      // 环境实例自己做 MSAA（离屏帧缓冲），画布本身不能再是多重采样的，否则 blit 不合法
      gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: !withEnv, depth: true });
      if (!gl || !(gl instanceof WebGL2RenderingContext)) throw new Error('no webgl2');
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      ['uP', 'uRt', 'uUp', 'uFw', 'uScale', 'uTint', 'uEmis', 'uCamP', 'uCamR', 'uCamU', 'uCamF',
        'uFocal', 'uCx', 'uCy', 'uW', 'uH', 'uNear', 'uFar', 'uLight', 'uFogRGB', 'uFog', 'uLum',
        'uAlpha', 'uLogC'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      if (withEnv && typeof RenderEnv !== 'undefined') {
        try {
          env = RenderEnv.create(gl, compile);
          if (pendingClouds) env.setClouds(pendingClouds[0], pendingClouds[1], pendingClouds[2]);
        } catch (e2) {
          env = null;    // 环境着色器编译不过：模型照画，环境退回 2D
          if (typeof console !== 'undefined') console.warn('render-env 不可用：', e2);
        }
      }
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ok = false; failed = true; });
      ok = true;
    } catch (e) {
      failed = true; ok = false; gl = null;
    }
    return ok;
  }

  /* ---------- 模型 → 顶点缓冲（每个面扇形三角化，带面法线 / 面中心 / 颜色） ---------- */
  var STRIDE = 13;   // pos3 nrm3 cen3 col3 cl1
  function hexRGB(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function buildData(model, sweep) {
    var verts = model.v, faces = model.f, morph = model.morph;
    var sw = sweep === undefined ? 0 : Math.max(0, Math.min(1, sweep));
    var P = new Array(verts.length);
    for (var i = 0; i < verts.length; i++) {
      var v = verts[i];
      var x = v[0], y = v[1], z = v[2];
      if (morph) {
        var mi = morph.map[i];
        if (mi >= 0) {
          var A = morph.spread[mi], B = morph.swept[mi];
          x = A[0] + (B[0] - A[0]) * sw; y = A[1] + (B[1] - A[1]) * sw; z = A[2] + (B[2] - A[2]) * sw;
        }
      }
      P[i] = [x, y, z];
    }
    var tri = 0, f, fi;
    for (fi = 0; fi < faces.length; fi++) tri += Math.max(0, faces[fi].i.length - 2);
    var data = new Float32Array(tri * 3 * STRIDE);
    var o = 0;
    for (fi = 0; fi < faces.length; fi++) {
      f = faces[fi];
      var idx = f.i, np = idx.length;
      if (np < 3) continue;
      var a = P[idx[0]], b = P[idx[1]], c = P[idx[2]];
      var e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
      var e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
      var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      var cx = 0, cy = 0, cz = 0;
      for (i = 0; i < np; i++) { var p = P[idx[i]]; cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= np; cy /= np; cz /= np;
      var col = hexRGB(f.c), cl = f.cl ? 1 : 0;
      for (var t = 1; t < np - 1; t++) {
        var tv = [idx[0], idx[t], idx[t + 1]];
        for (var k = 0; k < 3; k++) {
          var q = P[tv[k]];
          data[o++] = q[0]; data[o++] = q[1]; data[o++] = q[2];
          data[o++] = nx; data[o++] = ny; data[o++] = nz;
          data[o++] = cx; data[o++] = cy; data[o++] = cz;
          data[o++] = col[0]; data[o++] = col[1]; data[o++] = col[2];
          data[o++] = cl;
        }
      }
    }
    return data;
  }

  function entryFor(model, sweep) {
    var e = cache ? cache.get(model) : model.__gl;
    if (!e) {
      e = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), n: 0, sweep: null };
      gl.bindVertexArray(e.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.vbo);
      var names = [['aPos', 3, 0], ['aNrm', 3, 3], ['aCen', 3, 6], ['aCol', 3, 9], ['aCl', 1, 12]];
      for (var i = 0; i < names.length; i++) {
        var loc = gl.getAttribLocation(prog, names[i][0]);
        if (loc < 0) continue;
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, names[i][1], gl.FLOAT, false, STRIDE * 4, names[i][2] * 4);
      }
      gl.bindVertexArray(null);
      if (cache) cache.set(model, e); else model.__gl = e;
    }
    /* 可变后掠（DB-11）：sweep 变了才重建 —— 只有标了 morph 的模型会走到 */
    var sw = model.morph ? Math.round((sweep || 0) * 200) / 200 : 0;
    if (e.sweep !== sw) {
      var data = buildData(model, sw);
      gl.bindBuffer(gl.ARRAY_BUFFER, e.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data, model.morph ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      e.n = data.length / STRIDE;
      e.sweep = sw;
    }
    return e;
  }

  /* ---------- 每帧 ---------- */
  function begin(w, h, dpr) {
    if (!init()) return false;
    W = w; H = h;
    var pw = Math.max(1, Math.floor(w * dpr)), ph = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    queueN = 0;
    if (env) env.beginParticles();
    return true;
  }

  /* ---------- 离屏 MSAA 帧缓冲 + 深度纹理（只有环境实例用） ---------- */
  function ensureFB() {
    var w = canvas.width, h = canvas.height;
    if (fb && fb.w === w && fb.h === h) return fb;
    if (fb) {
      gl.deleteFramebuffer(fb.ms); gl.deleteFramebuffer(fb.rs);
      gl.deleteRenderbuffer(fb.col); gl.deleteRenderbuffer(fb.dep); gl.deleteTexture(fb.dtex);
    }
    var samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    var f = { w: w, h: h, ms: gl.createFramebuffer(), rs: gl.createFramebuffer() };
    f.col = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, f.col);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    f.dep = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, f.dep);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.ms);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, f.col);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.dep);
    f.dtex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, f.dtex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.rs);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, f.dtex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fb = f;
    return f;
  }

  function setClouds(seeds, cell, far) {
    pendingClouds = [seeds, cell, far];
    if (env) env.setClouds(seeds, cell, far);
  }
  function pushParticles(list) { if (env && list && list.length) env.pushParticles(list); }

  function push(model, P, fwd, up, opts) {
    if (!ok) return;
    var it = queue[queueN] || (queue[queueN] = {});
    queueN++;
    it.m = model; it.P = P; it.f = fwd; it.u = up;
    it.s = opts.scale === undefined ? 1 : opts.scale;
    it.sw = opts.sweep; it.t = opts.tint || 0; it.e = opts.emissive || 0;
    it.a = opts.alpha === undefined ? 1 : opts.alpha;
  }

  function drawItem(it) {
    var e = entryFor(it.m, it.sw);
    if (!e.n) return;
    var f = it.f, u = it.u;
    var rx = u.y * f.z - u.z * f.y, ry = u.z * f.x - u.x * f.z, rz = u.x * f.y - u.y * f.x;
    var rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl > 1e-6) { rx /= rl; ry /= rl; rz /= rl; }
    gl.uniform3f(U.uP, it.P.x, it.P.y, it.P.z);
    gl.uniform3f(U.uRt, rx, ry, rz);
    gl.uniform3f(U.uUp, u.x, u.y, u.z);
    gl.uniform3f(U.uFw, f.x, f.y, f.z);
    gl.uniform1f(U.uScale, it.s);
    gl.uniform1f(U.uTint, it.t);
    gl.uniform1f(U.uEmis, it.e);
    gl.uniform1f(U.uAlpha, it.a);
    gl.bindVertexArray(e.vao);
    gl.drawArrays(gl.TRIANGLES, 0, e.n);
  }

  /* 画出本帧所有模型，返回离屏画布（调用方负责 drawImage）；没东西就返回 null。
     opt.fog === false：不加雾（3D 预览里模型就在眼前，不该发灰）
     opt.env：{ sky, clouds, sheets, particles, soft } —— 环境层哪几项用 WebGL 画
       （只有 create({ env: true }) 的实例认这个；sky 关掉时其余几项也不画，整层退回 2D） */
  function render(cam, opt) {
    var E = (env && opt && opt.env && opt.env.sky) ? opt.env : null;
    if (!ok || (!queueN && !E)) return null;
    var FAR = 400000, S = Shading;
    var useFB = withEnv;
    if (useFB) gl.bindFramebuffer(gl.FRAMEBUFFER, ensureFB().ms);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var C = E ? { cam: cam, W: W, H: H, pw: canvas.width, ph: canvas.height,
      dpr: canvas.width / Math.max(1, W), far: FAR, logC: 1 / Math.log2(FAR + 1) } : null;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    if (E) env.drawEnv(C);
    gl.useProgram(prog);
    gl.uniform3f(U.uCamP, cam.pos.x, cam.pos.y, cam.pos.z);
    gl.uniform3f(U.uCamR, cam.right.x, cam.right.y, cam.right.z);
    gl.uniform3f(U.uCamU, cam.up.x, cam.up.y, cam.up.z);
    gl.uniform3f(U.uCamF, cam.fwd.x, cam.fwd.y, cam.fwd.z);
    gl.uniform1f(U.uFocal, cam.focal);
    gl.uniform1f(U.uCx, cam.cx); gl.uniform1f(U.uCy, cam.cy);
    gl.uniform1f(U.uW, W); gl.uniform1f(U.uH, H);
    gl.uniform1f(U.uNear, cam.near); gl.uniform1f(U.uFar, FAR);
    gl.uniform1f(U.uLogC, 1 / Math.log2(FAR + 1));
    gl.uniform3f(U.uLight, S.LIGHT.x, S.LIGHT.y, S.LIGHT.z);
    gl.uniform3f(U.uFogRGB, S.FOG_RGB[0], S.FOG_RGB[1], S.FOG_RGB[2]);
    if (opt && opt.fog === false) gl.uniform4f(U.uFog, 1e9, 2e9, 0, S.STEPS);
    else gl.uniform4f(U.uFog, S.FOG_NEAR, S.FOG_FAR, S.FOG_MAX, S.STEPS);
    gl.uniform3f(U.uLum, S.AMBIENT, S.DIFFUSE, S.DEGENERATE);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);              // 背面剔除在着色器里按 face.cl 做（单片翼面要双面）

    // 不透明
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    var trans = [], i;
    for (i = 0; i < queueN; i++) {
      if (queue[i].a < 1) trans.push(queue[i]);
      else drawItem(queue[i]);
    }
    gl.bindVertexArray(null);
    // 环境：高空云片 → 云贴片（读解析出来的深度做软粒子）
    if (E) {
      var dtex = null;
      // 实体云要场景深度来截断厚度，所以开着云就总要解析深度
      if (E.clouds && (E.soft || env.meshClouds)) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.rs);
        gl.blitFramebuffer(0, 0, fb.w, fb.h, 0, 0, fb.w, fb.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms);
        dtex = fb.dtex;
      }
      if (E.sheets || E.clouds) env.drawSheets(C, !!E.clouds, !!E.sheets);
      if (E.clouds) env.drawClouds(C, dtex, !!E.soft, fb.ms);
      gl.useProgram(prog);
      gl.disable(gl.BLEND);
    }
    // 半透明：远 → 近，不写深度
    if (trans.length) {
      trans.sort(function (a, b) {
        return M3.dist2(b.P, cam.pos) - M3.dist2(a.P, cam.pos);
      });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (i = 0; i < trans.length; i++) drawItem(trans[i]);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    if (E && E.particles) env.drawParticles(C);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    if (useFB) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, fb.w, fb.h, 0, 0, fb.w, fb.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return canvas;
  }

  return {
    available: function () { return init(); },
    envReady: function () { return init() && !!env; },
    begin: begin, push: push, render: render,
    setClouds: setClouds, pushParticles: pushParticles,
    get canvas() { return canvas; }
  };
  }

  var def = create({ env: true });
  def.create = create;
  return def;
})();
