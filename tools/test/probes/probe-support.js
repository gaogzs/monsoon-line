#!/usr/bin/env node
/* ============================================================
   战略制空支援机探针（docs/POST2-0IMPL.md 批次 6.4，js/engine/ai/support.js）

   黑曜岩（obsidian，role: 'support'）：
   A. 生成：role support、rank elite、没有航线、带 ewField（干扰场 R = 18 km）、弹药池是 support 预设
   B. 机动：守在友方战斗机质心的后方（远离最近的敌机）9 … 21 km
   C. 齐射：每 25 … 40 s 一次，一次 3 … 4 发，打到不同的敌机；间隔不短于 24 s
   D. 脱离：敌机逼近到 12 km 内掉头拉开（大飞机转得慢，距离增量要求不高）
   E. 压制：被压制时锁定距离折半（jamLockK / jamLockOK），9.5 km 外的目标不再开火
   F. 干扰场：敌方进入 18 km 就自动开机，范围内的敌机 suppressed > 0，范围外的不受影响
   用法：node tools/test/probes/probe-support.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function base(seed) {
  const S = Sim.load({ seed });
  S.start(0);
  const sb = S.sandbox;
  const { M3, Ent, AI } = sb;
  const G = sb.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p); w.targets.length = 0;
  p.pos.x += 80000; p.hp = p.maxHp = 1e9; w.arenaDef = null;
  const step = n => { for (let i = 0; i < n; i++) { S.step(1 / 60); p.alive = true; p.hp = p.maxHp; } };
  /* 战斗机：albatross，血量取极大值，原地待命（cmd hold） */
  const mk = (team, x, y, z, fz) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x, y, z, fwd: M3.V(0, 0, fz), speed: 230, special: 'dl6' });
    a.hp = a.maxHp = 1e12;
    AI.attach(a, { role: team === 1 ? 'enemy' : 'ally', skill: 0.6, rank: 'pawn' });
    a.ai.cmd = 'hold'; w.actors.push(a); return a;
  };
  const sup = (x, y, z, fz) => sb.spawnEnemy(w, { ac: 'obsidian', role: 'support', loadout: 'support', special: null, team: 1, x, y, z, fwd: M3.V(0, 0, fz || -1), speed: 300 });
  /* 哨兵：没有敌机关卡会判胜利；放在很远处 */
  const sen = mk(1, 400000, 3000, 400000, 1); sen.ai.role = 'support';     // 哨兵不算友方战斗机（否则会把友机质心拉到几十万米外）
  return { S, sb, w, p, step, mk, sup, M3 };
}
const horiz = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

/* A 生成 */
{
  const { sup } = base(1);
  const a = sup(0, 9000, 25000);
  chk('A role = support、rank = elite、没有航线', a.ai.role === 'support' && a.rank === 'elite' && !a.route);
  chk('A 带干扰场（ewField.R = 18 km）', a.ai.jam && a.ai.jam.R === 18000 && a.behavior === 'pursue', 'jam.R=' + (a.ai.jam && a.ai.jam.R));
  chk('A 弹药池是 support 预设（下游远程主动弹 + 中距弹，没有上游弹）', a.ammoPool.tephra === 20 && a.ammoPool.dl4 === 8 && !a.ammoPool.vlar && !a.ammoPool.tether, JSON.stringify(a.ammoPool));
}

/* B 机动：守在友机后方 */
for (const seed of [1, 2, 3]) {
  const { sup, mk, step } = base(seed);
  const f1 = mk(1, -1500, 9000, 0, -1), f2 = mk(1, 1500, 9000, 0, -1);      // 友机在原点附近
  const h0 = mk(0, 0, 9000, -9000, 1);                                       // 敌机在友机前方（-z）9 km
  const a = sup(0, 9000, 8000, 1);                                           // 支援机一开始在友机后方 8 km、机头朝后（大飞机转弯慢，不让它先朝敌机飞）
  for (let i = 0; i < 60 * 80; i++) {                                        // 友机与敌机钉在原地（否则它们会互相咬着飞远），只让支援机自由飞
    f1.pos.x = -1500; f1.pos.z = 0; f2.pos.x = 1500; f2.pos.z = 0; h0.pos.x = 0; h0.pos.z = -9000;
    f1.pos.y = f2.pos.y = h0.pos.y = 9000; step(1);
  }
  const cz = (f1.pos.z + f2.pos.z) / 2, cx = (f1.pos.x + f2.pos.x) / 2;
  const d = Math.hypot(a.pos.x - cx, a.pos.z - cz);
  chk('B seed' + seed + ' 支援机守在友机质心后方 9 … 21 km、在友机的后侧（远离敌机）', d > 9000 && d < 21000 && a.pos.z > cz, 'd=' + (d / 1000).toFixed(1) + ' km  behind=' + (a.pos.z - cz).toFixed(0));
}

/* C 齐射：把支援机和敌机钉在固定位置（≈ 9.5 km，TEPHRA 够得着，DAR-4 够不着），只测发射逻辑 */
{
  const { w, sup, mk, step } = base(4);
  const hs = [mk(0, 9500, 9000, 0, 1), mk(0, 11000, 9000, 1500, 1), mk(0, 8000, 9000, -1500, 1)];
  const a = sup(0, 9000, 0);
  const pin = () => { a.pos.x = 0; a.pos.y = 9000; a.pos.z = 0; hs[0].pos.x = 9500; hs[0].pos.z = 0; hs[1].pos.x = 11000; hs[1].pos.z = 1500; hs[2].pos.x = 8000; hs[2].pos.z = -1500; hs.forEach(h => { h.pos.y = 9000; }); };
  const seen = new Set(), shots = [];      // { t, wid, target }
  for (let i = 0; i < 60 * 130; i++) {
    pin(); step(1);
    for (const m of w.missiles) if (m.owner === a && !seen.has(m)) { seen.add(m); shots.push({ t: w.time, wid: m.weapon || (m.w && m.w.id), target: m.target }); }
  }
  // 按时间聚成齐射：相邻两发间隔 > 5 s 算新的一轮
  const salvos = []; for (const s of shots) { const last = salvos[salvos.length - 1]; if (last && s.t - last[last.length - 1].t < 5) last.push(s); else salvos.push([s]); }
  chk('C 130 s 内至少两轮齐射', salvos.length >= 2, 'salvos=' + salvos.map(s => s.length).join(','));
  chk('C 每轮 3 … 4 发', salvos.length >= 2 && salvos.slice(0, 2).every(s => s.length >= 3 && s.length <= 4), salvos.map(s => s.length).join(','));
  chk('C 每轮打到至少 2 个不同的目标', salvos.slice(0, 2).every(s => new Set(s.map(x => x.target)).size >= 2));
  const gaps = salvos.slice(1).map((s, i) => s[0].t - salvos[i][0].t);
  chk('C 两轮间隔不短于 24 s、不长于 45 s', gaps.length > 0 && gaps.every(g => g >= 24 && g <= 45), 'gaps=' + gaps.map(g => g.toFixed(1)).join(','));
  console.log('     弹种：' + [...new Set(shots.map(s => s.wid))].join(','));
}

/* D 脱离 */
{
  const { sup, mk, step } = base(5);
  const h = mk(0, 6000, 9000, 0, 1);
  const a = sup(0, 9000, 0);
  const d0 = horiz(a, h);
  for (let i = 0; i < 60 * 12; i++) { h.pos.x = 6000; h.pos.z = 0; h.pos.y = 9000; step(1); }       // 敌机钉住，看支援机怎么动
  const d1 = horiz(a, h);
  const away = { x: a.pos.x - h.pos.x, z: a.pos.z - h.pos.z }, al = Math.hypot(away.x, away.z) || 1;
  chk('D 敌机逼到 12 km 内：支援机掉头拉开（距离变大、机头大体朝外）', d1 > d0 + 1500 && (a.fwd.x * away.x + a.fwd.z * away.z) / al > 0, 'd0=' + (d0 / 1000).toFixed(1) + ' d1=' + (d1 / 1000).toFixed(1) + ' km');
}

/* E 压制：锁定距离折半 */
{
  const run = supp => {
    const { w, sup, mk, step } = base(6);
    const h = mk(0, 9500, 9000, 0, 1);
    const a = sup(0, 9000, 0);
    if (supp) Object.defineProperty(a, 'suppressed', { get: () => 0.9, set: () => {}, configurable: true });
    let n = 0;
    for (let i = 0; i < 60 * 30; i++) { a.pos.x = 0; a.pos.z = 0; a.pos.y = 9000; h.pos.x = 9500; h.pos.z = 0; h.pos.y = 9000; step(1); }
    for (const m of w.missiles) if (m.owner === a) n++;
    return n;
  };
  const free = run(false), jammed = run(true);
  chk('E 没被压制：9.5 km 处的敌机会被打', free > 0, 'free=' + free);
  chk('E 被压制：锁定距离折半，同一目标不再开火', jammed === 0, 'jammed=' + jammed);
}

/* F 干扰场 */
{
  const { sup, mk, step } = base(7);
  const near = mk(0, 15000, 9000, 0, 1), far = mk(0, 40000, 9000, 0, 1);
  const a = sup(0, 9000, 0);
  for (let i = 0; i < 60 * 4; i++) { a.pos.x = 0; a.pos.z = 0; a.pos.y = 9000; near.pos.x = 15000; near.pos.z = 0; far.pos.x = 40000; far.pos.z = 0; step(1); }
  chk('F 敌方进入 18 km：自动开机，干扰半径 18 km', a.ewPower > 0 && a.ewFieldR === 18000, 'ewPower=' + (a.ewPower || 0).toFixed(2) + ' R=' + a.ewFieldR);
  chk('F 范围内的敌机被压制，范围外的不受影响', near.suppressed > 0 && !(far.suppressed > 0), 'near=' + (near.suppressed || 0).toFixed(2) + ' far=' + (far.suppressed || 0).toFixed(2));
}

console.log(ok ? '\n全部通过' : '\n有失败');
process.exit(ok ? 0 : 1);
