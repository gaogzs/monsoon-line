#!/usr/bin/env node
/**
 * 一次性迁移：把旧的单文件 index.html 拆成 locales/_html/ 模板片段 + locales/zh-CN/text/html/*.json
 * （docs/systems/pages.md）。迁移完成后留着只是为了说明当初怎么拆的；日常改页面直接改片段与 JSON。
 *
 *   node tools/build/extract-html.js <旧 index.html 路径>           试跑：只报告
 *   node tools/build/extract-html.js <旧 index.html 路径> --write   写片段与 JSON
 *
 * 规则：
 *   · <body> 下每个顶层元素一个片段：<section id="scr-X"> → screens/X.html；#radio / #sysnote / #pause → overlays/；
 *     前面紧挨着的 HTML 注释跟着走；<canvas id="cv"> 留在 shell 里
 *   · "只含文本与简单内联标记（b / i / span / kbd / br …，且不带 id）的元素"整体作为一条文本；
 *     否则其中含中文的文本节点各算一条（带 id 的内联元素是 JS 要找的目标，不并进文本）
 *   · 文本换成 {{html.<片段>.<名字>}}，原文（含内联标记）写进 JSON
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SJ = require('../lib/strict-json');
const ROOT = require('../lib/root').ROOT;

const SRC = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!SRC) { console.error('用法：node tools/build/extract-html.js <旧 index.html> [--write]'); process.exit(1); }
const html = fs.readFileSync(SRC, 'utf8');
const CJK = /[㐀-鿿　-〿＀-￯]/;
const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'base']);
const INLINE = new Set(['b', 'i', 'em', 'strong', 'span', 'kbd', 'br', 'u', 'small', 'sub', 'sup']);
const TEXT_ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];

/* ---------- 解析成树（只为这份规整的 html） ---------- */
function parse(src) {
  const root = { type: 'root', children: [], start: 0, openEnd: 0, closeStart: src.length, end: src.length };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/?([A-Za-z][\w-]*)([^>]*)>|[^<]+/g;
  let m;
  while ((m = re.exec(src))) {
    const t = m[0], cur = stack[stack.length - 1];
    if (t.startsWith('<!--')) cur.children.push({ type: 'comment', start: m.index, end: m.index + t.length });
    else if (t[0] === '<') {
      const tag = m[1].toLowerCase();
      if (t[1] === '/') {
        const el = stack.pop();
        if (el.tag !== tag) throw new Error('标签没配上：<' + el.tag + '> 对 </' + tag + '> @' + m.index);
        el.closeStart = m.index; el.end = m.index + t.length;
      } else {
        const el = { type: 'el', tag, attrs: m[2], children: [], start: m.index, openEnd: m.index + t.length };
        cur.children.push(el);
        if (VOID.has(tag) || /\/\s*$/.test(m[2])) el.end = el.openEnd, el.closeStart = el.openEnd;
        else stack.push(el);
      }
    } else cur.children.push({ type: 'text', text: t, start: m.index, end: m.index + t.length });
  }
  if (stack.length !== 1) throw new Error('有标签没闭合：<' + stack[stack.length - 1].tag + '>');
  return root;
}
const tree = parse(html);
const attr = (el, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(el.attrs || ''); return m ? m[1] : null; };

function inlineOnly(el) {
  return el.children.every(c => c.type === 'text' || c.type === 'comment' ||
    (c.type === 'el' && INLINE.has(c.tag) && !attr(c, 'id') && !/\bbar-/.test(attr(c, 'class') || '') && inlineOnly(c)));
}

/* ---------- 起名 ---------- */
function nameFor(el, used) {
  let n = null;
  if (el) {
    const id = attr(el, 'id'), cls = (attr(el, 'class') || '').split(/\s+/).filter(Boolean);
    if (el.tag === 'button') n = attr(el, 'data-go') ? 'btn_' + attr(el, 'data-go') : attr(el, 'data-ptab') ? 'tab_' + attr(el, 'data-ptab') : id || 'btn';
    else if (id) n = id;
    else if (cls.includes('bar-t')) n = 'title';
    else if (cls.includes('bar-r')) n = 'sub';
    else if (cls.length) n = cls[0];
    else n = el.tag;
  }
  n = String(n || 't').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^(\d)/, 't$1');
  let k = n, i = 2;
  while (used.has(k)) k = n + '_' + i++;
  used.add(k);
  return k;
}

/* ---------- 一个片段：改写成模板并收集文本 ---------- */
function processChunk(chunkName, nodes) {
  const used = new Set();
  const texts = {};
  function emit(node, parent) {
    if (node.type === 'comment' || (node.type === 'text' && !CJK.test(node.text))) return html.slice(node.start, node.end);
    if (node.type === 'text') {          // 含中文的裸文本节点（父元素不是纯内联）
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text);
      const key = nameFor(parent, used);
      texts[key] = m[2];
      return m[1] + '{{html.' + chunkName + '.' + key + '}}' + m[3];
    }
    /* 元素：属性里的文本 */
    let open = html.slice(node.start, node.openEnd);
    for (const a of TEXT_ATTRS) {
      const v = attr(node, a);
      if (v && CJK.test(v)) {
        const key = nameFor(node, used) + '_' + a;
        texts[key] = v;
        open = open.replace(a + '="' + v + '"', a + '="{{html.' + chunkName + '.' + key + '}}"');
      }
    }
    if (node.end === node.openEnd) return open;           // 空元素
    const close = html.slice(node.closeStart, node.end);
    if (inlineOnly(node) && CJK.test(html.slice(node.openEnd, node.closeStart))) {
      const inner = html.slice(node.openEnd, node.closeStart);
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
      const key = nameFor(node, used);
      texts[key] = m[2];
      return open + m[1] + '{{html.' + chunkName + '.' + key + '}}' + m[3] + close;
    }
    return open + node.children.map(c => emit(c, node)).join('') + close;
  }
  return { tpl: nodes.map(n => emit(n, null)).join(''), texts };
}

/* ---------- 顶层切片 ---------- */
const htmlEl = tree.children.find(c => c.type === 'el' && c.tag === 'html');
const body = htmlEl.children.find(c => c.type === 'el' && c.tag === 'body');
const head = htmlEl.children.find(c => c.type === 'el' && c.tag === 'head');
const chunks = [];            // { path, name, nodes }
let pending = [];
const shellBody = [];         // 按顺序：{ raw } 或 { include }
for (const n of body.children) {
  if (n.type === 'text' && !n.text.trim()) { if (!pending.length) continue; pending.push(n); continue; }
  if (n.type === 'comment') {
    const c = html.slice(n.start, n.end);
    if (/脚本/.test(c) && /=====/.test(c)) { pending = []; continue; }        // "脚本"标题注释：由 shell 的 {{scripts}} 取代
    if (/scripts:(begin|end)/.test(c)) continue;
    pending.push(n); continue;
  }
  if (n.type === 'el' && n.tag === 'script') continue;
  const id = attr(n, 'id') || '';
  let rel = null;
  if (n.tag === 'section' && /^scr-/.test(id)) rel = 'screens/' + id.slice(4);
  else if (n.tag === 'div' && ['radio', 'sysnote', 'pause'].includes(id)) rel = 'overlays/' + id;
  if (!rel) {                  // 留在 shell 里（<canvas id="cv"> 等）
    shellBody.push({ raw: pending.concat([n]).map(x => html.slice(x.start, x.end)).join('') });
    pending = [];
    continue;
  }
  chunks.push({ rel, name: rel.split('/')[1], nodes: pending.concat([n]) });
  shellBody.push({ include: rel });
  pending = [];
}

const outTpl = {}, outJson = {};
let total = 0;
for (const c of chunks) {
  const { tpl, texts } = processChunk(c.name, c.nodes);
  outTpl['_html/' + c.rel + '.html'] = tpl.replace(/^\s+/, '') + '\n';
  const n = Object.keys(texts).length;
  if (n) outJson['text/html/' + c.name + '.json'] = { html: { [c.name]: texts } };
  total += n;
}
/* shell：head 里的 <title> 文本 */
const titleEl = head.children.find(c => c.type === 'el' && c.tag === 'title');
const titleText = html.slice(titleEl.openEnd, titleEl.closeStart);
const shell = '<!DOCTYPE html>\n<html lang="{{lang}}">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  '<title>{{html.shell.title}}</title>\n<base href="{{base}}">\n<link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n\n' +
  shellBody.map(p => p.raw !== undefined ? p.raw.replace(/^\s+|\s+$/g, '') + '\n' : '{{> ' + p.include + '}}\n').join('\n') +
  '\n<!-- ============ 脚本 ============ -->\n{{scripts}}\n</body>\n</html>\n';
outTpl['_html/shell.html'] = shell;
outJson['text/html/shell.json'] = { html: { shell: { title: titleText } } };
total++;

console.log('片段 ' + chunks.length + ' 个：' + chunks.map(c => c.rel).join('、') + '；文本 ' + total + ' 条');
if (!WRITE) {
  for (const k of Object.keys(outJson)) console.log('  ' + k + '：' + JSON.stringify(outJson[k]).slice(0, 140));
  process.exit(0);
}
const LOC = path.join(ROOT, 'locales');
for (const rel of Object.keys(outTpl)) {
  const p = path.join(LOC, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, outTpl[rel]);
}
for (const rel of Object.keys(outJson)) {
  const p = path.join(LOC, 'zh-CN', rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, SJ.format(outJson[rel]));
}
console.log('已写入 locales/_html/ 与 locales/zh-CN/text/html/');
