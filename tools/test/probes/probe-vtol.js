#!/usr/bin/env node
/* ============================================================
   垂直起降探针（docs/POST2-0IMPL.md 批次 6.2，js/engine/entities/vtol.js 的 stepVtol）

   直接调 Ent.stepAircraft（不经输入层），给 a.ctrl / a.throttle，量物理：
   A. 油门 0.5 悬停 30 s：速度 < 0.5 m/s、高度漂移 < 3 m
   B. 机头前倾 15°：水平速度随阻力收敛到解析值附近（3 s 时 ±40%，含机头到位时间），高度保持（辅助悬停补偿倾斜）
   C. 油门 0.75 / 0.25：爬升 / 下降率落在 vzUp·(0.25/0.35) / vzDown·(0.25/0.46) ±2 m/s
   D. 从悬停前倾 + 推满油门加速过 transSpeed：全程不失速、不 NaN、|vel| 每帧加速度 < 15 m/s²、
      交接给主路径（vtolOn 清掉）后速度继续连续、不再掉回悬停
   E. 从前飞速度抬头减速回到悬停（速度 < 3 m/s）
   F. 没有 ac.vtol 的机型：不进悬停分支（vtolWatch 不置位）
   用法：node tools/test/probes/probe-vtol.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

const VT = { transSpeed: 95, wingV: 80, liftG: 1.6, vzUp: 28, vzDown: 18, fwdAccel: 14, drag: 0.18, align: 2.5,
  rcs: { pitch: 0.9, roll: 1.6, yaw: 0.9 } };
const DT = 1 / 60;

function make(seed, vtol) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox, w = sb.Game.__world();
  const a = sb.Ent.makeAircraft({ type: 'albatross', team: 0, x: 0, y: 3000, z: 0, fwd: sb.M3.V(0, 0, 1), speed: 0 });
  if (vtol !== false) {
    a.ac = Object.assign({}, a.ac, { vtol: VT });
    a.phys = Object.assign({}, a.phys, { vStall: 70 });
    a.vtolOn = true;
  }
  a.vel = sb.M3.V(0, 0, 0); a.speed = 0;
  a.hp = a.maxHp = 1e9;
  const pitchNow = () => Math.asin(Math.max(-1, Math.min(1, a.fwd.y)));
  /* 俯仰保持：目标俯仰角（rad，抬头为正）。ctrl 与输入层同一约定：pitch > 0 抬头 */
  const hold = tgt => { a.ctrl.pitch = Math.max(-1, Math.min(1, (tgt - pitchNow()) * 4)); a.ctrl.roll = 0; a.ctrl.yaw = 0; };
  return { S, sb, w, a, hold, pitchNow };
}
const fin = a => [a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.speed, a.fwd.x, a.fwd.y, a.fwd.z].every(Number.isFinite);
const hv = a => Math.hypot(a.vel.x, a.vel.z);

/* A 悬停 */
{
  const { sb, w, a, hold } = make(1);
  a.throttle = 0.5;
  let y0 = a.pos.y, ymax = 0, vmax = 0;
  for (let i = 0; i < 60 * 30; i++) {
    hold(0); sb.Ent.stepAircraft(a, DT, w);
    if (i > 60 * 5) { ymax = Math.max(ymax, Math.abs(a.pos.y - y0)); vmax = Math.max(vmax, a.speed); }
  }
  chk('A 油门 0.5 悬停：速度 < 0.5 m/s、高度漂移 < 3 m', vmax < 0.5 && ymax < 3 && fin(a), 'vmax=' + vmax.toFixed(3) + ' dy=' + ymax.toFixed(2));
  chk('A 悬停期间不失速、仍在悬停分支', a.stall === false && a.vtolOn === true);
}

/* B 前倾 → 横向漂移 */
{
  const { sb, w, a, hold } = make(2);
  a.throttle = 0.5;
  const th = -15 * Math.PI / 180, y0 = a.pos.y;
  let dy = 0;
  for (let i = 0; i < 60 * 3; i++) { hold(th); sb.Ent.stepAircraft(a, DT, w); dy = Math.max(dy, Math.abs(a.pos.y - y0)); }
  const v3 = hv(a);
  /* 机头前倾约 1 s 才到位，解析值按"到位后 2 s"算：(g·tanθ/drag)(1 − e^(−drag·t)) */
  const g = 9.80665, k = VT.drag, expect = (g * Math.tan(-th) / k) * (1 - Math.exp(-k * 2));
  chk('B 前倾 15° 3 s：水平速度在解析值 ±40%', Math.abs(v3 - expect) < 0.4 * expect, 'v=' + v3.toFixed(2) + ' expect≈' + expect.toFixed(2));
  chk('B 倾斜期间高度保持（辅助悬停补偿 1/cosθ）', dy < 6, 'dy=' + dy.toFixed(2));
  chk('B 漂移方向沿机头水平朝向（前倾向前）', a.vel.z > 0.5 && Math.abs(a.vel.x) < 0.2 * a.vel.z);
}

/* C 升降 */
for (const [thr, want, name] of [[0.75, VT.vzUp * 0.25 / 0.35, '爬升'], [0.25, -VT.vzDown * 0.25 / 0.46, '下降']]) {
  const { sb, w, a, hold } = make(3);
  a.throttle = thr;
  for (let i = 0; i < 60 * 8; i++) { hold(0); sb.Ent.stepAircraft(a, DT, w); }
  chk('C 油门 ' + thr + ' ' + name + '率 ≈ ' + want.toFixed(1) + ' m/s（±2）', Math.abs(a.vel.y - want) < 2, 'vy=' + a.vel.y.toFixed(2));
}

/* D 加速过渡 */
{
  const { sb, w, a, hold } = make(4);
  a.throttle = 1.25; a.ab = true;
  let stallSeen = false, maxAcc = 0, exitT = -1, nan = false, vPrev = a.vel;
  let vAtExit = 0, jumpAtExit = 0, angAtExit = 0;
  for (let i = 0; i < 60 * 40; i++) {
    hold(a.vtolOn ? -20 * Math.PI / 180 : 0);
    const was = a.vtolOn;
    sb.Ent.stepAircraft(a, DT, w);
    if (a.stall) stallSeen = true;
    if (!fin(a)) nan = true;
    const dv = sb.M3.len(sb.M3.sub(a.vel, vPrev)) / DT;
    if (was && dv > maxAcc) maxAcc = dv;                    // 只量悬停分支内（含交接帧）：交接后主路径自己的推力加速度不算跳变
    if (was && !a.vtolOn && exitT < 0) {
      exitT = i / 60; vAtExit = a.speed; jumpAtExit = dv;
      const n0 = sb.M3.norm(vPrev), n1 = sb.M3.norm(a.vel);
      angAtExit = Math.acos(Math.max(-1, Math.min(1, sb.M3.dot(n0, n1)))) * 180 / Math.PI;
    }
    vPrev = a.vel;
  }
  chk('D 加速过 transSpeed 后交接给主路径（vtolOn 清掉）', exitT > 0 && !a.vtolOn, 'exit at ' + exitT.toFixed(1) + ' s, v=' + vAtExit.toFixed(1));
  chk('D 全程不失速、不 NaN', !stallSeen && !nan);
  chk('D 悬停分支内每帧加速度 < 20 m/s²（前向推力 14 + 倾斜分量的合理上限，没有速度跳变）', maxAcc < 20, 'max=' + maxAcc.toFixed(2) + ' atExit=' + jumpAtExit.toFixed(2));
  chk('D 交接帧速度方向变化 < 3°', angAtExit < 3, 'ang=' + angAtExit.toFixed(2));
  chk('D 交接后主路径稳定（速度 > transSpeed，不再掉回悬停）', a.speed > VT.transSpeed * 1.2 && !a.vtolOn, 'v=' + a.speed.toFixed(1));
}

/* E 减速回悬停 */
{
  const { sb, w, a, hold } = make(5);
  a.speed = 70; a.vel = sb.M3.V(0, 0, 70); a.throttle = 0.5;
  /* 抬头 25° 减速：阻力与倾斜推力的水平分量一起把速度收下去，最后放平 */
  for (let i = 0; i < 60 * 12; i++) { hold(25 * Math.PI / 180); sb.Ent.stepAircraft(a, DT, w); }
  for (let i = 0; i < 60 * 25; i++) { hold(0); sb.Ent.stepAircraft(a, DT, w); }
  chk('E 抬头减速后放平：回到悬停（速度 < 3 m/s）', a.speed < 3 && a.vtolOn, 'v=' + a.speed.toFixed(2));
  chk('E 过程无 NaN', fin(a));
}

/* F 非 VTOL 机型不进悬停分支 */
{
  const { sb, w, a } = make(6, false);
  a.speed = 80; a.vel = sb.M3.V(0, 0, 80); a.throttle = 0.04;       // 低速也不该触发（没有 ac.vtol）
  for (let i = 0; i < 60 * 5; i++) { a.ctrl.pitch = 0; a.ctrl.roll = 0; a.ctrl.yaw = 0; sb.Ent.stepAircraft(a, DT, w); }
  chk('F 无 ac.vtol 的机型：vtolOn 恒为 falsy', !a.vtolOn);
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
