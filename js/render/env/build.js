(function (RenderEnv) {
  'use strict';
  var $ = RenderEnv.$;
  $.buildMeshes = buildMeshes; $.puffTexture = puffTexture; $.buildPuffs = buildPuffs;

  /* 每朵云 1–3 个团块：二次细分的二十面体压成扁椭球，顶点随机外推 / 内缩，底部压平。
     顶点坐标相对云的种子位置（云底附近）。返回非索引三角形（pos3 + 面法线3） */
  function buildMeshes(seeds) {
    var t = (1 + Math.sqrt(5)) / 2;
    var V0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    var F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
      [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    // 细分一次：80 个面
    var V = V0.map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
    var mid = {}, F = [];
    function m(a, b) {
      var k = a < b ? a + '_' + b : b + '_' + a;
      if (mid[k] === undefined) {
        var x = V[a][0] + V[b][0], y = V[a][1] + V[b][1], z = V[a][2] + V[b][2], l = Math.hypot(x, y, z);
        V.push([x / l, y / l, z / l]); mid[k] = V.length - 1;
      }
      return mid[k];
    }
    F0.forEach(function (f) {
      var a = m(f[0], f[1]), b = m(f[1], f[2]), c = m(f[2], f[0]);
      F.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
    });
    var rnd = lcg(7331), out = [], ranges = [];
    for (var i = 0; i < seeds.length; i++) {
      var s = seeds[i], first = out.length / 6, nl = 1 + ((rnd() * 3) | 0);
      for (var L = 0; L < nl; L++) {
        var big = L === 0;
        var rx = s.s * (big ? 0.62 : 0.34 + 0.2 * rnd()), rz = s.s * (big ? 0.5 + 0.2 * rnd() : 0.3 + 0.2 * rnd());
        var ry = s.s * s.sq * (big ? 0.9 : 0.55 + 0.3 * rnd());
        var ang = rnd() * Math.PI * 2, off = big ? 0 : s.s * (0.3 + 0.25 * rnd());
        var ox = Math.cos(ang) * off, oz = Math.sin(ang) * off, oy = ry * 0.45;
        var rot = rnd() * Math.PI, cr = Math.cos(rot), sr = Math.sin(rot);
        var P = V.map(function (v) {
          var k = 0.82 + 0.34 * rnd();
          var x = v[0] * rx * k, y = v[1] * ry * k, z = v[2] * rz * k;
          if (y < -ry * 0.35) y = -ry * 0.35 - (y + ry * 0.35) * 0.08;   // 底部压平
          return [ox + x * cr - z * sr, oy + y, oz + x * sr + z * cr];
        });
        F.forEach(function (f) {
          var a = P[f[0]], b = P[f[1]], c = P[f[2]];
          var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          var n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          var gx = (a[0] + b[0] + c[0]) / 3 - ox, gy = (a[1] + b[1] + c[1]) / 3 - oy, gz = (a[2] + b[2] + c[2]) / 3 - oz;
          var tri = [a, b, c];
          if (n[0] * gx + n[1] * gy + n[2] * gz < 0) { tri = [a, c, b]; n = [-n[0], -n[1], -n[2]]; }  // 法线朝外
          var nl2 = Math.hypot(n[0], n[1], n[2]) || 1;
          /* 相机基是 right = up × fwd（左手系），屏幕上的绕向与世界里相反：
             这里按"从外面看顺时针"写入，gl_FrontFacing 才对应朝外的面 */
          var ord = [0, 2, 1];
          for (var q = 0; q < 3; q++) out.push(tri[ord[q]][0], tri[ord[q]][1], tri[ord[q]][2], n[0] / nl2, n[1] / nl2, n[2] / nl2);
        });
      }
      ranges.push([first, out.length / 6 - first]);
    }
    return { data: new Float32Array(out), ranges: ranges };
  }

  function lcg(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  /* 云贴片纹理：4 种柔边团块，横排一张 256×64 */
  function puffTexture() {
    var TW = 64, data = new Uint8Array(TW * 4 * TW), rnd = lcg(9157);
    for (var v = 0; v < 4; v++) {
      var blobs = [], nb = 9 + ((rnd() * 6) | 0), b;
      for (b = 0; b < nb; b++) {
        var ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * 0.55;
        blobs.push([Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7 + 0.04, 0.12 + rnd() * 0.16]);
      }
      for (var y = 0; y < TW; y++) {
        for (var x = 0; x < TW; x++) {
          var u = (x + 0.5) / TW * 2 - 1, w = (y + 0.5) / TW * 2 - 1, s = 0;
          for (b = 0; b < nb; b++) {
            var dx = u - blobs[b][0], dy = w - blobs[b][1], r = blobs[b][2];
            s += Math.exp(-(dx * dx + dy * dy) / (r * r));
          }
          /* 边缘用 smoothstep 一路淡到 0 —— 硬一点就会变成一个个"圆片" */
          var e = Math.max(0, Math.min(1, (1 - Math.sqrt(u * u + w * w)) / 0.75));
          e = e * e * (3 - 2 * e);
          var val = Math.min(1, s * 0.6) * e * (0.88 + 0.12 * rnd());
          /* 压掉外围的一层薄纱：大贴片的低 alpha 边缘叠起来，没云的地方也会雾蒙蒙 */
          val = Math.max(0, Math.min(1, (val - 0.08) / 0.55));
          val = val * val * (3 - 2 * val);
          data[y * TW * 4 + v * TW + x] = Math.round(val * 255);
        }
      }
    }
    return { w: TW * 4, h: TW, data: data };
  }

  /* 由 render.js 的云种子生成贴片（确定性，不碰游戏的随机数）：
     中间高、边上低的一个"馒头"，越靠上的贴片越亮 */
  function buildPuffs(seeds) {
    var rnd = lcg(4242), out = [];
    for (var i = 0; i < seeds.length; i++) {
      var s = seeds[i], n = 4 + ((rnd() * 4) | 0), list = [];
      for (var k = 0; k < n; k++) {
        var ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.72;
        var dome = 1 - rr / 0.72;
        var dy = s.s * s.sq * (0.10 + 0.85 * dome * rnd());
        list.push({
          dx: Math.cos(ang) * rr * s.s, dz: Math.sin(ang) * rr * s.s, dy: dy,
          r: s.s * (0.38 + 0.22 * rnd()) * (0.8 + 0.4 * dome),
          l: Math.min(1, dy / Math.max(1, s.s * s.sq * 0.9)),
          tex: (rnd() * 4) | 0
        });
      }
      out.push(list);
    }
    return out;
  }
})(RenderEnv);
