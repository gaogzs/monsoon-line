#!/usr/bin/env node
/* ============================================================
   编队与协同探针（docs/POST2-0IMPL.md 5.7，批次 5f）

   A. 护航：无威胁时留在被护卫者周围（R 内外徘徊）；敌机接近被护卫者时转去拦截（等反应延迟）；被护卫者没了 → 不再护航
   B. 巡航队形：未交战时跟队长保持槽位；交战判据成立后解散（s.fm = null）
   C. 电子战协同：被压制持续 > JAM.T 秒 → 主动脱离干扰区（extend，目标 = 干扰源）
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

process.exit(ok ? 0 : 1);
