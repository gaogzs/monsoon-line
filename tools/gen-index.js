#!/usr/bin/env node
/**
 * 生成 index.html 的 <script> 块（docs/POST2-0IMPL.md 1.2）
 *
 * 规则：按固定的层顺序（LAYERS），层内 `_` 开头的文件最先、`zz` 开头的最后、其余按字母序；
 * 生成物 js/core/locales.gen.js 紧跟 js/core/text.js。夹在 index.html 里的两行标记注释之间。
 * 加一个单位 = 新建一个文件 + 跑一次本脚本。smoke.js 用 --check 断言 index.html 没过期。
 *
 *   node tools/gen-index.js          重新生成并写回 index.html
 *   node tools/gen-index.js --check  只检查，不一致退出码 1
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const BEGIN = '<!-- scripts:begin（tools/gen-index.js 生成，不要手改） -->';
const END = '<!-- scripts:end -->';

/* 层顺序：越靠前越先加载。locales/ 里只有 JSON，不进入扫描。 */
const LAYERS = ['core', 'data', 'models', 'missions', 'engine', 'render', 'ui', 'boot'];
/* 层内需要特殊先后的文件（相对 js/）；其余按规则。 */
const FIRST = ['core/version.js', 'core/changelog.js', 'core/math3d.js', 'core/text.js', 'core/locales.gen.js', 'core/registry.js', 'core/tags.js'];

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

function order() {
  const jsDir = path.join(ROOT, 'js');
  const files = walk(jsDir).map(p => path.relative(jsDir, p).split(path.sep).join('/'));
  const bad = files.filter(f => LAYERS.indexOf(f.split('/')[0]) < 0);
  if (bad.length) throw new Error('js/ 下有不属于任何层的文件：' + bad.join(', '));
  return files.sort(cmp).map(f => 'js/' + f);
}

function build(html) {
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error('index.html 里没有 scripts:begin / scripts:end 标记');
  const block = order().map(f => '<script src="' + f + '"></script>').join('\n');
  return html.slice(0, a) + BEGIN + '\n' + block + '\n' + html.slice(b);
}

module.exports = { order, build, LAYERS, cmp };

if (require.main === module) {
  const cur = fs.readFileSync(HTML, 'utf8');
  const next = build(cur);
  if (process.argv.includes('--check')) {
    if (cur !== next) { console.log('index.html 的 <script> 块已过期 —— 跑一下 node tools/gen-index.js'); process.exit(1); }
    console.log('index.html 与目录一致');
  } else {
    fs.writeFileSync(HTML, next);
    console.log('index.html 已更新（' + order().length + ' 个脚本）');
  }
}
