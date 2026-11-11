#!/usr/bin/env node
/* ============================================================
   战区范围探针（批次 4.1：地图边界取值依据）

   每一关：开局收集所有出生单位、航线点（route.wp / route.legs[].wp）的水平外包盒，
   再跑 SECS 秒（玩家无敌，其余照常行动）累计实际到过的位置外包盒。
   输出建议 arena = { cx, cz, half, warn }：
     half = max(外包盒到中心的最大偏移) + MARGIN，取整到 1 km；warn 固定 WARN。

   用法：node tools/test/probes/probe-extent.js [--secs N] [--margin M] [--seed N]
   ============================================================ */
'use strict';
const Sim = require('../../lib/sim');
const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf('--' + name); return i >= 0 ? +args[i + 1] : def; }
const SECS = opt('secs', 120), MARGIN = opt('margin', 8000), WARN = 6000, SEED = opt('seed', 1);

const S = Sim.load({ seed: SEED });
const G = S.sandbox.Game;
const MISSIONS = S.sandbox.MISSIONS;

function Box() { return { x0: 1e18, x1: -1e18, z0: 1e18, z1: -1e18 }; }
function add(b, p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  if (p.x < b.x0) b.x0 = p.x; if (p.x > b.x1) b.x1 = p.x;
  if (p.z < b.z0) b.z0 = p.z; if (p.z > b.z1) b.z1 = p.z;
}
function addRoute(b, r) {
  if (!r) return;
  const wp = r.wp; if (Array.isArray(wp)) wp.forEach(p => add(b, p)); else add(b, wp);
  if (r.exit) add(b, r.exit);
  (r.legs || []).forEach(L => { if (L) { const q = L.wp || L.to; if (Array.isArray(q)) q.forEach(p => add(b, p)); else add(b, q); } });
}
function scan(b, w) {
  for (const a of w.actors) { add(b, a.pos); addRoute(b, a.route); }
  for (const t of w.targets) { add(b, t.pos); addRoute(b, t.route); }
}
const km = v => (v / 1000).toFixed(1);
function fmt(b) { return 'x[' + km(b.x0) + ',' + km(b.x1) + '] z[' + km(b.z0) + ',' + km(b.z1) + ']'; }

console.log('== 战区范围探针（单位 km；余量 ' + MARGIN / 1000 + '，警告 ' + WARN / 1000 + '，跑 ' + SECS + ' s）==\n');
for (let mi = 0; mi < MISSIONS.length; mi++) {
  const m = MISSIONS[mi];
  try {
    G.startMission(mi);
    const w = G.__world(), pl = G.__player();
    pl.hp = pl.maxHp = 1e9;
    const spawn = Box(), run = Box();
    scan(spawn, w); scan(run, w);
    for (let f = 0; f < SECS * 30; f++) {
      S.step(1 / 30);
      pl.hp = pl.maxHp;
      if (f % 15 === 0) scan(run, w);
    }
    const all = Box();
    [spawn, run].forEach(b => { add(all, { x: b.x0, z: b.z0 }); add(all, { x: b.x1, z: b.z1 }); });
    const cx = Math.round((all.x0 + all.x1) / 2 / 1000) * 1000, cz = Math.round((all.z0 + all.z1) / 2 / 1000) * 1000;
    const dev = Math.max(all.x1 - cx, cx - all.x0, all.z1 - cz, cz - all.z0);
    const half = Math.ceil((dev + MARGIN) / 1000) * 1000;
    console.log((m.id || ('#' + mi)) + '  出生 ' + fmt(spawn) + '\n      运行 ' + fmt(run) +
      '\n      建议 arena = { cx: ' + cx + ', cz: ' + cz + ', half: ' + half + ', warn: ' + WARN + ' }\n');
  } catch (e) {
    console.log((m.id || ('#' + mi)) + '  ERROR ' + (e && e.message)); process.exitCode = 1;
  }
}
