#!/usr/bin/env node
/**
 * 性能探针（docs/POST2-0IMPL.md 1.0）
 *
 * 每关跑 N 秒逻辑，报告每帧平均 / 最大耗时（ms）与实体数峰值。
 * 数值随机器而异，只用来对比"重构前后"与"友军变多之后"，同一台机器上比。
 *
 *   node tools/test/probe-perf.js [--secs 20] [--write]   --write 存 tools/test/baseline/perf.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Sim = require('../lib/sim');

const OUT = path.join(__dirname, 'baseline', 'perf.json');
const argv = process.argv.slice(2);
const SECS = argv.includes('--secs') ? +argv[argv.indexOf('--secs') + 1] : 20;

const S0 = Sim.load({ seed: 3 });
const n = S0.sandbox.MISSIONS.length;
const res = {};
for (let i = 0; i < n; i++) {
  const S = Sim.load({ seed: 3 });
  S.start(i); S.godMode();
  const times = []; let peak = 0;
  S.run(SECS, (t, w) => { peak = Math.max(peak, w.actors.length + (w.targets ? w.targets.length : 0) + (w.missiles ? w.missiles.length : 0)); });
  S.start(i); S.godMode();
  for (let f = 0; f < SECS * 60; f++) {
    const t0 = process.hrtime.bigint();
    S.step(1 / 60);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const id = (S0.sandbox.MISSIONS[i].id || 'm') + '@' + i;
  res[id] = { meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3), p99Ms: +times[Math.floor(times.length * 0.99)].toFixed(3), peakEnts: peak };
  console.log('  ' + id.padEnd(8) + ' 平均 ' + res[id].meanMs + ' ms  p99 ' + res[id].p99Ms + ' ms  实体峰值 ' + peak);
}
if (argv.includes('--write')) { fs.writeFileSync(OUT, JSON.stringify(res, null, 1) + '\n'); console.log('已写入基线'); }
else if (fs.existsSync(OUT)) {
  const b = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const cur = Object.values(res).reduce((a, x) => a + x.meanMs, 0), old = Object.values(b).reduce((a, x) => a + x.meanMs, 0);
  console.log('总平均耗时相对基线 ' + ((cur / old - 1) * 100).toFixed(1) + '%');
}
