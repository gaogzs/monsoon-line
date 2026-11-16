#!/usr/bin/env node
/* ============================================================
   AI 过失速机动探针（docs/POST2-0IMPL.md 5.8，批次 5e）—— 玩家侧的 PSM 在 probe-psm.js

   A. ace 被咬尾：一部分种子里触发 counter PSM（概率区间内），触发后收敛 / 结束、无 NaN、不坠毁
   B. 非 ace（pawn / elite）：同场景 PSM 触发数 = 0
   C. noPSM / 无人机标签：触发数 = 0
   D. 来袭导弹 TTI 过近（< 2.5 s）：不触发 break；够远（> 2.5 s）有触发
   E. 冷却：触发后 PSM_AI.CD 秒内不再触发
   用法：node tools/test/probes/probe-psm-ai.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function scene(seed, o) {
  o = o || {};
  const S = Sim.load({ seed });
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const A = Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: M3.V(0, 0, 1), speed: 230, special: null });
  A.hp = A.maxHp = 1e9;
  AI.attach(A, { role: 'enemy', skill: o.skill || 0.92, rank: o.rank || 'ace' });
  A.ai.cmd = 'hold';
  A.ai.rs = Math.imul(seed, 2654435761) >>> 0;      // 私有随机流的种子与 Sim 种子无关，这里按种子错开
  if (o.tags) A.tags = Object.assign({}, A.tags, o.tags);
  w.actors.push(A);
  let E = null;
  if (o.attacker !== false) {
    E = Ent.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 6000, z: -1400, fwd: M3.V(0, 0, 1), speed: 250, special: null });
    E.hp = E.maxHp = 1e9;
    AI.attach(E, { role: 'ally', skill: 0.6, rank: 'pawn' });
    w.actors.push(E);
  }
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; if (E && E.alive) E.ai.target = A; } };
  return { S, w, p, A, E, M3, Ent, AI, step };
}

/* ---------- A / E ---------- */
{
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let trig = 0, nan = 0, crashed = 0, unfinished = 0, againEarly = 0;
  for (const seed of SEEDS) {
    const W = scene(seed);
    let started = null, n = 0;
    const starts = [];
    for (let f = 0; f < 60 * 30; f++) {
      W.step(1);
      const A = W.A;
      if (A.psm && A.ai.psmAI && !started) { started = f; trig++; starts.push(f / 60); }
      if (A.psm && !A.ai.psmAI) { /* 坠落段后 psmAI 被清：正常 */ }
      if (!isFinite(A.pos.x + A.pos.y + A.pos.z + A.speed)) nan++;
      if (A.pos.y < 100) crashed++;
      // 冷却：第二次起手与第一次间隔应 ≥ CD
      if (A.ai.psmAI && A.psm && A.ai.psmAI.t < 0.05 && f > 0) { const t = f / 60; if (starts.length && t - starts[starts.length - 1] > 0.1) starts.push(t); }
    }
    if (process.env.DBGP) console.log('seed', seed, starts.map(x => x.toFixed(1)).join(' '));
    if (starts.length > 1) { for (let i = 1; i < starts.length; i++) if (starts[i] - starts[i - 1] < W.AI.$.PSM_AI.CD - 0.5) againEarly++; }
    if (W.A.psm && W.A.psm.t > 12) unfinished++;
  }
  chk('A ace 被咬尾：部分种子触发 counter PSM（不是全部、也不是 0）', trig >= 2 && trig <= SEEDS.length - 1, trig + '/' + SEEDS.length);
  chk('A 无 NaN、不坠毁、没有卡在 PSM 里不出来', nan === 0 && crashed === 0 && unfinished === 0, 'nan=' + nan + ' crashed=' + crashed + ' unfinished=' + unfinished);
  chk('E 冷却：两次起手间隔 ≥ PSM_AI.CD', againEarly === 0, 'early=' + againEarly);
}

/* ---------- B / C ---------- */
{
  const count = o => { let n = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const W = scene(seed, o); for (let f = 0; f < 60 * 20; f++) { W.step(1); if (W.A.psm || W.A.ai.psmAI) { n++; break; } } } return n; };
  chk('B pawn 位格不触发 PSM', count({ rank: 'pawn', skill: 0.55 }) === 0);
  chk('B elite（skill < 0.75）不触发 PSM', count({ rank: 'elite', skill: 0.72 }) === 0);
  chk('C noPSM 标签不触发', count({ tags: { noPSM: true } }) === 0);
  chk('C 无人机标签不触发', count({ tags: { unmanned: true } }) === 0);
}

/* ---------- D：来袭导弹 TTI ---------- */
{
  const run = dist => {
    let n = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const W = scene(seed, { attacker: false });
      const m = W.Ent.makeMissile({ weapon: 'srm', team: 0, pos: W.M3.V(1500, 6000, dist), fwd: W.M3.V(0, 0, -1), speed: 0.1, target: W.A, owner: null });
      m.team = 0; m.speed = 800; W.w.missiles.push(m);
      m.launchT = 99; m.life = 99;                      // 悬停：只用来制造"来袭弹在 dist 米外"的威胁
      W.A.ai.cmd = 'hold';
      for (let f = 0; f < 60 * 6; f++) { W.step(1); m.pos.x = 1500; m.pos.z = dist; m.pos.y = 6000; if (W.A.psm || W.A.ai.psmAI) { n++; break; } }
    }
    return n;
  };
  const near = run(1200), far = run(3800);
  chk('D 来袭弹 TTI < 2.5 s（1.2 km、800 m/s）：不触发 break PSM', near === 0, 'n=' + near);
  chk('D 来袭弹够远（3.8 km）：部分种子触发 break PSM', far >= 1, 'n=' + far + '/8');
}

/* ---------- F：HUD 提示渲染不抛错 ---------- */
{
  const W = scene(1, { attacker: false });
  W.A.pos = W.M3.add(W.p.pos, W.M3.mul(W.p.fwd, 1500));
  W.Ent.psmStart(W.A);
  let err = null;
  try { W.S.render(); } catch (e) { err = e; }
  chk('F AI 处于 PSM 时整帧 HUD 渲染不抛错（高攻角机动提示）', !err, err ? String(err.stack).split('\n')[0] : '');
  chk('F 提示文案存在', W.S.sandbox.T('ui.hud.targeting.drawPsmHints.hint').length > 0);
}

process.exit(ok ? 0 : 1);
