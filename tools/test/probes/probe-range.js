#!/usr/bin/env node
/* ============================================================
   射程表探针（docs/2-0IMPL.md 5.7）

   各导弹 / 炸弹在 0 / 6 / 12 / 18 / 24 km 平飞发射的有效射程（Ent.effRange），
   改物理前后各跑一次、用 --json 存下来再比对。

   用法：node tools/test/probes/probe-range.js [--json 文件] [--cmp 旧文件] [--strict]
   --strict 配合 --cmp：有任何一个数与旧文件不同就退出码 1（缺省只打印差异 —— 改物理调参时差异本来就是预期的）
   ============================================================ */
'use strict';
const fs = require('fs');
const Sim = require('../../lib/sim');

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
let diffs = 0;
for (const id of Object.keys(rows)) {
  let line = '  ' + id.padEnd(8) + rows[id].map(v => String(v).padStart(7)).join(' ');
  if (old && old[id]) {
    line += '   | 旧 ' + old[id].map((v, i) => (rows[id][i] - v >= 0 ? '+' : '') + (rows[id][i] - v)).join(' ');
    diffs += old[id].filter((v, i) => rows[id][i] !== v).length;
  }
  console.log(line);
}
if (old && process.argv.includes('--strict') && diffs) { console.log('\n✗ 与旧文件有 ' + diffs + ' 处不同'); process.exitCode = 1; }
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(rows));
