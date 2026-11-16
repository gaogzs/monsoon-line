#!/usr/bin/env node
/* ============================================================
   反应延迟与机炮瞄准偏移探针（docs/POST2-0IMPL.md 5.7「反应延迟与机炮偏移」）

   A. 反应延迟：同一个"已经咬住目标"的场景，机炮首次开火的时刻 ≥ reactT(skill)，
      且随技能单调不增（rookie 最慢，ace 最快）。
   B. 偏移散布：OU 漂移的稳态标准差 ≈ σ = AIM_JITTER × (1 − skill)，随技能单调不增。
   C. 命中率：同一场景、同机型、不同技能，机炮伤害 ace > rookie，且 rookie > 0
      （低技能不是"永远打偏"）。
   用法：node tools/test/probes/probe-aim.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const SKILLS = [0.35, 0.55, 0.72, 0.9];

/* ---------- B. 偏移散布（不用场景） ---------- */
{
  const S = Sim.load({ seed: 1 });
  const $ = S.sandbox.AI.$;
  const sd = [];
  for (const sk of SKILLS) {
    const s = { skill: sk, rs: 987654321, aim: { x: 0, y: 0 } };
    let n = 0, sum2 = 0;
    for (let i = 0; i < 60 * 3000; i++) {
      $.aimStep(s, 1 / 60, true);
      if (i > 600) { sum2 += s.aim.x * s.aim.x; n++; }
    }
    const got = Math.sqrt(sum2 / n), want = $.SKILL.aimSigma({ skill: sk });
    sd.push(got);
    chk('稳态标准差 skill=' + sk, Math.abs(got - want) / want < 0.2, 'got=' + got.toFixed(4) + ' want=' + want.toFixed(4));
  }
  chk('散布随技能单调不增', sd.every((v, i) => i === 0 || v <= sd[i - 1] + 1e-9), sd.map(v => v.toFixed(4)).join(' > '));
  const s2 = { skill: 0.5, rs: 5, aim: { x: 0.5, y: 0.5 } };
  for (let i = 0; i < 600; i++) $.aimStep(s2, 1 / 60, false);
  chk('没有目标时偏移衰减回 0', Math.abs(s2.aim.x) < 1e-3 && Math.abs(s2.aim.y) < 1e-3);
  const r = SKILLS.map(k => $.SKILL.reactT({ skill: k }));
  chk('reactT 随技能单调递减（rookie≈1.1 … ace≈0.3）', r.every((v, i) => i === 0 || v < r[i - 1]), r.map(v => v.toFixed(2)).join(' > '));
}

/* ---------- A/C. 场景：射手咬住一架直飞目标 ---------- */
function scenario(skill, seed, secs) {
  const S = Sim.load({ seed });
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  w.targets.length = 0;
  p.pos.x += 90000;
  const mk = (team, z) => Ent.makeAircraft({ type: 'albatross', team, x: 0, y: 3000, z, fwd: M3.V(0, 0, 1), speed: 250, special: null });
  const tg = mk(0, 900); tg.hp = tg.maxHp = 1e9;
  const sh = mk(1, 0);
  AI.attach(sh, { role: 'enemy', skill, rank: 'pawn' });
  w.actors.push(tg, sh);
  let first = -1;
  for (let f = 0; f < 60 * secs; f++) {
    tg.throttle = 0.8;
    S.step(1 / 60);
    if (first < 0 && sh.firingGun) first = f / 60;
    p.alive = true; p.hp = p.maxHp;
  }
  return { first, dmg: tg.maxHp - tg.hp };
}

{
  const firsts = [];
  const $ = Sim.load({ seed: 1 }).sandbox.AI.$;
  for (const sk of SKILLS) {
    const rs = scenario(sk, 3, 8);
    const want = $.SKILL.reactT({ skill: sk });
    firsts.push(rs.first);
    chk('机炮首次开火 ≥ reactT  skill=' + sk, rs.first >= want - 0.03, 'first=' + rs.first.toFixed(2) + ' reactT=' + want.toFixed(2));
  }
  chk('首次开火时刻随技能单调不增', firsts.every((v, i) => i === 0 || v <= firsts[i - 1] + 0.05), firsts.map(v => v.toFixed(2)).join(' > '));
}

{
  const tot = {};
  for (const sk of [0.35, 0.9]) {
    let d = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) d += scenario(sk, seed, 20).dmg;
    tot[sk] = d;
  }
  chk('ace 的机炮伤害显著高于 rookie', tot[0.9] > tot[0.35] * 1.3, 'ace=' + tot[0.9].toFixed(0) + ' rookie=' + tot[0.35].toFixed(0));
  chk('rookie 的命中 > 0（不是永远打偏）', tot[0.35] > 0, 'rookie=' + tot[0.35].toFixed(0));
}

process.exit(ok ? 0 : 1);
