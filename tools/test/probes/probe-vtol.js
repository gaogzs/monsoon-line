#!/usr/bin/env node
/* ============================================================
   垂直起降探针（docs/POST2-0IMPL.md 批次 6.2，js/engine/entities/vtol.js，v3.7.1 重设计后的语义）

   推力只代表期望的前进速度：0% 静止悬浮、50% = 有效 vStall、100% = 军推；不下坠由实际速度决定
   （速度 < vStall 喷口转向补升力缺口）；减速板才悬浮下降；低速时仰头上升。
   直接调 Ent.stepAircraft（不经输入层），给 a.ctrl / a.throttle / a.ab / a.brake，量物理，用真正的 seahorse 数据：
   A. 推力 0%：从 120 m/s 前飞减速到 < 0.5 m/s、高度漂移 < 3 m；放平后完全静止
   B. 推力 25% / 50%：收敛到 vS/2、vS（±3 m/s），高度保持
   C. 喷口角：悬停 ≈ 90°、加速起步 40–70°、v ≥ vStall ≈ 0°、随速度单调不增
   D. 减速板：悬停下降率 ≈ vzDown（±2）、水平静止；接近 vStall 的速度上竖直指令很小（gate = 1 − wk）
   E. 仰头上升：推力 0% 仰 30° 爬升 ≈ vzUp·sin30°（±2）；低头 30° 不下降
   M. 喷口出力随高度衰减：3000 m 悬停负荷 ≈ g/(accel·η)、越高越高；8500 m 满指令托不住被迫下降，降到够用的高度停住
   L. 直升机式平移：悬停时倾斜机身，升力喷口的水平分量推着飞机往倾斜方向走（低头前 / 仰头后 / 右滚右 / 左滚左），
      高度保持，放平后阻力收住；放平的悬停纹丝不动
   F. 0 → 100% 加速过 vStall：交接帧加速度 < 20 m/s²、速度方向变化 < 3°、全程不失速、不 NaN
   G. 高速（200 m/s，主路径）改推力只改速度，vtolOn 不置位
   H. 低速机动：90° 偏航，速度只由推力目标决定（±4 m/s）
   I. HUD：悬停 / 过渡 / 普通状态下整帧都能画出来
   J. 没有 ac.vtol 的机型不进悬停分支
   K. VTOL_THR_IDLE 与 Game.THR_IDLE 一致；海马喷口推重比 jetT ≥ 1.5
   用法：node tools/test/probes/probe-vtol.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

const DT = 1 / 60, G = 9.80665, IDLE = 0.04;
const R = Math.PI / 180;

function make(seed, type, y0) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox, w = sb.Game.__world();
  const a = sb.Ent.makeAircraft({ type: type || 'seahorse', team: 0, x: 0, y: y0 || 3000, z: 0, fwd: sb.M3.V(0, 0, 1), speed: 0 });
  a.vel = sb.M3.V(0, 0, 0); a.speed = 0;
  a.hp = a.maxHp = 1e9;
  if (a.ac.vtol) a.vtolOn = true;
  const vt = a.ac.vtol;
  const vS = () => sb.Ent.vStallAt(a);                       // 有效 vStall（随高度）
  /* 推力百分比（HUD：慢车 0%、军推 100%、> 100% 加力；< 0 减速板）→ 油门轴，同时写 ab / brake（输入层的约定） */
  const thr = pct => {
    if (pct < 0) { a.throttle = IDLE * 0.5; a.ab = false; a.brake = true; return; }
    a.brake = false;
    if (pct > 100) { a.throttle = 1.25; a.ab = true; return; }
    a.ab = false; a.throttle = IDLE + pct / 100 * (1 - IDLE);
  };
  const pitchNow = () => Math.asin(Math.max(-1, Math.min(1, a.fwd.y)));
  const rollNow = () => Math.asin(Math.max(-1, Math.min(1, -a.right.y)));          // 右滚（右翼向下）为正
  const hold = (tgt, roll) => { a.ctrl.pitch = Math.max(-1, Math.min(1, (tgt - pitchNow()) * 4)); a.ctrl.roll = Math.max(-1, Math.min(1, ((roll || 0) - rollNow()) * 4)); a.ctrl.yaw = 0; };
  const run = (secs, pitch, each, roll) => { for (let i = 0; i < secs * 60; i++) { hold(pitch === undefined ? 0 : pitch, roll); sb.Ent.stepAircraft(a, DT, w); if (each) each(i); } };
  return { S, sb, w, a, vt, vS, thr, hold, run, pitchNow };
}
const fin = a => [a.pos.x, a.pos.y, a.pos.z, a.vel.x, a.vel.y, a.vel.z, a.speed, a.fwd.x, a.fwd.y, a.fwd.z].every(Number.isFinite);
const hv = a => Math.hypot(a.vel.x, a.vel.z);

/* A 推力 0%：静止悬浮 */
{
  const { sb, a, thr, run } = make(1);
  a.speed = 120; a.vel = sb.M3.V(0, 0, 120);                 // 主路径速度起步，要先减速再进悬停分支
  thr(0);
  run(15, 0);
  const y0 = a.pos.y;
  let vmax = 0, dy = 0;
  const watch = () => { vmax = Math.max(vmax, a.speed); dy = Math.max(dy, Math.abs(a.pos.y - y0)); };
  run(10, 0, watch);
  chk('A 推力 0%：从 120 m/s 减速到静止、高度保持', vmax < 0.5 && dy < 3 && a.vtolOn && fin(a), 'v=' + vmax.toFixed(3) + ' dy=' + dy.toFixed(2));
  chk('A 推力 0%、机身放平：完全静止（不倾斜就不平移）', a.vtolVh && Math.hypot(a.vtolVh.x, a.vtolVh.z) < 0.01, 'vh=' + Math.hypot(a.vtolVh.x, a.vtolVh.z).toFixed(4));
  chk('A 悬停：不失速、无 NaN', a.stall === false && fin(a));
}

/* B 推力 25% / 50%：期望速度 = vS·(x/0.5) */
for (const [pct, k] of [[25, 0.5], [50, 1.0]]) {
  const { a, thr, run, vS } = make(2);
  thr(pct);
  run(25, 0);
  const want = vS() * k, y0 = a.pos.y;
  let dy = 0;
  run(15, 0, () => { dy = Math.max(dy, Math.abs(a.pos.y - y0)); });
  chk('B 推力 ' + pct + '%：收敛到 ' + want.toFixed(1) + ' m/s（±3）且高度保持', Math.abs(a.speed - want) < 3 && dy < 3, 'v=' + a.speed.toFixed(1) + ' dy=' + dy.toFixed(2));
}

/* C 喷口角随实际速度变化，与推力指令无关 */
{
  const { a, thr, run, vS, sb, w } = make(3);
  thr(0); run(3, 0);
  chk('C 悬停喷口朝下 ≈ 90°', a.vtolNoz / R > 89, 'noz=' + (a.vtolNoz / R).toFixed(1) + '°');
  thr(100);
  let first = null, prev = null, mono = true, atVs = null, n = 0;
  for (let i = 0; i < 60 * 30 && a.vtolOn; i++) {
    a.ctrl.pitch = 0; a.ctrl.roll = 0; a.ctrl.yaw = 0;
    sb.Ent.stepAircraft(a, DT, w);
    const d = a.vtolNoz / R;
    if (first === null) first = d;
    if (prev !== null && d > prev + 0.5) mono = false;
    prev = d; n++;
    if (a.speed >= vS()) { atVs = d; break; }
  }
  chk('C 起步加速（推力指令不变）：喷口偏下 40–70°（含主路径的推力渐入系数）', first > 40 && first < 70, 'noz0=' + first.toFixed(1) + '°');
  chk('C 速度升高喷口角单调不增、到 vStall 回到 ≈ 0°', mono && atVs !== null && atVs < 1, 'at vStall=' + (atVs === null ? 'n/a' : atVs.toFixed(2)) + '° steps=' + n);
}

/* D 减速板 */
{
  const { a, thr, run, vt } = make(4);
  thr(0); run(4, 0);
  const x0 = a.pos.x, z0 = a.pos.z;
  thr(-1);
  run(6, 0);
  chk('D 减速板：悬停下降率 ≈ vzDown（±2）、水平静止', Math.abs(a.vel.y + vt.vzDown) < 2 && hv(a) < 0.5 && Math.hypot(a.pos.x - x0, a.pos.z - z0) < 1,
    'vy=' + a.vel.y.toFixed(2) + ' hv=' + hv(a).toFixed(3));
  const m = make(4);
  m.a.speed = 0.95 * m.vS(); m.a.vel = m.sb.M3.V(0, 0, m.a.speed);
  m.thr(-1); m.run(1 / 60, 0);
  chk('D 接近 vStall 的速度上拉减速板：竖直指令很小（翼托着，gate 小），不是悬停下降率', Math.abs(m.a.vtolVz) < 0.3 * m.vt.vzDown, 'vz指令=' + m.a.vtolVz.toFixed(2));
}

/* E 仰头上升 */
{
  const up = make(5), dn = make(5);
  up.thr(0); dn.thr(0);
  up.run(10, 30 * R); dn.run(10, -30 * R);
  const want = up.vt.vzUp * Math.sin(30 * R);
  chk('E 推力 0% 仰 30°：爬升 ≈ vzUp·sin30° = ' + want.toFixed(1) + ' m/s（±2）', Math.abs(up.a.vel.y - want) < 2, 'vy=' + up.a.vel.y.toFixed(2));
  chk('E 推力 0% 低头 30°：不下降（下降只认减速板）', Math.abs(dn.a.vel.y) < 0.5, 'vy=' + dn.a.vel.y.toFixed(2));
}

/* F 加速过渡 */
{
  const { sb, a, thr, hold, vS, w } = make(6);
  thr(120);
  let stallSeen = false, maxAcc = 0, exitT = -1, nan = false, vPrev = a.vel, angAtExit = 0, vAtExit = 0;
  for (let i = 0; i < 60 * 40; i++) {
    hold(0);
    const was = a.vtolOn;
    sb.Ent.stepAircraft(a, DT, w);
    if (a.stall) stallSeen = true;
    if (!fin(a)) nan = true;
    const dv = sb.M3.len(sb.M3.sub(a.vel, vPrev)) / DT;
    if (was && dv > maxAcc) maxAcc = dv;
    if (was && !a.vtolOn && exitT < 0) {
      exitT = i / 60; vAtExit = a.speed;
      angAtExit = Math.acos(Math.max(-1, Math.min(1, sb.M3.dot(sb.M3.norm(vPrev), sb.M3.norm(a.vel))))) / R;
    }
    vPrev = a.vel;
  }
  chk('F 加速过 vStall 后交接给主路径（vtolOn 清掉）', exitT > 0 && !a.vtolOn, 'exit at ' + exitT.toFixed(1) + ' s, v=' + vAtExit.toFixed(1));
  chk('F 全程不失速、不 NaN', !stallSeen && !nan);
  chk('F 悬停分支内每帧加速度 < 20 m/s²、交接帧速度方向变化 < 3°', maxAcc < 20 && angAtExit < 3, 'max=' + maxAcc.toFixed(2) + ' ang=' + angAtExit.toFixed(2));
  chk('F 交接后主路径稳定（速度高于进入速度，不再掉回悬停）', a.speed > vS() * 1.5 && !a.vtolOn, 'v=' + a.speed.toFixed(1));
}

/* G 高速：推力只改速度 */
{
  const { sb, a, thr, hold, w } = make(7);
  a.vtolOn = false; a.speed = 200; a.vel = sb.M3.V(0, 0, 200);
  thr(80);
  let on = false;
  for (let i = 0; i < 60 * 10; i++) { hold(0); sb.Ent.stepAircraft(a, DT, w); if (a.vtolOn) on = true; }
  const v80 = a.speed;
  thr(100);
  for (let i = 0; i < 60 * 10; i++) { hold(0); sb.Ent.stepAircraft(a, DT, w); if (a.vtolOn) on = true; }
  chk('G 200 m/s 主路径：推力 80% → 100% 只改速度（速度升高），不进悬停分支', !on && a.speed > v80 + 5 && a.speed < 400, 'v80=' + v80.toFixed(1) + ' v100=' + a.speed.toFixed(1));
}

/* H 低速机动：转向不改变推力目标 */
{
  const { a, thr, run, vS, sb, w } = make(8);
  thr(25);
  run(25, 0);
  const want = vS() * 0.5;
  for (let i = 0; i < 120; i++) { a.ctrl.pitch = 0; a.ctrl.roll = 0; a.ctrl.yaw = 1; sb.Ent.stepAircraft(a, DT, w); }
  run(5, 0);
  chk('H 低速偏航 ≈ 100° 后速度仍收敛到推力目标（±4 m/s）', Math.abs(a.speed - want) < 4 && a.vtolOn, 'v=' + a.speed.toFixed(1) + ' want=' + want.toFixed(1));
}

/* M 喷口出力上限随高度衰减：高处同样悬停要推更高的指令，满指令仍不够就被迫下降，降到密度够了才停 */
{
  const m3 = make(13, 'seahorse', 3000);
  m3.thr(0); m3.run(10, 0);
  const rho = (sb, y) => sb.Ent.$.airDensity(y) / sb.Ent.$.RHO0;
  const eta = (m, y) => Math.pow(rho(m.sb, y), m.vt.jetExp);
  const ratio = m3.a._pe.accel / m3.a.phys.accel;                    // 挂载折扣
  const want3 = G / (m3.vt.jetT * G * ratio * eta(m3, 3000));
  chk('M 3000 m 悬停：喷口负荷 ≈ g /（jetT·G × 挂载折扣 × η）= ' + (want3 * 100).toFixed(0) + '%（±3%），托得住、不下沉', Math.abs(m3.a.vtolJet - want3) < 0.03 && !m3.a.vtolSink && Math.abs(m3.a.vel.y) < 0.2, 'jet=' + (m3.a.vtolJet * 100).toFixed(1) + '% sink=' + (m3.a.vtolSink || 0));
  const lo = make(13, 'seahorse', 1500); lo.thr(0); lo.run(10, 0);
  chk('M 越高喷口负荷越高（1500 m < 3000 m）', lo.a.vtolJet < m3.a.vtolJet, (lo.a.vtolJet * 100).toFixed(1) + '% < ' + (m3.a.vtolJet * 100).toFixed(1) + '%');
  const hi = make(13, 'seahorse', 8500); hi.thr(0);
  let minVy = 0, maxJet = 0;
  hi.run(25, 0, () => { minVy = Math.min(minVy, hi.a.vel.y); maxJet = Math.max(maxJet, hi.a.vtolJet); });
  chk('M 8500 m 悬停：喷口满指令仍托不住，被迫下降（负荷 ≥ 100%、下沉 > 3 m/s）', maxJet >= 1 && minVy < -3, 'maxJet=' + (maxJet * 100).toFixed(0) + '% minVy=' + minVy.toFixed(1));
  const y0 = hi.a.pos.y;
  hi.run(240, 0);
  chk('M 下降到喷口托得住的高度后停住（活着、没有继续下沉、速度 ≈ 0），悬停升限低于 8500 m', hi.a.alive && hi.a.pos.y < 8500 - 300 && hi.a.pos.y > 5000 && !hi.a.vtolSink && hi.a.speed < 0.5 && hi.a.vtolJet <= 1.0001,
    'y=' + hi.a.pos.y.toFixed(0) + ' jet=' + (hi.a.vtolJet * 100).toFixed(1) + '% sink=' + (hi.a.vtolSink || 0).toFixed(2));
}

/* L 直升机式平移：悬停时倾斜机身，升力喷口的水平分量把飞机推向倾斜的方向（低头向前、仰头向后、右滚向右），松开后收住 */
{
  const fwdOf = (a, sb) => sb.M3.norm(sb.M3.V(a.fwd.x, 0, a.fwd.z));
  const along = (a, d) => a.vel.x * d.x + a.vel.z * d.z;
  const mk = (pitchDeg, rollDeg) => {
    const m = make(12);
    m.thr(0); m.run(3, 0);
    const d = fwdOf(m.a, m.sb), r = m.sb.M3.norm(m.sb.M3.V(m.a.right.x, 0, m.a.right.z)), y0 = m.a.pos.y;
    m.run(8, pitchDeg * R, null, rollDeg * R);
    return { m, d, r, y0 };
  };
  const dn = mk(-20, 0);
  const want = G * Math.tan(20 * R) / dn.m.vt.drag * (1 - Math.exp(-dn.m.vt.drag * 7));         // 倾斜到位后约 7 s 的解析值
  chk('L 低头 20° 悬停 8 s：向机头方向平移，速度 ≈ g·tanθ/drag 的收敛值（±35%）', Math.abs(along(dn.m.a, dn.d) - want) < 0.35 * want, 'v=' + along(dn.m.a, dn.d).toFixed(2) + ' expect≈' + want.toFixed(2));
  chk('L 平移的同时高度保持（垂直喷口加量补偿竖直分量）', Math.abs(dn.m.a.pos.y - dn.y0) < 3, 'dy=' + (dn.m.a.pos.y - dn.y0).toFixed(2));
  const up = mk(20, 0);
  chk('L 仰头 20° 悬停：向机尾方向平移', along(up.m.a, up.d) < -3, 'v=' + along(up.m.a, up.d).toFixed(2));
  const rr = mk(0, 15), rl = mk(0, -15);
  const sr = rr.m.a.vel.x * rr.r.x + rr.m.a.vel.z * rr.r.z, sl = rl.m.a.vel.x * rl.r.x + rl.m.a.vel.z * rl.r.z;
  chk('L 右滚 15° 向右平移、左滚 15° 向左平移（对称）', sr > 2 && sl < -2 && Math.abs(sr + sl) < 0.2 * Math.abs(sr), 'right=' + sr.toFixed(2) + ' left=' + sl.toFixed(2));
  dn.m.run(25, 0);
  chk('L 机身放平后平移被阻力收住（< 0.5 m/s）', hv(dn.m.a) < 0.5, 'hv=' + hv(dn.m.a).toFixed(3));
}

/* I HUD */
{
  const { sb, w, a } = make(9);
  const p = sb.Game.__player();
  sb.Renderer.setCamera(p.pos, p.fwd, p.up, 58);
  p.ac = Object.assign({}, p.ac, { vtol: a.ac.vtol });
  let err = null;
  for (const [on, speed, vel, noz] of [[true, 20, [5, 2, 18], 0.6], [true, 0, [0, 0, 0], 1.5], [true, 70, [0, 1, 70], 0.1], [false, 300, [0, 0, 300], 0]]) {
    p.vtolOn = on; p.speed = speed; p.vel = sb.M3.V(vel[0], vel[1], vel[2]); p.vtolWk = Math.min(1, (speed / 79) ** 2); p.vtolVz = 10; p.vtolNoz = noz;
    try { sb.HUD.draw(w, p, DT, {}); } catch (e) { err = e; }
  }
  chk('I 悬停 / 过渡 / 普通状态下整帧 HUD 都能画出来', !err, err ? err.message : '');
  const t1 = sb.T('ui.hud.hover.hs', { v: '3.5' }), t2 = sb.T('ui.hud.hover.noz', { a: '42' });
  chk('I 悬停 HUD 文案的占位符被填进数字（项目用 {{x}} 双花括号）', t1.indexOf('3.5') >= 0 && t2.indexOf('42') >= 0 && t1.indexOf('{') < 0 && t2.indexOf('{') < 0, t1 + ' | ' + t2);
}

/* J 非 VTOL 机型 */
{
  const { sb, a, w } = make(10, 'albatross');
  a.speed = 80; a.vel = sb.M3.V(0, 0, 80); a.throttle = 0.04;
  for (let i = 0; i < 60 * 5; i++) { a.ctrl.pitch = 0; a.ctrl.roll = 0; a.ctrl.yaw = 0; sb.Ent.stepAircraft(a, DT, w); }
  chk('J 无 ac.vtol 的机型：vtolOn 恒为 falsy', !a.vtolOn);
}

/* K 常量与预算 */
{
  const { sb, a } = make(11);
  chk('K VTOL_THR_IDLE 与 Game.THR_IDLE 一致', sb.Ent.$.VTOL_THR_IDLE === sb.Game.$.THR_IDLE, sb.Ent.$.VTOL_THR_IDLE + ' vs ' + sb.Game.$.THR_IDLE);
  chk('K 海马空载喷口推重比 jetT ≥ 1.5（海平面悬停有余量）', a.ac.vtol.jetT >= 1.5, 'jetT=' + a.ac.vtol.jetT);
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
