#!/usr/bin/env node
/**
 * 生成 locales/<语言>/text.gen.js
 *
 * file:// 下浏览器读不了本地 JSON，所以把 locales/<语言>/text/ 下全部 JSON
 * 合并成一个脚本文件，内容就是一句 Text.load(...)。每种语言一个生成物，
 * 页面副本（locales/<语言>/index.html）直接加载它。和 CHANGELOG.md →
 * js/core/changelog.js 同一个套路：生成物提交进仓库，smoke 断言它与现场
 * 重新生成的结果一致。
 *
 *   node tools/build/gen-locales.js           重新生成并写回
 *   node tools/build/gen-locales.js --check   只检查：不一致、格式不规范、键重复都退出码 1
 *
 * 规矩：
 *   · 只认键，不认文件名：递归读全部 *.json，合并成一棵树
 *   · 同一个叶子出现在两个文件里 = 错误（报出两个文件名）；同一对象的不同叶子
 *     分在两个文件里是允许的
 *   · JSON 必须是规范格式（tools/build/fmt-locales.js 一键整理）
 *   · 键名每一段只允许 [A-Za-z0-9_-]，不得以数字开头
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SJ = require('../lib/strict-json');

const ROOT = require('../lib/root').ROOT;
const DIR = path.join(ROOT, 'locales');
/** 语言目录 → 生成物路径 */
const outOf = lang => path.join(DIR, lang, 'text.gen.js');

function walk(d) {
  const out = [];
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

function merge(into, from, prefix, owner, file, errors, owners) {
  for (const k of Object.keys(from)) {
    const key = prefix ? prefix + '.' + k : k;
    if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(k)) errors.push(file + ' 键名不合规：' + key);
    const v = from[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof into[k] === 'string' || Array.isArray(into[k])) { errors.push(file + ' 键 ' + key + ' 在 ' + owners[key] + ' 里是叶子，这里却是对象'); continue; }
      into[k] = into[k] || {};
      merge(into[k], v, key, owner, file, errors, owners);
    } else {
      if (k in into) errors.push('键重复：' + key + '（' + owners[key] + ' 与 ' + file + '）');
      else { into[k] = v; owners[key] = file; }
    }
  }
}

/** 有 text/ 子目录的都算一种语言 */
function languages() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(l => !l.startsWith('_') && fs.existsSync(path.join(DIR, l, 'text'))).sort();
}

function build() {
  const errors = [];
  const outputs = {};
  for (const lang of languages()) {
    const tree = {}, owners = {};
    for (const f of walk(path.join(DIR, lang, 'text'))) {
      const rel = path.relative(ROOT, f);
      const raw = fs.readFileSync(f, 'utf8');
      let obj;
      try { obj = SJ.parse(raw, rel); } catch (e) { errors.push(e.message); continue; }
      if (raw !== SJ.format(obj)) errors.push(rel + ' 不是规范格式 —— 跑 node tools/build/fmt-locales.js');
      merge(tree, obj, '', lang, rel, errors, owners);
    }
    outputs[lang] = {
      file: outOf(lang),
      src: '// 生成物：tools/build/gen-locales.js 由 locales/' + lang + '/text 下全部 JSON 合并而成，不要手改。\n\'use strict\';\n\nText.load(' +
        JSON.stringify(lang) + ', ' + JSON.stringify(tree) + ');\n'
    };
  }
  return { errors, outputs };
}

module.exports = { build, languages, outOf, DIR };

if (require.main === module) {
  const { errors, outputs } = build();
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  if (process.argv.includes('--check')) {
    let stale = 0;
    for (const lang of Object.keys(outputs)) {
      const cur = fs.existsSync(outputs[lang].file) ? fs.readFileSync(outputs[lang].file, 'utf8') : '';
      if (cur !== outputs[lang].src) { console.log(path.relative(ROOT, outputs[lang].file) + ' 已过期 —— 跑一下 node tools/build/gen-locales.js'); stale++; }
    }
    if (stale) process.exit(1);
    console.log('各语言的 text.gen.js 与 JSON 一致（' + Object.keys(outputs).join('、') + '）');
  } else {
    for (const lang of Object.keys(outputs)) {
      fs.writeFileSync(outputs[lang].file, outputs[lang].src);
      console.log(path.relative(ROOT, outputs[lang].file) + ' 已更新（' + Math.round(outputs[lang].src.length / 1024) + ' KB）');
    }
  }
}
