#!/usr/bin/env node
/* 把 locales/ 下全部 JSON 整理成规范格式（2 空格缩进，UTF-8，结尾换行）。
   遇到重复键等问题直接报错，不替你悄悄丢一个。 */
'use strict';
const fs = require('fs');
const path = require('path');
const SJ = require('../lib/strict-json');
const DIR = path.join(require('../lib/root').ROOT, 'locales');
function walk(d) {
  const out = [];
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}
let n = 0, bad = 0;
for (const f of walk(DIR)) {
  const raw = fs.readFileSync(f, 'utf8');
  let o;
  try { o = SJ.parse(raw, path.relative(process.cwd(), f)); } catch (e) { console.log(e.message); bad++; continue; }
  const out = SJ.format(o);
  if (out !== raw) { fs.writeFileSync(f, out); n++; }
}
console.log('整理了 ' + n + ' 个文件' + (bad ? '，' + bad + ' 个有错' : ''));
process.exit(bad ? 1 : 0);
