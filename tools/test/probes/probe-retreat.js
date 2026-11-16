#!/usr/bin/env node
/* ============================================================
   撤离探针（docs/POST2-0IMPL.md 5.4）

   A. 开关：mission.retreat 缺省 off —— 残血、没弹的 AI 也不撤；on 才有
   B. 触发：事件（掉血）→ 评估一次；概率随位格 ace < elite < pawn < rookie；noRetreat 标签永不撤
   C. 出界口：没有整备点的一方（enemy）撤出战区边界 → 从战场移除（retreated / leftBy='retreat' / escaped，不计击杀）
   D. 整备往返：我方 ally 撤到整备区 → 走 NPC 整备周期 → 补满血回来，retreating 清除
   E. 僚机随长机：长机开始撤，ai.leader 指向它的僚机也撤
   用法：node tools/test/probes/probe-retreat.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function world(seed) {
  const S = Sim.load({ seed });
  const { M3, Ent, AI } = S.sandbox;
  S.start(S.sandbox.MISSIONS.findIndex(m => m.id === 'm1'));
  const G = S.sandbox.Game, w = G.__world(), p = G.__player(), ar = w.arenaDef;
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  w.targets.length = 0;
  p.pos.x = ar.cx + 30000; p.pos.z = ar.cz + 30000; p.hp = p.maxHp = 1e9;      // 远角，不与测试机交战
  const mk = (team, x, z, o) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x: ar.cx + x, y: 4000, z: ar.cz + z, fwd: M3.V(1, 0, 0), speed: 250, special: 'dl6' });
    AI.attach(a, Object.assign({ role: team === 0 ? 'ally' : 'enemy', skill: 0.55, rank: 'pawn' }, o || {}));
    a.hp = a.maxHp = 100;
    w.actors.push(a);
    return a;
  };
  /* 留一架远处的哨兵敌机：关卡的胜利条件是敌机全灭，没有它第一帧就结算、世界停了 */
  const sentinel = mk(1, -30000, 30000); sentinel.hp = sentinel.maxHp = 1e9; sentinel.ai.cmd = 'hold';
  const keep = () => { p.alive = true; p.hp = p.maxHp; };
  return { S, w, p, ar, mk, keep, M3, Ent, AI, step: (n) => { for (let i = 0; i < n; i++) { S.step(1 / 60); keep(); } } };
}

/* ---------- A. 开关 ---------- */
{
  const W = world(1);
  const xs = [];
  for (let i = 0; i < 20; i++) xs.push(W.mk(1, -3000 + i * 300, -2000 + (i % 5) * 400));
  xs.forEach(a => { a.hp = 20; a.ai.hpSeen = 40; });
  chk('开关缺省 off：world.retreatOn 为假', W.w.retreatOn === false);
  W.step(60 * 20);
  chk('off：残血的 AI 20 s 内没有一个撤离', xs.every(a => !a.ai.retreating && a.alive));
}

/* ---------- B. 触发率与位格 ---------- */
{
  const W = world(2);
  W.w.retreatOn = true;
  const xs = [];
  for (let i = 0; i < 60; i++) xs.push(W.mk(1, -4000 + (i % 12) * 700, -3000 + Math.floor(i / 12) * 700));
  xs.forEach(a => { a.hp = 20; });
  W.step(2);
  xs.forEach(a => { a.hp = 15; });                 // 掉血 = 事件
  W.step(60 * 4);
  const n = xs.filter(a => a.ai.retreating || a.retreated).length;
  chk('on：血量 20% 的 pawn（无其他条件）约一半在评估后撤离', n >= 18 && n <= 42, n + '/60');
  const A = W.AI.$, base = xs[0];
  const pr = r => { base.ai.rank = r; base.hp = 20; return A.retreatProb(base, base.ai); };
  const pa = pr('ace'), pe = pr('elite'), pp = pr('pawn'), pk = pr('rookie');
  chk('概率随位格：ace < elite < pawn < rookie', pa < pe && pe < pp && pp < pk, [pa, pe, pp, pk].map(v => v.toFixed(2)).join(' < '));

  const W2 = world(3);
  W2.w.retreatOn = true;
  const ys = [];
  for (let i = 0; i < 30; i++) {
    const a = W2.mk(1, -4000 + (i % 10) * 700, -3000 + Math.floor(i / 10) * 700);
    a.tags = Object.assign({}, a.tags, { noRetreat: true }); a.hp = 20; ys.push(a);
  }
  W2.step(2); ys.forEach(a => { a.hp = 10; }); W2.step(60 * 4);
  chk('noRetreat 标签：永不撤离', ys.every(a => !a.ai.retreating && a.alive));
}

/* ---------- C. 出界口移除 ---------- */
{
  const W = world(4);
  W.w.retreatOn = true;
  const e = W.mk(1, 40500, 0);        // 贴着 +x 边（半宽 42000）
  e.ai.retreating = true; e.hp = 20;
  W.step(60 * 40);
  chk('敌机撤出战区边界：从战场移除，retreated / leftBy / escaped 置位',
    !e.alive && e.retreated === true && e.leftBy === 'retreat' && e.escaped === true,
    'alive=' + e.alive + ' leftBy=' + e.leftBy);
}

/* ---------- D. 整备往返 ---------- */
{
  const W = world(5);
  W.w.retreatOn = true;
  const a = W.mk(0, 0, -(W.ar.half - W.ar.warn - 4000));     // m1：-z 界外整备区
  a.hp = 30; a.ai.retreating = true;
  let cycled = false, gone = false, back = false;
  for (let f = 0; f < 60 * 120; f++) {
    W.step(1);
    if (a.rs && a.rs.cyc) cycled = true;
    if (cycled && W.w.actors.indexOf(a) < 0) gone = true;
    if (gone && W.w.actors.indexOf(a) >= 0) { back = true; break; }
  }
  chk('我方撤到整备区：走整备周期（消失再出现）', cycled && gone && back, 'cycled=' + cycled + ' gone=' + gone + ' back=' + back);
  chk('回来之后血量补满、撤离状态清除', a.hp === a.maxHp && !a.ai.retreating && a.ai.mode === 'pursue', 'hp=' + a.hp + ' mode=' + a.ai.mode);
}

/* ---------- E. 僚机随长机 ---------- */
{
  const W = world(6);
  W.w.retreatOn = true;
  const L = W.mk(1, 0, 0), a = W.mk(1, 300, 0, { leader: L }), b = W.mk(1, -300, 0, { leader: L });
  W.step(2);
  L.ai.retreating = true;
  W.step(5);
  chk('长机撤离，ai.leader 指向它的僚机跟着撤', a.ai.retreating && b.ai.retreating);
}

process.exit(ok ? 0 : 1);
