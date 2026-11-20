#!/usr/bin/env node
/* ============================================================
   AI 长机的无人机探针（js/engine/ai/util.js 的 leashTarget / aiLed，brain.js 的 drone 分支）

   长机是 AI 时僚机不分 focus / cover / spread：巡航守编队，战斗时在长机 leash 范围内自选目标；
   母舰的防御与出击只是 leash 大小不同（同一型砾石、同一套行为）。
   A. 飞机长机：敌机在 12 km（圈外）不出去，进到 5 km（圈内）出去接战；敌机消失回编队
   B. 母舰出击（怪诞虫数据 leash 25 km）：敌机在 15 km，砾石离开母舰飞向它
   C. 母舰防御（hangarLeash 5 km）：敌机在 15 km 守在母舰周围；进到 4 km 出去接战；消失后飞回
   D. 被压制时退回只规避、不选目标
   用法：node tools/test/probes/probe-drone-roles.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function setup(seed, o) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox;
  const G = sb.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 90000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  /* 哨兵（team 1，很远）：防止关卡因没有敌机而结束 */
  const sen = sb.Ent.makeAircraft({ type: 'albatross', team: 1, x: 300000, y: 3000, z: 300000, fwd: sb.M3.V(0, 0, 1), speed: 230, special: 'dl6' });
  sen.hp = sen.maxHp = 1e12; sb.AI.attach(sen, { role: 'enemy', skill: 0.6, rank: 'pawn' }); sen.ai.cmd = 'hold';
  w.actors.push(sen);
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; if (o && o.each) o.each(); } };
  return { S, sb, w, p, step };
}
const D = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
const H = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

/* 目标机（team 0）：钉在指定位置不动（每帧回位），血量极大 */
function dummy(sb, w, x, y, z) {
  const t = sb.Ent.makeAircraft({ type: 'albatross', team: 0, x, y, z, fwd: sb.M3.V(0, 0, 1), speed: 200 });
  t.hp = t.maxHp = 1e12; sb.AI.attach(t, { role: 'enemy', skill: 0.3, rank: 'pawn' }); t.ai.cmd = 'hold';
  t.__fix = { x, y, z };
  w.actors.push(t);
  return t;
}
function pin(t) { t.pos.x = t.__fix.x; t.pos.y = t.__fix.y; t.pos.z = t.__fix.z; t.speed = 200; }

/* A 飞机长机 */
{
  const ctx = setup(1);
  const { sb, w, step } = ctx;
  const lead = sb.Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 3000, z: 0, fwd: sb.M3.V(0, 0, 1), speed: 230 });
  lead.hp = lead.maxHp = 1e12; sb.AI.attach(lead, { role: 'enemy', skill: 0.6, rank: 'pawn' }); lead.ai.cmd = 'hold';
  w.actors.push(lead);
  const dr = sb.spawnDrone(w, lead, { type: 'gravel' });
  const hostile = dummy(sb, w, 0, 3000, 12000);
  let worst = 0;
  for (let i = 0; i < 20; i++) { step(60); pin(hostile); worst = Math.max(worst, D(dr, lead)); }
  chk('A 敌机在 12 km（圈外）：守在长机旁（≤ 2000 m，编队本身有起伏）', worst < 2000, 'max=' + worst.toFixed(0));
  hostile.__fix = { x: 0, y: 3000, z: lead.pos.z + 5000 };
  let closest = 1e9;
  for (let i = 0; i < 40; i++) { step(60); pin(hostile); closest = Math.min(closest, D(dr, hostile)); }
  chk('A 敌机进到 5 km（圈内）：出去接战（最近 < 2500 m）', closest < 2500, 'closest=' + closest.toFixed(0));
}

/* B 出击 */
{
  const ref = {};
  const ctx = setup(2, { each() { if (ref.t) pin(ref.t); } });
  const { sb, w, step } = ctx;
  const car = sb.spawnShip(w, { model: 'hallucigenia', x: 0, z: 0, team: 1, hp: 1e9, route: null });
  ref.t = dummy(sb, w, 0, 3000, 15000);
  step(60 * 18);
  const drs = w.actors.filter(a => a.alive && a.ai && a.ai.leader === car);
  chk('B 出击：母舰放出了无人机且 leash 取舰船数据 25 km', drs.length >= 1 && drs.every(a => a.ai.leash === 25000), 'n=' + drs.length);
  step(60 * 75);                       // 15 km 的路程：砾石一路爬到目标高度，约 70 s 才进 5 km
  const near = drs.filter(a => a.alive && D(a, ref.t) < 5000).length;
  const far = drs.filter(a => a.alive && H(a, car) > 8000).length;
  chk('B 出击：砾石离开母舰飞向 15 km 外的敌机（8 km 外 ≥ 1 架，进 5 km ≥ 1 架）', far >= 1 && near >= 1, 'far=' + far + ' near=' + near + ' alive=' + drs.filter(a => a.alive).length);
}

/* C 防御 */
{
  const ref = {};
  const ctx = setup(3, { each() { if (ref.t && ref.t.alive) pin(ref.t); } });
  const { sb, w, step } = ctx;
  const car = sb.spawnShip(w, { model: 'hallucigenia', x: 0, z: 0, team: 1, hp: 1e9, route: null, hangarLeash: 5000 });
  ref.t = dummy(sb, w, 0, 3000, 15000);
  step(60 * 18);
  const drs = () => w.actors.filter(a => a.alive && a.ai && a.ai.leader === car);
  chk('C 防御：关卡覆盖：放出的无人机 leash 5 km', drs().length >= 1 && drs().every(a => a.ai.leash === 5000), 'n=' + drs().length);
  let worst = 0;
  for (let i = 0; i < 25; i++) { step(60); for (const a of drs()) worst = Math.max(worst, H(a, car)); }
  chk('C1 敌机在 15 km（圈外）：砾石守在母舰周围（≤ 4 km）', worst < 4000, 'max=' + worst.toFixed(0));
  ref.t.__fix = { x: 0, y: 3000, z: 4000 };
  let closest = 1e9, farthest = 0;
  for (let i = 0; i < 40; i++) { step(60); for (const a of drs()) { closest = Math.min(closest, D(a, ref.t)); farthest = Math.max(farthest, H(a, car)); } }
  chk('C2 敌机进到 4 km：砾石出去接战（最近 < 2500 m），离母舰不超过 9 km', closest < 2500 && farthest < 9000, 'closest=' + closest.toFixed(0) + ' farthest=' + farthest.toFixed(0));
  ref.t.alive = false;
  step(60 * 40);
  let back = 0, n = 0;
  for (const a of drs()) { n++; back = Math.max(back, H(a, car)); }
  chk('C3 敌机消失：砾石飞回母舰附近（≤ 4 km）', n >= 1 && back < 4000, 'max=' + back.toFixed(0) + ' n=' + n);
}

/* D 被压制 */
{
  const ref = {};
  const ctx = setup(4, { each() { if (ref.t) pin(ref.t); } });
  const { sb, w, step } = ctx;
  const car = sb.spawnShip(w, { model: 'hallucigenia', x: 0, z: 0, team: 1, hp: 1e9, route: null });
  ref.t = dummy(sb, w, 0, 3000, 12000);
  step(60 * 12);
  const dr = w.actors.filter(a => a.alive && a.ai && a.ai.leader === car)[0];
  const before = dr.ai.target;
  /* suppressed 每帧在干扰更新里先清零（lock.js），写回会赶不上 AI 读取：用只读属性固定成 1 */
  Object.defineProperty(dr, 'suppressed', { get: () => 1, set() {}, configurable: true });
  step(30);
  chk('D 被压制前无人机有目标、被压制后不选目标（只规避）', !!before && dr.ai.target === null);
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
