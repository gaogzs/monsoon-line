#!/usr/bin/env node
/* ============================================================
   个体模型探针（docs/POST2-0IMPL.md 5.7「个体模型」，批次 5f）

   A. 性格：aggressive 开火意愿高 / 不玩外围游走；cautious、sniper 更早玩外围游走；撤离概率 aggressive < 中性 < cautious
   B. 人为失误：晚发现来袭弹 / 丢目标后多花一阵——低技能有延迟、随技能单调不增、skill ≥ 0.7 为 0
   C. 过载：有人机持续高 G 超过 G_SUSTAIN → 视野变窄（blackT > 0）；无人机无此限制；低 G 不触发
   D. loyal 性格：离被护卫者超过 leash 时被拉回
   用法：node tools/test/probes/probe-individual.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const S = Sim.load({ seed: 1 });
const { M3, Ent, AI } = S.sandbox;
const $ = AI.$;
const mk = (o) => {
  const a = Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: M3.V(0, 0, 1), speed: 250, special: null });
  AI.attach(a, Object.assign({ role: 'enemy', skill: 0.7, rank: 'elite' }, o || {}));
  return a;
};

/* A */
{
  const n = mk(), ag = mk({ temperament: 'aggressive' }), ca = mk({ temperament: 'cautious', skill: 0.6 }), sn = mk({ temperament: 'sniper', skill: 0.55 });
  chk('A aggressive 开火意愿 > 中性', $.SKILL.fireWill(ag.ai) > $.SKILL.fireWill(n.ai));
  chk('A aggressive 不玩外围游走（贴近狗斗）', $.SKILL.standoff(n.ai) === true && $.SKILL.standoff(ag.ai) === false);
  chk('A cautious（skill 0.6）与 sniper（skill 0.55）更早玩外围游走', $.SKILL.standoff(ca.ai) === true && $.SKILL.standoff(sn.ai) === true && $.SKILL.standoff(mk({ skill: 0.6 }).ai) === false);
  const pr = x => { x.hp = 20; return $.retreatProb(x, x.ai); };
  const pa = pr(mk({ temperament: 'aggressive', rank: 'pawn', skill: 0.55 })), pn = pr(mk({ rank: 'pawn', skill: 0.55 })), pc = pr(mk({ temperament: 'cautious', rank: 'pawn', skill: 0.55 }));
  chk('A 撤离概率 aggressive < 中性 < cautious', pa < pn && pn < pc, [pa, pn, pc].map(v => v.toFixed(2)).join(' < '));
}

/* B */
{
  const mean = (fn, sk) => { const a = mk({ skill: sk }); let t = 0; for (let i = 0; i < 400; i++) t += fn(a.ai); return t / 400; };
  const m = [0.3, 0.45, 0.6].map(sk => mean($.SKILL.misjudgeT, sk));
  chk('B 晚发现来袭弹的延迟随技能单调不增', m[0] > m[1] && m[1] > m[2] && m[2] > 0, m.map(v => v.toFixed(2)).join(' > '));
  chk('B skill ≥ 0.7：没有失误延迟', mean($.SKILL.misjudgeT, 0.75) === 0 && mean($.SKILL.lostExtra, 0.9) === 0);
  const l = [0.3, 0.6].map(sk => mean($.SKILL.lostExtra, sk));
  chk('B 丢目标后多花的时间随技能单调不增', l[0] > l[1] && l[1] > 0, l.map(v => v.toFixed(2)).join(' > '));
}

/* C */
{
  const run = (tags, gLoad) => {
    const a = mk(); if (tags) a.tags = Object.assign({}, a.tags, tags);
    const v = 250, om = (gLoad - 1) * 9.81 / v, dt = 1 / 60;
    let yaw = 0, maxBlack = 0;
    for (let i = 0; i < 60 * 12; i++) {
      yaw += om * dt; a.vel = M3.V(Math.sin(yaw) * v, 0, Math.cos(yaw) * v); a.speed = v;
      $.gTrack(a, a.ai, dt); maxBlack = Math.max(maxBlack, a.ai.blackT);
    }
    return maxBlack;
  };
  chk('C 有人机持续 8 g：超过 G_SUSTAIN 后视野变窄', run(null, 8) > 0);
  chk('C 无人机无此限制', run({ unmanned: true }, 8) === 0);
  chk('C 低 G（3 g）不触发', run(null, 3) === 0);
}

/* D */
{
  const run = temper => {
    const S2 = Sim.load({ seed: 3 });
    const { M3: M, Ent: E, AI: A } = S2.sandbox;
    S2.start(0);
    const G = S2.sandbox.Game, w = G.__world(), p = G.__player();
    for (const x of w.actors) if (x !== p) x.alive = false;
    w.actors = w.actors.filter(x => x === p); w.targets.length = 0; p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
    const ward = E.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: M.V(0, 0, -1), speed: 200, special: null }); ward.hp = ward.maxHp = 1e9;
    A.attach(ward, { role: 'enemy', skill: 0.5 }); ward.ai.cmd = 'hold';
    const foe = E.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 6000, z: 14000, fwd: M.V(0, 0, 1), speed: 200, special: null }); foe.hp = foe.maxHp = 1e9;
    A.attach(foe, { role: 'ally', skill: 0.3 }); foe.ai.cmd = 'hold';
    const esc = E.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 3000, fwd: M.V(0, 0, 1), speed: 250, special: 'dl6' }); esc.hp = esc.maxHp = 1e9;
    A.attach(esc, { role: 'enemy', skill: 0.6, rank: 'pawn', temperament: temper, leader: ward });
    w.actors.push(ward, foe, esc);
    let maxD = 0;
    for (let f = 0; f < 60 * 50; f++) { S2.step(1 / 60); p.alive = true; p.hp = p.maxHp; maxD = Math.max(maxD, M.dist(esc.pos, ward.pos)); }
    return maxD;
  };
  const loyal = run('loyal'), free = run(null);
  chk('D loyal：比不带性格的护航机离被护卫者近得多（leash 起作用）', loyal < free - 2500, 'loyal=' + loyal.toFixed(0) + ' free=' + free.toFixed(0));
}

process.exit(ok ? 0 : 1);
