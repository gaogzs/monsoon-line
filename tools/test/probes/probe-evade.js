#!/usr/bin/env node
/* ============================================================
   甩脱来袭导弹的多策略探针（v3.6.4，js/engine/ai/evade.js）

   A. 门限：skill < 0.4 返回 null（回退基线）；各策略的前置条件（breakIn 只在末段、splitS 要高度、run 要弹在身后…）
   B. 选择：半主动弹走 beamOwner；红外弹偏 climb；光电弹偏 corkscrew；性格 evW 偏移；分布里不止一种策略
   C. 执行：plan 保持 PLAN_T 内不换、换弹重选；jink 会换侧；corkscrew 方向随相位转动
   D. 光电 / 激光弹：flareUseless（技能够才不白放）
   E. 动态：同一枚弹打过去，高技能 AI 的存活率高于低技能（统计、有宽裕）
   用法：node tools/test/probes/probe-evade.js
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
  const { M3, Ent, AI, WEAPONS } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const mk = (team, x, y, z, fz, o) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x, y, z, fwd: M3.V(0, 0, fz || 1), speed: 260, special: 'dl6' });
    AI.attach(a, Object.assign({ role: team ? 'enemy' : 'ally', skill: 0.6, rank: 'pawn' }, o || {})); a.ai.temperament = 'steady'; w.actors.push(a); return a;
  };
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  return { S, w, p, mk, step, M3, Ent, AI, WEAPONS, $: AI.$ };
}

/* 造一枚假来袭弹（只给 evadeStrat 读的字段） */
function fakeMsl(W, wid, from, over) {
  const m = Object.assign({ pos: from, vel: W.M3.V(0, 0, 0), fwd: W.M3.V(0, 0, 1), speed: 900, w: W.WEAPONS[wid], owner: null, alive: true, team: 0 }, over || {});
  return m;
}

/* A / B / C / D：单元调用 */
{
  const W = base(1);
  const $ = W.$, M = W.M3;
  const v = W.mk(1, 0, 6000, 0, 1, { skill: 0.9, rank: 'ace' });
  v.vel = M.mul(v.fwd, v.speed);
  const mAt = (d, wid, dir) => { const pos = M.add(v.pos, M.mul(dir || M.V(0, 0, 1), d)); const m = fakeMsl(W, wid, pos, { vel: M.mul(M.norm(M.sub(v.pos, pos)), 900), fwd: M.norm(M.sub(v.pos, pos)) }); return m; };
  const lo = W.mk(1, 0, 6000, 0, 1, { skill: 0.3 });
  chk('A skill < 0.4：返回 null（回退基线）', $.evadeStrat(lo, lo.ai, mAt(2000, 'dl6'), W.w, 1 / 60) === null);
  const plansOf = (a, m, n, mut) => {
    const set = {};
    for (let i = 0; i < n; i++) { a.ai.evT = 0; a.ai.evFor = null; a.ai.evPlan = null; if (mut) mut(a); a.ai.rs = (a.ai.rs * 1664525 + 1013904223 + i * 7919) >>> 0; const r = $.evadeStrat(a, a.ai, m, W.w, 1 / 60); set[r.plan] = (set[r.plan] || 0) + 1; }
    return set;
  };
  const far = plansOf(v, mAt(3000, 'dl6'), 60);
  chk('B 远距红外弹：不出 breakIn / splitS（末段 / 近距才有）', !far.breakIn && !far.splitS, JSON.stringify(far));
  chk('B 红外弹：以 climb 为主（不开加力，配合诱饵最稳）', (far.climb || 0) > 10, JSON.stringify(far));
  chk('B 策略有多样性（≥ 3 种）', Object.keys(far).length >= 3, JSON.stringify(far));
  const term = plansOf(v, mAt(1000, 'dl4'), 60);
  chk('B 末段（< 1.5 km）：breakIn 入选，且 jink 不入选', (term.breakIn || 0) > 8 && !term.jink, JSON.stringify(term));
  const sarhM = mAt(2500, 'dl4'); sarhM.w = Object.assign({}, sarhM.w, { tags: { sarh: true } }); sarhM.owner = W.mk(0, 0, 6000, 5000, -1);
  const sr = plansOf(v, sarhM, 60);
  chk('B 半主动弹：beamOwner 为主', (sr.beamOwner || 0) > 20, JSON.stringify(sr));
  const eoM = mAt(2400, 'dl6'); eoM.w = Object.assign({}, eoM.w, { seeker: 'eo' });
  const eo = plansOf(v, eoM, 60);
  chk('B 光电弹：corkscrew 入选', (eo.corkscrew || 0) > 8, JSON.stringify(eo));
  const slowB = mAt(3200, 'dl4', M.V(0, 0, -1)); slowB.speed = 340;
  const behind = plansOf(v, slowB, 60);
  chk('B 弹在身后：run 入选；弹在前方 run 不入选', (behind.run || 0) > 5 && !far.run, JSON.stringify(behind));
  const low = plansOf(v, mAt(1800, 'dl4'), 60, a => { a.pos.y = 1500; }); v.pos.y = 6000;
  chk('B 离地 < 3.5 km：splitS 不入选；高处入选', !low.splitS && (plansOf(v, mAt(1800, 'dl4'), 60).splitS || 0) > 0, JSON.stringify(low));
  const caut = W.mk(1, 0, 6000, 0, 1, { skill: 0.9, rank: 'ace' }); caut.ai.temperament = 'cautious'; caut.vel = M.mul(caut.fwd, caut.speed);
  const agg = W.mk(1, 0, 6000, 0, 1, { skill: 0.9, rank: 'ace' }); agg.ai.temperament = 'aggressive'; agg.vel = M.mul(agg.fwd, agg.speed);
  const cb = plansOf(caut, slowB, 80), ab = plansOf(agg, slowB, 80);
  chk('B 性格：谨慎更爱 run，激进更少', (cb.run || 0) > (ab.run || 0), 'cautious=' + (cb.run || 0) + ' aggressive=' + (ab.run || 0));

  // C 执行
  const m1 = mAt(3000, 'dl6');
  v.ai.evT = 0; v.ai.evFor = null; v.ai.evPlan = null;
  const r0 = $.evadeStrat(v, v.ai, m1, W.w, 1 / 60); const p0 = r0.plan;
  let same = true; for (let i = 0; i < 30; i++) if ($.evadeStrat(v, v.ai, m1, W.w, 1 / 60).plan !== p0) same = false;
  chk('C 策略在 PLAN_T 内保持不换', same, p0);
  const m2 = mAt(3000, 'dl6'); $.evadeStrat(v, v.ai, m2, W.w, 1 / 60);
  chk('C 换一枚来袭弹立即重选（evFor 指向新弹）', v.ai.evFor === m2);
  v.ai.evPlan = 'jink'; v.ai.evT = 99; v.ai.evFor = m1; v.ai.evTerm = false; v.ai.evFlip = 0.1; v.ai.evSide = 1;
  let flips = 0, last = v.ai.evSide; for (let i = 0; i < 120; i++) { $.evadeStrat(v, v.ai, m1, W.w, 1 / 60); if (v.ai.evSide !== last) { flips++; last = v.ai.evSide; } }
  chk('C jink：2 s 内多次换侧', flips >= 2, 'flips=' + flips);
  v.ai.evPlan = 'corkscrew'; v.ai.evT = 99; v.ai.evPhase = 0; v.ai.evSide = 1;
  const d1 = $.evadeStrat(v, v.ai, m1, W.w, 1 / 60).dir; for (let i = 0; i < 40; i++) $.evadeStrat(v, v.ai, m1, W.w, 1 / 60);
  const d2 = $.evadeStrat(v, v.ai, m1, W.w, 1 / 60).dir;
  chk('C corkscrew：方向随相位转动', M.dist(d1, d2) > 0.3, M.dist(d1, d2).toFixed(2));
  chk('C 每个策略都返回单位方向', ['beam', 'climb', 'dive', 'jink', 'run', 'corkscrew', 'breakIn', 'splitS', 'beamOwner'].every(pl => { v.ai.evPlan = pl; v.ai.evT = 99; v.ai.evFor = m1; v.ai.evTerm = false; const d = $.evadeStrat(v, v.ai, m1, W.w, 1 / 60).dir; return Math.abs(M.len(d) - 1) < 1e-6; }));

  // D 光电弹
  chk('D 光电弹：高技能不白放诱饵；红外弹照放；低技能照放', $.flareUseless(v.ai, eoM) === true && $.flareUseless(v.ai, mAt(2000, 'dl6')) === false && $.flareUseless(lo.ai, eoM) === false);
}

/* E 动态：同一枚红外 / 雷达弹，高技能存活率更高 */
{
  const trial = (seed, skill, wid, rk) => {
    const W = base(seed);
    const sh = W.mk(0, 0, 6000, 0, 1, { skill: 0.5 }); sh.ai.cmd = 'hold'; sh.ai.retargetT = 1e9;
    const vt = W.mk(1, 0, 6000, 3200, 1, { skill: skill, rank: rk }); vt.hp = vt.maxHp = 100; vt.ai.cmd = 'hold';
    sh.target = vt; sh.ai.target = vt;
    W.Ent.setWeapon(sh, wid); sh.spAmmo = 4;
    W.w.fireMissile(sh, vt);
    for (let i = 0; i < 60 * 14; i++) { W.step(1); sh.pos.z = 0; sh.pos.y = 6000; if (!vt.alive) return 0; }
    return vt.hp >= vt.maxHp * 0.99 ? 1 : 0.5;
  };
  const N = 10;
  for (const wid of ['dl6', 'dl4']) {
    let hi = 0, lo = 0;
    for (let i = 0; i < N; i++) { hi += trial(100 + i, 0.9, wid, 'ace'); lo += trial(100 + i, 0.3, wid, 'pawn'); }
    chk('E ' + wid + '：高技能（0.9）存活 ≥ 低技能（0.3）', hi >= lo, 'hi=' + hi + '/' + N + ' lo=' + lo + '/' + N);
  }
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
