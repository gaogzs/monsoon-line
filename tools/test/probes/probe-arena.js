#!/usr/bin/env node
/* ============================================================
   战区边界探针（批次 4.1）

   玩家侧（m1）：
     · 越界 4 s 渐黑 ≈ 0.5，约 8 s 渐黑到底并触发 fail.arena
     · 折返后渐黑同速退回 0，不触发失败
     · 警告区只告警，不渐黑
     · 警告 / 越界两种状态下整帧渲染（雷达边界线 + 告警栏）不抛错
   AI 侧：
     · 敌机在警告区里、机头朝外、处于"脱离"模式（朝远离玩家的方向一路向外飞）：
       无软转向的对照组会飞出去，开了软转向之后几乎不越界
     · 若干关 90 s 自然对战，没有 AI 持续越界

   用法：node tools/test/probes/probe-arena.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

/* ---------- 玩家侧 ---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game, H = S.sandbox.HudFx;
  const setup = () => { S.start(0); const w = G.__world(), p = G.__player(); p.hp = p.maxHp = 1e9; return [w, p]; };

  let [w, p] = setup();
  const OUT_Z = w.arenaDef.cz + w.arenaDef.half + 500;     // 刚越过 +z 边界
  const t0 = w.time;
  let fadeAt4 = null, failT = null;
  for (let i = 0; i < 60 * 12; i++) {
    p.pos.z = OUT_Z; p.hp = p.maxHp; S.step(1 / 60);
    if (fadeAt4 === null && w.time - t0 >= 4) fadeAt4 = w.arenaFade;
    if (w.fail && w.fail.key === 'arena') { failT = w.time - t0; break; }
  }
  chk('越界 4 s 时渐黑 ≈ 0.5', Math.abs(fadeAt4 - 0.5) < 0.03, 'fade=' + fadeAt4);
  chk('越界约 8 s 触发 fail.arena', failT !== null && Math.abs(failT - 8) < 0.2, 't=' + failT);
  chk('HudFx 渐黑跟随', H.arenaLevel() > 0.9, 'lvl=' + H.arenaLevel());

  [w, p] = setup();
  for (let i = 0; i < 60 * 4; i++) { p.pos.z = OUT_Z; p.hp = p.maxHp; S.step(1 / 60); }
  const mid = w.arenaFade;
  for (let i = 0; i < 60 * 5; i++) { p.pos.z = 0; p.hp = p.maxHp; S.step(1 / 60); }
  chk('折返后渐黑退回 0', mid > 0.4 && w.arenaFade === 0, 'mid=' + mid + ' after=' + w.arenaFade);
  chk('折返后没有失败', !(w.fail && w.fail.key === 'arena'));

  [w, p] = setup();
  const ar = w.arenaDef;
  for (let i = 0; i < 60 * 3; i++) { p.pos.z = ar.cz + ar.half - 2500; p.hp = p.maxHp; S.step(1 / 60); }
  chk('警告区 zone=warn 且不渐黑', w.arena.zone === 'warn' && w.arenaFade === 0, JSON.stringify(w.arena));

  try {
    S.render(); p.pos.z = OUT_Z; S.step(1 / 60); S.render();
    chk('警告 / 越界渲染不抛错', true);
  } catch (e) {
    chk('警告 / 越界渲染不抛错', false, String(e.stack).split('\n').slice(0, 4).join(' | '));
  }
}

/* ---------- AI 侧 ---------- */
function extendRun(steerOn) {
  const S = Sim.load({ seed: 3 });
  const G = S.sandbox.Game, A = S.sandbox.Arena, M3 = S.sandbox.M3;
  S.start(0);
  const w = G.__world(), p = G.__player(); p.hp = p.maxHp = 1e9;
  const e = w.actors.filter(a => a.team === 1 && a.alive && a.ai && !a.route && a.ai.role !== 'wingman' && a.ai.role !== 'drone')[0];
  const ar = w.arenaDef;
  if (!steerOn) w.arenaDef = null;               // 对照组：关掉软转向（玩家侧渐黑也一起关）
  e.pos.x = ar.cx + ar.half - 2000; e.pos.z = ar.cz; e.pos.y = 7000;
  e.fwd = M3.V(1, 0, 0); e.vel = M3.mul(e.fwd, e.speed || 250);
  e.ai.mode = 'extend'; e.ai.modeT = 1e9;
  let outT = 0, maxOut = 0;
  for (let i = 0; i < 60 * 40; i++) {
    p.pos.x = ar.cx + ar.half - 9000; p.pos.z = ar.cz; p.pos.y = 7000; p.hp = p.maxHp;   // 玩家在界内 9 km 处
    S.step(1 / 60);
    const st = A.state(ar, e.pos);
    if (st.zone === 'out') { outT += 1 / 60; maxOut = Math.max(maxOut, -st.edgeDist); }
  }
  return { outT, maxOut };
}
{
  const off = extendRun(false), on = extendRun(true);
  console.log('  脱离模式对照（无软转向）：越界 ' + off.outT.toFixed(1) + ' s，最远 ' + off.maxOut.toFixed(0) + ' m');
  console.log('  脱离模式（软转向）：      越界 ' + on.outT.toFixed(1) + ' s，最远 ' + on.maxOut.toFixed(0) + ' m');
  chk('对照组确实会飞出去（测试有效）', off.outT > 10);
  chk('开软转向：越界累计 < 6 s、最远越界 < 3 km', on.outT < 6 && on.maxOut < 3000);
}
for (const mi of [0, 4, 8, 11]) {
  const S = Sim.load({ seed: 5 });
  const G = S.sandbox.Game, A = S.sandbox.Arena;
  S.start(mi);
  const w = G.__world(), p = G.__player(); p.hp = p.maxHp = 1e9;
  const ar = w.arenaDef, outT = new Map();
  for (let i = 0; i < 60 * 90; i++) {
    p.hp = p.maxHp; S.step(1 / 60);
    for (const a of w.actors) {
      if (!a.alive || a.isPlayer || !a.ai || a.route) continue;
      if (A.state(ar, a.pos).zone === 'out') outT.set(a, (outT.get(a) || 0) + 1 / 60);
    }
  }
  const worst = Math.max(0, ...outT.values());
  chk(S.sandbox.MISSIONS[mi].id + ' 自然对战 90 s：没有 AI 持续越界（最多 < 10 s）', worst < 10, 'worst=' + worst.toFixed(1));
}

/* ---------- 整备点声明（批次 4.2 数据）---------- */
{
  const S = Sim.load({ seed: 1 });
  const G = S.sandbox.Game, A = S.sandbox.Arena, MS = S.sandbox.MISSIONS;
  const bad = [];
  const RS = S.sandbox.Resupply;
  for (let mi = 0; mi < MS.length; mi++) {
    S.start(mi);
    bad.push(...RS.validate(MS[mi], G.__world()));        // 字段 / 引用 / 标签 / reset 的检查在 Resupply.validate 里
  }
  chk('每关都有合法的 resupply 声明（ref 可解析且为我方整备点，edge / reset 合法）', !bad.length, bad.join('；'));

  // inEdge：m1 的 arena（cx 2000, cz -1000, half 42000, warn 6000）
  const ar = { cx: 0, cz: 0, half: 40000, warn: 6000 };
  chk('inEdge：-z 侧警告区内为真', A.inEdge(ar, { x: 0, z: -35000 }, '-z') === true);
  chk('inEdge：-z 侧界外为真', A.inEdge(ar, { x: 0, z: -45000 }, '-z') === true);
  chk('inEdge：界内不算', A.inEdge(ar, { x: 0, z: -20000 }, '-z') === false);
  chk('inEdge：另一侧不算', A.inEdge(ar, { x: 0, z: 35000 }, '-z') === false && A.inEdge(ar, { x: 35000, z: 0 }, '-z') === false);
  chk('inEdge：角落归偏得更多的那根轴', A.inEdge(ar, { x: 36000, z: -35000 }, '+x') === true && A.inEdge(ar, { x: 36000, z: -35000 }, '-z') === false);
}

process.exit(ok ? 0 : 1);
