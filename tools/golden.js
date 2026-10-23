#!/usr/bin/env node
/**
 * 黄金回放（docs/POST2-0IMPL.md 1.0）
 *
 * 固定种子，每一关跑 N 帧，每 60 帧对全体实体的 pos / vel / hp / ammoPool 取哈希。
 * 重构不改行为 → 逐帧哈希必须一致。不画画面、不接输入（玩家无敌，AI 自己打）。
 *
 *   node tools/golden.js --write      存基线 tools/baseline/golden.json
 *   node tools/golden.js              与基线比较，报出第一个出现分歧的关卡与时刻
 *   node tools/golden.js --secs 30    每关秒数（缺省 20）
 *   node tools/golden.js --only m3    只跑一关（按 MISSIONS 下标或 id）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Sim = require('./lib/sim');

const OUT = path.join(__dirname, 'baseline', 'golden.json');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const SECS = +(opt('--secs') || 20);
const ONLY = opt('--only');
const SEED = 7;

const r = n => (typeof n === 'number' ? n : 0);
function entLine(e) {
  const p = e.pos || {}, v = e.vel || {};
  const ammo = e.ammoPool ? Object.keys(e.ammoPool).sort().map(k => k + ':' + e.ammoPool[k]).join(',') : '';
  return [e.id, e.model || e.type || '', e.team, r(p.x), r(p.y), r(p.z), r(v.x), r(v.y), r(v.z), e.hp, e.alive ? 1 : 0, ammo].join('|');
}
function worldHash(w) {
  const lines = [];
  for (const k of Object.keys(w).sort()) {
    const a = w[k];
    if (!Array.isArray(a)) continue;
    lines.push(k + '#' + a.length);
    for (const e of a) if (e && typeof e === 'object' && (e.pos || e.vel)) lines.push(entLine(e));
  }
  return crypto.createHash('sha1').update(lines.join('\n')).digest('hex').slice(0, 10);
}

function runAll() {
  const S0 = Sim.load({ seed: SEED });
  const ms = S0.sandbox.MISSIONS;
  const res = {};
  for (let i = 0; i < ms.length; i++) {
    const key = (ms[i].id || 'm') + '@' + i;
    if (ONLY && ONLY !== String(i) && ONLY !== ms[i].id) continue;
    const S = Sim.load({ seed: SEED });
    S.start(i);
    S.godMode();
    const hs = [];
    let f = 0;
    S.run(SECS, (t, w) => {
      if (++f % 60 === 0) { S.godMode(); hs.push(worldHash(w)); }
    });
    res[key] = hs;
  }
  return res;
}

const got = runAll();
if (argv.includes('--write')) {
  fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, secs: SECS, missions: got }, null, 1) + '\n');
  console.log('已写入 ' + path.relative(process.cwd(), OUT) + '（' + Object.keys(got).length + ' 关 × ' + SECS + ' 秒）');
} else {
  if (!fs.existsSync(OUT)) { console.log('没有基线，先跑 --write'); process.exit(1); }
  const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let bad = 0;
  for (const k of Object.keys(got)) {
    const b = base.missions[k];
    if (!b) { console.log('  ? ' + k + ' 基线里没有'); bad++; continue; }
    const n = Math.min(b.length, got[k].length);
    let at = -1;
    for (let i = 0; i < n; i++) if (b[i] !== got[k][i]) { at = i; break; }
    if (at >= 0) { console.log('  \x1b[31m✗\x1b[0m ' + k + ' 在第 ' + (at + 1) + ' 秒出现分歧'); bad++; }
    else console.log('  \x1b[32m✓\x1b[0m ' + k);
  }
  if (!ONLY) for (const k of Object.keys(base.missions)) if (!got[k]) { console.log('  ? ' + k + ' 现在没有了'); bad++; }
  process.exit(bad ? 1 : 0);
}
