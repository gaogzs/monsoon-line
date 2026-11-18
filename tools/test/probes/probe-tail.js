#!/usr/bin/env node
/* ============================================================
   咬尾攻防与边界缓冲探针（v3.6.3）

   A. 摆脱咬尾：skill 单调（shakeTail 0 → 1）；高技能被咬住超过反应延迟后登记急转并摆脱；skill ≤ 0.3 不会
   B. 保持咬尾：holdTail 单调；高技能咬着转弯的目标时平均距离 < 低技能，并按对手速度调油门（不冲过头）
   C. 战区边界缓冲：朝外追击的 NPC 在警告区外沿就被拉回，不会把战斗带出界
   D. 脱离干扰区：压制一松就结束 extend，且有冷却
   用法：node tools/test/probes/probe-tail.js
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
  p.pos.x += 120000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const mk = (team, x, y, z, fz, o) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x, y, z, fwd: M3.V(0, 0, fz || 1), speed: 260, special: 'dl6' });
    a.hp = a.maxHp = 1e9; AI.attach(a, Object.assign({ role: team ? 'enemy' : 'ally', skill: 0.6, rank: 'pawn' }, o || {})); w.actors.push(a); return a;
  };
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, w, p, mk, step, M3, Ent, AI };
}

/* A 摆脱咬尾 */
{
  const AIs = base(1).AI.$;
  const ks = [0.2, 0.3, 0.5, 0.7, 0.9, 1].map(sk => AIs.SKILL.shakeTail({ skill: sk }));
  chk('A shakeTail 随 skill 单调不减、≤0.3 为 0、≥0.9 为 1', ks.every((v, i) => i === 0 || v >= ks[i - 1]) && ks[0] === 0 && ks[1] === 0 && ks[4] === 1, ks.map(v => v.toFixed(2)).join(' '));
  const run = skill => {
    const W = base(2);
    const me = W.mk(0, 0, 6000, 0, 1, { skill, rank: skill > 0.8 ? 'elite' : 'pawn' }); me.ai.cmd = 'hold';
    const foe = W.mk(1, 0, 6000, -1400, 1, { skill: 0.5 });
    foe.ai.cmd = 'hold'; foe.ai.target = me; foe.ai.retargetT = 99;
    let minCos = 1;
    for (let f = 0; f < 60 * 8; f++) {
      W.step(1); foe.ai.target = me; foe.ai.retargetT = 99;
      minCos = Math.min(minCos, W.M3.dot(me.fwd, W.M3.V(0, 0, 1)));
    }
    return { me, breaks: me.ai.tailBreaks || 0, heading: minCos };
  };
  const hi = run(0.9), lo = run(0.2);
  chk('A 高技能：被咬住后登记摆脱机动', hi.breaks > 0, 'breaks=' + hi.breaks);
  chk('A 低技能（0.2）：不会摆脱', lo.breaks === 0, 'breaks=' + lo.breaks);
  chk('A 摆脱后机头明显偏离原航向', hi.heading < 0.9, 'min cos=' + hi.heading.toFixed(2));
}

/* B 保持咬尾 */
{
  const AIs = base(1).AI.$;
  const ks = [0.3, 0.35, 0.5, 0.7, 0.9, 1].map(sk => AIs.SKILL.holdTail({ skill: sk }));
  chk('B holdTail 随 skill 单调不减、≤0.35 为 0、≥0.9 为 1', ks.every((v, i) => i === 0 || v >= ks[i - 1]) && ks[0] === 0 && ks[1] === 0 && ks[4] === 1, ks.map(v => v.toFixed(2)).join(' '));
  const W = base(3), M3 = W.M3;
  const tgt = W.mk(0, 0, 6000, 1500, 1, { skill: 0.5 }); tgt.speed = 250;
  const me = W.mk(1, 0, 6000, 0, 1, { skill: 0.9, rank: 'elite' }); me.speed = 320;
  me.ai.target = tgt;
  const res = { dir: M3.V(0, 0, 1), throttle: 1, ab: true };
  const desired = M3.norm(M3.V(0.3, 0, 1));
  const h = W.AI.$.holdTail(me, me.ai, desired, 800, res);
  chk('B 咬着同向目标：返回混入提前量的方向，油门按对手速度收小（320 → 250 m/s 不冲过头）', !!h && h.throttle < 0.95 && M3.dot(h.dir, desired) > 0.9 && M3.dot(h.dir, desired) < 1, h && ('thr=' + h.throttle.toFixed(2)));
  me.ai.skill = 0.3;
  chk('B skill ≤ 0.35：不启用', W.AI.$.holdTail(me, me.ai, desired, 1500, res) === null);
  me.ai.skill = 0.9;
  chk('B 距离超过 HOLD_R：不启用', W.AI.$.holdTail(me, me.ai, desired, 4000, res) === null);
  tgt.fwd = M3.V(0, 0, -1);
  chk('B 迎头（对手反向）：不启用', W.AI.$.holdTail(me, me.ai, desired, 1500, res) === null);
}

/* C 边界缓冲 */
{
  const run = skill => {
    const W = base(4);
    W.w.arenaDef = { cx: 0, cz: 0, half: 30000, warn: 6000 };
    W.p.pos.x = 0; W.p.pos.z = -20000;                                   // 玩家留在界内，免得越界逻辑干扰
    const tgt = W.mk(0, 0, 6000, 22000, 1, { skill: 0.5 }); tgt.ai.cmd = 'hold';   // 靠近 +z 边界（界 30 km，警告区 24 km 起）
    const me = W.mk(1, 0, 6000, 12000, 1, { skill });
    let minEdge = 1e9;
    for (let f = 0; f < 60 * 40; f++) {
      tgt.pos.z = Math.max(tgt.pos.z, 26000); tgt.pos.x = 0; tgt.speed = 0;      // 目标钉在警告区里，诱 NPC 往外追
      W.step(1);
      minEdge = Math.min(minEdge, W.w.arenaDef.half - Math.max(Math.abs(me.pos.x), Math.abs(me.pos.z)));
    }
    return minEdge;
  };
  const e = run(0.6);
  chk('C 追着警告区里的目标：NPC 不越界', e > 0, 'min edge=' + e.toFixed(0));
}

/* D 脱离干扰区：压制一松就结束 + 冷却 */
{
  const W = base(5);
  const a = W.mk(1, 0, 6000, 0, 1);
  let sup = 0.8;
  Object.defineProperty(a, 'suppressed', { get: () => sup, set() {}, configurable: true });
  const jam = W.mk(0, 0, 6000, 5000, -1); jam.ai.cmd = 'hold'; Object.defineProperty(jam, 'ewPower', { get: () => 1, set() {}, configurable: true });
  let started = -1;
  for (let f = 0; f < 60 * 8 && started < 0; f++) { W.step(1); if (a.ai.mode === 'extend' && a.ai.jamAway) started = f / 60; }
  chk('D 被压制超过 JAM.T：进入 extend', started >= 0, 'at ' + started.toFixed(1));
  sup = 0;
  W.step(30);
  chk('D 压制一松：extend 立即结束（不飞满 5 s）', a.ai.mode !== 'extend' && a.ai.modeT <= 0);
  sup = 0.8;
  let again = false;
  for (let f = 0; f < 60 * 4; f++) { W.step(1); if (a.ai.mode === 'extend' && a.ai.jamAway) again = true; }
  chk('D 冷却期内再被压制：不立刻再次脱离', !again);
}

process.exit(ok ? 0 : 1);
