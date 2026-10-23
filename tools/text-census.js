#!/usr/bin/env node
/**
 * 文本普查（docs/POST2-0IMPL.md 1.0 / 1.9.5）
 *
 * 统计 js/ 下（除 locales/ 与生成物）字符串字面量里的 CJK 条数，跳过注释。
 * 迁移期间当"剩余待迁移"进度条用；迁移结束应为 0。
 *
 *   node tools/text-census.js            打印总数与每文件数量
 *   node tools/text-census.js --check    与允许清单（tools/baseline/text-census.json）比较，超出退出码 1
 *   node tools/text-census.js --write    把当前数字写成新的允许清单（只在清单缩小时用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Scripts = require('./lib/scripts');

const OUT = path.join(__dirname, 'baseline', 'text-census.json');
const GENERATED = /\/(changelog|version|locales\.gen)\.js$/;
const CJK = /[㐀-鿿　-〿＀-￯]/;

/* 极简扫描：逐字符区分 注释 / 字符串 / 模板 / 正则以外的代码。
   正则字面量里很少有 CJK，这里按"除号"处理不会误计字符串。 */
function countFile(src) {
  let i = 0, n = 0;
  const L = src.length;
  while (i < L) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < L && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let s = ''; i++;
      while (i < L && src[i] !== q) {
        if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
        if (q !== '`' && src[i] === '\n') break;
        s += src[i++];
      }
      i++;
      if (CJK.test(s)) n++;
      continue;
    }
    i++;
  }
  return n;
}

function census() {
  const per = {};
  let total = 0;
  for (const f of Scripts.loadOrder()) {
    if (GENERATED.test(f) || /^js\/locales\//.test(f)) continue;
    const n = countFile(fs.readFileSync(path.join(Scripts.ROOT, f), 'utf8'));
    if (n) { per[f] = n; total += n; }
  }
  return { total, per };
}

/** 允许清单（tools/baseline/text-census.json）只许缩小：返回超出的文件 */
function overAllowance() {
  let base = { files: {} };
  try { base = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 没有清单：一条都不许有 */ }
  const { per } = census();
  return Object.keys(per).filter(f => per[f] > ((base.files || {})[f] || 0)).map(f => f + '：' + per[f] + ' 条，清单只许 ' + ((base.files || {})[f] || 0));
}

module.exports = { census, overAllowance, countFile };

if (require.main === module) {
  const { total, per } = census();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(OUT, JSON.stringify({ total, files: per }, null, 1) + '\n');
    console.log('已写入允许清单：' + total + ' 条');
  } else if (process.argv.includes('--check')) {
    const bad = overAllowance();
    if (bad.length) { console.log('脚本里出现了清单之外的中文字符串（该走 T() 了）：\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('中文字符串没有超出允许清单（共 ' + total + ' 条）');
  } else {
    for (const f of Object.keys(per).sort((a, b) => per[b] - per[a])) console.log('  ' + String(per[f]).padStart(5) + '  ' + f);
    console.log('合计 ' + total + ' 条（迁移前 2063 条）');
  }
}
