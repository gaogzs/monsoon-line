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
    STEPS: 16,

    /* ---- 环境（只有 WebGL 用；2D 回退保持 render.js 里原来的画法） ---- */
    EARTH_R: 6371000,
    /* 天空：按"高于地平线的角度 ÷ 竖直视场"取渐变（与 2D 的屏幕渐变同一组色标） */
    SKY: {
      stops: [[0, [201, 216, 221]], [0.22, [127, 178, 204]], [0.58, [47, 108, 149]], [1, [18, 44, 71]]],
      sun: [255, 246, 220], sunR: 0.275          // 光晕外缘的角半径（弧度）
    },
    /* 海面：按"低于地平线的角度"取底色，远处融进 haze */
    SEA: {
      stops: [[0, [77, 100, 114]], [0.03, [43, 58, 70]], [0.45, [22, 34, 43]], [0.9, [11, 19, 25]]],
      haze: [77, 100, 114], hazeDist: 38000, hazeMax: 0.92,
      glint: 0.22, foam: 0.16
    },
    /* 云：顶部受光、底部压暗 */
    CLOUD: { top: [255, 255, 255], body: [232, 240, 245], base: [142, 163, 180] },
    /* 高空云片（"高"画质）：高度、纹理尺度（米）、x 向拉伸、浓度。
       scale 与 scale × stretch 都必须整除 render-env.js 的 PERIOD（40960），否则纹理会接缝 */
    /* 远处的低质量云层（云团的远景替身）：fadeIn = 按水平距离淡入的起止（米），
       接在云团 16 km 的淡出上。scale 同样必须整除 PERIOD */
    DECKS: [
      { y: 2100, scale: 2560, stretch: 1, alpha: 0.42, fadeIn: [10000, 16000] },
      { y: 5200, scale: 5120, stretch: 1, alpha: 0.26, fadeIn: [10000, 16000] }
    ],
    SHEETS: [
      { y: 12600, scale: 5120, stretch: 4, alpha: 0.30 },
      { y: 17400, scale: 10240, stretch: 2, alpha: 0.20 }
    ]
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
