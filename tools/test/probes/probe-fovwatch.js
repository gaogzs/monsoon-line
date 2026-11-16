#!/usr/bin/env node
/* ============================================================
   FovWatch 探针（docs/POST2-0IMPL.md 5.6）

   A. 随机运动的观察对：保守调度的进 / 出事件序列，与"每帧暴力检查（同一套迟滞）"逐事件一致，时间误差 ≤ 1 帧
   B. 调度后的实际检查次数明显少于每帧检查
   C. 迟滞：在边界附近抖动的角度不会连发事件（进 0.85 倍锥、出 1.0 倍锥）
   D. 锁定广播口：lock / unlock 通知订阅者，取消订阅后不再通知
   用法：node tools/test/probes/probe-fovwatch.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}
const S = Sim.load({ seed: 1 });
const FW = S.sandbox.FovWatch;

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function mkUnit(x, y, z) { return { alive: true, pos: { x, y, z }, fwd: { x: 0, y: 0, z: 1 }, speed: 0 }; }
function setHeading(u, yaw, pitch) { const cp = Math.cos(pitch); u.fwd = { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp }; }
function angleTo(o, t) {
  const dx = t.pos.x - o.pos.x, dy = t.pos.y - o.pos.y, dz = t.pos.z - o.pos.z, d = Math.hypot(dx, dy, dz);
  const c = (o.fwd.x * dx + o.fwd.y * dy + o.fwd.z * dz) / d;
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/* A / B：多对随机运动，限制角速度在 turnMax 以内（调度的前提） */
{
  FW.clear();
  const CONE = 0.7, HYST = 0.85, DT = 1 / 60, N = 60 * 120;
  let mism = 0, evs = 0, worst = 0;
  const TURN = 2.0;       // 实际转向角速度上限 < 调度假设的 2.5
  for (let pair = 0; pair < 20; pair++) {
    const rnd = lcg(100 + pair);
    const o = mkUnit(0, 4000, 0), t = mkUnit((rnd() - 0.5) * 6000, 4000 + (rnd() - 0.5) * 800, 3000 + rnd() * 6000);
    o.speed = 250; t.speed = 220;
    let yaw = rnd() * 6.28, pitch = 0, tyaw = rnd() * 6.28;
    const fast = [], ref = [];
    const h = FW.watch({ obs: o, tgt: t, cone: CONE, hyst: HYST, onEnter: () => fast.push(['in', f]), onExit: () => fast.push(['out', f]) });
    let inside = angleTo(o, t) < CONE * HYST;                // 暴力参照用同一套迟滞
    var f = 0;
    for (f = 0; f < N; f++) {
      // 观察者的航向随机游走（受 TURN 限制）
      yaw += (Math.sin(f / 90 + pair) * 0.6 + (rnd() - 0.5) * 0.9) * TURN * DT;
      pitch = Math.max(-0.4, Math.min(0.4, pitch + (rnd() - 0.5) * 0.02));
      setHeading(o, yaw, pitch);
      tyaw += (rnd() - 0.5) * 0.02; t.pos.x += Math.sin(tyaw) * t.speed * DT; t.pos.z += Math.cos(tyaw) * t.speed * DT;
      o.pos.x += o.fwd.x * o.speed * DT; o.pos.z += o.fwd.z * o.speed * DT;
      FW.step(f * DT);
      const a = angleTo(o, t);
      if (!inside && a < CONE * HYST) { inside = true; ref.push(['in', f]); }
      else if (inside && a > CONE) { inside = false; ref.push(['out', f]); }
    }
    FW.unwatch(h);
    evs += ref.length;
    if (fast.length !== ref.length) mism++;
    else for (let i = 0; i < ref.length; i++) { if (fast[i][0] !== ref[i][0]) mism++; worst = Math.max(worst, Math.abs(fast[i][1] - ref[i][1])); }
  }
  chk('A 保守调度的事件序列与每帧暴力检查一致', mism === 0 && evs > 20, 'events=' + evs + ' mismatched pairs=' + mism);
  chk('A 事件时间误差 ≤ 1 帧', worst <= 1, 'worst=' + worst + ' frames');
  const st = FW.stats, frac = st.checks / (st.checks + st.skipped);
  chk('B 实际检查次数明显少于每帧检查', frac < 0.6, 'checks/(checks+skipped)=' + frac.toFixed(2));
}

/* C：迟滞 */
{
  FW.clear();
  const o = mkUnit(0, 0, 0), t = mkUnit(0, 0, 5000);
  const CONE = 0.7; let n = 0;
  setHeading(o, 0.9 * CONE, 0);                 // 创建订阅前先放到迟滞带内：初始判在外
  const h = FW.watch({ obs: o, tgt: t, cone: CONE, hyst: 0.85, onEnter: () => n++, onExit: () => n++, turnMax: 100 });
  let step = 0;
  // 角度在 0.85×CONE 与 CONE 之间来回抖：初始在外（设成 0.9×CONE），之后只在迟滞带内抖
  const place = a => setHeading(o, a, 0);
  place(0.9 * CONE); FW.step(step++ * 0.01);
  const first = h.inside;
  for (let i = 0; i < 200; i++) { place((0.86 + 0.13 * (i % 2)) * CONE); FW.step(step++ * 0.01); }
  chk('C 迟滞带内抖动不连发事件', first === false && n === 0, 'events=' + n);
  place(0.5 * CONE); FW.step(step++ * 0.01);
  chk('C 进到 0.85 倍锥以内才算进', h.inside === true && n === 1);
  place(1.05 * CONE); FW.step(step++ * 0.01);
  chk('C 越过 1.0 倍锥才算出', h.inside === false && n === 2);
}

/* D：锁定广播口 */
{
  const got = [];
  const off = FW.subscribe((type, o, t) => got.push(type));
  FW.lock({}, {}); FW.unlock({}, {});
  off(); FW.lock({}, {});
  chk('D lock / unlock 通知订阅者，取消订阅后不再通知', got.join(',') === 'lock,lockLost', got.join(','));
}

process.exit(ok ? 0 : 1);
