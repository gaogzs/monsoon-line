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

   关卡时间与天色：Shading.setEnv 按一天中的时刻（或直接给太阳方位 / 高度）
   在环境预设之间按太阳高度插值，**原地**改 LIGHT / SKY / SEA / FOG_RGB / CLOUD /
   AMBIENT / DIFFUSE（LIGHT 不能重新赋值：brightness 的闭包与 render.js 顶部都持有同一对象），
   并递增 envVersion —— 缓存了环境数值的地方（GL 的渐变表、2D 的颜色缓存）看它重建。
   缺省预设与上面的常量逐值相等，没写时间的关卡画面不变。不做夜战。
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


  /* ============================================================
     环境预设与 setEnv
     ============================================================ */
  function clone(v) {
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    var o = {}; for (var k in v) o[k] = clone(v[k]);
    return o;
  }
  /* 把 S 里当前的环境字段抄成一份关键帧（缺省预设 = 加载时的常量，逐值相等） */
  function snapshot(el) {
    return {
      el: el,
      amb: S.AMBIENT, dif: S.DIFFUSE,
      fog: clone(S.FOG_RGB),
      skyC: S.SKY.stops.map(function (t) { return clone(t[1]); }),
      sun: clone(S.SKY.sun), sunR: S.SKY.sunR,
      seaC: S.SEA.stops.map(function (t) { return clone(t[1]); }),
      haze: clone(S.SEA.haze), glint: S.SEA.glint,
      cloud: clone(S.CLOUD)
    };
  }
  var DEFAULT_ENV = snapshot(Math.asin(L.y) * 180 / Math.PI);       // ≈ 53°，现有外观
  S.DEFAULT_LIGHT = { x: L.x, y: L.y, z: L.z };                       // 只读副本，UnitView 用
  S.DEFAULT_AMBIENT = DEFAULT_ENV.amb;
  S.DEFAULT_DIFFUSE = DEFAULT_ENV.dif;
  S.envVersion = 0;

  /* 关键帧：按太阳高度（度）从高到低。太阳比缺省还高（正午）沿用缺省，只换光向；
     比黄昏还低（−2° 以下）沿用黄昏 —— 不做夜战。
     低太阳角时环境光下限抬高（amb）、直射减弱（dif），背光面才不会全黑。 */
  var KEYS = [
    DEFAULT_ENV,                                                       // 正午 / 高位
    { el: 38, amb: 0.44, dif: 0.54,                                    // 上午 / 午后
      fog: [156, 176, 190],
      skyC: [[205, 214, 216], [132, 176, 198], [52, 106, 143], [20, 44, 68]],
      sun: [255, 243, 212], sunR: 0.29,
      seaC: [[80, 98, 108], [44, 57, 67], [22, 33, 42], [11, 19, 25]],
      haze: [80, 98, 108], glint: 0.26,
      cloud: { top: [255, 252, 246], body: [236, 238, 238], base: [148, 160, 172] } },
    { el: 15, amb: 0.48, dif: 0.44,                                    // 金色时段
      fog: [186, 168, 152],
      skyC: [[238, 205, 160], [168, 170, 178], [76, 104, 140], [26, 42, 68]],
      sun: [255, 214, 150], sunR: 0.34,
      seaC: [[118, 104, 98], [56, 60, 70], [26, 32, 42], [12, 18, 26]],
      haze: [120, 106, 98], glint: 0.40,
      cloud: { top: [255, 226, 190], body: [236, 214, 196], base: [150, 128, 128] } },
    { el: 1, amb: 0.50, dif: 0.28,                                     // 黄昏：天空偏暖、海面暗、雾偏紫
      fog: [150, 120, 128],
      skyC: [[232, 150, 110], [150, 110, 130], [52, 60, 100], [14, 22, 48]],
      sun: [255, 170, 100], sunR: 0.40,
      seaC: [[96, 70, 76], [40, 40, 56], [16, 20, 32], [8, 11, 20]],
      haze: [96, 74, 82], glint: 0.50,
      cloud: { top: [255, 170, 140], body: [190, 140, 150], base: [90, 80, 104] } }
  ];
  function mix(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * t;
    if (Array.isArray(a)) return a.map(function (x, i) { return mix(x, b[i], t); });
    var o = {}; for (var k in a) o[k] = mix(a[k], b[k], t);
    return o;
  }
  function keyAt(el) {
    if (el >= KEYS[0].el) return KEYS[0];
    var n = KEYS.length;
    if (el <= KEYS[n - 1].el) return KEYS[n - 1];
    for (var i = 0; i < n - 1; i++) {
      if (el <= KEYS[i].el && el > KEYS[i + 1].el) {
        var t = (KEYS[i].el - el) / (KEYS[i].el - KEYS[i + 1].el);
        t = t * t * (3 - 2 * t);
        return mix(KEYS[i], KEYS[i + 1], t);
      }
    }
    return KEYS[0];
  }
  function put(dst, src) { for (var i = 0; i < dst.length; i++) dst[i] = src[i]; }
  function apply(k) {
    S.AMBIENT = k.amb; S.DIFFUSE = k.dif;
    put(S.FOG_RGB, k.fog);
    for (var i = 0; i < 4; i++) { put(S.SKY.stops[i][1], k.skyC[i]); put(S.SEA.stops[i][1], k.seaC[i]); }
    put(S.SKY.sun, k.sun); S.SKY.sunR = k.sunR;
    put(S.SEA.haze, k.haze); S.SEA.glint = k.glint;
    put(S.CLOUD.top, k.cloud.top); put(S.CLOUD.body, k.cloud.body); put(S.CLOUD.base, k.cloud.base);
  }

  /* 当地太阳时 → 太阳 { az 真方位°, el 高度° }。北纬 12°，赤纬近似春分（6 点日出 / 18 点日落）：
     sin el = cosφ·cosH；北纬 12° 的春分正午太阳在正南偏高。 */
  var LAT = 12 * Math.PI / 180;
  S.sunAt = function (hour) {
    var H = (hour - 12) * 15 * Math.PI / 180;
    var sinEl = Math.cos(LAT) * Math.cos(H);
    var el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
    // 方位（北 0 顺时针，春分赤纬 0）：sin az ∝ −sinH·cosφ，cos az ∝ −sinφ·sin el（同乘 cosφ·cos el）
    var az = Math.atan2(-Math.sin(H) * Math.cos(LAT), -Math.sin(LAT) * sinEl) * 180 / Math.PI;
    return { az: (az % 360 + 360) % 360, el: el * 180 / Math.PI };
  };

  /* setEnv(env, axis)
       env  缺省 / null / {} → 缺省预设（现有外观，光向精确等于加载时的常量）
            { hour }         → 当地太阳时
            { sun: {az, el} } → 直接给太阳（真方位°，高度°），优先于 hour
       axis 世界 +z 的真方位（mission.axis），把真方位换成世界方向 */
  S.setEnv = function (env, axis) {
    var sun = null;
    if (env && env.sun && isFinite(env.sun.az) && isFinite(env.sun.el)) sun = env.sun;
    else if (env && isFinite(env.hour)) sun = S.sunAt(env.hour);
    if (!sun) {
      L.x = S.DEFAULT_LIGHT.x; L.y = S.DEFAULT_LIGHT.y; L.z = S.DEFAULT_LIGHT.z;
      apply(DEFAULT_ENV);
    } else {
      var el = Math.max(-5, Math.min(89, sun.el)) * Math.PI / 180;
      var yaw = (sun.az - (axis || 0)) * Math.PI / 180;           // 真方位 → 世界偏航
      L.x = Math.sin(yaw) * Math.cos(el); L.y = Math.sin(el); L.z = Math.cos(yaw) * Math.cos(el);
      apply(keyAt(sun.el));
    }
    S.envVersion++;
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
