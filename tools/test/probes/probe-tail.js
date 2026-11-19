#!/usr/bin/env node
/* ============================================================
   咬尾攻防与边界缓冲探针（v3.6.3）

   A. 摆脱咬尾：skill 单调（shakeTail 0 → 1）；高技能被咬住超过反应延迟后登记急转并摆脱；skill ≤ 0.3 不会
   B. 保持咬尾：holdTail 单调；高技能咬着转弯的目标时平均距离 < 低技能，并按对手速度调油门（不冲过头）
   C. 战区边界缓冲：朝外追击的 NPC 在警告区外沿就被拉回，不会把战斗带出界
   D. 脱离干扰区：压制一松就结束 extend，且有冷却
   F. 转守为攻（v3.6.4）：barrel / rolling / feint（+ brake 转入反击）的阶段方向与门限、反击阶段（强制目标 / 开火意愿 / 作废）、动态反咬率
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

/* E 多策略：反咬尾按距离 / 技能选不同招；咬尾按态势选 lead / lag / cut / high */
{
  const plansAt = (skill, dist, seeds) => {
    const seen = {};
    for (const seed of seeds) {
      const W = base(seed);
      const me = W.mk(0, 0, 9000, 0, 1, { skill, rank: skill > 0.8 ? 'elite' : 'pawn' }); me.ai.cmd = 'hold'; me.speed = 330;
      const friend = W.mk(0, 6000, 9000, 6000, 1, { skill: 0.6 }); friend.ai.cmd = 'hold';
      const foe = W.mk(1, 0, 9000, -dist, 1, { skill: 0.5 }); foe.ai.cmd = 'hold';
      for (let f = 0; f < 60 * 20; f++) {
        W.step(1);
        foe.ai.target = me; foe.ai.retargetT = 99;
        foe.pos = W.M3.sub(me.pos, W.M3.mul(me.fwd, dist)); foe.fwd = W.M3.clone(me.fwd); foe.speed = me.speed;       // 钉在机尾 dist 处
      }
      for (const k in (me.ai.tailPlans || {})) seen[k] = (seen[k] || 0) + me.ai.tailPlans[k];
    }
    return seen;
  };
  const seeds = [1, 2, 3, 4, 5, 6];
  const lo = plansAt(0.45, 1500, seeds), hi = plansAt(0.95, 600, seeds), far = plansAt(0.95, 2400, seeds);
  const names = o => Object.keys(o).sort().join('/');
  chk('E 低技能（0.45）只会 break / jink / dive', Object.keys(lo).length > 0 && Object.keys(lo).every(k => ['break', 'jink', 'dive'].includes(k)), names(lo));
  chk('E 高技能近距：会用 3 种以上策略', Object.keys(hi).length >= 3, names(hi));
  chk('E 高技能近距：用得上剪刀 / 刹车 / 爬升之一', ['scissors', 'brake', 'zoom'].some(k => hi[k]), names(hi));
  chk('E 远距（2.4 km）：不会剪刀 / 刹车', !far.scissors && !far.brake && Object.keys(far).length > 0, names(far));
  const W = base(9), M3 = W.M3;
  const tgt = W.mk(0, 0, 6000, 1500, 1, { skill: 0.5 }); tgt.speed = 250;
  const me = W.mk(1, 0, 6000, 0, 1, { skill: 0.95, rank: 'elite' }); me.speed = 320; me.ai.target = tgt;
  const res = { dir: M3.V(0, 0, 1), throttle: 1, ab: true }, desired = M3.norm(M3.V(0.3, 0, 1));
  const hLead = W.AI.$.holdTail(me, me.ai, desired, 1500, res);
  chk('E 咬尾：平飞目标 → lead', me.ai.holdPlan === 'lead', me.ai.holdPlan);
  tgt.right = M3.norm(M3.V(1, 0.7, 0));                                    // 右翼抬起 = 压左坡度转弯
  const hc = W.AI.$.holdTail(me, me.ai, desired, 1500, res);
  chk('E 咬尾：目标压坡度转弯 → cut，且瞄点偏向转弯圈内侧（左）', me.ai.holdPlan === 'cut' && hc.dir.x < hLead.dir.x, me.ai.holdPlan);
  tgt.right = M3.V(1, 0, 0);
  tgt.pos.z = 400; me.vel = M3.V(0, 0, 330); tgt.vel = M3.V(0, 0, 250);
  const hl = W.AI.$.holdTail(me, me.ai, desired, 400, res);
  chk('E 咬尾：太近且在接近（< 500 m）→ lag，油门比 lead 更收', me.ai.holdPlan === 'lag' && hl.throttle < 0.9, me.ai.holdPlan + ' thr=' + (hl && hl.throttle.toFixed(2)));
}

/* F 转守为攻（v3.6.4）：barrel / hammer / rolling / feint + 反击阶段 */
{
  const mkPair = (seed, skill, dist, y) => {
    const W = base(seed);
    const me = W.mk(0, 0, y || 6000, 0, 1, { skill, rank: skill > 0.8 ? 'elite' : 'pawn' }); me.speed = 300; me.vel = W.M3.V(0, 0, 300);
    const foe = W.mk(1, 0, y || 6000, -dist, 1, { skill: 0.5 }); foe.ai.target = me; foe.target = me; foe.ai.retargetT = 99;
    return { W, me, foe, $: W.AI.$, M3: W.M3 };
  };
  const call = (P, plan, clock, extra) => {
    P.me.ai.tailT = 99; P.me.ai.tailPlan = plan; P.me.ai.planT = 99; P.me.ai.planClock = clock; P.me.ai.tailSide = 1; P.me.ai.tailFlip = 0.6;
    if (extra) extra(P);
    return P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1));
  };
  // 阶段方向
  { const P = mkPair(1, 0.95, 600);
    const b1 = call(P, 'barrel', 0.2), b2 = call(P, 'barrel', 3.0);
    chk('F barrel 阶段 ①：向侧上方让出（y > 0.3）并收油门到 0.15（让攻击者冲过头）', b1.dir.y > 0.3 && b1.throttle === 0.15, 'y=' + b1.dir.y.toFixed(2));
    chk('F barrel 阶段 ②：机头翻向攻击者（z < 0）并下压', b2.dir.z < 0 && b2.dir.y < 0, 'z=' + b2.dir.z.toFixed(2) + ' y=' + b2.dir.y.toFixed(2));
    const f1 = call(P, 'feint', 0.1), f2 = call(P, 'feint', 1.2);
    chk('F feint：先朝一侧、随后反侧（x 分量异号）', f1.dir.x * f2.dir.x < 0, f1.dir.x.toFixed(2) + ' / ' + f2.dir.x.toFixed(2));
    const ys = []; P.me.ai.tailPlan = 'rolling'; P.me.ai.tailT = 99; P.me.ai.planT = 99; P.me.ai.tailSide = 1; P.me.ai.tailFlip = 0.5;
    for (let i = 0; i < 180; i++) { const r = P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1)); if (i % 30 === 0) ys.push(Math.sign(r.dir.y)); P.me.ai.planT = 99; }
    chk('F rolling：垂直面上 / 下交替，小油门', ys.includes(1) && ys.includes(-1), ys.join(','));
  }
  // 门限：抽样
  const sample = (skill, dist, y, n) => {
    const out = {};
    for (let i = 0; i < n; i++) {
      const P = mkPair(10 + i, skill, dist, y); P.me.ai.rs = (P.me.ai.rs * 1664525 + 1013904223 + i * 7919) >>> 0; P.me.ai.tailT = 99; P.me.ai.tailPlan = null; P.me.ai.planT = 0;
      const r = P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1)); const pl = P.me.ai.tailPlan; out[pl] = (out[pl] || 0) + 1;
    }
    return out;
  };
  const NEW = ['barrel', 'rolling', 'feint'];
  const loS = sample(0.6, 600, 6000, 14), hiS = sample(0.95, 600, 6000, 40), farS = sample(0.95, 2400, 6000, 14);
  chk('F 技能 0.6（k = 0.5）：不会任何反转型策略', !NEW.some(k => loS[k]), JSON.stringify(loS));
  chk('F 技能 0.95 近距：出得了反转型策略', NEW.some(k => hiS[k]), JSON.stringify(hiS));
  chk('F 远距（2.4 km）：没有反转型策略', !NEW.some(k => farS[k]), JSON.stringify(farS));
  chk('F rolling 只在 < 700 m 入选（600 m 有、1 km 没有）', (sample(0.95, 600, 6000, 40).rolling || 0) > 0 && !sample(0.95, 1000, 6000, 30).rolling, 'ok');
  // 反击阶段
  { const P = mkPair(3, 0.95, 600);
    call(P, 'barrel', 1.5);                                                 // 记下 tailChaser
    chk('F 被咬期间记下攻击者', P.me.ai.tailChaser === P.foe);
    P.foe.pos.z = 500; P.foe.vel = P.M3.V(0, 0, 300);                       // 攻击者冲到了我前面
    P.me.ai.tailPlan = 'barrel';
    const r = P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1));
    chk('F 攻击者跑到前半球：转入反击（counterT = 4、counterFor、reversals +1）', r === null && P.me.ai.counterT > 3.9 && P.me.ai.counterFor === P.foe && P.me.ai.reversals === 1);
    chk('F 反击：首发免反应延迟（missT ≥ reactT）', P.me.ai.missT >= P.$.SKILL.reactT(P.me.ai));
    const fw0 = P.$.SKILL.fireWill({ skill: 0.95 }), fw1 = P.$.SKILL.fireWill({ skill: 0.95, counterT: 2 });
    chk('F 反击：开火意愿 +0.25', Math.abs(fw1 - fw0 - 0.25) < 1e-9, fw0.toFixed(2) + ' -> ' + fw1.toFixed(2));
    P.me.ai.retargetT = 0; P.me.ai.target = null;
    P.W.step(10);
    chk('F 反击窗口：强制盯住攻击者（不被重选抢走）', P.me.ai.target === P.foe);
    P.me.ai.tailPlan = null;
    P.foe.pos = P.M3.V(P.me.pos.x, P.me.pos.y, P.me.pos.z - 600); P.foe.fwd = P.M3.V(0, 0, 1); P.foe.ai.target = P.me; P.foe.target = P.me;
    P.me.fwd = P.M3.V(0, 0, 1);
    P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1));
    chk('F 又被咬到身后：反击窗口作废', P.me.ai.counterT === 0 && P.me.ai.counterFor === null);
  }
  { const P = mkPair(5, 0.95, 600);
    call(P, 'brake', 0.5); P.foe.pos.z = 500; P.me.ai.tailPlan = 'brake';
    P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1));
    chk('F brake 让攻击者飞过去后也转入反击', P.me.ai.counterT > 3.9 && P.me.ai.counterFor === P.foe);
  }
  { const P = mkPair(4, 0.95, 600);
    call(P, 'break', 1.5); P.foe.pos.z = 500; P.me.ai.tailPlan = 'break';
    P.$.shakeTail(P.me, P.me.ai, P.W.w, 1 / 60, P.M3.V(0, 0, 1));
    chk('F 非反转型策略（break）：攻击者冲过去不触发反击', P.me.ai.counterT === 0);
  }
  // 动态：被紧咬时，强制各反转策略 vs 基线 break，统计 8 s 内"攻击者跑到我前半球且 < 1500 m"的比例
  const flip = (plan, seed) => {
    const P = mkPair(seed, 0.95, 500);
    P.foe.ai.skill = 0.7; P.foe.ai.cmd = 'pursue'; P.foe.speed = 420; P.foe.vel = P.M3.V(0, 0, 420); P.foe.throttle = 1;      // 攻击者更快：逼近中才有"冲过头"的机会
    for (let f = 0; f < 60 * 8; f++) {
      P.W.step(1); P.foe.ai.target = P.me; P.foe.ai.retargetT = 99;
      if (P.me.ai.tailPlan && P.me.ai.planClock < 0.05 && P.me.ai.tailPlan !== plan) { P.me.ai.tailPlan = plan; P.me.ai.tailFlip = 0.6; }
      const rel = P.M3.sub(P.foe.pos, P.me.pos), d = P.M3.len(rel);
      if (d < 1500 && P.M3.dot(P.me.fwd, rel) / Math.max(1, d) > 0.1) return 1;
    }
    return 0;
  };
  const seeds = [21, 22, 23, 24, 25, 26];
  const rate = plan => seeds.reduce((n, sd) => n + flip(plan, sd), 0) / seeds.length;
  const rb = rate('break'), rn = NEW.map(rate);
  const best = Math.max(...rn);
  chk('F 动态：每个反转策略把更快的攻击者甩到前方的比例 > break', rn.every(v => v > rb) && rn.every(v => v >= 0.5), 'break=' + rb.toFixed(2) + ' ' + NEW.map((n, i) => n + '=' + rn[i].toFixed(2)).join(' '));
}

process.exit(ok ? 0 : 1);
