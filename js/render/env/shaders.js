(function (RenderEnv) {
  'use strict';
  var $ = RenderEnv.$;
  'use strict';

  /* 噪声的平铺周期（米）。相机 xz 取这个周期的余数再传进着色器，
     float 精度不会随着飞远而变差；各层噪声的尺度都是它的整数分之一，余数跳变时纹理无缝。 */
  $.PERIOD = 40960;

  $.HIGH_Y = 10000;

  /* 云团（柔边贴片 / 低多边形实体云）暂时封存：观感不对，以后再说。
     关着时天上只有几层平面云（DECKS 远景云层 + SHEETS 高空云片），DECKS 也不再按距离淡入。
     代码都留着，打开这个开关就恢复（实体云拿不到浮点纹理时仍退回贴片）。 */
  $.BLOBS = false;

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

  $.VS_FULL = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 天空 + 海面 ---------- */
  $.FS_ENV = COMMON + VIEWDIR + [
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
  $.FS_SHEET = COMMON + VIEWDIR + [
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
  $.VS_PUFF = COMMON + [
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

  $.FS_PUFF = COMMON + [
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
  $.VS_PART = COMMON + [
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

  $.FS_PART = COMMON + [
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
  $.VS_MESH = COMMON + [
    'in vec3 aPos; in vec3 aNrm;',
    'uniform vec3 uOff;',
    'out float vW; flat out vec3 vN;',
    'void main() {',
    '  vec3 c = toCam(uOff + aPos);',
    '  vW = c.z; vN = aNrm;',
    '  gl_Position = clipOf(c);',
    '}'
  ].join('\n');

  $.FS_THICK = COMMON + [
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

  $.FS_CCOL = COMMON + [
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

  $.FS_COMP = COMMON + [
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
})(RenderEnv);
