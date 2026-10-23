#!/usr/bin/env node
/**
 * 俯视识别图预览器
 *
 * 这个项目没有浏览器可用，而"画风"这种东西光看代码是判断不了的。
 * 所以这里实现一个最小 Canvas 2D 子集 + 光栅化 + PNG 编码，
 * 直接把 PLANFORM.draw() 的输出落成图片，供人肉检查。
 *
 * 它加载的是**真正的 js/planform.js**，用的是同一份绘制代码 ——
 * 预览和游戏里看到的完全一致。
 *
 * 用法：node tools/render/render-planform.js
 * 输出：tools/render/out/<机型>-<挂载>.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = require('../lib/root').ROOT;
const OUT = path.join(__dirname, 'out');
const W = 640, H = 440;

/* ============================================================
   最小光栅器
   ============================================================ */
function Raster(w, h) {
  this.w = w; this.h = h;
  this.rgb = new Float32Array(w * h * 3);
  this.a = new Float32Array(w * h);
}

Raster.prototype.blend = function (x, y, r, g, b, al) {
  if (al <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  const i = y * this.w + x;
  const ia = i * 3;
  const k = al + this.a[i] * (1 - al);
  if (k <= 0) return;
  this.rgb[ia] = (r * al + this.rgb[ia] * this.a[i] * (1 - al)) / k;
  this.rgb[ia + 1] = (g * al + this.rgb[ia + 1] * this.a[i] * (1 - al)) / k;
  this.rgb[ia + 2] = (b * al + this.rgb[ia + 2] * this.a[i] * (1 - al)) / k;
  this.a[i] = k;
};

/** 线段描边（按点到线段距离做抗锯齿） */
Raster.prototype.line = function (x0, y0, x1, y1, col, lw, dash) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const hw = Math.max(0.5, lw / 2);
  const minx = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 1));
  const maxx = Math.min(this.w - 1, Math.ceil(Math.max(x0, x1) + hw + 1));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1) - hw - 1));
  const maxy = Math.min(this.h - 1, Math.ceil(Math.max(y0, y1) + hw + 1));
  const ux = dx / len, uy = dy / len;

  // 虚线段长
  const dashLen = dash ? dash[0] : 0;
  const gapLen = dash ? dash[1] : 0;

  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      let t = px * ux + py * uy;
      if (t < 0 || t > len) continue;
      if (dashLen > 0) {
        const ph = t % (dashLen + gapLen);
        if (ph > dashLen) continue;
      }
      const cx = px - t * ux, cy = py - t * uy;
      const d = Math.hypot(cx, cy);
      const cov = Math.min(1, Math.max(0, hw + 0.5 - d));
      if (cov > 0) this.blend(x, y, col[0], col[1], col[2], cov * col[3]);
    }
  }
};

/** 多边形填充（扫描线 + 奇偶规则，4x 纵向超采样） */
Raster.prototype.poly = function (pts, col) {
  if (pts.length < 3) return;
  let miny = Infinity, maxy = -Infinity;
  for (const p of pts) { if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
  miny = Math.max(0, Math.floor(miny));
  maxy = Math.min(this.h - 1, Math.ceil(maxy));
  const SS = 4;

  for (let y = miny; y <= maxy; y++) {
    const cover = new Float32Array(this.w);
    for (let s = 0; s < SS; s++) {
      const sy = y + (s + 0.5) / SS;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const y0 = a[1], y1 = b[1];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
          const t = (sy - y0) / (y1 - y0);
          xs.push(a[0] + t * (b[0] - a[0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.max(0, xs[i]), xb = Math.min(this.w, xs[i + 1]);
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const l = Math.max(xa, x), r = Math.min(xb, x + 1);
          if (r > l) cover[x] += (r - l) / SS;
        }
      }
    }
    for (let x = 0; x < this.w; x++) {
      if (cover[x] > 0) {
        this.blend(x, y, col[0], col[1], col[2], Math.min(1, cover[x]) * col[3]);
      }
    }
  }
};

/* ============================================================
   最小 Canvas 2D 子集
   ============================================================ */
function parseColor(s) {
  if (typeof s !== 'string') return [128, 128, 128, 1];
  s = s.trim();
  let m;
  if ((m = /^#([0-9a-f]{6})$/i.exec(s))) {
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  }
  if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
    const p = m[1].split(',').map(v => parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return [128, 128, 128, 1];
}

function makeCtx(ras) {
  let pts = [];
  let cur = null;
  const st = {
    strokeStyle: '#fff', fillStyle: '#fff', lineWidth: 1,
    globalAlpha: 1, font: '', textAlign: '', joinStyle: '',
    _dash: null, _stack: []
  };

  const ctx = {
    get canvas() { return { width: ras.w, height: ras.h }; },
    set strokeStyle(v) { st.strokeStyle = v; }, get strokeStyle() { return st.strokeStyle; },
    set fillStyle(v) { st.fillStyle = v; }, get fillStyle() { return st.fillStyle; },
    set lineWidth(v) { st.lineWidth = v; }, get lineWidth() { return st.lineWidth; },
    set globalAlpha(v) { st.globalAlpha = v; }, get globalAlpha() { return st.globalAlpha; },
    set globalCompositeOperation(v) { }, get globalCompositeOperation() { return 'source-over'; },
    set font(v) { st.font = v; }, get font() { return st.font; },
    set textAlign(v) { st.textAlign = v; }, get textAlign() { return st.textAlign; },
    set textBaseline(v) { }, set joinStyle(v) { }, set lineCap(v) { },
    set lineDashOffset(v) { }, set shadowBlur(v) { }, set shadowColor(v) { },

    save() { st._stack.push({ s: st.strokeStyle, f: st.fillStyle, w: st.lineWidth, a: st.globalAlpha, d: st._dash }); },
    restore() {
      const s = st._stack.pop();
      if (s) { st.strokeStyle = s.s; st.fillStyle = s.f; st.lineWidth = s.w; st.globalAlpha = s.a; st._dash = s.d; }
    },
    translate() {}, rotate() {}, scale() {}, setTransform() {}, transform() {},

    beginPath() { pts = []; cur = null; },
    moveTo(x, y) { cur = [x, y]; pts.push(cur); },
    lineTo(x, y) { if (!cur) { cur = [x, y]; pts.push(cur); } else { cur = [x, y]; pts.push(cur); } },
    closePath() { if (pts.length) pts.push(pts[0].slice()); },

    rect(x, y, w, h) {
      pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      cur = pts[pts.length - 1];
    },
    arc(cx, cy, r, a0, a1) {
      const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 2) + 8);
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      cur = pts[pts.length - 1];
    },
    ellipse(cx, cy, rx, ry, rot, a0, a1) {
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n;
        const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot),
          cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      cur = pts[pts.length - 1];
    },
    quadraticCurveTo(cx, cy, x, y) {
      const p0 = cur ? cur.slice() : [0, 0];
      const n = 14;
      for (let i = 1; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        pts.push([
          mt * mt * p0[0] + 2 * mt * t * cx + t * t * x,
          mt * mt * p0[1] + 2 * mt * t * cy + t * t * y
        ]);
      }
      cur = pts[pts.length - 1];
    },
    bezierCurveTo() {},
    setLineDash(d) { st._dash = (d && d.length) ? d : null; },

    stroke() {
      const col = parseColor(st.strokeStyle);
      col[3] *= st.globalAlpha;
      for (let i = 1; i < pts.length; i++) {
        ras.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], col, st.lineWidth, st._dash);
      }
    },
    fill() {
      const col = parseColor(st.fillStyle);
      col[3] *= st.globalAlpha;
      ras.poly(pts, col);
    },
    fillRect(x, y, w, h) {
      const col = parseColor(st.fillStyle);
      col[3] *= st.globalAlpha;
      ras.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col);
    },
    clearRect() {},
    strokeRect(x, y, w, h) {
      const col = parseColor(st.strokeStyle);
      col[3] *= st.globalAlpha;
      const L = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
      for (let i = 1; i < L.length; i++) ras.line(L[i - 1][0], L[i - 1][1], L[i][0], L[i][1], col, st.lineWidth, st._dash);
    },
    fillText() {}, strokeText() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText() { return { width: 10 }; }
  };
  return ctx;
}

/* ============================================================
   PNG 编码
   ============================================================ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgb, alpha) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const off = y * (w * 4 + 1);
    raw[off] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, ia = i * 3, o = off + 1 + x * 4;
      raw[o] = Math.max(0, Math.min(255, Math.round(rgb[ia])));
      raw[o + 1] = Math.max(0, Math.min(255, Math.round(rgb[ia + 1])));
      raw[o + 2] = Math.max(0, Math.min(255, Math.round(rgb[ia + 2])));
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ============================================================
   加载真正的 planform.js 并渲染
   ============================================================ */
const Scripts = require('../lib/scripts');
const scripts = Scripts.loadOrder();   // 如 'js/data.js'

const sandbox = { console, Math, JSON, Object, Array, Float32Array, Buffer };
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
sandbox.document = { getElementById: () => null, createElement: () => ({ getContext: () => null }) };
const ctxVm = vm.createContext(sandbox);

// 只加载绘制所需的最小集合：math3d（无关但无害）→ models → planform → data → 其余按需
for (const file of Scripts.preview()) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctxVm, { filename: file });
}

const PLANFORM = sandbox.PLANFORM;
const AIRCRAFT = sandbox.AIRCRAFT;

if (!PLANFORM || !AIRCRAFT) {
  console.error('加载失败：PLANFORM 或 AIRCRAFT 未定义');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

// 底板色，和游戏里的 #070d12 一致
const BG = [0x07, 0x0d, 0x12];

const WEAPONS = sandbox.WEAPONS;

/* 把某武器装满所有挂得下的组 */
function fillWith(ac, wid) {
  const w = WEAPONS[wid];
  const lo = {};
  for (const g of ac.hardpointGroups) {
    lo[g.id] = (w.fits && w.fits.indexOf(g.kind) >= 0) ? wid : null;
  }
  return lo;
}

function blank() {
  return {};
}

const shots = [];
for (const ac of AIRCRAFT) {
  shots.push({ ac, name: ac.id + '-default', lo: ac.defaultLoadout, hi: null });
  shots.push({ ac, name: ac.id + '-clean', lo: blank(), hi: null });
  for (const wid of Object.keys(WEAPONS)) {
    if (WEAPONS[wid].kind === 'gun') continue;
    const lo = fillWith(ac, wid);
    let any = false;
    for (const k in lo) if (lo[k]) any = true;
    if (!any) continue;                       // 这架机挂不上，跳过
    shots.push({ ac, name: ac.id + '-' + wid, lo, hi: ac.hardpointGroups[0].id });
  }
}

let count = 0;
for (const s of shots) {
  const ras = new Raster(W, H);
  for (let i = 0; i < W * H; i++) {
    ras.rgb[i * 3] = BG[0]; ras.rgb[i * 3 + 1] = BG[1]; ras.rgb[i * 3 + 2] = BG[2];
    ras.a[i] = 1;
  }
  const canvas = { width: W, height: H, getContext: () => makeCtx(ras) };
  PLANFORM.draw(canvas, s.ac, s.lo, s.hi);

  fs.writeFileSync(path.join(OUT, s.name + '.png'), encodePNG(W, H, ras.rgb, ras.a));
  console.log('  ' + s.name + '.png');
  count++;
}

console.log('\n生成 ' + count + ' 张预览图 → tools/render/out/');
