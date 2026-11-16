#!/usr/bin/env node
/* ============================================================
   态势记忆探针（docs/POST2-0IMPL.md 5.7，批次 5f）

   A. 目标飞到身后 / 出雷达范围且无人共享：进入搜索（飞向最后已知位置）、搜索中不开火；T_SEARCH 秒后放弃目标
   B. 有己方预警机在线：始终感知（不进入搜索）
   C. 同队有别的 AI 离目标很近（数据链共享）：仍感知
   D. 低技能（< 0.6）：保持全知
   E. 目标开电磁静默：雷达有效距离缩小
   用法：node tools/test/probes/probe-memory.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function scene(skill, extra) {
  const S = Sim.load({ seed: 2 });
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const A = Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: M3.V(0, 0, 1), speed: 250, special: 'dl6' });
  A.hp = A.maxHp = 1e9; AI.attach(A, { role: 'enemy', skill, rank: skill >= 0.72 ? 'elite' : 'pawn' });
  const T = Ent.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 6000, z: 10000, fwd: M3.V(0, 0, 1), speed: 200, special: null });
  T.hp = T.maxHp = 1e9; AI.attach(T, { role: 'ally', skill: 0.3 }); T.ai.cmd = 'hold';
  w.actors.push(A, T);
  if (extra) extra({ w, M3, Ent, AI, A, T });
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, w, A, T, M3, step, AI };
}
const behind = W => { W.T.pos = W.M3.V(0, 6000, -10000); W.T.vel = W.M3.V(0, 0, -200); W.T.fwd = W.M3.V(0, 0, -1); W.T.speed = 200; };

/* A */
{
  const W = scene(0.8);
  W.step(60 * 3);
  chk('A 开局目标在前方 10 km：感知到、有目标、没在搜索', W.A.ai.target === W.T && !W.A.ai.searching && W.A.ai.lastKnown);
  behind(W);
  let firedWhileSearching = false, searched = false, dropped = -1;
  for (let f = 0; f < 60 * 12; f++) {
    W.step(1);
    if (W.A.ai.searching) { searched = true; if (W.A.firingGun) firedWhileSearching = true; }
    if (searched && W.A.ai.target !== W.T && dropped < 0) dropped = f / 60;
    behind(W);                                 // 目标一直在身后远处，AI 掉头也追不上（保持出雷达前半球）
  }
  chk('A 目标甩到身后：进入搜索，搜索中不开火', searched && !firedWhileSearching);
  chk('A 搜索超过 T_SEARCH 秒后放弃目标', dropped > 4 && dropped < 9, 'dropped at ' + dropped.toFixed(1));
}
/* B */
{
  const W = scene(0.8, ({ w, Ent, M3, AI }) => {
    const e = Ent.makeAircraft({ type: 'albatross', team: 1, x: -30000, y: 8000, z: -30000, fwd: M3.V(1, 0, 0), speed: 250, special: null });
    e.aewc = true; e.hp = e.maxHp = 1e9; AI.attach(e, { role: 'support', skill: 0.5 }); e.ai.cmd = 'hold'; w.actors.push(e);
  });
  W.step(60 * 3); behind(W);
  let searched = false;
  for (let f = 0; f < 60 * 10; f++) { W.step(1); if (W.A.ai.searching) searched = true; behind(W); }
  chk('B 有己方预警机在线：始终感知，不进入搜索', !searched && W.A.ai.target === W.T);
}
/* C */
{
  const W = scene(0.8, ({ w, Ent, M3, AI }) => {
    const m = Ent.makeAircraft({ type: 'albatross', team: 1, x: 3000, y: 6000, z: -10000, fwd: M3.V(0, 0, 1), speed: 250, special: null });
    m.hp = m.maxHp = 1e9; AI.attach(m, { role: 'enemy', skill: 0.5 }); m.ai.cmd = 'hold'; w.actors.push(m);
  });
  W.step(60 * 3); behind(W);
  let searched = false;
  for (let f = 0; f < 60 * 10; f++) { W.step(1); if (W.A.ai.searching) searched = true; behind(W); }
  chk('C 队友离目标 < 8 km（数据链共享）：仍感知', !searched);
}
/* D */
{
  const W = scene(0.4);
  W.step(60 * 3); behind(W);
  let searched = false;
  for (let f = 0; f < 60 * 8; f++) { W.step(1); if (W.A.ai.searching) searched = true; behind(W); }
  chk('D 低技能保持全知（不进入搜索）', !searched);
}
/* E */
{
  const W = scene(0.8);
  const $ = W.AI.$;
  W.T.pos = W.M3.V(0, 6000, 12000);
  W.A.fwd = W.M3.V(0, 0, 1);
  const seen = $.perceives(W.A, W.w, W.T);
  W.T.emcon = true;
  const seenQuiet = $.perceives(W.A, W.w, W.T);
  chk('E 12 km 前方：平时雷达能看到，目标电磁静默后看不到', seen === true && seenQuiet === false, 'seen=' + seen + ' quiet=' + seenQuiet);
}

process.exit(ok ? 0 : 1);
