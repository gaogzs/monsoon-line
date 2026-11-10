#!/usr/bin/env node
/* ============================================================
   过失速机动（PSM）探针（docs/POST2-0IMPL.md 3.3）

   验证：
     1. 主场景：200 m/s、3000 m，光标在正后方 —— 收敛时间有界、α 峰值 ≤ 100°、
        无 NaN、能量损失与结束速度落在设计区间
     2. 光标中途移动（±60°）—— 仍收敛到新方向
     3. 门限：光标在前方 / 高度不足 / 能量不足 / 冷却中 / 没有光标 / noPSM，各自被拒并给出对应原因
     4. 中止：速度低于阈值 / 低空下降 / 主动中止 —— 回到常规飞行，出口速度连续（不突跳）
     5. 数值稳定：dt = 0.02 / 0.05 两种步长，能量损失与结束速度相对误差 ≤ 5%，收敛时间 ≤ 10%
     6. 机动期间装填 / 枪热照常结算（stepAircraftTail）

   控制律照 controlPlayer 的鼠标分支：每帧 AI.steerTo 把机头指向光标并写 a.ctrl，
   stepAircraft 发现 a.psm 就交给 stepPSM。

   用法：node tools/test/probes/probe-psm.js [--verbose]
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const Ent = G.Ent, AI = G.AI, M3 = G.M3;
const D = Math.PI / 180;
const VERBOSE = process.argv.indexOf('--verbose') >= 0;

S.start(0);
const w = G.Game.__world();
const p = G.Game.__player();

const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}

function setup(alt, spd, aim) {
  p.pos = M3.V(0, alt, 0);
  p.fwd = M3.V(0, 0, 1); p.up = M3.V(0, 1, 0); p.right = M3.V(1, 0, 0);
  p.speed = spd; p.vel = M3.mul(p.fwd, spd);
  p.throttle = 1; p.ab = false; p.brake = false;
  p.psm = null; p.psmLevel = false; p.psmRecover = 0; p.psmEnd = null;
  p.sink = 0; p.alive = true; p.hp = p.maxHp; p.gNow = 1;
  p.tags = {};                       // 上一个用例可能设了 noPSM
  p.aimDir = aim ? M3.norm(aim) : null;
  p.ctrl.pitch = 0; p.ctrl.roll = 0; p.ctrl.yaw = 0;
}

/* 跑一整把 PSM。aimFn(t) 给出 t 时刻的光标方向；每帧先 steerTo 写 a.ctrl 再 stepAircraft。
   返回 { t, end, e0, finite, vBefore, vAfter, offEnd }。 */
function run(alt, spd, aimFn, dt, tmax, log) {
  setup(alt, spd, aimFn(0));
  const gate = Ent.psmGate(p, w, p.aimDir);
  if (!gate.ok) return { gate };
  Ent.psmStart(p);
  const e0 = Ent.psmEnergy(p);
  let t = 0, finite = true, lastV = spd, hold = 0;
  while (p.psm && t < tmax) {
    p.aimDir = M3.norm(aimFn(t));
    AI.steerTo(p, p.aimDir, p.ctrl, p, dt);
    lastV = M3.len(p.vel);
    Ent.stepAircraft(p, dt, w);
    t += dt;
    /* 现在是按住 X 才继续：模拟玩家看到机头对准光标并保持 0.3 s 后松开 */
    if (p.psm && Math.acos(M3.clamp(M3.dot(p.fwd, p.aimDir), -1, 1)) < 3 * D) {
      hold += dt;
      if (hold >= 0.3) Ent.psmAbort(p, w, 'release');
    } else hold = 0;
    if (![p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z, p.speed].every(Number.isFinite)) { finite = false; break; }
    if (VERBOSE && log && Math.round(t / dt) % Math.round(0.5 / dt) === 0) {
      console.log('    t=' + t.toFixed(1) + ' v=' + p.speed.toFixed(0) + ' alt=' + p.pos.y.toFixed(0) +
        ' α=' + (p.psm ? (p.psm.aoa / D).toFixed(0) : '-'));
    }
  }
  const off = Math.acos(M3.clamp(M3.dot(p.fwd, M3.norm(aimFn(t))), -1, 1)) / D;
  return { t, end: p.psmEnd, e0, finite, vBefore: lastV, vAfter: M3.len(p.vel), offEnd: off, stillOn: !!p.psm };
}

const behind = () => M3.V(0, 0, -1);
const rotY = (v, deg) => M3.rotAxis(v, M3.V(0, 1, 0), deg * D);

console.log('过失速机动探针  phys=' + JSON.stringify(p.phys));

// ---- 1. 主场景 ----
{
  const r = run(3000, 200, behind, 1 / 60, 15, true);
  check('光标在正后方：触发并收敛', !r.gate && r.end && r.end.why === 'release', r.end ? '（' + r.end.why + '）' : JSON.stringify(r.gate));
  if (r.end) {
    check('收敛时间有界（≤ 6 s）', r.t <= 6, r.t.toFixed(2) + ' s');
    check('α 峰值 ≤ 100°', r.end.aoaMax <= 100, r.end.aoaMax.toFixed(1) + '°');
    check('无 NaN', r.finite);
    const keLoss = 1 - (r.vAfter / 200) ** 2;       // 动能损失（比能里的势能占一大块，用动能看代价更直观）
    check('动能损失在设计区间（55%–85%）：代价是快速掉能量', keLoss >= 0.55 && keLoss <= 0.85, (keLoss * 100).toFixed(0) + '%（比能 ' + (r.end.loss * 100).toFixed(0) + '%）');
    check('结束速度不低于 0.75·vStall（边缘失速：3000 m 处失速速度本来就高）', r.vAfter >= 0.75 * Ent.vStallAt(p), r.vAfter.toFixed(0) + ' m/s（3000 m 处 vStall ' + Ent.vStallAt(p).toFixed(0) + '）');
    check('结束时机头对准光标（< 5°）', r.offEnd < 5, r.offEnd.toFixed(1) + '°');
    check('出口速度连续（投影回机头，大小不变）', Math.abs(r.vAfter - r.vBefore) / r.vBefore < 0.02,
      r.vBefore.toFixed(1) + ' → ' + r.vAfter.toFixed(1));
    check('松开后挂上恢复、没有冷却', p.psmRecover > 0 && p.psmCd === undefined, 'recover ' + p.psmRecover + ' cd ' + p.psmCd);
  }
}

// ---- 1b. 一直按住：能量耗尽 → 失速坠落（机头落下、速度矢量跟着重力走），速度回到 vStall 才结束 ----
{
  setup(3000, 200, behind());
  Ent.psmStart(p);
  let t = 0, gMax = 0, gMin = 9, fell = false, tFall = 0, fwdYMin = 1, vyMin = 0, minSpeed = 1e9, y0 = p.pos.y;
  while (p.psm && t < 40) {
    AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60);
    Ent.stepAircraft(p, 1 / 60, w);
    t += 1 / 60;
    if (p.psm && p.psm.fall) { fell = true; tFall += 1 / 60; fwdYMin = Math.min(fwdYMin, p.fwd.y); vyMin = Math.min(vyMin, p.vel.y); minSpeed = Math.min(minSpeed, p.speed); }
    gMax = Math.max(gMax, p.gNow); gMin = Math.min(gMin, p.gNow);
    if (p.psm && p.psm.fall) Ent.psmAbort(p, w, 'release');   // 坠落段里玩家松手：不能被它打断
  }
  check('一直按住：耗尽能量后转入坠落段', fell);
  check('坠落段：速度回到 vStall 以上才结束', !p.psm && p.psmEnd && p.psmEnd.why === 'recover' && p.speed >= Ent.vStallAt(p),
    p.psmEnd ? p.psmEnd.why + ' v ' + p.speed.toFixed(0) : 'still on, t ' + t.toFixed(1));
  check('坠落段：机头落下（fwd.y 最低 < −0.35）', fwdYMin < -0.35, fwdYMin.toFixed(2));
  check('坠落段：真的在掉（vel.y 最低 < −40 m/s）', vyMin < -40, vyMin.toFixed(0) + ' m/s');
  check('坠落段：用时与高度损失有界', tFall <= 12 && p.pos.y > 0 && t <= 20, 'fall ' + tFall.toFixed(1) + ' s, Δh ' + (p.pos.y - y0).toFixed(0) + ' m, 总 ' + t.toFixed(1) + ' s');
  check('G 表：PSM 期间 gNow 有明显变化（含速度被拉着转的那部分）', gMax - gMin > 1.5, 'gNow ' + gMin.toFixed(1) + ' … ' + gMax.toFixed(1));
}

// ---- 2. 光标中途移动 ----
for (const sh of [60, -60]) {
  const r = run(3000, 200, t => t < 1 ? behind() : rotY(behind(), sh), 1 / 60, 15, false);
  check('光标中途移动 ' + (sh > 0 ? '+' : '') + sh + '°：仍收敛到新方向',
    !r.gate && r.end && r.end.why === 'release' && r.offEnd < 5 && r.finite,
    r.end ? r.end.why + ' off ' + r.offEnd.toFixed(1) + '° t ' + r.t.toFixed(1) : JSON.stringify(r.gate));
}

// ---- 3. 门限 ----
{
  const cases = [
    ['光标在前方', () => setup(3000, 200, M3.V(0, 0, 1)), 'front'],
    ['高度不足', () => setup(1000, 200, behind()), 'low'],
    ['速度过大（动压超上限）', () => setup(3000, 500, behind()), 'fast'],
    ['能量不足', () => setup(2100, 130, behind()), 'energy'],
    ['光标只偏 30°', () => setup(3000, 200, rotY(M3.V(0, 0, 1), 30)), 'front'],
    ['键盘模式（没有光标）', () => setup(3000, 200, null), 'noAim'],
    ['noPSM 机型', () => { setup(3000, 200, behind()); p.tags = { noPSM: true }; }, 'noPSM'],
    ['低空拉平屏蔽中', () => { setup(3000, 200, behind()); p.psmLevel = true; }, 'level']
  ];
  for (const [name, fn, reason] of cases) {
    fn();
    const g = Ent.psmGate(p, w, p.aimDir);
    check('门限：' + name + ' → 拒绝（' + reason + '）', !g.ok && g.reason === reason, JSON.stringify(g));
  }
  setup(3000, 200, behind());
  check('门限：条件齐备 → 通过', Ent.psmGate(p, w, p.aimDir).ok);
  setup(3000, 200, rotY(M3.V(0, 0, 1), 60));
  check('门限：光标偏 60° 就能起手', Ent.psmGate(p, w, p.aimDir).ok);
}

// ---- 4. 中止路径 ----
{
  // 4a. 速度低于阈值
  setup(3000, 200, behind());
  Ent.psmStart(p);
  p.speed = 40; p.vel = M3.mul(p.fwd, 40);              // 0.7 × vStall = 73.5
  AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60);
  Ent.stepAircraft(p, 1 / 60, w);
  check('速度低于阈值 → 转入坠落段（仍在 PSM 分支）', !!(p.psm && p.psm.fall));

  // 4b. 低空且下降
  setup(3000, 400, behind());
  Ent.psmStart(p);
  p.pos = M3.V(0, 560, 0); p.vel = M3.V(0, -60, 300); p.speed = M3.len(p.vel);
  AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60);
  Ent.stepAircraft(p, 1 / 60, w);
  check('中止：低空下降 → 退出并进入拉平，屏蔽 PSM', !p.psm && p.psmLevel && p.psmEnd.why === 'ground', p.psmEnd && p.psmEnd.why);
  const g = Ent.psmGate(p, w, p.aimDir);
  check('拉平期间再按 X 被拒', !g.ok && g.reason === 'level', JSON.stringify(g));
  check('低空中止：出口速度沿机头、大小连续', Math.abs(M3.dot(M3.norm(p.vel), p.fwd) - 1) < 1e-6 && Math.abs(M3.len(p.vel) - p.speed) < 1e-6);

  // 4c. 主动中止
  setup(3000, 200, behind());
  Ent.psmStart(p);
  for (let i = 0; i < 40; i++) { AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60); Ent.stepAircraft(p, 1 / 60, w); }
  const vb = M3.len(p.vel);
  Ent.psmAbort(p, w, 'abort');
  check('中止：主动中止 → 回到常规飞行、无突跳',
    !p.psm && p.psmEnd.why === 'abort' && Math.abs(M3.len(p.vel) - vb) < 1e-6 && p.ctrl.pitch === 0 && p.ctrl.roll === 0 && p.ctrl.yaw === 0);
  // 中止之后常规飞行继续：主路径接管，不出 NaN
  for (let i = 0; i < 120; i++) { AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60); Ent.stepAircraft(p, 1 / 60, w); }
  check('中止之后常规飞行稳定（含 0.8 s 低舵效恢复）', [p.pos.x, p.pos.y, p.pos.z, p.speed].every(Number.isFinite) && p.psmRecover <= 0);
}

// ---- 5. 数值稳定 ----
{
  const a = run(3000, 200, behind, 0.02, 15, false);
  const b = run(3000, 200, behind, 0.05, 15, false);
  if (a.end && b.end) {
    const rel = (x, y) => Math.abs(x - y) / Math.max(1e-9, Math.abs(x));
    /* 时间放宽到 10%：收敛判据是"进入 ±3° 并保持 0.3 s"，0.05 的步长在判定上有一步的量化；
       另外 steerTo 的计划平滑（STEER_ALPHA_RATE）是按调用次数而不是按时间算的，本来就带 dt。
       "结果"（能量损失、结束速度）仍要求 ≤ 5%。 */
    check('dt 0.02 / 0.05：收敛时间相对误差 ≤ 10%', rel(a.t, b.t) <= 0.10, a.t.toFixed(2) + ' vs ' + b.t.toFixed(2));
    check('dt 0.02 / 0.05：能量损失相对误差 ≤ 5%', rel(a.end.loss, b.end.loss) <= 0.05, (a.end.loss * 100).toFixed(1) + '% vs ' + (b.end.loss * 100).toFixed(1) + '%');
    check('dt 0.02 / 0.05：结束速度相对误差 ≤ 5%', rel(a.vAfter, b.vAfter) <= 0.05, a.vAfter.toFixed(0) + ' vs ' + b.vAfter.toFixed(0));
  } else check('dt 0.02 / 0.05 都能触发并收敛', false, JSON.stringify([a.gate, b.gate]));
}

// ---- 6. 机动期间尾部结算照常 ----
{
  setup(3000, 200, behind());
  p.gunHeat = 5; p.flareCd = 5;
  Ent.psmStart(p);
  for (let i = 0; i < 60; i++) { AI.steerTo(p, p.aimDir, p.ctrl, p, 1 / 60); Ent.stepAircraft(p, 1 / 60, w); }
  check('机动期间枪热 / 干扰弹冷却照常递减', p.psm && p.gunHeat < 4.1 && p.flareCd < 4.1, 'gunHeat ' + p.gunHeat.toFixed(2) + ' flareCd ' + p.flareCd.toFixed(2));
  Ent.psmAbort(p, w, 'abort');
}

console.log(bad.length ? '\n✗ ' + bad.length + ' 项失败' : '\n全部通过');
process.exit(bad.length ? 1 : 0);
