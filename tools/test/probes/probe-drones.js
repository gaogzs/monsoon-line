#!/usr/bin/env node
/* ============================================================
   无人机与长机泛化探针（docs/POST2-0IMPL.md 批次 6.1）

   A. 长机 = 敌方飞机：无人机（team 1）跟着长机的槽位飞，长机的目标成为 focus 的目标
   B. 长机 = 舰船（target）：无人机跟着舰船槽位（right 现算、速度取 |vel|）
   C. 长机死亡：无人机盘旋，不去接管战局
   D. 压制规则：只有无人机自己被压制（> 0.35）才退化为不开火；长机被压制不连带
   E. 不写 world.wings / wingIdx；玩家僚机（leader = 玩家）行为不变
   F. 同队存活无人机上限 24
   G. 延迟压缩 world.actors：死机宽限 10 s 后移除，击落记功 / 友军损失先入账
   用法：node tools/test/probes/probe-drones.js
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
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  const lead = (team, x, y, z) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x, y, z, fwd: M3.V(0, 0, 1), speed: 230, special: 'dl6' });
    a.hp = a.maxHp = 1e9; AI.attach(a, { role: 'enemy', skill: 0.6, rank: 'pawn' }); a.ai.cmd = 'hold'; w.actors.push(a); return a;
  };
  return { S, w, p, step, lead, M3, Ent, AI, spawnDrone: S.sandbox.spawnDrone };
}

/* A 长机 = 敌方飞机 */
{
  const W = base(1);
  const L = W.lead(1, 0, 6000, 0);
  const d = W.spawnDrone(W.w, L, { type: 'folded_wing', dx: 300, dy: 40, dz: -400 });
  chk('A 无人机 team 跟长机、role drone、leader 指向长机', d.team === 1 && d.ai.role === 'drone' && d.ai.leader === L);
  chk('A 不写 world.wings / wingIdx', d.wingIdx === undefined && !Object.values(W.w.wings).includes(d));
  W.step(60 * 20);
  const right = W.M3.norm(W.M3.V(-L.fwd.z, 0, L.fwd.x));
  const off = W.M3.sub(d.pos, L.pos);
  const dx = W.M3.dot(off, right), dz = W.M3.dot(off, L.fwd);
  chk('A 无人机跟在长机槽位附近（距长机 < 900 m）', W.M3.len(off) < 900, 'dist=' + W.M3.len(off).toFixed(0) + ' dx=' + dx.toFixed(0) + ' dz=' + dz.toFixed(0));
  // focus：长机的目标 → 无人机目标
  const foe = W.Ent.makeAircraft({ type: 'albatross', team: 0, x: 3000, y: 6000, z: 4000, fwd: W.M3.V(0, 0, -1), speed: 200, special: 'dl6' });
  foe.hp = foe.maxHp = 1e9; W.AI.attach(foe, { role: 'ally', skill: 0.5, rank: 'pawn' }); foe.ai.cmd = 'hold'; W.w.actors.push(foe);
  L.ai.target = foe; L.target = foe; L.ai.retargetT = 1e9;
  W.step(10);
  chk('A focus：长机的目标成为无人机的目标', d.ai.target === foe);
}

/* B 长机 = 舰船 */
{
  const W = base(2);
  const ship = W.S.sandbox.spawnShip(W.w, { model: 'daplu', team: 1, x: 0, z: 0, hp: 1e9, weapon: null });
  const d = W.spawnDrone(W.w, ship, { type: 'folded_wing', dx: 600, dy: 80, dz: -300 });
  chk('B 舰船长机：无人机 team 1、leader = 舰船', d.team === ship.team && d.ai.leader === ship);
  W.step(60 * 25);
  const dist = W.M3.dist(d.pos, ship.pos);
  chk('B 无人机留在舰船附近（< 1500 m），没有飞走', d.alive && dist < 1500, 'dist=' + dist.toFixed(0));
  ship.alive = false; W.step(60 * 15);
  const d2 = W.M3.dist(d.pos, ship.pos);
  chk('C 长机（舰船）死亡：无人机盘旋，不接管战局（仍在 6 km 内）', d.alive && d2 < 6000 && d.ai.target === null, 'dist=' + d2.toFixed(0));
}

/* D 压制规则 */
{
  const W = base(3);
  const L = W.lead(1, 0, 6000, 0);
  const d = W.spawnDrone(W.w, L, { type: 'folded_wing', cmd: 'spread' });
  const foe = W.Ent.makeAircraft({ type: 'albatross', team: 0, x: 2500, y: 6000, z: 2500, fwd: W.M3.V(0, 0, -1), speed: 200, special: 'dl6' });
  foe.hp = foe.maxHp = 1e9; W.AI.attach(foe, { role: 'ally', skill: 0.5, rank: 'pawn' }); foe.ai.cmd = 'hold'; W.w.actors.push(foe);
  Object.defineProperty(L, 'suppressed', { get: () => 1, set: () => {} });
  W.step(60 * 3);
  chk('D 长机被压制：无人机照常接战（不连带）', d.ai.target === foe);
  Object.defineProperty(d, 'suppressed', { get: () => 1, set: () => {} });      // 固定压制（干扰场每帧会把它清零重算）
  W.step(300);
  chk('D 无人机自己被压制：退化为不开火（目标置空）', d.ai.target === null);
}

/* E 玩家僚机不变 */
{
  const W = base(4);
  W.p.pos.x -= 80000;
  const wg = W.S.sandbox.spawnWingman(W.w, 2, -200, 24, -300);
  chk('E 玩家僚机：leader = 玩家、写 wingIdx / world.wings', wg.ai.leader === W.p && wg.wingIdx === 2 && W.w.wings[2] === wg);
  const { AI } = W;
  chk('E leaderOf：有 leader 取 leader，没有回退玩家', AI.$.leaderOf(wg.ai, W.w) === W.p && AI.$.leaderOf({ leader: null }, W.w) === W.p);
}

/* F 同时存活上限 */
{
  const W = base(5);
  const L = W.lead(1, 0, 6000, 0);
  let made = 0, nullAt = -1;
  for (let i = 0; i < 30; i++) { const d = W.spawnDrone(W.w, L, { type: 'folded_wing' }); if (d) made++; else if (nullAt < 0) nullAt = i; }
  chk('F 同队存活无人机上限 24：第 25 架起返回 null', made === 24 && nullAt === 24, 'made=' + made);
}

/* G 延迟压缩：死机宽限 10 s 后移除，但击落记功 / 友军损失先入账 */
{
  const W = base(6);
  W.p.pos.x -= 80000;
  const foe = W.lead(1, 5000, 6000, 5000);
  const ally = W.lead(0, -5000, 6000, 5000);
  W.lead(1, 90000, 6000, 90000);                   // 哨兵：留一架活敌机，免得关卡判胜利后停更
  const n0 = W.w.actors.length;
  W.Ent.kill(foe, W.w, false, W.p);               // 玩家击落一架敌机
  W.Ent.kill(ally, W.w, false, foe);              // 敌机击落一架友机
  W.step(60 * 3);
  chk('G 宽限内死机仍在 actors 里', W.w.actors.includes(foe) && W.w.actors.includes(ally));
  const k1 = W.w.killed;
  W.step(60 * 9);
  chk('G 宽限（10 s）后死机从 actors 移除', !W.w.actors.includes(foe) && !W.w.actors.includes(ally) && W.w.actors.length === n0 - 2, 'n=' + W.w.actors.length + '/' + n0);
  chk('G 玩家击落数不因压缩而减少', k1 >= 1 && W.w.killed === k1, k1 + ' -> ' + W.w.killed);
  chk('G 友军损失入账（world.gone.lost）', W.w.gone.lost === 1);
  chk('G 玩家本体不被压缩', W.w.actors.includes(W.p));
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
