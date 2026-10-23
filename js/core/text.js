/* ============================================================
   text.js —— 文本机制（docs/POST2-0IMPL.md 1.9.4）

   文本只放在 locales/<语言>/text/ 下的 JSON 里；怎么读、怎么拼、怎么回退
   全在这个文件里。数据与脚本里只写键：

     T('aircraft.frigatebird.desc')            取文本
     T('fail.m2.baseLost', { n: 3 })           文本里的 {{n}} 从第二个参数里按点号路径取值
     T.pick('radio.fox.variants', rng)         叶子是数组时随机挑一条
     T.has(key)    Text.keys(prefix)    Text.unused()

   JSON 在 file:// 下读不了，所以 tools/build/gen-locales.js 把它们合并成
   locales/<语言>/text.gen.js（内容就是一句 Text.load(...)），页面副本里按普通
   <script> 加载。URL 带 ?lang=pseudo 时每条文本包成 ⟦…⟧ 并拉长 30%，
   用来目视找漏迁的字符串与排版溢出。
   ============================================================ */
'use strict';

var Text = (function () {
  var FALLBACK = 'zh-CN';
  var tables = {};            // 语言 → Map<点号键, 字符串 | 字符串数组>
  var cur = FALLBACK;
  var pseudo = false;
  var used = {};              // 被取过的键（开发用）
  var missing = [];

  /* 当前语言：页面副本（locales/<语言>/html/index.html）在 <html lang> 里写死；
     ?lang=pseudo 另外打开运行时的伪语言（开发用，静态 html 文本要用 gen-pages --pseudo 才包得到） */
  try {
    var l = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || '';
    if (l === 'pseudo') pseudo = true;           // locales/pseudo/html/index.html：开发用，静态文本在构建时已包好
    else if (l) cur = l;
    var q = (typeof location !== 'undefined' && location.search) || '';
    if (/[?&]lang=pseudo\b/.test(q)) pseudo = true;
  } catch (e) { /* 没有 document / location（后台模拟） */ }

  /** 把嵌套对象展开成点号键。叶子只能是字符串或字符串数组 */
  function flatten(tree, prefix, out) {
    for (var k in tree) {
      if (!Object.prototype.hasOwnProperty.call(tree, k)) continue;
      var key = prefix ? prefix + '.' + k : k;
      var v = tree[k];
      if (typeof v === 'string') {
        if (out.has(key)) throw new Error('文本键重复：' + key);
        out.set(key, v);
      } else if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          if (typeof v[i] !== 'string') throw new Error('文本数组里只能放字符串：' + key + '[' + i + ']');
        }
        if (out.has(key)) throw new Error('文本键重复：' + key);
        out.set(key, v);
      } else if (v && typeof v === 'object') {
        flatten(v, key, out);
      } else {
        throw new Error('文本叶子只能是字符串或字符串数组：' + key);
      }
    }
    return out;
  }

  function load(lang, tree) {
    var t = tables[lang] || (tables[lang] = new Map());
    var flat = flatten(tree, '', new Map());
    flat.forEach(function (v, k) {
      if (t.has(k)) throw new Error('文本键重复：' + k);
      t.set(k, v);
    });
  }

  function lookup(key) {
    var t = tables[cur];
    if (t && t.has(key)) return t.get(key);
    t = tables[FALLBACK];
    if (t && t.has(key)) return t.get(key);
    return undefined;
  }

  /** {{a.b}} 从 ctx 里按点号路径取值；取不到抛错（和资料库占位符同一个规矩） */
  function fill(s, ctx, key) {
    return s.replace(/\{\{([\w.]+)\}\}/g, function (all, path) {
      var v = ctx, parts = path.split('.');
      for (var i = 0; i < parts.length; i++) {
        if (v === null || v === undefined) break;
        v = v[parts[i]];
      }
      if (v === undefined || v === null) throw new Error('文本 ' + key + ' 的占位符 {{' + path + '}} 取不到值');
      return String(v);
    });
  }

  function decorate(s) {
    if (!pseudo) return s;
    var pad = '';
    for (var i = 0, n = Math.ceil(s.length * 0.3); i < n; i++) pad += '~';
    return '⟦' + s + pad + '⟧';
  }

  /** 取文本。叶子是数组时取第一条（要随机用 T.pick） */
  function T(key, ctx) {
    var v = lookup(key);
    if (v === undefined) {
      if (missing.indexOf(key) < 0) missing.push(key);
      return '⟦' + key + '⟧';
    }
    used[key] = true;
    if (Array.isArray(v)) v = v[0];
    if (ctx !== undefined) v = fill(v, ctx, key);
    return decorate(v);
  }

  /** 叶子是数组时随机挑一条；rng 缺省用 Math.random */
  T.pick = function (key, rng, ctx) {
    var v = lookup(key);
    if (v === undefined) return T(key);
    used[key] = true;
    if (!Array.isArray(v)) return T(key, ctx);
    var s = v[Math.floor((rng || Math.random)() * v.length)];
    if (ctx !== undefined) s = fill(s, ctx, key);
    return decorate(s);
  };
  T.has = function (key) { return lookup(key) !== undefined; };

  var api = {
    T: T,
    load: load,
    lang: function (l) { if (l) cur = l; return cur; },
    keys: function (prefix) {
      var out = [];
      var t = tables[cur] || tables[FALLBACK];
      if (t) t.forEach(function (v, k) { if (!prefix || k.indexOf(prefix) === 0) out.push(k); });
      return out;
    },
    /** 从没被取过的键（开发用，tools/test/check-locales.js 靠它找死文本） */
    unused: function () { return api.keys().filter(function (k) { return !used[k]; }); },
    get missing() { return missing; },
    flatten: flatten
  };
  return api;
})();

var T = Text.T;
