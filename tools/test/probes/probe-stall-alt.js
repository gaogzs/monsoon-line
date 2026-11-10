#!/usr/bin/env node
/* ============================================================
   失速速度随动压变化探针

   vStall(y) = vStall₀·√(ρ₀/ρ(y))；推力一侧的包线（physics.js「失速速度随动压变化」）：
     有效升限 ceilingEff = min(数据升限, 失速升限)，目标速度到升限处刚好是 1.1·vStall(y)。

   验证（每个机型）：
     1. 海平面 vStallAt 等于数据值；高度越高越大，且正好是 √(ρ₀/ρ) 倍
     2. ceilingEff ≤ 数据升限；升限处军推速度 ≥ 1.1·vStall(y)·0.98；升限以下整段都有余量
     3. 升限以下 800 m 平飞（军推、飞控保持水平）60 s：不失速、高度不掉
     4. 升限以上 2500 m：军推也撑不住 —— 会失速并掉高度，而且坠回升限以下之后能改出

   用法：node tools/test/probes/probe-stall-alt.js [--verbose]
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const Ent = G.Ent, AI = G.AI, M3 = G.M3;
const VERBOSE = process.argv.indexOf('--verbose') >= 0;

S.start(0);
const w = G.Game.__world();

const bad = [];
function check(name, cond, detail) {
  if (!cond || VERBOSE) console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}

const LEVEL = M3.V(0, 0, 1);

/* 新建一架指定机型、指定高度与速度的飞机，不挂载（loadFactor 0），油门军推。 */
function make(ac, y, spd) {
  const a = Ent.makeAircraft({ type: ac.id, team: 0, x: 0, y: y, z: 0, fwd: M3.V(0, 0, 1), speed: spd });
  a.loadFactor = 0; a.loadModel = null;
  a.throttle = 1; a.ab = false; a.brake = false;
  a.ctrl = { pitch: 0, roll: 0, yaw: 0 };
  return a;
}
/* 飞控保持水平，跑 secs 秒；返回 { a, stallT, minY, maxY } */
function fly(a, secs, dt) {
  dt = dt || 1 / 30;
  let stallT = 0, minY = a.pos.y, maxY = a.pos.y, t = 0;
  while (t < secs) {
    AI.steerTo(a, LEVEL, a.ctrl, a, dt);
    Ent.stepAircraft(a, dt, w);
    if (a.stall) stallT += dt;
    minY = Math.min(minY, a.pos.y); maxY = Math.max(maxY, a.pos.y);
    t += dt;
    if (!Number.isFinite(a.pos.y) || !Number.isFinite(a.speed)) return { a: a, nan: true };
  }
  return { a: a, stallT: stallT, minY: minY, maxY: maxY };
}

const rows = [];
for (const ac of G.AIRCRAFT) {
  const ph = ac.phys, id = ac.id;
  const probe = make(ac, 0, ph.vMil);
  const ceilD = ac.ceiling || 16000;

  // 1. 失速速度随高度（makeAircraft 把 y=0 当缺省 3000，这里显式放回海平面）
  probe.pos.y = 0;
  check(id + '：海平面 vStallAt = 数据值', Math.abs(Ent.vStallAt(probe) - ph.vStall) < 1e-6, Ent.vStallAt(probe).toFixed(1));
  let prev = 0, mono = true, exact = true;
  for (const y of [0, 3000, 6000, 9000, 12000, 15000, 18000, 21000]) {
    probe.pos.y = y;
    const v = Ent.vStallAt(probe);
    if (v < prev) mono = false;
    prev = v;
    const want = ph.vStall * Math.sqrt(1.225 / Ent.airDensity(y));
    if (Math.abs(v - want) > 1e-6) exact = false;
  }
  check(id + '：vStall 随高度单调增大', mono);
  check(id + '：vStall = vStall₀·√(ρ₀/ρ)', exact);

  // 2. 升限
  const cEff = Ent.ceilingEff(probe);
  probe.pos.y = cEff;
  const vTopC = ph.vMil * Ent.thrustK(probe, cEff);
  const vStC = Ent.vStallAt(probe);
  check(id + '：ceilingEff ≤ 数据升限', cEff <= ceilD, cEff + ' vs ' + ceilD);
  check(id + '：升限处军推速度 ≥ 1.1·vStall', vTopC >= 1.1 * vStC * 0.98, vTopC.toFixed(0) + ' vs ' + (1.1 * vStC).toFixed(0));
  let kOk = true;
  for (let y = 0; y <= cEff; y += 500) {
    probe.pos.y = y;
    if (ph.vMil * Ent.thrustK(probe, y) < Ent.vStallAt(probe) * 1.05) { kOk = false; break; }
  }
  check(id + '：升限以下整段军推速度都高于 vStall 余量', kOk);

  // 3. 升限以下 800 m 平飞
  const yA = Math.max(1500, cEff - 800);
  probe.pos.y = yA;
  const aIn = make(ac, yA, ph.vMil * Ent.thrustK(probe, yA));
  const rIn = fly(aIn, 60);
  check(id + '：升限以下 800 m 平飞 60 s 不失速、不掉高度',
    !rIn.nan && rIn.stallT === 0 && rIn.minY > yA - 600,
    rIn.nan ? 'NaN' : 'stall ' + rIn.stallT.toFixed(1) + ' s, y ' + rIn.minY.toFixed(0) + '…' + rIn.maxY.toFixed(0) + ' / v ' + rIn.a.speed.toFixed(0));

  // 4. 升限以上 2500 m：失速下沉，回到升限以下后能改出
  const yB = Math.min(cEff + 2500, 22000);
  probe.pos.y = yB;
  const aUp = make(ac, yB, ph.vMil * Ent.thrustK(probe, yB));
  const rUp = fly(aUp, 90);
  check(id + '：升限以上 2500 m 撑不住（会失速并掉高度）', !rUp.nan && rUp.stallT > 0 && rUp.a.pos.y < yB - 300,
    rUp.nan ? 'NaN' : 'stall ' + rUp.stallT.toFixed(1) + ' s, y ' + yB + ' → ' + rUp.a.pos.y.toFixed(0));
  const rRec = fly(rUp.a, 60);
  check(id + '：坠回升限以下后能改出（最后不再失速）', !rRec.nan && !rRec.a.stall,
    rRec.nan ? 'NaN' : 'y ' + rRec.a.pos.y.toFixed(0) + ' v ' + rRec.a.speed.toFixed(0) + ' cEff ' + cEff);

  rows.push([id, ph.vStall, ph.vMil, ceilD, cEff]);
}

console.log('\n机型           vStall₀  vMil  数据升限  有效升限  11km失速速度');
for (const r of rows) {
  const v11 = (r[1] * Math.sqrt(1.225 / Ent.airDensity(11000))).toFixed(0);
  console.log('  ' + String(r[0]).padEnd(13) + String(r[1]).padStart(6) + String(r[2]).padStart(7) + String(r[3]).padStart(9) + String(r[4]).padStart(9) + String(v11).padStart(10));
}

console.log(bad.length ? '\n✗ ' + bad.length + ' 项失败' : '\n全部通过');
process.exit(bad.length ? 1 : 0);
