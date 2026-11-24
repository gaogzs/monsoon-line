#!/usr/bin/env node
/* ============================================================
   半主动雷达弹探针（docs/POST2-0IMPL.md 5.6）
   弹：CLA-6 牵引（tether，标签 sarh）；对照 CLA-4（mrm，主动雷达）。

   A. 发射机持续锁定：弹受引导、命中
   B. 发射机从未锁定 / 立刻丢锁超过宽限：弹永久失去引导（target 被置空），不命中
   C. 丢锁后在宽限内重新锁定同一目标：恢复引导、命中；超过宽限：不恢复
   D. 发射后切目标（lockHeldOn 指向别的东西）：旧弹当帧 sarhLost，宽限满后永久失引导
   E. 发射机阵亡：弹丢照射（同 B）
   F. 对照：mrm 不依赖发射机，同样的"发射机不锁定"下照样命中
   G. AI 照射：AI 持有半主动弹在途时 lockHeldOn、illumHolds；切目标被抑制；丢弃弹后释放
   用法：node tools/test/probes/probe-sarh.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const S = Sim.load({ seed: 1 });
const { M3, Ent } = S.sandbox;

function mkTarget(z) {
  const t = Ent.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 4000, z, fwd: M3.V(0, 0, 1), speed: 220, special: null });
  t.hp = t.maxHp = 1e9;
  return t;
}
/* 剧本：t 秒表 + 回调改发射机状态。返回 { hit, lostAt, sarhLost, targetNull, m } */
function fly(weapon, script, opts) {
  opts = opts || {};
  const tg = mkTarget(opts.range || 7000);
  const shooter = { alive: true, lockHeldOn: tg, team: 1, pos: M3.V(0, 4000, 0), fwd: M3.V(0, 0, 1) };
  const w = { actors: [tg], targets: [], missiles: [], particles: [], bullets: [], time: 0, events: [], silent: true, killed: 0 };
  const m = Ent.makeMissile({ weapon, team: 1, pos: M3.V(0, 4000, 0), fwd: M3.V(0, 0, 1), speed: 600, target: tg, owner: shooter });
  m.team = 1; w.missiles.push(m);
  let hp0 = tg.hp, lostAt = null, sawLost = false, minD = 1e9;
  for (let f = 0; f < 60 * 25 && m.alive; f++) {
    const t = f / 60;
    if (script) script(t, shooter, tg);
    tg.pos.z += tg.speed / 60;            // 目标匀速直飞（不走 stepAircraft，省得它自己飞偏）
    Ent.stepMissile(m, 1 / 60, w);
    minD = Math.min(minD, M3.dist(m.pos, tg.pos));
    if (m.sarhLost) { sawLost = true; if (lostAt === null) lostAt = t; }
  }
  const dead = !m.alive;
  return { m, tg, dead, sawLost, lostAt, minD, targetNull: m.target === null, dmg: hp0 - tg.hp };
}

/* A */
{
  const r = fly('tether', null);
  chk('A 持续锁定：弹受引导并命中（爆炸 / 近炸）', r.dead && r.m.target !== null && !r.sawLost && r.minD < 40, 'minD=' + r.minD.toFixed(1));
}
/* B */
{
  const r = fly('tether', (t, sh) => { sh.lockHeldOn = null; });
  chk('B 从未持锁：当帧 sarhLost，宽限满后目标被置空', r.sawLost && r.targetNull && r.lostAt < 1.5, 'lostAt=' + r.lostAt + ' targetNull=' + r.targetNull);
}
/* C */
{
  const grace = Ent.SARH_GRACE;
  const re = fly('tether', (t, sh, tg) => { sh.lockHeldOn = (t > 1.0 && t < 1.0 + grace * 0.6) ? null : tg; });
  chk('C1 宽限内重锁同一目标：恢复引导（目标引用还在，最终命中）', re.sawLost && !re.targetNull && re.dead && re.minD < 60, 'minD=' + re.minD.toFixed(1) + ' lost=' + re.sawLost + ' target=' + !re.targetNull);
  const late = fly('tether', (t, sh, tg) => { sh.lockHeldOn = (t > 1.0 && t < 1.0 + grace + 1.5) ? null : tg; });
  chk('C2 丢锁超过宽限：永久失去引导，之后重锁也不恢复', late.targetNull, 'targetNull=' + late.targetNull);
}
/* D */
{
  const other = mkTarget(9000);
  const r = fly('tether', (t, sh) => { if (t > 0.8) sh.lockHeldOn = other; });
  chk('D 发射后切目标：旧弹丢照射，宽限满后永久失引导', r.sawLost && r.targetNull);
}
/* E */
{
  const r = fly('tether', (t, sh) => { if (t > 0.8) sh.alive = false; });
  chk('E 发射机阵亡：弹丢照射并永久失引导', r.sawLost && r.targetNull);
}
/* F */
{
  const r = fly('mrm', (t, sh) => { sh.lockHeldOn = null; }, { range: 5000 });
  chk('F 对照：主动雷达弹 mrm 不依赖发射机锁定', !r.sawLost && r.dead && r.minD < 40, 'minD=' + r.minD.toFixed(1));
}

/* ---------- G. AI 照射 ----------
   这个场景对种子很敏感：射手（ace）在 4–18 s 内多半进躲避模式（躲避时不开火），实测 10 个种子里只有 2–4 个会开火
   （HEAD 4 个、加力羽流不再消耗随机数之后 2 个）。以前钉死在种子 3 上，种子 3 碰巧会开火就过，随机流一动就挂。
   照射逻辑本身（持有 lockHeldOn、照射期间不重选目标、弹失效后释放）在每一个**会开火**的种子里都成立 ——
   所以这里遍历种子：G2 / G3 / G4 对每个开火的种子都必须成立；G1 放宽成"10 个种子里至少 2 个开火"（只保证 AI 在这个场景里能发射半主动弹，
   不再保证某个固定种子下一定发射）。 */
{
  function scenarioG(seed) {
    const S2 = Sim.load({ seed });
    const { M3: M, Ent: E, AI, MISSIONS } = S2.sandbox;
    S2.start(MISSIONS.findIndex(m => m.id === 'm1'));
    const G = S2.sandbox.Game, w = G.__world(), p = G.__player();
    for (const a of w.actors) if (a !== p) a.alive = false;
    w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
    p.pos.x += 80000; p.hp = p.maxHp = 1e9;           // 玩家挪远，别参与
    w.arenaDef = null;
    /* 射手带半主动弹；两个目标只是被照射的靶，不带武器（special: null）：否则它们会还击，谁先开火 / 导弹何时到射手
       决定射手是否被迫进躲避（躲避模式不开火），测的就成了对射的混沌而不是 AI 的照射逻辑 */
    const mk = (team, x, z, fz, sp) => { const a = E.makeAircraft({ type: 'albatross', team, x, y: 4000, z, fwd: M.V(0, 0, fz), speed: 250, special: sp }); a.hp = a.maxHp = 1e9; return a; };
    const sh = mk(1, 0, 0, 1, 'tether'), tg1 = mk(0, 0, 9000, -1, null), tg2 = mk(0, 1500, 8000, -1, null);
    AI.attach(sh, { role: 'enemy', skill: 0.9, rank: 'ace' });
    AI.attach(tg1, { role: 'ally', skill: 0.3, rank: 'rookie' }); AI.attach(tg2, { role: 'ally', skill: 0.3, rank: 'rookie' });
    tg1.ai.cmd = 'hold'; tg2.ai.cmd = 'hold';
    w.actors.push(sh, tg1, tg2);
    let held = false, tgtAtLaunch = null, retargeted = false, firedAt = -1;
    for (let f = 0; f < 60 * 40; f++) {
      S2.step(1 / 60); p.alive = true; p.hp = p.maxHp;
      const mine = w.missiles.find(m => m.owner === sh && m.w.tags && m.w.tags.sarh);
      if (mine && firedAt < 0) { firedAt = f / 60; tgtAtLaunch = mine.target; }
      if (mine && sh.lockHeldOn === mine.target) held = true;
      if (mine && sh.ai.illum && AI.$.illumHolds(sh.ai) && sh.ai.target !== tgtAtLaunch) retargeted = true;
      if (firedAt >= 0 && !mine) break;
    }
    S2.step(1 / 60);
    return { seed, firedAt, held, retargeted, released: sh.lockHeldOn === null && sh.ai.illum === null };
  }
  /* 开火率实测 20–40%（躲避模式不开火）。G1 只需证明"AI 在这个场景里能发射半主动弹"这个前提，≥ 1 个就够；
     种子数取 12：开火率按 20% 算，12 个全不开火的概率约 7%，门槛定 ≥ 2 的话 10 个种子里失败概率 > 35%，等于没有余量。
     G2–G4 另外要求 fired.length > 0，所以"一个都没开火"不会被当成通过。 */
  const G_SEEDS = 12, G_NEED_FIRED = 1;
  const gRes = [];
  for (let sd = 1; sd <= G_SEEDS; sd++) gRes.push(scenarioG(sd));
  const fired = gRes.filter(r => r.firedAt >= 0);
  const fmt = rs => rs.map(r => 's' + r.seed).join(',') || '无';
  chk('G1 AI 发射了半主动弹（' + G_SEEDS + ' 个种子里至少 ' + G_NEED_FIRED + ' 个）', fired.length >= G_NEED_FIRED,
    fired.length + '/' + G_SEEDS + '（' + fmt(fired) + '；开火时刻 ' + fired.map(r => r.firedAt.toFixed(1)).join('/') + ' s）');
  chk('G2 在途期间 AI 持有 lockHeldOn（持续照射）—— 每个开火的种子', fired.length > 0 && fired.every(r => r.held), '未持有：' + fmt(fired.filter(r => !r.held)));
  chk('G3 照射期间不重选目标 —— 每个开火的种子', fired.length > 0 && fired.every(r => !r.retargeted), '重选了：' + fmt(fired.filter(r => r.retargeted)));
  chk('G4 弹失效后释放：lockHeldOn 清空、illum 清空 —— 每个开火的种子', fired.length > 0 && fired.every(r => r.released), '未释放：' + fmt(fired.filter(r => !r.released)));
}

/* ---------- H. HUD：整帧渲染不抛错（状态条 / 圈 / 引导告警 / Fox 1 台词） ---------- */
{
  const S3 = Sim.load({ seed: 2, trace: true });
  const { M3: M, Ent: E, MISSIONS } = S3.sandbox;
  S3.start(0);
  const G = S3.sandbox.Game, w = G.__world(), p = G.__player();
  const foe = w.actors.find(a => a.team === 1 && a.alive);
  p.target = foe;
  const own = E.makeMissile({ weapon: 'tether', team: 0, pos: M.add(p.pos, M.V(0, 0, 200)), fwd: p.fwd, speed: 600, target: foe, owner: p });
  own.team = 0; w.missiles.push(own);
  const inc = E.makeMissile({ weapon: 'tether', team: 1, pos: M.add(p.pos, M.V(0, 0, 3000)), fwd: M.V(0, 0, -1), speed: 700, target: p, owner: foe });
  inc.team = 1; w.missiles.push(inc);
  let err = null;
  try {
    for (const lost of [false, true]) { own.sarhLost = lost; own.illumT = lost ? 1.0 : 0; inc.sarhLost = lost; p.special = 'tether'; S3.render(); }
  } catch (e) { err = e; }
  chk('H 半主动状态条 / 锥圈 / 引导告警：两种状态整帧渲染不抛错', !err, err ? String(err.stack).split('\n').slice(0, 2).join(' | ') : '');
  const T3 = S3.sandbox.T;
  chk('H Fox 1 台词文案存在', /Fox 1/.test(T3('ui.input.launchCall.fox1')));
}

process.exit(ok ? 0 : 1);
