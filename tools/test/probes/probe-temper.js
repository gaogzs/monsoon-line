#!/usr/bin/env node
/* ============================================================
   性格体系探针（v3.6.3）

   A. 随机保底：spawnEnemy 在关卡没写 temperament 时随机选一个；确定性、不推进私有随机流、
      loyal 只给有 leader / ward 的、sniper 只给带远距对空弹的、drone / support / 侦察构型不抽、
      'steady' 可关、AI.attach 直接调不抽
   用法：node tools/test/probes/probe-temper.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function world(seed) {
  const S = Sim.load({ seed });
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  return { S, w, p, M3: S.sandbox.M3, AI: S.sandbox.AI, spawn: o => S.sandbox.spawnEnemy(w, Object.assign({ ac: 'albatross', x: 0, y: 6000, z: 30000, fwd: S.sandbox.M3.V(0, 0, -1), speed: 250 }, o || {})) };
}

/* A 随机保底 */
{
  const W = world(1);
  const N = 300, got = {};
  const list = [];
  for (let i = 0; i < N; i++) { const a = W.spawn({ skill: 0.6 }); list.push(a); got[a.ai.temperament] = (got[a.ai.temperament] || 0) + 1; }
  chk('A 300 架里每架都有性格', list.every(a => !!a.ai.temperament), JSON.stringify(got));
  chk('A 没有 ward / leader 时不出 loyal', !got.loyal);
  chk('A 短程弹机型：只在 aggressive / cautious 里分（约 55% / 45%），不出 sniper', !got.sniper && got.aggressive / N > 0.45 && got.aggressive / N < 0.65, 'agg=' + (got.aggressive / N).toFixed(2) + ' cau=' + (got.cautious / N).toFixed(2));
  const lr = {}; for (let i = 0; i < N; i++) { const t = W.spawn({ skill: 0.6, special: 'mrm' }).ai.temperament; lr[t] = (lr[t] || 0) + 1; }
  chk('A 远距弹机型：三种都出现，约 40% / 33% / 27%', ['aggressive', 'cautious', 'sniper'].every(k => lr[k] / N > 0.18 && lr[k] / N < 0.5) && !lr.loyal, JSON.stringify(lr));
  const ward = W.spawn({ temperament: 'steady' });
  const esc = []; for (let i = 0; i < 200; i++) esc.push(W.spawn({ ward }).ai.temperament);
  chk('A 有 ward 时 loyal 出现（约 25%）', esc.filter(t => t === 'loyal').length > 25 && esc.filter(t => t === 'loyal').length < 80, 'loyal=' + esc.filter(t => t === 'loyal').length);
  chk('A 关卡显式指定的性格不被覆盖', W.spawn({ temperament: 'cautious' }).ai.temperament === 'cautious');
  chk("A 'steady' 关掉随机，且是空表（中性）", W.spawn({ temperament: 'steady' }).ai.temperament === 'steady' && Object.keys(W.AI.$.TEMPER.steady).length === 0);
  chk('A 侦察 / 干扰机构型（behavior recon）视为 steady', W.spawn({ behavior: 'recon' }).ai.temperament === 'steady');
  const gunOnly = []; for (let i = 0; i < 200; i++) gunOnly.push(W.spawn({ special: null }).ai.temperament);
  chk('A 没有远距对空弹的不出 sniper', !gunOnly.includes('sniper'));
  const x = world(7).spawn({ skill: 0.6 }), y = world(7).spawn({ skill: 0.6 });
  chk('A 同 seed 同顺序：结果相同（确定性）', x.ai.temperament === y.ai.temperament, x.ai.temperament + ' / ' + y.ai.temperament);
  const t = W.spawn({ skill: 0.6 }); const rs0 = t.ai.rs; t.ai.temperament = null; W.AI.rollTemperament(t);
  chk('A 抽取不推进私有随机流 rs', t.ai.rs === rs0);
  const d = W.S.sandbox.Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: W.M3.V(0, 0, 1), speed: 250, special: null });
  W.AI.attach(d, { role: 'enemy', skill: 0.6 });
  chk('A 直接 AI.attach 不抽（探针与旧调用方行为不变）', d.ai.temperament === null);
  d.ai.role = 'drone';
  chk('A 无人僚机（drone）不抽', W.AI.rollTemperament(d) === null);
  const w2 = world(3); const aew = w2.S.sandbox.spawnAewc(w2.w, { ac: 'quartz', team: 1, label: 'X', x: 0, y: 9000, z: 21000, a: w2.M3.V(6000, 0, 21000), b: w2.M3.V(-6000, 0, 24000) });
  chk('A 预警机（support / 航线型）没有性格或为 steady', !aew.ai.temperament || aew.ai.temperament === 'steady', String(aew.ai.temperament));
}

process.exit(ok ? 0 : 1);
