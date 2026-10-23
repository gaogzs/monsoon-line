#!/usr/bin/env node
/**
 * 脚本加载顺序（docs/POST2-0IMPL.md 1.2）—— 唯一权威
 *
 * 规则：按固定的层顺序（LAYERS），层内 `_` 开头的文件整层最先、`zz` 开头的整层最后、其余按字母序；
 * 各命名空间的 `_state.js` 排在 core 之后、其余层之前。语言包（locales/<语言>/text.gen.js）
 * 紧跟 js/core/text.js：先回退语言 zh-CN，再是页面自己的语言。
 *
 * 本文件只算顺序，不写任何 html：页面副本由 tools/build/gen-pages.js 生成。
 *   Scripts.scripts(lang)   → ['js/core/version.js', …, 'locales/zh-CN/text.gen.js', …]
 *
 *   node tools/build/gen-index.js     打印脚本数量与顺序（调试用）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = require('../lib/root').ROOT;

/* 层顺序：越靠前越先加载。locales/ 里只有 JSON 与生成物，不进入扫描。 */
const LAYERS = ['core', 'data', 'models', 'missions', 'engine', 'render', 'ui', 'boot'];
/* 层内需要特殊先后的文件（相对 js/）；其余按规则。文本机制与文本必须先于一切要写 T('键') 的文件。 */
const FIRST = ['core/version.js', 'core/changelog.js', 'core/math3d.js', 'core/text.js', 'core/registry.js', 'core/tags.js'];
const FALLBACK = 'zh-CN';

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function rank(rel) {                       // rel 如 'engine/ai.js'
  const parts = rel.split('/');
  const base = parts[parts.length - 1];
  /* 各命名空间的 _state.js（只建一个空壳 var NS = { $: {} }）排在 core 之后、其余层之前，
     这样同一个命名空间的文件可以按职责放进不同的层（engine / ui / boot） */
  const layer = base === '_state.js' ? 0.5 : LAYERS.indexOf(parts[0]);
  const dirs = parts.slice(0, -1).join('/');
  const fi = FIRST.indexOf(rel);
  const bucket = base.startsWith('_') ? 0 : base.startsWith('zz') ? 2 : 1;
  return [layer, fi < 0 ? FIRST.length : fi, bucket, dirs, base];   // _ 开头的整层最先、zz 开头的整层最后
}
function cmp(a, b) {
  const x = rank(a), y = rank(b);
  for (let i = 0; i < x.length; i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return 0;
}

/** js/ 下全部脚本（不含语言包），按加载顺序 */
function order() {
  const jsDir = path.join(ROOT, 'js');
  const files = walk(jsDir).map(p => path.relative(jsDir, p).split(path.sep).join('/'));
  const bad = files.filter(f => LAYERS.indexOf(f.split('/')[0]) < 0);
  if (bad.length) throw new Error('js/ 下有不属于任何层的文件：' + bad.join(', '));
  return files.sort(cmp).map(f => 'js/' + f);
}

/** 某种语言的页面要加载的全部脚本，按顺序（语言包插在 text.js 之后） */
function scripts(lang) {
  const list = order();
  const i = list.indexOf('js/core/text.js');
  const packs = ['locales/' + FALLBACK + '/text.gen.js'];
  if (lang && lang !== FALLBACK && fs.existsSync(path.join(ROOT, 'locales', lang, 'text.gen.js'))) packs.push('locales/' + lang + '/text.gen.js');
  return list.slice(0, i + 1).concat(packs, list.slice(i + 1));
}

module.exports = { order, scripts, cmp, LAYERS, FALLBACK };

if (require.main === module) {
  const l = scripts(FALLBACK);
  console.log(l.join('\n'));
  console.log('共 ' + l.length + ' 个脚本（页面副本由 tools/build/gen-pages.js 生成）');
}
