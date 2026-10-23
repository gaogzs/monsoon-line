#!/usr/bin/env node
/**
 * 画面回归（docs/POST2-0IMPL.md 1.0 / 1.7）
 *
 * 逻辑回放（golden.js）不画画面，HUD / 渲染 / UI 的拆分它看不到。
 * 这里在后台模拟里把每一关推进几秒，再画几帧，把 2D 画布的全部绘制调用
 * （方法名 + 参数，数字保留两位）取哈希。拆文件不该改变任何一次绘制调用。
 *
 *   node tools/test/golden-render.js --write    存基线 tools/test/baseline/golden-render.json
 *   node tools/test/golden-render.js            与基线比较
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Sim = require('../lib/sim');

const OUT = path.join(__dirname, 'baseline', 'golden-render.json');
const argv = process.argv.slice(2);
const SEED = 7;
const FRAMES = [1.5, 3, 5];          // 在这几秒各画一帧

const S0 = Sim.load({ seed: SEED });
const ms = S0.sandbox.MISSIONS;
const res = {};
for (let i = 0; i < ms.length; i++) {
  const S = Sim.load({ seed: SEED, trace: true });
  S.start(i); S.godMode();
  const hs = [];
  let t = 0;
  for (const at of FRAMES) {
    S.run(at - t); t = at;
    S.godMode();
    S.trace.length = 0;
    S.render();
    const h = crypto.createHash('sha1').update(S.trace.join('\n')).digest('hex').slice(0, 10);
    hs.push(h + ':' + S.trace.length);
  }
  res[(ms[i].id || 'm') + '@' + i] = hs;
}
if (argv.includes('--write')) {
  fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, frames: FRAMES, missions: res }, null, 1) + '\n');
  const n = Object.values(res).reduce((a, x) => a + parseInt(x[0].split(':')[1], 10), 0);
  console.log('已写入 ' + path.relative(process.cwd(), OUT) + '（每关 ' + FRAMES.length + ' 帧；首帧绘制调用合计 ' + n + ' 次）');
} else {
  if (!fs.existsSync(OUT)) { console.log('没有基线，先跑 --write'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(OUT, 'utf8')).missions;
  let bad = 0;
  for (const k of Object.keys(res)) {
    const b = base[k];
    if (!b) { console.log('  ? ' + k + ' 基线里没有'); bad++; continue; }
    const diff = res[k].findIndex((h, j) => h !== b[j]);
    if (diff >= 0) { console.log('  \x1b[31m✗\x1b[0m ' + k + ' 第 ' + (diff + 1) + ' 帧不同（' + b[diff] + ' → ' + res[k][diff] + '）'); bad++; }
    else console.log('  \x1b[32m✓\x1b[0m ' + k);
  }
  process.exit(bad ? 1 : 0);
}
