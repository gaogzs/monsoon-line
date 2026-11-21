#!/usr/bin/env node
/* ============================================================
   AI 战术探针（docs/POST2-0IMPL.md 5.7，批次 5d）

   A. 按来袭弹类型选防御：红外 → 爬升 + 不开加力；半主动 → 相对发射机 3/9 线；
      其余雷达 → 照旧（俯冲）；低技能（< 0.6）不论什么弹都是统一的"3/9 + 俯冲"
   B. 能量管理 / 加力策略：elite 以上按角点速度开加力；红外威胁时不开；低技能保持原行为
   C. 诱饵与侧击：同一目标被 ≥ 2 架 skill ≥ 0.6 的敌机盯着 → 一 bait 其余 flank；低技能 / 单机不分配
   D. 加力占比：同场景下 elite 的加力时间占比低于 pawn
   用法：node tools/test/probes/probe-tactics.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const S = Sim.load({ seed: 1 });
const { M3, Ent, AI, WEAPONS } = S.sandbox;
const $ = AI.$;

const mkAc = (skill, team) => {
  const a = Ent.makeAircraft({ type: 'albatross', team: team === undefined ? 0 : team, x: 0, y: 4000, z: 0, fwd: M3.V(0, 0, 1), speed: 260, special: null });
  AI.attach(a, { role: 'enemy', skill, rank: skill >= 0.72 ? 'elite' : 'pawn' });
  return a;
};
/* 手造的导弹要带上 fwd / vel / speed（朝飞机 (0, 4000, 0) 飞）：v3.6.4 的多策略躲避（evade.js）读它们算相对速度和接近率，
   真实导弹一定有这些字段；以前这里只有 pos / w / owner / alive，evadeStrat 在 M3.mul(undefined) 上直接崩溃 */
const msl = (wid, z, owner) => {
  const pos = M3.V(0, 4000, z), fwd = M3.norm(M3.sub(M3.V(0, 4000, 0), pos));
  return { pos, w: WEAPONS[wid], owner: owner || null, alive: true, fwd, speed: 800, vel: M3.mul(fwd, 800) };
};

/* ---------- A ---------- */
/* v3.6.4 起 skill ≥ 0.4 的躲避是多策略：每枚来袭弹按（导引头类型 × 距离 × 态势 × 技能）加权随机选一种（私有 LCG）。
   所以不再断言"红外弹必然爬升"，而是逐个种子看"选到什么就得做到什么"（选择的分布在 probe-evade.js 里测）。
   低技能（< MIN_SKILL 0.4）仍回退到旧基线：3/9 线 + 俯冲。 */
{
  const owner = { alive: true, pos: M3.V(6000, 4000, 0) };       // 发射机在正右方 6 km
  const N = 40, irPlans = {}, sarhPlans = {};
  let climbOk = true, climbN = 0, beamOwnerOk = true, beamOwnerN = 0, finite = true;
  for (let i = 0; i < N; i++) {
    const rs = (Math.imul(i + 1, 2654435761) >>> 0) || 1;
    const hi = mkAc(0.8); hi.ai.rs = rs;
    const ir = $.evade(hi, msl('srm', -2000), null);
    const pl = hi.ai.evPlan; irPlans[pl] = (irPlans[pl] || 0) + 1;
    if (pl === 'climb') { climbN++; if (!(ir.dir.y > 0.3 && ir.ab === false)) climbOk = false; }
    const hs = mkAc(0.8); hs.ai.rs = rs;
    const sarh = $.evade(hs, msl('tether', -2000, owner), null);
    const pl2 = hs.ai.evPlan; sarhPlans[pl2] = (sarhPlans[pl2] || 0) + 1;
    if (pl2 === 'beamOwner') {
      beamOwnerN++;
      const toO = M3.norm(M3.sub(owner.pos, hs.pos));
      const dirH = M3.norm(M3.V(sarh.dir.x, 0, sarh.dir.z));
      if (!(Math.abs(M3.dot(dirH, M3.norm(M3.V(toO.x, 0, toO.z)))) < 0.45)) beamOwnerOk = false;
    }
    const hm = mkAc(0.8); hm.ai.rs = rs;
    const radar = $.evade(hm, msl('mrm', -2000), null);
    if (![radar.dir.x, radar.dir.y, radar.dir.z, radar.throttle].every(Number.isFinite)) finite = false;
  }
  chk('A 红外弹（skill 0.8）：选到 climb 时必须爬升且不开加力（出现 ≥ 1 次，且不止一种策略）', climbOk && climbN >= 1 && Object.keys(irPlans).length > 1, 'climb×' + climbN + ' 分布=' + JSON.stringify(irPlans));
  chk('A 半主动弹：选到 beamOwner 时机头垂直于"自己 → 发射机"的视线（3/9 线），且出现 ≥ 1 次', beamOwnerOk && beamOwnerN >= 1, 'beamOwner×' + beamOwnerN + ' 分布=' + JSON.stringify(sarhPlans));
  chk('A 主动雷达弹：每种策略都给出有限的方向与油门', finite);
  const lo = mkAc(0.3);                                            // < MIN_SKILL：回退旧基线
  const irLo = $.evade(lo, msl('srm', -2000), null);
  chk('A 低技能（< 0.4）：红外弹也是统一的 3/9 + 俯冲（不爬升、不走多策略）', irLo.dir.y < 0 && !lo.ai.evPlan, 'y=' + irLo.dir.y.toFixed(2) + ' plan=' + lo.ai.evPlan);
}

/* ---------- B ---------- */
{
  const w = { missiles: [] };
  const el = mkAc(0.85), pw = mkAc(0.55);
  const corner = $.cornerSpeed(el);
  const res = { ab: true };
  el.speed = corner * 1.3; chk('B 收敛：elite 速度够快就不开加力', $.abPolicy(el, el.ai, res, 6000, w) === false);
  el.speed = corner * 1.0; chk('B 收敛：速度低于角点 × 1.15 开加力', $.abPolicy(el, el.ai, res, 6000, w) === true);
  el.speed = corner * 1.0; chk('B 狗斗：速度不低于角点 × 0.9 不开加力', $.abPolicy(el, el.ai, res, 1500, w) === false);
  el.speed = corner * 0.8; chk('B 狗斗：速度低于角点 × 0.9 开加力', $.abPolicy(el, el.ai, res, 1500, w) === true);
  el.speed = corner * 0.8;
  const wi = { missiles: [{ alive: true, target: el, w: WEAPONS.srm, pos: M3.V(0, 4000, 3000) }] };
  chk('B 红外威胁（< 6 km）：不开加力', $.abPolicy(el, el.ai, res, 6000, wi) === false);
  pw.speed = 250; chk('B 低技能保持 pursue 的原值', $.abPolicy(pw, pw.ai, { ab: true }, 6000, w) === true && $.abPolicy(pw, pw.ai, { ab: false }, 6000, w) === false);
  const eY = mkAc(0.85); eY.speed = $.cornerSpeed(eY) * 0.6;
  const dY = $.yoyo(eY, eY.ai, M3.norm(M3.V(0, 0.3, 1)), 1200);
  chk('B yo-yo：缠斗中速度太低，压机头', dY.y < -0.1, 'y=' + dY.y.toFixed(2));
  // 上升 yo-yo：太快且转不进去 → 抬高期望方向；够慢 / 对得准 / 太低 / 低技能则不抬
  const eU = mkAc(0.85); eU.speed = $.cornerSpeed(eU) * 1.4; eU.pos.y = 3000;
  const sideDir = M3.norm(M3.V(1, 0, 0.3));
  chk('B 上升 yo-yo：太快且转不进去，抬高方向', $.yoyo(eU, eU.ai, sideDir, 900).y > 0.4);
  chk('B 上升 yo-yo：目标在机头附近不抬', $.yoyo(eU, eU.ai, eU.fwd, 900).y < 0.2);
  eU.speed = $.cornerSpeed(eU) * 1.1;
  chk('B 上升 yo-yo：速度不高不抬', $.yoyo(eU, eU.ai, sideDir, 900).y < 0.2);
  eU.speed = $.cornerSpeed(eU) * 1.4; eU.pos.y = 600;
  chk('B 上升 yo-yo：太低不抬', $.yoyo(eU, eU.ai, sideDir, 900).y < 0.2);
  const lo = mkAc(0.4); lo.speed = $.cornerSpeed(lo) * 1.4; lo.pos.y = 3000;
  chk('B 上升 yo-yo：低技能不抬', $.yoyo(lo, lo.ai, sideDir, 900).y < 0.2);
}

/* ---------- C ---------- */
function world2(skills) {
  const S2 = Sim.load({ seed: 2 });
  const { M3: M, Ent: E, AI: A, MISSIONS } = S2.sandbox;
  S2.start(0);
  const G = S2.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const tg = E.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 4000, z: 9000, fwd: M.V(0, 0, 1), speed: 220, special: null });
  tg.hp = tg.maxHp = 1e9; A.attach(tg, { role: 'ally', skill: 0.3 }); tg.ai.cmd = 'hold'; w.actors.push(tg);
  const foes = skills.map((sk, i) => {
    const a = E.makeAircraft({ type: 'albatross', team: 1, x: (i - 1) * 600, y: 4000, z: 0, fwd: M.V(0, 0, 1), speed: 250, special: 'dl6' });
    A.attach(a, { role: 'enemy', skill: sk, rank: sk >= 0.72 ? 'elite' : 'pawn' }); w.actors.push(a); return a;
  });
  return { S2, w, p, tg, foes };
}
{
  const W = world2([0.8, 0.8, 0.8]);
  for (let i = 0; i < 60 * 3; i++) { W.S2.step(1 / 60); W.p.alive = true; W.p.hp = W.p.maxHp; }
  const roles = W.foes.map(f => f.ai.subrole);
  chk('C 同一目标被 3 架高技能敌机盯着：一 bait、其余 flank', roles.filter(r => r === 'bait').length === 1 && roles.filter(r => r === 'flank').length === 2, roles.join(','));
  const L = world2([0.4, 0.4]);
  for (let i = 0; i < 60 * 3; i++) { L.S2.step(1 / 60); L.p.alive = true; L.p.hp = L.p.maxHp; }
  chk('C 低技能不分配', L.foes.every(f => !f.ai.subrole));
  const one = world2([0.8]);
  for (let i = 0; i < 60 * 3; i++) { one.S2.step(1 / 60); one.p.alive = true; one.p.hp = one.p.maxHp; }
  chk('C 单机不分配', !one.foes[0].ai.subrole);
}

/* ---------- D ---------- */
{
  const frac = sk => {
    let on = 0, n = 0;
    for (const seed of [1, 2]) {
      const W = world2([sk]);
      const f = W.foes[0];
      for (let i = 0; i < 60 * 25; i++) { W.S2.step(1 / 60); W.p.alive = true; W.p.hp = W.p.maxHp; if (f.alive) { n++; if (f.ab) on++; } }
    }
    return on / Math.max(1, n);
  };
  const e = frac(0.85), p = frac(0.55);
  chk('D elite 的加力时间占比低于普通 AI（按能量用，不是远了就开）', e < p, 'elite=' + e.toFixed(2) + ' pawn=' + p.toFixed(2));
}

process.exit(ok ? 0 : 1);
