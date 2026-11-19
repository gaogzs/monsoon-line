#!/usr/bin/env node
/* ============================================================
   武装浮空平台探针（docs/POST2-0IMPL.md 批次 6.6）

   A. spawnTarget 按 TARGETS[model] 给 relay 挂炮塔：2 座近防炮 + 1 台旋转架，t.weapon = 'dl9'
   B. armed:false 不挂；没有 mounts 的模型（调节单元 cell）不挂
   C. 玩家被发现后，敌方 relay 对进入射程的玩家会开火（舰空弹或近防炮弹）；中立（team 2）relay 不开火
   D. 第 2 关（M2）里的三座高原默认就是武装的
   用法：node tools/test/probes/probe-relay.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function clean(S) {
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.hp = p.maxHp = 1e9; w.arenaDef = null;
  /* 哨兵：没有敌机关卡会判胜利而停止更新目标。放在很远处，hp 取极大值，AI 按原地待命 */
  const { M3, Ent, AI } = S.sandbox;
  const sen = Ent.makeAircraft({ type: 'albatross', team: 1, x: 300000, y: 3000, z: 300000, fwd: M3.V(0, 0, 1), speed: 230, special: 'dl6' });
  sen.hp = sen.maxHp = 1e12; AI.attach(sen, { role: 'enemy', skill: 0.6, rank: 'pawn' }); sen.ai.cmd = 'hold';
  w.actors.push(sen);
  return { G, w, p };
}

/* A / B */
{
  const S = Sim.load({ seed: 1 });
  S.start(0);
  const { w } = clean(S);
  const spawnTarget = S.sandbox.spawnTarget;
  const t = spawnTarget(w, { ttype: 'air', model: 'relay', x: 0, y: 4000, z: 0, hp: 260, radius: 30, big: true });
  chk('A relay 挂上 3 座炮位（2 近防炮 + 1 旋转架）', t.turrets && t.turrets.length === 3, 'n=' + (t.turrets && t.turrets.length));
  chk('A relay 的舰空弹落到 t.weapon', t.weapon === 'dl9', 'weapon=' + t.weapon);
  const u = spawnTarget(w, { ttype: 'air', model: 'relay', x: 0, y: 4000, z: 5000, hp: 260, radius: 30, big: true, armed: false });
  chk('B armed:false 不挂炮位、不落 weapon', !u.turrets && !u.weapon);
  const c = spawnTarget(w, { ttype: 'air', model: 'cell', x: 0, y: 8000, z: 0, hp: 100, radius: 10, big: true, team: 2 });
  chk('B 没有 mounts 的模型（调节单元）不挂', !c.turrets && !c.weapon);
}

/* C 开火：玩家停在 2.5 km 外同高度（旋转架射程内），30 s 内敌方 relay 要有发射 */
function fireTest(team) {
  const S = Sim.load({ seed: 2 });
  S.start(0);
  const { w, p } = clean(S);
  const { M3 } = S.sandbox;
  const t = S.sandbox.spawnTarget(w, { ttype: 'air', model: 'relay', x: 0, y: 4000, z: 0, hp: 260, radius: 30, big: true, team });
  t.drift = 0; w.detected = true;
  p.pos = M3.V(0, 4000, 2500); p.fwd = M3.V(0, 0, 1); p.speed = 0; p.vel = M3.V(0, 0, 0);
  let shots = 0, bullets = 0;
  for (let i = 0; i < 60 * 30; i++) {
    S.step(1 / 60); p.alive = true; p.hp = p.maxHp;
    p.pos = M3.V(0, 4000, 2500);
    for (const m of w.missiles) if (m.owner === t) shots = Math.max(shots, 1);
    for (const b of w.bullets) if (b.owner === t) bullets++;
  }
  return { shots, bullets };
}
{
  const hot = fireTest(1);
  chk('C 敌方 relay 对 2.5 km 内的玩家开火', hot.shots > 0 || hot.bullets > 0, 'missiles=' + hot.shots + ' bullets=' + hot.bullets);
  const cold = fireTest(2);
  chk('C 中立 relay 不开火', cold.shots === 0 && cold.bullets === 0, 'missiles=' + cold.shots + ' bullets=' + cold.bullets);
}

/* D M2 里的高原默认武装 */
{
  const S = Sim.load({ seed: 3 });
  S.start(1);
  const w = S.sandbox.Game.__world();
  const rel = w.targets.filter(t => t.model === 'relay');
  chk('D M2 有高原', rel.length >= 1, 'n=' + rel.length);
  chk('D M2 的高原全都带炮位与舰空弹', rel.every(t => t.turrets && t.turrets.length === 3 && t.weapon === 'dl9'));
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
