#!/usr/bin/env node
/* ============================================================
   无制导武器落点标记探针（docs/2-0IMPL.md 5.5 / 5.7）

   验证：HUD 预计落点（Ent.naturalPoint）和实际出膛后的弹道是同一套计算 ——
   在多种高度、速度、俯冲角下，把目标放在标记上投放（Ent.flyTo），
   命中率应为 100%；把目标挪到爆炸半径之外则不命中。

   用法：node tools/probe-ccip.js
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

const IDS = ['clb', 'v30', 'hbl', 'hbh', 'rkt'];
const ALT = [800, 3000, 8000];
const SPD = [220, 350, 480];
const DIVE = [0, 20, 45];          // 俯冲角（度）

console.log('\n== 落点标记 = 实际弹道 ==\n');
for (const id of IDS) {
  const w = W[id];
  let tot = 0, hit = 0, far = 0, farTot = 0;
  for (const y of ALT) for (const v of SPD) for (const d of DIVE) {
    const a = d * Math.PI / 180;
    const la = { pos: M3.V(0, y, 0), fwd: M3.V(0, -Math.sin(a), Math.cos(a)), speed: v + 70 };
    const pt = Ent.naturalPoint(w, la);
    const tg = (x, z) => ({ kind: 'target', radius: 20, pos: M3.V(x, 0, z), vel: M3.V(0, 0, 0), speed: 0 });
    tot++;
    if (Ent.flyTo(w, la, tg(pt.x, pt.z), false)) hit++;
    farTot++;
    const R = (w.cluster || w.blast || 0) + 20;
    if (!Ent.flyTo(w, la, tg(pt.x, pt.z + R + 400), false)) far++;
  }
  check(w.name + ' 标记处投放命中', hit === tot, hit + '/' + tot);
  check(w.name + ' 偏出半径外不命中', far === farTot, far + '/' + farTot);
}

console.log('\n== 高爆弹数值 ==\n');
check('PEJ-22 blast 大于 PEJ-4', W.hbh.blast > W.hbl.blast);
check('PEJ-22 携带量少于 PEJ-4', W.hbh.perPoint < W.hbl.perPoint && W.hbh.cd > W.hbl.cd);
check('PEJ-22 只能挂重挂点', W.hbh.fits.length === 1 && W.hbh.fits[0] === 'heavy');

console.log(bad.length ? '\n失败 ' + bad.length + ' 项' : '\n全部通过');
process.exit(bad.length ? 1 : 0);
