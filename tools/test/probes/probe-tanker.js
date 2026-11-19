#!/usr/bin/env node
/* ============================================================
   空中整备机探针（docs/POST2-0IMPL.md 批次 6.5，js/missions/_lib.js 的 spawnTanker）

   海鹦（puffin）：不武装、在后方两点之间慢速盘旋、本身是移动的整备点
   A. 生成：team 0、role support、有盘旋航线、没有武器、带 resupply 标签、登记 w.refs.puffin
   B. 声明校验：Resupply.validate 读得到飞机自己的 resupply 标签（原来只读 ship / platform）
   C. 盘旋：两分钟内在 a ↔ b 之间来回，永不退场
   D. 玩家跟着它飞（水平距离 < r）：满 hold 秒打开整备，对移动的整备点也成立
   E. 离开圈外：计时清零；出圈再回来才会再次整备
   F. 被击毁：不再提供整备
   用法：node tools/test/probes/probe-tanker.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function base(seed) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox;
  const { M3, Ent, AI } = sb;
  const G = sb.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  /* 哨兵：没有敌机关卡会判胜利；放在很远处 */
  const sen = Ent.makeAircraft({ type: 'albatross', team: 1, x: 400000, y: 3000, z: 400000, fwd: M3.V(0, 0, 1), speed: 230, special: 'dl6' });
  sen.hp = sen.maxHp = 1e12; AI.attach(sen, { role: 'support', skill: 0.6, rank: 'pawn' }); w.actors.push(sen);
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  const tk = sb.spawnTanker(w, { x: 80000, y: 5000, z: 0, a: M3.V(80000, 5000, 3000), b: M3.V(80000, 5000, -3000) });
  return { S, sb, w, p, tk, step, M3 };
}

/* A / B */
{
  const { sb, w, tk } = base(1);
  chk('A team 0、role support、有盘旋航线', tk.team === 0 && tk.ai.role === 'support' && tk.route && tk.route.loiter === true);
  chk('A 没有武器（弹药池为空）', Object.keys(tk.ammoPool || {}).length === 0 && !tk.gun, JSON.stringify(tk.ammoPool));
  chk('A 带 resupply 标签、登记 w.refs.puffin', tk.tags && tk.tags.resupply === true && w.refs.puffin === tk);
  chk('A 不是预警机（没有 aewc 标志）', !tk.aewc && tk.tanker === true);
  const bad = sb.Resupply.validate({ id: 'x', resupply: [{ ref: 'puffin', r: 2200, hold: 5, swap: true }] }, w);
  chk('B 声明校验通过（读飞机自己的标签）', bad.length === 0, JSON.stringify(bad));
}

/* C 盘旋 */
{
  const { tk, step } = base(2);
  let zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < 60 * 120; i++) { step(1); zmin = Math.min(zmin, tk.pos.z); zmax = Math.max(zmax, tk.pos.z); }
  chk('C 两分钟内在两点之间来回、活着', tk.alive && zmax - zmin > 2500 && Math.abs(tk.pos.x - 80000) < 6000, 'zrange=' + (zmax - zmin).toFixed(0) + ' alive=' + tk.alive);
}

/* D / E / F 整备：给整备模块一个独立的世界对象（只借用游戏世界里的整备机），
   否则游戏主循环自己也会每帧调用 Resupply.update 并先消费事件，和探针手动调用互相干扰 */
function rworld(w, def) {
  const rw = { missiles: [], actors: [], refs: w.refs, arenaDef: null, resupply: null, rearmCount: 0, time: 0 };
  return rw;
}
{
  const { sb, w, p, tk, step, M3 } = base(3);
  const R = sb.Resupply;
  const rw = rworld(w);
  R.init(rw, { resupply: [{ ref: 'puffin', r: 2200, hold: 5, swap: true }] });
  const pl = { alive: true, team: 0, pos: M3.V(0, 5000, 0) };
  let ev = null;
  for (let i = 0; i < 60 * 8; i++) {
    step(1);                                                         // 整备机在盘旋（会移动）
    pl.pos = M3.V(tk.pos.x + 600, tk.pos.y, tk.pos.z + 300);         // 玩家跟着它飞：永远在 r 以内
    ev = R.update(rw, pl, 1 / 60) || ev;
    if (ev && ev.open) break;
  }
  chk('D 跟着移动的整备机飞满 hold 秒：打开整备', !!(ev && ev.open), 't=' + (rw.resupply.entries[0].t).toFixed(1));
  const rw2 = rworld(w);
  R.init(rw2, { resupply: [{ ref: 'puffin', r: 2200, hold: 5, swap: true }] });
  for (let i = 0; i < 60 * 3; i++) { step(1); pl.pos = M3.V(tk.pos.x + 600, tk.pos.y, tk.pos.z); R.update(rw2, pl, 1 / 60); }
  const t3 = rw2.resupply.entries[0].t;
  pl.pos = M3.V(tk.pos.x + 9000, tk.pos.y, tk.pos.z); R.update(rw2, pl, 1 / 60);
  chk('E 驻留 3 s 后离开圈外：计时清零', t3 > 2 && rw2.resupply.entries[0].t === 0, 't3=' + t3.toFixed(1) + ' now=' + rw2.resupply.entries[0].t);
}

/* F 被击毁 */
{
  const { sb, w, tk, M3 } = base(4);
  const R = sb.Resupply;
  const rw = rworld(w);
  R.init(rw, { resupply: [{ ref: 'puffin', r: 2200, hold: 5, swap: true }] });
  tk.alive = false;
  R.update(rw, { alive: true, team: 0, pos: M3.V(tk.pos.x + 300, tk.pos.y, tk.pos.z) }, 1 / 60);
  chk('F 被击毁：不再提供整备', rw.resupply.status.kind === 'none');
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
