/* ============================================================
   strict-json.js —— 比 JSON.parse 严一点的解析器（docs/POST2-0IMPL.md 1.9.3）

   JSON.parse 遇到同一对象里的重复键会悄悄取最后一个，文本文件里这正是
   最容易发生的事故。这里同样的语法，但：
     · 同一对象里重复键 → 抛错（带行号）
     · 叶子只许字符串或字符串数组（文本文件的约定）
   返回普通对象。
   ============================================================ */
'use strict';

function parse(text, file) {
  let i = 0;
  const lineOf = pos => text.slice(0, pos).split('\n').length;
  const fail = (msg, pos) => { throw new Error((file || 'JSON') + ':' + lineOf(pos === undefined ? i : pos) + ' ' + msg); };
  const ws = () => { while (i < text.length && ' \t\r\n'.indexOf(text[i]) >= 0) i++; };

  function str() {
    const start = i;
    if (text[i] !== '"') fail('这里应该是字符串');
    i++;
    while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; }
    if (i >= text.length) fail('字符串没有结束', start);
    i++;
    return JSON.parse(text.slice(start, i));
  }
  function value(depth) {
    ws();
    const c = text[i];
    if (c === '"') return str();
    if (c === '[') {
      i++; const arr = []; ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        const at = i;
        const v = value(depth + 1);
        if (typeof v !== 'string') fail('文本数组里只能放字符串', at);
        arr.push(v); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return arr; }
        fail('数组里应该是 , 或 ]');
      }
    }
    if (c === '{') {
      i++; const obj = {}; ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        const at = i;
        const k = str();
        if (Object.prototype.hasOwnProperty.call(obj, k)) fail('重复的键 "' + k + '"', at);
        ws();
        if (text[i] !== ':') fail('键后面应该是 :');
        i++;
        obj[k] = value(depth + 1); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail('对象里应该是 , 或 }');
      }
    }
    fail('文本文件里只许字符串、字符串数组和对象');
  }
  const v = value(0);
  ws();
  if (i < text.length) fail('JSON 后面还有多余内容');
  if (typeof v !== 'object' || Array.isArray(v)) fail('顶层必须是对象', 0);
  return v;
}

/** 规范格式：2 空格缩进，UTF-8，结尾换行 */
function format(obj) { return JSON.stringify(obj, null, 2) + '\n'; }

module.exports = { parse, format };
