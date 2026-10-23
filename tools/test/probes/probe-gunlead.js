#!/usr/bin/env node
/* 机炮预测点探针：按 Ent.gunLead 的方向用真实弹道（fireGunFrom 同一套）开炮，应该打中匀速目标；
   旧的直线估算（目标位置 + 速度 × 距离/初速，忽略载机速度与重力）作对照。 */
'use strict';
const Sim = require('../../lib/sim');
const S = Sim.load({ seed: 1 });
const G = S.sandbox, M3 = G.M3, W = G.WEAPONS, Ent = G.Ent, Ballistics = G.Ballistics;
const gw = W.cel3 || Object.values(W).find(w => w.kind === 'gun');
let bad = 0;
function shoot(P, base, dir, tPos, tVel) {
  const b = { pos: M3.clone(P), vel: M3.add(M3.mul(dir, gw.speed), base), grav: gw.gravity === undefined ? 1 : gw.gravity, drag: gw.drag || 0 };
  let best = Infinity;
  let prev = M3.sub(tPos, P);
  for (let t = 0; t < 4; t += 1 / 60) {
    Ballistics.step(b, 1 / 60);
    const rel = M3.sub(M3.add(tPos, M3.mul(tVel, t + 1 / 60)), b.pos);
    const seg = M3.sub(rel, prev), sl = M3.dot(seg, seg);
    const u = sl > 1e-9 ? Math.max(0, Math.min(1, -M3.dot(prev, seg) / sl)) : 0;
    best = Math.min(best, M3.len(M3.add(prev, M3.mul(seg, u))));
    prev = rel;
  }
  return best;
}
let nOld = 0, nNew = 0, tot = 0;
for (const d of [600, 1000, 1500]) for (const v of [250, 400]) for (const cross of [0, 200, -250]) for (const dy of [0, 300]) {
  const P = M3.V(0, 3000, 0), base = M3.V(0, 0, v);
  const tPos = M3.V(cross ? 100 : 0, 3000 + dy, d), tVel = M3.V(cross, 0, 150);
  tot++;
  const L = Ent.gunLead(gw, P, base, tPos, tVel);
  const mm = shoot(P, base, L.dir, tPos, tVel); if (mm < 8) nNew++; else console.log('miss', d, v, cross, dy, mm.toFixed(1), L.miss.toFixed(1), L.tof.toFixed(2));
  const aim = M3.add(tPos, M3.mul(tVel, M3.dist(tPos, P) / gw.speed));
  if (shoot(P, base, M3.norm(M3.sub(aim, P)), tPos, tVel) < 8) nOld++;
}
console.log('新解算命中 ' + nNew + '/' + tot + '；旧直线估算 ' + nOld + '/' + tot);
if (nNew < tot) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
