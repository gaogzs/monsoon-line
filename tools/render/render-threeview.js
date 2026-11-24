#!/usr/bin/env node
/**
 * 机体模型三视图渲染 + 零件连通性 / 喷口接合检查
 *
 * 模型是一堆"零件"（共享顶点的面的连通块）拼起来的。改模型时最容易犯的错是：
 * 零件之间差 0.1 m 没接上（悬空）、喷口圆管比机尾还宽（圆环探出机体轮廓）、
 * 多余的零件埋在机身里露出一半。这些在游戏里一眼看不出来，所以用这个脚本复测。
 *
 * 用法：
 *   node tools/render/render-threeview.js [--check] [outdir] [name1,name2,...]
 *
 *   默认          渲染 <name>.png（顶/侧/正视）与 <name>-rear.png（后视），
 *                 外加 report.json，写到 outdir（缺省 tools/render/out/threeview）。
 *                 悬空零件在图里染成粉色，喷口染成橙色，零件交界描暗线。
 *   --check       不出图，只输出检查结果；有悬空零件时退出码为 1。
 *
 * 判据：
 *   悬空      零件到主体（面数最多的零件）经"间距 ≤ 0.08 m"的零件链够不着。
 *             包围盒离得超过 2.5 m 的零件对不细算，所以更远的悬空件查不出来。
 *   圆环外露  喷口前端圆环的顶点落在主体轮廓之外的个数。采样点取在主体最后端往前 2 cm，
 *             所以喷口前端正好贴在机尾端面的机型也能稳定判断。只对挂在机身尾端的喷口有意义；
 *             吊舱 / 翼下发动机的喷口接在吊舱上，不是接在主体上，数字不看。
 *   喷口数    C.nozzle 色的零件个数。Ent.nozzlesOf 按它给加力羽流定位，数量和书写顺序不能乱改。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = require('../lib/root').ROOT;
const Sim = require('../lib/sim');
const { encodePNG } = require('../lib/raster');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const pos = args.filter(a => a !== '--check');
const OUT = pos[0] || path.join(__dirname, 'out', 'threeview');
const ONLY = pos[1] ? pos[1].split(',') : null;
const S = Sim.load({ seed: 1 }); const G = S.sandbox; const M = G.MODELS;
const NOZ = ((G.ModelLib && G.ModelLib.C) || {}).nozzle;
// 飞机模型 = js/models/aircraft 下的文件，外加 sower（它放在 targets/，但 datum / pelican 当飞机用）
const names = fs.readdirSync(path.join(ROOT, 'js/models/aircraft')).map(f => f.replace('.js', '')).concat(['sower'])
  .filter(n => M[n] && (!ONLY || ONLY.includes(n)));

const hex = s => { s = (s || '#888888').replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);

function analyse(m) {
  // 零件 = 共享顶点的面的连通块
  const par = m.v.map((_, i) => i); const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  m.f.forEach(f => { for (let j = 1; j < f.i.length; j++) { const a = find(f.i[0]), b = find(f.i[j]); if (a !== b) par[a] = b; } });
  const byRoot = {}; m.f.forEach((f, fi) => { const r = find(f.i[0]); (byRoot[r] = byRoot[r] || { faces: [] }).faces.push(fi); });
  const comps = Object.values(byRoot);
  comps.forEach((c, ci) => {
    c.id = ci; c.tris = []; c.edges = []; c.vs = new Set(); c.noz = false;
    c.mn = [1e9, 1e9, 1e9]; c.mx = [-1e9, -1e9, -1e9];
    for (const fi of c.faces) { const f = m.f[fi]; if (NOZ && f.c === NOZ) c.noz = true;
      for (let t = 1; t < f.i.length - 1; t++) c.tris.push([m.v[f.i[0]], m.v[f.i[t]], m.v[f.i[t + 1]]]);
      for (let j = 0; j < f.i.length; j++) { c.edges.push([m.v[f.i[j]], m.v[f.i[(j + 1) % f.i.length]]]); c.vs.add(f.i[j]); } }
    for (const vi of c.vs) for (let q = 0; q < 3; q++) { c.mn[q] = Math.min(c.mn[q], m.v[vi][q]); c.mx[q] = Math.max(c.mx[q], m.v[vi][q]); }
    c.size = len(sub(c.mx, c.mn));
  });
  return comps;
}
// 线段 p→q 与三角形相交（Möller–Trumbore）
function segTri(p, q, t) {
  const d = sub(q, p), e1 = sub(t[1], t[0]), e2 = sub(t[2], t[0]), h = cross(d, e2), a = dot(e1, h);
  if (Math.abs(a) < 1e-12) return false;
  const f = 1 / a, s = sub(p, t[0]), u = f * dot(s, h); if (u < -1e-9 || u > 1 + 1e-9) return false;
  const qv = cross(s, e1), v = f * dot(d, qv); if (v < -1e-9 || u + v > 1 + 1e-9) return false;
  const tt = f * dot(e2, qv); return tt >= -1e-9 && tt <= 1 + 1e-9;
}
function ptTriDist(p, t) { // 点到三角形最近距离
  const a = t[0], b = t[1], c = t[2], ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len(sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w])); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return len(sub(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]));
}
function gap(m, A, B) { // A、B 两零件的最小间距；相交返回 0
  for (const [p, q] of A.edges) for (const t of B.tris) if (segTri(p, q, t)) return 0;
  for (const [p, q] of B.edges) for (const t of A.tris) if (segTri(p, q, t)) return 0;
  let best = 1e9;
  for (const vi of A.vs) for (const t of B.tris) best = Math.min(best, ptTriDist(m.v[vi], t));
  for (const vi of B.vs) for (const t of A.tris) best = Math.min(best, ptTriDist(m.v[vi], t));
  return best;
}
function connectivity(m, comps) {
  const n = comps.length, TOL = 0.08, adj = comps.map(() => []), near = comps.map(() => ({ d: 1e9, to: -1 }));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = comps[i], B = comps[j];
    const bg = Math.max(0, ...[0, 1, 2].map(q => Math.max(A.mn[q] - B.mx[q], B.mn[q] - A.mx[q])));
    if (bg > 2.5) continue;                                   // 包围盒离得很远，不必细算
    const g = gap(m, A, B);
    if (g < near[i].d) near[i] = { d: g, to: j }; if (g < near[j].d) near[j] = { d: g, to: i };
    if (g <= TOL) { adj[i].push(j); adj[j].push(i); }
  }
  let main = 0; comps.forEach((c, i) => { if (c.faces.length > comps[main].faces.length) main = i; });
  const seen = new Set([main]), st = [main]; while (st.length) { const x = st.pop(); for (const y of adj[x]) if (!seen.has(y)) { seen.add(y); st.push(y); } }
  return { main, attached: seen, near };
}

function insideComp(pt, C) {
  const q = [pt[0], pt[1] + 1000, pt[2]]; let k = 0;
  for (const t of C.tris) if (segTri(pt, q, t)) k++;
  return k % 2 === 1;
}

/* 喷口前端圆环有多少顶点在主体轮廓之外（见文件头"圆环外露"）。
   采样点取 min(喷口前端 z, 主体最后端 + 0.02)：喷口前端埋进机体就按它自己的 z，
   正好贴在端面就退到端面前 2 cm，避免落在表面上忽进忽出。 */
function ringExposure(m, main, c) {
  const verts = [...c.vs].map(vi => m.v[vi]), zmax = c.mx[2];
  const ring = verts.filter(v => v[2] > zmax - 0.05), zs = Math.min(zmax, main.mn[2] + 0.02);
  let out = 0; for (const v of ring) if (!insideComp([v[0], v[1], zs], main)) out++;
  return { out, n: ring.length };
}

function render(m, comps, floating, view, S, W, H, ox, oy) {
  // 返回 rgb(W*H*3)；view: top/side/front/rear
  const zb = new Float32Array(W * H).fill(-1e9), idb = new Int32Array(W * H).fill(-1), rgb = new Uint8Array(W * H * 3).fill(246);
  const P = v => view === 'top' ? [ox + v[0] * S, oy - v[2] * S, v[1]] : view === 'side' ? [ox + v[2] * S, oy - v[1] * S, v[0]] : view === 'rear' ? [ox - v[0] * S, oy - v[1] * S, -v[2]] : [ox + v[0] * S, oy - v[1] * S, v[2]];
  const L = view === 'top' ? [0.3, 1, 0.4] : view === 'side' ? [0.5, 0.6, 0.6] : view === 'rear' ? [0.3, 0.6, -1] : [0.3, 0.6, 1];
  const ll = len(L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  comps.forEach((c, ci) => {
    for (const fi of c.faces) {
      const f = m.f[fi]; let base = hex(f.c);
      if (NOZ && f.c === NOZ) base = [255, 120, 30];
      if (floating.has(ci)) base = [base[0] * 0.4 + 255 * 0.6, base[1] * 0.4, base[2] * 0.4 + 255 * 0.6];
      for (let t = 1; t < f.i.length - 1; t++) {
        const a = m.v[f.i[0]], b = m.v[f.i[t]], cc = m.v[f.i[t + 1]];
        const n = cross(sub(b, a), sub(cc, a)); const nl = len(n); const sh = nl > 1e-9 ? 0.45 + 0.55 * Math.abs(dot(n, L)) / nl : 0.7;
        const col = base.map(x => Math.min(255, x * sh));
        const pa = P(a), pb = P(b), pc = P(cc);
        const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
        const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
        const den = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1]); if (Math.abs(den) < 1e-9) continue;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w1 = ((pb[1] - pc[1]) * (px - pc[0]) + (pc[0] - pb[0]) * (py - pc[1])) / den, w2 = ((pc[1] - pa[1]) * (px - pc[0]) + (pa[0] - pc[0]) * (py - pc[1])) / den, w3 = 1 - w1 - w2;
          if (w1 < -1e-3 || w2 < -1e-3 || w3 < -1e-3) continue;
          const z = w1 * pa[2] + w2 * pb[2] + w3 * pc[2], i = y * W + x;
          if (z > zb[i]) { zb[i] = z; idb[i] = ci; rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]; }
        }
      }
    }
  });
  // 零件交界描暗线
  const out = Uint8Array.from(rgb);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, id = idb[i]; let edge = false;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx >= W || yy >= H) continue; if (idb[yy * W + xx] !== id) edge = true; }
    if (edge) { out[i * 3] = 20; out[i * 3 + 1] = 24; out[i * 3 + 2] = 32; }
  }
  return out;
}

function writeImages(n, m, comps, floating) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const v of m.v) for (let q = 0; q < 3; q++) { mn[q] = Math.min(mn[q], v[q]); mx[q] = Math.max(mx[q], v[q]); }
  const span = mx[0] - mn[0], length = mx[2] - mn[2], hgt = mx[1] - mn[1];
  const CELL = 380, S = (CELL - 40) / Math.max(span, length), W = CELL * 2, H = CELL * 2;
  const full = new Uint8Array(W * H * 3).fill(246);
  const place = (view, cx, cy, ox, oy) => {
    const v = render(m, comps, floating, view, S, CELL, CELL, ox, oy);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const si = (y * CELL + x) * 3, di = ((cy + y) * W + cx + x) * 3; full[di] = v[si]; full[di + 1] = v[si + 1]; full[di + 2] = v[si + 2]; }
  };
  const cxm = (mn[0] + mx[0]) / 2, czm = (mn[2] + mx[2]) / 2, cym = (mn[1] + mx[1]) / 2;
  place('top', 0, 0, CELL / 2 - cxm * S, CELL / 2 + czm * S);          // 顶视：机头朝上
  place('side', CELL, 0, CELL / 2 - czm * S, CELL / 2 + cym * S);      // 侧视：机头朝右
  place('front', 0, CELL, CELL / 2 - cxm * S, CELL / 2 + cym * S);     // 正视
  const S2 = Math.min((CELL - 40) / Math.max(span, hgt), S * 2.2);     // 后视图单独存，放大一档
  const rear = render(m, comps, floating, 'rear', S2, CELL, CELL, CELL / 2 + cxm * S2, CELL / 2 + cym * S2);
  fs.writeFileSync(path.join(OUT, n + '-rear.png'), encodePNG(CELL, CELL, Buffer.from(rear)));
  fs.writeFileSync(path.join(OUT, n + '.png'), encodePNG(W, H, Buffer.from(full)));
  return { span, length, hgt };
}

if (!CHECK) fs.mkdirSync(OUT, { recursive: true });
const report = []; let anyFloating = false;
for (const n of names) {
  const m = M[n], comps = analyse(m), cn = connectivity(m, comps), main = comps[cn.main];
  const floating = new Set(comps.map((_, i) => i).filter(i => !cn.attached.has(i)));
  const box = CHECK ? null : writeImages(n, m, comps, floating);
  const nozzles = comps.map((c, i) => ({ c, i })).filter(o => o.c.noz).map(o => {
    const c = o.c, ex = ringExposure(m, main, c), hullEnd = main.mn[2];
    return { center: [0, 1, 2].map(q => +((c.mn[q] + c.mx[q]) / 2).toFixed(2)), z: [+c.mn[2].toFixed(2), +c.mx[2].toFixed(2)],
      r: +(Math.max(c.mx[0] - c.mn[0], c.mx[1] - c.mn[1]) / 2).toFixed(2), attached: cn.attached.has(o.i),
      protrude: +Math.max(0, hullEnd - c.mn[2]).toFixed(2), embed: +Math.max(0, c.mx[2] - hullEnd).toFixed(2), ringOut: ex.out, ringN: ex.n };
  });
  const flo = [...floating].map(i => { const c = comps[i], vs = [...c.vs].map(vi => m.v[vi]); let inside = 0;
    for (const v of vs) if (comps.some((o, j) => j !== i && insideComp(v, o))) inside++;
    return { inside: +(inside / vs.length).toFixed(2), faces: c.faces.length, noz: c.noz, size: +c.size.toFixed(2),
      center: [0, 1, 2].map(q => +((c.mn[q] + c.mx[q]) / 2).toFixed(2)), nearestGap: +cn.near[i].d.toFixed(2), nearestIs: cn.near[i].to === cn.main ? '主体' : '零件#' + cn.near[i].to }; });
  if (flo.length) anyFloating = true;
  report.push({ n, parts: comps.length, nozzleCount: nozzles.length, floating: flo, nozzles,
    size: box ? [+box.span.toFixed(1), +box.length.toFixed(1), +box.hgt.toFixed(1)] : undefined });
}
if (!CHECK) fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));

console.log('机型          零件  喷口  悬空  圆环外露(每个喷口 外露/总数)');
for (const r of report) {
  console.log(r.n.padEnd(13) + String(r.parts).padStart(4) + String(r.nozzleCount).padStart(6) + String(r.floating.length).padStart(6) + '  ' +
    r.nozzles.map(z => `${z.ringOut}/${z.ringN}`).join(' '));
  for (const f of r.floating) console.log(`    悬空 ${f.noz ? '喷口' : '部件'} 埋入${f.inside} 面${f.faces} 尺寸${f.size}m 中心(${f.center.join(',')}) 距最近${f.nearestIs}${f.nearestGap}m`);
}
if (!CHECK) console.log('\n图与 report.json 写到 ' + OUT);
process.exit(CHECK && anyFloating ? 1 : 0);
