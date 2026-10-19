#!/usr/bin/env node
/**
 * 炮塔命中率探针（docs/2-0IMPL.md 3.8）
 *
 * Orca 的一门近防炮（ciws20）对着一个假目标打，统计子弹命中率。
 * 目标在 1.2 km 外横穿，250 m/s，四种运动各 30 s：
 *
 *   straight   匀速直线平飞            期望 20–45%
 *   turn       缓慢转弯 0.1 rad/s      期望 4–20%
 *   accel      缓慢加速（200 起，15 m/s²）  期望 5–25%
 *   jink       随机急机动              期望 ≤ 7%
 *
 * 另外检查：射界外的目标绝不开火；炮塔转速受 slew 限制。
 * 命中靠调 turret.js 里的 aim.lag 与 aim.err 落进区间。
 *
 * 用法：node tools/probe-turret.js [种子数，缺省 4]
 */
'use strict';
const Sim = require('./lib/sim');

const SEEDS = +(process.argv[2] || 4);
/* v2.2 调整后的期望：近防炮加了散布、降了射速、提前量更迟钝 —— 平直依然好打，一机动就掉得很快。
   （原计划 straight ≥ 50% / turn 15–35% / accel 20–40% / jink ≤ 8%，配的是没削弱的近防炮） */
const RANGES = { straight: [0.20, 0.45], turn: [0.04, 0.20], accel: [0.05, 0.25], jink: [0, 0.07] };
const DT = 1 / 60;

function setup(S) {
  const G = S.sandbox;
  const ship = G.Ent.makeTarget({ team: 0, model: 'orca', x: 0, y: 0, z: 0, hp: 1e9, radius: 44, big: true });
  const orca = G.SHIPS.find(s => s.id === 'orca');
  ship.turrets = G.Turret.make(orca.mounts.filter(m => m.id === 'ciwsF'));
  /* 命中率考的是瞄准算法本身，所以去掉对空射程限制（airRange 800），仍按计划在 1.2 km 测 */
  ship.turrets[0].gun = Object.assign({}, ship.turrets[0].gun, { airRange: 0 });
  const tgt = { kind: 'aircraft', team: 1, alive: true, hp: 1e9, maxHp: 1e9,
    pos: G.M3.V(0, 300, 1200), vel: G.M3.V(250, 0, 0), fwd: G.M3.V(1, 0, 0), up: G.M3.V(0, 1, 0) };
  const world = { time: 0, actors: [tgt], targets: [ship], bullets: [], missiles: [], particles: [], silent: true };
  return { G, ship, tgt, world };
}

/* 线段—球：本帧弹道有没有扫过目标 */
function hitSeg(M3, p0, p1, c, r) {
  const d = M3.sub(p1, p0), dd = M3.dot(d, d);
  const s = dd > 1e-9 ? Math.max(0, Math.min(1, M3.dot(M3.sub(c, p0), d) / dd)) : 0;
  return M3.dist(M3.add(p0, M3.mul(d, s)), c) <= r;
}

function run(mode, seed) {
  const S = Sim.load({ seed: seed, init: false });
  const { G, ship, tgt, world } = setup(S);
  const M3 = G.M3, R = G.Combat.HIT_R_AIR;
  let fired = 0, hits = 0, t = 0, pass = 0, jinkT = 0, jinkA = M3.V(0, 0, 0);
  const PASS = 8;                                   // 每 8 s 重新从左边进场横穿
  function reset() {
    tgt.pos = M3.V(-1000, 300, 1200);
    tgt.vel = M3.V(mode === 'accel' ? 200 : 250, 0, 0);
  }
  reset();
  const seen = new Set();
  while (t < 30) {
    t += DT;
    if (t - pass * PASS > PASS) { pass++; reset(); }
    if (mode === 'turn') {
      const a = 0.1 * DT, v = tgt.vel;
      tgt.vel = M3.V(v.x * Math.cos(a) - v.z * Math.sin(a), 0, v.x * Math.sin(a) + v.z * Math.cos(a));
    } else if (mode === 'accel') {
      const sp = Math.min(300, M3.len(tgt.vel) + 15 * DT);   // 缓慢加速：约 1.5 g
      tgt.vel = M3.mul(M3.norm(tgt.vel), sp);
    } else if (mode === 'jink') {
      jinkT -= DT;
      if (jinkT <= 0) {
        jinkT = 0.4 + Math.random() * 0.6;
        const g = 9.81 * (3 + Math.random() * 4);
        const ang = Math.random() * Math.PI * 2;
        jinkA = M3.V(0, Math.sin(ang) * g, Math.cos(ang) * g);   // 垂直于横穿方向的过载
      }
      const sp = M3.len(tgt.vel);
      tgt.vel = M3.mul(M3.norm(M3.add(tgt.vel, M3.mul(jinkA, DT))), sp);
      if (tgt.pos.y < 120) tgt.vel.y = Math.abs(tgt.vel.y);
    }
    tgt.pos = M3.add(tgt.pos, M3.mul(tgt.vel, DT));
    tgt.fwd = M3.norm(tgt.vel);

    G.Turret.stepAll(ship, world, DT);
    for (const b of world.bullets) {
      if (!b.alive) continue;
      if (!seen.has(b)) { seen.add(b); fired++; }
      const p0 = b.pos;
      G.Ent.stepBullet(b, DT, world);
      if (b.alive && hitSeg(M3, p0, b.pos, tgt.pos, R)) { hits++; b.alive = false; }
    }
    world.bullets = world.bullets.filter(b => b.alive);
  }
  return { fired, hits };
}

/* 射界外绝不开火：目标放在近防炮射界背后（正后方 ±0.34 rad 之内打不到） */
function arcCheck() {
  const S = Sim.load({ seed: 1, init: false });
  const { G, ship, tgt, world } = setup(S);
  const M3 = G.M3;
  tgt.pos = M3.V(0, 40, -1000); tgt.vel = M3.V(0, 0, -10);
  let fired = 0;
  for (let i = 0; i < 600; i++) {
    G.Turret.stepAll(ship, world, DT);
    fired += world.bullets.length; world.bullets = [];
  }
  return fired;
}

/* 转速受限：从零位转到 +2 rad 至少要 2 / slew.yaw 秒 */
function slewCheck() {
  const S = Sim.load({ seed: 1, init: false });
  const { G, ship, tgt, world } = setup(S);
  const M3 = G.M3, tu = ship.turrets[0];
  tgt.pos = M3.V(Math.sin(2) * 1000, 300, Math.cos(2) * 1000); tgt.vel = M3.V(0, 0, 0);
  let t = 0;
  while (t < 10 && Math.abs(G.Turret.wrapPi(tu.yaw - Math.atan2(tgt.pos.x, tgt.pos.z))) > 0.02) {
    G.Turret.stepAll(ship, world, DT); world.bullets = []; t += DT;
  }
  return { t, min: 2 / tu.slew.yaw };
}

/* 贴近敌舰通场：真飞机在 300 m 高度、舷侧 500 m 外掠过 Dunkleosteus（全部炮位）。
   weave = [过载 g, 平均换向间隔 s]：每次换一个垂直于航向的随机过载方向。
   目标：平直通场必死（≥ 120 hp），一机动就大大降低（2 g ≤ 60、6 g ≤ 40） */
function passRun(weave, seed) {
  const S = Sim.load({ seed: seed, init: false });
  const G = S.sandbox, M3 = G.M3;
  const dk = G.SHIPS.find(s => s.id === 'dunkleosteus');
  const ship = G.Ent.makeTarget({ team: 1, model: 'dunkleosteus', x: 0, y: 0, z: 0, hp: 1e9, radius: 46, big: true });
  ship.turrets = G.Turret.make(dk.mounts);
  const a = G.Ent.makeAircraft({ type: 'sailfish', team: 0, pos: M3.V(500, 300, -6000) });
  a.pos = M3.V(500, 300, -6000); a.vel = M3.V(0, 0, 250); a.fwd = M3.V(0, 0, 1); a.up = M3.V(0, 1, 0);
  a.hp = a.maxHp = 1e6;
  const world = { time: 0, actors: [a], targets: [ship], bullets: [], missiles: [], particles: [], silent: true };
  const R = G.Combat.HIT_R_AIR;
  let t = 0, jT = 0, jA = M3.V(0, 0, 0);
  while (t < 48) {
    t += DT;
    if (weave) {   // 变向机动：每 weave[1] 秒换一个垂直于航向的过载方向，大小 weave[0] g
      jT -= DT;
      if (jT <= 0) {
        jT = weave[1] * (0.7 + 0.6 * Math.random());
        const ang = Math.random() * Math.PI * 2;
        jA = M3.V(Math.cos(ang) * weave[0] * 9.81, Math.sin(ang) * weave[0] * 9.81, 0);
      }
      a.vel = M3.mul(M3.norm(M3.add(a.vel, M3.mul(jA, DT))), 250);
      if (a.pos.y < 120 && a.vel.y < 0) a.vel.y = -a.vel.y;
      if (a.pos.y < 150) a.vel.y = Math.abs(a.vel.y);
    }
    a.pos = M3.add(a.pos, M3.mul(a.vel, DT)); a.fwd = M3.norm(a.vel);
    G.Turret.stepAll(ship, world, DT);
    for (const b of world.bullets) {
      if (!b.alive) continue;
      const p0 = b.pos;
      G.Ent.stepBullet(b, DT, world);
      if (!b.alive) continue;
      if (hitSeg(M3, p0, b.pos, a.pos, R)) {
        if (b.blast > 0) G.Ent.detonateShell(b, world, b.pos, a);
        else { G.Ent.damage(a, b.dmg, world, ship); b.alive = false; }
      } else if (b.fuze > 0) G.Ent.shellFuze(b, world);
    }
    world.bullets = world.bullets.filter(b => b.alive);
  }
  return 1e6 - a.hp;
}

let bad = 0;
console.log('\n== 近防炮命中率（Orca ciws20，1.2 km，250 m/s，每种 30 s × ' + SEEDS + ' 个种子） ==');
for (const mode of Object.keys(RANGES)) {
  let f = 0, h = 0;
  for (let s = 1; s <= SEEDS; s++) { const r = run(mode, s); f += r.fired; h += r.hits; }
  const rate = f ? h / f : 0, [lo, hi] = RANGES[mode];
  const ok = rate >= lo && rate <= hi;
  if (!ok) bad++;
  console.log('  ' + mode.padEnd(9) + (rate * 100).toFixed(1).padStart(6) + '%   ' +
    ('发射 ' + f + ' / 命中 ' + h).padEnd(22) + '期望 ' + Math.round(lo * 100) + '–' + Math.round(hi * 100) + '%' + (ok ? '' : '   ✗'));
}
const af = arcCheck();
console.log('\n  射界外开火数：' + af + (af ? '   ✗' : ''));
if (af) bad++;
const sc = slewCheck();
const slewOk = sc.t >= sc.min * 0.95;
console.log('  转 2 rad 用时 ' + sc.t.toFixed(2) + ' s（下限 ' + sc.min.toFixed(2) + ' s）' + (slewOk ? '' : '   ✗'));
if (!slewOk) bad++;
console.log('\n== 贴近敌舰通场（Dunkleosteus 全炮位，300 m 高、舷侧 500 m，250 m/s） ==');
for (const [name, weave, lo, hi] of [['平直通场', null, 120, 1e9], ['轻微机动 2g', [2, 1.5], 0, 60], ['大幅机动 6g', [6, 0.8], 0, 40]]) {
  const xs = [];
  for (let s = 1; s <= SEEDS; s++) xs.push(passRun(weave, s));
  const m = xs.reduce((p, q) => p + q, 0) / xs.length;
  const ok = m >= lo && m <= hi;
  if (!ok) bad++;
  console.log('  ' + name + '  平均掉血 ' + m.toFixed(1) + ' hp（' + xs.map(x => x.toFixed(0)).join(' / ') + '）  期望 ' + (hi > 1e8 ? '≥ ' + lo : lo + '–' + hi) + (ok ? '' : '   ✗'));
}
process.exit(bad ? 1 : 0);
