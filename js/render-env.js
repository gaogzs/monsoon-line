/* ============================================================
   render-env.js —— WebGL 环境层（docs/2-0IMPL.md 2.5.9）

   天空、海面、云、高空云片、粒子。只给主画面那个 RenderGL 实例用
   （3D 预览不画环境）；2D 回退仍走 render.js 原来的画法，不追这些效果。

   全部参与深度测试，深度一律写成与模型相同的对数深度：
     · 天空 + 海面：一张全屏三角形，逐像素求视线与地球球面的交点
       —— 地平线的俯角、海面"往下弯"都是几何上真的，没有网格、没有边界
     · 高空云片：同样逐像素求视线与水平面的交点
     · 云：每朵云 5–12 个朝向镜头的柔边贴片，远 → 近排序；
       读模型 + 海面的深度做"软粒子"（贴片靠近机身时淡出，不出现硬切边）
     · 粒子：实例化的小圆片 / 破片短线，加色混合，测深度不写深度

   颜色参数在 shading.js（SKY / SEA / CLOUD / SHEETS），与模型的雾同一份光照方向。
   ============================================================ */
var RenderEnv = (function () {
  'use strict';

  /* 噪声的平铺周期（米）。相机 xz 取这个周期的余数再传进着色器，
     float 精度不会随着飞远而变差；各层噪声的尺度都是它的整数分之一，余数跳变时纹理无缝。 */
  var PERIOD = 40960;
  var HIGH_Y = 10000;

  /* 云团（柔边贴片 / 低多边形实体云）暂时封存：观感不对，以后再说。
     关着时天上只有几层平面云（DECKS 远景云层 + SHEETS 高空云片），DECKS 也不再按距离淡入。
     代码都留着，打开这个开关就恢复（实体云拿不到浮点纹理时仍退回贴片）。 */
  var BLOBS = false;

  var COMMON = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec3 uCamP, uCamR, uCamU, uCamF;',
    'uniform float uFocal, uCx, uCy, uW, uH, uNear, uFar, uLogC, uDpr, uCurve;',
    'vec4 clipOf(vec3 c) {',
    '  float xc = (2.0 * uCx / uW - 1.0) * c.z + 2.0 * uFocal * c.x / uW;',
    '  float yc = (1.0 - 2.0 * uCy / uH) * c.z + 2.0 * uFocal * c.y / uH;',
    '  float zc = c.z * (uFar + uNear) / (uFar - uNear) - 2.0 * uFar * uNear / (uFar - uNear);',
    '  return vec4(xc, yc, zc, c.z);',
    '}',
    /* 与模型同一套地球曲率下沉（render-gl.js 的 uCurve） */
    'vec3 toCam(vec3 wp) { vec3 d = wp - uCamP; d.y -= (d.x * d.x + d.z * d.z) * uCurve; return vec3(dot(d, uCamR), dot(d, uCamU), dot(d, uCamF)); }',
    'float logDepth(float w) { return min(0.999999, log2(max(1e-6, 1.0 + w)) * uLogC); }',
    'float linDepth(float d) { return exp2(d / uLogC) - 1.0; }',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    /* 可平铺的值噪声，带解析梯度：返回 (值, d/dx, d/dy)，per = 每个方向的周期（格子数） */
    'vec3 noised(vec2 x, vec2 per) {',
    '  vec2 i = floor(x), f = x - i;',
    '  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);',
    '  float a = hash(mod(i, per)), b = hash(mod(i + vec2(1.0, 0.0), per));',
    '  float c = hash(mod(i + vec2(0.0, 1.0), per)), d = hash(mod(i + vec2(1.0, 1.0), per));',
    '  float k = a - b - c + d;',
    '  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y,',
    '              du * (vec2(b - a, c - a) + k * u.yx));',
    '}',
    'vec3 noised(vec2 x, float per) { return noised(x, vec2(per)); }',
    ''
  ].join('\n');

  /* 屏幕像素 → 世界视线方向（与 M3.project 互逆）。只能放进片元着色器 */
  var VIEWDIR = [
    'vec3 viewDir() {',
    '  float sx = gl_FragCoord.x / uDpr, sy = uH - gl_FragCoord.y / uDpr;',
    '  return normalize(uCamF * uFocal + uCamR * (sx - uCx) - uCamU * (sy - uCy));',
    '}',
    ''
  ].join('\n');

  var VS_FULL = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 天空 + 海面 ---------- */
  var FS_ENV = COMMON + VIEWDIR + [
    'uniform vec3 uLight, uSun, uHaze, uFoamCol;',
    'uniform vec3 uSkyC[4]; uniform float uSkyT[4];',
    'uniform vec3 uSeaC[4]; uniform float uSeaT[4];',
    'uniform float uDip, uSpan, uRh, uC, uSunR, uTime;',
    'uniform vec4 uSeaP;',                      // hazeDist, hazeMax, glint, foam
    'uniform vec2 uXZ;',
    'uniform float uPeriod;',
    'out vec4 o;',
    'vec3 ramp(vec3 C[4], float T[4], float t) {',
    '  vec3 c = C[0];',
    '  for (int i = 1; i < 4; i++) c = mix(c, C[i], clamp((t - T[i - 1]) / (T[i] - T[i - 1]), 0.0, 1.0));',
    '  return c;',
    '}',
    'vec3 sky(vec3 d, float e) {',
    '  vec3 c = ramp(uSkyC, uSkyT, clamp(e / uSpan, 0.0, 1.0)) / 255.0;',
    /* 太阳光晕：与 2D 的径向渐变同一组色标（角距离 ÷ 外缘半径） */
    '  float a = acos(clamp(dot(d, uLight), -1.0, 1.0)) / uSunR;',
    '  if (a < 1.0) {',
    '    vec3 gc; float ga;',
    '    if (a < 0.08) { float k = a / 0.08; gc = mix(vec3(255.0, 246.0, 220.0), vec3(255.0, 238.0, 190.0), k); ga = mix(0.95, 0.55, k); }',
    '    else if (a < 0.30) { float k = (a - 0.08) / 0.22; gc = mix(vec3(255.0, 238.0, 190.0), vec3(220.0, 225.0, 205.0), k); ga = mix(0.55, 0.14, k); }',
    '    else { float k = (a - 0.30) / 0.70; gc = mix(vec3(220.0, 225.0, 205.0), vec3(200.0, 210.0, 210.0), k); ga = mix(0.14, 0.0, k); }',
    '    c = mix(c, gc / 255.0, ga);',
    '  }',
    '  return c;',
    '}',
    'void main() {',
    '  vec3 d = viewDir();',
    '  float e = asin(clamp(d.y, -1.0, 1.0)) + uDip;',   // 高于（视）地平线的角度
    '  float t = -1.0;',
    '  if (d.y < 0.0) {',
    '    float b = d.y * uRh;',
    '    float disc = b * b - uC;',
    '    if (disc >= 0.0) t = uC / (-b + sqrt(disc));',     // 稳定的小根
    '  }',
    '  if (t <= 0.0) { o = vec4(sky(d, max(e, 0.0)), 1.0); gl_FragDepth = 1.0; return; }',
    '  vec2 p = uXZ + d.xz * t;',
    /* 每个像素在海面上覆盖多大（米）：远处、贴着掠过时都变大 —— 用来压掉会闪的细波纹 */
    '  float fp = t / (uFocal * uDpr * max(0.04, -d.y));',
    '  vec2 g = vec2(0.0);',
    /* 只留 40–320 m 的大波：近处细碎的小波纹看着太"精细"，与远处的质感对不上 */
    '  float lam = 40.0;',
    '  for (int k = 0; k < 4; k++) {',
    '    float w = clamp(lam / (fp * 6.0) - 0.5, 0.0, 1.0);',
    '    if (w > 0.0) {',
    '      vec2 dir = vec2(cos(float(k) * 1.7), sin(float(k) * 1.7));',
    '      vec3 n = noised(p / lam + dir * uTime * (0.9 / sqrt(lam)), uPeriod / lam);',
    '      g += n.yz * w * 0.20;',
    '    }',
    '    lam *= 2.0;',
    '  }',
    '  vec3 nrm = normalize(vec3(-g.x, 1.0, -g.y));',
    '  float dep = max(0.0, -e);',
    '  vec3 c = ramp(uSeaC, uSeaT, dep) / 255.0;',
    /* 大块明暗：高空时速度感和方向感主要靠它 */
    '  float big = noised(p / 1280.0, uPeriod / 1280.0).x * 0.6 + noised(p / 5120.0, uPeriod / 5120.0).x * 0.4;',
    '  c *= 0.86 + 0.28 * big;',
    '  c *= 1.0 + 0.30 * (dot(nrm, uLight) - uLight.y);',
    /* 反射天空（菲涅耳）+ 太阳闪烁带 */
    '  vec3 r = reflect(d, nrm);',
    '  float fr = pow(1.0 - max(0.0, dot(-d, nrm)), 5.0);',
    '  c = mix(c, uSkyC[0] / 255.0, fr * 0.22);',
    '  float sp = max(0.0, dot(r, uLight));',
    '  c += uSun / 255.0 * (pow(sp, 260.0) * uSeaP.z + pow(sp, 14.0) * 0.025);',
    /* 白浪：只在低空能分辨的距离里出现 */
    '  float fw = clamp(80.0 / (fp * 6.0) - 0.5, 0.0, 1.0);',
    '  if (fw > 0.0) {',
    '    float fn = noised(p / 80.0 + vec2(uTime * 0.05, 0.0), uPeriod / 80.0).x;',
    '    c = mix(c, uFoamCol / 255.0, smoothstep(0.80, 0.93, fn) * uSeaP.w * fw);',
    '  }',
    '  float hz = min(uSeaP.y, 1.0 - exp(-t / uSeaP.x));',
    '  c = mix(c, uHaze / 255.0, hz);',
    '  o = vec4(c, 1.0);',
    '  gl_FragDepth = logDepth(t * dot(d, uCamF));',
    '}'
  ].join('\n');

  /* ---------- 云片：高空卷云（SHEETS）与远处的低质量云层（DECKS）共用 ----------
     DECKS 是云团的远景替身：云团只铺到 16 km，再远就靠它。它按水平距离淡入
     （uFd：两层各自的起止距离），正好接上云团的淡出 —— 高空往下看，四面八方都有低层云。 */
  var FS_SHEET = COMMON + VIEWDIR + [
    'uniform vec4 uL0, uL1;',                    // y, scale, stretch, alpha
    'uniform vec4 uFd;',                         // 两层的淡入起止（水平距离，米）；0 = 不淡入
    'uniform vec2 uTh;',                         // 噪声门槛
    'uniform float uDeck;',                      // 1 = 低层云（从上往下看顶亮，从下往上看底部只略暗 —— 太暗在蓝天里看不出来）
    'uniform vec2 uXZ; uniform float uPeriod, uCamY, uTime;',
    'uniform vec3 uHz;',
    'out vec4 o;',
    'float fbm(vec2 q, vec2 per) {',
    '  float v = 0.0, a = 0.5;',
    '  for (int k = 0; k < 4; k++) { v += a * noised(q, per).x; q *= 2.0; per *= 2.0; a *= 0.5; }',
    '  return v / 0.9375;',
    '}',
    'vec4 layer(vec3 d, vec4 L, vec2 fd, out float t) {',
    '  t = (L.x - uCamY) / d.y;',
    '  if (!(t > 0.0) || t > 160000.0) return vec4(0.0);',
    '  vec2 p = uXZ + d.xz * t + vec2(uTime * 6.0, 0.0);',
    '  float per = uPeriod / L.y;',
    /* x 方向拉长成卷云的丝状；周期跟着除以拉伸倍数（stretch 必须整除周期） */
    '  vec2 q = vec2(p.x / (L.y * L.z), p.y / L.y);',
    '  float v = fbm(q, vec2(per / L.z, per));',
    '  float a = smoothstep(uTh.x, uTh.y, v) * L.w;',   // 门槛高一点：云片之间要露出干净的天
    '  if (fd.y > 0.0) a *= smoothstep(fd.x, fd.y, length(d.xz) * t);',
    '  a *= 1.0 - smoothstep(60000.0, 160000.0, t);',
    '  a *= smoothstep(120.0, 900.0, abs(uCamY - L.x));',   // 穿过云片时不糊一脸
    '  vec3 c = vec3(0.95, 0.97, 0.985);',
    '  if (uDeck > 0.5) c = d.y < 0.0 ? vec3(0.93, 0.95, 0.97) : vec3(0.92, 0.94, 0.96);',
    /* 从下往上看背景是亮蓝天，同样的 α 对比度远不如从上往下看（背景是深色海面），要加浓才看得见 */
    '  if (uDeck > 0.5 && d.y > 0.0) a = min(0.9, a * 1.9);',
    '  c = mix(c, uHz / 255.0, smoothstep(0.0, 140000.0, t) * 0.6);',
    '  return vec4(c * a, a);',
    '}',
    'void main() {',
    '  vec3 d = viewDir();',
    '  float t0, t1;',
    '  vec4 a = layer(d, uL0, uFd.xy, t0), b = layer(d, uL1, uFd.zw, t1);',
    '  bool ha = a.a > 0.002, hb = b.a > 0.002;',
    '  if (!ha && !hb) discard;',
    /* 近的盖在远的上面（预乘 alpha）；深度取近的那层 */
    '  bool aNear = !hb || (ha && t0 < t1);',
    '  vec4 n = aNear ? a : b, f = aNear ? b : a;',
    '  o = n + f * (1.0 - n.a);',
    '  gl_FragDepth = logDepth((aNear ? t0 : t1) * dot(d, uCamF));',
    '}'
  ].join('\n');

  /* ---------- 云贴片（实例化） ---------- */
  var VS_PUFF = COMMON + [
    'in vec4 aC;',                 // xyz, 半径
    'in vec4 aP;',                 // alpha, 云内高度 0..1, 纹理号, 雾
    'out vec2 vQ; out float vW, vA, vL, vT, vR, vF;',
    'void main() {',
    '  int id = gl_VertexID;',
    '  vec2 q = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : -1.0, (id == 2 || id == 4 || id == 5) ? 1.0 : -1.0);',
    '  vec3 wp = aC.xyz + (uCamR * q.x + uCamU * q.y) * aC.w;',
    '  vec3 c = toCam(wp);',
    '  float cz = toCam(aC.xyz).z;',
    /* 镜头离贴片中心太近（正在穿云）时淡掉，免得一整块糊在屏幕上 */
    '  vA = aP.x * smoothstep(aC.w * 0.25, aC.w * 1.1, cz);',
    '  vQ = q; vW = c.z; vL = aP.y; vT = aP.z; vR = aC.w; vF = aP.w;',
    '  gl_Position = clipOf(c);',
    '}'
  ].join('\n');

  var FS_PUFF = COMMON + [
    'in vec2 vQ; in float vW, vA, vL, vT, vR, vF;',
    'uniform sampler2D uTex; uniform highp sampler2D uDepth; uniform float uSoft;',
    'uniform vec3 uTop, uBody, uBase, uHz;',
    'out vec4 o;',
    'void main() {',
    '  if (vW < uNear) discard;',
    '  vec2 uv = vQ * 0.5 + 0.5;',
    '  float m = texture(uTex, vec2((uv.x + vT) * 0.25, uv.y)).r;',
    '  float a = m * vA;',
    '  if (uSoft > 0.5) {',
    '    float sd = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;',
    '    if (sd < 0.999999) a *= clamp((linDepth(sd) - vW) / (vR * 0.45), 0.0, 1.0);',
    '  }',
    '  if (a < 0.003) discard;',
    '  float lit = clamp(0.30 + 0.45 * vL + 0.55 * (uv.y - 0.5), 0.0, 1.0);',
    '  vec3 c = mix(uBase, uBody, smoothstep(0.0, 0.55, lit));',
    '  c = mix(c, uTop, smoothstep(0.6, 1.0, lit)) / 255.0;',
    '  c = mix(c, uHz / 255.0, vF);',
    '  o = vec4(c * a, a);',
    '  gl_FragDepth = logDepth(vW);',
    '}'
  ].join('\n');

  /* ---------- 粒子（实例化，加色） ---------- */
  var VS_PART = COMMON + [
    'in vec4 aPos;',               // xyz, 世界半径
    'in vec4 aCol;',               // rgb(0..1), alpha
    'in vec3 aTail;',              // 破片：往回拉的那一段（世界坐标），否则 0
    'out vec2 vQ; out vec4 vC; out float vW, vSq;',
    'void main() {',
    '  int id = gl_VertexID;',
    '  vec2 q = vec2((id == 1 || id == 2 || id == 4) ? 1.0 : -1.0, (id == 2 || id == 4 || id == 5) ? 1.0 : -1.0);',
    '  vec3 c = toCam(aPos.xyz);',
    '  vC = aCol; vQ = q; vW = c.z;',
    '  if (c.z < uNear) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vSq = 0.0; return; }',
    '  float rpx = max(0.7, uFocal * aPos.w / c.z);',
    '  vSq = rpx < 1.4 ? 1.0 : 0.0;',             // 太小的点画方块（与 2D 的 fillRect 一致）
    '  if (dot(aTail, aTail) > 0.0) {',
    '    vec3 c0 = toCam(aPos.xyz - aTail);',
    '    if (c0.z > uNear) {',
    '      vec4 A = clipOf(c0), B = clipOf(c);',
    '      vec2 half_ = vec2(uW, uH) * 0.5;',
    '      vec2 pa = A.xy / A.w * half_, pb = B.xy / B.w * half_;',
    '      vec2 dir = pb - pa; float L = length(dir);',
    '      dir = L > 1e-4 ? dir / L : vec2(1.0, 0.0);',
    '      vec2 nrm = vec2(-dir.y, dir.x) * max(1.0, rpx * 0.9) * 0.5;',
    '      vec4 P = q.x < 0.0 ? A : B;',
    '      vec2 px = (q.x < 0.0 ? pa : pb) + nrm * q.y;',
    '      gl_Position = vec4(px / half_ * P.w, P.z, P.w);',
    '      vW = P.w; vSq = 1.0;',
    '      return;',
    '    }',
    '  }',
    '  float rw = rpx * c.z / uFocal;',
    '  gl_Position = clipOf(c + vec3(q * rw, 0.0));',
    '}'
  ].join('\n');

  var FS_PART = COMMON + [
    'in vec2 vQ; in vec4 vC; in float vW, vSq;',
    'out vec4 o;',
    'void main() {',
    '  float a = vC.a;',
    '  if (vSq < 0.5) { float r = length(vQ); if (r > 1.0) discard; a *= 1.0 - smoothstep(0.82, 1.0, r); }',
    '  o = vec4(vC.rgb * a, 0.0);',
    '  gl_FragDepth = logDepth(vW);',
    '}'
  ].join('\n');

  /* ---------- 实体云（低多边形团块，按厚度算不透明度） ----------
     ① 厚度：所有云面画进一张 R32F，背面 +视深、正面 −视深（加法混合），
        每个像素得到"视线在云里走了多远"（多朵云重叠自动相加；镜头在云里时缺的正面 = 0，
        结果正好是从镜头到背面的距离）。视深都先和场景深度取 min：云后面的飞机 / 海面截断厚度。
     ② 颜色：只画正面、自带深度缓冲，每个像素留下最近那个面的平涂颜色（顶亮底暗、按法线受光）。
     ③ 合成：全屏一遍，α = 1 − e^(−厚度×密度)，颜色取 ②。边缘薄、中间实，不做淡出（low-poly 画风）。 */
  var VS_MESH = COMMON + [
    'in vec3 aPos; in vec3 aNrm;',
    'uniform vec3 uOff;',
    'out float vW; flat out vec3 vN;',
    'void main() {',
    '  vec3 c = toCam(uOff + aPos);',
    '  vW = c.z; vN = aNrm;',
    '  gl_Position = clipOf(c);',
    '}'
  ].join('\n');

  var FS_THICK = COMMON + [
    'in float vW; flat in vec3 vN;',
    'uniform highp sampler2D uDepth; uniform float uK;',
    'out vec4 o;',
    'void main() {',
    '  float sd = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;',
    '  float w = vW;',
    '  if (sd < 0.999999) w = min(w, linDepth(sd));',
    '  o = vec4(gl_FrontFacing ? -w * uK : w * uK, 0.0, 0.0, 0.0);',
    '}'
  ].join('\n');

  var FS_CCOL = COMMON + [
    'in float vW; flat in vec3 vN;',
    'uniform highp sampler2D uDepth;',
    'uniform vec3 uLight, uTop, uBody, uBase, uHz; uniform float uFog;',
    'out vec4 o;',
    'void main() {',
    '  if (!gl_FrontFacing) discard;',
    '  float sd = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;',
    '  if (sd < 0.999999 && vW > linDepth(sd)) discard;',
    '  vec3 n = normalize(vN);',
    '  vec3 c = mix(uBase, uBody, smoothstep(-0.6, 0.2, n.y));',
    '  c = mix(c, uTop, smoothstep(0.35, 0.9, n.y));',
    '  c *= 0.82 + 0.22 * max(0.0, dot(n, uLight));',
    '  c = mix(c / 255.0, uHz / 255.0, uFog);',
    '  o = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var FS_COMP = COMMON + [
    'uniform highp sampler2D uThick; uniform sampler2D uCol;',
    'out vec4 o;',
    'void main() {',
    '  ivec2 ij = ivec2(gl_FragCoord.xy);',
    '  float T = texelFetch(uThick, ij, 0).r;',
    '  float a = 1.0 - exp(-max(T, 0.0));',
    '  if (a < 0.004) discard;',
    '  o = vec4(texelFetch(uCol, ij, 0).rgb * a, a);',
    '}'
  ].join('\n');

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

    P.env = program(VS_FULL, FS_ENV, ['uLight', 'uSun', 'uHaze', 'uFoamCol', 'uSkyC', 'uSkyT', 'uSeaC', 'uSeaT',
      'uDip', 'uSpan', 'uRh', 'uC', 'uSunR', 'uTime', 'uSeaP', 'uXZ', 'uPeriod']);
    P.sheet = program(VS_FULL, FS_SHEET, ['uL0', 'uL1', 'uFd', 'uTh', 'uDeck', 'uXZ', 'uPeriod', 'uCamY', 'uTime', 'uHz']);
    P.puff = program(VS_PUFF, FS_PUFF, ['uTex', 'uDepth', 'uSoft', 'uTop', 'uBody', 'uBase', 'uHz']);
    P.part = program(VS_PART, FS_PART, []);

    /* 实体云需要可混合的浮点渲染目标；拿不到就退回柔边贴片 */
    var meshOK = !!(gl.getExtension('EXT_color_buffer_float') && gl.getExtension('EXT_float_blend'));
    var meshVao = null, meshBuf = null, mfb = null;
    if (meshOK) {
      P.thick = program(VS_MESH, FS_THICK, ['uOff', 'uDepth', 'uK']);
      P.ccol = program(VS_MESH, FS_CCOL, ['uOff', 'uDepth', 'uLight', 'uTop', 'uBody', 'uBase', 'uHz', 'uFog']);
      P.comp = program(VS_FULL, FS_COMP, ['uThick', 'uCol']);
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
    var pt = puffTexture();
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
      var mx = cam.pos.x % PERIOD, mz = cam.pos.z % PERIOD;
      return [mx < 0 ? mx + PERIOD : mx, mz < 0 ? mz + PERIOD : mz];
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
      gl.uniform1f(U.uPeriod, PERIOD);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.bindVertexArray(vaoEmpty);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function sheetPass(U, L, deck) {
      gl.uniform4f(U.uL0, L[0].y, L[0].scale, L[0].stretch, L[0].alpha);
      gl.uniform4f(U.uL1, L[1].y, L[1].scale, L[1].stretch, L[1].alpha);
      var f0 = BLOBS && L[0].fadeIn, f1 = BLOBS && L[1].fadeIn;
      gl.uniform4f(U.uFd, f0 ? f0[0] : 0, f0 ? f0[1] : 0, f1 ? f1[0] : 0, f1 ? f1[1] : 0);
      gl.uniform2f(U.uTh, deck ? 0.42 : 0.60, deck ? 0.72 : 0.85);
      gl.uniform1f(U.uDeck, deck ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    /* deck：远处的低层云（云团开着时才画）；high：高空卷云 */
    function drawSheets(C, deck, high) {
      var cam = C.cam, U = setCam(P.sheet, C), xz = camXZ(cam);
      gl.uniform2f(U.uXZ, xz[0], xz[1]);
      gl.uniform1f(U.uPeriod, PERIOD);
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
      clouds = { seeds: seeds, puffs: buildPuffs(seeds), cell: cell, far: far, mesh: null };
      if (meshOK) {
        var M = buildMeshes(seeds);
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
        if (s.y >= HIGH_Y) continue;
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
      if (!clouds || !BLOBS) return;
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
            if (s.y >= HIGH_Y) continue;
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

  return { create: create, PERIOD: PERIOD };
})();
