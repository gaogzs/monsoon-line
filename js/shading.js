/* ============================================================
   shading.js —— 着色规则（只写这一份）

   2D 渲染（render.js）和 WebGL 渲染（render-gl.js）都读这里：
   光照方向、亮度公式、雾、量化档数。改一处两边一起变 ——
   这是"所有 3D 界面画面一致"的前提（docs/2-0IMPL.md 阶段 2.5.3）。

   画风刻意保持"每个面一个颜色"：
     亮度  = 0.44 + 0.56 × |n̂ · L|（双面取绝对值；退化面 0.62）
             + tint，再 + emissive（封顶 1.5），量化成 16 档
     雾    = (面中心深度 − FOG_NEAR) / (FOG_FAR − FOG_NEAR)，封顶 FOG_MAX，量化成 16 档
     颜色  = 底色 × 亮度档 × (1 − 雾档) + 雾色 × 雾档
   ============================================================ */
var Shading = (function () {
  'use strict';
  var L = M3.norm(M3.V(-0.42, 0.80, 0.43));
  var S = {
    LIGHT: L,
    FOG_RGB: [150, 176, 196],
    FOG_NEAR: 900, FOG_FAR: 9000, FOG_MAX: 0.82,
    AMBIENT: 0.44, DIFFUSE: 0.56, DEGENERATE: 0.62,
    EMISSIVE_CAP: 1.5,
    STEPS: 16
  };

  /* 亮度（未量化）。n 不必归一化；nl < 1e-9 视为退化面 */
  S.brightness = function (nx, ny, nz, tint, emissive) {
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    var b = S.DEGENERATE;
    if (nl > 1e-9) b = S.AMBIENT + S.DIFFUSE * Math.abs((nx * L.x + ny * L.y + nz * L.z) / nl);
    b += tint || 0;
    return Math.min(S.EMISSIVE_CAP, b + (emissive || 0));
  };
  /* 雾（未量化） */
  S.fog = function (depth) {
    var f = (depth - S.FOG_NEAR) / (S.FOG_FAR - S.FOG_NEAR);
    return f < 0 ? 0 : (f > S.FOG_MAX ? S.FOG_MAX : f);
  };
  /* 量化：0..1 → 档位中心值 */
  S.quant = function (v) {
    var i = v < 0 ? 0 : (v > 0.999 ? S.STEPS - 1 : (v * S.STEPS) | 0);
    return (i + 0.5) / S.STEPS;
  };
  return S;
})();
