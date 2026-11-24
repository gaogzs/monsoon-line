#!/usr/bin/env node
/* ============================================================
   加力羽流探针（Ent.exhaustPlumes + 机型数据 exhaust.size / exhaust.color）

   以前每 0.028 s 轮流从一个喷口吐一个圆粒子，像"隔一会吐一个火球"，还要消耗模拟的随机数。现在：

   1. 所有喷口同时都有羽流（每帧现生成一份临时粒子列表），位置就是模型里喷口的位置；
   2. 渐细渐暗：非核心的光带越长越细、颜色越冷；激波菱形越往下游越小、间距越短；
   3. 尺度跟喷口走：exhaust.size 按喷口顺序生效，同时乘粗细、长度；0 = 该喷口不喷火；缺的补 1；数字 = 统一；
   4. 配色：预设名 / 对象覆盖；非法的项回退默认；所有颜色都是 #rrggbb（WebGL 粒子只认这个）；
   5. 强度 abFx 点火渐亮、熄火渐灭，不是开关；
   6. 不消耗随机数、不往 world.particles 里加粒子（纯演出）；
   7. 距离细节等级：太远不画，中距离只画简版；
   8. 确定性：同样的输入同样的输出，闪烁只随 world.time 变。

   用法：node tools/test/probes/probe-exhaust.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const Ent = G.Ent;

const bad = [];
function check(name, cond, detail) {
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : ''));
  if (!cond) bad.push(name);
}
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/* 造一架开着加力的飞机；exhaust 非空时换掉它的 exhaust 数据（同时丢掉缓存的配色） */
function mk(type, exhaust, ab) {
  const a = Ent.makeAircraft({ type, team: 1, x: 0, y: 3000, z: 0 });
  if (exhaust !== undefined) a.ac = Object.assign({}, a.ac, { exhaust: exhaust, __plumePal: undefined });
  a.ab = ab !== false; a.abFx = ab === false ? 0 : 1;
  return a;
}
function plumes(a, cam, time) {
  const world = { actors: [a], particles: [], time: time === undefined ? 3.21 : time };
  return Ent.exhaustPlumes(world, cam);
}
/* 按喷口出口位置给粒子分组（光带的头就在喷口出口） */
function byNozzle(list) {
  const g = {};
  for (const p of list) if (p.tail) {
    const k = [p.pos.x, p.pos.y, p.pos.z].map(v => v.toFixed(3)).join(',');
    (g[k] = g[k] || []).push(p);
  }
  return Object.keys(g).map(k => g[k]);
}
const maxTail = grp => Math.max.apply(null, grp.map(p => p.tail));

console.log('\n== 1. 所有喷口同时都有羽流 ==\n');
for (const [type, n] of [['frigatebird', 2], ['seahorse', 4], ['skua', 4]]) {
  const a = mk(type), noz = Ent.nozzlesOf(a.model);
  const groups = byNozzle(plumes(a));
  check(type + '：' + noz.length + ' 个喷口，同一帧出 ' + groups.length + ' 道羽流', noz.length === n && groups.length === n && groups.every(g => g.length === 5), groups.map(g => g.length).join('/'));
}
{
  const a = mk('frigatebird'), noz = Ent.nozzlesOf(a.model);
  const heads = byNozzle(plumes(a)).map(g => g[0].pos);
  check('羽流的头就在模型里的喷口位置（x = ±0.45，z = 喷口出口）',
    noz.every(nz => heads.some(h => near(h.x, a.pos.x + nz[0], 1e-6) && near(h.y, a.pos.y + nz[1], 1e-6) && near(h.z, a.pos.z + nz[2], 1e-6))),
    heads.map(h => h.x.toFixed(2)).join(' / '));
  check('光带沿机身轴往后拉（速度方向 = 机头方向，长度 > 0）', byNozzle(plumes(a)).every(g => g.every(p => near(p.vel.z, 1, 1e-9) && p.tail > 0)));
}
{
  const a = mk('frigatebird', undefined, false);
  check('没开加力（abFx = 0）：一个粒子都没有', plumes(a).length === 0);
  const b = mk('frigatebird'); b.abFx = 0.01;
  check('强度低于 0.02：不画', plumes(b).length === 0);
}

console.log('\n== 2. 渐细渐暗 ==\n');
{
  const a = mk('frigatebird'), list = plumes(a), grp = byNozzle(list)[0];
  const layers = grp.filter(p => !p.head).sort((x, y) => y.tail - x.tail);        // 非核心光带：由长到短
  check('非核心光带：越长越细', layers.length >= 3 && layers.every((p, i) => i === 0 || p.size > layers[i - 1].size), layers.map(p => p.size.toFixed(2)).join(' < '));
  check('最长的一层颜色最冷（与最短的不同）', layers[0].color !== layers[layers.length - 1].color);
  check('每个喷口：核心光带带亮头，且是这个喷口里最亮的光带（alpha 最大）',
    byNozzle(list).every(g => { const c = g.filter(p => p.head); return c.length === 1 && g.every(p => p.alpha <= c[0].alpha + 1e-9); }));
  // 激波菱形：给它一个独有的颜色，免得和喷口光晕、白热点混在一起
  const DIA = '#010203';
  const l2 = plumes(mk('frigatebird', { color: { diamond: DIA } })), g2 = byNozzle(l2)[0], P = g2[0].pos;
  const dia = l2.filter(p => p.color === DIA && near(p.pos.x, P.x, 1e-9)).sort((x, y) => y.pos.z - x.pos.z);
  const gaps = dia.slice(1).map((p, i) => dia[i].pos.z - p.pos.z);       // 相邻两个菱形之间的距离
  check('激波菱形 ≥ 3 个，都在喷口后面，越往下游越小', dia.length >= 3 && dia.every((p, i) => p.pos.z < P.z && (i === 0 || p.size < dia[i - 1].size)), dia.map(p => p.size.toFixed(3)).join(' > '));
  check('相邻激波菱形的间距越往下游越短', gaps.length >= 2 && gaps.every((g, i) => i === 0 || g < gaps[i - 1]), gaps.map(g => g.toFixed(2)).join(' > '));
}

console.log('\n== 3. 尺度跟喷口走（exhaust.size） ==\n');
{
  const one = byNozzle(plumes(mk('frigatebird', { size: 1 })));
  const two = byNozzle(plumes(mk('frigatebird', { size: 2 })));
  check('size 2：长度、粗细都是 size 1 的 2 倍', one.length === 2 && two.length === 2 &&
    one.every((g, i) => near(maxTail(two[i]) / maxTail(g), 2, 1e-9) && near(Math.max.apply(null, two[i].map(p => p.size)) / Math.max.apply(null, g.map(p => p.size)), 2, 1e-9)));
  const base = byNozzle(plumes(mk('seahorse', { size: 1 })));
  const arr = byNozzle(plumes(mk('seahorse', { size: [1, 0, 2] })));      // [0]=1，[1]=0 关，[2]=2，[3] 缺 → 1
  check('数组：系数 0 的喷口不出羽流（4 个喷口出 3 道）', base.length === 4 && arr.length === 3);
  check('数组：按喷口顺序生效（0 号 ×1，2 号 ×2，缺的 3 号 ×1）',
    arr.length === 3 && near(maxTail(arr[0]) / maxTail(base[0]), 1, 1e-9) && near(maxTail(arr[1]) / maxTail(base[2]), 2, 1e-9) && near(maxTail(arr[2]) / maxTail(base[3]), 1, 1e-9));
  const sea = byNozzle(plumes(mk('seahorse')));                            // 机型数据里写的 [0.55, 0.55, 0.45, 0.45]
  check('海马（单发四喷口）：每道羽流都比统一系数 1 时短', sea.length === 4 && sea.every((g, i) => maxTail(g) < maxTail(base[i])), sea.map((g, i) => (maxTail(g) / maxTail(base[i])).toFixed(2)).join(' / '));
  const noz = Ent.nozzlesOf('petrel'), noz2 = Ent.nozzlesOf('basalt');
  check('基础尺寸取自模型里量出的喷口出口半径（海燕 ≠ 玄武岩）', noz[0][3] > 0.2 && noz2[0][3] > noz[0][3], noz[0][3].toFixed(2) + ' vs ' + noz2[0][3].toFixed(2));
}

console.log('\n== 4. 配色 ==\n');
{
  const core = (type, ex) => plumes(mk(type, ex)).filter(p => p.head)[0].color;
  const c = { amber: core('frigatebird', { color: 'amber' }), smoky: core('frigatebird', { color: 'smoky' }),
    blue: core('frigatebird', { color: 'blue' }), violet: core('frigatebird', { color: 'violet' }) };
  check('四个预设的核心色互不相同', new Set(Object.values(c)).size === 4, JSON.stringify(c));
  check('exhaust 里不写 color = amber', core('frigatebird', {}) === c.amber);
  check('未知预设名退回 amber', core('frigatebird', { color: 'nope' }) === c.amber);
  check('对象覆盖：{ base: blue, core: #ff0000 } → 核心红、其余按 blue',
    core('frigatebird', { color: { base: 'blue', core: '#ff0000' } }) === '#ff0000' &&
    plumes(mk('frigatebird', { color: { base: 'blue', core: '#ff0000' } })).some(p => p.color === plumes(mk('frigatebird', { color: 'blue' })).filter(q => !q.head)[0].color));
  check('非法颜色（不是 #rrggbb）回退默认', core('frigatebird', { color: { core: 'red' } }) === c.amber && core('frigatebird', { color: { core: '#f00' } }) === c.amber);
  const all = [];
  for (const id of ['frigatebird', 'seahorse', 'skua', 'schist']) for (const p of plumes(mk(id))) all.push(p.color);
  check('所有粒子颜色都是 #rrggbb（WebGL 粒子只认这个）', all.length > 0 && all.every(x => HEX6.test(x)), all.length + ' 个');
  // 数据里每架机的 exhaust.color 都是合法预设或对象；同一预设的机型核心色一致
  const byPreset = {};
  let ok = true;
  for (const ac of G.AIRCRAFT) {
    if (!Ent.hasAfterburner(ac)) { if (ac.exhaust && ac.exhaust.color) ok = false; continue; }   // 没有加力的机型不该写配色
    const sp = ac.exhaust && ac.exhaust.color;
    if (typeof sp === 'string' && !c[sp]) ok = false;
    if (typeof sp === 'string') (byPreset[sp] = byPreset[sp] || new Set()).add(core(ac.id));
  }
  check('数据里：有加力的机型配色合法、没有加力的机型没写配色', ok);
  check('数据里：同一预设的机型核心色一致', Object.keys(byPreset).every(k => byPreset[k].size === 1 && [...byPreset[k]][0] === c[k]), Object.keys(byPreset).join(','));
  check('每架有加力的机型都写了 exhaust.color（15 架）', G.AIRCRAFT.filter(a => Ent.hasAfterburner(a)).every(a => a.exhaust && a.exhaust.color), G.AIRCRAFT.filter(a => Ent.hasAfterburner(a) && !(a.exhaust && a.exhaust.color)).map(a => a.id).join(','));
}

console.log('\n== 5. 强度 abFx 渐亮渐灭 ==\n');
{
  const a = Ent.makeAircraft({ type: 'frigatebird', team: 1, x: 0, y: 3000, z: 0 });
  const world = { particles: [], actors: [], targets: [], missiles: [], bullets: [], events: [] };
  let prev = 0, mono = true, t10 = -1;
  a.ab = true;
  for (let i = 1; i <= 60; i++) { Ent.$.stepAircraftTail(a, 1 / 60, world); if (a.abFx < prev - 1e-12) mono = false; prev = a.abFx; if (t10 < 0 && a.abFx > 0.5) t10 = i / 60; }
  check('点火：0.5 s 内涨满（> 0.95）且单调不减', a.abFx > 0.95 && mono, '1 s 后 ' + a.abFx.toFixed(3));
  check('点火不是瞬间：第一帧还没满', (() => { const b = Ent.makeAircraft({ type: 'frigatebird', team: 1 }); b.ab = true; Ent.$.stepAircraftTail(b, 1 / 60, world); return b.abFx > 0 && b.abFx < 0.5; })());
  a.ab = false; prev = a.abFx; mono = true;
  for (let i = 1; i <= 90; i++) { Ent.$.stepAircraftTail(a, 1 / 60, world); if (a.abFx > prev + 1e-12) mono = false; prev = a.abFx; }
  check('熄火：1.5 s 内收到 0 且单调不增', a.abFx === 0 && mono, '最终 ' + a.abFx);
}

console.log('\n== 6. 纯演出：不消耗随机数、不进 world.particles ==\n');
{
  const a = mk('seahorse'), world = { actors: [a], particles: [], time: 1.5, targets: [], missiles: [], bullets: [], events: [] };
  S.seed(21); const expectNext = G.Math.random();
  S.seed(21);
  for (let i = 0; i < 30; i++) { Ent.$.stepAircraftTail(a, 1 / 60, world); Ent.exhaustPlumes(world, null); }
  check('30 帧加力 + 生成羽流：一次随机数都没抽', near(G.Math.random(), expectNext), '');
  check('world.particles 里没有加力粒子', world.particles.length === 0, 'length=' + world.particles.length);
}

console.log('\n== 7. 距离细节等级 ==\n');
{
  const a = mk('frigatebird');
  const at = d => plumes(a, { x: 0, y: 3000, z: d }).length;
  const nearN = at(1000), midN = at(10000), farN = at(30000);
  check('近（1 km）> 中（10 km）> 0', nearN > midN && midN > 0, nearN + ' > ' + midN);
  check('远（30 km）不画', farN === 0);
  check('中距离没有激波菱形（只有光带 + 光晕）', (() => { const l = plumes(a, { x: 0, y: 3000, z: 10000 }); return l.filter(p => !p.tail).length === 4; })());
  check('不给相机位置 = 按近处画', plumes(a, null).length === nearN);
}

console.log('\n== 8. 确定性 ==\n');
{
  const a = mk('frigatebird');
  const j = t => JSON.stringify(plumes(a, null, t));
  check('同样的输入同样的输出', j(3.21) === j(3.21));
  const l0 = maxTail(byNozzle(plumes(a, null, 3.21))[0]), l1 = maxTail(byNozzle(plumes(a, null, 3.29))[0]);
  check('不同的 world.time 长度不同（闪烁），幅度在 ±15% 内', l0 !== l1 && Math.abs(l1 / l0 - 1) < 0.15, l0.toFixed(3) + ' → ' + l1.toFixed(3));
}

console.log('\n' + (bad.length
  ? '✗ ' + bad.length + ' 项失败：\n  - ' + bad.join('\n  - ')
  : '✓ 加力羽流探针全部通过') + '\n');
process.exit(bad.length ? 1 : 0);
