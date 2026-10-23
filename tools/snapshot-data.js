#!/usr/bin/env node
/**
 * 数据 / 模型快照（docs/POST2-0IMPL.md 1.0）
 *
 * 把全部静态数据表和 3D 模型序列化成规范 JSON（键排序），逐条取哈希。
 * 重构前存基线，重构后同一脚本必须得到相同结果；计划内的字段改动单独列清单。
 *
 *   node tools/snapshot-data.js --write   写入 tools/baseline/data.json
 *   node tools/snapshot-data.js           与基线比较，列出差异，退出码 1 = 有差异
 *   node tools/snapshot-data.js --verbose 同时打印每张表的条目数
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Sim = require('./lib/sim');

const OUT = path.join(__dirname, 'baseline', 'data.json');
/* STORE_* / MISSILE_LEAD / FLARE_RD / SHIP_MOUNTS 等侧表在批次 1.4 并入了各单位的文件，
   它们的内容现在只存在于 WEAPONS / SHIPS / PLATFORMS 里（基线 v3.0.0-a 起不再单列）。
   批次 1.8：HARD_MODELS / GUN_RESIST_MODELS 并入 TARGETS（js/data/targets/）；武器的布尔标志改成 tags，
   LEGACY_TAGS=1 时把标签还原成旧字段再比，用来核对"除迁移外一字不差"。
   计划内字段改动：WEAPONS 里五门机炮多了 id 字段（注册表按 id 注册），并且从 k1 / k2 / k3 / k7 / k11 改名为 cel1 / cel2 / cel3 / cel7 / cel11（与玩家看到的 CEL-n 对应）。 */
const TABLES = ['CODEX', 'TARGETS', 'AIRCRAFT', 'SHIPS', 'PLATFORMS', 'WEAPONS', 'TURRET_GUNS',
  'VOICES', 'CALLSIGN', 'NAVAL_CS', 'NAVAL_NAMED',
  'NAVAL_CS_POOL', 'CS_DOWNSTREAM', 'CAMPAIGNS', 'SK_FITS'];

const h = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/* 规范序列化：键排序；函数取源码；TypedArray 转数组；循环引用截断 */
function canon(v, seen) {
  seen = seen || [];
  if (typeof v === 'function') return { $fn: v.toString().replace(/\s+/g, ' ') };   // 缩进变化不算差异
  if (v === undefined) return { $undef: true };
  if (typeof v === 'number' && !isFinite(v)) return { $num: String(v) };
  if (v === null || typeof v !== 'object') return v;
  if (seen.indexOf(v) >= 0) return { $cycle: true };
  seen = seen.concat([v]);
  if (ArrayBuffer.isView(v)) return Array.from(v);
  if (Array.isArray(v)) return v.map(x => canon(x, seen));
  const o = {};
  for (const k of Object.keys(v).sort()) o[k] = canon(v[k], seen);
  if (LEGACY_TAGS && o.tags && typeof o.tags === 'object') {      // 核对用：把标签还原成旧的布尔字段
    for (const t of Object.keys(o.tags)) if (WEAPON_FLAGS.includes(t)) o[t] = true;
    delete o.tags; delete o.muzzle;
    const sorted = {};
    for (const k of Object.keys(o).sort()) sorted[k] = o[k];
    return sorted;
  }
  return o;
}
const LEGACY_TAGS = !!process.env.LEGACY_TAGS;
const WEAPON_FLAGS = ['twinSeeker', 'decoyMemory', 'reAcquire', 'hobs', 'penetrator', 'antiRadar', 'silentLock', 'passive', 'unguided', 'ballistic', 'highAltImmune'];
const hashOf = v => h(JSON.stringify(canon(v)));

function entries(tbl) {
  const out = {};
  if (Array.isArray(tbl)) tbl.forEach((e, i) => { out[(e && (e.id || e.name)) || '#' + i] = hashOf(e); });
  else for (const k of Object.keys(tbl).sort()) out[k] = hashOf(tbl[k]);
  /* 条目顺序也要一致（机库列表、图鉴顺序都靠它） */
  out.$order = hashOf(Array.isArray(tbl) ? tbl.map((e, i) => (e && (e.id || e.name)) || '#' + i) : Object.keys(tbl));
  return out;
}

function snapshot() {
  const S = Sim.load({ seed: 1, init: false });
  const sb = S.sandbox;
  const snap = { tables: {}, models: {}, missions: {} };
  for (const t of TABLES) {
    let v; try { v = require('vm').runInContext('typeof ' + t + " === 'undefined' ? undefined : " + t, sb); } catch (e) { v = undefined; }
    if (v === undefined) continue;
    snap.tables[t] = entries(v);
  }
  for (const k of Object.keys(sb.MODELS).sort()) snap.models[k] = hashOf(sb.MODELS[k]);
  snap.models.$order = hashOf(Object.keys(sb.MODELS));            // 键的先后（遍历 MODELS 的工具靠它）
  /* 不可枚举的成员（炮塔规格、残骸、按武器生成弹体的函数）也要在 */
  snap.models.$hidden = hashOf(Object.getOwnPropertyNames(sb.MODELS).filter(k => !Object.keys(sb.MODELS).includes(k)));
  snap.models.$turretSpec = hashOf(sb.MODELS.TURRET_SPEC);
  for (const k of Object.getOwnPropertyNames(sb.MODELS)) if (/_wreck$/.test(k)) snap.models[k] = hashOf(sb.MODELS[k]);
  sb.MISSIONS.forEach((m, i) => { snap.missions[(m.id || 'idx' + i) + '@' + i] = hashOf(m); });
  return snap;
}

function diff(a, b) {
  const lines = [];
  for (const sec of Object.keys(Object.assign({}, a, b))) {
    const A = a[sec] || {}, B = b[sec] || {};
    for (const t of Object.keys(Object.assign({}, A, B))) {
      const x = A[t], y = B[t];
      if (sec === 'tables') {
        for (const k of Object.keys(Object.assign({}, x || {}, y || {}))) {
          if (!x || !(k in x)) lines.push('+ ' + t + '.' + k);
          else if (!y || !(k in y)) lines.push('- ' + t + '.' + k);
          else if (x[k] !== y[k]) lines.push('~ ' + t + '.' + k);
        }
      } else if (x === undefined) lines.push('+ ' + sec + '.' + t);
      else if (y === undefined) lines.push('- ' + sec + '.' + t);
      else if (x !== y) lines.push('~ ' + sec + '.' + t);
    }
  }
  return lines;
}

if (require.main === module) {
  const snap = snapshot();
  if (process.argv.includes('--verbose')) {
    for (const t of Object.keys(snap.tables)) console.log('  ' + t + ': ' + Object.keys(snap.tables[t]).length);
    console.log('  models: ' + Object.keys(snap.models).length + '  missions: ' + Object.keys(snap.missions).length);
  }
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUT, JSON.stringify(snap, null, 1) + '\n');
    console.log('已写入 ' + path.relative(process.cwd(), OUT));
  } else {
    if (!fs.existsSync(OUT)) { console.log('没有基线，先跑 --write'); process.exit(1); }
    const d = diff(JSON.parse(fs.readFileSync(OUT, 'utf8')), snap);
    if (d.length) { console.log('数据与基线不同（' + d.length + ' 处）：\n' + d.join('\n')); process.exit(1); }
    console.log('数据快照与基线一致');
  }
}
module.exports = { snapshot, diff };
