'use strict';
/**
 * 最小光栅器 · 最小 Canvas 2D 子集 · PNG 编码
 *
 * 这个项目没有浏览器可用，而"画风"这种东西光看代码判断不了。
 * 所以 tools/ 下的预览器需要一个能落盘的画布 —— 这一层就放这里，
 * 供 tools/render-ships.js 之类的工具共用。
 *
 * 原来的实现在 tools/render-planform.js 里是内联的；那份保持原样不动
 * （它已经被验证过，没必要为了去重去动一个能跑的工具）。
 * 新增的预览工具从这里 require。
 */

const zlib = require('zlib');

/* ============================================================
   光栅
   ============================================================ */
function Raster(w, h) {
  this.w = w; this.h = h;
  this.rgb = new Float32Array(w * h * 3);
  this.a = new Float32Array(w * h);
}

Raster.prototype.clear = function (r, g, b) {
  for (let i = 0; i < this.w * this.h; i++) {
    this.rgb[i * 3] = r; this.rgb[i * 3 + 1] = g; this.rgb[i * 3 + 2] = b;
    this.a[i] = 1;
  }
};

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
    globalAlpha: 1, font: '', textAlign: '',
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

function encodePNG(w, h, rgb) {
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

module.exports = { Raster, makeCtx, parseColor, encodePNG };
