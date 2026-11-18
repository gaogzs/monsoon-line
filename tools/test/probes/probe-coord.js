#!/usr/bin/env node
/* ============================================================
   编队与协同探针（docs/POST2-0IMPL.md 5.7，批次 5f）

   A. 护航：无威胁时留在被护卫者周围（R 内外徘徊）；敌机接近被护卫者时转去拦截（等反应延迟）；被护卫者没了 → 不再护航
   B. 巡航队形：未交战时跟队长保持槽位；交战判据成立后解散（s.fm = null）
   C. 电子战协同：被压制持续 > JAM.T 秒 → 主动脱离干扰区（extend，目标 = 干扰源）
   E. 自由飞行的干扰机（v3.6.2，spawnEnemy 的 jam 选项）：从远处靠近己方编队并绕着它转、敌人进干扰范围才开吊舱、不接战、不追击
   D. 友军呼救：被咬尾 / 血量低 → helpT 置位并播 Chatter help；Director 把"正在打求援者"的敌机评分 ×0.6
   用法：node tools/test/probes/probe-coord.js
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
  const mk = (team, x, y, z, fz, o) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x, y, z, fwd: M3.V(0, 0, fz || 1), speed: 230, special: 'dl6' });
    a.hp = a.maxHp = 1e9; AI.attach(a, Object.assign({ role: team ? 'enemy' : 'ally', skill: 0.6, rank: 'pawn' }, o || {})); w.actors.push(a); return a;
  };
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, w, p, mk, step, M3, Ent, AI };
}

/* A 护航 */
{
  const W = base(1);
  const ward = W.mk(1, 0, 6000, 0, 1); ward.ai.cmd = 'hold';
  const esc = W.mk(1, 1500, 6000, 500, 1, { ward });
  const sentinel = W.mk(0, 60000, 6000, 60000, 1); sentinel.ai.cmd = 'hold';
  let maxD = 0;
  for (let f = 0; f < 60 * 40; f++) { W.step(1); maxD = Math.max(maxD, W.M3.dist(esc.pos, ward.pos)); }
  chk('A 无威胁：护航机一直留在被护卫者周围', maxD < 9000, 'max=' + maxD.toFixed(0));
  const foe = W.mk(0, 0, 6000, 12000, -1); foe.ai.cmd = 'hold'; foe.pos.z = 7000;       // 敌机逼近被护卫者（< 8 km）
  let intercept = -1;
  for (let f = 0; f < 60 * 8; f++) { W.step(1); if (esc.ai.target === foe && intercept < 0) intercept = f / 60; }
  chk('A 敌机接近被护卫者：护航机转去拦截，且有反应延迟（不是第 0 帧）', intercept > W.AI.$.SKILL.reactT(esc.ai) - 0.2, 'at ' + intercept.toFixed(2) + ' s, reactT ' + W.AI.$.SKILL.reactT(esc.ai).toFixed(2));
  ward.alive = false; W.step(5);
  chk('A 被护卫者没了：不再护航', esc.ai.ward === null);
}
/* B 队形 */
{
  const W = base(2);
  const lead = W.mk(1, 0, 6000, 0, 1); lead.ai.cmd = 'hold'; lead.throttle = 0.8;
  const wings = [1, 2, 3].map(i => W.mk(1, i * 900, 6000, -1200, 1, { fm: { mode: 'wedge', lead, idx: i } }));
  const sentinel = W.mk(0, 60000, 6000, 60000, 1); sentinel.ai.cmd = 'hold';
  W.step(60 * 25);
  const dists = wings.map((w, i) => { const sl = W.AI.$.formationSlot('wedge', i + 1); const wp = W.M3.add(lead.pos, W.M3.add(W.M3.mul(lead.right, sl.dx), W.M3.mul(lead.fwd, sl.dz))); return W.M3.dist(w.pos, wp); });
  chk('B 未交战：僚机收到各自槽位附近（< 1 km）', dists.every(d => d < 1000) && wings.every(w => w.ai.fm), dists.map(d => d.toFixed(0)).join('/'));
  const foe = W.mk(0, 0, 6000, 6000, -1); foe.ai.cmd = 'hold';
  W.step(60 * 4);
  chk('B 目标进入交战范围：整队解散', wings.every(w => w.ai.fm === null));
}
/* C 脱离干扰区 */
{
  const W = base(3);
  const a = W.mk(1, 0, 6000, 0, 1);
  const forceSup = (u, v) => Object.defineProperty(u, 'suppressed', { get: () => v.v, set() {}, configurable: true });
  const supA = { v: 0.8 }; forceSup(a, supA);
  const jam = W.mk(0, 0, 6000, 5000, -1); jam.ai.cmd = 'hold'; Object.defineProperty(jam, 'ewPower', { get: () => 1, set() {}, configurable: true });
  let esc = false;
  for (let f = 0; f < 60 * 12; f++) { W.step(1); if (a.ai.jamAway === jam && a.ai.mode === 'extend') esc = true; }
  chk('C 被压制超过 JAM.T 秒：主动脱离干扰区（extend，朝远离干扰源）', esc);
  const b = W.mk(1, 3000, 6000, 0, 1); const supB = { v: 0.1 }; forceSup(b, supB); let esc2 = false;
  for (let f = 0; f < 60 * 6; f++) { W.step(1); if (b.ai.jamAway) esc2 = true; }
  chk('C 压制很轻：不脱离', !esc2);
}
/* D 呼救 */
{
  const W = base(4);
  const me = W.mk(0, 0, 6000, 0, 1, { rank: 'pawn' });
  const helper = W.mk(0, 6000, 6000, 3000, 1, { rank: 'pawn' }); helper.ai.cmd = 'hold';
  const chaser = W.mk(1, 0, 6000, -1500, 1); chaser.ai.target = me;
  W.S.sandbox.Radio.clear();
  W.step(60 * 2);
  chk('D 被咬尾：helpT 置位', me.ai.helpT > 0 || W.S.sandbox.Radio.log().length > 0);
  me.label = 'ALPHA-1'; W.w.chat = null; me.ai.helpT = 0; chaser.ai.target = me;
  W.step(60 * 2);
  chk('D 播出求援无线电（help 事件）', W.S.sandbox.Radio.log().some(e => e.who === 'ALPHA-1'));
  const aid = W.AI.$.director.pick(helper, W.w, 20000);
  chk('D Director：正在打求援者的敌机被优先选中', aid === chaser);
}

/* E 自由飞行的干扰机 */
{
  const mkJam = (seed, foeZ) => {
    const W = base(seed);
    const leader = W.mk(1, 0, 8000, 0, 1); leader.ai.cmd = 'hold';
    const jam = W.S.sandbox.spawnEnemy(W.w, { ac: 'lodestone', team: 1, x: 12000, y: 8000, z: -9000, fwd: W.M3.V(0, 0, 1), speed: 250, special: 'vsc', skill: 0.5, ward: leader, jam: {}, callsign: 'JAM-1' });
    const foe = W.mk(0, 0, 8000, foeZ, -1); foe.ai.cmd = 'hold'; foe.hp = foe.maxHp = 1e9;
    const pin = (u, z) => { u.pos.x = 0; u.pos.z = z; u.speed = 0; };          // 钉住编队长机与敌人（'hold' 也会往前飞）
    const stepPinned = () => { W.step(1); pin(leader, 0); pin(foe, foeZ); };
    return { W, leader, jam, foe, stepPinned };
  };
  const vsc = mkJam(1, 60000).W.S.sandbox.WEAPONS.vsc;
  const AIs = mkJam(1, 60000).W.AI.$;
  chk('E ESCORT.R < 干扰半径（绕编队盘旋时敌人进得了压制范围）', AIs.ESCORT.R < vsc.jamRadius, AIs.ESCORT.R + ' < ' + vsc.jamRadius);
  const A = mkJam(1, 60000);       // 敌人（玩家一方）在 60 km 外：不该开机
  chk('E spawnEnemy jam：写进 ai.jam，行为默认 recon（不接战）', !!A.jam.ai.jam && A.jam.behavior === 'recon' && A.jam.ai.ward === A.leader);
  let dMin = 1e9, dEnd = 0, opened = false, fired = false;
  for (let f = 0; f < 60 * 70; f++) {
    A.stepPinned();
    dEnd = A.W.M3.dist(A.jam.pos, A.leader.pos); dMin = Math.min(dMin, dEnd);
    if (A.jam.spActive > 0 || A.jam.ewPower > 0) opened = true;
    if (A.jam.firingGun) fired = true;
  }
  chk('E 从远处靠近己方编队并留在它周围', dMin < A.W.AI.$.ESCORT.R * 1.5 && dEnd < 9000, 'min=' + dMin.toFixed(0) + ' end=' + dEnd.toFixed(0));
  chk('E 敌人在范围外：吊舱不开', !opened);
  chk('E 不开火（recon 构型）', !fired);
  const B = mkJam(1, 7000);        // 敌人在编队前方 7 km：进了干扰半径
  let openAt = -1, sup = 0;
  for (let f = 0; f < 60 * 60; f++) { B.stepPinned(); sup = Math.max(sup, B.foe.suppressed || 0); if (openAt < 0 && (B.jam.spActive > 0 || B.jam.ewPower > 0)) openAt = f / 60; }
  chk('E 敌人进入干扰半径：自动开吊舱', openAt >= 0, 'at ' + openAt.toFixed(1) + ' s');
  chk('E 干扰机没有去追击敌人（目标不是敌机 / 仍在编队旁）', B.W.M3.dist(B.jam.pos, B.leader.pos) < 9000);
  chk('E 敌人被压制（suppressed > 0）', sup > 0, 'sup=' + sup.toFixed(2));
}

/* F 无人僚机不得自己脱离编队（被压制 / 低血量都只留在槽位） */
{
  const W = base(5);
  const forceSup = (u, v) => Object.defineProperty(u, 'suppressed', { get: () => v, set() {}, configurable: true });
  const d = W.mk(0, 0, 6000, 0, 1, { role: 'drone', formation: { dx: 200, dy: 0, dz: -200 } });
  forceSup(d, 0.8); d.hp = d.maxHp * 0.1;
  const jam = W.mk(1, 0, 6000, 5000, -1); jam.ai.cmd = 'hold'; Object.defineProperty(jam, 'ewPower', { get: () => 1, set() {}, configurable: true });
  let extended = false;
  for (let f = 0; f < 60 * 40; f++) { W.step(1); d.hp = d.maxHp * 0.1; if (d.ai.mode === 'extend') extended = true; }
  chk('F 无人僚机被压制 / 低血量：不进 extend、不飞离', !extended);
}

process.exit(ok ? 0 : 1);
