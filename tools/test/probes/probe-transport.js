#!/usr/bin/env node
/* ============================================================
   重型运输机探针（docs/POST2-0IMPL.md 批次 6.5）

   蝠鲼（manta）：不武装、大而慢、血厚、靶面大；关卡里当护航对象
   A. 生成：special null、没有武器（弹药池为空）、没有炮、挂载没有写错
   B. 大靶面：hitR 14，比战斗机（缺省 7.5）大；血量 700
   C. 沿航线飞：给它一条 route，两分钟内活着、真的在往目标点飞
   用法：node tools/test/probes/probe-transport.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

const S = Sim.load({ seed: 1 });
S.start(0);
const sb = S.sandbox;
const { M3, Ent, AI } = sb;
const G = sb.Game, w = G.__world(), p = G.__player();
for (const a of w.actors) if (a !== p) a.alive = false;
w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
const sen = Ent.makeAircraft({ type: 'albatross', team: 1, x: 400000, y: 3000, z: 400000, fwd: M3.V(0, 0, 1), speed: 230, special: 'dl6' });
sen.hp = sen.maxHp = 1e12; AI.attach(sen, { role: 'support', skill: 0.6, rank: 'pawn' }); w.actors.push(sen);

const issues0 = sb.Ent.mountIssues.length;
const m = sb.spawnEnemy(w, { ac: 'manta', team: 0, special: null, x: 80000, y: 4000, z: 0, fwd: M3.V(0, 0, 1), speed: 220, behavior: 'recon' });
chk('A 没有武器、没有炮', Object.keys(m.ammoPool || {}).length === 0 && !m.gun, JSON.stringify(m.ammoPool));
chk('A 挂载没有写错', sb.Ent.mountIssues.length === issues0, JSON.stringify(sb.Ent.mountIssues));
chk('B 大靶面、血厚（hitR 14、hp 700）', m.hitR === 14 && m.maxHp === 700 && m.hitR > 7.5, 'hitR=' + m.hitR + ' hp=' + m.maxHp);

m.route = { wp: [M3.V(80000, 4000, 20000)], speed: 220 };
const z0 = m.pos.z;
for (let i = 0; i < 60 * 120; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; }
chk('C 沿航线飞：两分钟后活着、向目标点前进了几公里', m.alive && m.pos.z - z0 > 6000, 'dz=' + (m.pos.z - z0).toFixed(0) + ' speed=' + m.speed.toFixed(0));

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
