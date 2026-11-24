#!/usr/bin/env node
/* ============================================================
   精确制导炸弹瞄准圈探针（docs/2-0IMPL.md 5.3 第 3 条 / 5.7）

   验证"圈内必中"：
     1. 可达区域（Ent.finFootprint）画出的圈内，实弹（Ent.flyTo）命中率接近 100%；
     2. 圈外命中率明显下降（刚出界就打不中）；
     3. 圈的大小随投放高度、速度变化（高、快圈大，低、慢圈小）。

   圈用真实命中判定（flyTo / stepMissile 同一套弹道）二分出来，所以它不该骗人。

   用法：node tools/test/probes/probe-footprint.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const W = G.WEAPONS, Ent = G.Ent, M3 = G.M3;

const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}

function inPoly(pt, poly) {
  let x = pt[0], z = pt[1], inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
const LA = (y, spd, yaw) => ({ pos: M3.V(0, y, 0), fwd: M3.V(Math.sin(yaw || 0), 0, Math.cos(yaw || 0)), speed: spd });

console.log('\n== 1. 圈内必中 / 圈外失手 ==\n');

const CASES = [
  ['3000 m / 300 m/s', LA(3000, 300)],
  ['6000 m / 350 m/s', LA(6000, 350)],
  ['9000 m / 400 m/s', LA(9000, 400)]
];
/* 两种算法都要守住"圈内必中"：默认（逐条独立二分）与 HUD 快速模式（对称镜像 + 暖启动 + 1/5 步长）。 */
const MODES = [['', undefined], ['[HUD 快速] ', { fast: true, dtFix: 1 / 5 }]];
for (const [mname, opt] of MODES) for (const [name0, la] of CASES) {
  const name = mname + name0;
  const fp = Ent.finFootprint(W.pgb, la, 12, undefined, opt);
  const poly = [[fp.natural.x, fp.natural.z]].concat(fp.points.map(p => [p.x, p.z]));
  /* 圈内 / 圈外采样（地面网格），flyTo 实弹验证 */
  let inHit = 0, inTot = 0, outHit = 0, outTot = 0;
  const r = Math.max(fp.natural.z, ...fp.points.map(p => p.z)) + 2000;
  for (let z = 500; z <= r; z += 800) {
    for (let x = 0; x <= r; x += 800) {
      const inside = inPoly([x, z], poly);
      const tg = { kind: 'target', radius: 20, pos: M3.V(x, 0, z), vel: M3.V(0, 0, 0), speed: 12 };
      const hit = Ent.flyTo(W.pgb, la, tg, false);
      if (inside) { inTot++; if (hit) inHit++; }
      else { outTot++; if (hit) outHit++; }
    }
  }
  const inRate = inTot ? inHit / inTot : 1;
  const outRate = outTot ? outHit / outTot : 0;
  check(name + ' 圈内命中率接近 100%', inRate >= 0.9,
    (inRate * 100).toFixed(0) + '%（' + inHit + '/' + inTot + '）');
  check(name + ' 圈外命中率明显下降', outRate < inRate * 0.5,
    (outRate * 100).toFixed(0) + '% vs 圈内 ' + (inRate * 100).toFixed(0) + '%');
}

console.log('\n== 2. 圈随高度 / 速度变化 ==\n');

/* 圈面积（多边形面积近似）越大，代表修正范围越大 */
function area(fp) {
  const p = [[fp.natural.x, fp.natural.z]].concat(fp.points.map(q => [q.x, q.z]));
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i][0] * p[j][1] - p[j][0] * p[i][1];
  }
  return Math.abs(a) / 2;
}
{
  const lo = area(Ent.finFootprint(W.pgb, LA(3000, 350), 12));
  const hi = area(Ent.finFootprint(W.pgb, LA(9000, 350), 12));
  check('投放越高，圈越大', hi > lo, lo.toFixed(0) + ' → ' + hi.toFixed(0) + ' m²');
}
{
  const slow = area(Ent.finFootprint(W.pgb, LA(6000, 250), 12));
  const fast = area(Ent.finFootprint(W.pgb, LA(6000, 500), 12));
  check('投放越快，圈越大', fast > slow, slow.toFixed(0) + ' → ' + fast.toFixed(0) + ' m²');
}

console.log('\n== 3. 圈跟着机头朝向走（不是固定朝世界 +z）==\n');
{
  const north = LA(6000, 350, 0), east = LA(6000, 350, Math.PI / 2);
  const fpN = Ent.finFootprint(W.pgb, north, 12), fpE = Ent.finFootprint(W.pgb, east, 12);
  const radii = (fp, la) => fp.points.map(p => Math.hypot(p.x - la.pos.x, p.z - la.pos.z));
  const rN = radii(fpN, north), rE = radii(fpE, east);
  const same = rN.length === rE.length && rN.every((d, i) => Math.abs(d - rE[i]) < 0.01 * d);
  check('朝东与朝北的圈形状一致（只是转了向）', same, rN.length + ' 点');
  check('朝东时自然落点在机头前方（+x），不在 +z', fpE.natural.x > 1000 && Math.abs(fpE.natural.z) < 100,
    'natural=(' + fpE.natural.x.toFixed(0) + ', ' + fpE.natural.z.toFixed(0) + ')');
  /* 朝东时圈内沿机头方向 0.9 倍边界处，实弹必须命中 */
  let ok = 0, tot = 0;
  for (const p of fpE.points) {
    const dx = p.x - east.pos.x, dz = p.z - east.pos.z;
    const tg = { kind: 'target', radius: 20, pos: M3.V(dx * 0.9, 0, dz * 0.9), vel: M3.V(0, 0, 0), speed: 12 };
    tot++; if (Ent.flyTo(W.pgb, east, tg, false)) ok++;
  }
  check('朝东时边界内 0.9 倍处实弹命中', ok === tot, ok + '/' + tot);
}

console.log('\n== 4. 倾斜 / 侧滑下快速模式仍然可信（镜像只在左右真对称时才启用）==\n');
{
  /* 向右倾斜时机腹偏右：抛放速度沿机腹向下，会带一个侧向分量（launchVel 同款）。
     侧滑 / 转弯时速度矢量也偏离机头。镜像的前提是左右对称，不满足就必须退回逐条全算。 */
  const banked = (bankDeg, slip) => {
    const b = bankDeg * Math.PI / 180, fwd = M3.V(0, 0, 1);
    const up = M3.V(-Math.sin(b), Math.cos(b), 0);
    const vel = M3.add(M3.add(M3.mul(fwd, 350), M3.V(slip, 0, 0)), M3.mul(up, -3));
    return { pos: M3.V(0, 6000, 0), fwd, speed: 350, vel };
  };
  for (const [name, la] of [['平飞', banked(0, 0)], ['坡度 30°', banked(30, 0)], ['坡度 60°', banked(60, 0)], ['侧滑 15 m/s', banked(0, 15)]]) {
    const full = Ent.finFootprint(W.pgb, la, 12);
    const fast = Ent.finFootprint(W.pgb, la, 12, undefined, { fast: true });
    const rad = fp => fp.points.map(p => Math.hypot(p.x - la.pos.x, p.z - la.pos.z));
    const a = rad(full), f = rad(fast);
    const maxDiff = a.length === f.length ? Math.max(...a.map((d, i) => Math.abs(d - f[i]) / d)) : Infinity;
    check(name + ' 快速模式与逐条全算一致（点数相同，射程相差 < 5%）', maxDiff < 0.05,
      a.length + ' 点，最大相差 ' + (maxDiff * 100).toFixed(1) + '%');
    /* 真实投放条件下，快速圈边界内 0.9 倍处实弹必须命中 */
    let ok = 0, tot = 0;
    for (const p of fast.points) {
      const tg = { kind: 'target', radius: 20, pos: M3.V((p.x - la.pos.x) * 0.9, 0, (p.z - la.pos.z) * 0.9), vel: M3.V(0, 0, 0), speed: 12 };
      tot++; if (Ent.flyTo(W.pgb, la, tg, false)) ok++;
    }
    check(name + ' 快速圈边界内 0.9 倍处实弹命中', tot > 0 && ok === tot, ok + '/' + tot);
  }
}

console.log('\n' + (bad.length
  ? '✗ ' + bad.length + ' 项失败：\n  - ' + bad.join('\n  - ')
  : '✓ 瞄准圈探针全部通过') + '\n');
process.exit(bad.length ? 1 : 0);
