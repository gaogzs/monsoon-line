#!/usr/bin/env node
/* ============================================================
   射程表探针（docs/2-0IMPL.md 5.7）

   各导弹 / 炸弹在 0 / 6 / 12 / 18 / 24 km 平飞发射的有效射程（Ent.effRange），
   改物理前后各跑一次、用 --json 存下来再比对。

   用法：node tools/probe-range.js [--json 文件] [--cmp 旧文件]
   ============================================================ */
'use strict';
const fs = require('fs');
const Sim = require('./lib/sim');

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const ALTS = [0, 6000, 12000, 18000, 24000];

const S = Sim.load({ seed: 1 });
const G = S.sandbox;
const rows = {};
for (const id of Object.keys(G.WEAPONS)) {
  const w = G.WEAPONS[id];
  if (!w.vsLife) continue;
  delete w.__eff;
  rows[id] = ALTS.map(a => Math.round(G.Ent.effRange(w, a)));
}
const old = opt('--cmp') ? JSON.parse(fs.readFileSync(opt('--cmp'), 'utf8')) : null;
console.log('\n== 有效射程（m），平飞发射高度 ' + ALTS.map(a => a / 1000 + 'km').join(' / ') + ' ==\n');
for (const id of Object.keys(rows)) {
  let line = '  ' + id.padEnd(8) + rows[id].map(v => String(v).padStart(7)).join(' ');
  if (old && old[id]) line += '   | 旧 ' + old[id].map((v, i) => (rows[id][i] - v >= 0 ? '+' : '') + (rows[id][i] - v)).join(' ');
  console.log(line);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rows));
