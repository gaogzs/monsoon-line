#!/usr/bin/env node
/**
 * 生成页面副本与启动器（docs/systems/pages.md）
 *
 *   locales/_html/shell.html + screens/*.html + overlays/*.html     与语言无关的模板片段
 *   locales/<语言>/text/**.json                                      文本（{{html.*}} 取自这里）
 *   → locales/<语言>/html/index.html     该语言的页面副本（<html lang>、<base href="../../../">、脚本块、语言包）
 *   → index.html                    本地启动器：识别语言并重定向（单一入口）
 *
 * 模板语法：
 *   {{> screens/title}}   插入片段          {{scripts}}  脚本块（顺序来自 gen-index）
 *   {{lang}} {{base}}     语言代码与 <base>  {{html.x.y}}  文本；非回退语言缺键时回退 zh-CN 并警告
 * 开发者写在片段里的 HTML 注释不进生成的页面。
 *
 *   node tools/build/gen-pages.js              生成并写回（顺带刷新 locales/<语言>/text.gen.js）
 *   node tools/build/gen-pages.js --check      只检查是否过期（smoke 用）
 *   node tools/build/gen-pages.js --pseudo     另生成 locales/pseudo/html/index.html（静态文本也包成 ⟦…⟧，gitignore，仅开发）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = require('../lib/root').ROOT;
const GI = require('./gen-index');
const GL = require('./gen-locales');

const LOC = path.join(ROOT, 'locales');
const FALLBACK = GI.FALLBACK;

/** 某语言的文本展平成 Map（借 Text 的展开，与运行时同一套规则） */
function flatTexts(lang, outputs) {
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core/text.js'), 'utf8') + '\n;this.Text = Text;', sb);
  vm.runInContext(outputs[lang].src, sb);
  sb.Text.lang(lang);
  const m = new Map();
  for (const k of sb.Text.keys()) m.set(k, sb.Text.T(k));
  return m;
}

function expand(tpl, lang, texts, fallbackTexts, pseudo, warnings) {
  const frag = rel => {
    const p = path.join(LOC, '_html', rel + '.html');
    if (!fs.existsSync(p)) throw new Error('模板片段不存在：' + rel);
    return fs.readFileSync(p, 'utf8').replace(/\s+$/, '');
  };
  let out = tpl.replace(/\{\{>\s*([\w/-]+)\s*\}\}/g, (a, rel) => expand(frag(rel), lang, texts, fallbackTexts, pseudo, warnings));
  out = out.replace(/<!--[\s\S]*?-->/g, '');                      // 开发者注释不进页面
  out = out.replace(/\{\{scripts\}\}/g, GI.scripts(lang === 'pseudo' ? FALLBACK : lang).map(s => '<script src="' + s + '"></script>').join('\n'));
  out = out.replace(/\{\{lang\}\}/g, lang).replace(/\{\{base\}\}/g, '../../../');
  out = out.replace(/\{\{(html\.[\w.-]+)\}\}/g, (a, key) => {
    let v = texts.get(key);
    if (v === undefined && fallbackTexts) { v = fallbackTexts.get(key); if (v !== undefined) warnings.push(lang + ' 缺文本键 ' + key + '，回退 ' + FALLBACK); }
    if (v === undefined) throw new Error('页面模板引用了不存在的文本键：' + key);
    return pseudo ? '⟦' + v + '~'.repeat(Math.ceil(v.length * 0.3)) + '⟧' : v;
  });
  return out.replace(/\n{3,}/g, '\n\n');
}

function launcher(langs) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>季风线 · MONSOON LINE</title>
<!-- 生成物：tools/build/gen-pages.js。本地启动器：识别语言，重定向到对应的页面副本。
     语言来源依次是 ?lang= → localStorage 里记住的选择 → 浏览器语言 → 默认 ${FALLBACK}。 -->
<meta http-equiv="refresh" content="1;url=locales/${FALLBACK}/html/index.html">
<script>
(function () {
  var LANGS = ${JSON.stringify(langs)}, DEF = ${JSON.stringify(FALLBACK)};
  function pick() {
    var m = /[?&]lang=([\\w-]+)/.exec(location.search), c = [];
    if (m) c.push(m[1]);
    try { var s = localStorage.getItem('ml.lang'); if (s) c.push(s); } catch (e) { /* 隐私模式等 */ }
    var nav = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < nav.length; i++) c.push(nav[i]);
    for (var j = 0; j < c.length; j++) {
      if (LANGS.indexOf(c[j]) >= 0) return c[j];
      var base = String(c[j]).split('-')[0];
      for (var k = 0; k < LANGS.length; k++) if (LANGS[k].split('-')[0] === base) return LANGS[k];
    }
    return DEF;
  }
  location.replace('locales/' + pick() + '/html/index.html' + location.search + location.hash);
})();
</script>
</head>
<body>
<noscript><p><a href="locales/${FALLBACK}/html/index.html">季风线 · MONSOON LINE —— 点此进入</a></p></noscript>
</body>
</html>
`;
}

function build(opt) {
  opt = opt || {};
  const { errors, outputs } = GL.build();
  const warnings = [];
  const files = {};
  const langs = GL.languages();
  const fb = flatTexts(FALLBACK, outputs);
  const shell = fs.readFileSync(path.join(LOC, '_html', 'shell.html'), 'utf8');
  for (const lang of langs) {
    const texts = lang === FALLBACK ? fb : flatTexts(lang, outputs);
    files[path.join(LOC, lang, 'html', 'index.html')] = expand(shell, lang, texts, lang === FALLBACK ? null : fb, false, warnings);
  }
  if (opt.pseudo) files[path.join(LOC, 'pseudo', 'html', 'index.html')] = expand(shell, 'pseudo', fb, null, true, warnings);
  files[path.join(ROOT, 'index.html')] = launcher(langs.filter(l => l !== 'pseudo'));
  for (const lang of langs) files[GL.outOf(lang)] = outputs[lang].src;   // 页面副本加载 text.gen.js，一起刷新
  return { files, errors, warnings, langs };
}

module.exports = { build };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const r = build({ pseudo: process.argv.includes('--pseudo') });
  r.warnings.forEach(w => console.log('警告：' + w));
  if (r.errors.length) { console.log(r.errors.join('\n')); process.exit(1); }
  let stale = 0;
  for (const f of Object.keys(r.files)) {
    const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (check) { if (cur !== r.files[f]) { console.log(path.relative(ROOT, f) + ' 已过期 —— 跑一下 node tools/build/gen-pages.js'); stale++; } }
    else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, r.files[f]); }
  }
  if (check) { if (stale) process.exit(1); console.log('页面副本与模板、文本一致（' + r.langs.join('、') + '）'); }
  else console.log('已生成 ' + Object.keys(r.files).length + ' 个页面（' + r.langs.join('、') + ' + 启动器）');
}
