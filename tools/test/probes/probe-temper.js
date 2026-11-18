#!/usr/bin/env node
/* ============================================================
   性格体系探针（v3.6.3）

   A. 随机保底：spawnEnemy 在关卡没写 temperament 时随机选一个；确定性、不推进私有随机流、
      loyal 只给有 leader / ward 的、sniper 只给带远距对空弹的、drone / support / 侦察构型不抽、
      'steady' 可关、AI.attach 直接调不抽
   B. 咬尾 / 远射 / 超调 / 假撤退 × 性格：各量按性格的单调关系；steady 与无性格逐位一致
   用法：node tools/test/probes/probe-temper.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function world(seed) {
  const S = Sim.load({ seed });
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  return { S, w, p, M3: S.sandbox.M3, AI: S.sandbox.AI, spawn: o => S.sandbox.spawnEnemy(w, Object.assign({ ac: 'albatross', x: 0, y: 6000, z: 30000, fwd: S.sandbox.M3.V(0, 0, -1), speed: 250 }, o || {})) };
}

/* A 随机保底 */
{
  const W = world(1);
  const N = 300, got = {};
  const list = [];
  for (let i = 0; i < N; i++) { const a = W.spawn({ skill: 0.6 }); list.push(a); got[a.ai.temperament] = (got[a.ai.temperament] || 0) + 1; }
  chk('A 300 架里每架都有性格', list.every(a => !!a.ai.temperament), JSON.stringify(got));
  chk('A 没有 ward / leader 时不出 loyal', !got.loyal);
  chk('A 短程弹机型：只在 aggressive / cautious 里分（约 55% / 45%），不出 sniper', !got.sniper && got.aggressive / N > 0.45 && got.aggressive / N < 0.65, 'agg=' + (got.aggressive / N).toFixed(2) + ' cau=' + (got.cautious / N).toFixed(2));
  const lr = {}; for (let i = 0; i < N; i++) { const t = W.spawn({ skill: 0.6, special: 'mrm' }).ai.temperament; lr[t] = (lr[t] || 0) + 1; }
  chk('A 远距弹机型：三种都出现，约 40% / 33% / 27%', ['aggressive', 'cautious', 'sniper'].every(k => lr[k] / N > 0.18 && lr[k] / N < 0.5) && !lr.loyal, JSON.stringify(lr));
  const ward = W.spawn({ temperament: 'steady' });
  const esc = []; for (let i = 0; i < 200; i++) esc.push(W.spawn({ ward }).ai.temperament);
  chk('A 有 ward 时 loyal 出现（约 25%）', esc.filter(t => t === 'loyal').length > 25 && esc.filter(t => t === 'loyal').length < 80, 'loyal=' + esc.filter(t => t === 'loyal').length);
  chk('A 关卡显式指定的性格不被覆盖', W.spawn({ temperament: 'cautious' }).ai.temperament === 'cautious');
  chk("A 'steady' 关掉随机，且是空表（中性）", W.spawn({ temperament: 'steady' }).ai.temperament === 'steady' && Object.keys(W.AI.$.TEMPER.steady).length === 0);
  chk('A 侦察 / 干扰机构型（behavior recon）视为 steady', W.spawn({ behavior: 'recon' }).ai.temperament === 'steady');
  const gunOnly = []; for (let i = 0; i < 200; i++) gunOnly.push(W.spawn({ special: null }).ai.temperament);
  chk('A 没有远距对空弹的不出 sniper', !gunOnly.includes('sniper'));
  const x = world(7).spawn({ skill: 0.6 }), y = world(7).spawn({ skill: 0.6 });
  chk('A 同 seed 同顺序：结果相同（确定性）', x.ai.temperament === y.ai.temperament, x.ai.temperament + ' / ' + y.ai.temperament);
  const t = W.spawn({ skill: 0.6 }); const rs0 = t.ai.rs; t.ai.temperament = null; W.AI.rollTemperament(t);
  chk('A 抽取不推进私有随机流 rs', t.ai.rs === rs0);
  const d = W.S.sandbox.Ent.makeAircraft({ type: 'albatross', team: 1, x: 0, y: 6000, z: 0, fwd: W.M3.V(0, 0, 1), speed: 250, special: null });
  W.AI.attach(d, { role: 'enemy', skill: 0.6 });
  chk('A 直接 AI.attach 不抽（探针与旧调用方行为不变）', d.ai.temperament === null);
  d.ai.role = 'drone';
  chk('A 无人僚机（drone）不抽', W.AI.rollTemperament(d) === null);
  const w2 = world(3); const aew = w2.S.sandbox.spawnAewc(w2.w, { ac: 'quartz', team: 1, label: 'X', x: 0, y: 9000, z: 21000, a: w2.M3.V(6000, 0, 21000), b: w2.M3.V(-6000, 0, 24000) });
  chk('A 预警机（support / 航线型）没有性格或为 steady', !aew.ai.temperament || aew.ai.temperament === 'steady', String(aew.ai.temperament));
}

/* B 咬尾 / 远射 / 超调 / 假撤退 × 性格 */
{
  const W = world(2), AIs = W.AI.$, M3 = W.M3;
  const T = (t, skill) => ({ skill, temperament: t, rs: 1 });
  const ls = t => AIs.SKILL.longShot(T(t, 0.5)), os = t => AIs.SKILL.overshoot(T(t, 0.5));
  chk('B 远射概率：激进 > 无性格 > 谨慎 > 狙击', ls('aggressive') > ls(null) && ls(null) > ls('cautious') && ls('cautious') > ls('sniper'), ['aggressive', null, 'cautious', 'sniper'].map(t => ls(t).toFixed(3)).join(' > '));
  chk('B 激进的远射技能上限更高（skill 0.7 仍会，无性格不会）', AIs.SKILL.longShot(T('aggressive', 0.7)) > 0 && AIs.SKILL.longShot(T(null, 0.7)) === 0);
  chk('B 超调：激进 ≥ 无性格 ≥ 谨慎 ≥ 狙击，且不超过 1', os('aggressive') >= os(null) && os(null) >= os('cautious') && os('cautious') >= os('sniper') && os('aggressive') <= 1, ['aggressive', null, 'cautious', 'sniper'].map(t => os(t).toFixed(2)).join(' ≥ '));
  chk('B steady 与无性格的远射 / 超调逐位一致', ls('steady') === ls(null) && os('steady') === os(null));
  const tm = AIs.TEMPER;
  chk('B 假撤退乘子：谨慎 > 1 > 激进', tm.cautious.fakeK > 1 && tm.aggressive.fakeK < 1);
  chk('B 被咬反应延迟：谨慎 < 1（更早）', tm.cautious.react < 1);

  /* pickTailPlan 抽样分布：高技能被咬 600 m，激进多剪刀、谨慎多俯冲 / 拖友机 */
  const share = (temper, keys) => {
    let hit = 0, all = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const B = world(seed);
      for (let i = 0; i < seed * 3; i++) B.spawn({ temperament: 'steady', x: 90000 + i * 500, z: 90000 });     // 让各 seed 的私有 rs 不同
      const me = B.spawn({ skill: 0.95, rank: 'elite', temperament: temper, x: 0, y: 9000, z: 0, fwd: M3.V(0, 0, 1), speed: 330 }); me.ai.cmd = 'hold';
      const fr = B.spawn({ skill: 0.6, team: 0, temperament: 'steady', x: 6000, y: 9000, z: 6000, fwd: M3.V(0, 0, 1) }); fr.ai.cmd = 'hold';
      const foe = B.spawn({ team: 0, skill: 0.5, temperament: 'steady', x: 0, y: 9000, z: -600, fwd: M3.V(0, 0, 1), speed: 330 }); foe.ai.cmd = 'hold';
      for (let f = 0; f < 60 * 14; f++) {
        B.S.step(1 / 60); B.p.alive = true; B.p.hp = B.p.maxHp;
        foe.ai.target = me; foe.ai.retargetT = 99; foe.pos = M3.sub(me.pos, M3.mul(me.fwd, 600)); foe.fwd = M3.clone(me.fwd); foe.speed = me.speed;
      }
      for (const k in (me.ai.tailPlans || {})) { all += me.ai.tailPlans[k]; if (keys.includes(k)) hit += me.ai.tailPlans[k]; }
    }
    return all ? hit / all : 0;
  };
  const aggS = share('aggressive', ['scissors']), cauS = share('cautious', ['scissors']);
  chk('B 反咬尾：激进选剪刀的比例高于谨慎', aggS > cauS, aggS.toFixed(2) + ' > ' + cauS.toFixed(2));
  const cauD = share('cautious', ['dive', 'drag', 'jink']), aggD = share('aggressive', ['dive', 'drag', 'jink']);
  chk('B 反咬尾：谨慎选俯冲 / 拖友机 / 蛇行的比例高于激进', cauD > aggD, cauD.toFixed(2) + ' > ' + aggD.toFixed(2));

  /* 保持咬尾：太近改瞄身后的触发距离 */
  const hold = temper => {
    const B = world(9);
    const tgt = B.spawn({ team: 0, skill: 0.5, temperament: 'steady', x: 0, y: 6000, z: 450, fwd: M3.V(0, 0, 1), speed: 250 });
    const me = B.spawn({ skill: 0.95, rank: 'elite', temperament: temper, x: 0, y: 6000, z: 0, fwd: M3.V(0, 0, 1), speed: 330 });
    me.ai.target = tgt; me.vel = M3.V(0, 0, 330); tgt.vel = M3.V(0, 0, 250);
    B.AI.$.holdTail(me, me.ai, M3.V(0, 0, 1), 450, { dir: M3.V(0, 0, 1), throttle: 1, ab: true });
    return me.ai.holdPlan;
  };
  chk('B 保持咬尾：450 m 时谨慎（lag 650）收手、激进（350）继续贴', hold('cautious') === 'lag' && hold('aggressive') === 'lead', hold('cautious') + ' / ' + hold('aggressive'));
}

process.exit(ok ? 0 : 1);
