#!/usr/bin/env node
/**
 * 文本检查（docs/POST2-0IMPL.md 1.9.5）
 *
 *   · 脚本里静态写出的 T('键') / T.pick('键')、页面模板里的 {{html.键}} 都必须存在于 locales/ 里
 *   · locales/ 里的键没有任何脚本引用 → 死文本（警告）
 *   · 文件位置与键前缀对不上 → 警告（只是约定，运行时不依赖）
 *   · locales/<语言>/text.gen.js 与 JSON 一致
 *
 *   node tools/test/check-locales.js        退出码 1 = 有错误；警告只打印
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Scripts = require('../lib/scripts');
const GL = require('../build/gen-locales');

function collect() {
  const { errors, outputs } = GL.build();
  const out = { errors: errors.slice(), warnings: [] };
  for (const lang of Object.keys(outputs)) {
    const cur = fs.existsSync(outputs[lang].file) ? fs.readFileSync(outputs[lang].file, 'utf8') : '';
    if (cur !== outputs[lang].src) out.errors.push(path.relative(Scripts.ROOT, outputs[lang].file) + ' 已过期 —— 跑一下 node tools/build/gen-locales.js');
  }
  /* 键集合：直接执行回退语言的生成物，借 Text 的展开 */
  const src = outputs['zh-CN'].src;
  const vm = require('vm');
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(Scripts.ROOT, 'js/core/text.js'), 'utf8') + '\n;this.Text = Text;', sb);
  vm.runInContext(src, sb);
  const keys = new Set(sb.Text.keys());
  const used = new Set();
  const re = /\bT(?:\.pick)?\(\s*'([^']+)'/g;
  for (const f of Scripts.loadOrder()) {
    if (/text\.gen\.js$|core\/text\.js$/.test(f)) continue;
    const text = fs.readFileSync(path.join(Scripts.ROOT, f), 'utf8');
    let m;
    while ((m = re.exec(text))) {
      used.add(m[1]);
      if (!keys.has(m[1])) out.errors.push(f + ' 引用了不存在的文本键：' + m[1]);
    }
  }
  /* 页面模板片段里的 {{html.*}} 占位也算引用 */
  (function scanTemplates(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { scanTemplates(p); continue; }
      if (!e.name.endsWith('.html')) continue;
      const t = fs.readFileSync(p, 'utf8');
      let m;
      const rt = /\{\{(html\.[\w.-]+)\}\}/g;
      while ((m = rt.exec(t))) {
        used.add(m[1]);
        if (!keys.has(m[1])) out.errors.push(path.relative(Scripts.ROOT, p) + ' 引用了不存在的文本键：' + m[1]);
      }
    }
  })(path.join(Scripts.ROOT, 'locales', '_html'));
  const unused = [...keys].filter(k => !used.has(k));
  out.unused = unused;
  if (unused.length) out.warnings.push(unused.length + ' 条文本键没有脚本引用（可能被动态拼接，也可能是死文本）：' + unused.slice(0, 5).join('、') + (unused.length > 5 ? ' …' : ''));
  out.keyCount = keys.size;
  return out;
}

module.exports = { collect };

if (require.main === module) {
  const r = collect();
  r.warnings.forEach(w => console.log('警告：' + w));
  if (r.errors.length) { console.log(r.errors.join('\n')); process.exit(1); }
  console.log('文本检查通过（' + r.keyCount + ' 条键）');
}
