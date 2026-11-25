#!/usr/bin/env node
/* ============================================================
   航线巡航的能量保护探针（ai/energy.js 的 routeAltMax / routeClimbCap，brain.js 的 updateRoute）

   以前航线的高度保持是开关式的：低了 150 m 就固定以 0.34（约 20°）爬升、油门固定 0.95，不看速度余量，
   也没有仰角上限；任务还把几架飞机直接放在有效升限上。结果所有走航线的 NPC 都会失速：
   水准 2/24 个种子各失速约 30 s（最低 169 m/s）、巨砾 @m8 33 s、石英 @m6 / @m12 各约 40 s、磁石 @m3 近 2 分钟。

   1. 公式性质：最高可持续高度满足 vT ≥ K·vStall 且恰好在边界上；可持续爬升梯度随高度下降、随速度下降、
      速度低于下限时为负、余量充足时不起作用（≥ 0.34，走原来的公式）；
   1b. 机头守卫：杆量对 fwd.y 的作用取决于机体朝向（俯仰杆 ∝ up.y，偏航杆 ∝ right.y），倒飞时方向反过来，
      倒飞时方向反过来。曾经因为压杆方向写死，倒飞时把机头往上推；
   2. 任务数据与公式一致：石英 / 磁石在任务里的航线高度都在各自的最高可持续高度以下，
      而它们以前的高度（11 000 / 15 800 m）在以上（所以那时必然失速）；
   3. 水准 m5 × 12 个种子（HEAD 上种子 4、6 失速）：失速 = 0，速度始终 ≥ 1.05·失速速度；
   4. 全部关卡 × 150 s：所有走航线的 NPC 失速帧 = 0（同时守住 AI 和任务数据），并打印每个机型 / 关卡的条数，
      避免「没有这架飞机也算通过」。

   实测排除过的做法（别再试）：把转弯阻力计入预算、按预算限拉杆量（水准反而 6/24 失速）、单纯加大 K（K = 1.2–1.4 更差）。

   用法：node tools/test/probes/probe-route-energy.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}

const S0 = Sim.load({ seed: 1 });
const G0 = S0.sandbox, Ent = G0.Ent, AI = G0.AI, M3 = G0.M3;
const K = 1.10;            // 与 ai/energy.js 的 RT_K 一致；改了那边要改这里
const THR = 0.95;

/* 一架停在高度 y、速度 speed、垂直速度 vy 的飞机（只用来问公式） */
function mk(id, y, speed, vy) {
  const a = Ent.makeAircraft({ type: id, team: 1, x: 0, y: y, z: 0, speed: speed });
  a.speed = speed; a.vel = M3.V(0, vy || 0, speed);
  Ent.vStallAt(a);                                   // 刷新 a._pe
  return a;
}
const vT = (a, y) => Ent.vTargetAt(a, a._pe, y, THR, false);
const vS = (a, y) => a._pe.vStall0 * Ent.stallK(y);

console.log('\n== 1. 公式性质 ==\n');
const alts = {};
{
  for (const id of ['datum', 'boulder', 'quartz', 'lodestone', 'petrel', 'frigatebird']) {
    const a = mk(id, 5000, 200), m = AI.routeAltMax(a);
    alts[id] = m;
    const atEdge = vT(a, m) >= K * vS(a, m) - 1e-6;
    const beyond = m >= 30000 || vT(a, m + 100) < K * vS(a, m + 100);
    check(id + '：最高可持续高度 ' + Math.round(m) + ' m，边界上 vT ≥ K·vStall、再高 100 m 就不行', atEdge && beyond,
      'vT=' + vT(a, m).toFixed(1) + ' vs ' + (K * vS(a, m)).toFixed(1));
  }
  check('有效升限上余量只有 5%，所以最高可持续高度一定低于有效升限（石英 / 磁石 / 水准）',
    alts.quartz < Ent.ceilingEff(mk('quartz', 5000, 200)) && alts.lodestone < Ent.ceilingEff(mk('lodestone', 5000, 200)) && alts.datum < Ent.ceilingEff(mk('datum', 5000, 200)),
    'quartz ' + Math.round(alts.quartz) + ' / lodestone ' + Math.round(alts.lodestone) + ' / datum ' + Math.round(alts.datum));

  const cap = (a, top) => AI.routeClimbCap(a, top);
  /* 这是个动态公式：刚开始爬、速度高的时候余量大，不该限制（走原来的 0.34）；速度掉下去才限制；
     梯度为负要发生在「平衡速度本身低于下限」（高度超过最高可持续高度）时。 */
  const start = mk('datum', 17300, 241, 0), c241 = cap(start, 19100);
  check('水准在 17.3 km、241 m/s 开始爬向 19.1 km（种子 4 的开局）：余量大，不限制（≥ 0.34，走原来的公式）', c241 >= 0.34, 'cap=' + c241.toFixed(3));
  const late = mk('datum', 18778, 211, 14), cLate = cap(late, 19100);
  check('同一次爬升，爬到 18.8 km、速度掉到 211 m/s（种子 4 失速前 8 秒）：被限制在 0 到 0.34 之间', cLate > 0 && cLate < 0.34, 'cap=' + cLate.toFixed(3));
  const slower = cap(mk('datum', 18778, 200, 14), 19100);
  check('同样的高度，速度越低能持续的梯度越小', slower < cLate, slower.toFixed(3) + ' < ' + cLate.toFixed(3));
  const qlow = cap(mk('quartz', 11000, 130, 0), 11000);
  check('平衡速度本身低于下限时梯度为负（石英在 11 000 m、130 m/s）：先降下来把速度找回来', qlow < 0, 'cap=' + qlow.toFixed(3));
  const lo = cap(mk('datum', 15000, 241, 0), 17000), hi = cap(mk('datum', 18000, 241, 0), 19000);
  check('同样速度，越高能持续的梯度越小', hi < lo, hi.toFixed(3) + ' < ' + lo.toFixed(3));
  const pel = cap(mk('pelican', 6000, 255, 0), 6500);
  check('余量充足时不起作用（鹈鹕 6 km，≥ 0.34，updateRoute 走原来的公式）', pel >= 0.34, 'cap=' + pel.toFixed(3));
  const climbing = cap(mk('datum', 17300, 241, 20), 19100);
  const climbingLate = cap(mk('datum', 18778, 211, 14), 19100), levelLate = cap(mk('datum', 18778, 211, 0), 19100);
  check('预测高度按当前垂直速度外推：同样的状态，正在爬升时能持续的梯度更小', climbingLate < levelLate, climbingLate.toFixed(3) + ' < ' + levelLate.toFixed(3));
  const nl = AI.routeNoseLimit;
  check('机头上限：余量充足时 0.42，被限制时跟着梯度走（梯度 + 0.05），梯度为负时上限为负',
    Math.abs(nl(1) - 0.42) < 1e-9 && Math.abs(nl(0.1) - 0.15) < 1e-9 && nl(-0.5) < 0,
    '1 → ' + nl(1).toFixed(3) + '，0.1 → ' + nl(0.1).toFixed(3) + '，−0.5 → ' + nl(-0.5).toFixed(3));
}

console.log('\n== 1b. 机头守卫：杆的方向要看机体朝向 ==\n');
{
  /* 机头 fwd.y 对杆量的响应：俯仰杆 ∝ up.y，偏航杆 ∝ right.y。守卫只压「正把机头往上推」的那根杆。 */
  const guard = (fy, upy, righty, pitch, yaw, lim) => {
    const a = { fwd: { y: fy }, up: { y: upy }, right: { y: righty } }, c = { pitch, yaw, roll: 0 };
    AI.routeNoseGuard(a, c, lim); return c;
  };
  let c = guard(0.5, 1, 0, 1, 0, 0.3);
  check('正飞、机头超限、在拉杆：压成低头，量 = 超出量 × 3（0.6）', Math.abs(c.pitch + 0.6) < 1e-9 && c.yaw === 0, 'pitch=' + c.pitch);
  c = guard(0.5, -0.98, 0, -1, 0, 0.3);
  check('倒飞、机头超限、杆是 −1（倒飞的 −1 是把机头往世界上方推）：反过来拉杆（+0.6）', Math.abs(c.pitch - 0.6) < 1e-9, 'pitch=' + c.pitch);
  c = guard(0.5, -0.98, 0, 1, 0, 0.3);
  check('倒飞、机头超限、杆是 +1（拉杆正在把机头压向世界下方）：不动 —— 这是以前的 bug：正负号写死，把它压成 −1', c.pitch === 1, 'pitch=' + c.pitch);
  c = guard(0.2, 1, 0, 1, 0, 0.3);
  check('没超限：不动', c.pitch === 1 && c.yaw === 0);
}

console.log('\n== 2. 任务数据与公式一致 ==\n');
{
  check('石英：任务航线高度 10 000 m 在最高可持续高度（' + Math.round(alts.quartz) + '）以下', 10000 <= alts.quartz);
  check('石英：以前的 11 000 m 在它之上（所以那时必然失速）', 11000 > alts.quartz);
  check('磁石：任务航线高度 14 000 m 在最高可持续高度（' + Math.round(alts.lodestone) + '）以下', 14000 <= alts.lodestone);
  check('磁石：以前的 15 800 m 在它之上（所以那时必然失速）', 15800 > alts.lodestone);
}

console.log('\n== 3. 水准 m5 × 12 个种子 ==\n');
{
  const stallSeeds = []; let minRatio = 1e9, minV = 1e9, runs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const S = Sim.load({ seed }); const G = S.sandbox, E = G.Ent;
    S.start(G.MISSIONS.findIndex(m => m.id === 'm5')); S.godMode();
    const w = S.world, p = S.player;
    const d = w.actors.find(a => a.alive && a.ac && a.ac.id === 'datum');
    if (!d) continue;
    runs++;
    let stall = 0;
    S.run(120, () => {
      p.pos = G.M3.V(0, 9000, -16000); p.hp = p.maxHp;
      if (!d.alive) return true;
      if (d.stall) stall++;
      const r = d.speed / E.vStallAt(d); if (r < minRatio) minRatio = r; if (d.speed < minV) minV = d.speed;
    });
    if (stall) stallSeeds.push('s' + seed + ':' + (stall / 60).toFixed(0) + 's');
  }
  check('水准 12 个种子全部跑完', runs === 12, runs + '/12');
  check('水准失速 = 0（HEAD 上种子 4、6 各失速约 30 s）', stallSeeds.length === 0, stallSeeds.length ? stallSeeds.join(' ') : '最低速度 ' + minV.toFixed(0) + ' m/s');
  check('水准速度始终 ≥ 1.05·失速速度', minRatio >= 1.05, '最小比值 ' + minRatio.toFixed(3));
}

console.log('\n== 4. 全部关卡 × 150 s：所有走航线的 NPC 失速帧 = 0 ==\n');
{
  const ms = S0.sandbox.MISSIONS, rows = {};
  for (let i = 0; i < ms.length; i++) {
    const S = Sim.load({ seed: 7 });
    S.start(i); S.godMode();
    const p = S.player, id = ms[i].id;
    S.run(150, (t, w) => {
      S.godMode();
      for (const a of w.actors) {
        if (!a.alive || !a.route || a === p) continue;
        const k = a.type + '@' + id;
        const r = rows[k] = rows[k] || { frames: 0, stall: 0, ymax: 0, req: 0 };
        r.frames++; if (a.stall) r.stall++; if (a.pos.y > r.ymax) r.ymax = a.pos.y;
        const q = Math.max(a.route.alt || 0, a.route.wp ? a.route.wp.y : 0); if (q > r.req) r.req = q;
      }
    });
  }
  const keys = Object.keys(rows).sort();
  for (const k of keys) {
    const r = rows[k];
    console.log('        ' + k.padEnd(18) + '帧 ' + String(r.frames).padStart(6) + '  失速 ' + String(r.stall).padStart(5) + '  要求高度 ' + String(Math.round(r.req)).padStart(6) + '  最高 ' + Math.round(r.ymax));
  }
  const total = keys.reduce((s, k) => s + rows[k].stall, 0);
  const withStall = keys.filter(k => rows[k].stall > 0);
  const types = new Set(keys.map(k => k.split('@')[0]));
  check('观察到走航线的 NPC 条目 ≥ 15 个，且包含水准 / 巨砾 / 石英 / 磁石 / 鹈鹕（不是空通过）',
    keys.length >= 15 && ['datum', 'boulder', 'quartz', 'lodestone', 'pelican'].every(t => types.has(t)), keys.length + ' 个条目，机型：' + [...types].join(','));
  check('所有走航线的 NPC 失速帧合计 = 0', total === 0, withStall.length ? '有失速：' + withStall.map(k => k + ':' + rows[k].stall).join(' ') : '0 帧');
}

console.log('\n' + (bad.length
  ? '✗ ' + bad.length + ' 项失败：\n  - ' + bad.join('\n  - ')
  : '✓ 航线能量保护探针全部通过') + '\n');
process.exit(bad.length ? 1 : 0);
