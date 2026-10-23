#!/usr/bin/env node
/**
 * 近防炮拦截探针（docs/2-0IMPL.md 4.7）
 *
 * Orca（两门 ciws20）挨反舰弹（ssm）齐射，统计每枚弹的结局：
 *   拦截   被近防判定击落（m.intercepted）
 *   命中   打到了船（船的 hp 掉了）
 *   脱靶   其余（寿命到、掠过）
 *
 * 分组：
 *   速度   ssm 原速 / 改到 900 m/s 的快弹，单枚来袭
 *   齐射   1 / 2 / 4 枚同时来，看过载（门数少于来袭数时多出来的直接突防）
 *   压制   2 枚来袭，宿主 suppressed = 0 / 0.25 / 0.5，拦截率应单调下降
 *
 * 计划里的估算：600 m/s 单门约 36%，900 m/s 约 20%（两门会更高）。以实测为准调 P_BASE。
 *
 * 用法：node tools/test/probes/probe-ciws.js [每组次数，缺省 40]
 */
'use strict';
const Sim = require('../../lib/sim');

const N = +(process.argv[2] || 40);
const DT = 1 / 60;

function run(seed, opt) {
  const S = Sim.load({ seed });
  const G = S.sandbox, V = G.M3;
  const ship = G.Ent.makeTarget({ team: 0, model: 'orca', x: 0, y: 0, z: 0, hp: 1e9, radius: 44, big: true });
  const orca = G.SHIPS.find(s => s.id === 'orca');
  G.Turret.attach(ship, orca.mounts.filter(m => m.role === 'ciws'));
  ship.suppressed = opt.sup || 0;
  /* 舰船受伤走 game.js 的 hitTarget，它读游戏自己的 world —— 所以借一关的 world 来用，清空后只放这条船 */
  G.Game.startMission(0);
  const world = G.Game.__world();
  world.actors.length = 0; world.missiles.length = 0; world.bullets.length = 0; world.particles.length = 0;
  world.targets.length = 0; world.targets.push(ship);
  world.events = []; world.silent = true; world.time = 0;

  const w = G.WEAPONS.ssm;
  const saved = { speed: w.speed };
  if (opt.speed) w.speed = opt.speed;
  // 从 8 km 外、扇面散开的方位来（齐射时各弹错开一点方位）
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < opt.n; i++) {
    const a = base + (i - (opt.n - 1) / 2) * 0.12;
    const p = V.V(Math.sin(a) * 8000, 30, Math.cos(a) * 8000);
    world.missiles.push(G.Ent.makeMissile({
      weapon: 'ssm', team: 1, pos: p, fwd: V.norm(V.sub(ship.pos, p)), speed: w.speed * 0.9, target: ship
    }));
  }
  const hp0 = ship.hp, ms = world.missiles.slice();
  for (let f = 0; f < 60 * 40 && ms.some(m => m.alive); f++) {
    G.Turret.stepAll(ship, world, DT);
    for (const m of world.missiles) G.Ent.stepMissile(m, DT, world);
    for (const b of world.bullets) G.Ent.stepBullet(b, DT, world);
    world.bullets = world.bullets.filter(b => b.alive);
    world.missiles = world.missiles.filter(m => m.alive);
    world.time += DT;
  }
  w.speed = saved.speed;
  const icpt = ms.filter(m => m.intercepted).length;
  const dmg = hp0 - ship.hp;
  // 命中数：没被拦截、并且船挨了伤害 —— 按每枚 ssm 的满伤折算
  const hit = Math.min(opt.n - icpt, Math.round(dmg / w.dmg));
  return { icpt, hit, miss: opt.n - icpt - hit };
}

function group(name, opt) {
  let icpt = 0, hit = 0, miss = 0, tot = 0;
  const runs = N * (opt.k || 1);
  for (let s = 1; s <= runs; s++) {
    const r = run(s * 7919 + (opt.seed || 0), opt);
    icpt += r.icpt; hit += r.hit; miss += r.miss; tot += opt.n;
  }
  const pct = x => (100 * x / tot).toFixed(0).padStart(3) + '%';
  console.log('  ' + name.padEnd(28) + ' 拦截 ' + pct(icpt) + '   命中 ' + pct(hit) + '   脱靶 ' + pct(miss));
  return icpt / tot;
}

console.log('== 近防炮拦截探针（Orca，两门 ciws20，每组 ' + N + ' 次）==\n');
console.log('速度（单枚来袭）');
group('ssm 原速', { n: 1 });
group('900 m/s', { n: 1, speed: 900, seed: 1 });
console.log('\n齐射（过载）');
const v1 = group('1 枚', { n: 1, seed: 2 });
group('2 枚', { n: 2, seed: 3 });
const v4 = group('4 枚', { n: 4, seed: 4 });
console.log('\n电子战压制（2 枚来袭，次数 ×3）');
// 压制每档只差 15% 的单次概率，样本要大才看得出趋势：这一组跑 3 倍次数
const s0 = group('suppressed 0', { n: 2, sup: 0, seed: 5, k: 3 });
const s1 = group('suppressed 0.25', { n: 2, sup: 0.25, seed: 5, k: 3 });
const s2 = group('suppressed 0.5', { n: 2, sup: 0.5, seed: 5, k: 3 });

const bad = [];
if (!(v4 < v1)) bad.push('齐射 4 枚的拦截率没有低于单枚（过载没体现）');
// 中间一档允许 5% 的统计误差；两端必须明显拉开
if (!(s0 > s2 + 0.03 && s1 <= s0 + 0.05 && s1 >= s2 - 0.05)) bad.push('拦截率没有随压制单调下降');
console.log('');
if (bad.length) { bad.forEach(b => console.log('✗ ' + b)); process.exitCode = 1; }
else console.log('✓ 过载与压制的趋势正确');
