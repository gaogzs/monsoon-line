#!/usr/bin/env node
/**
 * 生成 js/core/locales.gen.js（docs/POST2-0IMPL.md 1.9.2）
 *
 * file:// 下浏览器读不了本地 JSON，所以把 js/locales/<语言>/ 下全部 JSON
 * 合并成一个脚本文件，内容就是每种语言一句 Text.load(...)。和
 * CHANGELOG.md → js/core/changelog.js 同一个套路：生成物提交进仓库，
 * smoke 断言它与现场重新生成的结果一致。
 *
 *   node tools/gen-locales.js           重新生成并写回
 *   node tools/gen-locales.js --check   只检查：不一致、格式不规范、键重复都退出码 1
 *
 * 规矩：
 *   · 只认键，不认文件名：递归读全部 *.json，合并成一棵树
 *   · 同一个叶子出现在两个文件里 = 错误（报出两个文件名）；同一对象的不同叶子
 *     分在两个文件里是允许的
 *   · JSON 必须是规范格式（tools/fmt-locales.js 一键整理）
 *   · 键名每一段只允许 [A-Za-z0-9_-]，不得以数字开头
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SJ = require('./lib/strict-json');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'js', 'locales');
const OUT = path.join(ROOT, 'js', 'core', 'locales.gen.js');

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

function build() {
  const errors = [];
  const langs = {};
  for (const lang of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
    const ld = path.join(DIR, lang);
    if (!fs.statSync(ld).isDirectory()) continue;
    const tree = {}, owners = {};
    for (const f of walk(ld)) {
      const rel = path.relative(ROOT, f);
      const raw = fs.readFileSync(f, 'utf8');
      let obj;
      try { obj = SJ.parse(raw, rel); } catch (e) { errors.push(e.message); continue; }
      if (raw !== SJ.format(obj)) errors.push(rel + ' 不是规范格式 —— 跑 node tools/fmt-locales.js');
      merge(tree, obj, '', lang, rel, errors, owners);
    }
    langs[lang] = tree;
  }
  let src = '// 生成物：tools/gen-locales.js 由 js/locales 下全部 JSON 合并而成，不要手改。\n\'use strict\';\n';
  for (const lang of Object.keys(langs).sort()) src += '\nText.load(' + JSON.stringify(lang) + ', ' + JSON.stringify(langs[lang]) + ');\n';
  return { errors, src };
}

module.exports = { build, OUT };

if (require.main === module) {
  const { errors, src } = build();
  if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== src) { console.log('js/core/locales.gen.js 已过期 —— 跑一下 node tools/gen-locales.js'); process.exit(1); }
    console.log('locales.gen.js 与 JSON 一致');
  } else {
    fs.writeFileSync(OUT, src);
    console.log('locales.gen.js 已更新（' + Math.round(src.length / 1024) + ' KB）');
  }
}
