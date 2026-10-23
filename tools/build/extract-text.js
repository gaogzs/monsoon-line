#!/usr/bin/env node
/**
 * 文本提取（docs/POST2-0IMPL.md 1.9.5 · 半自动）
 *
 * 扫描 js/ 下除 locales/ 与生成物以外的脚本，找出字符串字面量里含 CJK 的，
 *   · 把文本写进 locales/zh-CN/text/**.json（键名由文件 + 所在属性 / 函数推出）
 *   · 把脚本里的字面量换成 T('键')
 * 纯字符串相加（'a' + 'b'）合成一条文本；带 ${} 的模板字符串、对象键、
 * throw new Error(...) 与 console.* 的参数不动（开发者看的，进允许清单）。
 *
 *   node --expose-internals tools/build/extract-text.js            试跑：只报告，不写盘
 *   node --expose-internals tools/build/extract-text.js --write    写 JSON 并改写脚本
 *   node --expose-internals tools/build/extract-text.js --write --only js/ui/hud   只处理这个前缀
 *
 * 需要 --expose-internals：借用 Node 内置的 acorn 解析器，不给项目加依赖。
 * 键名是机器起的（文件.作用域.属性或 sN），之后可以手工改名，只要 JSON 与脚本同步。
 */
'use strict';
const acorn = require('internal/deps/acorn/acorn/dist/acorn');
const fs = require('fs');
const path = require('path');
const SJ = require('../lib/strict-json');

const ROOT = require('../lib/root').ROOT;
const JS = path.join(ROOT, 'js');
const OUT = path.join(ROOT, 'locales', 'zh-CN', 'text');
const WRITE = process.argv.includes('--write');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();
const CJK = /[㐀-鿿　-〿＀-￯]/;
const SKIP_FILES = /(^|\/)(changelog|version|text)\.js$/;

const KIND_BASE = { aircraft: 'aircraft', ship: 'ships', platform: 'platforms', weapon: 'weapons', turretGun: 'turretGuns',
  mission: 'missions', campaign: 'campaigns', codexEntry: 'codex' };

function walk(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.js')) out.push(p);
  }
  return out.sort();
}
const seg = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_').replace(/^(\d)/, 'i$1');

const trees = {};            // JSON 相对路径 → 树
function put(jsonRel, key, text) {
  const tree = trees[jsonRel] = trees[jsonRel] || {};
  const parts = key.split('.');
  let o = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof o[parts[i]] === 'string') throw new Error('键冲突：' + key);
    o = o[parts[i]] = o[parts[i]] || {};
  }
  if (parts[parts.length - 1] in o) throw new Error('键重复：' + key);
  o[parts[parts.length - 1]] = text;
}

let total = 0, skippedTpl = 0, skippedCtx = 0;
const perFile = {};
const localeFileOf = {};          // 键的第一个前缀 → 落到哪个 JSON 文件

function processFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (SKIP_FILES.test(rel)) return;
  if (ONLY && rel.indexOf(ONLY) !== 0) return;
  const src = fs.readFileSync(file, 'utf8');
  if (!CJK.test(src)) return;
  const ast = acorn.parse(src, { ecmaVersion: 2020 });

  /* 文件的键前缀：Registry.xxx({ id: 'X' …}) 的文件按单位；其余按路径 */
  const relNo = rel.replace(/^js\//, '').replace(/\.js$/, '');
  let base = relNo.split('/').map(seg).join('.');
  let jsonRel = relNo + '.json';
  for (const st of ast.body) {
    if (st.type !== 'ExpressionStatement') continue;
    const c = st.expression;
    if (c.type === 'CallExpression' && c.callee.type === 'MemberExpression' && c.callee.object.name === 'Registry' &&
        KIND_BASE[c.callee.property.name] && c.arguments[0] && c.arguments[0].type === 'ObjectExpression') {
      const idp = c.arguments[0].properties.find(p => p.key && (p.key.name === 'id' || p.key.value === 'id'));
      if (idp && idp.value.type === 'Literal') {
        base = KIND_BASE[c.callee.property.name] + '.' + seg(idp.value.value);
        jsonRel = KIND_BASE[c.callee.property.name] + '/' + seg(idp.value.value) + '.json';
      }
    }
  }
  /* 每个文件落一个 JSON；同一类单位各一个文件 */
  const edits = [];
  const counters = {};
  const usedKeys = new Set();
  const found = [];            // { node, key, text }

  const isStaticStr = n => (n.type === 'Literal' && typeof n.value === 'string') ||
    (n.type === 'TemplateLiteral' && n.expressions.length === 0);
  const strOf = n => n.type === 'Literal' ? n.value : n.quasis[0].value.cooked;
  /* 纯静态字符串相加的链 */
  function chainLeaves(n) {
    if (isStaticStr(n)) return [n];
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      const l = chainLeaves(n.left), r = chainLeaves(n.right);
      if (l && r) return l.concat(r);
    }
    return null;
  }
  function scopeNames(anc) {
    const names = [];
    for (let i = 0; i < anc.length - 1; i++) {
      const n = anc[i], child = anc[i + 1];
      if (n.type === 'Property' && !n.computed && n.value === child) names.push(n.key.name || String(n.key.value));
      else if (n.type === 'FunctionDeclaration' && n.id) names.push(n.id.name);
      else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init === child) names.push(n.id.name);
      else if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.right === child && !n.left.computed) names.push(n.left.property.name);
      else if (n.type === 'ArrayExpression') names.push('i' + n.elements.indexOf(child));
    }
    /* 去掉文件前缀里已有的 id（Registry 单位文件里最外层是 Registry.x({…})） */
    return names.map(seg);
  }
  function makeKey(anc, node) {
    const chain = scopeNames(anc.concat([node]));
    const last = anc[anc.length - 1];
    let leaf = null;
    if (last && last.type === 'Property' && last.value === node && !last.computed) leaf = chain.pop();
    const prefix = [base].concat(chain).join('.');
    let key;
    if (leaf) key = prefix + '.' + leaf;
    else { counters[prefix] = (counters[prefix] || 0) + 1; key = prefix + '.s' + counters[prefix]; }
    let k = key, n = 2;
    while (usedKeys.has(k)) k = key + '_' + n++;
    usedKeys.add(k);
    return k;
  }

  function visit(node, anc) {
    if (!node || typeof node.type !== 'string') return;
    /* 开发者看的：Error / console / assert 的参数整体跳过 */
    if ((node.type === 'NewExpression' && node.callee.name === 'Error') ||
        (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'console')) {
      return;
    }
    if (node.type === 'Property' && !node.computed) {      // 键不动，只看值
      visit(node.value, anc.concat([node]));
      return;
    }
    const leaves = (node.type === 'Literal' || node.type === 'TemplateLiteral' || node.type === 'BinaryExpression') ? chainLeaves(node) : null;
    if (leaves) {
      const text = leaves.map(strOf).join('');
      if (CJK.test(text)) {
        found.push({ node, key: makeKey(anc, node), text });
      }
      return;
    }
    if (node.type === 'TemplateLiteral') {
      if (node.quasis.some(q => CJK.test(q.value.cooked))) skippedTpl++;
    }
    for (const k of Object.keys(node)) {
      if (k === 'type' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(x => visit(x, anc.concat([node])));
      else if (v && typeof v.type === 'string') visit(v, anc.concat([node]));
    }
  }
  visit(ast, []);
  if (!found.length) return;
  /* 一个键不能同时是叶子和别的键的前缀（叶子 tx 与 tx.s1）：叶子改名加下划线 */
  const keySet = new Set(found.map(f => f.key));
  for (const f of found) {
    while (found.some(g => g !== f && g.key.indexOf(f.key + '.') === 0)) f.key += '_';
  }
  const seen = new Set();
  for (const f of found) {
    let k = f.key, n = 2;
    while (seen.has(k)) k = f.key + '_' + n++;
    seen.add(k); f.key = k;
    put(jsonRel, f.key, f.text);
    edits.push({ start: f.node.start, end: f.node.end, text: "T('" + f.key + "')" });
    total++; perFile[rel] = (perFile[rel] || 0) + 1;
  }

  /* 局部变量 T 会遮住文本函数 */
  if (/\b(var|function)\s+T\b|\(\s*T\s*[,)]|,\s*T\s*[,)]/.test(src)) console.log('警告：' + rel + ' 里有名为 T 的变量，T() 会被遮住');

  localeFileOf[rel] = jsonRel;
  if (WRITE) {
    edits.sort((a, b) => b.start - a.start);
    let out = src;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    fs.writeFileSync(file, out);
  }
}

for (const f of walk(JS)) processFile(f);

if (WRITE) {
  for (const jsonRel of Object.keys(trees)) {
    const p = path.join(OUT, jsonRel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (fs.existsSync(p)) {                       // 已有的文件：合并（同一个单位的文件可能被多次提取）
      const old = SJ.parse(fs.readFileSync(p, 'utf8'), p);
      (function m(a, b) { for (const k of Object.keys(b)) { if (typeof b[k] === 'object' && !Array.isArray(b[k]) && typeof a[k] === 'object') m(a[k], b[k]); else a[k] = b[k]; } })(old, trees[jsonRel]);
      trees[jsonRel] = old;
    }
    fs.writeFileSync(p, SJ.format(trees[jsonRel]));
  }
}
console.log('提取 ' + total + ' 条文本，涉及 ' + Object.keys(perFile).length + ' 个脚本；带 ${} 的模板未动 ' + skippedTpl + ' 处');
if (!WRITE) {
  const top = Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(top.map(([f, n]) => '  ' + String(n).padStart(4) + '  ' + f).join('\n'));
}
module.exports = { trees };
