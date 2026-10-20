#!/usr/bin/env node
/* ============================================================
   发射包线探针（docs/2-0IMPL.md 5.4 / 5.7）

   验证两件事：
     1. rmax / NEZ 的变化方向正确 —— 本机高度、本机速度、目标航向各变一项，
        包线该大的大、该小的小（用真实弹道 Ent.envelopeRange）。
     2. 显示与命中一致 —— 在 rmax / nez 边界内外用 Ent.flyTo 实弹模拟，
        "显示 IN RNG / NEZ 就打得中，显示射程外就打不中"。

   用法：node tools/probe-envelope.js [--verbose]
   ============================================================ */
'use strict';
const Sim = require('./lib/sim');

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const W = G.WEAPONS, Ent = G.Ent, M3 = G.M3;

const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}

/* 一个空中目标：同高、水平背离 / 相向 / 静止 */
function air(y, vz, fwd, spd) {
  return { kind: 'aircraft', radius: 8, pos: M3.V(0, y, 8000),
    vel: M3.V(0, 0, vz), fwd: M3.V(0, 0, fwd), phys: { vMax: 500 }, speed: spd || 300 };
}
/* 一个地面目标 */
function ground(x, z) {
  return { kind: 'target', radius: 20, pos: M3.V(x, 0, z), vel: M3.V(0, 0, 0), speed: 12 };
}
const LA = (y, spd) => ({ pos: M3.V(0, y, 0), fwd: M3.V(0, 0, 1), speed: spd });

console.log('\n== 1. 变化方向 ==\n');

/* 对地弹：本机越高，投放越远（滑翔 / 攻顶都受益） */
{
  const lo = Ent.envelopeRange(W.v25, LA(3000, 350), ground(0, 8000));
  const hi = Ent.envelopeRange(W.v25, LA(9000, 350), ground(0, 8000));
  check('对地弹 本机 3→9 km，rmax 增大', hi.rmax > lo.rmax,
    lo.rmax.toFixed(0) + ' → ' + hi.rmax.toFixed(0) + ' m');
}
{
  const lo = Ent.envelopeRange(W.asl, LA(3000, 350), ground(0, 8000));
  const hi = Ent.envelopeRange(W.asl, LA(9000, 350), ground(0, 8000));
  check('滑翔弹 本机 3→9 km，rmax 增大', hi.rmax > lo.rmax,
    lo.rmax.toFixed(0) + ' → ' + hi.rmax.toFixed(0) + ' m');
}
/* 对空弹：本机越快，出膛初速越高，rmax 越大 */
{
  const slow = Ent.envelopeRange(W.mrm, LA(6000, 250), air(6000, 0, 1));
  const fast = Ent.envelopeRange(W.mrm, LA(6000, 500), air(6000, 0, 1));
  check('对空弹 本机 250→500 m/s，rmax 增大', fast.rmax > slow.rmax,
    slow.rmax.toFixed(0) + ' → ' + fast.rmax.toFixed(0) + ' m');
}
/* 尾追（目标背离）打不远，迎头（相向）打得远 */
{
  const tail = Ent.envelopeRange(W.mrm, LA(6000, 350), air(6000, 300, 1));
  const head = Ent.envelopeRange(W.mrm, LA(6000, 350), air(6000, -300, -1));
  check('尾追 rmax < 迎头 rmax', head.rmax > tail.rmax,
    '尾追 ' + tail.rmax.toFixed(0) + ' / 迎头 ' + head.rmax.toFixed(0) + ' m');
}
/* NEZ 恒不大于 rmax（逃逸只会更难打） */
{
  const e = Ent.envelopeRange(W.mrm, LA(6000, 350), air(6000, 0, 1));
  check('NEZ ≤ rmax', e.nez <= e.rmax, 'nez ' + e.nez.toFixed(0) + ' / rmax ' + e.rmax.toFixed(0) + ' m');
}
{
  const e = Ent.envelopeRange(W.v25, LA(6000, 350), ground(0, 8000));
  check('对地弹 NEZ ≤ rmax', e.nez <= e.rmax, 'nez ' + e.nez.toFixed(0) + ' / rmax ' + e.rmax.toFixed(0) + ' m');
}

console.log('\n== 2. 显示与命中一致 ==\n');

/* 在 rmax 内（0.9×）实弹能命中，在 rmax 外（1.15×）打不中；
   在 NEZ 内（0.9×）目标逃逸也命中，在 rmax 附近逃逸则甩得掉。 */
/* envelopeRange 返回的是斜距，flyTo 摆目标要按水平距离（固定目标高度），
   所以先把斜距拆回水平分量再摆。 */
function atFlat(la, tg, D) {
  const tox = tg.pos.x - la.pos.x, toz = tg.pos.z - la.pos.z;
  const tdl = Math.sqrt(tox * tox + toz * toz) || 1;
  const dx = tox / tdl, dz = toz / tdl;
  return { kind: tg.kind, radius: tg.radius, pos: M3.V(la.pos.x + dx * D, tg.pos.y, la.pos.z + dz * D),
    vel: tg.vel ? M3.clone(tg.vel) : M3.V(0, 0, 0), fwd: tg.fwd ? M3.clone(tg.fwd) : null,
    phys: tg.phys, speed: tg.speed };
}
const CASES = [
  { name: 'mrm 空空', w: W.mrm, la: LA(6000, 350), tg: air(6000, 0, 1) },
  { name: 'mrm 尾追', w: W.mrm, la: LA(6000, 350), tg: air(6000, 300, 1) },
  { name: 'v25 对地', w: W.v25, la: LA(6000, 350), tg: ground(0, 8000) },
  { name: 'asl 滑翔', w: W.asl, la: LA(6000, 350), tg: ground(0, 8000) },
  { name: 'v22 对海', w: W.v22, la: LA(6000, 350), tg: { kind: 'target', radius: 30, pos: M3.V(0, 0, 8000), vel: M3.V(0, 0, 0), speed: 15 } }
];
for (const c of CASES) {
  const e = Ent.envelopeRange(c.w, c.la, c.tg);
  const dh = c.la.pos.y - c.tg.pos.y;
  const rmaxFlat = Math.sqrt(Math.max(0, e.rmax * e.rmax - dh * dh));
  const nezFlat = Math.sqrt(Math.max(0, e.nez * e.nez - dh * dh));
  const inRng = Ent.flyTo(c.w, c.la, atFlat(c.la, c.tg, rmaxFlat * 0.9), false);
  const outRng = Ent.flyTo(c.w, c.la, atFlat(c.la, c.tg, rmaxFlat * 1.15), false);
  const inNez = Ent.flyTo(c.w, c.la, atFlat(c.la, c.tg, nezFlat * 0.9), true);
  check(c.name + ' rmax×0.9 内命中', inRng, 'rmax ' + e.rmax.toFixed(0) + ' m');
  check(c.name + ' rmax×1.15 外失手', !outRng, 'rmax ' + e.rmax.toFixed(0) + ' m');
  check(c.name + ' nez×0.9 内逃逸也命中', inNez, 'nez ' + e.nez.toFixed(0) + ' m');
}

console.log('\n' + (bad.length
  ? '✗ ' + bad.length + ' 项失败：\n  - ' + bad.join('\n  - ')
  : '✓ 发射包线探针全部通过') + '\n');
process.exit(bad.length ? 1 : 0);
