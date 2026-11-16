#!/usr/bin/env node
/* ============================================================
   反挤团探针（docs/POST2-0IMPL.md 5.2 Director 的目标分配惩罚）

   8 对 8 的空战（一方 ally、一方 enemy，同机型同位格），把 $.DIR.PILE 置 0（旧行为：各打各的最近敌机）
   与默认值对比"扎堆指数" = 平均每次采样里、与别的同队飞机盯着同一个目标的飞机占有目标飞机的比例。
     A. 默认值下扎堆指数比 PILE=0 至少降低 50%
     B. 交战不坍塌：开打 60 s 后，两边合计仍有飞机互相造成伤害，且仍有目标（不是全员无所事事）
   用法：node tools/test/probes/probe-spacing.js
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
let ok = true;
function chk(name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : ''));
  if (!cond) ok = false;
}

function run(pile, seed) {
  const S = Sim.load({ seed });
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  w.targets.length = 0;
  p.pos.x += 90000;
  w.arenaDef = null;                 // 玩家被挪到场外，不能让越界渐黑结束这一局
  AI.$.DIR.PILE = pile;
  const mk = (team, i, z, fz) => {
    const a = Ent.makeAircraft({ type: 'albatross', team, x: (i - 3.5) * 650, y: 3000, z, fwd: M3.V(0, 0, fz), speed: 250, special: 'dl6' });
    AI.attach(a, { role: team === 0 ? 'ally' : 'enemy', skill: 0.6, rank: 'pawn' });
    a.hp = a.maxHp = a.maxHp * 3;
    w.actors.push(a);
    return a;
  };
  const A = [], B = [];
  for (let i = 0; i < 8; i++) { A.push(mk(0, i, -4500, 1)); B.push(mk(1, i, 4500, -1)); }
  let samples = 0, clump = 0, idle = 0, active = 0;
  const hp0 = A.concat(B).reduce((s, a) => s + a.hp, 0);
  for (let f = 0; f < 60 * 60; f++) {
    S.step(1 / 60);
    p.alive = true; p.hp = p.maxHp;
    if (f % 30 === 0 && f > 60 * 5) {
      for (const side of [A, B]) {
        const live = side.filter(a => a.alive && a.ai.target && a.ai.target.alive);
        if (!live.length) continue;
        const cnt = new Map();
        for (const a of live) cnt.set(a.ai.target, (cnt.get(a.ai.target) || 0) + 1);
        for (const a of live) if (cnt.get(a.ai.target) > 1) clump++;
        samples += live.length;
      }
    }
  }
  const hp1 = A.concat(B).reduce((s, a) => s + Math.max(0, a.hp), 0);
  const alive = A.concat(B).filter(a => a.alive);
  for (const a of alive) { active++; if (!a.ai.target) idle++; }
  return { idx: samples ? clump / samples : 0, dmg: hp0 - hp1, alive: alive.length, idle, active };
}

const seeds = [1, 2, 3];
const avg = (pile) => {
  const r = seeds.map(s => run(pile, s));
  return { idx: r.reduce((s, x) => s + x.idx, 0) / r.length, dmg: r.reduce((s, x) => s + x.dmg, 0) / r.length,
           idle: r.reduce((s, x) => s + x.idle, 0), active: r.reduce((s, x) => s + x.active, 0) };
};
const off = avg(0), on = avg(0.6);
console.log('扎堆指数 PILE=0: ' + off.idx.toFixed(3) + '   PILE=0.6: ' + on.idx.toFixed(3));
chk('扎堆指数降低 ≥ 50%', off.idx > 0 && on.idx <= off.idx * 0.5, 'off=' + off.idx.toFixed(3) + ' on=' + on.idx.toFixed(3));
chk('交战不坍塌：有伤害产生', on.dmg > 0, 'dmg=' + on.dmg.toFixed(0));
chk('交战不坍塌：存活者多数仍有目标', on.active === 0 || on.idle / on.active < 0.5, 'idle=' + on.idle + '/' + on.active);
/* ---------- C. 外围游走 / 武器分类 ---------- */
function standoffRun(special, skill) {
  const S = Sim.load({ seed: 2 });
  const { M3, Ent, AI } = S.sandbox;
  S.start(0);
  const G = S.sandbox.Game, w = G.__world(), p = G.__player();
  for (const a of w.actors) if (a !== p) a.alive = false;
  w.actors = w.actors.filter(a => a === p);
  w.targets.length = 0; p.pos.x += 90000; w.arenaDef = null;
  const mk = (team, z, fz) => Ent.makeAircraft({ type: 'albatross', team, x: 0, y: 3000, z, fwd: M3.V(0, 0, fz), speed: 250, special });
  const tg = mk(0, 6000, 1); tg.hp = tg.maxHp = 1e9;
  const sh = mk(1, 0, 1);
  AI.attach(sh, { role: 'enemy', skill, rank: 'elite' });
  w.actors.push(tg, sh);
  let standT = 0, wc = null; const ds = [];
  for (let f = 0; f < 60 * 30; f++) {
    tg.throttle = 0.6;
    S.step(1 / 60);
    p.alive = true; p.hp = p.maxHp;
    wc = sh.ai.wclass || wc;
    if (sh.ai.mode === 'standoff') { standT += 1 / 60; ds.push(M3.dist(sh.pos, tg.pos)); }
  }
  return { standT, wc, ds, ring: sh.ai.ringR };
}
{
  const e = standoffRun('mrm', 0.85);
  chk('远距弹 + elite 以上：分类 longRange 且进入外围游走', e.wc === 'longRange' && e.standT > 3, 'class=' + e.wc + ' standT=' + e.standT.toFixed(1));
  const mean = e.ds.reduce((s, x) => s + x, 0) / Math.max(1, e.ds.length);
  chk('外围游走时离目标大致在环半径上', e.ds.length > 0 && mean > e.ring * 0.5 && mean < e.ring * 1.4, 'mean=' + mean.toFixed(0) + ' ring=' + e.ring.toFixed(0));
  const sr = standoffRun('dl6', 0.85);
  chk('近距弹：不进外围游走', sr.standT === 0, 'class=' + sr.wc + ' standT=' + sr.standT.toFixed(1));
  const lo = standoffRun('mrm', 0.55);
  chk('低位格（skill < 0.7）即使带远距弹也不游走', lo.standT === 0, 'standT=' + lo.standT.toFixed(1));
}

process.exit(ok ? 0 : 1);
