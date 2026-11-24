#!/usr/bin/env node
/* ============================================================
   加力有无探针（vMax == vMil 表示没有加力，Ent.hasAfterburner）

   以前代码里没有任何一处按机型判断能不能加力：玩家油门推过 100% 就进加力，NPC 由 AI 决策，
   运输机、预警机、轰炸机在对抗行为下 60 秒里 100% 的帧都在加力。现在：

   1. 名单：没有加力的是 9 架（运输 / 预警 / 干扰 / 巡逻 / 勤务 / 整备 / 轰炸 / 廉价无人机），
      其余都有；所有机型 vMax >= vMil；
   2. 实体：没有加力的机型写 ab = true，下一次 stepAircraft 就被拿掉（甲板 / 过失速 / 垂直起降分支之前）；
   3. 玩家：没有加力的机型按住油门最多推到 100%，不进加力区；有加力的能推过去；
   4. AI：没有加力的机型在对抗场景里任何技能下都不加力、油门不超过 1；
      有加力的机型（对照）仍会加力 —— 证明测试测得到。

   用法：node tools/test/probes/probe-afterburner.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const NO_AB = ['manta', 'boulder', 'lodestone', 'quartz', 'pelican', 'datum', 'puffin', 'spray', 'gravel'];

const S = Sim.load({ seed: 5 });
const G = S.sandbox, Ent = G.Ent;
const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}
const acOf = id => G.AIRCRAFT.filter(a => a.id === id)[0];

console.log('\n== 1. 名单 ==\n');
{
  const none = G.AIRCRAFT.filter(a => !Ent.hasAfterburner(a)).map(a => a.id).sort();
  check('没有加力的恰好是这 9 架', JSON.stringify(none) === JSON.stringify(NO_AB.slice().sort()), none.join(','));
  check('其余机型都有加力（vMax 高于 vMil）', G.AIRCRAFT.filter(a => NO_AB.indexOf(a.id) < 0).every(a => Ent.hasAfterburner(a) && a.phys.vMax > a.phys.vMil));
  check('所有机型 vMax >= vMil', G.AIRCRAFT.every(a => a.phys.vMax >= a.phys.vMil));
  check('hasAfterburner 接受实体 / 机型条目 / phys', (() => {
    const e = Ent.makeAircraft({ type: 'manta', team: 1 }), f = Ent.makeAircraft({ type: 'petrel', team: 1 });
    return !Ent.hasAfterburner(e) && !Ent.hasAfterburner(acOf('manta')) && !Ent.hasAfterburner(acOf('manta').phys) &&
      Ent.hasAfterburner(f) && Ent.hasAfterburner(acOf('petrel')) && Ent.hasAfterburner(acOf('petrel').phys);
  })());
}

console.log('\n== 2. 实体：写了 ab = true 也会被拿掉 ==\n');
{
  const world = { particles: [], actors: [], targets: [], missiles: [], bullets: [], events: [] };
  for (const [id, want] of [['manta', false], ['gravel', false], ['petrel', true], ['sandstone', true], ['booby', true]]) {
    const a = Ent.makeAircraft({ type: id, team: 1, x: 0, y: 3000, z: 0 });
    a.throttle = 1.25; a.ab = true;
    Ent.stepAircraft(a, 1 / 60, world);
    check(id + '：stepAircraft 之后 ab = ' + want, a.ab === want);
  }
  const a = Ent.makeAircraft({ type: 'manta', team: 1, x: 0, y: 3000, z: 0 });
  a.throttle = 1.25; a.ab = true;
  for (let i = 0; i < 600; i++) { a.ab = true; Ent.stepAircraft(a, 1 / 60, world); Ent.$.stepAircraftTail(a, 1 / 60, world); }
  check('manta：一直强写 ab = true 10 秒，速度不超过军推（×1.05 余量）', a.speed <= acOf('manta').phys.vMil * 1.05, a.speed.toFixed(1) + ' / vMil ' + acOf('manta').phys.vMil);
  check('manta：羽流强度 abFx 始终为 0', !(a.abFx > 0));
}

console.log('\n== 3. 玩家油门 ==\n');
{
  for (const [id, canAB] of [['manta', false], ['frigatebird', true]]) {
    S.start(0); S.godMode();
    const p = S.player;
    p.ac = acOf(id);                                   // 换成这型的机型数据（hasAfterburner 读 ac.phys）
    p.throttle = 0.9;
    G.Game.$.keys.ShiftLeft = true;
    let thrMax = 0, abSeen = false;
    S.run(3, () => { S.godMode(); if (p.throttle > thrMax) thrMax = p.throttle; if (p.ab) abSeen = true; });
    G.Game.$.keys.ShiftLeft = false;
    if (canAB) check(id + '：按住油门能推进加力区', thrMax > 1.1 && abSeen, '最大油门 ' + thrMax.toFixed(2));
    else check(id + '：按住油门最多 100%，不进加力', thrMax <= 1.0001 && !abSeen, '最大油门 ' + thrMax.toFixed(2));
  }
}

console.log('\n== 4. AI：对抗场景里 60 s 的加力帧占比 ==\n');
{
  function abShare(id, skill) {
    S.start(0); S.godMode();
    const w = S.world, p = S.player;
    for (const e of w.actors) if (e !== p) e.alive = false;
    const ac = acOf(id);
    const e = G.spawnEnemy(w, { ac: id, team: 1, skill, x: p.pos.x, y: p.pos.y, z: p.pos.z - 5000, fwd: G.M3.V(0, 0, 1), speed: ac.phys.vMil * 0.8 });
    let n = 0, abN = 0, thrMax = 0;
    S.run(60, () => { if (!e.alive) return; n++; if (e.ab) abN++; if (e.throttle > thrMax) thrMax = e.throttle; S.godMode(); });
    return { n, abN, thrMax };
  }
  for (const id of NO_AB) {
    const lo = abShare(id, 0.35), hi = abShare(id, 0.95);
    check(id + '：低 / 高技能都不加力，油门 ≤ 1', lo.n > 0 && hi.n > 0 && lo.abN === 0 && hi.abN === 0 && lo.thrMax <= 1.0001 && hi.thrMax <= 1.0001,
      '加力帧 ' + lo.abN + ' / ' + hi.abN + '，最大油门 ' + Math.max(lo.thrMax, hi.thrMax).toFixed(2));
  }
  const ctl = abShare('schist', 0.35);
  check('对照：片岩（有加力）低技能仍会加力 —— 测试测得到', ctl.abN > 0, ctl.abN + ' / ' + ctl.n + ' 帧');
}

console.log('\n' + (bad.length
  ? '✗ ' + bad.length + ' 项失败：\n  - ' + bad.join('\n  - ')
  : '✓ 加力有无探针全部通过') + '\n');
process.exit(bad.length ? 1 : 0);
