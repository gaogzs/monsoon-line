#!/usr/bin/env node
/* ============================================================
   低空突防探针（docs/POST2-0IMPL.md 5.7，批次 5d）

   strike 机型（caps 含 'strike'）、skill ≥ 0.6 打海面目标：
     A. 远距离接近时贴海面飞（agl 远低于初始高度），不撞海
     B. 到投放包线边缘才拉起（agl 回升到投放高度附近）
     C. 低技能（< 0.6）保持原来的"保持高度"接近（不贴海）
   用法：node tools/test/probes/probe-strike.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function run(skill, seed) {
  const S = Sim.load({ seed });
  const { M3, Ent, AI, MISSIONS } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const tg = Ent.makeTarget({ x: 0, y: 0, z: 25000, hp: 99999, radius: 30, team: 0 });
  tg.ground = false; w.targets.push(tg);
  // 哨兵：留一架远处的敌机，免得关卡把"敌人全灭"当胜利
  const a = Ent.makeAircraft({ type: 'schist', team: 1, x: 0, y: 3000, z: 0, fwd: M3.V(0, 0, 1), speed: 300, special: 'vgt' });
  a.hp = a.maxHp = 1e9;
  AI.attach(a, { role: 'enemy', skill, rank: skill >= 0.6 ? 'pawn' : 'rookie' });
  w.actors.push(a);
  const sentinel = Ent.makeAircraft({ type: 'albatross', team: 1, x: -60000, y: 4000, z: -60000, fwd: M3.V(1, 0, 0), speed: 250, special: null });
  AI.attach(sentinel, { role: 'enemy', skill: 0.5 }); sentinel.ai.cmd = 'hold'; sentinel.hp = sentinel.maxHp = 1e9; w.actors.push(sentinel);
  let minAglAll = 1e9, minAglFar = 1e9, maxAglNear = 0, crashed = false, firstFar = 0;
  const reach = Ent.aiReach(S.sandbox.WEAPONS.vgt, 500);
  for (let f = 0; f < 60 * 120 && a.alive; f++) {
    S.step(1 / 60); p.alive = true; p.hp = p.maxHp;
    const d = M3.dist(a.pos, tg.pos), agl = Ent.agl(a);
    if (a.pos.y < 5) crashed = true;
    minAglAll = Math.min(minAglAll, agl);
    if (d > reach * 1.5 && d < 20000 && f > 60 * 15) minAglFar = Math.min(minAglFar, agl);
    if (d < reach * 1.3) maxAglNear = Math.max(maxAglNear, agl);
  }
  return { minAglAll, minAglFar, maxAglNear, crashed, alive: a.alive, reach, target: a.ai.target === tg };
}

const hi = run(0.75, 1), lo = run(0.4, 1);
console.log('hi', JSON.stringify(hi), '\nlo', JSON.stringify(lo));
chk('A 高技能 strike 机远距离贴海面飞，且没有撞海', hi.minAglFar < 400 && !hi.crashed && hi.alive, 'minAgl=' + hi.minAglFar.toFixed(0));
chk('B 到包线边缘才拉起', hi.maxAglNear > 500, 'maxAglNear=' + hi.maxAglNear.toFixed(0));
chk('C 低技能不贴海（全程最低 agl 远高于突防高度）', lo.minAglAll > 1200, 'minAgl=' + lo.minAglAll.toFixed(0));
process.exit(ok ? 0 : 1);
