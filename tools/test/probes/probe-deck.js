#!/usr/bin/env node
/* ============================================================
   甲板起飞探针（docs/POST2-0IMPL.md 批次 6.1b，js/engine/entities/deck.js）

   任何飞机都能从带跑道的宿主（舰船 / 平台）弹射起飞：
   A. spawnEnemy({ deck }) 把一架完整的飞机生成在跑道起点（速度 ≈ 0、模型 / 挂载 / 血量 / AI 都在）
   B. 沿跑道加速离舰：离舰时对空速度 ≥ 1.3 × 失速速度，位置在跑道末端，离舰后活着、不掉海、AI 接手
   C. 宿主在开（15 m/s）：滑跑期间飞机始终在宿主局部的跑道线上
   D. 同一条跑道同一时刻只放一架：占着返回 null；换一条能放；离舰 + 间隔之后又能放
   E. 机型不限：有人机（albatross）与无人机（spawnDrone，gravel）都行；无人机离舰后仍是 drone 角色
   F. 宿主中途被打掉：当场放开，按离舰速度飞出去，不卡在甲板状态
   G. 没有跑道数据的宿主（海豚级）：deckSlot 返回 -1，spawnEnemy 返回 null
   用法：node tools/test/probes/probe-deck.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function setup(seed, model) {
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
  const host = sb.spawnShip(w, { model: model || 'humpback', x: 0, z: 0, team: 1, hp: 1e9, route: { wp: [{ x: 0, z: 90000 }], speed: 15 } });
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, sb, w, p, host, step };
}
const local = (host, a) => {      // 飞机在宿主局部系的 (x 右舷, y, z 舰首)
  const fl = Math.hypot(host.fwd.x, host.fwd.z), fx = host.fwd.x / fl, fz = host.fwd.z / fl;
  const dx = a.pos.x - host.pos.x, dz = a.pos.z - host.pos.z;
  return { x: fz * dx - fx * dz, y: a.pos.y - host.pos.y, z: fx * dx + fz * dz };
};

/* A / B / C 有人机：albatross 从第 0 条跑道起飞，宿主 15 m/s */
{
  const { sb, w, host, step } = setup(1);
  step(120);                                  // 先让船开起来，host.vel 与 fwd 有值
  const rw = host.ship.runways[0], len = sb.Ent.DECK.LEN;
  const a = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  chk('A 放飞成功、飞机在甲板状态', !!a && !!a.deck);
  chk('A 完整的飞机：血量 / 模型 / AI / 挂载都在', a.hp > 0 && a.model === 'albatross' && !!a.ai && a.loadoutList && a.loadoutList.length > 0,
    'hp=' + a.hp + ' loadoutList=' + (a.loadoutList && a.loadoutList.length));
  const l0 = local(host, a);
  chk('A 出生在跑道起点（起飞端往后 80 m）、速度很小', Math.abs(l0.x - rw.x) < 0.5 && Math.abs(l0.z - (rw.z - len)) < 1 && a.speed - 15 < 3,
    'local=' + l0.x.toFixed(1) + ',' + l0.z.toFixed(1) + ' speed=' + a.speed.toFixed(1));
  let maxDev = 0, t = 0;
  while (a.deck && t < 600) {
    step(1); t++;
    if (a.deck) { const l = local(host, a); maxDev = Math.max(maxDev, Math.abs(l.x - rw.x)); }
  }
  chk('B 在 4 秒内离舰', !a.deck && t < 240, 't=' + (t / 60).toFixed(2) + ' s');
  const l1 = local(host, a), vs = sb.Ent.vStallAt(a);
  chk('B 离舰时对空速度 ≥ 1.3 × 失速速度', a.speed >= vs * 1.3, 'speed=' + a.speed.toFixed(1) + ' vStall=' + vs.toFixed(1));
  chk('B 离舰位置在跑道末端', Math.abs(l1.z - rw.z) < 8, 'z=' + l1.z.toFixed(1) + ' end=' + rw.z);
  chk('C 宿主在开：滑跑期间始终在跑道线上', maxDev < 0.5, 'maxDev=' + maxDev.toFixed(2) + ' hostSpeed=' + Math.hypot(host.vel.x, host.vel.z).toFixed(1));
  step(240);
  chk('B 离舰 4 秒后活着、高于甲板、AI 在飞', a.alive && a.pos.y > host.pos.y + rw.y + 4 && !a.deck, 'alt above deck=' + (a.pos.y - host.pos.y - rw.y).toFixed(1));
}

/* D 占用与间隔 */
{
  const { sb, w, host, step } = setup(2);
  step(60);
  const a1 = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  const dup = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  chk('D 跑道被占：同一条再放返回 null', a1 && dup === null);
  const a2 = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 1, loadout: { A: 'hwm' } });
  chk('D 换一条跑道可以同时放', !!a2 && a2.deck && a2.deck.ri === 1);
  let n = 0; while ((a1.deck || a2.deck) && n++ < 600) step(1);
  const early = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  chk('D 刚离舰的那条跑道有 1.5 s 间隔', early === null);
  step(110);
  const late = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  chk('D 间隔过后又能放', !!late && !!late.deck);
  chk('D 不指定跑道时自动找空闲的', (() => { const x = sb.spawnEnemy(w, { ac: 'albatross', deck: host, loadout: { A: 'hwm' } }); return !!x && x.deck && x.deck.ri !== 0; })());
}

/* E 机型不限：无人机 */
{
  const { sb, w, host, step } = setup(3);
  step(60);
  const d = sb.spawnDrone(w, host, { type: 'gravel', deck: host, runway: 2 });
  chk('E spawnDrone 也能从甲板起飞', !!d && !!d.deck && d.ai.role === 'drone');
  let n = 0; while (d.deck && n++ < 600) step(1);
  step(120);
  chk('E 无人机离舰后活着、仍是 drone 角色、leader 是宿主', d.alive && !d.deck && d.ai.role === 'drone' && d.ai.leader === host);
}

/* F 宿主中途被打掉 */
{
  const { sb, w, host, step } = setup(4);
  step(60);
  const a = sb.spawnEnemy(w, { ac: 'albatross', deck: host, runway: 0, loadout: { A: 'hwm' } });
  step(20);
  host.alive = false;
  step(2);
  chk('F 宿主被打掉：飞机放开、不卡在甲板状态', !a.deck && a.alive && a.speed > 10, 'speed=' + a.speed.toFixed(1));
}

/* G 没有跑道的宿主 */
{
  const { sb, w, host, step } = setup(5, 'dolphin');
  step(10);
  chk('G 没有跑道数据：deckSlot = -1', sb.Ent.deckSlot(host, undefined, w.time) === -1);
  chk('G spawnEnemy 返回 null、不留下飞机', sb.spawnEnemy(w, { ac: 'albatross', deck: host }) === null);
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
