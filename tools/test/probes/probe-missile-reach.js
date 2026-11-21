#!/usr/bin/env node
/* ============================================================
   导弹参考射程探针（js/engine/entities/range.js 的 maxReach，js/engine/entities/missile.js 的 launchSpeed）

   v3.7.1 去掉了导弹发射时的 +70 m/s 初速（现实里导弹离轨的速度是发动机在导轨上加速出来的，而这里发动机从 t = 0
   就在算 boost，再加 70 是重复计算），同时把所有可挂飞机的导弹动力段 life 补了 0.1–0.45 s，让**实际飞行射程不变**。
   这份探针守着那张参考表：载机 350 m/s、6000 m 平飞发射，弹沿发射方向追一个很远的目标，一直飞到寿命结束，
   量水平位移（Ent.maxReach，HUD 发射包线的基础），必须落在旧行为（+70、旧 life）的数值 ±2% 以内。
   表里的数是去掉 +70 之前、用旧 life 量出来的（单位 m）。以后再动导弹的 speed / boost / life / 初速，
   这里会报警——要么射程变化是有意的（改表并在提交说明里写原因），要么是误伤。
   也检查：导弹初速 = 载机速度（没有 +70）。
   用法：node tools/test/probes/probe-missile-reach.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

/* 旧行为（+70、旧 life）下，载机 350 m/s、6000 m 平飞的 maxReach（m） */
const OLD_REACH = {
  srm: 5493,
  trm: 6514,
  hos: 4729,
  kkv: 5556,
  hwm: 9509,
  mrm: 10489,
  tether: 11234,
  arm: 9566,
  vlar: 16058,
  qsr: 5037,
  wasp: 6594,
  asl2: 7197,
  sat: 7176,
  swm: 4274,
  hva: 10924,
  lcm: 16920,
  v11: 6040,
  v9: 5145,
  v17: 15695,
  v22: 17652,
  v25: 17106,
  vgt: 6001,
  vsr: 8884,
  vbn: 5124,
  otr: 3078,
  dl4: 8557,
  dl6: 5301,
  tephra: 14944,
  drm: 5493
};
const TOL = 0.02;

const S = Sim.load({ seed: 1 });
S.start(0);
const sb = S.sandbox, M3 = sb.M3;
const reach = w => sb.Ent.maxReach(w, { pos: M3.V(0, 6000, 0), fwd: M3.V(0, 0, 1), speed: sb.Ent.launchSpeed(w, 350) }, 6000);

const bad = [], errs = [];
for (const id of Object.keys(OLD_REACH)) {
  const w = sb.WEAPONS[id];
  if (!w) { bad.push(id + ' 不存在'); continue; }
  const r = reach(w), e = (r - OLD_REACH[id]) / OLD_REACH[id];
  errs.push(Math.abs(e));
  if (Math.abs(e) > TOL) bad.push(id + ' ' + r.toFixed(0) + ' m（参考 ' + OLD_REACH[id] + ' m，' + (e * 100).toFixed(1) + '%）');
}
chk('参考射程：' + Object.keys(OLD_REACH).length + ' 种可挂飞机的导弹，载机 350 m/s、6000 m 平飞的实际飞行射程与旧行为相差 ≤ 2%', bad.length === 0,
  bad.length ? bad.join('；') : '最大偏差 ' + (Math.max.apply(null, errs) * 100).toFixed(1) + '%');

/* 导弹初速 = 载机速度（没有 +70）；抛物线弹族同理（炸弹 +3 向下、火箭 0） */
chk('导弹初速 = 载机速度（没有 +70）', ['srm', 'mrm', 'wasp', 'dl6', 'tephra'].every(id => sb.Ent.launchSpeed(sb.WEAPONS[id], 350) === 350));
chk('炸弹 +3、火箭 +0（抛物线弹族，见 probe-bomb-release）', sb.Ent.launchSpeed(sb.WEAPONS.clb, 350) === 353 && sb.Ent.launchSpeed(sb.WEAPONS.rkt, 350) === 350);

/* 舰载 / 车载导弹（没有挂飞机的 fits）不走这套发射，life 保持原样 */
chk('舰载 / 车载导弹（ss6 / dl9 / ssm）的 life 没动', sb.WEAPONS.ss6.life === 9.5 && sb.WEAPONS.dl9.life === 9 && sb.WEAPONS.ssm.life === 40);

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
