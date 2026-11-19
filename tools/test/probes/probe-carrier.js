#!/usr/bin/env node
/* ============================================================
   无人机航母探针（docs/POST2-0IMPL.md 批次 6.1b，js/missions/_lib.js 的 tickHangar）

   怪诞虫（hallucigenia）：机库 12 架砾石，每 25 s 一波 3 架，波内每 2.5 s 放一架，从弹射轨道起飞
   A. 开局机库满、首波在 firstCd 之后；一波 3 架、leader 是母舰、角色 drone
   B. 两波间隔 ≥ launchCd；机库计数随放飞递减
   C. 库存守恒：机库 + 在外存活 + 已收回在内的总数 = capacity
   D. 回收：弹药打空的无人机改 recall、飞回舰尾后收回（alive = false + escaped），机库 +1，不计击毁 / 友军损失
   E. 母舰被压制：放飞照常、在外无人机不受影响
   F. 母舰被击毁：不再放飞
   G. hold：暂停放飞
   用法：node tools/test/probes/probe-carrier.js
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
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  /* 哨兵：没有敌机关卡会判胜利。放在很远处，血量取极大值，原地待命 */
  const sen = sb.Ent.makeAircraft({ type: 'albatross', team: 1, x: 300000, y: 3000, z: 300000, fwd: sb.M3.V(0, 0, 1), speed: 230, special: 'dl6' });
  sen.hp = sen.maxHp = 1e12; sb.AI.attach(sen, { role: 'enemy', skill: 0.6, rank: 'pawn' }); sen.ai.cmd = 'hold';
  w.actors.push(sen);
  const car = sb.spawnShip(w, Object.assign({ model: 'hallucigenia', x: 0, z: 0, team: 1, hp: 1e9, route: { wp: [{ x: 0, z: 90000 }], speed: 12 } }, o || {}));
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  const mine = () => w.actors.filter(a => a.ai && a.ai.leader === car);
  return { S, sb, w, p, car, step, mine };
}

/* A / B / C */
{
  const { w, car, step, mine } = setup(1);
  const h = car.hangar, d = car.ship.hangar;
  chk('A 开局机库满、尚未放飞', h && h.count === d.capacity && h.launched === 0 && mine().length === 0, 'count=' + (h && h.count));
  step(60 * 6 + 30);                                     // 首波 firstCd = 6 s
  chk('A 首波开始放飞（6 s 后有第一架）', h.launched >= 1, 'launched=' + h.launched);
  step(60 * 6);                                          // 再过 6 s：3 架（间隔 2.5 s）
  const first = mine();
  chk('A 一波 3 架、机库扣 3', first.length === 3 && h.launched === 3 && h.count === d.capacity - 3, 'n=' + first.length + ' count=' + h.count);
  chk('A 全是 drone 角色、team 同母舰', first.every(a => a.ai.role === 'drone' && a.team === car.team));
  const t0 = w.time;
  step(60 * 14);                                         // 首波开始后约 26 s
  chk('B 两波间隔 ≥ launchCd：第二波之前不会多放', h.launched === 3, 'launched=' + h.launched + ' dt=' + (w.time - t0).toFixed(1));
  step(60 * 12);
  chk('B 第二波开始', h.launched >= 4, 'launched=' + h.launched);
  const air = mine().filter(a => a.alive).length;
  chk('C 库存守恒：机库 + 在外存活 = capacity（未回收时）', h.count + air === d.capacity, 'count=' + h.count + ' air=' + air);
}

/* D 回收 */
{
  const { w, car, step, mine } = setup(2);
  const h = car.hangar;
  step(60 * 12);
  const dr = mine().filter(a => a.alive)[0];
  const goneBefore = JSON.stringify(w.gone || {});
  for (const k in dr.ammoPool) dr.ammoPool[k] = 0;
  step(2);
  chk('D 弹药打空：改 recall 命令、不再接战', dr.ai.cmd === 'recall' && !dr.ai.target);
  let n = 0; while (dr.alive && n++ < 60 * 80) step(1);
  chk('D 飞回舰尾后被收回：alive = false 且 escaped', !dr.alive && dr.escaped === true, 'after ' + n + ' s');
  chk('D 机库计数 +1、recovered 记录', h.recovered === 1, 'recovered=' + h.recovered);
  chk('D 不计击毁、不计友军损失', JSON.stringify(w.gone || {}) === goneBefore);
}

/* E 母舰被压制：放飞照常 */
{
  const { car, step, mine } = setup(3);
  Object.defineProperty(car, 'suppressed', { get: () => 1, set: () => {}, configurable: true });
  step(60 * 12);
  chk('E 母舰被压制：放飞照常', car.hangar.launched >= 2, 'launched=' + car.hangar.launched);
  const dr = mine().filter(a => a.alive)[0];
  chk('E 在外无人机不因母舰被压制而退化（只看自己的 suppressed）', !!dr && dr.ai.cmd !== 'recall' && !(dr.suppressed > 0.35));
}

/* F 母舰被击毁 / G hold */
{
  const a = setup(4);
  a.step(60 * 12);
  const n0 = a.car.hangar.launched;
  a.car.alive = false;
  a.step(60 * 40);
  chk('F 母舰被击毁：不再放飞', a.car.hangar.launched === n0, 'launched=' + a.car.hangar.launched);
  const b = setup(5);
  b.car.hangar.hold = true;
  b.step(60 * 20);
  chk('G hold：暂停放飞', b.car.hangar.launched === 0);
  b.car.hangar.hold = false;
  b.step(60 * 8);
  chk('G 取消 hold 后继续放飞', b.car.hangar.launched >= 1);
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
